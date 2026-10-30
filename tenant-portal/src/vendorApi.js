// vendorApi.js — browser client for the vendor portal.
// Vendors have no Supabase session; every read/write goes through /api/vendor-ticket,
// authorized by the signed session returned from /api/vendor-verify-pin.
// The session lives in sessionStorage (per tab, cleared when the tab closes). Holding it
// in the browser is not authorization — the server verifies it on every call.

const sessionKey = (token) => `vendor_session:${token}`;

export class VendorAuthError extends Error {}

export function getVendorSession(token) {
  try { return sessionStorage.getItem(sessionKey(token)); } catch { return null; }
}

function setVendorSession(token, session) {
  try { sessionStorage.setItem(sessionKey(token), session); } catch { /* storage unavailable */ }
}

export function clearVendorSession(token) {
  try { sessionStorage.removeItem(sessionKey(token)); } catch { /* storage unavailable */ }
}

// Removes keys written by the previous localStorage-based flow.
export function clearLegacyVendorStorage() {
  try {
    localStorage.removeItem("vendor_token");
    localStorage.removeItem("vendor_ticket_id");
  } catch { /* storage unavailable */ }
}

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { res, data };
}

// Pre-PIN check: is this link valid, and what job is it for? Returns { valid, title }.
export async function vendorPreview(token) {
  const { res, data } = await postJson("/api/vendor-ticket", { action: "preview", token });
  return res.ok ? data : { valid: false };
}

// Verifies the PIN server-side and stores the returned session.
export async function vendorVerifyPin(token, pin) {
  const { res, data } = await postJson("/api/vendor-verify-pin", { token, pin });
  if (!res.ok || !data?.ok || !data.session) return null;
  setVendorSession(token, data.session);
  return data;
}

// Calls a session-authorized action. Throws VendorAuthError when the session is missing,
// invalid or expired (caller should send the vendor back to the PIN screen).
export async function vendorCall(token, action, fields = {}) {
  const session = getVendorSession(token);
  if (!session) throw new VendorAuthError("No vendor session");
  const { res, data } = await postJson("/api/vendor-ticket", { action, ...fields }, { "X-Vendor-Session": session });
  if (res.status === 401) { clearVendorSession(token); throw new VendorAuthError(data?.error || "Session expired"); }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// Uploads a file via a server-issued signed upload URL. kind: "photo" | "quote" | "invoice".
// Returns the stored object path.
export async function uploadVendorFile(token, kind, file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const { path, signed_url } = await vendorCall(token, "upload_url", { kind, ext });
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", file);
  const res = await fetch(signed_url, { method: "PUT", headers: { "x-upsert": "false" }, body: form });
  if (!res.ok) throw new Error("Upload failed");
  return path;
}
