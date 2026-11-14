// api/_lib/email.js
// Server-side Resend helper for every Vercel API email.
//
// ENV: RESEND_API_KEY. Recipients for management mail come from ./recipients.js, never from here.
// Sender: one identity for all Vercel mail, FROM below. (Supabase Edge Functions use
// notifications@getmodusam.com; see docs/comms-remediation/README.md.)
//
// Every attempt is classified into an OUTCOME, following Resend's documented idempotency rules
// (https://resend.com/docs/dashboard/emails/idempotency-keys — keys are kept 24 h):
//   sent        2xx with an email id. The only outcome that counts as success.
//   rejected    a definite refusal that retrying can't fix (missing key, bad recipient, 4xx validation).
//   retryable   429 / 5xx: the provider reported an error; a retry with the SAME key and payload is safe.
//   ambiguous   network error or timeout: the request may or may not have been accepted. Retrying with
//               the same key and payload is safe — if the first was accepted, Resend returns the original
//               response (evidence of sending) instead of sending again.
//   in_progress 409 concurrent_idempotent_requests: another request with this key is still running.
//               Documented as safe to retry later.
//   key_used    409 invalid_idempotent_request: this key was already used with a DIFFERENT payload.
//               Another request owns it; whether that one was delivered is not known here.
//
// Rule: one idempotency key ⇔ one payload. Callers must replay a stored payload (escalations) or put a
// payload hash in the key (payloadKey below); sendEmailReliably never changes the payload between attempts.

import { previewEmailCheck } from "./deployEnv.js";
import crypto from "node:crypto";
import { cleanSubject, parseEmailList } from "../../src/lib/emailSafety.js";

export const FROM = "Modus Property Management <noreply@getmodusam.com>";

export function normalizeRecipients(to) {
  const list = Array.isArray(to) ? to : [to];
  return list.map(e => String(e || "").trim()).filter(Boolean);
}

const DEFAULT_TIMEOUT_MS = 10000;

// The exact JSON body sent to Resend for these arguments (used for sending and for payload hashing).
export function resendBody({ to, subject, html, text, replyTo }) {
  const { valid } = parseEmailList(normalizeRecipients(to));
  const reply = replyTo ? parseEmailList(replyTo).valid : [];
  return { from: FROM, to: valid, subject: cleanSubject(subject, 200), html, ...(text ? { text } : {}), ...(reply.length ? { reply_to: reply } : {}) };
}

// "<base>:<first 16 hex of sha256(payload)>": a key that can only ever be used with this exact payload.
export function payloadKey(base, args) {
  const h = crypto.createHash("sha256").update(JSON.stringify(resendBody(args))).digest("hex").slice(0, 16);
  return `${base}:${h}`;
}

// One attempt. Returns { ok, outcome, status, data, error }. Never throws.
export async function sendEmail({ to, subject, html, text, replyTo, idempotencyKey, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!process.env.RESEND_API_KEY) return { ok: false, outcome: "rejected", status: 0, data: null, error: "RESEND_API_KEY is not configured" };
  const { invalid } = parseEmailList(normalizeRecipients(to));
  const body = resendBody({ to, subject, html, text, replyTo });
  if (invalid.length || !body.to.length) return { ok: false, outcome: "rejected", status: 0, data: null, error: "invalid or missing recipient" };
  if (!body.subject || !html) return { ok: false, outcome: "rejected", status: 0, data: null, error: "subject and html are required" };
  // Preview / development deployments may only email allow-listed dummy addresses (api/_lib/deployEnv.js).
  const preview = previewEmailCheck(body.to);
  if (!preview.ok) return { ok: false, outcome: "rejected", status: 0, data: null, error: preview.error };

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
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    const s = response.status;
    if (response.ok && data?.id) return { ok: true, outcome: "sent", status: s, data };
    if (response.ok) return { ok: false, outcome: "ambiguous", status: s, data, error: "2xx without an email id" };
    const error = String(data?.message || data?.error || `HTTP ${s}`).slice(0, 300);
    if (s === 409 && data?.name === "concurrent_idempotent_requests") return { ok: false, outcome: "in_progress", status: s, data, error };
    if (s === 409 && data?.name === "invalid_idempotent_request") return { ok: false, outcome: "key_used", status: s, data, error };
    if (s === 429 || s >= 500) return { ok: false, outcome: "retryable", status: s, data, error };
    return { ok: false, outcome: "rejected", status: s, data, error };
  } catch (err) {
    const error = err?.name === "AbortError" ? `timed out after ${timeoutMs} ms` : String(err?.message || err);
    return { ok: false, outcome: "ambiguous", status: 0, data: null, error };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => (ms ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

// Up to 3 attempts with the same key and the same payload. Final result:
//   { ok: true,  result: "sent",        ... }  provider returned an email id (on any attempt)
//   { ok: false, result: "failed",      ... }  provider refused, or kept failing with errors it reported
//   { ok: false, result: "unconfirmed", ... }  delivery may have happened but there is no evidence either way
//   { ok: false, result: "duplicate",   ... }  the key belongs to another request (409 invalid_idempotent_request)
// Without an idempotency key nothing is retried (a retry could send twice).
export const isTransient = (r) => ["retryable", "ambiguous", "in_progress"].includes(r?.outcome);
export async function sendEmailReliably(args, { send = sendEmail, retryDelayMs = 750, maxAttempts = 3 } = {}) {
  let r, ambiguousSeen = false, attempts = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    r = await send(args);
    if (r?.ok) return { ...r, result: "sent", attempts: attempt };
    if (r?.outcome === "ambiguous" || r?.outcome === "in_progress") ambiguousSeen = true;
    if (r?.outcome === "key_used") return { ...r, result: "duplicate", attempts: attempt };
    if (!args?.idempotencyKey || !isTransient(r) || attempt === maxAttempts) break;
    await sleep(retryDelayMs * attempt);
  }
  // A definite provider error after an earlier attempt that may have been accepted is still uncertain.
  const result = ambiguousSeen || r?.outcome === "ambiguous" || r?.outcome === "in_progress" ? "unconfirmed" : "failed";
  return { ...r, result, attempts };
}
