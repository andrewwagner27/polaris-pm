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

function Label({ children }) {
  return <div style={{ fontSize:13, fontWeight:500, color:C.textMuted, marginBottom:6 }}>{children}</div>;
}

function StatusBadge({ status }) {
  const map = {
    open:        { label:"Open",        c:"#92400E", bg:"#FFFBEB" },
    in_progress: { label:"In progress", c:"#1E40AF", bg:"#EFF6FF" },
    resolved:    { label:"Resolved",    c:"#166534", bg:"#F0FDF4" },
  };
  const s = map[status] || map.open;
  return <span style={{ fontSize:12,fontWeight:500,padding:"4px 10px",borderRadius:999,background:s.bg,color:s.c,whiteSpace:"nowrap" }}>{s.label}</span>;
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
  const [rentPaymentRead, setRentPaymentRead] = useState(null);

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

  const due = rentPaymentRead?.tenantId === tenant?.id ? rentPaymentRead?.data : null;
  const onlinePay = !!due?.ledger_active && due.online_available !== false;
  const payableCents = Number(due?.payable_cents) || 0;
  const pendingCents = due?.ledger_active ? Number(due.pending_cents) || 0 : 0;
  const bal             = balancePresentation(balance);
  const balanceColor    = bal.tone === "due" ? C.red : bal.tone === "clear" ? C.green : C.textSub;

  async function openLease() {
    if (tenant?.lease_document_url) {
      const signed = await getSignedStorageUrl("lease-documents", tenant.lease_document_url);
      if (signed) { window.open(signed, "_blank"); } else { navigate("/account"); }
    } else { navigate("/account"); }
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
        .t-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px 10px;}
        .t-head h2{font-size:16px;font-weight:600;margin:0;}
        .home-hero{position:relative;overflow:hidden;border-radius:20px;padding:28px;min-height:176px;display:flex;flex-direction:column;justify-content:flex-end;
          background:linear-gradient(155deg,#FCF9F2 0%,#F3ECDD 100%);border:1px solid #E8DFCB;}
        .home-hero-lines{position:absolute;right:-10px;bottom:-12px;width:240px;height:200px;opacity:0.55;pointer-events:none;}
        .home-hero.has-photo{background-size:cover;background-position:center;border:none;}
        .home-hero.has-photo::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 30%,rgba(0,0,0,0.55) 100%);}
        .home-hero.has-photo > *{position:relative;z-index:1;color:#FFFFFF;}
        .home-badge{position:absolute;top:20px;left:28px;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:${C.gold};background:rgba(255,255,255,0.75);border:1px solid #E8DFCB;padding:4px 10px;border-radius:999px;z-index:1;}
        .home-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));align-items:start;}
        @media(max-width:767px){ .home-pad{padding:16px 16px 28px!important;} .home-hero{padding:22px;min-height:160px;} .home-badge{left:22px;top:16px;} }
      `}</style>

      <div className="home-pad t-light" style={{ background:C.bg, minHeight:"100%", color:C.text, fontFamily:"var(--m-font)", padding:"28px 32px 64px", maxWidth:1040, margin:"0 auto" }}>

        <div style={{ fontSize:15, color:C.textSub, marginBottom:14 }}>Good {timeOfDay}, {firstName}</div>

        {/* Home header: complete without a photo; uses the property photo only when one exists */}
        <HomeHeader unit={tenant?.unit} property={tenant?.property} photo={tenant?.propertyPhoto} />

        {showLeaseAlert && (
          <div role="status" style={{ margin:"14px 0 0", padding:"12px 16px", background:C.amberBg, border:"1px solid #F59E0B55", borderRadius:12, fontSize:14, color:C.amber }}>
            Lease expires in {leaseDaysLeft} days. Message management about renewal.
          </div>
        )}

        <Card style={{ padding:"18px 20px", marginTop:16 }}>
          <h2 style={{ fontSize:16, fontWeight:600, margin:"0 0 14px" }}>Rent</h2>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"14px 28px", alignItems:"flex-start" }}>
            <div style={{ flex:"1 1 200px", minWidth:0 }}>
              <Label>Balance Due</Label>
              <div data-balance-state={balance.state} style={{ fontSize: bal.available ? 26 : 15, fontWeight: bal.available ? 600 : 500, color:balanceColor, fontVariantNumeric:"tabular-nums", lineHeight:1.25 }}>{bal.amountText}</div>
              <div role={balance.state === "unavailable" ? "status" : undefined} style={{ fontSize:13, color:C.textMuted, marginTop:4, lineHeight:1.5, maxWidth:420 }}>{bal.detail}</div>
            </div>
            {/* Due date + Pay CTA */}
            <div style={{ minWidth:160 }}>
              <Label>Next Due Date</Label>
              <div style={{ fontSize:15, fontWeight:500, color:C.text }}>{hasRentSchedule ? nextDueStr : "No rent schedule on file"}</div>
              {hasRentSchedule && <div style={{ fontSize:13, color: daysUntilDue <= 3 ? C.amber : C.textMuted, marginTop:2 }}>{daysUntilDue <= 0 ? "Today" : `In ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`}</div>}
            </div>
          </div>
          {pendingCents > 0 && (
            <p role="status" style={{ margin:"12px 0 0", fontSize:14, color:C.blue }}>
              {formatCents(pendingCents)} payment processing
            </p>
          )}
          <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"center", marginTop:16 }}>
            {onlinePay && payableCents > 0 ? (
              <button type="button" className="t-btn" onClick={() => navigate("/pay")}>Pay rent</button>
            ) : (
              <>
                {!onlinePay && <span style={{ fontSize:13, color:C.textSub }}>Online payment isn't available yet.</span>}
                <button type="button" className="t-link" onClick={() => navigate("/pay")}>Payment details</button>
              </>
            )}
          </div>
        </Card>

        <div className="home-grid" style={{ marginTop:20 }}>
          {/* 1. Maintenance */}
          <Card style={{ overflow:"hidden", padding:0 }}>
            <div className="t-head">
              <h2>Maintenance {openMaintenance.length > 0 && <span style={{ fontSize:13, fontWeight:500, color:C.textSub }}>· {openMaintenance.length} open</span>}</h2>
              <button type="button" className="t-link" onClick={() => navigate("/maintenance")}>See all</button>
            </div>
            {maintenance.length === 0 ? (
              <div style={{ padding:"4px 20px 8px", color:C.textSub, fontSize:14 }}>Nothing needs fixing right now.</div>
            ) : maintenance.slice(0,3).map((m) => (
              <button type="button" key={m.id} className="t-row" onClick={() => navigate(`/maintenance/${m.id}`)}>
                <span style={{ minWidth:0 }}>
                  <span style={{ display:"block", fontSize:15, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.title}</span>
                  <span style={{ display:"block", fontSize:13, color:C.textMuted, marginTop:2 }}>{new Date(m.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                </span>
                <StatusBadge status={m.status} />
              </button>
            ))}
            <div style={{ padding:"12px 20px 18px" }}>
              <button type="button" className="t-btn" onClick={() => navigate("/maintenance/new")}>Report an issue</button>
            </div>
          </Card>

          {/* 2. Messages */}
          <Card style={{ overflow:"hidden", padding:0 }}>
            <div className="t-head">
              <h2>Messages {unreadCount > 0 && <span style={{ fontSize:13, fontWeight:500, color:C.blue }}>· {unreadCount} unread</span>}</h2>
              <button type="button" className="t-link" onClick={() => navigate("/messages")}>Open</button>
            </div>
            {msgsLoading ? (
              <div style={{ padding:"4px 20px 18px", color:C.textSub, fontSize:14 }}>Loading…</div>
            ) : messages.length === 0 ? (
              <div style={{ padding:"4px 20px 18px", color:C.textSub, fontSize:14 }}>Questions about your home? Message management any time.</div>
            ) : (
              <button type="button" className="t-row" style={{ paddingBottom:18 }} onClick={() => navigate("/messages")}>
                <span style={{ minWidth:0, flex:1 }}>
                  <span style={{ display:"block", fontSize:14, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{messages[0]?.body}</span>
                  <span style={{ display:"block", fontSize:13, color:C.textMuted, marginTop:2 }}>Modus Property Management · {new Date(messages[0]?.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                </span>
              </button>
            )}
          </Card>

          {/* 3. Lease and documents */}
          <Card style={{ padding:"0 0 18px" }}>
            <div className="t-head"><h2>Lease &amp; documents</h2></div>
            <div style={{ padding:"0 20px" }}>
              {[
                ["Lease Start", fmtDate(tenant?.leaseStart)],
                ["Lease End",   fmtDate(tenant?.leaseEnd)],
                ["Base rent on file", baseRent != null ? fmt(baseRent) : "—"],
              ].map(([k, v]) => (
                <div key={k} style={{ display:"flex", justifyContent:"space-between", gap:12, padding:"9px 0" }}>
                  <span style={{ fontSize:14, color:C.textSub }}>{k === "Lease Start" ? "Lease start" : k === "Lease End" ? "Lease end" : k}</span>
                  <span style={{ fontSize:14, fontWeight:500, color:C.text, fontVariantNumeric:"tabular-nums", textAlign:"right" }}>{v}</span>
                </div>
              ))}
              <button type="button" className="t-btn t-btn-quiet" style={{ marginTop:10 }} onClick={openLease}>
                {tenant?.lease_document_url ? "Open your lease" : "Documents"}
              </button>
            </div>
          </Card>

          <Card style={{ padding:"18px 20px" }}>
            <h2 style={{ fontSize:16, fontWeight:600, margin:"0 0 14px" }}>Monthly Recurring Charges</h2>
            <div>
              <div style={{ fontSize:13, color:C.textMuted, marginBottom:4 }}>Scheduled each month. This is not your balance due.</div>
              {monthly.hasCharges ? (
                <>
                  {monthly.items.map((c, i) => (
                    <div key={c.id || `charge-${i}`} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, padding:"8px 0" }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:500, color:C.text }}>{c.label}</div>
                        {(() => {
                          // The Rent row's name already says "Rent"; other rows are marked as additional charges.
                          const sub = [c.isRent ? null : "Additional recurring charge", c.note || null].filter(Boolean).join(" · ");
                          return sub ? <div style={{ fontSize:13, color:C.textMuted, marginTop:1 }}>{sub}</div> : null;
                        })()}
                      </div>
                      <div style={{ fontVariantNumeric:"tabular-nums", fontSize:14, fontWeight:500, color:C.text }}>{c.cents == null ? "—" : formatCents(c.cents)}</div>
                    </div>
                  ))}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:10, marginTop:2, borderTop:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:13, color:C.textSub, fontWeight:500 }}>Total monthly charges</span>
                    <span style={{ fontVariantNumeric:"tabular-nums", fontSize:15, fontWeight:600, color:C.text }}>{formatCents(monthly.totalCents)}</span>
                  </div>
                </>
              ) : (
                <div style={{ fontSize:14, color:C.textSub, padding:"6px 0" }}>
                  No recurring charges are set up on your account. Contact management with any billing questions.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </TenantLayout>
  );
}

// Architectural header: a line-drawn building on warm ivory with restrained gold, so the card looks finished
// when no property photo exists. A real photo (https) replaces the drawing; if it fails to load, the drawing stays.
function HomeHeader({ unit, property, photo }) {
  // The URL that actually loaded; set only from the image callbacks, so a broken photo never shows.
  const [loadedUrl, setLoadedUrl] = useState(null);
  useEffect(() => {
    if (!photo) return undefined;
    const img = new Image();
    let alive = true;
    img.onload = () => { if (alive) setLoadedUrl(photo); };
    img.src = photo;
    return () => { alive = false; };
  }, [photo]);
  const usePhoto = Boolean(photo) && loadedUrl === photo;
  return (
    <section aria-label="Your home" className={`home-hero${usePhoto ? " has-photo" : ""}`} style={usePhoto ? { backgroundImage:`url("${photo}")` } : undefined}>
      <span className="home-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/></svg>
        Your home
      </span>
      {!usePhoto && (
        <svg className="home-hero-lines" viewBox="0 0 240 200" fill="none" stroke={C.goldDim} strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 200V80l70-50 70 50v120"/>
          <path d="M150 200V110l40-28 40 28v90"/>
          <path d="M60 200v-40h60v40M50 100h20v20H50zM110 100h20v20h-20zM50 140h20v14H50zM110 140h20v14h-20zM180 130h20v18h-20zM180 162h20v18h-20z"/>
          <path d="M90 30v-14M0 200h240"/>
        </svg>
      )}
      <div style={{ fontSize:"var(--m-fs-title)", fontWeight:600, lineHeight:1.15, color: usePhoto ? "#FFFFFF" : C.text }}>Unit {unit || "—"}</div>
      <div style={{ fontSize:15, marginTop:4, color: usePhoto ? "rgba(255,255,255,0.9)" : C.textSub }}>{property || "—"}</div>
    </section>
  );
}
