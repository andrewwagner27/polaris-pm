// tests/invite-onboarding.test.mjs
// Tenant invitation and onboarding:
//   - supabase/functions/invite-tenant/index.ts driven in Node (Deno imports stubbed, as in send-email-edge.test.mjs):
//     landlord-only, already-registered tenants get 409, a never-completed invitation is re-sent as a sign-in link,
//     the email goes from the verified domain with escaped content.
//   - src/lib/onboardingLink.js: expired / invalid / missing invitation links are recognised.
//   - src/lib/functionError.js: the function's own error message is shown to the landlord.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { inviteLinkState, LINK_MESSAGES } = await import("../src/lib/onboardingLink.js");
const { functionErrorMessage } = await import("../src/lib/functionError.js");

const file = new URL("../supabase/functions/invite-tenant/index.ts", import.meta.url);
let src = readFileSync(file, "utf8");
const IMPORT_SERVE = 'import { serve } from "https://deno.land/std@0.168.0/http/server.ts";';
const IMPORT_SHARED = 'import { adminClient, corsHeaders as buildCors, getCaller, isLandlord } from "../_shared/security.ts";';
assert.ok(src.includes(IMPORT_SERVE) && src.includes(IMPORT_SHARED), "invite-tenant imports only serve and _shared/security.ts");
src = src.replace(IMPORT_SERVE, "const serve = (h) => { globalThis.__inviteHandler = h; };")
  .replace(IMPORT_SHARED, "const { adminClient, corsHeaders: buildCors, getCaller, isLandlord } = globalThis.__inviteStub;")
  .replace(/\(v: unknown/g, "(v").replace(/ as string\)/g, ")");

const TENANT = "6a12a0b4-f12d-42a6-bf04-08f0379f2b71";
let caller, tenantRow, existingAuthUser, links, sent, updates;
globalThis.Deno = { env: { get: (k) => ({ RESEND_API_KEY: "re_test" })[k] } };
globalThis.__inviteStub = {
  corsHeaders: () => ({}),
  getCaller: async () => caller,
  isLandlord: (c) => !!c && (c.serviceRole || c.role === "landlord"),
  adminClient: () => ({
    from: () => {
      const q = {
        select: () => q, eq: () => q,
        maybeSingle: async () => ({ data: tenantRow, error: null }),
        update: (v) => { updates.push(v); return { eq: async () => ({ error: null }) }; },
      };
      return q;
    },
    auth: { admin: { generateLink: async (args) => {
      links.push(args);
      if (args.type === "invite" && existingAuthUser) return { data: null, error: { message: "A user with this email address has already been registered" } };
      return { data: { properties: { action_link: `https://ynbx.supabase.co/auth/v1/verify?token=t&type=${args.type}&redirect_to=${encodeURIComponent(args.options.redirectTo)}` } }, error: null };
    } } },
  }),
};
globalThis.fetch = async (url, init) => {
  if (!String(url).includes("api.resend.com")) throw new Error("unexpected fetch " + url);
  sent.push(JSON.parse(init.body));
  return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
};
await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const handler = globalThis.__inviteHandler;
const post = (body) => handler(new Request("https://x.supabase.co/functions/v1/invite-tenant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const BODY = { tenant_id: TENANT, tenant_name: "New <b>Tenant</b>", tenant_email: "new.tenant@example.com", unit_number: "2", property_name: "Clifton Manor", landlord_name: "Modus Property Management" };

beforeEach(() => { caller = { role: "landlord", user: { id: "L" } }; tenantRow = { id: TENANT, user_id: null }; existingAuthUser = false; links = []; sent = []; updates = []; });

describe("invite-tenant Edge Function", () => {
  test("anonymous → 401, tenant → 403; nothing generated or sent", async () => {
    caller = null;
    assert.equal((await post(BODY)).status, 401);
    caller = { role: "tenant", user: { id: "u" } };
    assert.equal((await post(BODY)).status, 403);
    assert.equal(links.length + sent.length, 0);
  });
  test("first invitation: one invite link to the onboarding page, one email from the verified domain, escaped", async () => {
    const r = await post(BODY);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { success: true, resent: false });
    assert.equal(links.length, 1);
    assert.equal(links[0].type, "invite");
    assert.equal(links[0].options.redirectTo, `https://www.getmodusam.com/onboarding?tenant_id=${TENANT}`);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].from, "Modus Property Management <notifications@getmodusam.com>");
    assert.equal(sent[0].to, "new.tenant@example.com");
    assert.match(sent[0].html, /Welcome, New &lt;b&gt;Tenant&lt;\/b&gt;/);
    assert.doesNotMatch(sent[0].html, /expires in 24 hours/, "no expiry promise the auth settings may not keep");
    assert.deepEqual(updates.at(-1).invite_email, "new.tenant@example.com");
  });
  test("re-sending to a tenant who never finished: a sign-in link to the same onboarding page (no 'already registered' failure)", async () => {
    existingAuthUser = true;
    const r = await post(BODY);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { success: true, resent: true });
    assert.deepEqual(links.map((l) => l.type), ["invite", "magiclink"]);
    assert.equal(links[1].email, "new.tenant@example.com");
    assert.equal(links[1].options.redirectTo, `https://www.getmodusam.com/onboarding?tenant_id=${TENANT}`);
    assert.equal(sent.length, 1);
  });
  test("a tenant already linked to a portal account gets 409 with guidance; nothing is generated or sent", async () => {
    tenantRow = { id: TENANT, user_id: "existing-user" };
    const r = await post(BODY);
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.code, "ALREADY_REGISTERED");
    assert.match(body.error, /already has a portal account/);
    assert.equal(links.length + sent.length, 0);
  });
  test("unknown tenant or invalid address → 400, nothing sent", async () => {
    tenantRow = null;
    assert.equal((await post(BODY)).status, 400);
    tenantRow = { id: TENANT, user_id: null };
    assert.equal((await post({ ...BODY, tenant_email: "Eve <e@x.com>" })).status, 400);
    assert.equal(sent.length, 0);
  });
});

describe("onboarding link states", () => {
  test("a valid link (session) continues", () => {
    assert.deepEqual(inviteLinkState({ hash: "", hasSession: true }), { state: "ready" });
  });
  test("expired or used links are recognised from Supabase's redirect", () => {
    assert.equal(inviteLinkState({ hash: "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired" }).state, "expired");
    assert.equal(inviteLinkState({ search: "?tenant_id=x&error=access_denied&error_description=Link+expired" }).state, "expired");
  });
  test("other errors are invalid, even if an old session exists; no link and no session → sign in", () => {
    assert.deepEqual(inviteLinkState({ hash: "#error=server_error&error_code=unexpected_failure", hasSession: true }), { state: "invalid", code: "unexpected_failure" });
    assert.equal(inviteLinkState({ hash: "", hasSession: false }).state, "signin");
    for (const k of ["expired", "invalid", "signin"]) assert.ok(LINK_MESSAGES[k].title && LINK_MESSAGES[k].body);
  });
  test("the onboarding page shows the link state before any form, and checks the claim actually linked", () => {
    const page = readFileSync(new URL("../src/TenantOnboarding.jsx", import.meta.url), "utf8");
    assert.match(page, /if \(linkState\.state !== "ready"\)/);
    // The claim itself (read-back, unclaimed rows only) lives in src/lib/tenantClaim.js; see tests/tenant-claim.test.mjs.
    assert.match(page, /claimTenantRecord\(supabase, invitedTenantId\)/);
    const claim = readFileSync(new URL("../src/lib/tenantClaim.js", import.meta.url), "utf8");
    assert.match(claim, /\.is\("user_id", null\)\s*\.select\("id"\)/);
    assert.match(claim, /doesn't match the email you signed in with/);
  });
});

describe("function error messages reach the landlord", () => {
  test("the body's error is used; otherwise the SDK message", async () => {
    const ctx = new Response(JSON.stringify({ error: "This tenant already has a portal account." }), { status: 409 });
    assert.equal(await functionErrorMessage({ message: "Edge Function returned a non-2xx status code", context: ctx }), "This tenant already has a portal account.");
    assert.equal(await functionErrorMessage({ message: "Network down" }), "Network down");
    assert.equal(await functionErrorMessage({ message: "x", context: new Response("not json") }), "x");
    assert.equal(await functionErrorMessage(null), "");
  });
});

// Found in production on 2026-11-13: opening /onboarding?tenant_id=… while signed in as the landlord linked the
// landlord's login to that tenant (landlords may update any tenant row, so the email-match claim did not apply).
test("a management session never runs tenant onboarding", async () => {
  const { inviteLinkState, LINK_MESSAGES } = await import("../src/lib/onboardingLink.js");
  assert.equal(inviteLinkState({ hasSession: true, isManagement: true }).state, "management");
  assert.equal(inviteLinkState({ hash: "#error_code=otp_expired", hasSession: true, isManagement: true }).state, "management");
  assert.equal(inviteLinkState({ hasSession: true, isManagement: false }).state, "ready");
  assert.match(LINK_MESSAGES.management.title, /management/i);
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/TenantOnboarding.jsx", import.meta.url), "utf8");
  assert.match(src, /profile\?\.role === "landlord"/, "role is checked before onboarding runs");
  assert.match(src, /linkState\.state!=="ready"\) return;/, "the tenant claim waits for a confirmed tenant session");
  assert.match(src, /\[invitedTenantId, linkState\.state\]/);
});
