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
    assert.match(api, /content: buildSystemPrompt\(tenant\?\.units\?\.properties, \{ approvedKnowledge, withdrawnKnowledge \}\)/);
    // Approved knowledge is loaded for this tenant's own property and unit only.
    assert.match(api, /loadApprovedKnowledge\(supabase, \{ propertyId: tenant\?\.units\?\.property_id, unitId: tenant\?\.unit_id \}\)/);
    assert.doesNotMatch(api, /const SYSTEM_PROMPT/);
    assert.match(api, /properties\(id, name\)/);
  });
  test("an unknown property is not presented to the AI as Clifton Manor", () => {
    assert.match(api, /Property: \$\{tenant\?\.units\?\.properties\?\.name \|\| "Unknown"\}/);
  });
});

// Release test 2026-11-13: after the Unit 2 parking answer ("TEST-2") was retired, the AI repeated it from its own earlier
// reply, because AI replies (sender_id null) were shown to the model as "[Management]" (and a staff reply as "[Tenant]").
const { formatThreadContext, messageSpeaker, loadManagementIds, AI_REPLY_LABEL } = await import("../api/_lib/aiPrompt.js");
const { formatWithdrawnKnowledgeForPrompt, withdrawnEntriesForTenant, formatKnowledgeForPrompt } = await import("../src/lib/agentKnowledge.js");
describe("conversation history: attribution and the AI's own earlier replies", () => {
  const TENANT = "aaaaaaaa-0000-4000-8000-000000000002";
  const OLD_LOGIN = "aaaaaaaa-0000-4000-8000-000000000009"; // the tenant's previous portal login
  const STAFF = "aaaaaaaa-0000-4000-8000-000000000001";
  const managementIds = new Set([STAFF]);
  const thread = [
    { sender_id: TENANT, body: "Which parking spot is assigned to my unit?" },
    { sender_id: null, agent_name: "Modus AI Assistant", body: "Your assigned parking spot is the rear-lot space marked TEST-2." },
    { sender_id: null, body: "Older AI reply without agent_name." },
    { sender_id: STAFF, agent_name: "Modus AI Assistant", body: "AI-drafted reply sent under a staff id." },
    { sender_id: STAFF, body: "Hi, this is management." },
    { sender_id: OLD_LOGIN, body: "Message from my old login." },
  ];

  test("AI replies (null sender or agent_name), verified staff, and tenant messages get the right labels", () => {
    assert.deepEqual(formatThreadContext(thread, { managementIds }).split("\n"), [
      "[Tenant]: Which parking spot is assigned to my unit?",
      `[${AI_REPLY_LABEL}]: Your assigned parking spot is the rear-lot space marked TEST-2.`,
      `[${AI_REPLY_LABEL}]: Older AI reply without agent_name.`,
      `[${AI_REPLY_LABEL}]: AI-drafted reply sent under a staff id.`,
      "[Management]: Hi, this is management.",
      "[Tenant]: Message from my old login.",
    ]);
  });

  test("nothing is attributed to management without verification (no ids, failed lookup, non-landlord roles)", () => {
    for (const ids of [undefined, new Set(), null]) {
      const out = formatThreadContext(thread, { managementIds: ids });
      assert.ok(!out.includes("[Management]"), "unverified senders are never management");
    }
    assert.equal(messageSpeaker(null), "ai");
    assert.equal(formatThreadContext(null), "");
  });

  test("loadManagementIds: only landlord profiles; the tenant's own id is never looked up; failures mean none", async () => {
    let asked = null;
    const db = (rows, error = null) => ({ from: () => ({ select: () => ({ in: async (_c, ids) => { asked = ids; return { data: rows, error }; } }) }) });
    const ids = await loadManagementIds(db([{ id: STAFF, role: "landlord" }, { id: OLD_LOGIN, role: "tenant" }]), thread, TENANT);
    assert.deepEqual([...ids], [STAFF]);
    assert.ok(!asked.includes(TENANT) && asked.includes(OLD_LOGIN) && !asked.includes(null));
    assert.equal((await loadManagementIds(db(null, { message: "denied" }), thread, TENANT)).size, 0);
    assert.equal((await loadManagementIds({ from() { throw new Error("offline"); } }, thread, TENANT)).size, 0);
    assert.equal((await loadManagementIds(db([]), [{ sender_id: null }], TENANT)).size, 0);
  });

  test("the prompt forbids repeating facts from earlier AI replies; the route uses verified labels", () => {
    for (const p of [clifton, other, none]) {
      assert.ok(p.includes(`[${AI_REPLY_LABEL}]`) && /NOT a source of facts/.test(p));
      assert.match(p, /Never repeat a fact from an earlier reply unless it is in the knowledge base/);
    }
    assert.match(api, /select\("sender_id, body, created_at, agent_name"\)/);
    assert.match(api, /loadManagementIds\(supabase, threadMessages, tenant\?\.user_id\)/);
    assert.match(api, /formatThreadContext\(\(threadMessages \|\| \[\]\)\.reverse\(\), \{ managementIds \}\)/);
    assert.ok(!/sender_id === null \? "Management"/.test(api));
  });

  const UNIT = "bbbbbbbb-0000-4000-8000-000000000002", PROP = CLIFTON_MANOR_ID, OTHER_UNIT = "bbbbbbbb-0000-4000-8000-000000000003";
  const retired = { id: "k1", status: "retired", scope: "unit", property_id: PROP, unit_id: UNIT, topic: "Parking (Unit 2, release test)",
    content: "Release test answer for Unit 2: your assigned parking spot is the rear-lot space marked TEST-2.", retired_at: "2026-11-14T04:21:40Z" };

  test("retired: the withdrawn answer is named in the prompt and is not offered as approved", () => {
    const block = formatWithdrawnKnowledgeForPrompt(withdrawnEntriesForTenant([retired], { propertyId: PROP, unitId: UNIT }));
    const p = buildSystemPrompt({ id: PROP, name: "Clifton Manor" }, { approvedKnowledge: formatKnowledgeForPrompt([]), withdrawnKnowledge: block });
    assert.match(p, /WITHDRAWN ANSWERS \(retired by Modus management; they are NO LONGER VALID\)/);
    assert.ok(p.includes("TEST-2") && /Never state or repeat a withdrawn answer, even if it appears in an earlier reply/.test(p));
    assert.ok(!/MANAGEMENT-APPROVED ANSWERS \(/.test(p), "nothing approved");
    assert.match(p, /Currently assigned to: Units 5, 6, 7, 9, 10, 12/, "the real parking list still governs");
  });

  test("replaced: the new approved answer is present and wins; the withdrawn one is labelled as such", () => {
    const replacement = { id: "k2", status: "approved", scope: "unit", property_id: PROP, unit_id: UNIT, topic: "Parking (Unit 2)",
      content: "Unit 2 has no assigned rear-lot space; resident parking is on the street.", approved_at: "2026-11-14T05:00:00Z" };
    const p = buildSystemPrompt({ id: PROP, name: "Clifton Manor" }, {
      approvedKnowledge: formatKnowledgeForPrompt([replacement], { unitNumber: "2" }),
      withdrawnKnowledge: formatWithdrawnKnowledgeForPrompt(withdrawnEntriesForTenant([retired], { propertyId: PROP, unitId: UNIT })),
    });
    assert.ok(p.indexOf("MANAGEMENT-APPROVED ANSWERS (") < p.indexOf("WITHDRAWN ANSWERS ("));
    assert.match(p, /If a MANAGEMENT-APPROVED ANSWER covers the same topic, use that instead/);
  });

  test("withdrawn answers stay scoped: another unit's, another property's, or access-code-like entries are never shown", () => {
    const entries = [
      retired,
      { ...retired, id: "k3", unit_id: OTHER_UNIT, content: "Other unit's spot is B-7." },
      { ...retired, id: "k4", scope: "property", property_id: "cccccccc-0000-4000-8000-000000000001", unit_id: null, content: "Other building's rule." },
      { ...retired, id: "k5", content: "The lockbox code is 4321." },
      { ...retired, id: "k6", status: "approved" },
    ];
    assert.deepEqual(withdrawnEntriesForTenant(entries, { propertyId: PROP, unitId: UNIT }).map((e) => e.id), ["k1"]);
    assert.equal(formatWithdrawnKnowledgeForPrompt([]), "");
    assert.ok(!buildSystemPrompt({ id: PROP }).includes("WITHDRAWN ANSWERS ("));
  });

  test("old conversations: an outdated AI claim in history is labelled unconfirmed; the uncertainty rule remains", () => {
    const ctx = formatThreadContext([{ sender_id: null, body: "The pool opens at 6am." }], { managementIds });
    assert.ok(ctx.startsWith(`[${AI_REPLY_LABEL}]`));
    assert.match(clifton, /I don't have confirmed information on that — I've flagged it for our management team/);
    assert.match(api, /withdrawnIds: withdrawn\.map\(\(k\) => k\.id\)/);
  });
});
