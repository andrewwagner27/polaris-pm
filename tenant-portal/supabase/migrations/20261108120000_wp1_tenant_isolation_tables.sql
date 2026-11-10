-- ============================================================
-- MODUS — WP1 (part 1 of 2), revision 4: tenant isolation for 11 tables + tenants + messages
-- NOT APPLIED. Do not run via `supabase db push`. Run with the release package's apply script
-- (C:\Modus-backups\release\wp1-release\), only after owner approval, BEFORE part 2.
--
-- Revision 4 reconciles revision 3 (inventory 2026-11-02) with the production schema of
-- 2026-11-06 (structure-only dump):
--   * bulletins:  RLS is now ON with one policy "Anyone can read bulletins" (anon + authenticated,
--                 USING true). It is dropped here; the property-scoped policies replace it.
--   * evictions:  RLS is now ON with NO policy (even the landlord is denied). A landlord-only
--                 policy is added.
--   * bulletin data: no longer pinned to exactly 2 rows (unknowable from a structure dump); every
--                 bulletin with a NULL property_id must resolve through tenant → unit → property.
--   * tenants:    the existing column guard protect_tenant_columns() (legacy RLS fix) let tenant
--                 sessions change autopay_enabled, an administrative billing flag nothing in the
--                 app writes. It is removed from the tenant-writable list. The email-based
--                 select/claim policies are limited to UNCLAIMED rows and a VERIFIED email
--                 (tenant_claim_email_matches, the rule the claim trigger already enforces).
--   * messages:   tenant inserts may address only staff (or no one); previously any user id,
--                 which put a tenant's message into another tenant's readable set.
--   * Everything outside this scope (all other policies, functions, triggers, RLS flags and
--     ACLs, including A1–A3.2 accounting) is fingerprinted in Part 0 and must be identical in
--     Part 3.
--
-- ONE TRANSACTION:
--   Part 0  Preconditions  — abort unless production matches the 2026-11-06 schema exactly
--   Part 1  Privileges     — anon / PUBLIC: nothing on the 11 tables
--   Part 2  Helpers, RLS, policies, guard triggers, bulletin property backfill, tenants, messages
--   Part 3  Postconditions (catalog) incl. outside-scope fingerprint
--   Part 4  Behaviour      — synthetic fixtures; landlord / tenant A / tenant B / anon /
--                            service_role checks inside a SAVEPOINT, rolled back before COMMIT
-- A second run aborts in Part 0 ("already applied").
-- Staff access stays is_landlord() (ENT-002 replaces it later).
-- Storage policies: part 2, 20261108120100_wp1_tenant_isolation_storage.sql (separate transaction).
-- ============================================================

BEGIN;

-- ============================================================
-- PART 0: Preconditions
-- ============================================================
DO $$
DECLARE
  c_tables constant text[] := ARRAY['bulletins','bulletin_comments','bulletin_likes','evictions','inspections',
    'maintenance_comments','ai_routing_logs','ai_routing_rules','incident_logs','landlord_alerts','move_in_checklist'];
  v_bad text;
  v_n   int;
BEGIN
  IF to_regprocedure('public.wp1_my_tenant_ids()') IS NOT NULL THEN
    RAISE EXCEPTION 'WP1 precondition: already applied (public.wp1_my_tenant_ids exists) — nothing to do';
  END IF;

  -- Tables exist with the 2026-11-06 RLS flags
  WITH expected(t, rls) AS (VALUES
    ('bulletins', true), ('bulletin_comments', false), ('bulletin_likes', false), ('evictions', true),
    ('inspections', true), ('maintenance_comments', true), ('ai_routing_logs', true), ('ai_routing_rules', true),
    ('incident_logs', true), ('landlord_alerts', true), ('move_in_checklist', true), ('tenants', true), ('messages', true))
  SELECT string_agg(e.t, ', ') INTO v_bad FROM expected e
  LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || e.t)
  WHERE c.oid IS NULL OR c.relrowsecurity <> e.rls;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'WP1 precondition: table missing or RLS flag differs: %', v_bad; END IF;

  -- Exactly the 18 policies on the 11 tables (permissive; cmd, roles, USING, WITH CHECK; whitespace normalized)
  WITH expected(t, n, cmd, roles, q, c) AS (VALUES
    ('ai_routing_logs','Landlord can update routing logs','UPDATE','authenticated','true',NULL),
    ('ai_routing_logs','Landlord can view routing logs','SELECT','authenticated','true',NULL),
    ('ai_routing_logs','Service can insert routing logs','INSERT','authenticated',NULL,'true'),
    ('ai_routing_rules','Landlord can manage routing rules','ALL','authenticated','true',NULL),
    ('bulletins','Anyone can read bulletins','SELECT','anon,authenticated','true',NULL),
    ('incident_logs','Landlord can manage incident logs','ALL','authenticated','true',NULL),
    ('incident_logs','Service can insert incident logs','INSERT','service_role',NULL,'true'),
    ('incident_logs','Service can update incident logs','UPDATE','service_role','true',NULL),
    ('inspections','Landlord full access','ALL','public',
      '((auth.role() = ''authenticated''::text) AND (EXISTS ( SELECT 1 FROM tenants t WHERE (t.id = inspections.tenant_id))))','true'),
    ('inspections','Tenant read own','SELECT','public',
      '(EXISTS ( SELECT 1 FROM tenants t WHERE ((t.id = inspections.tenant_id) AND (t.user_id = auth.uid()))))',NULL),
    ('inspections','Tenant update own','UPDATE','public',
      '(EXISTS ( SELECT 1 FROM tenants t WHERE ((t.id = inspections.tenant_id) AND (t.user_id = auth.uid()))))',NULL),
    ('landlord_alerts','Landlord can manage alerts','ALL','authenticated','true',NULL),
    ('landlord_alerts','Service can insert alerts','INSERT','service_role',NULL,'true'),
    ('maintenance_comments','authenticated can insert','INSERT','public',NULL,'(auth.uid() = author_id)'),
    ('maintenance_comments','landlord can read all comments','SELECT','public','true',NULL),
    ('maintenance_comments','tenant can read visible comments','SELECT','public',
      '((visible_to_tenant = true) OR (auth.uid() = author_id))',NULL),
    ('move_in_checklist','Landlord can view all checklists','SELECT','authenticated','true',NULL),
    ('move_in_checklist','Tenants can manage their own checklist','ALL','authenticated',
      '(tenant_id IN ( SELECT tenants.id FROM tenants WHERE (tenants.user_id = auth.uid())))',
      '(tenant_id IN ( SELECT tenants.id FROM tenants WHERE (tenants.user_id = auth.uid())))')),
  actual AS (
    SELECT tablename::text t, policyname::text n, cmd::text cmd,
           (SELECT string_agg(r, ',' ORDER BY r) FROM unnest(roles::text[]) r) roles, permissive,
           regexp_replace(qual, '\s+', ' ', 'g') q, regexp_replace(with_check, '\s+', ' ', 'g') c
    FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY (c_tables))
  SELECT string_agg(coalesce(e.t, a.t) || '."' || coalesce(e.n, a.n) || '"', ', ') INTO v_bad
  FROM expected e FULL JOIN actual a ON a.t = e.t AND a.n = e.n
  WHERE e.n IS NULL OR a.n IS NULL OR a.permissive <> 'PERMISSIVE' OR a.cmd <> e.cmd OR a.roles <> e.roles
     OR a.q IS DISTINCT FROM e.q
     -- an absent WITH CHECK defaults to USING; after a rollback it is the equivalent explicit
     -- WITH CHECK (= USING), which ALTER POLICY cannot remove — accepted
     OR (a.c IS DISTINCT FROM e.c AND NOT (e.c IS NULL AND a.cmd IN ('ALL', 'UPDATE') AND a.c = e.q));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'WP1 precondition: policies differ from the 2026-11-06 schema: %', v_bad; END IF;

  -- The three tenants / messages policies this revision alters, exactly as in production
  WITH expected(t, n, cmd, roles, q, c) AS (VALUES
    ('tenants','Tenants can select their own record by email','SELECT','authenticated',
      '((email = (auth.jwt() ->> ''email''::text)) OR (user_id = auth.uid()))',NULL),
    ('tenants','Tenants can find their own record by email','UPDATE','authenticated',
      '(email = (auth.jwt() ->> ''email''::text))','(email = (auth.jwt() ->> ''email''::text))'),
    ('messages','users can insert messages','INSERT','authenticated',NULL,
      '((auth.uid() = sender_id) AND (is_landlord() OR ((agent_name IS NULL) AND (agent_photo IS NULL) AND (tenant_id IN ( SELECT tenants.id FROM tenants WHERE (tenants.user_id = auth.uid()))))))'))
  SELECT string_agg(e.t || '."' || e.n || '"', ', ') INTO v_bad
  FROM expected e LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = e.t AND p.policyname = e.n
  WHERE p.policyname IS NULL OR p.permissive <> 'PERMISSIVE' OR p.cmd <> e.cmd OR array_to_string(p.roles, ',') <> e.roles
     OR regexp_replace(p.qual, '\s+', ' ', 'g') IS DISTINCT FROM e.q
     OR regexp_replace(p.with_check, '\s+', ' ', 'g') IS DISTINCT FROM e.c;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'WP1 precondition: tenants/messages policies differ: %', v_bad; END IF;

  -- Exactly the 3 existing triggers on the 11 tables
  SELECT string_agg(c.relname || '.' || t.tgname, ', ') INTO v_bad
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal AND c.oid IN (SELECT ('public.' || x)::regclass FROM unnest(c_tables) x)
    AND (c.relname, t.tgname) NOT IN (('ai_routing_rules','trg_routing_rules_updated_at'),
                                      ('evictions','trg_evictions_updated_at'),
                                      ('inspections','set_inspections_updated_at'));
  SELECT count(*) INTO v_n FROM pg_trigger t
  WHERE NOT t.tgisinternal AND t.tgrelid IN (SELECT ('public.' || x)::regclass FROM unnest(c_tables) x);
  IF v_bad IS NOT NULL OR v_n <> 3 THEN RAISE EXCEPTION 'WP1 precondition: unexpected triggers: %', coalesce(v_bad, v_n::text); END IF;

  -- The tenants column guard this revision tightens, exactly as in production
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
                 WHERE t.tgrelid = 'public.tenants'::regclass AND t.tgname = 'tenants_protect_columns'
                   AND t.tgenabled = 'O' AND p.proname = 'protect_tenant_columns')
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.protect_tenant_columns()'::regprocedure) <> '5bd1e03bcb715ecc6850b9a5a5de9f92' THEN
    RAISE EXCEPTION 'WP1 precondition: tenants_protect_columns / protect_tenant_columns() differ from the 2026-11-06 schema';
  END IF;
  IF to_regprocedure('public.tenant_claim_email_matches(text,text)') IS NULL
     OR NOT has_function_privilege('authenticated', 'public.tenant_claim_email_matches(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'WP1 precondition: tenant_claim_email_matches(text,text) missing or not executable by authenticated';
  END IF;

  -- No column ACLs on the 11 tables
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid IN (SELECT ('public.' || x)::regclass FROM unnest(c_tables) x)
             AND a.attnum > 0 AND a.attacl IS NOT NULL) THEN
    RAISE EXCEPTION 'WP1 precondition: unexpected column ACLs';
  END IF;

  -- Original table ACLs, so the rollback restores them exactly:
  --   PUBLIC holds no entry; anon holds exactly the 8 table privileges (GRANT ALL … TO anon on PG17).
  SELECT string_agg(t, ', ') INTO v_bad FROM unnest(c_tables) t
  WHERE EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = ('public.' || t)::regclass AND a.grantee = 0)
     OR (SELECT count(DISTINCT a.privilege_type) FROM pg_class c, aclexplode(c.relacl) a
         WHERE c.oid = ('public.' || t)::regclass AND a.grantee = 'anon'::regrole
           AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')) <> 8;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'WP1 precondition: table ACLs differ (PUBLIC entry, or anon not holding exactly the 8 privileges): %', v_bad;
  END IF;

  -- Bulletin backfill inputs: every bulletin still lacking a property must resolve to exactly one
  -- property through tenant → unit → property; none may be missing its tenant.
  SELECT string_agg(b.id::text, ', ') INTO v_bad FROM bulletins b
  WHERE b.property_id IS NULL AND NOT EXISTS (
    SELECT 1 FROM tenants t JOIN units u ON u.id = t.unit_id JOIN properties p ON p.id = u.property_id WHERE t.id = b.tenant_id);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'WP1 precondition: bulletins without a property that cannot be mapped through tenant → unit → property: %', v_bad;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member = 'anon'::regrole)
     OR pg_has_role('authenticated', 'anon', 'MEMBER') OR pg_has_role('service_role', 'anon', 'MEMBER') THEN
    RAISE EXCEPTION 'WP1 precondition: unexpected role membership involving anon';
  END IF;
  IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'WP1 precondition: service_role lacks BYPASSRLS';
  END IF;

  -- is_landlord() (ENT-001) and the single-landlord rule
  IF to_regprocedure('public.is_landlord()') IS NULL
     OR NOT has_function_privilege('authenticated', 'public.is_landlord()', 'EXECUTE') THEN
    RAISE EXCEPTION 'WP1 precondition: is_landlord() missing or not executable by authenticated';
  END IF;
  SELECT count(*) INTO v_n FROM profiles WHERE role = 'landlord';
  IF v_n <> 1 THEN RAISE EXCEPTION 'WP1 precondition: expected 1 landlord profile, found %', v_n; END IF;

  -- Columns used by the new policies, triggers and Part 4 fixtures
  SELECT string_agg(x, ', ') INTO v_bad FROM unnest(ARRAY[
    'bulletins.tenant_id','bulletins.property_id','bulletins.author','bulletins.pinned','bulletins.title','bulletins.body','bulletins.category',
    'bulletin_comments.bulletin_id','bulletin_comments.tenant_id','bulletin_comments.author','bulletin_comments.body',
    'bulletin_likes.bulletin_id','bulletin_likes.tenant_id','evictions.tenant_id','evictions.unit_id','evictions.notes',
    'inspections.tenant_id','inspections.status','inspections.tenant_notes','inspections.landlord_notes',
    'maintenance_comments.request_id','maintenance_comments.author_id','maintenance_comments.author_type','maintenance_comments.author_name',
    'maintenance_comments.visible_to_tenant','maintenance_comments.body',
    'ai_routing_logs.tenant_id','ai_routing_logs.raw_message','ai_routing_logs.manager_overridden',
    'ai_routing_rules.category','ai_routing_rules.escalation_level','ai_routing_rules.is_active',
    'incident_logs.tenant_id','incident_logs.category','incident_logs.status','landlord_alerts.tenant_id','landlord_alerts.summary','landlord_alerts.is_read',
    'move_in_checklist.tenant_id','move_in_checklist.room','move_in_checklist.notes',
    'tenants.id','tenants.user_id','tenants.unit_id','tenants.name','tenants.email','tenants.invite_email','tenants.phone',
    'tenants.autopay_enabled','tenants.rent_due_day','tenants.eviction_watch','tenants.lease_end','tenants.status',
    'messages.sender_id','messages.recipient_id','messages.tenant_id','messages.body','messages.agent_name','messages.agent_photo',
    'units.id','units.property_id','units.unit_number','units.rent_amount',
    'maintenance_requests.id','maintenance_requests.tenant_id','maintenance_requests.title','maintenance_requests.status',
    'properties.name','properties.address','properties.city','properties.state','properties.zip','profiles.role']) x
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = split_part(x, '.', 1) AND column_name = split_part(x, '.', 2));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'WP1 precondition: missing columns %', v_bad; END IF;

  RAISE NOTICE 'WP1 preconditions passed.';
END $$;

-- Fingerprint of everything OUTSIDE this migration's scope (verified unchanged in Part 3):
-- every policy except those on the 11 tables, tenants, messages and storage.objects; every public
-- function except wp1_* and protect_tenant_columns; every non-internal trigger outside the 11
-- tables; every public table's RLS flag and ACL except the 11 tables. Covers A1, A2, A3.1, A3.2.
CREATE TEMP TABLE wp1_outside ON COMMIT DROP AS
SELECT 'before'::text AS stage,
  (SELECT md5(coalesce(string_agg(schemaname || '.' || tablename || '.' || policyname || '|' || cmd || '|' || permissive || '|'
             || array_to_string(roles, ',') || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), E'\n'
             ORDER BY schemaname, tablename, policyname), ''))
   FROM pg_policies
   WHERE NOT (schemaname = 'public' AND tablename IN ('bulletins','bulletin_comments','bulletin_likes','evictions','inspections',
              'maintenance_comments','ai_routing_logs','ai_routing_rules','incident_logs','landlord_alerts','move_in_checklist','tenants','messages'))
     AND NOT (schemaname = 'storage' AND tablename = 'objects')) AS policies,
  (SELECT md5(coalesce(string_agg(p.oid::regprocedure::text || '|' || md5(p.prosrc) || '|' || p.prosecdef || '|'
             || coalesce(array_to_string(p.proconfig, ','), '') || '|' || coalesce(array_to_string(p.proacl::text[], ','), ''), E'\n'
             ORDER BY p.oid::regprocedure::text), ''))
   FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname NOT LIKE 'wp1\_%' AND p.proname <> 'protect_tenant_columns') AS functions,
  (SELECT md5(coalesce(string_agg(c.relname || '.' || t.tgname || '|' || t.tgenabled::text || '|' || t.tgfoid::regproc::text, E'\n'
             ORDER BY c.relname, t.tgname), ''))
   FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
     AND c.relname NOT IN ('bulletins','bulletin_comments','bulletin_likes','evictions','inspections','maintenance_comments',
                           'ai_routing_logs','ai_routing_rules','incident_logs','landlord_alerts','move_in_checklist')) AS triggers,
  (SELECT md5(coalesce(string_agg(c.relname || '|' || c.relrowsecurity || '|' || coalesce(c.relacl::text, ''), E'\n' ORDER BY c.relname), ''))
   FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm')
     AND c.relname NOT IN ('bulletins','bulletin_comments','bulletin_likes','evictions','inspections','maintenance_comments',
                           'ai_routing_logs','ai_routing_rules','incident_logs','landlord_alerts','move_in_checklist')) AS tables;


-- ============================================================
-- PART 1: Privileges — anon and PUBLIC get nothing on these tables
-- (no unauthenticated client path uses them; vendor portal is server-side)
-- ============================================================
REVOKE ALL ON public.bulletins, public.bulletin_comments, public.bulletin_likes, public.evictions,
              public.inspections, public.maintenance_comments, public.ai_routing_logs, public.ai_routing_rules,
              public.incident_logs, public.landlord_alerts, public.move_in_checklist
  FROM anon, PUBLIC;


-- ============================================================
-- PART 2: Helpers, RLS, policies, guard triggers
-- ============================================================

-- 2.1 Helpers (SECURITY DEFINER: read tenants/units/requests/profiles without RLS recursion).
--     Text parameters so storage folder names that are not uuids simply return false.
CREATE FUNCTION public.wp1_my_tenant_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM tenants WHERE user_id = auth.uid();
$$;
CREATE FUNCTION public.wp1_my_property_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.property_id FROM tenants t JOIN units u ON u.id = t.unit_id
  WHERE t.user_id = auth.uid() AND u.property_id IS NOT NULL;
$$;
CREATE FUNCTION public.wp1_is_my_tenant_id(p text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM tenants WHERE id::text = p AND user_id = auth.uid());
$$;
CREATE FUNCTION public.wp1_tenant_owns_request(p text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM maintenance_requests r JOIN tenants t ON t.id = r.tenant_id
                 WHERE r.id::text = p AND t.user_id = auth.uid());
$$;
CREATE FUNCTION public.wp1_tenant_owns_inspection(p text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM inspections i JOIN tenants t ON t.id = i.tenant_id
                 WHERE i.id::text = p AND t.user_id = auth.uid());
$$;
CREATE FUNCTION public.wp1_bulletin_visible(p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM bulletins b
                 WHERE b.id = p AND b.property_id IN (SELECT public.wp1_my_property_ids()));
$$;
-- Staff (today: the landlord profile) — the only users a tenant may address a message to.
CREATE FUNCTION public.wp1_is_staff_user(p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = p AND role = 'landlord');
$$;

REVOKE EXECUTE ON FUNCTION public.wp1_my_tenant_ids(), public.wp1_my_property_ids(), public.wp1_is_my_tenant_id(text),
  public.wp1_tenant_owns_request(text), public.wp1_tenant_owns_inspection(text), public.wp1_bulletin_visible(uuid),
  public.wp1_is_staff_user(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wp1_my_tenant_ids(), public.wp1_my_property_ids(), public.wp1_is_my_tenant_id(text),
  public.wp1_tenant_owns_request(text), public.wp1_tenant_owns_inspection(text), public.wp1_bulletin_visible(uuid),
  public.wp1_is_staff_user(uuid)
  TO authenticated;

-- 2.2 Guard triggers (SECURITY INVOKER: current_user is the caller's API role).
--     Column guard: for tenant (non-landlord) sessions, only the columns passed as trigger
--     arguments may change; every other column (incl. future ones) is protected.
CREATE FUNCTION public.wp1_guard_tenant_columns() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user <> 'authenticated' OR is_landlord() THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - TG_ARGV) IS DISTINCT FROM (to_jsonb(OLD) - TG_ARGV) THEN
    RAISE EXCEPTION 'Tenants may not modify protected fields on %', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

--     Insert defaults: tenants cannot spoof author / property / pinned on bulletin posts.
--     property_id is derived from the posting tenant's unit.
CREATE FUNCTION public.wp1_bulletin_insert_defaults() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user <> 'authenticated' OR is_landlord() THEN
    RETURN NEW;
  END IF;
  NEW.author := coalesce((SELECT t.name FROM tenants t WHERE t.id = NEW.tenant_id AND t.user_id = auth.uid()), 'Resident');
  IF TG_TABLE_NAME = 'bulletins' THEN
    NEW.property_id := (SELECT u.property_id FROM tenants t JOIN units u ON u.id = t.unit_id
                        WHERE t.id = NEW.tenant_id AND t.user_id = auth.uid());
    NEW.pinned := false;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wp1_guard_tenant_columns(), public.wp1_bulletin_insert_defaults()
  FROM PUBLIC, anon, authenticated;

-- 2.3 bulletins / bulletin_comments / bulletin_likes
ALTER TABLE public.bulletins         ENABLE ROW LEVEL SECURITY;   -- already on (2026-11-06); idempotent
ALTER TABLE public.bulletin_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulletin_likes    ENABLE ROW LEVEL SECURITY;

-- The world-readable policy added after the WP1 inventory
DROP POLICY "Anyone can read bulletins" ON public.bulletins;

-- Backfill (RETAINED DATA CHANGE — not reverted by the rollback): posts stored with a NULL
-- property_id get their author's property so they stay visible to that property's tenants.
-- The exact rows and mapping are snapshotted first; Part 3 verifies each was set to its mapped
-- property and nothing else changed. Their ids are returned in the final result row.
CREATE TEMP TABLE wp1_bulletin_backfill ON COMMIT DROP AS
SELECT b.id AS bulletin_id, b.tenant_id, t.unit_id, u.property_id AS expected_property_id,
       to_jsonb(b) - 'property_id' AS row_before
FROM public.bulletins b
JOIN public.tenants t    ON t.id = b.tenant_id
JOIN public.units u      ON u.id = t.unit_id
JOIN public.properties p ON p.id = u.property_id
WHERE b.property_id IS NULL;
CREATE TEMP TABLE wp1_bulletin_others ON COMMIT DROP AS
SELECT to_jsonb(b) AS row_before FROM public.bulletins b WHERE b.property_id IS NOT NULL;

UPDATE public.bulletins b SET property_id = s.expected_property_id
FROM wp1_bulletin_backfill s
WHERE b.id = s.bulletin_id AND b.property_id IS NULL;

CREATE POLICY "wp1_landlord_all_bulletins" ON public.bulletins FOR ALL TO authenticated
  USING (is_landlord()) WITH CHECK (is_landlord());
CREATE POLICY "wp1_tenant_read_property_bulletins" ON public.bulletins FOR SELECT TO authenticated
  USING (property_id IN (SELECT public.wp1_my_property_ids()));
CREATE POLICY "wp1_tenant_insert_own_bulletin" ON public.bulletins FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT public.wp1_my_tenant_ids()) AND property_id IN (SELECT public.wp1_my_property_ids()));
CREATE POLICY "wp1_tenant_update_own_bulletin" ON public.bulletins FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT public.wp1_my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.wp1_my_tenant_ids()) AND property_id IN (SELECT public.wp1_my_property_ids()));

CREATE POLICY "wp1_landlord_all_bulletin_comments" ON public.bulletin_comments FOR ALL TO authenticated
  USING (is_landlord()) WITH CHECK (is_landlord());
CREATE POLICY "wp1_tenant_read_bulletin_comments" ON public.bulletin_comments FOR SELECT TO authenticated
  USING (public.wp1_bulletin_visible(bulletin_id));
CREATE POLICY "wp1_tenant_insert_bulletin_comment" ON public.bulletin_comments FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT public.wp1_my_tenant_ids()) AND public.wp1_bulletin_visible(bulletin_id));
CREATE POLICY "wp1_tenant_update_own_bulletin_comment" ON public.bulletin_comments FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT public.wp1_my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.wp1_my_tenant_ids()) AND public.wp1_bulletin_visible(bulletin_id));

CREATE POLICY "wp1_landlord_all_bulletin_likes" ON public.bulletin_likes FOR ALL TO authenticated
  USING (is_landlord()) WITH CHECK (is_landlord());
CREATE POLICY "wp1_tenant_read_bulletin_likes" ON public.bulletin_likes FOR SELECT TO authenticated
  USING (public.wp1_bulletin_visible(bulletin_id));
CREATE POLICY "wp1_tenant_insert_own_like" ON public.bulletin_likes FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT public.wp1_my_tenant_ids()) AND public.wp1_bulletin_visible(bulletin_id));
CREATE POLICY "wp1_tenant_delete_own_like" ON public.bulletin_likes FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT public.wp1_my_tenant_ids()));

CREATE TRIGGER wp1_bulletins_insert_defaults BEFORE INSERT ON public.bulletins
  FOR EACH ROW EXECUTE FUNCTION public.wp1_bulletin_insert_defaults();
CREATE TRIGGER wp1_bulletins_guard_columns BEFORE UPDATE ON public.bulletins
  FOR EACH ROW EXECUTE FUNCTION public.wp1_guard_tenant_columns('title', 'body', 'category');
CREATE TRIGGER wp1_bulletin_comments_insert_defaults BEFORE INSERT ON public.bulletin_comments
  FOR EACH ROW EXECUTE FUNCTION public.wp1_bulletin_insert_defaults();
CREATE TRIGGER wp1_bulletin_comments_guard_columns BEFORE UPDATE ON public.bulletin_comments
  FOR EACH ROW EXECUTE FUNCTION public.wp1_guard_tenant_columns('body');

-- 2.4 evictions (RLS on with no policy: landlord-only feature)
ALTER TABLE public.evictions ENABLE ROW LEVEL SECURITY;   -- already on (2026-11-06); idempotent
CREATE POLICY "wp1_landlord_all_evictions" ON public.evictions FOR ALL TO authenticated
  USING (is_landlord()) WITH CHECK (is_landlord());

-- 2.5 inspections
ALTER POLICY "Landlord full access" ON public.inspections TO authenticated
  USING (is_landlord()) WITH CHECK (is_landlord());
ALTER POLICY "Tenant read own" ON public.inspections TO authenticated
  USING (EXISTS (SELECT 1 FROM tenants t WHERE t.id = inspections.tenant_id AND t.user_id = auth.uid()));
ALTER POLICY "Tenant update own" ON public.inspections TO authenticated
  USING (EXISTS (SELECT 1 FROM tenants t WHERE t.id = inspections.tenant_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM tenants t WHERE t.id = inspections.tenant_id AND t.user_id = auth.uid())
              AND status IN ('awaiting_tenant', 'tenant_complete'));
-- Tenant may change only what MoveInInspection.jsx writes (plus the trigger-maintained updated_at)
CREATE TRIGGER wp1_inspections_guard_columns BEFORE UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.wp1_guard_tenant_columns(
    'rooms', 'tenant_notes', 'tenant_photos', 'tenant_signature', 'tenant_signed_at', 'status', 'updated_at');

-- 2.6 maintenance_comments
ALTER POLICY "landlord can read all comments" ON public.maintenance_comments TO authenticated
  USING (is_landlord());
-- Tenant: strictly tenant-visible comments on their own tickets (the author-only branch is
-- removed: a tenant's own comments are visible and on their own ticket, so they still match).
ALTER POLICY "tenant can read visible comments" ON public.maintenance_comments TO authenticated
  USING (visible_to_tenant = true AND public.wp1_tenant_owns_request(request_id::text));
-- Landlord: any comment (incl. LandlordMaintenance.jsx's comment without author_id).
-- Tenant: own ticket, as self, tenant-visible, author_type tenant.
ALTER POLICY "authenticated can insert" ON public.maintenance_comments TO authenticated
  WITH CHECK (is_landlord() OR (
    auth.uid() = author_id AND public.wp1_tenant_owns_request(request_id::text)
    AND visible_to_tenant = true AND coalesce(author_type, 'tenant') = 'tenant'));

-- 2.7 Landlord-only operational tables
ALTER POLICY "Landlord can update routing logs" ON public.ai_routing_logs TO authenticated
  USING (is_landlord()) WITH CHECK (is_landlord());
ALTER POLICY "Landlord can view routing logs" ON public.ai_routing_logs TO authenticated
  USING (is_landlord());
ALTER POLICY "Service can insert routing logs" ON public.ai_routing_logs TO authenticated
  WITH CHECK (is_landlord());
ALTER POLICY "Landlord can manage routing rules" ON public.ai_routing_rules TO authenticated
  USING (is_landlord()) WITH CHECK (is_landlord());
ALTER POLICY "Landlord can manage incident logs" ON public.incident_logs TO authenticated
  USING (is_landlord()) WITH CHECK (is_landlord());
ALTER POLICY "Landlord can manage alerts" ON public.landlord_alerts TO authenticated
  USING (is_landlord()) WITH CHECK (is_landlord());
ALTER POLICY "Landlord can view all checklists" ON public.move_in_checklist TO authenticated
  USING (is_landlord());

-- 2.8 tenants
-- Column guard: the existing protect_tenant_columns() (legacy RLS fix) is kept exactly, except
-- that autopay_enabled leaves the tenant-writable list (administrative billing flag; nothing in
-- the app writes it; autopay is not offered). Tenant sessions may change only name, phone and
-- the emergency contact, plus the one-time claim of user_id (verified-email rule unchanged).
CREATE OR REPLACE FUNCTION public.protect_tenant_columns() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  c_tenant_writable constant text[] := ARRAY[
    'name', 'phone', 'emergency_contact_name', 'emergency_contact_phone',
    'emergency_contact_relationship', 'user_id', 'updated_at'];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR is_landlord() THEN
    RETURN NEW;
  END IF;

  IF OLD.user_id IS NULL THEN
    IF NEW.user_id IS DISTINCT FROM auth.uid()
       OR NOT tenant_claim_email_matches(OLD.email, OLD.invite_email) THEN
      RAISE EXCEPTION 'Tenant record can only be claimed by the invited tenant (verified email must match)'
        USING ERRCODE = '42501';
    END IF;
  ELSIF OLD.user_id IS DISTINCT FROM auth.uid() OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Claimed tenant record cannot be reassigned, cleared, or modified by another user'
      USING ERRCODE = '42501';
  END IF;

  IF (to_jsonb(NEW) - c_tenant_writable) IS DISTINCT FROM (to_jsonb(OLD) - c_tenant_writable) THEN
    RAISE EXCEPTION 'Tenant sessions cannot modify protected tenant fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
-- Email path: only an UNCLAIMED record, and only for a signed-in user whose VERIFIED email is the
-- record's email or invite email (the rule the claim trigger already enforces). Previously any
-- session whose JWT carried that email could read the record and attempt updates, claimed or not.
ALTER POLICY "Tenants can select their own record by email" ON public.tenants TO authenticated
  USING (user_id = auth.uid() OR (user_id IS NULL AND tenant_claim_email_matches(email, invite_email)));
ALTER POLICY "Tenants can find their own record by email" ON public.tenants TO authenticated
  USING (user_id IS NULL AND tenant_claim_email_matches(email, invite_email))
  WITH CHECK (user_id = auth.uid() AND tenant_claim_email_matches(email, invite_email));

-- 2.9 messages: a tenant may address only staff, or no one (the AI reply path uses the service role).
ALTER POLICY "users can insert messages" ON public.messages TO authenticated
  WITH CHECK (auth.uid() = sender_id AND (is_landlord() OR (
    agent_name IS NULL AND agent_photo IS NULL
    AND tenant_id IN (SELECT tenants.id FROM tenants WHERE tenants.user_id = auth.uid())
    AND (recipient_id IS NULL OR public.wp1_is_staff_user(recipient_id)))));


-- ============================================================
-- PART 3: Postconditions (catalog)
-- ============================================================
DO $$
DECLARE
  c_tables constant text[] := ARRAY['bulletins','bulletin_comments','bulletin_likes','evictions','inspections',
    'maintenance_comments','ai_routing_logs','ai_routing_rules','incident_logs','landlord_alerts','move_in_checklist'];
  v_bad text;
BEGIN
  SELECT string_agg(t, ', ') INTO v_bad FROM unnest(c_tables) t
  WHERE NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass);
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'WP1 postcheck: RLS disabled on %', v_bad; END IF;

  SELECT string_agg(t, ', ') INTO v_bad FROM unnest(c_tables) t
  WHERE has_table_privilege('anon', 'public.' || t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
     OR has_any_column_privilege('anon', 'public.' || t, 'SELECT, INSERT, UPDATE, REFERENCES')
     OR EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = ('public.' || t)::regclass AND a.grantee = 0);
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'WP1 postcheck: anon/PUBLIC still has privileges on %', v_bad; END IF;

  SELECT string_agg(t, ', ') INTO v_bad FROM unnest(c_tables) t
  WHERE NOT (has_table_privilege('service_role', 'public.' || t, 'SELECT') AND has_table_privilege('service_role', 'public.' || t, 'INSERT')
         AND has_table_privilege('service_role', 'public.' || t, 'UPDATE') AND has_table_privilege('service_role', 'public.' || t, 'DELETE'));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'WP1 postcheck: service_role privileges changed on %', v_bad; END IF;

  -- No policy reachable by public/anon/authenticated is unconditional or ungated
  SELECT string_agg(tablename || '."' || policyname || '"', ', ') INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = ANY (c_tables)
    AND roles && ARRAY['public','anon','authenticated']::name[]
    AND (qual = 'true' OR with_check = 'true'
         OR NOT (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(is_landlord\(\)|auth\.uid\(\)|wp1_)');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'WP1 postcheck: ungated policies remain: %', v_bad; END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY (c_tables)
             AND roles && ARRAY['public','anon']::name[]) THEN
    RAISE EXCEPTION 'WP1 postcheck: a policy still targets public/anon';
  END IF;

  -- 30 = the 18 existing policies − "Anyone can read bulletins" (dropped) = 17 kept (13 altered,
  -- 4 unchanged) + 13 new (bulletins 4, bulletin_comments 4, bulletin_likes 4, evictions 1)
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY (c_tables)) <> 30
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY (c_tables) AND permissive <> 'PERMISSIVE')
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bulletins' AND policyname = 'Anyone can read bulletins') THEN
    RAISE EXCEPTION 'WP1 postcheck: unexpected policy set (expected 30 permissive, no "Anyone can read bulletins")';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'maintenance_comments'
             AND policyname = 'tenant can read visible comments' AND qual ~ 'author_id') THEN
    RAISE EXCEPTION 'WP1 postcheck: tenant comment visibility still includes an author_id branch';
  END IF;

  IF (SELECT count(*) FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgenabled = 'O'
      AND t.tgrelid IN (SELECT ('public.' || x)::regclass FROM unnest(c_tables) x)) <> 8 THEN
    RAISE EXCEPTION 'WP1 postcheck: expected 8 enabled triggers on the 11 tables (3 existing + 5 WP1)';
  END IF;

  -- tenants: guard tightened (no autopay_enabled), still attached; email policies verified-email + unclaimed
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.protect_tenant_columns()'::regprocedure) ~ 'autopay_enabled'
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.tenants'::regclass AND tgname = 'tenants_protect_columns' AND tgenabled = 'O')
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenants'
         AND policyname IN ('Tenants can select their own record by email', 'Tenants can find their own record by email')
         AND qual ~ 'tenant_claim_email_matches' AND qual ~ 'user_id IS NULL' AND qual !~ 'auth\.jwt') <> 2
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenants') <> 5 THEN
    RAISE EXCEPTION 'WP1 postcheck: tenants guard or email policies not as intended';
  END IF;

  -- messages: tenant recipient restricted to staff; policy count unchanged
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'messages'
                 AND policyname = 'users can insert messages' AND with_check ~ 'wp1_is_staff_user\(recipient_id\)')
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'messages') <> 5 THEN
    RAISE EXCEPTION 'WP1 postcheck: messages insert policy not as intended';
  END IF;

  -- Bulletin backfill: exactly the snapshotted rows set to their mapped property, every other
  -- column unchanged, every other bulletin untouched, none left NULL.
  IF EXISTS (SELECT 1 FROM bulletins WHERE property_id IS NULL)
     OR EXISTS (SELECT 1 FROM wp1_bulletin_backfill s LEFT JOIN bulletins b ON b.id = s.bulletin_id
                WHERE b.id IS NULL OR b.property_id IS DISTINCT FROM s.expected_property_id
                   OR (to_jsonb(b) - 'property_id') IS DISTINCT FROM s.row_before)
     OR (SELECT count(*) FROM bulletins) <> (SELECT count(*) FROM wp1_bulletin_backfill) + (SELECT count(*) FROM wp1_bulletin_others)
     OR EXISTS (SELECT row_before FROM wp1_bulletin_others EXCEPT SELECT to_jsonb(b) FROM bulletins b) THEN
    RAISE EXCEPTION 'WP1 postcheck: bulletin backfill did not change exactly the expected rows';
  END IF;

  RAISE NOTICE 'WP1 catalog postchecks passed.';
END $$;

-- Outside-scope fingerprint: identical before and after (A1–A3.2 and everything else untouched)
INSERT INTO wp1_outside
SELECT 'after',
  (SELECT md5(coalesce(string_agg(schemaname || '.' || tablename || '.' || policyname || '|' || cmd || '|' || permissive || '|'
             || array_to_string(roles, ',') || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), E'\n'
             ORDER BY schemaname, tablename, policyname), ''))
   FROM pg_policies
   WHERE NOT (schemaname = 'public' AND tablename IN ('bulletins','bulletin_comments','bulletin_likes','evictions','inspections',
              'maintenance_comments','ai_routing_logs','ai_routing_rules','incident_logs','landlord_alerts','move_in_checklist','tenants','messages'))
     AND NOT (schemaname = 'storage' AND tablename = 'objects')),
  (SELECT md5(coalesce(string_agg(p.oid::regprocedure::text || '|' || md5(p.prosrc) || '|' || p.prosecdef || '|'
             || coalesce(array_to_string(p.proconfig, ','), '') || '|' || coalesce(array_to_string(p.proacl::text[], ','), ''), E'\n'
             ORDER BY p.oid::regprocedure::text), ''))
   FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname NOT LIKE 'wp1\_%' AND p.proname <> 'protect_tenant_columns'),
  (SELECT md5(coalesce(string_agg(c.relname || '.' || t.tgname || '|' || t.tgenabled::text || '|' || t.tgfoid::regproc::text, E'\n'
             ORDER BY c.relname, t.tgname), ''))
   FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
     AND c.relname NOT IN ('bulletins','bulletin_comments','bulletin_likes','evictions','inspections','maintenance_comments',
                           'ai_routing_logs','ai_routing_rules','incident_logs','landlord_alerts','move_in_checklist')),
  (SELECT md5(coalesce(string_agg(c.relname || '|' || c.relrowsecurity || '|' || coalesce(c.relacl::text, ''), E'\n' ORDER BY c.relname), ''))
   FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm')
     AND c.relname NOT IN ('bulletins','bulletin_comments','bulletin_likes','evictions','inspections','maintenance_comments',
                           'ai_routing_logs','ai_routing_rules','incident_logs','landlord_alerts','move_in_checklist'));
DO $$
BEGIN
  IF (SELECT count(DISTINCT (policies, functions, triggers, tables)) FROM wp1_outside) <> 1 THEN
    RAISE EXCEPTION 'WP1 postcheck: something outside WP1''s scope changed (policies/functions/triggers/RLS/ACLs fingerprint differs)';
  END IF;
  RAISE NOTICE 'WP1 outside-scope fingerprint unchanged (A1–A3.2 accounting and all other objects untouched).';
END $$;


-- ============================================================
-- PART 4: Behaviour (synthetic fixtures; everything rolled back to the savepoint)
-- ============================================================
SAVEPOINT wp1_verify;

-- Fixtures (as the migration owner). Two tenants in two different test properties, plus one
-- unclaimed tenant record. Id scheme f1000000-0000-4000-8000-000000000XYZ.
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('f1000000-0000-4000-8000-000000000301', 'wp1-a@test.invalid', now()),
  ('f1000000-0000-4000-8000-000000000302', 'wp1-b@test.invalid', now()),
  ('f1000000-0000-4000-8000-000000000303', 'wp1-c@test.invalid', NULL);   -- signed up, email NOT verified
INSERT INTO properties (id, name, address, city, state, zip) VALUES
  ('f1000000-0000-4000-8000-000000000101', 'WP1 Test A', '1 Test St', 'Testville', 'OH', '00000'),
  ('f1000000-0000-4000-8000-000000000102', 'WP1 Test B', '2 Test St', 'Testville', 'OH', '00000');
INSERT INTO units (id, property_id, unit_number, rent_amount) VALUES
  ('f1000000-0000-4000-8000-000000000201', 'f1000000-0000-4000-8000-000000000101', 'WA', 1000),
  ('f1000000-0000-4000-8000-000000000202', 'f1000000-0000-4000-8000-000000000102', 'WB', 1000);
INSERT INTO tenants (id, name, email, unit_id, user_id) VALUES
  ('f1000000-0000-4000-8000-000000000401', 'WP1 Tenant A', 'wp1-a@test.invalid', 'f1000000-0000-4000-8000-000000000201', 'f1000000-0000-4000-8000-000000000301'),
  ('f1000000-0000-4000-8000-000000000402', 'WP1 Tenant B', 'wp1-b@test.invalid', 'f1000000-0000-4000-8000-000000000202', 'f1000000-0000-4000-8000-000000000302'),
  ('f1000000-0000-4000-8000-000000000403', 'WP1 Tenant C', 'wp1-c@test.invalid', 'f1000000-0000-4000-8000-000000000202', NULL);
INSERT INTO bulletins (id, title, body, tenant_id, property_id, author) VALUES
  ('f1000000-0000-4000-8000-000000000501', 'A post', 'x', 'f1000000-0000-4000-8000-000000000401', 'f1000000-0000-4000-8000-000000000101', 'WP1 Tenant A'),
  ('f1000000-0000-4000-8000-000000000502', 'B post', 'x', 'f1000000-0000-4000-8000-000000000402', 'f1000000-0000-4000-8000-000000000102', 'WP1 Tenant B');
INSERT INTO bulletin_comments (id, bulletin_id, tenant_id, author, body) VALUES
  ('f1000000-0000-4000-8000-000000000601', 'f1000000-0000-4000-8000-000000000501', 'f1000000-0000-4000-8000-000000000401', 'WP1 Tenant A', 'x'),
  ('f1000000-0000-4000-8000-000000000602', 'f1000000-0000-4000-8000-000000000502', 'f1000000-0000-4000-8000-000000000402', 'WP1 Tenant B', 'x');
INSERT INTO bulletin_likes (id, bulletin_id, tenant_id) VALUES
  ('f1000000-0000-4000-8000-000000000701', 'f1000000-0000-4000-8000-000000000501', 'f1000000-0000-4000-8000-000000000401'),
  ('f1000000-0000-4000-8000-000000000702', 'f1000000-0000-4000-8000-000000000502', 'f1000000-0000-4000-8000-000000000402');
INSERT INTO inspections (id, tenant_id, status) VALUES
  ('f1000000-0000-4000-8000-000000000801', 'f1000000-0000-4000-8000-000000000401', 'awaiting_tenant'),
  ('f1000000-0000-4000-8000-000000000802', 'f1000000-0000-4000-8000-000000000402', 'awaiting_tenant');
INSERT INTO maintenance_requests (id, tenant_id, unit_id, title) VALUES
  ('f1000000-0000-4000-8000-000000000901', 'f1000000-0000-4000-8000-000000000401', 'f1000000-0000-4000-8000-000000000201', 'WP1 A'),
  ('f1000000-0000-4000-8000-000000000902', 'f1000000-0000-4000-8000-000000000402', 'f1000000-0000-4000-8000-000000000202', 'WP1 B');
INSERT INTO maintenance_comments (id, request_id, body, author_name, visible_to_tenant, author_type) VALUES
  ('f1000000-0000-4000-8000-000000000a01', 'f1000000-0000-4000-8000-000000000901', 'visible A', 'PM', true,  'landlord'),
  ('f1000000-0000-4000-8000-000000000a02', 'f1000000-0000-4000-8000-000000000901', 'internal A', 'PM', false, 'landlord'),
  ('f1000000-0000-4000-8000-000000000a03', 'f1000000-0000-4000-8000-000000000902', 'visible B', 'PM', true,  'landlord');
INSERT INTO move_in_checklist (id, tenant_id, room) VALUES
  ('f1000000-0000-4000-8000-000000000b01', 'f1000000-0000-4000-8000-000000000401', 'Kitchen'),
  ('f1000000-0000-4000-8000-000000000b02', 'f1000000-0000-4000-8000-000000000402', 'Kitchen');
INSERT INTO evictions (id, tenant_id, unit_id) VALUES
  ('f1000000-0000-4000-8000-000000000c01', 'f1000000-0000-4000-8000-000000000402', 'f1000000-0000-4000-8000-000000000202');
INSERT INTO ai_routing_logs (id, tenant_id, raw_message) VALUES ('f1000000-0000-4000-8000-000000000d01', 'f1000000-0000-4000-8000-000000000402', 'x');
INSERT INTO ai_routing_rules (id, category, escalation_level) VALUES ('f1000000-0000-4000-8000-000000000d02', 'WP1', 'AUTO_REPLY');
INSERT INTO incident_logs (id, tenant_id, category) VALUES ('f1000000-0000-4000-8000-000000000d03', 'f1000000-0000-4000-8000-000000000402', 'OTHER');
INSERT INTO landlord_alerts (id, tenant_id, summary) VALUES ('f1000000-0000-4000-8000-000000000d04', 'f1000000-0000-4000-8000-000000000402', 'x');
INSERT INTO messages (id, sender_id, recipient_id, tenant_id, body) VALUES
  ('f1000000-0000-4000-8000-000000000e01', 'f1000000-0000-4000-8000-000000000302', NULL, 'f1000000-0000-4000-8000-000000000402', 'B to PM');

-- ── 4a. Tenant A ────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000301","role":"authenticated","email":"wp1-a@test.invalid"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n int; v_prop uuid; v_author text; v_pinned boolean;
BEGIN
  -- bulletins
  IF (SELECT count(*) FROM bulletins WHERE id::text LIKE 'f1000000-%') <> 1
     OR NOT EXISTS (SELECT 1 FROM bulletins WHERE id = 'f1000000-0000-4000-8000-000000000501') THEN
    RAISE EXCEPTION 'WP1 verify A1: tenant sees other properties'' bulletins';
  END IF;
  INSERT INTO bulletins (title, body, tenant_id, property_id, author, pinned)
  VALUES ('spoof', 'x', 'f1000000-0000-4000-8000-000000000401', 'f1000000-0000-4000-8000-000000000102', 'Landlord', true)
  RETURNING property_id, author, pinned INTO v_prop, v_author, v_pinned;
  IF v_prop <> 'f1000000-0000-4000-8000-000000000101' OR v_author <> 'WP1 Tenant A' OR v_pinned THEN
    RAISE EXCEPTION 'WP1 verify A2: bulletin property/author/pinned spoof not neutralised';
  END IF;
  BEGIN
    INSERT INTO bulletins (title, body, tenant_id) VALUES ('x', 'x', 'f1000000-0000-4000-8000-000000000402');
    RAISE EXCEPTION 'WP1 verify A3: tenant posted as another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE bulletins SET title = 'A edited' WHERE id = 'f1000000-0000-4000-8000-000000000501';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'WP1 verify A4: tenant cannot edit own bulletin'; END IF;
  BEGIN
    UPDATE bulletins SET pinned = true WHERE id = 'f1000000-0000-4000-8000-000000000501';
    RAISE EXCEPTION 'WP1 verify A5: tenant pinned a bulletin';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE bulletins SET title = 'hijack' WHERE id = 'f1000000-0000-4000-8000-000000000502';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'WP1 verify A6: tenant edited another tenant''s bulletin'; END IF;
  DELETE FROM bulletins WHERE id = 'f1000000-0000-4000-8000-000000000502';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'WP1 verify A6b: tenant deleted another tenant''s bulletin'; END IF;

  -- bulletin comments
  IF (SELECT count(*) FROM bulletin_comments WHERE id::text LIKE 'f1000000-%') <> 1 THEN
    RAISE EXCEPTION 'WP1 verify A7: tenant sees comments on other properties'' bulletins';
  END IF;
  BEGIN
    INSERT INTO bulletin_comments (bulletin_id, tenant_id, body)
    VALUES ('f1000000-0000-4000-8000-000000000502', 'f1000000-0000-4000-8000-000000000401', 'x');
    RAISE EXCEPTION 'WP1 verify A8: tenant commented on another property''s bulletin';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO bulletin_comments (bulletin_id, tenant_id, author, body)
  VALUES ('f1000000-0000-4000-8000-000000000501', 'f1000000-0000-4000-8000-000000000401', 'Landlord', 'x')
  RETURNING author INTO v_author;
  IF v_author <> 'WP1 Tenant A' THEN RAISE EXCEPTION 'WP1 verify A9: comment author spoof not neutralised'; END IF;
  UPDATE bulletin_comments SET body = 'edited' WHERE id = 'f1000000-0000-4000-8000-000000000601';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'WP1 verify A10: tenant cannot edit own comment'; END IF;
  BEGIN
    UPDATE bulletin_comments SET author = 'x' WHERE id = 'f1000000-0000-4000-8000-000000000601';
    RAISE EXCEPTION 'WP1 verify A11: tenant changed protected comment field';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- likes
  IF (SELECT count(*) FROM bulletin_likes WHERE id::text LIKE 'f1000000-%') <> 1 THEN
    RAISE EXCEPTION 'WP1 verify A12: tenant sees likes on other properties'' bulletins';
  END IF;
  BEGIN
    INSERT INTO bulletin_likes (bulletin_id, tenant_id) VALUES ('f1000000-0000-4000-8000-000000000502', 'f1000000-0000-4000-8000-000000000401');
    RAISE EXCEPTION 'WP1 verify A13: tenant liked another property''s bulletin';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  DELETE FROM bulletin_likes WHERE id = 'f1000000-0000-4000-8000-000000000702';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'WP1 verify A14: tenant deleted another tenant''s like'; END IF;
  DELETE FROM bulletin_likes WHERE id = 'f1000000-0000-4000-8000-000000000701';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'WP1 verify A15: tenant cannot unlike'; END IF;

  -- evictions
  IF EXISTS (SELECT 1 FROM evictions) THEN RAISE EXCEPTION 'WP1 verify A16: tenant sees evictions'; END IF;
  BEGIN
    INSERT INTO evictions (tenant_id) VALUES ('f1000000-0000-4000-8000-000000000402');
    RAISE EXCEPTION 'WP1 verify A17: tenant inserted an eviction';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- inspections
  IF (SELECT count(*) FROM inspections WHERE id::text LIKE 'f1000000-%') <> 1 THEN
    RAISE EXCEPTION 'WP1 verify A18: tenant sees other tenants'' inspections';
  END IF;
  UPDATE inspections SET tenant_notes = 'ok', status = 'tenant_complete' WHERE id = 'f1000000-0000-4000-8000-000000000801';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'WP1 verify A19: tenant cannot complete own inspection'; END IF;
  BEGIN
    UPDATE inspections SET landlord_notes = 'x' WHERE id = 'f1000000-0000-4000-8000-000000000801';
    RAISE EXCEPTION 'WP1 verify A20: tenant changed landlord inspection fields';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE inspections SET status = 'closed' WHERE id = 'f1000000-0000-4000-8000-000000000801';
    RAISE EXCEPTION 'WP1 verify A21: tenant closed an inspection';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE inspections SET tenant_notes = 'x' WHERE id = 'f1000000-0000-4000-8000-000000000802';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'WP1 verify A22: tenant updated another tenant''s inspection'; END IF;
  DELETE FROM inspections WHERE id = 'f1000000-0000-4000-8000-000000000802';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'WP1 verify A22b: tenant deleted another tenant''s inspection'; END IF;
  BEGIN
    INSERT INTO inspections (tenant_id) VALUES ('f1000000-0000-4000-8000-000000000401');
    RAISE EXCEPTION 'WP1 verify A23: tenant created an inspection';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- maintenance comments
  IF (SELECT count(*) FROM maintenance_comments WHERE id::text LIKE 'f1000000-%') <> 1
     OR NOT EXISTS (SELECT 1 FROM maintenance_comments WHERE id = 'f1000000-0000-4000-8000-000000000a01') THEN
    RAISE EXCEPTION 'WP1 verify A24: tenant sees internal or other tenants'' ticket comments';
  END IF;
  INSERT INTO maintenance_comments (request_id, author_id, author_name, body, visible_to_tenant)
  VALUES ('f1000000-0000-4000-8000-000000000901', auth.uid(), 'WP1 Tenant A', 'x', true);
  BEGIN
    INSERT INTO maintenance_comments (request_id, author_id, body, visible_to_tenant)
    VALUES ('f1000000-0000-4000-8000-000000000902', auth.uid(), 'x', true);
    RAISE EXCEPTION 'WP1 verify A25: tenant commented on another tenant''s ticket';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO maintenance_comments (request_id, author_id, body, visible_to_tenant)
    VALUES ('f1000000-0000-4000-8000-000000000901', auth.uid(), 'x', false);
    RAISE EXCEPTION 'WP1 verify A26: tenant posted an internal comment';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO maintenance_comments (request_id, author_id, body, visible_to_tenant, author_type)
    VALUES ('f1000000-0000-4000-8000-000000000901', auth.uid(), 'x', true, 'landlord');
    RAISE EXCEPTION 'WP1 verify A27: tenant posted as landlord';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- landlord-only tables
  IF EXISTS (SELECT 1 FROM ai_routing_logs) OR EXISTS (SELECT 1 FROM ai_routing_rules)
     OR EXISTS (SELECT 1 FROM incident_logs) OR EXISTS (SELECT 1 FROM landlord_alerts) THEN
    RAISE EXCEPTION 'WP1 verify A28: tenant sees AI logs, rules, incidents or alerts';
  END IF;
  BEGIN
    INSERT INTO ai_routing_rules (category, escalation_level) VALUES ('x', 'AUTO_REPLY');
    RAISE EXCEPTION 'WP1 verify A29: tenant created a routing rule';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE ai_routing_rules SET is_active = false;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'WP1 verify A30: tenant changed routing rules'; END IF;
  UPDATE incident_logs SET status = 'resolved';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'WP1 verify A31: tenant changed incident logs'; END IF;
  DELETE FROM landlord_alerts;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'WP1 verify A31b: tenant deleted landlord alerts'; END IF;

  -- move-in checklist
  IF (SELECT count(*) FROM move_in_checklist WHERE id::text LIKE 'f1000000-%') <> 1 THEN
    RAISE EXCEPTION 'WP1 verify A32: tenant sees other tenants'' checklists';
  END IF;
  INSERT INTO move_in_checklist (tenant_id, room) VALUES ('f1000000-0000-4000-8000-000000000401', 'Bath');
  UPDATE move_in_checklist SET notes = 'x' WHERE id = 'f1000000-0000-4000-8000-000000000b02';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'WP1 verify A33: tenant updated another tenant''s checklist'; END IF;

  -- tenants: own row only; contact fields writable; unit, rent terms, admin flags protected
  IF (SELECT count(*) FROM tenants WHERE id::text LIKE 'f1000000-%') <> 1 THEN
    RAISE EXCEPTION 'WP1 verify A34: tenant sees other tenant records';
  END IF;
  UPDATE tenants SET name = 'WP1 Tenant A', phone = '555-0100', emergency_contact_name = 'Kin'
  WHERE id = 'f1000000-0000-4000-8000-000000000401';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'WP1 verify A35: tenant cannot update own contact fields'; END IF;
  BEGIN
    UPDATE tenants SET unit_id = 'f1000000-0000-4000-8000-000000000202' WHERE id = 'f1000000-0000-4000-8000-000000000401';
    RAISE EXCEPTION 'WP1 verify A36: tenant moved to another unit';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE tenants SET rent_due_day = 28 WHERE id = 'f1000000-0000-4000-8000-000000000401';
    RAISE EXCEPTION 'WP1 verify A37: tenant changed rent terms';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE tenants SET autopay_enabled = true WHERE id = 'f1000000-0000-4000-8000-000000000401';
    RAISE EXCEPTION 'WP1 verify A38: tenant changed autopay_enabled';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE tenants SET eviction_watch = true, status = 'past' WHERE id = 'f1000000-0000-4000-8000-000000000401';   -- both differ from the fixture's defaults
    RAISE EXCEPTION 'WP1 verify A39: tenant changed administrative flags';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE tenants SET name = 'hijack' WHERE id = 'f1000000-0000-4000-8000-000000000402';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'WP1 verify A40: tenant updated another tenant''s record'; END IF;

  -- messages: own thread only; may address staff or no one, never another tenant
  IF EXISTS (SELECT 1 FROM messages WHERE id = 'f1000000-0000-4000-8000-000000000e01') THEN
    RAISE EXCEPTION 'WP1 verify A41: tenant reads another tenant''s messages';
  END IF;
  INSERT INTO messages (sender_id, recipient_id, tenant_id, body)
  VALUES (auth.uid(), (SELECT id FROM profiles WHERE role = 'landlord' LIMIT 1), 'f1000000-0000-4000-8000-000000000401', 'to PM');
  INSERT INTO messages (sender_id, recipient_id, tenant_id, body)
  VALUES (auth.uid(), NULL, 'f1000000-0000-4000-8000-000000000401', 'to nobody');
  BEGIN
    INSERT INTO messages (sender_id, recipient_id, tenant_id, body)
    VALUES (auth.uid(), 'f1000000-0000-4000-8000-000000000302', 'f1000000-0000-4000-8000-000000000401', 'to tenant B');
    RAISE EXCEPTION 'WP1 verify A42: tenant addressed a message to another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- maintenance requests (existing guard, regression): own only; only photos changeable
  IF (SELECT count(*) FROM maintenance_requests WHERE id::text LIKE 'f1000000-%') <> 1 THEN
    RAISE EXCEPTION 'WP1 verify A43: tenant sees other tenants'' maintenance requests';
  END IF;
  UPDATE maintenance_requests SET title = 'hijack' WHERE id = 'f1000000-0000-4000-8000-000000000902';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'WP1 verify A44: tenant updated another tenant''s request'; END IF;
END $$;
RESET ROLE;

-- ── 4a'. Unverified user whose JWT carries an unclaimed record's email ──────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000303","role":"authenticated","email":"wp1-c@test.invalid"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
  IF EXISTS (SELECT 1 FROM tenants WHERE id = 'f1000000-0000-4000-8000-000000000403') THEN
    RAISE EXCEPTION 'WP1 verify C1: unverified email can read an unclaimed tenant record';
  END IF;
  UPDATE tenants SET user_id = auth.uid() WHERE id = 'f1000000-0000-4000-8000-000000000403';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'WP1 verify C2: unverified email claimed a tenant record'; END IF;
END $$;
RESET ROLE;
-- …and once the email is verified, the invite claim works (AuthCallback.jsx / TenantOnboarding.jsx path)
UPDATE auth.users SET email_confirmed_at = now() WHERE id = 'f1000000-0000-4000-8000-000000000303';
SET LOCAL ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = 'f1000000-0000-4000-8000-000000000403') THEN
    RAISE EXCEPTION 'WP1 verify C3: verified invitee cannot see the unclaimed record';
  END IF;
  UPDATE tenants SET user_id = auth.uid() WHERE id = 'f1000000-0000-4000-8000-000000000403' AND user_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'WP1 verify C4: verified invitee cannot claim the record'; END IF;
END $$;
RESET ROLE;

-- ── 4b. Landlord ────────────────────────────────────────────
SELECT set_config('request.jwt.claims', json_build_object('sub',
  (SELECT id::text FROM profiles WHERE role = 'landlord'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
  IF NOT is_landlord() THEN RAISE EXCEPTION 'WP1 verify L1: landlord session not recognised'; END IF;
  IF (SELECT count(*) FROM bulletins WHERE id::text LIKE 'f1000000-%') < 2
     OR (SELECT count(*) FROM bulletin_comments WHERE id::text LIKE 'f1000000-%') < 2
     OR (SELECT count(*) FROM bulletin_likes WHERE id::text LIKE 'f1000000-%') < 1
     OR (SELECT count(*) FROM inspections WHERE id::text LIKE 'f1000000-%') <> 2
     OR (SELECT count(*) FROM maintenance_comments WHERE id::text LIKE 'f1000000-%') < 3
     OR (SELECT count(*) FROM move_in_checklist WHERE id::text LIKE 'f1000000-%') < 2
     OR (SELECT count(*) FROM tenants WHERE id::text LIKE 'f1000000-%') <> 3
     OR (SELECT count(*) FROM maintenance_requests WHERE id::text LIKE 'f1000000-%') <> 2
     OR NOT EXISTS (SELECT 1 FROM messages WHERE id = 'f1000000-0000-4000-8000-000000000e01')
     OR NOT EXISTS (SELECT 1 FROM evictions WHERE id = 'f1000000-0000-4000-8000-000000000c01')
     OR NOT EXISTS (SELECT 1 FROM ai_routing_logs WHERE id = 'f1000000-0000-4000-8000-000000000d01')
     OR NOT EXISTS (SELECT 1 FROM ai_routing_rules WHERE id = 'f1000000-0000-4000-8000-000000000d02')
     OR NOT EXISTS (SELECT 1 FROM incident_logs WHERE id = 'f1000000-0000-4000-8000-000000000d03')
     OR NOT EXISTS (SELECT 1 FROM landlord_alerts WHERE id = 'f1000000-0000-4000-8000-000000000d04') THEN
    RAISE EXCEPTION 'WP1 verify L2: landlord does not see all rows';
  END IF;
  -- LandlordMaintenance.jsx reject-quote comment shape (no author_id)
  INSERT INTO maintenance_comments (request_id, body, author_name, visible_to_tenant)
  VALUES ('f1000000-0000-4000-8000-000000000901', 'PM requested more work: x', 'Property Manager', false);
  INSERT INTO evictions (tenant_id, unit_id) VALUES ('f1000000-0000-4000-8000-000000000401', 'f1000000-0000-4000-8000-000000000201');
  UPDATE evictions SET notes = 'x' WHERE id = 'f1000000-0000-4000-8000-000000000c01';
  UPDATE inspections SET landlord_notes = 'x', status = 'closed' WHERE id = 'f1000000-0000-4000-8000-000000000802';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'WP1 verify L3: landlord cannot update inspections'; END IF;
  INSERT INTO inspections (tenant_id) VALUES ('f1000000-0000-4000-8000-000000000401');
  UPDATE bulletins SET pinned = true WHERE id = 'f1000000-0000-4000-8000-000000000502';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'WP1 verify L4: landlord cannot pin bulletins'; END IF;
  UPDATE ai_routing_rules SET is_active = false WHERE id = 'f1000000-0000-4000-8000-000000000d02';
  UPDATE ai_routing_logs SET manager_overridden = true WHERE id = 'f1000000-0000-4000-8000-000000000d01';
  UPDATE landlord_alerts SET is_read = true WHERE id = 'f1000000-0000-4000-8000-000000000d04';
  UPDATE incident_logs SET status = 'resolved' WHERE id = 'f1000000-0000-4000-8000-000000000d03';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'WP1 verify L5: landlord cannot manage incidents'; END IF;
  -- tenants: landlord keeps full control of unit, rent terms and flags
  UPDATE tenants SET unit_id = 'f1000000-0000-4000-8000-000000000201', rent_due_day = 5, autopay_enabled = true, eviction_watch = true
  WHERE id = 'f1000000-0000-4000-8000-000000000402';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'WP1 verify L6: landlord cannot manage tenant records'; END IF;
  -- messages: landlord may write to any tenant
  INSERT INTO messages (sender_id, recipient_id, tenant_id, body)
  VALUES (auth.uid(), 'f1000000-0000-4000-8000-000000000302', 'f1000000-0000-4000-8000-000000000402', 'PM to B');
END $$;
RESET ROLE;

-- ── 4c. anon ────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $$
DECLARE v_t text; n int;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['bulletins','bulletin_comments','bulletin_likes','evictions','inspections','maintenance_comments',
                             'ai_routing_logs','ai_routing_rules','incident_logs','landlord_alerts','move_in_checklist'] LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', v_t);
      RAISE EXCEPTION 'WP1 verify N1: anon can read %', v_t;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      EXECUTE format('DELETE FROM public.%I WHERE false', v_t);
      RAISE EXCEPTION 'WP1 verify N2: anon can delete from %', v_t;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  -- tables anon still holds grants on (RLS denies every row)
  SELECT count(*) INTO n FROM tenants WHERE id::text LIKE 'f1000000-%';
  IF n <> 0 THEN RAISE EXCEPTION 'WP1 verify N3: anon reads tenant records'; END IF;
END $$;
RESET ROLE;

-- ── 4d. service_role (classify-and-route, vendor-ticket, dispatchVendor, daily-recap) ──
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM evictions WHERE id = 'f1000000-0000-4000-8000-000000000c01')
     OR (SELECT count(*) FROM maintenance_comments WHERE id::text LIKE 'f1000000-%') < 3 THEN
    RAISE EXCEPTION 'WP1 verify S1: service_role does not see all rows';
  END IF;
  INSERT INTO incident_logs (tenant_id, category) VALUES ('f1000000-0000-4000-8000-000000000401', 'OTHER');
  INSERT INTO landlord_alerts (tenant_id, summary) VALUES ('f1000000-0000-4000-8000-000000000401', 'x');
  INSERT INTO ai_routing_logs (tenant_id, raw_message) VALUES ('f1000000-0000-4000-8000-000000000401', 'x');
  INSERT INTO maintenance_comments (request_id, body, author_name, author_type, visible_to_tenant)
  VALUES ('f1000000-0000-4000-8000-000000000902', 'dispatch log', 'System', 'system', false);
  -- AI reply path (sender NULL, recipient = tenant user) is unaffected
  INSERT INTO messages (sender_id, recipient_id, tenant_id, body)
  VALUES (NULL, 'f1000000-0000-4000-8000-000000000301', 'f1000000-0000-4000-8000-000000000401', 'AI reply');
END $$;
RESET ROLE;

-- Discard all fixtures and verification writes; keep Parts 1–3.
ROLLBACK TO SAVEPOINT wp1_verify;
RELEASE SAVEPOINT wp1_verify;

SELECT 'WP1 tables applied and verified' AS result,
       (SELECT count(*) FROM wp1_bulletin_backfill) AS backfilled_bulletin_count,
       (SELECT string_agg(bulletin_id::text || ' -> ' || expected_property_id::text, ', ' ORDER BY bulletin_id)
        FROM wp1_bulletin_backfill) AS backfilled_bulletins;   -- ids only; rollback reference

COMMIT;


-- ============================================================
-- ROLLBACK (one transaction; only if WP1 part 1 must be reverted; RE-OPENS THE EXPOSURE)
-- Roll back part 2 (storage) FIRST if it was applied: it uses wp1_tenant_owns_request,
-- wp1_tenant_owns_inspection and wp1_is_my_tenant_id.
--
-- Restores exactly: original policy roles and expressions (ALTER POLICY cannot remove a
-- WITH CHECK, so policies that had none get WITH CHECK = USING — semantically identical; Part 0
-- accepts that form on re-apply); "Anyone can read bulletins"; RLS flags (bulletins and evictions
-- stay ON, as in production on 2026-11-06); triggers; protect_tenant_columns() byte-for-byte;
-- the tenants and messages policies; table ACLs (Part 0 asserted no PUBLIC entry and anon holding
-- exactly the 8 privileges, so GRANT ALL … TO anon restores them exactly).
-- RETAINED DATA CHANGE (deliberately not reverted): bulletins backfilled with their author's
-- property keep it (ids in the migration's result row).
-- ============================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS wp1_bulletins_insert_defaults ON public.bulletins;
-- DROP TRIGGER IF EXISTS wp1_bulletins_guard_columns ON public.bulletins;
-- DROP TRIGGER IF EXISTS wp1_bulletin_comments_insert_defaults ON public.bulletin_comments;
-- DROP TRIGGER IF EXISTS wp1_bulletin_comments_guard_columns ON public.bulletin_comments;
-- DROP TRIGGER IF EXISTS wp1_inspections_guard_columns ON public.inspections;
-- DROP POLICY IF EXISTS "wp1_landlord_all_bulletins" ON public.bulletins;
-- DROP POLICY IF EXISTS "wp1_tenant_read_property_bulletins" ON public.bulletins;
-- DROP POLICY IF EXISTS "wp1_tenant_insert_own_bulletin" ON public.bulletins;
-- DROP POLICY IF EXISTS "wp1_tenant_update_own_bulletin" ON public.bulletins;
-- DROP POLICY IF EXISTS "wp1_landlord_all_bulletin_comments" ON public.bulletin_comments;
-- DROP POLICY IF EXISTS "wp1_tenant_read_bulletin_comments" ON public.bulletin_comments;
-- DROP POLICY IF EXISTS "wp1_tenant_insert_bulletin_comment" ON public.bulletin_comments;
-- DROP POLICY IF EXISTS "wp1_tenant_update_own_bulletin_comment" ON public.bulletin_comments;
-- DROP POLICY IF EXISTS "wp1_landlord_all_bulletin_likes" ON public.bulletin_likes;
-- DROP POLICY IF EXISTS "wp1_tenant_read_bulletin_likes" ON public.bulletin_likes;
-- DROP POLICY IF EXISTS "wp1_tenant_insert_own_like" ON public.bulletin_likes;
-- DROP POLICY IF EXISTS "wp1_tenant_delete_own_like" ON public.bulletin_likes;
-- DROP POLICY IF EXISTS "wp1_landlord_all_evictions" ON public.evictions;
-- CREATE POLICY "Anyone can read bulletins" ON public.bulletins FOR SELECT TO authenticated, anon USING (true);
-- ALTER TABLE public.bulletin_comments DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.bulletin_likes DISABLE ROW LEVEL SECURITY;
-- ALTER POLICY "Landlord full access" ON public.inspections TO public
--   USING ((auth.role() = 'authenticated'::text) AND (EXISTS (SELECT 1 FROM tenants t WHERE t.id = inspections.tenant_id))) WITH CHECK (true);
-- ALTER POLICY "Tenant read own" ON public.inspections TO public
--   USING (EXISTS (SELECT 1 FROM tenants t WHERE t.id = inspections.tenant_id AND t.user_id = auth.uid()));
-- ALTER POLICY "Tenant update own" ON public.inspections TO public
--   USING (EXISTS (SELECT 1 FROM tenants t WHERE t.id = inspections.tenant_id AND t.user_id = auth.uid()))
--   WITH CHECK (EXISTS (SELECT 1 FROM tenants t WHERE t.id = inspections.tenant_id AND t.user_id = auth.uid()));
-- ALTER POLICY "landlord can read all comments" ON public.maintenance_comments TO public USING (true);
-- ALTER POLICY "tenant can read visible comments" ON public.maintenance_comments TO public
--   USING ((visible_to_tenant = true) OR (auth.uid() = author_id));
-- ALTER POLICY "authenticated can insert" ON public.maintenance_comments TO public WITH CHECK (auth.uid() = author_id);
-- ALTER POLICY "Landlord can update routing logs" ON public.ai_routing_logs TO authenticated USING (true) WITH CHECK (true);
-- ALTER POLICY "Landlord can view routing logs" ON public.ai_routing_logs TO authenticated USING (true);
-- ALTER POLICY "Service can insert routing logs" ON public.ai_routing_logs TO authenticated WITH CHECK (true);
-- ALTER POLICY "Landlord can manage routing rules" ON public.ai_routing_rules TO authenticated USING (true) WITH CHECK (true);
-- ALTER POLICY "Landlord can manage incident logs" ON public.incident_logs TO authenticated USING (true) WITH CHECK (true);
-- ALTER POLICY "Landlord can manage alerts" ON public.landlord_alerts TO authenticated USING (true) WITH CHECK (true);
-- ALTER POLICY "Landlord can view all checklists" ON public.move_in_checklist TO authenticated USING (true);
-- ALTER POLICY "Tenants can select their own record by email" ON public.tenants TO authenticated
--   USING ((email = (auth.jwt() ->> 'email'::text)) OR (user_id = auth.uid()));
-- ALTER POLICY "Tenants can find their own record by email" ON public.tenants TO authenticated
--   USING (email = (auth.jwt() ->> 'email'::text)) WITH CHECK (email = (auth.jwt() ->> 'email'::text));
-- ALTER POLICY "users can insert messages" ON public.messages TO authenticated
--   WITH CHECK ((auth.uid() = sender_id) AND (is_landlord() OR ((agent_name IS NULL) AND (agent_photo IS NULL) AND (tenant_id IN ( SELECT tenants.id FROM tenants WHERE (tenants.user_id = auth.uid()))))));
-- CREATE OR REPLACE FUNCTION public.protect_tenant_columns() RETURNS trigger
--     LANGUAGE plpgsql
--     SET search_path TO 'public'
--     AS $fn$
-- DECLARE
--   c_tenant_writable constant text[] := ARRAY[
--     'name', 'phone', 'emergency_contact_name', 'emergency_contact_phone',
--     'emergency_contact_relationship', 'autopay_enabled', 'user_id', 'updated_at'];
-- BEGIN
--   IF current_user NOT IN ('authenticated', 'anon') OR is_landlord() THEN
--     RETURN NEW;
--   END IF;
--
--   IF OLD.user_id IS NULL THEN
--     IF NEW.user_id IS DISTINCT FROM auth.uid()
--        OR NOT tenant_claim_email_matches(OLD.email, OLD.invite_email) THEN
--       RAISE EXCEPTION 'Tenant record can only be claimed by the invited tenant (verified email must match)'
--         USING ERRCODE = '42501';
--     END IF;
--   ELSIF OLD.user_id IS DISTINCT FROM auth.uid() OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
--     RAISE EXCEPTION 'Claimed tenant record cannot be reassigned, cleared, or modified by another user'
--       USING ERRCODE = '42501';
--   END IF;
--
--   IF (to_jsonb(NEW) - c_tenant_writable) IS DISTINCT FROM (to_jsonb(OLD) - c_tenant_writable) THEN
--     RAISE EXCEPTION 'Tenant sessions cannot modify protected tenant fields'
--       USING ERRCODE = '42501';
--   END IF;
--
--   RETURN NEW;
-- END;
-- $fn$;
-- DROP FUNCTION IF EXISTS public.wp1_guard_tenant_columns();
-- DROP FUNCTION IF EXISTS public.wp1_bulletin_insert_defaults();
-- DROP FUNCTION IF EXISTS public.wp1_bulletin_visible(uuid);
-- DROP FUNCTION IF EXISTS public.wp1_my_tenant_ids();
-- DROP FUNCTION IF EXISTS public.wp1_my_property_ids();
-- DROP FUNCTION IF EXISTS public.wp1_is_my_tenant_id(text);
-- DROP FUNCTION IF EXISTS public.wp1_tenant_owns_request(text);
-- DROP FUNCTION IF EXISTS public.wp1_tenant_owns_inspection(text);
-- DROP FUNCTION IF EXISTS public.wp1_is_staff_user(uuid);
-- GRANT ALL ON public.bulletins, public.bulletin_comments, public.bulletin_likes, public.evictions,
--   public.inspections, public.maintenance_comments, public.ai_routing_logs, public.ai_routing_rules,
--   public.incident_logs, public.landlord_alerts, public.move_in_checklist TO anon;
-- COMMIT;
