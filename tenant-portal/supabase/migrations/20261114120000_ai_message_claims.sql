-- 20261114120000_ai_message_claims.sql
-- Atomic "one AI run per tenant message" claim for /api/classify-and-route.
--
-- Problem: two overlapping requests for the same message (double tap, two tabs, a network retry) could both pass the
-- "already answered?" check before either wrote its routing row, producing two AI replies and two alerts.
-- Fix: the route inserts (message_id) here before doing any work. The primary key makes the claim atomic: the second
-- request gets a unique violation and stops. A claim older than the route's stale window (a crashed run) may be taken
-- over with a conditional UPDATE, so a failure never blocks the message forever. A finished run sets completed_at; a
-- completed claim is never taken over, so a message is never answered twice (even if its routing row failed to write).
-- The stale window (90 s) is longer than the route's hard limit (vercel.json maxDuration 60 s), so a claim can only be
-- taken over after its run has been stopped.
--
-- Additive only: one table. Only the service role (the Vercel API) uses it; RLS is on with no policies and nothing is
-- granted to anon/authenticated. Deleting a message removes its claim. The application works without this table
-- (the route treats a missing table as "no claim available", logs [message-claim] UNAVAILABLE and records claim:"unavailable"
-- on the routing row) — apply this migration BEFORE deploying the release and verify the table afterwards.
--
-- Rollback:  DROP TABLE IF EXISTS public.ai_message_claims;

-- One transaction: either every statement below applies or none does.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.ai_message_claims') IS NOT NULL THEN
    RAISE EXCEPTION 'ai_message_claims already exists; refusing to re-run';
  END IF;
  IF to_regclass('public.messages') IS NULL THEN
    RAISE EXCEPTION 'public.messages is missing';
  END IF;
END $$;

CREATE TABLE public.ai_message_claims (
  message_id  uuid PRIMARY KEY REFERENCES public.messages(id) ON DELETE CASCADE,
  claimed_at  timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

COMMENT ON TABLE public.ai_message_claims IS
  'One AI run per tenant message (api/classify-and-route). Service role only. An unfinished stale claim may be taken over; a completed one never.';

ALTER TABLE public.ai_message_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_message_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_message_claims TO service_role;

COMMIT;
