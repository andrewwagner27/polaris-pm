-- ============================================================
-- MODUS — WP1 (part 2 of 2), revision 4: storage object policies
-- NOT APPLIED. Do not run via `supabase db push`. Run with the release package's apply script
-- (C:\Modus-backups\release\wp1-release\), only after owner approval, and only AFTER part 1
-- (20261108120000_wp1_tenant_isolation_tables.sql), whose helpers it uses.
--
-- Revision 4: re-inventoried against the production schema of 2026-11-06 (structure-only dump).
-- The 12 storage.objects policies are unchanged since revision 3, so the policy design and the
-- Part 0 expectations are unchanged; only references were updated.
--
-- Exposure closed (2026-11-06 policies):
--   * "Public can view lease docs" (TO public): ANYONE, signed out included, can read every lease.
--   * "allow authenticated uploads 1syswaj_0" (SELECT, any signed-in user): every tenant can read
--     every object in every bucket (leases, insurance, screening reports, photos).
--   * "Public read" / "Public read inspection-photos": anyone can read inspection photos.
--   * insurance-docs / inspection-photos SELECT and DELETE policies scoped only by bucket.
--   * "allow authenticated uploads 1syswaj_1" / bucket-only INSERT policies: any signed-in user
--     can upload anywhere, including into another tenant's folder.
-- Replaced by 8 path-checked policies:
--   landlord: all objects in the five buckets (is_landlord())
--   tenant:   own folders only — read + upload; never update / delete / overwrite
--   anon:     nothing
--   vendors:  unchanged (api/vendor-ticket.js uses the service role)
--
-- OWNERSHIP NOTE: storage.objects is owned by supabase_storage_admin and the postgres role is not
-- a member (inventory 2026-11-02). If DROP/CREATE POLICY is refused ("must be owner of table
-- objects"), the transaction aborts with nothing applied — use the Dashboard procedure in the
-- release README instead.
---- ONE TRANSACTION: Part 0 preconditions · Part 1 policies · Part 2 postconditions ·
-- Part 3 read-only session checks (inside a savepoint) · COMMIT.
-- ============================================================

BEGIN;

-- ============================================================
-- PART 0: Preconditions
-- ============================================================
DO $$
DECLARE v_bad text; v_n int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
             AND policyname = 'wp1_landlord_all_objects') THEN
    RAISE EXCEPTION 'WP1 storage precondition: already applied — nothing to do';
  END IF;

  -- Part 1 applied (helpers exist and are executable by authenticated only)
  SELECT string_agg(f, ', ') INTO v_bad FROM unnest(ARRAY[
    'public.is_landlord()', 'public.wp1_tenant_owns_request(text)', 'public.wp1_tenant_owns_inspection(text)',
    'public.wp1_is_my_tenant_id(text)']) f
  WHERE to_regprocedure(f) IS NULL OR NOT has_function_privilege('authenticated', f, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'WP1 storage precondition: part 1 not applied (missing/unexecutable: %)', v_bad;
  END IF;

  -- Exactly the five private buckets
  WITH expected(id) AS (VALUES ('inspection-photos'), ('insurance-docs'), ('lease-documents'),
                               ('maintenance-photos'), ('screening-reports'))
  SELECT string_agg(coalesce(e.id, b.id), ', ') INTO v_bad
  FROM expected e FULL JOIN storage.buckets b ON b.id = e.id
  WHERE e.id IS NULL OR b.id IS NULL OR b.public;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'WP1 storage precondition: buckets differ or are public: %', v_bad; END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass) THEN
    RAISE EXCEPTION 'WP1 storage precondition: RLS disabled on storage.objects';
  END IF;

  -- Exactly the 12 inventoried policies
  WITH expected(n, cmd, roles, q, c) AS (VALUES
    ('Authenticated can upload lease docs','INSERT','authenticated',NULL,'(bucket_id = ''lease-documents''::text)'),
    ('Authenticated delete','DELETE','authenticated','(bucket_id = ''inspection-photos''::text)',NULL),
    ('Authenticated upload','INSERT','authenticated',NULL,'(bucket_id = ''inspection-photos''::text)'),
    ('Authenticated upload to inspection-photos','INSERT','public',NULL,
      '((bucket_id = ''inspection-photos''::text) AND (auth.role() = ''authenticated''::text))'),
    ('Landlord can view all insurance docs','SELECT','authenticated','(bucket_id = ''insurance-docs''::text)',NULL),
    ('Public can view lease docs','SELECT','public','(bucket_id = ''lease-documents''::text)',NULL),
    ('Public read','SELECT','public','(bucket_id = ''inspection-photos''::text)',NULL),
    ('Public read inspection-photos','SELECT','public','(bucket_id = ''inspection-photos''::text)',NULL),
    ('Tenants can upload insurance docs','INSERT','authenticated',NULL,'(bucket_id = ''insurance-docs''::text)'),
    ('Tenants can view their own insurance docs','SELECT','authenticated','(bucket_id = ''insurance-docs''::text)',NULL),
    ('allow authenticated uploads 1syswaj_0','SELECT','public','(auth.role() = ''authenticated''::text)',NULL),
    ('allow authenticated uploads 1syswaj_1','INSERT','public',NULL,'(auth.role() = ''authenticated''::text)')),
  actual AS (
    SELECT policyname::text n, cmd::text cmd, array_to_string(roles, ',') roles, permissive,
           regexp_replace(qual, '\s+', ' ', 'g') q, regexp_replace(with_check, '\s+', ' ', 'g') c
    FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects')
  SELECT string_agg('"' || coalesce(e.n, a.n) || '"', ', ') INTO v_bad
  FROM expected e FULL JOIN actual a ON a.n = e.n
  WHERE e.n IS NULL OR a.n IS NULL OR a.permissive <> 'PERMISSIVE' OR a.cmd <> e.cmd OR a.roles <> e.roles
     OR a.q IS DISTINCT FROM e.q OR a.c IS DISTINCT FROM e.c;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'WP1 storage precondition: storage policies differ from the inventory: %', v_bad; END IF;

  -- Landlord identity for the Part 3 landlord session: exactly one landlord profile
  -- (the landlord policy is global is_landlord(); ENT-002 rule)
  SELECT count(*) INTO v_n FROM profiles WHERE role = 'landlord';
  IF v_n <> 1 THEN RAISE EXCEPTION 'WP1 storage precondition: expected exactly 1 landlord profile, found %', v_n; END IF;

  -- The documented fixture for Part 3: at least one claimed, non-landlord tenant
  SELECT count(*) INTO v_n FROM tenants WHERE user_id IS NOT NULL
    AND user_id NOT IN (SELECT id FROM profiles WHERE role = 'landlord');
  IF v_n = 0 THEN RAISE EXCEPTION 'WP1 storage precondition: no claimed tenant for the session checks'; END IF;

  RAISE NOTICE 'WP1 storage preconditions passed.';
END $$;


-- ============================================================
-- PART 1: Replace the object policies
-- Path conventions (verified against the code):
--   maintenance-photos  <request_id>/<file>                  MaintenanceRequestForm.jsx:125; vendor uploads via service role
--   inspection-photos   <inspection_id>/<file>               LandlordInspection.jsx:312 (landlord)
--                       inspections/<inspection_id>/<file>   MoveInInspection.jsx:111   (tenant)
--   lease-documents     <tenant_id>/lease-<ts>.pdf           LandlordTenantDetail.jsx:458 (landlord upload, upsert)
--   screening-reports   <application_id>/<file>              LandlordApplications.jsx:160 (landlord only)
--   insurance-docs      <tenant_id>/<file>                   no upload path in current code; tenant folder convention
-- Existing objects (49, all orphaned from deleted test records, 2026-05-31..06-12)
-- become landlord-only (re-count at apply time: Part 3 compares the landlord's view with the total).
-- ============================================================
DROP POLICY "Authenticated can upload lease docs"        ON storage.objects;
DROP POLICY "Authenticated delete"                       ON storage.objects;
DROP POLICY "Authenticated upload"                       ON storage.objects;
DROP POLICY "Authenticated upload to inspection-photos"  ON storage.objects;
DROP POLICY "Landlord can view all insurance docs"       ON storage.objects;
DROP POLICY "Public can view lease docs"                 ON storage.objects;
DROP POLICY "Public read"                                ON storage.objects;
DROP POLICY "Public read inspection-photos"              ON storage.objects;
DROP POLICY "Tenants can upload insurance docs"          ON storage.objects;
DROP POLICY "Tenants can view their own insurance docs"  ON storage.objects;
DROP POLICY "allow authenticated uploads 1syswaj_0"      ON storage.objects;
DROP POLICY "allow authenticated uploads 1syswaj_1"      ON storage.objects;

-- Landlord: everything in the five buckets (read, upload, upsert/overwrite, delete)
CREATE POLICY "wp1_landlord_all_objects" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id IN ('maintenance-photos','inspection-photos','lease-documents','screening-reports','insurance-docs')
         AND public.is_landlord())
  WITH CHECK (bucket_id IN ('maintenance-photos','inspection-photos','lease-documents','screening-reports','insurance-docs')
              AND public.is_landlord());

-- Tenant: maintenance photos of own tickets (read + upload)
CREATE POLICY "wp1_tenant_read_maintenance_photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'maintenance-photos' AND public.wp1_tenant_owns_request((storage.foldername(name))[1]));
CREATE POLICY "wp1_tenant_upload_maintenance_photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'maintenance-photos' AND public.wp1_tenant_owns_request((storage.foldername(name))[1]));

-- Tenant: inspection photos of own inspection (read both path forms; upload tenant form)
CREATE POLICY "wp1_tenant_read_inspection_photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'inspection-photos' AND (
           public.wp1_tenant_owns_inspection((storage.foldername(name))[1])
           OR ((storage.foldername(name))[1] = 'inspections'
               AND public.wp1_tenant_owns_inspection((storage.foldername(name))[2]))));
CREATE POLICY "wp1_tenant_upload_inspection_photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inspection-photos' AND (storage.foldername(name))[1] = 'inspections'
              AND public.wp1_tenant_owns_inspection((storage.foldername(name))[2]));

-- Tenant: own lease documents (read only; HomeDashboard.jsx signs them)
CREATE POLICY "wp1_tenant_read_lease_documents" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lease-documents' AND public.wp1_is_my_tenant_id((storage.foldername(name))[1]));

-- Tenant: own insurance documents (read + upload)
CREATE POLICY "wp1_tenant_read_insurance_docs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'insurance-docs' AND public.wp1_is_my_tenant_id((storage.foldername(name))[1]));
CREATE POLICY "wp1_tenant_upload_insurance_docs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'insurance-docs' AND public.wp1_is_my_tenant_id((storage.foldername(name))[1]));

-- screening-reports: landlord only (no tenant policy)


-- ============================================================
-- PART 2: Postconditions (catalog)
-- ============================================================
DO $$
DECLARE v_bad text;
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects') <> 8 THEN
    RAISE EXCEPTION 'WP1 storage postcheck: expected exactly 8 storage.objects policies';
  END IF;

  SELECT string_agg(policyname, ', ') INTO v_bad FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND (roles && ARRAY['public','anon']::name[] OR permissive <> 'PERMISSIVE'
         OR NOT (coalesce(qual, '') || coalesce(with_check, '')) ~ 'bucket_id'
         OR qual = 'true' OR with_check = 'true');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'WP1 storage postcheck: unscoped or anon policies: %', v_bad; END IF;

  -- Only the landlord policy may UPDATE or DELETE (no tenant overwrite / delete)
  SELECT string_agg(policyname, ', ') INTO v_bad FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd IN ('UPDATE', 'DELETE', 'ALL')
    AND NOT (coalesce(qual, '') ~ 'is_landlord\(\)' AND coalesce(with_check, 'is_landlord()') ~ 'is_landlord\(\)');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'WP1 storage postcheck: non-landlord UPDATE/DELETE policy: %', v_bad; END IF;

  IF EXISTS (SELECT 1 FROM storage.buckets WHERE public) THEN
    RAISE EXCEPTION 'WP1 storage postcheck: a bucket is public';
  END IF;

  RAISE NOTICE 'WP1 storage catalog postchecks passed.';
END $$;


-- ============================================================
-- PART 3: Read-only session checks (SELECT counts only, inside a savepoint)
--
-- SCOPE OF THESE CHECKS: they evaluate the new RLS policies through SQL as the anon, tenant
-- and landlord roles. They are ISOLATION checks (nothing beyond what a session may see is
-- visible). They do NOT prove authorized tenant file access: all 49 existing objects are
-- orphaned (2026-11-02 inventory), so a real tenant owns 0 of them and the tenant check
-- compares 0 with 0. They also do not exercise the Supabase Storage API (upload, upsert,
-- delete, signed URLs). Authorized access and API behaviour are covered by the REQUIRED
-- post-migration Storage API smoke tests in the release README (Storage API smoke tests).
-- ============================================================
SAVEPOINT wp1_storage_verify;

SELECT set_config('wp1s.total', (SELECT count(*)::text FROM storage.objects
  WHERE bucket_id IN ('maintenance-photos','inspection-photos','lease-documents','screening-reports','insurance-docs')), true);
SELECT set_config('wp1s.tenant_uid', (SELECT user_id::text FROM tenants WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM profiles WHERE role = 'landlord') ORDER BY user_id LIMIT 1), true);
SELECT set_config('wp1s.tenant_own', (SELECT count(*)::text FROM storage.objects o
  WHERE (o.bucket_id = 'maintenance-photos' AND EXISTS (SELECT 1 FROM maintenance_requests r JOIN tenants t ON t.id = r.tenant_id
           WHERE r.id::text = split_part(o.name, '/', 1) AND t.user_id::text = current_setting('wp1s.tenant_uid')))
     OR (o.bucket_id = 'inspection-photos' AND EXISTS (SELECT 1 FROM inspections i JOIN tenants t ON t.id = i.tenant_id
           WHERE t.user_id::text = current_setting('wp1s.tenant_uid')
             AND (i.id::text = split_part(o.name, '/', 1)
                  OR (split_part(o.name, '/', 1) = 'inspections' AND i.id::text = split_part(o.name, '/', 2)))))
     OR (o.bucket_id IN ('lease-documents','insurance-docs') AND EXISTS (SELECT 1 FROM tenants t
           WHERE t.id::text = split_part(o.name, '/', 1) AND t.user_id::text = current_setting('wp1s.tenant_uid')))), true);

-- anon
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF (SELECT count(*) FROM storage.objects) <> 0 THEN
    RAISE EXCEPTION 'WP1 storage verify N1: anon can see % objects', (SELECT count(*) FROM storage.objects);
  END IF;
END $$;
RESET ROLE;

-- tenant (real claimed tenant; id not output) — ISOLATION check only:
-- the tenant must see no object outside their own folders. With today's data their own-folder
-- count is 0, so this shows that none of the 49 existing (orphaned) objects leak to a tenant;
-- it is not evidence that the tenant can read their own files (see §6a smoke tests).
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('wp1s.tenant_uid'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF public.is_landlord() THEN RAISE EXCEPTION 'WP1 storage verify T0: tenant recognised as landlord'; END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'screening-reports') THEN
    RAISE EXCEPTION 'WP1 storage verify T1: tenant sees screening reports';
  END IF;
  -- equality: catches leakage (sees more) and, if the tenant owns any object, denial (sees fewer)
  IF (SELECT count(*) FROM storage.objects) <> current_setting('wp1s.tenant_own')::int THEN
    RAISE EXCEPTION 'WP1 storage verify T2 (isolation): tenant sees % objects, owns %',
      (SELECT count(*) FROM storage.objects), current_setting('wp1s.tenant_own');
  END IF;
  IF current_setting('wp1s.tenant_own')::int = 0 THEN
    RAISE NOTICE 'WP1 storage verify T2: tenant owns 0 existing objects — isolation confirmed; authorized own-folder access NOT exercised here (required §6a smoke tests).';
  END IF;
END $$;
RESET ROLE;

-- landlord (the single landlord profile asserted in Part 0)
SELECT set_config('request.jwt.claims', json_build_object('sub',
  (SELECT id::text FROM profiles WHERE role = 'landlord'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT public.is_landlord() THEN
    RAISE EXCEPTION 'WP1 storage verify L0: landlord session is not recognised by public.is_landlord()';
  END IF;
  -- every existing object in the five buckets (49 at inventory) is visible to the landlord
  IF (SELECT count(*) FROM storage.objects) <> current_setting('wp1s.total')::int THEN
    RAISE EXCEPTION 'WP1 storage verify L1: landlord sees % of % objects',
      (SELECT count(*) FROM storage.objects), current_setting('wp1s.total');
  END IF;
END $$;
RESET ROLE;

ROLLBACK TO SAVEPOINT wp1_storage_verify;
RELEASE SAVEPOINT wp1_storage_verify;

SELECT 'WP1 storage policies applied and verified' AS result;

COMMIT;


-- ============================================================
-- ROLLBACK (one transaction; restores the 12 original policies — re-opens exposure)
-- ============================================================
-- BEGIN;
-- DROP POLICY IF EXISTS "wp1_landlord_all_objects" ON storage.objects;
-- DROP POLICY IF EXISTS "wp1_tenant_read_maintenance_photos" ON storage.objects;
-- DROP POLICY IF EXISTS "wp1_tenant_upload_maintenance_photos" ON storage.objects;
-- DROP POLICY IF EXISTS "wp1_tenant_read_inspection_photos" ON storage.objects;
-- DROP POLICY IF EXISTS "wp1_tenant_upload_inspection_photos" ON storage.objects;
-- DROP POLICY IF EXISTS "wp1_tenant_read_lease_documents" ON storage.objects;
-- DROP POLICY IF EXISTS "wp1_tenant_read_insurance_docs" ON storage.objects;
-- DROP POLICY IF EXISTS "wp1_tenant_upload_insurance_docs" ON storage.objects;
-- CREATE POLICY "Authenticated can upload lease docs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'lease-documents');
-- CREATE POLICY "Authenticated delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'inspection-photos');
-- CREATE POLICY "Authenticated upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'inspection-photos');
-- CREATE POLICY "Authenticated upload to inspection-photos" ON storage.objects FOR INSERT TO public
--   WITH CHECK (bucket_id = 'inspection-photos' AND auth.role() = 'authenticated');
-- CREATE POLICY "Landlord can view all insurance docs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'insurance-docs');
-- CREATE POLICY "Public can view lease docs" ON storage.objects FOR SELECT TO public USING (bucket_id = 'lease-documents');
-- CREATE POLICY "Public read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'inspection-photos');
-- CREATE POLICY "Public read inspection-photos" ON storage.objects FOR SELECT TO public USING (bucket_id = 'inspection-photos');
-- CREATE POLICY "Tenants can upload insurance docs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'insurance-docs');
-- CREATE POLICY "Tenants can view their own insurance docs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'insurance-docs');
-- CREATE POLICY "allow authenticated uploads 1syswaj_0" ON storage.objects FOR SELECT TO public USING (auth.role() = 'authenticated');
-- CREATE POLICY "allow authenticated uploads 1syswaj_1" ON storage.objects FOR INSERT TO public WITH CHECK (auth.role() = 'authenticated');
-- COMMIT;
