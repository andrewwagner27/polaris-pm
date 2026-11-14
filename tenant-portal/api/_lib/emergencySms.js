// api/_lib/emergencySms.js
// Emergency SMS to the designated management phone, via Twilio. OFF unless explicitly enabled.
//
// SMS is sent only when ALL of these hold:
//   EMERGENCY_SMS_ENABLED = "true"   — a human decision, made after confirming LANDLORD_PHONE is a
//                                      monitored emergency number and a test SMS to it was received.
//   LANDLORD_PHONE                   — E.164 (+15551234567). The only destination; never caller-supplied.
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
// Anything else → { status: "disabled" } or { status: "not_configured", missing: [...] }, and nothing is sent.
//
// Twilio accepting a message is NOT delivery. A 2xx is recorded as status "accepted" with Twilio's own
// message status (queued/accepted/sending); nothing here ever reports "delivered".
// Never throws. Secrets are never logged or returned.

import { isNonProductionDeployment } from "./deployEnv.js";
/* global Buffer */
const E164 = /^\+[1-9]\d{7,14}$/;

export function emergencySmsConfig(env = globalThis.process?.env ?? {}) {
  if (isNonProductionDeployment(env)) return { enabled: false, status: "disabled" };   // never from Preview / dev
  if (String(env.EMERGENCY_SMS_ENABLED || "").trim().toLowerCase() !== "true") return { enabled: false, status: "disabled" };
  const missing = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "LANDLORD_PHONE"].filter((k) => !String(env[k] || "").trim());
  const to = String(env.LANDLORD_PHONE || "").trim();
  if (to && !E164.test(to)) missing.push("LANDLORD_PHONE (not E.164)");
  if (missing.length) return { enabled: false, status: "not_configured", missing };
  return { enabled: true, to, from: String(env.TWILIO_FROM).trim(), sid: String(env.TWILIO_ACCOUNT_SID).trim(), token: String(env.TWILIO_AUTH_TOKEN).trim() };
}

// One line, printable, bounded. Untrusted text (titles, names) never controls anything but the body.
export function smsBody(parts, max = 480) {
  // eslint-disable-next-line no-control-regex -- removing control characters is the purpose
  const s = parts.filter(Boolean).map((p) => String(p).replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim()).join(" — ");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// dryRun: report { status: "ready" } when an SMS WOULD be sent, without contacting Twilio — callers use it
// to decide whether to write a durable "sending" claim first.
export async function sendEmergencySms({ body, env = globalThis.process?.env ?? {}, fetchImpl = globalThis.fetch, timeoutMs = 10000, now = () => new Date().toISOString(), dryRun = false }) {
  const cfg = emergencySmsConfig(env);
  if (!cfg.enabled) return { status: cfg.status, ...(cfg.missing ? { missing: cfg.missing } : {}), at: now() };
  if (dryRun) return { status: "ready", at: now() };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.sid)}/Messages.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + Buffer.from(`${cfg.sid}:${cfg.token}`).toString("base64"),
      },
      body: new URLSearchParams({ To: cfg.to, From: cfg.from, Body: String(body || "").slice(0, 1600) }),
      signal: controller.signal,
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) return { status: "failed", http_status: res.status, error: String(data?.message || `HTTP ${res.status}`).slice(0, 200), at: now() };
    return { status: "accepted", provider_sid: data?.sid ?? null, provider_status: data?.status ?? null, at: now() };
  } catch (err) {
    return { status: "failed", http_status: 0, error: err?.name === "AbortError" ? `timed out after ${timeoutMs} ms` : String(err?.message || err).slice(0, 200), at: now() };
  } finally {
    clearTimeout(timer);
  }
}

export function smsStatusLabel(sms) {
  switch (sms?.status) {
    case "accepted": return "SMS accepted by Twilio (delivery not confirmed)";
    case "failed": return "SMS FAILED";
    case "not_configured": return "SMS not configured";
    case "disabled": return "SMS off";
    default: return "";
  }
}
