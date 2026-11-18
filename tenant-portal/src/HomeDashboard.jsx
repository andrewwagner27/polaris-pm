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
      style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, boxShadow:"0 1px 3px rgba(0,0,0,0.05)", ...style }}>
      {children}
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize:12, fontWeight:600, color:C.textMuted, marginBottom:6 }}>{children}</div>;
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

// Next occurrence of the tenant's rent due day (tenants.rent_due_day; 1st when not set), from today.
function nextRentDate(dueDay, today = new Date()) {
  const day = Math.min(Math.max(Number(dueDay) || 1, 1), 28);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), day);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return thisMonth >= t0 ? thisMonth : new Date(today.getFullYear(), today.getMonth() + 1, day);
}

export default function HomeDashboard() {
  const navigate = useNavigate();
  const { tenant, user, loading } = useTenant();
  const [messages, setMessages]     = useState([]);
  const [msgsLoading, setMsgsLoading] = useState(true);
  // { state: "loading" | "available" | "unavailable", cents?, reason? } — see lib/tenantFinancials.js
  const [balance, setBalance] = useState({ state: "loading" });
  // Online rent payment is offered only when it really works for this tenant (same rule as Wallet and Pay):
  // an active receivables ledger and a property set up with the payment processor. Unknown → not offered.
  const [onlinePay, setOnlinePay] = useState(false);

  useEffect(() => {
    if (!(user && tenant?.id)) return;
    fetchMessages(); fetchBalance();
    supabase.rpc("a2_pay_rent_due", { p_tenant: tenant.id })
      .then(({ data, error }) => setOnlinePay(!error && !!data?.ledger_active && data?.online_available !== false));
  }, [user, tenant?.id]);

  async function fetchMessages() {
    setMsgsLoading(true);
    const { data } = await supabase.from("messages").select("*").eq("tenant_id", tenant.id).order("created_at",{ascending:false}).limit(10);
    setMessages(data || []);
    setMsgsLoading(false);
  }

  async function fetchBalance() {
    // Balance due comes only from the active receivables ledger. Inactive receivables or any
    // failure → "Balance unavailable"; rent and recurring charges are never shown in its place.
    setBalance({ state: "loading" });
    setBalance(await fetchTenantBalance(supabase));
  }

  if (loading) return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:C.bg,color:C.textSub,fontFamily:"var(--m-font)",fontSize:14 }}>
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
  const baseRent        = tenant?.rent ? Number(tenant.rent) : null;   // units.rent_amount, shown only as rent
  const monthly         = monthlyChargesSummary(tenant?.recurringCharges);
  const hasRentSchedule = (baseRent && baseRent > 0) || monthly.hasCharges;

  const nextDue      = nextRentDate(tenant?.raw?.rent_due_day);
  const nextDueStr   = nextDue.toLocaleDateString("en-US",{ weekday:"short", month:"long", day:"numeric" });
  const daysUntilDue = Math.round((nextDue - new Date(new Date().toDateString())) / (1000*60*60*24));

  const bal             = balancePresentation(balance);
  const balanceColor    = bal.tone === "due" ? C.red : bal.tone === "clear" ? C.green : C.textSub;

  return (
    <TenantLayout tenantName={tenant?.name || "Tenant"} unreadMessages={unreadCount}>
      <style>{`
        
        *,*::before,*::after{box-sizing:border-box;}
        .t-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:52px;padding:10px 16px;background:transparent;border:none;border-bottom:1px solid ${C.border};font:inherit;color:inherit;text-align:left;cursor:pointer;}
        .t-row:last-child{border-bottom:none;}
        .t-row:hover{background:${C.raised};}
        .t-quick{display:flex;align-items:center;gap:10px;min-height:56px;padding:10px 14px;background:${C.surface};border:1px solid ${C.border};border-radius:12px;cursor:pointer;font:inherit;color:inherit;text-align:left;}
        .t-quick:hover{border-color:${C.gold};}
        .t-link{font:inherit;font-size:13px;font-weight:600;color:${C.gold};background:none;border:none;cursor:pointer;min-height:44px;padding:0 4px;}
        .home-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));}
        .quick-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));}
        @media(max-width:767px){ .home-pad{padding:14px 14px 24px!important;} }
      `}</style>

      <div className="home-pad t-light" style={{ background:C.bg, minHeight:"100vh", color:C.text, fontFamily:"var(--m-font)", padding:"24px 24px 64px", maxWidth:1100 }}>

        {/* Greeting */}
        <div style={{ marginBottom:14 }}>
          <h1 style={{ fontFamily:"var(--m-font)", fontSize:"clamp(26px, 5vw, 32px)", fontWeight:600, color:C.text, lineHeight:1.1, margin:0 }}>Good {timeOfDay}, {firstName}</h1>
          <div style={{ fontSize:13, color:C.textSub, marginTop:4 }}>Unit {tenant?.unit || "—"} · {tenant?.property || "—"}</div>
        </div>

        {showLeaseAlert && (
          <div role="status" style={{ marginBottom:12, padding:"10px 14px", background:C.amberBg, border:"1px solid #F59E0B66", borderRadius:10, fontSize:13, color:C.amber, fontWeight:500 }}>
            Lease expires in {leaseDaysLeft} days. Message management about renewal.
          </div>
        )}

        {/* Rent: next date, rent on file, balance status, and the one action that actually works */}
        <Card style={{ padding:"18px 20px", marginBottom:12, borderColor: bal.tone === "due" ? "#FCA5A5" : C.border }}>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"14px 28px", alignItems:"flex-start" }}>
            <div style={{ flex:"1 1 220px", minWidth:0 }}>
              <Label>Balance Due</Label>
              <div data-balance-state={balance.state} style={{ fontSize: bal.available ? 26 : 16, fontWeight:600, color:balanceColor, fontFamily: bal.available ? "var(--m-font)" : "inherit", lineHeight:1.2 }}>{bal.amountText}</div>
              <div role={balance.state === "unavailable" ? "status" : undefined} style={{ fontSize:12, color:C.textSub, marginTop:3, lineHeight:1.45, maxWidth:420 }}>{bal.detail}</div>
            </div>
            {/* Due date + Pay CTA */}
            <div style={{ minWidth:170 }}>
              <Label>Next Due Date</Label>
              <div style={{ fontSize:17, fontWeight:600, color:C.text }}>{hasRentSchedule ? nextDueStr : "No rent schedule on file"}</div>
              {hasRentSchedule && <div style={{ fontSize:12, color: daysUntilDue <= 3 ? C.red : C.textSub, marginTop:2 }}>{daysUntilDue <= 0 ? "Due today" : `In ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`}</div>}
            </div>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"center", marginTop:14, paddingTop:14, borderTop:`1px solid ${C.border}` }}>
            {onlinePay ? (
              <button type="button" onClick={() => navigate("/pay")} style={{ minHeight:48, padding:"0 22px", background:C.gold, border:"none", borderRadius:10, fontSize:15, fontWeight:600, color:"#FFFFFF", cursor:"pointer", fontFamily:"var(--m-font)" }}>
                Pay rent
              </button>
            ) : (
              <>
                <span style={{ fontSize:13, color:C.textSub, flex:"1 1 240px" }}>Online payment isn't available yet. Pay the way your lease describes.</span>
                <button type="button" className="t-link" onClick={() => navigate("/pay")}>Payment details →</button>
              </>
            )}
          </div>
        </Card>

        {/* Quick actions */}
        <div className="quick-grid" style={{ marginBottom:12 }}>
          <button type="button" className="t-quick" onClick={() => navigate("/maintenance/new")}>
            <span aria-hidden="true" style={{ width:32, height:32, borderRadius:8, background:"#FFF7ED", border:"1px solid #FED7AA", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:"#9A3412", fontWeight:600 }}>+</span>
            <span><span style={{ display:"block", fontSize:14, fontWeight:600 }}>Report an issue</span><span style={{ display:"block", fontSize:12, color:C.textSub }}>Maintenance request</span></span>
          </button>
          <button type="button" className="t-quick" onClick={() => navigate("/messages")}>
            <span aria-hidden="true" style={{ width:32, height:32, borderRadius:8, background:C.blueBg, border:"1px solid #BFDBFE", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:C.blue, fontWeight:600 }}>{unreadCount > 0 ? unreadCount : "✉"}</span>
            <span><span style={{ display:"block", fontSize:14, fontWeight:600 }}>Messages</span><span style={{ display:"block", fontSize:12, color:C.textSub }}>{unreadCount > 0 ? `${unreadCount} unread` : "Ask a question"}</span></span>
          </button>
          <button type="button" className="t-quick"
            onClick={async () => {
              if (tenant?.lease_document_url) {
                const signed = await getSignedStorageUrl("lease-documents", tenant.lease_document_url);
                if (signed) { window.open(signed, "_blank"); } else { navigate("/account"); }
              } else { navigate("/account"); }
            }}>
            <span aria-hidden="true" style={{ width:32, height:32, borderRadius:8, background:C.goldBg, border:`1px solid ${C.goldDim}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:C.gold, fontWeight:600 }}>§</span>
            <span><span style={{ display:"block", fontSize:14, fontWeight:600 }}>Lease &amp; documents</span><span style={{ display:"block", fontSize:12, color:C.textSub }}>{tenant?.lease_document_url ? "Open your lease" : `Lease ends ${fmtDate(tenant?.leaseEnd)}`}</span></span>
          </button>
        </div>

        <div className="home-grid">
          {/* Maintenance */}
          <Card style={{ overflow:"hidden", padding:0 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 8px 6px 16px", borderBottom:`1px solid ${C.border}` }}>
              <h2 style={{ fontSize:14, fontWeight:600, margin:0 }}>Maintenance {openMaintenance.length > 0 && <span style={{ fontSize:12, fontWeight:500, color:C.amber }}>· {openMaintenance.length} open</span>}</h2>
              <button type="button" className="t-link" onClick={() => navigate("/maintenance")}>See all →</button>
            </div>
            {maintenance.length === 0 ? (
              <div style={{ padding:"14px 16px", color:C.textSub, fontSize:13 }}>No requests. Use “Report an issue” if something needs fixing.</div>
            ) : maintenance.slice(0,3).map((m) => (
              <button type="button" key={m.id} className="t-row" onClick={() => navigate(`/maintenance/${m.id}`)}>
                <span style={{ minWidth:0 }}>
                  <span style={{ display:"block", fontSize:14, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.title}</span>
                  <span style={{ display:"block", fontSize:12, color:C.textSub, marginTop:1 }}>{new Date(m.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                </span>
                <StatusBadge status={m.status} />
              </button>
            ))}
          </Card>

          {/* Messages */}
          <Card style={{ overflow:"hidden", padding:0 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 8px 6px 16px", borderBottom:`1px solid ${C.border}` }}>
              <h2 style={{ fontSize:14, fontWeight:600, margin:0 }}>Messages {unreadCount > 0 && <span style={{ fontSize:12, fontWeight:600, color:C.blue }}>· {unreadCount} unread</span>}</h2>
              <button type="button" className="t-link" onClick={() => navigate("/messages")}>Open →</button>
            </div>
            {msgsLoading ? (
              <div style={{ padding:"14px 16px", color:C.textSub, fontSize:13 }}>Loading…</div>
            ) : messages.length === 0 ? (
              <div style={{ padding:"14px 16px", color:C.textSub, fontSize:13 }}>No messages yet.</div>
            ) : (
              <button type="button" className="t-row" onClick={() => navigate("/messages")}>
                <span style={{ minWidth:0, flex:1 }}>
                  <span style={{ display:"block", fontSize:13, fontWeight:600, marginBottom:2 }}>Modus Property Management</span>
                  <span style={{ display:"block", fontSize:13, color:C.textSub, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{messages[0]?.body}</span>
                </span>
                <span style={{ fontSize:12, color:C.textSub, flexShrink:0 }}>{new Date(messages[0]?.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
              </button>
            )}
          </Card>

          {/* Lease */}
          <Card style={{ padding:"14px 16px" }}>
            <h2 style={{ fontSize:14, fontWeight:600, margin:"0 0 4px" }}>Lease</h2>
            {[
              ["Unit",        `Unit ${tenant?.unit||"—"} · ${tenant?.property||"—"}`],
              ["Lease Start", fmtDate(tenant?.leaseStart)],
              ["Lease End",   fmtDate(tenant?.leaseEnd)],
              ["Base rent on file", baseRent != null ? fmt(baseRent) : "—"],
            ].map(([k, v], i, arr) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", gap:12, padding:"8px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <span style={{ fontSize:13, color:C.textSub }}>{k}</span>
                <span style={{ fontSize:13, fontWeight: k === "Base rent on file" ? 600 : 500, color:C.text, fontFamily: k === "Base rent on file" ? "var(--m-font)" : "inherit", textAlign:"right" }}>{v}</span>
              </div>
            ))}
          </Card>

          {/* Scheduled monthly charges: what is billed each month, never the balance */}
          <Card style={{ padding:"14px 16px" }}>
            <Label>Monthly Recurring Charges</Label>
            <div style={{ fontSize:12, color:C.textSub, marginBottom:4 }}>Scheduled each month. This is not your balance due.</div>
            {monthly.hasCharges ? (
              <>
                {monthly.items.map((c, i, arr) => (
                  <div key={c.id || `charge-${i}`} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, padding:"8px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500, color:C.text }}>{c.label}</div>
                      {(() => {
                        // The Rent row's name already says "Rent"; other rows are marked as additional charges.
                        const sub = [c.isRent ? null : "Additional recurring charge", c.note || null].filter(Boolean).join(" · ");
                        return sub ? <div style={{ fontSize:12, color:C.textSub, marginTop:1 }}>{sub}</div> : null;
                      })()}
                    </div>
                    <div style={{ fontFamily:"var(--m-font)", fontVariantNumeric:"tabular-nums", fontSize:14, fontWeight:500, color:C.text }}>{c.cents == null ? "—" : formatCents(c.cents)}</div>
                  </div>
                ))}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:8, marginTop:2, borderTop:`1px solid ${C.border}` }}>
                  <span style={{ fontSize:12, color:C.textSub, fontWeight:600 }}>Total monthly charges</span>
                  <span style={{ fontFamily:"var(--m-font)", fontVariantNumeric:"tabular-nums", fontSize:14, fontWeight:600, color:C.text }}>{formatCents(monthly.totalCents)}</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize:13, color:C.textSub, padding:"6px 0" }}>
                No recurring charges are set up on your account. Contact management with any billing questions.
              </div>
            )}
          </Card>
        </div>
      </div>
    </TenantLayout>
  );
}
