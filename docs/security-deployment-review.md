# Security Sprint — Pre-Deployment Review

**Date:** 2026-10-30  **Scope:** read-only review of the uncommitted security sprint in `tenant-portal/`.
No files other than this document were modified. No SQL was executed, nothing was deployed or pushed.

**Evidence labels used throughout**

| Label | Meaning |
|---|---|
| **VERIFIED** | Read directly in code/config in this repository. |
| **INFERRED** | Follows necessarily from verified code plus documented platform behavior (PostgREST / Supabase / Vercel / Stripe). |
| **UNKNOWN** | Lives only in the live Supabase/Vercel/Stripe configuration, which is not in the repo and was not queried. |

Paths are relative to the repo root unless noted.

---

## 0. What the repository does and does not contain

- **VERIFIED** — The only SQL in the repo is `tenant-portal/supabase/migrations/20241027_inspections.sql` (inspections table + `inspection-photos` bucket policies) and the not-yet-run `ent001_migration_v4.sql` / `ent001_rls_tests_v4.sql`.
- **VERIFIED** — No file defines RLS policies, table grants, or storage policies for `maintenance_requests`, `maintenance_comments`, `vendors`, `rent_payments`, or the `maintenance-photos` bucket. `ent001_migration_v4.sql` does not mention maintenance or vendor tables.
- **VERIFIED** — No `supabase/config.toml` exists (neither at the root nor in `tenant-portal/supabase/`), so per-function `verify_jwt` settings are not recorded in the repo.
- **VERIFIED** — No pg_cron / `net.http_post` / Vault definitions exist in the repo. The only scheduler config is `tenant-portal/vercel.json` (`/api/daily-recap`, `0 12 * * *`).
- **VERIFIED** — The project uses legacy JWT-format API keys: `VITE_SUPABASE_ANON_KEY` in `tenant-portal/.env` begins with `eyJ`.

Every statement below about the live database's policies is therefore either an inference from how the frontend uses the database, or explicitly unknown.

---

## 1. Vendor database security

### 1.1 How the vendor portal talks to the database — VERIFIED

Vendors never sign in. `tenant-portal/src/supabase.js` creates the client with the public anon key and no custom headers, and neither vendor screen calls `supabase.auth.*`. Every vendor request therefore executes as the Postgres role **`anon`**.

| File:line | Operation (as `anon`) | Filter used |
|---|---|---|
| `src/VendorAccess.jsx:233-237` | `SELECT id,title,description,category,priority,scheduled_date,scheduled_time,vendor_token_expires_at,status,work_order_accepted_at,vendor_name FROM maintenance_requests` | `vendor_token = <token>` |
| `src/VendorAccess.jsx:47-51` | `UPDATE maintenance_requests SET work_order_accepted_at, work_order_accepted_by, vendor_email` | **`id = <ticket id>`** (no token) |
| `src/VendorAccess.jsx:54` | `INSERT maintenance_comments` | — |
| `src/VendorTicket.jsx:79-83` | **`SELECT * FROM maintenance_requests`** — includes `vendor_pin`, `entry_instructions`, `tenant_id`, invoice/quote fields | `vendor_token = <token>` |
| `src/VendorTicket.jsx:89-93` | `SELECT * FROM maintenance_comments` | `request_id = <ticket id>` |
| `src/VendorTicket.jsx:96-103` | `storage.list('maintenance-photos', <ticket id>)` + `createSignedUrl` | path prefix |
| `src/VendorTicket.jsx:113,154,205` | `INSERT maintenance_comments` | — |
| `src/VendorTicket.jsx:131,144,188` | `storage.upload('maintenance-photos', ...)` | — |
| `src/VendorTicket.jsx:147-152, 198-203` | `UPDATE maintenance_requests SET quote_*, status / status, invoice_url, invoice_notes` | **`id = <ticket id>`** (no token) |

Additional verified facts:

- **VERIFIED** — The PIN gate on the ticket page is client-side only. `src/VendorTicket.jsx:70-74` checks `localStorage.getItem("vendor_token") === token`. Anyone can set that value in DevTools and skip `/vendor/:token` entirely.
- **VERIFIED** — The sprint moved the PIN *comparison* server-side (`tenant-portal/api/vendor-verify-pin.js`, called from `src/VendorAccess.jsx:252-266`). However, `src/VendorTicket.jsx:81` still `select("*")`s the row, so `vendor_pin` is still delivered to the browser on the ticket page.
- **VERIFIED** — `entry_instructions` (door/lockbox details) is written to `maintenance_requests` in `src/AssignVendorModal.jsx` (`assign()`, ~line 118) and is part of the `select("*")` above.

### 1.2 Can an anonymous user read `vendor_pin` or access maintenance records?

**Answer: yes — if the vendor portal works in production today, it cannot be otherwise.** (INFERRED, with high confidence; the only alternative is that the vendor portal is currently broken.)

Reasoning:

1. **INFERRED** — For `VendorTicket.jsx:81` to return a row as `anon`, the live database must (a) grant `SELECT` on `maintenance_requests` to `anon` covering *all* columns (because of `select("*")`, which includes `vendor_pin`), and (b) either have RLS disabled or have an RLS policy that lets `anon` see the row.
2. **INFERRED** — An RLS policy is evaluated per row and can see only the row's own data, the JWT claims, and request GUCs such as `request.headers`. It cannot see the `?vendor_token=eq.…` filter value from the query string, and the client sends no custom header carrying the token (`src/supabase.js`). So no policy can say "only the row whose token the caller knows". Whatever policy makes the portal work must be token-independent (e.g. `USING (true)` or `USING (vendor_token IS NOT NULL)`).
3. **Consequence (INFERRED)** — Anyone holding the public anon key, which is shipped in every page's JS bundle, can call the REST API directly:
   `GET /rest/v1/maintenance_requests?select=id,vendor_token,vendor_pin,entry_instructions,tenant_id,description`
   This enumerates every vendor-eligible ticket — tokens, PINs and entry instructions — without knowing any token. With a token in hand, the PIN adds nothing (see 1.1).
4. **INFERRED** — The vendor `UPDATE`s filter by `id`, not token (`VendorAccess.jsx:51`, `VendorTicket.jsx:152,203`). So the live UPDATE policy for `anon` also cannot depend on the token. Anonymous users can therefore modify eligible tickets: status, quote amount, invoice path, "work order accepted by" e-signature.
5. **INFERRED** — `maintenance_comments` must allow anon `SELECT` and `INSERT` (internal `visible_to_tenant:false` notes are readable). The `maintenance-photos` bucket must allow anon `list`, `createSignedUrl` and `upload`. Ticket UUIDs leak from step 3, so photos and invoices of any ticket can be listed and signed, and arbitrary files can be uploaded.
6. **UNKNOWN** — The exact policy text, whether RLS is enabled on these tables, and whether the storage bucket is still public. Confirm read-only in the Dashboard (*Authentication → Policies*, filter `maintenance_requests`, `maintenance_comments`, and `storage.objects` for `maintenance-photos`), or have the owner run:
   ```sql
   -- read-only; for the owner to run, not executed in this review
   select tablename, policyname, roles, cmd, qual, with_check
   from pg_policies
   where tablename in ('maintenance_requests','maintenance_comments')
      or (schemaname='storage' and tablename='objects');
   select grantee, privilege_type from information_schema.role_table_grants
   where table_name in ('maintenance_requests','maintenance_comments') and grantee='anon';
   ```

**Does the current sprint make this worse?** No. It removes one browser read of `vendor_pin` (`VendorAccess.jsx`) and does not touch policies. The exposure exists before and after the sprint deploys; it is not a deployment blocker for the sprint, but it is the highest-severity open item.

### 1.3 Recommended smallest secure change

**Move the vendor's ~8 database/storage operations behind one server endpoint, authorized by a short-lived vendor session issued after the PIN check. Then remove all `anon` access to the three resources.**

This reuses what the sprint already built (`api/_lib/auth.js`, `api/vendor-verify-pin.js`, the service-role client) and touches two frontend files.

**Server (new/changed files)**

1. `tenant-portal/api/vendor-verify-pin.js` — on success, also return `session`: an HMAC-SHA256-signed payload `{ ticket_id, exp }` (exp ≈ 8 h, signed with new env `VENDOR_SESSION_SECRET`). No DB column is needed for the session itself.
2. `tenant-portal/api/vendor-ticket.js` (new, single route, `action` field). It verifies the session signature and expiry, re-checks `vendor_token_expires_at`, and then runs with the service role scoped to `ticket_id` only:
   - `get` — returns an **explicit column list** that excludes `vendor_pin` and `vendor_token`. Includes `entry_instructions` only once the work order is accepted. Also returns comments and signed photo URLs.
   - `accept_work_order`, `comment`, `submit_quote`, `complete` — the current writes from `VendorAccess.jsx:47-60` and `VendorTicket.jsx:113-210`. Allow-list the fields and `author_type = 'vendor'`.
   - `upload_url` — returns `createSignedUploadUrl` for a path forced to `${ticket_id}/vendor-*|quote-*|invoice-*`. The browser uploads directly to that URL, so there is no file proxying through Vercel.
3. The vendor notification emails (`src/notifications.js` → edge `send-email` with `vendor_token`) keep working unchanged. Optionally they can move into this endpoint later.

**Frontend**

4. `src/VendorAccess.jsx` — store `session` in `sessionStorage` instead of `localStorage.vendor_token`. Replace the `useEffect` token check (233-246) and `handleAccept` (47-60) with `vendor-ticket` calls.
5. `src/VendorTicket.jsx` — replace every `supabase.*` call listed in 1.1 with `vendor-ticket` actions. On a missing or expired session, redirect to `/vendor/:token`.

**Database (one migration, run after the code above is live)**

6. Drop every `anon` policy on `maintenance_requests` and `maintenance_comments`, and every `anon` policy on `storage.objects` for `maintenance-photos`. Also `REVOKE ALL ON maintenance_requests, maintenance_comments FROM anon`. Landlord and tenant access is via `authenticated` and is unaffected. Verify with the same read-only queries as 1.2.
7. Optional, same migration: add `vendor_pin_failed_attempts int default 0` and `vendor_pin_locked_until timestamptz` so `vendor-verify-pin.js` can lock a token after about 5 failures. This closes the remaining PIN brute-force gap.

**Operational**

8. After step 6, treat all existing tokens and PINs as exposed. Reassign vendors on open tickets (`AssignVendorModal` → `generate-vendor-token` issues fresh 24-char tokens), or bulk-rotate with a one-off script.

**Why this rather than alternatives**

- *Postgres `SECURITY DEFINER` RPCs taking `(token, pin)`.* This also works and avoids a new route. But it moves business logic into SQL, storage uploads still need a server for signed upload URLs, and every call would carry the PIN. It's more migration surface for the same result.
- *Column-level grants only* (`REVOKE SELECT (vendor_pin)`). This breaks `select("*")` in `VendorTicket.jsx:81` and still leaves token enumeration, entry-instruction exposure and anonymous UPDATE by id. It's insufficient on its own.

**Rollout order:** deploy steps 1–5 (vendor portal now works through the server while anon access still exists — no outage) → smoke-test the vendor flow → run step 6/7 → rotate tokens (step 8).

---

## 2. Payment amount validation

### 2.1 Current flow — VERIFIED

1. `src/useTenant.js:52-57` loads, using the tenant's own session: the unit (`units.rent_amount`, dollars), the last 6 `payments`, and **all** `recurring_charges` rows for the tenant.
2. `src/RentPaymentScreen.jsx:308-312` computes the amount shown and charged:
   `rentAmount = Σ recurring_charges.amount` if any rows exist, else `units.rent_amount`.
   **Note:** it ignores `recurring_charges.start_date` / `end_date` (set in `LandlordTenantDetail.jsx:300-305`, `LandlordFinancials.jsx:175-180`).
   `rent-reminders` does the same (`supabase/functions/rent-reminders/index.ts`, `chargesByTenant` sum).
3. `RentPaymentScreen.jsx:205-219` (`payNow`) sends `amount_cents: rentAmount * 100`, plus `tenant_id`, `unit_id`, `payment_method_id` and `customer_id`. There is no partial-payment or custom-amount UI; the tenant can only pay `rentAmount`.
4. `supabase/functions/create-payment-intent/index.ts`, after the sprint:
   - verifies tenant ownership and Stripe-customer ownership,
   - rounds `amount_cents` and bounds it to between 1 and 10,000,000,
   - creates the PaymentIntent with metadata `tenant_id`, `unit_id`, `owner_stripe_account`, `platform_fee_cents`,
   - inserts `payments { tenant_id, unit_id, amount_cents, platform_fee_cents, owner_stripe_account, status:'pending', stripe_payment_intent_id, source:'ach' }`.

   **The amount itself is still client-chosen.**
5. Webhooks (`api/stripe-webhook.js`, `supabase/functions/stripe-webhook/index.ts`) set `status` to `paid` or `failed` by `stripe_payment_intent_id`.

### 2.2 Why "outstanding balance" cannot be computed reliably today — VERIFIED

- **No code generates charges.** Nothing writes a monthly rent-charge row:
  - `rent_payments` is only read (`src/EvictionWatch.jsx:47`) or updated (`api/classify-and-route.js`), never inserted.
  - `src/supabase/late-fee-cron/index.ts:45-51` reads `payments` rows with `category='Rent'`, `balance_due>0` and `due_date`, but no code in the repo creates such rows.
- **`payments` mixes units and schemas.** Rows written by the app use:
  - `amount_cents` (cents) — `create-payment-intent`, `LandlordTenantDetail.jsx:150`,
  - `amount` (dollars) — `LandlordFinancials.jsx:99`,
  - `amount` + `balance_due` + `category` — late-fee rows from `late-fee-cron/index.ts:106`.

  Readers paper over this; e.g. `src/ActivityLedger.jsx:76` does `(p.amount_cents||0)/100 || Number(p.amount) || rentAmount`.
- **`ledger_entries` (the proper double-entry design) is defined only in the unexecuted `ent001_migration_v4.sql` Part C.** It explicitly says "No write paths here; FIN-001 wires them." `ActivityLedger.jsx:36-46` already tries it first and falls back.

So a true "charges minus payments" balance needs ENT-001 plus FIN-001. What the server **can** compute today is the same expected monthly amount the UI already charges.

### 2.3 Proposed implementation

**Phase 1 — no schema change, drop-in for the existing UI** (`supabase/functions/create-payment-intent/index.ts` only)

1. After the existing ownership checks, compute `expectedCents` server-side with the service-role client, mirroring `RentPaymentScreen.jsx:308-312` exactly:
   ```ts
   const { data: charges } = await supabase.from("recurring_charges").select("amount").eq("tenant_id", tenant_id);
   const { data: unit } = await supabase.from("units").select("rent_amount").eq("id", tenant.unit_id).maybeSingle();
   const recurring = (charges ?? []).reduce((s, c) => s + Number(c.amount || 0), 0);
   const expectedCents = Math.round((recurring > 0 ? recurring : Number(unit?.rent_amount || 0)) * 100);
   ```
2. **Charge `expectedCents`, never the client value.** Keep `amount_cents` in the request only as a consistency check. If `Math.round(body.amount_cents) !== expectedCents`, return `409 { error: "Amount due changed — please refresh", amount_cents: expectedCents }`. This prevents charging a stale or tampered figure. If `expectedCents <= 0`, return 400.
3. **Duplicate-payment guard.** Before creating the intent, look for an existing `payments` row for `tenant_id` with `stripe_payment_intent_id IS NOT NULL`, `status IN ('pending','paid')` and `created_at` in the current calendar month (America/New_York). If one exists, return `409 "Rent already submitted this month"`.
4. **Stripe idempotency and metadata.** Send the header `Idempotency-Key: rent-${tenant_id}-${YYYY-MM}`; this protects double-clicks and retries within Stripe's 24 h key window. Add `metadata[billing_period]=YYYY-MM` and `metadata[expected_cents]`.
5. **Optional webhook hardening** in both webhooks: on `payment_intent.succeeded`, compare `paymentIntent.amount` with the stored `payments.amount_cents` and log a mismatch.

Behavior impact: none for honest tenants, because the UI already sends exactly this value. A tenant can no longer pay an arbitrary amount (e.g. $1 marked "paid").

**Phase 1 decision required (owner):** whether `recurring_charges.start_date/end_date` should be honored. Today the UI and rent-reminders ignore them. Changing only the server would cause 409s, so change all three together (`RentPaymentScreen.jsx:308-312`, `ActivityLedger.jsx:61-64`, `rent-reminders`). Ideally the server returns the amount via a small read-only endpoint, which the UI then displays.

**Phase 2 — real balance (after ENT-001 and as part of FIN-001)**

- A scheduled job posts monthly `charge` entries to `ledger_entries` from active `recurring_charges`, or `units.rent_amount`. `late-fee-cron` posts `late_fee` entries, using `reference_type/reference_id` with the existing unique index for idempotency.
- Webhooks post `payment` entries on `payment_intent.succeeded`. Landlord manual payments (`LandlordFinancials.jsx:99`, `LandlordTenantDetail.jsx:150`) post `payment` entries in cents.
- `create-payment-intent` charges `balance = Σ(charge + late_fee) − Σ(payment + credit)` for the tenant, in `amount_minor_units`. It must be greater than 0. A partial-payment amount may be allowed only if it is ≤ balance.

---

## 3. Cron compatibility

### 3.1 What the code requires after the sprint — VERIFIED

| Job | Scheduler | Auth the sprint now requires |
|---|---|---|
| `tenant-portal/api/daily-recap.js` | Vercel Cron (`tenant-portal/vercel.json`, `0 12 * * *`) | `Authorization: Bearer <CRON_SECRET>` (`api/_lib/auth.js` → `hasCronSecret`), **or** a signed-in landlord JWT |
| `tenant-portal/supabase/functions/rent-reminders/index.ts` | Supabase cron (comment on line 2; config not in repo) | `Authorization: Bearer <exact SUPABASE_SERVICE_ROLE_KEY>` **or** `x-cron-secret: <CRON_SECRET>` (`_shared/security.ts` → `isCronRequest`) |
| `tenant-portal/src/supabase/late-fee-cron/index.ts` (not changed by the sprint) | "Supabase Dashboard", schedule `1 0 6 * *` per its header | Already required `Authorization: Bearer <exact SUPABASE_SERVICE_ROLE_KEY>` before the sprint (lines 17-26) |

### 3.2 What the rent-reminders job currently sends

**UNKNOWN — it cannot be determined from the repository.** No cron definition, Vault secret or `config.toml` is checked in.

What can be established:

- **VERIFIED** — Before the sprint, `rent-reminders` performed no authorization of its own.
- **INFERRED** — With no `config.toml`, a default `supabase functions deploy rent-reminders` enables gateway JWT verification. In that case the existing job must already send *some* valid project JWT — either the anon key or the service-role key — or it has been failing at the gateway. If it was deployed with `--no-verify-jwt`, it may send no Authorization header at all.
- **INFERRED, risk** — Supabase's published "Scheduling Edge Functions" example builds the header from a Vault secret holding the **anon** key. If the job was set up that way, **it will start returning 401 after the sprint deploys.**
- **Weak evidence (INFERRED)** — `late-fee-cron` already demands the exact service-role key. If that job is deployed and succeeding, the owner has previously configured a cron with the service-role key. But its source lives in `src/supabase/` (not a CLI deploy path) and its row schema (`category`, `balance_due`) matches nothing else in the app, so it may not be live.
- **VERIFIED** — Keys are legacy JWTs (`eyJ…`). A cron that sends the legacy service-role JWT will match `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`. If the project is ever migrated to the new `sb_secret_…` keys, the cron header and the env value must be updated together.
- **Vercel (documented platform behavior)** — When the `CRON_SECRET` env var is set, Vercel Cron automatically sends `Authorization: Bearer <CRON_SECRET>` to the path in `vercel.json`. If it isn't set, `daily-recap` returns 401 every day after this deploy.

### 3.3 Required configuration changes

1. **Owner to inspect (read-only, Dashboard → Integrations → Cron, or SQL editor):**
   ```sql
   select jobid, jobname, schedule, command from cron.job;  -- read-only
   ```
   Find the job whose `command` calls `/functions/v1/rent-reminders`, and look at its `headers`:
   - **Bearer service-role key** → no change needed.
   - **Bearer anon key** (or a Vault secret holding it), **or no Authorization header** → change it before deploying. Either:
     - (a) switch the header to the service-role key, stored in Vault rather than inline, or
     - (b) set Supabase secret `CRON_SECRET`, add header `x-cron-secret: <value>`, and keep the Authorization header (any valid JWT) so the gateway still passes.
   - While there, confirm whether a `late-fee-cron` job exists and whether it succeeds (`cron.job_run_details`).
2. **Vercel:** add `CRON_SECRET` (Production; Preview too if crons run there).
3. **After deploy:** check `cron.job_run_details` / the function logs for the next rent-reminders run, and Vercel → Cron Jobs for the next daily-recap run. Expect 200, not 401.

---

## 4. Deployment readiness checklist

### 4.1 Environment variables and secrets

**Vercel (Project → Settings → Environment Variables)** — no names were changed by the sprint.

| Variable | Required? | Used by | Notes |
|---|---|---|---|
| `CRON_SECRET` | **NEW — required** | `api/daily-recap.js` via `api/_lib/auth.js` | Long random string. |
| `VENDOR_SESSION_SECRET` | **NEW — required (SEC-002)** | `api/vendor-verify-pin.js`, `api/vendor-ticket.js` via `api/_lib/vendorSession.js` | ≥ 32 chars. Missing → vendor portal returns 500 (fails closed). See `docs/vendor-security-remediation.md`. |
| `SUPABASE_URL` *or* `VITE_SUPABASE_URL` | required (exists) | `api/_lib/auth.js` | Either is accepted. |
| `SUPABASE_SERVICE_ROLE_KEY` | required (exists) | all API routes | — |
| `RESEND_API_KEY` | required (exists) | `api/_lib/email.js`, `daily-recap`, `classify-and-route` | — |
| `OPENAI_API_KEY` | required (exists) | `api/classify-and-route.js` | — |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | required **if** Stripe targets `/api/stripe-webhook` | `api/stripe-webhook.js` | Now fails closed (500) if the secret is missing. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `LANDLORD_PHONE` | only if SMS is used | `api/sms-escalate.js` | No frontend caller currently invokes SMS (VERIFIED: `escalateStaleTicket` / `notifyUrgentTicketSms` in `src/notifications.js` are unused). |
| `LANDLORD_NOTIFY_EMAILS` | optional | `api/_lib/email.js` | Default `moduspropmgmt@gmail.com,capitalpathwaysapw@gmail.com`; `LANDLORD_EMAIL` is also appended if set. |
| `VITE_RESEND_API_KEY` | **remove** (recommended) | nothing | Present in `tenant-portal/.env`; unreferenced, but any `VITE_` variable is bundled to the browser if ever referenced. |

**Supabase (Project → Edge Functions → Secrets).** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

| Secret | Required? | Used by | Notes |
|---|---|---|---|
| `STRIPE_WEBHOOK_SECRET` | required **if** Stripe targets the edge `stripe-webhook` | `supabase/functions/stripe-webhook` | Must be that endpoint's own `whsec_…` (each Stripe endpoint has a distinct secret). Fails closed (500) if missing. |
| `STRIPE_SECRET_KEY` | required (exists) | payment and Connect functions | — |
| `RESEND_API_KEY` | required (exists) | `send-email`, `invite-tenant`, `rent-reminders` | — |
| `GOOGLE_PLACES_API_KEY` | required (exists) | `search-vendors` | — |
| `ALLOWED_ORIGINS` | optional | `_shared/security.ts` | Default `https://www.getmodusam.com,https://getmodusam.com,http://localhost:5173,http://localhost:4173`. **Add every other origin the app is served from** (e.g. Vercel preview / `*.vercel.app` production alias) or all browser → edge calls from it fail CORS. **UNKNOWN** which origins are in use. |
| `CRON_SECRET` | only for option (b) in §3.3 | `rent-reminders` | — |
| `LANDLORD_NOTIFY_EMAILS` | optional | edge `send-email` | Same default. |

### 4.2 Database column requirements (no migration needed if these hold)

The sprint's code reads or writes these columns. None of them is defined in the repo, so each is **UNKNOWN** against the live schema unless marked otherwise.

| Column | Requirement | Evidence that it exists | Failure mode if wrong |
|---|---|---|---|
| `maintenance_requests.vendor_token` | **must store ≥ 24 chars** (`text` or `varchar(≥24)`) | **UNKNOWN** — existing tokens are 12 chars | `generate-vendor-token`: update error shown in the Assign modal. `api/_lib/dispatchVendor.js`: update error **not checked**, so the emailed link silently doesn't work. If too short, set `generateToken` default to 12 in `api/_lib/auth.js` and `_shared/security.ts` before deploying. |
| `maintenance_requests.vendor_pin`, `vendor_token_expires_at` | existing | used by pre-sprint code | — |
| `profiles.id`, `profiles.role` (`'landlord'`) | existing | `src/ProtectedLandlordRoute.jsx:20-24` | Landlord would get 403 on landlord-only endpoints. |
| `tenants.user_id` | existing | `src/useTenant.js:42` | Tenants would get 403 on payments and messaging. |
| `landlords.auth_user_id` | existing | `src/LandlordSettings.jsx:341,365` | Stripe Connect onboard/verify would return 403. |
| `tenant_payment_methods.tenant_id`, `stripe_customer_id` | existing | `src/RentPaymentScreen.jsx:183-190` | Only the fallback ownership check; Stripe customer metadata is primary. |
| `messages.id, tenant_id, sender_id, body` | existing | `src/MessagingScreen.jsx:118-122` | AI routing would return 403. |

Optional pre-check (read-only, for the owner):
```sql
select column_name, data_type, character_maximum_length
from information_schema.columns
where table_name='maintenance_requests' and column_name in ('vendor_token','vendor_pin');
```

### 4.3 Pre-deploy decisions and checks

- [ ] **Which Stripe webhook is live?** Stripe Dashboard → Developers → Webhooks. Note each endpoint URL (`…/api/stripe-webhook` and/or `…/functions/v1/stripe-webhook`) and set the matching `STRIPE_WEBHOOK_SECRET` on that platform. **UNKNOWN** today.
- [ ] **rent-reminders cron header** — §3.3 step 1.
- [ ] **`vendor_token` length** — §4.2.
- [ ] **Origins in use** — set `ALLOWED_ORIGINS` if anything beyond the defaults is used.
- [ ] **Separate the commits.** The working tree mixes this sprint with the earlier signed-URL storage work (SEC-001) in `src/LandlordApplications.jsx`, `src/LandlordInspection.jsx`, `src/MoveInInspection.jsx` and `src/VendorTicket.jsx`. SEC-001's code is safe to ship before the buckets are made private: `src/storageUtils.js` signs both legacy public URLs and bare paths.

### 4.4 Deployment order

1. **Set all secrets first** (§4.1): Vercel `CRON_SECRET`; `STRIPE_WEBHOOK_SECRET` on whichever platform(s) Stripe targets; `ALLOWED_ORIGINS` if needed. Fix the rent-reminders cron header (§3.3).
2. **Deploy Vercel** (frontend + `tenant-portal/api/*` ship together). Why first:
   - The new frontend is backward-compatible with the *old* edge functions; it only adds an `Authorization` header (which `functions.invoke` already sent) and an extra `vendor_token` body field.
   - The new `/api/*` routes and the new frontend must ship together, because old frontends don't send `Authorization` to `/api/*`.
   - Users with an already-open old tab will get 401s on AI messaging and emails until they reload.
3. **Deploy Supabase Edge Functions** from `tenant-portal/` (the linked project, `tenant-portal/supabase/.temp/linked-project.json`). Deploy all ten:
   `create-payment-intent`, `create-setup-intent`, `generate-vendor-token`, `invite-tenant`, `rent-reminders`, `search-vendors`, `send-email`, `stripe-connect-onboard`, `stripe-connect-verify`, `stripe-webhook`.
   - `_shared/security.ts` is bundled automatically.
   - **Keep `--no-verify-jwt` on `stripe-webhook`**: Stripe sends no JWT, and the function now verifies the Stripe signature itself.
   - Do **not** deploy anything from `tenant-portal/src/supabase/` or `tenant-portal/supabase/generate-vendor-token/` (duplicates).
4. **Immediately run the smoke tests** in §4.5, starting with payments and the webhook.
5. **Rollback:** redeploy the previous Vercel deployment (Vercel → Deployments → Promote), and redeploy the edge functions from the last commit (`git stash` or a clean checkout of `fda8dc6`). No database state changes are part of this sprint, so rollback is code-only.

### 4.5 Manual tests after deploy

Use real accounts: one landlord, one tenant with a claimed `tenants` row, and one vendor link. Watch Vercel function logs and Supabase function logs throughout.

**Negative / security checks (expected failures)**

| Check | Expected |
|---|---|
| `curl -X POST https://<domain>/api/send-email -H 'Content-Type: application/json' -d '{"to":"x@example.com","subject":"t","html":"t"}'` | **401** |
| Same for `/api/sms-escalate`, `/api/dispatch-vendor`, `/api/classify-and-route` | **401** |
| `curl https://<domain>/api/daily-recap` (no secret) | **401** |
| POST to the edge `stripe-webhook` URL with an unsigned body | **400** "Invalid signature" |
| `create-payment-intent` invoked with the anon key only | **401** |
| Edge function called from a non-allowlisted origin (browser) | CORS blocked |
| Vendor PIN: wrong PIN | "Incorrect PIN" after ~0.75 s |

**Tenant**
- [ ] Log in → Home loads.
- [ ] Messages: send a normal message → AI reply appears and the typing indicator clears (`MessagingScreen.jsx` → `api/classify-and-route.js`).
- [ ] Messages: send an emergency message → ticket created; landlord receives the emergency email and the dispatch email (`api/_lib/dispatchVendor.js`).
- [ ] New maintenance request → landlord receives the email (`MaintenanceRequestForm.jsx` → edge `send-email`).
- [ ] Comment on a ticket → landlord receives the email (`TenantMaintenanceDetail.jsx`).
- [ ] Move-in inspection sign-off → landlord receives the email (`MoveInInspection.jsx` → `/api/send-email`).

**Payments (test mode first if possible)**
- [ ] Link a bank on `/pay` and on `/wallet` (`create-setup-intent`).
- [ ] Pay with a newly linked bank and with a saved bank (`create-payment-intent`) → `payments` row `pending`.
- [ ] Stripe Dashboard → webhook endpoint → recent deliveries all **200**. `payments.status` becomes `paid` (or `failed`).
- [ ] Receipt email (Vercel webhook only; the edge webhook's receipt was already non-functional before the sprint).
- [ ] Amount with cents (e.g. rent $1,234.56) charges exactly 123456 cents.

**Landlord**
- [ ] Invite a tenant from Tenants, Tenant Detail, and Application approval (`invite-tenant`).
- [ ] Decline an application → applicant receives the email (`LandlordApplications.jsx` → `/api/send-email`).
- [ ] Inspection emails to the tenant (`LandlordInspection.jsx`).
- [ ] Maintenance: status change, comment, approve vendor work, request more work → tenant/vendor emails (edge `send-email`).
- [ ] Vendor search (`search-vendors`), then assign a vendor (`generate-vendor-token`) → link shows a 24-char token and a PIN.
- [ ] Settings → Stripe Connect → onboarding redirect and return to `/landlord/settings?stripe=success` shows connected (`stripe-connect-onboard`/`-verify`).
- [ ] Trigger daily recap manually while signed in as landlord (POST `/api/daily-recap` with session) → email arrives. Next scheduled 12:00 UTC run shows 200 in Vercel → Cron Jobs.

**Vendor**
- [ ] New link: correct PIN → work-order screen → sign → ticket page.
- [ ] Pre-deploy link (12-char token) still opens.
- [ ] Upload a photo, comment, submit a quote (landlord gets the "Quote received" email), mark complete with an invoice (landlord gets the "completed" email).
- [ ] Expired link is rejected.

**Scheduled**
- [ ] rent-reminders: invoke with the header configured in §3.3 and `?force=true` → 200 with `sent` count. Without auth → 401. Confirm the next scheduled run in `cron.job_run_details`.

---

## 5. Summary of open risks (not addressed by this sprint)

| # | Risk | Severity | Fix |
|---|---|---|---|
| 1 | Anonymous enumeration and modification of vendor-eligible maintenance tickets (tokens, PINs, entry instructions, photos) — §1.2 | **High** | §1.3 |
| 2 | Client-chosen payment amount — §2 | Medium | §2.3 Phase 1 |
| 3 | rent-reminders may 401 after deploy if its cron sends the anon key — §3 | Medium (availability) | §3.3 |
| 4 | `vendor_token` column length unknown — §4.2 | Medium (availability) | Pre-check |
| 5 | No PIN lockout | Medium | §1.3 step 7 |
| 6 | No authoritative charge ledger; `payments` has mixed units | Medium (correctness) | ENT-001 + FIN-001 |
