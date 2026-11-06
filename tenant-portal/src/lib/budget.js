// ─── A3.2 Actual vs. Budget: one set of definitions for the report and the editor ───────────────
// Pure functions (shared by the UI and node tests). Money is integer cents.
//
// Signs (variance = actual − budget, everywhere):
//   income   positive variance = favorable (collected more than planned)
//   expense  positive variance = unfavorable (spent more than planned)
//   NOI      positive variance = favorable
// A budget line of 0 is an intentional zero budget; a missing line is "not budgeted". Actuals come only from the
// ledger (a32_monthly_actuals) and are shown only where the property has books and the period has started.

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const VIEWS = [
  { value: "month", label: "Month" },
  { value: "ytd",   label: "Year to date" },
  { value: "year",  label: "Full year" },
];

// The standard operating accounts (A1 chart). Budget lines key on these codes in every set of books.
export const BUDGET_ACCOUNTS = [
  { code: "4000", name: "Rental Income",           type: "income" },
  { code: "4100", name: "Late Fee Income",         type: "income" },
  { code: "4200", name: "Other Tenant Income",     type: "income" },
  { code: "5000", name: "Repairs & Maintenance",   type: "expense" },
  { code: "5100", name: "Utilities",               type: "expense" },
  { code: "5200", name: "Insurance",               type: "expense" },
  { code: "5300", name: "Property Taxes",          type: "expense" },
  { code: "5400", name: "Management Fees",         type: "expense" },
  { code: "5500", name: "Cleaning",                type: "expense" },
  { code: "5600", name: "Landscaping",             type: "expense" },
  { code: "5700", name: "Supplies",                type: "expense" },
  { code: "5800", name: "Legal & Professional",    type: "expense" },
  { code: "5850", name: "Advertising",             type: "expense" },
  { code: "5900", name: "HOA Dues",                type: "expense" },
  { code: "5990", name: "Other Expenses",          type: "expense" },
  { code: "6100", name: "Payment Processing Fees", type: "expense" },
];
const ACCOUNT = Object.fromEntries(BUDGET_ACCOUNTS.map((a) => [a.code, a]));

// ─── Periods ────────────────────────────────────────────────────────────────
// { months: [1..12 in scope], actualMonths: months whose actuals exist (started), status, label }
export function budgetPeriod({ year, view, month }, today) {
  const ty = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7));
  const started = (m) => year < ty || (year === ty && m <= tm);
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  let months;
  if (view === "month") months = [month];
  else if (view === "ytd") months = year < ty ? all : year === ty ? all.filter((m) => m <= tm) : [];
  else months = all;
  const actualMonths = months.filter(started);
  const inProgress = year === ty && months.includes(tm);
  const status = !months.length || !actualMonths.length ? "not_started" : actualMonths.length < months.length ? "partial" : inProgress ? "in_progress" : "complete";
  const label = view === "month" ? `${MONTHS[month - 1]} ${year}` : view === "ytd" ? `Year to date ${year}${months.length ? ` · Jan–${MONTHS[months[months.length - 1] - 1]}` : ""}` : `Full year ${year}`;
  // The current month, when it's in the period, is compared on its budget to date: days elapsed (today included) ÷ days
  // in the month. On the month's last day that is the full month; completed months always use their full budget.
  const td = Number(today.slice(8, 10)), dim = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  const prorate = year === ty && actualMonths.includes(tm) && td < dim ? { month: tm, day: td, days: dim } : null;
  return { year, view, months, actualMonths, status, label, currentMonth: year === ty ? tm : null, prorate };
}

// A monthly budget amount as it applies to the comparison: prorated for the current month, whole otherwise.
export const budgetToDate = (cents, month, prorate) =>
  prorate && Number(month) === prorate.month ? Math.round((Number(cents) * prorate.day) / prorate.days) : Number(cents);

// ─── One property ───────────────────────────────────────────────────────────
// input: { property, budget (header|null), lines (this budget's lines), actuals (this property's a32_monthly_actuals rows
//          for the year), period (budgetPeriod) }
export function propertyBudgetReport({ property, budget = null, lines = [], actuals = [], period }) {
  const hasBooks = !!property.accounting_entity_id;
  const hasBudget = !!budget && lines.length > 0;
  const booksMismatch = !!budget && hasBooks && budget.accounting_entity_id !== property.accounting_entity_id;
  const actualsAvailable = hasBooks && period.actualMonths.length > 0;
  // A full year still in progress is compared on budget to date (the elapsed months), never 12 months of budget
  // against fewer months of actuals. The full-year budget is reported separately (budgetFull).
  const compareMonths = period.status === "partial" ? period.actualMonths : period.months;
  const inMonths = new Set(compareMonths), actualIn = new Set(period.actualMonths), allMonths = new Set(period.months);
  const monthOf = (r) => Number(String(r.month).slice(5, 7));

  const codes = new Set([...BUDGET_ACCOUNTS.map((a) => a.code), ...actuals.map((r) => r.account_code)]);
  const categories = [...codes].sort().map((code) => {
    const meta = ACCOUNT[code] || { code, name: actuals.find((r) => r.account_code === code)?.account_name || code, type: actuals.find((r) => r.account_code === code)?.account_type };
    const mine = lines.filter((l) => l.account_code === code);
    const inPeriod = mine.filter((l) => inMonths.has(Number(l.month)));
    const status = !mine.length ? "none" : inPeriod.length === compareMonths.length ? "budgeted" : inPeriod.length ? "partial" : "none_in_period";
    // The comparison figure: budget to date (current month prorated). budgetFullCents is the whole period's budget.
    const budgetCents = inPeriod.length ? inPeriod.reduce((s, l) => s + budgetToDate(l.amount_cents, l.month, period.prorate), 0) : null;
    const fullLines = mine.filter((l) => allMonths.has(Number(l.month)));
    const budgetFullCents = fullLines.length ? fullLines.reduce((s, l) => s + Number(l.amount_cents), 0) : null;
    const actualCents = actualsAvailable ? actuals.filter((r) => r.account_code === code && actualIn.has(monthOf(r))).reduce((s, r) => s + Number(r.amount_cents), 0) : null;
    const variance = actualCents != null && budgetCents != null ? actualCents - budgetCents : null;
    return {
      code, name: meta.name, type: meta.type, status, budgetCents, budgetFullCents, actualCents, variance,
      variancePct: pct(variance, budgetCents),
      favorable: variance == null || variance === 0 ? null : meta.type === "income" ? variance > 0 : variance < 0,
      missingMonths: compareMonths.length - inPeriod.length,
    };
  }).filter((c) => c.type === "income" || c.type === "expense");

  const sum = (type, key) => categories.filter((c) => c.type === type && c[key] != null).reduce((s, c) => s + c[key], 0);
  const budgetIncome = sum("income", "budgetCents"), budgetExpense = sum("expense", "budgetCents");
  const actualIncome = actualsAvailable ? sum("income", "actualCents") : null, actualExpense = actualsAvailable ? sum("expense", "actualCents") : null;
  const comparable = hasBudget && actualsAvailable;
  const fullIncome = sum("income", "budgetFullCents"), fullExpense = sum("expense", "budgetFullCents");
  // "Budget to date" whenever the comparison budget is less than the period's whole budget: a year in progress, or a
  // period that includes the current month before its last day.
  const toDate = period.status === "partial" || !!period.prorate;
  const totals = {
    income:  { ...line("income",  budgetIncome, actualIncome, comparable), budgetFull: fullIncome, toDate },
    expense: { ...line("expense", budgetExpense, actualExpense, comparable), budgetFull: fullExpense, toDate },
    noi:     { ...line("noi", budgetIncome - budgetExpense, actualsAvailable ? actualIncome - actualExpense : null, comparable), budgetFull: fullIncome - fullExpense, toDate },
  };
  const unbudgeted = categories.filter((c) => (c.status === "none" || c.status === "none_in_period") && c.actualCents);
  const notBudgeted = hasBudget ? categories.filter((c) => c.status === "none" && ACCOUNT[c.code]) : [];
  const drivers = comparable ? categories.filter((c) => c.actualCents != null && (c.variance ?? c.actualCents) !== 0)
    .map((c) => ({ ...c, impact: c.type === "income" ? (c.variance ?? c.actualCents) : -(c.variance ?? c.actualCents) }))
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 3) : [];

  const reason = !hasBooks ? "Not assigned to a set of books" : !hasBudget ? `No ${period.year} budget` : !actualsAvailable ? "This period hasn't started" : null;
  return { property, budget, hasBooks, hasBudget, booksMismatch, actualsAvailable, comparable, reason, categories, totals, unbudgeted, notBudgeted, drivers };
}

function pct(variance, budget) {
  if (variance == null || budget == null || budget === 0) return null;   // no % against a zero or missing budget
  return variance / Math.abs(budget);
}
function line(kind, budget, actual, comparable) {
  const variance = comparable && actual != null ? actual - budget : null;
  return { budget, actual, variance, variancePct: pct(variance, budget),
    favorable: variance == null || variance === 0 ? null : kind === "expense" ? variance < 0 : variance > 0 };
}

// ─── Portfolio ──────────────────────────────────────────────────────────────
// Totals add only comparable properties (books + budget + started period): a property without a budget has nothing
// to be over or under. Coverage says how many that is; categories are summed over the same set.
export function portfolioBudgetReport(reports) {
  const comp = reports.filter((r) => r.comparable);
  const add = (pick) => comp.reduce((s, r) => s + (pick(r) ?? 0), 0);
  const tot = (k) => {
    const budget = add((r) => r.totals[k].budget), actual = add((r) => r.totals[k].actual);
    const variance = comp.length ? actual - budget : null;
    return { budget: comp.length ? budget : null, actual: comp.length ? actual : null, variance, variancePct: pct(variance, budget),
      favorable: variance == null || variance === 0 ? null : k === "expense" ? variance < 0 : variance > 0,
      budgetFull: comp.length ? add((r) => r.totals[k].budgetFull) : null, toDate: comp.some((r) => r.totals[k].toDate) };
  };
  const byCode = {};
  for (const r of comp) for (const c of r.categories) {
    const t = byCode[c.code] || (byCode[c.code] = { code: c.code, name: c.name, type: c.type, budgetCents: null, actualCents: 0, unbudgetedProps: 0 });
    if (c.budgetCents != null) t.budgetCents = (t.budgetCents ?? 0) + c.budgetCents;
    else if (c.actualCents) t.unbudgetedProps++;
    t.actualCents += c.actualCents ?? 0;
  }
  // Same rule as one property: a category with no budget has no variance of its own ("not budgeted"); its actuals still
  // count in the totals and can be a driver.
  const categories = Object.values(byCode).sort((a, b) => a.code.localeCompare(b.code)).map((c) => {
    const variance = c.budgetCents == null ? null : c.actualCents - c.budgetCents;
    return { ...c, status: c.budgetCents == null ? "none" : "budgeted", variance,
      variancePct: pct(variance, c.budgetCents), favorable: !variance ? null : c.type === "income" ? variance > 0 : variance < 0 };
  });
  const drivers = categories.map((c) => ({ ...c, delta: c.variance ?? c.actualCents })).filter((c) => c.delta)
    .map((c) => ({ ...c, impact: c.type === "income" ? c.delta : -c.delta }))
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 3);
  return {
    totals: { income: tot("income"), expense: tot("expense"), noi: tot("noi") },
    categories, drivers,
    coverage: { comparable: comp.length, of: reports.length, missing: reports.filter((r) => !r.comparable).map((r) => ({ name: r.property.name, reason: r.reason })) },
  };
}

// Budget vs actual NOI for each month of the year, over the given (comparable) properties. Actual is null for months
// that haven't started, so the chart never shows a future month as $0.
export function monthlyTrend({ year, today, items }) {
  const p = budgetPeriod({ year, view: "year" }, today);
  return p.months.map((m) => {
    let budget = 0, budgetDate = 0, actual = 0;
    for (const { lines, actuals } of items) {
      for (const l of lines) if (Number(l.month) === m) {
        const sign = ACCOUNT[l.account_code]?.type === "expense" ? -1 : 1;
        budget += sign * Number(l.amount_cents); budgetDate += sign * budgetToDate(l.amount_cents, m, p.prorate);
      }
      for (const a of actuals) if (Number(String(a.month).slice(5, 7)) === m) actual += (a.account_type === "expense" ? -1 : 1) * Number(a.amount_cents);
    }
    // budget = the whole month (the bar); budgetToDate = what month-to-date actuals are compared with (the tooltip).
    return { month: m, budget, budgetToDate: budgetDate, actual: p.actualMonths.includes(m) ? actual : null, partial: p.prorate?.month === m };
  });
}

// ─── Editor helpers ─────────────────────────────────────────────────────────
// An annual amount split into 12 whole-cent months that add back exactly (the remainder goes to the first months).
export function distributeAnnual(cents) {
  const base = Math.floor(cents / 12), rem = cents - base * 12;
  return Array.from({ length: 12 }, (_, i) => base + (i < rem ? 1 : 0));
}

// Grid of dollar strings { code: ["", ... x12] } → save payload. A row is either all 12 months or empty: a partly filled
// row is an error (enter 0 for months with no budget). Returns { lines } or { error }.
export function gridToLines(grid) {
  const lines = [];
  for (const [code, cells] of Object.entries(grid)) {
    const filled = cells.map((c) => String(c ?? "").trim() !== "");
    if (!filled.some(Boolean)) continue;
    if (!filled.every(Boolean)) return { error: `${ACCOUNT[code]?.name || code}: fill all 12 months (enter 0 for none), or clear the row.` };
    for (let i = 0; i < 12; i++) {
      const cents = toCents(cells[i]);
      if (cents == null) return { error: `${ACCOUNT[code]?.name || code}, ${MONTHS[i]}: enter dollars with up to 2 decimals.` };
      lines.push({ account_code: code, month: i + 1, amount_cents: cents });
    }
  }
  return { lines };
}
export function linesToGrid(lines) {
  const grid = Object.fromEntries(BUDGET_ACCOUNTS.map((a) => [a.code, Array(12).fill("")]));
  for (const l of lines) if (grid[l.account_code]) grid[l.account_code][Number(l.month) - 1] = centsToStr(Number(l.amount_cents));
  return grid;
}
export function toCents(s) {
  const t = String(s ?? "").replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  return Number(w) * 100 + Number(f.padEnd(2, "0"));
}
export const centsToStr = (c) => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));
export const rowTotal = (cells) => cells.reduce((s, c) => s + (toCents(c) ?? 0), 0);

// ─── Formatting ─────────────────────────────────────────────────────────────
export function fmtUsd(cents) {
  if (cents == null) return "—";
  const s = `$${Math.round(Math.abs(cents) / 100).toLocaleString("en-US")}`;
  return cents < 0 ? `(${s})` : s;
}
export const fmtVariance = (cents) => (cents == null ? "—" : `${cents > 0 ? "+" : cents < 0 ? "−" : ""}$${Math.round(Math.abs(cents) / 100).toLocaleString("en-US")}`);
export const fmtVarPct = (x) => (x == null ? "" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${(Math.round(Math.abs(x) * 1000) / 10).toFixed(1)}%`);
