// tests/routing-log.test.mjs
// Run: npm test   (node --test tests/)
// Regression: /api/classify-and-route wrote agent_name into ai_routing_logs, a column the table
// does not have, so every insert failed (logged only server-side) and the landlord's Agent Center
// stopped receiving escalations after 2026-10-20. Pure checks; no network, no database.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { AI_ROUTING_LOG_COLUMNS, ROUTING_ACTIONS, routingAction, buildRoutingLogRow } =
  await import("../api/_lib/routingLog.js");

const base = {
  tier: "TIER3_MAINTENANCE", category: "GENERAL_INQUIRY", confidence: 0.9, urgency: "LOW",
  intent_summary: "Tenant asks when rent is due", tenant_reply: "Rent is due on the 1st.",
  escalate_to_landlord: false, create_maintenance_ticket: false, dispatch_vendor: false,
};
const row = (c, extra = {}) => buildRoutingLogRow({
  classification: { ...base, ...c }, tenantId: "tenant-1", messageId: "msg-1", ticketId: null,
  message: "what day is rent due?", ...extra,
});
const unknownColumns = (r) => Object.keys(r).filter((k) => !AI_ROUTING_LOG_COLUMNS.includes(k));

describe("ai_routing_logs row", () => {
  test("writes only columns that exist in the table (the agent_name failure)", () => {
    for (const c of [{}, { escalate_to_landlord: true }, { create_maintenance_ticket: true }]) {
      assert.deepEqual(unknownColumns(row(c)), []);
    }
    assert.equal("agent_name" in row({}), false);
  });

  test("the column check rejects a field the table does not have", () => {
    assert.deepEqual(unknownColumns({ ...row({}), agent_name: "Rachel B." }), ["agent_name"]);
  });

  test("an escalated message is logged as ESCALATE_LANDLORD with the tenant's words", () => {
    const r = row({ escalate_to_landlord: true, tier: "TIER4_DISPUTE", category: "LEASE_LEGAL" });
    assert.equal(r.action_taken, "ESCALATE_LANDLORD");
    assert.equal(r.tenant_id, "tenant-1");
    assert.equal(r.message_id, "msg-1");
    assert.equal(r.raw_message, "what day is rent due?");
  });

  test("an ordinary AI-answered message is NOT marked as an escalation", () => {
    assert.equal(row({}).action_taken, "AUTO_REPLY");
  });

  test("a ticket without escalation is CREATE_TICKET; escalation takes precedence over a ticket", () => {
    assert.equal(row({ create_maintenance_ticket: true }).action_taken, "CREATE_TICKET");
    assert.equal(row({ create_maintenance_ticket: true, escalate_to_landlord: true }).action_taken, "ESCALATE_LANDLORD");
  });

  test("the AI-unavailable fallback is escalated for human review", () => {
    assert.equal(routingAction({ escalate_to_landlord: true, create_maintenance_ticket: false }), "ESCALATE_LANDLORD");
  });

  test("action_taken always satisfies the table's CHECK constraint", () => {
    for (const c of [{}, { escalate_to_landlord: true }, { create_maintenance_ticket: true }, null, undefined]) {
      assert.ok(ROUTING_ACTIONS.includes(routingAction(c)));
    }
  });

  test("message_id is null (not undefined) when absent", () => {
    assert.equal(row({}, { messageId: undefined }).message_id, null);
  });
});

describe("wiring", () => {
  const api = readFileSync(new URL("../api/classify-and-route.js", import.meta.url), "utf8");
  const agentCenter = readFileSync(new URL("../src/LandlordAgentCenter.jsx", import.meta.url), "utf8");

  test("classify-and-route builds the routing-log row with buildRoutingLogRow", () => {
    // Every routing row is built by buildRoutingLogRow and written by insertRoutingLog (one retry).
    const inserts = api.match(/from\("ai_routing_logs"\)\.insert\([^)]*\)/g) || [];
    assert.deepEqual(inserts, ['from("ai_routing_logs").insert(row)'], "the only insert is insertRoutingLog's");
    const calls = (api.match(/insertRoutingLog\([^;]*/g) || []).filter((c) => !c.startsWith("insertRoutingLog(row"));
    assert.ok(calls.length >= 2, "main path and fail-safe both write a routing row");
    for (const c of calls) assert.match(c, /^insertRoutingLog\(buildRoutingLogRow\(/, c);
  });

  test("every column Agent Center selects from ai_routing_logs exists", () => {
    const start = agentCenter.indexOf('.from("ai_routing_logs")');
    const sel = agentCenter.slice(start).match(/\.select\(`([\s\S]*?)`\)/)[1];
    const cols = sel.replace(/tenants\([\s\S]*\)/, "").split(/[\s,]+/).filter(Boolean);
    assert.ok(cols.includes("action_taken"));
    assert.deepEqual(cols.filter((c) => !AI_ROUTING_LOG_COLUMNS.includes(c)), []);
  });

  test("Agent Center labels ESCALATE_LANDLORD rows as Escalated and filters on them", () => {
    assert.match(agentCenter, /ESCALATE_LANDLORD:\s*\{\s*label:\s*"Escalated"/);
    assert.match(agentCenter, /\["ESCALATE_LANDLORD", "Escalated"\]/);
  });
});
