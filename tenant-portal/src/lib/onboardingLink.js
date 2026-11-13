// src/lib/onboardingLink.js
// What the tenant onboarding page should do with the invitation link it was opened from.
// Supabase Auth redirects an expired, already-used or invalid invitation back with an error in the URL fragment
// (e.g. #error=access_denied&error_code=otp_expired&error_description=...). A valid link leaves a signed-in session.
//
// → "ready"    a session exists: continue onboarding
//   "expired"  the link expired or was already used: ask management for a new invitation, or sign in / reset password
//   "invalid"  any other link error
//   "signin"   no session and no error (e.g. the page was opened directly): sign in first
export function inviteLinkState({ hash = "", search = "", hasSession = false } = {}) {
  const params = new URLSearchParams(String(hash).replace(/^#/, ""));
  const query = new URLSearchParams(String(search).replace(/^\?/, ""));
  const code = params.get("error_code") || query.get("error_code") || "";
  const err = params.get("error") || query.get("error") || "";
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
  signin: {
    title: "Please sign in to continue",
    body: "Open the invitation email from Modus and use its button to start, or sign in if you already created a password.",
  },
});
