// tests/send-email-edge.test.mjs
// Run: npm test   (node --test tests/)   — or against another copy: SEND_EMAIL_TS=<path> node --test this file
// Behaviour of supabase/functions/send-email/index.ts (the Edge Function security fix). Node can't load
// its Deno URL imports, so the two import lines are replaced with stubs that mirror _shared/security.ts:
// getCaller → null (no/invalid JWT) | { role } (signed-in user) | service role. Resend is faked.
// What it proves: tenants, vendor-link holders and anonymous callers can't send; landlords and the
// service role can; recipients are validated; no allow-list or hard-coded address exists.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const file = process.env.SEND_EMAIL_TS || new URL("../supabase/functions/send-email/index.ts", import.meta.url);
let src = readFileSync(file, "utf8");
const IMPORT_SERVE = 'import { serve } from "https://deno.land/std@0.168.0/http/server.ts";';
const IMPORT_SHARED = 'import { adminClient, corsHeaders, getCaller, isLandlord, json } from "../_shared/security.ts";';
assert.ok(src.includes(IMPORT_SERVE) && src.includes(IMPORT_SHARED), "the function imports only serve and _shared/security.ts");
src = src.replace(IMPORT_SERVE, "const serve = (h) => { globalThis.__sendEmailHandler = h; };")
  .replace(IMPORT_SHARED, "const { adminClient, corsHeaders, getCaller, isLandlord, json } = globalThis.__sharedStub;");

let caller = null, sent = [];
globalThis.Deno = { env: { get: (k) => ({ RESEND_API_KEY: "re_test" })[k] } };
globalThis.__sharedStub = {
  adminClient: () => ({}),
  corsHeaders: () => ({}),
  json: (_req, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  getCaller: async () => caller,
  // Same rule as _shared/security.ts at e47147e: service role or profiles.role = 'landlord'.
  isLandlord: (c) => !!c && (c.serviceRole || c.role === "landlord"),
};
globalThis.fetch = async (url, init) => {
  if (!String(url).includes("api.resend.com")) throw new Error("unexpected fetch " + url);
  sent.push(JSON.parse(init.body));
  return new Response(JSON.stringify({ id: `re_${sent.length}` }), { status: 200 });
};
// Node strips the TypeScript annotations (type-only syntax) when importing a .ts data URL module.
const mod = "data:text/javascript;base64," + Buffer.from(src.replace(/\(err as Error\)/g, "err").replace(/: Request/g, "").replace(/\): string\[\]/g, ")")).toString("base64");
await import(mod);
const handler = globalThis.__sendEmailHandler;
const post = (body) => handler(new Request("https://x.supabase.co/functions/v1/send-email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const PHISH = { to: "moduspropmgmt@gmail.com", subject: "Rent", html: "<a href='https://evil.example'>pay here</a>" };

beforeEach(() => { caller = null; sent = []; });

describe("send-email Edge Function (security release)", () => {
  test("anonymous caller, including one presenting only a vendor link token → 401, nothing sent", async () => {
    for (const body of [PHISH, { ...PHISH, vendor_token: "tok-live-vendor-link" }]) {
      const r = await post(body);
      assert.equal(r.status, 401);
    }
    assert.equal(sent.length, 0);
  });
  test("signed-in tenant → 403, even to the management inbox, nothing sent", async () => {
    caller = { role: "tenant", user: { id: "u1" } };
    assert.equal((await post(PHISH)).status, 403);
    assert.equal((await post({ ...PHISH, to: "capitalpathwaysapw@gmail.com" })).status, 403);
    assert.equal(sent.length, 0);
  });
  test("landlord → sends once, from notifications@getmodusam.com, subject without line breaks", async () => {
    caller = { role: "landlord", user: { id: "L" } };
    const r = await post({ to: "tenant@example.com", subject: "Update\r\nBcc: x@y.com", html: "<p>ok</p>" });
    assert.equal(r.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].from, "Modus Property Management <notifications@getmodusam.com>");
    assert.doesNotMatch(sent[0].subject, /[\r\n]/);
  });
  test("service role (server-to-server) → allowed", async () => {
    caller = { serviceRole: true, user: null, role: "service_role" };
    assert.equal((await post({ to: "tenant@example.com", subject: "s", html: "<p>h</p>" })).status, 200);
  });
  test("landlord with invalid or too many recipients, or missing fields → 400, nothing sent", async () => {
    caller = { role: "landlord", user: { id: "L" } };
    for (const body of [{ to: "Eve <e@x.com>", subject: "s", html: "h" }, { to: Array.from({ length: 11 }, (_, i) => `a${i}@x.com`), subject: "s", html: "h" },
      { to: "a@x.com", subject: "", html: "h" }, { to: "a@x.com", subject: "s" }]) {
      assert.equal((await post(body)).status, 400, JSON.stringify(body).slice(0, 60));
    }
    assert.equal(sent.length, 0);
  });
  test("no tenant/vendor path, allow-list or hard-coded address remains in the code", () => {
    const code = readFileSync(file, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.doesNotMatch(code, /vendor_token|LANDLORD_NOTIFY_EMAILS|@gmail\.com|restrictedSender|allowed\.includes/);
  });
});
