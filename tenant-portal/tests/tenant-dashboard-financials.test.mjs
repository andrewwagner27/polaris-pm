// tests/tenant-dashboard-financials.test.mjs
// Run: npm test   (node --test tests/)
// Regression: the tenant Home "Balance Due" card queried ledger_entries.amount (the column is
// amount_minor_units), the query always failed, and the card fell back to units.rent_amount labelled
// "Monthly Rent" — a rent figure presented as a balance. Base rent, recurring charges and the actual
// balance due are now separate: the balance comes only from the active receivables ledger and is
// "Balance unavailable" otherwise. Pure module plus source checks; no network, no database.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const F = await import("../src/lib/tenantFinancials.js");
const dashboard = readFileSync(new URL("../src/HomeDashboard.jsx", import.meta.url), "utf8");

// A fake Supabase client: records every call; answers rpc() from a table of responses.
function fakeClient(responses) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ rpc: name, args });
      const r = responses[name];
      if (r instanceof Error) throw r;
      return r ?? { data: null, error: { message: `no response for ${name}` } };
    },
    from: (table) => { calls.push({ from: table }); throw new Error(`unexpected table read: ${table}`); },
  };
}
const ACTIVE = { data: { active: true, cutover_date: "2026-11-01" }, error: null };
const INACTIVE = { data: { active: false, cutover_date: null }, error: null };

describe("monthly recurring charges", () => {
  const rent = { id: "r1", category: "Rent", amount: "1300.00", active: true, status: "active" };
  const parking = { id: "p1", category: "Parking", amount: "50.00", active: true, status: "active" };

  test("$1,300 base rent + $50 parking = $1,350 in monthly recurring charges", () => {
    const m = F.monthlyChargesSummary([parking, rent]);
    assert.equal(m.totalCents, 135000);
    assert.equal(F.formatCents(m.totalCents), "$1,350.00");
    assert.deepEqual(m.items.map((i) => [i.label, i.cents, i.isRent]), [["Rent", 130000, true], ["Parking", 5000, false]]);
  });

  test("only the Rent category is treated as rent; other charges are additional, never rent", () => {
    const m = F.monthlyChargesSummary([parking, { id: "s", category: "Storage", amount: 25, active: true }, { id: "x", category: "", amount: 10, active: true }]);
    assert.ok(m.items.every((i) => i.isRent === false));
    assert.equal(m.items.find((i) => i.id === "x").label, "Recurring charge");
  });

  test("inactive charges are excluded; amount_cents is used only when amount is missing", () => {
    const m = F.monthlyChargesSummary([rent, { ...parking, active: false }, { id: "o", category: "Pet", status: "inactive", amount: 30, active: true },
      { id: "c", category: "Storage", amount: null, amount_cents: 2500, active: true }]);
    assert.equal(m.totalCents, 130000 + 2500);
    assert.equal(F.chargeCents({ amount: "1300.00", amount_cents: null }), 130000);   // Unit 2's row: amount set, amount_cents null
  });

  test("no recurring charges: nothing is fabricated (no default rent row, total 0, hasCharges false)", () => {
    for (const none of [[], null, undefined]) {
      const m = F.monthlyChargesSummary(none);
      assert.equal(m.hasCharges, false); assert.equal(m.items.length, 0); assert.equal(m.totalCents, 0);
    }
  });
});

describe("balance due", () => {
  test("inactive receivables: Balance unavailable, and the ledger is not read", async () => {
    const client = fakeClient({ a2_status: INACTIVE });
    const b = await F.fetchTenantBalance(client);
    assert.deepEqual(b, { state: "unavailable", reason: "receivables_inactive" });
    assert.deepEqual(client.calls.map((c) => c.rpc || c.from), ["a2_status"]);
    const p = F.balancePresentation(b);
    assert.equal(p.amountText, "Balance unavailable"); assert.equal(p.available, false);
    assert.match(p.detail, /isn't available online yet/);
  });

  test("a failed ledger query fails visibly — no fallback to unit rent or any other table", async () => {
    const client = fakeClient({ a2_status: ACTIVE, a2_tenant_ledger: { data: null, error: { message: "permission denied" } } });
    const b = await F.fetchTenantBalance(client);
    assert.deepEqual(b, { state: "unavailable", reason: "error" });
    assert.ok(!client.calls.some((c) => c.from), "no table is read as a fallback");
    const p = F.balancePresentation(b);
    assert.equal(p.amountText, "Balance unavailable"); assert.match(p.detail, /couldn't load your balance/);
  });

  test("a failed status check, a thrown error, or a malformed balance are all 'unavailable'", async () => {
    assert.equal((await F.fetchTenantBalance(fakeClient({ a2_status: { data: null, error: { message: "x" } } }))).state, "unavailable");
    assert.equal((await F.fetchTenantBalance(fakeClient({ a2_status: new Error("network") }))).state, "unavailable");
    assert.equal((await F.fetchTenantBalance(fakeClient({ a2_status: ACTIVE, a2_tenant_ledger: { data: [{ balance_cents: "abc" }], error: null } }))).state, "unavailable");
  });

  test("a valid ledger balance uses integer cents from the ledger (bigint as string) → dollars", async () => {
    const rows = [{ seq: 1, balance_cents: "130000" }, { seq: 2, balance_cents: "5000" }];   // last row is the running balance
    const client = fakeClient({ a2_status: ACTIVE, a2_tenant_ledger: { data: rows, error: null } });
    const b = await F.fetchTenantBalance(client);
    assert.deepEqual(b, { state: "available", cents: 5000 });
    assert.deepEqual(client.calls[1], { rpc: "a2_tenant_ledger", args: { p_tenant: null } });
    const p = F.balancePresentation(b);
    assert.equal(p.amountText, "$50.00"); assert.equal(p.detail, "Amount due"); assert.equal(p.tone, "due");
  });

  test("credit and zero balances are labelled as such", () => {
    assert.deepEqual(F.balancePresentation({ state: "available", cents: -2500 }), { amountText: "$25.00", detail: "Credit on account", tone: "clear", available: true });
    assert.deepEqual(F.balancePresentation({ state: "available", cents: 0 }), { amountText: "$0.00", detail: "Account current", tone: "clear", available: true });
  });

  test("an empty ledger is never a $0 balance: 'Balance unavailable — no posted activity yet'", async () => {
    const client = fakeClient({ a2_status: ACTIVE, a2_tenant_ledger: { data: [], error: null } });
    const b = await F.fetchTenantBalance(client);
    assert.deepEqual(b, { state: "unavailable", reason: "no_activity" });
    const p = F.balancePresentation(b);
    assert.equal(p.amountText, "Balance unavailable — no posted activity yet");
    assert.equal(p.available, false);
    assert.doesNotMatch(p.amountText + p.detail, /\$0|Account current/);
  });

  test("unknown or uninitialised tenant (the ledger returns nothing) is unavailable, as is a null result", async () => {
    // a2_tenant_ledger returns no rows for an unknown tenant, no access, or a tenant not yet set up.
    for (const ledgerResult of [{ data: [], error: null }, { data: null, error: null }]) {
      const b = await F.fetchTenantBalance(fakeClient({ a2_status: ACTIVE, a2_tenant_ledger: ledgerResult }));
      assert.equal(b.state, "unavailable");
      assert.equal(F.balancePresentation(b).available, false);
    }
  });

  test("a recognised tenant whose posted activity nets to zero shows a real $0.00 'Account current'", async () => {
    // Rows prove the ledger recognises the tenant: a $1,300 charge, then a $1,300 payment.
    const rows = [{ seq: 1, kind: "charge", charge_cents: 130000, payment_cents: 0, balance_cents: 130000 },
                  { seq: 2, kind: "payment", charge_cents: 0, payment_cents: 130000, balance_cents: "0" }];
    const b = await F.fetchTenantBalance(fakeClient({ a2_status: ACTIVE, a2_tenant_ledger: { data: rows, error: null } }));
    assert.deepEqual(b, { state: "available", cents: 0 });
    assert.deepEqual(F.balancePresentation(b), { amountText: "$0.00", detail: "Account current", tone: "clear", available: true });
  });

  test("a ledger row with a missing balance is an error, not $0", async () => {
    const b = await F.fetchTenantBalance(fakeClient({ a2_status: ACTIVE, a2_tenant_ledger: { data: [{ seq: 1, balance_cents: null }], error: null } }));
    assert.deepEqual(b, { state: "unavailable", reason: "error" });
  });

  test("the $1,350 monthly total is never presented as the balance due", async () => {
    const charges = F.monthlyChargesSummary([{ category: "Rent", amount: 1300, active: true }, { category: "Parking", amount: 50, active: true }]);
    for (const b of [await F.fetchTenantBalance(fakeClient({ a2_status: INACTIVE })),
                     await F.fetchTenantBalance(fakeClient({ a2_status: ACTIVE, a2_tenant_ledger: { data: null, error: { message: "x" } } })),
                     await F.fetchTenantBalance(fakeClient({ a2_status: ACTIVE, a2_tenant_ledger: { data: [], error: null } }))]) {
      const p = F.balancePresentation(b);
      assert.notEqual(p.amountText, F.formatCents(charges.totalCents));
      assert.doesNotMatch(p.amountText, /1,350/);
    }
  });
});

describe("tenant Home dashboard wiring", () => {
  test("the balance comes only from fetchTenantBalance — no ledger_entries query, no amount column", () => {
    assert.match(dashboard, /setBalance\(await fetchTenantBalance\(supabase\)\)/);
    assert.doesNotMatch(dashboard, /ledger_entries/);
    assert.doesNotMatch(dashboard, /select\("amount/);
  });

  test("unit rent and recurring charges are never substituted for the balance", () => {
    assert.doesNotMatch(dashboard, /"Monthly Rent"/, "the old fallback label is gone");
    assert.doesNotMatch(dashboard, /balanceDisplay|balanceInfo|rentDue|isRentDue/);
    // The Balance Due card renders only the balance presentation.
    const card = dashboard.slice(dashboard.indexOf("<Label>Balance Due</Label>"), dashboard.indexOf("{/* Due date + Pay CTA */}"));
    assert.ok(card.length > 0);
    assert.match(card, /bal\.amountText/);
    assert.doesNotMatch(card, /baseRent|monthly\.|tenant\?\.rent|recurringCharges|formatCents/);
  });

  test("monthly charges are shown as scheduled charges with a total, not as an amount owed", () => {
    assert.match(dashboard, /<Label>Monthly Recurring Charges<\/Label>/);
    assert.match(dashboard, /This is not your balance due\./);
    assert.match(dashboard, /Total monthly charges/);
    assert.match(dashboard, /No recurring charges are set up on your account\./);
    assert.doesNotMatch(dashboard, /_isDefault/, "no fabricated default rent row");
  });

  test("base rent stays distinct from recurring charges; the Rent row doesn't repeat 'Rent'", () => {
    assert.match(dashboard, /\["Base rent on file", baseRent != null \? fmt\(baseRent\) : "—"\]/);
    assert.match(dashboard, /c\.isRent \? null : "Additional recurring charge"/);
    assert.doesNotMatch(dashboard, /c\.isRent \? "Rent"/, "no second 'Rent' line under the Rent row");
  });

  test("existing dashboard features are still present", () => {
    for (const s of ['navigate("/pay")', 'navigate("/maintenance/new")', 'navigate("/maintenance")', "lease_document_url", "Next Due Date",
                     "fetchMessages()", "Lease expires in", "Unit ${tenant?.unit"]) assert.ok(dashboard.includes(s), s);
  });
});

describe("Activity screen: no fabricated accounting", () => {
  const activity = readFileSync(new URL("../src/ActivityLedger.jsx", import.meta.url), "utf8");
  // Unit 2's actual legacy records (production, read-only review): two manual rows, both "Unpaid".
  const unit2Payments = [
    { id: "7473373a", amount: 50, amount_cents: 5000, status: "Unpaid", source: "manual", paid_at: null, created_at: "2026-10-22T01:29:11Z" },
    { id: "c9845f3e", amount: 5000, amount_cents: 500000, status: "Unpaid", source: "manual", paid_at: null, created_at: "2026-10-22T15:58:52Z" },
  ];

  test("Unpaid manual payment records are never treated as received", () => {
    const v = F.paymentRecordsView(unit2Payments);
    assert.equal(v.length, 2);
    for (const r of v) { assert.equal(r.received, false); assert.equal(r.statusLabel, "Unpaid — not received"); }
    assert.deepEqual(v.map((r) => r.cents), [500000, 5000], "actual recorded amounts, newest first");
  });

  test("only status 'paid' (any case, not voided) counts as received", () => {
    assert.equal(F.paymentRecordStatus({ status: "paid" }).received, true);
    assert.equal(F.paymentRecordStatus({ status: "Paid" }).received, true);
    assert.equal(F.paymentRecordStatus({ status: "paid", voided_at: "2026-11-01" }).received, false);
    for (const s of ["unpaid", "pending", "processing", "failed", "refunded", "canceled", "weird", "", null])
      assert.equal(F.paymentRecordStatus({ status: s }).received, false, String(s));
    assert.match(F.paymentRecordStatus({ status: "weird" }).label, /not confirmed received/);
  });

  test("payment records carry no charges and no balance", () => {
    for (const r of F.paymentRecordsView(unit2Payments)) {
      assert.deepEqual(Object.keys(r).sort(), ["cents", "date", "description", "id", "received", "statusLabel"]);
      assert.doesNotMatch(r.description, /Monthly Rent|Rent Payment/);
    }
  });

  test("with receivables inactive, Activity shows 'Balance unavailable' and no running balance", async () => {
    const r = await F.fetchTenantLedger(fakeClient({ a2_status: INACTIVE }));
    assert.equal(r.mode, "legacy");
    assert.deepEqual(r.rows, []);
    assert.equal(F.balancePresentation(r.balance).amountText, "Balance unavailable");
  });

  test("no fabricated rent charges or reconstructed balances remain in the Activity screen", () => {
    assert.doesNotMatch(activity, /buildFromPayments|buildLedger|running \+=|running -=|ledger_entries/);
    assert.doesNotMatch(activity, /description:\s*"Monthly Rent"|"Rent Payment/);
    assert.doesNotMatch(activity, />Monthly Rent</, "the recurring total is not labelled Monthly Rent");
    assert.match(activity, /paymentRecordsView\(data\)/);
    assert.match(activity, /Only records marked Paid were received\./);
  });

  test("monthly recurring charges are labelled as scheduled, not as debt", () => {
    assert.match(activity, /<div style=\{cardLabel\}>Monthly Recurring Charges<\/div>/);
    assert.match(activity, /Scheduled each month\. Not a balance due\./);
    // The balance card shows only the balance presentation.
    const card = activity.slice(activity.indexOf("<div style={cardLabel}>Current Balance</div>"), activity.indexOf("<div style={cardLabel}>Monthly Recurring Charges</div>"));
    assert.match(card, /bal\.amountText/);
    assert.doesNotMatch(card, /monthly\.|recurringCharges|tenant\?\.rent|records/);
  });

  test("Home and Activity cannot disagree: both use the same ledger read and presentation", async () => {
    assert.match(activity, /await fetchTenantLedger\(supabase\)/);
    assert.match(activity, /balancePresentation\(ledger \? ledger\.balance/);
    const src = readFileSync(new URL("../src/lib/tenantFinancials.js", import.meta.url), "utf8");
    assert.match(src, /export async function fetchTenantBalance\(client\) \{\s*return \(await fetchTenantLedger\(client\)\)\.balance;/);
    for (const responses of [{ a2_status: INACTIVE }, { a2_status: ACTIVE, a2_tenant_ledger: { data: [], error: null } },
                             { a2_status: ACTIVE, a2_tenant_ledger: { data: null, error: { message: "x" } } },
                             { a2_status: ACTIVE, a2_tenant_ledger: { data: [{ seq: 1, balance_cents: 4500 }], error: null } }]) {
      const home = F.balancePresentation(await F.fetchTenantBalance(fakeClient(responses)));
      const act = F.balancePresentation((await F.fetchTenantLedger(fakeClient(responses))).balance);
      assert.deepEqual(home, act);
    }
  });

  test("active receivables: the ledger rows and running balance are used unchanged", async () => {
    const rows = [{ seq: 1, ref_id: "c", kind: "charge", description: "Rent 2026-11", charge_cents: 130000, payment_cents: 0, balance_cents: 130000, event_date: "2026-11-01" },
                  { seq: 2, ref_id: "p", kind: "payment", description: "Payment · Rent", charge_cents: 0, payment_cents: 100000, balance_cents: 30000, event_date: "2026-11-03" }];
    const client = fakeClient({ a2_status: ACTIVE, a2_tenant_ledger: { data: rows, error: null } });
    const r = await F.fetchTenantLedger(client);
    assert.equal(r.mode, "ledger"); assert.equal(r.rows, rows);
    assert.deepEqual(r.balance, { state: "available", cents: 30000 });
    assert.ok(!client.calls.some((c) => c.from), "no payments or other table read when the ledger is in use");
  });

  test("a failed status or ledger query is 'error' mode with an unavailable balance", async () => {
    for (const responses of [{ a2_status: { data: null, error: { message: "x" } } }, { a2_status: new Error("network") },
                             { a2_status: ACTIVE, a2_tenant_ledger: { data: null, error: { message: "denied" } } }]) {
      const r = await F.fetchTenantLedger(fakeClient(responses));
      assert.equal(r.mode, "error");
      assert.deepEqual(r.balance, { state: "unavailable", reason: "error" });
    }
    assert.match(activity, /We couldn't load your payment records\./);
  });
});
