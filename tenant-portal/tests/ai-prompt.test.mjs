// tests/ai-prompt.test.mjs
// Run: npm test   (node --test tests/)
// The tenant AI must state only configured property facts, only for the tenant's own property,
// and never reveal access codes (the prompt previously contained a door entry code, and gave
// Clifton Manor's rules to every tenant). Pure checks; no network, no model calls.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { buildSystemPrompt, CLIFTON_MANOR_ID } = await import("../api/_lib/aiPrompt.js");

const clifton = buildSystemPrompt({ id: CLIFTON_MANOR_ID, name: "Clifton Manor" });
const other = buildSystemPrompt({ id: "671b1f4c-02d6-493a-b060-d77a4c37b570", name: "Bittersweet" });
const none = buildSystemPrompt(undefined);
const api = readFileSync(new URL("../api/classify-and-route.js", import.meta.url), "utf8");

// Matches an access code written next to its label (e.g. "Entry code: 1234"), without naming any real code.
const ACCESS_CODE = /\b(entry|door|gate|lockbox|access|alarm)\s+code\b\s*[:=-]?\s*\d{3,}/i;

describe("no access secrets", () => {
  test("no prompt contains an access code or a standalone 6-digit number", () => {
    for (const p of [clifton, other, none]) {
      assert.doesNotMatch(p, ACCESS_CODE);
      assert.doesNotMatch(p, /\b\d{6}\b/);
      assert.doesNotMatch(p, /entry code\s*:/i);
    }
  });
  test("the API source contains no labelled access code", () => {
    assert.doesNotMatch(api, ACCESS_CODE);
    assert.doesNotMatch(api, /Entry code/);
  });
  test("the AI is told never to share access codes", () => {
    for (const p of [clifton, other, none]) assert.match(p, /Never share door, entry, gate, lockbox, or alarm codes/);
  });
});

describe("grounding", () => {
  test("every prompt carries the only-confirmed-facts rule with the no-information reply", () => {
    for (const p of [clifton, other, none]) {
      assert.match(p, /ONLY CONFIRMED PROPERTY FACTS/);
      assert.match(p, /I don't have confirmed information on that/);
      assert.match(p, /escalate_to_landlord: true/);
    }
  });
  test("Clifton Manor tenants get the configured quiet hours and building facts", () => {
    assert.match(clifton, /Quiet Hours \(Lakewood Ordinance § 515\.03\)/);
    assert.match(clifton, /Sun–Thu: 10:00 PM – 8:00 AM/);
    assert.match(clifton, /Fri–Sat: 11:00 PM – 9:00 AM/);
    for (const fact of ["7 reserved spots in the rear lot", "There is NO shared boiler", "$50 late fee applied on the 6th",
                        "Guest parking: street only", "clear lint filters"]) assert.ok(clifton.includes(fact), fact);
  });
  test("other or unknown properties get no Clifton facts and are told none are configured", () => {
    for (const p of [other, none]) {
      for (const leak of ["Clifton", "Lakewood", "Quiet Hours", "rear lot", "boiler", "$50 late fee", "Units 1–6"]) {
        assert.ok(!p.includes(leak), `leaked: ${leak}`);
      }
      assert.match(p, /No building-specific information/);
    }
  });
});

describe("wiring", () => {
  test("classify-and-route builds the system prompt from the tenant's own property", () => {
    assert.match(api, /content: buildSystemPrompt\(tenant\?\.units\?\.properties, \{ approvedKnowledge \}\)/);
    // Approved knowledge is loaded for this tenant's own property and unit only.
    assert.match(api, /loadApprovedKnowledge\(supabase, \{ propertyId: tenant\?\.units\?\.property_id, unitId: tenant\?\.unit_id \}\)/);
    assert.doesNotMatch(api, /const SYSTEM_PROMPT/);
    assert.match(api, /properties\(id, name\)/);
  });
  test("an unknown property is not presented to the AI as Clifton Manor", () => {
    assert.match(api, /Property: \$\{tenant\?\.units\?\.properties\?\.name \|\| "Unknown"\}/);
  });
});
