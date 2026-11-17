// api/_lib/ownerRouting.js
// Owner-operated routing (first-tenant pilot): which reports need a qualified specialist rather than the preferred
// handyman, which are property-operations or incident reports for the owner, and how each management notification
// is classed. Pure, no I/O; shared by the server and the landlord/tenant apps. Nothing here dispatches, contacts,
// tows, pays or decides liability: it only labels, so the owner can act.

import { assessSeverity, normalizeMessage } from "./emergencyRules.js";

// ── Specialists ───────────────────────────────────────────────────────────────────────────────────────────────
// `match` is tested against a vendor's category + name to find an approved provider of that trade.
export const TRADES = Object.freeze({
  plumber:     { label: "licensed plumber", match: /plumb/i },
  electrician: { label: "licensed electrician", match: /electric/i },
  hvac:        { label: "HVAC / heating technician", match: /hvac|heat|furnace|boiler|air ?condition/i },
  gas:         { label: "gas utility emergency line, then a licensed gas technician", match: /\bgas\b|hvac/i },
  locksmith:   { label: "locksmith (after police, if there was a break-in)", match: /lock/i },
  structural:  { label: "structural contractor or engineer", match: /structur|engineer/i },
});

const EMERGENCY_TRADE = { water: "plumber", gas: "gas", carbon_monoxide: "hvac", electrical: "electrician", no_heat: "hvac", structural: "structural", security: "locksmith" };
const PRIORITY_TRADE = { heat: "hvac", no_water: "plumber" };
const NO_POWER = /\bno (?:power|electricity)\b|\bpower (?:is |went )?out\b|\bpower outage\b|\bbreakers? (?:keeps? )?trip\w*\b/;
const CATEGORY_TRADE = { electrical: "electrician", hvac: "hvac" };

// { trade, label, emergency } when the ticket needs a qualified specialist (never the general handyman by default),
// else null. Emergencies always name their trade; a few priority repairs do too; an Electrical or Heat/AC request
// needs one unless the text is explicitly minor (e.g. a bulb out).
export function specialistFor(ticket) {
  const text = `${ticket?.title || ""}\n${ticket?.description || ""}`;
  const s = assessSeverity(text);
  const make = (trade, emergency = false) => (trade ? { trade, label: TRADES[trade].label, emergency } : null);
  if (s?.level === "emergency") return make(EMERGENCY_TRADE[s.kind], true);
  if (s?.level === "priority" && PRIORITY_TRADE[s.kind]) return make(PRIORITY_TRADE[s.kind]);
  if (s?.level === "priority" && s.kind === "fixture_unusable" && NO_POWER.test(normalizeMessage(text))) return make("electrician");
  const cat = String(ticket?.category || "").toLowerCase();
  if (CATEGORY_TRADE[cat] && s?.level !== "routine") return make(CATEGORY_TRADE[cat]);
  return null;
}

// An active vendor whose category/name matches the trade (an approved provider), or null.
export function approvedProviderFor(vendors, trade) {
  const t = TRADES[trade];
  if (!t) return null;
  return (Array.isArray(vendors) ? vendors : []).find((v) => v && v.active !== false && t.match.test(`${v.category || ""} ${v.name || ""}`)) || null;
}

// ── Owner topics: property operations and incidents ───────────────────────────────────────────────────────────
const p = (re, unless) => ({ re, unless });
const hit = (list, text) => list.some(({ re, unless }) => re.test(text) && !(unless && unless.test(text)));

const COMMON = String.raw`\b(?:common areas?|hallways?|stairwells?|stairs|lobby|laundry room|basement|parking lot|rear lot|sidewalk|walkway|courtyard|shared (?:entry|entrance|laundry)|front steps|entrance|mailboxes)\b`;
const PROBLEM = String.raw`\b(?:broken|out|dirty|filthy|messy|leak\w*|not working|isn't working|damaged|unsafe|dangerous|smell\w*|trash|garbage|icy|ice|snow|dark|graffiti|spill\w*|blocked|flooded|wet|pothole\w*|light\w*)\b`;
const OPERATIONS = [
  // Complaints only: a question about the parking rules is answered from the property facts, not escalated.
  { kind: "parking", reason: "Parking or vehicle issue", patterns: [
    p(/\b(?:someone|somebody|a (?:car|truck|van|vehicle)|people|they|a neighbou?r)\b[^.!?]{0,30}\b(?:park(?:ed|ing|s)?|is|keeps parking) (?:in|at|on) (?:my|our|the) (?:spot|space|driveway|assigned spot)\b/),
    p(/\bblock(?:ing|ed|s)? (?:my|the|our) (?:car|driveway|spot|space|entrance|exit)\b/),
    p(/\btow(?:ed|ing|s)?\b|\btow truck\b/),
    p(/\b(?:unauthori[sz]ed|abandoned|unknown|strange) (?:car|vehicle|truck)\b|\bparking (?:complaint|problem|issue|dispute)\b/),
  ] },
  { kind: "trash", reason: "Trash, dumpster or recycling problem", patterns: [
    p(/\b(?:dumpsters?|trash|garbage|recycling|bins?)\b[^.!?]{0,40}(?:\b(?:overflow\w*|full|missed|piling|everywhere|smell\w*|rats?|raccoons?)\b|(?:not|n't) (?:been )?(?:picked up|emptied|collected))/, /\bgarbage disposal\b/),
    p(/\boverflowing (?:dumpsters?|trash|garbage|bins?)\b|\bbulk (?:pickup|trash)\b/),
  ] },
  { kind: "common_area", reason: "Common-area or grounds issue", patterns: [
    p(new RegExp(`${COMMON}[^.!?]{0,40}${PROBLEM}|${PROBLEM}[^.!?]{0,40}${COMMON}`)),
    p(/\b(?:snow|ice|icy)\b[^.!?]{0,30}\b(?:sidewalk|walkway|steps|stairs|parking|lot|driveway|not (?:been )?(?:shoveled|shovelled|plowed|salted))\b/),
  ] },
];

const INCIDENT = [
  p(/\b(?:i|we|my \w+|someone|somebody|a (?:guest|visitor|kid|child|neighbou?r))\b[^.!?]{0,20}\b(?:slipped|tripped|fell|was hurt|got hurt|were hurt|injured|was bitten|got bitten)\b/),
  p(/\b(?:dog|cat) bit\b|\binjur(?:y|ies|ed)\b/),
  p(/\b(?:hit|damaged|scratched|dented|keyed|vandali[sz]ed)\b[^.!?]{0,20}\bmy (?:car|vehicle|truck)\b|\bmy (?:car|vehicle|truck)\b[^.!?]{0,20}\b(?:was |got )?(?:hit|damaged|broken into|vandali[sz]ed|stolen|keyed)\b|\bcar accident\b/),
  p(/\bvandal\w*\b|\bstolen\b|\bpolice report\b|\b(?:there was|there's been|had) an? (?:accident|incident)\b/),
];

// { topic: "incident" | "operations", kind, reason } or null. An incident wins (it may also be an operations matter).
export function ownerTopic(message) {
  const text = normalizeMessage(message);
  if (!text) return null;
  if (hit(INCIDENT, text)) return { topic: "incident", kind: "incident", reason: "Incident or injury report" };
  const op = OPERATIONS.find((r) => hit(r.patterns, text));
  return op ? { topic: "operations", kind: op.kind, reason: op.reason } : null;
}

export const OPERATIONS_TENANT_NOTE = "Thanks — this has been passed to the property owner to review. Photos and details (where, when, a plate number for a vehicle) help. Modus doesn't arrange towing or other paid services automatically.";
export const INCIDENT_TENANT_NOTE = "I'm sorry this happened. I've recorded your report and passed it to the property owner. If anyone is hurt or in danger, call 911. Please add when and where it happened, who was involved, and photos if you can take them safely. The owner will follow up; I can't make any decision about responsibility or costs.";
// A reply that admits fault or promises payment is never sent for an incident.
export const LIABILITY_WORDING = /\b(?:we(?:'ll| will| are|'re)? (?:be )?(?:responsible|liable|at fault)|(?:we|modus|the (?:owner|landlord|management))(?:'ll| will) (?:pay|cover|reimburse|compensate|refund)|compensat\w*|reimburs\w*|our fault|we apologi[sz]e for (?:the|your) (?:injury|damage))\b/i;

// ── Notification classes ──────────────────────────────────────────────────────────────────────────────────────
//   urgent_safety    an emergency (911 matter or property emergency)
//   action_required  the owner must decide or do something (new work order, quote, completed work, ops, incident)
//   info             for the record (tenant replied, walkthrough signed)
export const NOTICE_LABELS = Object.freeze({ urgent_safety: "Urgent safety", action_required: "Action required", info: "FYI" });
export const noticeTag = (cls) => `[${NOTICE_LABELS[cls] || NOTICE_LABELS.action_required}]`;
