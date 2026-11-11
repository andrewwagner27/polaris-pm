// api/_lib/escalationNotify.js
// Release B: email management whenever the tenant AI records an escalation (including emergencies),
// exactly once per escalation, and record the outcome on that escalation's ai_routing_logs row.
//
// - Recipient: ESCALATION_NOTIFY_EMAILS (comma-separated), else LANDLORD_EMAIL, else the address the
//   emergency email and the daily recap already used. LANDLORD_NOTIFY_EMAILS is deliberately NOT used:
//   it is the allow-list for tenant-sent mail and its default includes a test tenant's address.
// - Idempotency: one notification per tenant message (key "escalation:<message_id>"). A retried request
//   creates a second routing-log row; it is marked "duplicate" and nothing is sent. The same key is sent
//   to Resend as Idempotency-Key, which also absorbs concurrent retries.
// - Outcome: raw_openai_response.notify on the routing-log row (no migration):
//   { status: "pending" | "sent" | "failed" | "duplicate", key, recipients, provider_id?, error?, at }.
// - Never throws: a notification failure cannot block the tenant's reply or lose the escalation
//   (the reply, alert and routing log are all written before this runs).
// - Only the escalation just recorded is ever notified; nothing here reads or replays older rows.

export const APP_URL = "https://www.getmodusam.com";
export const DEFAULT_MANAGEMENT_EMAIL = "moduspropmgmt@gmail.com";
const ACTIVE_STATUSES = new Set(["pending", "sent"]);

export function managementRecipients(env = globalThis.process?.env ?? {}) {
  const parse = (v) => String(v || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const configured = parse(env.ESCALATION_NOTIFY_EMAILS);
  if (configured.length) return { recipients: [...new Set(configured)], source: "ESCALATION_NOTIFY_EMAILS" };
  const landlord = parse(env.LANDLORD_EMAIL);
  if (landlord.length) return { recipients: [...new Set(landlord)], source: "LANDLORD_EMAIL" };
  return { recipients: [DEFAULT_MANAGEMENT_EMAIL], source: "default" };
}

export const isEmergency = (c) => c?.tier === "TIER1_EMERGENCY";
export const needsNotification = (c) => isEmergency(c) || c?.escalate_to_landlord === true;

export function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

export function escalationReason(classification, { humanRequested = false } = {}) {
  const c = classification || {};
  const reasons = [];
  if (isEmergency(c)) reasons.push("Emergency reported (Tier 1)");
  if (humanRequested) reasons.push("Tenant asked to talk to a person");
  if (c.create_incident_log) reasons.push("Complaint or dispute logged for management review");
  if (!reasons.length) reasons.push("The AI could not resolve this and flagged it for management");
  const detail = [c.category && String(c.category).replace(/_/g, " ").toLowerCase(), c.urgency && `urgency ${String(c.urgency).toLowerCase()}`].filter(Boolean).join(", ");
  return detail ? `${reasons.join("; ")} (${detail})` : reasons.join("; ");
}

export function buildEscalationEmail({ propertyName, unitNumber, tenantName, message, reply, reason, intent, emergency }) {
  const where = `${propertyName || "Unknown property"} · Unit ${unitNumber || "?"}`;
  const subject = emergency
    ? `🚨 EMERGENCY — ${where} — ${tenantName || "Tenant"}`
    : `Tenant escalation — ${where} — ${tenantName || "Tenant"}`;
  const agentCenter = `${APP_URL}/landlord/agent`;
  const conversations = `${APP_URL}/landlord/messages`;
  const row = (k, v) => `<tr><td style="padding:6px 0;color:#666;font-size:13px;width:120px;vertical-align:top">${k}</td><td style="padding:6px 0;font-size:13px;color:#111">${v}</td></tr>`;
  const quote = (v, color) => `<blockquote style="margin:0;padding:12px 16px;border-left:4px solid ${color};background:#f7f7f7;color:#222;white-space:pre-wrap">${escapeHtml(v)}</blockquote>`;
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:${emergency ? "#c0392b" : "#7A5C2E"};color:#fff;padding:18px 22px;border-radius:8px 8px 0 0">
    <div style="font-size:11px;letter-spacing:.12em;opacity:.85">MODUS PROPERTY MANAGEMENT</div>
    <div style="font-size:20px;margin-top:4px">${emergency ? "🚨 Emergency — act now" : "A tenant needs a person"}</div>
  </div>
  <div style="border:1px solid #ddd;border-top:none;padding:20px 22px;border-radius:0 0 8px 8px">
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
  const text = [subject, "", `Property: ${propertyName || "Unknown"}`, `Unit: ${unitNumber || "?"}`, `Tenant: ${tenantName || "Unknown"}`, `Why: ${reason}`,
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
export async function notifyEscalation({ db, send, log, tenant, message, reply, classification, messageId, humanRequested = false, env = globalThis.process?.env ?? {}, now = () => new Date().toISOString() }) {
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

    const { recipients, source } = managementRecipients(env);
    const emergency = isEmergency(classification);
    const email = buildEscalationEmail({
      propertyName: tenant?.units?.properties?.name, unitNumber: tenant?.units?.unit_number, tenantName: tenant?.name,
      message, reply, intent: classification?.intent_summary, emergency,
      reason: escalationReason(classification, { humanRequested }),
    });

    await recordOutcome(db, log, { status: "pending", key, recipients, recipient_source: source, at: now() });

    let result;
    try { result = await send({ to: recipients, subject: email.subject, html: email.html, text: email.text, idempotencyKey: key }); }
    catch (e) { result = { ok: false, status: 0, error: e.message }; }

    const notify = result?.ok
      ? { status: "sent", key, recipients, recipient_source: source, provider_id: result.data?.id ?? null, at: now() }
      : { status: "failed", key, recipients, recipient_source: source, http_status: result?.status ?? null,
          error: String(result?.error || result?.data?.message || result?.data?.error || "send failed").slice(0, 300), at: now() };
    if (notify.status === "failed") console.error("[escalation-notify] email failed:", notify.error);
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
  const s = row?.raw_openai_response?.notify?.status;
  if (s === "sent") return { label: "emailed", color: "#72B02A" };
  if (s === "duplicate") return { label: "duplicate (already emailed)", color: "#9095A0" };
  if (s === "failed") return { label: "EMAIL FAILED", color: "#E05555" };
  if (s === "pending") return { label: "email not confirmed", color: "#F0A430" };
  return { label: "not emailed", color: "#F0A430" };
}

export function escalationRecapSection(rows) {
  const list = (rows || []).filter((r) => r?.action_taken === "ESCALATE_LANDLORD");
  const failed = list.filter((r) => notifyStatusLabel(r).label !== "emailed" && !String(notifyStatusLabel(r).label).startsWith("duplicate"));
  if (!list.length) return { count: 0, needsAttention: 0, html: "" };
  const rowsHtml = list.map((r) => {
    const st = notifyStatusLabel(r);
    const t = r.tenants || {};
    return `<tr>
      <td style="padding:7px 12px;font-size:13px;color:#EDEAE2;border-bottom:1px solid #252930">${escapeHtml(r.detected_intent || r.raw_message || "Escalation")}</td>
      <td style="padding:7px 12px;font-size:12px;color:#9095A0;border-bottom:1px solid #252930">${escapeHtml(t.name || "Tenant")} · Unit ${escapeHtml(t.units?.unit_number || "?")}</td>
      <td style="padding:7px 12px;font-size:11px;font-weight:700;color:${st.color};border-bottom:1px solid #252930">${st.label}</td>
      <td style="padding:7px 12px;font-size:11px;color:#5C6270;border-bottom:1px solid #252930">${escapeHtml(new Date(r.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }))}</td>
    </tr>`;
  }).join("");
  const html = `<table style="width:100%;border-collapse:collapse;background:#111316;border-radius:6px;overflow:hidden">${rowsHtml}</table>`;
  return { count: list.length, needsAttention: failed.length, html };
}
