// api/_lib/vendorSession.js
// Short-lived, HMAC-signed vendor sessions issued after a successful PIN check.
//
// Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, VENDOR_SESSION_SECRET))
// Payload: { v: 1, tid: <ticket id>, th: <sha256(vendor_token) hex, first 32>, iat, exp }  (seconds)
//
// The session is bound to one ticket (tid) and to the vendor token that was current when it
// was issued (th). Reassigning the vendor issues a new token, which invalidates old sessions.
//
// ENV: VENDOR_SESSION_SECRET (required, >= 32 chars). Missing/short secret → every call fails closed.

import crypto from "node:crypto";

export const VENDOR_SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours
const MIN_SECRET_LENGTH = 32;

export class VendorSessionConfigError extends Error {}

function secret() {
  const s = process.env.VENDOR_SESSION_SECRET;
  if (!s || s.length < MIN_SECRET_LENGTH) {
    throw new VendorSessionConfigError("VENDOR_SESSION_SECRET is not configured");
  }
  return s;
}

export function isVendorSessionConfigured() {
  const s = process.env.VENDOR_SESSION_SECRET;
  return !!s && s.length >= MIN_SECRET_LENGTH;
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");

function sign(payloadB64) {
  return b64url(crypto.createHmac("sha256", secret()).update(payloadB64).digest());
}

export function hashVendorToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 32);
}

// Issues a session for ticketId. Expiry is capped at the vendor link's own expiry.
export function createVendorSession({ ticketId, vendorToken, tokenExpiresAt, now = Date.now() }) {
  const iat = Math.floor(now / 1000);
  let exp = iat + VENDOR_SESSION_TTL_SECONDS;
  const linkExp = tokenExpiresAt ? Math.floor(new Date(tokenExpiresAt).getTime() / 1000) : NaN;
  if (Number.isFinite(linkExp)) exp = Math.min(exp, linkExp);

  const payload = b64url(JSON.stringify({ v: 1, tid: ticketId, th: hashVendorToken(vendorToken), iat, exp }));
  return { session: `${payload}.${sign(payload)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

// Returns { ok: true, claims } or { ok: false, reason } — never throws for bad input.
// Throws VendorSessionConfigError if the secret is missing (caller must fail closed).
export function verifyVendorSession(session, { now = Date.now() } = {}) {
  const key = secret(); // throws first: a missing secret must never validate anything
  if (typeof session !== "string" || session.length > 2048) return { ok: false, reason: "malformed" };
  const parts = session.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };

  const expected = Buffer.from(crypto.createHmac("sha256", key).update(parts[0]).digest());
  let provided;
  try { provided = Buffer.from(parts[1], "base64url"); } catch { return { ok: false, reason: "malformed" }; }
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "bad_signature" };
  }

  let claims;
  try { claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch { return { ok: false, reason: "malformed" }; }
  if (claims?.v !== 1 || typeof claims.tid !== "string" || typeof claims.th !== "string" || !Number.isFinite(claims.exp)) {
    return { ok: false, reason: "malformed" };
  }
  if (Math.floor(now / 1000) >= claims.exp) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}
