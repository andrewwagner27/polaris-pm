// Urgent management phone line: off by default (no number anywhere), shown only when both number and hours are set.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { managementContact, managementContactFromEnv, flaggedLine, urgentPhoneSentence, phoneRuleForPrompt, NO_PHONE_LINE } from "../src/lib/emergencyContact.js";
import { applySafetyOverrides, FLAGGED_LINE } from "../api/_lib/aiSafety.js";
import { buildSystemPrompt } from "../api/_lib/aiPrompt.js";

const PHONE = "(216) 555-0142"; // fictional 555-01xx test number
const HOURS = "8 AM–9 PM daily";

describe("urgent management contact configuration", () => {
  test("unset or partial configuration means no phone line", () => {
    assert.equal(managementContactFromEnv({}), null);
    assert.equal(managementContact(PHONE, ""), null, "a number without answered hours is never shown");
    assert.equal(managementContact("", HOURS), null);
    assert.equal(managementContact("call me", HOURS), null);
    assert.equal(managementContact("911", HOURS), null, "too short to be a management line");
    assert.equal(managementContact(PHONE, "<script>"), null);
    assert.equal(managementContact(PHONE, "x".repeat(81)), null);
  });
  test("valid number + hours are accepted and trimmed", () => {
    assert.deepEqual(managementContactFromEnv({ MANAGEMENT_URGENT_PHONE: ` ${PHONE} `, MANAGEMENT_URGENT_HOURS: ` ${HOURS} ` }), { phone: PHONE, hours: HOURS });
    assert.ok(managementContact("+1 216-555-0142", "24/7"));
  });
  test("default wording is unchanged from production", () => {
    assert.equal(FLAGGED_LINE, "I've flagged this to Modus management as an emergency. There's no 24/7 emergency phone line yet, so please don't wait on a reply from this chat if anyone is in danger.");
    assert.equal(urgentPhoneSentence(null), NO_PHONE_LINE);
    assert.match(phoneRuleForPrompt(null), /Never give a phone number/);
    const prompt = buildSystemPrompt({ id: "x" });
    assert.match(prompt, /There is no 24\/7 emergency phone line yet\. Never give a phone number/);
    assert.doesNotMatch(prompt, /\$\{/);
  });
  test("with a configured line: 911 first, number and hours given, nobody claimed reached", () => {
    const c = managementContact(PHONE, HOURS);
    for (const line of [flaggedLine(c), urgentPhoneSentence(c)]) {
      assert.match(line, /911/);
      assert.ok(line.includes(PHONE) && line.includes(HOURS));
      assert.doesNotMatch(line, /no 24\/7/);
      assert.doesNotMatch(line, /(has been|was) (reached|called|contacted)|on (their|the) way/i);
    }
    const prompt = buildSystemPrompt({ id: "x" }, { urgentContact: c });
    assert.ok(prompt.includes(`The only phone number you may give is Modus management's urgent line, ${PHONE}, answered ${HOURS}`));
    assert.doesNotMatch(prompt, /Never give a phone number/);
  });
  test("emergency replies carry the configured line after the fixed 911 guidance", () => {
    const c = managementContact(PHONE, HOURS);
    const out = applySafetyOverrides({ tier: "TIER3_MAINTENANCE", tenant_reply: "Ok." }, "There is smoke coming from the outlet!", { contact: c });
    assert.equal(out.tier, "TIER1_EMERGENCY");
    assert.ok(out.tenant_reply.indexOf("911") < out.tenant_reply.indexOf(PHONE));
    const dflt = applySafetyOverrides({ tier: "TIER3_MAINTENANCE", tenant_reply: "Ok." }, "There is smoke coming from the outlet!");
    assert.ok(dflt.tenant_reply.includes(FLAGGED_LINE));
    assert.ok(!/\d{3}\D{0,2}\d{3}-\d{4}/.test(dflt.tenant_reply), "no number when none is configured");
  });
  test("the AI route and the maintenance form read the configuration; no number is hard-coded", () => {
    const api = readFileSync(new URL("../api/classify-and-route.js", import.meta.url), "utf8");
    assert.ok(api.includes("const urgentContact = () => managementContactFromEnv(globalThis.process?.env || {});"));
    assert.equal((api.match(/urgentContact\(\)/g) || []).length, 3, "used by the prompt, the safety overrides and the fallback reply");
    const form = readFileSync(new URL("../src/MaintenanceRequestForm.jsx", import.meta.url), "utf8");
    assert.match(form, /VITE_MANAGEMENT_URGENT_PHONE/);
    assert.match(form, /Call 911 first/);
    for (const src of [api, form, readFileSync(new URL("../src/lib/emergencyContact.js", import.meta.url), "utf8")]) {
      assert.ok(!/\(\d{3}\) \d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b/.test(src), "no phone number in source");
    }
  });
});
