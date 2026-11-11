// tests/escalation-notify.test.mjs
// Run: npm test   (node --test tests/)
// Release B: management is emailed once per AI escalation (and emergency), outcomes are recorded,
// failures never block the tenant's reply, the daily recap lists escalations, and nothing replays.
// Unit tests of api/_lib/escalationNotify.js plus end-to-end runs of the real /api/classify-and-route
// handler against fake OpenAI, Resend and database. No network.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
process.env.OPENAI_API_KEY = "sk-test";
process.env.RESEND_API_KEY = "re_test";
process.env.ESCALATION_NOTIFY_EMAILS = "manager@test.invalid";

// ── network fake: OpenAI + Resend (installed before the handler creates its OpenAI client) ──
let model = {}, resendMode = "ok", resendCalls = [];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes("api.openai.com")) return json({ id: "c1", object: "chat.completion", created: 0, model: "gpt-4o", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(model) } }] });
  if (u.includes("api.resend.com")) {
    resendCalls.push({ headers: init.headers, body: JSON.parse(init.body) });
    if (resendMode === "throw") throw new Error("network down");
    if (resendMode === "500") return json({ message: "provider error" }, 500);
    return json({ id: `re_${resendCalls.length}` });
  }
  throw new Error(`unexpected fetch ${u}`);
};

const N = await import("../api/_lib/escalationNotify.js");
const { supabaseAdmin } = await import("../api/_lib/auth.js");
const handler = (await import("../api/classify-and-route.js")).default;

// ── in-memory database ──
const T = "6a12a0b4-0000-4000-8000-000000000001", U = "user-1", P = "prop-1";
let db;
function seed() {
  db = {
    profiles: [{ id: U, role: "tenant" }],
    tenants: [{ id: T, user_id: U, name: "Test User", unit_id: "unit-2", units: { unit_number: "2", property_id: P, rent_amount: 1345, properties: { id: P, name: "Clifton Manor" } } }],
    messages: [{ id: "m1", tenant_id: T, sender_id: U, body: "stored body" }, { id: "m2", tenant_id: T, sender_id: U, body: "stored body 2" }],
    ai_routing_logs: [], landlord_alerts: [], maintenance_requests: [], incident_logs: [], units: [], maintenance_comments: [], vendors: [],
  };
  resendCalls = []; resendMode = "ok";
}
let seq = 0;
function from(table) {
  const rows = (db[table] ||= []); const filters = []; let op = null, payload = null;
  const match = () => rows.filter((r) => filters.every(([k, v]) => r[k] === v));
  const run = (single) => {
    if (op === "insert") { const row = { id: `${table}-${++seq}`, created_at: new Date().toISOString(), ...payload }; rows.push(row); op = null; return { data: row, error: null }; }
    if (op === "update") { const m = match(); m.forEach((r) => Object.assign(r, structuredClone(payload))); op = null; return { data: m, error: null }; }
    const m = match(); return { data: single ? (m[0] ? structuredClone(m[0]) : null) : m.map((r) => structuredClone(r)), error: null };
  };
  const b = {
    select: () => b, order: () => b, limit: () => b, gte: () => b,
    eq: (k, v) => { filters.push([k, v]); return b; },
    insert: (row) => { op = "insert"; payload = row; return b; },
    update: (f) => { op = "update"; payload = f; return b; },
    maybeSingle: async () => run(true), single: async () => run(true),
    then: (res, rej) => Promise.resolve(run(false)).then(res, rej),
  };
  return b;
}
supabaseAdmin.from = from;
supabaseAdmin.rpc = async () => ({ data: { ledger_active: false }, error: null });
supabaseAdmin.auth.getUser = async () => ({ data: { user: { id: U } }, error: null });

const base = { tier: "TIER3_MAINTENANCE", category: "GENERAL_INQUIRY", confidence: 0.9, urgency: "LOW", intent_summary: "Tenant asks something",
  tenant_reply: "Here is my answer.", missing_info: [], billable_to_tenant: false, create_maintenance_ticket: false, create_incident_log: false,
  send_violation_notice: false, offending_unit_hint: "", dispatch_vendor: false, escalate_to_landlord: false };
async function ask(text, messageId = "m1", classification = {}) {
  model = { ...base, ...classification };
  // The handler reads the stored message body for message_id (as in production): store the text.
  const stored = db.messages.find((m) => m.id === messageId);
  if (stored) stored.body = text;
  return new Promise((resolve) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; resolve(this); return this; } };
    handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { message: text, tenant_id: T, message_id: messageId } }, res);
  });
}
const replies = () => db.messages.filter((m) => m.sender_id === null);
const notifyOf = (row) => row.raw_openai_response?.notify;
beforeEach(seed);

describe("end to end through /api/classify-and-route", () => {
  test("one email per escalation, to the configured recipient, with the required content", async () => {
    const r = await ask("I want to file a complaint about my last repair.", "m1", { escalate_to_landlord: true, intent_summary: "Complaint about a repair", tenant_reply: "I've flagged this for our management team." });
    assert.equal(r.code, 200);
    assert.equal(r.body.notification, "sent");
    assert.equal(resendCalls.length, 1);
    const { body, headers } = resendCalls[0];
    assert.deepEqual(body.to, ["manager@test.invalid"]);
    assert.equal(headers["Idempotency-Key"], "escalation:m1");
    assert.match(body.subject, /Tenant escalation — Clifton Manor · Unit 2 — Test User/);
    for (const s of ["Clifton Manor", "Unit", "Test User", "I want to file a complaint about my last repair.", "I&#39;ve flagged this for our management team.", "Complaint about a repair",
                     "https://www.getmodusam.com/landlord/agent", "https://www.getmodusam.com/landlord/messages"]) assert.ok(body.html.includes(s), s);
    assert.match(body.html, /Why<\/td><td[^>]*>The AI could not resolve this/);
    const log = db.ai_routing_logs[0];
    assert.equal(notifyOf(log).status, "sent");
    assert.equal(notifyOf(log).provider_id, "re_1");
    assert.ok(notifyOf(log).at);
    assert.equal(replies().length, 1, "tenant got the AI reply");
  });

  test("no email for an ordinary AI reply", async () => {
    const r = await ask("What are the quiet hours?", "m1", {});
    assert.equal(r.body.notification, "not_required");
    assert.equal(resendCalls.length, 0);
    assert.equal(notifyOf(db.ai_routing_logs[0]), undefined, "nothing recorded on ordinary rows");
    assert.equal(replies().length, 1);
  });

  test("a retried request for the same message sends nothing more (duplicate recorded)", async () => {
    await ask("Talk to a person please", "m1", { escalate_to_landlord: true });
    const again = await ask("Talk to a person please", "m1", { escalate_to_landlord: true });
    assert.equal(resendCalls.length, 1);
    assert.equal(again.body.notification, "duplicate");
    assert.equal(notifyOf(db.ai_routing_logs[1]).duplicate_of, db.ai_routing_logs[0].id);
  });

  test("a different tenant message escalates and emails separately", async () => {
    await ask("Talk to a person please", "m1", { escalate_to_landlord: true });
    await ask("Still need a person", "m2", { escalate_to_landlord: true });
    assert.equal(resendCalls.length, 2);
    assert.deepEqual(resendCalls.map((c) => c.headers["Idempotency-Key"]), ["escalation:m1", "escalation:m2"]);
  });

  test("a request for a person escalates and emails even if the model did not flag it", async () => {
    const r = await ask("I'd like to talk to a person from management, please.", "m1", { escalate_to_landlord: false });
    assert.equal(r.body.notification, "sent");
    assert.match(resendCalls[0].body.html, /Tenant asked to talk to a person/);
  });

  test("emergencies go through the same notifier (one email, emergency subject)", async () => {
    const r = await ask("I smell gas in my kitchen", "m1", { tier: "TIER1_EMERGENCY", category: "EMERGENCY", urgency: "EMERGENCY", escalate_to_landlord: true, intent_summary: "Possible gas leak" });
    assert.equal(r.body.notification, "sent");
    assert.equal(resendCalls.length, 1);
    assert.match(resendCalls[0].body.subject, /^🚨 EMERGENCY — Clifton Manor · Unit 2/);
    assert.match(resendCalls[0].body.html, /Emergency reported \(Tier 1\)/);
    assert.equal(db.landlord_alerts[0].type, "emergency");
  });

  test("provider failure (HTTP 500): tenant still gets the reply, escalation kept, failure recorded", async () => {
    resendMode = "500";
    const r = await ask("I want to speak to a real person", "m1", { escalate_to_landlord: true });
    assert.equal(r.code, 200);
    assert.equal(r.body.notification, "failed");
    assert.equal(replies().length, 1);
    assert.equal(db.landlord_alerts.length, 1);
    const n = notifyOf(db.ai_routing_logs[0]);
    assert.equal(n.status, "failed"); assert.equal(n.http_status, 500); assert.match(n.error, /provider error/);
  });

  test("provider unreachable (network error): same guarantees", async () => {
    resendMode = "throw";
    const r = await ask("I want to speak to a real person", "m1", { escalate_to_landlord: true });
    assert.equal(r.code, 200);
    assert.equal(r.body.notification, "failed");
    assert.equal(replies().length, 1);
    assert.match(notifyOf(db.ai_routing_logs[0]).error, /network down/);
  });

  test("a failed attempt does not block a later retry of the same message", async () => {
    resendMode = "500"; await ask("person please", "m1", { escalate_to_landlord: true });
    resendMode = "ok"; const r = await ask("person please", "m1", { escalate_to_landlord: true });
    assert.equal(r.body.notification, "sent");
    assert.equal(resendCalls.length, 2);
  });

  test("historical escalations are never replayed", async () => {
    db.ai_routing_logs.push({ id: "old-1", message_id: "old-msg", action_taken: "ESCALATE_LANDLORD", raw_openai_response: { tier: "TIER4_DISPUTE" } });
    db.landlord_alerts.push({ id: "old-alert", type: "late_rent" });
    await ask("What are the quiet hours?", "m1", {});
    await ask("person please", "m2", { escalate_to_landlord: true });
    assert.equal(resendCalls.length, 1);
    assert.equal(resendCalls[0].headers["Idempotency-Key"], "escalation:m2");
    assert.equal(db.ai_routing_logs.find((r) => r.id === "old-1").raw_openai_response.notify, undefined);
  });
});

describe("notifier unit behaviour", () => {
  test("recipients: ESCALATION_NOTIFY_EMAILS, then LANDLORD_EMAIL, then the existing management default — never the tenant allow-list", () => {
    assert.deepEqual(N.managementRecipients({ ESCALATION_NOTIFY_EMAILS: " A@x.com , b@x.com,a@x.com" }), { recipients: ["a@x.com", "b@x.com"], source: "ESCALATION_NOTIFY_EMAILS" });
    assert.deepEqual(N.managementRecipients({ LANDLORD_EMAIL: "l@x.com" }), { recipients: ["l@x.com"], source: "LANDLORD_EMAIL" });
    assert.deepEqual(N.managementRecipients({ LANDLORD_NOTIFY_EMAILS: "tenant@x.com" }), { recipients: ["moduspropmgmt@gmail.com"], source: "default" });
  });
  test("outcome is recorded as pending before sending, then sent with the provider id", async () => {
    const writes = []; const fakeDb = { from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }), update: (v) => ({ eq: async () => { writes.push(v.raw_openai_response.notify.status); return { error: null }; } }) }) };
    const r = await N.notifyEscalation({ db: fakeDb, send: async () => ({ ok: true, data: { id: "re_9" } }), log: { id: "L1", raw_openai_response: { tier: "T" } },
      tenant: {}, message: "x", reply: "y", classification: { escalate_to_landlord: true }, messageId: "m9", env: {} });
    assert.deepEqual(writes, ["pending", "sent"]);
    assert.equal(r.provider_id, "re_9");
  });
  test("never throws, even if the database and the sender both fail", async () => {
    const badDb = { from: () => { throw new Error("db down"); } };
    const r = await N.notifyEscalation({ db: badDb, send: async () => { throw new Error("x"); }, log: { id: "L" }, classification: { escalate_to_landlord: true }, messageId: "m", env: {} });
    assert.equal(r.status, "failed");
  });
  test("tenant text is HTML-escaped and links carry no tenant information", () => {
    const e = N.buildEscalationEmail({ propertyName: "P", unitNumber: "2", tenantName: "<b>Eve</b>", message: "<script>x</script>", reply: "ok", reason: "r" });
    assert.ok(!e.html.includes("<script>")); assert.ok(e.html.includes("&lt;script&gt;")); assert.ok(e.html.includes("&lt;b&gt;Eve&lt;/b&gt;"));
    for (const href of e.html.match(/href="([^"]+)"/g)) assert.match(href, /^href="https:\/\/www\.getmodusam\.com\/landlord\/(agent|messages)"$/);
  });
});

describe("daily recap backstop", () => {
  const rows = [
    { id: "a", action_taken: "ESCALATE_LANDLORD", detected_intent: "Wants a person", created_at: "2026-11-10T20:00:00Z", tenants: { name: "Test User", units: { unit_number: "2" } }, raw_openai_response: { notify: { status: "sent" } } },
    { id: "b", action_taken: "ESCALATE_LANDLORD", detected_intent: "Lease dispute", created_at: "2026-11-10T21:00:00Z", tenants: { name: "Test User", units: { unit_number: "2" } }, raw_openai_response: { notify: { status: "failed" } } },
    { id: "c", action_taken: "ESCALATE_LANDLORD", detected_intent: "Older, before Release B", created_at: "2026-11-10T22:00:00Z", tenants: { name: "T", units: { unit_number: "3" } }, raw_openai_response: { tier: "X" } },
    { id: "d", action_taken: "AUTO_REPLY", detected_intent: "Quiet hours", created_at: "2026-11-10T22:30:00Z", raw_openai_response: {} },
  ];
  test("lists escalations with their email status and counts the ones not confirmed emailed", () => {
    const s = N.escalationRecapSection(rows);
    assert.equal(s.count, 3);
    assert.equal(s.needsAttention, 2);
    for (const t of ["Wants a person", "emailed", "Lease dispute", "EMAIL FAILED", "not emailed"]) assert.ok(s.html.includes(t), t);
    assert.ok(!s.html.includes("Quiet hours"));
  });
  test("the recap queries only the last 24 hours of escalations and never sends per-escalation email", () => {
    const recap = readFileSync(new URL("../api/daily-recap.js", import.meta.url), "utf8");
    assert.match(recap, /ai_routing_logs\?select=[^`]*&action_taken=eq\.ESCALATE_LANDLORD&created_at=gte\.\$\{encodeURIComponent\(recapSince\(\)\)\}/);
    assert.match(recap, /escalationRecapSection\(/);
    assert.doesNotMatch(recap, /notifyEscalation|sendEmail\(/);
    const since = Date.parse(N.recapSince(Date.parse("2026-11-11T12:00:00Z")));
    assert.equal(since, Date.parse("2026-11-10T12:00:00Z"));
  });
});

describe("wiring", () => {
  const api = readFileSync(new URL("../api/classify-and-route.js", import.meta.url), "utf8");
  test("the notifier is called exactly once, after the reply and the routing log are written", () => {
    assert.equal((api.match(/notifyEscalation\(/g) || []).length, 1);
    const at = api.indexOf("notifyEscalation({");
    assert.ok(api.indexOf('from("messages").insert(') < at);
    assert.ok(api.indexOf('from("ai_routing_logs")') < at);
    assert.ok(api.indexOf('from("landlord_alerts")') < at);
  });
  test("no separate emergency email implementation remains", () => {
    assert.doesNotMatch(api, /from "resend"|resend\.emails|new Resend/);
  });
  test("nothing else in the API sends escalation notifications", () => {
    for (const f of ["api/daily-recap.js", "api/send-email.js", "api/_lib/dispatchVendor.js", "api/stripe-webhook.js"]) {
      assert.doesNotMatch(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), /notifyEscalation/, f);
    }
  });
});
