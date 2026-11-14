# Vercel Preview isolation

**Problem (confirmed by an independent review):** Vercel Preview deployments receive the same secrets as Production:
`SUPABASE_SERVICE_ROLE_KEY` (+ `SUPABASE_URL`), `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, `TWILIO_*`,
`OPENAI_API_KEY`, `RESEND_API_KEY`. Any pushed branch builds a Preview (the repo is public; a pre-push hook blocks
`release/*` but not other branches) whose API routes could read/write production tenant data with the service role,
email real tenants and vendors, send SMS, or reach live Stripe.

## Code guard (in the next release candidate — `api/_lib/deployEnv.js`)

Fail-closed, acts only when Vercel says `VERCEL_ENV=preview|development` (Production and unknown are unaffected):

| Risk | Guard |
|---|---|
| Production tenant data via service role | Every API route returns **503** in Preview when `SUPABASE_URL` is the production project (`ynbxdbwxdydbpkzaffte`). Override only with `PREVIEW_ALLOW_PRODUCTION_DB=true` set **for Preview** on purpose. |
| Real payments | A live Stripe key (`sk_live_`/`rk_live_`) outside Production → 503. **No override.** |
| Real tenant / vendor email | Outside Production, email only to `PREVIEW_EMAIL_ALLOWLIST` (comma-separated dummy addresses). Everything else is refused before calling Resend. |
| SMS | Never sent outside Production (`emergencySmsConfig` returns disabled). |

Tests: `tests/preview-isolation.test.mjs`. What the code guard can't cover: the **browser** bundle of a Preview uses
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (RLS-limited, same as the public site) and calls the shared
**Supabase Edge Functions** (`invite-tenant`, `send-email`, `create-payment-intent`, `rent-reminders`), which run in
Supabase, not Vercel. Only a separate Supabase project fully isolates those.

## Environment-variable migration plan (needs your approval and dashboard access; no secret is shown here)

1. **Create a staging Supabase project** (free tier is fine). Apply all migrations in order. Seed dummy data only.
2. **Vercel → Settings → Environment Variables**, for each variable below, set *separate* values for **Preview** and
   uncheck Preview on the Production value:

   | Variable | Production | Preview |
   |---|---|---|
   | `SUPABASE_URL`, `VITE_SUPABASE_URL` | production project | **staging** project |
   | `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_ANON_KEY` | production | **staging** keys |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | live (when payments launch) | **test mode** (`sk_test_…`) or unset |
   | `TWILIO_*`, `LANDLORD_PHONE`, `EMERGENCY_SMS_ENABLED` | as decided | **unset** |
   | `RESEND_API_KEY` | production key | a separate key (sending-only) or unset |
   | `PREVIEW_EMAIL_ALLOWLIST` | — | dummy inboxes only (e.g. the `moduspropmgmt+…` aliases) |
   | `LANDLORD_EMAIL`, `ESCALATION_NOTIFY_EMAILS` | real | a dummy inbox |
   | `OPENAI_API_KEY` | production | separate key with a low spend limit |
   | `CRON_SECRET`, `VENDOR_SESSION_SECRET` | production | different random values |
   | `PREVIEW_ALLOW_PRODUCTION_DB` | — | **do not set** |
3. Redeploy one Preview, confirm it shows the staging data and that `/api/notify` works against staging.
4. **Rotate** the production `SUPABASE_SERVICE_ROLE_KEY` (and Stripe/Twilio if they were ever live in Preview), since
   past Preview builds had them. Update both Vercel (Production) and any Supabase Edge Function secrets that use them.
5. Optional: Vercel → Deployment Protection → require Vercel Authentication for Preview deployments.

Until steps 1–2 are done, the code guard makes Preview API routes unusable (503) rather than unsafe.
