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

  test("base rent stays distinct from recurring charges", () => {
    assert.match(dashboard, /\["Base rent on file", baseRent != null \? fmt\(baseRent\) : "—"\]/);
    assert.match(dashboard, /c\.isRent \? "Rent" : "Additional recurring charge"/);
  });

  test("existing dashboard features are still present", () => {
    for (const s of ['navigate("/pay")', 'navigate("/maintenance/new")', 'navigate("/maintenance")', "lease_document_url", "Next Due Date",
                     "fetchMessages()", "Lease expires in", "Unit ${tenant?.unit"]) assert.ok(dashboard.includes(s), s);
  });
});
