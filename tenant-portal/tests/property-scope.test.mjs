// Global property scope (src/lib/propertyScope*.js[x]): validation, cache keys, stale-response protection, resets,
// and that every scoped screen passes the selected property id explicitly into its loader.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ALL, validateScope, scopeKey, inScope, resetForScope, latestOnly } from "../src/lib/propertyScopeCore.js";

const OPTS = [{ id: "p1", name: "Clifton Manor" }, { id: "p2", name: "Lakeview" }];

test("validateScope: ALL and authorised ids pass; unknown, removed or unauthorised ids fall back to ALL", () => {
  assert.equal(validateScope(ALL, OPTS), ALL);
  assert.equal(validateScope("p2", OPTS), "p2");
  assert.equal(validateScope("someone-elses-property", OPTS), ALL);
  assert.equal(validateScope("p2", [OPTS[0]]), ALL);       // property removed / access revoked since last visit
  assert.equal(validateScope(null, OPTS), ALL);
  assert.equal(validateScope("", OPTS), ALL);
  assert.equal(validateScope("p1", []), ALL);              // nothing authorised (or not loaded)
});

test("scopeKey isolates caches per property and for the whole portfolio", () => {
  const keys = new Set([scopeKey("maint", ALL), scopeKey("maint", "p1"), scopeKey("maint", "p2"), scopeKey("dash", "p1")]);
  assert.equal(keys.size, 4);
  assert.equal(scopeKey("maint", undefined), scopeKey("maint", ALL));
});

test("inScope: ALL keeps every row; a property keeps only its rows", () => {
  const rows = [{ p: "p1" }, { p: "p2" }, { p: null }];
  assert.equal(rows.filter((r) => inScope(ALL, r.p)).length, 3);
  assert.deepEqual(rows.filter((r) => inScope("p1", r.p)), [{ p: "p1" }]);
});

test("rapid switching: only the newest load may write (A → B → A, responses arrive out of order)", async () => {
  const gate = latestOnly();
  const written = [];
  const load = (scope, ms) => { const t = gate.take(); return new Promise((r) => setTimeout(r, ms)).then(() => { if (gate.isCurrent(t)) written.push(scope); }); };
  await Promise.all([load("p1", 30), load("p2", 5), load(ALL, 15)]);
  assert.deepEqual(written, [ALL]);
});

test("scope change resets pagination, selection, expansion and detail; keeps only scope-independent filters", () => {
  const v = resetForScope({ page: 4, selectedIds: ["a", "b"], expandedId: "x", detailId: "y", filters: { status: "open", unitId: "u9", search: "leak" } });
  assert.deepEqual(v, { page: 1, selectedIds: [], expandedId: null, detailId: null, filters: { status: "open", search: "leak" } });
});

// Wiring: the provider wraps the management routes once; scoped screens read usePropertyScope / useScopedLoad and
// hand the property id to their loaders explicitly; persistence is per user and validated.
const read = (p) => fs.readFileSync(path.resolve(import.meta.dirname, "..", p), "utf8");

test("PropertyScopeProvider wraps every /landlord route except login", () => {
  const app = read("src/App.jsx");
  const open = app.indexOf("<Route element={<PropertyScopeProvider><Outlet/></PropertyScopeProvider>}>");
  assert.ok(open > 0);
  const block = app.slice(open, app.indexOf("</Route>", open));
  for (const r of ["/landlord\"", "/landlord/maintenance\"", "/landlord/financials\"", "/landlord/tenants\""]) assert.ok(block.includes(`path="${r}`), r);
  assert.ok(!block.includes("/landlord/login"));
});

test("scope persistence is per signed-in user, validated against authorised properties, and storage failures are safe", () => {
  const s = read("src/lib/propertyScope.jsx");
  assert.match(s, /STORAGE_PREFIX \+ userId/);
  assert.match(s, /status === "ready" \? validateScope\(requested, options\) : ALL/);
  assert.match(s, /try \{ return localStorage\.getItem/);
  assert.match(s, /try \{ localStorage\.setItem/);
  // Never a stored id before the authorised list has loaded; the cache is cleared on sign-out.
  assert.match(read("src/LandlordLayout.jsx"), /clearScopedCache\(\); await supabase\.auth\.signOut\(\)/);
});

test("scoped screens pass the selected property id into their loaders", () => {
  for (const f of ["src/LandlordDashboard.jsx", "src/LandlordMaintenance.jsx", "src/LandlordTenants.jsx", "src/LandlordFinancials.jsx"]) {
    const s = read(f);
    assert.match(s, /useScopedLoad\(|usePropertyScope\(/, f);
    assert.match(s, /propertyId|selectedPropertyId/, f);
  }
});
