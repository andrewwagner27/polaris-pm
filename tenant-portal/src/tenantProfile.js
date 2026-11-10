// Builds the normalized tenant object that useTenant() exposes to tenant screens.
// Pure (no Supabase or React imports) so it can be unit-tested with node --test.
//
// lease_document_url is the lease-documents object PATH stored on the tenant row (a legacy
// row may hold a full public URL). Screens must turn it into a short-lived signed URL with
// getSignedStorageUrl("lease-documents", ...); never link to it directly.
export function buildTenantProfile({ authUser, tenantData, unitData, role, payments, maintenance, recurringCharges }) {
  const propertyData = unitData?.properties;
  return {
    id:               tenantData?.id || authUser.id,
    user_id:          authUser.id,
    unit_id:          tenantData?.unit_id || null,
    name:             tenantData?.name     || authUser.user_metadata?.full_name || "Tenant",
    email:            authUser.email,
    phone:            tenantData?.phone    || authUser.user_metadata?.phone || "—",
    unit:             unitData?.unit_number || authUser.user_metadata?.unit_number || "—",
    property:         propertyData?.name   || "—",
    address:          propertyData
      ? `${propertyData.address}, ${propertyData.city} ${propertyData.state}`
      : "—",
    rent:             unitData?.rent_amount || 0,
    leaseStart:       tenantData?.lease_start || null,
    leaseEnd:         tenantData?.lease_end   || null,
    lease_document_url: tenantData?.lease_document_url || null,
    security_deposit: tenantData?.security_deposit ?? null,
    payments:         payments         || [],
    maintenance:      maintenance      || [],
    recurringCharges: recurringCharges || [],
    raw:              tenantData,
    role,
  };
}
