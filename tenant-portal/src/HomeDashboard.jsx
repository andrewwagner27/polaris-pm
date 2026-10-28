import { useNavigate } from "react-router-dom";
import { useTenant } from "./useTenant";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import TenantLayout from "./TenantLayout";

const C = {
  bg:"#0A0B0D",surface:"#111316",raised:"#181C21",border:"#252930",
  text:"#EDEAE2",textSub:"#9095A0",textMuted:"#5C6270",
  gold:"#C9A96E",goldDim:"#7A5C2E",blue:"#4A9AE8",green:"#72B02A",red:"#E05555",amber:"#F0A430",
};

function fmt(n) { return n!=null ? `$${Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}` : "—"; }
function fmtDate(d) { if (!d) return "—"; return new Date(d+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); }

function isRentDue(leaseStart) {
  // Never flag as due if lease hasn't started
  if (!leaseStart) return true;
  return new Date(leaseStart+"T00:00:00") <= new Date();
}

function Tile({ children, style = {} }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "22px 24px", ...style }}>
      {children}
    </div>
  );
}

function TileLabel({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>{children}</div>;
}

function StatusBadge({ status }) {
  const map = {
    open:        { label:"Open",        c:"#F0A430", bg:"rgba(240,164,48,0.13)" },
    in_progress: { label:"In Progress", c:"#4A9AE8", bg:"rgba(74,154,232,0.13)" },
    resolved:    { label:"Resolved",    c:"#72B02A", bg:"rgba(114,176,42,0.13)" },
  };
  const s = map[status] || map.open;
  return <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:4,background:s.bg,color:s.c,whiteSpace:"nowrap" }}>{s.label}</span>;
}

export default function HomeDashboard() {
  const navigate = useNavigate();
  const { tenant, user, loading } = useTenant();
  const [messages, setMessages] = useState([]);
  const [msgsLoading, setMsgsLoading] = useState(true);
  const [balanceInfo, setBalanceInfo] = useState(null);

  useEffect(() => { if (user && tenant?.id) { fetchMessages(); fetchBalance(); } }, [user, tenant?.id]);

  async function fetchMessages() {
    setMsgsLoading(true);
    const { data } = await supabase.from("messages").select("*").eq("tenant_id", tenant.id).order("created_at",{ascending:false}).limit(10);
    setMessages(data || []);
    setMsgsLoading(false);
  }

  async function fetchBalance() {
    // Sum charges minus payments for current balance
    const { data: charges } = await supabase.from("ledger_entries").select("amount,type").eq("tenant_id", tenant.id);
    if (charges) {
      let bal = 0;
      charges.forEach(e => {
        if (e.type === "charge") bal += Number(e.amount);
        else if (e.type === "payment") bal -= Number(e.amount);
      });
      setBalanceInfo(bal);
    }
  }

  if (loading) return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:C.bg,color:C.textSub,fontFamily:"'DM Sans',sans-serif",fontSize:14 }}>
      Loading your portal…
    </div>
  );

  const firstName = (tenant?.name || "Tenant").split(" ")[0];
  const unreadCount = messages.filter(m => !m.read && m.recipient_id === user?.id).length;
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const maintenance = tenant?.maintenance || [];
  const leaseDaysLeft = tenant?.leaseEnd ? Math.ceil((new Date(tenant.leaseEnd+"T00:00:00") - new Date()) / (1000*60*60*24)) : null;
  const showLeaseAlert = leaseDaysLeft !== null && leaseDaysLeft < 60 && leaseDaysLeft >= 0;
  const rentDue = isRentDue(tenant?.leaseStart);
  const rentAmount = tenant?.rent || 0;

  // Upcoming charge: next month's rent
  const now = new Date();
  const nextDue = new Date(now.getFullYear(), now.getMonth() + (now.getDate() > 1 ? 1 : 0), 1);
  const nextDueStr = nextDue.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});

  return (
    <TenantLayout tenantName={tenant?.name || "Tenant"} unreadMessages={unreadCount}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;}
        .t-row:hover{background:${C.raised}!important;}
        @media(max-width:767px){
          .home-grid{grid-template-columns:1fr!important;}
          .home-pad{padding:20px 16px 24px!important;}
          .home-hero{font-size:32px!important;}
        }
      `}</style>

      <div className="home-pad" style={{ background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',sans-serif",padding:"36px 40px 80px",maxWidth:960,margin:"0 auto" }}>

        {/* Greeting */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize:12,color:C.textSub,marginBottom:4 }}>Good {timeOfDay}</div>
          <div className="home-hero" style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:38,fontWeight:600,color:C.text,lineHeight:1 }}>{firstName}</div>
        </div>

        {/* Lease expiry alert only — insurance banner removed */}
        {showLeaseAlert && (
          <div style={{ marginBottom:20,padding:"12px 16px",background:`${C.amber}10`,border:`1px solid ${C.amber}30`,borderRadius:9,display:"flex",alignItems:"center",gap:10 }}>
            <div style={{ width:7,height:7,borderRadius:"50%",background:C.amber,flexShrink:0 }}/>
            <span style={{ fontSize:13,color:C.text,fontWeight:500 }}>Lease expires in {leaseDaysLeft} days</span>
            <span style={{ fontSize:12,color:C.textSub }}>— Contact your property manager about renewal</span>
          </div>
        )}

        {/* ── Tile grid ── */}
        <div className="home-grid" style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14 }}>

          {/* Tile 1 — Current Balance */}
          <Tile>
            <TileLabel>Current Balance</TileLabel>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:46,fontWeight:600,color: balanceInfo > 0 ? C.red : C.green,lineHeight:1,marginBottom:6 }}>
              {balanceInfo != null ? fmt(Math.abs(balanceInfo)) : (rentDue ? fmt(rentAmount) : "—")}
            </div>
            {balanceInfo != null && (
              <div style={{ fontSize:12,color:C.textSub,marginBottom:16 }}>
                {balanceInfo > 0 ? "Amount due" : balanceInfo < 0 ? "Credit on account" : "Account current"}
              </div>
            )}
            {balanceInfo == null && rentDue && (
              <div style={{ fontSize:12,color:C.textSub,marginBottom:16 }}>Due 1st · Unit {tenant?.unit||"—"}</div>
            )}
            {!rentDue && balanceInfo == null && (
              <div style={{ fontSize:12,color:C.green,marginBottom:16 }}>Lease starts {fmtDate(tenant?.leaseStart)} — no balance due yet</div>
            )}
            <button onClick={() => navigate("/pay")}
              style={{ width:"100%",padding:"10px",background:C.goldDim,border:"none",borderRadius:7,fontSize:13,fontWeight:500,color:C.text,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.02em" }}
              onMouseOver={e=>e.currentTarget.style.opacity="0.8"} onMouseOut={e=>e.currentTarget.style.opacity="1"}>
              Make Payment →
            </button>
          </Tile>

          {/* Tile 2 — Upcoming Charges */}
          <Tile>
            <TileLabel>Upcoming Charges</TileLabel>
            <div>
                {/* Always show recurring charges; fall back to base rent */}
                {(tenant?.recurringCharges?.length > 0 ? tenant.recurringCharges : [{ category: "Monthly Rent", amount: rentAmount, _isDefault: true }])
                  .map((c, i, arr) => (
                    <div key={c.id || "default"} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom: i < arr.length-1 ? `1px solid ${C.border}` : "none" }}>
                      <div>
                        <div style={{ fontSize:13,fontWeight:500,color:C.text }}>{c.category || "Monthly Rent"}</div>
                        <div style={{ fontSize:11,color:C.textMuted,marginTop:2 }}>{rentDue ? `Due ${nextDueStr}` : `First due ${fmtDate(tenant?.leaseStart)}`}</div>
                      </div>
                      <div style={{ fontSize:15,fontWeight:600,color:C.text }}>{fmt(parseFloat(c.amount||0))}</div>
                    </div>
                  ))
                }
                {tenant?.recurringCharges?.length > 0 && (
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:10,borderTop:`1px solid ${C.border}`,marginTop:2 }}>
                    <span style={{ fontSize:11,color:C.textMuted,fontWeight:600 }}>Total / mo</span>
                    <span style={{ fontSize:13,fontWeight:600,color:C.gold }}>{fmt(tenant.recurringCharges.reduce((s,c)=>s+parseFloat(c.amount||0),0))}</span>
                  </div>
                )}
              </div>
          </Tile>

          {/* Tile 3 — Lease Summary */}
          <Tile>
            <TileLabel>Lease Summary</TileLabel>
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              <div style={{ display:"flex",justifyContent:"space-between" }}>
                <span style={{ fontSize:12,color:C.textMuted }}>Resident</span>
                <span style={{ fontSize:13,fontWeight:500,color:C.text }}>{tenant?.name || "—"}</span>
              </div>
              <div style={{ height:1,background:C.border }} />
              <div style={{ display:"flex",justifyContent:"space-between" }}>
                <span style={{ fontSize:12,color:C.textMuted }}>Unit</span>
                <span style={{ fontSize:13,color:C.text }}>Unit {tenant?.unit||"—"} · {tenant?.property||"—"}</span>
              </div>
              <div style={{ height:1,background:C.border }} />
              <div style={{ display:"flex",justifyContent:"space-between" }}>
                <span style={{ fontSize:12,color:C.textMuted }}>Lease Start</span>
                <span style={{ fontSize:13,color:C.text }}>{fmtDate(tenant?.leaseStart)}</span>
              </div>
              <div style={{ height:1,background:C.border }} />
              <div style={{ display:"flex",justifyContent:"space-between" }}>
                <span style={{ fontSize:12,color:C.textMuted }}>Lease End</span>
                <span style={{ fontSize:13,color:leaseDaysLeft !== null && leaseDaysLeft < 60 ? C.amber : C.text }}>{fmtDate(tenant?.leaseEnd)}</span>
              </div>
              <div style={{ height:1,background:C.border }} />
              <div style={{ display:"flex",justifyContent:"space-between" }}>
                <span style={{ fontSize:12,color:C.textMuted }}>Monthly Rent</span>
                <span style={{ fontSize:13,fontWeight:600,color:C.gold }}>
                  {tenant?.recurringCharges?.length > 0
                    ? fmt(tenant.recurringCharges.reduce((s,c)=>s+parseFloat(c.amount||0),0))
                    : fmt(rentAmount)}
                </span>
              </div>
            </div>
          </Tile>
        </div>

        {/* ── Lower row: Maintenance + Messages ── */}
        <div className="home-grid" style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>

          {/* Maintenance */}
          <Tile style={{ padding:0,overflow:"hidden" }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:`1px solid ${C.border}` }}>
              <span style={{ fontSize:11,fontWeight:600,color:C.textSub,letterSpacing:"0.06em",textTransform:"uppercase" }}>Maintenance</span>
              <button onClick={()=>navigate("/maintenance")} style={{ fontSize:11,color:C.goldDim,background:"none",border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}
                onMouseOver={e=>e.currentTarget.style.color=C.gold} onMouseOut={e=>e.currentTarget.style.color=C.goldDim}>See all →</button>
            </div>
            {maintenance.length === 0 ? (
              <div style={{ padding:"20px",textAlign:"center",color:C.textMuted,fontSize:13 }}>No open requests.</div>
            ) : maintenance.slice(0,3).map((m,i) => (
              <div key={m.id} className="t-row" style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px",borderBottom:i<2&&i<maintenance.length-1?`1px solid ${C.border}`:"none",cursor:"pointer",transition:"background 0.12s" }}
                onClick={()=>navigate(`/maintenance/${m.id}`)}>
                <div>
                  <div style={{ fontSize:13,fontWeight:500,color:C.text }}>{m.title}</div>
                  <div style={{ fontSize:11,color:C.textMuted,marginTop:1 }}>{new Date(m.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>
                </div>
                <StatusBadge status={m.status}/>
              </div>
            ))}
          </Tile>

          {/* Messages */}
          <Tile style={{ padding:0,overflow:"hidden" }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:`1px solid ${C.border}` }}>
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                <span style={{ fontSize:11,fontWeight:600,color:C.textSub,letterSpacing:"0.06em",textTransform:"uppercase" }}>Messages</span>
                {unreadCount>0&&<span style={{ fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:8,background:C.blue,color:"#fff" }}>{unreadCount}</span>}
              </div>
              <button onClick={()=>navigate("/messages")} style={{ fontSize:11,color:C.goldDim,background:"none",border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}
                onMouseOver={e=>e.currentTarget.style.color=C.gold} onMouseOut={e=>e.currentTarget.style.color=C.goldDim}>Open →</button>
            </div>
            {msgsLoading ? (
              <div style={{ padding:"20px",color:C.textMuted,fontSize:13 }}>Loading…</div>
            ) : messages.length === 0 ? (
              <div style={{ padding:"20px",textAlign:"center",color:C.textMuted,fontSize:13 }}>No messages yet.</div>
            ) : (
              <div className="t-row" style={{ display:"flex",alignItems:"center",gap:12,padding:"16px 20px",cursor:"pointer",transition:"background 0.12s" }} onClick={()=>navigate("/messages")}>
                <div style={{ width:36,height:36,borderRadius:"50%",background:`${C.gold}18`,border:`1px solid ${C.goldDim}`,color:C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0 }}>M</div>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:13,fontWeight:600,color:C.text,marginBottom:3 }}>Modus Property Management</div>
                  <div style={{ fontSize:12,color:C.textSub,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{messages[0]?.body}</div>
                  {unreadCount>0&&<div style={{ fontSize:11,color:C.blue,marginTop:2,fontWeight:500 }}>{unreadCount} unread</div>}
                </div>
                <span style={{ fontSize:10,color:C.textMuted,flexShrink:0 }}>{new Date(messages[0]?.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
              </div>
            )}
          </Tile>
        </div>
      </div>
    </TenantLayout>
  );
}
