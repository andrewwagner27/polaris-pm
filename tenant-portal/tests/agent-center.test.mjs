// tests/agent-center.test.mjs
// Agent Center intelligence: exact tenant messages, escalation reasons, Teach Agent knowledge, resolution state,
// and the approved knowledge reaching (only) the right tenants' AI prompts.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { classifyEscalation, detectTopic, aiSaidNoConfirmedInfo } = await import("../src/lib/escalationReason.js");
const K = await import("../src/lib/agentKnowledge.js");
const D = await import("../src/lib/agentCenterData.js");
const { loadApprovedKnowledge } = await import("../api/_lib/agentKnowledge.js");
const { buildSystemPrompt, CLIFTON_MANOR_ID } = await import("../api/_lib/aiPrompt.js");
const { buildRoutingLogRow, AI_ROUTING_LOG_COLUMNS } = await import("../api/_lib/routingLog.js");
const { escalationRecapSection } = await import("../api/_lib/escalationNotify.js");

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const P1 = "8376ebcd-9e68-4895-aeda-b7b8402868e8", P2 = "671b1f4c-02d6-493a-b060-d77a4c37b570";
const U2 = "00000000-0000-4000-8000-0000000000a2", U3 = "00000000-0000-4000-8000-0000000000a3";
const NO_INFO = "I don't have confirmed information on that — I've flagged it for our management team to follow up with you directly.";
const esc = (over = {}) => ({ id: "L1", action_taken: "ESCALATE_LANDLORD", detected_category: "GENERAL_INQUIRY", confidence_score: 0.9, raw_openai_response: { tier: "TIER4_DISPUTE" }, ...over });

describe("escalation reason (honest knowledge-gap detection)", () => {
  test("a plain request for a person is not reported as a knowledge gap (the production dummy-tenant escalation)", () => {
    const r = classifyEscalation(esc(), "[Release test] I'd like to speak with someone from management about my lease, please.",
      "I've flagged this for our management team to follow up with you directly regarding your lease.");
    assert.equal(r.kind, "human_request");
    assert.equal(r.gap, false);
    assert.equal(r.secondary, undefined);
  });
  test("a question the AI could not answer is a missing-property-information gap, with the topic", () => {
    const r = classifyEscalation(esc(), "Is there a gym or pool in the building?", NO_INFO);
    assert.equal(r.kind, "missing_property");
    assert.equal(r.gap, true);
    assert.equal(r.topic.label, "Amenities");
  });
  test("unit-specific facts are recognised (which parking spot belongs to my unit)", () => {
    const r = classifyEscalation(esc(), "Which parking spot belongs to my unit?", NO_INFO);
    assert.equal(r.kind, "missing_property");
    assert.equal(r.topic.key, "parking");
    assert.equal(r.topic.unitSpecific, true);
    assert.match(r.detail, /parking \(this unit\)/);
  });
  test("policy questions are a missing-policy gap", () => {
    assert.equal(classifyEscalation(esc(), "Am I allowed to have a cat?", NO_INFO).kind, "missing_policy");
    assert.equal(classifyEscalation(esc(), "Can I sublet my apartment over the summer?", NO_INFO).kind, "missing_policy");
  });
  test("a person request plus an unanswered question keeps both: primary human request, secondary gap", () => {
    const r = classifyEscalation(esc(), "Which parking spot is mine? I'd like to talk to a person.", NO_INFO);
    assert.equal(r.kind, "human_request");
    assert.equal(r.secondary.kind, "missing_property");
  });
  test("no gap is invented when the AI answered (no 'no confirmed information' in the reply)", () => {
    const r = classifyEscalation(esc({ detected_category: "LEASE_LEGAL" }), "I want to break my lease", "I've flagged this for our management team.");
    assert.equal(r.kind, "management_decision");
    assert.equal(r.gap, false);
  });
  test("safety, maintenance, AI unavailable and low confidence", () => {
    assert.equal(classifyEscalation(esc({ raw_openai_response: { tier: "TIER1_EMERGENCY", emergency_kind: "gas" } }), "I smell gas", "").kind, "safety");
    assert.match(classifyEscalation(esc({ raw_openai_response: { tier: "TIER1_EMERGENCY", emergency_kind: "gas" } }), "I smell gas", "").detail, /fixed safety guidance was sent/);
    // Older rows (no emergency_kind) must not claim the fixed guidance was sent.
    const old = classifyEscalation(esc({ raw_openai_response: { tier: "TIER1_EMERGENCY" } }), "there is water coming through my ceiling", "We are on it");
    assert.equal(old.kind, "safety");
    assert.doesNotMatch(old.detail, /guidance was sent/);
    assert.equal(classifyEscalation(esc(), "There's smoke coming from the outlet", "").kind, "safety", "fixed emergency rules apply even if the model missed it");
    assert.equal(classifyEscalation(esc({ detected_category: "MAINTENANCE" }), "My faucet drips", "").kind, "maintenance");
    assert.equal(classifyEscalation(esc({ detected_intent: "AI processing failed — tenant message needs a person" }), "hello?", "").kind, "ai_unavailable");
    assert.equal(classifyEscalation(esc({ confidence_score: 0.4 }), "hmm what about the thing", "Thanks, flagged.").kind, "ai_uncertain");
  });
  test("helpers", () => {
    assert.equal(detectTopic("When is trash pickup?").key, "trash");
    assert.equal(detectTopic("hello"), null);
    assert.ok(aiSaidNoConfirmedInfo("I do not have confirmed information about that."));
    assert.ok(!aiSaidNoConfirmedInfo("Guest parking is on the street."));
  });
});

describe("Teach Agent: suggestions and validation", () => {
  const tenant = { unitId: U2, unitNumber: "2", propertyId: P1, propertyName: "Clifton Manor" };
  test("the suggestion never copies the tenant's claim in as fact; it leaves a blank for management", () => {
    const s = K.suggestKnowledge({ topic: detectTopic("My parking space is #9, right? Which spot belongs to my unit?"), message: "My parking space is #9, right? Which spot belongs to my unit?", tenant });
    assert.equal(s.scope, "unit");
    assert.equal(s.unitId, U2);
    assert.equal(s.topic, "Parking (Unit 2)");
    assert.equal(s.content, `Unit 2: ${K.PLACEHOLDER}`);
    assert.doesNotMatch(s.content, /9/);
    assert.equal(K.validateKnowledge({ scope: s.scope, propertyId: s.propertyId, unitId: s.unitId, topic: s.topic, content: s.content }).ok, false, "the placeholder can't be approved");
  });
  test("management's own reply in the thread is offered as the answer", () => {
    const s = K.suggestKnowledge({ topic: detectTopic("Is there a gym?"), message: "Is there a gym?", managementReply: "There is no gym at Clifton Manor.", tenant });
    assert.equal(s.scope, "property");
    assert.equal(s.content, "There is no gym at Clifton Manor.");
    assert.equal(s.basedOn, "management_reply");
  });
  test("an approved answer validates; scope, length and placeholder rules apply", () => {
    const ok = K.validateKnowledge({ scope: "unit", propertyId: P1, unitId: U2, topic: "Parking (Unit 2)", content: "Unit 2 is assigned parking space 4." });
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.entry, { scope: "unit", property_id: P1, unit_id: U2, topic: "Parking (Unit 2)", content: "Unit 2 is assigned parking space 4." });
    assert.equal(K.validateKnowledge({ scope: "unit", propertyId: P1, topic: "x", content: "y" }).errors.scope, "Choose the unit.");
    assert.equal(K.validateKnowledge({ scope: "organization", topic: "x", content: "a".repeat(601) }).ok, false);
    assert.equal(K.validateKnowledge({ scope: "organization", topic: "x", content: "Unit 2: [your answer here]" }).ok, false);
    const org = K.validateKnowledge({ scope: "organization", propertyId: P1, unitId: U2, topic: "Office hours", content: "The office answers messages Mon–Fri." });
    assert.equal(org.entry.property_id, null, "organization entries carry no property or unit");
  });
  test("access codes are refused", () => {
    for (const c of ["The lockbox code is 4521.", "Door code: 1234", "Use 7788 as the gate pin", "wifi password is 55512345", "Alarm passcode 9090"]) {
      assert.equal(K.validateKnowledge({ scope: "property", propertyId: P1, topic: "Access", content: c }).ok, false, c);
    }
    for (const c of ["Unit 2 is assigned parking space 4.", "Rent is due on the 1st; a $50 late fee applies on the 6th.", "The building is at 12009 Clifton Blvd."]) {
      assert.equal(K.looksLikeAccessSecret(c), false, c);
    }
  });
});

describe("approved knowledge reaches only the right tenants", () => {
  const entries = [
    { id: "k1", scope: "organization", topic: "Office hours", content: "Messages are answered Mon–Fri.", status: "approved", approved_at: "2026-11-01" },
    { id: "k2", scope: "property", property_id: P1, topic: "Gym", content: "There is no gym.", status: "approved", approved_at: "2026-11-02" },
    { id: "k3", scope: "unit", property_id: P1, unit_id: U2, topic: "Parking (Unit 2)", content: "Unit 2 is assigned parking space 4.", status: "approved", approved_at: "2026-11-03" },
    { id: "k4", scope: "unit", property_id: P1, unit_id: U3, topic: "Parking (Unit 3)", content: "Unit 3 is assigned parking space 7.", status: "approved", approved_at: "2026-11-03" },
    { id: "k5", scope: "property", property_id: P2, topic: "Pool", content: "Pool opens in June.", status: "approved", approved_at: "2026-11-03" },
    { id: "k6", scope: "property", property_id: P1, topic: "Old", content: "Retired answer.", status: "retired", approved_at: "2026-10-01" },
  ];
  test("entriesForTenant: own unit, own property and organization only; retired excluded; most specific first", () => {
    assert.deepEqual(K.entriesForTenant(entries, { propertyId: P1, unitId: U2 }).map((e) => e.id), ["k3", "k2", "k1"]);
    assert.deepEqual(K.entriesForTenant(entries, { propertyId: P1, unitId: U3 }).map((e) => e.id), ["k4", "k2", "k1"]);
    assert.deepEqual(K.entriesForTenant(entries, { propertyId: P2, unitId: null }).map((e) => e.id), ["k5", "k1"]);
    assert.deepEqual(K.entriesForTenant(entries, {}).map((e) => e.id), ["k1"]);
  });
  test("loadApprovedKnowledge queries approved rows for this property/unit and filters again; failures mean none", async () => {
    let q;
    const db = { from: (t) => { q = { table: t, eq: [], or: null }; const b = { select() { return b; }, eq(c, v) { q.eq.push([c, v]); return b; }, or(s) { q.or = s; return b; }, order() { return b; }, limit() { return Promise.resolve({ data: entries, error: null }); } }; return b; } };
    const got = await loadApprovedKnowledge(db, { propertyId: P1, unitId: U2 });
    assert.equal(q.table, "agent_knowledge");
    assert.deepEqual(q.eq, [["status", "approved"]]);
    assert.equal(q.or, `scope.eq.organization,and(scope.eq.property,property_id.eq.${P1}),and(scope.eq.unit,unit_id.eq.${U2})`);
    assert.deepEqual(got.map((e) => e.id), ["k3", "k2", "k1"], "another unit's entry is dropped even if the query returned it");
    await loadApprovedKnowledge(db, { propertyId: "1),scope.eq.unit", unitId: "x" });
    assert.equal(q.or, "scope.eq.organization", "non-UUID ids never reach the filter string");
    const missing = { from: () => { const b = { select: () => b, eq: () => b, or: () => b, order: () => b, limit: async () => ({ data: null, error: { code: "42P01", message: "relation does not exist" } }) }; return b; } };
    assert.deepEqual(await loadApprovedKnowledge(missing, { propertyId: P1 }), []);
    const throws = { from: () => { throw new Error("network"); } };
    assert.deepEqual(await loadApprovedKnowledge(throws, { propertyId: P1 }), []);
  });
  test("the prompt carries approved answers; other properties still escalate everything else", () => {
    const block = K.formatKnowledgeForPrompt(K.entriesForTenant(entries, { propertyId: P1, unitId: U2 }), { unitNumber: "2" });
    const clifton = buildSystemPrompt({ id: CLIFTON_MANOR_ID, name: "Clifton Manor" }, { approvedKnowledge: block });
    assert.match(clifton, /MANAGEMENT-APPROVED ANSWERS/);
    assert.match(clifton, /\[This tenant's unit \(Unit 2\)\] Parking \(Unit 2\): Unit 2 is assigned parking space 4\./);
    assert.doesNotMatch(clifton, /parking space 7/);
    assert.match(clifton, /Quiet Hours/, "built-in Clifton facts are kept");
    const other = buildSystemPrompt({ id: P2, name: "Bittersweet" }, { approvedKnowledge: K.formatKnowledgeForPrompt(K.entriesForTenant(entries, { propertyId: P2 })) });
    assert.match(other, /Pool opens in June/);
    assert.match(other, /For anything they don't cover[\s\S]*escalate_to_landlord: true/);
    assert.doesNotMatch(other, /Clifton|Quiet Hours/);
    assert.equal(buildSystemPrompt({ id: P2 }), buildSystemPrompt({ id: P2 }, { approvedKnowledge: "" }), "no knowledge → prompt unchanged");
    assert.match(buildSystemPrompt({ id: P2 }), /No building-specific information/);
  });
});

describe("routing record keeps the context the Agent Center shows", () => {
  test("reply, person request, emergency kind, missing info and knowledge used are stored; columns unchanged", () => {
    const row = buildRoutingLogRow({
      classification: { tier: "TIER4_DISPUTE", category: "GENERAL_INQUIRY", intent_summary: "s", escalate_to_landlord: true, missing_info: ["parking assignment"] },
      tenantId: "t", messageId: "m", ticketId: null, message: "Which spot is mine? talk to a person", reply: "x".repeat(2500), humanRequested: true, knowledgeIds: ["k1"],
    });
    assert.deepEqual(Object.keys(row).filter((c) => !AI_ROUTING_LOG_COLUMNS.includes(c)), []);
    assert.equal(row.raw_message, "Which spot is mine? talk to a person");
    assert.equal(row.raw_openai_response.reply.length, 2000);
    assert.equal(row.raw_openai_response.human_requested, true);
    assert.deepEqual(row.raw_openai_response.missing_info, ["parking assignment"]);
    assert.deepEqual(row.raw_openai_response.knowledge_ids, ["k1"]);
    assert.equal(row.raw_openai_response.tier, "TIER4_DISPUTE");
  });
  test("ordinary rows stay small (no empty context keys)", () => {
    const row = buildRoutingLogRow({ classification: { tier: "TIER3", category: "GENERAL_INQUIRY" }, tenantId: "t", message: "hi" });
    assert.deepEqual(row.raw_openai_response, { tier: "TIER3", category: "GENERAL_INQUIRY" });
  });
});

describe("exact messages and conversation", () => {
  const tenantUser = "user-tenant", landlord = "user-landlord";
  const logs = [
    { id: "A", tenant_id: "T", message_id: "m1", raw_message: "Which spot is mine?", detected_intent: "Tenant asks about parking.", created_at: "2026-11-13T18:00:05Z", raw_openai_response: {} },
    { id: "B", tenant_id: "T", message_id: "m3", raw_message: null, detected_intent: "Tenant is asking about amenities.", created_at: "2026-11-13T19:00:05Z", raw_openai_response: {} },
    { id: "C", tenant_id: "T", message_id: "gone", raw_message: null, detected_intent: "Summary only", created_at: "2026-11-13T20:00:05Z", raw_openai_response: { reply: "Recorded reply" } },
  ];
  const tenantMsgs = [
    { id: "m1", tenant_id: "T", sender_id: tenantUser, body: "Which spot is mine?", created_at: "2026-11-13T18:00:00Z" },
    { id: "m3", tenant_id: "T", sender_id: tenantUser, body: "Is there a gym or pool?", created_at: "2026-11-13T19:00:00Z" },
  ];
  const ai = [
    { id: "a1", tenant_id: "T", sender_id: null, body: "Reply to parking", created_at: "2026-11-13T18:00:03Z" },
    { id: "a3", tenant_id: "T", sender_id: null, body: "Reply to gym", created_at: "2026-11-13T19:00:04Z" },
    { id: "ax", tenant_id: "OTHER", sender_id: null, body: "Another tenant's reply", created_at: "2026-11-13T19:00:03Z" },
  ];
  test("the exact message is used, from the routing record or the thread; the AI summary is never substituted", () => {
    const m = D.attachConversation(logs, tenantMsgs, ai);
    assert.equal(m.get("A").message, "Which spot is mine?");
    assert.equal(m.get("A").messageSource, "routing_record");
    assert.equal(m.get("B").message, "Is there a gym or pool?");
    assert.equal(m.get("B").messageSource, "thread");
    assert.equal(m.get("C").message, null, "no message found → null, not the summary");
    assert.equal(m.get("A").reply, "Reply to parking");
    assert.equal(m.get("B").reply, "Reply to gym", "another tenant's reply is never matched");
    assert.equal(m.get("C").reply, "Recorded reply");
    assert.equal(m.get("C").replySource, "recorded");
  });
  test("transcript window and roles; management's reply is found for Teach Agent suggestions", () => {
    const thread = [
      { id: "x0", sender_id: tenantUser, body: "Hi", created_at: "2026-11-13T17:00:00Z" },
      { id: "x1", sender_id: null, body: "Hey!", created_at: "2026-11-13T17:00:02Z" },
      ...tenantMsgs.slice(0, 1), ai[0],
      { id: "x2", sender_id: landlord, body: "You have space 4.", created_at: "2026-11-13T18:30:00Z" },
    ];
    const w = D.transcriptWindow(thread, "m1", tenantUser, { before: 2, after: 2 });
    assert.deepEqual(w.map((m) => [m.id, m.role, m.focus]), [["x0", "tenant", false], ["x1", "ai", false], ["m1", "tenant", true], ["a1", "ai", false], ["x2", "management", false]]);
    assert.equal(D.managementReplyAfter(thread, "2026-11-13T18:00:05Z", tenantUser), "You have space 4.");
    assert.equal(D.managementReplyAfter(thread, "2026-11-13T18:00:05Z", null), null, "without the tenant's user id nothing is guessed");
  });
});

describe("resolution state (append-only events)", () => {
  test("latest resolved/reopened event wins; knowledge links are kept; knowledge alone does not resolve", () => {
    assert.equal(K.escalationState([]).resolved, false);
    const ev = [
      { event: "knowledge_added", knowledge_id: "k3", created_at: "2026-11-14T10:00:00Z" },
    ];
    assert.equal(K.escalationState(ev).resolved, false, "adding knowledge does not close the escalation");
    ev.push({ event: "resolved", note: "Told tenant space 4", created_at: "2026-11-14T10:01:00Z" });
    assert.deepEqual(K.escalationState(ev), { resolved: true, resolvedAt: "2026-11-14T10:01:00Z", note: "Told tenant space 4", knowledgeIds: ["k3"] });
    ev.push({ event: "reopened", note: "Tenant followed up", created_at: "2026-11-14T11:00:00Z" });
    assert.equal(K.escalationState(ev.slice().reverse()).resolved, false, "order of the input does not matter");
  });
});

describe("daily recap presentation", () => {
  test("shows the exact tenant message once per message, with the AI summary as a secondary line", () => {
    const base = { tenants: { name: "Test User", units: { unit_number: "2" } }, action_taken: "ESCALATE_LANDLORD", created_at: "2026-11-13T18:11:06Z" };
    const rows = [
      { ...base, id: "r1", message_id: "m", raw_message: "I'd like to speak with someone from management about my lease, please.", detected_intent: "Tenant requests to speak with management about their lease.", raw_openai_response: { notify: { status: "sent" } } },
      { ...base, id: "r2", message_id: "m", raw_message: "I'd like to speak with someone from management about my lease, please.", detected_intent: "dup", raw_openai_response: { notify: { status: "duplicate" } } },
    ];
    const s = escalationRecapSection(rows);
    assert.equal(s.count, 1);
    assert.equal(s.needsAttention, 0);
    assert.match(s.html, /“I&#39;d like to speak with someone from management about my lease, please\.”|“I'd like to speak/);
    assert.match(s.html, /AI summary: Tenant requests to speak with management about their lease\./);
    assert.equal((s.html.match(/<tr>/g) || []).length, 1);
  });
});

describe("Agent Center and migration wiring", () => {
  const ui = read("../src/LandlordAgentCenter.jsx");
  const card = read("../src/agent/EscalationCard.jsx");
  const teach = read("../src/agent/TeachAgentModal.jsx");
  const sql = read("../supabase/migrations/20261114000000_agent_knowledge.sql");
  test("no generic summary is shown in place of the tenant message", () => {
    assert.doesNotMatch(ui + card, /raw_message \|\| log\.detected_intent/);
    assert.match(card, /Tenant message \(exact\)/);
    assert.match(card, /original message not available/);
  });
  test("conversation queries are scoped to the escalation's own tenant", () => {
    assert.match(card, /\.from\("messages"\)[\s\S]{0,120}\.eq\("tenant_id", log\.tenant_id\)/);
  });
  test("knowledge is saved only from the explicit Approve action, never automatically", () => {
    assert.equal((teach.match(/\.from\("agent_knowledge"\)/g) || []).length, 1);
    assert.match(teach, /async function approve\(\)[\s\S]*\.from\("agent_knowledge"\)/);
    assert.match(teach, /useState\(false\);[\s\S]*alsoResolve/, "'also resolve' starts unticked");
    assert.doesNotMatch(ui, /from\("agent_knowledge"\)\.insert/);
  });
  test("the migration is additive, landlord-only, append-only for history, and refuses access codes", () => {
    assert.doesNotMatch(sql, /ALTER TABLE public\.(ai_routing_logs|messages|tenants|units|properties)\b/);
    assert.doesNotMatch(sql, /CREATE POLICY[^;]*FOR DELETE/);
    assert.match(sql, /ON public\.agent_knowledge FOR SELECT TO authenticated USING \(public\.is_landlord\(\)\)/);
    assert.doesNotMatch(sql, /ON public\.agent_escalation_events FOR UPDATE/);
    assert.match(sql, /GRANT SELECT, INSERT ON public\.agent_knowledge, public\.agent_escalation_events TO authenticated/);
    assert.match(sql, /agent_knowledge_no_access_secrets/);
    assert.match(sql, /entries cannot be edited, only retired/);
  });
});
