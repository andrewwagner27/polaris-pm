// src/lib/tenantClaim.js
// The only way the onboarding page links a portal login to a tenant record.
//
// Authorization happens before any write:
//   1. a signed-in user is required;
//   2. a management (landlord) account is refused. Landlords may update any tenant row, so the database
//      would not stop them; if the role can't be read, the account is treated as management;
//   3. the claim only touches an unclaimed row (user_id IS NULL) and only sets user_id. For tenants the database
//      (RLS + protect_tenant_columns) also requires the record's email or invite_email to equal the account's
//      verified email, and refuses reassigning a claimed record.
//   4. success is read back, never assumed: an RLS mismatch updates 0 rows without an error.
// Callers write anything else (name, phone, emergency contact) only after { ok: true }.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CLAIM_MESSAGES = Object.freeze({
  signin: "Your session has expired. Please sign in again.",
  invalid: "This invitation link is incomplete. Ask Modus management to send a new invitation.",
  management: "You are signed in as Modus management. Tenant invitations can only be completed from the tenant's own account.",
  mismatch: "This invitation doesn't match the email you signed in with. Ask Modus management to resend it to the right address.",
});

export async function isManagementAccount(client, userId) {
  try {
    const { data, error } = await client.from("profiles").select("role").eq("id", userId).maybeSingle();
    return Boolean(error) || data?.role === "landlord";
  } catch {
    return true;
  }
}

export async function claimTenantRecord(client, tenantId) {
  if (!tenantId || !UUID.test(String(tenantId))) return { ok: false, reason: "invalid" };
  let user;
  try { ({ data: { user } } = await client.auth.getUser()); } catch { /* treated as signed out */ }
  if (!user?.id) return { ok: false, reason: "signin" };
  if (await isManagementAccount(client, user.id)) return { ok: false, reason: "management" };

  const { data: claimed, error } = await client.from("tenants")
    .update({ user_id: user.id })
    .eq("id", tenantId)
    .is("user_id", null)
    .select("id");
  if (error) return { ok: false, reason: "mismatch" };
  if (Array.isArray(claimed) && claimed.some(r => r?.id === tenantId)) return { ok: true, tenantId, userId: user.id };

  // Nothing was unclaimed: fine only if this record is already linked to this same account.
  const { data: mine } = await client.from("tenants").select("id").eq("id", tenantId).eq("user_id", user.id).maybeSingle();
  return mine ? { ok: true, tenantId, userId: user.id } : { ok: false, reason: "mismatch" };
}
