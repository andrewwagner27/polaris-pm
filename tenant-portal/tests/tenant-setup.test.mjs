import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTenantPhone, passwordIssue, savedSetupStep } from "../src/lib/tenantSetup.js";

test("tenant phone formats normalize to +1 and reject letters and invalid numbers", () => {
  for (const value of ["(614) 555-0192", "614.555.0192", "1 614 555 0192", "+16145550192"]) {
    assert.equal(normalizeTenantPhone(value), "+16145550192");
  }
  for (const value of ["abc", "Jane Doe", "614-555-0192 ext 2", "+6145550192", "2222222222", "0000000000", ""]) {
    assert.equal(normalizeTenantPhone(value), null);
  }
});

test("password guidance rejects repeated patterns and common passwords without claiming server acceptance", () => {
  for (const value of ["11111111", "abcabcabc", "Password123", "short"]) assert.ok(passwordIssue(value));
  assert.equal(passwordIssue("October lake and blue fog"), "");
});

test("setup progress is restored for the matching invitation only", () => {
  const user = { tenant_setup: { tenantId: "tenant-1", step: 2 } };
  assert.equal(savedSetupStep(user, "tenant-1", 5), 2);
  assert.equal(savedSetupStep(user, "tenant-2", 5), 0);
  assert.equal(savedSetupStep({ tenant_setup:{ tenantId:null, step:99 } }, null, 4), 3);
  assert.equal(savedSetupStep({ tenant_setup:{ tenantId:null, step:"2" } }, null, 4), 0);
});
