import { useState } from "react";
import { supabase } from "../supabase";
import { C, btn, fmtTime } from "./theme";

// Approved knowledge the AI uses (agent_knowledge). Entries are not edited in place: retire one and teach a
// new answer, so the record of what the AI was told is kept.
export default function KnowledgePanel({ entries, available, properties, units, onChanged }) {
  const [busy, setBusy] = useState(null);
  const [showRetired, setShowRetired] = useState(false);
  const [error, setError] = useState("");
  if (!available) {
    return <div style={{ fontSize: 13, color: C.textSub, padding: "24px 0" }}>Teach Agent isn't set up yet: the agent knowledge tables haven't been created in the database. Until then, the AI uses only the built-in building facts.</div>;
  }
  const propName = (id) => properties.get(id)?.name || "Property";
  const unitName = (id) => (units.get(id) ? `Unit ${units.get(id).unit_number}` : "Unit");
  const where = (e) => e.scope === "unit" ? `${unitName(e.unit_id)} · ${propName(e.property_id)}` : e.scope === "property" ? propName(e.property_id) : "All properties";

  async function retire(e) {
    setBusy(e.id); setError("");
    const { error: err } = await supabase.from("agent_knowledge").update({ status: "retired" }).eq("id", e.id).eq("status", "approved");
    setBusy(null);
    if (err) setError(err.message); else onChanged();
  }

  const active = entries.filter((e) => e.status === "approved");
  const retired = entries.filter((e) => e.status === "retired");
  const row = (e) => (
    <div key={e.id} style={{ background: e.status === "approved" ? C.raised : C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: "12px 14px", opacity: e.status === "approved" ? 1 : 0.6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, color: C.gold, marginBottom: 3 }}>{where(e)} · {e.topic}</div>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{e.content}</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
            Approved {fmtTime(e.approved_at)}{e.source_routing_log_id ? " · from an escalation" : ""}{e.status === "retired" ? ` · retired ${fmtTime(e.retired_at)}` : ""}
          </div>
        </div>
        {e.status === "approved" && <button onClick={() => retire(e)} disabled={busy === e.id} style={btn()}>{busy === e.id ? "…" : "Retire"}</button>}
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>Approved agent knowledge</div>
      <div style={{ fontSize: 12, color: C.textMuted, margin: "2px 0 14px", lineHeight: 1.5 }}>
        Answers management approved with Teach Agent. The AI gives each tenant only the entries for all properties, their property and their own unit, on top of the built-in building facts.
      </div>
      {error && <div role="alert" style={{ fontSize: 12, color: C.red, marginBottom: 10 }}>{error}</div>}
      {active.length === 0 ? <div style={{ fontSize: 13, color: C.textMuted, padding: "16px 0" }}>Nothing approved yet. Use Teach Agent on an escalation to add an answer.</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{active.map(row)}</div>}
      {retired.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button onClick={() => setShowRetired((v) => !v)} style={btn()}>{showRetired ? "Hide" : "Show"} retired ({retired.length})</button>
          {showRetired && <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>{retired.map(row)}</div>}
        </div>
      )}
    </div>
  );
}
