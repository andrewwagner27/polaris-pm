// A1: report shaping, CSV export, Record Expense validation, and UI ↔ migration consistency.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EXPENSE_CATEGORIES, PAYMENT_CATEGORIES, EXCEPTION_TEXT, buildStatement, statementRows, statementCSV, transactionsCSV, parseCSV,
  centsToDecimal, fmtCents, parseDollarsToCents, paidAtFromDate, paymentCents, paymentAmountConflict, periodRange, todayNY, expenseRowFromForm, expenseStatus,
} from "../src/lib/accounting.js";

const MIGRATION = readFileSync(new URL("../supabase/migrations/20261103000000_a1_ledger_foundation.sql", import.meta.url), "utf8");

// a1_income_statement output for the PGlite harness, portfolio, October 2026 (see docs/a1-ledger-readiness.md)
const OCT_ROWS = [
  { account_type: "expense", account_code: "6100", account_name: "Payment Processing Fees", amount_cents: 7500 },
  { account_type: "income",  account_code: "4000", account_name: "Rental Income",           amount_cents: 420000 },
  { account_type: "expense", account_code: "5200", account_name: "Insurance",               amount_cents: 90000 },
  { account_type: "income",  account_code: "4100", account_name: "Late Fee Income",         amount_cents: 5000 },
  { account_type: "expense", account_code: "5100", account_name: "Utilities",               amount_cents: 12050 },
];

test("statement: sections, ordering and totals", () => {
  const m = buildStatement(OCT_ROWS);
  assert.deepEqual(m.income.map(l => l.code), ["4000", "4100"]);
  assert.deepEqual(m.expenses.map(l => l.code), ["5100", "5200", "6100"]);
  assert.equal(m.totalIncome, 425000);
  assert.equal(m.totalExpenses, 109550);
  assert.equal(m.net, 315450);
});

test("statement: empty period", () => {
  const m = buildStatement([]);
  assert.equal(m.net, 0);
  assert.deepEqual(statementRows(m).map(r => r.name), ["Total income", "Total expenses", "Net income"]);
});

test("statement: negative lines (period containing only a refund reversal)", () => {
  const m = buildStatement([{ account_type: "income", account_code: "4000", account_name: "Rental Income", amount_cents: -150000 },
                            { account_type: "expense", account_code: "6100", account_name: "Payment Processing Fees", amount_cents: -7500 }]);
  assert.equal(m.net, -142500);
  assert.equal(fmtCents(m.net), "($1,425.00)");
});

test("CSV equals the displayed report, row for row", () => {
  const m = buildStatement(OCT_ROWS);
  const meta = { scopeLabel: "Set of books: Polaris Property Solutions, LLC — Cleveland", from: "2026-10-01", to: "2026-10-31" };
  const parsed = parseCSV(statementCSV(m, meta));
  assert.deepEqual(parsed[1], ["Scope", meta.scopeLabel]);             // comma in the name survives quoting
  assert.deepEqual(parsed[2], ["Period", "2026-10-01 to 2026-10-31"]);
  const header = parsed.findIndex(r => r[0] === "Section");
  const body = parsed.slice(header + 1);
  const shown = statementRows(m);
  assert.equal(body.length, shown.length);
  shown.forEach((r, i) => {
    assert.deepEqual(body[i], [r.section, r.code, r.name, centsToDecimal(r.cents)]);
    assert.equal(parseDollarsToCents(body[i][3].replace("-", "")) * (r.cents < 0 ? -1 : 1) || 0, r.cents);
  });
  // totals in the file add up independently
  const sum = (sec) => body.filter(r => r[0] === sec && r[1]).reduce((s, r) => s + Math.round(Number(r[3]) * 100), 0);
  assert.equal(sum("Income"), m.totalIncome);
  assert.equal(sum("Expenses"), m.totalExpenses);
  assert.equal(body.at(-1)[3], "3154.50");
});

test("drill-down CSV keeps every transaction and signs", () => {
  const rows = [
    { entry_date: "2026-10-03", memo: "Receipt", kind: "post", books_name: "Polaris, LLC", property_name: "Clifton Manor", tenant_name: 'Real "RT" Tenant', amount_cents: 150000 },
    { entry_date: "2026-11-02", memo: "Reversal: status:refunded", kind: "reversal", books_name: "Polaris, LLC", property_name: null, tenant_name: null, amount_cents: -150000 },
  ];
  const body = parseCSV(transactionsCSV(rows, { accountLabel: "4000 Rental Income", from: "2026-10-01", to: "2026-11-30" })).slice(4);
  assert.deepEqual(body[0], ["2026-10-03", "Receipt", "post", "Polaris, LLC", "Clifton Manor", 'Real "RT" Tenant', "1500.00"]);
  assert.deepEqual(body[1], ["2026-11-02", "Reversal: status:refunded", "reversal", "Polaris, LLC", "", "", "-1500.00"]);
});

test("money: exact cents, no floating point drift", () => {
  assert.equal(centsToDecimal(5), "0.05");
  assert.equal(centsToDecimal(-5), "-0.05");
  assert.equal(centsToDecimal(123456789), "1234567.89");
  assert.equal(fmtCents(123456), "$1,234.56");
  assert.equal(parseDollarsToCents("0.29"), 29);          // 0.29 * 100 = 28.999… in floats
  assert.equal(parseDollarsToCents("1,234.5"), 123450);
  assert.equal(parseDollarsToCents("$19.99"), 1999);
  for (const bad of ["", "0", "0.00", "-5", "1.234", "abc", "1e3"]) assert.equal(parseDollarsToCents(bad), null, bad);
});

test("periods: month ends, leap years, quarters, January rollover", () => {
  assert.deepEqual(periodRange("this_month", "2028-02-10"), { from: "2028-02-01", to: "2028-02-29" });
  assert.deepEqual(periodRange("this_month", "2026-02-10"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(periodRange("last_month", "2026-01-15"), { from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(periodRange("this_quarter", "2026-11-02"), { from: "2026-10-01", to: "2026-12-31" });
  assert.deepEqual(periodRange("ytd", "2026-11-02"), { from: "2026-01-01", to: "2026-11-02" });
  assert.deepEqual(periodRange("last_year", "2026-11-02"), { from: "2025-01-01", to: "2025-12-31" });
  assert.equal(periodRange("custom", "2026-11-02"), null);
});

test("today is taken in the books' time zone (America/New_York)", () => {
  assert.equal(todayNY(new Date("2026-11-02T03:30:00Z")), "2026-11-01");   // 10:30 pm Nov 1 in Ohio
  assert.equal(todayNY(new Date("2026-11-02T15:00:00Z")), "2026-11-02");
});

test("Record Expense: validation and row shape", () => {
  const base = { property_id: "p1", unit_id: "", category: "Utilities", amount: "120.50", date: "2026-10-05", paid: true, paid_at: "2026-10-06", vendor_name: " AEP ", description: "" };
  const { row, cents } = expenseRowFromForm(base);
  assert.equal(cents, 12050);
  assert.deepEqual(row, { property_id: "p1", unit_id: null, category: "Utilities", description: null, vendor_name: "AEP", amount: 120.5, date: "2026-10-05", paid_at: "2026-10-06" });
  assert.equal(expenseRowFromForm({ ...base, paid: false }).row.paid_at, null);           // unpaid bill: not cash yet
  assert.match(expenseRowFromForm({ ...base, property_id: "" }).error, /property/);
  assert.match(expenseRowFromForm({ ...base, category: "Mortgage" }).error, /category/); // non-operating never offered
  assert.match(expenseRowFromForm({ ...base, amount: "0" }).error, /amount/);
  assert.match(expenseRowFromForm({ ...base, paid_at: "" }).error, /paid/);
  assert.equal(expenseStatus({ paid_at: "2026-10-06" }), "paid");
  assert.equal(expenseStatus({ paid_at: null }), "unpaid");
  assert.equal(expenseStatus({ paid_at: "2026-10-06", voided_at: "2026-11-01T00:00:00Z" }), "void");
});

test("every Record Expense category maps to the same account in the migration", () => {
  const fn = MIGRATION.slice(MIGRATION.indexOf("FUNCTION public.a1_expense_account"));
  const body = fn.slice(0, fn.indexOf("$$;"));
  for (const { value, code } of EXPENSE_CATEGORIES) {
    const v = value.toLowerCase().replace(/'/g, "''");
    const branch = body.split("\n").find(l => l.includes(`'${v}'`) && /THEN code :=/.test(l));
    assert.ok(branch, `${value} not mapped in a1_expense_account`);
    assert.match(branch, new RegExp(`code := '${code}'`), `${value} → ${code}`);
    assert.ok(MIGRATION.includes(`('${code}','`), `${code} not in the seeded chart`);
  }
});

test("every payment category maps to the same account in the migration; no category is never assumed", () => {
  const fn = MIGRATION.slice(MIGRATION.indexOf("FUNCTION public.a1_payment_account"));
  const body = fn.slice(0, fn.indexOf("$$;"));
  const branch = (re) => body.split("\n").find(l => re.test(l)) || "";
  for (const { value, code } of PAYMENT_CATEGORIES) {
    const v = value.toLowerCase();
    if (code === "2100") { assert.match(branch(/'deposit'/), /code := '2100'/, value); assert.ok(v.includes("deposit")); continue; }
    const l = branch(new RegExp(`'${v}'`));
    assert.match(l, new RegExp(`code := '${code}'`), `${value} → ${code}`);
  }
  assert.match(branch(/IF c = ''/), /err := 'uncategorized_receipt'/, "empty category must be an exception");
  assert.doesNotMatch(body, /assumed_rent/);
});

test("revised rules: no inference of unit or category anywhere in the posting rules", () => {
  assert.doesNotMatch(MIGRATION, /unit_from_tenant_current|uncategorized_receipt_assumed_rent/);
  const cls = MIGRATION.slice(MIGRATION.indexOf("FUNCTION public.a1_classify_payment"));
  const body = cls.slice(0, cls.indexOf("$$;"));
  assert.doesNotMatch(body, /FROM tenants/, "classifier must not look up the tenant's current unit");
  assert.equal(EXCEPTION_TEXT.unit_from_tenant_current, undefined);
  assert.equal(EXCEPTION_TEXT.uncategorized_receipt_assumed_rent, undefined);
});

test("revised rules: a paid receipt without a paid date never posts and never uses the recorded date", () => {
  const cls = MIGRATION.slice(MIGRATION.indexOf("FUNCTION public.a1_classify_payment"));
  const body = cls.slice(0, cls.indexOf("$$;"));
  assert.match(body, /IF p\.paid_at IS NULL THEN err := 'missing_paid_date'; RETURN;/);
  assert.doesNotMatch(body, /created_at/, "classifier must not fall back to created_at");
  assert.doesNotMatch(MIGRATION, /receipt_date_assumed_created/);
  assert.equal(EXCEPTION_TEXT.receipt_date_assumed_created, undefined);
});

test("paid date from a form is stored as that same calendar day in America/New_York", () => {
  for (const d of ["2026-01-01", "2026-03-08", "2026-07-04", "2026-10-31", "2026-11-01", "2026-12-31"]) {   // incl. DST switch days
    const ts = paidAtFromDate(d);
    assert.equal(todayNY(new Date(ts)), d, d);
  }
  assert.notEqual(todayNY(new Date("2026-10-30")), "2026-10-30");   // why new Date("YYYY-MM-DD") was wrong
  assert.equal(paidAtFromDate(""), null);
  assert.equal(paidAtFromDate(undefined), null);
});

test("A2.6 payment amounts: cents and dollars rows both display their true amount", () => {
  assert.equal(paymentCents({ amount_cents: 150000 }), 150000);              // Stripe / Tenant detail
  assert.equal(paymentCents({ amount: 1500 }), 150000);                      // Financials (dollars)
  assert.equal(paymentCents({ amount: "1234.56" }), 123456);
  assert.equal(paymentCents({ amount: 0.29 }), 29);                          // no float drift
  assert.equal(paymentCents({ amount_cents: 5000, amount: 50 }), 5000);      // late-fee row stores both, consistently
  assert.equal(paymentCents({ amount_cents: null, amount: null }), 0);
  assert.equal(paymentCents({}), 0);
  assert.equal(paymentAmountConflict({ amount_cents: 5000, amount: 50 }), false);
  assert.equal(paymentAmountConflict({ amount_cents: 9999, amount: 100 }), true);
  assert.equal(paymentAmountConflict({ amount: 100 }), false);
  assert.equal(fmtCents(paymentCents({ amount_cents: 120000 })), "$1,200.00"); // was "$0.00" in Payment History
});

test("A2.6: no screen reads a single amount unit for payments any more", () => {
  for (const f of ["LandlordFinancials.jsx", "LandlordDashboard.jsx", "LandlordProperties.jsx", "LandlordTenantDetail.jsx"]) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /\bp\.amount_cents\s*\|\|\s*0|parseFloat\(p\.amount\b|fmt\(p\.amount\)/, f);
  }
});

test("every exception code the migration can raise has plain-language text", () => {
  const codes = new Set([...MIGRATION.matchAll(/(?:err|warn) := '([a-z_]+)'|warnings \|\| '([a-z_]+)'/g)].map(m => m[1] || m[2]));
  codes.add("posting_failed");
  assert.ok(codes.size >= 12, `only found ${codes.size}`);
  for (const c of codes) assert.ok(EXCEPTION_TEXT[c], `missing text for ${c}`);
});
