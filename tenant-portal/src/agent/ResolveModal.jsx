import { useState } from "react";
import { supabase } from "../supabase";
import { C, font, input, btn, label } from "./theme";

// Resolve or reopen an escalation. Each action is a new row in agent_escalation_events (insert-only), so the
// history of who resolved or reopened it, when and why, is kept. The conversation itself is never changed.
export default function ResolveModal({ log, mode, onClose, onSaved }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const resolving = mode === "resolve";

  async function save() {
    if (resolving && !note.trim()) { setError("Say how it was resolved."); return; }
    setSaving(true); setError("");
    const { error: e } = await supabase.from("agent_escalation_events")
      .insert({ routing_log_id: log.id, event: resolving ? "resolved" : "reopened", note: note.trim().slice(0, 2000) || null });
    if (e) { setError(e.message || "Could not save."); setSaving(false); return; }
    // The dashboard's unread alert for this message is cleared too (best effort; the event above is the record).
    if (resolving && log.message_id) {
      await supabase.from("landlord_alerts").update({ is_read: true }).eq("message_id", log.message_id).then(() => {}, () => {});
    }
    onSaved();
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={resolving ? "Resolve escalation" : "Reopen escalation"} onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 22, width: "100%", maxWidth: 460, fontFamily: font, color: C.text }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 21, fontWeight: 600, marginBottom: 4 }}>{resolving ? "Resolve escalation" : "Reopen escalation"}</div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
          {resolving ? "Record what management did. The conversation and its history are kept." : "Mark this escalation as needing attention again."}
        </div>
        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={label}>{resolving ? "Resolution" : "Reason (optional)"}</div>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} style={{ ...input, resize: "vertical" }}
            placeholder={resolving ? "e.g. Called the tenant and confirmed their lease renewal date" : ""} />
        </label>
        {error && <div role="alert" style={{ fontSize: 12, color: C.red, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ ...btn(), flex: 1, padding: 10 }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...btn(resolving ? "green" : "gold"), flex: 2, padding: 10, fontWeight: 600 }}>
            {saving ? "Saving…" : resolving ? "✓ Mark resolved" : "Reopen"}
          </button>
        </div>
      </div>
    </div>
  );
}
