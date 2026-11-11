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
process.env.CRON_SECRET = "cron-test-secret";
let model = {}, resendMode = "ok", resendCalls = [], recapQueryFails = false, recapQueries = [];
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
  // Supabase REST, as read by /api/daily-recap (served from the in-memory database below)
  if (u.startsWith("https://example.supabase.co/rest/v1/")) {
    const q = new URL(u); const table = q.pathname.split("/").pop();
    if (table !== "ai_routing_logs") return json([]);
    if (recapQueryFails) return json({ message: "relation error" }, 400);
    recapQueries.push(q.search);
    const since = q.searchParams.get("created_at")?.replace(/^gte\./, "");
    const action = q.searchParams.get("action_taken")?.replace(/^eq\./, "");
    return json(db.ai_routing_logs
      .filter((r) => (!since || r.created_at >= since) && (!action || r.action_taken === action))
      .map((r) => ({ ...r, tenants: { name: "Test User", units: { unit_number: "2" } } })));
  }
  throw new Error(`unexpected fetch ${u}`);
};

const N = await import("../api/_lib/escalationNotify.js");
const { supabaseAdmin } = await import("../api/_lib/auth.js");
const handler = (await import("../api/classify-and-route.js")).default;
const recapHandler = (await import("../api/daily-recap.js")).default;

// ── in-memory database ──
const T = "6a12a0b4-0000-4000-8000-000000000001", U = "user-1", P = "prop-1";
let db;
function seed() {
  db = {
    profiles: [{ id: U, role: "tenant" }],
    tenants: [{ id: T, user_id: U, name: "Test User", unit_id: "unit-2", units: { unit_number: "2", property_id: P, rent_amount: 1345, properties: { id: P, name: "Clifton Manor" } } }],
    messages: ["m1", "m2", "m3", "m4"].map((id) => ({ id, tenant_id: T, sender_id: U, body: `stored ${id}` })),
    ai_routing_logs: [], landlord_alerts: [], maintenance_requests: [], incident_logs: [], units: [], maintenance_comments: [], vendors: [],
  };
  resendCalls = []; resendMode = "ok"; recapQueryFails = false; recapQueries = [];
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
  test("the recap queries only the last 24 hours of routing rows and never sends per-escalation email", () => {
    const recap = readFileSync(new URL("../api/daily-recap.js", import.meta.url), "utf8");
    assert.match(recap, /ai_routing_logs\?select=[^`]*raw_openai_response[^`]*&created_at=gte\.\$\{encodeURIComponent\(recapSince\(\)\)\}/);
    assert.doesNotMatch(recap, /action_taken=eq\./, "emergencies routed as tickets must not be filtered out by the query");
    assert.match(recap, /escalationRecapSection\(/);
    assert.doesNotMatch(recap, /notifyEscalation|sendEmail\(/);
    const since = Date.parse(N.recapSince(Date.parse("2026-11-11T12:00:00Z")));
    assert.equal(since, Date.parse("2026-11-10T12:00:00Z"));
  });
});

describe("daily recap includes every notified emergency and escalation (end to end)", () => {
  const EMERGENCY_AS_TICKET = { tier: "TIER1_EMERGENCY", category: "MAINTENANCE", urgency: "EMERGENCY", create_maintenance_ticket: true, escalate_to_landlord: false };
  function runRecap() {
    return new Promise((resolve) => {
      const res = { code: 200, body: null, status(c) { this.code = c; return this; }, end() { resolve(this); return this; }, json(b) { this.body = b; resolve(this); return this; } };
      recapHandler({ method: "GET", headers: { authorization: "Bearer cron-test-secret" } }, res);
    });
  }
  async function scenario() {
    await ask("Water is pouring through my ceiling", "m1", { ...EMERGENCY_AS_TICKET, intent_summary: "Ceiling leak emergency" });
    await ask("I need to talk to a person about my lease", "m2", { escalate_to_landlord: true, intent_summary: "Lease question for management" });
    await ask("What are the quiet hours?", "m3", { intent_summary: "Quiet hours question" });
    resendMode = "500";
    await ask("Sparks are coming out of the outlet", "m4", { ...EMERGENCY_AS_TICKET, intent_summary: "Electrical emergency" });
    resendMode = "ok";
  }

  test("setup reproduces the gap: emergencies routed as tickets are CREATE_TICKET rows, yet were emailed", async () => {
    await scenario();
    const byIntent = Object.fromEntries(db.ai_routing_logs.map((r) => [r.detected_intent, r]));
    assert.equal(byIntent["Ceiling leak emergency"].action_taken, "CREATE_TICKET");
    assert.equal(byIntent["Ceiling leak emergency"].raw_openai_response.notify.status, "sent");
    assert.equal(byIntent["Electrical emergency"].action_taken, "CREATE_TICKET");
    assert.equal(byIntent["Electrical emergency"].raw_openai_response.notify.status, "failed");
    assert.equal(byIntent["Lease question for management"].action_taken, "ESCALATE_LANDLORD");
    assert.equal(byIntent["Quiet hours question"].raw_openai_response.notify, undefined);
  });

  test("emergency-as-ticket, normal escalation and failed emergency are listed with status; the ordinary reply is not", async () => {
    await scenario();
    const notificationsBefore = resendCalls.length;   // 3 attempts: m1 sent, m2 sent, m4 failed
    const r = await runRecap();
    assert.equal(r.code, 200);
    assert.equal(resendCalls.length, notificationsBefore + 1, "exactly one email: the recap itself");
    const recap = resendCalls.at(-1).body;
    assert.match(recap.subject, /^📋 Daily Recap — 3 escalations, 1 not emailed/);
    const rowFor = (intent) => recap.html.split("<tr>").find((tr) => tr.includes(intent)) || "";
    assert.match(rowFor("Ceiling leak emergency"), /🚨 EMERGENCY · Ceiling leak emergency[\s\S]*>emailed</);
    assert.match(rowFor("Lease question for management"), />emailed</);
    assert.doesNotMatch(rowFor("Lease question for management"), /EMERGENCY/);
    assert.match(rowFor("Electrical emergency"), /🚨 EMERGENCY · Electrical emergency[\s\S]*EMAIL FAILED/);
    assert.ok(!recap.html.includes("Quiet hours question"), "ordinary AI reply is not in the recap");
    assert.match(recap.html, /TENANT ESCALATIONS &amp; EMERGENCIES — LAST 24 HOURS \(1 NOT CONFIRMED EMAILED\)/);
  });

  test("the recap never resends or replays: the failed emergency stays failed and no escalation email is sent", async () => {
    await scenario();
    const logsBefore = structuredClone(db.ai_routing_logs);
    const callsBefore = resendCalls.length;
    await runRecap();
    await runRecap();
    const sent = resendCalls.slice(callsBefore);
    assert.equal(sent.length, 2);
    for (const c of sent) { assert.match(c.body.subject, /Daily Recap/); assert.equal(c.headers["Idempotency-Key"], undefined); }
    assert.deepEqual(db.ai_routing_logs, logsBefore, "routing rows are not modified");
  });

  test("keeps the 24-hour window: older escalations and emergencies are not listed", async () => {
    db.ai_routing_logs.push(
      { id: "old-e", action_taken: "CREATE_TICKET", detected_intent: "Old emergency", created_at: new Date(Date.now() - 25 * 3600e3).toISOString(), raw_openai_response: { tier: "TIER1_EMERGENCY", notify: { status: "failed" } } },
      { id: "old-x", action_taken: "ESCALATE_LANDLORD", detected_intent: "Old escalation", created_at: new Date(Date.now() - 48 * 3600e3).toISOString(), raw_openai_response: {} },
    );
    await ask("I need a person", "m2", { escalate_to_landlord: true, intent_summary: "Fresh escalation" });
    await runRecap();
    const since = new URLSearchParams(recapQueries[0]).get("created_at").replace(/^gte\./, "");
    assert.ok(Math.abs(Date.parse(since) - (Date.now() - 24 * 3600e3)) < 60e3, "query starts 24 hours back");
    const html = resendCalls.at(-1).body.html;
    assert.ok(html.includes("Fresh escalation"));
    assert.ok(!html.includes("Old emergency") && !html.includes("Old escalation"));
  });

  test("if the escalation query fails, the recap says so instead of reporting all clear", async () => {
    recapQueryFails = true;
    await runRecap();
    const recap = resendCalls.at(-1).body;
    assert.doesNotMatch(recap.subject, /All clear/);
    assert.match(recap.html, /TENANT ESCALATIONS — COULD NOT BE LOADED/);
  });

  test("selection rule (unit): escalations, emergencies and notified rows only", () => {
    assert.equal(N.isRecapEscalation({ action_taken: "ESCALATE_LANDLORD", raw_openai_response: {} }), true);
    assert.equal(N.isRecapEscalation({ action_taken: "CREATE_TICKET", raw_openai_response: { tier: "TIER1_EMERGENCY" } }), true);
    assert.equal(N.isRecapEscalation({ action_taken: "AUTO_REPLY", raw_openai_response: { tier: "TIER2_X", notify: { status: "pending" } } }), true);
    assert.equal(N.isRecapEscalation({ action_taken: "AUTO_REPLY", raw_openai_response: { tier: "TIER3_MAINTENANCE", category: "GENERAL_INQUIRY" } }), false);
    assert.equal(N.isRecapEscalation({ action_taken: "CREATE_TICKET", raw_openai_response: { tier: "TIER3_MAINTENANCE" } }), false);
    assert.equal(N.isRecapEscalation(null), false);
    assert.equal(N.escalationRecapSection(null).unavailable, true);
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
