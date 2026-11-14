# Supabase security review — 2026-11-14

Production project `ynbxdbwxdydbpkzaffte`, reviewed read-only (catalog queries and a rolled-back `READ ONLY`
probe as the dummy tenant "Test User"). Nothing in production was changed by this review.

## Findings

| # | Finding (advisor / review) | Real risk? | Action |
|---|---|---|---|
| 1 | `agent_knowledge_guard()` SECURITY DEFINER, EXECUTE granted to anon/authenticated | **Low.** It's a trigger function; Postgres refuses to call it outside a trigger, and PostgREST doesn't expose trigger functions. | Revoke EXECUTE (migration `20261114130000`). Triggers still fire (validated). |
| 2 | `handle_new_user()` SECURITY DEFINER, EXECUTE to anon/authenticated, no `search_path` | **Low.** Body is fully qualified (`public.profiles`) and always inserts role `'tenant'` — sign-up can't create a management account. anon/authenticated have no CREATE on `public`, so the search path can't be hijacked today. | Revoke EXECUTE; pin `search_path = ''`. Migration refuses to run if the body changed since review (md5). |
| 3 | 12 functions with mutable `search_path` (all SECURITY INVOKER: `a1_append_only`, `a2_append_only`, `a2_charge_guard`, `a2_payment_channel_guard`, `set_updated_at`, three `update_*_updated_at`, `a2_cat`, `a2_is_service`, `a2_ny_date`, `a2_today`) | **Configuration warning.** Invoker functions run with the caller's rights. | Pin `search_path = public` (bodies reference only pg_catalog/public). The advisor's count of 15 likely includes extension-owned functions, which are out of scope. |
| 4 | `pg_net` installed in schema `public` | **Low.** Only the extension record lives in `public`; its functions are in schema `net`. The extension isn't relocatable. | Document only. Moving it needs drop/recreate during a maintenance window; Supabase manages `net` grants. |
| 5 | Other SECURITY DEFINER RPCs callable by `authenticated` (≈40: `a1_*`, `a2_*`, `wp1_*`, `is_landlord`, `tenant_claim_email_matches`) | **No exploit found.** As a tenant: all landlord-only data functions returned 0 rows (landlord got rows); `a2_generate_charges`, `a2_assess_late_fees` → "not allowed"; `a2_pay_rent_due(other tenant)` → "not authorized for this tenant". Write RPCs call `a2_require_landlord()` first. | None. |
| 6 | No SECURITY DEFINER non-trigger function is callable by `anon` | — | None. |
| 7 | All `public` tables have RLS enabled; no views | — | None. |
| 8 | "Open" policies (`USING true`/`WITH CHECK true`) on `incident_logs`, `landlord_alerts` | **None.** They apply only to `service_role`. | None. |
| 9 | `wp1_is_staff_user(uuid)` lets any signed-in user test whether an id is a staff account | **Low** (ids are random UUIDs; used by RLS). | Document. |
| 10 | Tenant ↔ login integrity: landlords and the service role bypass the tenant claim rules (RLS + `protect_tenant_columns`) | **Medium** (caused the 2026-11-13 dummy-record incident via the onboarding page; app fix `ff4ebd0` is live). | Database backstop in `20261114130000`: a tenant can never be linked to a management login (any role), and one login ↔ at most one active tenant record. |
| 11 | Knowledge creation/retirement | Verified earlier: only landlords (RLS `is_landlord()`), approved_by/retired_by set by the database, no edits/deletes, tenants/anon have no access. | None. |

## Tenant isolation (re-verified)

As Test User: own tenant row only, own unit only, other tenants' maintenance 0, other tenants' messages 0,
`agent_knowledge` 0, `agent_escalation_events` 0. Cross-tenant RPCs: see #5.

## Not reviewed here (dashboard settings — check in Supabase → Authentication)

- Leaked-password protection (HaveIBeenPwned) — recommend ON.
- OTP/email link expiry — currently ≈1 hour (observed). Keep; invitation emails should say "use within an hour".
- Minimum password length — the app enforces 8; consider setting the same in Auth settings.

## Applying

Migration `supabase/migrations/20261114130000_security_hardening.sql` (preconditions refuse a changed
`handle_new_user`/`wp1_is_staff_user`, duplicate links, or staff links; refuses re-run). Validated on PGlite: 24/24.
Apply with `supabase db query --project-ref ynbxdbwxdydbpkzaffte --linked -f <file>` after approval. Rollback is in the
file header.
