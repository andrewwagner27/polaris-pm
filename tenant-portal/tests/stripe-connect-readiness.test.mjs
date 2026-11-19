import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const webhook = readFileSync(new URL('../supabase/functions/stripe-webhook/index.ts', import.meta.url), 'utf8');

test('landlord onboarding requires both payment acceptance and payouts', () => {
  assert.match(webhook, /account\.details_submitted === true/);
  assert.match(webhook, /account\.charges_enabled === true/);
  assert.match(webhook, /account\.payouts_enabled === true/);
  assert.match(webhook, /stripe_onboarded: ready/);
});

test('Connect updates target the stored Stripe account, not arbitrary event metadata', () => {
  assert.match(webhook, /\.eq\("stripe_account_id", account\.id\)/);
  assert.doesNotMatch(webhook, /account\?\.metadata\?\.landlord_id/);
});

test('failed readiness updates cause Stripe to retry the webhook', () => {
  assert.match(webhook, /account readiness update failed/);
  assert.match(webhook, /return new Response\("Processing failed", \{ status: 500 \}\)/);
});
