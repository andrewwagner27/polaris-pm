import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";

// ─── Modus tokens ──────────────────────────────────────────────────────────
const C = {
  bg:        "#0A0B0D",
  surface:   "#111316",
  raised:    "#181C21",
  border:    "#252930",
  text:      "#EDEAE2",
  textSub:   "#9095A0",
  textMuted: "#5C6270",
  gold:      "#C9A96E",
  goldDim:   "#7A5C2E",
  blue:      "#4A9AE8",
  green:     "#72B02A",
  red:       "#E05555",
  amber:     "#F0A430",
};

const AVATAR_COLORS = [C.gold, C.blue, C.green, C.amber, C.red];

const QUICK_REPLIES = [
  "Thanks for reaching out — I'll look into this shortly.",
  "I've submitted a maintenance ticket for this issue.",
  "Your payment has been received. Thank you!",
  "Please call us at (614) 555-0100 for urgent matters.",
  "I'll follow up with you by end of day.",
];

function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

function FieldLabel({ children }) {
  return <label style={{ fontSize: 11, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 5 }}>{children}</label>;
}

function PrimaryBtn({ children, onClick, disabled, small }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: "transparent", border: `1px solid ${C.goldDim}`,
      color: C.gold, fontSize: small ? 11 : 13, fontWeight: 500,
      padding: small ? "5px 10px" : "9px 18px", borderRadius: 7,
      cursor: disabled ? "default" : "pointer",
      fontFamily: "'DM Sans', sans-serif", transition: "background 0.15s",
      opacity: disabled ? 0.5 : 1,
    }}
      onMouseOver={e => !disabled && (e.currentTarget.style.background = "rgba(201,169,110,0.07)")}
      onMouseOut={e => e.currentTarget.style.background = "transparent"}
    >{children}</button>
  );
}

function GhostBtn({ children, onClick, small }) {
  return (
    <button onClick={onClick} style={{
      background: "transparent", border: `1px solid ${C.border}`,
      color: C.textSub, fontSize: small ? 11 : 13, fontWeight: 500,
      padding: small ? "5px 10px" : "8px 14px", borderRadius: 7,
      cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
    }}
      onMouseOver={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = "#353A44"; }}
      onMouseOut={e => { e.currentTarget.style.color = C.textSub; e.currentTarget.style.borderColor = C.border; }}
    >{children}</button>
  );
}

// ─── Broadcast Modal ───────────────────────────────────────────────────────
function BroadcastModal({ tenants, properties, landlordId, onClose, onSent }) {
  const [propFilter, setPropFilter] = useState("all");
  const [body, setBody]             = useState("");
  const [sending, setSending]       = useState(false);
  const [error, setError]           = useState("");

  const recipients = propFilter === "all" ? tenants : tenants.filter(t => t.property_id === propFilter);

  async function send() {
    if (!body.trim()) { setError("Message cannot be empty."); return; }
    if (recipients.length === 0) { setError("No recipients."); return; }
    setSending(true);
    const inserts = recipients.filter(t => t.user_id).map(t => ({
      sender_id: landlordId, recipient_id: t.user_id, tenant_id: t.id, body: body.trim(),
    }));
    if (inserts.length === 0) { setError("None of the selected tenants have accepted their invite yet."); setSending(false); return; }
    const { error } = await supabase.from("messages").insert(inserts);
    setSending(false);
    if (error) { setError(error.message); return; }
    onSent(inserts.length);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: 480, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Broadcast message</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: C.textSub }}>✕</button>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {error && <div style={{ background: "rgba(224,85,85,0.1)", color: C.red, fontSize: 12, padding: "10px 12px", borderRadius: 7, marginBottom: 16, border: `1px solid rgba(224,85,85,0.2)` }}>{error}</div>}
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Send to</FieldLabel>
            <select value={propFilter} onChange={e => setPropFilter(e.target.value)} style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, background: C.raised, color: C.textSub, outline: "none", fontFamily: "'DM Sans', sans-serif" }}>
              <option value="all">All tenants ({tenants.length})</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name} ({tenants.filter(t => t.property_id === p.id).length} tenants)</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Message</FieldLabel>
            <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Type your message to all selected tenants…"
              style={{ width: "100%", minHeight: 100, padding: "10px 12px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, background: C.raised, color: C.text, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", resize: "vertical" }} />
          </div>
          <div style={{ fontSize: 12, color: C.textSub }}>
            Will be sent to {recipients.filter(t => t.user_id).length} tenant{recipients.filter(t => t.user_id).length !== 1 ? "s" : ""} who have accepted their invite.
            {recipients.filter(t => !t.user_id).length > 0 && ` (${recipients.filter(t => !t.user_id).length} pending invite will be skipped)`}
          </div>
        </div>
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={send} disabled={sending}>{sending ? "Sending…" : "Send broadcast"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function LandlordMessages() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const bottomRef = useRef(null);
  const width     = useWindowWidth();
  const isMobile  = width < 768;

  const [landlordId, setLandlordId]     = useState(null);
  const [tenants, setTenants]           = useState([]);
  const [properties, setProperties]     = useState([]);
  const [messages, setMessages]         = useState([]);
  const [activeId, setActiveId]         = useState(null);
  const [input, setInput]               = useState("");
  const [search, setSearch]             = useState("");
  const [filter, setFilter]             = useState("all");
  const [propFilter, setPropFilter]     = useState("all");
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastSent, setBroadcastSent] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [sending, setSending]           = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [lastMessages, setLastMessages] = useState({});

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    if (location.state?.tenantId && tenants.length > 0) setActiveId(location.state.tenantId);
  }, [location.state, tenants]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, activeId]);

  async function fetchAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setLandlordId(user?.id);
    const [{ data: tenantsData }, { data: propsData }] = await Promise.all([
      supabase.from("tenants").select("*, units(unit_number, property_id, properties(id, name))"),
      supabase.from("properties").select("*"),
    ]);
    const enriched = (tenantsData || []).map((t, i) => ({
      ...t,
      unit_number:   t.units?.unit_number || "—",
      property_id:   t.units?.properties?.id,
      property_name: t.units?.properties?.name || "—",
      accentColor:   AVATAR_COLORS[i % AVATAR_COLORS.length],
      initials:      t.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
    }));
    setTenants(enriched);
    setProperties(propsData || []);
    if (enriched.length > 0 && !location.state?.tenantId) setActiveId(enriched[0].id);
    setLoading(false);
  }

  useEffect(() => {
    if (!landlordId || tenants.length === 0) return;
    async function loadThreadMeta() {
      const { data } = await supabase.from("messages").select("*").order("created_at", { ascending: false });
      if (!data) return;
      const counts = {}, lasts = {};
      data.forEach(msg => {
        if (!lasts[msg.tenant_id]) lasts[msg.tenant_id] = msg;
        if (msg.recipient_id === landlordId && !msg.read) counts[msg.tenant_id] = (counts[msg.tenant_id] || 0) + 1;
      });
      setUnreadCounts(counts);
      setLastMessages(lasts);
    }
    loadThreadMeta();
  }, [landlordId, tenants, messages]);

  useEffect(() => {
    if (!activeId || !landlordId) return;
    fetchMessages();
    const channel = supabase.channel(`messages-${activeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, payload => {
        const msg = payload.new;
        const at = tenants.find(t => t.id === activeId);
        if (msg.tenant_id === activeId || (at?.user_id && (msg.sender_id === at.user_id || msg.recipient_id === at.user_id))) {
          setMessages(prev => [...prev, msg]);
        }
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [activeId, landlordId]);

  async function fetchMessages() {
    if (!activeId || !landlordId) return;
    const { data } = await supabase.from("messages").select("*").eq("tenant_id", activeId).order("created_at", { ascending: true });
    setMessages(data || []);
    await supabase.from("messages").update({ read: true }).eq("tenant_id", activeId).eq("recipient_id", landlordId).eq("read", false);
  }

  async function sendMessage(text) {
    if (!text.trim() || !landlordId || sending) return;
    const at = tenants.find(t => t.id === activeId);
    if (!at?.user_id) { alert("This tenant hasn't accepted their invite yet."); return; }
    setSending(true);
    const { error } = await supabase.from("messages").insert({ sender_id: landlordId, recipient_id: at.user_id, tenant_id: activeId, body: text.trim() });
    setSending(false);
    if (!error) setInput("");
  }

  const activeTenant = tenants.find(t => t.id === activeId);
  const totalUnread  = Object.values(unreadCounts).reduce((s, n) => s + n, 0);

  const filteredThreads = tenants.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
                        t.unit_number.toLowerCase().includes(search.toLowerCase()) ||
                        t.property_name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || (filter === "unread" && unreadCounts[t.id] > 0);
    const matchProp   = propFilter === "all" || t.property_id === propFilter;
    return matchSearch && matchFilter && matchProp;
  });

  function groupMessages(msgs) {
    const groups = []; let lastDate = null;
    msgs.forEach(msg => {
      const date = new Date(msg.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (date !== lastDate) { groups.push({ type: "date", label: date }); lastDate = date; }
      groups.push({ type: "message", ...msg });
    });
    return groups;
  }

  const activeMessages = messages.filter(m => m.tenant_id === activeId);

  return (
    <LandlordLayout unreadMessages={totalUnread} openMaintenance={0}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        .m-thread:hover { background: ${C.raised} !important; }
        .m-quick:hover { border-color: ${C.goldDim} !important; color: ${C.gold} !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        ::-webkit-scrollbar:horizontal { height: 0; }
      `}</style>

      {/* Two-pane layout inside LandlordLayout's content area */}
      <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: "'DM Sans', sans-serif" }}>

        {/* ── Thread list ── */}
        <div style={{ width: 280, flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Header */}
          <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                Messages {totalUnread > 0 && <span style={{ fontSize: 11, color: C.red }}>({totalUnread})</span>}
              </div>
              <PrimaryBtn small onClick={() => setShowBroadcast(true)}>Broadcast</PrimaryBtn>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.raised, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 11px" }}>
              <span style={{ color: C.textMuted, fontSize: 13 }}>⌕</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tenants…"
                style={{ flex: 1, border: "none", outline: "none", fontSize: 12, fontFamily: "'DM Sans', sans-serif", background: "transparent", color: C.text }} />
            </div>
          </div>

          {/* Filters */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
            <select value={propFilter} onChange={e => setPropFilter(e.target.value)} style={{ width: "100%", padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, background: C.raised, color: C.textSub, outline: "none", fontFamily: "'DM Sans', sans-serif" }}>
              <option value="all">All properties</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div style={{ display: "flex", gap: 6 }}>
              {["all", "unread"].map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: "4px 10px", borderRadius: 5, fontSize: 11, fontWeight: 500,
                  background: filter === f ? C.goldDim : "transparent",
                  color: filter === f ? C.text : C.textSub,
                  border: `1px solid ${filter === f ? C.goldDim : C.border}`,
                  cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.12s",
                }}>
                  {f === "all" ? "All" : `Unread (${Object.values(unreadCounts).filter(n => n > 0).length})`}
                </button>
              ))}
            </div>
          </div>

          {/* Thread items */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && <div style={{ padding: 20, textAlign: "center", color: C.textSub, fontSize: 13 }}>Loading…</div>}
            {!loading && filteredThreads.length === 0 && <div style={{ padding: 20, textAlign: "center", color: C.textSub, fontSize: 13 }}>No tenants yet.</div>}
            {!loading && filteredThreads.map(t => {
              const last   = lastMessages[t.id];
              const unread = unreadCounts[t.id] || 0;
              const active = activeId === t.id;
              return (
                <div key={t.id} className="m-thread"
                  style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: active ? C.raised : "transparent", transition: "background 0.12s" }}
                  onClick={() => setActiveId(t.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div style={{ position: "relative" }}>
                        <div style={{ width: 34, height: 34, borderRadius: "50%", background: `${t.accentColor}22`, border: `1px solid ${t.accentColor}44`, color: t.accentColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{t.initials}</div>
                        {unread > 0 && <div style={{ position: "absolute", top: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: C.red, color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${C.surface}` }}>{unread}</div>}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: unread > 0 ? 700 : 500, color: C.text }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: C.textMuted }}>{t.property_name} · Unit {t.unit_number}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>
                      {last ? new Date(last.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: unread > 0 ? C.text : C.textSub, fontWeight: unread > 0 ? 500 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingLeft: 43 }}>
                    {last ? last.body : t.user_id ? "No messages yet" : "⏳ Invite pending"}
                  </div>
                  {active && <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 2, background: C.gold, borderRadius: 1 }} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Chat area ── */}
        {activeTenant ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden", minWidth: 0 }}>

            {/* Chat header */}
            <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${activeTenant.accentColor}22`, border: `1px solid ${activeTenant.accentColor}44`, color: activeTenant.accentColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{activeTenant.initials}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{activeTenant.name} <span style={{ fontSize: 12, fontWeight: 400, color: C.textSub }}>· Unit {activeTenant.unit_number}</span></div>
                  <div style={{ fontSize: 12, color: C.textMuted }}>{activeTenant.property_name}{!activeTenant.user_id && " · ⏳ Invite pending"}</div>
                </div>
              </div>
              <GhostBtn small onClick={() => navigate(`/landlord/tenants/${activeTenant.id}`)}>View profile</GhostBtn>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 4 }}>
              {!activeTenant.user_id && (
                <div style={{ textAlign: "center", padding: "16px 20px", background: "rgba(240,164,48,0.08)", border: `1px solid rgba(240,164,48,0.2)`, borderRadius: 10, margin: "8px 0", fontSize: 13, color: C.amber }}>
                  ⏳ This tenant hasn't accepted their invite yet.
                </div>
              )}
              {activeMessages.length === 0 && activeTenant.user_id && (
                <div style={{ textAlign: "center", color: C.textMuted, fontSize: 13, marginTop: 40 }}>No messages yet — start the conversation.</div>
              )}
              {groupMessages(activeMessages).map((item, i) => {
                if (item.type === "date") return (
                  <div key={`d-${i}`} style={{ textAlign: "center", fontSize: 11, color: C.textMuted, margin: "10px 0 6px", fontWeight: 500 }}>{item.label}</div>
                );
                const fromMe = item.sender_id === landlordId;
                return (
                  <div key={item.id}>
                    <div style={{ display: "flex", justifyContent: fromMe ? "flex-end" : "flex-start", marginBottom: 2, alignItems: "flex-end", gap: 8 }}>
                      {!fromMe && (
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: `${activeTenant.accentColor}22`, border: `1px solid ${activeTenant.accentColor}44`, color: activeTenant.accentColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{activeTenant.initials}</div>
                      )}
                      <div style={{ maxWidth: "65%", padding: "10px 14px", borderRadius: fromMe ? "14px 4px 14px 14px" : "4px 14px 14px 14px", background: fromMe ? C.goldDim : C.surface, border: fromMe ? "none" : `1px solid ${C.border}`, fontSize: 13, color: fromMe ? C.text : C.text, lineHeight: 1.5 }}>
                        {item.body}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: C.textMuted, textAlign: fromMe ? "right" : "left", marginBottom: 4, paddingLeft: fromMe ? 0 : 34 }}>
                      {new Date(item.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Quick replies */}
            <div style={{ padding: "8px 16px 4px", display: "flex", gap: 8, overflowX: "auto", flexShrink: 0, background: C.surface, borderTop: `1px solid ${C.border}` }}>
              {QUICK_REPLIES.map((q, i) => (
                <button key={i} className="m-quick" onClick={() => sendMessage(q)} style={{ padding: "5px 12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 14, fontSize: 11, color: C.textSub, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, transition: "all 0.12s" }}>{q}</button>
              ))}
            </div>

            {/* Input bar */}
            <div style={{ background: C.surface, borderTop: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", alignItems: "flex-end", gap: 10, flexShrink: 0 }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                placeholder={activeTenant.user_id ? `Message ${activeTenant.name}…` : "Tenant hasn't accepted invite yet…"}
                rows={1}
                disabled={!activeTenant.user_id}
                style={{ flex: 1, padding: "10px 14px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 18, background: C.raised, color: C.text, outline: "none", resize: "none", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4, maxHeight: 100, opacity: activeTenant.user_id ? 1 : 0.5 }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || !activeTenant.user_id || sending}
                style={{ width: 38, height: 38, borderRadius: "50%", background: input.trim() && activeTenant.user_id ? C.goldDim : C.raised, border: `1px solid ${input.trim() && activeTenant.user_id ? C.goldDim : C.border}`, cursor: input.trim() && activeTenant.user_id ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: input.trim() && activeTenant.user_id ? C.gold : C.textMuted, flexShrink: 0, transition: "all 0.15s" }}
              >➤</button>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: C.textMuted, background: C.bg }}>
            <div style={{ fontSize: 44 }}>✉</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.textSub }}>Select a conversation</div>
            <div style={{ fontSize: 13 }}>Choose a tenant from the left to start messaging</div>
          </div>
        )}
      </div>

      {showBroadcast && (
        <BroadcastModal tenants={tenants} properties={properties} landlordId={landlordId}
          onClose={() => setShowBroadcast(false)}
          onSent={count => { setShowBroadcast(false); setBroadcastSent(count); setTimeout(() => setBroadcastSent(null), 4000); }}
        />
      )}

      {broadcastSent && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: C.surface, border: `1px solid ${C.green}`, color: C.green, padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 300 }}>
          ✓ Broadcast sent to {broadcastSent} tenant{broadcastSent !== 1 ? "s" : ""}
        </div>
      )}
    </LandlordLayout>
  );
}