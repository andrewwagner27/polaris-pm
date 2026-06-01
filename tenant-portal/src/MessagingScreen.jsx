import { useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";

const QUICK_REPLIES = [
  "Is parking available?",
  "When is maintenance coming?",
  "Can I renew my lease?",
  "I need a rent receipt",
];

const s = {
  app: { maxWidth: 460, margin: "0 auto", fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: 14, color: "#1a1a1a", background: "#f4f5f7", height: "100vh", display: "flex", flexDirection: "column", paddingBottom: 58 },
  header: { background: "#0C447C", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 },
  backBtn: { background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "#E6F1FB", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  headerAvatar: { width: 36, height: 36, borderRadius: "50%", background: "#185FA5", border: "2px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: "#fff", flexShrink: 0 },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 14, fontWeight: 600, color: "#fff" },
  headerSub: { fontSize: 11, color: "#85B7EB", marginTop: 1 },
  messageList: { flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 4 },
  dateDivider: { textAlign: "center", fontSize: 11, color: "#aaa", margin: "10px 0 6px", fontWeight: 500 },
  bubbleRow: (fromProperty) => ({ display: "flex", justifyContent: fromProperty ? "flex-start" : "flex-end", marginBottom: 2, alignItems: "flex-end", gap: 6 }),
  bubbleAvatar: { width: 28, height: 28, borderRadius: "50%", background: "#E6F1FB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#185FA5", flexShrink: 0 },
  bubble: (fromProperty) => ({ maxWidth: "75%", padding: "10px 13px", borderRadius: fromProperty ? "4px 16px 16px 16px" : "16px 4px 16px 16px", background: fromProperty ? "#fff" : "#0C447C", color: fromProperty ? "#1a1a1a" : "#fff", fontSize: 13, lineHeight: 1.5, border: fromProperty ? "1px solid #e8eaed" : "none", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }),
  bubbleTime: (fromProperty) => ({ fontSize: 10, color: "#bbb", marginTop: 3, textAlign: fromProperty ? "left" : "right", paddingLeft: fromProperty ? 34 : 0 }),
  quickReplies: { padding: "8px 16px 4px", display: "flex", gap: 8, overflowX: "auto", flexShrink: 0, scrollbarWidth: "none" },
  quickReply: { padding: "6px 12px", background: "#fff", border: "1px solid #d1d5db", borderRadius: 16, fontSize: 12, color: "#185FA5", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "'Inter',sans-serif", fontWeight: 500, flexShrink: 0 },
  inputBar: { background: "#fff", borderTop: "1px solid #e8eaed", padding: "10px 12px", display: "flex", alignItems: "flex-end", gap: 8, flexShrink: 0 },
  textInput: { flex: 1, padding: "9px 13px", fontSize: 14, border: "1px solid #e8eaed", borderRadius: 20, background: "#f8f9fa", color: "#1a1a1a", outline: "none", resize: "none", fontFamily: "'Inter',sans-serif", lineHeight: 1.4, maxHeight: 100, overflowY: "auto" },
  sendBtn: (hasText) => ({ width: 36, height: 36, borderRadius: "50%", background: hasText ? "#0C447C" : "#e8eaed", border: "none", cursor: hasText ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, color: "#fff" }),
};

export default function MessagingScreen() {
  const navigate    = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(true);
  const [tenantId, setTenantId] = useState(null);
  const [landlordId, setLandlordId] = useState(null);
  const [myUserId, setMyUserId] = useState(null);
  const bottomRef   = useRef(null);

  useEffect(() => { init(); }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/login"); return; }
    setMyUserId(user.id);

    // Find tenant record for this user
    const { data: tenantData } = await supabase
      .from("tenants")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!tenantData) {
      setLoading(false);
      return;
    }
    setTenantId(tenantData.id);

    // Find landlord — get the sender of the first message to this tenant, or use profiles
    const { data: firstMsg } = await supabase
      .from("messages")
      .select("sender_id, recipient_id")
      .eq("tenant_id", tenantData.id)
      .limit(1)
      .single();

    // Landlord is whoever is NOT this user in that message
    const lId = firstMsg
      ? (firstMsg.sender_id !== user.id ? firstMsg.sender_id : firstMsg.recipient_id)
      : null;
    setLandlordId(lId);

    await fetchMessages(tenantData.id);

    // Mark messages as read
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("tenant_id", tenantData.id)
      .eq("recipient_id", user.id)
      .eq("read", false);

    // Real-time subscription
    supabase
      .channel(`tenant-messages-${tenantData.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, payload => {
        if (payload.new.tenant_id === tenantData.id) {
          setMessages(prev => [...prev, payload.new]);
        }
      })
      .subscribe();

    setLoading(false);
  }

  async function fetchMessages(tId) {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("tenant_id", tId)
      .order("created_at", { ascending: true });
    setMessages(data || []);
  }

  async function sendMessage(text) {
    if (!text.trim() || !myUserId || !tenantId) return;

    // We need landlordId to send — get from profiles if not set
    let lId = landlordId;
    if (!lId) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "landlord")
        .limit(1)
        .single();
      lId = profiles?.id;
      setLandlordId(lId);
    }

    if (!lId) { alert("Unable to find property manager. Please contact support."); return; }

    await supabase.from("messages").insert({
      sender_id:    myUserId,
      recipient_id: lId,
      tenant_id:    tenantId,
      body:         text.trim(),
    });
    setInput("");
  }

  // Group messages by date
  const grouped = [];
  let lastDate = null;
  messages.forEach(msg => {
    const date = new Date(msg.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (date !== lastDate) { grouped.push({ type: "date", label: date }); lastDate = date; }
    grouped.push({ type: "message", ...msg });
  });

  return (
    <div style={s.app}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; } ::-webkit-scrollbar { width: 0; }`}</style>

      <div style={s.header}>
        <button style={s.backBtn} onClick={() => navigate("/home")}>←</button>
        <div style={s.headerAvatar}>PP</div>
        <div style={s.headerInfo}>
          <div style={s.headerName}>Polaris Properties</div>
          <div style={s.headerSub}>Property management · Usually replies in a few hours</div>
        </div>
      </div>

      <div style={s.messageList}>
        {loading && <div style={{ textAlign: "center", color: "#aaa", fontSize: 13, marginTop: 40 }}>Loading messages…</div>}
        {!loading && !tenantId && (
          <div style={{ textAlign: "center", color: "#aaa", fontSize: 13, marginTop: 40 }}>
            Your account isn't linked to a unit yet. Contact your property manager.
          </div>
        )}
        {!loading && tenantId && messages.length === 0 && (
          <div style={{ textAlign: "center", color: "#aaa", fontSize: 13, marginTop: 40 }}>
            No messages yet — send a message to get started.
          </div>
        )}
        {grouped.map((item, i) => {
          if (item.type === "date") return <div key={`d-${i}`} style={s.dateDivider}>{item.label}</div>;
          const fromProperty = item.sender_id !== myUserId;
          return (
            <div key={item.id}>
              <div style={s.bubbleRow(fromProperty)}>
                {fromProperty && <div style={s.bubbleAvatar}>PP</div>}
                <div style={s.bubble(fromProperty)}>{item.body}</div>
              </div>
              <div style={s.bubbleTime(fromProperty)}>
                {new Date(item.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div style={s.quickReplies}>
        {QUICK_REPLIES.map((q, i) => (
          <button key={i} style={s.quickReply} onClick={() => sendMessage(q)}>{q}</button>
        ))}
      </div>

      <div style={s.inputBar}>
        <textarea
          style={s.textInput}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
          placeholder="Message Polaris Properties…"
          rows={1}
        />
        <button style={s.sendBtn(input.trim().length > 0)} onClick={() => sendMessage(input)} disabled={!input.trim()}>➤</button>
      </div>
    </div>
  );
}