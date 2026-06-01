import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";

const NAV_ITEMS = [
  { icon: "📊", label: "Dashboard",   route: "/landlord" },
  { icon: "🏢", label: "Properties",  route: "/landlord/properties" },
  { icon: "👥", label: "Tenants",     route: "/landlord/tenants" },
  { icon: "💰", label: "Rent Roll",   route: "/landlord/rentroll" },
  { icon: "🔧", label: "Maintenance", route: "/landlord/maintenance" },
  { icon: "📈", label: "Financials",  route: "/landlord/financials" },
  { icon: "💬", label: "Messages",    route: "/landlord/messages" },
  { icon: "⚙️", label: "Settings",   route: "/landlord/settings" },
];

const AVATAR_COLORS = [
  { color: "#185FA5", bg: "#E6F1FB" },
  { color: "#3B6D11", bg: "#EAF3DE" },
  { color: "#854F0B", bg: "#FAEEDA" },
  { color: "#A32D2D", bg: "#FDECEA" },
  { color: "#6B3FA0", bg: "#F3EEFB" },
];

const QUICK_REPLIES = [
  "Thanks for reaching out — I'll look into this shortly.",
  "I've submitted a maintenance ticket for this issue.",
  "Your payment has been received. Thank you!",
  "Please call us at (614) 555-0100 for urgent matters.",
  "I'll follow up with you by end of day.",
];

const s = {
  app: { display: "flex", fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: 14, color: "#1a1a1a", background: "#f4f5f7", height: "100vh", overflow: "hidden", width: "100%" },
  sidebar: { width: 180, background: "#0C1F3F", height: "100vh", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" },
  sidebarLogo: { padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 8 },
  logoText: { fontSize: 15, fontWeight: 700, color: "#fff" },
  logoSub: { fontSize: 10, color: "#5B7FA6", marginTop: 2 },
  navItem: (active) => ({ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: active ? "rgba(255,255,255,0.1)" : "transparent", borderLeft: active ? "3px solid #378ADD" : "3px solid transparent", cursor: "pointer", color: active ? "#fff" : "#7A9CC4", fontSize: 13, fontWeight: active ? 600 : 400 }),
  sidebarFooter: { marginTop: "auto", padding: "16px", borderTop: "1px solid rgba(255,255,255,0.08)" },
  sidebarUser: { display: "flex", alignItems: "center", gap: 10 },
  sidebarAvatar: { width: 32, height: 32, borderRadius: "50%", background: "#185FA5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 },
  sidebarName: { fontSize: 12, fontWeight: 600, color: "#fff" },
  sidebarRole: { fontSize: 10, color: "#5B7FA6" },
  content: { flex: 1, display: "flex", overflow: "hidden", minWidth: 0 },
  threadList: { width: 280, flexShrink: 0, background: "#fff", borderRight: "1px solid #e8eaed", display: "flex", flexDirection: "column", overflow: "hidden" },
  threadListHeader: { padding: "16px 16px 12px", borderBottom: "1px solid #f0f0f0" },
  searchBar: { display: "flex", alignItems: "center", gap: 8, background: "#f4f5f7", borderRadius: 8, padding: "8px 12px", marginTop: 10 },
  searchInput: { flex: 1, border: "none", outline: "none", fontSize: 13, fontFamily: "'Inter',sans-serif", background: "transparent" },
  filterRow: { display: "flex", flexDirection: "column", gap: 8, padding: "10px 16px", borderBottom: "1px solid #f0f0f0" },
  filterSelect: { width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff", fontFamily: "'Inter',sans-serif", outline: "none", cursor: "pointer", color: "#1a1a1a" },
  filterPillRow: { display: "flex", gap: 6 },
  filterPill: (active) => ({ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: active ? 600 : 400, background: active ? "#0C447C" : "#f4f5f7", color: active ? "#fff" : "#666", border: "none", cursor: "pointer", fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" }),
  threadScroll: { flex: 1, overflowY: "auto" },
  threadItem: (active, unread) => ({ padding: "12px 16px", borderBottom: "1px solid #f8f9fa", cursor: "pointer", background: active ? "#E6F1FB" : unread ? "#FAFCFF" : "#fff" }),
  threadItemTop: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  threadLeft: { display: "flex", alignItems: "center", gap: 10 },
  avatar: (color, bg) => ({ width: 36, height: 36, borderRadius: "50%", background: bg, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0, position: "relative" }),
  unreadBadge: { position: "absolute", top: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: "#E24B4A", color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" },
  threadTime: { fontSize: 11, color: "#aaa", flexShrink: 0 },
  threadPreview: (unread) => ({ fontSize: 12, color: unread ? "#1a1a1a" : "#888", fontWeight: unread ? 500 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }),
  chatArea: { flex: 1, display: "flex", flexDirection: "column", background: "#f8f9fa" },
  chatHeader: { background: "#fff", borderBottom: "1px solid #e8eaed", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 },
  chatHeaderLeft: { display: "flex", alignItems: "center", gap: 12 },
  chatName: { fontSize: 15, fontWeight: 700 },
  chatMeta: { fontSize: 12, color: "#888", marginTop: 1 },
  chatActions: { display: "flex", gap: 8 },
  actionBtn: (primary) => ({ padding: "7px 14px", background: primary ? "#0C447C" : "#fff", color: primary ? "#fff" : "#1a1a1a", border: primary ? "none" : "1px solid #e8eaed", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }),
  messageArea: { flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 4 },
  dateDivider: { textAlign: "center", fontSize: 11, color: "#aaa", margin: "10px 0 6px", fontWeight: 500 },
  bubbleRow: (fromMe) => ({ display: "flex", justifyContent: fromMe ? "flex-end" : "flex-start", marginBottom: 2, alignItems: "flex-end", gap: 8 }),
  bubbleAvatar: (color, bg) => ({ width: 28, height: 28, borderRadius: "50%", background: bg, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }),
  bubble: (fromMe) => ({ maxWidth: "65%", padding: "10px 14px", borderRadius: fromMe ? "16px 4px 16px 16px" : "4px 16px 16px 16px", background: fromMe ? "#0C447C" : "#fff", color: fromMe ? "#fff" : "#1a1a1a", fontSize: 13, lineHeight: 1.5, border: fromMe ? "none" : "1px solid #e8eaed", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }),
  bubbleTime: (fromMe) => ({ fontSize: 10, color: "#bbb", marginTop: 3, textAlign: fromMe ? "right" : "left" }),
  quickReplies: { padding: "8px 16px 4px", display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", flexShrink: 0, background: "#fff", borderTop: "1px solid #f0f0f0" },
  quickReply: { padding: "5px 12px", background: "#f4f5f7", border: "1px solid #e8eaed", borderRadius: 16, fontSize: 11, color: "#185FA5", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "'Inter',sans-serif", fontWeight: 500 },
  inputBar: { background: "#fff", borderTop: "1px solid #e8eaed", padding: "12px 16px", display: "flex", alignItems: "flex-end", gap: 10, flexShrink: 0 },
  textInput: { flex: 1, padding: "10px 14px", fontSize: 13, border: "1px solid #e8eaed", borderRadius: 20, background: "#f8f9fa", outline: "none", resize: "none", fontFamily: "'Inter',sans-serif", lineHeight: 1.4, maxHeight: 100, color: "#1a1a1a" },
  sendBtn: (has) => ({ width: 38, height: 38, borderRadius: "50%", background: has ? "#0C447C" : "#e8eaed", border: "none", cursor: has ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#fff", flexShrink: 0 }),
  emptyState: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "#aaa" },
  // Broadcast modal
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: "#fff", borderRadius: 14, width: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" },
  modalHeader: { padding: "20px 24px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 16, fontWeight: 700 },
  modalBody: { padding: "20px 24px" },
  modalFooter: { padding: "16px 24px", borderTop: "1px solid #f0f0f0", display: "flex", gap: 10, justifyContent: "flex-end" },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 },
  select: { width: "100%", padding: "10px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", outline: "none", boxSizing: "border-box", fontFamily: "'Inter',sans-serif", color: "#1a1a1a" },
  textarea: { width: "100%", minHeight: 100, padding: "10px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", outline: "none", boxSizing: "border-box", fontFamily: "'Inter',sans-serif", color: "#1a1a1a", resize: "vertical" },
  btn: (primary) => ({ padding: "9px 16px", background: primary ? "#0C447C" : "#fff", color: primary ? "#fff" : "#1a1a1a", border: primary ? "none" : "1px solid #e8eaed", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }),
};

// ── Broadcast Modal ───────────────────────────────────────────────────────────
function BroadcastModal({ tenants, properties, landlordId, onClose, onSent }) {
  const [propFilter, setPropFilter] = useState("all");
  const [body, setBody]             = useState("");
  const [sending, setSending]       = useState(false);
  const [error, setError]           = useState("");

  const recipients = propFilter === "all"
    ? tenants
    : tenants.filter(t => t.property_id === propFilter);

  async function send() {
    if (!body.trim()) { setError("Message cannot be empty."); return; }
    if (recipients.length === 0) { setError("No recipients."); return; }
    setSending(true);
    const inserts = recipients
      .filter(t => t.user_id) // only tenants with auth accounts
      .map(t => ({
        sender_id:    landlordId,
        recipient_id: t.user_id,
        tenant_id:    t.id,
        body:         body.trim(),
      }));
    if (inserts.length === 0) {
      setError("None of the selected tenants have accepted their invite yet.");
      setSending(false);
      return;
    }
    const { error } = await supabase.from("messages").insert(inserts);
    setSending(false);
    if (error) { setError(error.message); return; }
    onSent(inserts.length);
  }

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <div style={s.modalTitle}>📢 Broadcast message</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#888" }}>✕</button>
        </div>
        <div style={s.modalBody}>
          {error && <div style={{ background: "#FDECEA", color: "#A32D2D", fontSize: 12, padding: "10px 12px", borderRadius: 8, marginBottom: 16 }}>{error}</div>}
          <div style={s.fieldWrap}>
            <label style={s.fieldLabel}>Send to</label>
            <select style={s.select} value={propFilter} onChange={e => setPropFilter(e.target.value)}>
              <option value="all">All tenants ({tenants.length})</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({tenants.filter(t => t.property_id === p.id).length} tenants)
                </option>
              ))}
            </select>
          </div>
          <div style={s.fieldWrap}>
            <label style={s.fieldLabel}>Message</label>
            <textarea style={s.textarea} value={body} onChange={e => setBody(e.target.value)} placeholder="Type your message to all selected tenants…" />
          </div>
          <div style={{ fontSize: 12, color: "#888" }}>
            Will be sent to {recipients.filter(t => t.user_id).length} tenant{recipients.filter(t => t.user_id).length !== 1 ? "s" : ""} who have accepted their invite.
            {recipients.filter(t => !t.user_id).length > 0 && ` (${recipients.filter(t => !t.user_id).length} pending invite will be skipped)`}
          </div>
        </div>
        <div style={s.modalFooter}>
          <button style={s.btn(false)} onClick={onClose}>Cancel</button>
          <button style={s.btn(true)} onClick={send} disabled={sending}>{sending ? "Sending…" : "Send broadcast"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function LandlordMessages() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const bottomRef  = useRef(null);

  const [landlordId, setLandlordId]   = useState(null);
  const [tenants, setTenants]         = useState([]);
  const [properties, setProperties]   = useState([]);
  const [messages, setMessages]       = useState([]);
  const [activeId, setActiveId]       = useState(null); // tenant.id
  const [input, setInput]             = useState("");
  const [search, setSearch]           = useState("");
  const [filter, setFilter]           = useState("all");
  const [propFilter, setPropFilter]   = useState("all");
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastSent, setBroadcastSent] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [sending, setSending]         = useState(false);

  useEffect(() => { fetchAll(); }, []);

  // Auto-select tenant from navigation state (e.g. from Message button on tenant page)
  useEffect(() => {
    if (location.state?.tenantId && tenants.length > 0) {
      setActiveId(location.state.tenantId);
    }
  }, [location.state, tenants]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeId]);

  async function fetchAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setLandlordId(user?.id);

    const [
      { data: tenantsData },
      { data: propsData },
    ] = await Promise.all([
      supabase.from("tenants").select("*, units(unit_number, property_id, properties(id, name))"),
      supabase.from("properties").select("*"),
    ]);

    const enriched = (tenantsData || []).map((t, i) => ({
      ...t,
      unit_number:  t.units?.unit_number || "—",
      property_id:  t.units?.properties?.id,
      property_name: t.units?.properties?.name || "—",
      ...AVATAR_COLORS[i % AVATAR_COLORS.length],
      initials: t.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
    }));

    setTenants(enriched);
    setProperties(propsData || []);

    if (enriched.length > 0 && !location.state?.tenantId) {
      setActiveId(enriched[0].id);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!activeId || !landlordId) return;
    fetchMessages();

    // Real-time subscription
    const channel = supabase
      .channel(`messages-${activeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, payload => {
        const msg = payload.new;
        const activeTenant = tenants.find(t => t.id === activeId);
        if (msg.tenant_id === activeId || (activeTenant?.user_id && (msg.sender_id === activeTenant.user_id || msg.recipient_id === activeTenant.user_id))) {
          setMessages(prev => [...prev, msg]);
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [activeId, landlordId]);

  async function fetchMessages() {
    if (!activeId || !landlordId) return;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("tenant_id", activeId)
      .order("created_at", { ascending: true });
    setMessages(data || []);

    // Mark unread as read
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("tenant_id", activeId)
      .eq("recipient_id", landlordId)
      .eq("read", false);
  }

  async function sendMessage(text) {
    if (!text.trim() || !landlordId || sending) return;
    const activeTenant = tenants.find(t => t.id === activeId);
    if (!activeTenant?.user_id) {
      alert("This tenant hasn't accepted their invite yet. They need to create an account before you can message them.");
      return;
    }
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      sender_id:    landlordId,
      recipient_id: activeTenant.user_id,
      tenant_id:    activeId,
      body:         text.trim(),
    });
    setSending(false);
    if (!error) setInput("");
  }

  const activeTenant = tenants.find(t => t.id === activeId);

  // Thread list — one entry per tenant, with last message + unread count
  const threadData = tenants.map(t => {
    const tMessages = messages.filter(m => m.tenant_id === t.id);
    // For unread: need to load per-tenant unread count separately
    return { ...t, lastMessage: null, lastTime: null, unread: 0 };
  });

  // Unread counts from all messages
  const [unreadCounts, setUnreadCounts] = useState({});
  const [lastMessages, setLastMessages] = useState({});

  useEffect(() => {
    if (!landlordId || tenants.length === 0) return;
    async function loadThreadMeta() {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false });
      if (!data) return;
      const counts = {};
      const lasts  = {};
      data.forEach(msg => {
        if (!lasts[msg.tenant_id]) lasts[msg.tenant_id] = msg;
        if (msg.recipient_id === landlordId && !msg.read) {
          counts[msg.tenant_id] = (counts[msg.tenant_id] || 0) + 1;
        }
      });
      setUnreadCounts(counts);
      setLastMessages(lasts);
    }
    loadThreadMeta();
  }, [landlordId, tenants, messages]);

  const totalUnread = Object.values(unreadCounts).reduce((s, n) => s + n, 0);

  const filteredThreads = tenants.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
                        t.unit_number.toLowerCase().includes(search.toLowerCase()) ||
                        t.property_name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || (filter === "unread" && unreadCounts[t.id] > 0);
    const matchProp   = propFilter === "all" || t.property_id === propFilter;
    return matchSearch && matchFilter && matchProp;
  });

  // Group messages for display
  function groupMessages(msgs) {
    const groups = [];
    let lastDate = null;
    msgs.forEach(msg => {
      const date = new Date(msg.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (date !== lastDate) { groups.push({ type: "date", label: date }); lastDate = date; }
      groups.push({ type: "message", ...msg });
    });
    return groups;
  }

  const activeMessages = messages.filter(m => m.tenant_id === activeId);

  return (
    <LandlordLayout unreadMessages={totalUnread}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; } ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 2px; }`}</style>

      <div style={s.content}>
        {/* Thread list */}
        <div style={s.threadList}>
          <div style={s.threadListHeader}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                Messages {totalUnread > 0 && <span style={{ fontSize: 12, color: "#E24B4A" }}>({totalUnread})</span>}
              </div>
              <button style={{ ...s.actionBtn(true), padding: "6px 12px", fontSize: 11 }} onClick={() => setShowBroadcast(true)}>📢 Broadcast</button>
            </div>
            <div style={s.searchBar}>
              <span>🔍</span>
              <input style={s.searchInput} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tenants…" />
            </div>
          </div>

          <div style={s.filterRow}>
            <select style={s.filterSelect} value={propFilter} onChange={e => setPropFilter(e.target.value)}>
              <option value="all">All properties</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div style={s.filterPillRow}>
              <button style={s.filterPill(filter === "all")} onClick={() => setFilter("all")}>All</button>
              <button style={s.filterPill(filter === "unread")} onClick={() => setFilter("unread")}>Unread ({Object.values(unreadCounts).filter(n => n > 0).length})</button>
            </div>
          </div>

          <div style={s.threadScroll}>
            {loading && <div style={{ padding: 20, textAlign: "center", color: "#888", fontSize: 13 }}>Loading…</div>}
            {!loading && filteredThreads.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: "#888", fontSize: 13 }}>No tenants yet.</div>
            )}
            {!loading && filteredThreads.map(t => {
              const last = lastMessages[t.id];
              const unread = unreadCounts[t.id] || 0;
              return (
                <div key={t.id} style={s.threadItem(activeId === t.id, unread > 0)} onClick={() => setActiveId(t.id)}>
                  <div style={s.threadItemTop}>
                    <div style={s.threadLeft}>
                      <div style={{ position: "relative" }}>
                        <div style={s.avatar(t.color, t.bg)}>{t.initials}</div>
                        {unread > 0 && <div style={s.unreadBadge}>{unread}</div>}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: unread > 0 ? 700 : 500 }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>{t.property_name} · Unit {t.unit_number}</div>
                      </div>
                    </div>
                    <div style={s.threadTime}>{last ? new Date(last.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</div>
                  </div>
                  <div style={s.threadPreview(unread > 0)}>
                    {last ? last.body : t.user_id ? "No messages yet" : "⏳ Invite pending"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat area */}
        {activeTenant ? (
          <div style={s.chatArea}>
            <div style={s.chatHeader}>
              <div style={s.chatHeaderLeft}>
                <div style={s.avatar(activeTenant.color, activeTenant.bg)}>{activeTenant.initials}</div>
                <div>
                  <div style={s.chatName}>{activeTenant.name} <span style={{ fontSize: 12, fontWeight: 400, color: "#888" }}>· Unit {activeTenant.unit_number}</span></div>
                  <div style={s.chatMeta}>{activeTenant.property_name} {!activeTenant.user_id && "· ⏳ Invite pending"}</div>
                </div>
              </div>
              <div style={s.chatActions}>
                <button style={s.actionBtn(false)} onClick={() => navigate(`/landlord/tenants/${activeTenant.id}`)}>View profile</button>
              </div>
            </div>

            <div style={s.messageArea}>
              {!activeTenant.user_id && (
                <div style={{ textAlign: "center", padding: "20px", background: "#FAEEDA", borderRadius: 10, margin: "10px 0", fontSize: 13, color: "#854F0B" }}>
                  ⏳ This tenant hasn't accepted their invite yet. Messages will be available once they create an account.
                </div>
              )}
              {activeMessages.length === 0 && activeTenant.user_id && (
                <div style={{ textAlign: "center", color: "#aaa", fontSize: 13, marginTop: 40 }}>No messages yet — start the conversation.</div>
              )}
              {groupMessages(activeMessages).map((item, i) => {
                if (item.type === "date") return <div key={`d-${i}`} style={s.dateDivider}>{item.label}</div>;
                const fromMe = item.sender_id === landlordId;
                return (
                  <div key={item.id}>
                    <div style={s.bubbleRow(fromMe)}>
                      {!fromMe && <div style={s.bubbleAvatar(activeTenant.color, activeTenant.bg)}>{activeTenant.initials}</div>}
                      <div style={s.bubble(fromMe)}>{item.body}</div>
                    </div>
                    <div style={s.bubbleTime(fromMe)}>{new Date(item.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
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
                placeholder={activeTenant.user_id ? `Message ${activeTenant.name}…` : "Tenant hasn't accepted invite yet…"}
                rows={1}
                disabled={!activeTenant.user_id}
              />
              <button style={s.sendBtn(!!input.trim() && !!activeTenant.user_id)} onClick={() => sendMessage(input)} disabled={!input.trim() || !activeTenant.user_id || sending}>➤</button>
            </div>
          </div>
        ) : (
          <div style={s.emptyState}>
            <div style={{ fontSize: 48 }}>💬</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#555" }}>Select a conversation</div>
            <div style={{ fontSize: 13 }}>Choose a tenant from the left to start messaging</div>
          </div>
        )}
      </div>

      {/* Broadcast modal */}
      {showBroadcast && (
        <BroadcastModal
          tenants={tenants}
          properties={properties}
          landlordId={landlordId}
          onClose={() => setShowBroadcast(false)}
          onSent={(count) => { setShowBroadcast(false); setBroadcastSent(count); setTimeout(() => setBroadcastSent(null), 4000); }}
        />
      )}

      {/* Broadcast success toast */}
      {broadcastSent && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "#0C447C", color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.2)", zIndex: 300 }}>
          ✓ Broadcast sent to {broadcastSent} tenant{broadcastSent !== 1 ? "s" : ""}
        </div>
      )}
    </LandlordLayout>
  );
}