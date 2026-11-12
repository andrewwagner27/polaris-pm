# Rent reminders: safe replacement and activation

## Status (2026-11-12)

- Production cron job **2 `rent-reminders-daily`** (`0 13,14 1 * *`, guard keeps 09:00 New York) is **paused** (`active = false`). Keep it paused.
- The **deployed** function emails every tenant with an email and a current lease "Rent due today" with the **sum of all `recurring_charges` rows, else `units.rent_amount`**. It ignores payments, credits, voids and whether a charge is active. On Nov 1 it emailed 3 tenants this way.
- The **previous repository** version called `a2_generate_charges` (a write: it creates real charges) and `a3_pay_rent_internal` (**does not exist** in production). It must not be deployed.

## The replacement (this branch, not deployed)

`supabase/functions/rent-reminders/{handler.ts,index.ts}`:

| Rule | How |
|---|---|
| No balance unless authoritative | Amount = `a2_pay_rent_internal(p_tenant).payable_cents` only |
| Unit rent / recurring charges never used | Not read at all (test enforces) |
| Payments, credits, voids, reversals | Handled inside A2: open charges exclude voided charges; receipts count only posted, unreversed journal entries net of refunds; credits applied; Stripe rent still settling (14 days) deducted |
| Receivables inactive ⇒ fail closed | `a2_settings.cutover_date` NULL ⇒ `blocked: receivables_inactive`, no tenant read, no email |
| Never creates charges | No `a2_generate_charges` or any write (test enforces); this month's scheduled charges must already exist or `blocked: rent_charges_not_generated` |
| Second gate | `RENT_REMINDERS_ENABLED` must be `"true"`, else `blocked: disabled` |
| Nothing due ⇒ no email | `payable_cents <= 0` skipped |
| Pay Now only when possible | Button only if `online_available` is true; otherwise "contact your property manager" |
| One per tenant per month | Idempotency key `rent-due-today/<YYYY-MM>/<tenant>` |
| No PII in logs | Results logged by tenant id only |

Production dependencies (all A2, deployed): `a2_settings`, `tenant_charges`, `a2_pay_rent_internal(uuid)` (service_role EXECUTE granted). Verify before deploying with a read-only query:

```sql
SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;
select p.proname, pg_get_function_identity_arguments(p.oid), has_function_privilege('service_role', p.oid, 'EXECUTE')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('a2_pay_rent_internal','a2_status');
select cutover_date from a2_settings;   -- NULL today = receivables inactive
```

## Activation sequence (each step needs Andrew's approval)

1. Deploy the replacement function (`supabase functions deploy rent-reminders`). Safe while paused and while `RENT_REMINDERS_ENABLED` is unset: it sends nothing. Leave job 2 paused.
2. Activate receivables (set the cutover) through the normal A2 process. Not part of this work.
3. Generate the month's scheduled charges through the approved landlord process; confirm they match the leases.
4. Dry check on the morning of the 1st *before* 09:00 ET: for each active tenant, compare `a2_pay_rent_internal` with what the Pay Rent screen and the tenant ledger show.
5. Set Supabase secret `RENT_REMINDERS_ENABLED=true`.
6. Re-activate job 2: `select cron.alter_job(job_id := 2, active := true);` — only after steps 1–5.
7. After the run: check the response (`sent`, `skipped`), Resend, and that no tenant was emailed twice.

**Rollback:** `select cron.alter_job(job_id := 2, active := false);` and/or unset `RENT_REMINDERS_ENABLED`.
