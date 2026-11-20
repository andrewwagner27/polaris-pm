// Execute the actual Deno endpoint in an isolated VM. All Stripe/DB/auth I/O is fake.
// These are handler integration tests, not evidence of a Stripe sandbox settlement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { stripePublishableKey } from '../src/lib/stripeConfig.js';

const source = readFileSync(new URL('../supabase/functions/create-payment-intent/index.ts', import.meta.url), 'utf8');
const executable = stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm, ''));
function harness(options = {}) {
  const requests = [], records = [], tokenUpdates = [];
  const tenant = { user_id: 'user-test', unit_id: 'unit-test' };
  const rows = {
    tenants: options.foreignTenant ? { ...tenant, user_id: 'other-user' } : tenant,
    tenant_payment_methods: options.foreignCustomer ? null : { id: 'saved-test' },
    units: { property_id: 'property-test' }, properties: { owner_email: 'owner@example.invalid' },
    landlords: options.noOwner ? null : { stripe_account_id: 'acct_test_owner', stripe_onboarded: true },
  };
  const FIXTURE_TOKEN = 'payrent:fixture-00000000-0000-0000-0000-000000000001';
  const db = {
    rpc: async (fn, params) => {
      if (fn === 'a2_pay_rent_internal') {
        return { data: { ledger_active: true, payable_cents: 150000, open_rent_cents: 150000, pending_cents: 0 }, error: options.ledgerError ? { message: 'unavailable' } : null };
      }
      if (fn === 'acquire_payment_token') {
        if (options.tokenError) return { data: null, error: { message: 'DB error' } };
        const context = params.p_context;
        if (options.conflictingToken) {
          return { data: [{ token: FIXTURE_TOKEN, context: 'different:context:value', is_new: false }], error: null };
        }
        return { data: [{ token: FIXTURE_TOKEN, context, is_new: true }], error: null };
      }
      return { data: null, error: { message: `Unexpected RPC: ${fn}` } };
    },
    from(table) {
      const q = {
        select() { return q; }, eq() { return q; }, limit() { return q; },
        maybeSingle: async () => ({ data: rows[table], error: null }),
        update(fields) {
          if (table === 'payment_idempotency_tokens') tokenUpdates.push(fields);
          return q;
        },
        upsert: async (items) => { records.push(...items); return { error: options.recordError ? { message: 'unavailable' } : null }; },
      };
      return q;
    },
  };
  let handler;
  vm.runInNewContext(executable, {
    serve: fn => { handler = fn; }, adminClient: () => db,
    getCaller: async () => options.unauthenticated ? null : { user: { id: 'user-test' } },
    corsHeaders: () => ({}), json: (_req, body, status = 200) => Response.json(body, { status }),
    Response, URLSearchParams, console: { error() {} },
    Deno: { env: { get: () => 'test-key-not-real' } },
    fetch: async (url, init = {}) => {
      requests.push({ url, ...init });
      const path = new URL(url).pathname;
      if (path === '/v1/customers/cus_test') return Response.json({ metadata: { tenant_id: options.foreignCustomer ? 'other' : 'tenant-test' } });
      if (path === '/v1/payment_methods/pm_test') return Response.json({ type: options.card ? 'card' : 'us_bank_account', customer: options.foreignMethod ? 'cus_other' : 'cus_test' });
      if (path === '/v1/accounts/acct_test_owner') return Response.json({ id: 'acct_test_owner', details_submitted: true, charges_enabled: !options.unreadyOwner, payouts_enabled: true, capabilities: { transfers: 'active' } }, { status: options.missingOwner ? 404 : 200 });
      if (path === '/v1/payment_intents') {
        if (options.networkError) throw new Error('unreachable');
        if (options.stripeError) return Response.json({ error: { message: 'Bank debit was declined' } }, { status: 402 });
        return Response.json({ id: 'pi_sandbox_fixture', status: options.status || 'processing' });
      }
      throw new Error(`Unexpected network access: ${url}`);
    },
  });
  const run = async (body = {}, method = 'POST') => {
    const req = new Request('https://fixture.invalid', { method, ...(method === 'POST' ? { body: JSON.stringify({ tenant_id: 'tenant-test', customer_id: 'cus_test', payment_method_id: 'pm_test', purpose: 'rent', amount_cents: 150000, ...body }) } : {}) });
    const response = await handler(req);
    return { status: response.status, body: await response.json() };
  };
  return { run, requests, records, tokenUpdates };
}

test('$1,500 ACH processing: actual endpoint requests $75 fee and connected destination; records pending, never paid', async () => {
  const h = harness(); const r = await h.run();
  assert.equal(r.status, 200); assert.equal(r.body.status, 'processing');
  const create = h.requests.find(x => x.method === 'POST');
  assert.equal(create.url, 'https://api.stripe.com/v1/payment_intents');
  const p = create.body;
  assert.equal(p.get('amount'), '150000'); assert.equal(p.get('application_fee_amount'), '7500');
  assert.equal(Number(p.get('amount')) - Number(p.get('application_fee_amount')), 142500);
  assert.equal(p.get('transfer_data[destination]'), 'acct_test_owner');
  assert.equal(p.get('payment_method_types[]'), 'us_bank_account');
  assert.equal([...p.keys()].some(k => k.includes('mandate_data')), false);
  assert.equal(h.records.length, 1); assert.equal(h.records[0].status, 'pending');
  assert.equal(h.records[0].amount_cents, 150000); assert.equal(h.records[0].platform_fee_cents, 7500);
  assert.equal(h.records[0].origin, 'tenant_pay_rent');
  // Token committed after DB record succeeds
  assert.ok(h.tokenUpdates.some(u => u.status === 'committed'));
});

for (const [name, options, body, expected] of [
  ['no session', { unauthenticated: true }, {}, 401],
  ['wrong tenant', { foreignTenant: true }, {}, 403],
  ['wrong customer', { foreignCustomer: true }, {}, 403],
  ['wrong bank owner', { foreignMethod: true }, {}, 403],
  ['card instead of ACH', { card: true }, {}, 403],
  ['stale ledger amount', {}, { amount_cents: 1 }, 409],
  ['ledger failure', { ledgerError: true }, {}, 409],
  ['token acquisition failure', { tokenError: true }, {}, 409],
  ['owner not mapped', { noOwner: true }, {}, 409],
  ['owner no longer ready', { unreadyOwner: true }, {}, 409],
  ['owner from different Stripe account or mode', { missingOwner: true }, {}, 409],
]) test(`${name}: no charge and no payment row`, async () => {
  const h = harness(options); const r = await h.run(body);
  assert.equal(r.status, expected); assert.equal(h.requests.some(x => x.method === 'POST'), false);
  assert.equal(h.records.length, 0);
});

test('conflicting in-flight payment: existing pending token with different context returns 409 without calling Stripe', async () => {
  const h = harness({ conflictingToken: true }); const r = await h.run();
  assert.equal(r.status, 409);
  assert.match(r.body.error, /already being processed/);
  assert.equal(h.requests.some(x => x.method === 'POST'), false);
  assert.equal(h.records.length, 0);
});

for (const options of [{ stripeError: true }, { networkError: true }, { status: 'requires_action' }, { status: 'requires_payment_method' }, { status: 'canceled' }]) {
  test(`Stripe ${JSON.stringify(options)} never produces submitted success or pending row`, async () => {
    const h = harness(options); const r = await h.run();
    assert.ok(r.status >= 400); assert.ok(r.body.error); assert.equal(h.records.length, 0);
    // Token marked failed so the user can retry
    assert.ok(h.tokenUpdates.some(u => u.status === 'failed'));
  });
}
test('submitted payment with database failure warns against paying again and includes reconciliation reference', async () => {
  const h = harness({ recordError: true }); const r = await h.run();
  assert.equal(r.status, 503); assert.match(r.body.error, /Do not pay again/);
  assert.equal(r.body.payment_intent_id, 'pi_sandbox_fixture');
  // Token stays pending (not released) so the user cannot double-pay on retry
  assert.equal(h.tokenUpdates.filter(u => u.status === 'committed' || u.status === 'failed').length, 0);
});
test('same observed ledger state sends same Stripe idempotency key across retries', async () => {
  const h = harness(); await h.run(); await h.run();
  const keys = h.requests.filter(x => x.method === 'POST').map(x => x.headers['Idempotency-Key']);
  assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
  // Key comes from a durable DB token, not a time bucket — safe across any timing boundary.
});
test('GET is rejected before Stripe or database access', async () => {
  const h = harness(); assert.equal((await h.run({}, 'GET')).status, 405); assert.equal(h.requests.length, 0);
});
test('frontend accepts only publishable keys, blocks live keys outside production and fails closed when missing', () => {
  assert.equal(stripePublishableKey('pk_test_fixture', 'preview'), 'pk_test_fixture');
  assert.equal(stripePublishableKey('pk_live_fixture', 'production'), 'pk_live_fixture');
  for (const env of ['preview', 'development', 'unknown', undefined]) assert.equal(stripePublishableKey('pk_live_fixture', env), null);
  for (const key of ['', undefined, 'sk_live_fixture', 'rk_test_fixture', 'garbage']) assert.equal(stripePublishableKey(key, 'production'), null);
});
