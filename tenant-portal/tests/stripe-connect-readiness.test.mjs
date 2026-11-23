import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const webhook = readFileSync(new URL('../supabase/functions/stripe-webhook/index.ts', import.meta.url), 'utf8');

test('landlord onboarding requires both payment acceptance and payouts', () => {
  assert.match(webhook, /account\.details_submitted === true/);
  assert.match(webhook, /account\.charges_enabled === true/);
  assert.match(webhook, /account\.payouts_enabled === true/);
  // Only advance to true; never write false (transient Stripe reviews must not block payments).
  assert.match(webhook, /stripe_onboarded: true/);
  assert.doesNotMatch(webhook, /stripe_onboarded: ready/);
});

test('Connect updates target the stored Stripe account, not arbitrary event metadata', () => {
  // connectedAccountId comes from event.account (top-level, not payload metadata).
  assert.match(webhook, /\.eq\("stripe_account_id", connectedAccountId\)/);
  assert.doesNotMatch(webhook, /account\?\.metadata\?\.landlord_id/);
});

test('failed readiness updates cause Stripe to retry the webhook', () => {
  assert.match(webhook, /account readiness update failed/);
  assert.match(webhook, /return new Response\("Processing failed", \{ status: 500 \}\)/);
});
