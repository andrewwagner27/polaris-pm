# Release candidate RC1 — 2026-11-14 (not deployed)

Branch `feature/launch-readiness` (local), on top of production `ff4ebd0`. Fast-forward only.

## Commits (oldest first)

| Commit | What | Production touch |
|---|---|---|
| `434e995` | AI: earlier AI replies labelled, not a source of facts | Vercel |
| `0133849` | AI: withdrawn knowledge in prompt, verified management attribution, Teach Agent ignores AI drafts, **atomic one-run-per-message claim** | Vercel (+ migration A) |
| `1d738be` | Landlord screens: ledger balances only, never rent as debt ("-$1 overdue" fix) | Vercel |
| `d28a41d` | Expired/invalid link page, reset-page states, reset-form focus bug | Vercel |
| `57b7777` | Security hardening migration + review doc | migration B |
| `d9287fc` | Maintenance: keepalive + server-side sweep for missed new-ticket alerts | Vercel |
| `c537f09` | Daily recap: open/resolved, older unresolved, failed ticket emails | Vercel |
| `f1d55bc` | Preview isolation guards (fail closed in Preview) | Vercel |
| `8b6fe0c` | Mobile: zoom, safe areas, chat composer | Vercel |
| `6ea23ee` | Maintenance form: photo collisions, inline errors | Vercel |

After `6ea23ee` there are documentation-only commits (`docs/`); deploy the branch head (`<head>` below).

Tests at the head: 552, 551 pass (the one failure is the known Windows CRLF hash check on earlier migrations,
unchanged). Build passes. Render check 22/22 (server render of tenant, landlord, Agent Center and link pages).

## Migrations (apply in this order, each with `supabase db query --project-ref ynbxdbwxdydbpkzaffte --linked -f <file>`)

| # | File | Validated | Rollback |
|---|---|---|---|
| A | `20261114120000_ai_message_claims.sql` — service-role-only claims table | PGlite 14/14 | `DROP TABLE IF EXISTS public.ai_message_claims;` |
| B | `20261114130000_security_hardening.sql` — revoke EXECUTE on 2 definer trigger fns, pin search paths, tenant-link integrity (no staff links; one active tenant per login) | PGlite 24/24 (production function bodies) | in file header |

Both refuse to run twice; B refuses if reviewed function bodies changed or if violations exist. The app works
before and after either migration (A: the route skips the claim if the table is missing).

## Deployment order

1. **Pre-checks** (read-only): `origin/main` = `ff4ebd0`; cron job 2 inactive; `a2_settings.cutover_date` NULL;
   0 tenants linked to landlord logins; 0 duplicate tenant links; md5 of `handle_new_user` = `0acdcd1b…`.
2. **Migration A**, then **migration B** (B's preconditions are the safety net).
3. **Fast-forward `main`** `ff4ebd0 → <head>` with `git update-ref refs/heads/main <head> ff4ebd0`, push `main` only.
   Vercel deploys Production. Watch `gh api repos/andrewwagner27/polaris-pm/commits/<head>/status`.
4. **Smoke tests** (below).

No Edge Function redeploys. No environment-variable changes are required for RC1 (the Preview guard is inert in
Production; it activates only in Preview).

## Security verification after deploy

- `select has_function_privilege('authenticated','public.agent_knowledge_guard()','EXECUTE')` → false (same for
  `handle_new_user()`); `select proconfig from pg_proc where oid='public.handle_new_user()'::regprocedure` → `search_path=""`.
- Read-only RLS probe as Test User (scratchpad `rls_probe.sql`, `sec_probe.sql`): unchanged results.
- `ai_message_claims`: anon/authenticated have no privileges.

## Smoke tests (dummy accounts only)

1. **AI history:** as Test User ask "[Release test 3] Which parking spot is assigned to my unit?" → the reply must
   **not** say TEST-2; it should say there's no confirmed assignment for Unit 2 / flag management. Routing row has
   `withdrawn_ids` containing `e1b9b79a…` and no `knowledge_ids` entry for it.
2. **Idempotency:** the same message never produces two AI replies (check `ai_message_claims` has one row per message).
3. **Balances:** landlord tenant detail for the onboarding dummy shows "Not tracked" (no "-$1"); dashboard rent roll
   shows "Not tracked" for occupied units; reports delinquency explains it isn't tracked.
4. **Links:** `https://www.getmodusam.com/#error=access_denied&error_code=otp_expired` → "This link has expired" page;
   `/reset-password` without a session → "Open the link from your email".
5. **Maintenance:** as Test User submit "[Release test] RC1 check" with 2 photos → confirmation screen; the ticket
   gets "Management emailed…" note; open landlord Maintenance → sweep returns sent 0 (already notified).
6. **Recap:** trigger `/api/daily-recap` as landlord (manual run, sends to management): escalations show
   RESOLVED/OPEN; "Still unresolved from earlier" lists open test escalations.
7. **Mobile:** 390 px: chat composer visible, no horizontal scroll on the 8 tenant screens.

## Rollback

- App: fast-forward is reversible only by a new commit. Revert with `git revert --no-edit ff4ebd0..<head>` on a
  branch, review, then fast-forward `main` to the revert commit (never force-push).
- Migrations: rollback statements in each file header. B's rollback restores grants and drops the new trigger/index.
- The app tolerates migration A's absence; B has no app dependency.

## Production changes awaiting approval (none performed)

1. Apply migrations A and B. 2. Deploy RC1 (`main` → `<head>`). 3. Supabase Auth: invitation/OTP link lifetime to
24 h (dashboard), leaked-password protection on. 4. DNS: add a DMARC record. 5. Vercel Preview credentials split
(docs/launch/preview-isolation.md). 6. Close dummy ticket MR-C8945 and archive the onboarding dummy after the
onboarding test.
