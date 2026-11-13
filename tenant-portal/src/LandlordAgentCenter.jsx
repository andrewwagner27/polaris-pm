import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";
import { notifyStatusLabel, notifyError, isEscalationRow, smsStatusText } from "./lib/notifyStatus";
import { classifyEscalation } from "./lib/escalationReason";
import { escalationState } from "./lib/agentKnowledge";
import { attachConversation } from "./lib/agentCenterData";
import { C, fmtTime } from "./agent/theme";
import EscalationCard from "./agent/EscalationCard";
import TeachAgentModal from "./agent/TeachAgentModal";
import ResolveModal from "./agent/ResolveModal";
import KnowledgePanel from "./agent/KnowledgePanel";

// Management email (and emergency SMS) outcome recorded on the escalation's routing row. Shown only for
// escalations and emergencies; an unknown outcome is shown as not confirmed, never as emailed.
function NotifyBadge({ log }) {
  if (!isEscalationRow(log)) return null;
  const st = notifyStatusLabel(log);
  const err = notifyError(log);
  const smsText = smsStatusText(log);
  return (
    <span data-notify-status={log.raw_openai_response?.notify?.status || "none"} title={err || undefined}
      style={{ fontSize: 10, fontWeight: 700, color: st.color, padding: "2px 6px", background: `${st.color}18`, borderRadius: 4, whiteSpace: "nowrap" }}>
      ✉ {st.label}{smsText ? ` · ${smsText}` : ""}
    </span>
  );
}


// ── Action badge config ─────────────────────────────────────
const ACTION_META = {
  ESCALATE_LANDLORD: { label: "Escalated",   color: C.red,    bg: `${C.red}18`,    icon: "⚠" },
  CREATE_TICKET:     { label: "Ticket",       color: C.amber,  bg: `${C.amber}18`,  icon: "🔧" },
  AUTO_REPLY:        { label: "Auto-replied", color: C.green,  bg: `${C.green}18`,  icon: "↩" },
  NO_ACTION:         { label: "No action",    color: C.textMuted, bg: C.raised,     icon: "–" },
};

const CATEGORY_ICONS = {
  MAINTENANCE:     "🔧",
  NOISE_COMPLAINT: "🔊",
  PARKING_DISPUTE: "🚗",
  LEASE_LEGAL:     "⚖",
  PAYMENT:         "$",
  GENERAL_INQUIRY: "💬",
  EMERGENCY:       "🚨",
};

const ESCALATION_LEVELS = ["AUTO_REPLY", "CREATE_TICKET", "ESCALATE_LANDLORD"];

function Badge({ action }) {
  const m = ACTION_META[action] || ACTION_META.NO_ACTION;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 9px", borderRadius: 20,
      background: m.bg, color: m.color,
      fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
    }}>
      <span>{m.icon}</span> {m.label}
    </span>
  );
}

function UrgencyDot({ urgency }) {
  const colors = { EMERGENCY: C.red, HIGH: C.red, MEDIUM: C.amber, LOW: C.green };
  return (
    <span style={{
      display: "inline-block", width: 7, height: 7,
      borderRadius: "50%", background: colors[urgency] || C.textMuted,
      flexShrink: 0,
    }} />
  );
}

function Spinner() {
  return (
    <span style={{
      width: 14, height: 14, border: `2px solid rgba(201,169,110,0.3)`,
      borderTopColor: C.gold, borderRadius: "50%",
      display: "inline-block", animation: "spin 0.7s linear infinite",
    }} />
  );
}

// ── Override / Train modal ──────────────────────────────────
function OverrideModal({ log, onClose, onSave }) {
  const [newAction, setNewAction] = useState(log.action_taken);
  const [newCategory, setNewCategory] = useState(log.detected_category || "");
  const [addKeyword, setAddKeyword] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  async function save() {
    setSaving(true);
    // 1. Update the log with override info
    await supabase.from("ai_routing_logs").update({
      manager_overridden: true,
      manager_override_category: newCategory,
      manager_override_action: newAction,
    }).eq("id", log.id);

    // 2. If adding a keyword, update or create the matching rule
    if (addKeyword.trim()) {
      const { data: existingRule } = await supabase
        .from("ai_routing_rules")
        .select("id, trigger_keywords")
        .eq("category", newCategory)
        .eq("escalation_level", newAction)
        .single();

      if (existingRule) {
        const merged = Array.from(new Set([...existingRule.trigger_keywords, addKeyword.trim().toLowerCase()]));
        await supabase.from("ai_routing_rules").update({ trigger_keywords: merged }).eq("id", existingRule.id);
      } else {
        await supabase.from("ai_routing_rules").insert({
          category: newCategory,
          trigger_keywords: [addKeyword.trim().toLowerCase()],
          escalation_level: newAction,
          confidence_threshold: 0.65,
          is_active: true,
        });
      }
    }

    setSaving(false);
    onSave();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: "24px 26px", width: "100%", maxWidth: 480,
        fontFamily: "'DM Sans', sans-serif",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 4 }}>
          Train Agent
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 20 }}>
          Override this classification to improve future routing decisions.
        </div>

        {/* Original message */}
        <div style={{ background: C.raised, borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: C.textSub, lineHeight: 1.6, borderLeft: `3px solid ${C.border}` }}>
          <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.1em" }}>Original message</div>
          {log.raw_message || <span style={{ color: C.textMuted }}>(original message not available){log.detected_intent ? ` · AI summary: ${log.detected_intent}` : ""}</span>}
        </div>

        {/* Category */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>Correct Category</label>
          <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={{
            width: "100%", background: C.raised, border: `1px solid ${C.border}`,
            borderRadius: 7, padding: "9px 12px", color: C.text,
            fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none",
          }}>
            {["MAINTENANCE","NOISE_COMPLAINT","PARKING_DISPUTE","LEASE_LEGAL","PAYMENT","GENERAL_INQUIRY","EMERGENCY"].map(c => (
              <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>

        {/* Action */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>Correct Action</label>
          <div style={{ display: "flex", gap: 8 }}>
            {ESCALATION_LEVELS.map((lvl) => (
              <button key={lvl} onClick={() => setNewAction(lvl)} style={{
                flex: 1, padding: "8px 4px", borderRadius: 7, fontSize: 11,
                fontWeight: newAction === lvl ? 600 : 400, cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                background: newAction === lvl ? `${C.gold}18` : C.raised,
                border: `1px solid ${newAction === lvl ? C.gold : C.border}`,
                color: newAction === lvl ? C.gold : C.textSub,
              }}>
                {ACTION_META[lvl].icon} {ACTION_META[lvl].label}
              </button>
            ))}
          </div>
        </div>

        {/* Add keyword to training */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
            Add Keyword to Rule <span style={{ color: C.textMuted, fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            value={addKeyword}
            onChange={(e) => setAddKeyword(e.target.value)}
            placeholder="e.g. radiator, thermostat…"
            style={{
              width: "100%", background: C.raised, border: `1px solid ${C.border}`,
              borderRadius: 7, padding: "9px 12px", color: C.text,
              fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none",
            }}
          />
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
            This keyword will be added to the {newCategory.replace(/_/g," ")} → {ACTION_META[newAction]?.label} rule.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "10px", background: "transparent",
            border: `1px solid ${C.border}`, borderRadius: 8,
            fontSize: 13, color: C.textSub, cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{
            flex: 2, padding: "10px", background: "rgba(201,169,110,0.12)", border: `1px solid ${C.gold}`,
            border: "none", borderRadius: 8,
            fontSize: 13, fontWeight: 500, color: C.text,
            cursor: saving ? "default" : "pointer",
            fontFamily: "'DM Sans', sans-serif", display: "flex",
            alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {saving ? <><Spinner/> Saving…</> : "✓ Save & Train Agent"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Rule Row in Escalation Matrix ─────────────────────────
function RuleRow({ rule, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [threshold, setThreshold] = useState(rule.confidence_threshold);
  const [level, setLevel] = useState(rule.escalation_level);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await supabase.from("ai_routing_rules").update({
      escalation_level: level,
      confidence_threshold: parseFloat(threshold),
    }).eq("id", rule.id);
    setSaving(false);
    setEditing(false);
    onUpdate();
  }

  async function toggle() {
    await supabase.from("ai_routing_rules").update({ is_active: !rule.is_active }).eq("id", rule.id);
    onUpdate();
  }

  const m = ACTION_META[rule.escalation_level] || ACTION_META.NO_ACTION;

  return (
    <div style={{
      background: rule.is_active ? C.raised : C.surface,
      border: `1px solid ${C.border}`, borderRadius: 9,
      padding: "14px 16px", opacity: rule.is_active ? 1 : 0.5,
      transition: "opacity 0.15s",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 18, lineHeight: 1, paddingTop: 1 }}>
          {CATEGORY_ICONS[rule.category] || "📋"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>
              {rule.category.replace(/_/g, " ")}
            </span>
            {editing ? (
              <select value={level} onChange={(e) => setLevel(e.target.value)} style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 5, padding: "2px 8px", color: C.text,
                fontSize: 11, fontFamily: "'DM Sans', sans-serif", outline: "none",
              }}>
                {ESCALATION_LEVELS.map(l => <option key={l} value={l}>{l.replace(/_/g," ")}</option>)}
              </select>
            ) : <Badge action={rule.escalation_level} />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: C.textMuted }}>
              Confidence ≥{" "}
              {editing ? (
                <input
                  type="number" min="0" max="1" step="0.05"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  style={{
                    width: 52, background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 4, padding: "1px 5px", color: C.text,
                    fontSize: 11, fontFamily: "'DM Sans', sans-serif", outline: "none",
                  }}
                />
              ) : <span style={{ color: C.gold }}>{(rule.confidence_threshold * 100).toFixed(0)}%</span>}
            </span>
            <span style={{ fontSize: 11, color: C.textMuted }}>
              {rule.trigger_keywords.slice(0, 5).join(", ")}
              {rule.trigger_keywords.length > 5 ? ` +${rule.trigger_keywords.length - 5} more` : ""}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {editing ? (
            <>
              <button onClick={save} disabled={saving} style={{ padding: "5px 12px", background: "rgba(201,169,110,0.10)", border: `1px solid ${C.gold}`, borderRadius: 6, fontSize: 11, fontWeight: 600, color: C.gold, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                {saving ? "…" : "Save"}
              </button>
              <button onClick={() => setEditing(false)} style={{ padding: "5px 10px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, color: C.textSub, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} style={{ padding: "5px 10px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, color: C.textSub, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                Edit
              </button>
              <button onClick={toggle} style={{
                padding: "5px 10px", background: "transparent",
                border: `1px solid ${rule.is_active ? C.border : C.green}`,
                borderRadius: 6, fontSize: 11, cursor: "pointer",
                color: rule.is_active ? C.textMuted : C.green,
                fontFamily: "'DM Sans', sans-serif",
              }}>
                {rule.is_active ? "Disable" : "Enable"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────
const LOG_COLUMNS = `
  id, created_at, tenant_id, message_id, raw_message,
  detected_intent, detected_category, confidence_score, urgency,
  action_taken, auto_reply_sent, ticket_created_id,
  manager_overridden, manager_override_category, manager_override_action,
  raw_openai_response,
  tenants(name, user_id, unit_id, units(id, unit_number, property_id, properties(id, name)))
`;

const missingTable = (error) => Boolean(error) && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message || ""));

export default function LandlordAgentCenter() {
  const [logs, setLogs]       = useState([]);
  const [rules, setRules]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState("activity"); // "activity" | "knowledge" | "matrix"
  const [filter, setFilter]   = useState("ESCALATIONS");
  const [overrideLog, setOverrideLog] = useState(null);
  const [teach, setTeach]     = useState(null);
  const [resolve, setResolve] = useState(null);
  const [conversations, setConversations] = useState(new Map());
  const [events, setEvents]   = useState([]);
  const [knowledge, setKnowledge] = useState([]);
  const [agentTables, setAgentTables] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const [{ data: logsData, error: logsError }, { data: rulesData }] = await Promise.all([
      supabase.from("ai_routing_logs").select(LOG_COLUMNS).order("created_at", { ascending: false }).limit(100),
      supabase.from("ai_routing_rules").select("*").order("created_at", { ascending: false }),
    ]);
    if (logsError) { console.error("Agent Center logs error:", logsError); setLoadError("Could not load agent activity."); }
    const l = logsData || [];

    // The actual conversation: tenant messages by id, and AI replies in the same period for the same tenants.
    const ids = [...new Set(l.map((x) => x.message_id).filter(Boolean))];
    const tenantIds = [...new Set(l.map((x) => x.tenant_id).filter(Boolean))];
    const oldest = l.length ? new Date(new Date(l[l.length - 1].created_at).getTime() - 3600e3).toISOString() : null;
    const [msgRes, aiRes, evRes, kRes] = await Promise.all([
      ids.length ? supabase.from("messages").select("id, tenant_id, sender_id, body, created_at").in("id", ids) : Promise.resolve({ data: [] }),
      tenantIds.length && oldest
        ? supabase.from("messages").select("id, tenant_id, sender_id, body, created_at").in("tenant_id", tenantIds).is("sender_id", null).gte("created_at", oldest).order("created_at", { ascending: true }).limit(1000)
        : Promise.resolve({ data: [] }),
      l.length ? supabase.from("agent_escalation_events").select("id, routing_log_id, event, note, knowledge_id, created_at").in("routing_log_id", l.map((x) => x.id)).order("created_at", { ascending: true }) : Promise.resolve({ data: [] }),
      supabase.from("agent_knowledge").select("*").order("approved_at", { ascending: false }).limit(500),
    ]);
    setAgentTables(!missingTable(evRes.error) && !missingTable(kRes.error));
    setConversations(attachConversation(l, msgRes.data || [], aiRes.data || []));
    setEvents(evRes.data || []);
    setKnowledge(kRes.data || []);
    setLogs(l);
    setRules(rulesData || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time subscription to new log entries
  useEffect(() => {
    const channel = supabase
      .channel("ai_routing_logs_realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ai_routing_logs" }, () => loadData())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadData]);

  const eventsByLog = useMemo(() => {
    const m = new Map();
    for (const e of events) { if (!m.has(e.routing_log_id)) m.set(e.routing_log_id, []); m.get(e.routing_log_id).push(e); }
    return m;
  }, [events]);

  const enriched = useMemo(() => logs.map((log) => {
    const conv = conversations.get(log.id) || {};
    const t = log.tenants || {};
    const unit = t.units || {};
    const prop = unit.properties || {};
    return {
      log, conv,
      escalation: isEscalationRow(log),
      reason: classifyEscalation(log, conv.message, conv.reply),
      state: escalationState(eventsByLog.get(log.id)),
      history: eventsByLog.get(log.id) || [],
      tenant: { name: t.name, userId: t.user_id, unitId: unit.id || t.unit_id || null, unitNumber: unit.unit_number, propertyId: prop.id || unit.property_id || null, propertyName: prop.name },
    };
  }), [logs, conversations, eventsByLog]);

  const stats = useMemo(() => ({
    total: logs.length,
    escalated: enriched.filter((x) => x.escalation).length,
    unresolved: enriched.filter((x) => x.escalation && !x.state.resolved).length,
    autoreplied: logs.filter((x) => x.action_taken === "AUTO_REPLY").length,
  }), [logs, enriched]);

  const propertyMap = useMemo(() => {
    const m = new Map();
    for (const x of enriched) if (x.tenant.propertyId) m.set(x.tenant.propertyId, { name: x.tenant.propertyName });
    return m;
  }, [enriched]);
  const unitMap = useMemo(() => {
    const m = new Map();
    for (const x of enriched) if (x.tenant.unitId) m.set(x.tenant.unitId, { unit_number: x.tenant.unitNumber });
    return m;
  }, [enriched]);

  const FILTERS = [["ESCALATIONS", "Escalations"], ["UNRESOLVED", "Unresolved"], ["RESOLVED", "Resolved"], ["ALL", "All activity"], ["CREATE_TICKET", "Tickets"], ["AUTO_REPLY", "Auto-replied"]];
  const shown = enriched.filter((x) =>
    filter === "ALL" ? true
    : filter === "ESCALATIONS" ? x.escalation
    : filter === "UNRESOLVED" ? x.escalation && !x.state.resolved
    : filter === "RESOLVED" ? x.escalation && x.state.resolved
    : x.log.action_taken === filter);

  return (
    <LandlordLayout>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .agent-tab-btn:hover { background: ${C.raised} !important; }
        .agent-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 24px; }
        .agent-page { padding: 28px 28px 48px; }
        @media (min-width: 900px) { .agent-grid { grid-template-columns: 1fr 1fr; } .agent-grid > :nth-child(n+3) { grid-column: 1 / -1; } }
        @media (max-width: 640px) { .agent-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .agent-page { padding: 18px 12px 40px; } }
      `}</style>

      <div className="agent-page" style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, animation: "pulse 2s infinite" }} />
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: C.text }}>
              Agent Activity & Escalation Center
            </div>
          </div>
          <div style={{ fontSize: 13, color: C.textSub }}>
            What tenants asked, what the AI answered and why it escalated · Resolve escalations · Teach the agent approved answers
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="agent-stats">
          {[
            { label: "Routed (last 100)", value: stats.total,       color: C.gold,  icon: "◈" },
            { label: "Escalations",       value: stats.escalated,   color: C.red,   icon: "⚠" },
            { label: "Unresolved",        value: agentTables ? stats.unresolved : "—", color: C.amber, icon: "●" },
            { label: "Auto-replied",      value: stats.autoreplied, color: C.green, icon: "↩" },
          ].map((s) => (
            <div key={s.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", minWidth: 0 }}>
              <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{s.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 600, color: s.color, lineHeight: 1 }}>{s.value}</span>
                <span style={{ fontSize: 16 }}>{s.icon}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Tab bar ── */}
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 20, overflowX: "auto" }}>
          {[
            { key: "activity",  label: "Activity" },
            { key: "knowledge", label: `Agent Knowledge${agentTables ? ` (${knowledge.filter((k) => k.status === "approved").length})` : ""}` },
            { key: "matrix",    label: "Escalation Matrix" },
          ].map((t) => (
            <button key={t.key} className="agent-tab-btn" onClick={() => setTab(t.key)} style={{
              padding: "10px 18px", background: "transparent", border: "none", whiteSpace: "nowrap",
              borderBottom: `2px solid ${tab === t.key ? C.gold : "transparent"}`,
              color: tab === t.key ? C.gold : C.textSub,
              fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              transition: "all 0.12s", marginBottom: -1,
            }}>{t.label}</button>
          ))}
        </div>

        {tab === "activity" && (
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {FILTERS.filter(([v]) => agentTables || (v !== "UNRESOLVED" && v !== "RESOLVED")).map(([val, lbl]) => (
                <button key={val} onClick={() => setFilter(val)} style={{
                  padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", minHeight: 32,
                  fontFamily: "'DM Sans', sans-serif", fontWeight: filter === val ? 600 : 400,
                  background: filter === val ? `${C.gold}18` : C.raised,
                  border: `1px solid ${filter === val ? C.goldDim : C.border}`,
                  color: filter === val ? C.gold : C.textSub,
                }}>{lbl}</button>
              ))}
            </div>
            {!agentTables && (
              <div style={{ fontSize: 12, color: C.amber, marginBottom: 12 }}>Resolve and Teach Agent aren't available until the agent knowledge tables are created (pending database migration).</div>
            )}
            {loadError && <div role="alert" style={{ fontSize: 12, color: C.red, marginBottom: 12 }}>{loadError}</div>}

            {loading ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: C.textSub, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <Spinner /> Loading agent activity…
              </div>
            ) : shown.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: C.textMuted, fontSize: 13 }}>
                Nothing here. Activity appears as tenants message the AI assistant.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {shown.map((x) => {
                  const { log, tenant } = x;
                  const isOverridden = log.manager_overridden;
                  const header = (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: C.raised, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>
                        {CATEGORY_ICONS[log.detected_category] || "💬"}
                      </div>
                      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>
                          {tenant.name || "Unknown tenant"}
                          <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 400 }}>
                            {tenant.unitNumber ? ` · Unit ${tenant.unitNumber}` : ""}{tenant.propertyName ? ` · ${tenant.propertyName}` : ""}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                          {fmtTime(x.conv.messageAt || log.created_at)}
                          {log.detected_category ? ` · ${log.detected_category.replace(/_/g, " ").toLowerCase()}` : ""}
                          {log.confidence_score ? ` · ${(log.confidence_score * 100).toFixed(0)}% confidence` : ""}
                          {log.ticket_created_id ? ` · Ticket #${log.ticket_created_id.slice(0, 8).toUpperCase()}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <UrgencyDot urgency={log.urgency} />
                        <Badge action={isOverridden ? log.manager_override_action : log.action_taken} />
                        <NotifyBadge log={log} />
                        {x.escalation && agentTables && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, color: x.state.resolved ? C.green : C.amber, background: x.state.resolved ? `${C.green}18` : `${C.amber}18` }}>
                            {x.state.resolved ? "✓ Resolved" : "● Unresolved"}
                          </span>
                        )}
                        {isOverridden && (
                          <span style={{ fontSize: 10, color: C.gold, fontWeight: 600, padding: "2px 6px", background: `${C.gold}15`, borderRadius: 4 }}>✏ Overridden</span>
                        )}
                      </div>
                    </div>
                  );
                  return (
                    <EscalationCard key={log.id} log={log} conversation={x.conv} reason={x.reason} state={x.state} tenant={tenant}
                      escalation={x.escalation} header={header} actionsAvailable={agentTables} history={x.history}
                      onTeach={() => setTeach(x)} onResolve={() => setResolve({ x, mode: "resolve" })} onReopen={() => setResolve({ x, mode: "reopen" })}
                      onOverride={() => setOverrideLog({ ...log, raw_message: x.conv.message || log.raw_message })} />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "knowledge" && (
          <KnowledgePanel entries={knowledge} available={agentTables} properties={propertyMap} units={unitMap} onChanged={loadData} />
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: ESCALATION MATRIX (Rule Manager)
        ══════════════════════════════════════════════════════ */}
        {tab === "matrix" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>Escalation Matrix</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                  Rules are checked in order by priority. The first match wins.
                </div>
              </div>
              <button
                onClick={async () => {
                  const cat = prompt("Category (e.g. MAINTENANCE):");
                  const kw  = prompt("Keyword triggers (comma-separated):");
                  const lvl = prompt("Action (AUTO_REPLY / CREATE_TICKET / ESCALATE_LANDLORD):");
                  if (!cat || !kw || !lvl) return;
                  await supabase.from("ai_routing_rules").insert({
                    category: cat.trim().toUpperCase(),
                    trigger_keywords: kw.split(",").map((k) => k.trim().toLowerCase()),
                    escalation_level: lvl.trim().toUpperCase(),
                    confidence_threshold: 0.65,
                    is_active: true,
                  });
                  loadData();
                }}
                style={{
                  padding: "8px 16px", background: "rgba(201,169,110,0.10)", border: `1px solid ${C.gold}`,
                  borderRadius: 8, fontSize: 12, fontWeight: 500, color: C.text,
                  cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                }}>
                + Add Rule
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: C.textSub, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <Spinner /> Loading rules…
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rules.map((rule) => (
                  <RuleRow key={rule.id} rule={rule} onUpdate={loadData} onDelete={loadData} />
                ))}
              </div>
            )}

            {/* Legend */}
            <div style={{ marginTop: 24, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
              <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Action Reference</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Object.entries(ACTION_META).filter(([k]) => k !== "NO_ACTION").map(([k, v]) => (
                  <div key={k} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <Badge action={k} />
                    <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>
                      {k === "ESCALATE_LANDLORD" && "Creates an urgent alert in your dashboard and requires manual review."}
                      {k === "CREATE_TICKET"     && "Automatically creates a maintenance request and triggers vendor dispatch."}
                      {k === "AUTO_REPLY"        && "Sends a pre-written template response to the tenant. No landlord notification."}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {teach && (
        <TeachAgentModal log={teach.log} conversation={teach.conv} reason={teach.reason} tenant={teach.tenant}
          onClose={() => setTeach(null)} onSaved={() => { setTeach(null); loadData(); }} />
      )}
      {resolve && (
        <ResolveModal log={resolve.x.log} mode={resolve.mode} onClose={() => setResolve(null)} onSaved={() => { setResolve(null); loadData(); }} />
      )}

      {/* ── Override Modal ── */}
      {overrideLog && (
        <OverrideModal
          log={overrideLog}
          onClose={() => setOverrideLog(null)}
          onSave={() => { setOverrideLog(null); loadData(); }}
        />
      )}
    </LandlordLayout>
  );
}