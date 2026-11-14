// tests/message-claim.test.mjs
// One AI run per tenant message: overlapping requests must not produce two AI replies or alerts
// (api/_lib/messageClaim.js + migration 20261114120000_ai_message_claims.sql). The fake table mimics a primary key.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { claimMessage, STALE_MS } = await import("../api/_lib/messageClaim.js");
const MSG = "11111111-1111-4111-8111-111111111111";

function fakeTable({ missing = false, failInsert = null } = {}) {
  const rows = new Map();
  return {
    rows,
    from(name) {
      assert.equal(name, "ai_message_claims");
      return {
        async insert(row) {
          await Promise.resolve();
          if (missing) return { error: { code: "42P01", message: "relation does not exist" } };
          if (failInsert) return { error: failInsert };
          if (rows.has(row.message_id)) return { error: { code: "23505", message: "duplicate key" } };
          rows.set(row.message_id, { ...row });
          return { error: null };
        },
        update(patch) {
          const f = {};
          const q = {
            eq(c, v) { f.eq = v; return q; },
            lt(c, v) { f.lt = v; return q; },
            async select() {
              const r = rows.get(f.eq);
              if (r && r.claimed_at < f.lt) { Object.assign(r, patch); return { data: [{ message_id: f.eq }], error: null }; }
              return { data: [], error: null };
            },
          };
          return q;
        },
      };
    },
  };
}

describe("claimMessage", () => {
  test("concurrent requests for one message: exactly one is claimed, the rest are busy", async () => {
    const db = fakeTable();
    const results = await Promise.all(Array.from({ length: 5 }, () => claimMessage(db, MSG)));
    assert.equal(results.filter((r) => r === "claimed").length, 1);
    assert.equal(results.filter((r) => r === "busy").length, 4);
  });

  test("a stale claim (crashed run) is taken over once; a fresh one is not", async () => {
    const db = fakeTable();
    const t0 = Date.parse("2026-11-14T05:00:00Z");
    assert.equal(await claimMessage(db, MSG, { now: t0 }), "claimed");
    assert.equal(await claimMessage(db, MSG, { now: t0 + 10_000 }), "busy", "still running");
    const later = t0 + STALE_MS + 1_000;
    const [a, b] = await Promise.all([claimMessage(db, MSG, { now: later }), claimMessage(db, MSG, { now: later })]);
    assert.deepEqual([a, b].sort(), ["busy", "claimed"], "only one request takes over a stale claim");
  });

  test("before the migration, or on an unexpected error, the route behaves as before (unavailable)", async () => {
    assert.equal(await claimMessage(fakeTable({ missing: true }), MSG), "unavailable");
    assert.equal(await claimMessage(fakeTable({ failInsert: { code: "08006", message: "connection failure" } }), MSG), "unavailable");
    assert.equal(await claimMessage({ from() { throw new Error("down"); } }, MSG), "unavailable");
    assert.equal(await claimMessage(fakeTable(), null), "unavailable");
  });
});

describe("route wiring and migration", () => {
  const api = readFileSync(new URL("../api/classify-and-route.js", import.meta.url), "utf8");
  const mig = readFileSync(new URL("../supabase/migrations/20261114120000_ai_message_claims.sql", import.meta.url), "utf8");
  test("the claim runs after the 'already answered' check and before any AI work; busy → 202, nothing written", () => {
    const done = api.indexOf('from("ai_routing_logs")\n      .select("id, message_id');
    const claim = api.indexOf("await claimMessage(supabase, message_id) === \"busy\"");
    const work = api.indexOf("// ── 1. Load tenant info");
    assert.ok(done > 0 && claim > done && work > claim, "order: answered-check → claim → work");
    assert.match(api, /return res\.status\(202\)\.json\(\{ duplicate: true, in_progress: true \}\)/);
  });
  test("the table is service-role only, keyed by message, removed with its message, and the migration refuses to re-run", () => {
    assert.match(mig, /message_id\s+uuid PRIMARY KEY REFERENCES public\.messages\(id\) ON DELETE CASCADE/);
    assert.match(mig, /ENABLE ROW LEVEL SECURITY/);
    assert.match(mig, /REVOKE ALL ON public\.ai_message_claims FROM PUBLIC, anon, authenticated/);
    const code = mig.replace(/--.*$/gm, "");
    assert.ok(!/CREATE POLICY/i.test(code) && !/GRANT[^;]*TO (anon|authenticated)/i.test(code));
    assert.match(mig, /refusing to re-run/);
    assert.match(mig, /Rollback:\s+DROP TABLE IF EXISTS public\.ai_message_claims;/);
  });
});
