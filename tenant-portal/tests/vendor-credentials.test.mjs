// tests/vendor-credentials.test.mjs
// Contractor credentials (vendor_token / vendor_pin) and contact details must not reach tenants.
// The database side is verified on a local restore of production with scripts/local-db/vendor-credentials-check.sql;
// these checks keep the app and the migration in step.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { TICKET_COLUMNS } from "../src/lib/maintenanceColumns.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const MIG = read("supabase/migrations/20261117000000_vendor_credentials_private.sql");
const SECRET = ["vendor_token", "vendor_pin", "vendor_phone", "vendor_email", "work_order_accepted_ip"];
const cols = (s) => s.split(",").map((c) => c.trim()).filter(Boolean);

test("the client column list is exactly the migration's SELECT grant, and excludes every secret", () => {
  const grant = MIG.match(/GRANT SELECT \(([\s\S]*?)\) ON public\.maintenance_requests TO authenticated/)[1];
  assert.deepEqual(cols(TICKET_COLUMNS).sort(), cols(grant).sort());
  for (const s of SECRET) assert.ok(!cols(TICKET_COLUMNS).includes(s), s);
});
test("migration: table SELECT revoked, insert guard for non-management clients, landlord-only RPC, transactional", () => {
  assert.match(MIG, /REVOKE SELECT ON public\.maintenance_requests FROM authenticated, anon;/);
  assert.match(MIG, /CREATE TRIGGER maintenance_requests_guard_insert BEFORE INSERT ON public\.maintenance_requests/);
  for (const c of ["vendor_token", "vendor_pin", "vendor_token_expires_at", "quote_approved_at", "invoice_amount", "work_order_accepted_at"]) assert.match(MIG, new RegExp(`NEW\.${c} IS NOT NULL`), c);
  assert.match(MIG, /NEW\.status IS DISTINCT FROM 'open'/);
  assert.match(MIG, /IF NOT public\.is_landlord\(\) THEN\s+RAISE EXCEPTION 'Landlord access required'/);
  assert.match(MIG, /SECURITY DEFINER SET search_path = public/);
  assert.match(MIG, /REVOKE EXECUTE ON FUNCTION public\.landlord_vendor_access\(uuid\) FROM PUBLIC, anon;/);
  assert.match(MIG, /^BEGIN;[\s\S]*COMMIT;\s*$/m);
  assert.match(MIG, /has already been applied/);
  assert.match(MIG, /Rollback:/);
});
test("no client code selects * (or a secret column) from maintenance_requests", () => {
  const files = [];
  const walk = (d) => { for (const e of readdirSync(new URL(`../${d}`, import.meta.url), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(e.name)) files.push(p); } };
  walk("src");
  for (const f of files) {
    const s = read(f);
    for (const m of s.matchAll(/from\(["']maintenance_requests["']\)\s*\.(select|insert\([\s\S]*?\)\s*\.select)\(\s*([^)]*)\)/g)) {
      const arg = m[2].trim();
      assert.ok(arg !== "" && !/^["'`]\*/.test(arg), `${f}: select(${arg || "<none>"})`);
      for (const sec of SECRET) assert.ok(!arg.includes(sec), `${f}: ${sec}`);
    }
    for (const sec of ["vendor_token", "vendor_pin"]) {
      assert.ok(!new RegExp(`(?:ticket|selected|t|data)\??\.${sec}\b`).test(s), `${f} reads ${sec} from a ticket row`);
    }
  }
});
test("the landlord app gets the link + PIN only through landlord_vendor_access", () => {
  const lm = read("src/LandlordMaintenance.jsx");
  assert.match(lm, /supabase\.rpc\("landlord_vendor_access", \{ p_request: selected\.id \}\)/);
});
