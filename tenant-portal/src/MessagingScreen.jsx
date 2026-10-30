import { useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";

const C = {
  bg:       "#F5F3EE",
  surface:  "#FFFFFF",
  raised:   "#F8F7F4",
  border:   "#E4E1DA",
  text:     "#18181B",
  textSub:  "#52525B",
  textMuted:"#A1A1AA",
  gold:     "#8B6914",
  goldBg:   "#FBF6EC",
  goldDim:  "#C9A96E",
  blue:     "#1D4ED8",
  green:    "#15803D",
  red:      "#DC2626",
  amber:    "#92400E",
};

const QUICK_REPLIES = [
  "Is parking available?",
  "When is maintenance coming?",
  "Can I renew my lease?",
  "I need a rent receipt",
];

export default function MessagingScreen() {
  const navigate = useNavigate();
  const { tenant } = useTenant();

  // ── State (triggers re-renders) ────────────────────────────
  const [messages, setMessages]     = useState([]);
  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(true);
  const [sending, setSending]       = useState(false);
  const [myUserId, setMyUserId]     = useState(null);   // STATE — drives fromProperty render
  const [tenantId, setTenantId]     = useState(null);
  const [awaitingReply, setAwaitingReply] = useState(false); // typing indicator

  // ── Refs (for async callbacks/closures, no re-render needed) ──
  const myUserIdRef   = useRef(null);   // mirrors myUserId for use inside closures
  const tenantIdRef   = useRef(null);   // mirrors tenantId for use inside closures
  const landlordIdRef = useRef(null);
  const pollRef       = useRef(null);
  const bottomRef     = useRef(null);

  useEffect(() => {
    init();
    return () => clearInterval(pollRef.current);
  }, []);

  // Only scroll to bottom when a NEW message is added (count goes up),
  // not on every poll refresh. Uses a ref to track previous length.
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    const newCount = messages.length;
    if (newCount > prevMsgCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCountRef.current = newCount;
  }, [messages]);

  async function fetchMessages() {
    const tId = tenantIdRef.current;
    if (!tId) return;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("tenant_id", tId)
      .order("created_at", { ascending: true });
    if (data) setMessages(data);
  }

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/login"); return; }

    // Set BOTH state (for render) and ref (for closures)
    setMyUserId(user.id);
    myUserIdRef.current = user.id;

    const { data: tenantData } = await supabase
      .from("tenants").select("id").eq("user_id", user.id).single();
    if (!tenantData) { setLoading(false); return; }

    setTenantId(tenantData.id);
    tenantIdRef.current = tenantData.id;

    const { data: firstMsg } = await supabase
      .from("messages").select("sender_id, recipient_id")
      .eq("tenant_id", tenantData.id).limit(1).single();
    landlordIdRef.current = firstMsg
      ? (firstMsg.sender_id !== user.id ? firstMsg.sender_id : firstMsg.recipient_id)
      : "858462c7-d86a-498f-8cc1-3fc1eecb1888";

    await fetchMessages();

    await supabase.from("messages").update({ read: true })
      .eq("tenant_id", tenantData.id)
      .eq("recipient_id", user.id)
      .eq("read", false);

    // Poll every 2 seconds to pick up AI replies
    pollRef.current = setInterval(fetchMessages, 2000);

    setLoading(false);
  }

  async function sendMessage(text) {
    if (!text.trim() || sending || !myUserIdRef.current || !tenantIdRef.current) return;
    setSending(true);
    setInput("");

    const { data, error } = await supabase.from("messages").insert({
      sender_id: myUserIdRef.current,
      recipient_id: landlordIdRef.current,
      tenant_id: tenantIdRef.current,
      body: text.trim(),
    }).select().single();

    if (!error && data) {
      // Append confirmed record immediately so it shows without waiting for next poll
      setMessages(prev => {
        if (prev.some(m => m.id === data.id)) return prev;
        return [...prev, data];
      });

      // Fire AI routing — non-blocking, show typing indicator while waiting
      setAwaitingReply(true);
      fetch("/api/classify-and-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          tenant_id: tenantIdRef.current,
          message_id: data.id,
        }),
      })
        .then(() => setAwaitingReply(false))
        .catch(() => setAwaitingReply(false));
    }

    setSending(false);
  }

  // Group messages by date for display
  const grouped = [];
  let lastDate = null;
  messages.forEach(msg => {
    const date = new Date(msg.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (date !== lastDate) { grouped.push({ type: "date", label: date }); lastDate = date; }
    grouped.push({ type: "message", ...msg });
  });

  return (
    <TenantLayout tenantName={tenant?.name}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        .t-quick:hover{border-color:${C.goldDim}!important;color:${C.gold}!important;}
        @media(max-width:480px){.msg-bubble{max-width:88%!important;} .msg-input-row{padding:10px 12px!important;}}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
        ::-webkit-scrollbar:horizontal{height:0;}
      `}</style>

      <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif" }}>

        {/* Chat header */}
        <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"14px 20px", display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
          {/* Stack of agent avatars */}
          <div style={{ position:"relative", width:36, height:36, flexShrink:0 }}>
            <img src="https://images.unsplash.com/photo-1580489944761-15a19d654956?w=80&h=80&fit=crop&crop=face" alt="" style={{ width:28, height:28, borderRadius:"50%", border:`2px solid ${C.surface}`, position:"absolute", top:0, left:0, objectFit:"cover" }} />
            <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face" alt="" style={{ width:28, height:28, borderRadius:"50%", border:`2px solid ${C.surface}`, position:"absolute", top:8, left:8, objectFit:"cover" }} />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:600, color:C.text }}>Modus Property Management</div>
            <div style={{ fontSize:11, color:C.textMuted, marginTop:1 }}>
              {awaitingReply
                ? <span style={{ color:C.green }}>● Replying…</span>
                : "Usually replies within a few hours"
              }
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 8px", display:"flex", flexDirection:"column", gap:4 }}>
          {loading && (
            <div style={{ textAlign:"center", color:C.textSub, fontSize:13, marginTop:40 }}>Loading messages…</div>
          )}
          {!loading && !tenantId && (
            <div style={{ textAlign:"center", color:C.textSub, fontSize:13, marginTop:40 }}>
              Your account isn't linked to a unit yet. Contact your property manager.
            </div>
          )}
          {!loading && tenantId && messages.length === 0 && (
            <div style={{ textAlign:"center", color:C.textMuted, fontSize:13, marginTop:40 }}>
              No messages yet — send a message to get started.
            </div>
          )}

          {grouped.map((item, i) => {
            if (item.type === "date") return (
              <div key={`d-${i}`} style={{ textAlign:"center", fontSize:11, color:C.textMuted, margin:"10px 0 6px", fontWeight:500 }}>
                {item.label}
              </div>
            );

            // fromProperty = true  → left side, agent avatar (AI / management)
            // fromProperty = false → right side, gold bubble (this tenant)
            const fromProperty = item.sender_id === null || (myUserId !== null && item.sender_id !== myUserId);

            return (
              <div key={item.id}>
                {/* Agent name label above management messages */}
                {fromProperty && item.agent_name && (
                  <div style={{ fontSize:10, color:C.textSub, marginBottom:3, paddingLeft:34, fontWeight:500 }}>
                    {item.agent_name} · Modus Property Management
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:fromProperty?"flex-start":"flex-end", marginBottom:2, alignItems:"flex-end", gap:8 }}>
                  {fromProperty && (
                    item.agent_photo
                      ? <img src={item.agent_photo} alt={item.agent_name || "Agent"} style={{ width:26, height:26, borderRadius:"50%", objectFit:"cover", flexShrink:0, border:`1px solid ${C.border}` }} />
                      : <div style={{ width:26, height:26, borderRadius:"50%", background:`${C.gold}22`, border:`1px solid ${C.goldDim}`, color:C.gold, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, flexShrink:0 }}>M</div>
                  )}
                  <div style={{ maxWidth:"75%", padding:"10px 14px", borderRadius:fromProperty?"4px 14px 14px 14px":"14px 4px 14px 14px", background:fromProperty?C.surface:C.goldDim, border:fromProperty?`1px solid ${C.border}`:"none", fontSize:13, color:C.text, lineHeight:1.5 }}>
                    {item.body}
                  </div>
                </div>
                <div style={{ fontSize:10, color:C.textMuted, textAlign:fromProperty?"left":"right", marginBottom:4, paddingLeft:fromProperty?34:0 }}>
                  {new Date(item.created_at).toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" })}
                </div>
              </div>
            );
          })}

          {/* Typing indicator — shown while AI is generating reply */}
          {awaitingReply && (
            <div>
              <div style={{ fontSize:10, color:C.textSub, marginBottom:3, paddingLeft:34, fontWeight:500 }}>
                Modus Property Management
              </div>
              <div style={{ display:"flex", alignItems:"flex-end", gap:8, marginBottom:4 }}>
                <div style={{ width:26, height:26, borderRadius:"50%", background:`${C.gold}22`, border:`1px solid ${C.goldDim}`, color:C.gold, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, flexShrink:0 }}>M</div>
                <div style={{ padding:"10px 16px", borderRadius:"4px 14px 14px 14px", background:C.surface, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:4 }}>
                  <style>{`
                    @keyframes modus-bounce {
                      0%,60%,100%{transform:translateY(0);opacity:.4}
                      30%{transform:translateY(-5px);opacity:1}
                    }
                    .modus-dot{width:6px;height:6px;border-radius:50%;background:${C.textSub};animation:modus-bounce 1.2s infinite;}
                    .modus-dot:nth-child(2){animation-delay:.2s;}
                    .modus-dot:nth-child(3){animation-delay:.4s;}
                  `}</style>
                  <div className="modus-dot" />
                  <div className="modus-dot" />
                  <div className="modus-dot" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Quick replies */}
        <div style={{ padding:"8px 16px 4px", display:"flex", gap:8, overflowX:"auto", flexShrink:0, background:C.surface, borderTop:`1px solid ${C.border}` }}>
          {QUICK_REPLIES.map((q, i) => (
            <button key={i} className="t-quick" onClick={() => sendMessage(q)}
              style={{ padding:"5px 12px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:14, fontSize:11, color:C.textSub, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"'DM Sans',sans-serif", fontWeight:500, transition:"all 0.12s", flexShrink:0 }}>
              {q}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{ background:C.surface, borderTop:`1px solid ${C.border}`, padding:"12px 16px", display:"flex", alignItems:"flex-end", gap:10, flexShrink:0 }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Message Modus Property Management…"
            rows={1}
            style={{ flex:1, padding:"10px 14px", fontSize:13, border:`1px solid ${C.border}`, borderRadius:18, background:C.raised, color:C.text, outline:"none", resize:"none", fontFamily:"'DM Sans',sans-serif", lineHeight:1.4, maxHeight:100 }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || sending}
            style={{ width:38, height:38, borderRadius:"50%", background:input.trim()?C.goldDim:C.raised, border:`1px solid ${input.trim()?C.goldDim:C.border}`, cursor:input.trim()?"pointer":"default", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color:input.trim()?C.gold:C.textMuted, flexShrink:0, transition:"all 0.15s" }}>
            ➤
          </button>
        </div>
      </div>
    </TenantLayout>
  );
}