// ─── A3.1 Financial Snapshot: one set of definitions for property and portfolio views ─────────
// Pure functions (shared by the UI and node tests). Money is integer cents; dates are YYYY-MM-DD.
//
// Every metric is { value, kind, available, reason, note }:
//   kind      the weakest basis among its inputs: actual (the ledger) < scheduled (current rent roll)
//             < entered (typed in by the landlord) < estimate (an owner estimate, or calculated from entered terms)
//   available false whenever any required input is missing; value is then null and reason says what's missing.
// Nothing is annualised: flows cover the selected period, and the return ratios need a full 12-month period.

export const KINDS = ["actual", "scheduled", "entered", "estimate"];
export const KIND_LABEL = { actual: "Actual", scheduled: "Scheduled", entered: "Entered", estimate: "Estimate" };
export const KIND_HELP = {
  actual:    "From the ledger: money actually received or paid",
  scheduled: "From the current rent roll",
  entered:   "Entered by you",
  estimate:  "An estimate: an owner-entered value, or calculated from loan terms",
};
export const VALUE_SOURCES = [
  { value: "owner_estimate", label: "Owner estimate" },
  { value: "appraisal",      label: "Appraisal" },
  { value: "broker_opinion", label: "Broker opinion of value" },
  { value: "tax_assessment", label: "Tax assessment" },
  { value: "purchase_price", label: "Purchase price" },
];

const worst = (...ks) => ks.filter(Boolean).reduce((a, k) => (KINDS.indexOf(k) > KINDS.indexOf(a) ? k : a), "actual");
const ok = (value, kind, note) => ({ value, kind, available: true, reason: null, note: note || null });
const na = (reason, kind) => ({ value: null, kind: kind || null, available: false, reason, note: null });

// ─── Dates ──────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const parts = (d) => d.split("-").map(Number);
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();   // m 1-based
export function addMonths(d, n) {
  const [y, m, day] = parts(d);
  const t = y * 12 + (m - 1) + n, ny = Math.floor(t / 12), nm = (t % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(day, lastDay(ny, nm)))}`;
}
export function addDays(d, n) {
  const [y, m, day] = parts(d);
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
}
// True when [from, to] is exactly twelve months (e.g. 2025-11-06..2026-11-05, or a calendar year).
export const isTwelveMonths = (from, to) => addDays(addMonths(from, 12), -1) === to;

export const SNAPSHOT_PERIODS = [
  { value: "ttm",       label: "Trailing 12 months" },
  { value: "ytd",       label: "Year to date" },
  { value: "last_year", label: "Last calendar year" },
];
export function snapshotRange(preset, today) {
  const [y] = parts(today);
  if (preset === "ytd") return { from: `${y}-01-01`, to: today };
  if (preset === "last_year") return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  return { from: addDays(addMonths(today, -12), 1), to: today };
}

// ─── Loans ──────────────────────────────────────────────────────────────────
const monthlyRate = (loan) => Number(loan.annual_rate_pct || 0) / 100 / 12;

// Principal and interest per month: as entered, or calculated from the terms.
export function loanPayment(loan) {
  if (loan.monthly_payment_cents != null) return { cents: Number(loan.monthly_payment_cents), kind: "entered" };
  const P = Number(loan.original_amount_cents), r = monthlyRate(loan);
  if (loan.interest_only) return { cents: Math.round(P * r), kind: "estimate" };
  const n = Number(loan.amortization_months);
  if (!n) return { cents: null, kind: "estimate" };
  return { cents: Math.round(r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n))), kind: "estimate" };
}

// Due dates of the scheduled payments, in order (stops at the amortization term and at payoff).
function dueDates(loan, through) {
  const out = [], max = loan.interest_only ? 1200 : Number(loan.amortization_months || 0);
  for (let k = 0; k < max; k++) {
    const d = addMonths(loan.first_payment_date, k);
    if (d > through) break;
    if (loan.paid_off_on && d > loan.paid_off_on) break;
    out.push(d);
  }
  return out;
}
export const paymentsDueBetween = (loan, from, to) => dueDates(loan, to).filter((d) => d >= from).length;

// Balance owed on a date: an entered balance rolled forward by later payments, or the original amount
// amortised by every payment due so far. Entered and untouched = "entered"; anything calculated = "estimate".
export function loanBalance(loan, asOf) {
  if (loan.paid_off_on && loan.paid_off_on <= asOf) return { cents: 0, kind: "entered" };
  const pay = loanPayment(loan).cents, r = monthlyRate(loan);
  const useEntered = loan.current_balance_cents != null && loan.balance_as_of && loan.balance_as_of <= asOf;
  let bal = useEntered ? Number(loan.current_balance_cents) : Number(loan.original_amount_cents);
  const start = useEntered ? loan.balance_as_of : null;
  let rolled = 0;
  for (const d of dueDates(loan, asOf)) {
    if (start && d <= start) continue;
    if (loan.interest_only) { rolled++; continue; }
    bal = Math.max(0, Math.round(bal + bal * r - pay));
    rolled++;
  }
  return { cents: bal, kind: useEntered && rolled === 0 ? "entered" : "estimate" };
}

// ─── Property snapshot ──────────────────────────────────────────────────────
// input: { property, units: [{ rent_amount, occupied }], profile, loans, ledger: [a31_property_ledger rows],
//          history: { first_entry_date } | null, period: { from, to }, today }
export function propertySnapshot({ property, units = [], profile = null, loans = [], ledger = [], history = null, period, today }) {
  const m = {};
  const hasBooks = !!property.accounting_entity_id;
  const twelve = isTwelveMonths(period.from, period.to);
  const entries = ledger.reduce((s, r) => s + Number(r.entries || 0), 0);
  const sum = (f) => ledger.filter(f).reduce((s, r) => s + Number(r.amount_cents), 0);
  const rent = sum((r) => r.account_type === "income" && r.account_code === "4000");
  const other = sum((r) => r.account_type === "income" && r.account_code !== "4000");
  const opex = sum((r) => r.account_type === "expense");
  const missing = [];

  // Scheduled
  const rentRoll = units.reduce((s, u) => s + Math.round(Number(u.rent_amount || 0) * 100), 0);
  m.gsr = units.length && rentRoll > 0
    ? ok(rentRoll * 12, "scheduled", `${units.length} unit${units.length === 1 ? "" : "s"} × current rent × 12, vacant units included`)
    : na("No units with a rent amount", "scheduled");
  m.occupancy = units.length ? ok(units.filter((u) => u.occupied).length / units.length, "scheduled", `${units.filter((u) => u.occupied).length} of ${units.length} units occupied`) : na("No units");

  // Actual (the ledger)
  if (!hasBooks) {
    const why = "Not assigned to a set of books, so no income or expenses are recorded for it";
    m.rentCollected = na(why, "actual"); m.otherIncome = na(why, "actual"); m.opex = na(why, "actual"); m.noi = na(why, "actual");
    missing.push("set of books");
  } else {
    const quiet = entries === 0 ? "Nothing recorded in this period" : null;
    m.rentCollected = ok(rent, "actual", quiet);
    m.otherIncome = ok(other, "actual", quiet);
    m.opex = ok(opex, "actual", quiet);
    m.noi = entries === 0 ? na("No income or expenses recorded in this period", "actual") : ok(rent + other - opex, "actual");
  }

  // Point-in-time: value, debt, equity (as of today)
  const value = profile?.current_value_cents != null ? Number(profile.current_value_cents) : null;
  if (value != null) {
    const stale = profile.value_as_of && profile.value_as_of < addMonths(today, -12);
    const src = VALUE_SOURCES.find((s) => s.value === profile.value_source)?.label || "Owner-entered";
    m.value = ok(value, "estimate", `${src}, as of ${profile.value_as_of}${stale ? " (over a year old)" : ""}`);
  } else { m.value = na("Enter the current value", "estimate"); missing.push("current value"); }

  const active = loans.filter((l) => !(l.paid_off_on && l.paid_off_on <= today));
  const debtKnown = loans.length > 0 || !!profile?.no_debt;
  if (!debtKnown) {
    const why = "Add the loans on this property, or confirm it has none";
    m.debt = na(why, "estimate"); m.debtService = na(why, "estimate");
    missing.push("loans (or confirm no debt)");
  } else {
    const bals = active.map((l) => loanBalance(l, today));
    m.debt = ok(bals.reduce((s, b) => s + b.cents, 0), bals.length ? worst(...bals.map((b) => b.kind)) : "entered",
      bals.length ? `${bals.length} loan${bals.length === 1 ? "" : "s"}` : "No debt");
    const pays = loans.map((l) => ({ p: loanPayment(l), n: paymentsDueBetween(l, period.from, period.to) }));
    if (pays.some((x) => x.n > 0 && x.p.cents == null)) m.debtService = na("A loan's payment can't be calculated from its terms", "estimate");
    else m.debtService = ok(pays.reduce((s, x) => s + (x.p.cents || 0) * x.n, 0), pays.length ? worst(...pays.map((x) => x.p.kind)) : "entered",
      `Principal and interest due in this period`);
  }
  m.equity = m.value.available && m.debt.available
    ? ok(m.value.value - m.debt.value, worst(m.value.kind, m.debt.kind), "Current value less outstanding debt")
    : na(!m.value.available ? m.value.reason : m.debt.reason, "estimate");

  // Flows after debt
  m.netCashFlow = m.noi.available && m.debtService.available
    ? ok(m.noi.value - m.debtService.value, worst("actual", m.debtService.kind), "NOI less debt service")
    : na(!m.noi.available ? m.noi.reason : m.debtService.reason);

  // Return ratios: a full 12-month period, and a full year of ownership and ledger history inside it.
  let ratioBlock = null;
  if (!twelve) ratioBlock = "Return ratios need a 12-month period. Choose Trailing 12 months or Last calendar year.";
  else if (profile?.purchase_date && profile.purchase_date > period.from) ratioBlock = `Owned only since ${profile.purchase_date}, part of this period`;
  else if (hasBooks && history?.first_entry_date && history.first_entry_date > addDays(period.from, 31)) ratioBlock = `Ledger history starts ${history.first_entry_date}, part of this period`;
  const ratio = (num, den, kind, needs) => {
    if (ratioBlock) return na(ratioBlock, kind);
    for (const [cond, why] of needs) if (!cond) return na(why, kind);
    return ok(num() / den(), kind);
  };
  const cash = profile?.cash_invested_cents != null ? Number(profile.cash_invested_cents) : null;
  if (cash == null) missing.push("cash invested");
  m.capRate = ratio(() => m.noi.value, () => m.value.value, "estimate",
    [[m.noi.available, m.noi.reason], [m.value.available, m.value.reason]]);
  m.cashOnCash = ratio(() => m.netCashFlow.value, () => cash, worst("entered", m.debtService.kind),
    [[m.netCashFlow.available, m.netCashFlow.reason], [cash != null, "Enter the cash you've invested"]]);
  m.dscr = ratio(() => m.noi.value, () => m.debtService.value, worst("actual", m.debtService.kind),
    [[m.noi.available, m.noi.reason], [m.debtService.available, m.debtService.reason], [m.debtService.value > 0, "No debt service in this period"]]);

  return { property, metrics: m, missing, entries, ratioBlock, unitCount: units.length, occupiedCount: units.filter((u) => u.occupied).length,
    inputs: { cash, value, debtService: m.debtService.value, noi: m.noi.value } };
}

// ─── Portfolio ──────────────────────────────────────────────────────────────
// Totals add only the properties where the metric is available; coverage says how many that is.
// Ratios are recomputed from the same subset's totals (never an average of ratios).
const SUMS = ["gsr", "rentCollected", "otherIncome", "opex", "noi", "debtService", "netCashFlow", "value", "debt", "equity"];
export function portfolioSnapshot(snaps) {
  const n = snaps.length, out = { metrics: {}, count: n };
  const total = (key, pick = (s) => s.metrics[key]) => {
    const have = snaps.filter((s) => pick(s).available);
    if (!have.length) return na(n ? `Not available for any property${snaps[0] ? `: ${pick(snaps[0]).reason}` : ""}` : "No properties");
    const missingNames = snaps.filter((s) => !pick(s).available).map((s) => s.property.name);
    return { ...ok(have.reduce((t, s) => t + pick(s).value, 0), worst(...have.map((s) => pick(s).kind))),
      coverage: { have: have.length, of: n, missing: missingNames },
      note: missingNames.length ? `${have.length} of ${n} properties; excludes ${missingNames.join(", ")}` : `All ${n} properties` };
  };
  for (const k of SUMS) out.metrics[k] = total(k);
  const units = snaps.reduce((a, s) => a + s.unitCount, 0), occ = snaps.reduce((a, s) => a + s.occupiedCount, 0);
  out.metrics.occupancy = units ? ok(occ / units, "scheduled", `${occ} of ${units} units occupied`) : na("No units");
  const ratio = (key, num, den) => {
    const have = snaps.filter((s) => s.metrics[key].available);
    if (!have.length) return na(snaps.length ? snaps.map((s) => s.metrics[key].reason).find(Boolean) : "No properties");
    const d = have.reduce((t, s) => t + den(s), 0);
    if (!d) return na("Nothing to divide by");
    const missingNames = snaps.filter((s) => !s.metrics[key].available).map((s) => s.property.name);
    return { ...ok(have.reduce((t, s) => t + num(s), 0) / d, worst(...have.map((s) => s.metrics[key].kind))),
      coverage: { have: have.length, of: n, missing: missingNames },
      note: missingNames.length ? `${have.length} of ${n} properties; excludes ${missingNames.join(", ")}` : `All ${n} properties` };
  };
  out.metrics.capRate = ratio("capRate", (s) => s.metrics.noi.value, (s) => s.metrics.value.value);
  out.metrics.cashOnCash = ratio("cashOnCash", (s) => s.metrics.netCashFlow.value, (s) => s.inputs.cash);
  out.metrics.dscr = ratio("dscr", (s) => s.metrics.noi.value, (s) => s.metrics.debtService.value);
  return out;
}

// ─── Formatting ─────────────────────────────────────────────────────────────
export function fmtMoney(cents) {
  if (cents == null) return "—";
  const a = Math.abs(Math.round(cents)) / 100;
  const s = `$${a.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return cents < 0 ? `(${s})` : s;
}
const round = (x, dp) => Math.round(Number((x * 10 ** dp).toPrecision(12))) / 10 ** dp;   // 0.0725 → 7.3%, not 7.2%
export const fmtPctValue = (x) => (x == null ? "—" : `${round(x * 100, 1).toFixed(1)}%`);
export const fmtRatio = (x) => (x == null ? "—" : `${round(x, 2).toFixed(2)}×`);

// Form helpers: dollars → cents (null when blank), percent string → number.
export function dollarsToCents(s) {
  const t = String(s ?? "").replace(/[$,\s]/g, "");
  if (t === "") return { cents: null };
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { error: true };
  const [w, f = ""] = t.split(".");
  return { cents: Number(w) * 100 + Number(f.padEnd(2, "0")) };
}
export const centsToDollars = (c) => (c == null ? "" : (Number(c) / 100).toFixed(2).replace(/\.00$/, ""));
