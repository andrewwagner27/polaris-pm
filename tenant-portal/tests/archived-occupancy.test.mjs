// Archived (past) tenants must not count as occupying a unit on the dashboard, properties or reports pages.
// Before this, a tenant archived after move-out (or a test record archived after onboarding tests) kept the
// unit "occupied" and could displace the current tenant in the rent roll (units.map + tenants.find).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The dashboard loads through useScopedLoad (property scope): the same filter is applied to the loaded list before
// occupancy and the rent roll are computed, and no other tenant list reaches the page.
test("src/LandlordDashboard.jsx drops archived tenants before computing occupancy and the rent roll", () => {
  const src = readFileSync(new URL("../src/LandlordDashboard.jsx", import.meta.url), "utf8");
  assert.ok(src.includes("out.tenants = out.tenants.filter((t) => !t.archived);"), "archived filter missing");
  assert.ok(src.indexOf("out.tenants = out.tenants.filter((t) => !t.archived);") < src.indexOf("return out;"), "filter must run before the data is returned");
  assert.ok(!/setTenants\(/.test(src), "a second, unfiltered tenant list is set");
  assert.ok(src.includes("occupied = new Set(d.tenants"), "occupancy must use the filtered list");
});

for (const [file, varName] of [["src/LandlordProperties.jsx", "tenantsData"], ["src/LandlordReports.jsx", "tenantsData"]]) {
  test(`${file} drops archived tenants before computing occupancy and the rent roll`, () => {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.ok(src.includes(`setTenants((${varName} || []).filter(t => !t.archived));`), "archived filter missing");
    assert.ok(!src.includes(`setTenants(${varName} || []);`), "unfiltered tenant list still set");
  });
}
