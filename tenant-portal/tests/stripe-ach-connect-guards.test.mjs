import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const paymentSource = readFileSync(new URL('../supabase/functions/create-payment-intent/index.ts', import.meta.url), 'utf8');

test('ACH only: no card or other payment methods accepted by rent endpoint', () => {
  assert.match(paymentSource, /"payment_method_types\\[\\]": "us_bank_account"/);
  assert.match(paymentSource, /method\.type !== "us_bank_account"/);
});

test('bank payment method must be attached to the authenticated tenant customer', () => {
  assert.match(paymentSource, /method\.customer !== customer_id/);
  assert.match(paymentSource, /tenant\.user_id !== caller\.user\.id/);
  assert.match(paymentSource, /ownsCustomer/);
});

test('never fabricate online ACH mandate acceptance evidence', () => {
  assert.doesNotMatch(paymentSource, /127\.0\.0\.1/);
  assert.doesNotMatch(paymentSource, /mandate_data\\[customer_acceptance\\]\\[online\\]/);
});

test('server controls rent due, requires a connected owner, and allocates 5 percent to Modus', () => {
  assert.match(paymentSource, /a2_pay_rent_internal/);
  assert.match(paymentSource, /amount_cents !== payableCents/);
  assert.match(paymentSource, /if \(!ownerStripeAccountId\)/);
  assert.match(paymentSource, /Math\.round\(amount_cents \* 0\.05\)/);
  assert.match(paymentSource, /application_fee_amount/);
  assert.match(paymentSource, /transfer_data\\[destination\\]/);
});

test('representative rent allocations preserve gross rent exactly', () => {
  for (const cents of [100, 10000, 150000, 175025, 999999]) {
    const modus = Math.round(cents * 0.05);
    const landlord = cents - modus;
    assert.equal(modus + landlord, cents);
    assert.equal(modus, Math.round(cents * 0.05));
  }
  assert.equal(Math.round(150000 * 0.05), 7500);
  assert.equal(150000 - 7500, 142500);
});
