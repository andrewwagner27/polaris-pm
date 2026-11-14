// src/lib/onboardingLink.js
// What the tenant onboarding page should do with the invitation link it was opened from.
// Supabase Auth redirects an expired, already-used or invalid invitation back with an error in the URL fragment
// (e.g. #error=access_denied&error_code=otp_expired&error_description=...). A valid link leaves a signed-in session.
//
// → "ready"    a session exists: continue onboarding
//   "expired"  the link expired or was already used: ask management for a new invitation, or sign in / reset password
//   "invalid"  any other link error
//   "signin"   no session and no error (e.g. the page was opened directly): sign in first
//   "management" the signed-in account is a management (landlord) account: never run tenant onboarding with it.
//              (Landlords may update any tenant row, so the invitation claim would link the landlord to the tenant.)
export function inviteLinkState({ hash = "", search = "", hasSession = false, isManagement = false } = {}) {
  const params = new URLSearchParams(String(hash).replace(/^#/, ""));
  const query = new URLSearchParams(String(search).replace(/^\?/, ""));
  const code = params.get("error_code") || query.get("error_code") || "";
  const err = params.get("error") || query.get("error") || "";
  if (hasSession && isManagement) return { state: "management" };
  if (hasSession && !err && !code) return { state: "ready" };
  if (/otp_expired|expired/i.test(code) || /expired/i.test(params.get("error_description") || query.get("error_description") || "")) {
    return { state: "expired" };
  }
  if (err || code) return { state: "invalid", code: code || err };
  return { state: hasSession ? "ready" : "signin" };
}

export const LINK_MESSAGES = Object.freeze({
  expired: {
    title: "This invitation link has expired",
    body: "Invitation links work once and expire after a short time. Ask Modus management to send you a new invitation. If you already created a password, sign in instead.",
  },
  invalid: {
    title: "This invitation link didn't work",
    body: "The link may have been copied incompletely or already used. Ask Modus management to send you a new invitation, or sign in if you already have a password.",
  },
  management: {
    title: "You are signed in as Modus management",
    body: "Tenant invitations can only be completed from the tenant's own account. Sign out of management first, or open the invitation link in a private browser window.",
  },
  signin: {
    title: "Please sign in to continue",
    body: "Open the invitation email from Modus and use its button to start, or sign in if you already created a password.",
  },
});

// Any Supabase auth link (invitation, password reset, magic link) that failed comes back with an error in the URL
// fragment or query. → "expired" | "invalid" | null (no error).
export function authLinkError({ hash = "", search = "" } = {}) {
  const params = new URLSearchParams(String(hash).replace(/^#/, ""));
  const query = new URLSearchParams(String(search).replace(/^\?/, ""));
  const code = params.get("error_code") || query.get("error_code") || "";
  const err = params.get("error") || query.get("error") || "";
  const desc = params.get("error_description") || query.get("error_description") || "";
  if (!code && !err) return null;
  return /otp_expired|expired/i.test(code) || /expired/i.test(desc) ? "expired" : "invalid";
}

// The password-reset page: a link error wins over any existing session (the link the person just opened failed,
// even if some other account is signed in). Without a session there is nothing to set a password on.
// → "ready" | "expired" | "invalid" | "missing"
export function resetLinkState({ hash = "", search = "", hasSession = false } = {}) {
  const e = authLinkError({ hash, search });
  if (e) return e;
  return hasSession ? "ready" : "missing";
}

// Where a failed auth link that landed on another page (e.g. the home page) should go.
export const LINK_ERROR_PATH = "/link-error";
const HANDLES_OWN_LINK_ERRORS = new Set(["/onboarding", "/reset-password", LINK_ERROR_PATH]);
export function linkErrorRedirect({ pathname = "/", hash = "", search = "" } = {}) {
  if (HANDLES_OWN_LINK_ERRORS.has(pathname)) return null;
  const e = authLinkError({ hash, search });
  return e ? `${LINK_ERROR_PATH}?reason=${e}` : null;
}

export const AUTH_LINK_MESSAGES = Object.freeze({
  expired: {
    title: "This link has expired",
    body: "Links in Modus emails work once and expire after about an hour. If you were resetting your password, request a new reset link. If this was an invitation, ask Modus management to send a new one — or sign in if you already set a password.",
  },
  invalid: {
    title: "This link didn't work",
    body: "The link may have been copied incompletely or already used. Request a new password-reset link, ask Modus management for a new invitation, or sign in if you already have a password.",
  },
  missing: {
    title: "Open the link from your email",
    body: "To set a new password, open the reset link from your Modus email on this device. If the link is old, request a new one.",
  },
});
