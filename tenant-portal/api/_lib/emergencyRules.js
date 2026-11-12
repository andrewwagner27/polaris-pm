// api/_lib/emergencyRules.js
// Deterministic emergency detection for tenant messages and maintenance requests. Pure, no I/O.
//
// It runs IN ADDITION to the AI model: whatever the model says, a message that matches here is Tier 1,
// and the tenant reply starts with the fixed guidance below. A message that doesn't match still gets the
// model's own emergency handling, so this list is a floor, not the whole safety net.
//
// lifeSafety: true  → immediate danger to people: the guidance starts with "call 911".
// lifeSafety: false → urgent property emergency: safety steps; 911 only if someone is at risk.
//
// Patterns are written against a normalized lower-case text (curly quotes straightened, whitespace
// collapsed). Each pattern may carry `unless`: if that matches, the pattern is ignored (e.g. a car
// break-in is a crime but not an emergency inside the home). tests/emergency-detection.test.mjs holds the
// positive and negative phrase corpus; add phrases there whenever a real message is missed.

const APPLIANCE = "(?:stove|oven|range|cooktop|microwave|toaster|dryer|washer|space heater|heater|furnace|outlet|socket|plug|cord|extension cord|wire|wiring|panel|breaker|fuse box|light|lamp|fixture|fan|appliance|fridge|refrigerator|water heater|boiler|tv|charger|battery|power strip)";
const HOME = "(?:apartment|unit|house|home|place|bedroom|bathroom|kitchen|living room|hallway|building)";
const p = (re, unless) => ({ re, unless });

const RULES = [
  { kind: "gas", lifeSafety: true,
    guidance: "If you smell gas: leave the building now. Don't use light switches, appliances, lighters or your phone inside. Once you're outside and safe, call 911 or the gas company's emergency line.",
    patterns: [
      p(/\bsmell(?:s|ing|ed)?\b[^.!?]{0,20}\b(?:gas|propane|natural gas|rotten eggs?|sulfur|sulphur)\b/, /\bgas (?:station|bill|mileage|money)\b/),
      p(/\b(?:gas|propane) (?:leak|leaking|smell|odou?r)\b/),
      p(/\bleak(?:ing|y)? (?:gas|propane)\b/),
      p(/\b(?:gas|propane) (?:line|pipe|meter|valve|tank|stove|burner|range|hose) (?:is |was )?(?:leaking|hissing|broken|damaged|cracked)\b/),
      p(/\bhiss(?:ing)?\b[^.!?]{0,30}\b(?:gas|meter|stove|range|gas line|gas pipe)\b/),
    ] },
  { kind: "carbon_monoxide", lifeSafety: true,
    guidance: "If a carbon monoxide alarm is going off or anyone feels dizzy, sick or drowsy: get everyone outside into fresh air now and call 911.",
    patterns: [
      p(/\b(?:carbon monoxide|co) (?:alarm|detector|monitor)s?\b[^.!?]{0,25}\b(?:going off|went off|sounding|beeping|alarming|won't stop|keeps going off|is on)\b/, /\b(?:battery|chirp)/),
      p(/\bcarbon monoxide (?:leak|poisoning|in (?:the|my|our))\b/),
    ] },
  { kind: "fire", lifeSafety: true,
    guidance: "If there is fire or smoke: get everyone out now and call 911 from outside. Don't go back in.",
    patterns: [
      p(/\b(?:caught|catch|catching|on) fire\b/),
      p(/(?:^|[.!?]\s*)fire\b(?!\s*(?:extinguisher|alarm|drill|escape|exit|pit|place|code|insurance|inspection|safety|door|sprinkler|hydrant))/),
      p(/\bfire\s*!/),
      p(/\b(?:kitchen|grease|stove|oven|electrical|electric|house|apartment|building|dryer|trash|garbage|bedroom|unit|small|big) fire\b/),
      p(/\b(?:a|the) fire\b(?!\s*(?:extinguisher|alarm|drill|escape|exit|pit|place|code|insurance|inspection|safety|door|sprinkler|hydrant|marshal))/,
        /\bfire department\b[^.!?]{0,40}\b(?:inspect\w*|drill|visit\w*|test\w*|check\w*)\b/),
      p(/\bfire (?:in|at|on|started|starting|spreading|is spreading|broke out)\b/),
      p(/\bflames?\b/, /\bflame[- ]?(?:retardant|resistant|emoji|icon)\b/),
      p(/\b(?:there's|there is|lots of|full of|filling with|filled with|thick|black) smoke\b/),
      p(new RegExp(`\\bsmoke (?:is )?(?:coming|filling|pouring|billowing|everywhere|in (?:the|my) ${HOME})`)),
      p(new RegExp(`\\b${APPLIANCE}\\b[^.!?]{0,30}\\b(?:is |are |was |keeps )?(?:smoking|smoldering|smouldering|on fire)\\b`)),
      p(new RegExp(`\\b(?:smoking|smoldering|smouldering) ${APPLIANCE}\\b`)),
      p(/\bsmell(?:s|ing)? (?:of |like )?(?:smoke|burning|something burning|burnt plastic|burning plastic)\b/),
      p(/\b(?:burning|burnt) (?:smell|odou?r|plastic smell)\b/),
      p(/\bsomething(?:'s| is)? burning\b/),
      p(/\b(?:smoke|fire) (?:alarm|detector)s?\b[^.!?]{0,25}\b(?:going off|went off|sounding|ringing|blaring|won't stop|keeps going off)\b/, /\b(?:battery|chirp|low battery|test)/),
    ] },
  { kind: "electrical", lifeSafety: true,
    guidance: "If you see sparks, smoke or a melting outlet, or wires are exposed: stay away from it and don't touch it. If there's fire, smoke or anyone is hurt, call 911. If it's safe to reach, switch off that circuit at the breaker.",
    patterns: [
      p(/\b(?:sparks?|sparking|sparked|arcing)\b/, /\bspark plug|sparks? joy\b/),
      p(new RegExp(`\\b${APPLIANCE}\\b[^.!?]{0,30}\\b(?:melt(?:ed|ing)|scorch(?:ed)?|burn(?:ed|t|ing)|sizzl\\w*|hot to the touch|charred)\\b`)),
      p(/\b(?:exposed|live|bare|downed|dangling) (?:electrical )?wires?\b/),
      p(/\b(?:shock(?:ed)?|electrocut\w*)\b[^.!?]{0,30}\b(?:outlet|socket|switch|plug|wire|wiring|panel|breaker|appliance|cord|light|faucet|shower)\b/),
      p(/\b(?:outlet|socket|switch|plug|wire|wiring|panel|breaker|appliance|cord|light|faucet|shower)\b[^.!?]{0,30}\b(?:shocked|electrocut\w*|gave me a shock)\b/),
      p(/\belectrocut\w*\b/),
      p(/\bwater\b[^.!?]{0,30}\b(?:outlet|electrical panel|breaker box|breaker|fuse box|light fixture|wiring)\b/),
    ] },
  { kind: "security", lifeSafety: true,
    guidance: "If you're in danger or someone is trying to get in: call 911 now. Go somewhere safe and lock the door if you can.",
    patterns: [
      p(/\b(?:break[- ]?in|broke in|breaking in|broken into|broke into|burglar\w*|intruder|prowler|home invasion)\b/,
        /\b(?:car|vehicle|truck|mailbox|bike|bicycle|storage unit|locker)\b[^.!?]{0,25}\b(?:broken into|broke into|break[- ]?in)\b|\b(?:broken into|broke into|break[- ]?in)\b[^.!?]{0,12}\b(?:car|vehicle|truck|mailbox|bike|bicycle|storage unit|locker)\b|\bkey (?:broke|snapped) in\b/),
      p(new RegExp(`\\b(?:someone|somebody|a stranger|a man|a woman|a guy|people|they)(?:'s| is| are)? (?:trying to |attempting to )?(?:get|break|force|kick|bust|come) (?:in|into|through|my door|the door|the window)\\b`)),
      p(new RegExp(`\\b(?:someone|somebody|a stranger|a man|a woman|a guy|people)(?:'s| is| are)? (?:in|inside) (?:my|the|our) ${HOME}\\b`), /\b(?:maintenance|repair|plumber|electrician|technician|contractor|vendor|worker)\b/),
      p(/\b(?:door|window) (?:was |got |has been |is being )?(?:kicked in|forced open|smashed in|pried open|broken in)\b/),
      p(/\b(?:has|with|pulled|waving|holding|pointing) (?:a |an )?(?:gun|knife|weapon|firearm|pistol|rifle)\b/),
      p(/\b(?:shots? fired|gun ?shots?|someone (?:was |got )?shot|stabb(?:ed|ing)|there's a shooting|active shooter)\b/),
      p(/\b(?:threaten(?:ed|ing)|attack(?:ed|ing)|assault(?:ed|ing))\s+(?:me|us|my (?:wife|husband|partner|kids?|child|children|son|daughter|family|roommate|mom|dad))\b/),
      p(/\b(?:is|are|keeps) (?:hitting|beating|hurting|choking) (?:me|us|my)\b/),
      p(/\bdomestic (?:violence|abuse)\b/),
      p(/\b(?:i'm|i am|we're|we are) (?:being (?:followed|stalked)|in danger|not safe|unsafe)\b/, /\b(?:feel|feels) (?:unsafe|not safe) (?:about|with) the (?:lease|rent|fee)/),
      p(/\bafraid for (?:my|our) (?:life|lives|safety)\b/),
    ] },
  { kind: "medical", lifeSafety: true,
    guidance: "This needs emergency help: call 911 now.",
    patterns: [
      p(/\b(?:unconscious|unresponsive|not breathing|isn't breathing|stopped breathing|can't breathe|cannot breathe|trouble breathing|struggling to breathe|choking)\b/, /\bchoking hazard\b/),
      p(/\b(?:overdos(?:e|ed|ing)|heart attack|chest pains?|having a stroke|stroke symptoms|seizure|seizing|anaphyla\w*|allergic reaction)\b/),
      p(/\bbleeding\b[^.!?]{0,15}\b(?:heavily|badly|a lot|everywhere|won't stop|non-?stop)\b/),
      p(/\b(?:passed out|collapsed|fainted|blacked out)\b/),
      p(/\b(?:fell|fallen|fall|slipped|tripped)\b[^.!?]{0,25}\b(?:can't get up|hit (?:my|his|her|their) head|hurt|injured|broke|bleeding)\b/),
      p(/\b(?:seriously|badly|really) (?:hurt|injured)\b/),
      p(/\b(?:suicid\w*|kill (?:my|him|her|them)sel(?:f|ves)|end (?:my life|it all)|want to die)\b/),
    ] },
  { kind: "water", lifeSafety: false,
    guidance: "If you can do it safely, turn off the water at the shut-off valve for that fixture (usually under the sink or behind the toilet) and keep away from outlets and appliances near the water. If water is near electrical panels or the ceiling is sagging, leave that area. Take photos if you can.",
    patterns: [
      p(/\bflood(?:ed|ing|s)?\b/, /\bflood (?:insurance|zone|plain|light|lights)\b|\bflooded with (?:requests|emails|calls|messages|texts|work|questions|orders|notifications)\b/),
      p(/\b(?:burst|bursting|broken|busted|split|exploded) (?:water )?pipes?\b/),
      p(/\bpipes? (?:burst|broke|split|exploded|is spraying|are spraying|is gushing|is leaking badly)\b/),
      p(/\bwater\b[^.!?]{0,20}\b(?:pouring|gushing|spraying|everywhere|rushing|streaming|coming (?:in|through|from|down|out|up))\b/),
      p(/\b(?:leak(?:s|ing)?|drip(?:s|ping)?|water)\b[^.!?]{0,20}\b(?:from|through|in|out of) (?:the |my )?ceiling\b/),
      p(/\bceiling (?:is )?(?:leaking|dripping|sagging|bulging|caving|collapsing|falling)\b/),
      p(/\b(?:toilet|sink|tub|bathtub|shower|washer|washing machine|dishwasher|water heater|drain)\b[^.!?]{0,20}\b(?:overflow(?:ing|ed|s)?|flooding|won't stop running|leaking everywhere|burst)\b/),
      p(/\b(?:water|it)(?:'s| is)? overflowing\b/),
      p(/\b(?:sewage|sewer (?:backup|back-?up|backing up|coming up))\b/),
      p(/\b(?:active|major|massive|huge|bad|big) leak\b/),
      p(/\bstanding water\b/),
    ] },
  { kind: "no_heat", lifeSafety: false,
    guidance: "If anyone in your home is at risk from the cold — a baby, an older person, or someone who is ill — call 911 or go somewhere warm now. Don't use the oven or a grill to heat your home.",
    patterns: [
      p(/\bno (?:heat|heating)\b/),
      p(/\b(?:heat|heating|heater|furnace|boiler|radiators?)\b[^.!?]{0,25}\b(?:not working|isn't working|doesn't work|won't (?:turn on|come on|work|start)|stopped(?: working)?|broke|broken|died|dead|went out|is out|keeps shutting off|failed|not coming on|no longer working|isn't coming on)\b/,
        /\b(?:too (?:hot|high)|turn (?:the )?(?:heat|heater|furnace) off|how (?:do|can) i)\b/),
      p(new RegExp(`\\b(?:freezing|so cold|really cold|very cold|ice cold|bitterly cold)\\b[^.!?]{0,20}\\b(?:in here|inside|in (?:my|the|our) ${HOME})\\b`)),
      p(/\b(?:frozen|freezing) pipes?\b|\bpipes? (?:are |is )?(?:frozen|freezing)\b/),
      p(/\b(?:-?\d+|single digits?) degrees (?:in|inside)\b|\binside\b[^.!?]{0,15}\b(?:-?\d|[1-4]\d) degrees\b/),
    ] },
  { kind: "access", lifeSafety: false,
    guidance: "If you feel unsafe where you are, call 911. Otherwise stay somewhere safe and secure until management follows up.",
    patterns: [
      p(/\block(?:ed)? (?:myself |ourselves )?out\b/),
      p(new RegExp(`\\bcan't get (?:in|into|back into) (?:my|the|our) ${HOME}\\b`)),
      p(/\bkey (?:broke|snapped|is stuck) in the lock\b/),
      p(/\b(?:front |entry |exterior |back |main |apartment |unit )?door\b[^.!?]{0,15}\b(?:won't|will not|doesn't|does not|can't|cannot) (?:lock|close|latch|shut)\b/),
      p(/\b(?:lock|deadbolt)s? (?:is |are )?(?:broken|busted|not working|jammed)\b/),
      p(/\bbroken (?:lock|deadbolt|door|window|front door)\b/),
      p(/\bwindow (?:is |was |got )?(?:broken|smashed|shattered|cracked open)\b/),
    ] },
];

export const EMERGENCY_KINDS = Object.freeze(RULES.map((r) => r.kind));
export const LIFE_SAFETY_KINDS = Object.freeze(RULES.filter((r) => r.lifeSafety).map((r) => r.kind));

export function normalizeMessage(message) {
  return String(message || "").toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/\s+/g, " ").trim();
}

// Returns { kind, lifeSafety, guidance } for the first matching rule (life-safety rules first), or null.
export function detectEmergency(message) {
  const text = normalizeMessage(message);
  if (!text) return null;
  for (const rule of RULES) {
    if (rule.patterns.some(({ re, unless }) => re.test(text) && !(unless && unless.test(text)))) {
      return { kind: rule.kind, lifeSafety: rule.lifeSafety, guidance: rule.guidance };
    }
  }
  return null;
}
