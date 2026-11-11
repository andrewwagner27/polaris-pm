// tests/ai-safety.test.mjs
// Run: npm test   (node --test tests/)
// Release A regression tests for the tenant AI (/api/classify-and-route). Original failures:
//  1. Every tenant looked unpaid (legacy rent_payments was empty) → false "late rent" alerts on
//     every message, a dormant $50 late-fee write, and the AI told rent "has not been paid".
//  2. A complaint naming a unit could make the AI send a "NOTICE OF LEASE VIOLATION" to that
//     tenant with no human review (and record the incident as notice_sent).
//  3. Replies came from fictional named staff with stock photos after a fake 45–120 s delay,
//     and the tenant screen never disclosed the AI or offered a person.
// Pure + source checks; no network, no database, no model calls.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { AI_ASSISTANT_NAME, buildRentContext, wantsHuman, applySafetyOverrides } = await import("../api/_lib/aiSafety.js");
const { buildSystemPrompt, CLIFTON_MANOR_ID } = await import("../api/_lib/aiPrompt.js");
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const api = src("api/classify-and-route.js");
const ui = src("src/MessagingScreen.jsx");
const prompts = [buildSystemPrompt({ id: CLIFTON_MANOR_ID }), buildSystemPrompt({ id: "other" }), buildSystemPrompt(undefined)];

describe("1. rent status comes only from the active A2 ledger", () => {
  test("inactive ledger, missing result, or an error → no payment-status context", () => {
    for (const due of [null, undefined, {}, { ledger_active: false }, { ledger_active: false, past_due_cents: 134500 }]) {
      assert.equal(buildRentContext(due), "", JSON.stringify(due));
    }
  });
  test("active ledger with nothing past due → no context (the old code called everyone unpaid)", () => {
    for (const p of [0, -500, null, "abc"]) assert.equal(buildRentContext({ ledger_active: true, past_due_cents: p }), "");
  });
  test("active ledger with an amount past due → that exact amount, and nothing else invented", () => {
    const c = buildRentContext({ ledger_active: true, past_due_cents: 134500 });
    assert.match(c, /\$1,345\.00 past due/);
    assert.match(c, /CONFIRMED LEDGER/);
    assert.match(c, /Do not state any other amount, date, or fee/);
    assert.doesNotMatch(c, /has not been paid|3-day notice|late fee of/i);
  });
  test("the handler reads the A2 ledger and never the legacy rent_payments table", () => {
    assert.match(api, /rpc\("a2_pay_rent_internal", \{ p_tenant: tenant_id \}\)/);
    assert.match(api, /buildRentContext\(/);
    assert.doesNotMatch(api, /from\("rent_payments"\)/);
    assert.doesNotMatch(api, /has not been paid/);
  });
  test("messaging never creates late-rent alerts or late fees", () => {
    assert.doesNotMatch(api, /late_rent/);
    assert.doesNotMatch(api, /late_fee/);
    assert.doesNotMatch(api, /3-day notice/);
  });
  test("the AI is told never to claim payment status without a confirmed ledger line", () => {
    for (const p of prompts) assert.match(p, /Never state or suggest that the tenant's rent is paid, unpaid, late, or owed/);
    for (const p of prompts) assert.doesNotMatch(p, /If the tenant's rent is past due/);
  });
});

describe("2. no automatic violation notices; complaints go to a human", () => {
  test("a complaint naming a unit is escalated and never sends a notice (original failure case)", () => {
    const model = { create_incident_log: true, send_violation_notice: true, offending_unit_hint: "3", escalate_to_landlord: false, category: "NOISE_COMPLAINT" };
    const c = applySafetyOverrides(model, "My neighbor in unit 3 plays loud music every night.");
    assert.equal(c.send_violation_notice, false);
    assert.equal(c.escalate_to_landlord, true);
    assert.equal(model.send_violation_notice, true, "input is not mutated");
  });
  test("send_violation_notice is forced false even without an incident", () => {
    assert.equal(applySafetyOverrides({ send_violation_notice: true }, "hi").send_violation_notice, false);
  });
  test("the handler contains no notice text and no message to another tenant", () => {
    assert.doesNotMatch(api, /NOTICE OF LEASE VIOLATION/);
    assert.doesNotMatch(api, /offendingTenant/);
    assert.equal((api.match(/from\("messages"\)\.insert\(/g) || []).length, 1, "only the reply to the tenant is inserted");
    const reply = api.slice(api.indexOf('from("messages").insert('), api.indexOf("if (replyErr)"));
    assert.match(reply, /recipient_id: tenant\?\.user_id/);
    assert.match(reply, /tenant_id: tenant_id/);
  });
  test("incidents are recorded as open (never notice_sent), with an exact unit match", () => {
    assert.match(api, /status: "open"/);
    assert.doesNotMatch(api, /notice_sent/);
    assert.doesNotMatch(api, /\.ilike\("unit_number"/);
  });
  test("overrides are applied before tickets, incidents, alerts and the routing log", () => {
    const at = api.indexOf("classification = applySafetyOverrides(classification, message)");
    assert.ok(at > 0);
    for (const later of ["create_maintenance_ticket) {", 'from("incident_logs")', 'from("landlord_alerts")', 'from("ai_routing_logs")']) {
      assert.ok(api.indexOf(later) > at, later);
    }
  });
  test("the AI is told never to issue notices or accuse another tenant", () => {
    for (const p of prompts) assert.match(p, /Never issue a notice, warning, or violation/);
    assert.match(api, /Always false\. The assistant never issues violation notices/);
  });
});

describe("3. AI identity, disclosure and a way to reach a person", () => {
  test("no fictional staff personas, stock photos or artificial delay in the handler", () => {
    for (const gone of ["STAFF_PERSONAS", "getPersonaForTenant", "getReplyDelay", "Rachel B.", "Sarah M.", "unsplash", "sleep("]) {
      assert.ok(!api.includes(gone), `still present: ${gone}`);
    }
  });
  test("replies are stored as the Modus AI Assistant with no photo", () => {
    assert.equal(AI_ASSISTANT_NAME, "Modus AI Assistant");
    assert.match(api, /agent_name: AI_ASSISTANT_NAME,/);
    assert.match(api, /agent_photo: null,/);
  });
  test("the AI is told it is an AI and never a person", () => {
    for (const p of prompts) {
      assert.match(p, /You are the Modus AI Assistant/);
      assert.match(p, /You are an AI assistant, not a person/);
      assert.doesNotMatch(p, /Not a robot|A real person/);
    }
  });
  test("requests for a person are always escalated", () => {
    for (const m of ["I want to speak to a real person from management, please.", "Can I talk to someone?", "I'd like to talk to a person from management, please.",
                     "human please", "Is this a bot?", "Are you real?", "I want to speak with the property manager"]) {
      assert.equal(wantsHuman(m), true, m);
      assert.equal(applySafetyOverrides({ escalate_to_landlord: false }, m).escalate_to_landlord, true, m);
    }
  });
  test("ordinary questions are not treated as human requests", () => {
    for (const m of ["What are the quiet hours?", "My dishwasher stopped draining.", "Is parking available?", "Can my guest park overnight?", ""]) {
      assert.equal(wantsHuman(m), false, m);
      assert.equal(applySafetyOverrides({ escalate_to_landlord: false }, m).escalate_to_landlord, false, m);
    }
  });
  test("the tenant chat screen discloses the AI and labels every AI reply as the AI", () => {
    assert.match(ui, /an automated assistant, not a person/);
    assert.match(ui, /\{AI_DISCLOSURE\}/);
    assert.match(ui, /isAiMessage\(item\) \? `\$\{AI_LABEL\} · AI`/);
    assert.doesNotMatch(ui, /item\.agent_name\} · Modus Property Management/, "stored fake names are no longer shown");
  });
  test("no stock photos or 'replies within a few hours' on the tenant chat screen", () => {
    assert.doesNotMatch(ui, /agent_photo|unsplash|Usually replies within a few hours/);
  });
  test("the tenant has an obvious 'Talk to a person' action that triggers escalation", () => {
    assert.ok((ui.match(/Talk to a person/g) || []).length >= 2, "header button and quick reply");
    const msg = ui.match(/TALK_TO_PERSON_MESSAGE = "([^"]+)"/)[1];
    assert.equal(wantsHuman(msg), true);
    assert.match(ui, /sendMessage\(TALK_TO_PERSON_MESSAGE\)/);
  });
});
