// tests/maintenance-triage.test.mjs
// Smart maintenance triage: ROUTINE (default) / PRIORITY (prompt management attention) / EMERGENCY (immediate
// danger), plus UNCLEAR (ask first). Deterministic layer only (api/_lib/emergencyRules.js + aiSafety.js); no model.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { assessSeverity, detectEmergency } from "../api/_lib/emergencyRules.js";
import { applySafetyOverrides } from "../api/_lib/aiSafety.js";
import { needsNotification } from "../api/_lib/escalationNotify.js";
import { parseEmergencyContacts, contactsFor, formatContacts } from "../api/_lib/emergencyContacts.js";

const level = (m) => assessSeverity(m)?.level ?? "model";
const routineModel = { tier: "TIER3_MAINTENANCE", urgency: "LOW", tenant_reply: "Thanks — please submit it in the Maintenance tab.", escalate_to_landlord: false };
const panickyModel = { tier: "TIER1_EMERGENCY", urgency: "EMERGENCY", tenant_reply: "This is an emergency! Call 911 now.", escalate_to_landlord: true, create_maintenance_ticket: true };

// Pairs: the same word, different severity.
const PAIRS = [
  ["slow drip vs burst pipe", ["The kitchen faucet drips slowly", "routine"], ["A pipe burst under the sink and water is spraying", "emergency"]],
  ["running toilet vs sewage backup", ["My toilet keeps running", "routine"], ["Sewage is coming up in the tub", "emergency"]],
  ["minor mold vs serious moisture", ["Small spot of mold on the bathroom window sill", "routine"], ["Black mold is spreading on the wall after the leak", "priority"]],
  ["ceiling stain vs bulging ceiling", ["There's a small water stain on the ceiling", "routine"], ["The ceiling is bulging and full of water", "emergency"]],
  ["routine heating vs dangerous loss of heat", ["The radiator makes a clanking noise", "model"], ["No heat and I have a newborn", "emergency"]],
  ["contained leak vs worsening leak", ["Small leak under the sink, there's a bowl catching it", "routine"], ["The leak under the sink is getting worse", "priority"]],
];

describe("same words, different severity", () => {
  for (const [name, [a, la], [b, lb]] of PAIRS) {
    test(name, () => {
      assert.equal(level(a), la, a);
      assert.equal(level(b), lb, b);
    });
  }
});

describe("ROUTINE: standard work order, never an emergency alert", () => {
  const ROUTINE = ["The kitchen faucet drips slowly", "My toilet keeps running", "Small spot of mold on the bathroom window sill",
    "There's a small water stain on the ceiling", "The bathroom sink drains slowly", "Scratches on the kitchen counter",
    "The cabinet hinge is loose", "Small leak under the sink, there's a bowl catching it", "Leaky faucet in the bathroom"];
  for (const m of ROUTINE) {
    test(m, () => {
      assert.equal(detectEmergency(m), null);
      const c = applySafetyOverrides(routineModel, m);
      assert.notEqual(c.tier, "TIER1_EMERGENCY");
      assert.equal(c.escalate_to_landlord, false);
      assert.equal(needsNotification(c), false, "no management alert for a routine repair");
      assert.doesNotMatch(c.tenant_reply, /911|emergenc/i);
    });
  }
  test("a model that over-reacts to a routine repair is downgraded, with a calm reply and no ticket/alert", () => {
    const c = applySafetyOverrides(panickyModel, "My toilet keeps running");
    assert.equal(c.tier, "TIER3_MAINTENANCE"); assert.equal(c.urgency, "LOW"); assert.equal(c.create_maintenance_ticket, false);
    assert.equal(c.downgraded_from_emergency, "running_toilet");
    assert.doesNotMatch(c.tenant_reply, /911|emergenc/i);
    assert.match(c.tenant_reply, /routine repair/);
  });
});

describe("PRIORITY: management is told promptly, no emergency alert", () => {
  const PRIORITY = [["No heat", "heat"], ["The furnace stopped working", "heat"], ["We have no hot water", "no_water"],
    ["The leak under the sink is getting worse", "water_worsening"], ["The toilet overflowed but it stopped", "water_worsening"],
    ["Black mold is spreading on the wall after the leak", "mold_moisture"], ["The fridge stopped working", "fixture_unusable"],
    ["I'm locked out", "access"], ["The front door won't lock", "access"], ["Sewer smell in the bathroom", "water_worsening"]];
  for (const [m, kind] of PRIORITY) {
    test(m, () => {
      const s = assessSeverity(m);
      assert.equal(s?.level, "priority", m); assert.equal(s.kind, kind);
      const c = applySafetyOverrides(routineModel, m);
      assert.equal(c.tier, "TIER3_MAINTENANCE"); assert.equal(c.urgency, "HIGH"); assert.equal(c.escalate_to_landlord, true);
      assert.equal(c.severity, "PRIORITY"); assert.equal(c.emergency_kind, undefined);
      assert.ok(needsNotification(c), "management is notified (as an escalation, not an emergency)");
    });
  }
  test("a model emergency on a priority issue becomes a priority repair, not an alert", () => {
    const c = applySafetyOverrides(panickyModel, "No heat");
    assert.equal(c.tier, "TIER3_MAINTENANCE"); assert.equal(c.urgency, "HIGH"); assert.equal(c.escalate_to_landlord, true);
    assert.match(c.tenant_reply, /priority repair/); assert.match(c.tenant_reply, /call 911 if anyone is in danger/);
  });
});

describe("EMERGENCY: fixed safety steps first, emergency work order, management alerted", () => {
  const EMERGENCY = [["I smell gas in the kitchen", "gas", true], ["The carbon monoxide alarm is going off", "carbon_monoxide", true],
    ["There's smoke coming from the outlet", "fire", true], ["The outlet is sparking", "electrical", true], ["Exposed wires hanging from the ceiling", "electrical", true],
    ["Water is dripping into the light fixture", "electrical", true], ["Part of the ceiling caved in", "structural", true],
    ["Water is pouring through the ceiling", "water", false], ["A pipe burst under the sink and water is spraying", "water", false],
    ["Sewage is coming up in the tub", "water", false], ["The basement is flooding", "water", false], ["The pipes are frozen", "no_heat", false]];
  for (const [m, kind, life] of EMERGENCY) {
    test(m, () => {
      const c = applySafetyOverrides(routineModel, m);
      assert.equal(c.tier, "TIER1_EMERGENCY"); assert.equal(c.emergency_kind, kind); assert.equal(c.life_safety, life);
      assert.ok(c.tenant_reply.startsWith(detectEmergency(m).guidance));
      if (life) assert.match(c.tenant_reply.split("\n\n")[0], /911/);
      assert.equal(Boolean(c.create_maintenance_ticket), kind !== "fire", "building emergencies get a work order");
      assert.ok(needsNotification(c));
    });
  }
  test("gas: leave first, call from outside; never asked to look for the leak", () => {
    const g = detectEmergency("I smell gas").guidance;
    assert.match(g, /leave the building now/); assert.match(g, /outside/); assert.match(g, /911 or the gas company/);
    assert.doesNotMatch(g, /check|find|look for|locate/i);
  });
  test("water guidance never sends the tenant under a sagging ceiling or to hunt for the source", () => {
    const g = detectEmergency("water is pouring through the ceiling").guidance;
    assert.match(g, /stay out of any room where the ceiling is bulging or sagging/); assert.match(g, /Don't go looking for the source/);
  });
  test("a follow-up to an earlier emergency is never downgraded", () => {
    const c = applySafetyOverrides(panickyModel, "the leak is getting worse", { recentTenantText: "water is pouring through my ceiling" });
    assert.equal(c.tier, "TIER1_EMERGENCY");
  });
  test("a model emergency on something the rules don't recognise is kept (the model can see what the rules can't)", () => {
    const c = applySafetyOverrides(panickyModel, "Something is very wrong with the boiler room, the floor is hot");
    assert.equal(c.tier, "TIER1_EMERGENCY");
  });
});

describe("UNCLEAR: ask one or two short questions first", () => {
  test("'My ceiling is leaking' → asks about pouring vs drip and bulging, not an emergency yet", () => {
    const s = assessSeverity("My ceiling is leaking");
    assert.equal(s.level, "clarify");
    assert.equal(s.question, "Is water actively pouring through, or is it a small drip? Is the ceiling bulging or sagging?");
    const c = applySafetyOverrides({ ...routineModel, tenant_reply: "Thanks for letting me know." }, "My ceiling is leaking");
    assert.notEqual(c.tier, "TIER1_EMERGENCY"); assert.equal(c.needs_clarification, "ceiling_leak");
    assert.match(c.tenant_reply, /pouring through, or is it a small drip\?/);
  });
  test("a model that already asked a question keeps its own wording", () => {
    const c = applySafetyOverrides({ ...routineModel, tenant_reply: "Is it dripping or pouring?" }, "My ceiling is leaking");
    assert.equal(c.tenant_reply, "Is it dripping or pouring?");
  });
  test("a model emergency on an unclear description is held until the answer, with the question", () => {
    const c = applySafetyOverrides(panickyModel, "My ceiling is leaking");
    assert.equal(c.tier, "TIER3_MAINTENANCE"); assert.match(c.tenant_reply, /bulging or sagging\?/); assert.doesNotMatch(c.tenant_reply, /911/);
  });
  test("the answer decides: pouring/bulging → emergency; small drip → priority", () => {
    assert.equal(level("Yes it's pouring"), "emergency");
    assert.equal(level("it's bulging"), "emergency");
    assert.equal(level("Just a small drip from the ceiling, no bulge"), "priority");
  });
  for (const [m, kind] of [["There's water on the bathroom floor", "water_unclear"], ["The toilet is clogged", "toilet_unusable"],
    ["There is mold in the bathroom", "mold_unclear"], ["There's a leak under the kitchen sink", "leak_unclear"]]) {
    test(m, () => { const s = assessSeverity(m); assert.equal(s.level, "clarify"); assert.equal(s.kind, kind); assert.match(s.question, /\?$/); });
  }
  test("danger already evident → no question, guidance immediately", () => {
    assert.equal(level("My ceiling is leaking and water is pouring onto the outlets"), "emergency");
    assert.equal(level("The ceiling is leaking and it's sagging"), "emergency");
  });
});

describe("property-specific emergency contacts", () => {
  const CLIFTON = "8376ebcd-9e68-4895-aeda-b7b8402868e8", OTHER = "671b1f4c-02d6-493a-b060-d77a4c37b570";
  const cfg = parseEmergencyContacts(JSON.stringify({
    [CLIFTON]: [
      { service: "plumbing", name: "A Plumbing", phone: "(216) 555-0111", hours: "24/7", verified_on: "2026-11-18", tenant_may_call: true },
      { service: "gas_utility", name: "Gas Co", phone: "1-800-555-0112", hours: "24/7", verified_on: "2026-11-18", tenant_may_call: true },
      { service: "electrical", name: "No Agreement Electric", phone: "(216) 555-0113", verified_on: "2026-11-18" },
      { service: "plumbing", name: "Unverified", phone: "(216) 555-0114", tenant_may_call: true },
      { service: "plumbing", name: "Bad number", phone: "call us", verified_on: "2026-11-18", tenant_may_call: true },
    ],
    [OTHER]: [{ service: "plumbing", name: "Chicago Plumbing", phone: "(312) 555-0115", verified_on: "2026-11-18", tenant_may_call: true }],
    "not-a-uuid": [{ service: "plumbing", phone: "(216) 555-0116", verified_on: "2026-11-18", tenant_may_call: true }],
  }));
  test("only verified contacts that agreed to tenant calls are published", () => {
    assert.deepEqual(cfg[CLIFTON].map((c) => c.name), ["A Plumbing", "Gas Co"]);
    assert.equal(cfg["not-a-uuid"], undefined);
  });
  test("contacts follow the emergency kind and the tenant's own property", () => {
    assert.deepEqual(contactsFor({ propertyId: CLIFTON, kind: "water" }, cfg).map((c) => c.name), ["A Plumbing"]);
    assert.deepEqual(contactsFor({ propertyId: CLIFTON, kind: "gas" }, cfg).map((c) => c.name), ["Gas Co"]);
    assert.deepEqual(contactsFor({ propertyId: OTHER, kind: "water" }, cfg).map((c) => c.name), ["Chicago Plumbing"]);
    assert.deepEqual(contactsFor({ propertyId: CLIFTON, kind: "fire" }, cfg), [], "fire is 911 only");
    assert.deepEqual(contactsFor({ propertyId: null, kind: "water" }, cfg), []);
  });
  test("emergency reply: safety steps, then this property's contacts, then the flagged line; routine replies get none", () => {
    const contactsForClifton = (kind) => contactsFor({ propertyId: CLIFTON, kind }, cfg);
    const c = applySafetyOverrides(routineModel, "A pipe burst and water is spraying", { contactsFor: contactsForClifton });
    const parts = c.tenant_reply.split("\n\n");
    assert.match(parts[1], /Emergency plumber \(A Plumbing\): \(216\) 555-0111, 24\/7/);
    assert.doesNotMatch(c.tenant_reply, /555-0115|Chicago/);
    const gas = applySafetyOverrides(routineModel, "I smell gas", { contactsFor: contactsForClifton });
    assert.match(gas.tenant_reply.split("\n\n")[0], /leave the building now/, "evacuation comes before any number");
    assert.match(gas.tenant_reply, /Gas utility emergency line \(Gas Co\)/);
    const routine = applySafetyOverrides(routineModel, "My toilet keeps running", { contactsFor: contactsForClifton });
    assert.doesNotMatch(routine.tenant_reply, /555-01/);
  });
  test("nothing configured (today) → no numbers at all, wording unchanged", () => {
    assert.deepEqual(parseEmergencyContacts(undefined), {});
    assert.deepEqual(parseEmergencyContacts("{not json"), {});
    assert.equal(formatContacts([]), "");
    const c = applySafetyOverrides(routineModel, "A pipe burst and water is spraying", { contactsFor: (kind) => contactsFor({ propertyId: CLIFTON, kind }, {}) });
    assert.doesNotMatch(c.tenant_reply, /\d{3}-\d{4}/);
    assert.match(c.tenant_reply, /no 24\/7 emergency phone line yet/);
  });
});
