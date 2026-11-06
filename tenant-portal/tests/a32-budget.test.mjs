import { test } from "node:test";
import assert from "node:assert/strict";
import {
  budgetPeriod, propertyBudgetReport, portfolioBudgetReport, monthlyTrend, distributeAnnual, gridToLines, linesToGrid,
  toCents, fmtVariance, fmtVarPct, BUDGET_ACCOUNTS,
} from "../src/lib/budget.js";

const TODAY = "2026-11-06";
const P = (id, name, books = "B1") => ({ id, name, accounting_entity_id: books });
const BUD = (books = "B1") => ({ id: "BUD", property_id: "P1", accounting_entity_id: books, year: 2026 });
const yearLines = (code, monthly) => Array.from({ length: 12 }, (_, i) => ({ account_code: code, month: i + 1, amount_cents: monthly }));
const act = (code, type, month, cents) => ({ account_code: code, account_type: type, month: `2026-${String(month).padStart(2, "0")}-01`, amount_cents: cents });
const rep = (over = {}) => propertyBudgetReport({ property: P("P1", "Maple"), budget: BUD(), period: budgetPeriod({ year: 2026, view: "ytd" }, TODAY), ...over });

test("periods: month, year to date, full year; future periods have no actuals", () => {
  const ytd = budgetPeriod({ year: 2026, view: "ytd" }, TODAY);
  assert.deepEqual(ytd.months, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(ytd.status, "in_progress");
  const full = budgetPeriod({ year: 2026, view: "year" }, TODAY);
  assert.equal(full.months.length, 12); assert.equal(full.actualMonths.length, 11); assert.equal(full.status, "partial");
  assert.equal(budgetPeriod({ year: 2025, view: "year" }, TODAY).status, "complete");
  assert.deepEqual(budgetPeriod({ year: 2025, view: "ytd" }, TODAY).months.length, 12);
  assert.equal(budgetPeriod({ year: 2026, view: "month", month: 12 }, TODAY).status, "not_started");
  assert.equal(budgetPeriod({ year: 2027, view: "ytd" }, TODAY).status, "not_started");
  assert.equal(budgetPeriod({ year: 2026, view: "month", month: 3 }, TODAY).label, "Mar 2026");
});

test("variance signs: income over budget is favorable, expenses over budget unfavorable, NOI follows", () => {
  const r = rep({
    lines: [...yearLines("4000", 100000), ...yearLines("5000", 20000)],
    actuals: [...Array.from({ length: 11 }, (_, i) => act("4000", "income", i + 1, 110000)), act("5000", "expense", 3, 300000)],
  });
  // Year to date on Nov 6: Jan–Oct in full, plus 6/30 of November's budget (budget to date).
  const inc = r.categories.find((c) => c.code === "4000"), rep5000 = r.categories.find((c) => c.code === "5000");
  assert.equal(inc.budgetCents, 1020000); assert.equal(inc.budgetFullCents, 1100000); assert.equal(inc.actualCents, 1210000);
  assert.equal(inc.variance, 190000); assert.equal(inc.favorable, true); assert.equal(inc.variancePct, 190000 / 1020000);
  assert.equal(rep5000.budgetCents, 204000); assert.equal(rep5000.actualCents, 300000);
  assert.equal(rep5000.variance, 96000); assert.equal(rep5000.favorable, false);
  assert.deepEqual(r.totals.income, { budget: 1020000, actual: 1210000, variance: 190000, variancePct: 190000 / 1020000, favorable: true, budgetFull: 1100000, toDate: true });
  assert.equal(r.totals.expense.variance, 96000); assert.equal(r.totals.expense.favorable, false);
  assert.equal(r.totals.noi.budget, 816000); assert.equal(r.totals.noi.actual, 910000);
  assert.equal(r.totals.noi.variance, 94000); assert.equal(r.totals.noi.favorable, true);
  assert.equal(r.drivers[0].code, "4000");                                // largest NOI impact first
});

test("zero budgets are real budgets; missing categories are 'not budgeted'; no % against zero", () => {
  const r = rep({ lines: [...yearLines("4000", 100000), ...yearLines("5850", 0)], actuals: [act("5850", "expense", 2, 5000), act("5100", "expense", 2, 7000)] });
  const adv = r.categories.find((c) => c.code === "5850"), util = r.categories.find((c) => c.code === "5100");
  assert.equal(adv.status, "budgeted"); assert.equal(adv.budgetCents, 0); assert.equal(adv.variance, 5000); assert.equal(adv.variancePct, null);
  assert.equal(util.status, "none"); assert.equal(util.budgetCents, null); assert.equal(util.variance, null);
  assert.deepEqual(r.unbudgeted.map((c) => c.code), ["5100"]);
  assert.ok(r.notBudgeted.some((c) => c.code === "5000") && !r.notBudgeted.some((c) => c.code === "5850"));
  assert.equal(r.totals.expense.actual, 12000);                            // unbudgeted spend still counts as actual
  assert.equal(r.totals.expense.budget, 0);
  assert.equal(r.totals.expense.variancePct, null);
});

test("partial-year budgets and periods: only months in the period count; partly budgeted categories are flagged", () => {
  const lines = [...yearLines("4000", 100000).slice(6)];                  // budgeted Jul–Dec only (bought mid-year)
  const jun = rep({ period: budgetPeriod({ year: 2026, view: "month", month: 6 }, TODAY), lines, actuals: [act("4000", "income", 6, 90000)] });
  assert.equal(jun.categories.find((c) => c.code === "4000").status, "none_in_period");
  assert.deepEqual(jun.unbudgeted.map((c) => c.code), ["4000"]);
  const ytd = rep({ lines, actuals: [] });
  const c = ytd.categories.find((x) => x.code === "4000");
  assert.equal(c.status, "partial"); assert.equal(c.missingMonths, 6); assert.equal(c.budgetCents, 420000);   // Jul–Oct + 6/30 of Nov
  assert.equal(c.actualCents, 0);                                          // books + started period: a real $0
  const dec = rep({ period: budgetPeriod({ year: 2026, view: "month", month: 12 }, TODAY), lines });
  assert.equal(dec.actualsAvailable, false); assert.equal(dec.totals.noi.actual, null); assert.equal(dec.reason, "This period hasn't started");
});

test("a full year in progress compares budget to date, and reports the full-year budget separately", () => {
  const r = rep({ period: budgetPeriod({ year: 2026, view: "year" }, TODAY), lines: [...yearLines("4000", 100000), ...yearLines("5000", 10000)],
    actuals: Array.from({ length: 11 }, (_, i) => act("4000", "income", i + 1, 100000)) });
  assert.equal(r.totals.income.budget, 1020000);               // Jan–Oct + 6/30 of Nov, matching actuals to date
  assert.equal(r.totals.income.budgetFull, 1200000);
  assert.equal(r.totals.income.variance, 80000); assert.equal(r.totals.income.toDate, true);
  assert.equal(r.categories.find((c) => c.code === "4000").status, "budgeted");
  const done = rep({ period: budgetPeriod({ year: 2025, view: "year" }, TODAY), budget: { ...BUD(), year: 2025 }, lines: yearLines("4000", 100000), actuals: [] });
  assert.equal(done.totals.income.budget, 1200000); assert.equal(done.totals.income.toDate, false);
});

test("no books, no budget: never compared, never shown as $0", () => {
  const nb = rep({ property: P("P2", "Birch", null), lines: yearLines("4000", 1) });
  assert.equal(nb.comparable, false); assert.equal(nb.reason, "Not assigned to a set of books");
  assert.equal(nb.totals.income.actual, null); assert.ok(nb.categories.every((c) => c.actualCents === null));
  const none = rep({ budget: null, actuals: [act("4000", "income", 1, 100000)] });
  assert.equal(none.comparable, false); assert.equal(none.reason, "No 2026 budget");
  assert.equal(none.totals.income.actual, 100000); assert.equal(none.totals.income.variance, null);
  assert.equal(rep({ budget: BUD("OTHER"), lines: yearLines("4000", 1) }).booksMismatch, true);
});

test("reversals net out: a receipt and its reversal in the same period count once, as zero", () => {
  const r = rep({ lines: yearLines("4000", 100000), actuals: [act("4000", "income", 3, 100000), act("4000", "income", 4, -100000)] });
  assert.equal(r.categories.find((c) => c.code === "4000").actualCents, 0);
  const mar = rep({ period: budgetPeriod({ year: 2026, view: "month", month: 3 }, TODAY), lines: yearLines("4000", 100000), actuals: [act("4000", "income", 3, 100000), act("4000", "income", 4, -100000)] });
  assert.equal(mar.totals.income.actual, 100000);                          // the reversal belongs to April, its own date
});

test("portfolio: only comparable properties, multiple books, totals from sums, coverage explained", () => {
  const per = budgetPeriod({ year: 2026, view: "ytd" }, TODAY);
  const a = propertyBudgetReport({ property: P("A", "Maple", "B1"), budget: { ...BUD("B1"), property_id: "A" }, lines: [...yearLines("4000", 100000), ...yearLines("5000", 10000)], actuals: [act("4000", "income", 1, 1100000), act("5000", "expense", 1, 50000)], period: per });
  const b = propertyBudgetReport({ property: P("B", "Oak", "B2"), budget: { ...BUD("B2"), property_id: "B" }, lines: yearLines("4000", 50000), actuals: [act("4000", "income", 1, 500000), act("5100", "expense", 2, 20000)], period: per });
  const c = propertyBudgetReport({ property: P("C", "Birch", "B2"), budget: null, actuals: [act("4000", "income", 1, 999999)], period: per });
  const p = portfolioBudgetReport([a, b, c]);
  assert.equal(p.coverage.comparable, 2); assert.deepEqual(p.coverage.missing, [{ name: "Birch", reason: "No 2026 budget" }]);
  assert.equal(p.totals.income.budget, 1020000 + 510000); assert.equal(p.totals.income.actual, 1600000);   // to date; Birch excluded
  assert.equal(p.totals.income.budgetFull, 1100000 + 550000);
  assert.equal(p.totals.income.variance, 70000); assert.equal(p.totals.income.favorable, true);
  assert.equal(p.totals.expense.budget, 102000); assert.equal(p.totals.expense.actual, 70000); assert.equal(p.totals.expense.favorable, true);
  assert.equal(p.totals.noi.variance, (1600000 - 70000) - (1530000 - 102000));
  const util = p.categories.find((x) => x.code === "5100");
  assert.equal(util.status, "none"); assert.equal(util.variance, null); assert.equal(util.unbudgetedProps, 1);
  assert.equal(portfolioBudgetReport([c]).totals.noi.variance, null);
});

test("monthly trend: budget every month, actuals only for months that have started", () => {
  const t = monthlyTrend({ year: 2026, today: TODAY, items: [{ lines: [...yearLines("4000", 100000), ...yearLines("5000", 30000)], actuals: [act("4000", "income", 2, 90000), act("5000", "expense", 2, 10000)] }] });
  assert.equal(t.length, 12);
  assert.deepEqual(t[1], { month: 2, budget: 70000, budgetToDate: 70000, actual: 80000, partial: false });
  assert.equal(t[0].actual, 0); assert.equal(t[11].actual, null); assert.equal(t[10].partial, true);
  assert.equal(t[10].budget, 70000); assert.equal(t[10].budgetToDate, 14000);   // November: 6 of 30 days
});

test("budget to date: the current month is prorated by days elapsed; completed months and the last day are whole", () => {
  const month = (m, today) => propertyBudgetReport({ property: P("P1", "Maple"), budget: BUD(), lines: [...yearLines("4000", 300000), ...yearLines("5850", 0), ...yearLines("5000", 100)],
    actuals: [act("4000", "income", 11, 50000), act("5100", "expense", 11, 999)], period: budgetPeriod({ year: 2026, view: "month", month: m }, today) });
  const nov6 = month(11, TODAY);
  assert.deepEqual(budgetPeriod({ year: 2026, view: "month", month: 11 }, TODAY).prorate, { month: 11, day: 6, days: 30 });
  assert.equal(nov6.totals.income.budget, 60000); assert.equal(nov6.totals.income.budgetFull, 300000); assert.equal(nov6.totals.income.toDate, true);
  assert.equal(nov6.totals.income.variance, -10000); assert.equal(nov6.totals.income.variancePct, -10000 / 60000); assert.equal(nov6.totals.income.favorable, false);
  const c = (r, code) => r.categories.find((x) => x.code === code);
  assert.equal(c(nov6, "5850").budgetCents, 0); assert.equal(c(nov6, "5850").status, "budgeted");          // a $0 budget stays $0
  assert.equal(c(nov6, "5100").budgetCents, null); assert.equal(c(nov6, "5100").variance, null);          // unbudgeted stays unbudgeted
  assert.equal(c(nov6, "5000").budgetCents, 20);                                                          // 100 × 6/30, whole cents
  const nov30 = month(11, "2026-11-30");
  assert.equal(budgetPeriod({ year: 2026, view: "month", month: 11 }, "2026-11-30").prorate, null);
  assert.equal(nov30.totals.income.budget, 300000); assert.equal(nov30.totals.income.toDate, false);       // last day = full month
  const oct = month(10, TODAY);
  assert.equal(oct.totals.income.budget, 300000); assert.equal(oct.totals.income.toDate, false);           // completed month
  const dec1 = budgetPeriod({ year: 2026, view: "ytd" }, "2026-12-01");                                   // month boundary
  assert.deepEqual(dec1.prorate, { month: 12, day: 1, days: 31 });
  const r = propertyBudgetReport({ property: P("P1", "Maple"), budget: BUD(), lines: yearLines("4000", 310000), actuals: [], period: dec1 });
  assert.equal(r.totals.income.budget, 11 * 310000 + 10000);                                             // Nov now whole, Dec 1/31
  assert.deepEqual(budgetPeriod({ year: 2028, view: "month", month: 2 }, "2028-02-15").prorate, { month: 2, day: 15, days: 29 });   // leap year
  assert.equal(budgetPeriod({ year: 2025, view: "year" }, TODAY).prorate, null);                         // a past year: nothing prorated
  const partialYear = propertyBudgetReport({ property: P("P1", "Maple"), budget: BUD(), lines: yearLines("4000", 300000).slice(10), actuals: [], period: budgetPeriod({ year: 2026, view: "ytd" }, TODAY) });
  assert.equal(c(partialYear, "4000").budgetCents, 60000); assert.equal(c(partialYear, "4000").status, "partial");   // budgeted from Nov only
});

test("editor: annual distribution adds back exactly; rows are all-or-nothing; round trip", () => {
  const d = distributeAnnual(100000);                                      // $1,000.00 → 12 months
  assert.equal(d.reduce((s, x) => s + x, 0), 100000); assert.equal(d[0], 8334); assert.equal(d[11], 8333);
  assert.deepEqual(distributeAnnual(0), Array(12).fill(0));
  const grid = { "4000": Array(12).fill("1,250.50"), "5850": Array(12).fill("0"), "5000": Array(12).fill("") };
  const { lines } = gridToLines(grid);
  assert.equal(lines.length, 24); assert.equal(lines[0].amount_cents, 125050); assert.equal(lines.find((l) => l.account_code === "5850").amount_cents, 0);
  assert.match(gridToLines({ "4000": ["1", ...Array(11).fill("")] }).error, /fill all 12 months/);
  assert.match(gridToLines({ "4000": ["abc", ...Array(11).fill("1")] }).error, /Rental Income, Jan/);
  const back = linesToGrid(lines);
  assert.equal(back["4000"][5], "1250.50"); assert.equal(back["5850"][0], "0"); assert.equal(back["5000"][0], "");
  assert.equal(Object.keys(back).length, BUDGET_ACCOUNTS.length);
  assert.equal(toCents("-5"), null);
});

test("formatting", () => {
  assert.equal(fmtVariance(123456), "+$1,235"); assert.equal(fmtVariance(-50000), "−$500"); assert.equal(fmtVariance(null), "—");
  assert.equal(fmtVarPct(0.0725), "+7.3%"); assert.equal(fmtVarPct(-0.1), "−10.0%"); assert.equal(fmtVarPct(null), "");
});
