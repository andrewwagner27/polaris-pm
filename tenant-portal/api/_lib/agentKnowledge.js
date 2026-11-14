// api/_lib/agentKnowledge.js
// Loads the management-approved knowledge (public.agent_knowledge) that applies to one tenant, for the AI prompt.
// Never throws: an error, or the table not existing yet (migration not applied), means "no approved knowledge",
// and the AI keeps escalating questions it can't answer. That's the safe behaviour.

import { entriesForTenant, formatKnowledgeForPrompt, withdrawnEntriesForTenant, formatWithdrawnKnowledgeForPrompt, WITHDRAWN_MAX } from "../../src/lib/agentKnowledge.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ENTRIES = 60;

export async function loadApprovedKnowledge(db, { propertyId, unitId } = {}) {
  const p = UUID_RE.test(String(propertyId || "")) ? propertyId : null;
  const u = UUID_RE.test(String(unitId || "")) ? unitId : null;
  const scopes = ["scope.eq.organization"];
  if (p) scopes.push(`and(scope.eq.property,property_id.eq.${p})`);
  if (p && u) scopes.push(`and(scope.eq.unit,unit_id.eq.${u})`);
  try {
    const { data, error } = await db.from("agent_knowledge")
      .select("id, scope, property_id, unit_id, topic, content, status, approved_at")
      .eq("status", "approved")
      .or(scopes.join(","))
      .order("approved_at", { ascending: true })
      .limit(MAX_ENTRIES);
    if (error) {
      if (error.code !== "42P01" && error.code !== "PGRST205") console.error("[agent-knowledge] load failed:", error.message || error);
      return [];
    }
    return entriesForTenant(data, { propertyId: p, unitId: u });
  } catch (e) {
    console.error("[agent-knowledge] load failed:", e?.message || e);
    return [];
  }
}

// Retired entries for this tenant's scope (newest first), so the prompt can say they are withdrawn. Never throws.
export async function loadWithdrawnKnowledge(db, { propertyId, unitId } = {}) {
  const p = UUID_RE.test(String(propertyId || "")) ? propertyId : null;
  const u = UUID_RE.test(String(unitId || "")) ? unitId : null;
  const scopes = ["scope.eq.organization"];
  if (p) scopes.push(`and(scope.eq.property,property_id.eq.${p})`);
  if (p && u) scopes.push(`and(scope.eq.unit,unit_id.eq.${u})`);
  try {
    const { data, error } = await db.from("agent_knowledge")
      .select("id, scope, property_id, unit_id, topic, content, status, retired_at")
      .eq("status", "retired")
      .or(scopes.join(","))
      .order("retired_at", { ascending: false })
      .limit(WITHDRAWN_MAX);
    if (error) {
      if (error.code !== "42P01" && error.code !== "PGRST205") console.error("[agent-knowledge] withdrawn load failed:", error.message || error);
      return [];
    }
    return withdrawnEntriesForTenant(data, { propertyId: p, unitId: u });
  } catch (e) {
    console.error("[agent-knowledge] withdrawn load failed:", e?.message || e);
    return [];
  }
}

export { formatKnowledgeForPrompt, formatWithdrawnKnowledgeForPrompt };
