// api/_lib/email.js
// Server-side Resend helper for every Vercel API email.
//
// ENV: RESEND_API_KEY. Recipients for management mail come from ./recipients.js, never from here.
//
// Sender: one identity for all Vercel mail, FROM below. (Supabase Edge Functions use
// notifications@getmodusam.com; see docs/comms-remediation/README.md.)

import { cleanSubject, parseEmailList } from "../../src/lib/emailSafety.js";

export const FROM = "Modus Property Management <noreply@getmodusam.com>";

export function normalizeRecipients(to) {
  const list = Array.isArray(to) ? to : [to];
  return list.map(e => String(e || "").trim()).filter(Boolean);
}

const DEFAULT_TIMEOUT_MS = 10000;

// Returns { ok, status, data, error? }. Never throws: a missing key, invalid recipients, network errors,
// timeouts and non-JSON responses all come back as ok:false. idempotencyKey is forwarded to Resend as
// Idempotency-Key, so a repeated call with the same key cannot deliver twice.
export async function sendEmail({ to, subject, html, text, replyTo, idempotencyKey, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!process.env.RESEND_API_KEY) return { ok: false, status: 0, data: null, error: "RESEND_API_KEY is not configured" };
  const { valid, invalid } = parseEmailList(normalizeRecipients(to));
  if (invalid.length || !valid.length) return { ok: false, status: 0, data: null, error: "invalid or missing recipient" };
  const cleanedSubject = cleanSubject(subject, 200);
  if (!cleanedSubject || !html) return { ok: false, status: 0, data: null, error: "subject and html are required" };
  const reply = replyTo ? parseEmailList(replyTo).valid : [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": String(idempotencyKey).slice(0, 256) } : {}),
      },
      body: JSON.stringify({ from: FROM, to: valid, subject: cleanedSubject, html, ...(text ? { text } : {}), ...(reply.length ? { reply_to: reply } : {}) }),
      signal: controller.signal,
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    return { ok: response.ok, status: response.status, data, ...(response.ok ? {} : { error: data?.message || data?.error || `HTTP ${response.status}` }) };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err?.name === "AbortError" ? `timed out after ${timeoutMs} ms` : String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

// One retry for transient failures (network, timeout, 429, 5xx), and only when an idempotency key makes
// the retry safe: Resend delivers at most once per key, so retrying after an unknown outcome can't duplicate.
const PERMANENT = /not configured|invalid or missing recipient|required/;
export const isTransient = (r) => !r?.ok && (r?.status === 0 || r?.status === 429 || r?.status >= 500) && !PERMANENT.test(String(r?.error || ""));
export async function sendEmailReliably(args, { send = sendEmail, retryDelayMs = 750 } = {}) {
  const first = await send(args);
  if (first?.ok || !args?.idempotencyKey || !isTransient(first)) return { ...first, attempts: 1 };
  if (retryDelayMs) await new Promise((r) => setTimeout(r, retryDelayMs));
  const second = await send(args);
  return { ...second, attempts: 2 };
}
