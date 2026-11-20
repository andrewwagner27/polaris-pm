# Local Supabase ACH Test Environment — Setup & Results

**Branch:** stripe-ach-pr2  
**Date:** 2026-11-19  
**Purpose:** Isolated local environment for Stripe ACH PR #2 integration testing.  
**Safety:** No production data touched. No live Stripe credentials used. No push/deploy performed.

---

## 1. Environment

| Component | Detail |
|---|---|
| Docker project | `Modus-dev` (existing local dev stack) |
| PostgreSQL | localhost:54322, database `postgres`, user `postgres` |
| Supabase Studio | localhost:54323 |
| Supabase API | localhost:54321 |
| Stripe CLI | v1.43.2 (installed; not logged in — requires user action) |

---

## 2. Schema Reconstruction

A schema-only restore was applied from the production pg_dump custom-format backup:

```powershell
pg_restore --host=localhost --port=54322 --username=postgres --dbname=postgres `
  --schema-only --schema=public --no-owner --no-acl `
  --no-comments --no-publications --no-subscriptions `
  <backup_file>
```

This produced the full Modus baseline (51 public tables, all RLS policies, functions) with **no production records**.

### Migration status at time of backup restore

| Migration | Tables added | Status in backup |
|---|---|---|
| `20261103000000_a1_ledger_foundation.sql` | `gl_accounts`, `journal_entries`, `journal_lines`, `posting_exceptions` | Applied (in restored schema) |
| `20261104000000_a2_receivables.sql` | `tenant_charges`, `recurring_charges`, `a2_settings`, `a2_receivables` view, etc. | Applied (in restored schema) |
| `20261105000000_a3_financial_foundation.sql` | `payment_applications`, `book_transactions`, `payment_returns`, etc. | **NOT applied to production** |

A3 was applied locally after resolving a dependency on `a2_aging(date, text, uuid)` which is not present in any migration or the backup. A stub function was created:

```sql
CREATE FUNCTION public.a2_aging(p_as_of date, p_scope text, p_scope_id uuid)
RETURNS TABLE (tenant_id uuid, tenant_name text, property_name text, books_name text,
  current_cents bigint, d30_cents bigint, d60_cents bigint, d90_cents bigint,
  open_cents bigint, credit_cents bigint, balance_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULL::uuid, NULL::text, NULL::text, NULL::text,
    NULL::bigint, NULL::bigint, NULL::bigint, NULL::bigint,
    NULL::bigint, NULL::bigint, NULL::bigint
  WHERE false;
$$;
```

The A3 migration's savepoint verification block (`A3 verify: applied 0 / 0`) rolled back its own SAVEPOINT with no effect on the outer transaction — expected with an empty database.

---

## 3. Synthetic Test Fixture

Seed file: [`supabase/seed/local_test_fixture.sql`](../seed/local_test_fixture.sql)

Re-apply with:
```powershell
$env:PGPASSWORD = "postgres"
psql -h localhost -p 54322 -U postgres -d postgres -f supabase/seed/local_test_fixture.sql
```

### Records created

| Table | Key | Value |
|---|---|---|
| `auth.users` | landlord | `00000000-…-0001` / `landlord-test@localhost.invalid` |
| `auth.users` | tenant | `00000000-…-0002` / `tenant-test@localhost.invalid` |
| `landlords` | id | `00000000-…-0011` / `stripe_account_id = acct_1UVhe1HWTjHm1swg` |
| `properties` | id | `00000000-…-0040` / `owner_email = landlord-test@localhost.invalid` |
| `units` | id | `00000000-…-0050` / `rent_amount = 1500.00` |
| `tenants` | id | `00000000-…-0060` / `user_id = 00000000-…-0002` |
| `recurring_charges` | id | `00000000-…-0070` / `Rent $1,500` |
| `tenant_charges` | id | `00000000-…-0080` / `150000 cents, period=2026-11, source=schedule` |
| `tenant_payment_methods` | id | `00000000-…-0090` / `stripe_customer_id=cus_test_local_fixture` |
| `a2_settings` | — | `cutover_date = 2026-11-01` |

### Schema constraints encountered (tenant_charges)

All three constraints must be satisfied simultaneously when `source = 'schedule'`:

| Constraint | Rule |
|---|---|
| `tenant_charges_check2` | `source = 'schedule'` ⟺ `schedule_id IS NOT NULL` |
| `tenant_charges_check3` | `source IN ('schedule', 'late_fee')` → `period IS NOT NULL` |
| `tenant_charges_period_check` | `period ~ '^[0-9]{4}-[0-9]{2}$'` |

---

## 4. ACH Idempotency Design (Updated 2026-11-20)

### DB-backed idempotency (implemented)

```typescript
// supabase/functions/create-payment-intent/index.ts
const tokenContext = [tenant_id, payment_method_id, amount_cents,
  due.open_rent_cents, due.pending_cents].join(":");
const { data: tokenRows } = await supabase.rpc("acquire_payment_token", {
  p_tenant: tenant_id, p_context: tokenContext });
// token is a UUID-based string (e.g. 'payrent:xxxxxxxx-...') used as Stripe Idempotency-Key
```

The `payment_idempotency_tokens` table holds one `pending` token per tenant (enforced by partial unique index). `acquire_payment_token` atomically inserts or returns the existing token. After success, the token is marked `committed`; on failure, `failed`.

### Protections

| Scenario | Outcome |
|---|---|
| **Concurrent double-tap** (same session) | Both get same DB token → same Stripe idempotency key → one charge |
| **Network retry (any timing)** | Same context → same token → Stripe returns existing PI |
| **Boundary crossing** (was the 10-min bucket risk) | Token is DB-generated, timing-independent → safe |
| **Different payment method or ledger state** | Different context → new token (correct: different payment) |
| **Conflicting in-flight payment** | Existing pending token with different context → 409 before Stripe |
| **Stripe error** | Token marked `failed` → user can retry and get a fresh token |
| **DB-after-Stripe error (503)** | Token stays `pending` → user told not to retry (prevents double-charge) |

### Webhook replay safety

The shared `stripe-events.js` module uses idempotent upserts throughout:
- `markSucceeded`: upserts on `stripe_payment_intent_id`; guards against late-success undoing refunded status
- `markFailed`: guards against failed event arriving after a later success
- `recordRefunds`: upserts on `stripe_refund_id` (unique)
- `recordDispute`: upserts on `stripe_dispute_id`; uses `payment_id` unique constraint

Webhook replay is safe for all event types.

---

## 5. Automated Test Results

**Run command:**
```powershell
cd C:\Modus-dev\polaris-pm-ach-test\tenant-portal
node --test tests/stripe-ach-runtime.test.mjs tests/stripe-events.test.mjs
```

**Result: 47 pass, 0 fail** (2026-11-19)

### stripe-ach-runtime.test.mjs (21 tests)

These tests execute the actual `create-payment-intent` TypeScript endpoint in a Node VM with fake DB and Stripe. They are **handler integration tests, not evidence of real Stripe sandbox settlement**.

| Test | Result |
|---|---|
| $1,500 ACH: requests $75 fee + $1,425 to destination, records pending | ✔ |
| no session / wrong tenant / wrong customer / wrong bank owner / card type | ✔ × 5 |
| stale amount / ledger failure / payment count failure | ✔ × 3 |
| owner not mapped / owner not ready / owner from wrong Stripe account | ✔ × 3 |
| Stripe error / network error / requires_action / requires_payment_method / canceled | ✔ × 5 |
| DB failure after Stripe success: warns "Do not pay again" with PI id | ✔ |
| Same ledger state → same idempotency key | ✔ |
| GET rejected before any I/O | ✔ |
| Frontend key validation (test/live/missing) | ✔ |

### stripe-events.test.mjs (26 tests across 6 suites)

In-memory fake DB; covers all event types handled by the shared module.

| Suite | Tests | Result |
|---|---|---|
| `payment_intent.succeeded` | 6 | ✔ |
| `out-of-order delivery` | 2 | ✔ |
| `payment_intent.payment_failed` | 1 | ✔ |
| `refunds` | 6 | ✔ |
| `fee capture (D8, D10)` | 4 | ✔ |
| `wiring (static)` | 4 | ✔ |
| Non-payment events ignored | 1 | ✔ |
| stripeGetter bearer auth | 1 | ✔ |
| Modus records only; never issues refunds | 1 | ✔ |

---

## 6. Live $1,500 ACH Test Result (2026-11-19) ✅ COMPLETED

The end-to-end test was run against the local stack using real Stripe sandbox API calls.

### Stripe sandbox fixtures

| Resource | ID |
|---|---|
| Customer | `cus_Vexvz9To4ENk5l` |
| Payment method (us_bank_account) | `pm_1UddzqHoFqm9Llqh9sTZS5uP` |
| SetupIntent (microdeposit verified) | `seti_1UddzrHoFqm9LlqhCWX76sks` |
| PaymentIntent created | `pi_3UdeD5HoFqm9Llqh0YfpI1Q6` |

### Auth fix required (included in updated fixture)

The schema-only restore left `auth.users` rows without required GoTrue fields. The following were added:
- `auth.instances`: requires a row for GoTrue to accept any sign-in (was empty)
- `instance_id`, `aud`, `encrypted_password`: GoTrue won't scan the user without these
- `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change`: must be `''` not NULL (GoTrue scans them as Go strings; NULL causes 500)
- `auth.identities`: email+password sign-in requires a row with `provider='email'`

The updated [`seed/local_test_fixture.sql`](../seed/local_test_fixture.sql) handles all of these correctly on fresh apply.

### Database verification

| Field | Expected | Actual |
|---|---|---|
| `status` | pending | **pending** ✓ |
| `amount_cents` | 150000 | **150000** ✓ |
| `platform_fee_cents` | 7500 (5%) | **7500** ✓ |
| `owner_stripe_account` | landlord acct | **acct_1UVhe1HWTjHm1swg** ✓ |
| `stripe_payment_intent_id` | pi_3Ude… | **pi_3UdeD5HoFqm9Llqh0YfpI1Q6** ✓ |

The 5% Modus platform fee ($75) and $1,425 net-to-landlord destination charge are correctly configured.

---

## 6b. Steps Requiring User Action (for re-runs)

### Stripe CLI login (for local webhook forwarding)

```powershell
stripe login
```
Follow the browser prompt. This writes `~/.config/stripe/config.toml`.

### 6b. Stripe sandbox credentials

Obtain a **restricted test key** (`sk_test_…`) with minimum permissions:
- `payment_intents: write`
- `customers: read`
- `payment_methods: read`
- `accounts: read` (for Connect destination check)

Do **not** use the unrestricted secret key. Do not use a live key (`sk_live_…`).

### 6c. Set Supabase Edge Function secrets (local)

```powershell
cd C:\Modus-dev\polaris-pm-ach-test\tenant-portal
supabase secrets set STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
```

### 6d. Start local webhook listener

```powershell
stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook
```

This prints a `whsec_…` signing secret. Set it:
```powershell
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_YOUR_PRINTED_SECRET
```

### 6e. Create a real Stripe sandbox test bank account

In the Stripe sandbox dashboard:
1. Create a customer under the **platform** account (not the connected account)
2. Attach a `us_bank_account` payment method using test routing `110000000` / account `000123456789`
3. Use Stripe's `confirm_mandate` test helper to skip microdeposit verification
4. Update the seed fixture with the real `cus_…` and `pm_…` IDs

### 6f. Live $1,500 ACH test (manual)

Once 6a–6e are complete, POST to the local Edge Function as the test tenant:

```bash
curl -X POST http://localhost:54321/functions/v1/create-payment-intent \
  -H "Authorization: Bearer <tenant_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "00000000-0000-0000-0000-000000000060",
    "customer_id": "<real_cus_id>",
    "payment_method_id": "<real_pm_id>",
    "purpose": "rent",
    "amount_cents": 150000
  }'
```

Expected response:
```json
{ "payment_intent_id": "pi_...", "status": "processing" }
```

Confirm in Stripe sandbox:
- Payment intent amount: $1,500.00
- `application_fee_amount`: $75.00 (5%)
- `transfer_data.destination`: `acct_1UVhe1HWTjHm1swg`
- Net to landlord: $1,425.00

---

## 7. Automated Test Results (2026-11-20, Session 3)

### stripe-ach-runtime.test.mjs + stripe-events.test.mjs: 48 pass, 0 fail

```powershell
cd C:\Modus-dev\polaris-pm-ach-test\tenant-portal
node --test tests/stripe-ach-runtime.test.mjs tests/stripe-events.test.mjs
```

### Lifecycle integration test: 20 pass, 0 fail

Script: `tests/stripe-lifecycle-test.ps1` (runs against local stack + Stripe sandbox).

**Session 3 changes:** D4/D5 seeds a fresh disposable payment when all existing payments have return rows; only A1-qualified payments (with journal entry) are eligible; PI regex handles underscore-containing test PIs.

| Check | Result |
|---|---|
| **A: Stripe sandbox PI verified** | |
| PI retrieved from Stripe | ✔ |
| Amount = 150,000 cents ($1,500) | ✔ |
| `application_fee_amount` = 7,500 (5%) | ✔ |
| `transfer_data.destination` = acct_1UVhe1HWTjHm1swg | ✔ |
| Currency USD | ✔ |
| **B: GoTrue sign-in** | |
| Access token returned | ✔ |
| **C: DB idempotency token state** | |
| No stuck pending tokens after committed payments | ✔ |
| **D: Webhook lifecycle events** | |
| DB reset to pending for lifecycle test | ✔ |
| `payment_intent.succeeded` → DB status=paid | ✔ |
| Duplicate `payment_intent.succeeded` accepted (idempotent, no duplicate row) | ✔ |
| `payment_intent.payment_failed` after succeeded → status stays paid | ✔ |
| `charge.dispute.created` (ACH return, insufficient_funds) → `payment_returns` kind=ach_return | ✔ |
| Duplicate dispute event → no second payment_returns row | ✔ |
| `account.updated` (Stripe Connect) accepted | ✔ |
| **E: Signature validation** | |
| Bad HMAC signature rejected | ✔ |

**Note on `payment_returns` append-only constraint:** The table has a UNIQUE constraint on `payment_id` and an `a3_return_guard` trigger that prevents DELETE/UPDATE. Each payment can have at most one return row. The lifecycle test seeds a fresh disposable payment when all existing payments already have return rows; only A1-qualified payments (with journal entries) are eligible.

### A3 Reconciliation test: 14 pass, 0 fail (new in Session 3)

Script: `tests/stripe-reconciliation-test.ps1` (runs against local stack + Stripe sandbox).

| Check | Result |
|---|---|
| **R1-R2: succeeded webhook → apply row + payable_cents=0** | ✔ |
| **R3: Duplicate succeeded → no extra payment_applications** | ✔ |
| **R4-R5: Payment reset to pending → reversal row** | ✔ |
| **R6-R7: ACH return → payment_returns + status=returned + reversal row** | ✔ |
| **R8: a2_pay_rent_internal open_rent_cents matches net payment_applications** | ✔ |

---

## 8. Remaining Release Blockers (Updated 2026-11-20, Session 3)

| # | Blocker | Status |
|---|---|---|
| 1 | **10-minute idempotency bucket boundary** | **RESOLVED** — DB-backed `payment_idempotency_tokens` + `acquire_payment_token` RPC |
| 2 | **No isolated Stripe sandbox integration test** | **RESOLVED** — live $1,500 ACH test (PI: `pi_3UdeD5HoFqm9Llqh0YfpI1Q6`); fee/transfer verified |
| 3 | **`a2_aging` function missing** | **RESOLVED** — stub migration created; aging not on roadmap |
| 4 | **Live landlord Stripe Connect onboarding** | Out of scope for local test; see §8a below |
| 5 | **A single `STRIPE_WEBHOOK_SECRET` can't authenticate two independent endpoint secrets** | Out of scope for local test; see §8b below |
| 6 | **Credentials not activated** | Requires user action (see §6b) |
| 7 | **Stripe payment reconciliation with Modus rent ledger** | **RESOLVED** — A3 trigger chain verified end-to-end; see §8d below |

### 8a. Live Stripe Connect onboarding requirements

Before going live, each landlord must complete Stripe Connect Express onboarding:
1. Create a connected account via `POST /v1/accounts` (type: `express`, `country: us`)
2. Generate an onboarding link via `POST /v1/account_links`
3. Landlord completes KYC/bank details in Stripe-hosted flow
4. Webhook `account.updated` with `charges_enabled=true`, `payouts_enabled=true`, `capabilities.transfers=active` → update `landlords.stripe_onboarded=true` in DB
5. The `create-payment-intent` function verifies all four live flags before accepting any charge

### 8b. Production webhook endpoint requirements

| Requirement | Detail |
|---|---|
| Register endpoint in Stripe Dashboard | URL: `https://<project>.supabase.co/functions/v1/stripe-webhook` |
| Event subscriptions needed | `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.*`, `application_fee.*`, `transfer.reversed`, `refund.updated`, `account.updated` |
| Webhook secret | Separate `STRIPE_WEBHOOK_SECRET` per registered endpoint; set via `supabase secrets set` |
| Idempotency | All handlers use upsert with `ignoreDuplicates:true` or `onConflict`; replay-safe |
| Tolerance | Default 300s timestamp tolerance; production should not need to change |

### 8c. Idempotency migration (must be applied to production)

Migration `20261120000000_ach_idempotency_tokens.sql` must be applied to production before deploying the updated `create-payment-intent` function. The function requires `acquire_payment_token(uuid, text)` to exist.

**Production deployment checklist:**

| Item | Detail |
|---|---|
| **Dependencies** | `tenants` table must exist (applied via A2 migration). No A1/A3 dependency. |
| **Compatibility** | Table starts empty. Existing `payments` rows have no tokens. No data migration needed. |
| **Locks** | `CREATE TABLE` + `CREATE INDEX` take brief ACCESS EXCLUSIVE locks. Run during maintenance window or low-traffic period. |
| **Security fix** | Migration now includes `REVOKE ALL ON FUNCTION acquire_payment_token FROM PUBLIC, anon, authenticated` before the `GRANT TO service_role`. Without this, `SECURITY DEFINER` + public execute grant would allow any authenticated user to block another tenant's payments. |
| **Rollback** | No automatic DOWN. Manual rollback: `DROP FUNCTION public.acquire_payment_token(uuid, text); DROP TABLE public.payment_idempotency_tokens;` then redeploy edge function without `acquire_payment_token` calls. |

**Migration is NOT yet applied to production.** Apply with:
```powershell
supabase db push  # (or run the migration SQL directly against production)
```

### 8d. Payment reconciliation architecture (blocker #7, resolved)

**Problem:** When Stripe confirms a payment via webhook, the `payments.status` changes from `pending` to `paid`. Before this change, `a2_pay_rent_internal` counted the payment as `pending_cents` (reducing `payable_cents`). After this change, the payment needed to be recognized as a settled receipt for the charge to be marked as applied.

**Resolution:** The A3 accounting engine already provides complete, automatic reconciliation via database triggers:

1. `stripe-webhook` calls `markSucceeded()` → sets `payments.status = 'paid'`
2. `a1_post_payments` trigger fires first (alphabetically before A3): A1 posts a journal entry (`journal_entries`, `journal_lines`) for the payment
3. `a3_apply_payments` trigger fires: calls `a3_payment_trigger()` → `a3_apply_safely()` → `a3_reconcile_tenant()`
4. `a3_reconcile_tenant()` calls `a3_sources()` → `a3_receipts()`, which finds the journal entry A1 just posted → allocates the receipt to the open charge → writes `payment_applications` rows
5. `a2_applications()` (replaced by A3) reads from stored `payment_applications` → `a2_open_charges_internal()` returns `open_cents = 0` → `a2_pay_rent_internal()` returns `payable_cents = 0`

**ACH returns** (`charge.dispute.created`): `stripe-webhook` calls `recordDispute()` → inserts `payment_returns` → `a3_apply_returns` trigger fires → `a3_return_trigger()` sets `status = 'returned'` → A3 creates a reversal row in `payment_applications` → open charge is restored.

**Idempotency:** `a3_reconcile_tenant()` recalculates the net-zero balance on every trigger call. Duplicate webhook events that set the same status produce no extra `payment_applications` rows (the net is already correct).

**`create-payment-intent` does NOT need changes.** It calls `a2_pay_rent_internal()` which transitively reads the A3-backed `payment_applications` store. The function correctly returns `payable_cents = 0` when a charge is fully applied.
