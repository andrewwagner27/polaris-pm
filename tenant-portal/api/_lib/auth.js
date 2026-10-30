// api/_lib/auth.js
// Shared auth helpers for Vercel API routes.
// Files under api/_lib are not exposed as endpoints (underscore prefix).
//
// ENV: SUPABASE_URL (falls back to VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

// Returns { user, role } for a valid Supabase session JWT, or null.
// role comes from profiles.role (the same source ProtectedLandlordRoute uses).
export async function getCaller(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  return { user: data.user, role: profile?.role || null };
}

export async function requireCaller(req, res) {
  const caller = await getCaller(req);
  if (!caller) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return caller;
}

export const isLandlord = (caller) => caller?.role === "landlord";

// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set.
export function hasCronSecret(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return timingSafeEqualStr(bearerToken(req) || "", secret);
}

// Cryptographically secure helpers for vendor access links.
const TOKEN_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function generateToken(length = 24) {
  let token = "";
  for (let i = 0; i < length; i++) token += TOKEN_ALPHABET[crypto.randomInt(TOKEN_ALPHABET.length)];
  return token;
}

export function generatePin() {
  return String(crypto.randomInt(1000, 10000));
}
