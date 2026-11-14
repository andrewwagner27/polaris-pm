// src/lib/escalationReason.js
// Why an AI conversation was escalated to management, worked out from the stored routing record, the tenant's
// exact message and the AI's reply. Pure and deterministic: used by the Agent Center (and its tests).
//
// The main rule is honesty. A knowledge gap is reported only when the AI reply itself says it had no
// confirmed information. A tenant who simply asks for a person gets "Asked for a person"; we don't
// invent a missing fact.

import { wantsHuman } from "../../api/_lib/aiSafety.js";
import { detectEmergency } from "../../api/_lib/emergencyRules.js";

export const REASONS = Object.freeze({
  safety:           { label: "Safety emergency",              color: "#E05555", gap: false },
  maintenance:      { label: "Maintenance issue",            color: "#F0A430", gap: false },
  human_request:    { label: "Asked for a person",            color: "#4A9AE8", gap: false },
  missing_property: { label: "Missing property information",  color: "#C9A96E", gap: true  },
  missing_policy:   { label: "Missing policy or procedure",   color: "#C9A96E", gap: true  },
  management_decision: { label: "Needs a management decision", color: "#9095A0", gap: false },
  ai_unavailable:   { label: "AI unavailable",                color: "#E05555", gap: false },
  ai_uncertain:     { label: "AI uncertain",                  color: "#F0A430", gap: false },
  other:            { label: "Other",                         color: "#9095A0", gap: false },
});

// The phrases the system prompt tells the AI to use when the knowledge base doesn't cover a question.
const NO_CONFIRMED_INFO = /\b(?:don['’]?t|do not|didn['’]?t)\s+have\s+(?:any\s+)?confirmed\s+information\b|\bno\s+confirmed\s+information\b|\bnot\s+(?:able|sure)\s+to\s+confirm\b/i;

// Topics a tenant asks about. kind "property" = a fact about the building or unit; "policy" = a rule or an
// operating procedure. scope "unit" = the answer differs per unit (e.g. which parking space).
const TOPICS = [
  { key: "parking",    label: "Parking",               kind: "property", re: /\b(park(?:ing)?|parking\s+(?:spot|space)|garage|car\s*port|driveway|tow(?:ed|ing)?)\b/i,
    unitRe: /\b(my|our)\s+(?:assigned\s+)?(?:parking\s+)?(?:spot|space)\b|\b(?:spot|space)\s+(?:for|belongs?\s+to)\s+(?:my|our)\s+unit\b|\bwhich\s+(?:parking\s+)?(?:spot|space)\b/i },
  { key: "laundry",    label: "Laundry",               kind: "property", re: /\b(laundry|washer|dryer|washing\s+machine)\b/i },
  { key: "amenities",  label: "Amenities",             kind: "property", re: /\b(amenit(?:y|ies)|gym|fitness|pool|storage\s+(?:unit|room|locker|space)|bike\s+(?:room|rack|storage)|rooftop|community\s+room)\b/i },
  { key: "utilities",  label: "Utilities",             kind: "property", re: /\b(utilit(?:y|ies)|electric(?:ity)?\s+bill|gas\s+bill|water\s+bill|internet|wi-?fi|cable)\b/i },
  { key: "trash",      label: "Trash and recycling",   kind: "property", re: /\b(trash|garbage|recycl(?:e|ing)|dumpster|bulk\s+pick-?up)\b/i },
  { key: "mail",       label: "Mail and packages",     kind: "property", re: /\b(mail(?:box)?|packages?|deliver(?:y|ies)|parcel)\b/i },
  { key: "keys",       label: "Keys and access",       kind: "policy",   re: /\b(spare\s+key|new\s+key|extra\s+key|key\s+fob|fob|lock(?:ed)?\s+out|copy\s+of\s+(?:my|the)\s+key)\b/i },
  { key: "pets",       label: "Pets",                  kind: "policy",   re: /\b(pets?|dogs?|cats?|animals?|service\s+animal|emotional\s+support)\b/i },
  { key: "guests",     label: "Guests",                kind: "policy",   re: /\b(guests?|visitors?|overnight|stay(?:ing)?\s+with\s+me)\b/i },
  { key: "smoking",    label: "Smoking",               kind: "policy",   re: /\b(smok(?:e|ing)|vap(?:e|ing)|cigarettes?|marijuana|cannabis)\b/i },
  { key: "sublet",     label: "Subletting and roommates", kind: "policy", re: /\b(sublet|sub-?lease|roommates?|airbnb|add\s+(?:someone|a\s+person)\s+to\s+(?:my|the)\s+lease)\b/i },
  { key: "move_out",   label: "Move-out and notice",   kind: "policy",   re: /\b(move\s*-?out|moving\s+out|notice\s+to\s+vacate|end\s+(?:my|the)\s+lease|break\s+(?:my|the)\s+lease|security\s+deposit)\b/i },
  { key: "renewal",    label: "Lease renewal",         kind: "policy",   re: /\b(renew(?:al|ing)?|extend\s+(?:my|the)\s+lease|lease\s+extension)\b/i },
  { key: "rent",       label: "Rent and payments",     kind: "policy",   re: /\b(rent|late\s+fee|payment|pay\s+online|autopay|receipt)\b/i },
  { key: "alterations",label: "Alterations and decorating", kind: "policy", re: /\b(paint(?:ing)?|nail|mount\s+(?:a|my)\s+tv|install|wallpaper|change\s+the\s+locks?)\b/i },
  { key: "quiet_hours",label: "Quiet hours and noise", kind: "policy",   re: /\b(quiet\s+hours|noise\s+(?:rules|policy))\b/i },
];

export function detectTopic(message) {
  const text = String(message || "");
  for (const t of TOPICS) {
    if (t.re.test(text)) return { key: t.key, label: t.label, kind: t.kind, unitSpecific: Boolean(t.unitRe && t.unitRe.test(text)) };
  }
  return null;
}

export function aiSaidNoConfirmedInfo(reply) {
  return NO_CONFIRMED_INFO.test(String(reply || ""));
}

const DECISION_CATEGORIES = new Set(["LEASE_LEGAL", "PAYMENT", "NOISE_COMPLAINT", "PARKING_DISPUTE", "LEASE_VIOLATION", "TENANT_DAMAGE"]);

// log: an ai_routing_logs row; message: the tenant's exact message; reply: the AI's reply to it (if known).
// Returns { kind, label, color, gap, detail, topic, secondary }:
//   gap: true only for a real knowledge gap (missing property information / policy), the cases where
//        Teach Agent helps. secondary: a knowledge gap that came with an explicit request for a person.
export function classifyEscalation(log, message, reply) {
  const raw = log?.raw_openai_response || {};
  const text = String(message || "");
  const answer = String(reply ?? raw.reply ?? "");
  const topic = detectTopic(text);
  const human = raw.human_requested === true || wantsHuman(text);
  const noInfo = aiSaidNoConfirmedInfo(answer);
  const out = (kind, detail, extra = {}) => ({ kind, ...REASONS[kind], detail, topic, ...extra });

  const emergency = raw.emergency_kind || (raw.tier === "TIER1_EMERGENCY" ? "emergency" : null) || detectEmergency(text)?.kind;
  // Only rows recorded by the current safety path (emergency_kind) are known to have received the fixed guidance.
  if (emergency) return out("safety", raw.emergency_kind
    ? `Emergency (${String(raw.emergency_kind).replace(/_/g, " ")}): fixed safety guidance was sent to the tenant.`
    : `Possible emergency (${String(emergency).replace(/_/g, " ")}). Check the AI response above for what the tenant was told.`);
  if (raw.ai_unavailable || /AI (?:processing failed|classification unavailable)/i.test(String(log?.detected_intent || ""))) {
    return out("ai_unavailable", "The AI could not process this message, so it was passed to management automatically.");
  }
  if (log?.ticket_created_id || log?.detected_category === "MAINTENANCE" || log?.detected_category === "EMERGENCY") {
    return out("maintenance", "A maintenance or repair issue that needs management follow-up.");
  }

  const gap = noInfo ? gapFor(topic) : null;
  if (human) {
    return out("human_request", "The tenant asked to speak with a person.", gap ? { secondary: gap } : {});
  }
  if (gap) return out(gap.kind, gap.detail, { gap: true });

  if (DECISION_CATEGORIES.has(log?.detected_category)) {
    return out("management_decision", `${String(log.detected_category).replace(/_/g, " ").toLowerCase()}: the AI does not decide these.`);
  }
  const confidence = Number(log?.confidence_score);
  if (Number.isFinite(confidence) && confidence > 0 && confidence < 0.6) {
    return out("ai_uncertain", `The AI was only ${Math.round(confidence * 100)}% confident in its classification.`);
  }
  return out("other", "Escalated by the AI; no specific reason was recorded.");
}

function gapFor(topic) {
  if (!topic) return { kind: "missing_property", ...REASONS.missing_property, detail: "The AI had no confirmed information to answer this question." };
  const kind = topic.kind === "policy" ? "missing_policy" : "missing_property";
  const what = topic.unitSpecific ? `${topic.label} (this unit)` : topic.label;
  return { kind, ...REASONS[kind], detail: `No approved answer about ${what.toLowerCase()} in the AI's knowledge base.` };
}
