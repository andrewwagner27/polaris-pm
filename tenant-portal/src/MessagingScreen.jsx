import { useSessionDraft } from "./lib/useSessionDraft";
import { useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from "react";
import { supabase, authHeaders } from "./supabase";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";
import { useMessageScroll } from "./lib/messageScroll";

const C = {
  bg:       "#F5F3EE",
  surface:  "#FFFFFF",
  raised:   "#F8F7F4",
  border:   "#EAE6DE",
  text:     "#18181B",
  textSub:  "#52525B",
  textMuted:"#6B6B73",
  gold:     "#7A5C12",
  goldBg:   "#FBF6EC",
  goldDim:  "#C9A96E",
  blue:     "#1D4ED8",
  green:    "#15803D",
  red:      "#B91C1C",
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
  const [loading, setLoading]       = useState(true);
  const [sending, setSending]       = useState(false);
  const [myUserId, setMyUserId]     = useState(null);   // STATE — drives fromProperty render
  const [tenantId, setTenantId]     = useState(null);
  const [input, setInput] = useSessionDraft(myUserId && tenantId ? myUserId + ":" + tenantId + ":message" : null, "");
  const [messageError, setMessageError] = useState("");
  const [markingRead, setMarkingRead] = useState(false);
  const unread = messages.filter(message => !message.read && message.recipient_id === myUserId);
  const [awaitingReply, setAwaitingReply] = useState(false); // typing indicator
  const [assistantIssue, setAssistantIssue] = useState(false); // last AI request failed (message still saved)

  // ── Refs (for async callbacks/closures, no re-render needed) ──
  const myUserIdRef   = useRef(null);   // mirrors myUserId for use inside closures
  const tenantIdRef   = useRef(null);   // mirrors tenantId for use inside closures
  const landlordIdRef = useRef(null);
  const pollRef       = useRef(null);

  useEffect(() => {
    let active = true;
    init(() => active).catch(() => {
      if (active) { setMessageError("We couldn’t load your messages. Please refresh and try again."); setLoading(false); }
    });
    return () => { active = false; clearInterval(pollRef.current); };
  }, []);

  // Only the history container scrolls (never the page). The count also steps when the typing indicator appears,
  // so a reader at the bottom keeps following the assistant's reply; a reader looking at older messages keeps their place.
  const { containerRef: historyRef, onScroll: onHistoryScroll, hasNew: hasNewMessage, markOwnSend, jumpToLatest } = useMessageScroll(tenantId || "none", messages.length * 2 + (awaitingReply ? 1 : 0));

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

  async function init(isActive) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!isActive()) return;
    if (!user) { navigate("/login"); return; }

    // Set BOTH state (for render) and ref (for closures)
    setMyUserId(user.id);
    myUserIdRef.current = user.id;

    const { data: tenantData } = await supabase
      .from("tenants").select("id").eq("user_id", user.id).single();
    if (!isActive()) return;
    if (!tenantData) { setLoading(false); return; }

    setTenantId(tenantData.id);
    tenantIdRef.current = tenantData.id;

    const { data: firstMsg } = await supabase
      .from("messages").select("sender_id, recipient_id")
      .eq("tenant_id", tenantData.id).limit(1).single();
    if (!isActive()) return;
    landlordIdRef.current = firstMsg
      ? (firstMsg.sender_id !== user.id ? firstMsg.sender_id : firstMsg.recipient_id)
      : "858462c7-d86a-498f-8cc1-3fc1eecb1888";

    await fetchMessages();
    if (!isActive()) return;

    // Poll every 2 seconds to pick up AI replies
    pollRef.current = setInterval(fetchMessages, 2000);

    setLoading(false);
  }

  async function markRead() {
    if (!unread.length || markingRead) return;
    setMarkingRead(true); setMessageError("");
    try {
      const { error } = await supabase.from("messages").update({ read: true })
        .eq("tenant_id", tenantId).eq("recipient_id", myUserId).in("id", unread.map(message => message.id));
      if (error) throw error;
      await fetchMessages();
    } catch {
      setMessageError("We couldn’t mark these messages as read. Please try again.");
    } finally { setMarkingRead(false); }
  }

  async function sendMessage(text, clearDraft = false) {
    if (!text.trim() || sending || !myUserIdRef.current || !tenantIdRef.current) return;
    setSending(true);
    setMessageError("");
    markOwnSend();

    try {
      const { data, error } = await supabase.from("messages").insert({
        sender_id: myUserIdRef.current,
        recipient_id: landlordIdRef.current,
        tenant_id: tenantIdRef.current,
        body: text.trim(),
      }).select().single();

      if (!error && data) {
        if (clearDraft) setInput(current => current === text ? "" : current);
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

      if (error || !data) setMessageError("Your message wasn’t sent. You can try again.");
    } catch {
      setMessageError("We couldn’t confirm that your message was sent.");
    } finally { setSending(false); }
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
    <TenantLayout tenantName={tenant?.name} unreadMessages={unread.length}>
      <style>{`
        
        .t-quick:hover{border-color:${C.goldDim}!important;color:${C.gold}!important;}
        @media(max-width:480px){.msg-bubble{max-width:88%!important;} .msg-input-row{padding:10px 12px!important;}}
      `}</style>

      <div className="m-chat" style={{ background:C.bg }}>

        {/* Chat header */}
        <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"14px 20px", display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
          <div aria-hidden="true" style={{ width:34, height:34, borderRadius:"50%", background:`${C.gold}22`, border:`1px solid ${C.goldDim}`, color:C.gold, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:600, flexShrink:0 }}>AI</div>
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
            style={{ minHeight:44, padding:"0 14px", background:C.gold, border:"none", borderRadius:22, fontSize:13, fontWeight:600, color:"#FFFFFF", cursor:"pointer", whiteSpace:"nowrap", fontFamily:"var(--m-font)", flexShrink:0 }}>
            Talk to a person
          </button>
        </div>

        {/* AI disclosure — always visible */}
        <div role="note" style={{ background:C.raised, borderBottom:`1px solid ${C.border}`, padding:"8px 16px", fontSize:12, color:C.textSub, lineHeight:1.5, flexShrink:0 }}>
          {AI_DISCLOSURE}
        </div>

        {messageError && <div role="alert" style={{ padding:"8px 16px", color:C.red }}>{messageError}</div>}
        {unread.length > 0 && (
          <button type="button" onClick={markRead} disabled={markingRead} style={{ alignSelf:"flex-end", minHeight:44, padding:"0 16px" }}>
            Mark {unread.length} unread {unread.length === 1 ? "message" : "messages"} as read
          </button>
        )}

        {/* Messages */}
        <div className="m-chat-body">
        <div ref={historyRef} onScroll={onHistoryScroll} className="m-chat-history" role="log" aria-label="Conversation" tabIndex={0} style={{ padding:"16px 16px 8px", gap:4 }}>
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
                  <div style={{ fontSize:11, color:C.textSub, marginBottom:3, paddingLeft:34, fontWeight:500 }}>
                    {isAiMessage(item) ? `${AI_LABEL} · AI` : "Modus Property Management"}
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:fromProperty?"flex-start":"flex-end", marginBottom:2, alignItems:"flex-end", gap:8 }}>
                  {fromProperty && (
                    <div style={{ width:26, height:26, borderRadius:"50%", background:`${C.gold}22`, border:`1px solid ${C.goldDim}`, color:C.gold, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:600, flexShrink:0 }}>{isAiMessage(item) ? "AI" : "M"}</div>
                  )}
                  <div style={{ maxWidth:"75%", padding:"10px 14px", borderRadius:fromProperty?"4px 14px 14px 14px":"14px 4px 14px 14px", background:fromProperty?C.surface:C.goldDim, border:fromProperty?`1px solid ${C.border}`:"none", fontSize:14, color:C.text, lineHeight:1.5, overflowWrap:"anywhere" }}>
                    {item.body}
                  </div>
                </div>
                <div style={{ fontSize:11, color:C.textMuted, textAlign:fromProperty?"left":"right", marginBottom:6, paddingLeft:fromProperty?34:0 }}>
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
              <div style={{ fontSize:11, color:C.textSub, marginBottom:3, paddingLeft:34, fontWeight:500 }}>
                {AI_LABEL} · AI
              </div>
              <div style={{ display:"flex", alignItems:"flex-end", gap:8, marginBottom:4 }}>
                <div style={{ width:26, height:26, borderRadius:"50%", background:`${C.gold}22`, border:`1px solid ${C.goldDim}`, color:C.gold, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:600, flexShrink:0 }}>AI</div>
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

        </div>
          {hasNewMessage && <button type="button" className="m-new-pill" onClick={jumpToLatest}>New message ↓</button>}
        </div>

        {/* Quick replies */}
        <div role="group" aria-label="Suggested messages" style={{ padding:"8px 12px 6px", display:"flex", gap:8, overflowX:"auto", flexShrink:0, background:C.surface, borderTop:`1px solid ${C.border}`, scrollbarWidth:"none" }}>
          <button className="t-quick" onClick={() => sendMessage(TALK_TO_PERSON_MESSAGE)}
            style={{ minHeight:44, padding:"0 14px", background:C.goldBg, border:`1px solid ${C.gold}`, borderRadius:22, fontSize:13, color:C.gold, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"var(--m-font)", fontWeight:600, flexShrink:0 }}>
            Talk to a person
          </button>
          {QUICK_REPLIES.map((q, i) => (
            <button key={i} className="t-quick" onClick={() => sendMessage(q)}
              style={{ minHeight:44, padding:"0 14px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:22, fontSize:13, color:C.text, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"var(--m-font)", fontWeight:500, flexShrink:0 }}>
              {q}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="msg-input-row" style={{ background:C.surface, borderTop:`1px solid ${C.border}`, padding:"10px 12px 12px", display:"flex", alignItems:"flex-end", gap:8, flexShrink:0 }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={!tenantId}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input, true); } }}
            placeholder="Write a message…"
            aria-label="Message to Modus Property Management"
            enterKeyHint="send"
            rows={1}
            style={{ flex:1, minHeight:44, padding:"11px 16px", fontSize:14, border:`1px solid ${C.border}`, borderRadius:22, background:C.raised, color:C.text, outline:"none", resize:"none", fontFamily:"var(--m-font)", lineHeight:1.4, maxHeight:120 }}
          />
          <button
            onClick={() => sendMessage(input, true)}
            disabled={!input.trim() || sending}
            aria-label="Send message"
            style={{ width:44, height:44, borderRadius:"50%", background:input.trim()?C.gold:C.raised, border:`1px solid ${input.trim()?C.gold:C.border}`, cursor:input.trim()?"pointer":"default", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:input.trim()?"#FFFFFF":C.textMuted, flexShrink:0, transition:"all 0.15s" }}>
            ➤
          </button>
        </div>
      </div>
    </TenantLayout>
  );
}
