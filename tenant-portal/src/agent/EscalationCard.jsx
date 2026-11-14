import { useState } from "react";
import { supabase } from "../supabase";
import { C, font, btn, label, fmtTime } from "./theme";
import { transcriptWindow, verifiedManagementIds } from "../lib/agentCenterData";

const ROLE_STYLE = {
  tenant:     { who: "Tenant",     color: C.blue,  align: "flex-end" },
  ai:         { who: "AI assistant", color: C.gold, align: "flex-start" },
  management: { who: "Management", color: C.green, align: "flex-start" },
  unknown:    { who: "Message",    color: C.textSub, align: "flex-start" },
};

function Block({ title, accent, children }) {
  return (
    <div style={{ background: C.raised, borderRadius: 8, padding: "9px 12px", borderLeft: `3px solid ${accent}`, minWidth: 0 }}>
      <div style={label}>{title}</div>
      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}

// One routing record. For escalations: the tenant's exact message, the AI's reply, why it escalated,
// the email status, resolution state, the conversation on demand, and the Teach Agent / Resolve actions.
export default function EscalationCard({ log, conversation, reason, state, tenant, escalation, header, actionsAvailable, onTeach, onResolve, onReopen, onOverride, history }) {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState(null);
  const [threadError, setThreadError] = useState("");
  const [showFullReply, setShowFullReply] = useState(false);

  async function toggleConversation() {
    const next = !open;
    setOpen(next);
    if (!next || thread || !log.tenant_id) return;
    // This tenant's thread only (tenant isolation: the query is scoped to the record's tenant_id).
    const until = new Date(new Date(log.created_at).getTime() + 3 * 24 * 3600e3).toISOString();
    const { data, error } = await supabase.from("messages").select("id, sender_id, body, created_at, agent_name")
      .eq("tenant_id", log.tenant_id).lte("created_at", until).order("created_at", { ascending: false }).limit(40);
    if (error) { setThreadError("Could not load the conversation."); return; }
    setThread(transcriptWindow(data, log.message_id, tenant.userId, { before: 10, after: 4, managementIds: await verifiedManagementIds(supabase) }));
  }

  const msg = conversation?.message;
  const reply = conversation?.reply;
  const longReply = reply && reply.length > 320;

  return (
    <div className="agent-row" style={{ background: C.surface, border: `1px solid ${state?.resolved ? C.border : escalation ? "rgba(224,85,85,0.35)" : C.border}`, borderRadius: 10, padding: "14px 16px", fontFamily: font }}>
      {header}

      {escalation ? (
        <div className="agent-grid" style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <Block title="Tenant message (exact)" accent={C.blue}>
            {msg ?? <span style={{ color: C.textMuted }}>(original message not available){log.detected_intent ? ` · AI summary: ${log.detected_intent}` : ""}</span>}
          </Block>
          <Block title={conversation?.replySource === "thread" ? "AI response (from the thread)" : "AI response"} accent={C.gold}>
            {reply
              ? <>{longReply && !showFullReply ? reply.slice(0, 320) + "…" : reply}{longReply && <button onClick={() => setShowFullReply((v) => !v)} style={{ background: "none", border: "none", color: C.gold, cursor: "pointer", fontSize: 12, marginLeft: 6 }}>{showFullReply ? "less" : "more"}</button>}</>
              : <span style={{ color: C.textMuted }}>(no AI reply found for this message)</span>}
          </Block>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
            <span style={{ fontWeight: 700, color: reason.color, padding: "2px 8px", borderRadius: 4, background: `${reason.color}18` }}>{reason.label}</span>
            <span style={{ color: C.textSub }}>{reason.detail}</span>
            {reason.secondary && (
              <span style={{ color: C.gold }}>· Also: {reason.secondary.label.toLowerCase()} ({reason.secondary.detail})</span>
            )}
          </div>
          {Array.isArray(log.raw_openai_response?.missing_info) && log.raw_openai_response.missing_info.length > 0 && (
            <div style={{ fontSize: 11, color: C.textMuted }}>AI noted missing: {log.raw_openai_response.missing_info.join("; ")}</div>
          )}
          {state?.resolved && (
            <div style={{ fontSize: 12, color: C.green }}>✓ Resolved {fmtTime(state.resolvedAt)}{state.note ? `: ${state.note}` : ""}</div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.textSub, marginTop: 6, lineHeight: 1.5, wordBreak: "break-word" }}>
          {msg ? (msg.length > 220 ? msg.slice(0, 220) + "…" : msg) : <span style={{ color: C.textMuted }}>{log.detected_intent ? `AI summary: ${log.detected_intent}` : "—"}</span>}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 12, padding: 12, background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <div style={{ ...label, marginBottom: 8 }}>Conversation (this tenant only)</div>
          {threadError && <div style={{ fontSize: 12, color: C.red }}>{threadError}</div>}
          {!thread && !threadError && <div style={{ fontSize: 12, color: C.textSub }}>Loading…</div>}
          {thread && thread.length === 0 && <div style={{ fontSize: 12, color: C.textMuted }}>No messages found.</div>}
          {thread && thread.map((m) => {
            const r = ROLE_STYLE[m.role] || ROLE_STYLE.unknown;
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: r.align, marginBottom: 8 }}>
                <div style={{ maxWidth: "88%", background: m.focus ? "rgba(74,154,232,0.12)" : C.raised, border: `1px solid ${m.focus ? C.blue : C.border}`, borderRadius: 8, padding: "7px 10px" }}>
                  <div style={{ fontSize: 10, color: r.color, marginBottom: 2 }}>{r.who}{m.focus ? " · escalated message" : ""} · {fmtTime(m.created_at)}</div>
                  <div style={{ fontSize: 12.5, color: C.text, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5 }}>{m.body}</div>
                </div>
              </div>
            );
          })}
          {history?.length > 0 && (
            <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
              <div style={label}>Management history</div>
              {history.map((e) => (
                <div key={e.id} style={{ fontSize: 12, color: C.textSub, marginBottom: 3 }}>
                  {fmtTime(e.created_at)} · <b style={{ color: C.text }}>{e.event.replace("_", " ")}</b>{e.note ? `: ${e.note}` : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button onClick={toggleConversation} style={btn()} aria-expanded={open}>{open ? "▴ Hide conversation" : "▾ Conversation"}</button>
        {escalation && actionsAvailable && <button onClick={onTeach} style={btn("gold")}>🎓 Teach Agent</button>}
        {escalation && actionsAvailable && (state?.resolved
          ? <button onClick={onReopen} style={btn()}>Reopen</button>
          : <button onClick={onResolve} style={btn("green")}>✓ Resolve</button>)}
        <button onClick={onOverride} style={btn()}>✏ Override routing</button>
      </div>
    </div>
  );
}
