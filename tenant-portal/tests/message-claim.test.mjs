// tests/message-claim.test.mjs
// One AI run per tenant message (api/_lib/messageClaim.js + migration 20261114120000_ai_message_claims.sql):
// overlapping requests never produce two AI replies or alerts, a finished message is never answered again, a crashed
// run is recovered, a live run can't lose its claim, a reply that can't be stored is escalated, and a missing claims
// table is loud (not silent). Unit tests with a primary-key fake, plus end-to-end runs of the real route handler
// against fake OpenAI/Resend and an in-memory database. No network.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
process.env.OPENAI_API_KEY = "sk-test";
process.env.RESEND_API_KEY = "re_test";
process.env.ESCALATION_NOTIFY_EMAILS = "manager@test.invalid";
process.env.LANDLORD_EMAIL = "landlord@test.invalid";

const { claimMessage, completeClaim, STALE_MS, ROUTE_MAX_DURATION_S } = await import("../api/_lib/messageClaim.js");
const MSG = "11111111-1111-4111-8111-111111111111";

// ── Unit level: a claims table with a real primary key and the conditional update the code relies on ──
function fakeClaims({ missing = false, failInsert = null } = {}) {
  const rows = new Map();
  return {
    rows,
    from(name) {
      assert.equal(name, "ai_message_claims");
      const f = {};
      let patch = null;
      const q = {
        async insert(row) {
          await Promise.resolve();
          if (missing) return { error: { code: "42P01", message: "relation does not exist" } };
          if (failInsert) return { error: failInsert };
          if (rows.has(row.message_id)) return { error: { code: "23505", message: "duplicate key" } };
          rows.set(row.message_id, { completed_at: null, ...row });
          return { error: null };
        },
        update(p) { patch = p; return q; },
        select() { return q; },
        eq(c, v) { f.eq = v; return q; },
        is(c, v) { f.isNull = c === "completed_at" && v === null; return q; },
        lt(c, v) { f.lt = v; return q; },
        async maybeSingle() { const r = rows.get(f.eq); return { data: r ? { ...r } : null, error: null }; },
        then(res, rej) {
          // update(...).eq(...).is(...).lt(...).select(...)   or   update(...).eq(...)
          const r = rows.get(f.eq);
          let data = [];
          if (patch && r && (!f.isNull || r.completed_at == null) && (f.lt === undefined || r.claimed_at < f.lt)) {
            Object.assign(r, patch); data = [{ message_id: f.eq }];
          }
          return Promise.resolve({ data, error: null }).then(res, rej);
        },
      };
      return q;
    },
  };
}

describe("claimMessage / completeClaim", () => {
  test("concurrent requests for one message: exactly one is claimed, the rest are busy", async () => {
    const db = fakeClaims();
    const results = await Promise.all(Array.from({ length: 5 }, () => claimMessage(db, MSG)));
    assert.equal(results.filter((r) => r === "claimed").length, 1);
    assert.equal(results.filter((r) => r === "busy").length, 4);
  });

  test("a live claim is never taken over; an unfinished stale one (crashed run) is taken over exactly once", async () => {
    const db = fakeClaims();
    const t0 = Date.parse("2026-11-14T05:00:00Z");
    assert.equal(await claimMessage(db, MSG, { now: t0 }), "claimed");
    assert.equal(await claimMessage(db, MSG, { now: t0 + ROUTE_MAX_DURATION_S * 1000 }), "busy", "still within the route's hard limit");
    const later = t0 + STALE_MS + 1_000;
    const [a, b] = await Promise.all([claimMessage(db, MSG, { now: later }), claimMessage(db, MSG, { now: later })]);
    assert.deepEqual([a, b].sort(), ["busy", "claimed"], "only one request takes over a stale claim");
  });

  test("a completed claim is never taken over, however old: the message is 'done'", async () => {
    const db = fakeClaims();
    const t0 = Date.parse("2026-11-14T05:00:00Z");
    assert.equal(await claimMessage(db, MSG, { now: t0 }), "claimed");
    assert.equal(await completeClaim(db, MSG, { now: t0 + 5_000 }), true);
    assert.equal(await claimMessage(db, MSG, { now: t0 + 10_000 }), "done");
    assert.equal(await claimMessage(db, MSG, { now: t0 + 24 * 3600_000 }), "done");
  });

  test("missing table or unexpected error: 'unavailable' and an error is logged (never silent)", async () => {
    const logged = [];
    const orig = console.error; console.error = (...a) => logged.push(a.join(" "));
    try {
      assert.equal(await claimMessage(fakeClaims({ missing: true }), MSG), "unavailable");
      assert.equal(await claimMessage(fakeClaims({ failInsert: { code: "08006", message: "connection failure" } }), MSG), "unavailable");
      assert.equal(await claimMessage({ from() { throw new Error("down"); } }, MSG), "unavailable");
    } finally { console.error = orig; }
    assert.equal(logged.filter((l) => l.includes("[message-claim] UNAVAILABLE")).length, 3);
    assert.equal(await claimMessage(fakeClaims(), null), "unavailable", "no message id: nothing to claim");
    assert.equal(await completeClaim({ from() { throw new Error("down"); } }, MSG), false, "completeClaim never throws");
  });

  test("the stale window is longer than the route's hard limit (vercel.json maxDuration)", () => {
    const cfg = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
    const max = cfg.functions?.["api/classify-and-route.js"]?.maxDuration;
    assert.equal(max, ROUTE_MAX_DURATION_S);
    assert.ok(max * 1000 + 15_000 <= STALE_MS, "at least 15 s margin between the hard limit and takeover");
  });
});

// ── End to end through the real route handler ──
let model = {}, openaiGate = null, openaiCalls = 0;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const { FakeResend } = await import("./helpers/fakeResend.mjs");
let resend = new FakeResend();
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes("api.openai.com")) {
    openaiCalls++;
    if (openaiGate) await openaiGate;
    return json({ id: "c1", object: "chat.completion", created: 0, model: "gpt-4o", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(model) } }] });
  }
  if (u.includes("api.resend.com")) return resend.handle(u, init);
  throw new Error(`unexpected fetch ${u}`);
};
const { supabaseAdmin } = await import("../api/_lib/auth.js");
const handler = (await import("../api/classify-and-route.js")).default;

const T = "6a12a0b4-0000-4000-8000-000000000001", U = "user-1", P = "prop-1";
let db, seq = 0, claimsMissing = false, failReplyInserts = 0;
function seed() {
  db = {
    profiles: [{ id: U, role: "tenant" }],
    tenants: [{ id: T, user_id: U, name: "Test User", unit_id: "unit-2", units: { unit_number: "2", property_id: P, rent_amount: 1345, properties: { id: P, name: "Clifton Manor" } } }],
    messages: [{ id: "m1", tenant_id: T, sender_id: U, body: "stored m1" }],
    ai_routing_logs: [], landlord_alerts: [], ai_message_claims: [], agent_knowledge: [],
  };
  resend = new FakeResend(); openaiGate = null; openaiCalls = 0; claimsMissing = false; failReplyInserts = 0;
}
function from(table) {
  const rows = (db[table] ||= []); const filters = []; let op = null, payload = null;
  const match = () => rows.filter((r) => filters.every(([k, v, o]) => (o === "is" ? (v === null ? r[k] == null : r[k] === v) : o === "lt" ? r[k] < v : o === "in" ? v.includes(r[k]) : r[k] === v)));
  const run = (single) => {
    if (table === "ai_message_claims" && claimsMissing) return { data: null, error: { code: "PGRST205", message: "Could not find the table" } };
    if (op === "insert") {
      if (table === "messages" && payload.sender_id === null && failReplyInserts > 0) { failReplyInserts--; op = null; return { data: null, error: { code: "57014", message: "statement timeout" } }; }
      if (table === "ai_message_claims" && rows.some((r) => r.message_id === payload.message_id)) { op = null; return { data: null, error: { code: "23505", message: "duplicate key" } }; }
      const row = { id: `${table}-${++seq}`, created_at: new Date().toISOString(), ...(table === "ai_message_claims" ? { completed_at: null } : {}), ...payload };
      rows.push(row); op = null; return { data: row, error: null };
    }
    if (op === "update") { const m = match(); m.forEach((r) => Object.assign(r, structuredClone(payload))); op = null; return { data: m.map((r) => ({ ...r })), error: null }; }
    const m = match(); return { data: single ? (m[0] ? structuredClone(m[0]) : null) : m.map((r) => structuredClone(r)), error: null };
  };
  const b = {
    select: () => b, order: () => b, limit: () => b, gte: () => b, or: () => b,
    eq: (k, v) => { filters.push([k, v]); return b; },
    is: (k, v) => { filters.push([k, v, "is"]); return b; },
    lt: (k, v) => { filters.push([k, v, "lt"]); return b; },
    in: (k, v) => { filters.push([k, v, "in"]); return b; },
    insert: (row) => { op = "insert"; payload = row; return b; },
    update: (f) => { op = "update"; payload = f; return b; },
    maybeSingle: async () => { await Promise.resolve(); return run(true); }, single: async () => { await Promise.resolve(); return run(true); },
    then: (res, rej) => Promise.resolve().then(() => run(false)).then(res, rej),
  };
  return b;
}
supabaseAdmin.from = from;
supabaseAdmin.rpc = async () => ({ data: { ledger_active: false }, error: null });
supabaseAdmin.auth.getUser = async () => ({ data: { user: { id: U } }, error: null });

const base = { tier: "TIER3_MAINTENANCE", category: "GENERAL_INQUIRY", confidence: 0.9, urgency: "LOW", intent_summary: "Tenant asks something",
  tenant_reply: "Here is my answer.", missing_info: [], billable_to_tenant: false, create_maintenance_ticket: false, create_incident_log: false,
  send_violation_notice: false, offending_unit_hint: "", dispatch_vendor: false, escalate_to_landlord: false };
function call(text = "What are the quiet hours?", classification = {}) {
  model = { ...base, ...classification };
  db.messages.find((m) => m.id === "m1").body = text;
  return new Promise((resolve) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; resolve(this); return this; } };
    handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { message: text, tenant_id: T, message_id: "m1" } }, res);
  });
}
const aiReplies = () => db.messages.filter((m) => m.sender_id === null);
beforeEach(seed);

describe("route: one AI run per message", () => {
  test("two overlapping requests (double tap / two tabs): one reply, one routing row; the second gets 202 and writes nothing", async () => {
    let open; openaiGate = new Promise((r) => { open = r; });
    const first = call();
    await new Promise((r) => setTimeout(r, 20));          // first request is now waiting on the model
    const second = await call();
    assert.equal(second.code, 202);
    assert.deepEqual(second.body, { duplicate: true, in_progress: true });
    open();
    const r1 = await first;
    assert.equal(r1.code, 200);
    assert.equal(openaiCalls, 1, "the model was asked once");
    assert.equal(aiReplies().length, 1);
    assert.equal(db.ai_routing_logs.length, 1);
    assert.equal(db.ai_routing_logs[0].raw_openai_response.claim, "claimed");
    assert.ok(db.ai_message_claims[0].completed_at, "claim marked complete");
  });

  test("a finished message is never answered again — even after the stale window and even if its routing row is missing", async () => {
    await call();
    db.ai_message_claims[0].claimed_at = new Date(Date.now() - STALE_MS * 10).toISOString();
    db.ai_routing_logs = [];                                // routing row lost: the claim alone must stop a re-run
    const again = await call();
    assert.equal(again.code, 200);
    assert.equal(again.body.duplicate, true);
    assert.equal(openaiCalls, 1);
    assert.equal(aiReplies().length, 1);
  });

  test("a crashed run (unfinished claim older than the stale window, nothing written) is recovered by the next request", async () => {
    db.ai_message_claims.push({ message_id: "m1", claimed_at: new Date(Date.now() - STALE_MS - 5_000).toISOString(), completed_at: null });
    const r = await call();
    assert.equal(r.code, 200);
    assert.equal(aiReplies().length, 1);
    assert.equal(db.ai_routing_logs.length, 1);
    assert.ok(db.ai_message_claims[0].completed_at);
  });

  test("a recent unfinished claim (run still inside its time limit) is not stolen: 202", async () => {
    db.ai_message_claims.push({ message_id: "m1", claimed_at: new Date(Date.now() - 30_000).toISOString(), completed_at: null });
    const r = await call();
    assert.equal(r.code, 202);
    assert.equal(openaiCalls, 0);
    assert.equal(aiReplies().length, 0);
  });

  test("the AI answer can't be stored (two failed inserts): fail-safe escalates to management, tenant gets the hand-off reply", async () => {
    failReplyInserts = 2;
    const r = await call("Is the gym open on Sundays?");
    assert.equal(r.code, 500);
    assert.equal(r.body.escalated, true);
    const row = db.ai_routing_logs[0];
    assert.equal(row.action_taken, "ESCALATE_LANDLORD");
    assert.equal(row.raw_openai_response.ai_unavailable, true);
    assert.equal(resend.calls.length, 1, "management emailed once");
    assert.equal(aiReplies().length, 1, "fail-safe reply stored");
    assert.match(aiReplies()[0].body, /passed it to Modus management/);
    assert.ok(db.ai_message_claims[0].completed_at, "finished: never re-run");
  });

  test("one failed insert is retried: the tenant still gets the AI answer, no escalation", async () => {
    failReplyInserts = 1;
    const r = await call();
    assert.equal(r.code, 200);
    assert.equal(aiReplies().length, 1);
    assert.equal(aiReplies()[0].body, "Here is my answer.");
    assert.equal(resend.calls.length, 0);
  });

  test("claims table missing: the tenant is still answered, but it is logged and recorded on the routing row", async () => {
    claimsMissing = true;
    const logged = [];
    const orig = console.error; console.error = (...a) => logged.push(a.join(" "));
    let r;
    try { r = await call(); } finally { console.error = orig; }
    assert.equal(r.code, 200);
    assert.equal(aiReplies().length, 1);
    assert.equal(db.ai_routing_logs[0].raw_openai_response.claim, "unavailable");
    assert.ok(logged.some((l) => l.includes("[message-claim] UNAVAILABLE")));
  });
});

describe("tenant page and migration", () => {
  const screen = readFileSync(new URL("../src/MessagingScreen.jsx", import.meta.url), "utf8");
  const mig = readFileSync(new URL("../supabase/migrations/20261114120000_ai_message_claims.sql", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  test("a 202 (another request is answering) is not shown as an error; the page keeps polling for the reply and never retries", () => {
    assert.match(screen, /\.then\(res => \{ if \(!res\.ok\) setAssistantIssue\(true\); \}\)/, "202 is res.ok → no error banner");
    assert.match(screen, /setInterval\(fetchMessages, 2000\)/);
    assert.equal((screen.match(/fetch\("\/api\/classify-and-route"/g) || []).length, 1, "one call, no retry loop");
  });
  test("the table is service-role only, keyed by message, has completed_at, and the migration refuses to re-run", () => {
    assert.match(mig, /message_id\s+uuid PRIMARY KEY REFERENCES public\.messages\(id\) ON DELETE CASCADE/);
    assert.match(mig, /completed_at timestamptz\n/);
    assert.match(mig, /ENABLE ROW LEVEL SECURITY/);
    assert.match(mig, /REVOKE ALL ON public\.ai_message_claims FROM PUBLIC, anon, authenticated/);
    const code = mig.replace(/--.*$/gm, "");
    assert.ok(!/CREATE POLICY/i.test(code) && !/GRANT[^;]*TO (anon|authenticated)/i.test(code));
    assert.match(mig, /refusing to re-run/);
    assert.match(mig, /Rollback:\s+DROP TABLE IF EXISTS public\.ai_message_claims;/);
  });
});
