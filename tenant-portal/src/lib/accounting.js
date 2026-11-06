// ─── A1 accounting helpers (pure; shared by the UI and node tests) ─────────
// All money is integer cents. The database does the accounting; these helpers
// only shape what it returns for display and export.

// Expense categories offered by Record Expense. Values must stay in step with
// public.a1_expense_account() in the A1 migration.
export const EXPENSE_CATEGORIES = [
  { value: "Repairs & Maintenance", code: "5000" },
  { value: "Utilities",             code: "5100" },
  { value: "Insurance",             code: "5200" },
  { value: "Property Taxes",        code: "5300" },
  { value: "Management Fees",       code: "5400" },
  { value: "Cleaning",              code: "5500" },
  { value: "Landscaping",           code: "5600" },
  { value: "Supplies",              code: "5700" },
  { value: "Legal & Professional",  code: "5800" },
  { value: "Advertising",           code: "5850" },
  { value: "HOA Dues",              code: "5900" },
  { value: "Other",                 code: "5990" },
];

// Receipt categories offered when recording or classifying a payment. Values must stay in
// step with public.a1_payment_account() in the A1 migration.
export const PAYMENT_CATEGORIES = [
  { value: "Rent",             code: "4000" },
  { value: "Late Fee",         code: "4100" },
  { value: "Pet Fee",          code: "4200" },
  { value: "Parking",          code: "4200" },
  { value: "Storage",          code: "4200" },
  { value: "Utilities",        code: "4200" },
  { value: "Laundry",          code: "4200" },
  { value: "Other",            code: "4200" },
  { value: "Security Deposit", code: "2100" },
];

// Plain-language reasons for reconciliation exceptions (codes come from the migration).
export const EXCEPTION_TEXT = {
  needs_paid_date:                   "Expense has no paid date — not yet cash. Mark it paid to include it.",
  charge_row_marked_paid:            "A charge row (has a due date / balance) is marked paid — confirm whether money was received.",
  ambiguous_amount:                  "amount and amount_cents disagree — confirm the correct amount.",
  missing_or_nonpositive_amount:     "Missing or non-positive amount.",
  no_property:                       "Expense is not linked to a property.",
  no_unit:                           "Receipt has no unit recorded — assign the unit it was for (never inferred from where the tenant lives now).",
  uncategorized_receipt:             "Receipt has no category — classify it (rent, late fee, deposit…) to post it.",
  property_without_books:            "Property has no set of books assigned.",
  non_operating_category:            "Owner contribution / distribution / loan — not operating income or expense (handled in a later release).",
  unknown_category:                  "Category isn't mapped to an account.",
  posting_failed:                    "Posting failed unexpectedly — the source row was saved; retry is automatic on the next edit.",
  missing_paid_date:                 "Receipt is marked paid but has no paid date — enter the actual date the money was received (the recorded date is never used).",
  refund_on_unposted_payment:        "A refund exists for a payment that is no longer in the ledger (for example, it was voided). Review what happened to the money.",
  modus_fee_failed:                  "The payment saved, but Modus's 5% couldn't be recorded. It retries on the next change to this payment.",
  application_failed:                "The payment or charge saved, but applying it failed. It retries on the next change to this tenant.",
  event_on_unposted_payment:         "Stripe reported a reversal or fee refund for a payment not yet in the ledger. It posts once the payment does.",
  event_without_amount:              "Stripe reported a reversal or fee refund with no amount. Check it in Stripe.",
  fee_refund_without_transfer:       "A Modus fee refund on a charge that never sent funds to a connected account. Check it in Stripe.",
};

// How a payment reached Modus. "ACH" recorded by the landlord is an offline bank transfer, not Stripe.
export function paymentChannel(p) {
  if (p?.origin === "tenant_pay_rent") return "Stripe · Pay Rent";
  if (p?.stripe_payment_intent_id) return "Stripe";
  const m = p?.source;
  return m ? `Offline · ${m}` : "Offline";
}

// Each Stripe refund's transfer reversal, judged against the original charge (a2_stripe_refunds).
export const TRANSFER_STATUS_TEXT = {
  not_required:    "no transfer reversal needed: the charge sent nothing to a connected account",
  reversed:        "transfer reversed",
  missing:         "transfer reversal MISSING",
  short:           "transfer reversal SHORT",
  unconfirmed:     "arrangement unconfirmed",
  details_missing: "refund details not captured yet",
};

// Flags from a2_stripe_fees (D8, D10).
export const FEE_FLAG_TEXT = {
  stripe_fee_not_captured:    "Stripe fee not captured",
  platform_fee_not_confirmed: "Modus fee not confirmed at Stripe",
  platform_fee_differs:       "Modus fee differs from Stripe",
  platform_fee_refunded:      "Modus fee returned to the owner",
  stripe_fee_reversed:        "Stripe returned part of its fee",
  transfer_reversal_missing:  "A required transfer reversal is missing; the owner's books show the amount as owed to Modus",
  transfer_reversal_short:    "Transfer reversal is less than this refund's share",
  transfer_arrangement_unconfirmed: "Couldn't confirm whether the charge transferred funds to the owner",
  refund_details_missing:     "Refund transaction details missing",
  refund_failed:              "A refund failed at Stripe and was reversed",
  refund_rejected:            "A Stripe refund exceeded the recorded payment; needs review",
};

export const SCOPES = [
  { value: "portfolio", label: "Portfolio" },
  { value: "owner",     label: "Ownership entity" },
  { value: "books",     label: "Set of books" },
  { value: "property",  label: "Property" },
];

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();   // m is 1-based

// Today's date in the books' time zone (America/New_York), as YYYY-MM-DD.
export function todayNY(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const PERIOD_PRESETS = [
  { value: "this_month",   label: "This month" },
  { value: "last_month",   label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "ytd",          label: "Year to date" },
  { value: "last_year",    label: "Last year" },
  { value: "custom",       label: "Custom" },
];

// Inclusive { from, to } for a preset, relative to `today` (YYYY-MM-DD).
export function periodRange(preset, today) {
  const [y, m] = today.split("-").map(Number);
  switch (preset) {
    case "this_month":   return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) };
    case "last_month": {
      const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
      return { from: iso(py, pm, 1), to: iso(py, pm, lastDay(py, pm)) };
    }
    case "this_quarter": {
      const q0 = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: iso(y, q0, 1), to: iso(y, q0 + 2, lastDay(y, q0 + 2)) };
    }
    case "ytd":       return { from: iso(y, 1, 1), to: today };
    case "last_year": return { from: iso(y - 1, 1, 1), to: iso(y - 1, 12, 31) };
    default:          return null;
  }
}

// Rows from a1_income_statement → the statement model shown on screen.
export function buildStatement(rows) {
  const lines = (rows || []).map(r => ({
    type: r.account_type, code: r.account_code, name: r.account_name, cents: Number(r.amount_cents),
  })).sort((a, b) => a.code.localeCompare(b.code));
  const income   = lines.filter(l => l.type === "income");
  const expenses = lines.filter(l => l.type === "expense");
  const totalIncome   = income.reduce((s, l) => s + l.cents, 0);
  const totalExpenses = expenses.reduce((s, l) => s + l.cents, 0);
  return { income, expenses, totalIncome, totalExpenses, net: totalIncome - totalExpenses };
}

// The exact rows the screen renders, in order. The CSV is generated from the same list.
export function statementRows(model) {
  return [
    ...model.income.map(l => ({ section: "Income", code: l.code, name: l.name, cents: l.cents, total: false })),
    { section: "Income", code: "", name: "Total income", cents: model.totalIncome, total: true },
    ...model.expenses.map(l => ({ section: "Expenses", code: l.code, name: l.name, cents: l.cents, total: false })),
    { section: "Expenses", code: "", name: "Total expenses", cents: model.totalExpenses, total: true },
    { section: "Net", code: "", name: "Net income", cents: model.net, total: true },
  ];
}

// 123456 → "1234.56"; -5 → "-0.05" (exact; no floating point)
export function centsToDecimal(cents) {
  const n = BigInt(cents), neg = n < 0n, a = neg ? -n : n;
  return `${neg ? "-" : ""}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
}

// 123456 → "$1,234.56"; negatives in parentheses
export function fmtCents(cents) {
  const [whole, frac] = centsToDecimal(Math.abs(Number(cents))).split(".");
  const s = `$${Number(whole).toLocaleString("en-US")}.${frac}`;
  return Number(cents) < 0 ? `(${s})` : s;
}

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCSV = (rows) => rows.map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

export function statementCSV(model, { title, scopeLabel, from, to }) {
  return toCSV([
    [title || "Income Statement (cash basis)"],
    ["Scope", scopeLabel],
    ["Period", `${from} to ${to}`],
    [],
    ["Section", "Account code", "Account", "Amount"],
    ...statementRows(model).map(r => [r.section, r.code, r.name, centsToDecimal(r.cents)]),
  ]);
}

export function transactionsCSV(rows, { accountLabel, from, to }) {
  return toCSV([
    [`Transactions — ${accountLabel}`],
    ["Period", `${from} to ${to}`],
    [],
    ["Date", "Description", "Type", "Books", "Property", "Tenant", "Amount"],
    ...rows.map(r => [r.entry_date, r.memo, r.kind, r.books_name, r.property_name || "", r.tenant_name || "", centsToDecimal(r.amount_cents)]),
  ]);
}

// Minimal RFC 4180 parser (used by tests to prove the CSV matches the screen).
export function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\r") continue;
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Dollars string from a form → integer cents, or null when invalid (max 2 decimals, > 0).
export function parseDollarsToCents(input) {
  const s = String(input ?? "").replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [w, f = ""] = s.split(".");
  const cents = Number(w) * 100 + Number(f.padEnd(2, "0"));
  return cents > 0 && Number.isSafeInteger(cents) ? cents : null;
}

// A paid date picked in a form (YYYY-MM-DD) → timestamptz that is that same calendar day in
// America/New_York (17:00 UTC = noon EST / 1 pm EDT). new Date("YYYY-MM-DD") would be UTC
// midnight, i.e. the previous evening in Ohio.
export function paidAtFromDate(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? `${d}T17:00:00Z` : null;
}

const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "") && !Number.isNaN(Date.parse(d));

// Record Expense form → expenses row (amount in dollars, as the table stores it).
export function expenseRowFromForm(form) {
  if (!form.property_id) return { error: "Select a property." };
  if (!EXPENSE_CATEGORIES.some(c => c.value === form.category)) return { error: "Select a category." };
  const cents = parseDollarsToCents(form.amount);
  if (cents == null) return { error: "Enter an amount greater than $0 (up to 2 decimals)." };
  if (!isDate(form.date)) return { error: "Enter the expense date." };
  if (form.paid && !isDate(form.paid_at)) return { error: "Enter the date it was paid." };
  return {
    row: {
      property_id:  form.property_id,
      unit_id:      form.unit_id || null,
      category:     form.category,
      description:  (form.description || "").trim() || null,
      vendor_name:  (form.vendor_name || "").trim() || null,
      amount:       Number(centsToDecimal(cents)),
      date:         form.date,
      paid_at:      form.paid ? form.paid_at : null,
    },
    cents,
  };
}

// A payments row's amount in cents. Rows store either amount_cents (Stripe, Tenant detail)
// or amount in dollars (Financials, late-fee charges); same rule as the A1 ledger.
export function paymentCents(p) {
  if (p?.amount_cents != null && p.amount_cents !== "") return Number(p.amount_cents);
  if (p?.amount != null && p.amount !== "") return Math.round(Number(p.amount) * 100);
  return 0;
}

// Both units present but disagreeing (A1 flags these as ambiguous_amount).
export function paymentAmountConflict(p) {
  return p?.amount_cents != null && p?.amount != null && Number(p.amount_cents) !== Math.round(Number(p.amount) * 100);
}

// ─── A2 receivables ────────────────────────────────────────────────────────
// Tenant charges use the receipt categories, except deposits (a liability, never a charge).
export const CHARGE_CATEGORIES = PAYMENT_CATEGORIES.filter(c => c.code !== "2100");

// Money actually received and still standing: paid, not voided. (voided_at is undefined before A2.)
export const isCollected = (p) => p?.status === "paid" && !p?.voided_at;

// payment_refunds rows → { payment_id: refunded cents }.
export function refundsByPayment(refunds) {
  const m = {};
  for (const r of refunds || []) m[r.payment_id] = (m[r.payment_id] || 0) + Number(r.amount_cents || 0);
  return m;
}

// What a payment is worth after voids and refunds (0 unless it was collected).
export function netPaymentCents(p, refunds = {}) {
  return isCollected(p) ? paymentCents(p) - (refunds[p.id] || 0) : 0;
}

// Record Payment lines (D5: one receipt per category, each explicitly classified).
// [{ category, amount }] → { lines: [{ category, cents }] } or { error }.
export function receiptLinesFromForm(lines) {
  const out = [];
  for (const l of lines || []) {
    if (!l.category) return { error: "Select what each payment line is for." };
    if (!PAYMENT_CATEGORIES.some(c => c.value === l.category)) return { error: `Unknown category: ${l.category}.` };
    const cents = parseDollarsToCents(l.amount);
    if (cents == null) return { error: `Enter an amount greater than $0 for ${l.category} (up to 2 decimals).` };
    if (out.some(x => x.category === l.category)) return { error: `${l.category} is listed twice. Combine those lines.` };
    out.push({ category: l.category, cents });
  }
  if (!out.length) return { error: "Add at least one payment line." };
  return { lines: out };
}

// a2_open_charges rows → open amount per category, oldest due first within the list.
export function openByCategory(rows) {
  const m = new Map();
  for (const r of rows || []) {
    const open = Number(r.open_cents || 0);
    if (open > 0) m.set(r.category, (m.get(r.category) || 0) + open);
  }
  return [...m].map(([category, cents]) => ({ category, cents }));
}

// a2_tenant_ledger rows → the current balance (the last running balance), 0 when empty.
export function ledgerBalanceCents(rows) {
  return rows?.length ? Number(rows[rows.length - 1].balance_cents) : 0;
}

const BALANCE_SUMS = ["open_cents", "credit_cents", "balance_cents"];

export function balanceTotals(rows) {
  const t = Object.fromEntries(BALANCE_SUMS.map(k => [k, 0]));
  for (const r of rows || []) for (const k of BALANCE_SUMS) t[k] += Number(r[k] || 0);
  return t;
}

// The rows the Delinquency Report renders (tenants, then the total). The CSV is generated from the same list.
export function balanceDisplayRows(rows) {
  const list = (rows || []).map(r => ({ name: r.tenant_name, property: r.property_name || "", books: r.books_name || "",
    ...Object.fromEntries(BALANCE_SUMS.map(k => [k, Number(r[k] || 0)])), total: false }));
  return [...list, { name: "Total", property: "", books: "", ...balanceTotals(rows), total: true }];
}

export function delinquencyCSV(rows, { scopeLabel, asOf }) {
  return toCSV([
    ["Delinquency report"],
    ["Scope", scopeLabel],
    ["As of", asOf],
    [],
    ["Tenant", "Property", "Books", "Open charges", "Credit", "Balance"],
    ...balanceDisplayRows(rows).map(r => [r.name, r.property, r.books, ...BALANCE_SUMS.map(k => centsToDecimal(r[k]))]),
  ]);
}

// a2_tenant_ledger rows → the entry shape the tenant Activity screen renders (newest first, dollars).
export function ledgerToActivity(rows) {
  return (rows || [])
    .filter(r => Number(r.charge_cents) || Number(r.payment_cents))
    .map(r => ({
      id: `${r.ref_id}-${r.seq}`,
      type: Number(r.charge_cents) > 0 ? "charge" : "payment",   // a rental credit is a negative charge
      description: r.kind === "refund" ? "Refund to you" : r.description,
      amount: Math.abs(Number(r.charge_cents) || Number(r.payment_cents)) / 100,
      posted_at: `${r.event_date}T12:00:00`,
      running_balance: Number(r.balance_cents) / 100,
    }))
    .reverse();
}

// Signed dollars (opening balances may be a credit) → cents, or null.
export function parseSignedDollarsToCents(input) {
  const s = String(input ?? "").replace(/[$,\s]/g, "");
  const neg = s.startsWith("-");
  const c = parseDollarsToCents(neg ? s.slice(1) : s);
  return c == null ? null : neg ? -c : c;
}

// ─── A3: payment applications, statements, collections ─────────────────────
// a3_refund_reconciliation status → plain language. A rent refund isn't a normal workflow; these appear only if one happens at Stripe.
export const REFUND_STATUS_TEXT = {
  reversal_complete:           "Complete: the owner's 95% is back and Modus kept no fee",
  reversal_short:              "Reversal is short: the owner still owes the rest",
  reversal_missing:            "Transfer reversal MISSING: the owner still holds the 95%",
  modus_fee_not_returned:      "Modus still holds its 5%: the fee needs returning to the owner",
  details_missing:             "Refund details not captured yet",
  arrangement_unconfirmed:     "Couldn't confirm the charge sent funds to the owner: review",
  not_required:                "No reversal needed: the charge stayed on the platform account",
  refund_failed_reversal_kept: "Refund failed, but its transfer reversal stands: review",
};
export const REFUND_STATUS_OK = new Set(["reversal_complete", "not_required"]);

// a3_return_recovery status. A person reverses the transfer in the Stripe Dashboard; Modus only tracks it.
export const RECOVERY_STATUS_TEXT = {
  not_started:      "Not started: reverse the transfer in the Stripe Dashboard, or record a direct repayment",
  partly_recovered: "Partly recovered",
  recovered:        "Recovered",
  over_recovered:   "Over-recovered: Modus holds money owed to the owner",
  not_required:     "Nothing to recover",
};
export const RECOVERY_DONE = new Set(["recovered", "not_required"]);
export const RETURN_KIND_TEXT = { ach_return: "ACH return", dispute: "Bank dispute", offline_return: "Offline return" };

// a3_platform_economics
export const COLLECTION_STATE_TEXT = { collected: "Collected", returned: "Returned", failed_before_settlement: "Failed before settlement" };
export const FEE_COLLECTION_TEXT = { withheld_at_stripe: "Withheld at Stripe", owed_by_owner: "Owed by owner", none: "None" };
export const MODUS_FLAG_TEXT = {
  stripe_fee_not_captured:  "Stripe fee not captured",
  failure_fee_not_captured: "Any failure fee isn't captured on this event",
  return_fee_not_captured:  "Return fee not captured yet",
  fee_differs_at_stripe:    "Fee differs from Stripe",
  return_rejected:          "Stripe reported a return Modus couldn't apply: review",
};

export const COLLECTION_STATUS = {
  settling:    "Stripe payment settling",
  returned:    "Payment returned",
  failed:      "Last Stripe payment failed",
  partial:     "Partly paid",
  no_payment:  "No payment",
  not_yet_due: "Not yet due",
};

export const BOOK_TXN_TYPES = [
  { value: "owner_contribution", label: "Owner contribution",  help: "Money the owner put into these books." },
  { value: "owner_distribution", label: "Owner distribution",  help: "Money the owner took out of these books. Not an expense, so it doesn't affect the Income Statement." },
  { value: "opening_balance",    label: "Opening balance",     help: "What an account actually held when these books started in Modus, one account at a time. The other side goes to Opening Balance Equity." },
  { value: "cash_transfer",      label: "Cash transfer",       help: "Money moving between these books' accounts, such as a Stripe payout reaching the bank." },
  { value: "modus_fee_payment",  label: "Pay Modus fee",       help: "The owner paid Modus the 5% owed on rent collected outside Stripe. Clears Modus Management Fee Payable." },
  { value: "modus_settlement",   label: "Repay Modus for returned rent", help: "The owner paid Modus back directly and it isn't for one returned payment. For a returned payment, record it under Receivables → Returned payments so it lowers that payment's recoverable amount." },
];
export const CASH_ACCOUNTS = [{ code: "1000", name: "Operating Cash" }, { code: "1050", name: "Stripe Clearing" }];
export const OPENING_ACCOUNTS = [...CASH_ACCOUNTS, { code: "2100", name: "Security Deposits Held" }, { code: "3000", name: "Owner Equity" }];

const accountName = (code) => OPENING_ACCOUNTS.find(a => a.code === code)?.name || code;

// A book transaction's journal effect in plain terms. The database does the posting; this explains it on screen.
export function bookTxnEffect(t) {
  switch (t.txn_type) {
    case "owner_contribution": return `${accountName(t.cash_account)} up, Owner Contributions up`;
    case "owner_distribution": return `${accountName(t.cash_account)} down, Owner Distributions up`;
    case "cash_transfer":      return `${accountName(t.from_account)} to ${accountName(t.cash_account)}`;
    case "modus_settlement":   return `${accountName(t.cash_account)} down, Due to Modus down`;
    case "modus_fee_payment":  return `${accountName(t.cash_account)} down, Modus Management Fee Payable down`;
    case "opening_balance":    return `${accountName(t.account_code)} opening balance, against Opening Balance Equity`;
    default: return "";
  }
}

const addMonths = (y, m, n) => { const t = y * 12 + (m - 1) + n; return [Math.floor(t / 12), (t % 12) + 1]; };
const dayMs = 86400000;
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);

// The period to compare against. "previous": whole months shift by whole months, otherwise the same number of days just before.
// "last_year": the same dates one year earlier.
export function comparisonRange(range, mode) {
  if (!range?.from || !range?.to) return null;
  const [fy, fm, fd] = range.from.split("-").map(Number);
  const [ty, tm, td] = range.to.split("-").map(Number);
  if (mode === "last_year") {
    return { from: iso(fy - 1, fm, Math.min(fd, lastDay(fy - 1, fm))), to: iso(ty - 1, tm, Math.min(td, lastDay(ty - 1, tm))) };
  }
  if (mode !== "previous") return null;
  if (fd === 1 && td === lastDay(ty, tm)) {
    const n = (ty * 12 + tm) - (fy * 12 + fm) + 1;
    const [ay, am] = addMonths(fy, fm, -n), [by, bm] = addMonths(ty, tm, -n);
    return { from: iso(ay, am, 1), to: iso(by, bm, lastDay(by, bm)) };
  }
  const from = Date.parse(range.from), to = Date.parse(range.to), days = Math.round((to - from) / dayMs) + 1;
  return { from: isoOf(from - days * dayMs), to: isoOf(from - dayMs) };
}

// Change as a percentage of the comparison amount; null when there's nothing to compare against.
export function pctChange(cur, cmp) {
  return cmp === 0 ? null : Math.round(((cur - cmp) / Math.abs(cmp)) * 1000) / 10;
}

// Two statement models → the same rows statementRows gives, plus the comparison amount and change. Accounts in either period appear.
export function comparisonRows(model, cmp) {
  const lines = (a, b) => {
    const codes = [...new Set([...a.map(l => l.code), ...b.map(l => l.code)])].sort();
    return codes.map(code => {
      const x = a.find(l => l.code === code), y = b.find(l => l.code === code);
      return { code, name: (x || y).name, cents: x?.cents || 0, compareCents: y?.cents || 0 };
    });
  };
  const row = (section, r, total = false) => ({ section, total, code: r.code || "", name: r.name, cents: r.cents, compareCents: r.compareCents,
    changeCents: r.cents - r.compareCents, pct: pctChange(r.cents, r.compareCents) });
  return [
    ...lines(model.income, cmp.income).map(l => row("Income", l)),
    row("Income", { name: "Total income", cents: model.totalIncome, compareCents: cmp.totalIncome }, true),
    ...lines(model.expenses, cmp.expenses).map(l => row("Expenses", l)),
    row("Expenses", { name: "Total expenses", cents: model.totalExpenses, compareCents: cmp.totalExpenses }, true),
    row("Net", { name: "Net income", cents: model.net, compareCents: cmp.net }, true),
  ];
}

export const fmtPct = (p) => (p == null ? "—" : `${p > 0 ? "+" : ""}${p.toFixed(1)}%`);

export function comparisonCSV(rows, { scopeLabel, from, to, compareFrom, compareTo }) {
  return toCSV([
    ["Income Statement (cash basis), with comparison"],
    ["Scope", scopeLabel],
    ["Period", `${from} to ${to}`],
    ["Compared with", `${compareFrom} to ${compareTo}`],
    [],
    ["Section", "Account code", "Account", "Amount", "Comparison", "Change", "Change %"],
    ...rows.map(r => [r.section, r.code, r.name, centsToDecimal(r.cents), centsToDecimal(r.compareCents), centsToDecimal(r.changeCents), r.pct == null ? "" : r.pct.toFixed(1)]),
  ]);
}

// a3_balance_sheet rows → the statement on screen. A journal that balances makes this balance; the screen checks rather than assumes.
export function balanceSheetModel(rows) {
  const pick = (s) => (rows || []).filter(r => r.section === s).map(r => ({ code: r.account_code || "", name: r.account_name, cents: Number(r.amount_cents) }));
  const sum = (l) => l.reduce((a, x) => a + x.cents, 0);
  const assets = pick("Assets"), liabilities = pick("Liabilities"), equity = pick("Equity");
  const totalAssets = sum(assets), totalLiabilities = sum(liabilities), totalEquity = sum(equity);
  return { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity,
           difference: totalAssets - totalLiabilities - totalEquity, balanced: totalAssets === totalLiabilities + totalEquity };
}

export function balanceSheetCSV(m, { scopeLabel, asOf }) {
  const lines = (section, list, label, total) => [...list.map(l => [section, l.code, l.name, centsToDecimal(l.cents)]), [section, "", label, centsToDecimal(total)]];
  return toCSV([
    ["Balance Sheet (cash basis)"],
    ["Scope", scopeLabel],
    ["As of", asOf],
    [],
    ["Section", "Account code", "Account", "Amount"],
    ...lines("Assets", m.assets, "Total assets", m.totalAssets),
    ...lines("Liabilities", m.liabilities, "Total liabilities", m.totalLiabilities),
    ...lines("Equity", m.equity, "Total equity", m.totalEquity),
    ["Total", "", "Total liabilities and equity", centsToDecimal(m.totalLiabilities + m.totalEquity)],
  ]);
}

// a3_trial_balance rows → totals and the net income the Income Statement should also show.
export function trialBalanceModel(rows) {
  const lines = (rows || []).map(r => ({ code: r.account_code, name: r.account_name, type: r.account_type, debit: Number(r.debit_cents), credit: Number(r.credit_cents) }));
  const totalDebit = lines.reduce((a, l) => a + l.debit, 0), totalCredit = lines.reduce((a, l) => a + l.credit, 0);
  const netIncome = lines.filter(l => l.type === "income" || l.type === "expense").reduce((a, l) => a + l.credit - l.debit, 0);
  return { lines, totalDebit, totalCredit, netIncome, difference: totalDebit - totalCredit, balanced: totalDebit === totalCredit };
}

export function trialBalanceCSV(m, { scopeLabel, asOf }) {
  return toCSV([
    ["Trial Balance (cash basis, unadjusted)"],
    ["Scope", scopeLabel],
    ["As of", asOf],
    [],
    ["Account code", "Account", "Type", "Debit", "Credit"],
    ...m.lines.map(l => [l.code, l.name, l.type, centsToDecimal(l.debit), centsToDecimal(l.credit)]),
    ["", "Total", "", centsToDecimal(m.totalDebit), centsToDecimal(m.totalCredit)],
  ]);
}

// Worklist filters: age is minimum days past due (0 = everyone, 1 = anything past due).
export function filterCollections(rows, { age = 0, status = "all", search = "" } = {}) {
  const q = search.trim().toLowerCase();
  return (rows || []).filter(r =>
    (age === 0 || Number(r.days_past_due) >= age) &&
    (status === "all" || r.payment_status === status) &&
    (!q || [r.tenant_name, r.property_name, r.owner_name, r.books_name].some(v => String(v || "").toLowerCase().includes(q))));
}

export function collectionsTotals(rows) {
  const s = (k) => (rows || []).reduce((a, r) => a + Number(r[k] || 0), 0);
  return { tenants: (rows || []).length, open: s("open_cents"), overdue: s("overdue_cents"), credit: s("credit_cents"), fees: s("late_fee_open_cents"), d90: s("d90_cents") };
}

export function collectionsCSV(rows, { scopeLabel, asOf }) {
  return toCSV([
    ["Collections worklist"],
    ["Scope", scopeLabel],
    ["As of", asOf],
    [],
    ["Tenant", "Property", "Unit", "Owner", "Open", "Past due", "Rental credit", "Cash overpayment", "Opening credit", "Days past due", "Overdue charges", "Oldest due", "Late fees open", "Last payment", "Last payment date", "Payment status"],
    ...(rows || []).map(r => [r.tenant_name, r.property_name || "", r.unit_number || "", r.owner_name || "", centsToDecimal(r.open_cents), centsToDecimal(r.overdue_cents),
      centsToDecimal(r.rental_credit_cents || 0), centsToDecimal(r.cash_overpayment_cents || 0), centsToDecimal(r.opening_credit_cents || 0), r.days_past_due, r.overdue_charges, r.oldest_due || "",
      centsToDecimal(r.late_fee_open_cents), r.last_payment_cents == null ? "" : centsToDecimal(r.last_payment_cents), r.last_payment_on || "", COLLECTION_STATUS[r.payment_status] || r.payment_status]),
  ]);
}

// Display status of an expense row.
export function expenseStatus(e) {
  if (e.voided_at) return "void";
  return e.paid_at ? "paid" : "unpaid";
}
