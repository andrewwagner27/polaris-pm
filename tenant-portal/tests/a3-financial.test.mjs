// A3: pure helpers and screen wiring. The accounting itself is tested against the real migration in the PGlite harness
// (docs/a3-test-tools/a3_harness.mjs); these cover what the screens do with its results.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  comparisonRange, comparisonRows, comparisonCSV, pctChange, fmtPct, buildStatement, statementRows, balanceSheetModel, balanceSheetCSV, trialBalanceModel, trialBalanceCSV,
  filterCollections, collectionsTotals, collectionsCSV, bookTxnEffect, parseCSV, fmtCents, BOOK_TXN_TYPES, REFUND_STATUS_TEXT, REFUND_STATUS_OK, COLLECTION_STATUS, RECOVERY_STATUS_TEXT, RECOVERY_DONE, RETURN_KIND_TEXT, COLLECTION_STATE_TEXT, FEE_COLLECTION_TEXT, MODUS_FLAG_TEXT, ledgerToActivity,
} from "../src/lib/accounting.js";

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const migration = src("supabase/migrations/20261105000000_a3_financial_foundation.sql");

describe("period comparison ranges", () => {
  test("a whole month compares with the previous whole month, whatever its length", () => {
    assert.deepEqual(comparisonRange({ from: "2026-03-01", to: "2026-03-31" }, "previous"), { from: "2026-02-01", to: "2026-02-28" });
    assert.deepEqual(comparisonRange({ from: "2026-02-01", to: "2026-02-28" }, "previous"), { from: "2026-01-01", to: "2026-01-31" });
  });
  test("January compares with December of the year before", () => {
    assert.deepEqual(comparisonRange({ from: "2026-01-01", to: "2026-01-31" }, "previous"), { from: "2025-12-01", to: "2025-12-31" });
  });
  test("a quarter compares with the previous quarter, across a year end", () => {
    assert.deepEqual(comparisonRange({ from: "2026-01-01", to: "2026-03-31" }, "previous"), { from: "2025-10-01", to: "2025-12-31" });
  });
  test("a whole year compares with the previous year", () => {
    assert.deepEqual(comparisonRange({ from: "2025-01-01", to: "2025-12-31" }, "previous"), { from: "2024-01-01", to: "2024-12-31" });
  });
  test("a partial period compares with the same number of days just before", () => {
    assert.deepEqual(comparisonRange({ from: "2026-03-10", to: "2026-03-19" }, "previous"), { from: "2026-02-28", to: "2026-03-09" });
  });
  test("last year keeps the same dates, and clamps Feb 29", () => {
    assert.deepEqual(comparisonRange({ from: "2026-01-01", to: "2026-11-03" }, "last_year"), { from: "2025-01-01", to: "2025-11-03" });
    assert.deepEqual(comparisonRange({ from: "2028-02-01", to: "2028-02-29" }, "last_year"), { from: "2027-02-01", to: "2027-02-28" });
  });
  test("no comparison, or no dates, gives nothing", () => {
    assert.equal(comparisonRange({ from: "2026-01-01", to: "2026-01-31" }, "none"), null);
    assert.equal(comparisonRange(null, "previous"), null);
  });
});

describe("comparison rows", () => {
  const cur = buildStatement([
    { account_type: "income", account_code: "4000", account_name: "Rental Income", amount_cents: 120000 },
    { account_type: "expense", account_code: "5000", account_name: "Repairs", amount_cents: 30000 },
  ]);
  const old = buildStatement([
    { account_type: "income", account_code: "4000", account_name: "Rental Income", amount_cents: 100000 },
    { account_type: "income", account_code: "4100", account_name: "Late Fee Income", amount_cents: 5000 },
  ]);
  const rows = comparisonRows(cur, old);
  const by = Object.fromEntries(rows.map(r => [r.name, r]));
  test("an account in only one period still appears, with zero on the other side", () => {
    assert.equal(by["Late Fee Income"].cents, 0); assert.equal(by["Late Fee Income"].compareCents, 5000);
    assert.equal(by["Repairs"].compareCents, 0); assert.equal(by["Repairs"].cents, 30000);
  });
  test("change and totals are exact", () => {
    assert.equal(by["Rental Income"].changeCents, 20000);
    assert.equal(by["Total income"].cents, 120000); assert.equal(by["Total income"].compareCents, 105000);
    assert.equal(by["Net income"].cents, 90000); assert.equal(by["Net income"].compareCents, 105000); assert.equal(by["Net income"].changeCents, -15000);
  });
  test("current figures are exactly the plain statement's figures: the comparison changes nothing", () => {
    const plain = statementRows(cur);
    for (const p of plain) assert.equal(rows.find(r => r.name === p.name).cents, p.cents);
  });
  test("percent: rounds to a tenth, and is blank when there's nothing to compare against", () => {
    assert.equal(pctChange(120000, 100000), 20); assert.equal(pctChange(1, 3), -66.7); assert.equal(pctChange(100, 0), null);
    assert.equal(pctChange(-50, -100), 50);
    assert.equal(fmtPct(20), "+20.0%"); assert.equal(fmtPct(-66.7), "-66.7%"); assert.equal(fmtPct(null), "—");
  });
  test("the CSV is the on-screen rows", () => {
    const csv = parseCSV(comparisonCSV(rows, { scopeLabel: "Portfolio", from: "a", to: "b", compareFrom: "c", compareTo: "d" }));
    const net = csv.find(r => r[2] === "Net income");
    assert.deepEqual(net, ["Net", "", "Net income", "900.00", "1050.00", "-150.00", "-14.3"]);
  });
});

describe("Balance Sheet model", () => {
  const rows = [
    { section: "Assets", account_code: "1000", account_name: "Operating Cash", amount_cents: 500000 },
    { section: "Assets", account_code: "1050", account_name: "Stripe Clearing", amount_cents: -9500 },
    { section: "Liabilities", account_code: "2100", account_name: "Security Deposits Held", amount_cents: 100000 },
    { section: "Liabilities", account_code: "2190", account_name: "Refunds Due to Modus", amount_cents: 500 },
    { section: "Equity", account_code: "3900", account_name: "Opening Balance Equity", amount_cents: 300000 },
    { section: "Equity", account_code: null, account_name: "Net income (this year)", amount_cents: 90000 },
  ];
  test("totals by section, and it balances", () => {
    const m = balanceSheetModel(rows);
    assert.equal(m.totalAssets, 490500); assert.equal(m.totalLiabilities, 100500); assert.equal(m.totalEquity, 390000);
    assert.equal(m.balanced, true); assert.equal(m.difference, 0);
  });
  test("a difference is reported, never hidden", () => {
    const m = balanceSheetModel(rows.slice(0, -1));
    assert.equal(m.balanced, false); assert.equal(m.difference, 90000);
  });
  test("the CSV carries every line and total", () => {
    const csv = parseCSV(balanceSheetCSV(balanceSheetModel(rows), { scopeLabel: "Books: X", asOf: "2026-11-03" }));
    assert.ok(csv.some(r => r[2] === "Stripe Clearing" && r[3] === "-95.00"));
    assert.ok(csv.some(r => r[2] === "Total liabilities and equity" && r[3] === "4905.00"));
  });
});

describe("Trial Balance model", () => {
  const rows = [
    { account_code: "1000", account_name: "Operating Cash", account_type: "asset", debit_cents: 100000, credit_cents: 0 },
    { account_code: "4000", account_name: "Rental Income", account_type: "income", debit_cents: 0, credit_cents: 120000 },
    { account_code: "5000", account_name: "Repairs", account_type: "expense", debit_cents: 20000, credit_cents: 0 },
  ];
  test("debits equal credits; net income comes from income and expense accounts only", () => {
    const m = trialBalanceModel(rows);
    assert.equal(m.totalDebit, 120000); assert.equal(m.totalCredit, 120000); assert.equal(m.balanced, true); assert.equal(m.netIncome, 100000);
  });
  test("out of balance is reported", () => {
    const m = trialBalanceModel(rows.slice(0, 2));
    assert.equal(m.balanced, false); assert.equal(m.difference, -20000);
  });
  test("the CSV totals match", () => {
    const csv = parseCSV(trialBalanceCSV(trialBalanceModel(rows), { scopeLabel: "x", asOf: "y" }));
    assert.deepEqual(csv.at(-1), ["", "Total", "", "1200.00", "1200.00"]);
  });
});

describe("Collections helpers", () => {
  const rows = [
    { tenant_name: "Wes", property_name: "A", owner_name: "Lakeshore", days_past_due: 95, open_cents: 200000, overdue_cents: 200000, credit_cents: 0, late_fee_open_cents: 5000, d90_cents: 100000, current_cents: 0, d30_cents: 0, d60_cents: 100000, overdue_charges: 2, payment_status: "no_payment" },
    { tenant_name: "Paul", property_name: "B", owner_name: "Andrew", days_past_due: 40, open_cents: 60000, overdue_cents: 60000, credit_cents: 5000, late_fee_open_cents: 0, d90_cents: 0, current_cents: 0, d30_cents: 60000, d60_cents: 0, overdue_charges: 1, payment_status: "partial" },
    { tenant_name: "Nia", property_name: "C", owner_name: "Andrew", days_past_due: 0, open_cents: 10000, overdue_cents: 0, credit_cents: 0, late_fee_open_cents: 0, d90_cents: 0, current_cents: 10000, d30_cents: 0, d60_cents: 0, overdue_charges: 0, payment_status: "not_yet_due" },
  ];
  test("the age filter uses days past due; 'past due' excludes charges not yet due", () => {
    assert.equal(filterCollections(rows, { age: 1 }).length, 2);
    assert.equal(filterCollections(rows, { age: 30 }).length, 2);
    assert.equal(filterCollections(rows, { age: 60 }).length, 1);
    assert.equal(filterCollections(rows, { age: 90 })[0].tenant_name, "Wes");
    assert.equal(filterCollections(rows).length, 3);
  });
  test("status and search filters", () => {
    assert.equal(filterCollections(rows, { status: "partial" })[0].tenant_name, "Paul");
    assert.equal(filterCollections(rows, { search: "lakes" })[0].tenant_name, "Wes");
    assert.equal(filterCollections(rows, { search: "  NIA " })[0].tenant_name, "Nia");
    assert.equal(filterCollections(rows, { search: "zzz" }).length, 0);
  });
  test("totals add the filtered rows", () => {
    const t = collectionsTotals(filterCollections(rows, { age: 1 }));
    assert.deepEqual(t, { tenants: 2, open: 260000, overdue: 260000, credit: 5000, fees: 5000, d90: 100000 });
  });
  test("the CSV is the on-screen rows, in plain language", () => {
    const csv = parseCSV(collectionsCSV(rows, { scopeLabel: "Portfolio", asOf: "2026-11-03" }));
    const paul = csv.find(r => r[0] === "Paul");
    assert.equal(paul[4], "600.00"); assert.equal(paul.at(-1), COLLECTION_STATUS.partial);
  });
});

describe("book transactions and refund text", () => {
  test("every type explains its effect", () => {
    for (const t of BOOK_TXN_TYPES) assert.ok(bookTxnEffect({ txn_type: t.value, cash_account: "1000", from_account: "1050", account_code: "2100" }).length > 5, t.value);
    assert.equal(bookTxnEffect({ txn_type: "cash_transfer", cash_account: "1000", from_account: "1050" }), "Stripe Clearing to Operating Cash");
  });
  test("types on screen are the types the database accepts", () => {
    const check = migration.match(/txn_type\s+text NOT NULL CHECK \(txn_type IN \(([^)]+)\)/)[1];
    for (const t of BOOK_TXN_TYPES) assert.ok(check.includes(`'${t.value}'`), t.value);
  });
  test("every refund status the database returns has plain text, and only clean outcomes are treated as OK", () => {
    const fn = migration.slice(migration.indexOf("FUNCTION public.a3_refund_reconciliation"), migration.indexOf("-- Each payment returned after it succeeded"));
    for (const code of [...fn.matchAll(/THEN '([a-z_]+)'/g)].map(m => m[1]).filter(c => !["destination", "unconfirmed"].includes(c))) assert.ok(REFUND_STATUS_TEXT[code], code);
    assert.deepEqual([...REFUND_STATUS_OK].sort(), ["not_required", "reversal_complete"]);
  });
  test("every collections status the database returns has plain text", () => {
    const fn = migration.slice(migration.indexOf("FUNCTION public.a3_collections"), migration.indexOf("PART 6: RLS"));
    const list = fn.slice(fn.indexOf("CASE WHEN py.settling"), fn.indexOf("coalesce(tn.eviction_watch"));
    for (const code of [...list.matchAll(/'([a-z_]+)'/g)].map(m => m[1])) assert.ok(COLLECTION_STATUS[code], code);
  });
  test("negative money shows in parentheses", () => assert.equal(fmtCents(-9500), "($95.00)"));
});

describe("the corrected business rules", () => {
  test("every recovery status, state and flag the database returns has plain text", () => {
    const rec = migration.slice(migration.indexOf("FUNCTION public.a3_return_recovery"), migration.indexOf("-- Per set of books: account 2190"));
    for (const code of [...rec.matchAll(/THEN '([a-z_]+)'/g)].map(m => m[1])) assert.ok(RECOVERY_STATUS_TEXT[code], code);
    assert.deepEqual([...RECOVERY_DONE].sort(), ["not_required", "recovered"]);
    const eco = migration.slice(migration.indexOf("FUNCTION public.a3_platform_economics"), migration.indexOf("-- Modus's income statement for a period"));
    for (const code of [...eco.matchAll(/THEN '([a-z_]+)' END,?\s/g)].map(m => m[1])) assert.ok(MODUS_FLAG_TEXT[code], code);
    for (const k of ["collected", "returned", "failed_before_settlement"]) assert.ok(COLLECTION_STATE_TEXT[k], k);
    for (const k of ["withheld_at_stripe", "owed_by_owner", "none"]) assert.ok(FEE_COLLECTION_TEXT[k], k);
    for (const k of ["ach_return", "dispute", "offline_return"]) assert.ok(RETURN_KIND_TEXT[k], k);
  });
  test("a rental credit reads as an adjustment to the tenant, never as a charge", () => {
    const [row] = ledgerToActivity([{ ref_id: "x", seq: 1, kind: "rental_credit", description: "Rental credit · Goodwill", charge_cents: -10000, payment_cents: 0, balance_cents: 90000, event_date: "2026-11-03" }]);
    assert.equal(row.type, "payment"); assert.equal(row.amount, 100);
  });
  test("collections CSV keeps the three kinds of credit in separate columns", () => {
    const csv = parseCSV(collectionsCSV([{ tenant_name: "T", open_cents: 1, overdue_cents: 0, current_cents: 1, d30_cents: 0, d60_cents: 0, d90_cents: 0, late_fee_open_cents: 0, rental_credit_cents: 500, cash_overpayment_cents: 700, opening_credit_cents: 900, days_past_due: 0, overdue_charges: 0, payment_status: "not_yet_due" }], { scopeLabel: "x", asOf: "y" }));
    const head = csv.find(r => r[0] === "Tenant"), row = csv.find(r => r[0] === "T");
    assert.equal(row[head.indexOf("Rental credit")], "5.00"); assert.equal(row[head.indexOf("Cash overpayment")], "7.00"); assert.equal(row[head.indexOf("Opening credit")], "9.00");
  });
  test("rent has no cash-refund button; a rental credit is the adjustment", () => {
    const a = src("src/PaymentActions.jsx"), l = src("src/TenantLedger.jsx");
    assert.match(a, /remaining > 0 && !isRent/); assert.match(a, /a3_record_payment_return/);
    assert.match(l, /a3_issue_rental_credit/); assert.match(l, /Issue rental credit/);
    assert.match(l, /an adjustment, not money received/); assert.match(l, /cash received/);
  });
  test("Pay Rent takes its amount from the ledger, never from recurring charges", () => {
    const r = src("src/RentPaymentScreen.jsx");
    assert.match(r, /supabase\.rpc\("a3_pay_rent_due"/); assert.match(r, /disabled=\{!\(payableCents > 0\)\}/); assert.match(r, /amount_cents:\s+payableCents/);
    assert.doesNotMatch(r, /recurringCharges|tenant\?\.rent|grossRent/);
    assert.match(r, /Not included in this payment/);
    assert.match(r, /error \|\| !data \? \{ ledger_active: false \}/, "no ledger figure means no online payment");
  });
  test("the payment function checks the ledger before it calls Stripe, and sends a key", () => {
    const fn = src("supabase/functions/create-payment-intent/index.ts");
    const check = fn.indexOf('supabase.rpc("a2_pay_rent_internal"'), stripe = fn.indexOf('"https://api.stripe.com/v1/payment_intents"');
    assert.ok(check > 0 && check < fn.indexOf("/v1/customers/") && check < stripe);
    assert.match(fn, /amount_cents !== payableCents/); assert.match(fn, /"Idempotency-Key": idempotencyKey/); assert.match(fn, /if \(!isPayRent\) return/);
  });
  test("Autopay is shown as unavailable and nothing saves it or claims it's on", () => {
    for (const f of ["src/RentPaymentScreen.jsx", "src/Wallet.jsx"]) {
      const r = src(f);
      assert.match(r, /Not available yet/, f); assert.match(r, /aren't available yet/, f);
      assert.doesNotMatch(r, /autopay_enabled|Autopay active|automatically on the 1st|Automatically pay|Auto-pay|setAutopay|Enable autopay/i, f);
    }
    for (const f of ["src/LandlordTenantDetail.jsx", "src/LandlordTenants.jsx"]) {
      const r = src(f);
      assert.match(r, /Autopay not available yet/, f); assert.doesNotMatch(r, /Autopay On|Autopay Off/, f);
    }
  });
  test("a direct repayment is its own record, apart from Stripe reversals", () => {
    const r = src("src/Receivables.jsx");
    for (const n of ["a3_record_owner_repayment", "a3_recovery_tie", "Reversed in Stripe", "Repaid directly", "Record direct repayment"]) assert.ok(r.includes(n), n);
    const rec = migration.slice(migration.indexOf("FUNCTION public.a3_return_recovery"), migration.indexOf("-- Per set of books: account 2190"));
    assert.match(rec, /direct_repaid_cents/); assert.match(rec, /b\.payment_return_id = r\.id AND b\.voided_at IS NULL/);
    assert.match(rec, /e\.reversed > 0 OR d\.repaid > 0/);
  });
  test("Modus's reports are on screen, and 6100 is labelled for the owner's books", () => {
    const r = src("src/Receivables.jsx");
    for (const n of ["a3_modus_income", "a3_return_recovery", "a3_fee_payable_check", "Returned payments: recovery", "Modus financials"]) assert.ok(r.includes(n), n);
    assert.match(migration, /SET name = 'Modus Management Fee' WHERE/);
    assert.match(migration, /Modus Management Fee Revenue/);
  });
  test("a recoverable amount is named as one, and a credit can't be dated into arrears on screen", () => {
    const r = src("src/Receivables.jsx"), l = src("src/TenantLedger.jsx");
    assert.match(r, /Recoverable from owner/); assert.match(migration, /Recoverable from owners: returned or refunded rent/);
    assert.match(l, /min=\{nextMonthFirst\(todayNY\(\)\)\}/); assert.match(l, /is open now/);
    assert.match(migration, /a rental credit applies to next month''s rent or later/);
  });
  test("Modus never initiates a reversal: the webhook only reads from Stripe", () => {
    const w = src("supabase/functions/_shared/stripe-events.js");
    assert.match(w, /charge\.dispute\.created/); assert.match(w, /transfer\.reversed/);
    assert.doesNotMatch(w, /method:\s*["']POST["']|reverse_transfer|\/reversals["'`],\s*\{/);
    assert.doesNotMatch(src("src/Receivables.jsx"), /functions\.invoke/);
  });
});

describe("screen wiring", () => {
  test("the worklist reads the receivables ledger, never legacy balances", () => {
    const c = src("src/Collections.jsx");
    assert.match(c, /a3_collections/); assert.match(c, /a2_tenant_open_charges/);
    assert.doesNotMatch(c, /balance_due|from\("payments"\)|outstanding_balance/);
  });
  test("re-application goes through the stored record and needs a reason; the old pin calls are gone", () => {
    const l = src("src/TenantLedger.jsx");
    assert.match(l, /a3_reapply/); assert.match(l, /p_reason/); assert.match(l, /a3_reverse_application/); assert.match(l, /a3_application_history/);
    // Until A3 is released, the A2 build uses A2's pin calls, behind the switch.
    assert.match(l, /A3_ENABLED\s*\n?\s*\? await supabase\.rpc\("a3_reapply"/);
  });
  test("the Balance Sheet surfaces what would otherwise mislead", () => {
    const f = src("src/FinancialPosition.jsx");
    for (const needle of ["no opening balances entered", "could not be posted", "not a consolidated statement", "Not on a cash-basis Balance Sheet", "Property values and loans", "is owed to Modus until the transfer is reversed", "Modus owes this owner", "owed on rent collected outside Stripe"]) assert.ok(f.includes(needle), needle);
  });
  test("the comparison uses the same Income Statement function, so the cash-basis policy can't drift", () => {
    const i = src("src/IncomeStatement.jsx");
    assert.equal((i.match(/supabase\.rpc\("a1_income_statement"/g) || []).length, 2);
    assert.doesNotMatch(src("src/lib/accounting.js"), /supabase\./);
  });
  test("reports and tabs are reachable", () => {
    const r = src("src/LandlordReports.jsx"), f = src("src/LandlordFinancials.jsx");
    assert.match(r, /id: "balance"/); assert.match(r, /<BalanceSheet \/>/); assert.match(r, /id: "trial"/); assert.match(r, /<TrialBalance \/>/);
    assert.match(f, /collections:"Collections"/); assert.match(f, /owner:"Owner & Cash"/); assert.match(f, /initialTenant/);
    assert.match(src("src/LandlordTenantDetail.jsx"), /searchParams\.get\("tab"\)/);
  });
  test("the webhook module still never issues anything at Stripe", () => {
    const w = src("supabase/functions/_shared/stripe-events.js");
    assert.doesNotMatch(w, /method:\s*["']POST["']|stripePost|\.refunds\.create|reverse_transfer/);
  });
});

describe("migration rules", () => {
  test("A1's classifier and posting engine aren't redefined; A1's rules stay as accepted", () => {
    assert.doesNotMatch(migration, /CREATE (OR REPLACE )?FUNCTION public\.a1_classify_payment|CREATE (OR REPLACE )?FUNCTION public\.a1_sync|CREATE (OR REPLACE )?FUNCTION public\.a1_payment_account|CREATE (OR REPLACE )?FUNCTION public\.a1_expense_account/);
  });
  test("it can't be pushed by accident: it's one transaction with a guarded rollback", () => {
    assert.match(migration, /^BEGIN;$/m); assert.match(migration, /^COMMIT;$/m); assert.match(migration, /A3 rollback refused/);
  });
  test("the earlier migrations are untouched", () => {
    const sha = (f) => import("node:crypto").then(c => c.createHash("sha256").update(readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url))).digest("hex"));
    return Promise.all([sha("20261103000000_a1_ledger_foundation.sql"), sha("20261104000000_a2_receivables.sql")]).then(([a, b]) => {
      assert.equal(a, "2ea0df8f8b8641d391294dd98fd58653bf0c964b0c79c4288f43149f3b7c5471");
      assert.equal(b, "8c0bcf0af596dc37dc51e5598b7468d2425b755ea51c56068326d4f3e5d8e50f");
    });
  });
});
