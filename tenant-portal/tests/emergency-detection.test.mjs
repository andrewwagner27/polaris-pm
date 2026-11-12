// tests/emergency-detection.test.mjs
// Run: npm test   (node --test tests/)
// Phrase corpus for api/_lib/emergencyRules.js. Positive phrases are written the way tenants text
// (typos aside): short, lower/upper case, curly apostrophes, no punctuation. Negative phrases mention the
// same words in ordinary contexts and must NOT produce 911 instructions or an emergency alert.
// Add every real message that was misclassified here.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const { detectEmergency, LIFE_SAFETY_KINDS } = await import("../api/_lib/emergencyRules.js");
const { applySafetyOverrides } = await import("../api/_lib/aiSafety.js");

const POSITIVE = {
  fire: [
    "My stove caught fire", "fire!", "FIRE", "Fire in the kitchen", "kitchen fire", "there's a fire in my unit", "grease fire on the stove",
    "the dryer is smoking", "my outlet is smoking", "smoke is coming out of the vent", "the apartment is full of smoke", "there is smoke everywhere",
    "I smell smoke", "smells like something is burning", "burning smell in the hallway", "something’s burning and I can’t find it",
    "I see flames behind the oven", "the microwave is on fire", "smoke alarm is going off and won't stop", "fire alarm went off and there is smoke",
    "the building is on fire", "Fire. Please help",
  ],
  gas: [
    "I smell gas", "it smells like gas in the kitchen", "smelling gas near the stove", "strong gas smell in the hallway", "I think there's a gas leak",
    "the gas line is hissing", "smells like rotten eggs in here", "there is a hissing sound from the gas meter", "propane smell outside my door",
  ],
  carbon_monoxide: [
    "carbon monoxide alarm is going off", "CO detector beeping and won't stop", "the co alarm went off", "carbon monoxide detector keeps going off",
  ],
  electrical: [
    "the outlet is sparking", "sparks coming from the light switch", "the outlet is melting", "the plug is hot to the touch and smells",
    "exposed wires hanging from the ceiling", "I got shocked by the outlet", "the light switch shocked me", "water is leaking into the outlet",
    "breaker box is buzzing and scorched", "my son got electrocuted",
  ],
  security: [
    "someone is trying to break in", "someone broke into my apartment", "my apartment was broken into", "there's an intruder in the building",
    "someone is in my apartment", "a stranger is inside my unit", "a man is trying to get in my door", "my door was kicked in",
    "a guy with a gun outside my door", "shots fired in the parking lot", "my neighbor threatened me", "he is hitting me",
    "domestic violence", "I'm being followed", "I'm not safe here", "afraid for my life",
  ],
  medical: [
    "my daughter is not breathing", "he's unconscious", "I can't breathe", "my dad is having a heart attack", "she's having a seizure",
    "my friend overdosed", "he is bleeding badly", "my mom passed out", "my roommate collapsed", "I fell and can't get up",
    "my grandma fell and hit her head", "I want to die", "allergic reaction and throat closing",
  ],
  water: [
    "My apartment is flooding", "the basement is flooded", "burst pipe", "a pipe burst under the sink", "water leaking from ceiling",
    "water is pouring through my ceiling", "water everywhere in the bathroom", "toilet overflowing everywhere", "the toilet is overflowing",
    "the washing machine is flooding the floor", "sewage coming up in the tub", "sewer backup in the basement", "the ceiling is sagging and dripping",
    "water heater burst", "major leak in the kitchen",
  ],
  no_heat: [
    "no heat", "we have no heat", "my heat went out", "the heater stopped working and it's 5 degrees out", "the furnace isn't working",
    "heating is broken", "the boiler died", "it's freezing in my apartment", "it is so cold inside", "the pipes are frozen",
    "it's 45 degrees inside", "the heat won't turn on",
  ],
  access: [
    "I'm locked out", "locked myself out of my apartment", "I can't get into my apartment", "the front door won't lock",
    "my door will not close", "the lock is broken", "broken window in the bedroom", "my window was smashed", "key broke in the lock",
  ],
};

const NEGATIVE = [
  "Hi", "When is rent due?", "What are the quiet hours?", "Can I get a parking spot?", "I want to talk to a person",
  "Can I smoke on the balcony?", "Is this a smoke-free building?", "my neighbor smokes on the patio", "where is the fire extinguisher?",
  "the fire alarm battery is chirping", "the smoke detector battery needs replacing", "the smoke detector is chirping every minute",
  "is there a fireplace in unit 3?", "when is the fire inspection?", "my boss fired me so rent may be late", "fire escape window is stuck",
  "how do I use the gas stove?", "the gas bill seems high", "is gas included in rent?", "I need a new carbon monoxide detector",
  "where is the co detector?", "the co detector battery is low", "the light switch is loose", "the outlet doesn't work", "my charger stopped working",
  "the faucet drips slowly", "small leak under the sink", "leaky faucet in the bathroom", "do I need flood insurance?",
  "I was flooded with emails", "the heat is too high", "how do I turn the heat off?", "how do I turn on the heater?",
  "the AC is not cooling well", "someone broke into my car last night", "my bike was broken into... I mean the lock", "my mailbox was broken into",
  "I was shocked by the rent increase", "I'm shocked at the fee", "this new fee is not fair, I feel unsafe about the lease",
  "the plumber is in my apartment now", "a maintenance worker is inside my unit today", "the dryer takes forever", "the oven light is out",
  "my cat knocked over a lamp", "the window screen is torn", "can you fix the lock on my mailbox?", "the door squeaks",
  "I need a new key fob", "thanks for fixing the sink", "the water pressure is low", "the dishwasher won't drain",
  "the fire department came to inspect the alarms", "flame emoji 🔥 love the new gym", "I am flooded with work", "Can I have a fire pit on the patio?",
  "my car broke down", "gas prices are high", "smoke detector beeping", "i burnt my toast lol", "our heater is too loud", "heating bill too high",
  "someone is at the door for a delivery", "I locked the door",
];

describe("emergency phrase corpus", () => {
  for (const [kind, phrases] of Object.entries(POSITIVE)) {
    test(`${kind}: every phrase is detected as ${kind}`, () => {
      const missed = phrases.filter((ph) => detectEmergency(ph)?.kind !== kind).map((ph) => `${ph} → ${detectEmergency(ph)?.kind ?? "none"}`);
      assert.deepEqual(missed, []);
    });
  }
  test("ordinary messages produce no emergency (no needless 911 instructions)", () => {
    const flagged = NEGATIVE.filter((ph) => detectEmergency(ph)).map((ph) => `${ph} → ${detectEmergency(ph).kind}`);
    assert.deepEqual(flagged, []);
  });
});

describe("life safety vs property emergencies", () => {
  test("life-safety kinds are exactly fire, gas, carbon monoxide, electrical, security and medical", () => {
    assert.deepEqual([...LIFE_SAFETY_KINDS].sort(), ["carbon_monoxide", "electrical", "fire", "gas", "medical", "security"]);
  });
  test("life-safety replies start with 911; property replies give safety steps and mention 911 only for people at risk", () => {
    for (const [kind, phrases] of Object.entries(POSITIVE)) {
      const c = applySafetyOverrides({ tier: "TIER3_MAINTENANCE", tenant_reply: "Thanks, noted." }, phrases[0]);
      const first = c.tenant_reply.split("\n\n")[0];
      assert.equal(c.tier, "TIER1_EMERGENCY", kind);
      if (LIFE_SAFETY_KINDS.includes(kind)) assert.match(first, /call 911/i, kind);
      else assert.match(first, /if (?:anyone|you feel unsafe)[^.]*911|call 911 or go somewhere warm|electrical panels/i, kind);
      assert.match(c.tenant_reply, /no 24\/7 emergency phone line yet/);
      assert.doesNotMatch(c.tenant_reply, /has been notified|will call you|is on (?:the|their) way|delivered/i);
    }
  });
  test("ordinary messages keep the model's tier and reply unchanged", () => {
    for (const ph of NEGATIVE.slice(0, 12)) {
      const c = applySafetyOverrides({ tier: "TIER3_MAINTENANCE", urgency: "LOW", tenant_reply: "Sure." }, ph);
      assert.equal(c.tier, "TIER3_MAINTENANCE", ph); assert.equal(c.tenant_reply, "Sure.", ph);
    }
  });
});
