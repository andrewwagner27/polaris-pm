// api/_lib/escalationNotify.js
// Release B: email management whenever the tenant AI records an escalation (including emergencies),
// exactly once per escalation, and record the outcome on that escalation's ai_routing_logs row.
//
// - Recipient: api/_lib/recipients.js, purpose "escalation": ESCALATION_NOTIFY_EMAILS, else LANDLORD_EMAIL.
//   Nothing is hard-coded: with neither configured nothing is sent and the outcome is recorded as
//   failed (MANAGEMENT_RECIPIENT_NOT_CONFIGURED), so the Agent Center and the recap show it.
// - Idempotency: one notification per tenant message (key "escalation:<message_id>"), and one payload per
//   key: the payload is stored on the row before the first attempt and replayed unchanged on retries.
//   A second routing row for the same message (concurrent processing) is marked "duplicate" and sends
//   nothing; if both rows race past that check, Resend's key handling stops the second email
//   (409 → recorded "duplicate" or "unconfirmed", never "sent").
// - Emergencies (tier TIER1_EMERGENCY) also try the emergency SMS (api/_lib/emergencySms.js), which is off
//   unless explicitly enabled. At most one SMS attempt per message (claimAndSendSms). "accepted" never
//   means delivered.
// - Outcome: raw_openai_response.notify on the routing-log row (no migration):
//   { status: "pending" | "sent" | "failed" | "unconfirmed" | "duplicate", key, recipients, email, provider_id?,
//     error?, attempts?, sms?, at }. "sent" only when Resend returned an email id.
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
// A sibling row in one of these states owns this message's notification: "unconfirmed" may already have
// been delivered, so another row must not send a second (differently worded) email.
const ACTIVE_STATUSES = new Set(["pending", "sent", "unconfirmed"]);

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

// Writes notify onto the row. Re-reads the row first so an SMS claim written by another request (on this
// row as the canonical row) is never dropped by this write.
async function recordOutcome(db, log, notify) {
  if (!log?.id) return;
  try {
    let current = null;
    try {
      const { data } = await db.from("ai_routing_logs").select("raw_openai_response").eq("id", log.id).maybeSingle();
      current = data?.raw_openai_response ?? null;
    } catch { current = null; }
    const base = current && typeof current === "object" ? current
      : (log.raw_openai_response && typeof log.raw_openai_response === "object" ? log.raw_openai_response : {});
    const keepSms = !notify?.sms && base.notify?.sms ? { sms: base.notify.sms } : {};
    const merged = { ...base, notify: { ...notify, ...keepSms } };
    const { error } = await db.from("ai_routing_logs").update({ raw_openai_response: merged }).eq("id", log.id);
    if (error) console.error("[escalation-notify] could not record outcome:", error.message || error);
    else log.raw_openai_response = merged;
  } catch (e) { console.error("[escalation-notify] could not record outcome:", e.message); }
}

// The emergency SMS for one tenant message is attempted at most once, durably:
//   1. if this row or any other routing row for the same message already has notify.sms, nothing is sent;
//   2. otherwise this row is CLAIMED with a single conditional UPDATE (only if notify.sms is still absent),
//      writing { status: "sending" } BEFORE Twilio is called. Only the request whose UPDATE matched sends.
//   3. the outcome replaces "sending". A crash between 2 and 3 leaves "sending", shown as
//      "SMS status unknown" — never retried, never shown as delivered.
// Without a routing row (log null) there is nowhere durable to record it: the SMS is still sent once for
// this request (an emergency outranks the risk of a duplicate) and marked unrecorded.
async function claimAndSendSms({ db, log, messageId, sms, body, env, now }) {
  // SMS off or not configured: record that, claim nothing, contact nobody.
  const probe = await sms({ body, env, dryRun: true });
  if (probe?.status !== "ready") return { status: probe?.status || "not_sent", ...(probe?.missing ? { missing: probe.missing } : {}), at: now() };
  if (!log?.id) {
    const r = await sms({ body, env });
    return { ...r, unrecorded: true };
  }
  // Every routing row for this message; the claim lives on ONE canonical row (earliest created, then id),
  // so concurrent requests holding different rows still compete for the same claim.
  let rows = [{ id: log.id, created_at: log.created_at, raw_openai_response: log.raw_openai_response }];
  if (messageId) {
    const { data: siblings } = await db.from("ai_routing_logs").select("id, created_at, raw_openai_response").eq("message_id", messageId);
    if (Array.isArray(siblings) && siblings.length) rows = siblings.some((r) => r.id === log.id) ? siblings : [...siblings, rows[0]];
  }
  const prior = rows.find((r) => r.raw_openai_response?.notify?.sms);
  if (prior) return { status: "duplicate", duplicate_of: prior.id, at: now() };
  const canonical = [...rows].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || String(a.id).localeCompare(String(b.id)))[0];

  const base = canonical.raw_openai_response && typeof canonical.raw_openai_response === "object" ? canonical.raw_openai_response : {};
  const claim = { status: "sending", claimed_by: log.id, at: now() };
  const claimed = { ...base, notify: { ...(base.notify || {}), sms: claim } };
  const { data: won, error } = await db.from("ai_routing_logs").update({ raw_openai_response: claimed })
    .eq("id", canonical.id).is("raw_openai_response->notify->>sms", null).select("id");
  if (error) return { status: "not_sent", error: `could not record the SMS claim: ${String(error.message || error).slice(0, 150)}`, at: now() };
  if (!Array.isArray(won) || !won.length) return { status: "duplicate", duplicate_of: canonical.id, at: now() };
  if (canonical.id === log.id) log.raw_openai_response = claimed;

  let result;
  try { result = await sms({ body, env }); }
  catch (e) { result = { status: "failed", error: String(e?.message || e).slice(0, 200), at: now() }; }
  // Replace the claim on the canonical row with the outcome (this request's own row is written by the caller).
  if (canonical.id !== log.id) {
    try {
      const { data: cur } = await db.from("ai_routing_logs").select("raw_openai_response").eq("id", canonical.id).maybeSingle();
      const raw = cur?.raw_openai_response && typeof cur.raw_openai_response === "object" ? cur.raw_openai_response : claimed;
      await db.from("ai_routing_logs").update({ raw_openai_response: { ...raw, notify: { ...(raw.notify || {}), sms: { ...result, claimed_by: log.id } } } }).eq("id", canonical.id);
    } catch (e) { console.error("[escalation-notify] could not record SMS outcome:", e?.message || e); }
  }
  return result;
}

// Maps an email result (email.js sendEmailReliably) to the recorded notify status. Only "sent" claims sending.
function emailStatus(result) {
  if (result?.ok) return "sent";
  if (result?.result === "duplicate") return "duplicate";
  if (result?.result === "unconfirmed") return "unconfirmed";
  return "failed";
}

// Called once, right after the escalation's routing-log row is written, and again only by a retried request
// whose recorded outcome was "failed" or "unconfirmed". Never throws.
//   The email PAYLOAD is stored on the row (notify.email) before the first attempt and replayed unchanged on
//   every later attempt, so the idempotency key "escalation:<message_id>" is only ever sent with one payload.
//   If Resend accepted an earlier attempt, the replay returns that original response — evidence, not a guess.
//   send: (args) => one attempt (api/_lib/email.js sendEmail)
//   sms:  ({ body, env }) => { status, ... } (api/_lib/emergencySms.js sendEmergencySms)
export async function notifyEscalation({ db, send, sms = sendEmergencySms, log, tenant, message, reply, classification, messageId, humanRequested = false,
  env = globalThis.process?.env ?? {}, now = () => new Date().toISOString(), retryDelayMs = 750 }) {
  try {
    if (!needsNotification(classification)) return { status: "not_required" };
    const key = notificationKey({ messageId, logId: log?.id });
    const previous = log?.raw_openai_response?.notify || null;

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
    let notify;
    // Replay: the stored payload and recipients, exactly as first attempted. Otherwise build it now.
    let payload = previous?.email && previous.email.subject && previous.email.html ? previous.email : null;
    let recipientSource = previous?.recipient_source ?? null;
    if (!payload) {
      const to = managementRecipients(env);
      if (!to.ok) {
        console.error("[escalation-notify]", to.error);
        notify = { status: "failed", key, recipients: [], error: to.code, at: now() };
      } else {
        const email = buildEscalationEmail({
          propertyName: tenant?.units?.properties?.name, unitNumber: tenant?.units?.unit_number, tenantName: tenant?.name,
          message, reply, intent: classification?.intent_summary, emergency, unrecorded: !log?.id,
          reason: escalationReason(classification, { humanRequested }),
        });
        payload = { to: to.recipients, subject: email.subject, html: email.html, text: email.text };
        recipientSource = to.source;
      }
    }

    if (payload) {
      await recordOutcome(db, log, { status: "pending", key, recipients: payload.to, recipient_source: recipientSource, email: payload, at: now() });
      let result;
      try { result = await sendEmailReliably({ ...payload, idempotencyKey: key }, { send, retryDelayMs }); }
      catch (e) { result = { ok: false, result: "unconfirmed", status: 0, error: e.message, attempts: 1 }; }
      const status = emailStatus(result);
      notify = { status, key, recipients: payload.to, recipient_source: recipientSource, email: payload, attempts: result?.attempts ?? 1, at: now(),
        ...(status === "sent" ? { provider_id: result.data?.id ?? null } : { http_status: result?.status ?? null, error: String(result?.error || "send failed").slice(0, 300) }) };
      if (status !== "sent") console.error(`[escalation-notify] email ${status}:`, notify.error);
      // Two rows for one message can both get Resend's response for the SAME email (identical payload under
      // the same key). Only the first row owns it; the other records itself as a duplicate of that row.
      if (status === "sent" && messageId && notify.provider_id) {
        try {
          const { data: siblings } = await db.from("ai_routing_logs").select("id, created_at, raw_openai_response").eq("message_id", messageId);
          const owner = (siblings || []).filter((r) => r.id !== log?.id && r.raw_openai_response?.notify?.provider_id === notify.provider_id)[0];
          if (owner) notify = { status: "duplicate", key, duplicate_of: owner.id, provider_id: notify.provider_id, at: now() };
        } catch { /* keep "sent": the email id is still the evidence */ }
      }
    }

    if (previous?.sms) notify.sms = previous.sms;   // keep the earlier SMS record on a replay
    if (emergency) {
      const where = [tenant?.units?.properties?.name, tenant?.units?.unit_number && `Unit ${tenant.units.unit_number}`].filter(Boolean).join(" ");
      const body = smsBody(["[Modus] EMERGENCY", classification?.emergency_kind ? String(classification.emergency_kind).replace(/_/g, " ") : null, where, tenant?.name, classification?.intent_summary, `${APP_URL}/landlord/agent`]);
      // Record the email outcome first so the SMS claim merges onto it.
      await recordOutcome(db, log, notify);
      const smsResult = await claimAndSendSms({ db, log, messageId, sms, body, env, now });
      if (smsResult.status !== "duplicate") notify.sms = smsResult;
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
  // One entry per tenant message: overlapping requests can leave two rows for one message. Keep the row
  // with the best-evidenced outcome (sent > duplicate > unconfirmed > pending > failed > none).
  const rank = { sent: 5, duplicate: 4, unconfirmed: 3, pending: 2, failed: 1 };
  const byMessage = new Map();
  for (const r of rows.filter(isRecapEscalation)) {
    const k = r.message_id || `row:${r.id}`;
    const cur = byMessage.get(k);
    if (!cur || (rank[r.raw_openai_response?.notify?.status] || 0) > (rank[cur.raw_openai_response?.notify?.status] || 0)) byMessage.set(k, r);
  }
  const list = [...byMessage.values()];
  const failed = list.filter((r) => !sharedNotifyStatusLabel(r).ok);
  if (!list.length) return { count: 0, needsAttention: 0, html: "" };
  const rowsHtml = list.map((r) => {
    const st = notifyStatusLabel(r);
    const t = r.tenants || {};
    const tag = r.raw_openai_response?.tier === "TIER1_EMERGENCY" ? "🚨 EMERGENCY · " : "";
    // The tenant's exact words first; the AI's summary is only a secondary line (never a substitute).
    const exact = String(r.raw_message || "").trim();
    const shown = exact ? `“${exact.length > 220 ? exact.slice(0, 220) + "…" : exact}”` : "(original message not recorded)";
    const summary = r.detected_intent ? `<div style="font-size:11px;color:#5C6270;margin-top:2px">AI summary: ${escapeHtml(r.detected_intent)}</div>` : "";
    return `<tr>
      <td style="padding:7px 12px;font-size:13px;color:#EDEAE2;border-bottom:1px solid #252930">${tag}${escapeHtml(shown)}${summary}</td>
      <td style="padding:7px 12px;font-size:12px;color:#9095A0;border-bottom:1px solid #252930">${escapeHtml(t.name || "Tenant")} · Unit ${escapeHtml(t.units?.unit_number || "?")}</td>
      <td style="padding:7px 12px;font-size:11px;font-weight:700;color:${st.color};border-bottom:1px solid #252930">${escapeHtml(st.label)}</td>
      <td style="padding:7px 12px;font-size:11px;color:#5C6270;border-bottom:1px solid #252930">${escapeHtml(new Date(r.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }))}</td>
    </tr>`;
  }).join("");
  const html = `<table style="width:100%;border-collapse:collapse;background:#111316;border-radius:6px;overflow:hidden">${rowsHtml}</table>`;
  return { count: list.length, needsAttention: failed.length, html };
}
