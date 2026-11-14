// tests/maintenance-sweep.test.mjs
// A saved maintenance ticket must reach management even if the tenant closed the browser before the alert request
// was sent: api/_lib/maintenanceNotify.js sweepMissedTicketAlerts (daily recap + management opening the queue).
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.RESEND_API_KEY = "re_test";
process.env.LANDLORD_EMAIL = "manager@test.invalid";
delete process.env.EMERGENCY_SMS_ENABLED;
const { FakeResend } = await import("./helpers/fakeResend.mjs");
let fake = new FakeResend(), twilio = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes("api.resend.com")) return fake.handle(u, init);
  if (u.includes("api.twilio.com")) { twilio.push(u); return new Response("{}", { status: 201 }); }
  throw new Error(`unexpected fetch ${u}`);
};
const M = await import("../api/_lib/maintenanceNotify.js");
const E = await import("../api/_lib/email.js");

const NOW = Date.parse("2026-11-14T06:00:00Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const id = (n) => `7c0e1f6a-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
let db, seq;
const ticket = (n, over = {}) => ({ id: id(n), title: `Ticket ${n}`, description: "Drips", category: "plumbing", priority: "normal", status: "open",
  created_at: ago(60 * 60 * 1000), tenants: { id: "t1", name: "Test User", user_id: "u1" }, units: { unit_number: "2", properties: { name: "Clifton Manor" } }, ...over });
function from(table) {
  const rows = (db[table] ||= []); const f = []; let op = null, payload = null;
  const run = (single) => {
    if (op === "insert") { const row = { id: `${table}-${++seq}`, created_at: new Date().toISOString(), ...payload }; rows.push(row); return { data: row, error: null }; }
    const m = rows.filter((r) => f.every((p) => p(r)));
    return { data: single ? (m[0] ? structuredClone(m[0]) : null) : m.map((r) => structuredClone(r)), error: null };
  };
  const b = {
    select: () => b, order: () => b, limit: () => b,
    eq: (k, v) => { f.push((r) => r[k] === v); return b; },
    neq: (k, v) => { f.push((r) => r[k] !== v); return b; },
    gte: (k, v) => { f.push((r) => r[k] >= v); return b; },
    lte: (k, v) => { f.push((r) => r[k] <= v); return b; },
    insert: (row) => { op = "insert"; payload = row; return b; },
    maybeSingle: async () => run(true), single: async () => run(true),
    then: (res, rej) => Promise.resolve(run(false)).then(res, rej),
  };
  return b;
}
const fakeDb = { from };
const sweep = (env = { LANDLORD_EMAIL: "manager@test.invalid" }) => M.sweepMissedTicketAlerts({ db: fakeDb, send: E.sendEmail, env, now: () => NOW, retryDelayMs: 0 });
const notesFor = (n) => db.maintenance_comments.filter((c) => c.request_id === id(n) && c.author_name === M.NOTE_AUTHOR);
const sysNote = (n, body) => ({ id: `c${n}-${body.length}`, request_id: id(n), author_type: "system", author_name: M.NOTE_AUTHOR, author_id: null, body });
beforeEach(() => { seq = 0; fake = new FakeResend(); twilio = []; db = { maintenance_requests: [], maintenance_comments: [] }; });

describe("sweepMissedTicketAlerts", () => {
  test("a ticket whose browser never sent the alert is emailed to management once, and the note is recorded", async () => {
    db.maintenance_requests.push(ticket(1));
    const r = await sweep();
    assert.equal(r.sent, 1);
    assert.equal(fake.sent.length, 1);
    assert.deepEqual(fake.sent[0].to, ["manager@test.invalid"]);
    assert.ok(notesFor(1).some((c) => c.body.startsWith("Management emailed about this new request")));
    const again = await sweep();
    assert.equal(again.sent, 0); assert.equal(again.already, 1); assert.equal(fake.sent.length, 1, "never a second email");
  });

  test("already-notified, resolved, too-new (browser may still be sending) and older-than-48h tickets are left alone", async () => {
    db.maintenance_requests.push(ticket(2), ticket(3, { status: "resolved" }), ticket(4, { created_at: ago(30 * 1000) }), ticket(5, { created_at: ago(49 * 3600 * 1000) }));
    db.maintenance_comments.push(sysNote(2, "Management emailed about this new request (1 recipient)."));
    const r = await sweep();
    assert.equal(fake.sent.length, 0);
    assert.equal(r.checked, 1); assert.equal(r.already, 1);
  });

  test("an unconfirmed send isn't retried (it may have arrived); repeated failures stop after the limit", async () => {
    db.maintenance_requests.push(ticket(6), ticket(7));
    db.maintenance_comments.push(sysNote(6, "Email NOT CONFIRMED — new maintenance request: timeout. It may or may not have arrived."));
    for (let i = 0; i < M.SWEEP_MAX_FAILURES; i++) db.maintenance_comments.push({ ...sysNote(7, "Email FAILED — new maintenance request: 500. Follow up directly."), id: `f${i}` });
    const r = await sweep();
    assert.equal(fake.sent.length, 0); assert.equal(r.skipped, 2);
  });

  test("no management address → recorded as a failure on the ticket, nothing sent", async () => {
    db.maintenance_requests.push(ticket(8));
    const r = await sweep({});
    assert.equal(r.failed, 1); assert.equal(fake.sent.length, 0);
    assert.ok(notesFor(8).some((c) => /Email FAILED .*no management email is configured/.test(c.body)));
  });

  test("an emergency ticket gets the emergency email but never a late SMS, even if SMS were enabled", async () => {
    db.maintenance_requests.push(ticket(9, { title: "Gas smell in the kitchen" }));
    const r = await sweep({ LANDLORD_EMAIL: "manager@test.invalid", EMERGENCY_SMS_ENABLED: "true", TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "x", TWILIO_PHONE_NUMBER: "+1", LANDLORD_PHONE: "+1" });
    assert.equal(r.sent, 1); assert.equal(twilio.length, 0);
    assert.match(fake.sent[0].subject, /emergency|EMERGENCY/i);
    assert.ok(!notesFor(9).some((c) => c.body.startsWith("Emergency SMS")));
  });

  test("at most SWEEP_MAX_SENDS emails per run", async () => {
    for (let n = 10; n < 10 + M.SWEEP_MAX_SENDS + 3; n++) db.maintenance_requests.push(ticket(n));
    const r = await sweep();
    assert.equal(r.sent, M.SWEEP_MAX_SENDS); assert.equal(fake.sent.length, M.SWEEP_MAX_SENDS);
  });
});

describe("wiring", () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  test("maintenance_sweep is a management-only event", async () => {
    await assert.rejects(() => M.EVENTS.maintenance_sweep({ db: fakeDb, send: E.sendEmail, env: {}, caller: { role: "tenant", user: { id: "u1" } } }), /Management only/);
    assert.ok(!("maintenance_sweep" in M.TENANT_EVENTS));
  });
  test("the daily recap runs the sweep before building the recap, and a sweep failure doesn't block it", () => {
    const src = read("api/daily-recap.js");
    const sweepAt = src.indexOf("await sweepMissedTicketAlerts(");
    assert.ok(sweepAt > 0 && sweepAt < src.indexOf("buildDailyRecap("));
    assert.match(src, /catch \(e\) \{\s*console\.error\("\[daily-recap\] ticket-alert sweep failed:"/);
  });
  test("the browser alert survives tab close (keepalive) and the management queue triggers the sweep", () => {
    assert.match(read("src/notifications.js"), /fetch\("\/api\/notify", \{ method: "POST", keepalive: true,/);
    assert.match(read("src/LandlordMaintenance.jsx"), /sweepMissedTicketAlerts\(\)\.then/);
  });
});
