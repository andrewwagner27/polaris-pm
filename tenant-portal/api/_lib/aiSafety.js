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

  // Emergencies are decided by these fixed rules as well as by the model: a model that misses one, or
  // is unavailable, cannot downgrade it. The tenant always gets the fixed safety instruction first.
  const emergency = detectEmergency(message);
  if (emergency) {
    // Tier 1 alone triggers the landlord alert and the management email/SMS (escalationNotify.needsNotification),
    // so the model's routing (e.g. an emergency maintenance ticket) is kept as it decided.
    c.tier = "TIER1_EMERGENCY";
    c.urgency = "EMERGENCY";
    c.emergency_kind = emergency.kind;
    c.life_safety = emergency.lifeSafety;
    const modelReply = String(c.tenant_reply || "").trim();
    c.tenant_reply = [emergency.guidance, FLAGGED_LINE, modelReply].filter(Boolean).join("\n\n");
  }
  return c;
}

// ── Emergencies ─────────────────────────────────────────────────────────────
// lifeSafety: an immediate threat to people → the tenant is told to call 911 first.
// Otherwise a property emergency → management is alerted as an emergency, with safety steps.
// Wording never claims anyone was reached: the reply is written before any notification is sent.
export const FLAGGED_LINE = "I've flagged this to Modus management as an emergency. There's no 24/7 emergency phone line yet, so please don't wait on a reply from this chat if anyone is in danger.";

const NEG = "(?!\\s*(?:extinguisher|alarm|drill|escape|exit|pit|place|code|insurance|inspection|safety))";
const EMERGENCY_RULES = [
  { kind: "gas", lifeSafety: true,
    re: [/\b(smell(s|ing)? (of |like )?gas|gas (leak|smell)|leaking gas|natural gas)\b/i, /\bsmells? like (rotten eggs|sulfur)\b/i],
    guidance: "If you smell gas: leave the building now. Don't use light switches, appliances, lighters or your phone inside. Once you're outside and safe, call 911 or the gas company's emergency line." },
  { kind: "carbon_monoxide", lifeSafety: true,
    re: [/\b(carbon monoxide|co (alarm|detector) (is )?(going off|beeping|sounding))\b/i],
    guidance: "If a carbon monoxide alarm is going off or anyone feels dizzy, sick or drowsy: get everyone outside into fresh air now and call 911." },
  { kind: "fire", lifeSafety: true,
    re: [new RegExp(`\\b(on fire|(a|the) fire${NEG}|fire (in|started|spreading|is (in|spreading|out of control))\\b|flames?\\b|electrical fire|burning smell|smells? (like )?(something )?burning|smoke (is )?(coming|filling|pouring|everywhere)|(there'?s|there is|lots of|full of) smoke|smell(s|ing)? (of )?smoke|(smoke|fire) (alarm|detector)s? (is |are )?(going off|sounding|won'?t stop))`, "i")],
    guidance: "If there is fire or smoke: get everyone out now and call 911 from outside. Don't go back in." },
  { kind: "electrical", lifeSafety: true,
    re: [/\b(sparks?|sparking|arcing)\b/i, /\b(outlet|switch|panel|breaker|wire|wiring|cord)\b[^.!?]{0,40}\b(smok(e|ing)|melt(ed|ing)|scorch(ed)?|burn(ed|ing|t)|hot to the touch|buzzing)\b/i, /\b(exposed|live|downed|hanging) wires?\b/i, /\b(got|getting|was) (an? )?(electric(al)? )?shock(ed)?\b/i, /\belectrocut/i],
    guidance: "If you see sparks, smoke or a melting outlet, or wires are exposed: stay away from it and don't touch it. If there's fire, smoke or anyone is hurt, call 911. If it's safe to reach, switch off that circuit at the breaker." },
  { kind: "security", lifeSafety: true,
    re: [/\b(break[- ]?in|broke in|breaking in|someone (is )?(trying to )?(get|break) in|intruder|burglar|burglary|robbery)\b/i, /\b(someone|somebody|a stranger|a man|a woman)('s| is)? (in|inside) (my|the) (apartment|unit|house|home)\b/i, /\b(threaten(ed|ing) (me|us|to)|assault(ed)?|attack(ed|ing) (me|us)|shots? fired|gunshots?|domestic violence|(has|with|pulled) a (gun|knife|weapon))\b/i],
    guidance: "If you're in danger or someone is trying to get in: call 911 now. Go somewhere safe and lock the door if you can." },
  { kind: "medical", lifeSafety: true,
    re: [/\b(unconscious|not breathing|can'?t breathe|overdos(e|ed|ing)|heart attack|seizure|bleeding (badly|a lot|heavily)|passed out|suicid(e|al)|kill (my|him|her)self)\b/i],
    guidance: "This needs emergency help: call 911 now." },
  { kind: "water", lifeSafety: false,
    re: [/\b(flood(ed|ing)?|burst pipe|pipe (burst|broke)|water (is )?(pouring|gushing|spraying|everywhere|coming (through|from) the ceiling)|ceiling (is )?(leaking|dripping|caving|collapsing)|active leak|sewage|sewer (backup|back(ed|ing) up))\b/i],
    guidance: "If you can do it safely, turn off the water at the shut-off valve for that fixture (usually under the sink or behind the toilet) and keep away from outlets and appliances near the water. If water is near electrical panels or the ceiling is sagging, leave that area. Take photos if you can." },
  { kind: "no_heat", lifeSafety: false,
    re: [/\b(no heat|heat (is )?(not working|out|off|broken)|heating (is )?(not working|out|off|broken)|furnace (is )?(not working|out|off|broken|died)|(it'?s|it is) freezing (in here|inside)|pipes? (are |is )?frozen)\b/i],
    guidance: "If anyone in your home is at risk from the cold — a baby, an older person, or someone who is ill — call 911 or go somewhere warm now. Don't use the oven or a grill to heat your home." },
  { kind: "access", lifeSafety: false,
    re: [/\b(locked out|can'?t get (in|into) (my|the) (apartment|unit|home|house)|(front |entry |exterior )?door (won'?t|will not|doesn'?t|does not) lock|lock (is )?broken|broken (lock|window)|window (is )?broken)\b/i],
    guidance: "If you feel unsafe where you are, call 911. Otherwise stay somewhere safe and secure until management follows up." },
];

// Returns { kind, lifeSafety, guidance } for the first matching rule (life-safety rules first), or null.
export function detectEmergency(message) {
  const text = String(message || "");
  if (!text.trim()) return null;
  for (const rule of EMERGENCY_RULES) {
    if (rule.re.some((re) => re.test(text))) return { kind: rule.kind, lifeSafety: rule.lifeSafety, guidance: rule.guidance };
  }
  return null;
}
export const EMERGENCY_KINDS = Object.freeze(EMERGENCY_RULES.map((r) => r.kind));
