# Modus UI/UX redesign: implementation log, audit approval gate, deployment plan

Branch `redesign/action-first`, created from production `main` (`55f4a91`). Local only; nothing pushed, deployed or applied.

## Implementation log

| Phase | Commit | What changed |
|---|---|---|
| 1 Foundation | `9437fdf` | Design tokens (`src/lib/tokens.js`); AA palette migration across 54 files; shared `PrimaryBtn`/`GhostBtn`; focus rings, AA placeholders, 44 px phone targets (`index.css`); landlord header with property selector; phone bottom bar (Home, Properties, Maintenance, Financials, More) with safe-area padding; `PropertyScopeProvider` + `usePropertyScope` + `useScopedLoad` |
| 2 Action-first | `b713d4f` | Dashboard (Needs attention → snapshot → compact rent roll); maintenance cards with timeline, next action, call chips, drawer/sheet, deep links, CSV export; tenants cards + drawer; financials exceptions-first, mobile record cards, no inferred unpaid rent |
| 3 Audit | see below | Migration **prepared and tested locally, not applied**; no dependent UI built (approval gate) |
| 4 Tenant & marketing | see below | Tenant home, pay, activity, wallet, maintenance list, messaging; landing page mobile layout and claim audit |

## Phase 3: audit infrastructure (APPROVAL REQUIRED)

**Finding.** No general audit log exists. `a2_*` functions stamp the actor/reason on the record itself (void, refund,
late-fee exemption), but manual payment entry (`payments` INSERT), lease edits (`tenants` UPDATE) and expense voids
(`expenses` UPDATE) were direct table writes with no history.

**Prepared:** `supabase/migrations/20261118000000_audit_logs.sql` (+ `supabase/rollbacks/20261118000000_audit_logs.rollback.sql`,
`scripts/local-db/audit-logs-check.sql`).

- `audit_logs`: append-only for every role (UPDATE/DELETE/TRUNCATE triggers), landlord-read-only (RLS), no client INSERT
  grant; `occurred_at`, `actor_id` (`auth.uid()`), `actor_role`, `txid` overwritten server-side on insert.
- `audit_capture()` row triggers on `payments`, `tenants` (lease fields), `units` (rent), `expenses`, `tenant_charges`,
  `a2_late_fee_exemptions`: same transaction as the change; column allow-lists exclude Stripe ids, contact details,
  insurance/document URLs.
- `audit_requests`: one row per confirmation request id → double submission refused inside the transaction.
- RPCs for the confirmation UI (SECURITY INVOKER, landlord + reason + request id): `audited_record_manual_payment`
  (writes payment rows only, never contacts Stripe), `audited_update_lease` (lease fields only, returns before/after),
  `audited_void_expense`. Existing `a2_*` waive/void/refund functions keep working and are captured.

**Tested** on an isolated local restore of the 2026-11-17 backup (127.0.0.1:55432; DB dropped and cluster stopped
afterwards): 25/25 checks pass. Covered:
- atomic payment + audit;
- server-derived actor and time;
- reason required;
- duplicate refused;
- failed change leaves no audit row and does not consume the request;
- direct (old-path) writes still audited;
- no direct insert, update or delete for landlords; append-only even for the superuser; truncate refused;
- tenant and anon have no access.

Migration applied and refused on a second run; the rollback removes capture and the RPCs but **keeps every audit row**
(still append-only); a second rollback is refused.

**Recovery plan.** Never drop or truncate `audit_logs`. Rolling back = run the rollback file (history stays). To
re-enable after a rollback, re-run sections 2–4 of the migration (the table already exists, so the full migration's
guard refuses by design).

**Gate.** `ConfirmHighImpactAction` and the wiring of record-payment / lease-edit / void / waive flows to the audited
RPCs are **not built** until you approve this migration. Approve → apply to production (after a fresh backup) → build
the confirmation UI on the RPCs.

## Production deployment plan (when approved)

1. Fresh backup (nightly job, or run it manually) and confirm `state/last-run.json` OK.
2. Fast-forward `main` to the approved redesign commit; push `main` only; wait for Vercel READY.
3. Smoke test: landlord Home/Maintenance/Tenants/Financials at phone and desktop width; property selector (All → Clifton
   Manor → All); open/close a ticket drawer; tenant Home, Maintenance, Messages, Pay; landing page.
4. Audit migration (only with its own approval): `q.ps1 <migration> -Write`, then the read-only state check.

No new environment variables, Edge Functions, `vercel.json` changes or dependencies. The redesign changes no API
route, AI prompt, routing, dispatch, or payment-processing code.

## Rollback

- UI: promote the previous Vercel deployment (`55f4a91`). The redesign needs no database change, so code-only rollback is
  complete.
- Audit migration (if applied): run `supabase/rollbacks/20261118000000_audit_logs.rollback.sql`; history is retained.
