// supabase/functions/_shared/security.ts
// Shared auth / CORS / crypto helpers for Edge Functions.
// The _shared folder is bundled into each function that imports it; it is not deployed on its own.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//      ALLOWED_ORIGINS (optional, comma-separated), CRON_SECRET (optional)

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── CORS ──────────────────────────────────────────────────────────────────
const DEFAULT_ORIGINS = [
  "https://www.getmodusam.com",
  "https://getmodusam.com",
  "http://localhost:5173",
  "http://localhost:4173",
];

function allowedOrigins(): string[] {
  const env = Deno.env.get("ALLOWED_ORIGINS");
  return env ? env.split(",").map((o) => o.trim()).filter(Boolean) : DEFAULT_ORIGINS;
}

export function isAllowedOrigin(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return allowedOrigins().includes(new URL(url).origin);
  } catch {
    return false;
  }
}

// Reflects the request Origin only when it is on the allowlist.
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (allowedOrigins().includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

// ── Clients & callers ─────────────────────────────────────────────────────
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export function bearerToken(req: Request): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") || "");
  return match ? match[1].trim() : null;
}

export function isServiceRoleRequest(req: Request): boolean {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = bearerToken(req);
  return !!key && !!token && timingSafeEqual(token, key);
}

export type Caller = {
  serviceRole: boolean;
  user: { id: string; email?: string } | null;
  role: string | null; // profiles.role
};

// Resolves the caller from the Authorization header.
// Returns null for missing/invalid tokens and for the public anon key.
export async function getCaller(req: Request, admin: SupabaseClient): Promise<Caller | null> {
  if (isServiceRoleRequest(req)) return { serviceRole: true, user: null, role: "service_role" };
  const token = bearerToken(req);
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  return { serviceRole: false, user: { id: data.user.id, email: data.user.email }, role: profile?.role ?? null };
}

export const isLandlord = (c: Caller | null) => !!c && (c.serviceRole || c.role === "landlord");

// Scheduled jobs: accept the service-role key as Bearer token, or an
// "x-cron-secret" header matching CRON_SECRET.
export function isCronRequest(req: Request): boolean {
  if (isServiceRoleRequest(req)) return true;
  const secret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret") || "";
  return !!secret && timingSafeEqual(provided, secret);
}

// ── Secure random ─────────────────────────────────────────────────────────
const TOKEN_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function randomIntBelow(max: number): number {
  // Rejection sampling avoids modulo bias.
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

export function generateToken(length = 24): string {
  let token = "";
  for (let i = 0; i < length; i++) token += TOKEN_ALPHABET[randomIntBelow(TOKEN_ALPHABET.length)];
  return token;
}

export function generatePin(): string {
  return String(1000 + randomIntBelow(9000));
}

// ── Stripe webhook signature (v1 scheme, HMAC-SHA256) ─────────────────────
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!header) return false;
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === "t") timestamp = v;
    else if (k === "v1") signatures.push(v);
  }
  if (!timestamp || signatures.length === 0) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${payload}`)));
  const expected = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
  return signatures.some((s) => timingSafeEqual(s, expected));
}
