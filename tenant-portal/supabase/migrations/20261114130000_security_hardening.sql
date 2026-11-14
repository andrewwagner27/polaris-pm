-- 20261114130000_security_hardening.sql
-- Security-advisor follow-up (reviewed 2026-11-14 against production; see docs/launch/security-review.md).
--
-- 1. SECURITY DEFINER trigger functions callable by anon/authenticated: agent_knowledge_guard() and handle_new_user()
--    had EXECUTE granted to PUBLIC. They can't be called usefully outside a trigger (Postgres rejects that), so this is
--    hygiene, not an exploit — but nothing should hold EXECUTE on them. Triggers keep firing: EXECUTE on a trigger
--    function is checked when the trigger is created, not when it fires (validated locally).
-- 2. handle_new_user() (SECURITY DEFINER, on auth.users insert) had no pinned search_path. Its body is fully
--    qualified (public.profiles) and always assigns role 'tenant', so pinning search_path = '' changes nothing.
-- 3. Twelve SECURITY INVOKER functions with a mutable search_path get search_path = public. Their bodies reference
--    only pg_catalog and public objects (reviewed).
-- 4. Tenant link integrity (onboarding hardening):
--    a. one active (non-archived) tenant record per portal login: unique partial index on tenants(user_id);
--    b. a tenant record can never be linked to a management (landlord) login — enforced for every role, including
--       landlords and the service role, which bypass the tenant-side claim rules. Uses the existing
--       SECURITY DEFINER helper wp1_is_staff_user(); the new trigger function itself is SECURITY INVOKER.
--    Production had no violations of either rule when this was written (0 duplicate links, 0 landlord links).
--
-- Not changed here (documented): pg_net is installed in schema public (the extension is not relocatable; its
-- functions live in schema net); wp1_is_staff_user() lets a signed-in user test whether an id is staff (used by RLS).
--
-- Rollback:
--   DROP TRIGGER IF EXISTS tenants_no_staff_link ON public.tenants;
--   DROP FUNCTION IF EXISTS public.tenants_no_staff_link();
--   DROP INDEX IF EXISTS public.tenants_one_active_link_per_user;
--   ALTER FUNCTION public.handle_new_user() RESET search_path;
--   GRANT EXECUTE ON FUNCTION public.agent_knowledge_guard(), public.handle_new_user() TO PUBLIC, anon, authenticated;
--   (search_path on the twelve invoker functions may stay; to undo: ALTER FUNCTION <name>(<args>) RESET search_path;)

-- One transaction: either every statement below applies or none does.
BEGIN;

DO $$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.handle_new_user()'::regprocedure) <> '0acdcd1b760a632008e61b827efa5317' THEN
    RAISE EXCEPTION 'handle_new_user() differs from the reviewed version; re-review before applying';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.wp1_is_staff_user(uuid)'::regprocedure) <> '19433b422c82bde62d2ad922f44b10b6' THEN
    RAISE EXCEPTION 'wp1_is_staff_user(uuid) differs from the reviewed version; re-review before applying';
  END IF;
  IF to_regprocedure('public.agent_knowledge_guard()') IS NULL THEN
    RAISE EXCEPTION 'agent_knowledge_guard() is missing (apply 20261114000000_agent_knowledge first)';
  END IF;
  IF to_regclass('public.tenants_one_active_link_per_user') IS NOT NULL THEN
    RAISE EXCEPTION 'already applied; refusing to re-run';
  END IF;
  IF EXISTS (SELECT user_id FROM public.tenants WHERE user_id IS NOT NULL AND coalesce(archived, false) = false
             GROUP BY user_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'a login is linked to more than one active tenant record; resolve before applying';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenants t JOIN public.profiles p ON p.id = t.user_id WHERE p.role = 'landlord') THEN
    RAISE EXCEPTION 'a tenant record is linked to a management login; resolve before applying';
  END IF;
END $$;

-- 1 + 2
REVOKE EXECUTE ON FUNCTION public.agent_knowledge_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.handle_new_user() SET search_path = '';

-- 3
ALTER FUNCTION public.a1_append_only() SET search_path = public;
ALTER FUNCTION public.a2_append_only() SET search_path = public;
ALTER FUNCTION public.a2_charge_guard() SET search_path = public;
ALTER FUNCTION public.a2_payment_channel_guard() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.update_evictions_updated_at() SET search_path = public;
ALTER FUNCTION public.update_rent_payments_updated_at() SET search_path = public;
ALTER FUNCTION public.update_routing_rules_updated_at() SET search_path = public;
ALTER FUNCTION public.a2_cat(text) SET search_path = public;
ALTER FUNCTION public.a2_is_service() SET search_path = public;
ALTER FUNCTION public.a2_ny_date(timestamp with time zone) SET search_path = public;
ALTER FUNCTION public.a2_today() SET search_path = public;

-- 4a
CREATE UNIQUE INDEX tenants_one_active_link_per_user ON public.tenants (user_id)
  WHERE user_id IS NOT NULL AND coalesce(archived, false) = false;

-- 4b
CREATE FUNCTION public.tenants_no_staff_link() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id)
     AND public.wp1_is_staff_user(NEW.user_id) THEN
    RAISE EXCEPTION 'A tenant record cannot be linked to a management account'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.tenants_no_staff_link() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER tenants_no_staff_link
  BEFORE INSERT OR UPDATE OF user_id ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tenants_no_staff_link();

COMMIT;
