// src/lib/agentKnowledge.js
// Rules for management-approved AI knowledge (public.agent_knowledge), shared by the Agent Center (Teach Agent)
// and the API that builds the AI's prompt. Pure: no I/O.
//
// Trust model:
//   - Only a landlord can save an entry (RLS: is_landlord()), and only by explicitly approving it in Teach Agent.
//   - The suggestion offered to management never copies a tenant's claim in as fact. It is a question with a
//     blank for management's answer, or management's own reply from the thread. A suggestion that still
//     contains the placeholder can't be saved.
//   - Access secrets (door, lockbox, alarm or gate codes, passwords) are refused here and by a CHECK in the
//     database. The prompt goes to the model on every message.
//   - Unit entries reach only the tenants of that unit; property entries reach only that property's tenants.

export const SCOPES = Object.freeze(["organization", "property", "unit"]);
export const TOPIC_MAX = 80;
export const CONTENT_MAX = 600;
export const PLACEHOLDER = "[management answer]";

// Mirrors the CHECK constraint agent_knowledge_no_access_secrets in the migration (keep them in step).
const SECRET_RE = /\b(?:code|combo|combination|pin|password|passcode|passwd)\b[^.\n]{0,24}?\d{3,}|\d{3,}[^.\n]{0,20}?\b(?:code|combo|pin|passcode)\b/i;

export function looksLikeAccessSecret(text) {
  return SECRET_RE.test(String(text || ""));
}

// eslint-disable-next-line no-control-regex -- strips control characters on purpose
const clean = (s) => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+/g, " ").trim();

// Returns { ok, errors: {field: message}, entry } where entry is the normalised row to insert.
export function validateKnowledge({ scope, propertyId, unitId, topic, content } = {}) {
  const errors = {};
  const entry = { scope, property_id: null, unit_id: null, topic: clean(topic), content: clean(content) };
  if (!SCOPES.includes(scope)) errors.scope = "Choose who this applies to.";
  if (scope === "property" || scope === "unit") {
    if (!propertyId) errors.scope = "Choose the property.";
    entry.property_id = propertyId || null;
  }
  if (scope === "unit") {
    if (!unitId) errors.scope = "Choose the unit.";
    entry.unit_id = unitId || null;
  }
  if (!entry.topic) errors.topic = "Add a short topic.";
  else if (entry.topic.length > TOPIC_MAX) errors.topic = `Keep the topic under ${TOPIC_MAX} characters.`;
  if (!entry.content) errors.content = "Write the answer the AI should give.";
  else if (entry.content.length > CONTENT_MAX) errors.content = `Keep the answer under ${CONTENT_MAX} characters.`;
  else if (entry.content.includes(PLACEHOLDER) || /\[[^\]]*answer[^\]]*\]/i.test(entry.content)) errors.content = "Replace the placeholder with the actual answer.";
  else if (looksLikeAccessSecret(entry.content) || looksLikeAccessSecret(entry.topic)) {
    errors.content = "Don't save door, lockbox, alarm or gate codes or passwords. The AI must never share access codes.";
  }
  return { ok: Object.keys(errors).length === 0, errors, entry };
}

// Suggested Teach Agent entry for an escalation.
//   topic: from escalationReason.detectTopic; message: the tenant's exact words;
//   managementReply: the first reply a person (not the AI) sent in the thread after the escalation, if any.
//   tenant: { unitNumber, unitId, propertyId, propertyName }.
export function suggestKnowledge({ topic, message, managementReply, tenant = {} }) {
  const unitScoped = Boolean(topic?.unitSpecific && tenant.unitId);
  const scope = unitScoped ? "unit" : tenant.propertyId ? "property" : "organization";
  const label = topic?.label || "General";
  const subject = unitScoped ? `Unit ${tenant.unitNumber}` : tenant.propertyName || "All properties";
  const question = clean(message).replace(/\s+/g, " ").slice(0, 160);
  const answer = clean(managementReply);
  return {
    scope,
    propertyId: scope === "organization" ? null : tenant.propertyId || null,
    unitId: unitScoped ? tenant.unitId : null,
    topic: `${label}${unitScoped ? ` (Unit ${tenant.unitNumber})` : ""}`.slice(0, TOPIC_MAX),
    content: answer
      ? answer.slice(0, CONTENT_MAX)
      : `${subject}: ${PLACEHOLDER}`,
    basedOn: answer ? "management_reply" : "question",
    question,
  };
}

// Approved entries that apply to one tenant, most specific first. Defensive: the database query already filters,
// but an entry for another property or unit is dropped here too.
export function entriesForTenant(entries, { propertyId, unitId } = {}) {
  const rank = { unit: 0, property: 1, organization: 2 };
  return (Array.isArray(entries) ? entries : [])
    .filter((e) => e && e.status === "approved" && !looksLikeAccessSecret(e.content))
    .filter((e) => e.scope === "organization"
      || (e.scope === "property" && propertyId && e.property_id === propertyId)
      || (e.scope === "unit" && unitId && e.unit_id === unitId))
    .sort((a, b) => rank[a.scope] - rank[b.scope] || String(a.approved_at).localeCompare(String(b.approved_at)));
}

// Prompt block. Entries are management's own statements; they are listed as facts the AI may use.
export function formatKnowledgeForPrompt(entries, { unitNumber } = {}) {
  if (!entries?.length) return "";
  const where = (e) => e.scope === "unit" ? `This tenant's unit${unitNumber ? ` (Unit ${unitNumber})` : ""}` : e.scope === "property" ? "This property" : "All Modus properties";
  const lines = entries.map((e) => `- [${where(e)}] ${clean(e.topic)}: ${clean(e.content)}`);
  return `MANAGEMENT-APPROVED ANSWERS (confirmed by Modus management; you may state these as fact):\n${lines.join("\n")}`;
}

// Current state of an escalation from its append-only events (agent_escalation_events), oldest first or not.
export function escalationState(events) {
  const list = (Array.isArray(events) ? events : []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  let state = { resolved: false, resolvedAt: null, note: "", knowledgeIds: [] };
  for (const e of list) {
    if (e.event === "resolved") state = { ...state, resolved: true, resolvedAt: e.created_at, note: e.note || "" };
    else if (e.event === "reopened") state = { ...state, resolved: false, resolvedAt: null, note: e.note || "" };
    if (e.knowledge_id) state.knowledgeIds = [...state.knowledgeIds, e.knowledge_id];
  }
  return state;
}
