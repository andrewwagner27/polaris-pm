// A2 receivables: pure helpers and wiring. The accounting itself is tested against the real migration
// in the PGlite harness; these cover what the screens do with its results.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isCollected, netPaymentCents, refundsByPayment, receiptLinesFromForm, openByCategory, ledgerBalanceCents,
  ledgerToActivity, paymentChannel, delinquencyCSV, balanceDisplayRows, balanceTotals, parseCSV, paymentCents, fmtCents, centsToDecimal,
} from "../src/lib/accounting.js";

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

describe("Payment History amounts (cents vs dollars)", () => {
  test("cent-denominated and dollar-denominated receipts both show their true amount", () => {
    assert.equal(fmtCents(paymentCents({ amount_cents: 150000, amount: null })), "$1,500.00");
    assert.equal(fmtCents(paymentCents({ amount_cents: null, amount: 1500 })), "$1,500.00");
  });
  test("Payment History no longer formats the raw dollar column", () => {
    const f = src("src/LandlordFinancials.jsx");
    assert.ok(f.includes("fmtCents(paymentCents(p))"));
    assert.ok(!/fmt\(p\.amount\)/.test(f));
  });
});

describe("how a payment reached Modus", () => {
  test("Stripe Pay Rent, other Stripe, and offline are labeled distinctly", () => {
    assert.equal(paymentChannel({ origin: "tenant_pay_rent", stripe_payment_intent_id: "pi", source: "ach" }), "Stripe · Pay Rent");
    assert.equal(paymentChannel({ stripe_payment_intent_id: "pi", source: "ach" }), "Stripe");
    assert.equal(paymentChannel({ source: "ach" }), "Offline · ach", "ACH recorded by the landlord is an offline bank transfer");
    assert.equal(paymentChannel({ method: "ach" }), "Offline", "production's payments has no method column, so it is never read");
    assert.equal(paymentChannel({ source: "check" }), "Offline · check");
    assert.equal(paymentChannel({}), "Offline");
  });
});

describe("voids and refunds in landlord totals", () => {
  const paid = { id: "a", status: "paid", amount_cents: 10000 };
  test("a voided payment is not money collected", () => {
    assert.equal(isCollected(paid), true);
    assert.equal(isCollected({ ...paid, voided_at: "2026-11-02T00:00:00Z" }), false);
    assert.equal(isCollected({ ...paid, status: "pending" }), false);
    assert.equal(netPaymentCents({ ...paid, voided_at: "2026-11-02T00:00:00Z" }), 0);
  });
  test("refunds reduce the net by exactly the refunded amount, across several refunds", () => {
    const m = refundsByPayment([{ payment_id: "a", amount_cents: 1500 }, { payment_id: "a", amount_cents: 500 }, { payment_id: "b", amount_cents: 7 }]);
    assert.deepEqual(m, { a: 2000, b: 7 });
    assert.equal(netPaymentCents(paid, m), 8000);
  });
  test("no refund data (A2 not applied yet) changes nothing", () => {
    assert.deepEqual(refundsByPayment(null), {});
    assert.equal(netPaymentCents(paid), 10000);
  });
});

describe("Record Payment lines (D5: one receipt per category)", () => {
  test("two categories become two exact-cent receipts", () => {
    const { lines, error } = receiptLinesFromForm([{ category: "Rent", amount: "1,500.00" }, { category: "Late Fee", amount: "50" }]);
    assert.equal(error, undefined);
    assert.deepEqual(lines, [{ category: "Rent", cents: 150000 }, { category: "Late Fee", cents: 5000 }]);
  });
  test("no float error", () => {
    assert.equal(receiptLinesFromForm([{ category: "Rent", amount: "1234.56" }]).lines[0].cents, 123456);
    assert.equal(receiptLinesFromForm([{ category: "Rent", amount: "19.99" }]).lines[0].cents, 1999);
  });
  test("every line needs a category and a positive amount; category is never assumed", () => {
    assert.match(receiptLinesFromForm([{ category: "", amount: "5" }]).error, /what each payment line is for/);
    assert.match(receiptLinesFromForm([{ category: "Rent", amount: "0" }]).error, /greater than \$0/);
    assert.match(receiptLinesFromForm([{ category: "Rent", amount: "1.234" }]).error, /up to 2 decimals/);
    assert.match(receiptLinesFromForm([{ category: "Mystery", amount: "5" }]).error, /Unknown category/);
    assert.match(receiptLinesFromForm([]).error, /at least one/);
  });
  test("the same category twice is refused rather than silently merged", () => {
    assert.match(receiptLinesFromForm([{ category: "Rent", amount: "5" }, { category: "Rent", amount: "6" }]).error, /listed twice/);
  });
  test("deposits can be recorded, but aren't offered as a charge", () => {
    assert.equal(receiptLinesFromForm([{ category: "Security Deposit", amount: "1000" }]).lines[0].cents, 100000);
  });
  test("both Record Payment forms insert one row per line in a single statement", () => {
    for (const f of ["src/LandlordFinancials.jsx", "src/LandlordTenantDetail.jsx"]) {
      assert.ok(src(f).includes(`from("payments").insert(lines.map(`), f);
      assert.ok(src(f).includes("<PaymentLinesField"), f);
    }
  });
});

describe("open charges and balances", () => {
  test("open charges group by category; fully paid charges are left out", () => {
    assert.deepEqual(openByCategory([
      { category: "Rent", open_cents: 100 }, { category: "Rent", open_cents: 50 },
      { category: "Late Fee", open_cents: 5000 }, { category: "Parking", open_cents: 0 },
    ]), [{ category: "Rent", cents: 150 }, { category: "Late Fee", cents: 5000 }]);
  });
  test("the balance is the ledger's last running balance", () => {
    assert.equal(ledgerBalanceCents([{ balance_cents: 100 }, { balance_cents: -25 }]), -25);
    assert.equal(ledgerBalanceCents([]), 0);
    assert.equal(ledgerBalanceCents(null), 0);
  });
});

describe("tenant Activity screen", () => {
  const rows = [
    { seq: 1, ref_id: "c", kind: "charge", description: "Rent 2026-11", charge_cents: 150000, payment_cents: 0, balance_cents: 150000, event_date: "2026-11-01" },
    { seq: 2, ref_id: "p", kind: "payment", description: "Payment · Rent", charge_cents: 0, payment_cents: 100000, balance_cents: 50000, event_date: "2026-11-03" },
    { seq: 3, ref_id: "r", kind: "refund", description: "Refund · Overcharge", charge_cents: 2500, payment_cents: 0, balance_cents: 52500, event_date: "2026-11-04" },
    { seq: 4, ref_id: "v", kind: "void_payment", description: "Payment · VOID: typo", charge_cents: 0, payment_cents: 0, balance_cents: 52500, event_date: "2026-11-04" },
  ];
  test("shows real rows newest first in dollars, and hides $0 void rows from the tenant", () => {
    const a = ledgerToActivity(rows);
    assert.equal(a.length, 3);
    assert.equal(a[0].description, "Refund to you");
    assert.equal(a[0].running_balance, 525);
    assert.equal(a[2].amount, 1500);
  });
  test("never invents a charge once receivables are active", () => {
    const f = src("src/ActivityLedger.jsx");
    // The real ledger is read first (fetchTenantLedger: a2_status, then a2_tenant_ledger); its rows are the
    // only source of charges, and payment records are fetched only when the ledger isn't in use.
    assert.ok(f.includes("await fetchTenantLedger(supabase)"));
    assert.ok(/isLedger \? ledgerToActivity\(ledger\.rows\)/.test(f));
    assert.ok(/result\.mode !== "ledger"[\s\S]{0,400}from\("payments"\)/.test(f), "payment records only when the ledger isn't in use");
    assert.doesNotMatch(f, /buildFromPayments|buildLedger|ledger_entries/, "no legacy reconstruction remains");
  });
});

describe("delinquency report and CSV", () => {
  const rows = [
    { tenant_name: 'Lee, "Sam"', property_name: "Clifton", books_name: "Polaris", open_cents: 155100, credit_cents: 0, balance_cents: 155100 },
    { tenant_name: "Ann", property_name: "", books_name: "Wagner", open_cents: 0, credit_cents: 2500, balance_cents: -2500 },
  ];
  test("the total is the sum of the tenants, and balance = open − credit", () => {
    const t = balanceTotals(rows);
    assert.equal(t.balance_cents, 152600);
    assert.equal(t.open_cents - t.credit_cents, t.balance_cents);
  });
  test("the CSV has exactly the rows on the screen, in exact decimals", () => {
    const parsed = parseCSV(delinquencyCSV(rows, { scopeLabel: "Portfolio", asOf: "2026-11-02" }));
    const header = parsed.findIndex(r => r[0] === "Tenant");
    const body = parsed.slice(header + 1);
    const screen = balanceDisplayRows(rows);
    assert.equal(body.length, screen.length);
    screen.forEach((r, i) => {
      assert.equal(body[i][0], r.name);
      assert.equal(body[i].at(-1), centsToDecimal(r.balance_cents));
    });
    assert.equal(body[0][0], 'Lee, "Sam"');
    assert.equal(body.at(-1)[0], "Total");
    assert.equal(body.at(-1).at(-1), "1526.00");
  });
});

describe("wiring", () => {
  test("Receivables, Delinquency, the Ledger tab and payment actions are reachable", () => {
    assert.ok(src("src/LandlordFinancials.jsx").includes("<Receivables tenants={tenants}"));
    assert.ok(src("src/LandlordReports.jsx").includes("<DelinquencyReport properties={properties}/>"));
    assert.ok(src("src/LandlordTenantDetail.jsx").includes("<TenantLedger tenantId={id}/>"));
    for (const f of ["src/LandlordFinancials.jsx", "src/LandlordTenantDetail.jsx"]) assert.ok(src(f).includes("<PaymentActions"), f);
  });
  test("Rent is set only by the Pay Rent workflow, server-side", () => {
    assert.ok(src("src/RentPaymentScreen.jsx").includes(`purpose:           "rent"`));
    assert.ok(src("supabase/functions/create-payment-intent/index.ts").includes(`...(isPayRent ? { category: "Rent", origin: "tenant_pay_rent" } : {})`));
  });
  test("the Stripe fee is captured, never posted to owner books", () => {
    const m = src("supabase/migrations/20261104000000_a2_receivables.sql");
    assert.ok(!/INSERT INTO (public\.)?journal_lines[\s\S]{0,200}stripe_fee_cents/.test(m));
    assert.ok(!/fee_cents :=[^;]*stripe_fee_cents/.test(m));
  });
  test("A2 ships without A3: the switch is off, and Pay Rent uses A2's own ledger check", () => {
    assert.match(src("src/lib/release.js"), /A3_ENABLED = false/);
    assert.ok(src("src/RentPaymentScreen.jsx").includes('supabase.rpc("a2_pay_rent_due"'));
    assert.ok(src("supabase/functions/create-payment-intent/index.ts").includes('supabase.rpc("a2_pay_rent_internal"'));
    assert.doesNotMatch(src("supabase/functions/create-payment-intent/index.ts"), /a3_/);
    for (const f of ["src/Receivables.jsx", "src/TenantLedger.jsx", "src/PaymentActions.jsx", "src/RentPaymentScreen.jsx", "src/LandlordFinancials.jsx", "src/LandlordReports.jsx"]) assert.match(src(f), /A3_ENABLED/, f);
  });
  test("no aging report ships in A2", () => {
    const m = src("supabase/migrations/20261104000000_a2_receivables.sql");
    assert.doesNotMatch(m, /aging|bucket/i);
    assert.doesNotMatch(m, /d30_cents|d60_cents|d90_cents|current_cents/);
    for (const f of ["src/LandlordReports.jsx", "src/Receivables.jsx", "src/Collections.jsx", "src/FinancialPosition.jsx", "src/lib/accounting.js"]) assert.doesNotMatch(src(f), /aging|AGING|AgingReport/, f);
    assert.throws(() => src("src/AgingReport.jsx"), /ENOENT/);
  });
  test("A2 reads only columns production has: no payments.method anywhere", () => {
    assert.doesNotMatch(src("supabase/migrations/20261104000000_a2_receivables.sql"), /\bp\.method\b|\bpy\.method\b|payments\.method/);
    assert.doesNotMatch(src("src/lib/accounting.js"), /\.method\b/);
  });
  test("the payment function reads only columns production has, and refuses rent with no route to the owner", () => {
    const fn = src("supabase/functions/create-payment-intent/index.ts");
    assert.doesNotMatch(fn, /property_id, user_id|tenant\?\.property_id|landlord_id/);
    assert.match(fn, /select\("owner_email"\)/);
    const guard = fn.indexOf("if (!ownerStripeAccountId)"), stripe = fn.indexOf('"https://api.stripe.com/v1/payment_intents"');
    assert.ok(guard > 0 && guard < stripe, "the check comes before any charge");
  });
  test("the tenant is told clearly when online rent isn't set up, and the landlord sees which properties and why", () => {
    const r = src("src/RentPaymentScreen.jsx"), m = src("supabase/migrations/20261104000000_a2_receivables.sql");
    assert.match(r, /due\.online_available === false/); assert.match(r, /Nothing has been charged/); assert.match(r, /pay your rent to your property manager directly/);
    assert.match(m, /'online_available', v_route/); assert.match(m, /FUNCTION public\.a2_payment_route_gaps\(\)/);
    assert.ok(src("src/LandlordFinancials.jsx").includes("<PaymentRouteWarning/>"));
    assert.match(src("src/PaymentRouteWarning.jsx"), /a2_payment_route_gaps/);
    assert.match(src("supabase/functions/create-payment-intent/index.ts"), /nothing was charged/);
  });
  test("generation skips an inactive schedule", () => {
    assert.match(src("supabase/migrations/20261104000000_a2_receivables.sql"), /skipped: schedule inactive/);
  });
  test("the cutover is never hard-coded", () => {
    const m = src("supabase/migrations/20261104000000_a2_receivables.sql");
    assert.ok(m.includes("cutover_date    date,"));
    assert.ok(/INSERT INTO public\.a2_settings DEFAULT VALUES/.test(m));
  });
});
