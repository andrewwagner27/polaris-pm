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
// contact: the configured urgent management line (src/lib/emergencyContact.js), or null/undefined when none is set.
// contactsFor: (kind) => verified property-specific emergency contacts for THIS tenant's property
//   (api/_lib/emergencyContacts.js), or omitted when none are configured.
// recentTenantText: the tenant's recent messages in this thread. When they already described an emergency, the
//   model's emergency call on a follow-up ("it's getting worse") is never downgraded.
export function applySafetyOverrides(classification, message, { contact = null, contactsFor = null, recentTenantText = "" } = {}) {
  const c = { ...(classification || {}) };
  c.send_violation_notice = false;                  // notices are issued by management only
  if (c.create_incident_log) c.escalate_to_landlord = true;   // complaints always reach a human
  if (wantsHuman(message)) c.escalate_to_landlord = true;

  // Emergencies are decided by these fixed rules as well as by the model: a model that misses one, or
  // is unavailable, cannot downgrade it. The tenant always gets the fixed safety instruction first.
  const severity = assessSeverity(message);
  if (severity?.level === "emergency") {
    // Tier 1 alone triggers the landlord alert and the management email/SMS (escalationNotify.needsNotification).
    c.tier = "TIER1_EMERGENCY";
    c.urgency = "EMERGENCY";
    c.severity = "EMERGENCY";
    c.emergency_kind = severity.kind;
    c.life_safety = severity.lifeSafety;
    // A building emergency gets an emergency work order (fire, security and medical are 911 matters, not repairs).
    if (MAINTENANCE_EMERGENCY_KINDS.includes(severity.kind)) c.create_maintenance_ticket = true;
    const contacts = typeof contactsFor === "function" ? formatContacts(contactsFor(severity.kind)) : "";
    const modelReply = String(c.tenant_reply || "").trim();
    c.tenant_reply = [severity.guidance, contacts, flaggedLine(contact), modelReply].filter(Boolean).join("\n\n");
    return c;
  }

  // Not an emergency by the fixed rules. The model may still call one (it sees descriptions these rules don't
  // know), EXCEPT when the message matches a known non-emergency pattern and nothing in the recent thread was an
  // emergency: then it is downgraded so routine repairs don't raise emergency alerts.
  const threadEmergency = Boolean(detectEmergency(recentTenantText));
  const modelEmergency = c.tier === "TIER1_EMERGENCY" || c.urgency === "EMERGENCY";
  if (severity && modelEmergency && !threadEmergency) {
    c.tier = "TIER3_MAINTENANCE";
    c.urgency = { priority: "HIGH", clarify: "MEDIUM", routine: "LOW", tenant_lockout: "LOW" }[severity.level];
    c.create_maintenance_ticket = false;
    c.downgraded_from_emergency = severity.kind;
    if (EMERGENCY_WORDING.test(String(c.tenant_reply || ""))) c.tenant_reply = DOWNGRADE_REPLY[severity.level](severity);
  }
  if (!severity || c.tier === "TIER1_EMERGENCY") return c;

  if (severity.level === "priority") {
    c.severity = "PRIORITY";
    c.priority_kind = severity.kind;
    c.priority_reason = severity.reason;
    c.escalate_to_landlord = true;                  // management is told promptly; no emergency alert or SMS
    if (c.urgency !== "HIGH") c.urgency = "HIGH";
  } else if (severity.level === "clarify") {
    c.severity = "UNCLEAR";
    c.needs_clarification = severity.kind;
    if (c.urgency === "EMERGENCY") c.urgency = "MEDIUM";
    // Ask before deciding: the reply must contain the question (one or two short ones).
    if (!/\?/.test(String(c.tenant_reply || ""))) c.tenant_reply = [String(c.tenant_reply || "").trim(), severity.question].filter(Boolean).join(" ");
  } else if (severity.level === "tenant_lockout") {
    // Lost keys / locked out with nothing broken: not maintenance. No work order, no automatic escalation (a request
    // for a person still escalates), no fee and no lock change decided here.
    c.severity = "TENANT_RESPONSIBILITY";
    c.urgency = "LOW";
    c.create_maintenance_ticket = false;
    c.dispatch_vendor = false;
    c.escalate_to_landlord = wantsHuman(message) || Boolean(c.create_incident_log);
    if (!/locksmith/i.test(String(c.tenant_reply || ""))) c.tenant_reply = [String(c.tenant_reply || "").trim(), LOCKOUT_NOTE].filter(Boolean).join("\n\n");
  } else if (severity.level === "routine") {
    c.severity = "ROUTINE";
    if (c.urgency === "EMERGENCY" || c.urgency === "HIGH") c.urgency = "LOW";
  }
  return c;
}

const EMERGENCY_WORDING = /emergenc|911|evacuat|leave the (?:building|unit|apartment)|get out/i;
export const LOCKOUT_NOTE = "Lost keys and lock-outs are usually arranged by the tenant: you can call a licensed locksmith directly, subject to your lease terms. If the lock itself is broken, tell me and I'll pass it to management as a repair. If anyone is locked inside and in danger, or you feel unsafe where you are, call 911.";
const DOWNGRADE_REPLY = {
  tenant_lockout: () => LOCKOUT_NOTE,
  priority: (s) => `Thanks for letting us know. I've flagged this to Modus management as a priority repair (${s.reason.charAt(0).toLowerCase()}${s.reason.slice(1)}). Please submit it in the Maintenance tab with a photo if you haven't already. If it gets worse — water pouring in, a sagging ceiling, sparks, or a gas smell — tell me right away, and call 911 if anyone is in danger.`,
  clarify: (s) => `Thanks for letting me know. ${s.question}`,
  routine: () => "Thanks for letting us know — that sounds like a routine repair. Please submit it in the Maintenance tab (a photo helps) and management will schedule it. If anything changes and it becomes unsafe, tell me right away.",
};

// ── Emergencies ─────────────────────────────────────────────────────────────
// lifeSafety: an immediate threat to people → the tenant is told to call 911 first.
// Otherwise a property emergency → management is alerted as an emergency, with safety steps.
// Wording never claims anyone was reached: the reply is written before any notification is sent.
export const FLAGGED_LINE = flaggedLine(null);
export { flaggedLine };

// The rules and the phrase corpus live in api/_lib/emergencyRules.js and tests/emergency-detection.test.mjs.
export { detectEmergency, assessSeverity, EMERGENCY_KINDS, LIFE_SAFETY_KINDS } from "./emergencyRules.js";
import { detectEmergency, assessSeverity, MAINTENANCE_EMERGENCY_KINDS } from "./emergencyRules.js";
import { formatContacts } from "./emergencyContacts.js";
import { flaggedLine } from "../../src/lib/emergencyContact.js";

