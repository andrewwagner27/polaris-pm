// api/_lib/aiSafety.js
// Deterministic safety rules for the tenant AI (/api/classify-and-route). Pure: no I/O.
//
// - Identity: AI replies are always attributed to the Modus AI assistant, never a named person.
// - Rent: payment status comes only from the active A2 receivables ledger (a2_pay_rent_internal).
//   The legacy rent_payments table is never consulted; when the ledger is inactive or shows
//   nothing past due, the AI is given no payment-status context at all.
// - Complaints: the AI never issues lease-violation notices. Any incident goes to a human.
// - Human requests: a tenant asking for a person is always escalated, whatever the model says.

export const AI_ASSISTANT_NAME = "Modus AI Assistant";

// due: the jsonb returned by a2_pay_rent_internal(p_tenant), or null/undefined on error.
export function buildRentContext(due) {
  if (!due || due.ledger_active !== true) return "";
  const pastDueCents = Number(due.past_due_cents);
  if (!Number.isFinite(pastDueCents) || pastDueCents <= 0) return "";
  const amount = (pastDueCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  return `[CONFIRMED LEDGER — only use if the tenant asks about rent or payments]: The tenant's account shows ${amount} past due. Do not state any other amount, date, or fee.`;
}

const HUMAN_REQUEST = [
  /\b(talk|speak|chat)\s+(to|with)\s+(a|an|the|some)?\s*(real\s+)?(person|human|someone|somebody|manager|management|staff|property manager|landlord)\b/i,
  /\b(real|actual|live)\s+(person|human)\b/i,
  /\b(human|person)\s+(please|instead)\b/i,
  /\bnot\s+(a|an|the)?\s*(bot|ai|robot)\b/i,
  /\b(is|are)\s+(this|you)\s+(a\s+)?(bot|ai|robot|human|real)\b/i,
];

export function wantsHuman(message) {
  const text = String(message || "");
  return HUMAN_REQUEST.some((re) => re.test(text));
}

// Returns a corrected copy of the model's classification; never mutates the input.
export function applySafetyOverrides(classification, message) {
  const c = { ...(classification || {}) };
  c.send_violation_notice = false;                  // notices are issued by management only
  if (c.create_incident_log) c.escalate_to_landlord = true;   // complaints always reach a human
  if (wantsHuman(message)) c.escalate_to_landlord = true;
  return c;
}
