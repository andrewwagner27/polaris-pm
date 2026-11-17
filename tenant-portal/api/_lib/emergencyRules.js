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
// Loss of heat, and people for whom it is dangerous (used to tell a dangerous loss of heat from a priority repair).
const NO_HEAT = String.raw`\b(?:no (?:heat|heating)|(?:heat|heating|heater|furnace|boiler)\b[^.!?]{0,25}\b(?:not working|isn't working|doesn't work|won't (?:turn on|come on|work)|stopped(?: working)?|broke|broken|died|went out|is out|failed))`;
const VULNERABLE = String.raw`\b(?:baby|babies|infant|newborn|toddler|elderly|grandm\w+|grandp\w+|pregnant|oxygen|medical condition|disabled|sick (?:child|kid|baby))\b`;
const MOLD = String.raw`\b(?:mou?ld|mildew)\b`;
const MOLD_SERIOUS = String.raw`\b(?:spreading|growing|grown|large|big|huge|everywhere|whole|entire|all over|black|keeps coming back|wet|damp|moist|moisture|water damage|soft|rotting|after (?:the|a) leak|musty|making (?:me|us|my \w+) sick)\b`;
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
      p(/\b(?:passed out|collapsed|fainted|blacked out)\b/, /\b(?:ceiling|wall|floor|roof|stairs|staircase|balcony|porch|deck|shelf|shelves|cabinet|closet rod)\b[^.!?]{0,15}\bcollapsed\b/),
      p(/\b(?:fell|fallen|fall|slipped|tripped)\b[^.!?]{0,25}\b(?:can't get up|hit (?:my|his|her|their) head|hurt|injured|broke|bleeding)\b/),
      p(/\b(?:seriously|badly|really) (?:hurt|injured)\b/),
      p(/\b(?:suicid\w*|kill (?:my|him|her|them)sel(?:f|ves)|end (?:my life|it all)|want to die)\b/),
    ] },
  { kind: "structural", lifeSafety: true,
    guidance: "Get everyone away from that area now, and out of the building if it may not be stable. Don't go back in to check on it. If anyone is hurt or trapped, or more could fall, call 911 from a safe place.",
    patterns: [
      p(/\bceiling\b[^.!?]{0,15}\b(?:has |just )?(?:collapsed|caved in|fell in|fell down|came down|gave way)\b/),
      p(/\b(?:wall|floor|stairs|staircase|stairway|balcony|porch|deck|roof)\b[^.!?]{0,10}\b(?:is |has |just )?(?:collapsing|collapsed|caving in|caved in|giving way|gave way)\b/),
    ] },
  // Property emergencies: active, uncontrolled water or a dangerous loss of heat. Severity words are required;
  // "leak", "water", "toilet", "mold" or "heat" alone are NOT emergencies (see PRIORITY / CLARIFY / ROUTINE below).
  { kind: "water", lifeSafety: false,
    guidance: "Keep away from the water if it's near outlets, cords or appliances, and stay out of any room where the ceiling is bulging or sagging. If you can reach it safely, turn off the water at the shut-off valve for that fixture (usually under the sink or behind the toilet). Don't go looking for the source yourself. If anyone is at risk or the ceiling looks like it could come down, leave that area and call 911. Take photos only if you can do so safely.",
    patterns: [
      p(/\bflood(?:ed|ing|s)?\b/, /\bflood (?:insurance|zone|plain|light|lights)\b|\bflooded with (?:requests|emails|calls|messages|texts|work|questions|orders|notifications)\b|\b(?:a little|a bit|slightly|minor|small|tiny)\b[^.!?]{0,20}\bflood|\bflood\w*\b[^.!?]{0,20}\b(?:a little|a bit|slightly)\b/),
      p(/\b(?:burst|bursting|broken|busted|split|exploded) (?:water )?pipes?\b/),
      p(/\bpipes? (?:burst|broke|split|exploded|is spraying|are spraying|is gushing|is leaking badly)\b/),
      p(/\bwater\b[^.!?]{0,25}\b(?:pouring|gushing|spraying|everywhere|rushing|streaming|won't stop|will not stop|can't stop)\b/),
      p(/\b(?:pouring|gushing|streaming) (?:water|in|through|from|out|down)\b/, /\b(?:rain|raining|outside|snow)\b/),
      p(/\bceiling\b[^.!?]{0,20}\b(?:sagging|bulging|caving|collapsing|falling|coming down|about to (?:fall|collapse|give way|burst)|full of water|filled with water)\b/),
      p(/\b(?:sagging|bulging|swollen) ceiling\b|\bwater (?:bubble|balloon) (?:in|on) the ceiling\b/),
      p(/\b(?:toilet|sink|tub|bathtub|shower|washer|washing machine|dishwasher|water heater|drain)\b[^.!?]{0,20}\b(?:flooding|leaking everywhere|burst)\b/),
      p(/\boverflow\w*\b[^.!?]{0,30}\b(?:everywhere|won't stop|will not stop|can't stop|keeps (?:going|coming)|into (?:the |my )?(?:hall|hallway|bedroom|living room|unit below|apartment below|downstairs)|under the door)\b/),
      p(/\bsewage\b/, /\b(?:smell|smells|smelling|odou?r|stinks?)\b[^.!?]{0,20}\bsewage\b|\bsewage\b[^.!?]{0,15}\b(?:smell|odou?r|stink)/),
      p(/\bsewer (?:backup|back-?up|backing up|coming up)\b|\b(?:sewer|sewage) water\b/),
      p(/\b(?:major|massive|huge) leak\b/),
      // A follow-up answer to "is it pouring or a small drip?"
      p(/\b(?:yes,? |yeah,? )?(?:it'?s|it is) (?:pouring|gushing|bulging|sagging|caving in|coming down)\b/, /\b(?:rain|raining|outside|snow)\b/),
    ] },
  { kind: "no_heat", lifeSafety: false,
    guidance: "If anyone in your home is at risk from the cold — a baby, an older person, or someone who is ill — call 911 or go somewhere warm now. Don't use the oven or a grill to heat your home.",
    patterns: [
      p(/\b(?:frozen|freezing) pipes?\b|\bpipes? (?:are |is |have |has )?(?:frozen|freezing|froze)\b/),
      p(/\b(?:-?\d+|single digits?) degrees (?:in|inside)\b|\binside\b[^.!?]{0,15}\b(?:-?\d|[1-4]\d) degrees\b/),
      p(new RegExp(`${NO_HEAT}[^]{0,80}${VULNERABLE}|${VULNERABLE}[^]{0,80}${NO_HEAT}`)),
      p(new RegExp(`${NO_HEAT}[^]{0,60}\\b(?:-?\\d|[12]\\d|single digits?) degrees (?:out|outside)\\b|${NO_HEAT}[^]{0,60}\\b(?:below zero|below freezing)\\b`)),
    ] },
];

export const EMERGENCY_KINDS = Object.freeze(RULES.map((r) => r.kind));
export const LIFE_SAFETY_KINDS = Object.freeze(RULES.filter((r) => r.lifeSafety).map((r) => r.kind));

// ── PRIORITY: prompt management attention; never an emergency alert ─────────────────────────────────────────
// A priority match makes sure management is told (escalate) and marks the ticket email as priority. `reason` is
// what management sees. Checked only after every emergency rule has failed.
const PRIORITY_RULES = [
  { kind: "heat", reason: "Loss of heat (habitability: needs a prompt response)", patterns: [
    p(/\bno (?:heat|heating)\b/),
    p(/\b(?:heat|heating|heater|furnace|boiler|radiators?)\b[^.!?]{0,25}\b(?:not working|isn't working|doesn't work|won't (?:turn on|come on|work|start)|stopped(?: working)?|broke|broken|died|dead|went out|is out|keeps shutting off|failed|not coming on|no longer working|isn't coming on)\b/,
      /\b(?:too (?:hot|high)|turn (?:the )?(?:heat|heater|furnace) off|how (?:do|can) i)\b/),
    p(new RegExp(`\\b(?:freezing|so cold|really cold|very cold|ice cold|bitterly cold)\\b[^.!?]{0,20}\\b(?:in here|inside|in (?:my|the|our) ${HOME})\\b`)),
  ] },
  { kind: "no_water", reason: "No water or no hot water (habitability)", patterns: [
    p(/\bno (?:running |hot )?water\b/),
    p(/\bhot water\b[^.!?]{0,20}\b(?:not working|isn't working|is out|went out|gone|stopped)\b/),
    p(/\bwater heater\b[^.!?]{0,20}\b(?:not working|isn't working|broken|died|is out|stopped|leaking)\b/),
    p(/\bwater (?:is |was |got |has been )?(?:shut|turned) off\b/),
  ] },
  { kind: "water_worsening", reason: "Leak or water problem that may get worse", patterns: [
    p(/\b(?:leak\w*|drip\w*|water)\b[^.!?]{0,30}\b(?:getting worse|worse than|bigger|faster|spreading|growing|increasing)\b/),
    p(/\b(?:bad|big|steady|constant|active) leak\b/),
    p(/\b(?:toilet|sink|tub|bathtub|shower|dishwasher|washer|washing machine)\b[^.!?]{0,20}\boverflow\w*/),
    p(/\b(?:water|it)(?:'s| is)? overflowing\b/),
    p(/\bstanding water\b/, /\b(?:tub|bathtub|sink|shower)\b/),
    p(/\b(?:a little|a bit|slightly|minor|small|tiny)\b[^.!?]{0,20}\bflood|\bflood\w*\b[^.!?]{0,20}\b(?:a little|a bit|slightly)\b/),
    p(/\bceiling\b[^.!?]{0,25}\b(?:small|slow|tiny|minor|little|slight)\b[^.!?]{0,10}\b(?:drip\w*|leak\w*)|\b(?:small|slow|tiny|minor|little|slight) (?:drip|leak)\b[^.!?]{0,30}\bceiling\b|\bceiling\b[^.!?]{0,20}\b(?:leak\w*|drip\w*) (?:a little|a bit|slightly)\b/),
    p(/\b(?:smell|smells|smelling|odou?r|stinks?)\b[^.!?]{0,20}\bsew(?:age|er)\b|\bsew(?:age|er)\b[^.!?]{0,15}\b(?:smell|odou?r|stink)/),
  ] },
  { kind: "mold_moisture", reason: "Significant moisture or suspected mold growth (needs inspection)", patterns: [
    p(new RegExp(`${MOLD}[^.!?]{0,40}${MOLD_SERIOUS}|${MOLD_SERIOUS}[^.!?]{0,40}${MOLD}`)),
  ] },
  { kind: "fixture_unusable", reason: "Essential fixture or appliance unusable", patterns: [
    p(/\b(?:fridge|refrigerator|freezer)\b[^.!?]{0,25}\b(?:not (?:working|cooling|cold)|isn't (?:working|cooling|cold)|stopped|died|broken|is warm)\b/),
    p(/\b(?:stove|oven|range|cooktop)\b[^.!?]{0,20}\b(?:not working|isn't working|won't (?:turn on|work|light)|stopped working|broken|died)\b/, /\b(?:light|clock|timer)\b/),
    p(/\b(?:only|our only|my only) (?:toilet|bathroom)\b|\b(?:toilet|bathroom)\b[^.!?]{0,30}\b(?:only one|no other)\b/),
    p(/\bno (?:power|electricity)\b|\bpower (?:is |went )?out\b|\bpower outage\b/),
  ] },
  { kind: "access", reason: "Lock-out or a door/window that won't secure", patterns: [
    p(/\block(?:ed)? (?:myself |ourselves )?out\b/),
    p(new RegExp(`\\bcan't get (?:in|into|back into) (?:my|the|our) ${HOME}\\b`)),
    p(/\bkey (?:broke|snapped|is stuck) in the lock\b/),
    p(/\b(?:front |entry |exterior |back |main |apartment |unit )?door\b[^.!?]{0,15}\b(?:won't|will not|doesn't|does not|can't|cannot) (?:lock|close|latch|shut)\b/),
    p(/\b(?:lock|deadbolt)s? (?:is |are )?(?:broken|busted|not working|jammed)\b/, /\bmailbox\b/),
    p(/\bbroken (?:lock|deadbolt|door|window|front door)\b/, /\bmailbox\b/),
    p(/\bwindow (?:is |was |got )?(?:broken|smashed|shattered|cracked open)\b/),
  ] },
];

// ── ROUTINE: explicitly minor. A standard work order; never an emergency, even if the model says so ───────────
const ROUTINE_RULES = [
  { kind: "running_toilet", patterns: [p(/\btoilet\b[^.!?]{0,20}\b(?:keeps running|runs constantly|is running|running|won't stop running|keeps filling)\b/)] },
  { kind: "slow_drip", patterns: [
    p(/\b(?:dripping|drippy|leaky|leaking) (?:faucet|tap|shower ?head|spigot)\b|\b(?:faucet|tap|shower ?head)\b[^.!?]{0,15}\b(?:drips|dripping|leaks|leaking)\b/),
    p(/\b(?:slow|small|tiny|minor|little|slight) (?:drip|leak)\b|\bdrips? (?:slowly|a little)\b/),
  ] },
  { kind: "slow_drain", patterns: [p(/\bslow drain\b|\bdrain(?:s|ing)? slowly\b|\bdrain is slow\b|\b(?:sink|tub|shower|bathtub) (?:is )?(?:clogged|slow)\b|\bclogged (?:sink|tub|shower|drain)\b/)] },
  { kind: "minor_mold", patterns: [p(new RegExp(`\\b(?:small|little|tiny|minor|bit of|spot of|spots of|some surface|surface)\\b[^.!?]{0,15}${MOLD}`))] },
  { kind: "cosmetic", patterns: [p(/\b(?:stain|scratch|scratches|dent|chip|chipped|scuff|scuffs|peeling paint|paint is peeling|crack in the paint|hairline crack)\b/)] },
  { kind: "minor_fixture", patterns: [p(/\b(?:loose|wobbly) (?:door )?(?:handle|hinge|knob|towel bar|cabinet)\b|\b(?:noisy|loud) (?:fan|bathroom fan)\b|\b(?:light ?bulb|bulb) (?:is )?(?:out|burnt|burned)\b/)] },
];

// ── CLARIFY: severity is unknown. Ask (one or two short questions) before treating it as anything more ────────
// `beatsRoutine`: a match wins over a routine hint in the same message (e.g. "toilet runs and there's water on the floor").
const CLARIFY_RULES = [
  { kind: "ceiling_leak", beatsRoutine: true,
    question: "Is water actively pouring through, or is it a small drip? Is the ceiling bulging or sagging?",
    patterns: [p(/\bceiling\b[^.!?]{0,25}\b(?:leak\w*|drip\w*|wet|water)\b|\b(?:leak\w*|drip\w*|water)\b[^.!?]{0,25}\bceiling\b/,
      /^(?![^]*\b(?:drip\w*|leak\w*|wet|coming|pouring|actively)\b)[^]*\b(?:stain\w*|discolou?r\w*|water spot|water mark)\b/)] },
  { kind: "water_unclear", beatsRoutine: true,
    question: "Is water still coming in, or was it a one-time spill? Is it close to any outlets, cords or appliances (if so, stay away from it)?",
    patterns: [p(/\bwater (?:on|all over|across) (?:the |my )?(?:\w+ )?(?:floor|carpet|ground)\b|\bwater (?:is )?coming (?:in|through|out|from|up)\b|\bwater (?:is )?leaking (?:in|into|through)\b/)] },
  { kind: "toilet_unusable",
    question: "Is this the only toilet in your home? Is the water staying in the bowl?",
    patterns: [p(/\btoilet\b[^.!?]{0,20}\b(?:won't flush|will not flush|not flushing|doesn't flush|clogged|is broken|not working)\b|\bclogged toilet\b/)] },
  { kind: "mold_unclear",
    question: "About how big is the area, and is it damp or near a leak? Is anyone having trouble breathing?",
    patterns: [p(new RegExp(MOLD))] },
  { kind: "leak_unclear",
    question: "Is it a slow drip or a steady stream, and is the water staying in one place (for example in a bucket or under the sink)?",
    patterns: [p(/\bleak(?:s|ing|ed|y)?\b/, /\b(?:gas|propane|oil|air)\b[^.!?]{0,10}\bleak|\bleak\w*\b[^.!?]{0,10}\b(?:gas|propane|oil|air)\b/)] },
];

export function normalizeMessage(message) {
  return String(message || "").toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/\s+/g, " ").trim();
}

const matches = (rule, text) => rule.patterns.some(({ re, unless }) => re.test(text) && !(unless && unless.test(text)));

// Returns { kind, lifeSafety, guidance } for the first matching emergency rule (life-safety rules first), or null.
export function detectEmergency(message) {
  const text = normalizeMessage(message);
  if (!text) return null;
  for (const rule of RULES) {
    if (matches(rule, text)) return { kind: rule.kind, lifeSafety: rule.lifeSafety, guidance: rule.guidance };
  }
  return null;
}

// Severity of one tenant message, deterministic and conservative:
//   { level: "emergency", kind, lifeSafety, guidance }   immediate danger — fixed safety steps, Tier 1
//   { level: "priority",  kind, reason }                 prompt management attention — escalated, never an alert
//   { level: "clarify",   kind, question }               unknown severity — ask first
//   { level: "routine",   kind }                         explicitly minor — standard work order
//   null                                                 nothing recognised — the model decides
// Order: emergency → priority → (clarify that beats routine) → routine → clarify.
export function assessSeverity(message) {
  const text = normalizeMessage(message);
  if (!text) return null;
  const emergency = detectEmergency(text);
  if (emergency) return { level: "emergency", ...emergency };
  const pr = PRIORITY_RULES.find((r) => matches(r, text));
  if (pr) return { level: "priority", kind: pr.kind, reason: pr.reason };
  const cl = CLARIFY_RULES.find((r) => matches(r, text));
  if (cl && cl.beatsRoutine) return { level: "clarify", kind: cl.kind, question: cl.question };
  const rt = ROUTINE_RULES.find((r) => matches(r, text));
  if (rt) return { level: "routine", kind: rt.kind };
  if (cl) return { level: "clarify", kind: cl.kind, question: cl.question };
  return null;
}

export const PRIORITY_KINDS = Object.freeze(PRIORITY_RULES.map((r) => r.kind));
// Emergencies that are building problems (a work order is opened); fire, security and medical are not.
export const MAINTENANCE_EMERGENCY_KINDS = Object.freeze(["water", "gas", "carbon_monoxide", "electrical", "no_heat", "structural"]);
