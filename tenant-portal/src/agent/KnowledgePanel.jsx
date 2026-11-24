import { useState } from "react";
import { supabase } from "../supabase";
import { C, btn, input, fmtTime } from "./theme";

const BLANK = { scope: "organization", property_id: "", unit_id: "", topic: "", content: "" };

function AddKnowledgeForm({ properties, units, onSaved }) {
  const [form,    setForm]    = useState(BLANK);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const update = (k, v) => setForm(f => ({ ...f, [k]: v, ...(k === "scope" && v !== "property" ? { property_id: "", unit_id: "" } : {}), ...(k === "scope" && v !== "unit" ? { unit_id: "" } : {}), ...(k === "property_id" ? { unit_id: "" } : {}) }));

  const propList  = [...properties.entries()].map(([id, p]) => ({ id, name: p.name }));
  const unitList  = form.property_id
    ? [...units.entries()].filter(([, u]) => u.property_id === form.property_id).map(([id, u]) => ({ id, unit_number: u.unit_number }))
    : [];

  async function save() {
    if (!form.topic.trim())   { setError("Topic is required."); return; }
    if (!form.content.trim()) { setError("Answer is required."); return; }
    if (form.scope === "property" && !form.property_id) { setError("Choose a property."); return; }
    if (form.scope === "unit"     && !form.unit_id)     { setError("Choose a unit."); return; }
    setSaving(true); setError("");
    const payload = {
      scope:   form.scope,
      topic:   form.topic.trim(),
      content: form.content.trim(),
      ...(form.scope !== "organization" ? { property_id: form.property_id } : {}),
      ...(form.scope === "unit"         ? { unit_id: form.unit_id }         : {}),
    };
    const { error: err } = await supabase.from("agent_knowledge").insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setForm(BLANK);
    onSaved();
  }

  const sel = { ...input, padding: "8px 10px" };

  return (
    <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 9, padding: "14px 16px", marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>Add knowledge entry</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>SCOPE</div>
          <select value={form.scope} onChange={e => update("scope", e.target.value)} style={sel}>
            <option value="organization">All properties</option>
            <option value="property">One property</option>
            <option value="unit">One unit</option>
          </select>
        </div>
        {form.scope !== "organization" && (
          <div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>PROPERTY</div>
            <select value={form.property_id} onChange={e => update("property_id", e.target.value)} style={sel}>
              <option value="">Select…</option>
              {propList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        {form.scope === "unit" && (
          <div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>UNIT</div>
            <select value={form.unit_id} onChange={e => update("unit_id", e.target.value)} style={sel} disabled={!form.property_id}>
              <option value="">Select…</option>
              {unitList.map(u => <option key={u.id} value={u.id}>Unit {u.unit_number}</option>)}
            </select>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>TOPIC (e.g. "Quiet hours")</div>
        <input value={form.topic} onChange={e => update("topic", e.target.value)} maxLength={80} placeholder="Quiet hours" style={input} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>ANSWER (what the AI will tell tenants)</div>
        <textarea value={form.content} onChange={e => update("content", e.target.value)} maxLength={600} rows={3} placeholder="Quiet hours are 10 PM – 8 AM Sunday–Thursday and 11 PM – 9 AM Friday–Saturday."
          style={{ ...input, resize: "vertical", lineHeight: 1.5 }} />
        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3, textAlign: "right" }}>{form.content.length}/600</div>
      </div>

      {error && <div style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>{error}</div>}
      <button onClick={save} disabled={saving} style={btn("gold")}>{saving ? "Saving…" : "Save entry"}</button>
    </div>
  );
}

// Approved knowledge the AI uses (agent_knowledge). Entries are not edited in place: retire one and teach a
// new answer, so the record of what the AI was told is kept.
export default function KnowledgePanel({ entries, available, properties, units, onChanged }) {
  const [busy, setBusy]             = useState(null);
  const [showRetired, setShowRetired] = useState(false);
  const [showAdd, setShowAdd]       = useState(false);
  const [error, setError]           = useState("");
  const [editId, setEditId]         = useState(null);
  const [editForm, setEditForm]     = useState({ topic: "", content: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError]   = useState("");

  function startEdit(e) {
    setEditId(e.id);
    setEditForm({ topic: e.topic, content: e.content });
    setEditError("");
  }

  async function saveEdit() {
    if (!editForm.topic.trim())   { setEditError("Topic is required."); return; }
    if (!editForm.content.trim()) { setEditError("Answer is required."); return; }
    setEditSaving(true); setEditError("");
    const { error: err } = await supabase.from("agent_knowledge")
      .update({ topic: editForm.topic.trim(), content: editForm.content.trim() })
      .eq("id", editId);
    setEditSaving(false);
    if (err) { setEditError(err.message); return; }
    setEditId(null);
    onChanged();
  }

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

  const active  = entries.filter((e) => e.status === "approved");
  const retired = entries.filter((e) => e.status === "retired");

  const row = (e) => {
    const isEditing = editId === e.id;
    return (
      <div key={e.id} style={{ background: e.status === "approved" ? C.raised : C.surface, border: `1px solid ${isEditing ? C.gold : C.border}`, borderRadius: 9, padding: "12px 14px", opacity: e.status === "approved" ? 1 : 0.6 }}>
        {isEditing ? (
          <div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>{where(e)}</div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>TOPIC</div>
              <input value={editForm.topic} maxLength={80} onChange={ev => setEditForm(f => ({ ...f, topic: ev.target.value }))} style={input} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>ANSWER</div>
              <textarea value={editForm.content} maxLength={600} rows={3} onChange={ev => setEditForm(f => ({ ...f, content: ev.target.value }))}
                style={{ ...input, resize: "vertical", lineHeight: 1.5 }} />
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, textAlign: "right" }}>{editForm.content.length}/600</div>
            </div>
            {editError && <div style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>{editError}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEditId(null)} style={btn()}>Cancel</button>
              <button onClick={saveEdit} disabled={editSaving} style={btn("gold")}>{editSaving ? "Saving…" : "Save changes"}</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, color: C.gold, marginBottom: 3 }}>{where(e)} · {e.topic}</div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{e.content}</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                Approved {fmtTime(e.approved_at)}{e.source_routing_log_id ? " · from an escalation" : ""}{e.status === "retired" ? ` · retired ${fmtTime(e.retired_at)}` : ""}
              </div>
            </div>
            {e.status === "approved" && (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => startEdit(e)} style={btn()}>Edit</button>
                <button onClick={() => retire(e)} disabled={busy === e.id} style={btn()}>{busy === e.id ? "…" : "Retire"}</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>Approved agent knowledge</div>
        <button onClick={() => setShowAdd(v => !v)} style={btn("gold")}>{showAdd ? "Cancel" : "+ Add entry"}</button>
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, margin: "2px 0 14px", lineHeight: 1.5 }}>
        Answers management approved with Teach Agent. The AI gives each tenant only the entries for all properties, their property and their own unit, on top of the built-in building facts.
      </div>

      {showAdd && (
        <AddKnowledgeForm
          properties={properties}
          units={units}
          onSaved={() => { setShowAdd(false); onChanged(); }}
        />
      )}

      {error && <div role="alert" style={{ fontSize: 12, color: C.red, marginBottom: 10 }}>{error}</div>}
      {active.length === 0 ? <div style={{ fontSize: 13, color: C.textMuted, padding: "16px 0" }}>Nothing approved yet. Use Teach Agent on an escalation, or click "+ Add entry" above.</div>
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
