import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { C, font, input, btn, label } from "./theme";
import { suggestKnowledge, validateKnowledge, CONTENT_MAX, TOPIC_MAX } from "../lib/agentKnowledge";
import { managementReplyAfter } from "../lib/agentCenterData";

// Teach Agent: management turns an escalation into an approved answer the AI can use next time.
// Nothing is saved until management reviews the suggestion, edits it and presses Approve. Saving knowledge
// does not resolve the escalation unless "Also mark resolved" is ticked.
export default function TeachAgentModal({ log, conversation, reason, tenant, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [alsoResolve, setAlsoResolve] = useState(false);
  const [resolution, setResolution] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      let managementReply = null;
      if (log.tenant_id && tenant.userId) {
        const { data } = await supabase.from("messages").select("id, sender_id, body, created_at, agent_name")
          .eq("tenant_id", log.tenant_id).gte("created_at", log.created_at).order("created_at", { ascending: true }).limit(30);
        managementReply = managementReplyAfter(data, log.created_at, tenant.userId);
      }
      if (live) setForm(suggestKnowledge({ topic: reason?.topic, message: conversation?.message, managementReply, tenant }));
    })();
    return () => { live = false; };
  }, [log, conversation, reason, tenant]);

  async function approve() {
    setFailure("");
    const v = validateKnowledge({ scope: form.scope, propertyId: form.propertyId, unitId: form.unitId, topic: form.topic, content: form.content });
    setErrors(v.errors);
    if (!v.ok) return;
    if (alsoResolve && !resolution.trim()) { setErrors({ resolution: "Say how it was resolved." }); return; }
    setSaving(true);
    try {
      const { data: k, error } = await supabase.from("agent_knowledge")
        .insert({ ...v.entry, source_routing_log_id: log.id }).select("id").single();
      if (error) throw error;
      const events = [{ routing_log_id: log.id, event: "knowledge_added", knowledge_id: k.id, note: `${v.entry.topic}: ${v.entry.content}`.slice(0, 2000) }];
      if (alsoResolve) events.push({ routing_log_id: log.id, event: "resolved", note: resolution.trim().slice(0, 2000) });
      const { error: evErr } = await supabase.from("agent_escalation_events").insert(events);
      if (evErr) throw evErr;
      onSaved();
    } catch (e) {
      setFailure(e?.message || "Could not save. Nothing was changed if the knowledge entry failed.");
      setSaving(false);
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const scopes = [
    { value: "unit", text: tenant.unitNumber ? `Unit ${tenant.unitNumber} only` : "This unit", disabled: !tenant.unitId || !tenant.propertyId },
    { value: "property", text: tenant.propertyName ? `All of ${tenant.propertyName}` : "This property", disabled: !tenant.propertyId },
    { value: "organization", text: "All Modus properties", disabled: false },
  ];

  return (
    <div role="dialog" aria-modal="true" aria-label="Teach Agent" onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "22px 22px", width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", fontFamily: font, color: C.text }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 21, fontWeight: 600, marginBottom: 4 }}>Teach Agent</div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, lineHeight: 1.5 }}>
          Approve an answer the AI may give tenants in future. Only what you approve here is used, and the tenant's own words are never treated as fact.
        </div>

        <div style={{ background: C.raised, borderRadius: 8, padding: "10px 12px", marginBottom: 16, borderLeft: `3px solid ${C.blue}` }}>
          <div style={label}>Tenant asked</div>
          <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{conversation?.message || "(original message not available)"}</div>
        </div>

        {!form ? <div style={{ fontSize: 12, color: C.textSub }}>Preparing a suggestion…</div> : (
          <>
            <fieldset style={{ border: "none", marginBottom: 14 }}>
              <legend style={{ ...label, marginBottom: 8 }}>Applies to</legend>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {scopes.map((s) => (
                  <label key={s.value} style={{ ...btn(form.scope === s.value ? "gold" : "plain"), display: "inline-flex", alignItems: "center", gap: 6, opacity: s.disabled ? 0.4 : 1, cursor: s.disabled ? "not-allowed" : "pointer" }}>
                    <input type="radio" name="scope" value={s.value} disabled={s.disabled} checked={form.scope === s.value}
                      onChange={() => setForm((f) => ({ ...f, scope: s.value, propertyId: s.value === "organization" ? null : tenant.propertyId, unitId: s.value === "unit" ? tenant.unitId : null }))} />
                    {s.text}
                  </label>
                ))}
              </div>
              {errors.scope && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{errors.scope}</div>}
            </fieldset>

            <label style={{ display: "block", marginBottom: 12 }}>
              <div style={label}>Topic</div>
              <input value={form.topic} maxLength={TOPIC_MAX} onChange={set("topic")} style={input} />
              {errors.topic && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{errors.topic}</div>}
            </label>

            <label style={{ display: "block", marginBottom: 6 }}>
              <div style={label}>Approved answer</div>
              <textarea value={form.content} maxLength={CONTENT_MAX} rows={4} onChange={set("content")} style={{ ...input, resize: "vertical", lineHeight: 1.5 }} />
            </label>
            <div style={{ fontSize: 11, color: errors.content ? C.red : C.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
              {errors.content || (form.basedOn === "management_reply"
                ? "Suggested from management's reply in this conversation. Check it before approving."
                : "Write the confirmed answer in place of the placeholder. Never include door, lockbox, alarm or gate codes.")}
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.textSub, marginBottom: alsoResolve ? 8 : 16 }}>
              <input type="checkbox" checked={alsoResolve} onChange={(e) => setAlsoResolve(e.target.checked)} />
              Also mark this escalation resolved
            </label>
            {alsoResolve && (
              <label style={{ display: "block", marginBottom: 16 }}>
                <div style={label}>How it was resolved</div>
                <input value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="e.g. Replied to the tenant with their space number" style={input} />
                {errors.resolution && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{errors.resolution}</div>}
              </label>
            )}

            {failure && <div role="alert" style={{ fontSize: 12, color: C.red, marginBottom: 12 }}>{failure}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onClose} style={{ ...btn(), flex: 1, padding: 10 }}>Cancel</button>
              <button onClick={approve} disabled={saving} style={{ ...btn("gold"), flex: 2, padding: 10, fontWeight: 600 }}>
                {saving ? "Saving…" : "✓ Approve & teach agent"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
