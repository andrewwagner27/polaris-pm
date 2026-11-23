# PR #2: ACH sandbox verification and launch handoff

Status checked November 18, 2026 (America/New_York). This branch is not released.
No production data, Stripe settings, keys or financial transactions were changed.

## Verified

- Initial branch test suite: 831 passed; production build passed.
- Final branch validation: 852 tests passed, 0 failed; production build passed. Existing bundle-size/dynamic-import warnings remain. Readiness helper passed syntax validation and rejected missing credentials without sending a request.
- Runtime tests execute the actual TypeScript rent endpoint in a Node VM with injected auth, database and Stripe responses. They verify $1,500 rent / $75 application fee / $1,425 landlord allocation; pending status until webhook settlement; bank ownership, ACH-only, wrong tenant, ledger mismatch/unavailability, stale onboarding, unavailable destination, Stripe/network failures, unsupported payment statuses and failed DB recording.
- Existing event tests cover settlement, duplicate event ledger behavior, processing failure, partial/pending/failed refunds, late ACH returns/disputes and recovery records. These are local tests, not hosted database or real Stripe settlement evidence.
- Both bank-linking screens now use `VITE_STRIPE_PUBLISHABLE_KEY`. Preview/development refuses a live publishable key, and missing/invalid configuration shows an unavailable state rather than a bank form. The published key was public by design; this change addresses environment mismatch, not a secret-key leak.
- Rent endpoint checks the connected destination with its own Stripe key immediately before creating a charge, instead of trusting a potentially stale `stripe_onboarded` flag alone.
- Unsupported PaymentIntent statuses cannot show submitted success. A submitted payment whose pending row cannot be saved returns a reconciliation reference and a warning not to pay again.

## Actual Stripe and hosting state

| Environment | Platform | Verified state |
| --- | --- | --- |
| Sandbox | `acct_1TeL6HHoFqm9Llqh` | Two ready connected accounts. Intended landlord fixture: `acct_1UVhe1HWTjHm1swg`. Five old ACH payments, none for $1,500; those old payments have no destination/application fee. No new payment created. |
| Live | `acct_1TeL65HdLm1v28bs` | Zero connected accounts. A sandbox destination cannot receive live rent. |
| Supabase | `ynbxdbwxdydbpkzaffte` | Production Modus project. No separate Modus staging project exists. Finance Tool is a separate production app, not staging. |
| Vercel | `polaris-pm` | Preview and Production share Supabase and Stripe variable entries; no `VITE_STRIPE_PUBLISHABLE_KEY` configured yet. Metadata inspected without decrypting secrets. |

Both Stripe modes currently point webhooks at the production Supabase `stripe-webhook` URL.
The sandbox endpoint subscribes only to `payment_intent.succeeded`. The live endpoint subscribes to `payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated`, `charge.refunded`, `refund.created`, `refund.updated`.
Neither subscription is sufficient for all event handlers in `STRIPE_PAYMENT_EVENTS` (including failed refunds, fee refunds, late returns/disputes and transfer reversal).
A single `STRIPE_WEBHOOK_SECRET` cannot authenticate two independent endpoint secrets. Do not point sandbox tests at the production handler/database or overwrite its secrets.

## Remaining release blockers

1. **Actual $1,500 sandbox charge not completed.** The connector's operation discovery exposes reads but no payment creation operation. Dashboard fallback reaches sign-in. Sandbox write authorization or authenticated Dashboard access is required.
2. **Isolated app test backend missing.** Create an isolated staging/local Supabase environment with dummy tenant/ledger rows and disabled or allowlisted notifications. Do not seed or submit rent against production. Separate Stripe-only testing from a full signed-in app/ledger test in reports.
3. **Durable duplicate-charge protection not proven.** The existing Stripe idempotency key includes a 10-minute clock bucket and payment row count. Retries across a bucket, a bank change or a changed count can select another key while the ledger is stale. Before live launch, reserve a payment attempt atomically in the database, reuse its Stripe idempotency key through ambiguous network/save failures, and prove concurrent submissions and delayed webhook/DB failures create one charge. The same-state local key test does not resolve this race.
4. **Webhook arrival before pending-row insertion and notification deduplication require an isolated integration test.** Existing ledger event writes are idempotent, but this does not guarantee exactly one receipt email or recovery of a webhook that arrives before its payment row.
5. **Live landlord onboarding and event subscription incomplete.** Complete onboarding on the live platform and confirm the destination using live credentials. Subscribe the intended handler to the required events; replay signed success/failure/refund/return events into staging first. Refund/return handlers record recovery; they do not automatically issue refunds or reverse destination transfers.
6. **Credentials not activated.** Prepare mode-specific secrets below, then obtain owner approval before production migration/deployment or live collection. PR remains draft.

## Credential matrix

| Variable | Location | Preview / sandbox | Production / launch |
| --- | --- | --- | --- |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Vercel build environment | Sandbox `pk_test_…` | `pk_live_…` from the verified live platform |
| `STRIPE_SECRET_KEY` | Supabase Edge Function secrets; Vercel sensitive variable for its webhook/server Stripe calls | Sandbox restricted key with tested minimum permissions | Separate live restricted key with equivalent tested permissions |
| `STRIPE_WEBHOOK_SECRET` | Runtime hosting the selected webhook | Signing secret of the sandbox endpoint for that exact URL | Signing secret of the live endpoint for that exact URL |
| Supabase URL/keys | Vercel browser + server and Edge Functions' own environment | Isolated dummy-data project | Existing production project |
| `VITE_DEPLOYMENT_ENV` | Set by Vite config from `VERCEL_ENV` | `preview` / `development` | `production` on Vercel |

Do not paste secret values in chat or commit them. Enter them through the provider secret store. Prefer a separate restricted key per service, with Customers/SetupIntents/PaymentMethods/PaymentIntents/Connect operations required by that service, and Charges/BalanceTransactions/ApplicationFees/Transfers/Refunds/Disputes reads needed for reconciliation. Validate the exact permission set in sandbox before creating its live equivalent. A publishable key is allowed in the browser; secret/restricted/webhook keys are never `VITE_` variables.

The read-only helper accepts credentials from environment variables and reports no secret values:

```sh
node scripts/stripe/check-readiness.mjs --mode=sandbox --account=acct_1TeL6HHoFqm9Llqh --destination=acct_1UVhe1HWTjHm1swg --webhook=https://YOUR-ISOLATED-HOST/stripe-webhook
```

Use `--mode=live` with the verified live platform and a real live connected destination for launch preparation. The helper never creates keys, accounts, charges or webhooks, and its success is not an end-to-end payment test.

## $1,500 sandbox acceptance test after access/isolation is ready

1. Seed a dummy tenant with $1,500 ledger rent and map its property to the ready sandbox landlord. Link a Stripe test bank account in the signed-in app and accept the mandate through Stripe's UI; never fabricate online IP/user-agent evidence.
2. Submit once, record the PaymentIntent ID, verify `livemode=false`, gross `150000`, application fee `7500`, expected destination, and processing -> succeeded with a signed webhook and one payment/ledger posting. Verify actual destination balance movement/application fee and processor fee separately: $75 is Modus's gross fee; platform processing costs reduce its net.
3. Repeat submission and replay webhook deliveries; prove one charge, one ledger settlement, and deduplicated receipts. Include delayed DB writes, timeout after Stripe acceptance, concurrent tabs and a 10-minute bucket boundary. This currently blocks launch.
4. Use Stripe's insufficient-funds/closed-account test fixtures. Confirm failed status, restored payable rent, no paid rent posting or success receipt, and a safe retry.
5. Test a partial and full refund with explicit transfer reversal/application-fee refund, plus failed refund and late ACH return/dispute. Verify owner/Modus recovery entries and residual balances, not only tenant status. Nothing here authorizes live refunds or charges.
6. Finish a signed-in browser walkthrough with staging data. Only then consider merging and the separately approved production release.
