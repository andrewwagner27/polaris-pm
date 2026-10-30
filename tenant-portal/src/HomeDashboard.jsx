import { useNavigate } from "react-router-dom";
import { useTenant } from "./useTenant";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import TenantLayout from "./TenantLayout";

const C = {
  bg:"#F5F3EE", surface:"#FFFFFF", raised:"#F8F7F4", border:"#E4E1DA",
  text:"#18181B", textSub:"#52525B", textMuted:"#A1A1AA",
  gold:"#8B6914", goldBg:"#FBF6EC", goldDim:"#C9A96E",
  green:"#15803D", greenBg:"#F0FDF4",
  red:"#DC2626", redBg:"#FEF2F2",
  blue:"#1D4ED8", blueBg:"#EFF6FF",
  amber:"#92400E", amberBg:"#FFFBEB",
};

function fmt(n) {
  return n != null ? `$${Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}` : "—";
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
}
function isRentDue(leaseStart) {
  if (!leaseStart) return true;
  return new Date(leaseStart+"T00:00:00") <= new Date();
}

function Card({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick}
      style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, boxShadow:"0 1px 3px rgba(0,0,0,0.05)", ...style }}>
      {children}
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize:10, fontWeight:600, color:C.textMuted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6 }}>{children}</div>;
}

function StatusBadge({ status }) {
  const map = {
    open:        { label:"Open",        c:"#92400E", bg:"#FFFBEB" },
    in_progress: { label:"In Progress", c:"#1E40AF", bg:"#EFF6FF" },
    resolved:    { label:"Resolved",    c:"#166534", bg:"#F0FDF4" },
  };
  const s = map[status] || map.open;
  return <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:4,background:s.bg,color:s.c,whiteSpace:"nowrap",border:`1px solid ${s.c}22` }}>{s.label}</span>;
}

export default function HomeDashboard() {
  const navigate = useNavigate();
  const { tenant, user, loading } = useTenant();
  const [messages, setMessages]     = useState([]);
  const [msgsLoading, setMsgsLoading] = useState(true);
  const [balanceInfo, setBalanceInfo] = useState(null);

  useEffect(() => {
    if (user && tenant?.id) { fetchMessages(); fetchBalance(); }
  }, [user, tenant?.id]);

  async function fetchMessages() {
    setMsgsLoading(true);
    const { data } = await supabase.from("messages").select("*").eq("tenant_id", tenant.id).order("created_at",{ascending:false}).limit(10);
    setMessages(data || []);
    setMsgsLoading(false);
  }

  async function fetchBalance() {
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
    <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:C.bg,color:C.textMuted,fontFamily:"'DM Sans',sans-serif",fontSize:14 }}>
      Loading your portal…
    </div>
  );

  const firstName       = (tenant?.name || "Tenant").split(" ")[0];
  const unreadCount     = messages.filter(m => !m.read && m.recipient_id === user?.id).length;
  const hour            = new Date().getHours();
  const timeOfDay       = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const maintenance     = tenant?.maintenance || [];
  const openMaintenance = maintenance.filter(m => m.status !== "resolved");
  const leaseDaysLeft   = tenant?.leaseEnd ? Math.ceil((new Date(tenant.leaseEnd+"T00:00:00") - new Date()) / (1000*60*60*24)) : null;
  const showLeaseAlert  = leaseDaysLeft !== null && leaseDaysLeft < 60 && leaseDaysLeft >= 0;
  const rentDue         = isRentDue(tenant?.leaseStart);
  const rentAmount      = tenant?.rent || 0;
  const totalMonthly    = tenant?.recurringCharges?.length > 0
    ? tenant.recurringCharges.reduce((s,c) => s + parseFloat(c.amount||0), 0)
    : rentAmount;

  const now       = new Date();
  const nextDue   = new Date(now.getFullYear(), now.getMonth() + (now.getDate() > 1 ? 1 : 0), 1);
  const nextDueStr = nextDue.toLocaleDateString("en-US",{month:"long",day:"numeric"});
  const daysUntilDue = Math.ceil((nextDue - now) / (1000*60*60*24));

  const balanceIsKnown  = balanceInfo != null;
  const balanceColor    = !balanceIsKnown ? C.text : balanceInfo > 0 ? C.red : C.green;
  const balanceLabel    = !balanceIsKnown ? (rentDue ? "Monthly Rent" : "—")
                        : balanceInfo > 0 ? "Amount due" : balanceInfo < 0 ? "Credit on account" : "Account current";
  const balanceDisplay  = balanceIsKnown ? fmt(Math.abs(balanceInfo)) : (rentDue ? fmt(rentAmount) : "—");

  return (
    <TenantLayout tenantName={tenant?.name || "Tenant"} unreadMessages={unreadCount}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;}
        .t-row:hover{background:${C.raised}!important;}
        .t-action-btn:hover{opacity:0.88!important;}
        @media(max-width:767px){
          .home-grid-2{grid-template-columns:1fr!important;}
          .home-pad{padding:16px 14px 24px!important;}
          .hero-amount{font-size:40px!important;}
          .hero-card{flex-direction:column!important;gap:16px!important;}
          .hero-actions{flex-direction:column!important;}
          .quick-grid{grid-template-columns:1fr 1fr!important;}
        }
      `}</style>

      <div className="home-pad" style={{ background:C.bg, minHeight:"100vh", color:C.text, fontFamily:"'DM Sans',sans-serif", padding:"28px 24px 80px" }}>

        {/* ── Greeting ── */}
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:12, color:C.textMuted, marginBottom:3, letterSpacing:"0.02em" }}>Good {timeOfDay}</div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:34, fontWeight:600, color:C.text, lineHeight:1.1 }}>{firstName}</div>
        </div>

        {/* ── Lease alert ── */}
        {showLeaseAlert && (
          <div style={{ marginBottom:16, padding:"11px 14px", background:C.amberBg, border:`1px solid #F59E0B40`, borderRadius:9, display:"flex", alignItems:"center", gap:10 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            <span style={{ fontSize:13, color:C.amber, fontWeight:500 }}>Lease expires in {leaseDaysLeft} days</span>
            <span style={{ fontSize:12, color:C.textSub }}>— Contact your property manager about renewal</span>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            HERO CARD — the 5 key tenant questions
        ══════════════════════════════════════════════════════ */}
        <Card style={{ padding:"24px 28px", marginBottom:16, borderColor: balanceInfo > 0 ? "#FCA5A5" : C.border }}>

          {/* Top row: balance + pay button */}
          <div className="hero-card" style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:24, marginBottom:20 }}>

            {/* Balance */}
            <div style={{ flex:1 }}>
              <Label>Balance Due</Label>
              <div className="hero-amount" style={{ fontFamily:"'DM Mono',monospace", fontSize:48, fontWeight:500, color:balanceColor, lineHeight:1, letterSpacing:"-0.02em", marginBottom:6 }}>
                {balanceDisplay}
              </div>
              <div style={{ fontSize:13, color:C.textSub }}>{balanceLabel}</div>
            </div>

            {/* Due date + Pay CTA */}
            <div style={{ display:"flex", flexDirection:"column", gap:10, alignItems:"flex-end", minWidth:180 }}>
              <div style={{ textAlign:"right" }}>
                <Label>Next Due Date</Label>
                <div style={{ fontSize:16, fontWeight:600, color:C.text, marginBottom:2 }}>{nextDueStr}</div>
                <div style={{ fontSize:11, color: daysUntilDue <= 5 ? C.red : C.textMuted }}>
                  {daysUntilDue <= 0 ? "Due today" : `${daysUntilDue} days away`}
                </div>
              </div>
              <button onClick={() => navigate("/pay")} className="t-action-btn"
                style={{ padding:"12px 24px", background:C.gold, border:"none", borderRadius:8, fontSize:14, fontWeight:600, color:"#FFFFFF", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", letterSpacing:"0.01em", transition:"opacity 0.15s", whiteSpace:"nowrap" }}>
                Pay Now →
              </button>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height:1, background:C.border, marginBottom:16 }} />

          {/* Quick-action row: Maintenance + Lease docs */}
          <div className="quick-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>

            {/* New maintenance request */}
            <button onClick={() => navigate("/maintenance/new")} className="t-action-btn"
              style={{ padding:"12px 14px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:8, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", textAlign:"left", transition:"opacity 0.15s", display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:30, height:30, borderRadius:7, background:"#FFF7ED", border:"1px solid #FED7AA", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C2410C" strokeWidth="2" strokeLinecap="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3-3a1 1 0 000-1.4l-1.6-1.6a1 1 0 00-1.4 0l-3 3z"/><path d="M11 13l-9 9"/></svg>
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:C.text }}>New Request</div>
                <div style={{ fontSize:11, color:C.textMuted }}>Report an issue</div>
              </div>
            </button>

            {/* Open requests count */}
            <button onClick={() => navigate("/maintenance")} className="t-action-btn"
              style={{ padding:"12px 14px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:8, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", textAlign:"left", transition:"opacity 0.15s", display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:30, height:30, borderRadius:7, background:openMaintenance.length > 0 ? "#FFFBEB" : C.greenBg, border:`1px solid ${openMaintenance.length > 0 ? "#FDE68A" : "#BBF7D0"}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <span style={{ fontSize:13, fontWeight:700, color: openMaintenance.length > 0 ? C.amber : C.green }}>{openMaintenance.length}</span>
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:C.text }}>Open Tickets</div>
                <div style={{ fontSize:11, color:C.textMuted }}>View all →</div>
              </div>
            </button>

            {/* Lease docs */}
            <button onClick={() => navigate("/account")} className="t-action-btn"
              style={{ padding:"12px 14px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:8, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", textAlign:"left", transition:"opacity 0.15s", display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:30, height:30, borderRadius:7, background:C.blueBg, border:"1px solid #BFDBFE", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:C.text }}>Lease &amp; Docs</div>
                <div style={{ fontSize:11, color:C.textMuted }}>{fmtDate(tenant?.leaseEnd)}</div>
              </div>
            </button>
          </div>
        </Card>

        {/* ── Secondary grid ── */}
        <div className="home-grid-2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>

          {/* Upcoming Charges */}
          <Card style={{ padding:"20px 22px" }}>
            <Label>Upcoming Charges</Label>
            {(tenant?.recurringCharges?.length > 0
              ? tenant.recurringCharges
              : [{ category:"Monthly Rent", amount:rentAmount, _isDefault:true }]
            ).map((c, i, arr) => (
              <div key={c.id || "default"} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500, color:C.text }}>{c.category || "Monthly Rent"}</div>
                  <div style={{ fontSize:11, color:C.textMuted, marginTop:1 }}>Due {nextDueStr}</div>
                </div>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:14, fontWeight:500, color:C.text }}>{fmt(parseFloat(c.amount||0))}</div>
              </div>
            ))}
            {tenant?.recurringCharges?.length > 0 && (
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:10, marginTop:2 }}>
                <span style={{ fontSize:11, color:C.textMuted, fontWeight:600 }}>Total / mo</span>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:14, fontWeight:600, color:C.gold }}>{fmt(totalMonthly)}</span>
              </div>
            )}
          </Card>

          {/* Lease summary */}
          <Card style={{ padding:"20px 22px" }}>
            <Label>Lease</Label>
            {[
              ["Unit",        `Unit ${tenant?.unit||"—"} · ${tenant?.property||"—"}`],
              ["Lease Start", fmtDate(tenant?.leaseStart)],
              ["Lease End",   fmtDate(tenant?.leaseEnd)],
              ["Monthly",     fmt(totalMonthly)],
            ].map(([k, v], i, arr) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <span style={{ fontSize:12, color:C.textMuted }}>{k}</span>
                <span style={{ fontSize:13, fontWeight: k === "Monthly" ? 600 : 400, color: k === "Monthly" ? C.gold : C.text, fontFamily: k === "Monthly" ? "'DM Mono',monospace" : "inherit" }}>{v}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* ── Bottom row: Maintenance + Messages ── */}
        <div className="home-grid-2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>

          {/* Maintenance */}
          <Card style={{ overflow:"hidden", padding:0 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderBottom:`1px solid ${C.border}` }}>
              <span style={{ fontSize:11, fontWeight:600, color:C.textMuted, letterSpacing:"0.08em", textTransform:"uppercase" }}>Maintenance</span>
              <button onClick={() => navigate("/maintenance")}
                style={{ fontSize:12, color:C.gold, background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:500 }}>
                See all →
              </button>
            </div>
            {maintenance.length === 0 ? (
              <div style={{ padding:"20px", textAlign:"center", color:C.textMuted, fontSize:13 }}>No open requests.</div>
            ) : maintenance.slice(0,3).map((m, i) => (
              <div key={m.id} className="t-row"
                style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 18px", borderBottom: i < 2 && i < maintenance.length - 1 ? `1px solid ${C.border}` : "none", cursor:"pointer", transition:"background 0.12s" }}
                onClick={() => navigate(`/maintenance/${m.id}`)}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500, color:C.text }}>{m.title}</div>
                  <div style={{ fontSize:11, color:C.textMuted, marginTop:1 }}>{new Date(m.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>
                </div>
                <StatusBadge status={m.status} />
              </div>
            ))}
          </Card>

          {/* Messages */}
          <Card style={{ overflow:"hidden", padding:0 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderBottom:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:11, fontWeight:600, color:C.textMuted, letterSpacing:"0.08em", textTransform:"uppercase" }}>Messages</span>
                {unreadCount > 0 && (
                  <span style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:8, background:C.blue, color:"#fff" }}>{unreadCount}</span>
                )}
              </div>
              <button onClick={() => navigate("/messages")}
                style={{ fontSize:12, color:C.gold, background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:500 }}>
                Open →
              </button>
            </div>
            {msgsLoading ? (
              <div style={{ padding:"20px", color:C.textMuted, fontSize:13 }}>Loading…</div>
            ) : messages.length === 0 ? (
              <div style={{ padding:"20px", textAlign:"center", color:C.textMuted, fontSize:13 }}>No messages yet.</div>
            ) : (
              <div className="t-row"
                style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 18px", cursor:"pointer", transition:"background 0.12s" }}
                onClick={() => navigate("/messages")}>
                <div style={{ width:34, height:34, borderRadius:"50%", background:C.goldBg, border:`1px solid ${C.goldDim}`, color:C.gold, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>M</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:2 }}>Modus Property Management</div>
                  <div style={{ fontSize:12, color:C.textSub, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{messages[0]?.body}</div>
                  {unreadCount > 0 && <div style={{ fontSize:11, color:C.blue, marginTop:2, fontWeight:500 }}>{unreadCount} unread</div>}
                </div>
                <span style={{ fontSize:10, color:C.textMuted, flexShrink:0 }}>{new Date(messages[0]?.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
              </div>
            )}
          </Card>
        </div>
      </div>
    </TenantLayout>
  );
}
