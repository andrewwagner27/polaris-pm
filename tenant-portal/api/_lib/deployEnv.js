// api/_lib/deployEnv.js
// Keeps Vercel Preview (and `vercel dev`) deployments away from production side effects.
//
// Today Preview receives the same secrets as Production (service-role key, Stripe, Twilio, OpenAI, Resend). Until
// Preview has its own Supabase project and test keys (docs/launch/preview-isolation.md), these guards fail closed:
//   - production database: every API route answers 503 in Preview if SUPABASE_URL is the production project,
//     unless PREVIEW_ALLOW_PRODUCTION_DB = "true" is set for Preview on purpose;
//   - live Stripe key (sk_live_…): always refused outside Production — no override;
//   - email: outside Production, only to addresses listed in PREVIEW_EMAIL_ALLOWLIST (comma-separated);
//   - SMS: never outside Production.
// Production is detected only by Vercel's VERCEL_ENV. The guards act ONLY when VERCEL_ENV is explicitly "preview" or
// "development"; if it is missing (tests, scripts) behaviour is unchanged, so a misread can never block Production.

export const PRODUCTION_PROJECT_REF = "ynbxdbwxdydbpkzaffte";

const envOf = (env) => env ?? globalThis.process?.env ?? {};

export function deploymentEnv(env) {
  const v = String(envOf(env).VERCEL_ENV || "").trim().toLowerCase();
  return v === "production" || v === "preview" || v === "development" ? v : "unknown";
}
export const isNonProductionDeployment = (env) => ["preview", "development"].includes(deploymentEnv(env));

export function supabaseProjectRef(url) {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co(?:\/|$)/i.exec(String(url || "").trim());
  return m ? m[1].toLowerCase() : null;
}

// → { blocked: boolean, reasons: string[] }
export function previewGuard(env) {
  const e = envOf(env);
  if (!isNonProductionDeployment(e)) return { blocked: false, reasons: [] };
  const reasons = [];
  if (supabaseProjectRef(e.SUPABASE_URL || e.VITE_SUPABASE_URL) === PRODUCTION_PROJECT_REF
      && String(e.PREVIEW_ALLOW_PRODUCTION_DB || "").trim().toLowerCase() !== "true") reasons.push("production_database");
  if (/^(sk|rk)_live_/i.test(String(e.STRIPE_SECRET_KEY || "").trim())) reasons.push("live_stripe_key");
  return { blocked: reasons.length > 0, reasons };
}

// For API handlers: answers 503 and returns true when this deployment must not run. Never logs secret values.
export function rejectIfIsolated(res, env) {
  const g = previewGuard(env);
  if (!g.blocked) return false;
  console.error(`[preview-isolation] refused in ${deploymentEnv(env)}: ${g.reasons.join(", ")}`);
  res.status(503).json({ error: "This preview deployment is not connected to production data or payments.", reasons: g.reasons });
  return true;
}

// Email outside Production: only to allow-listed (dummy) addresses.
export function previewEmailCheck(recipients, env) {
  const e = envOf(env);
  if (!isNonProductionDeployment(e)) return { ok: true };
  const allow = new Set(String(e.PREVIEW_EMAIL_ALLOWLIST || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const list = (Array.isArray(recipients) ? recipients : [recipients]).map((r) => String(r || "").trim().toLowerCase()).filter(Boolean);
  const blocked = list.filter((r) => !allow.has(r));
  return blocked.length ? { ok: false, error: `Preview deployment: ${blocked.length} recipient(s) not on PREVIEW_EMAIL_ALLOWLIST` } : { ok: true };
}
