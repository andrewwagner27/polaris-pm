import { useNavigate } from "react-router-dom";
import { fetchTenantBalance, balancePresentation, monthlyChargesSummary, formatCents } from "./lib/tenantFinancials";
import { useTenant } from "./useTenant";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import TenantLayout from "./TenantLayout";
import { getSignedStorageUrl } from "./storageUtils";

const C = {
  bg:"#F5F3EE", surface:"#FFFFFF", raised:"#F8F7F4", border:"#E4E1DA",
  text:"#18181B", textSub:"#52525B", textMuted:"#6B6B73",
  gold:"#7A5C12", goldBg:"#FBF6EC", goldDim:"#C9A96E",
  green:"#15803D", greenBg:"#F0FDF4",
  red:"#B91C1C", redBg:"#FEF2F2",
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

function Card({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick}
      style={{ background:C.surface, borderRadius:16, boxShadow:"0 1px 2px rgba(24,24,27,0.04), 0 4px 16px rgba(24,24,27,0.04)", ...style }}>
      {children}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    open:        { label:"Open",        c:"#92400E", bg:"#FFFBEB" },
    in_progress: { label:"In progress", c:"#1E40AF", bg:"#EFF6FF" },
    resolved:    { label:"Resolved",    c:"#166534", bg:"#F0FDF4" },
  };
  const s = map[status] || (["quote_submitted", "pending_review", "scheduled", "assigned"].includes(status)
    ? map.in_progress : map.open);
  return <span style={{ fontSize:12,fontWeight:500,padding:"4px 10px",borderRadius:999,background:s.bg,color:s.c,whiteSpace:"nowrap" }}>{s.label}</span>;
}

// Next occurrence of the tenant's rent due day (tenants.rent_due_day; 1st when not set), from today.
function nextRentDate(dueDay, today = new Date()) {
  const day = Math.min(Math.max(Number(dueDay) || 1, 1), 28);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), day);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return thisMonth >= t0 ? thisMonth : new Date(today.getFullYear(), today.getMonth() + 1, day);
}

// ── Rent card ─────────────────────────────────────────────────────────────────
// Five display states, derived once from balance + payment read + pending:
//   loading       → stable placeholder, no $0 / paid-up flicker
//   processing    → payment in flight; remaining balance shown when verified
//   verified_due  → confirmed amount owed, no processing payment
//   paid_up       → verified $0 or credit, no processing payment
//   unavailable   → balance couldn't load; never implies $0
function RentCard({ balance, due, navigate, hasRentSchedule, nextDueStr, daysUntilDue }) {
  const bal         = balancePresentation(balance);
  const pendingCents = due?.ledger_active ? Number(due.pending_cents) || 0 : 0;
  const payableCents = Number(due?.payable_cents) || 0;
  const onlinePay    = !!due?.ledger_active && due.online_available !== false;

  // Derive state
  let rentState;
  if (balance.state === "loading" || due === undefined) {
    rentState = "loading";
  } else if (pendingCents > 0) {
    rentState = "processing";
  } else if (bal.available && bal.cents > 0) {
    rentState = "verified_due";
  } else if (bal.available && bal.cents <= 0) {
    rentState = "paid_up";
  } else {
    rentState = "unavailable";
  }

  // ── Loading ──
  if (rentState === "loading") {
    return (
      <Card style={{ padding:"24px 22px", border:"1px solid #E8DFCB" }}>
        <div style={{ fontSize:13,fontWeight:500,color:C.textMuted,marginBottom:8 }}>Rent</div>
        <div style={{ height:32,borderRadius:8,background:C.raised,width:"40%",marginBottom:10 }}/>
        <div style={{ height:14,borderRadius:6,background:C.raised,width:"60%",marginBottom:20 }}/>
        <div style={{ height:40,borderRadius:10,background:C.raised,width:120 }}/>
      </Card>
    );
  }

  // ── Processing ──
  if (rentState === "processing") {
    const remainingVerified = bal.available && payableCents === 0;
    const stillDue = bal.available && payableCents > 0;
    return (
      <Card style={{ padding:"24px 22px", border:"1px solid #E8DFCB" }}>
        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:12 }}>
          <div style={{ fontSize:13,fontWeight:500,color:C.textMuted }}>Rent</div>
          <span style={{ fontSize:12,fontWeight:500,padding:"2px 9px",borderRadius:999,background:C.blueBg,color:C.blue }}>Processing</span>
        </div>
        <div style={{ fontSize:26,fontWeight:700,color:C.blue,fontVariantNumeric:"tabular-nums",lineHeight:1.2,marginBottom:4 }}>
          {formatCents(pendingCents)}
        </div>
        <div style={{ fontSize:14,color:C.textSub,marginBottom: stillDue ? 12 : 16 }}>
          {remainingVerified
            ? "Nothing more due right now."
            : bal.available
              ? null
              : "We can't confirm your remaining balance yet."}
        </div>
        {stillDue && (
          <div role="status" style={{ fontSize:14,color:C.amber,fontWeight:500,marginBottom:16 }}>
            Still due: {formatCents(payableCents)}
            {onlinePay && (
              <button type="button" className="t-btn" style={{ marginLeft:14,fontSize:13,minHeight:36,padding:"0 14px" }} onClick={() => navigate("/pay")}>
                Pay now
              </button>
            )}
          </div>
        )}
        <div style={{ display:"flex",gap:14,alignItems:"center" }}>
          <button type="button" className="t-link" onClick={() => navigate("/pay")}>Payment details</button>
          <button type="button" className="t-link" style={{ color:C.textMuted }} onClick={() => navigate("/activity")}>History</button>
        </div>
      </Card>
    );
  }

  // ── Verified amount due ──
  if (rentState === "verified_due") {
    const canPay = onlinePay && payableCents > 0;
    return (
      <Card style={{ padding:"24px 22px", border:`1px solid ${C.red}44` }}>
        <div style={{ fontSize:13,fontWeight:500,color:C.textMuted,marginBottom:8 }}>Rent</div>
        <div style={{ fontSize:30,fontWeight:700,color:C.red,fontVariantNumeric:"tabular-nums",lineHeight:1.15,marginBottom:4 }}>
          {fmt(bal.cents / 100)} due
        </div>
        {hasRentSchedule && (
          <div style={{ fontSize:14,color: daysUntilDue <= 3 ? C.amber : C.textSub,marginBottom:20 }}>
            Due {nextDueStr}{daysUntilDue <= 0 ? " · Today" : daysUntilDue === 1 ? " · Tomorrow" : ` · In ${daysUntilDue} days`}
          </div>
        )}
        <div style={{ display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginTop: hasRentSchedule ? 0 : 20 }}>
          {canPay ? (
            <button type="button" className="t-btn" onClick={() => navigate("/pay")}>Pay rent</button>
          ) : (
            <button type="button" className="t-link" onClick={() => navigate("/pay")}>Payment details</button>
          )}
          <button type="button" className="t-link" style={{ color:C.textMuted }} onClick={() => navigate("/activity")}>History</button>
        </div>
      </Card>
    );
  }

  // ── Paid up ──
  if (rentState === "paid_up") {
    return (
      <Card style={{ padding:"24px 22px", border:`1px solid ${C.green}44` }}>
        <div style={{ fontSize:13,fontWeight:500,color:C.textMuted,marginBottom:8 }}>Rent</div>
        <div style={{ fontSize:26,fontWeight:700,color:C.green,marginBottom:4 }}>You're paid up</div>
        {hasRentSchedule && (
          <div style={{ fontSize:14,color:C.textSub,marginBottom:20 }}>
            Next due {nextDueStr}
          </div>
        )}
        <button type="button" className="t-link" onClick={() => navigate("/activity")}>Payment history</button>
      </Card>
    );
  }

  // ── Unavailable ──
  return (
    <Card style={{ padding:"24px 22px", border:"1px solid #E8DFCB" }}>
      <div style={{ fontSize:13,fontWeight:500,color:C.textMuted,marginBottom:8 }}>Rent</div>
      <div style={{ fontSize:20,fontWeight:600,color:C.text,marginBottom:6 }}>Balance unavailable</div>
      <div style={{ fontSize:14,color:C.textSub,lineHeight:1.5,marginBottom:20,maxWidth:380 }}>
        {bal.detail || "Message management to confirm what you owe."}
      </div>
      <button type="button" className="t-btn t-btn-quiet" onClick={() => navigate("/messages")}>Message management</button>
    </Card>
  );
}

export default function HomeDashboard() {
  const navigate = useNavigate();
  const { tenant, user, loading } = useTenant();
  const [messages, setMessages]       = useState([]);
  const [unreadTotal, setUnreadTotal]   = useState(null);
  const [msgsLoading, setMsgsLoading]   = useState(true);
  const [balance, setBalance]           = useState({ state: "loading" });
  // undefined while in-flight; null on error; object when resolved
  const [rentPaymentRead, setRentPaymentRead] = useState(undefined);

  useEffect(() => {
    if (!(user && tenant?.id)) return;
    fetchMessages(); fetchBalance();
    let active = true;
    supabase.rpc("a2_pay_rent_due", { p_tenant: tenant.id })
      .then(({ data, error }) => {
        if (active) setRentPaymentRead(error ? null : { tenantId: tenant.id, data });
      });
    return () => { active = false; };
  }, [user, tenant?.id]);

  async function fetchMessages() {
    setMsgsLoading(true);
    const [{ data }, { count }] = await Promise.all([
      supabase.from("messages").select("*").eq("tenant_id", tenant.id).order("created_at",{ascending:false}).limit(10),
      supabase.from("messages").select("id", { count:"exact", head:true }).eq("tenant_id", tenant.id).eq("recipient_id", user.id).eq("read", false),
    ]);
    setMessages(data || []);
    setUnreadTotal(count ?? null);
    setMsgsLoading(false);
  }

  async function fetchBalance() {
    setBalance({ state: "loading" });
    setBalance(await fetchTenantBalance(supabase));
  }

  if (loading) return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:C.bg,color:C.textSub,fontFamily:"var(--m-font)",fontSize:14 }}>
      Loading your portal…
    </div>
  );

  const firstName       = (tenant?.name || "Tenant").split(" ")[0];
  const unreadCount     = unreadTotal ?? messages.filter(m => !m.read && m.recipient_id === user?.id).length;
  const hour            = new Date().getHours();
  const timeOfDay       = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const maintenance     = tenant?.maintenance || [];
  const openMaintenance = maintenance.filter(m => m.status !== "resolved");
  const recentActivity = [
    ...maintenance.map(ticket => ({
      id: "repair-" + ticket.id,
      title: ticket.title,
      kind: "Maintenance",
      date: ticket.updated_at || ticket.created_at,
      status: ticket.status,
      path: "/maintenance/" + ticket.id,
    })),
    ...messages.slice(0, 3).map(message => ({
      id: "message-" + message.id,
      title: message.body || "View message",
      kind: "Message",
      date: message.created_at,
      unread: !message.read && message.recipient_id === user?.id,
      path: "/messages",
    })),
  ].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0)).slice(0, 5);

  const leaseDaysLeft  = tenant?.leaseEnd ? Math.ceil((new Date(tenant.leaseEnd+"T00:00:00") - new Date()) / (1000*60*60*24)) : null;
  const showLeaseAlert = leaseDaysLeft !== null && leaseDaysLeft < 60 && leaseDaysLeft >= 0;
  const baseRent       = tenant?.rent ? Number(tenant.rent) : null;
  const monthly        = monthlyChargesSummary(tenant?.recurringCharges);
  const hasRentSchedule = (baseRent && baseRent > 0) || monthly.hasCharges;

  const nextDue      = nextRentDate(tenant?.raw?.rent_due_day);
  const nextDueStr   = nextDue.toLocaleDateString("en-US",{ weekday:"short", month:"long", day:"numeric" });
  const daysUntilDue = Math.round((nextDue - new Date(new Date().toDateString())) / (1000*60*60*24));

  // due: undefined while loading, null on error, data object when resolved
  const due = rentPaymentRead === undefined
    ? undefined
    : rentPaymentRead?.tenantId === tenant?.id ? rentPaymentRead?.data : null;

  async function openLease() {
    if (tenant?.lease_document_url) {
      const signed = await getSignedStorageUrl("lease-documents", tenant.lease_document_url);
      if (signed) { window.open(signed, "_blank", "noopener,noreferrer"); } else { navigate("/documents?view=lease"); }
    } else { navigate("/documents?view=lease"); }
  }

  return (
    <TenantLayout tenantName={tenant?.name || "Tenant"} unreadMessages={unreadCount}>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;}
        .t-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:56px;padding:12px 20px;background:transparent;border:none;border-top:1px solid ${C.border};font:inherit;color:inherit;text-align:left;cursor:pointer;}
        .t-row:first-of-type{border-top:none;}
        .t-row:hover{background:${C.raised};}
        .t-link{font:inherit;font-size:14px;font-weight:500;color:${C.gold};background:none;border:none;cursor:pointer;min-height:44px;padding:0 4px;}
        .t-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:12px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;border:1px solid ${C.gold};background:${C.gold};color:#FFFFFF;}
        .t-btn-quiet{background:transparent;color:${C.gold};border-color:#D9CBA8;}
        .home-actions{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 20px;}
        .home-grid{display:grid;gap:20px;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr);align-items:start;}
        .home-column{display:grid;gap:16px;min-width:0;}
        .home-activity-links{display:flex;flex-wrap:wrap;gap:4px 14px;padding:0 16px 4px;}
        .home-activity-text{min-width:0;flex:1;}
        .home-activity-meta{display:block;margin-bottom:4px;font-size:13px;color:#6B6B73;}
        .home-activity-title{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:500;}
        .home-unread{font-size:12px;font-weight:600;color:#1D4ED8;}
        .home-empty{margin:0;padding:8px 20px 18px;font-size:14px;color:#52525B;}
        .t-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px 10px;}
        .t-head h2{font-size:16px;font-weight:600;margin:0;}
        @media(max-width:850px){.home-grid{grid-template-columns:1fr;}}
        @media(max-width:480px){.home-actions .t-btn{flex:1 1 auto;padding:0 12px;}}
        @media(max-width:767px){ .home-pad{padding:16px 16px 28px!important;} }
      `}</style>

      <div className="home-pad" style={{ background:C.bg, minHeight:"100%", color:C.text, fontFamily:"var(--m-font)", padding:"28px 32px 64px", maxWidth:1040, margin:"0 auto" }}>

        {/* Compact header: greeting + unit */}
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:22,fontWeight:700,color:C.text,lineHeight:1.2 }}>Good {timeOfDay}, {firstName}</div>
          <div style={{ fontSize:14,color:C.textSub,marginTop:3 }}>
            {tenant?.unit ? `Unit ${tenant.unit}` : ""}
            {tenant?.unit && tenant?.property ? " · " : ""}
            {tenant?.property || ""}
          </div>
        </div>

        {showLeaseAlert && (
          <div role="status" style={{ marginBottom:16, padding:"12px 16px", background:C.amberBg, border:"1px solid #F59E0B55", borderRadius:12, fontSize:14, color:C.amber }}>
            Lease expires in {leaseDaysLeft} days. Message management about renewal.
          </div>
        )}

        <div className="home-grid">
          <div className="home-column">

            {/* Rent card — primary focus */}
            <RentCard
              balance={balance}
              due={due}
              navigate={navigate}
              hasRentSchedule={hasRentSchedule}
              nextDueStr={nextDueStr}
              daysUntilDue={daysUntilDue}
            />

            {/* Quick actions directly below rent */}
            <nav className="home-actions" aria-label="Quick actions">
              <button type="button" className="t-btn" onClick={() => navigate("/maintenance/new")}>Report an issue</button>
              <button type="button" className="t-btn t-btn-quiet" onClick={() => navigate("/messages")}>
                Message management{unreadCount > 0 ? ` · ${unreadCount}` : ""}
              </button>
            </nav>

            <Card style={{ overflow:"hidden" }}>
              <div className="t-head"><h2>Recent activity</h2></div>
              <div className="home-activity-links">
                <button type="button" className="t-link" onClick={() => navigate("/maintenance")}>
                  Repairs{openMaintenance.length > 0 ? " · " + openMaintenance.length + " open" : ""}
                </button>
                <button type="button" className="t-link" onClick={() => navigate("/messages")}>
                  Messages{unreadCount > 0 ? " · " + unreadCount + " unread" : ""}
                </button>
              </div>
              {recentActivity.map(item => (
                <button type="button" className="t-row" key={item.id} onClick={() => navigate(item.path)}>
                  <span className="home-activity-text">
                    <span className="home-activity-meta">
                      {item.kind}{item.date && " · " + new Date(item.date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                    </span>
                    <span className="home-activity-title">{item.title}</span>
                  </span>
                  {item.status && <StatusBadge status={item.status}/>}
                  {item.unread && <span className="home-unread">Unread</span>}
                </button>
              ))}
              {recentActivity.length === 0 && (
                <p className="home-empty">{msgsLoading ? "Loading recent activity…" : "New messages and maintenance updates will appear here."}</p>
              )}
            </Card>
          </div>

          <div className="home-column">
            <Card style={{ padding:"0 0 18px" }}>
              <div className="t-head"><h2>Lease &amp; documents</h2></div>
              <div style={{ padding:"0 20px" }}>
                {[
                  ["Lease start", fmtDate(tenant?.leaseStart)],
                  ["Lease end",   fmtDate(tenant?.leaseEnd)],
                  ["Base rent on file", baseRent != null ? fmt(baseRent) : "—"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", gap:12, padding:"9px 0" }}>
                    <span style={{ fontSize:14, color:C.textSub }}>{k}</span>
                    <span style={{ fontSize:14, fontWeight:500, color:C.text, fontVariantNumeric:"tabular-nums", textAlign:"right" }}>{v}</span>
                  </div>
                ))}
                <button type="button" className="t-btn t-btn-quiet" style={{ marginTop:10 }} onClick={openLease}>
                  {tenant?.lease_document_url ? "Open your lease" : "Documents"}
                </button>
              </div>
            </Card>

            {/* Monthly Recurring Charges: only shown when there are actual charges */}
            {monthly.hasCharges && (
              <Card style={{ padding:"18px 20px" }}>
                <h2 style={{ fontSize:16, fontWeight:600, margin:"0 0 4px" }}>Monthly charges</h2>
                <div style={{ fontSize:13, color:C.textMuted, marginBottom:10 }}>Scheduled each month. Not your balance due.</div>
                {monthly.items.map((c, i) => (
                  <div key={c.id || `charge-${i}`} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, padding:"8px 0" }}>
                    <div style={{ fontSize:14, fontWeight:500, color:C.text }}>{c.label}</div>
                    <div style={{ fontVariantNumeric:"tabular-nums", fontSize:14, fontWeight:500, color:C.text }}>{c.cents == null ? "—" : formatCents(c.cents)}</div>
                  </div>
                ))}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:10, marginTop:2, borderTop:`1px solid ${C.border}` }}>
                  <span style={{ fontSize:13, color:C.textSub, fontWeight:500 }}>Total monthly</span>
                  <span style={{ fontVariantNumeric:"tabular-nums", fontSize:15, fontWeight:600, color:C.text }}>{formatCents(monthly.totalCents)}</span>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </TenantLayout>
  );
}
