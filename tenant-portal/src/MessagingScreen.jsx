import { useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from "react";

const INITIAL_MESSAGES = [
  {
    id: 1,
    from: "property",
    text: "Hi Maria! Welcome to Polaris Tenant. This is your direct line to us — feel free to message anytime with questions or concerns.",
    time: "Apr 1, 2026",
    read: true,
  },
  {
    id: 2,
    from: "tenant",
    text: "Thanks! Quick question — is there guest parking available on weekends?",
    time: "Apr 3, 2026",
    read: true,
  },
  {
    id: 3,
    from: "property",
    text: "Yes! There are 4 guest spots in the lot marked with yellow lines. No permit needed, just 48-hour limit.",
    time: "Apr 3, 2026",
    read: true,
  },
  {
    id: 4,
    from: "property",
    text: "Your May rent payment of $1,150 was received. Thank you! Confirmation: PAY-XK9QA2.",
    time: "May 1, 2026",
    read: true,
  },
  {
    id: 5,
    from: "property",
    text: "Hi Maria — confirming the plumber visit on Jun 2 between 10am–12pm. Please make sure someone is home.",
    time: "Today",
    read: false,
  },
];

const s = {
  app: {
    maxWidth: 460,
    margin: "0 auto",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontSize: 14,
    color: "#1a1a1a",
    background: "#f4f5f7",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    paddingBottom: 58,
  },
  header: {
    background: "#0C447C",
    padding: "16px 20px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexShrink: 0,
  },
  backBtn: {
    background: "rgba(255,255,255,0.15)",
    border: "none",
    borderRadius: 8,
    width: 32,
    height: 32,
    cursor: "pointer",
    color: "#E6F1FB",
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: "#185FA5",
    border: "2px solid rgba(255,255,255,0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    flexShrink: 0,
  },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 14, fontWeight: 600, color: "#fff" },
  headerSub: { fontSize: 11, color: "#85B7EB", marginTop: 1 },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#4CAF50",
    flexShrink: 0,
  },
  // ── Message list ──
  messageList: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 16px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  dateDivider: {
    textAlign: "center",
    fontSize: 11,
    color: "#aaa",
    margin: "10px 0 6px",
    fontWeight: 500,
  },
  // ── Bubbles ──
  bubbleRow: (fromProperty) => ({
    display: "flex",
    justifyContent: fromProperty ? "flex-start" : "flex-end",
    marginBottom: 2,
    alignItems: "flex-end",
    gap: 6,
  }),
  bubbleAvatar: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "#E6F1FB",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 600,
    color: "#185FA5",
    flexShrink: 0,
    marginBottom: 2,
  },
  bubble: (fromProperty) => ({
    maxWidth: "75%",
    padding: "10px 13px",
    borderRadius: fromProperty ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
    background: fromProperty ? "#fff" : "#0C447C",
    color: fromProperty ? "#1a1a1a" : "#fff",
    fontSize: 13,
    lineHeight: 1.5,
    border: fromProperty ? "1px solid #e8eaed" : "none",
    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
  }),
  bubbleTime: (fromProperty) => ({
    fontSize: 10,
    color: "#bbb",
    marginTop: 3,
    textAlign: fromProperty ? "left" : "right",
    paddingLeft: fromProperty ? 34 : 0,
    paddingRight: fromProperty ? 0 : 4,
  }),
  // ── Typing indicator ──
  typingBubble: {
    background: "#fff",
    border: "1px solid #e8eaed",
    borderRadius: "4px 16px 16px 16px",
    padding: "10px 14px",
    display: "flex",
    gap: 4,
    alignItems: "center",
    width: "fit-content",
  },
  typingDot: (delay) => ({
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#aaa",
    animation: `typingBounce 1.2s ease-in-out ${delay}s infinite`,
  }),
  // ── Quick replies ──
  quickReplies: {
    padding: "8px 16px 4px",
    display: "flex",
    gap: 8,
    overflowX: "auto",
    flexShrink: 0,
    scrollbarWidth: "none",
  },
  quickReply: {
    padding: "6px 12px",
    background: "#fff",
    border: "1px solid #d1d5db",
    borderRadius: 16,
    fontSize: 12,
    color: "#185FA5",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontWeight: 500,
    flexShrink: 0,
  },
  // ── Input bar ──
  inputBar: {
    background: "#fff",
    borderTop: "1px solid #e8eaed",
    padding: "10px 12px",
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    flexShrink: 0,
  },
  attachBtn: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: "#f4f5f7",
    border: "1px solid #e8eaed",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    flexShrink: 0,
  },
  textInput: {
    flex: 1,
    padding: "9px 13px",
    fontSize: 14,
    border: "1px solid #e8eaed",
    borderRadius: 20,
    background: "#f8f9fa",
    color: "#1a1a1a",
    outline: "none",
    resize: "none",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    lineHeight: 1.4,
    maxHeight: 100,
    overflowY: "auto",
  },
  sendBtn: (hasText) => ({
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: hasText ? "#0C447C" : "#e8eaed",
    border: "none",
    cursor: hasText ? "pointer" : "default",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    flexShrink: 0,
    transition: "background 0.15s",
  }),
};

const QUICK_REPLIES = [
  "Is parking available?",
  "When is maintenance coming?",
  "Can I renew my lease?",
  "I need a rent receipt",
];

let nextId = INITIAL_MESSAGES.length + 1;

export default function MessagingScreen() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput]       = useState("");
  const [typing, setTyping]     = useState(false);
  const bottomRef               = useRef(null);
  const inputRef                = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  function sendMessage(text) {
    if (!text.trim()) return;
    const msg = { id: nextId++, from: "tenant", text: text.trim(), time: "Now", read: true };
    setMessages(prev => [...prev, msg]);
    setInput("");

    // Simulate property manager reply
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      const reply = getAutoReply(text);
      setMessages(prev => [...prev, { id: nextId++, from: "property", text: reply, time: "Now", read: true }]);
    }, 2000);
  }

  function getAutoReply(text) {
    const t = text.toLowerCase();
    if (t.includes("parking")) return "There are 4 guest spots marked with yellow lines in the main lot. No permit needed, 48-hour limit.";
    if (t.includes("maintenance") || t.includes("repair")) return "I'll check the schedule and get back to you shortly. What's the issue?";
    if (t.includes("renew") || t.includes("lease")) return "Great question! Your lease ends Dec 31, 2026. We'll send renewal options 90 days before — I'll reach out in early October.";
    if (t.includes("receipt") || t.includes("payment")) return "I'll email your payment receipt to the address on file within a few minutes!";
    return "Thanks for reaching out! I'll get back to you shortly. Our typical response time is within a few hours during business hours.";
  }

  // Group messages by date
  const grouped = [];
  let lastDate = null;
  messages.forEach(msg => {
    if (msg.time !== lastDate) {
      grouped.push({ type: "date", label: msg.time });
      lastDate = msg.time;
    }
    grouped.push({ type: "message", ...msg });
  });

  return (
    <div style={s.app}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #f4f5f7; }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
        ::-webkit-scrollbar { width: 0; }
      `}</style>

      {/* ── Header ── */}
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/home')}>←</button>
        <div style={s.headerAvatar}>PP</div>
        <div style={s.headerInfo}>
          <div style={s.headerName}>Polaris Properties</div>
          <div style={s.headerSub}>Property management · Usually replies in a few hours</div>
        </div>
        <div style={s.onlineDot} />
      </div>

      {/* ── Message list ── */}
      <div style={s.messageList}>
        {grouped.map((item, i) => {
          if (item.type === "date") {
            return <div key={`date-${i}`} style={s.dateDivider}>{item.label}</div>;
          }
          const fromProperty = item.from === "property";
          return (
            <div key={item.id}>
              <div style={s.bubbleRow(fromProperty)}>
                {fromProperty && <div style={s.bubbleAvatar}>PP</div>}
                <div style={s.bubble(fromProperty)}>{item.text}</div>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {typing && (
          <div style={s.bubbleRow(true)}>
            <div style={s.bubbleAvatar}>PP</div>
            <div style={s.typingBubble}>
              <div style={s.typingDot(0)} />
              <div style={s.typingDot(0.2)} />
              <div style={s.typingDot(0.4)} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Quick replies ── */}
      <div style={s.quickReplies}>
        {QUICK_REPLIES.map((q, i) => (
          <button key={i} style={s.quickReply} onClick={() => sendMessage(q)}>
            {q}
          </button>
        ))}
      </div>

      {/* ── Input bar ── */}
      <div style={s.inputBar}>
        <button style={s.attachBtn}>📎</button>
        <textarea
          ref={inputRef}
          style={s.textInput}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
          placeholder="Message Polaris Properties…"
          rows={1}
        />
        <button
          style={s.sendBtn(input.trim().length > 0)}
          onClick={() => sendMessage(input)}
          disabled={!input.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
