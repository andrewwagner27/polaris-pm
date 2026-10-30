-- ============================================================================
-- MODUS — SEC-002: Remove anonymous access to vendor-portal data
-- File:     docs/migrations/sec002_vendor_anon_lockdown.sql
-- Revision: 4 (2026-10-30) — MAINTAIN (PG17) added to every anon/role privilege check
--           (0.5, A.1b, A.4, PART S); A.4 also asserts no anon ACL entry of any type
--           remains; PG17+ asserted in A.1. 0.5 fingerprint query left unchanged so it
--           stays comparable with already-saved PART 0 output.
--           Rev 3: exact storage-policy expression check, STOP on
--           unexpected anon members (S10), before/after privilege comparison for
--           other roles (S11), complete Part S status, S6 enforced as documented.
--           Rev 2: effective-privilege checks, STOP conditions, self-verifying
--           idempotent parts, exact rollback.
-- Status:   PREPARED — NOT EXECUTED. Requires owner review before running.
--
-- This file lives OUTSIDE tenant-portal/supabase/migrations/ on purpose, so that
-- `supabase db push` / `supabase migration up` can never apply it.
--
-- ─── HOW TO RUN ─────────────────────────────────────────────────────────────
--   Run ONE PART AT A TIME in the Supabase SQL Editor (role `postgres`). Never paste
--   the whole file. Save the output of every read-only part.
--
--     PART 0  Pre-flight (read-only)       → save ALL output; evaluate STOP list
--     PART 0R Rollback generator (read-only) → save output VERBATIM; required for rollback
--     PART A  Tables (one transaction, self-verifying)
--     PART B  Storage policy (one transaction, self-verifying)
--     PART C  Bucket private (one transaction, self-verifying) — REQUIRED for full
--             photo privacy, gated on SEC-001 verification
--     PART S  Status / diagnosis (read-only) — run after every part, and any time
--             the state is uncertain
--     PART R  Rollback (only if necessary — restores the original exposure)
--
--   Parts A, B and C are each a single transaction that asserts its own
--   preconditions and postconditions. If any assertion fails, the transaction
--   raises "SEC002 STOP …" and NOTHING in that part is applied. Each part is safe to
--   re-run: completed steps are detected and skipped, and a pre-existing policy with
--   an unexpected definition is a STOP, never silently replaced.
--   Parts A and B create session-local TEMP tables (sec002_priv_before,
--   sec002_expr_ref) used only for in-transaction verification; they are dropped
--   before COMMIT and are never visible to other sessions.
--
-- ─── WHAT THIS MIGRATION GUARANTEES (if Parts A and B commit) ───────────────
--   G1  Role `anon` has NO effective privilege of any kind on
--       public.maintenance_requests or public.maintenance_comments — table-level or
--       column-level, direct, via PUBLIC, or via role membership. Verified with
--       has_table_privilege() / has_any_column_privilege() inside the transaction.
--   G2  A RESTRICTIVE deny-all policy for `anon` exists on both tables (backstop if a
--       privilege is ever re-granted, effective only while RLS is enabled).
--   G3  A RESTRICTIVE policy denies `anon` every RLS-governed operation on
--       storage.objects rows in bucket 'maintenance-photos'. Its stored USING and WITH
--       CHECK expressions are verified to be EXACTLY the intended expression (compared
--       with a reference derived on the same server), so an altered expression such as
--       "(bucket_id <> 'maintenance-photos' OR true)" is a STOP, never accepted.
--   G4  No existing policy and no RLS setting is changed (no statement targets them;
--       verify with the PART 0 vs PART S fingerprints). The effective privileges of
--       authenticated, service_role and every role inheriting from anon are asserted
--       unchanged inside Part A (S11).
--   G5  With PART C: the bucket is private, so /object/public/... URLs stop serving.
--
-- ─── WHAT IT DOES NOT GUARANTEE ─────────────────────────────────────────────
--   N1  Authenticated isolation. Whether one tenant can read another tenant's
--       tickets depends on the existing `authenticated` policies, which this
--       migration neither inspects for correctness nor changes.
--   N2  Public-URL reads of the bucket until PART C runs (RLS does not govern them).
--   N3  Indirect access paths not detectable by catalog queries — e.g. SECURITY
--       DEFINER functions using dynamic SQL, or triggers on other anon-writable
--       tables that write these tables. PART 0.7 detects the common cases only.
--   N4  Anything about other tables, other buckets, or the vendor PIN brute-force
--       limit (application layer).
--   N5  Exposure that already happened: assume existing vendor tokens/PINs are
--       compromised and rotate them after this migration (outside this file).
--
-- ─── STOP CONDITIONS (any one → do not run Part A/B; escalate for review) ───
--   S1  RLS is DISABLED on maintenance_requests or maintenance_comments (0.1).
--       The restrictive policy gives no protection then, and authenticated tenant
--       isolation cannot be assumed. Requires a separate review of landlord/tenant
--       policies. Do NOT enable RLS as part of this change. (Asserted by Part A.)
--   S2  `authenticated` or `service_role` is a member of `anon` (0.4). Restrictive
--       TO anon policies would then also apply to them. (Asserted by Part A and B.)
--   S3  PUBLIC holds any privilege on either table, table- or column-level (0.2/0.3).
--       Revoking from PUBLIC affects every role and is out of scope. (Asserted.)
--   S4  `anon` would retain an effective privilege after the revoke — e.g. inherited
--       from another role (0.4/0.5) or granted by a grantor other than the executing
--       role (0.2 `grantor`). (Asserted after the revoke; Part A rolls back.)
--   S5  A view without security_invoker, or a SECURITY DEFINER function, that anon can
--       use and that reads/writes these tables (0.7). (Asserted; conservative — a text
--       match may produce false positives, which still require review.)
--   S6  Any policy named sec002_* exists that is not one of the three this file
--       creates (public.maintenance_requests / public.maintenance_comments /
--       storage.objects, with the exact names below), OR one of those three exists with
--       a definition that is not exactly this file's (0.9). Asserted in Parts A and B
--       for ALL sec002_* policies in every schema; reported by PART S.
--   S7  RLS is disabled on storage.objects (0.1). (Asserted by Part B.)
--   S8  A table, storage.objects or its bucket_id column does not exist. (Asserted.)
--   S9  PART 0R output was not saved. (Procedural — cannot be asserted.)
--   S10 A role other than the expected Supabase login role `authenticator` is a member
--       of anon (directly or indirectly) and is neither superuser nor BYPASSRLS (0.4b).
--       TO anon restrictive policies could restrict it. No role membership is changed by
--       this migration. Allowlist = ARRAY['authenticator'] in Parts A and B; extending it
--       is a reviewed change. (Asserted by Parts A and B.)
--   S11 The revoke changed the effective privileges (table- or column-level) of
--       authenticated, service_role, or any role that inherits anon's privileges.
--       (Asserted by Part A via a before/after comparison; Part A rolls back.)
--
-- ─── PRECONDITIONS (all required) ───────────────────────────────────────────
--   P1  Production Vercel deployment includes api/vendor-ticket.js,
--       api/vendor-verify-pin.js (session-issuing) and the API-only
--       src/VendorAccess.jsx / src/VendorTicket.jsx.
--   P2  VENDOR_SESSION_SECRET is set in Vercel and the vendor workflow passed
--       docs/vendor-security-remediation.md §7 steps 1–16 on the new API.
--   P3  PART 0 and PART 0R run; outputs saved; no STOP condition present.
--   P4  For PART C additionally: SEC-001 signed-URL frontend is in production and
--       landlord/tenant viewing of maintenance photos and invoices is verified.
-- ============================================================================


-- ============================================================================
-- PART 0 — PRE-FLIGHT (read-only). Save ALL output.
-- ============================================================================

-- 0.1  Existence, owner and RLS state (S1, S7, S8)
SELECT n.nspname AS schema, c.relname AS table_name,
       pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE (n.nspname = 'public'  AND c.relname IN ('maintenance_requests', 'maintenance_comments'))
   OR (n.nspname = 'storage' AND c.relname = 'objects')
ORDER BY 1, 2;
-- Expect 3 rows; rls_enabled = true on all three. Otherwise → S1 / S7 / S8.

-- 0.2  Table-level ACL — authoritative (pg_class.relacl), including PUBLIC and grantor (S3, S4)
SELECT c.relname AS table_name,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
       pg_get_userbyid(a.grantor) AS grantor,
       a.privilege_type, a.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) a
WHERE n.nspname = 'public' AND c.relname IN ('maintenance_requests', 'maintenance_comments')
ORDER BY 1, 2, 4;
-- S3 if any row has grantee = 'PUBLIC'.
-- Note every `grantor` for grantee = 'anon': a REVOKE only removes grants made by the
-- executing role (or, for the owner, grants made as owner). Grants by another grantor
-- survive and Part A will STOP (S4). Remedy then needs a separate decision
-- (e.g. REVOKE … GRANTED BY <grantor>, run by a role entitled to do so).

-- 0.3  Column-level ACL (pg_attribute.attacl) (S3, S4)
SELECT c.relname AS table_name, att.attname AS column_name,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
       pg_get_userbyid(a.grantor) AS grantor,
       a.privilege_type, a.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute att ON att.attrelid = c.oid AND att.attnum > 0 AND NOT att.attisdropped
CROSS JOIN LATERAL aclexplode(att.attacl) a
WHERE n.nspname = 'public' AND c.relname IN ('maintenance_requests', 'maintenance_comments')
ORDER BY 1, 2, 3, 5;
-- Usually empty. S3 if any grantee = 'PUBLIC'.

-- 0.4  Role memberships involving anon (S2, S4, S10, S11)
--   a) Roles that anon is a member of (anon inherits their privileges if it has INHERIT)
SELECT pg_get_userbyid(m.roleid) AS anon_is_member_of,
       (SELECT rolinherit FROM pg_roles WHERE rolname = 'anon') AS anon_inherits
FROM pg_auth_members m
WHERE m.member = 'anon'::regrole
ORDER BY 1;
-- Normally empty. If not, anon may inherit privileges; Part A asserts anon's effective
-- privileges are all false after the revoke and STOPs otherwise (S4).

--   b) Every role that is a member of anon, directly or indirectly, classified exactly as
--      Parts A and B enforce it. Superusers appear here because PostgreSQL treats them as
--      members of every role.
SELECT r.rolname AS member_of_anon,
       pg_has_role(r.oid, 'anon'::regrole, 'USAGE') AS inherits_anon_privileges,
       r.rolsuper, r.rolbypassrls,
       CASE
         WHEN r.rolname IN ('authenticated', 'service_role') THEN 'STOP S2'
         WHEN r.rolname = 'authenticator'                    THEN 'expected (Supabase API login role; SET ROLEs to anon)'
         WHEN r.rolsuper                                     THEN 'ok: superuser (not subject to RLS)'
         WHEN r.rolbypassrls                                 THEN 'ok: BYPASSRLS (not subject to RLS)'
         ELSE 'STOP S10: unexpected member without BYPASSRLS'
       END AS classification
FROM pg_roles r
WHERE r.rolname <> 'anon' AND pg_has_role(r.oid, 'anon'::regrole, 'MEMBER')
ORDER BY 5, 1;
-- Any 'STOP' row → do not run Part A/B (both also assert this). The allowlist is exactly
-- ARRAY['authenticator'] in Parts A and B; adding a role to it is a reviewed change that
-- must state why that role is unaffected by TO anon restrictive policies.
-- Rows with inherits_anon_privileges = true (e.g. an admin role) are also included in
-- Part A's before/after privilege comparison (S11), so a privilege they lose by the
-- revoke aborts Part A.

-- 0.5  EFFECTIVE privileges (direct + PUBLIC + membership) for anon and authenticated
SELECT t AS table_name, r AS role, p AS privilege,
       has_table_privilege(r, 'public.' || t, p) AS table_level
FROM unnest(ARRAY['maintenance_requests', 'maintenance_comments']) t,
     unnest(ARRAY['anon', 'authenticated']) r,
     unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
ORDER BY 1, 2, 3;

SELECT t AS table_name, r AS role, p AS privilege,
       has_any_column_privilege(r, 'public.' || t, p) AS any_column
FROM unnest(ARRAY['maintenance_requests', 'maintenance_comments']) t,
     unnest(ARRAY['anon', 'authenticated']) r,
     unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p
ORDER BY 1, 2, 3;

--   Fingerprint of `authenticated` effective privileges — must be IDENTICAL in PART S.
SELECT md5(string_agg(t || '|' || p || '|' ||
                      has_table_privilege('authenticated', 'public.' || t, p)::text, ',' ORDER BY t, p)
        || '#' ||
        string_agg(t || '|' || p || '|' ||
                   has_any_column_privilege('authenticated', 'public.' || t,
                     CASE WHEN p IN ('SELECT','INSERT','UPDATE','REFERENCES') THEN p ELSE 'SELECT' END)::text,
                   ',' ORDER BY t, p)) AS authenticated_priv_fingerprint
FROM unnest(ARRAY['maintenance_requests', 'maintenance_comments']) t,
     unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;

-- 0.6  Policies (full definitions) on the two tables and storage.objects
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname = 'public'  AND tablename IN ('maintenance_requests', 'maintenance_comments'))
   OR (schemaname = 'storage' AND tablename = 'objects')
ORDER BY schemaname, tablename, policyname;

--   Fingerprint of every NON-sec002 policy above — must be IDENTICAL in PART S (G4).
SELECT md5(coalesce(string_agg(
         format('%s|%s|%s|%s|%s|%s|%s|%s', schemaname, tablename, policyname, permissive,
                roles::text, cmd, coalesce(qual, ''), coalesce(with_check, '')),
         E'\n' ORDER BY schemaname, tablename, policyname), '')) AS policy_fingerprint
FROM pg_policies
WHERE policyname NOT LIKE 'sec002\_%'
  AND ((schemaname = 'public'  AND tablename IN ('maintenance_requests', 'maintenance_comments'))
    OR (schemaname = 'storage' AND tablename = 'objects'));

-- 0.7  Indirect anon access paths (S5)
--   a) Views/materialized views built on these tables that anon can SELECT and that do
--      not run with security_invoker (they execute with the view owner's privileges).
SELECT DISTINCT v.oid::regclass AS view_name, v.relkind, v.reloptions,
       has_table_privilege('anon', v.oid, 'SELECT') AS anon_can_select
FROM pg_depend d
JOIN pg_rewrite rw ON rw.oid = d.objid
JOIN pg_class v ON v.oid = rw.ev_class
WHERE d.classid = 'pg_rewrite'::regclass
  AND d.refobjid IN ('public.maintenance_requests'::regclass, 'public.maintenance_comments'::regclass)
  AND v.oid NOT IN ('public.maintenance_requests'::regclass, 'public.maintenance_comments'::regclass);
--   S5 if any row has anon_can_select = true AND reloptions lacks security_invoker=true.

--   b) SECURITY DEFINER functions anon can EXECUTE whose body mentions either table.
SELECT p.oid::regprocedure AS function_name, pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
  AND (p.prosrc ILIKE '%maintenance_requests%' OR p.prosrc ILIKE '%maintenance_comments%');
--   S5 if any row. (Heuristic: dynamic SQL that builds table names is not detected — N3.)

-- 0.8  Bucket state (needed for PART C and rollback)
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'maintenance-photos';

-- 0.8b storage.objects.bucket_id type and collation. Part B derives the exact expected
--      policy expression from these. PART S's exact Part B check assumes type = 'text'.
SELECT format_type(a.atttypid, a.atttypmod) AS bucket_id_type,
       c.collname AS bucket_id_collation
FROM pg_attribute a LEFT JOIN pg_collation c ON c.oid = a.attcollation
WHERE a.attrelid = 'storage.objects'::regclass AND a.attname = 'bucket_id' AND NOT a.attisdropped;

-- 0.9  Every sec002_* policy, anywhere (S6). Expected 0 rows on first run. On a re-run
--      only the three names below may appear; ANY other sec002_* policy is a STOP, and
--      an expected name with a non-matching definition is a STOP (asserted in A and B).
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check,
       (schemaname, tablename, policyname) IN (
         ('public',  'maintenance_requests', 'sec002_deny_anon_maintenance_requests'),
         ('public',  'maintenance_comments', 'sec002_deny_anon_maintenance_comments'),
         ('storage', 'objects',              'sec002_deny_anon_maintenance_photos')) AS expected_name
FROM pg_policies WHERE policyname LIKE 'sec002\_%'
ORDER BY 1, 2, 3;


-- ============================================================================
-- PART 0R — ROLLBACK GENERATOR (read-only). Save the output VERBATIM.
-- ============================================================================
-- Emits the exact GRANT statements that recreate anon's CURRENT direct privileges
-- (table- and column-level). This output — not a generic GRANT ALL — is the only
-- correct rollback for Part A. If it returns 0 rows, anon had no direct grants and
-- the Part A rollback is "drop the two sec002 policies" only.
-- Note: re-granting records the executing role as grantor, which may differ from the
-- original grantor (see 0.2). anon's effective privileges are identical either way.
SELECT format('GRANT %s ON TABLE public.%I TO anon%s;',
              a.privilege_type, c.relname,
              CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END) AS rollback_statement
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) a
WHERE n.nspname = 'public' AND c.relname IN ('maintenance_requests', 'maintenance_comments')
  AND a.grantee = 'anon'::regrole
UNION ALL
SELECT format('GRANT %s (%I) ON TABLE public.%I TO anon%s;',
              a.privilege_type, att.attname, c.relname,
              CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute att ON att.attrelid = c.oid AND att.attnum > 0 AND NOT att.attisdropped
CROSS JOIN LATERAL aclexplode(att.attacl) a
WHERE n.nspname = 'public' AND c.relname IN ('maintenance_requests', 'maintenance_comments')
  AND a.grantee = 'anon'::regrole
ORDER BY 1;


-- ============================================================================
-- PART A — Tables: revoke anon privileges + restrictive deny policies
--          Single transaction. Self-verifying. Safe to re-run.
-- ============================================================================
BEGIN;

-- A.1  Preconditions (S1, S2, S3, S5, S6, S8, S10). Any failure aborts the whole part.
DO $pre$
DECLARE
  expected_anon_members text[] := ARRAY['authenticator'];  -- see S10; extend only after review
  t text;
  rls boolean;
  n int;
  bad text;
BEGIN
  IF current_setting('server_version_num')::int < 170000 THEN
    RAISE EXCEPTION 'SEC002 STOP: PostgreSQL 17+ required (privilege checks include MAINTAIN); server is %.', current_setting('server_version');
  END IF;

  FOREACH t IN ARRAY ARRAY['maintenance_requests', 'maintenance_comments'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'SEC002 STOP S8: table public.% does not exist', t;
    END IF;
    SELECT relrowsecurity INTO rls FROM pg_class WHERE oid = ('public.' || t)::regclass;
    IF NOT rls THEN
      RAISE EXCEPTION 'SEC002 STOP S1: RLS is DISABLED on public.%. The restrictive policy would give no protection and authenticated tenant isolation cannot be assumed. Separate review of landlord/tenant policies required. Do NOT enable RLS here.', t;
    END IF;
  END LOOP;

  IF pg_has_role('authenticated', 'anon', 'MEMBER') OR pg_has_role('service_role', 'anon', 'MEMBER') THEN
    RAISE EXCEPTION 'SEC002 STOP S2: authenticated or service_role is a member of anon; TO anon policies would apply to them.';
  END IF;

  SELECT string_agg(r.rolname, ', ' ORDER BY r.rolname) INTO bad
  FROM pg_roles r
  WHERE r.rolname <> 'anon'
    AND pg_has_role(r.oid, 'anon'::regrole, 'MEMBER')
    AND r.rolname <> ALL (expected_anon_members)
    AND NOT r.rolsuper AND NOT r.rolbypassrls;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'SEC002 STOP S10: unexpected member(s) of anon without BYPASSRLS: %. TO anon policies could restrict them. Review required (see PART 0.4).', bad;
  END IF;

  SELECT string_agg(format('%s.%s.%s', schemaname, tablename, policyname), ', ') INTO bad
  FROM pg_policies
  WHERE policyname LIKE 'sec002\_%'
    AND (schemaname, tablename, policyname) NOT IN (
      ('public',  'maintenance_requests', 'sec002_deny_anon_maintenance_requests'),
      ('public',  'maintenance_comments', 'sec002_deny_anon_maintenance_comments'),
      ('storage', 'objects',              'sec002_deny_anon_maintenance_photos'));
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'SEC002 STOP S6: unexpected sec002_* policy/policies exist: %. Not created by this migration — investigate.', bad;
  END IF;

  SELECT count(*) INTO n
  FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
  WHERE c.oid IN ('public.maintenance_requests'::regclass, 'public.maintenance_comments'::regclass)
    AND a.grantee = 0;
  SELECT n + count(*) INTO n
  FROM pg_attribute att CROSS JOIN LATERAL aclexplode(att.attacl) a
  WHERE att.attrelid IN ('public.maintenance_requests'::regclass, 'public.maintenance_comments'::regclass)
    AND att.attnum > 0 AND a.grantee = 0;
  IF n > 0 THEN
    RAISE EXCEPTION 'SEC002 STOP S3: PUBLIC holds % privilege(s) on the maintenance tables. Revoking from PUBLIC is out of scope; review required.', n;
  END IF;

  SELECT count(DISTINCT v.oid) INTO n
  FROM pg_depend d
  JOIN pg_rewrite rw ON rw.oid = d.objid
  JOIN pg_class v ON v.oid = rw.ev_class
  WHERE d.classid = 'pg_rewrite'::regclass
    AND d.refobjid IN ('public.maintenance_requests'::regclass, 'public.maintenance_comments'::regclass)
    AND v.oid NOT IN ('public.maintenance_requests'::regclass, 'public.maintenance_comments'::regclass)
    AND has_table_privilege('anon', v.oid, 'SELECT')
    AND NOT coalesce('security_invoker=true' = ANY (v.reloptions), false)
    AND NOT coalesce('security_invoker=on'   = ANY (v.reloptions), false);
  IF n > 0 THEN
    RAISE EXCEPTION 'SEC002 STOP S5: % view(s) over the maintenance tables are readable by anon with owner privileges (see PART 0.7a).', n;
  END IF;

  SELECT count(*) INTO n
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE p.prosecdef
    AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND (p.prosrc ILIKE '%maintenance_requests%' OR p.prosrc ILIKE '%maintenance_comments%');
  IF n > 0 THEN
    RAISE EXCEPTION 'SEC002 STOP S5: % SECURITY DEFINER function(s) executable by anon reference the maintenance tables (see PART 0.7b).', n;
  END IF;
END
$pre$;

-- A.1b Snapshot effective privileges of every role whose privileges could change when
--      anon's grants are revoked: roles that INHERIT anon's privileges (USAGE), plus
--      authenticated and service_role. Session-local; dropped at COMMIT. Compared in A.4 (S11).
DROP TABLE IF EXISTS pg_temp.sec002_priv_before;
CREATE TEMP TABLE sec002_priv_before ON COMMIT DROP AS
SELECT r.rolname, t, p,
       has_table_privilege(r.oid, ('public.' || t)::regclass, p) AS tbl,
       CASE WHEN p IN ('SELECT','INSERT','UPDATE','REFERENCES')
            THEN has_any_column_privilege(r.oid, ('public.' || t)::regclass, p) END AS col
FROM pg_roles r,
     unnest(ARRAY['maintenance_requests', 'maintenance_comments']) t,
     unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
WHERE r.rolname IN ('authenticated', 'service_role')
   OR (r.rolname <> 'anon' AND pg_has_role(r.oid, 'anon'::regrole, 'USAGE'));

-- A.2  Revoke. Idempotent. A table-level REVOKE ALL also revokes column-level grants
--      made by the same grantor. Grants made by a different grantor survive → A.4 STOPs.
REVOKE ALL ON TABLE public.maintenance_requests FROM anon;
REVOKE ALL ON TABLE public.maintenance_comments FROM anon;

-- A.3  Restrictive deny-all policies for anon. Created only if absent; an existing
--      sec002 policy is accepted only if its definition matches exactly (S6).
DO $pol$
DECLARE
  t text;
  pname text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['maintenance_requests', 'maintenance_comments'] LOOP
    pname := 'sec002_deny_anon_' || t;
    SELECT * INTO p FROM pg_policies
    WHERE schemaname = 'public' AND tablename = t AND policyname = pname;
    IF NOT FOUND THEN
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false)', pname, t);
    ELSIF NOT (p.permissive = 'RESTRICTIVE' AND p.roles = ARRAY['anon']::name[] AND p.cmd = 'ALL'
               AND p.qual = 'false' AND p.with_check = 'false') THEN
      RAISE EXCEPTION 'SEC002 STOP S6: policy % on public.% exists with an unexpected definition (%, %, %, %, %). Not modified.',
        pname, t, p.permissive, p.roles, p.cmd, p.qual, p.with_check;
    END IF;
  END LOOP;
END
$pol$;

-- A.4  Postconditions (G1, G2, G4-privileges, S4, S11). Any failure aborts the whole
--      part — nothing committed.
DO $post$
DECLARE
  t text;
  priv text;
  n int;
  changed text;
BEGIN
  FOREACH t IN ARRAY ARRAY['maintenance_requests', 'maintenance_comments'] LOOP
    FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
      IF has_table_privilege('anon', 'public.' || t, priv) THEN
        RAISE EXCEPTION 'SEC002 STOP S4: anon still has effective % on public.% after REVOKE (inherited role, or grant by another grantor — see PART 0.2/0.4). Rolled back.', priv, t;
      END IF;
    END LOOP;
    FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
      IF has_any_column_privilege('anon', 'public.' || t, priv) THEN
        RAISE EXCEPTION 'SEC002 STOP S4: anon still has column-level % on public.% after REVOKE. Rolled back.', priv, t;
      END IF;
    END LOOP;
  END LOOP;

  -- Direct ACL check: no table- or column-level ACL entry for anon remains, of ANY
  -- privilege type (covers MAINTAIN and anything the lists above might miss).
  SELECT string_agg(x, ', ' ORDER BY x) INTO changed FROM (
    SELECT format('%s:%s (grantor %s)', c.relname, a.privilege_type, pg_get_userbyid(a.grantor)) AS x
    FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE c.oid IN ('public.maintenance_requests'::regclass, 'public.maintenance_comments'::regclass)
      AND a.grantee = 'anon'::regrole
    UNION ALL
    SELECT format('%s.%s:%s (grantor %s)', att.attrelid::regclass, att.attname, a.privilege_type, pg_get_userbyid(a.grantor))
    FROM pg_attribute att CROSS JOIN LATERAL aclexplode(att.attacl) a
    WHERE att.attrelid IN ('public.maintenance_requests'::regclass, 'public.maintenance_comments'::regclass)
      AND att.attnum > 0 AND a.grantee = 'anon'::regrole
  ) s;
  IF changed IS NOT NULL THEN
    RAISE EXCEPTION 'SEC002 STOP S4: ACL entries for anon remain after REVOKE: %. Rolled back.', changed;
  END IF;
  changed := NULL;

  SELECT string_agg(format('%s:%s:%s', b.rolname, b.t, b.p), ', ' ORDER BY b.rolname, b.t, b.p) INTO changed
  FROM pg_temp.sec002_priv_before b
  JOIN pg_roles r ON r.rolname = b.rolname
  WHERE has_table_privilege(r.oid, ('public.' || b.t)::regclass, b.p) IS DISTINCT FROM b.tbl
     OR (b.col IS NOT NULL
         AND has_any_column_privilege(r.oid, ('public.' || b.t)::regclass, b.p) IS DISTINCT FROM b.col);
  IF changed IS NOT NULL THEN
    RAISE EXCEPTION 'SEC002 STOP S11: revoking from anon changed effective privileges of other roles (%). Rolled back.', changed;
  END IF;

  SELECT count(*) INTO n FROM pg_policies
  WHERE (schemaname, tablename, policyname) IN (
          ('public', 'maintenance_requests', 'sec002_deny_anon_maintenance_requests'),
          ('public', 'maintenance_comments', 'sec002_deny_anon_maintenance_comments'))
    AND permissive = 'RESTRICTIVE' AND roles = ARRAY['anon']::name[] AND cmd = 'ALL'
    AND qual = 'false' AND with_check = 'false';
  IF n <> 2 THEN
    RAISE EXCEPTION 'SEC002 STOP: expected 2 restrictive anon policies with exact definition on the maintenance tables, found %. Rolled back.', n;
  END IF;

  RAISE NOTICE 'SEC002 Part A verified: anon has no effective privileges on either table; other roles'' privileges unchanged; 2 restrictive policies present.';
END
$post$;

DROP TABLE IF EXISTS pg_temp.sec002_priv_before;

COMMIT;
-- If any DO block raised, this COMMIT reports ROLLBACK and nothing in Part A applied.
-- Run PART S to confirm the state either way.


-- ============================================================================
-- PART B — Storage: deny anon on bucket 'maintenance-photos' (RLS-governed operations)
--          Single transaction. Self-verifying. Safe to re-run.
-- ============================================================================
-- Scope: blocks anon for every storage operation that is evaluated through RLS on
-- storage.objects — list, metadata, authenticated-style download, upload, update,
-- delete. It does NOT affect:
--   * /storage/v1/object/public/... URLs of a PUBLIC bucket (RLS is not consulted) → PART C
--   * signed URLs (download or upload) issued by the service role — vendor uploads from
--     api/vendor-ticket.js and SEC-001 signed reads keep working (verify: §7 step 17)
--   * other buckets — the policy only matches bucket_id = 'maintenance-photos'
-- storage.objects is shared by all buckets, so anon privileges there are NOT revoked.
-- If CREATE POLICY fails with "must be owner of table objects", stop and report; do not
-- work around it by altering ownership or existing policies.
BEGIN;

-- B.1  Preconditions (S2, S6, S7, S8, S10). Any failure aborts the whole part.
DO $pre$
DECLARE
  expected_anon_members text[] := ARRAY['authenticator'];  -- see S10; extend only after review
  bad text;
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'SEC002 STOP S8: storage.objects does not exist';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass) THEN
    RAISE EXCEPTION 'SEC002 STOP S7: RLS is DISABLED on storage.objects; a policy would give no protection. Review required.';
  END IF;
  IF pg_has_role('authenticated', 'anon', 'MEMBER') OR pg_has_role('service_role', 'anon', 'MEMBER') THEN
    RAISE EXCEPTION 'SEC002 STOP S2: authenticated or service_role is a member of anon.';
  END IF;

  SELECT string_agg(r.rolname, ', ' ORDER BY r.rolname) INTO bad
  FROM pg_roles r
  WHERE r.rolname <> 'anon'
    AND pg_has_role(r.oid, 'anon'::regrole, 'MEMBER')
    AND r.rolname <> ALL (expected_anon_members)
    AND NOT r.rolsuper AND NOT r.rolbypassrls;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'SEC002 STOP S10: unexpected member(s) of anon without BYPASSRLS: %. TO anon policies could restrict them. Review required (see PART 0.4).', bad;
  END IF;

  SELECT string_agg(format('%s.%s.%s', schemaname, tablename, policyname), ', ') INTO bad
  FROM pg_policies
  WHERE policyname LIKE 'sec002\_%'
    AND (schemaname, tablename, policyname) NOT IN (
      ('public',  'maintenance_requests', 'sec002_deny_anon_maintenance_requests'),
      ('public',  'maintenance_comments', 'sec002_deny_anon_maintenance_comments'),
      ('storage', 'objects',              'sec002_deny_anon_maintenance_photos'));
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'SEC002 STOP S6: unexpected sec002_* policy/policies exist: %. Not created by this migration — investigate.', bad;
  END IF;
END
$pre$;

-- B.2  Derive the EXACT expression text PostgreSQL stores for the intended policy, from
--      this server, using a session-local temp table whose bucket_id has the same type
--      and collation as storage.objects.bucket_id. Nothing outside the session is touched;
--      the temp table is dropped before COMMIT (and ON COMMIT DROP regardless).
DO $ref$
DECLARE
  col_type text;
  col_coll text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod),
         CASE WHEN a.attcollation <> 0 AND a.attcollation IS DISTINCT FROM t.typcollation
              THEN format(' COLLATE %I.%I', cn.nspname, c.collname) ELSE '' END
    INTO col_type, col_coll
  FROM pg_attribute a
  JOIN pg_type t ON t.oid = a.atttypid
  LEFT JOIN pg_collation c ON c.oid = a.attcollation
  LEFT JOIN pg_namespace cn ON cn.oid = c.collnamespace
  WHERE a.attrelid = 'storage.objects'::regclass AND a.attname = 'bucket_id' AND NOT a.attisdropped;
  IF col_type IS NULL THEN
    RAISE EXCEPTION 'SEC002 STOP S8: storage.objects.bucket_id not found';
  END IF;

  DROP TABLE IF EXISTS pg_temp.sec002_expr_ref;
  EXECUTE format('CREATE TEMP TABLE sec002_expr_ref (bucket_id %s%s) ON COMMIT DROP', col_type, col_coll);
  EXECUTE 'CREATE POLICY expected_expr_ref ON pg_temp.sec002_expr_ref AS RESTRICTIVE FOR ALL TO anon '
       || 'USING (bucket_id <> ''maintenance-photos'') WITH CHECK (bucket_id <> ''maintenance-photos'')';
END
$ref$;

-- B.3  Create the storage policy if absent. An existing policy is accepted ONLY if it is
--      RESTRICTIVE, TO {anon}, FOR ALL, and its stored USING and WITH CHECK expressions
--      are exactly equal to the reference from B.2 (S6). Anything else → STOP, unmodified.
DO $pol$
DECLARE
  p record;
  exp_qual text;
  exp_check text;
BEGIN
  SELECT qual, with_check INTO exp_qual, exp_check
  FROM pg_policies
  WHERE schemaname = (SELECT nspname FROM pg_namespace WHERE oid = pg_my_temp_schema())
    AND tablename = 'sec002_expr_ref' AND policyname = 'expected_expr_ref';
  IF exp_qual IS NULL OR exp_check IS NULL THEN
    RAISE EXCEPTION 'SEC002 STOP: could not derive the reference policy expression. Rolled back.';
  END IF;
  RAISE NOTICE 'SEC002 Part B reference expression: USING % / WITH CHECK %', exp_qual, exp_check;

  SELECT * INTO p FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'sec002_deny_anon_maintenance_photos';
  IF NOT FOUND THEN
    CREATE POLICY "sec002_deny_anon_maintenance_photos"
      ON storage.objects AS RESTRICTIVE FOR ALL TO anon
      USING (bucket_id <> 'maintenance-photos')
      WITH CHECK (bucket_id <> 'maintenance-photos');
  ELSIF NOT (p.permissive = 'RESTRICTIVE' AND p.roles = ARRAY['anon']::name[] AND p.cmd = 'ALL'
             AND p.qual = exp_qual AND p.with_check = exp_check) THEN
    RAISE EXCEPTION 'SEC002 STOP S6: policy sec002_deny_anon_maintenance_photos exists with an unexpected definition (%, %, %, USING %, WITH CHECK %); expected (RESTRICTIVE, {anon}, ALL, USING %, WITH CHECK %). Not modified.',
      p.permissive, p.roles, p.cmd, p.qual, p.with_check, exp_qual, exp_check;
  END IF;
END
$pol$;

-- B.4  Postcondition: the policy exists with the exact expected definition.
DO $post$
DECLARE
  exp_qual text;
  exp_check text;
BEGIN
  SELECT qual, with_check INTO exp_qual, exp_check
  FROM pg_policies
  WHERE schemaname = (SELECT nspname FROM pg_namespace WHERE oid = pg_my_temp_schema())
    AND tablename = 'sec002_expr_ref' AND policyname = 'expected_expr_ref';

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'sec002_deny_anon_maintenance_photos'
      AND permissive = 'RESTRICTIVE' AND roles = ARRAY['anon']::name[] AND cmd = 'ALL'
      AND qual = exp_qual AND with_check = exp_check
  ) THEN
    RAISE EXCEPTION 'SEC002 STOP: storage policy missing or not exactly as expected after creation. Rolled back.';
  END IF;
  RAISE NOTICE 'SEC002 Part B verified: restrictive anon policy on maintenance-photos present with exact expected expressions.';
END
$post$;

-- B.5  Remove the session-local reference table (and its reference policy) before commit.
DROP TABLE IF EXISTS pg_temp.sec002_expr_ref;

COMMIT;


-- ============================================================================
-- PART C — Make 'maintenance-photos' private. REQUIRED for complete photo privacy.
--          Gated: run only after P4 (SEC-001 signed-URL compatibility verified).
-- ============================================================================
-- Without this part, anyone who knows or guesses an object path can read it via
--   /storage/v1/object/public/maintenance-photos/<path>
-- regardless of Part B, because public-bucket URLs are not evaluated against RLS.
--
-- Code-level compatibility (verified 2026-10-30): no code in tenant-portal/src, api or
-- supabase/functions calls getPublicUrl or builds /object/public/ URLs; the only
-- reference is src/storageUtils.js, which PARSES legacy public URLs stored in the DB
-- and converts them to signed URLs. Runtime verification (P4) is still required:
-- landlord ticket photos, tenant ticket photos, vendor photos and invoice images must
-- all display via signed URLs in production before this runs.
--
-- Uncomment and run as its own transaction:
--
-- BEGIN;
-- DO $c$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'maintenance-photos') THEN
--     RAISE EXCEPTION 'SEC002 STOP S8: bucket maintenance-photos does not exist';
--   END IF;
-- END
-- $c$;
-- UPDATE storage.buckets SET public = false WHERE id = 'maintenance-photos' AND public IS DISTINCT FROM false;
-- DO $c$
-- BEGIN
--   IF (SELECT public FROM storage.buckets WHERE id = 'maintenance-photos') IS DISTINCT FROM false THEN
--     RAISE EXCEPTION 'SEC002 STOP: bucket still public after update. Rolled back.';
--   END IF;
--   RAISE NOTICE 'SEC002 Part C verified: maintenance-photos is private.';
-- END
-- $c$;
-- COMMIT;


-- ============================================================================
-- PART S — STATUS / DIAGNOSIS (read-only). Run after each part and whenever unsure.
-- ============================================================================
-- Columns:
--   part_a_policies_exact  both table policies exist with the exact definition
--                          (RESTRICTIVE, {anon}, ALL, USING false, WITH CHECK false)
--   anon_effective_privs   detailed diagnostic: every remaining anon privilege,
--                          'table:PRIV' (table-level) or 'table:PRIV(column)' (column-level)
--   part_a_applied         part_a_policies_exact AND anon_effective_privs = '' — the full
--                          G1 + G2 guarantee, table- AND column-level
--   part_b_applied         storage policy exists, RESTRICTIVE {anon} ALL, with USING and
--                          WITH CHECK exactly "(bucket_id <> 'maintenance-photos'::text)".
--                          NULL if bucket_id is not of type text (0.8b) — then compare
--                          part_b_qual / part_b_with_check with the reference expression
--                          Part B printed in its NOTICE.
--   unexpected_sec002      any sec002_* policy that is not one of the three expected (S6)
--
-- Interpreting the result:
--   part_a_applied = false, part_b_applied = false → nothing applied (or both rolled back)
--   part_a_applied = true,  part_b_applied = false → A committed; B not run or rolled back → run B
--   part_a_applied = false, part_b_applied = true  → out of order or partly reverted; read
--       part_a_policies_exact and anon_effective_privs before doing anything
--   part_a_policies_exact = true but anon_effective_privs non-empty → privileges were
--       re-granted after Part A — investigate; do NOT re-run blindly
--   unexpected_sec002 non-empty → STOP S6; investigate
--   fingerprints differ from PART 0 → something other than this migration changed
--       policies/privileges — STOP and investigate before any further step
WITH anon_privs AS (
  SELECT coalesce(string_agg(x, ', ' ORDER BY x), '') AS list
  FROM (
    SELECT t || ':' || p AS x
    FROM unnest(ARRAY['maintenance_requests', 'maintenance_comments']) t,
         unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
    WHERE has_table_privilege('anon', 'public.' || t, p)
    UNION ALL
    SELECT t || ':' || p || '(column)'
    FROM unnest(ARRAY['maintenance_requests', 'maintenance_comments']) t,
         unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p
    WHERE has_any_column_privilege('anon', 'public.' || t, p)
      AND NOT has_table_privilege('anon', 'public.' || t, p)
  ) s
),
a_policies AS (
  SELECT count(*) = 2 AS exact
  FROM pg_policies
  WHERE (schemaname, tablename, policyname) IN (
          ('public', 'maintenance_requests', 'sec002_deny_anon_maintenance_requests'),
          ('public', 'maintenance_comments', 'sec002_deny_anon_maintenance_comments'))
    AND permissive = 'RESTRICTIVE' AND roles = ARRAY['anon']::name[] AND cmd = 'ALL'
    AND qual = 'false' AND with_check = 'false'
),
b_policy AS (
  SELECT
    (SELECT qual FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'sec002_deny_anon_maintenance_photos') AS qual,
    (SELECT with_check FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'sec002_deny_anon_maintenance_photos') AS with_check,
    CASE WHEN (SELECT format_type(atttypid, atttypmod) FROM pg_attribute
                WHERE attrelid = 'storage.objects'::regclass AND attname = 'bucket_id'
                  AND NOT attisdropped) = 'text'
         THEN EXISTS (
           SELECT 1 FROM pg_policies
           WHERE schemaname = 'storage' AND tablename = 'objects'
             AND policyname = 'sec002_deny_anon_maintenance_photos'
             AND permissive = 'RESTRICTIVE' AND roles = ARRAY['anon']::name[] AND cmd = 'ALL'
             AND qual       = '(bucket_id <> ''maintenance-photos''::text)'
             AND with_check = '(bucket_id <> ''maintenance-photos''::text)')
    END AS exact
),
unexpected AS (
  SELECT coalesce(string_agg(format('%s.%s.%s', schemaname, tablename, policyname), ', '), '') AS list
  FROM pg_policies
  WHERE policyname LIKE 'sec002\_%'
    AND (schemaname, tablename, policyname) NOT IN (
      ('public',  'maintenance_requests', 'sec002_deny_anon_maintenance_requests'),
      ('public',  'maintenance_comments', 'sec002_deny_anon_maintenance_comments'),
      ('storage', 'objects',              'sec002_deny_anon_maintenance_photos'))
)
SELECT
  a_policies.exact                                   AS part_a_policies_exact,
  anon_privs.list                                    AS anon_effective_privs,
  (a_policies.exact AND anon_privs.list = '')        AS part_a_applied,
  b_policy.exact                                     AS part_b_applied,
  b_policy.qual                                      AS part_b_qual,
  b_policy.with_check                                AS part_b_with_check,
  unexpected.list                                    AS unexpected_sec002,
  (SELECT public FROM storage.buckets WHERE id = 'maintenance-photos') AS bucket_public,
  (SELECT bool_and(relrowsecurity) FROM pg_class
    WHERE oid IN ('public.maintenance_requests'::regclass, 'public.maintenance_comments'::regclass,
                  'storage.objects'::regclass))      AS rls_enabled_all
FROM anon_privs, a_policies, b_policy, unexpected;

-- Re-run the two fingerprint queries from PART 0.5 and 0.6. They MUST equal the
-- PART 0 values (G4): authenticated privileges and all non-sec002 policies unchanged.

-- Black-box check from a terminal, using only the PUBLIC anon key:
--   curl -s "$SUPABASE_URL/rest/v1/maintenance_requests?select=id&limit=1" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--     → error code "42501" (permission denied for table maintenance_requests)
--   curl -s "$SUPABASE_URL/rest/v1/maintenance_comments?select=id&limit=1" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--     → error code "42501"
--   curl -s -X POST "$SUPABASE_URL/storage/v1/object/list/maintenance-photos" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
--        -d '{"prefix":"","limit":5}'
--     → [] or an error — never object names
--   After PART C only:
--   curl -s -o /dev/null -w "%{http_code}" "$SUPABASE_URL/storage/v1/object/public/maintenance-photos/<known path>"
--     → 400/404 (not 200)


-- ============================================================================
-- PART R — ROLLBACK. Restores the ORIGINAL EXPOSURE. Use only if necessary
--          (e.g. a production outage traced to this migration), then re-plan.
-- ============================================================================
-- Rules:
--   * Roll back in reverse order: C → B → A. Roll back only the parts that were applied
--     (PART S tells you which).
--   * Part A rollback re-grants EXACTLY the statements saved from PART 0R — nothing
--     more. Do not use GRANT ALL unless PART 0R produced exactly that set.
--   * After rollback, run PART S and compare with the saved PART 0 output: anon's
--     effective privileges (0.5) and the fingerprints should match the original.
--
-- R.C  (only if Part C ran AND PART 0.8 showed public = true)
--   UPDATE storage.buckets SET public = true WHERE id = 'maintenance-photos';
--
-- R.B
--   DROP POLICY IF EXISTS "sec002_deny_anon_maintenance_photos" ON storage.objects;
--
-- R.A  (one transaction)
--   BEGIN;
--   DROP POLICY IF EXISTS "sec002_deny_anon_maintenance_requests" ON public.maintenance_requests;
--   DROP POLICY IF EXISTS "sec002_deny_anon_maintenance_comments" ON public.maintenance_comments;
--   -- Paste the PART 0R output here, verbatim. If PART 0R returned no rows, paste nothing.
--   COMMIT;
--
-- If PART 0R output was not saved, do NOT guess. Reconstruct from the saved PART 0.2 /
-- 0.3 rows where grantee = 'anon' (one GRANT per row), or leave anon without grants and
-- fix forward.


-- ============================================================================
-- OPTIONAL LATER CLEANUP (separate, reviewed change — not part of this migration)
-- ============================================================================
-- The permissive anon policies listed in PART 0.6 become inert after Parts A/B.
-- They may be dropped BY NAME after a week of normal operation, so they cannot
-- silently re-activate if the sec002 policies are ever removed. Never drop or alter
-- policies whose roles include `authenticated` or `public` in this cleanup — landlord
-- and tenant access may depend on them.
