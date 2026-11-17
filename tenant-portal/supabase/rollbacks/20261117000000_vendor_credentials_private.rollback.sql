-- supabase/rollbacks/20261117000000_vendor_credentials_private.rollback.sql
-- Undoes migration 20261117000000_vendor_credentials_private.sql (kept OUTSIDE supabase/migrations so no tool applies it).
-- Restores the previous state exactly: table-wide SELECT for authenticated (anon had no grant before and gets none),
-- no insert guard trigger, no landlord_vendor_access RPC. Data is not touched.
-- Run only together with promoting the previous app deployment (e74b16d); the new app works on either schema.
-- Tested 2026-11-17 on an isolated local restore of the 2026-11-17 production backup: apply → rollback → re-apply.
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.landlord_vendor_access(uuid)') IS NULL THEN
    RAISE EXCEPTION 'migration 20261117000000 is not applied: nothing to roll back';
  END IF;
END $$;

GRANT SELECT ON public.maintenance_requests TO authenticated;
DROP TRIGGER IF EXISTS maintenance_requests_guard_insert ON public.maintenance_requests;
DROP FUNCTION IF EXISTS public.guard_maintenance_request_insert();
DROP FUNCTION IF EXISTS public.landlord_vendor_access(uuid);

COMMIT;
