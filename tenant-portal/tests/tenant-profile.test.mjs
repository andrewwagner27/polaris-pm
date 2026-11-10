// tests/tenant-profile.test.mjs
// Run: npm test   (node --test tests/)
// Regression: the tenant Home "Lease & Docs" tile reads tenant.lease_document_url, but the
// normalized tenant object built by useTenant() left that field only inside `raw`, so the tile
// never showed "View lease" and never opened the lease. Pure module; no network, no database.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { buildTenantProfile } = await import("../src/tenantProfile.js");

const authUser = { id: "user-1", email: "tenant@test.invalid", user_metadata: {} };
const tenantRow = {
  id: "tenant-1", unit_id: "unit-1", name: "Tenant One", phone: "555-0100",
  lease_start: "2026-09-01", lease_end: "2027-02-24", security_deposit: 0,
  lease_document_url: "tenant-1/lease-1762729000000.pdf",
};
const unitRow = { unit_number: "2", rent_amount: 1345, properties: { name: "Prop", address: "1 Main St", city: "Town", state: "OH" } };
const build = (over = {}) => buildTenantProfile({
  authUser, tenantData: tenantRow, unitData: unitRow, role: "tenant",
  payments: [], maintenance: [], recurringCharges: [], ...over,
});

describe("buildTenantProfile", () => {
  test("exposes lease_document_url from the tenant row", () => {
    assert.equal(build().lease_document_url, "tenant-1/lease-1762729000000.pdf");
  });

  test("lease_document_url is null when no lease is on file or there is no tenant row", () => {
    assert.equal(build({ tenantData: { ...tenantRow, lease_document_url: null } }).lease_document_url, null);
    assert.equal(build({ tenantData: { ...tenantRow, lease_document_url: "" } }).lease_document_url, null);
    assert.equal(build({ tenantData: null, unitData: null }).lease_document_url, null);
  });

  test("keeps the existing fields unchanged", () => {
    const t = build({ payments: [{ id: "p" }], maintenance: [{ id: "m" }], recurringCharges: [{ id: "c" }] });
    assert.equal(t.id, "tenant-1");
    assert.equal(t.user_id, "user-1");
    assert.equal(t.unit_id, "unit-1");
    assert.equal(t.name, "Tenant One");
    assert.equal(t.email, "tenant@test.invalid");
    assert.equal(t.phone, "555-0100");
    assert.equal(t.unit, "2");
    assert.equal(t.property, "Prop");
    assert.equal(t.address, "1 Main St, Town OH");
    assert.equal(t.rent, 1345);
    assert.equal(t.leaseStart, "2026-09-01");
    assert.equal(t.leaseEnd, "2027-02-24");
    assert.equal(t.security_deposit, 0);
    assert.deepEqual(t.payments, [{ id: "p" }]);
    assert.deepEqual(t.maintenance, [{ id: "m" }]);
    assert.deepEqual(t.recurringCharges, [{ id: "c" }]);
    assert.equal(t.raw, tenantRow);
    assert.equal(t.role, "tenant");
  });

  test("falls back as before when there is no tenant row", () => {
    const t = build({ tenantData: null, unitData: null, payments: null, maintenance: undefined, recurringCharges: null });
    assert.equal(t.id, "user-1");
    assert.equal(t.name, "Tenant");
    assert.equal(t.unit, "—");
    assert.equal(t.address, "—");
    assert.deepEqual([t.payments, t.maintenance, t.recurringCharges], [[], [], []]);
  });
});

describe("HomeDashboard lease tile", () => {
  const src = readFileSync(new URL("../src/HomeDashboard.jsx", import.meta.url), "utf8");

  test("reads the field the profile now provides", () => {
    assert.match(src, /tenant\?\.lease_document_url/);
  });

  test("opens the lease only through a signed URL for the private lease-documents bucket", () => {
    assert.match(src, /getSignedStorageUrl\("lease-documents", tenant\.lease_document_url\)/);
    assert.doesNotMatch(src, /getPublicUrl/);
  });
});
