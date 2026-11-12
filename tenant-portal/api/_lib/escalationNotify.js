// api/_lib/escalationNotify.js
// Release B: email management whenever the tenant AI records an escalation (including emergencies),
// exactly once per escalation, and record the outcome on that escalation's ai_routing_logs row.
//
// - Recipient: api/_lib/recipients.js, purpose "escalation": ESCALATION_NOTIFY_EMAILS, else LANDLORD_EMAIL.
//   Nothing is hard-coded: with neither configured nothing is sent and the outcome is recorded as
//   failed (MANAGEMENT_RECIPIENT_NOT_CONFIGURED), so the Agent Center and the recap show it.
// - Idempotency: one notification per tenant message (key "escalation:<message_id>"). A retried request
//   creates a second routing-log row; it is marked "duplicate" and nothing is sent. The same key is sent
//   to Resend as Idempotency-Key, which also absorbs concurrent retries and makes the single automatic
//   retry of a transient send failure safe.
// - Emergencies (tier TIER1_EMERGENCY) also try the emergency SMS (api/_lib/emergencySms.js), which is off
//   unless explicitly enabled. Its outcome is recorded as notify.sms; "accepted" never means delivered.
// - Outcome: raw_openai_response.notify on the routing-log row (no migration):
//   { status: "pending" | "sent" | "failed" | "duplicate", key, recipients, provider_id?, error?, attempts?, sms?, at }.
// - If the routing-log row could not be written (log is null) the email is still sent and says the
//   escalation is missing from the Agent Center, so management can act on it from the email.
// - Never throws: a notification failure cannot block the tenant's reply or lose the escalation
//   (the reply, alert and routing log are all written before this runs).
// - Only the escalation just recorded is ever notified; nothing here reads or replays older rows.

import { escapeHtml as escapeHtmlShared, APP_URL as SHARED_APP_URL } from "../../src/lib/emailSafety.js";
import { notifyStatusLabel as sharedNotifyStatusLabel, isEscalationRow } from "../../src/lib/notifyStatus.js";
import { managementRecipients as sharedRecipients } from "./recipients.js";
import { sendEmailReliably } from "./email.js";
import { sendEmergencySms, smsBody } from "./emergencySms.js";

export const APP_URL = SHARED_APP_URL;
const ACTIVE_STATUSES = new Set(["pending", "sent"]);

// { ok, recipients, source } or { ok: false, code, error } (see recipients.js).
export function managementRecipients(env = globalThis.process?.env ?? {}) {
  return sharedRecipients(env, { purpose: "escalation" });
}

export const isEmergency = (c) => c?.tier === "TIER1_EMERGENCY";
export const needsNotification = (c) => isEmergency(c) || c?.escalate_to_landlord === true;

export const escapeHtml = escapeHtmlShared;

export function escalationReason(classification, { humanRequested = false } = {}) {
  const c = classification || {};
  const reasons = [];
  if (isEmergency(c)) reasons.push(c.life_safety ? "Emergency reported (Tier 1) — life safety: the tenant was told to call 911" : "Emergency reported (Tier 1)");
  if (humanRequested) reasons.push("Tenant asked to talk to a person");
  if (c.create_incident_log) reasons.push("Complaint or dispute logged for management review");
  if (c.ai_unavailable) reasons.push("The AI could not process this message, so it needs a person to read it");
  if (!reasons.length) reasons.push("The AI could not resolve this and flagged it for management");
  const detail = [c.emergency_kind && String(c.emergency_kind).replace(/_/g, " "), c.category && String(c.category).replace(/_/g, " ").toLowerCase(), c.urgency && `urgency ${String(c.urgency).toLowerCase()}`].filter(Boolean).join(", ");
  return detail ? `${reasons.join("; ")} (${detail})` : reasons.join("; ");
}

export function buildEscalationEmail({ propertyName, unitNumber, tenantName, message, reply, reason, intent, emergency, unrecorded = false }) {
  // eslint-disable-next-line no-control-regex -- removing control characters is the purpose
  const line = (v, max = 80) => String(v ?? "").replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  const where = `${line(propertyName) || "Unknown property"} · Unit ${line(unitNumber, 20) || "?"}`;
  const subject = emergency
    ? `🚨 EMERGENCY — ${where} — ${line(tenantName) || "Tenant"}`
    : `Tenant escalation — ${where} — ${line(tenantName) || "Tenant"}`;
  const agentCenter = `${APP_URL}/landlord/agent`;
  const conversations = `${APP_URL}/landlord/messages`;
  const row = (k, v) => `<tr><td style="padding:6px 0;color:#666;font-size:13px;width:120px;vertical-align:top">${k}</td><td style="padding:6px 0;font-size:13px;color:#111">${v}</td></tr>`;
  const quote = (v, color) => `<blockquote style="margin:0;padding:12px 16px;border-left:4px solid ${color};background:#f7f7f7;color:#222;white-space:pre-wrap">${escapeHtml(v)}</blockquote>`;
  const warning = unrecorded
    ? `<p style="margin:0 0 14px;padding:10px 12px;background:#fdecea;border:1px solid #c0392b;color:#c0392b;font-size:13px;border-radius:6px"><strong>This escalation could not be saved to the Agent Center.</strong> Handle it from this email and the tenant's Messages thread.</p>`
    : "";
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:${emergency ? "#c0392b" : "#7A5C2E"};color:#fff;padding:18px 22px;border-radius:8px 8px 0 0">
    <div style="font-size:11px;letter-spacing:.12em;opacity:.85">MODUS PROPERTY MANAGEMENT</div>
    <div style="font-size:20px;margin-top:4px">${emergency ? "🚨 Emergency — act now" : "A tenant needs a person"}</div>
  </div>
  <div style="border:1px solid #ddd;border-top:none;padding:20px 22px;border-radius:0 0 8px 8px">
    ${warning}
    <table style="border-collapse:collapse;width:100%">
      ${row("Property", escapeHtml(propertyName || "Unknown"))}
      ${row("Unit", escapeHtml(unitNumber || "?"))}
      ${row("Tenant", escapeHtml(tenantName || "Unknown"))}
      ${row("Why", escapeHtml(reason))}
      ${intent ? row("AI summary", escapeHtml(intent)) : ""}
    </table>
    <p style="margin:18px 0 6px;font-weight:bold;font-size:13px">Tenant's message</p>
    ${quote(message, emergency ? "#c0392b" : "#7A5C2E")}
    <p style="margin:18px 0 6px;font-weight:bold;font-size:13px">What the AI assistant replied</p>
    ${quote(reply, "#999")}
    <p style="margin:22px 0 0">
      <a href="${agentCenter}" style="display:inline-block;padding:10px 18px;background:#7A5C2E;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;margin-right:8px">Open Agent Center →</a>
      <a href="${conversations}" style="display:inline-block;padding:10px 18px;background:#333;color:#fff;border-radius:6px;text-decoration:none;font-size:13px">Open Messages →</a>
    </p>
    <p style="margin:16px 0 0;font-size:11px;color:#888">Sign in to see the full conversation. This alert is sent once per tenant message.</p>
  </div>
</div>`;
  const text = [subject, "", unrecorded ? "WARNING: this escalation could not be saved to the Agent Center. Handle it from this email." : null,
    `Property: ${propertyName || "Unknown"}`, `Unit: ${unitNumber || "?"}`, `Tenant: ${tenantName || "Unknown"}`, `Why: ${reason}`,
    intent ? `AI summary: ${intent}` : null, "", "Tenant's message:", String(message ?? ""), "", "What the AI assistant replied:", String(reply ?? ""), "",
    `Agent Center: ${agentCenter}`, `Messages: ${conversations}`].filter((l) => l !== null).join("\n");
  return { subject, html, text };
}

export function notificationKey({ messageId, logId }) {
  if (messageId) return `escalation:${messageId}`;
  if (logId) return `escalation-log:${logId}`;
  return null;
}

async function recordOutcome(db, log, notify) {
  if (!log?.id) return;
  try {
    const base = log.raw_openai_response && typeof log.raw_openai_response === "object" ? log.raw_openai_response : {};
    const merged = { ...base, notify };
    const { error } = await db.from("ai_routing_logs").update({ raw_openai_response: merged }).eq("id", log.id);
    if (error) console.error("[escalation-notify] could not record outcome:", error.message || error);
    else log.raw_openai_response = merged;
  } catch (e) { console.error("[escalation-notify] could not record outcome:", e.message); }
}

// Called once, right after the escalation's routing-log row is written. Never throws.
//   send: (args) => { ok, status, data, error }   (api/_lib/email.js sendEmail)
//   sms:  ({ body, env }) => { status, ... }       (api/_lib/emergencySms.js sendEmergencySms)
export async function notifyEscalation({ db, send, sms = sendEmergencySms, log, tenant, message, reply, classification, messageId, humanRequested = false,
  env = globalThis.process?.env ?? {}, now = () => new Date().toISOString(), retryDelayMs = 750 }) {
  try {
    if (!needsNotification(classification)) return { status: "not_required" };
    const key = notificationKey({ messageId, logId: log?.id });

    // Duplicate protection: another routing-log row for the same tenant message already notified (or is notifying).
    if (messageId) {
      const { data: siblings } = await db.from("ai_routing_logs").select("id, raw_openai_response").eq("message_id", messageId);
      const prior = (siblings || []).find((r) => r.id !== log?.id && ACTIVE_STATUSES.has(r.raw_openai_response?.notify?.status));
      if (prior) {
        const notify = { status: "duplicate", key, duplicate_of: prior.id, at: now() };
        await recordOutcome(db, log, notify);
        return notify;
      }
    }

    const emergency = isEmergency(classification);
    const to = managementRecipients(env);
    let notify;
    if (!to.ok) {
      notify = { status: "failed", key, recipients: [], error: to.code, at: now() };
      console.error("[escalation-notify]", to.error);
    } else {
      const email = buildEscalationEmail({
        propertyName: tenant?.units?.properties?.name, unitNumber: tenant?.units?.unit_number, tenantName: tenant?.name,
        message, reply, intent: classification?.intent_summary, emergency, unrecorded: !log?.id,
        reason: escalationReason(classification, { humanRequested }),
      });
      await recordOutcome(db, log, { status: "pending", key, recipients: to.recipients, recipient_source: to.source, at: now() });

      let result;
      try { result = await sendEmailReliably({ to: to.recipients, subject: email.subject, html: email.html, text: email.text, idempotencyKey: key }, { send, retryDelayMs }); }
      catch (e) { result = { ok: false, status: 0, error: e.message, attempts: 1 }; }

      notify = result?.ok
        ? { status: "sent", key, recipients: to.recipients, recipient_source: to.source, provider_id: result.data?.id ?? null, attempts: result.attempts ?? 1, at: now() }
        : { status: "failed", key, recipients: to.recipients, recipient_source: to.source, http_status: result?.status ?? null, attempts: result?.attempts ?? 1,
            error: String(result?.error || result?.data?.message || result?.data?.error || "send failed").slice(0, 300), at: now() };
      if (notify.status === "failed") console.error("[escalation-notify] email failed:", notify.error);
    }

    if (emergency) {
      try {
        const where = [tenant?.units?.properties?.name, tenant?.units?.unit_number && `Unit ${tenant.units.unit_number}`].filter(Boolean).join(" ");
        notify.sms = await sms({ body: smsBody(["[Modus] EMERGENCY", classification?.emergency_kind ? String(classification.emergency_kind).replace(/_/g, " ") : null, where, tenant?.name, classification?.intent_summary, `${APP_URL}/landlord/agent`]), env });
      } catch (e) { notify.sms = { status: "failed", error: String(e?.message || e).slice(0, 200), at: now() }; }
    }

    await recordOutcome(db, log, notify);
    return notify;
  } catch (e) {
    console.error("[escalation-notify] unexpected error:", e.message);
    return { status: "failed", error: e.message };
  }
}

// ── Daily recap backstop (read-only: lists, never re-sends) ─────────────────
export const RECAP_WINDOW_HOURS = 24;
export function recapSince(nowMs = Date.now()) { return new Date(nowMs - RECAP_WINDOW_HOURS * 3600e3).toISOString(); }

export function notifyStatusLabel(row) {
  const { label, color } = sharedNotifyStatusLabel(row);
  return { label, color };
}

// A routing-log row belongs in the recap when management was (or should have been) notified about it:
// an escalation, a Tier 1 emergency (including one routed as a maintenance ticket, action_taken
// CREATE_TICKET), or any row the notifier recorded an outcome on. Ordinary AI replies match none of these.
export const isRecapEscalation = isEscalationRow;

// rows: the last-24-hour ai_routing_logs rows, or null when the query failed — then unavailable: true,
// so the recap says the list could not be loaded instead of reporting "all clear".
export function escalationRecapSection(rows) {
  if (!Array.isArray(rows)) return { count: 0, needsAttention: 0, html: "", unavailable: true };
  const list = rows.filter(isRecapEscalation);
  const failed = list.filter((r) => !sharedNotifyStatusLabel(r).ok);
  if (!list.length) return { count: 0, needsAttention: 0, html: "" };
  const rowsHtml = list.map((r) => {
    const st = notifyStatusLabel(r);
    const t = r.tenants || {};
    const tag = r.raw_openai_response?.tier === "TIER1_EMERGENCY" ? "🚨 EMERGENCY · " : "";
    return `<tr>
      <td style="padding:7px 12px;font-size:13px;color:#EDEAE2;border-bottom:1px solid #252930">${tag}${escapeHtml(r.detected_intent || r.raw_message || "Escalation")}</td>
      <td style="padding:7px 12px;font-size:12px;color:#9095A0;border-bottom:1px solid #252930">${escapeHtml(t.name || "Tenant")} · Unit ${escapeHtml(t.units?.unit_number || "?")}</td>
      <td style="padding:7px 12px;font-size:11px;font-weight:700;color:${st.color};border-bottom:1px solid #252930">${escapeHtml(st.label)}</td>
      <td style="padding:7px 12px;font-size:11px;color:#5C6270;border-bottom:1px solid #252930">${escapeHtml(new Date(r.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }))}</td>
    </tr>`;
  }).join("");
  const html = `<table style="width:100%;border-collapse:collapse;background:#111316;border-radius:6px;overflow:hidden">${rowsHtml}</table>`;
  return { count: list.length, needsAttention: failed.length, html };
}
