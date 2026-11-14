import { useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from "react";
import { supabase, authHeaders } from "./supabase";
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

// Replies from the assistant (sender_id null or an agent_name) are always shown as the AI,
// whatever name an older message stored. A person never answers under an AI label.
const AI_LABEL = "Modus AI Assistant";
const AI_DISCLOSURE = "You're chatting with the Modus AI Assistant — an automated assistant, not a person. Tap \"Talk to a person\" anytime and management will follow up.";
const TALK_TO_PERSON_MESSAGE = "I'd like to talk to a person from management, please.";
const isAiMessage = (m) => m.sender_id === null || !!m.agent_name;

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
  const [assistantIssue, setAssistantIssue] = useState(false); // last AI request failed (message still saved)

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

      // Fire AI routing once — non-blocking, typing indicator while waiting. NO automatic retry: a request
      // that failed in the browser may still be running on the server, and a second one would race it
      // (duplicate AI reply / ticket). If it fails, say so: the message is saved, and a message the AI never
      // processed is listed in management's daily recap.
      setAwaitingReply(true);
      setAssistantIssue(false);
      fetch("/api/classify-and-route", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ message: text.trim(), tenant_id: tenantIdRef.current, message_id: data.id }),
      })
        .then(res => { if (!res.ok) setAssistantIssue(true); })
        .catch(() => setAssistantIssue(true))
        .finally(() => setAwaitingReply(false));
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

      <div className="full-height" style={{ display:"flex", flexDirection:"column", background:C.bg, fontFamily:"'DM Sans',sans-serif" }}>

        {/* Chat header */}
        <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"14px 20px", display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
          <div aria-hidden="true" style={{ width:34, height:34, borderRadius:"50%", background:`${C.gold}22`, border:`1px solid ${C.goldDim}`, color:C.gold, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 }}>AI</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:600, color:C.text }}>Modus Property Management</div>
            <div style={{ fontSize:11, color:C.textMuted, marginTop:1 }}>
              {awaitingReply
                ? <span style={{ color:C.green }}>● {AI_LABEL} is replying…</span>
                : `${AI_LABEL} · automated replies`
              }
            </div>
          </div>
          <button onClick={() => sendMessage(TALK_TO_PERSON_MESSAGE)} disabled={sending}
            style={{ padding:"7px 12px", background:C.gold, border:"none", borderRadius:16, fontSize:12, fontWeight:600, color:C.text, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}>
            Talk to a person
          </button>
        </div>

        {/* AI disclosure — always visible */}
        <div role="note" style={{ background:C.raised, borderBottom:`1px solid ${C.border}`, padding:"8px 20px", fontSize:11, color:C.textSub, lineHeight:1.5, flexShrink:0 }}>
          {AI_DISCLOSURE}
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
                {/* Sender label above management-side messages: the AI is always labelled as the AI */}
                {fromProperty && (
                  <div style={{ fontSize:10, color:C.textSub, marginBottom:3, paddingLeft:34, fontWeight:500 }}>
                    {isAiMessage(item) ? `${AI_LABEL} · AI` : "Modus Property Management"}
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:fromProperty?"flex-start":"flex-end", marginBottom:2, alignItems:"flex-end", gap:8 }}>
                  {fromProperty && (
                    <div style={{ width:26, height:26, borderRadius:"50%", background:`${C.gold}22`, border:`1px solid ${C.goldDim}`, color:C.gold, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, flexShrink:0 }}>{isAiMessage(item) ? "AI" : "M"}</div>
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

          {assistantIssue && !awaitingReply && (
            <div role="status" data-assistant-issue style={{ margin:"6px 0 4px 34px", padding:"8px 12px", fontSize:12, lineHeight:1.5, color:C.text, background:`${C.gold}12`, border:`1px solid ${C.goldDim}`, borderRadius:8 }}>
              Your message was saved, but the assistant didn't respond. It will be in management's daily review. If anyone is in danger, call 911.
            </div>
          )}

          {/* Typing indicator — shown while AI is generating reply */}
          {awaitingReply && (
            <div>
              <div style={{ fontSize:10, color:C.textSub, marginBottom:3, paddingLeft:34, fontWeight:500 }}>
                {AI_LABEL} · AI
              </div>
              <div style={{ display:"flex", alignItems:"flex-end", gap:8, marginBottom:4 }}>
                <div style={{ width:26, height:26, borderRadius:"50%", background:`${C.gold}22`, border:`1px solid ${C.goldDim}`, color:C.gold, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, flexShrink:0 }}>AI</div>
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
          <button className="t-quick" onClick={() => sendMessage(TALK_TO_PERSON_MESSAGE)}
            style={{ padding:"5px 12px", background:"transparent", border:`1px solid ${C.goldDim}`, borderRadius:14, fontSize:11, color:C.gold, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"'DM Sans',sans-serif", fontWeight:600, flexShrink:0 }}>
            Talk to a person
          </button>
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
            aria-label="Message to Modus Property Management"
            enterKeyHint="send"
            // On phones the keyboard can cover the composer: keep it in view once the keyboard has opened.
            onFocus={e => { const el = e.currentTarget; setTimeout(() => el.scrollIntoView?.({ block: "end", behavior: "smooth" }), 300); }}
            rows={1}
            style={{ flex:1, padding:"10px 14px", fontSize:13, border:`1px solid ${C.border}`, borderRadius:18, background:C.raised, color:C.text, outline:"none", resize:"none", fontFamily:"'DM Sans',sans-serif", lineHeight:1.4, maxHeight:100 }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || sending}
            aria-label="Send message"
            style={{ width:44, height:44, borderRadius:"50%", background:input.trim()?C.goldDim:C.raised, border:`1px solid ${input.trim()?C.goldDim:C.border}`, cursor:input.trim()?"pointer":"default", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color:input.trim()?C.gold:C.textMuted, flexShrink:0, transition:"all 0.15s" }}>
            ➤
          </button>
        </div>
      </div>
    </TenantLayout>
  );
}