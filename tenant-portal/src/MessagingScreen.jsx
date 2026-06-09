import { useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";

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

const QUICK_REPLIES = [
  "Is parking available?",
  "When is maintenance coming?",
  "Can I renew my lease?",
  "I need a rent receipt",
];

export default function MessagingScreen() {
  const navigate        = useNavigate();
  const { tenant }      = useTenant();
  const [messages, setMessages]     = useState([]);
  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(true);
  const [tenantId, setTenantId]     = useState(null);
  const [landlordId, setLandlordId] = useState(null);
  const [myUserId, setMyUserId]     = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => { init(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/login"); return; }
    setMyUserId(user.id);

    const { data: tenantData } = await supabase
      .from("tenants").select("id").eq("user_id", user.id).single();
    if (!tenantData) { setLoading(false); return; }
    setTenantId(tenantData.id);

    const { data: firstMsg } = await supabase
      .from("messages").select("sender_id, recipient_id")
      .eq("tenant_id", tenantData.id).limit(1).single();
    const lId = firstMsg
      ? (firstMsg.sender_id !== user.id ? firstMsg.sender_id : firstMsg.recipient_id)
      : null;
    setLandlordId(lId);

    await fetchMessages(tenantData.id);

    await supabase.from("messages").update({ read: true })
      .eq("tenant_id", tenantData.id).eq("recipient_id", user.id).eq("read", false);

    supabase.channel(`tenant-messages-${tenantData.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, payload => {
        if (payload.new.tenant_id === tenantData.id) {
          setMessages(prev => {
            const alreadyExists = prev.some(m => m.id === payload.new.id);
            if (alreadyExists) return prev;
            const hasOptimistic = prev.some(m => m.id?.toString().startsWith("temp-") && m.body === payload.new.body && m.sender_id === payload.new.sender_id);
            if (hasOptimistic) return prev.map(m => m.id?.toString().startsWith("temp-") && m.body === payload.new.body ? payload.new : m);
            return [...prev, payload.new];
          });
        }
      }).subscribe();

    setLoading(false);
  }

  async function fetchMessages(tId) {
    const { data } = await supabase.from("messages").select("*")
      .eq("tenant_id", tId).order("created_at", { ascending: true });
    setMessages(data || []);
  }

  async function sendMessage(text) {
    if (!text.trim() || !myUserId || !tenantId) return;
    let lId = landlordId;
    if (!lId) {
  lId = "858462c7-d86a-498f-8cc1-3fc1eecb1888";
  setLandlordId(lId);
}
    if (!lId) { alert("Unable to find property manager. Please contact support."); return; }

    const optimistic = { id: `temp-${Date.now()}`, sender_id: myUserId, recipient_id: lId, tenant_id: tenantId, body: text.trim(), created_at: new Date().toISOString(), read: false };
    setMessages(prev => [...prev, optimistic]);
    setInput("");

    const { data, error } = await supabase.from("messages").insert({
      sender_id: myUserId, recipient_id: lId, tenant_id: tenantId, body: text.trim(),
    }).select().single();

    if (error) { setMessages(prev => prev.filter(m => m.id !== optimistic.id)); }
    else if (data) { setMessages(prev => prev.map(m => m.id === optimistic.id ? data : m)); }
  }

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
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
        ::-webkit-scrollbar:horizontal{height:0;}
      `}</style>

      <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif" }}>

        {/* Chat header */}
        <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"14px 20px", display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
          <div style={{ width:36, height:36, borderRadius:"50%", background:`${C.gold}22`, border:`1px solid ${C.goldDim}`, color:C.gold, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>M</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:600, color:C.text }}>Modus Property Management</div>
            <div style={{ fontSize:11, color:C.textMuted, marginTop:1 }}>Usually replies within a few hours</div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 8px", display:"flex", flexDirection:"column", gap:4 }}>
          {loading && <div style={{ textAlign:"center", color:C.textSub, fontSize:13, marginTop:40 }}>Loading messages…</div>}
          {!loading && !tenantId && <div style={{ textAlign:"center", color:C.textSub, fontSize:13, marginTop:40 }}>Your account isn't linked to a unit yet. Contact your property manager.</div>}
          {!loading && tenantId && messages.length === 0 && <div style={{ textAlign:"center", color:C.textMuted, fontSize:13, marginTop:40 }}>No messages yet — send a message to get started.</div>}

          {grouped.map((item, i) => {
            if (item.type === "date") return (
              <div key={`d-${i}`} style={{ textAlign:"center", fontSize:11, color:C.textMuted, margin:"10px 0 6px", fontWeight:500 }}>{item.label}</div>
            );
            const fromProperty = item.sender_id !== myUserId;
            return (
              <div key={item.id}>
                <div style={{ display:"flex", justifyContent:fromProperty?"flex-start":"flex-end", marginBottom:2, alignItems:"flex-end", gap:6 }}>
                  {fromProperty && (
                    <div style={{ width:26, height:26, borderRadius:"50%", background:`${C.gold}22`, border:`1px solid ${C.goldDim}`, color:C.gold, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, flexShrink:0 }}>M</div>
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
          <div ref={bottomRef}/>
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
          <textarea value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage(input);} }}
            placeholder="Message Modus Property Management…" rows={1}
            style={{ flex:1, padding:"10px 14px", fontSize:13, border:`1px solid ${C.border}`, borderRadius:18, background:C.raised, color:C.text, outline:"none", resize:"none", fontFamily:"'DM Sans',sans-serif", lineHeight:1.4, maxHeight:100 }}
          />
          <button onClick={()=>sendMessage(input)} disabled={!input.trim()}
            style={{ width:38, height:38, borderRadius:"50%", background:input.trim()?C.goldDim:C.raised, border:`1px solid ${input.trim()?C.goldDim:C.border}`, cursor:input.trim()?"pointer":"default", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color:input.trim()?C.gold:C.textMuted, flexShrink:0, transition:"all 0.15s" }}>
            ➤
          </button>
        </div>
      </div>
    </TenantLayout>
  );
}