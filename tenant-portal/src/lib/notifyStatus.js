// src/lib/notifyStatus.js
// How an escalation's management notification is described, from the outcome the API records on its
// ai_routing_logs row (raw_openai_response.notify). Shared by the daily recap email and the Agent Center
// so both say the same thing. Only "sent" is reported as emailed; an unknown outcome is never upgraded.

export function notifyStatusLabel(row) {
  const s = row?.raw_openai_response?.notify?.status;
  if (s === "sent") return { label: "emailed", color: "#72B02A", ok: true };
  if (s === "duplicate") return { label: "duplicate (already emailed)", color: "#9095A0", ok: true };
  if (s === "failed") return { label: "EMAIL FAILED", color: "#E05555", ok: false };
  if (s === "pending") return { label: "email not confirmed", color: "#F0A430", ok: false };
  return { label: "not emailed", color: "#F0A430", ok: false };
}

// The recorded email failure reason, if any (already bounded by the API; never contains secrets).
export function notifyError(row) {
  const n = row?.raw_openai_response?.notify;
  return n?.status === "failed" ? String(n.error || "unknown error") : "";
}

export function isEscalationRow(row) {
  if (!row) return false;
  if (row.action_taken === "ESCALATE_LANDLORD") return true;
  const raw = row.raw_openai_response;
  if (raw?.tier === "TIER1_EMERGENCY") return true;
  return Boolean(raw?.notify?.status);
}
