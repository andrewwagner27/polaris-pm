// tests/landlord-balances.test.mjs
// Landlord screens must never present lease rent as an amount owed. Lease defines base rent; recurring charges define
// billing; only the receivables ledger (a2_tenant_balances) defines what is owed. Release test 2026-11-13: a new dummy
// tenant with $1 rent and no charges showed "-$1 Amount overdue" on the tenant detail page.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const F = await import("../src/lib/tenantFinancials.js");
const T1 = "11111111-1111-4111-8111-111111111111", T2 = "22222222-2222-4222-8222-222222222222";
const TODAY = new Date(2026, 10, 14);
const tenant = (over = {}) => ({ id: T1, archived: false, lease_start: "2026-11-01", ...over });
const ledger = (entries) => ({ mode: "ledger", byTenant: new Map(entries) });

describe("rentStanding: ledger-only balances", () => {
  test("new tenant, receivables inactive, no charges → not tracked, no amount (never rent as debt)", () => {
    const s = F.rentStanding(tenant(), { mode: "inactive", byTenant: new Map() }, { today: TODAY });
    assert.deepEqual(s, { status: "untracked", cents: null, reason: "receivables_inactive" });
    const d = F.standingDisplay(s);
    assert.equal(d.amountText, null, "no $0 and no -$rent");
    assert.match(d.note, /Receivables aren't active yet/);
  });
  test("active lease with no ledger activity → not tracked (no_activity), not $0", () => {
    const s = F.rentStanding(tenant(), ledger([]), { today: TODAY });
    assert.equal(s.status, "untracked"); assert.equal(s.reason, "no_activity"); assert.equal(F.standingDisplay(s).amountText, null);
  });
  test("actual charges → balance due from the ledger", () => {
    const s = F.rentStanding(tenant(), ledger([[T1, 130000]]), { today: TODAY });
    assert.deepEqual(s, { status: "owes", cents: 130000 });
    assert.equal(F.standingDisplay(s).amountText, "$1,300.00 due");
  });
  test("partial payment → only the remaining ledger balance is due", () => {
    assert.equal(F.standingDisplay(F.rentStanding(tenant(), ledger([[T1, 30000]]), { today: TODAY })).amountText, "$300.00 due");
  });
  test("credit → shown as a credit, not a debt; exactly zero → $0.00 (paid up)", () => {
    const c = F.rentStanding(tenant(), ledger([[T1, -2500]]), { today: TODAY });
    assert.equal(c.status, "credit"); assert.equal(F.standingDisplay(c).amountText, "$25.00 credit");
    const z = F.rentStanding(tenant(), ledger([[T1, 0]]), { today: TODAY });
    assert.equal(z.status, "current"); assert.equal(F.standingDisplay(z).amountText, "$0.00");
  });
  test("archived tenant → past tenant, no balance shown in rent rolls; vacant unit → vacant", () => {
    assert.deepEqual(F.rentStanding(tenant({ archived: true }), ledger([[T1, 5000]]), { today: TODAY }), { status: "archived", cents: null });
    assert.deepEqual(F.rentStanding(null, ledger([])), { status: "vacant", cents: null });
  });
  test("future-dated lease → upcoming when no ledger activity; ledger charges still win", () => {
    const fut = tenant({ lease_start: "2026-12-06" });
    assert.equal(F.rentStanding(fut, { mode: "inactive" }, { today: TODAY }).status, "upcoming");
    assert.equal(F.rentStanding(fut, ledger([]), { today: TODAY }).status, "upcoming");
    assert.equal(F.rentStanding(fut, ledger([[T1, 100]]), { today: TODAY }).status, "owes");
  });
  test("one tenant's balance never applies to another", () => {
    assert.equal(F.rentStanding(tenant({ id: T2 }), ledger([[T1, 9900]]), { today: TODAY }).status, "untracked");
  });
  test("totalOwedCents: only positive ledger balances; null when nothing is tracked", () => {
    assert.equal(F.totalOwedCents([{ cents: 100 }, { cents: -50 }, { cents: null }, { cents: 0 }]), 100);
    assert.equal(F.totalOwedCents([{ cents: null }]), null);
  });
});

describe("fetchLandlordBalances", () => {
  const client = (status, rows, opts = {}) => {
    const calls = [];
    return { calls, rpc: async (fn, args) => { calls.push([fn, args]); if (fn === "a2_status") return opts.statusError ? { error: { message: "x" } } : { data: status }; return opts.rowsError ? { error: { message: "x" } } : { data: rows }; } };
  };
  test("receivables inactive → 'inactive' and the balances RPC is never called", async () => {
    const c = client({ active: false }, []);
    assert.equal((await F.fetchLandlordBalances(c)).mode, "inactive");
    assert.deepEqual(c.calls.map((x) => x[0]), ["a2_status"]);
  });
  test("active → per-tenant cents from a2_tenant_balances (portfolio scope); bad rows ignored", async () => {
    const c = client({ active: true }, [{ tenant_id: T1, balance_cents: "1250" }, { tenant_id: T2, balance_cents: null }, { balance_cents: 5 }]);
    const r = await F.fetchLandlordBalances(c, { asOf: "2026-11-14" });
    assert.equal(r.mode, "ledger"); assert.deepEqual([...r.byTenant], [[T1, 1250]]);
    assert.deepEqual(c.calls[1], ["a2_tenant_balances", { p_as_of: "2026-11-14", p_scope: "portfolio", p_scope_id: null }]);
  });
  test("errors → 'error' (never a balance)", async () => {
    assert.equal((await F.fetchLandlordBalances(client(null, [], { statusError: true }))).mode, "error");
    assert.equal((await F.fetchLandlordBalances(client({ active: true }, null, { rowsError: true }))).mode, "error");
    assert.equal((await F.fetchLandlordBalances({ rpc: () => { throw new Error("down"); } })).mode, "error");
  });
});

describe("landlord screens use the ledger standing, not rent", () => {
  const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
  for (const f of ["LandlordTenantDetail.jsx", "LandlordTenants.jsx", "LandlordDashboard.jsx", "LandlordReports.jsx", "LandlordProperties.jsx"]) {
    test(`${f}: standing from rentStanding/fetchLandlordBalances; no rent-as-balance or "late" inferred from payment records`, () => {
      const src = read(f);
      assert.match(src, /fetchLandlordBalances\(supabase\)/);
      assert.match(src, /rentStanding\(/);
      assert.ok(!/balance\s*=\s*[^;\n]*rent_amount/.test(src), "no balance computed from rent_amount");
      assert.ok(!/status\s*=\s*"late"/.test(src) && !/\?\s*"late"\s*:/.test(src), "no late status inferred from payment records");
      assert.ok(!/Amount overdue/.test(src));
    });
  }
  test("the tenant detail page has no payment-reminder button and no '-$' balance", () => {
    const src = read("LandlordTenantDetail.jsx");
    assert.ok(!/Send payment reminder/.test(src));
    assert.ok(!/`-\$\$\{balance/.test(src));
  });
  test("the legacy delinquency report no longer lists rent as delinquent when receivables are inactive", () => {
    const src = read("LandlordReports.jsx");
    assert.match(src, /Delinquency isn't tracked yet: receivables aren't active/);
    assert.ok(!/No delinquent tenants this month/.test(src));
  });
});
