// tests/preview-isolation.test.mjs
// Vercel Preview shares Production's secrets today. These guards keep a Preview deployment from touching production
// data, live payments, real inboxes or SMS (api/_lib/deployEnv.js; plan in docs/launch/preview-isolation.md).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const G = await import("../api/_lib/deployEnv.js");
const { emergencySmsConfig } = await import("../api/_lib/emergencySms.js");
const PROD_URL = "https://ynbxdbwxdydbpkzaffte.supabase.co";
const STAGING_URL = "https://abcdefghijklmnopqrst.supabase.co";

describe("deployment detection", () => {
  test("only an explicit preview/development VERCEL_ENV turns the guards on; missing or production never does", () => {
    assert.equal(G.deploymentEnv({ VERCEL_ENV: "production" }), "production");
    assert.equal(G.deploymentEnv({ VERCEL_ENV: "Preview" }), "preview");
    assert.equal(G.deploymentEnv({}), "unknown");
    for (const env of [{}, { VERCEL_ENV: "production", SUPABASE_URL: PROD_URL, STRIPE_SECRET_KEY: "sk_live_x" }, { VERCEL_ENV: "weird", SUPABASE_URL: PROD_URL }]) {
      assert.deepEqual(G.previewGuard(env), { blocked: false, reasons: [] }, JSON.stringify(env.VERCEL_ENV));
    }
  });
  test("project ref parsing", () => {
    assert.equal(G.supabaseProjectRef(PROD_URL), "ynbxdbwxdydbpkzaffte");
    assert.equal(G.supabaseProjectRef(`${PROD_URL}/rest/v1`), "ynbxdbwxdydbpkzaffte");
    assert.equal(G.supabaseProjectRef("https://ynbxdbwxdydbpkzaffte.supabase.co.evil.example"), null);
    assert.equal(G.supabaseProjectRef(""), null);
  });
});

describe("previewGuard", () => {
  test("Preview pointed at the production database is blocked unless explicitly allowed", () => {
    assert.deepEqual(G.previewGuard({ VERCEL_ENV: "preview", SUPABASE_URL: PROD_URL }).reasons, ["production_database"]);
    assert.deepEqual(G.previewGuard({ VERCEL_ENV: "preview", VITE_SUPABASE_URL: PROD_URL }).reasons, ["production_database"]);
    assert.equal(G.previewGuard({ VERCEL_ENV: "preview", SUPABASE_URL: PROD_URL, PREVIEW_ALLOW_PRODUCTION_DB: "true" }).blocked, false);
    assert.equal(G.previewGuard({ VERCEL_ENV: "preview", SUPABASE_URL: STAGING_URL }).blocked, false);
  });
  test("a live Stripe key is refused outside Production with no override; test keys are fine", () => {
    for (const k of ["sk_live_abc", "rk_live_abc"]) {
      assert.deepEqual(G.previewGuard({ VERCEL_ENV: "development", SUPABASE_URL: STAGING_URL, PREVIEW_ALLOW_PRODUCTION_DB: "true", STRIPE_SECRET_KEY: k }).reasons, ["live_stripe_key"]);
    }
    assert.equal(G.previewGuard({ VERCEL_ENV: "preview", SUPABASE_URL: STAGING_URL, STRIPE_SECRET_KEY: "sk_test_abc" }).blocked, false);
  });
  test("rejectIfIsolated answers 503 with reasons only (no secret values)", () => {
    let code = null, body = null;
    const res = { status(c) { code = c; return this; }, json(b) { body = b; return this; } };
    const env = { VERCEL_ENV: "preview", SUPABASE_URL: PROD_URL, STRIPE_SECRET_KEY: "sk_live_SECRETVALUE" };
    const orig = console.error; let logged = ""; console.error = (...a) => { logged += a.join(" "); };
    try { assert.equal(G.rejectIfIsolated(res, env), true); } finally { console.error = orig; }
    assert.equal(code, 503);
    assert.deepEqual(body.reasons, ["production_database", "live_stripe_key"]);
    assert.ok(!JSON.stringify(body).includes("SECRETVALUE") && !logged.includes("SECRETVALUE"));
    assert.equal(G.rejectIfIsolated(res, { VERCEL_ENV: "production", SUPABASE_URL: PROD_URL }), false);
  });
});

describe("email and SMS outside Production", () => {
  test("email only to allow-listed addresses in Preview; unrestricted in Production", () => {
    const env = { VERCEL_ENV: "preview", PREVIEW_EMAIL_ALLOWLIST: "moduspropmgmt+onboarding-test@gmail.com, qa@test.invalid" };
    assert.equal(G.previewEmailCheck(["QA@test.invalid"], env).ok, true);
    assert.equal(G.previewEmailCheck(["qa@test.invalid", "tenant@real.example"], env).ok, false);
    assert.equal(G.previewEmailCheck(["tenant@real.example"], { VERCEL_ENV: "preview" }).ok, false, "empty allowlist → nothing");
    assert.equal(G.previewEmailCheck(["tenant@real.example"], { VERCEL_ENV: "production" }).ok, true);
  });
  test("emergency SMS is disabled in Preview even when enabled and fully configured", () => {
    const cfg = { EMERGENCY_SMS_ENABLED: "true", TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "x", TWILIO_FROM: "+15550000000", LANDLORD_PHONE: "+15551111111" };
    assert.equal(emergencySmsConfig({ ...cfg, VERCEL_ENV: "preview" }).enabled, false);
    assert.equal(emergencySmsConfig({ ...cfg, VERCEL_ENV: "production" }).enabled, true);
  });
  test("sendEmail refuses a non-allow-listed recipient in Preview without calling Resend", async () => {
    const saved = { ...process.env }; const origFetch = globalThis.fetch; let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response("{}", { status: 200 }); };
    Object.assign(process.env, { VERCEL_ENV: "preview", RESEND_API_KEY: "re_test", PREVIEW_EMAIL_ALLOWLIST: "qa@test.invalid" });
    try {
      const { sendEmail } = await import("../api/_lib/email.js");
      const r = await sendEmail({ to: "tenant@real.example", subject: "s", html: "<p>h</p>" });
      assert.equal(r.ok, false); assert.match(r.error, /PREVIEW_EMAIL_ALLOWLIST/); assert.equal(calls, 0);
    } finally { globalThis.fetch = origFetch; for (const k of ["VERCEL_ENV", "PREVIEW_EMAIL_ALLOWLIST"]) delete process.env[k]; Object.assign(process.env, saved); }
  });
});

test("every API route checks isolation before doing anything", () => {
  for (const f of ["classify-and-route", "daily-recap", "dispatch-vendor", "notify", "send-email", "sms-escalate", "stripe-webhook", "vendor-ticket", "vendor-verify-pin"]) {
    const src = readFileSync(new URL(`../api/${f}.js`, import.meta.url), "utf8");
    assert.match(src, /export default async function handler\(req, res\) \{\r?\n  if \(rejectIfIsolated\(res\)\) return;/, f);
  }
});
