import { useState } from "react";
import { useNavigate } from "react-router-dom";

const THREADS = [
  {
    id: 1,
    tenant: "Priya M.",
    unit: "2B",
    property: "Clifton Manor",
    avatar: "PM",
    color: "#A32D2D",
    bg: "#FDECEA",
    unread: 2,
    lastMessage: "I haven't been able to pay yet, my bank account had a hold placed on it. I'll have it sorted by Friday.",
    lastTime: "Today 9:14am",
    messages: [
      { id: 1, from: "property", text: "Hi Priya — just a reminder that June rent of $1,150 was due on June 1st. Please let us know your payment timeline.", time: "Jun 2, 10:00am", read: true },
      { id: 2, from: "tenant",   text: "Hi, I'm so sorry. I've been dealing with some bank issues this week.", time: "Jun 2, 2:30pm", read: true },
      { id: 3, from: "property", text: "No problem — please keep us updated. A $75 late fee applies after June 5th per your lease.", time: "Jun 2, 3:00pm", read: true },
      { id: 4, from: "tenant",   text: "I haven't been able to pay yet, my bank account had a hold placed on it. I'll have it sorted by Friday.", time: "Today 9:14am", read: false },
    ],
  },
  {
    id: 2,
    tenant: "Kaidyn T.",
    unit: "Main",
    property: "944 18th Ave S",
    avatar: "KT",
    color: "#3B6D11",
    bg: "#EAF3DE",
    unread: 1,
    lastMessage: "The AC is still not cooling properly. It's 84 degrees in here right now. Can someone come today?",
    lastTime: "Today 8:02am",
    messages: [
      { id: 1, from: "tenant",   text: "Hi! The AC has been struggling to cool the unit. It runs all day but won't get below 80.", time: "Jun 2, 7:15am", read: true },
      { id: 2, from: "property", text: "Thanks for letting us know Kaidyn. I've submitted a maintenance ticket and will have CoolAir HVAC reach out to schedule.", time: "Jun 2, 9:00am", read: true },
      { id: 3, from: "tenant",   text: "The AC is still not cooling properly. It's 84 degrees in here right now. Can someone come today?", time: "Today 8:02am", read: false },
    ],
  },
  {
    id: 3,
    tenant: "Maria R.",
    unit: "3A",
    property: "Clifton Manor",
    avatar: "MR",
    color: "#185FA5",
    bg: "#E6F1FB",
    unread: 0,
    lastMessage: "Perfect, thank you! We'll be home all morning.",
    lastTime: "Yesterday",
    messages: [
      { id: 1, from: "property", text: "Hi Maria — confirming the plumber visit on Jun 2 between 10am–12pm. Please make sure someone is home.", time: "Jun 1, 3:00pm", read: true },
      { id: 2, from: "tenant",   text: "Perfect, thank you! We'll be home all morning.", time: "Yesterday 4:15pm", read: true },
    ],
  },
  {
    id: 4,
    tenant: "Sam P.",
    unit: "4A",
    property: "Clifton Manor",
    avatar: "SP",
    color: "#854F0B",
    bg: "#FAEEDA",
    unread: 0,
    lastMessage: "Got it, thanks for the heads up. I'll be in touch about renewal soon.",
    lastTime: "Jun 1",
    messages: [
      { id: 1, from: "property", text: "Hi Sam — your lease expires June 30th. I'd love to discuss renewal options. Are you interested in staying on?", time: "May 28, 10:00am", read: true },
      { id: 2, from: "tenant",   text: "Hey! Yes I'm definitely interested. What would the new rate look like?", time: "May 28, 6:45pm", read: true },
      { id: 3, from: "property", text: "We'd keep it at $1,200/month for another 12 months. Happy to send over a renewal offer this week.", time: "May 29, 9:00am", read: true },
      { id: 4, from: "tenant",   text: "Got it, thanks for the heads up. I'll be in touch about renewal soon.", time: "Jun 1, 11:30am", read: true },
    ],
  },
  {
    id: 5,
    tenant: "James W.",
    unit: "1A",
    property: "Clifton Manor",
    avatar: "JW",
    color: "#185FA5",
    bg: "#E6F1FB",
    unread: 0,
    lastMessage: "No problem at all, happy to help.",
    lastTime: "May 30",
    messages: [
      { id: 1, from: "tenant",   text: "Hi! Quick question — is there a package room or somewhere safe to leave deliveries?", time: "May 30, 1:00pm", read: true },
      { id: 2, from: "property", text: "Hey James! There's a secure package area just inside the main entrance. Code is 4421.", time: "May 30, 2:00pm", read: true },
      { id: 3, from: "tenant",   text: "No problem at all, happy to help.", time: "May 30, 2:15pm", read: true },
    ],
  },
];

const QUICK_REPLIES = [
  "Thanks for reaching out — I'll look into this shortly.",
  "I've submitted a maintenance ticket for this issue.",
  "Your payment has been received. Thank you!",
  "Please call us at (614) 555-0100 for urgent matters.",
  "I'll follow up with you by end of day.",
];

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

const s = {
  app: { display: "flex", fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: 14, color: "#1a1a1a", background: "#f4f5f7", minHeight: "100vh" },
  sidebar: { width: 220, background: "#0C1F3F", minHeight: "100vh", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh" },
  sidebarLogo: { padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 8 },
  logoText: { fontSize: 15, fontWeight: 700, color: "#fff" },
  logoSub: { fontSize: 10, color: "#5B7FA6", marginTop: 2 },
  navItem: (active) => ({ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: active ? "rgba(255,255,255,0.1)" : "transparent", borderLeft: active ? "3px solid #378ADD" : "3px solid transparent", cursor: "pointer", color: active ? "#fff" : "#7A9CC4", fontSize: 13, fontWeight: active ? 600 : 400 }),
  sidebarFooter: { marginTop: "auto", padding: "16px", borderTop: "1px solid rgba(255,255,255,0.08)" },
  sidebarUser: { display: "flex", alignItems: "center", gap: 10 },
  sidebarAvatar: { width: 32, height: 32, borderRadius: "50%", background: "#185FA5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 },
  sidebarName: { fontSize: 12, fontWeight: 600, color: "#fff" },
  sidebarRole: { fontSize: 10, color: "#5B7FA6" },
  // Layout
  content: { flex: 1, display: "flex", height: "100vh", overflow: "hidden" },
  // Thread list
  threadList: { width: 320, background: "#fff", borderRight: "1px solid #e8eaed", display: "flex", flexDirection: "column", flexShrink: 0 },
  threadListHeader: { padding: "16px 16px 12px", borderBottom: "1px solid #f0f0f0" },
  threadListTitle: { fontSize: 16, fontWeight: 700, marginBottom: 10 },
  searchBar: { display: "flex", alignItems: "center", gap: 8, background: "#f4f5f7", borderRadius: 8, padding: "8px 12px" },
  searchInput: { flex: 1, border: "none", outline: "none", fontSize: 13, fontFamily: "'Inter',sans-serif", background: "transparent" },
  filterRow: { display: "flex", flexDirection: "column", gap: 8, padding: "10px 16px", borderBottom: "1px solid #f0f0f0" },
  filterSelect: { width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff", fontFamily: "'Inter',sans-serif", outline: "none", cursor: "pointer", color: "#1a1a1a" },
  filterPillRow: { display: "flex", gap: 6 },
  filterPill: (active) => ({ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: active ? 600 : 400, background: active ? "#0C447C" : "#f4f5f7", color: active ? "#fff" : "#666", border: "none", cursor: "pointer", fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" }),
  flaggedDot: { width: 8, height: 8, borderRadius: "50%", background: "#E24B4A", flexShrink: 0 },
  threadScroll: { flex: 1, overflowY: "auto" },
  threadItem: (active, unread) => ({ padding: "12px 16px", borderBottom: "1px solid #f8f9fa", cursor: "pointer", background: active ? "#E6F1FB" : unread ? "#FAFCFF" : "#fff", transition: "background 0.1s" }),
  threadItemTop: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  threadLeft: { display: "flex", alignItems: "center", gap: 10 },
  avatar: (color, bg) => ({ width: 36, height: 36, borderRadius: "50%", background: bg, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0, position: "relative" }),
  unreadBadge: { position: "absolute", top: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: "#E24B4A", color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" },
  threadName: (unread) => ({ fontSize: 13, fontWeight: unread ? 700 : 500, color: "#1a1a1a" }),
  threadMeta: { fontSize: 11, color: "#888" },
  threadTime: { fontSize: 11, color: "#aaa", flexShrink: 0 },
  threadPreview: (unread) => ({ fontSize: 12, color: unread ? "#1a1a1a" : "#888", fontWeight: unread ? 500 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }),
  propBadge: (prop) => ({ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 6, background: prop === "Clifton Manor" ? "#E6F1FB" : "#EAF3DE", color: prop === "Clifton Manor" ? "#185FA5" : "#3B6D11", marginLeft: 4 }),
  // Chat area
  chatArea: { flex: 1, display: "flex", flexDirection: "column", background: "#f8f9fa" },
  chatHeader: { background: "#fff", borderBottom: "1px solid #e8eaed", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 },
  chatHeaderLeft: { display: "flex", alignItems: "center", gap: 12 },
  chatName: { fontSize: 15, fontWeight: 700 },
  chatMeta: { fontSize: 12, color: "#888", marginTop: 1 },
  chatActions: { display: "flex", gap: 8 },
  actionBtn: (primary) => ({ padding: "7px 14px", background: primary ? "#0C447C" : "#fff", color: primary ? "#fff" : "#1a1a1a", border: primary ? "none" : "1px solid #e8eaed", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }),
  messageArea: { flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 4 },
  dateDivider: { textAlign: "center", fontSize: 11, color: "#aaa", margin: "10px 0 6px", fontWeight: 500 },
  bubbleRow: (fromProperty) => ({ display: "flex", justifyContent: fromProperty ? "flex-start" : "flex-end", marginBottom: 2, alignItems: "flex-end", gap: 8 }),
  bubbleAvatar: (color, bg) => ({ width: 28, height: 28, borderRadius: "50%", background: bg, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }),
  bubble: (fromProperty) => ({ maxWidth: "65%", padding: "10px 14px", borderRadius: fromProperty ? "4px 16px 16px 16px" : "16px 4px 16px 16px", background: fromProperty ? "#fff" : "#0C447C", color: fromProperty ? "#1a1a1a" : "#fff", fontSize: 13, lineHeight: 1.5, border: fromProperty ? "1px solid #e8eaed" : "none", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }),
  bubbleTime: (fromProperty) => ({ fontSize: 10, color: "#bbb", marginTop: 3, textAlign: fromProperty ? "left" : "right", paddingLeft: fromProperty ? 36 : 0 }),
  quickReplies: { padding: "8px 16px 4px", display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", flexShrink: 0, background: "#fff", borderTop: "1px solid #f0f0f0" },
  quickReply: { padding: "5px 12px", background: "#f4f5f7", border: "1px solid #e8eaed", borderRadius: 16, fontSize: 11, color: "#185FA5", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "'Inter',sans-serif", fontWeight: 500 },
  inputBar: { background: "#fff", borderTop: "1px solid #e8eaed", padding: "12px 16px", display: "flex", alignItems: "flex-end", gap: 10, flexShrink: 0 },
  textInput: { flex: 1, padding: "10px 14px", fontSize: 13, border: "1px solid #e8eaed", borderRadius: 20, background: "#f8f9fa", outline: "none", resize: "none", fontFamily: "'Inter',sans-serif", lineHeight: 1.4, maxHeight: 100 },
  sendBtn: (has) => ({ width: 38, height: 38, borderRadius: "50%", background: has ? "#0C447C" : "#e8eaed", border: "none", cursor: has ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#fff", transition: "background 0.15s", flexShrink: 0 }),
  emptyState: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "#aaa" },
};

let nextMsgId = 100;

export default function LandlordMessages() {
  const navigate = useNavigate();
  const [threads, setThreads]     = useState(THREADS);
  const [activeId, setActiveId]   = useState(1);
  const [input, setInput]         = useState("");
  const [search, setSearch]       = useState("");
  const [filter, setFilter]       = useState("all");
  const [propFilter, setPropFilter] = useState("all");
  const [flagged, setFlagged]       = useState([]);

  const activeThread = threads.find(t => t.id === activeId);
  const totalUnread  = threads.reduce((s, t) => s + t.unread, 0);

  const PROPERTIES_LIST = ["all", ...new Set(THREADS.map(t => t.property))];

  const filteredThreads = threads.filter(t => {
    const matchSearch = t.tenant.toLowerCase().includes(search.toLowerCase()) || t.property.toLowerCase().includes(search.toLowerCase()) || t.unit.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || (filter === "unread" && t.unread > 0) || (filter === "flagged" && flagged.includes(t.id));
    const matchProp   = propFilter === "all" || t.property === propFilter;
    return matchSearch && matchFilter && matchProp;
  });

  function toggleFlag(id) {
    setFlagged(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  }

  function openThread(id) {
    setActiveId(id);
    setThreads(prev => prev.map(t => t.id === id ? { ...t, unread: 0, messages: t.messages.map(m => ({ ...m, read: true })) } : t));
  }

  function sendMessage(text) {
    if (!text.trim()) return;
    const msg = { id: nextMsgId++, from: "property", text: text.trim(), time: "Just now", read: true };
    setThreads(prev => prev.map(t => t.id === activeId ? { ...t, messages: [...t.messages, msg], lastMessage: text.trim(), lastTime: "Just now" } : t));
    setInput("");
  }

  // Group messages by date for display
  function groupMessages(messages) {
    const groups = [];
    let lastDate = null;
    messages.forEach(msg => {
      const date = msg.time.includes("Today") ? "Today" : msg.time.includes("Yesterday") ? "Yesterday" : msg.time.split(",")[0];
      if (date !== lastDate) { groups.push({ type: "date", label: date }); lastDate = date; }
      groups.push({ type: "message", ...msg });
    });
    return groups;
  }

  return (
    <div style={s.app}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; } ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 2px; }`}</style>

      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.sidebarLogo}>
          <div style={s.logoText}>🏢 Polaris PM</div>
          <div style={s.logoSub}>Property Management</div>
        </div>
        {NAV_ITEMS.map(item => (
          <div key={item.route} style={s.navItem(item.label === "Messages")} onClick={() => navigate(item.route)}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            {item.label}
            {item.label === "Messages" && totalUnread > 0 && (
              <span style={{ marginLeft: "auto", background: "#E24B4A", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>{totalUnread}</span>
            )}
          </div>
        ))}
        <div style={s.sidebarFooter}>
          <div style={s.sidebarUser}>
            <div style={s.sidebarAvatar}>AW</div>
            <div><div style={s.sidebarName}>Andrew Wagner</div><div style={s.sidebarRole}>Portfolio Owner</div></div>
          </div>
        </div>
      </div>

      <div style={s.content}>
        {/* Thread list */}
        <div style={s.threadList}>
          <div style={s.threadListHeader}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={s.threadListTitle}>Messages {totalUnread > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: "#E24B4A" }}>({totalUnread})</span>}</div>
              <button style={{ ...s.actionBtn(true), padding: "6px 12px", fontSize: 11 }}>✏️ New</button>
            </div>
            <div style={s.searchBar}>
              <span>🔍</span>
              <input style={s.searchInput} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations…" />
            </div>
          </div>

          <div style={s.filterRow}>
            <select style={s.filterSelect} value={propFilter} onChange={e => setPropFilter(e.target.value)}>
              {PROPERTIES_LIST.map(p => <option key={p} value={p}>{p === "all" ? "All properties" : p}</option>)}
            </select>
            <div style={s.filterPillRow}>
              <button style={s.filterPill(filter === "all")} onClick={() => setFilter("all")}>All ({threads.length})</button>
              <button style={s.filterPill(filter === "unread")} onClick={() => setFilter("unread")}>Unread ({threads.reduce((s,t) => s + (t.unread > 0 ? 1 : 0), 0)})</button>
              <button style={s.filterPill(filter === "flagged")} onClick={() => setFilter("flagged")}>🚩 Flagged ({flagged.length})</button>
            </div>
          </div>

          <div style={s.threadScroll}>
            {filteredThreads.map(thread => (
              <div key={thread.id} style={s.threadItem(activeId === thread.id, thread.unread > 0)} onClick={() => openThread(thread.id)}>
                <div style={s.threadItemTop}>
                  <div style={s.threadLeft}>
                    <div style={{ position: "relative" }}>
                      <div style={s.avatar(thread.color, thread.bg)}>{thread.avatar}</div>
                      {thread.unread > 0 && <div style={s.unreadBadge}>{thread.unread}</div>}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span style={s.threadName(thread.unread > 0)}>{thread.tenant}</span>
                        <span style={s.propBadge(thread.property)}>{thread.property === "Clifton Manor" ? "Clifton" : "St Pete"}</span>
                      </div>
                      <div style={s.threadMeta}>Unit {thread.unit}</div>
                    </div>
                  </div>
                  <div style={s.threadTime}>{thread.lastTime}</div>
                </div>
                <div style={s.threadPreview(thread.unread > 0)}>{thread.lastMessage}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat area */}
        {activeThread ? (
          <div style={s.chatArea}>
            {/* Chat header */}
            <div style={s.chatHeader}>
              <div style={s.chatHeaderLeft}>
                <div style={s.avatar(activeThread.color, activeThread.bg)}>{activeThread.avatar}</div>
                <div>
                  <div style={s.chatName}>{activeThread.tenant} <span style={{ fontSize: 12, fontWeight: 400, color: "#888" }}>· Unit {activeThread.unit}</span></div>
                  <div style={s.chatMeta}>{activeThread.property}</div>
                </div>
              </div>
              <div style={s.chatActions}>
                <button style={s.actionBtn(false)} onClick={() => navigate(`/landlord/tenants/5`)}>View profile</button>
                <button style={s.actionBtn(false)}>📋 Lease</button>
                <button style={s.actionBtn(true)}>💰 Request payment</button>
              </div>
            </div>

            {/* Messages */}
            <div style={s.messageArea}>
              {groupMessages(activeThread.messages).map((item, i) => {
                if (item.type === "date") return <div key={`d-${i}`} style={s.dateDivider}>{item.label}</div>;
                const fromProperty = item.from === "property";
                return (
                  <div key={item.id}>
                    <div style={s.bubbleRow(fromProperty)}>
                      {fromProperty && <div style={s.bubbleAvatar("#fff", "#185FA5")}>AW</div>}
                      <div style={s.bubble(fromProperty)}>{item.text}</div>
                    </div>
                    <div style={s.bubbleTime(fromProperty)}>{item.time}</div>
                  </div>
                );
              })}
            </div>

            {/* Quick replies */}
            <div style={s.quickReplies}>
              {QUICK_REPLIES.map((q, i) => (
                <button key={i} style={s.quickReply} onClick={() => sendMessage(q)}>{q}</button>
              ))}
            </div>

            {/* Input */}
            <div style={s.inputBar}>
              <button style={{ ...s.actionBtn(false), borderRadius: "50%", width: 38, height: 38, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>📎</button>
              <textarea
                style={s.textInput}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                placeholder={`Message ${activeThread.tenant}…`}
                rows={1}
              />
              <button style={s.sendBtn(!!input.trim())} onClick={() => sendMessage(input)} disabled={!input.trim()}>➤</button>
            </div>
          </div>
        ) : (
          <div style={s.emptyState}>
            <div style={{ fontSize: 48 }}>💬</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#555" }}>Select a conversation</div>
            <div style={{ fontSize: 13 }}>Choose a thread from the left to start messaging</div>
          </div>
        )}
      </div>
    </div>
  );
}
