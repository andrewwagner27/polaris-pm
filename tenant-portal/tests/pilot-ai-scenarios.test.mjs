// tests/pilot-ai-scenarios.test.mjs
// First-tenant pilot scenarios for the deterministic AI layer (no model calls): ordinary questions stay ordinary,
// urgent messages become Tier 1 with 911-first guidance, requests for a person escalate, and a tenant of one
// property never receives another property's facts or approved answers.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applySafetyOverrides, detectEmergency, wantsHuman } from "../api/_lib/aiSafety.js";
import { buildSystemPrompt, CLIFTON_MANOR_ID } from "../api/_lib/aiPrompt.js";
import { entriesForTenant, formatKnowledgeForPrompt } from "../src/lib/agentKnowledge.js";

const BITTERSWEET_ID = "671b1f4c-02d6-493a-b060-d77a4c37b570";
const CLIFTON_UNIT = "fba894cd-53f6-4857-a859-d86507eef210";
const model = { tier: "TIER3_MAINTENANCE", urgency: "LOW", tenant_reply: "Thanks, I've logged that.", escalate_to_landlord: false };

describe("pilot: ordinary maintenance questions are not emergencies", () => {
  for (const m of ["My kitchen faucet drips a little", "The bathroom fan is noisy", "When is trash pickup?", "Where do I park my car?",
    "A cabinet door hinge is loose", "Can someone look at my dishwasher? It doesn't drain fully", "What are the quiet hours?"]) {
    test(m, () => {
      assert.equal(detectEmergency(m), null);
      const c = applySafetyOverrides(model, m);
      assert.notEqual(c.tier, "TIER1_EMERGENCY");
      assert.equal(c.tenant_reply, model.tenant_reply);
    });
  }
});

describe("pilot: urgent messages become Tier 1 with fixed guidance first", () => {
  const cases = [
    ["I smell gas in the kitchen", true], ["There's smoke coming from the outlet", true], ["The carbon monoxide alarm is going off", true],
    ["Someone is trying to break in", true], ["My toilet is overflowing and water is everywhere", false],
    ["No heat and I have a newborn", false], ["Water is pouring through the ceiling", false], ["The ceiling is sagging and full of water", false],
  ];
  for (const [m, life] of cases) {
    test(m, () => {
      const c = applySafetyOverrides(model, m);
      assert.equal(c.tier, "TIER1_EMERGENCY");
      assert.equal(c.life_safety, life);
      assert.ok(c.tenant_reply.startsWith(detectEmergency(m).guidance));
      if (life) assert.match(c.tenant_reply.split("\n\n")[0], /911/);
      assert.match(c.tenant_reply, /flagged this to Modus management/);
      assert.doesNotMatch(c.tenant_reply, /(has been|was) (reached|called)|on (their|the) way/i);
    });
  }
});

describe("pilot: requests for a person always escalate", () => {
  for (const m of ["Can I talk to a real person?", "I want to speak with the property manager", "Is this a bot?"]) {
    test(m, () => {
      assert.ok(wantsHuman(m));
      assert.equal(applySafetyOverrides(model, m).escalate_to_landlord, true);
    });
  }
});

describe("pilot: no cross-property information", () => {
  const entries = [
    { id: "a", scope: "property", property_id: CLIFTON_MANOR_ID, unit_id: null, topic: "Amenities", content: "Clifton Manor: on-site laundry.", status: "approved" },
    { id: "b", scope: "property", property_id: BITTERSWEET_ID, unit_id: null, topic: "Parking", content: "Bittersweet garage spot B4.", status: "approved" },
    { id: "c", scope: "unit", property_id: CLIFTON_MANOR_ID, unit_id: "other-unit", topic: "Parking", content: "Unit 9 spot 3.", status: "approved" },
    { id: "d", scope: "organization", property_id: null, unit_id: null, topic: "Office", content: "Report maintenance in the portal.", status: "approved" },
  ];
  test("a Clifton Manor tenant gets Clifton + organization answers only", () => {
    const ids = entriesForTenant(entries, { propertyId: CLIFTON_MANOR_ID, unitId: CLIFTON_UNIT }).map((e) => e.id).sort();
    assert.deepEqual(ids, ["a", "d"]);
  });
  test("a Bittersweet tenant gets Bittersweet + organization answers only", () => {
    const ids = entriesForTenant(entries, { propertyId: BITTERSWEET_ID, unitId: null }).map((e) => e.id).sort();
    assert.deepEqual(ids, ["b", "d"]);
  });
  test("the Bittersweet prompt contains no Clifton Manor facts", () => {
    const approved = formatKnowledgeForPrompt(entriesForTenant(entries, { propertyId: BITTERSWEET_ID }), {});
    const p = buildSystemPrompt({ id: BITTERSWEET_ID, name: "Bittersweet" }, { approvedKnowledge: approved });
    for (const leak of ["Clifton", "12009", "rear lot", "Units 5, 6, 7", "Unit 9 spot", "on-site laundry"]) assert.ok(!p.includes(leak), leak);
    assert.match(p, /don't have confirmed information/);
  });
  test("the Clifton Manor prompt carries its building facts", () => {
    const p = buildSystemPrompt({ id: CLIFTON_MANOR_ID, name: "Clifton Manor" });
    for (const fact of ["PARKING", "Quiet Hours", "Basement/Laundry", "HEATING"]) assert.ok(p.includes(fact), fact);
    assert.ok(!p.includes("Bittersweet"));
  });
});
