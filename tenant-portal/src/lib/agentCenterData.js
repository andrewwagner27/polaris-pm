// src/lib/agentCenterData.js
// Pure helpers that tie Agent Center routing records to the actual conversation (public.messages).
// The Agent Center must show the tenant's exact words and the AI's actual reply. The AI's one-line summary
// (detected_intent) is only ever a labelled fallback.
//
// Message authorship (see api/classify-and-route.js and the messages RLS):
//   tenant message      sender_id = the tenant's auth user id
//   AI reply            sender_id = null (agent_name "Modus AI Assistant")
//   management message  sender_id = the landlord's auth user id (anything non-null that isn't the tenant)

const t = (v) => new Date(v).getTime();

// managementIds (Set): senders verified as management. When given, ONLY those are "management"; any other sender
// (e.g. a message from a tenant's previous login) is "unknown" and can never be suggested as management's answer.
export function messageRole(m, tenantUserId, managementIds = null) {
  if (!m) return "unknown";
  if (m.sender_id == null || m.agent_name) return "ai"; // assistant messages: null sender or an agent_name
  if (tenantUserId && m.sender_id === tenantUserId) return "tenant";
  if (managementIds) return managementIds.has(m.sender_id) ? "management" : "unknown";
  return tenantUserId ? "management" : "unknown";
}

// Management senders the signed-in landlord can verify. profiles RLS lets a user read only their own row, so this
// is the signed-in management account itself (the landlord routes are landlord-only). Never throws; empty on failure.
export async function verifiedManagementIds(supabase) {
  try {
    const { data } = await supabase.auth.getUser();
    const id = data?.user?.id;
    if (!id) return new Set();
    const { data: p } = await supabase.from("profiles").select("id, role").eq("id", id).maybeSingle();
    return p?.role === "landlord" ? new Set([id]) : new Set();
  } catch {
    return new Set();
  }
}

// logs: ai_routing_logs rows (with tenant_id, message_id, raw_message, created_at, raw_openai_response)
// tenantMessages: messages rows fetched by id for the logs' message_ids
// aiMessages: AI replies (sender_id null) for the same tenants over the same period
// → Map(logId → { message, messageAt, messageSource, reply, replySource })
export function attachConversation(logs, tenantMessages = [], aiMessages = []) {
  const byId = new Map((tenantMessages || []).map((m) => [m.id, m]));
  const aiByTenant = new Map();
  for (const m of aiMessages || []) {
    if (m.sender_id != null) continue;
    if (!aiByTenant.has(m.tenant_id)) aiByTenant.set(m.tenant_id, []);
    aiByTenant.get(m.tenant_id).push(m);
  }
  for (const list of aiByTenant.values()) list.sort((a, b) => t(a.created_at) - t(b.created_at));

  const out = new Map();
  for (const log of logs || []) {
    const stored = byId.get(log.message_id);
    const exact = String(log.raw_message ?? "").trim() ? log.raw_message : stored?.body;
    const message = String(exact ?? "").trim() ? exact : null;
    const messageAt = stored?.created_at || null;

    let reply = typeof log.raw_openai_response?.reply === "string" ? log.raw_openai_response.reply : null;
    let replySource = reply ? "recorded" : null;
    if (!reply && messageAt) {
      // The AI reply is written after the tenant's message and before the routing row (allow 2 min of clock skew).
      const from = t(messageAt), to = t(log.created_at) + 120000;
      const match = (aiByTenant.get(log.tenant_id) || []).find((m) => t(m.created_at) >= from && t(m.created_at) <= to);
      if (match) { reply = match.body; replySource = "thread"; }
    }
    out.set(log.id, {
      message, messageAt,
      messageSource: String(log.raw_message ?? "").trim() ? "routing_record" : message ? "thread" : null,
      reply, replySource,
    });
  }
  return out;
}

// thread: messages for ONE tenant, any order. Returns the window around the triggering message:
// up to `before` earlier messages and `after` later ones, oldest first, each with a role and focus flag.
export function transcriptWindow(thread, focusMessageId, tenantUserId, { before = 10, after = 4, managementIds = null } = {}) {
  const list = (thread || []).slice().sort((a, b) => t(a.created_at) - t(b.created_at));
  const i = list.findIndex((m) => m.id === focusMessageId);
  const slice = i < 0 ? list.slice(-before) : list.slice(Math.max(0, i - before), i + after + 1);
  return slice.map((m) => ({ ...m, role: messageRole(m, tenantUserId, managementIds), focus: m.id === focusMessageId }));
}

// First message a person from management sent in the thread after the escalation. It's used as the suggested
// Teach Agent answer because it is management's own words, never the tenant's.
export function managementReplyAfter(thread, afterIso, tenantUserId, managementIds = null) {
  if (!tenantUserId) return null;
  const from = afterIso ? t(afterIso) : 0;
  const m = (thread || []).slice().sort((a, b) => t(a.created_at) - t(b.created_at))
    .find((x) => messageRole(x, tenantUserId, managementIds) === "management" && t(x.created_at) >= from);
  return m?.body || null;
}
