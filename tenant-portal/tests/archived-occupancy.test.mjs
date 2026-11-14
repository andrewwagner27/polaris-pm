// Archived (past) tenants must not count as occupying a unit on the dashboard, properties or reports pages.
// Before this, a tenant archived after move-out (or a test record archived after onboarding tests) kept the
// unit "occupied" and could displace the current tenant in the rent roll (units.map + tenants.find).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const [file, varName] of [["src/LandlordDashboard.jsx", "tenants"], ["src/LandlordProperties.jsx", "tenantsData"], ["src/LandlordReports.jsx", "tenantsData"]]) {
  test(`${file} drops archived tenants before computing occupancy and the rent roll`, () => {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.ok(src.includes(`setTenants((${varName} || []).filter(t => !t.archived));`), "archived filter missing");
    assert.ok(!src.includes(`setTenants(${varName} || []);`), "unfiltered tenant list still set");
  });
}
