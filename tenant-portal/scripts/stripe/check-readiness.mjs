// Read-only launch preflight. Never creates payments, webhooks, keys or Connect accounts.
// Secret supplied through the environment; output contains no key values or customer data.
import { STRIPE_PAYMENT_EVENTS } from '../../supabase/functions/_shared/stripe-events.js';
const mode = process.argv.find(x => x.startsWith('--mode='))?.slice(7);
const expectedAccount = process.argv.find(x => x.startsWith('--account='))?.slice(10);
const destination = process.argv.find(x => x.startsWith('--destination='))?.slice(14);
const endpoint = process.argv.find(x => x.startsWith('--webhook='))?.slice(10);
const key = process.env.STRIPE_SECRET_KEY || '';
if (!['sandbox', 'live'].includes(mode) || !expectedAccount || !destination || !endpoint) {
  console.error('Required: --mode=sandbox|live --account=acct_... --destination=acct_... --webhook=https://...');
  process.exit(2);
}
const prefix = mode === 'live' ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/;
if (!prefix.test(key)) {
  console.error('Missing Stripe key or key mode does not match the explicitly selected mode.');
  process.exit(2);
}
const get = async path => {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${key}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(`Stripe read failed (HTTP ${res.status}, code ${body.error?.code || 'unknown'}).`);
  return body;
};
try {
  const account = await get('account');
  if (account.id !== expectedAccount) throw new Error('Authenticated Stripe platform differs from expected account.');
  const owner = await get(`accounts/${encodeURIComponent(destination)}`);
  const ready = owner.details_submitted === true && owner.charges_enabled === true && owner.payouts_enabled === true && owner.capabilities?.transfers === 'active';
  const webhooks = [];
  let after = '';
  do {
    const page = await get(`webhook_endpoints?limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ''}`);
    webhooks.push(...page.data);
    after = page.has_more ? page.data.at(-1).id : '';
  } while (after);
  const hook = webhooks.find(x => x.url === endpoint && x.status === 'enabled' && x.livemode === (mode === 'live'));
  const required = [...STRIPE_PAYMENT_EVENTS, 'account.updated'];
  const missing = required.filter(x => !hook?.enabled_events?.includes('*') && !hook?.enabled_events?.includes(x));
  const report = { mode, expectedAccount, ownerReady: ready, webhookReady: !!hook && !missing.length, missingEvents: missing,
    note: 'Readiness metadata only; does not verify bank mandate, actual settlement, webhook signature secret, ledger reconciliation or browser flow.' };
  console.log(JSON.stringify(report, null, 2));
  if (!ready || !hook || missing.length) process.exitCode = 1;
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
