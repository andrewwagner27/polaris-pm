// tests/security-migration.test.mjs
// Static guarantees of the security-hardening migration (behaviour validated separately on PGlite: 24 checks).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mig = readFileSync(new URL("../supabase/migrations/20261114130000_security_hardening.sql", import.meta.url), "utf8");
const code = mig.replace(/--.*$/gm, "");

test("revokes EXECUTE on the exposed SECURITY DEFINER trigger functions and pins handle_new_user's path", () => {
  assert.match(code, /REVOKE EXECUTE ON FUNCTION public\.agent_knowledge_guard\(\) FROM PUBLIC, anon, authenticated;/);
  assert.match(code, /REVOKE EXECUTE ON FUNCTION public\.handle_new_user\(\) FROM PUBLIC, anon, authenticated;/);
  assert.match(code, /ALTER FUNCTION public\.handle_new_user\(\) SET search_path = '';/);
});

test("refuses to run against changed function bodies, existing violations, or twice", () => {
  assert.match(code, /md5\(prosrc\) FROM pg_proc WHERE oid = 'public\.handle_new_user\(\)'::regprocedure\) <> '0acdcd1b760a632008e61b827efa5317'/);
  assert.match(code, /wp1_is_staff_user\(uuid\)'::regprocedure\) <> '19433b422c82bde62d2ad922f44b10b6'/);
  assert.match(code, /more than one active tenant record/);
  assert.match(code, /linked to a management login/);
  assert.match(code, /refusing to re-run/);
});

test("pins search_path on all twelve invoker functions", () => {
  for (const f of ["a1_append_only()", "a2_append_only()", "a2_charge_guard()", "a2_payment_channel_guard()", "set_updated_at()",
    "update_evictions_updated_at()", "update_rent_payments_updated_at()", "update_routing_rules_updated_at()", "a2_cat(text)",
    "a2_is_service()", "a2_ny_date(timestamp with time zone)", "a2_today()"]) {
    assert.ok(code.includes(`ALTER FUNCTION public.${f} SET search_path = public;`), f);
  }
});

test("tenant link integrity: no staff links (any role), one active tenant per login; new function is invoker and not executable by clients", () => {
  assert.match(code, /CREATE UNIQUE INDEX tenants_one_active_link_per_user ON public\.tenants \(user_id\)\s+WHERE user_id IS NOT NULL AND coalesce\(archived, false\) = false;/);
  assert.match(code, /CREATE FUNCTION public\.tenants_no_staff_link\(\) RETURNS trigger\s+LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''/);
  assert.match(code, /public\.wp1_is_staff_user\(NEW\.user_id\)/);
  assert.match(code, /BEFORE INSERT OR UPDATE OF user_id ON public\.tenants/);
  assert.match(code, /REVOKE EXECUTE ON FUNCTION public\.tenants_no_staff_link\(\) FROM PUBLIC, anon, authenticated;/);
  assert.ok(!/SECURITY DEFINER/.test(code), "the migration creates no new SECURITY DEFINER function");
  assert.ok(!/\bDROP\b/i.test(code), "nothing is dropped outside the documented rollback");
});

test("documents the rollback", () => {
  assert.match(mig, /-- Rollback:/);
  assert.match(mig, /DROP TRIGGER IF EXISTS tenants_no_staff_link ON public\.tenants;/);
});
