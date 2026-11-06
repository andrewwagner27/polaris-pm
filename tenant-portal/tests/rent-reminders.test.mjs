// tests/rent-reminders.test.mjs
// Run: npm test   (node --test tests/)
// Exercises supabase/functions/rent-reminders/handler.ts with in-memory fakes for the tenant
// queries, the ledger and the Resend API. No network, no database, no emails.
// The same scenarios run against the real migrations in docs/a3-test-tools/reminder_ledger.mjs.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { handleRentReminders, nyDate } = await import("../supabase/functions/rent-reminders/handler.ts");

const CRON_SECRET = "test-cron-secret";
const FIRST_EST   = new Date("2026-11-01T14:00:00Z"); // 09:00 EST, the run the cron guard keeps

let tenants, ledger, generated, outbox, delivered, loads, order;
const dueOf = (payable_cents, extra = {}) => ({ ledger_active: true, payable_cents, past_due_cents: 0, pending_cents: 0, credit_applied_cents: 0, other_lines: [], ...extra });

function seed() {
  tenants = [
    { id: "t-active",  name: "Alice Adams", email: "alice@example.com", lease_start: "2025-01-01", lease_end: "2027-01-01" },
    { id: "t-charges", name: "Bob Brown",   email: "bob@example.com",   lease_start: null,         lease_end: null },
    { id: "t-future",  name: "Cara Cole",   email: "cara@example.com",  lease_start: "2026-12-01", lease_end: null },
    { id: "t-expired", name: "Dan Diaz",    email: "dan@example.com",   lease_start: "2024-01-01", lease_end: "2026-10-31" },
    { id: "t-norent",  name: "Eve Evans",   email: "eve@example.com",   lease_start: null,         lease_end: null },
  ];
  ledger = { "t-active": dueOf(150000), "t-charges": dueOf(125050), "t-future": dueOf(120000), "t-expired": dueOf(110000), "t-norent": dueOf(0) };
  generated = true;
  order = [];
  outbox = [];              // every request made to the fake Resend API
  delivered = new Map();    // idempotency key -> delivered email (Resend's 24h de-duplication)
  loads = 0;
}

function deps(now, overrides = {}) {
  return {
    isAuthorized: (req) => req.headers.get("x-cron-secret") === CRON_SECRET,
    loadTenants: async () => { loads++; return tenants; },
    generateCharges: async (asOf) => { order.push(`generate:${asOf}`); return [{ outcome: "created" }, { outcome: "exists" }, { outcome: "skipped: tenant archived" }]; },
    rentChargesGenerated: async () => { order.push("check"); return generated; },
    loadRentDue: async (id) => { order.push("ledger"); return ledger[id]; },
    sendEmail: async (to, subject, html, key) => {
      outbox.push({ to, subject, html, key });
      if (!delivered.has(key)) delivered.set(key, { to, subject, html });
      return true;
    },
    now: () => now,
    pause: async () => {},
    ...overrides,
  };
}

const cronRequest = (url = "https://x.supabase.co/functions/v1/rent-reminders", body = "{}", headers = {}) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET, ...headers },
    body,
  });

const run = async (now, req = cronRequest(), overrides) => {
  const res = await handleRentReminders(req, deps(now, overrides));
  return { status: res.status, body: await res.json() };
};

beforeEach(seed);

describe("run on the 1st", () => {
  test("sends one due-today reminder to each eligible tenant", async () => {
    const { status, body } = await run(FIRST_EST);
    assert.equal(status, 200);
    assert.equal(body.sent, 2);
    assert.equal(body.date, "2026-11-01");
    assert.deepEqual(outbox.map((m) => m.to).sort(), ["alice@example.com", "bob@example.com"]);

    for (const m of outbox) {
      assert.equal(m.subject, "Rent due today — November payment");
      assert.match(m.html, /is due <strong[^>]*>today \(the 1st\)<\/strong>/);
      assert.match(m.html, /Due today \(the 1st\)/);
      assert.doesNotMatch(m.html + m.subject, /tomorrow|in 5 days/);
    }
  });

  test("preserves eligibility: lease not started, lease ended, and no rent are skipped", async () => {
    await run(FIRST_EST);
    const to = outbox.map((m) => m.to);
    for (const skipped of ["cara@example.com", "dan@example.com", "eve@example.com"]) {
      assert.ok(!to.includes(skipped), `${skipped} should not be emailed`);
    }
  });

  test("the amount is exactly what the ledger says Pay Rent will collect", async () => {
    await run(FIRST_EST);
    assert.match(outbox.find((m) => m.to === "bob@example.com").html, /\$1,250\.50/);
    assert.match(outbox.find((m) => m.to === "alice@example.com").html, /\$1,500\.00/);
  });

  test("uses the New York date: 13:00 UTC on Nov 1 (08:00 EST) is still the 1st", async () => {
    const { body } = await run(new Date("2026-11-01T13:00:00Z"));
    assert.equal(body.sent, 2);
  });

  test("uses the 1st in EDT months too (13:00 UTC = 09:00 EDT)", async () => {
    const { body } = await run(new Date("2027-04-01T13:00:00Z"));
    assert.equal(body.sent, 2);
    assert.equal(outbox[0].subject, "Rent due today — April payment");
  });
});

describe("the amount comes from the ledger", () => {
  const only = (id, due) => { tenants = tenants.filter((t) => t.id === id); ledger[id] = due; };
  const bodyOf = async (id, due) => { only(id, due); const r = await run(FIRST_EST); return { ...r, html: outbox[0]?.html }; };

  test("partly paid rent: the rest of it", async () => {
    const { html } = await bodyOf("t-active", dueOf(60000));
    assert.match(html, /\$600\.00/); assert.doesNotMatch(html, /\$1,500/);
  });
  test("fully paid rent: no email", async () => {
    const { body } = await bodyOf("t-active", dueOf(0));
    assert.equal(body.sent, 0); assert.equal(outbox.length, 0); assert.equal(body.skipped.nothing_due, 1);
  });
  test("a rental credit lowers it, and the email says so", async () => {
    const { html } = await bodyOf("t-active", dueOf(70000, { credit_applied_cents: 30000 }));
    assert.match(html, /\$700\.00/); assert.match(html, /A \$300\.00 rental credit has already been applied/);
  });
  test("a full credit: no email", async () => {
    const { body } = await bodyOf("t-active", dueOf(0, { credit_applied_cents: 100000 }));
    assert.equal(body.sent, 0);
  });
  test("Parking is named apart and is not in the amount", async () => {
    const { html } = await bodyOf("t-active", dueOf(100000, { other_lines: [{ category: "Parking", open_cents: 7500 }] }));
    assert.match(html, /\$1,000\.00/); assert.doesNotMatch(html, /\$1,075/);
    assert.match(html, /Not included: Parking \$75\.00/);
  });
  test("only Parking open: no rent reminder", async () => {
    const { body } = await bodyOf("t-active", dueOf(0, { other_lines: [{ category: "Parking", open_cents: 7500 }] }));
    assert.equal(body.sent, 0);
  });
  test("arrears are in the amount, and named", async () => {
    const { html } = await bodyOf("t-active", dueOf(140000, { past_due_cents: 40000 }));
    assert.match(html, /\$1,400\.00/); assert.match(html, /Includes \$400\.00 past due/);
  });
  test("a payment still settling is taken off", async () => {
    const { html } = await bodyOf("t-active", dueOf(60000, { pending_cents: 40000 }));
    assert.match(html, /\$600\.00/); assert.match(html, /A \$400\.00 payment still processing/);
  });
  test("a category or name can't inject markup", async () => {
    tenants[0].name = "<b>Al</b> Adams";
    const { html } = await bodyOf("t-active", dueOf(100000, { other_lines: [{ category: "<img src=x>", open_cents: 100 }] }));
    assert.doesNotMatch(html, /<img src=x>|<b>Al/); assert.match(html, /&lt;img src=x&gt;/);
  });
  test("a ledger failure for one tenant skips that tenant, with no estimate", async () => {
    const { body } = await run(FIRST_EST, undefined, { loadRentDue: async (id) => { if (id === "t-active") throw new Error("boom"); return ledger[id]; } });
    assert.equal(body.sent, 1); assert.equal(body.skipped.ledger_error, 1);
    assert.deepEqual(outbox.map((m) => m.to), ["bob@example.com"]);
  });
  test("no ledger yet: nothing sent", async () => {
    for (const id of Object.keys(ledger)) ledger[id] = { ledger_active: false };
    const { body } = await run(FIRST_EST);
    assert.equal(body.sent, 0); assert.equal(body.skipped.ledger_inactive, 3);
  });
  test("a malformed ledger figure: nothing sent", async () => {
    const { body } = await bodyOf("t-active", { ledger_active: true });
    assert.equal(body.sent, 0); assert.equal(body.skipped.ledger_error, 1);
  });
  test("charges are generated first, for today's New York date, before anything reads the ledger", async () => {
    const { body } = await run(FIRST_EST);
    assert.equal(order[0], "generate:2026-11-01"); assert.equal(order[1], "check"); assert.equal(order.filter((o) => o.startsWith("generate")).length, 1);
    assert.deepEqual(body.charges, { created: 1, exists: 1, skipped: 1 });
  });
  test("if generation fails: 500, nothing sent, and no ledger read", async () => {
    const { status } = await run(FIRST_EST, undefined, { generateCharges: async () => { throw new Error("no cutover"); } });
    assert.equal(status, 500); assert.equal(outbox.length, 0); assert.equal(loads, 0); assert.ok(!order.includes("ledger"));
  });
  test("other dates don't generate anything", async () => {
    await run(new Date("2026-11-02T14:00:00Z"));
    assert.deepEqual(order, []);
  });
  test("this month's charges not generated: nothing sent, and it says why", async () => {
    generated = false;
    const { status, body } = await run(FIRST_EST);
    assert.equal(status, 200); assert.equal(body.sent, 0); assert.equal(body.blocked, "rent_charges_not_generated");
    assert.equal(outbox.length, 0); assert.equal(loads, 0);
  });
  test("if the check itself fails: 500, nothing sent", async () => {
    const { status } = await run(FIRST_EST, undefined, { rentChargesGenerated: async () => { throw new Error("no such table"); } });
    assert.equal(status, 500); assert.equal(outbox.length, 0);
  });
  test("the function reads the ledger, not recurring charges or unit rent", () => {
    const src = readFileSync(new URL("../supabase/functions/rent-reminders/index.ts", import.meta.url), "utf8");
    assert.match(src, /supabase\.rpc\("a3_pay_rent_internal"/);
    assert.match(src, /supabase\.rpc\("a2_generate_charges", \{ p_as_of: asOf \}\)/);
    assert.doesNotMatch(src, /recurring_charges|rent_amount/);
  });
});

describe("run on other dates", () => {
  for (const iso of [
    "2026-10-31T13:00:00Z", // Oct 31, 09:00 EDT
    "2026-10-31T14:00:00Z",
    "2026-11-01T03:00:00Z", // the 1st in UTC but still Oct 31 in New York
    "2026-11-02T14:00:00Z",
    "2026-11-15T14:00:00Z",
    "2026-11-27T14:00:00Z", // the old "5 days before" date
  ]) {
    test(`${iso} (${nyDate(new Date(iso))} New York) sends nothing and reads no tenants`, async () => {
      const { status, body } = await run(new Date(iso));
      assert.equal(status, 200);
      assert.equal(body.sent, 0);
      assert.equal(outbox.length, 0);
      assert.equal(loads, 0);
    });
  }

  test("force=true (query or body) no longer bypasses the date check", async () => {
    const oct31 = new Date("2026-10-31T14:00:00Z");
    await run(oct31, cronRequest("https://x.supabase.co/functions/v1/rent-reminders?force=true", '{"force":true}'));
    assert.equal(outbox.length, 0);
  });
});

describe("repeated invocation on the 1st", () => {
  test("idempotency keys are stable per tenant per month, so a re-run delivers nothing new", async () => {
    await run(FIRST_EST);
    const firstKeys = outbox.map((m) => m.key);
    await run(new Date("2026-11-01T20:00:00Z")); // manual re-run later the same day
    const secondKeys = outbox.slice(firstKeys.length).map((m) => m.key);

    assert.deepEqual(secondKeys, firstKeys);
    assert.equal(new Set(firstKeys).size, firstKeys.length, "keys are unique per tenant");
    assert.equal(delivered.size, 2, "each tenant receives exactly one email");
    assert.deepEqual(firstKeys.sort(), ["rent-due-today/2026-11/t-active", "rent-due-today/2026-11/t-charges"]);
  });

  test("the next month uses new keys", async () => {
    await run(FIRST_EST);
    await run(new Date("2026-12-01T14:00:00Z")); // Cara's lease starts 2026-12-01, so she joins
    assert.deepEqual([...delivered.keys()].filter((k) => k.includes("2026-12")).sort(),
      ["rent-due-today/2026-12/t-active", "rent-due-today/2026-12/t-charges", "rent-due-today/2026-12/t-future"]);
    assert.equal(delivered.size, 5);
  });

  test("a tenant row returned twice in one run is emailed once", async () => {
    tenants.push({ ...tenants[0] });
    const { body } = await run(FIRST_EST);
    assert.equal(body.sent, 2);
    assert.equal(outbox.filter((m) => m.to === "alice@example.com").length, 1);
  });
});

describe("authorization", () => {
  for (const [label, headers] of [
    ["no credentials", { "x-cron-secret": "" }],
    ["wrong cron secret", { "x-cron-secret": "nope" }],
    ["anon-style bearer only", { "x-cron-secret": "", Authorization: "Bearer anon-jwt" }],
  ]) {
    test(`${label} is rejected with 401 before any data access or email`, async () => {
      const { status, body } = await run(FIRST_EST, cronRequest(undefined, "{}", headers));
      assert.equal(status, 401);
      assert.deepEqual(body, { error: "Unauthorized" });
      assert.equal(loads, 0);
      assert.equal(outbox.length, 0);
    });
  }

  test("index.ts authorizes with the shared isCronRequest and has no force bypass", () => {
    const src = readFileSync(new URL("../supabase/functions/rent-reminders/index.ts", import.meta.url), "utf8");
    assert.match(src, /isAuthorized:\s*isCronRequest/);
    assert.match(src, /"Idempotency-Key":\s*idempotencyKey/);
    const handlerSrc = readFileSync(new URL("../supabase/functions/rent-reminders/handler.ts", import.meta.url), "utf8");
    assert.doesNotMatch(src + handlerSrc, /searchParams\.get\("force"\)|body\?\.force/);
  });
});
