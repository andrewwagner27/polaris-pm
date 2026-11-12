// tests/comms-remediation.test.mjs
// Run: npm test   (node --test tests/)
// Communications remediation: email escaping and content integrity, recipient routing for every
// workflow, tenant/vendor sending restrictions, emergency guidance and SMS gating, escalation failure
// paths and the daily recap. In-memory fakes only: no network, no database, no email or SMS.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
process.env.OPENAI_API_KEY = "sk-test";
process.env.RESEND_API_KEY = "re_test";
process.env.LANDLORD_EMAIL = "manager@test.invalid";
delete process.env.ESCALATION_NOTIFY_EMAILS;
delete process.env.EMERGENCY_SMS_ENABLED;

// ── network fake: Resend (realistic idempotency, tests/helpers/fakeResend.mjs) + Twilio (recorded, never sent) ──
// resend = every HTTP request made to Resend; fake.sent = what was actually delivered.
const { FakeResend } = await import("./helpers/fakeResend.mjs");
let fake = new FakeResend(), resend = fake.calls, twilio = [], resendMode = "ok";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes("api.resend.com")) {
    if (resendMode === "500") fake.plan("500");
    if (resendMode === "422") fake.plan("422");
    return fake.handle(u, init);
  }
  if (u.includes("api.twilio.com")) { twilio.push({ url: u, body: String(init.body) }); return json({ sid: "SM1", status: "queued" }, 201); }
  throw new Error(`unexpected fetch ${u}`);
};

const S = await import("../src/lib/emailSafety.js");
const R = await import("../api/_lib/recipients.js");
const E = await import("../api/_lib/email.js");
const T = await import("../api/_lib/notificationTemplates.js");
const M = await import("../api/_lib/maintenanceNotify.js");
const SMS = await import("../api/_lib/emergencySms.js");
const AI = await import("../api/_lib/aiSafety.js");
const P = await import("../api/_lib/aiPrompt.js");
const N = await import("../api/_lib/escalationNotify.js");
const D = await import("../api/_lib/dailyRecap.js");
const { supabaseAdmin } = await import("../api/_lib/auth.js");
const sendEmailRoute = (await import("../api/send-email.js")).default;
const smsRoute = (await import("../api/sms-escalate.js")).default;
const notifyRoute = (await import("../api/notify.js")).default;
const { failSafeEscalation } = await import("../api/classify-and-route.js");

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ATTACKS = [
  `<script>alert(1)</script>`,
  `"><img src=x onerror=alert(1)>`,
  `' onmouseover='alert(1)`,
  "`backtick` =equals",
  `<a href="javascript:alert(1)">click</a>`,
  `</td></tr></table><h1>Pay here</h1><a href="https://evil.example">`,
];
// No executable markup, no injected attributes, no foreign link survives into the HTML. (Escaped text such
// as "&lt;a href&#61;&quot;javascript:" is inert: it renders as text.)
function assertInert(html) {
  assert.doesNotMatch(html, /<script|<img|<h1|<a href="javascript|\son(error|mouseover)=/i);
  assert.doesNotMatch(html, /href="(javascript|data|vbscript):/i);
  assert.doesNotMatch(html, /href="(?!https:\/\/(www\.)?getmodusam\.com(\/|"))/, "only portal links");
}

// ── in-memory database ──
const TENANT_UID = "u-tenant", OTHER_UID = "u-other", LANDLORD_UID = "u-landlord";
// Real ids are UUIDs; /api/notify rejects anything else with 400.
const TK = "7c0e1f6a-0000-4000-8000-0000000000a1", IN1 = "7c0e1f6a-0000-4000-8000-0000000000b1";
const C_TENANT = "7c0e1f6a-0000-4000-8000-0000000000c1", C_PM = "7c0e1f6a-0000-4000-8000-0000000000c2";
const C_INTERNAL = "7c0e1f6a-0000-4000-8000-0000000000c3", C_REWORK = "7c0e1f6a-0000-4000-8000-0000000000c4";
let db, seq;
function seed() {
  seq = 0; fake = new FakeResend(); resend = fake.calls; twilio = []; resendMode = "ok";
  db = {
    profiles: [{ id: TENANT_UID, role: "tenant" }, { id: OTHER_UID, role: "tenant" }, { id: LANDLORD_UID, role: "landlord" }],
    maintenance_requests: [{
      id: TK, tenant_id: "t1", unit_id: "un1", title: `Sink leak ${ATTACKS[0]}`, description: `Drips\n${ATTACKS[1]}`, category: "plumbing", priority: "normal",
      status: "open", vendor_name: `Acme ${ATTACKS[2]}`, vendor_email: "vendor@acme.test", vendor_token: "tok-1", quote_amount: 350, quote_notes: ATTACKS[5],
      quote_submitted_at: "2026-11-12T10:00:00Z", quote_approved_at: "2026-11-12T11:00:00Z", invoice_url: `${TK}/invoice-1-a.pdf`, invoice_notes: ATTACKS[4],
      updated_at: "2026-11-12T12:00:00Z", created_at: new Date().toISOString(),
      tenants: { id: "t1", name: `Test ${ATTACKS[3]}`, email: "tenant@test.invalid", user_id: TENANT_UID },
      units: { unit_number: "2", properties: { name: "Clifton Manor" } },
    }],
    maintenance_comments: [
      { id: C_TENANT, request_id: TK, author_id: TENANT_UID, author_type: null, body: `Still leaking ${ATTACKS[0]}`, visible_to_tenant: true },
      { id: C_PM, request_id: TK, author_id: LANDLORD_UID, author_type: null, body: `We'll fix it ${ATTACKS[1]}`, visible_to_tenant: true },
      { id: C_INTERNAL, request_id: TK, author_id: LANDLORD_UID, author_type: null, body: "internal note", visible_to_tenant: false },
      { id: C_REWORK, request_id: TK, author_id: LANDLORD_UID, author_type: "pm_to_vendor", body: `PM requested more work: reseal ${ATTACKS[0]}`, visible_to_tenant: false },
    ],
    inspections: [{ id: IN1, status: "tenant_complete", tenant_signature: ATTACKS[1], tenant_signed_at: "2026-11-12T12:00:00Z", tenant_photos: ["a", "b"],
      tenants: { id: "t1", name: "Test User", user_id: TENANT_UID, units: { unit_number: "2", properties: { name: "Clifton Manor" } } } }],
    vendors: [{ name: "Heat Co", email: "heat@vendor.test" }],
  };
}
function from(table) {
  const rows = (db[table] ||= []); const filters = []; let op = null, payload = null;
  // PostgREST column paths ("a->b->c") walk JSON; a missing key is SQL NULL.
  const at = (r, path) => path.split(/->>?/).reduce((o, k) => (o == null ? undefined : o[k]), r);
  const match = () => rows.filter((r) => filters.every(([k, v, how]) => (how === "is" ? (v === null ? at(r, k) == null : at(r, k) === v) : r[k] === v)));
  const run = (single) => {
    if (op === "insert") { const row = { id: `${table}-${++seq}`, created_at: new Date().toISOString(), ...payload }; rows.push(row); return { data: row, error: null }; }
    if (op === "update") { const m = match(); m.forEach((r) => Object.assign(r, structuredClone(payload))); return { data: m.map((r) => structuredClone(r)), error: null }; }
    const m = match(); return { data: single ? (m[0] ? structuredClone(m[0]) : null) : m.map((r) => structuredClone(r)), error: null };
  };
  const b = {
    select: () => b, order: () => b, limit: () => b,
    eq: (k, v) => { filters.push([k, v]); return b; },
    is: (k, v) => { filters.push([k, v, "is"]); return b; },
    insert: (row) => { op = "insert"; payload = row; return b; },
    update: (f) => { op = "update"; payload = f; return b; },
    maybeSingle: async () => run(true), single: async () => run(true),
    then: (res, rej) => Promise.resolve(run(false)).then(res, rej),
  };
  return b;
}
const fakeDb = { from };
const callers = { tenant: { user: { id: TENANT_UID }, role: "tenant" }, other: { user: { id: OTHER_UID }, role: "tenant" }, landlord: { user: { id: LANDLORD_UID }, role: "landlord" } };
const ENV = { LANDLORD_EMAIL: "manager@test.invalid" };
const ev = (fn, caller, body, env = ENV) => fn({ db: fakeDb, send: E.sendEmail, env, caller, body, retryDelayMs: 0 });
const notes = () => db.maintenance_comments.filter((c) => c.author_name === M.NOTE_AUTHOR && c.author_type === "system");
beforeEach(seed);

// ─────────────────────────────────────────────────────────────────────────────
describe("escaping utility", () => {
  test("HTML injection, script tags, attribute injection and special characters are neutralised", () => {
    for (const a of ATTACKS) assertInert(`<p title="${S.escapeHtml(a)}">${S.escapeHtml(a)}</p>`);
    assert.equal(S.escapeHtml(`<>&"'\`=`), "&lt;&gt;&amp;&quot;&#39;&#96;&#61;");
    assert.equal(S.escapeHtml(null), ""); assert.equal(S.escapeHtml(undefined), ""); assert.equal(S.escapeHtml(0), "0");
    assert.equal(S.escapeHtml("Café — 50% off & “quotes” 🚿"), "Café — 50% off &amp; “quotes” 🚿");
  });
  test("textToHtml keeps line breaks and escapes everything else", () => {
    assert.equal(S.textToHtml("a<b>\r\nc"), "a&lt;b&gt;<br>c");
  });
  test("malicious links are refused: only https on our own hosts", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "http://www.getmodusam.com/x", "//evil.example/x", "https://evil.example/landlord",
      "https://www.getmodusam.com.evil.example/", "https://user:pw@www.getmodusam.com/", "vbscript:x", "", null]) {
      assert.equal(S.safeUrl(bad), "https://www.getmodusam.com", String(bad));
    }
    assert.equal(S.safeUrl(`https://www.getmodusam.com/vendor/a"onclick="x`), "https://www.getmodusam.com/vendor/a%22onclick&#61;%22x");
    assert.equal(S.appLink("//evil.example"), "https://www.getmodusam.com");
  });
  test("subjects cannot inject headers or span lines", () => {
    assert.equal(S.cleanSubject("Leak\r\nBcc: victim@x.com more"), "Leak Bcc: victim@x.com more");
    assert.equal(S.cleanSubject("x".repeat(300), 50).length, 50);
  });
  test("recipient parsing accepts plain addresses only", () => {
    assert.deepEqual(S.parseEmailList(" A@x.com, a@x.com ,b@y.org"), { valid: ["a@x.com", "b@y.org"], invalid: [] });
    for (const bad of ["Eve <eve@x.com>", "a@x.com\r\nBcc: b@y.com", "a@x", "@x.com", "a b@x.com", "a@x.com,"]) {
      assert.equal(S.isValidEmail(bad), false, bad);
    }
  });
  test("sendEmail refuses invalid recipients and a missing key, and strips CR/LF from subjects", async () => {
    assert.equal((await E.sendEmail({ to: "Eve <e@x.com>", subject: "s", html: "h" })).ok, false);
    assert.equal(resend.length, 0);
    const key = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
    assert.match((await E.sendEmail({ to: "a@x.com", subject: "s", html: "h" })).error, /not configured/);
    process.env.RESEND_API_KEY = key;
    await E.sendEmail({ to: "a@x.com", subject: "Hi\r\nBcc: z@z.com", html: "h" });
    assert.equal(resend[0].body.subject, "Hi Bcc: z@z.com");
    assert.equal(resend[0].body.from, "Modus Property Management <noreply@getmodusam.com>");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Resend outcomes against the realistic fake (documented 409 semantics). "sent" requires an email id.
describe("email retries and idempotency (B1)", () => {
  const MSG = { to: "a@x.com", subject: "s", html: "<p>h</p>" };
  const go = (extra = {}, opts = {}) => E.sendEmailReliably({ ...MSG, idempotencyKey: "k1", ...extra }, { retryDelayMs: 0, ...opts });

  test("provider error then success: retried with the same key AND identical payload; delivered once", async () => {
    fake.plan("500", "ok");
    const r = await go();
    assert.equal(r.result, "sent"); assert.equal(r.attempts, 2);
    assert.deepEqual(resend.map((c) => c.headers["Idempotency-Key"]), ["k1", "k1"]);
    assert.equal(new Set(resend.map((c) => JSON.stringify(c.body))).size, 1);
    assert.equal(fake.sent.length, 1);
  });
  test("persistent provider errors: failed after 3 attempts, nothing sent", async () => {
    fake.plan("500", "429", "500");
    const r = await go();
    assert.equal(r.result, "failed"); assert.equal(r.attempts, 3); assert.equal(fake.sent.length, 0);
  });
  test("validation error (422): failed immediately, not retried", async () => {
    fake.plan("422");
    const r = await go();
    assert.equal(r.result, "failed"); assert.equal(r.attempts, 1);
  });
  test("response lost after acceptance: the retry returns the ORIGINAL response — sent, exactly one email", async () => {
    fake.plan("timeout-after");
    const r = await go();
    assert.equal(r.result, "sent"); assert.equal(r.attempts, 2); assert.equal(r.data.id, fake.sent[0].id);
    assert.equal(fake.sent.length, 1);
  });
  test("never reached Resend, then success: sent once", async () => {
    fake.plan("net-before", "ok");
    assert.equal((await go()).result, "sent"); assert.equal(fake.sent.length, 1);
  });
  test("ambiguous on every attempt: UNCONFIRMED — never reported as sent", async () => {
    fake.plan("timeout-after", "net-before", "net-before");
    const r = await go();
    assert.equal(r.result, "unconfirmed"); assert.equal(r.ok, false);
    assert.equal(fake.sent.length, 1, "it may in fact have gone out — which is exactly why it isn't called failed");
  });
  test("ambiguous first, then a definite provider error: still unconfirmed (the first may have been accepted)", async () => {
    fake.plan("net-before", "500", "500");
    assert.equal((await go()).result, "unconfirmed");
  });
  test("delayed (in progress): 409 concurrent_idempotent_requests is retried later and resolves to the original response", async () => {
    fake.plan({ slowMs: 30 });
    const [a, b] = await Promise.all([go({}, { retryDelayMs: 25 }), go({}, { retryDelayMs: 25 })]);
    assert.equal(a.result, "sent"); assert.equal(b.result, "sent");
    assert.equal(a.data.id, b.data.id, "both report the same single email");
    assert.equal(fake.sent.length, 1);
    assert.ok(resend.some((c) => c.key === "k1") && resend.length >= 3, "the second caller saw 409 in-progress and retried");
  });
  test("still in progress after every retry: unconfirmed", async () => {
    fake.plan({ slowMs: 200 });
    const slow = go({}, { retryDelayMs: 0 });
    await new Promise((r) => setTimeout(r, 5));
    const r = await go({}, { retryDelayMs: 1 });
    assert.equal(r.result, "unconfirmed");
    await slow;
  });
  test("same key, different payload: 409 invalid_idempotent_request → duplicate (another request owns the key), nothing new sent", async () => {
    await go();
    const r = await go({ html: "<p>different</p>" });
    assert.equal(r.result, "duplicate"); assert.equal(r.ok, false); assert.equal(fake.sent.length, 1);
  });
  test("payloadKey: identical payloads share a key; any change in content yields a different key", () => {
    const k1 = E.payloadKey("base", MSG), k2 = E.payloadKey("base", { ...MSG }), k3 = E.payloadKey("base", { ...MSG, html: "<p>x</p>" });
    assert.equal(k1, k2); assert.notEqual(k1, k3); assert.match(k1, /^base:[0-9a-f]{16}$/);
  });
  test("without an idempotency key nothing is retried (a retry could duplicate)", async () => {
    fake.plan("500");
    const r = await E.sendEmailReliably(MSG, { retryDelayMs: 0 });
    assert.equal(r.attempts, 1); assert.equal(r.result, "failed");
    fake.plan("net-before");
    assert.equal((await E.sendEmailReliably(MSG, { retryDelayMs: 0 })).result, "unconfirmed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("server templates", () => {
  const ticket = { title: ATTACKS[0], description: ATTACKS.join("\n"), category: ATTACKS[2], priority: `urgent"><script>`, tenantName: ATTACKS[1], propertyName: ATTACKS[3], unitNumber: ATTACKS[5] };
  const all = [
    T.maintenanceCreatedEmail({ ticket }), T.maintenanceCreatedEmail({ ticket, emergency: { kind: "gas", lifeSafety: true } }),
    T.tenantReplyEmail({ ticket, tenantName: ATTACKS[1], commentBody: ATTACKS.join(" ") }),
    T.vendorQuoteEmail({ ticket, vendorName: ATTACKS[2], quoteAmount: `<b>9</b>`, quoteNotes: ATTACKS[5] }),
    T.vendorCompleteEmail({ ticket, vendorName: ATTACKS[2], hasInvoice: true, invoiceNotes: ATTACKS[4] }),
    T.inspectionCompleteEmail({ tenantName: ATTACKS[0], signature: ATTACKS[1], signedAt: ATTACKS[2], photoCount: "<x>", propertyName: ATTACKS[3], unitNumber: "2" }),
    T.emergencyDispatchEmail({ ticket, vendor: { name: ATTACKS[0], phone: ATTACKS[1] }, vendorLink: "https://www.getmodusam.com/vendor/abc", pin: "<1234>" }),
    T.ticketStatusEmail({ tenantName: ATTACKS[1], ticketTitle: ATTACKS[0], status: `x"><script>`, ticketId: `"><script>` }),
    T.landlordCommentEmail({ tenantName: ATTACKS[1], ticketTitle: ATTACKS[0], commentBody: ATTACKS[5], ticketId: TK }),
    T.vendorApprovedEmail({ vendorName: ATTACKS[2], ticketTitle: ATTACKS[0], propertyName: ATTACKS[3], stage: "quote" }),
    T.vendorMoreWorkEmail({ vendorName: ATTACKS[2], ticketTitle: ATTACKS[0], pmNotes: ATTACKS[5], vendorLink: "javascript:alert(1)" }),
  ];
  test("tenant- and vendor-controlled values never become markup, attributes or foreign links", () => {
    for (const e of all) { assertInert(e.html); assert.doesNotMatch(e.subject, /[\r\n]/); }
  });
  test("a malicious vendor link falls back to the portal", () => {
    assert.match(all.at(-1).html, /href="https:\/\/www\.getmodusam\.com"/);
  });
  test("an invalid amount is shown as a dash, never as raw input", () => {
    assert.match(all[3].html, /Quote<\/td>\s*<td[^>]*>—</);
    assert.equal(S.formatDollars("350.5"), "$350.50"); assert.equal(S.formatDollars("abc"), "—");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("recipient routing for every workflow", () => {
  test("management recipients come only from configuration", () => {
    assert.deepEqual(R.managementRecipients({ LANDLORD_EMAIL: "m@x.com, n@x.com" }), { ok: true, recipients: ["m@x.com", "n@x.com"], source: "LANDLORD_EMAIL" });
    assert.equal(R.managementRecipients({ ESCALATION_NOTIFY_EMAILS: "e@x.com" }).ok, false, "escalation list isn't the general list");
    assert.deepEqual(R.managementRecipients({ ESCALATION_NOTIFY_EMAILS: "e@x.com", LANDLORD_EMAIL: "m@x.com" }, { purpose: "escalation" }).recipients, ["e@x.com"]);
    const none = R.managementRecipients({ LANDLORD_NOTIFY_EMAILS: "capitalpathwaysapw@gmail.com" });
    assert.equal(none.ok, false); assert.match(none.error, /LANDLORD_EMAIL/);
  });
  test("new maintenance request → management, from the saved ticket; the owner may raise it, others may not", async () => {
    const r = await ev(M.maintenanceCreated, callers.tenant, { ticket_id: TK });
    assert.equal(r.status, "sent");
    assert.deepEqual(resend[0].body.to, ["manager@test.invalid"]);
    assert.match(resend[0].headers["Idempotency-Key"], new RegExp(`^maintenance-created:${TK}:[0-9a-f]{16}$`), "key = base + payload hash");
    assertInert(resend[0].body.html);
    assert.match(notes()[0].body, /^Management emailed about this new request/);
    await assert.rejects(ev(M.maintenanceCreated, callers.other, { ticket_id: TK }), (e) => e.status === 403);
    await assert.rejects(ev(M.maintenanceCreated, callers.tenant, { ticket_id: "7c0e1f6a-0000-4000-8000-0000000000ff" }), (e) => e.status === 404);
  });
  test("N2: malformed ids are a 400 client error on every event, before any database read", async () => {
    let reads = 0;
    const counting = { from: (t) => { reads++; return from(t); } };
    const cases = [
      [M.maintenanceCreated, callers.tenant, { ticket_id: "nope" }], [M.maintenanceCreated, callers.tenant, {}],
      [M.tenantComment, callers.tenant, { ticket_id: TK, comment_id: "1 or 1=1" }], [M.inspectionCompleted, callers.tenant, { inspection_id: "../x" }],
      [M.ticketStatus, callers.landlord, { ticket_id: 42 }], [M.landlordComment, callers.landlord, { ticket_id: TK, comment_id: "" }],
      [M.vendorApproved, callers.landlord, { ticket_id: "tk1" }], [M.vendorMoreWork, callers.landlord, { ticket_id: TK, comment_id: null }],
    ];
    for (const [fn, caller, body] of cases) {
      await assert.rejects(fn({ db: counting, send: E.sendEmail, env: ENV, caller, body, retryDelayMs: 0 }), (e) => e.status === 400, JSON.stringify(body));
    }
    assert.ok(reads <= 4, "only events that load the ticket before validating the comment id touch the database");
    assert.equal(resend.length, 0);
  });
  test("tenants can raise the new-request alert only within 30 minutes of creating the ticket; landlords any time", async () => {
    db.maintenance_requests[0].created_at = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    await assert.rejects(ev(M.maintenanceCreated, callers.tenant, { ticket_id: TK }), (e) => e.status === 409);
    assert.equal(resend.length, 0);
    assert.equal((await ev(M.maintenanceCreated, callers.landlord, { ticket_id: TK })).status, "sent");
  });
  test("N1: a tenant comment imitating the trusted marker does NOT suppress the alert", async () => {
    // The WP1 insert policy lets a tenant choose author_name but forces author_type 'tenant' and author_id = them.
    db.maintenance_comments.push({ id: "7c0e1f6a-0000-4000-8000-0000000000d1", request_id: TK, author_id: TENANT_UID, author_type: "tenant",
      author_name: M.NOTE_AUTHOR, body: "Management emailed about this new request (1 recipient).", visible_to_tenant: true });
    const r = await ev(M.maintenanceCreated, callers.tenant, { ticket_id: TK });
    assert.equal(r.status, "sent"); assert.equal(fake.sent.length, 1);
    // ...and the same text with author_type null (an old row) is not trusted either.
    db.maintenance_comments.at(-1).author_type = null;
    db.maintenance_comments = db.maintenance_comments.filter((c) => c.author_type !== "system");
    assert.equal((await ev(M.maintenanceCreated, callers.tenant, { ticket_id: TK })).status, "sent");
  });
  test("a repeated new-request call sends nothing more", async () => {
    await ev(M.maintenanceCreated, callers.tenant, { ticket_id: TK });
    const again = await ev(M.maintenanceCreated, callers.tenant, { ticket_id: TK });
    assert.equal(again.status, "duplicate"); assert.equal(resend.length, 1);
  });
  test("urgent/emergency request → management with an emergency subject, 911 guidance returned, SMS off by default", async () => {
    db.maintenance_requests[0].title = "I smell gas near the stove";
    const r = await ev(M.maintenanceCreated, callers.tenant, { ticket_id: TK });
    assert.match(resend[0].body.subject, /^🚨 EMERGENCY maintenance request/);
    assert.equal(r.emergency.kind, "gas"); assert.equal(r.emergency.lifeSafety, true); assert.match(r.emergency.guidance, /911/);
    assert.equal(r.sms, "disabled"); assert.equal(twilio.length, 0);
  });
  test("no management recipient configured → nothing sent, failure recorded on the ticket", async () => {
    const r = await ev(M.maintenanceCreated, callers.tenant, { ticket_id: TK }, {});
    assert.equal(r.status, "failed"); assert.equal(r.error, "MANAGEMENT_RECIPIENT_NOT_CONFIGURED");
    assert.equal(resend.length, 0);
    assert.match(notes()[0].body, /Email FAILED .*no management email is configured/);
    assert.equal(notes()[0].visible_to_tenant, false);
  });
  test("provider failure → retried with the same key and payload, then recorded on the ticket; a later call can still send", async () => {
    resendMode = "500";
    const r = await ev(M.maintenanceCreated, callers.tenant, { ticket_id: TK });
    assert.equal(r.status, "failed"); assert.equal(resend.length, 3);
    assert.equal(new Set(resend.map((c) => c.headers["Idempotency-Key"])).size, 1);
    assert.match(notes().at(-1).body, /^Email FAILED — new maintenance request/);
    resendMode = "ok";
    assert.equal((await ev(M.maintenanceCreated, callers.tenant, { ticket_id: TK })).status, "sent");
    assert.equal(fake.sent.length, 1);
  });
  test("unknown outcome → recorded as NOT CONFIRMED on the ticket, never as emailed", async () => {
    fake.plan("net-before", "net-before", "net-before");
    const r = await ev(M.maintenanceCreated, callers.tenant, { ticket_id: TK });
    assert.equal(r.status, "unconfirmed");
    assert.match(notes().at(-1).body, /^Email NOT CONFIRMED — new maintenance request/);
    assert.ok(!notes().some((n) => n.body.startsWith("Management emailed")), "no 'emailed' marker without evidence");
  });
  test("tenant reply → management; only the ticket owner's own tenant-visible comment", async () => {
    const r = await ev(M.tenantComment, callers.tenant, { ticket_id: TK, comment_id: C_TENANT });
    assert.equal(r.status, "sent"); assert.deepEqual(resend[0].body.to, ["manager@test.invalid"]);
    assertInert(resend[0].body.html); assert.match(resend[0].body.html, /Still leaking &lt;script&gt;/);
    for (const [caller, comment] of [[callers.other, C_TENANT], [callers.tenant, C_PM], [callers.tenant, C_INTERNAL]]) {
      await assert.rejects(ev(M.tenantComment, caller, { ticket_id: TK, comment_id: comment }), (e) => e.status === 403);
    }
  });
  test("vendor quote and completion → management (server-side, from the saved ticket)", async () => {
    await M.vendorQuoteSubmitted({ db: fakeDb, send: E.sendEmail, env: ENV, ticket: { id: TK }, retryDelayMs: 0 });
    await M.vendorWorkCompleted({ db: fakeDb, send: E.sendEmail, env: ENV, ticket: { id: TK }, actionAt: "2026-11-12T13:00:00Z", retryDelayMs: 0 });
    assert.equal(resend.length, 2);
    for (const r of resend) { assert.deepEqual(r.body.to, ["manager@test.invalid"]); assertInert(r.body.html); }
    assert.match(resend[0].body.html, /\$350\.00/);
    assert.match(resend[1].headers["Idempotency-Key"], new RegExp(`^vendor-complete:${TK}:2026-11-12T13:00:00Z:[0-9a-f]{16}$`));
  });
  test("walkthrough complete → management; only the tenant whose inspection it is", async () => {
    const r = await ev(M.inspectionCompleted, callers.tenant, { inspection_id: IN1 });
    assert.equal(r.status, "sent"); assert.deepEqual(resend[0].body.to, ["manager@test.invalid"]); assertInert(resend[0].body.html);
    await assert.rejects(ev(M.inspectionCompleted, callers.other, { inspection_id: IN1 }), (e) => e.status === 403);
  });
  test("landlord events go to the tenant/vendor on record, never to a caller-supplied address", async () => {
    await ev(M.ticketStatus, callers.landlord, { ticket_id: TK, to: "attacker@evil.example" });
    await ev(M.landlordComment, callers.landlord, { ticket_id: TK, comment_id: C_PM });
    await ev(M.vendorApproved, callers.landlord, { ticket_id: TK, stage: "quote" });
    await ev(M.vendorMoreWork, callers.landlord, { ticket_id: TK, comment_id: C_REWORK });
    assert.deepEqual(resend.map((r) => r.body.to[0]), ["tenant@test.invalid", "tenant@test.invalid", "vendor@acme.test", "vendor@acme.test"]);
    for (const r of resend) assertInert(r.body.html);
    assert.match(resend[3].body.html, /href="https:\/\/www\.getmodusam\.com\/vendor\/tok-1"/, "vendor link built on the server");
    db.maintenance_requests[0].vendor_email = null; db.maintenance_requests[0].vendor_name = "Heat Co";
    await ev(M.vendorApproved, callers.landlord, { ticket_id: TK, stage: "quote" });
    assert.equal(resend.at(-1).body.to[0], "heat@vendor.test");
  });
  test("landlord events are refused for tenants; an internal comment is never emailed to the tenant", async () => {
    for (const fn of [M.ticketStatus, M.landlordComment, M.vendorApproved, M.vendorMoreWork]) {
      await assert.rejects(ev(fn, callers.tenant, { ticket_id: TK, comment_id: C_PM }), (e) => e.status === 403);
    }
    await assert.rejects(ev(M.landlordComment, callers.landlord, { ticket_id: TK, comment_id: C_INTERNAL }), (e) => e.status === 409);
    assert.equal(resend.length, 0);
  });
  test("no obsolete or personal address is hard-coded anywhere in the app or API", () => {
    const files = [];
    const walk = (d) => { for (const f of readdirSync(new URL(`../${d}`, import.meta.url))) { const p = `${d}/${f}`; if (statSync(new URL(`../${p}`, import.meta.url)).isDirectory()) walk(p); else if (/\.(js|jsx|ts)$/.test(f)) files.push(p); } };
    walk("api"); walk("src");
    for (const f of files) {
      if (f.startsWith("src/supabase/")) continue;   // stray, undeployed legacy copies (documented)
      // Documented exception: the landlord sign-in screen's browser-side allow-list (a UX gate, not a
      // recipient; authorization is profiles.role on the server). See docs/comms-remediation/README.md.
      if (f === "src/LandlordLogin.jsx") continue;
      const s = read(f);
      assert.doesNotMatch(s, /capitalpathwaysapw@gmail\.com/, f);
      assert.doesNotMatch(s, /moduspropmgmt@gmail\.com/, f);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("HTTP routes: tenants and vendors cannot send arbitrary email or SMS", () => {
  function call(handler, { uid, body }) {
    supabaseAdmin.auth.getUser = async () => (uid ? { data: { user: { id: uid } }, error: null } : { data: null, error: new Error("no") });
    supabaseAdmin.from = from;
    return new Promise((resolve) => {
      const res = { code: 200, body: null, status(c) { this.code = c; return this; }, end() { resolve(this); return this; }, json(b) { this.body = b; resolve(this); return this; } };
      handler({ method: "POST", headers: { authorization: uid ? "Bearer tok" : "" }, body }, res);
    });
  }
  test("/api/send-email: tenants are refused even to management; landlords may send", async () => {
    const t = await call(sendEmailRoute, { uid: TENANT_UID, body: { to: "manager@test.invalid", subject: "Rent", html: "<a href='https://evil.example'>pay</a>" } });
    assert.equal(t.code, 403); assert.equal(resend.length, 0);
    assert.equal((await call(sendEmailRoute, { uid: null, body: { to: "a@x.com", subject: "s", html: "h" } })).code, 401);
    const l = await call(sendEmailRoute, { uid: LANDLORD_UID, body: { to: "applicant@x.com", subject: "Update", html: "<p>ok</p>" } });
    assert.equal(l.code, 200); assert.equal(resend.length, 1);
    assert.equal((await call(sendEmailRoute, { uid: LANDLORD_UID, body: { to: "Eve <e@x.com>", subject: "s", html: "h" } })).code, 400);
  });
  test("/api/notify: unknown events and caller-chosen recipients are ignored", async () => {
    assert.equal((await call(notifyRoute, { uid: TENANT_UID, body: { event: "send_any", to: "x@y.com", html: "<script>" } })).code, 400);
    const r = await call(notifyRoute, { uid: TENANT_UID, body: { event: "maintenance_created", ticket_id: TK, to: "attacker@evil.example", subject: "x", html: "<script>" } });
    assert.equal(r.code, 200); assert.deepEqual(resend[0].body.to, ["manager@test.invalid"]); assertInert(resend[0].body.html);
    assert.equal((await call(notifyRoute, { uid: OTHER_UID, body: { event: "maintenance_created", ticket_id: TK } })).code, 403);
  });
  test("/api/sms-escalate: tenants refused; landlords get a test SMS only when SMS is enabled and configured", async () => {
    assert.equal((await call(smsRoute, { uid: TENANT_UID, body: { message: "spam", to: "+15550000000" } })).code, 403);
    const off = await call(smsRoute, { uid: LANDLORD_UID, body: {} });
    assert.equal(off.code, 409); assert.equal(off.body.status, "disabled"); assert.equal(twilio.length, 0);
  });
  test("the browser no longer composes or addresses notification emails", () => {
    const client = read("src/notifications.js");
    assert.doesNotMatch(client, /functions\.invoke\("send-email"|html:|subject:|@gmail\.com|vendor_token|sms-escalate/);
    for (const f of ["src/VendorTicket.jsx", "src/MoveInInspection.jsx", "src/MaintenanceRequestForm.jsx", "src/TenantMaintenanceDetail.jsx"]) {
      assert.doesNotMatch(read(f), /\/api\/send-email|functions\.invoke\("send-email"/, f);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("emergencies", () => {
  const LIFE = { gas: "I smell gas in the kitchen", fire: "There's smoke coming from the outlet and I see flames", carbon_monoxide: "carbon monoxide alarm is going off",
    electrical: "the outlet is sparking", security: "someone is trying to break in" };
  const PROPERTY = { water: "water is pouring through my ceiling", no_heat: "We have no heat and it's below freezing", access: "the front door won't lock" };
  test("life-safety messages: Tier 1, emergency urgency, and the reply opens with 911 guidance", () => {
    for (const [kind, msg] of Object.entries(LIFE)) {
      const c = AI.applySafetyOverrides({ tier: "TIER3_MAINTENANCE", urgency: "LOW", tenant_reply: "Thanks!", escalate_to_landlord: false }, msg);
      assert.equal(c.tier, "TIER1_EMERGENCY", kind); assert.equal(c.urgency, "EMERGENCY"); assert.equal(c.life_safety, true); assert.equal(c.emergency_kind, kind);
      assert.match(c.tenant_reply.split("\n\n")[0], /911/, kind);
      assert.ok(N.needsNotification(c), "management is notified");
      assert.doesNotMatch(c.tenant_reply, /has been notified|will call you|on (their|the) way|delivered/i, "never claims delivery");
    }
  });
  test("property emergencies reach management with safety steps (911 if anyone is at risk)", () => {
    for (const [kind, msg] of Object.entries(PROPERTY)) {
      const c = AI.applySafetyOverrides({ tier: "TIER3_MAINTENANCE", tenant_reply: "Ok" }, msg);
      assert.equal(c.tier, "TIER1_EMERGENCY", kind); assert.equal(c.life_safety, false); assert.ok(N.needsNotification(c));
    }
    assert.match(AI.detectEmergency(PROPERTY.no_heat).guidance, /911/);
  });
  test("ordinary messages are not emergencies", () => {
    for (const m of ["Can I smoke on the balcony?", "Where is the fire extinguisher?", "The smoke detector battery is chirping", "Hi", "When is rent due?", "is there a fireplace"]) {
      assert.equal(AI.detectEmergency(m), null, m);
    }
  });
  test("the AI prompt tells it to direct life-safety emergencies to 911 and never claim a phone line", () => {
    const p = P.buildSystemPrompt(undefined);
    assert.match(p, /call 911 \(for gas, from outside the building\)/);
    assert.match(p, /no 24\/7 emergency phone line yet/);
  });
  test("SMS is off unless explicitly enabled and fully configured; 'accepted' is never 'delivered'", async () => {
    const full = { EMERGENCY_SMS_ENABLED: "true", TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM: "+15550001111", LANDLORD_PHONE: "+15550002222" };
    assert.equal((await SMS.sendEmergencySms({ body: "x", env: { ...full, EMERGENCY_SMS_ENABLED: "" } })).status, "disabled");
    const missing = await SMS.sendEmergencySms({ body: "x", env: { ...full, TWILIO_AUTH_TOKEN: "" } });
    assert.equal(missing.status, "not_configured"); assert.deepEqual(missing.missing, ["TWILIO_AUTH_TOKEN"]);
    assert.equal((await SMS.sendEmergencySms({ body: "x", env: { ...full, LANDLORD_PHONE: "555-0002" } })).status, "not_configured");
    assert.equal(twilio.length, 0);
    const ok = await SMS.sendEmergencySms({ body: "x", env: full });
    assert.equal(ok.status, "accepted"); assert.equal(ok.provider_status, "queued");
    assert.match(twilio[0].body, /To=%2B15550002222/, "only the configured number");
    assert.match(SMS.smsStatusLabel(ok), /delivery not confirmed/);
    assert.doesNotMatch(JSON.stringify(ok), /tok|AC1/, "no secrets returned");
  });
  test("an emergency escalation records the SMS outcome next to the email outcome (SMS off by default)", async () => {
    const row = { id: "L1", message_id: "m1", raw_openai_response: { tier: "TIER1_EMERGENCY" } };
    db.ai_routing_logs = [row];
    const n = await N.notifyEscalation({ db: fakeDb, send: E.sendEmail, log: row, tenant: {}, message: "gas", reply: "r", messageId: "m1", env: ENV, retryDelayMs: 0,
      classification: { tier: "TIER1_EMERGENCY", emergency_kind: "gas", life_safety: true } });
    assert.equal(n.status, "sent"); assert.equal(n.sms.status, "disabled");
    assert.equal(row.raw_openai_response.notify.sms.status, "disabled");
    assert.equal(twilio.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SMS ENABLED (test configuration only — production keeps EMERGENCY_SMS_ENABLED unset). Twilio is faked.
describe("emergency SMS is sent at most once (B2)", () => {
  const SMS_ENV = { ...ENV, EMERGENCY_SMS_ENABLED: "true", TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM: "+15550001111", LANDLORD_PHONE: "+15550002222" };
  const emergencyClass = { tier: "TIER1_EMERGENCY", emergency_kind: "gas", life_safety: true, escalate_to_landlord: true };
  const notifyRow = (row, extra = {}) => N.notifyEscalation({ db: fakeDb, send: E.sendEmail, log: row, tenant: {}, message: "I smell gas", reply: "r", messageId: row.message_id,
    env: SMS_ENV, retryDelayMs: 0, classification: emergencyClass, ...extra });

  test("escalation: email failing and retried three times → still one SMS", async () => {
    const row = { id: "L1", message_id: "m1", raw_openai_response: { tier: "TIER1_EMERGENCY" } };
    db.ai_routing_logs = [row];
    resendMode = "500";
    const first = await notifyRow(row);
    assert.equal(first.status, "failed"); assert.equal(first.sms.status, "accepted"); assert.equal(twilio.length, 1);
    for (let i = 0; i < 3; i++) await notifyRow(row);   // what a repeated request does for a failed email
    assert.equal(twilio.length, 1, "no further SMS");
    assert.equal(row.raw_openai_response.notify.sms.status, "accepted", "the original SMS record is kept");
  });
  test("escalation: two rows for the same message notified concurrently → one SMS", async () => {
    const a = { id: "LA", message_id: "m2", raw_openai_response: { tier: "TIER1_EMERGENCY" } };
    const b = { id: "LB", message_id: "m2", raw_openai_response: { tier: "TIER1_EMERGENCY" } };
    db.ai_routing_logs = [a, b];
    await Promise.all([notifyRow(a), notifyRow(b)]);
    assert.equal(twilio.length, 1);
  });
  test("escalation: the claim is written BEFORE Twilio is called; a crash after the claim leaves 'sending' (unknown), never re-sent", async () => {
    const row = { id: "L3", message_id: "m3", raw_openai_response: { tier: "TIER1_EMERGENCY" } };
    db.ai_routing_logs = [row];
    let seenClaim = null;
    const crashing = async (args) => { if (args.dryRun) return { status: "ready" }; seenClaim = row.raw_openai_response.notify?.sms?.status; throw new Error("function killed"); };
    await notifyRow(row, { sms: crashing });
    assert.equal(seenClaim, "sending");
    row.raw_openai_response.notify.sms = { status: "sending" };   // as left behind by a killed function
    await notifyRow(row);
    assert.equal(twilio.length, 0, "an unknown SMS outcome is not retried");
    assert.match((await import("../src/lib/notifyStatus.js")).smsStatusText(row), /SMS status unknown/);
  });
  test("escalation: a Twilio failure is recorded and not retried automatically", async () => {
    const row = { id: "L4", message_id: "m4", raw_openai_response: { tier: "TIER1_EMERGENCY" } };
    db.ai_routing_logs = [row];
    const failing = async (args) => (args.dryRun ? { status: "ready" } : { status: "failed", error: "Twilio 400" });
    const n = await notifyRow(row, { sms: failing });
    assert.equal(n.sms.status, "failed");
    await notifyRow(row);
    assert.equal(twilio.length, 0);
  });
  test("maintenance: repeated alert calls for an emergency ticket → one SMS, with a durable note before sending", async () => {
    db.maintenance_requests[0].title = "I smell gas near the stove";
    resendMode = "500";                                   // email keeps failing, so the email isn't the dedupe
    const run = () => M.maintenanceCreated({ db: fakeDb, send: E.sendEmail, env: SMS_ENV, caller: callers.tenant, body: { ticket_id: TK }, retryDelayMs: 0 });
    const r1 = await run();
    assert.equal(r1.sms, "accepted"); assert.equal(twilio.length, 1);
    for (let i = 0; i < 3; i++) assert.equal((await run()).sms, "duplicate");
    assert.equal(twilio.length, 1);
    const smsNotes = notes().filter((n) => n.body.startsWith("Emergency SMS"));
    assert.equal(smsNotes[0].body, "Emergency SMS: sending.");
    assert.match(smsNotes[1].body, /accepted by Twilio .*delivery not confirmed/);
  });
  test("maintenance: SMS disabled → no claim note, nothing sent (so enabling SMS later can't text old tickets is enforced by the 30-minute window)", async () => {
    db.maintenance_requests[0].title = "I smell gas near the stove";
    const r = await ev(M.maintenanceCreated, callers.tenant, { ticket_id: TK });
    assert.equal(r.sms, "disabled"); assert.equal(twilio.length, 0);
    assert.ok(!notes().some((n) => n.body.startsWith("Emergency SMS")));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("escalation failure paths", () => {
  test("routing row could not be written: the email still goes out and says it is missing from the Agent Center", async () => {
    const db2 = { from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }), update: () => ({ eq: async () => ({ error: null }) }) }) };
    const n = await N.notifyEscalation({ db: db2, send: E.sendEmail, log: null, tenant: {}, message: "help", reply: "r", messageId: "m1", env: ENV, retryDelayMs: 0,
      classification: { escalate_to_landlord: true } });
    assert.equal(n.status, "sent"); assert.match(resend[0].body.html, /could not be saved to the Agent Center/);
  });
  test("processing threw: the fail-safe records an escalation, replies to the tenant once, and emails management", async () => {
    const tables = { tenants: [{ id: "t1", name: "Test User", user_id: TENANT_UID, units: { unit_number: "2", properties: { name: "Clifton Manor" } } }], messages: [], ai_routing_logs: [] };
    const db2 = { from: (t) => { db[t] = tables[t] || (tables[t] = []); return from(t); } };
    const r = await failSafeEscalation({ tenantId: "t1", messageId: "m1", message: "I smell gas", replyAttempted: false, db: db2, send: E.sendEmail });
    assert.equal(r.status, "sent");
    assert.equal(db.ai_routing_logs.length, 1); assert.equal(db.ai_routing_logs[0].action_taken, "ESCALATE_LANDLORD");
    assert.equal(db.messages.length, 1); assert.match(db.messages[0].body, /911/);
    assert.equal(resend[0].headers["Idempotency-Key"], "escalation:m1");
    assert.match(resend[0].body.subject, /EMERGENCY/);
    // A reply was already written on the normal path: the fail-safe doesn't write a second one.
    db.messages = []; tables.messages = db.messages; tables.ai_routing_logs = []; db.ai_routing_logs = tables.ai_routing_logs;
    await failSafeEscalation({ tenantId: "t1", messageId: "m2", message: "help", replyAttempted: true, db: db2, send: E.sendEmail });
    assert.equal(db.messages.length, 0);
  });
  test("the OpenAI call is bounded so a slow model falls into the fallback instead of outliving the function", () => {
    const api = read("api/classify-and-route.js");
    assert.match(api, /new OpenAI\(\{ apiKey: process\.env\.OPENAI_API_KEY, timeout: OPENAI_TIMEOUT_MS, maxRetries: 0 \}\)/);
    assert.match(api, /export const OPENAI_TIMEOUT_MS = 20000;/);
  });
  test("B3: the tenant chat sends the AI request exactly once — no automatic retry — and tells the tenant if it failed", () => {
    const ui = read("src/MessagingScreen.jsx");
    const send = ui.slice(ui.indexOf("async function sendMessage"), ui.indexOf("// Group messages by date"));
    assert.equal((send.match(/fetch\("\/api\/classify-and-route"/g) || []).length, 1);
    assert.doesNotMatch(send, /setTimeout|retry\(|\.then\(route\)/);
    assert.match(ui, /the assistant didn't respond/);
  });
  test("the Agent Center shows each escalation's email outcome", () => {
    const ac = read("src/LandlordAgentCenter.jsx");
    assert.match(ac, /<NotifyBadge log=\{log\} \/>/);
    assert.match(ac, /notifyStatusLabel\(log\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("daily recap", () => {
  const now = new Date("2026-11-12T12:00:00Z");
  const ticket = { id: "x", title: ATTACKS[0], priority: `urgent"><script>`, status: "open", created_at: "2026-11-11T00:00:00Z", tenants: { name: ATTACKS[1], units: { unit_number: ATTACKS[3] } } };
  test("tenant-controlled ticket titles and names are escaped", () => {
    const r = D.buildDailyRecap({ tickets: [ticket], inspections: [], tenants: [{ name: ATTACKS[2], lease_end: "2026-12-01", units: { unit_number: "2" } }], escalationRows: [], messages: [], now });
    assertInert(r.html); assert.match(r.html, /&lt;script&gt;/);
  });
  test("a failed read never crashes the recap and never reports all clear", () => {
    const r = D.buildDailyRecap({ tickets: null, inspections: [], tenants: [], escalationRows: [], messages: [], now });
    assert.equal(r.allClear, false); assert.equal(r.incomplete, true);
    assert.match(r.html, /COULD NOT BE LOADED: MAINTENANCE TICKETS/); assert.match(r.subject, /INCOMPLETE/);
  });
  test("tenant messages the assistant never processed are listed", () => {
    const messages = [
      { id: "m1", sender_id: TENANT_UID, body: `Help ${ATTACKS[0]}`, created_at: "2026-11-12T01:00:00Z", tenants: { name: "Test User", user_id: TENANT_UID } },
      { id: "m2", sender_id: TENANT_UID, body: "processed", created_at: "2026-11-12T02:00:00Z", tenants: { name: "Test User", user_id: TENANT_UID } },
      { id: "m3", sender_id: null, body: "AI reply", created_at: "2026-11-12T02:00:01Z", tenants: { name: "Test User", user_id: TENANT_UID } },
    ];
    const r = D.buildDailyRecap({ tickets: [], inspections: [], tenants: [], escalationRows: [{ id: "L", message_id: "m2", action_taken: "AUTO_REPLY", raw_openai_response: {} }], messages, now });
    assert.match(r.html, /NEVER ANSWERED \(1\)/); assert.match(r.subject, /1 unanswered/); assertInert(r.html);
    assert.deepEqual(D.unprocessedMessages(messages, [{ message_id: "m2" }]).map((m) => m.id), ["m1"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("prepared Supabase Edge Function changes (not deployed)", () => {
  test("send-email: landlords and the service role only — no tenant or vendor-token path, no hard-coded allow-list", () => {
    const src = read("supabase/functions/send-email/index.ts");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.match(code, /if \(!isLandlord\(caller\)\) return json\(req, \{ error: "Landlord access required" \}, 403\)/);
    assert.doesNotMatch(code, /vendor_token|LANDLORD_NOTIFY_EMAILS|@gmail\.com|restrictedSender/);
  });
  test("invite-tenant: sends from the verified domain and escapes names", () => {
    const src = read("supabase/functions/invite-tenant/index.ts");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.doesNotMatch(code, /moduspm\.com/);
    assert.match(code, /from: FROM_EMAIL/);
    assert.match(code, /notifications@getmodusam\.com/);
    assert.doesNotMatch(code, /\$\{(tenant_name|property_name|landlord_name|unit_number)\}/);
  });
});
