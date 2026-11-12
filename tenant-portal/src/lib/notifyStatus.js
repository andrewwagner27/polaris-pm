// src/lib/notifyStatus.js
// How an escalation's management notification is described, from the outcome the API records on its
// ai_routing_logs row (raw_openai_response.notify). Shared by the daily recap email and the Agent Center
// so both say the same thing. Only "sent" (Resend returned an email id) is reported as emailed; an unknown
// outcome is never upgraded.

export function notifyStatusLabel(row) {
  const s = row?.raw_openai_response?.notify?.status;
  if (s === "sent") return { label: "emailed", color: "#72B02A", ok: true };
  if (s === "duplicate") return { label: "duplicate (handled by another record)", color: "#9095A0", ok: true };
  if (s === "failed") return { label: "EMAIL FAILED", color: "#E05555", ok: false };
  if (s === "unconfirmed") return { label: "EMAIL NOT CONFIRMED", color: "#E05555", ok: false };
  if (s === "pending") return { label: "email not confirmed", color: "#F0A430", ok: false };
  return { label: "not emailed", color: "#F0A430", ok: false };
}

// The recorded email failure reason, if any (already bounded by the API; never contains secrets).
export function notifyError(row) {
  const n = row?.raw_openai_response?.notify;
  return n?.status === "failed" || n?.status === "unconfirmed" ? String(n.error || "unknown error") : "";
}

// Emergency SMS outcome. Twilio "accepted" is not delivery; "sending" left behind means the outcome is unknown.
export function smsStatusText(row) {
  const s = row?.raw_openai_response?.notify?.sms?.status;
  switch (s) {
    case "accepted": return "SMS accepted (delivery not confirmed)";
    case "sending": return "SMS status unknown";
    case "failed": return "SMS FAILED";
    case "not_sent": return "SMS NOT SENT";
    default: return "";
  }
}

export function isEscalationRow(row) {
  if (!row) return false;
  if (row.action_taken === "ESCALATE_LANDLORD") return true;
  const raw = row.raw_openai_response;
  if (raw?.tier === "TIER1_EMERGENCY") return true;
  return Boolean(raw?.notify?.status);
}
