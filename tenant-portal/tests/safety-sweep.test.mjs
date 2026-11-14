// tests/safety-sweep.test.mjs
// Unfinished tenant messages (api/_lib/messageSweep.js) and the combined safety sweep (api/_lib/safetySweep.js):
// a message whose AI run never finished is escalated to management exactly once, never while a run is live, never
// after a finished run, never for history older than this release, and a tenant can only sweep their own record.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
process.env.OPENAI_API_KEY = "sk-test";
process.env.RESEND_API_KEY = "re_test";
process.env.ESCALATION_NOTIFY_EMAILS = "manager@test.invalid";
process.env.LANDLORD_EMAIL = "manager@test.invalid";
delete process.env.EMERGENCY_SMS_ENABLED;

const { FakeResend } = await import("./helpers/fakeResend.mjs");
let resend = new FakeResend(), openaiCalls = 0, twilio = 0;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes("api.resend.com")) return resend.handle(u, init);
  if (u.includes("api.openai.com")) { openaiCalls++; throw new Error("the sweep must never ask the AI"); }
  if (u.includes("api.twilio.com")) { twilio++; return new Response("{}", { status: 201 }); }
  throw new Error(`unexpected fetch ${u}`);
};

const S = await import("../api/_lib/messageSweep.js");
const { safetySweep } = await import("../api/_lib/safetySweep.js");
const E = await import("../api/_lib/email.js");
const { STALE_MS } = await import("../api/_lib/messageClaim.js");

const NOW = Date.parse("2026-11-16T12:00:00Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const T1 = "t1", T2 = "t2", U1 = "u1", U2 = "u2", LL = "landlord-1";
let db, seq, claimsMissing;
const msg = (id, over = {}) => ({ id, tenant_id: T1, sender_id: U1, body: `Question ${id}`, created_at: ago(30 * MIN), tenants: { user_id: U1 }, ...over });

function from(table) {
  const rows = (db[table] ||= []); const f = []; let op = null, payload = null;
  const run = (single) => {
    if (table === "ai_message_claims" && claimsMissing) return { data: null, error: { code: "42P01", message: "relation does not exist" } };
    if (op === "insert") {
      if (table === "ai_message_claims" && rows.some((r) => r.message_id === payload.message_id)) return { data: null, error: { code: "23505", message: "duplicate key" } };
      const row = { id: `${table}-${++seq}`, created_at: new Date(NOW).toISOString(), ...(table === "ai_message_claims" ? { completed_at: null } : {}), ...payload };
      rows.push(row); return { data: structuredClone(row), error: null };
    }
    const m = rows.filter((r) => f.every((p) => p(r)));
    if (op === "update") { m.forEach((r) => Object.assign(r, structuredClone(payload))); return { data: m.map((r) => ({ ...r })), error: null }; }
    return { data: single ? (m[0] ? structuredClone(m[0]) : null) : m.map((r) => structuredClone(r)), error: null };
  };
  const b = {
    select: () => b, order: () => b, limit: () => b,
    eq: (k, v) => { f.push((r) => r[k] === v); return b; },
    neq: (k, v) => { f.push((r) => r[k] !== v); return b; },
    gte: (k, v) => { f.push((r) => r[k] >= v); return b; },
    lte: (k, v) => { f.push((r) => r[k] <= v); return b; },
    lt: (k, v) => { f.push((r) => r[k] < v); return b; },
    in: (k, v) => { f.push((r) => v.includes(r[k])); return b; },
    is: (k, v) => { f.push((r) => (v === null ? r[k] == null : r[k] === v)); return b; },
    not: (k, o, v) => { f.push((r) => (o === "is" && v === null ? r[k] != null : o === "is" && v === true ? r[k] !== true : true)); return b; },
    insert: (row) => { op = "insert"; payload = row; return b; },
    update: (p) => { op = "update"; payload = p; return b; },
    maybeSingle: async () => { await Promise.resolve(); return run(true); }, single: async () => { await Promise.resolve(); return run(true); },
    then: (res, rej) => Promise.resolve().then(() => run(false)).then(res, rej),
  };
  return b;
}
const fakeDb = { from };
let escalations;
const escalate = async (a) => { await new Promise((r) => setTimeout(r, 5)); escalations.push(a); return { status: "sent", logId: `log-${a.messageId}` }; };
const sweep = (over = {}) => S.sweepUnansweredMessages({ db: fakeDb, escalate, now: () => NOW, ...over });

beforeEach(() => {
  seq = 0; claimsMissing = false; escalations = []; resend = new FakeResend(); openaiCalls = 0; twilio = 0;
  db = {
    tenants: [{ id: T1, user_id: U1, name: "Test User", unit_id: "unit-2", archived: false, units: { unit_number: "2", property_id: "p1", properties: { id: "p1", name: "Clifton Manor" } } },
              { id: T2, user_id: U2, name: "Other Tenant", unit_id: "unit-3", archived: false, units: { unit_number: "3", property_id: "p1", properties: { id: "p1", name: "Clifton Manor" } } }],
    messages: [], ai_routing_logs: [], ai_message_claims: [], maintenance_requests: [], maintenance_comments: [], landlord_alerts: [],
  };
});

describe("sweepUnansweredMessages", () => {
  test("a tenant message with no routing row and no claim is escalated once; overlapping sweeps don't duplicate", async () => {
    db.messages.push(msg("m1"));
    await Promise.all([sweep(), sweep(), sweep()]);
    assert.equal(escalations.length, 1);
    assert.equal(escalations[0].messageId, "m1");
    assert.equal(escalations[0].replyAttempted, false);
    assert.ok(db.ai_message_claims[0].completed_at, "finished: never escalated again");
    const again = await sweep();
    assert.equal(again.escalated, 0);
    assert.equal(escalations.length, 1);
  });

  test("left alone: answered, live run, finished run, too new, older than this release, management-authored", async () => {
    db.messages.push(
      msg("answered"), msg("live"), msg("finished"),
      msg("new", { created_at: ago(2 * MIN) }),
      msg("old", { created_at: "2026-11-14T13:00:00Z" }),
      msg("mgmt", { sender_id: LL }),
    );
    db.ai_routing_logs.push({ message_id: "answered" });
    db.ai_message_claims.push({ message_id: "live", claimed_at: ago(30_000), completed_at: null },
                              { message_id: "finished", claimed_at: ago(20 * MIN), completed_at: ago(19 * MIN) });
    const r = await sweep();
    assert.equal(escalations.length, 0);
    assert.equal(r.skipped, 2, "live + finished");
  });

  test("a crashed run (unfinished claim past the stale window) is escalated", async () => {
    db.messages.push(msg("m1"));
    db.ai_message_claims.push({ message_id: "m1", claimed_at: ago(STALE_MS + 60_000), completed_at: null });
    await sweep();
    assert.equal(escalations.length, 1);
  });

  test("if an AI reply was stored after the message, the fail-safe does not add a second reply", async () => {
    db.messages.push(msg("m1"), { id: "ai1", tenant_id: T1, sender_id: null, body: "AI answer", created_at: ago(29 * MIN), tenants: { user_id: U1 } });
    await sweep();
    assert.equal(escalations[0].replyAttempted, true);
  });

  test("without the claims table nothing is escalated (no duplicate protection → no risk)", async () => {
    claimsMissing = true;
    db.messages.push(msg("m1"));
    const orig = console.error; console.error = () => {};
    try { await sweep(); } finally { console.error = orig; }
    assert.equal(escalations.length, 0);
  });

  test("at most MESSAGE_SWEEP_MAX per run", async () => {
    for (let i = 0; i < S.MESSAGE_SWEEP_MAX + 3; i++) db.messages.push(msg(`m${i}`));
    const r = await sweep();
    assert.equal(escalations.length, S.MESSAGE_SWEEP_MAX);
    assert.equal(r.skipped, 3);
  });
});

describe("safety_sweep event", () => {
  test("a tenant sweeps only their own record; management sweeps everything", async () => {
    db.messages.push(msg("mine"), msg("theirs", { tenant_id: T2, sender_id: U2, tenants: { user_id: U2 } }));
    const t = await safetySweep({ db: fakeDb, send: E.sendEmail, env: process.env, caller: { role: "tenant", user: { id: U1 } }, escalate, retryDelayMs: 0, now: () => NOW });
    assert.equal(t.scope, "tenant");
    assert.deepEqual(escalations.map((e) => e.messageId), ["mine"]);
    const l = await safetySweep({ db: fakeDb, send: E.sendEmail, env: process.env, caller: { role: "landlord", user: { id: LL } }, escalate, retryDelayMs: 0, now: () => NOW });
    assert.equal(l.scope, "all");
    assert.deepEqual(escalations.map((e) => e.messageId).sort(), ["mine", "theirs"]);
  });

  test("a login with no active tenant record sweeps nothing", async () => {
    db.messages.push(msg("m1"));
    const r = await safetySweep({ db: fakeDb, send: E.sendEmail, env: process.env, caller: { role: "tenant", user: { id: "nobody" } }, escalate });
    assert.equal(r.scope, "none");
    assert.equal(escalations.length, 0);
  });

  test("with the real fail-safe: escalation row, one management email, a hand-off reply — no AI call, no SMS", async () => {
    db.messages.push(msg("m1", { body: "Can someone call me about my lease?" }));
    const r = await safetySweep({ db: fakeDb, send: E.sendEmail, env: process.env, caller: { role: "landlord", user: { id: LL } }, retryDelayMs: 0, now: () => NOW });
    assert.equal(r.messages.escalated, 1);
    const row = db.ai_routing_logs.find((x) => x.message_id === "m1");
    assert.equal(row.action_taken, "ESCALATE_LANDLORD");
    assert.equal(resend.sent.length, 1);
    assert.deepEqual(resend.sent[0].to, ["manager@test.invalid"]);
    const handoff = db.messages.filter((m) => m.sender_id === null);
    assert.equal(handoff.length, 1);
    assert.match(handoff[0].body, /passed it to Modus management/);
    assert.equal(openaiCalls, 0);
    assert.equal(twilio, 0);
  });
});

describe("wiring", () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  test("notify exposes safety_sweep; the recap runs both nets", () => {
    assert.match(read("api/notify.js"), /safety_sweep: safetySweep/);
    assert.match(read("api/_lib/safetySweep.js"), /sweepMissedTicketAlerts\(/);
    assert.match(read("api/_lib/safetySweep.js"), /sweepUnansweredMessages\(/);
  });
  test("the grace period is longer than the route's stale window, so a live run is never swept", () => {
    assert.ok(S.MESSAGE_SWEEP_GRACE_MS > STALE_MS);
  });
});
