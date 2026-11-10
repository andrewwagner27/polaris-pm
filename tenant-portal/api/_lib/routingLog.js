// api/_lib/routingLog.js
// Builds the ai_routing_logs row written by /api/classify-and-route. The landlord's Agent Center
// reads ONLY this table, so a failed insert silently hides escalations from the landlord.
//
// AI_ROUTING_LOG_COLUMNS mirrors public.ai_routing_logs in production (schema of the
// 2026-11-09 pre-WP1 backup). Every key written must be one of these columns: an unknown
// column (e.g. the former agent_name) makes PostgREST reject the whole insert.
export const AI_ROUTING_LOG_COLUMNS = Object.freeze([
  "id", "message_id", "tenant_id", "detected_intent", "detected_category", "confidence_score",
  "action_taken", "matched_rule_id", "manager_overridden", "manager_override_category",
  "manager_override_action", "auto_reply_sent", "ticket_created_id", "raw_openai_response",
  "created_at", "urgency", "raw_message",
]);

// Allowed by the table's CHECK constraint ai_routing_logs_action_taken_check.
export const ROUTING_ACTIONS = Object.freeze(["AUTO_REPLY", "CREATE_TICKET", "ESCALATE_LANDLORD", "NO_ACTION"]);

export function routingAction(classification) {
  if (classification?.escalate_to_landlord) return "ESCALATE_LANDLORD";
  if (classification?.create_maintenance_ticket) return "CREATE_TICKET";
  return "AUTO_REPLY";
}

export function buildRoutingLogRow({ classification, tenantId, messageId, ticketId, message }) {
  return {
    message_id: messageId || null,
    tenant_id: tenantId,
    detected_intent: classification.intent_summary,
    detected_category: classification.category,
    confidence_score: classification.confidence,
    urgency: classification.urgency,
    action_taken: routingAction(classification),
    auto_reply_sent: true,
    ticket_created_id: ticketId,
    raw_message: message,
    raw_openai_response: { tier: classification.tier, category: classification.category },
  };
}
