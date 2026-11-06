import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMonths, addDays, isTwelveMonths, snapshotRange, loanPayment, loanBalance, paymentsDueBetween,
  propertySnapshot, portfolioSnapshot, dollarsToCents, fmtMoney, fmtPctValue, fmtRatio,
} from "../src/lib/snapshot.js";

const TODAY = "2026-11-05";
const TTM = snapshotRange("ttm", TODAY);
const prop = (id, name, books = "B1") => ({ id, name, accounting_entity_id: books });
const ledger = (rent, other, opex, entries = 10) => [
  { account_code: "4000", account_name: "Rental Income", account_type: "income", amount_cents: rent, entries },
  ...(other ? [{ account_code: "4100", account_name: "Late Fee Income", account_type: "income", amount_cents: other, entries: 1 }] : []),
  ...(opex ? [{ account_code: "5000", account_name: "Repairs & Maintenance", account_type: "expense", amount_cents: opex, entries: 3 }] : []),
];
const loan30 = { original_amount_cents: 20000000, annual_rate_pct: 6, amortization_months: 360, interest_only: false, first_payment_date: "2020-01-01" };

test("dates: month arithmetic clamps to month end; 12-month detection", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2026-11-05", -12), "2025-11-05");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.deepEqual(TTM, { from: "2025-11-06", to: "2026-11-05" });
  assert.ok(isTwelveMonths(TTM.from, TTM.to));
  assert.ok(isTwelveMonths("2025-01-01", "2025-12-31"));
  const ytd = snapshotRange("ytd", TODAY);
  assert.ok(!isTwelveMonths(ytd.from, ytd.to));
});

test("loans: payment from terms, entered payment wins, amortised balance matches the closed form", () => {
  assert.deepEqual(loanPayment(loan30), { cents: 119910, kind: "estimate" });                // $200k, 6%, 30 yr = $1,199.10
  assert.deepEqual(loanPayment({ ...loan30, monthly_payment_cents: 125000 }), { cents: 125000, kind: "entered" });
  assert.deepEqual(loanPayment({ ...loan30, interest_only: true, amortization_months: null }), { cents: 100000, kind: "estimate" });
  assert.deepEqual(loanPayment({ ...loan30, annual_rate_pct: 0 }), { cents: Math.round(20000000 / 360), kind: "estimate" });
  // 12 payments due 2020-01-01..2020-12-01
  const b = loanBalance(loan30, "2020-12-15");
  const r = 0.005, n = 12, pmt = 1199.10, closed = 200000 * (1 + r) ** n - pmt * ((1 + r) ** n - 1) / r;
  assert.ok(Math.abs(b.cents - Math.round(closed * 100)) <= 12, `${b.cents} vs ${closed}`);
  assert.equal(b.kind, "estimate");
  assert.equal(paymentsDueBetween(loan30, "2020-06-01", "2020-12-31"), 7);
});

test("loans: entered balance is used as entered, rolled forward only by later payments, zero once paid off", () => {
  const l = { ...loan30, current_balance_cents: 18000000, balance_as_of: "2026-10-15" };
  assert.deepEqual(loanBalance(l, "2026-10-31"), { cents: 18000000, kind: "entered" });
  const rolled = loanBalance(l, "2026-11-05");                  // the 2026-11-01 payment is after the entered date
  assert.equal(rolled.kind, "estimate");
  assert.ok(rolled.cents < 18000000 && rolled.cents > 17900000);
  assert.deepEqual(loanBalance({ ...l, paid_off_on: "2026-06-30" }, TODAY), { cents: 0, kind: "entered" });
  assert.equal(paymentsDueBetween({ ...loan30, paid_off_on: "2020-03-15" }, "2020-01-01", "2020-12-31"), 3);
});

test("full inputs over 12 months: every metric, with exact ratios and the right basis", () => {
  const s = propertySnapshot({
    property: prop("P1", "Clifton"), units: [{ rent_amount: 1000, occupied: true }, { rent_amount: 1200, occupied: false }],
    profile: { current_value_cents: 50000000, value_as_of: "2026-06-01", value_source: "appraisal", cash_invested_cents: 10000000, purchase_date: "2019-05-01" },
    loans: [{ ...loan30, monthly_payment_cents: 120000 }], ledger: ledger(2400000, 10000, 600000), history: { first_entry_date: "2019-06-01" },
    period: TTM, today: TODAY,
  }).metrics;
  assert.equal(s.gsr.value, 2640000); assert.equal(s.gsr.kind, "scheduled");
  assert.equal(s.occupancy.value, 0.5);
  assert.equal(s.rentCollected.value, 2400000); assert.equal(s.rentCollected.kind, "actual");
  assert.equal(s.otherIncome.value, 10000);
  assert.equal(s.opex.value, 600000);
  assert.equal(s.noi.value, 1810000); assert.equal(s.noi.kind, "actual");
  assert.equal(s.debtService.value, 1440000); assert.equal(s.debtService.kind, "entered");   // 12 × $1,200
  assert.equal(s.netCashFlow.value, 370000); assert.equal(s.netCashFlow.kind, "entered");
  assert.equal(s.value.value, 50000000); assert.equal(s.value.kind, "estimate");
  assert.equal(s.capRate.value, 1810000 / 50000000);
  assert.equal(s.cashOnCash.value, 370000 / 10000000);
  assert.equal(s.dscr.value, 1810000 / 1440000);
  assert.equal(s.equity.value, 50000000 - s.debt.value);
  assert.ok(s.debt.value > 0 && s.debt.kind === "estimate");
});

test("missing inputs are never shown as numbers", () => {
  const base = { property: prop("P1", "A"), units: [{ rent_amount: 1000, occupied: true }], ledger: ledger(1200000, 0, 200000), history: { first_entry_date: "2020-01-01" }, period: TTM, today: TODAY };
  const none = propertySnapshot(base);
  for (const k of ["value", "debt", "equity", "debtService", "netCashFlow", "capRate", "cashOnCash", "dscr"]) {
    assert.equal(none.metrics[k].available, false, k); assert.equal(none.metrics[k].value, null, k); assert.ok(none.metrics[k].reason, k);
  }
  assert.equal(none.metrics.noi.value, 1000000);
  assert.deepEqual(none.missing, ["current value", "loans (or confirm no debt)", "cash invested"]);

  const noDebt = propertySnapshot({ ...base, profile: { no_debt: true, cash_invested_cents: 5000000 } }).metrics;
  assert.equal(noDebt.debt.value, 0); assert.equal(noDebt.debtService.value, 0);
  assert.equal(noDebt.netCashFlow.value, 1000000);
  assert.equal(noDebt.cashOnCash.value, 0.2);
  assert.equal(noDebt.dscr.available, false); assert.match(noDebt.dscr.reason, /No debt service/);

  const noBooks = propertySnapshot({ ...base, property: prop("P2", "B", null) }).metrics;
  for (const k of ["rentCollected", "opex", "noi", "netCashFlow", "capRate"]) assert.equal(noBooks[k].available, false, k);
  assert.match(noBooks.noi.reason, /set of books/);

  const quiet = propertySnapshot({ ...base, ledger: [] }).metrics;
  assert.equal(quiet.rentCollected.value, 0); assert.match(quiet.rentCollected.note, /Nothing recorded/);
  assert.equal(quiet.noi.available, false);
});

test("ratios need a 12-month period and a full year of history inside it", () => {
  const full = { property: prop("P1", "A"), units: [], ledger: ledger(1200000, 0, 0), history: { first_entry_date: "2020-01-01" },
    profile: { current_value_cents: 10000000, value_as_of: "2026-01-01", value_source: "owner_estimate", no_debt: true, cash_invested_cents: 1000000 }, today: TODAY };
  const ytd = propertySnapshot({ ...full, period: snapshotRange("ytd", TODAY) }).metrics;
  assert.equal(ytd.capRate.available, false); assert.match(ytd.capRate.reason, /12-month/);
  assert.equal(ytd.noi.available, true);
  const bought = propertySnapshot({ ...full, period: TTM, profile: { ...full.profile, purchase_date: "2026-03-01" } }).metrics;
  assert.match(bought.capRate.reason, /Owned only since 2026-03-01/);
  const young = propertySnapshot({ ...full, period: TTM, history: { first_entry_date: "2026-05-01" } }).metrics;
  assert.match(young.cashOnCash.reason, /Ledger history starts 2026-05-01/);
  assert.equal(propertySnapshot({ ...full, period: TTM }).metrics.capRate.value, 0.12);
});

test("portfolio: totals cover only available properties, ratios come from the subset's totals", () => {
  const mk = (id, name, noi, value, profile = {}) => propertySnapshot({
    property: prop(id, name), units: [{ rent_amount: 1000, occupied: true }], ledger: ledger(noi, 0, 0), history: { first_entry_date: "2020-01-01" },
    profile: value ? { current_value_cents: value, value_as_of: "2026-01-01", value_source: "owner_estimate", no_debt: true, ...profile } : null, period: TTM, today: TODAY,
  });
  const p = portfolioSnapshot([mk("1", "A", 1000000, 10000000), mk("2", "B", 3000000, 20000000), mk("3", "C", 500000, null)]).metrics;
  assert.equal(p.noi.value, 4500000); assert.equal(p.noi.coverage.have, 3);
  assert.equal(p.value.value, 30000000); assert.deepEqual(p.value.coverage.missing, ["C"]);
  assert.match(p.value.note, /2 of 3 properties; excludes C/);
  assert.equal(p.capRate.value, 4000000 / 30000000);                     // not the average of 10% and 15%
  assert.equal(p.occupancy.value, 1);
  assert.equal(p.dscr.available, false);
  assert.equal(portfolioSnapshot([]).metrics.noi.available, false);
});

test("formatting and form parsing", () => {
  assert.equal(fmtMoney(123456789), "$1,234,568"); assert.equal(fmtMoney(-50000), "($500)"); assert.equal(fmtMoney(null), "—");
  assert.equal(fmtPctValue(0.0725), "7.3%"); assert.equal(fmtRatio(1.25), "1.25×");
  assert.deepEqual(dollarsToCents("$250,000.5"), { cents: 25000050 });
  assert.deepEqual(dollarsToCents(""), { cents: null });
  assert.deepEqual(dollarsToCents("12.345"), { error: true });
});
