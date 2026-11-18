import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import { TICKET_COLUMNS } from "./lib/maintenanceColumns";
import LandlordLayout from "./LandlordLayout";
import { paymentCents } from "./lib/accounting";
import { fetchLandlordBalances, rentStanding, STANDING } from "./lib/tenantFinancials";
import { usePropertyScope, useScopedLoad, ALL } from "./lib/propertyScope";
import { buildAttention } from "./lib/attention";
import { DARK as C } from "./lib/tokens";
import { PrimaryBtn } from "./ui/Button";

const TONE = { red: C.red, green: C.green, muted: C.textSub };
const SEVERITY = [
  { label: "Urgent",   color: C.red,   bg: "rgba(240,112,112,0.12)" },
  { label: "Decision", color: C.action, bg: "rgba(227,154,53,0.12)" },
  { label: "Follow up", color: C.blue, bg: "rgba(106,174,240,0.12)" },
];

// Everything on this page for one scope (ALL or a property id). Each query names the property explicitly; RLS still
// decides what the signed-in landlord may read.
async function loadDashboard(propertyId) {
  const scoped = propertyId !== ALL;
  const q = {
    properties: supabase.from("properties").select("id, name, address, city, state"),
    units:      supabase.from("units").select("id, property_id, unit_number, rent_amount"),
    tenants:    supabase.from("tenants").select(`id, name, unit_id, lease_start, lease_end, lease_end_action, insurance_expires, invite_sent_at, user_id, archived, units${scoped ? "!inner" : ""}(unit_number, property_id)`),
    payments:   supabase.from("payments").select(`id, amount_cents, amount, status, paid_at, created_at, voided_at, unit_id, units${scoped ? "!inner" : ""}(property_id)`).is("voided_at", null).gte("created_at", new Date(Date.now() - 62 * 864e5).toISOString()),
    tickets:    supabase.from("maintenance_requests").select(`${TICKET_COLUMNS}, units${scoped ? "!inner" : ""}(unit_number, property_id, properties(name))`).neq("status", "resolved").order("created_at", { ascending: false }),
    incidents:  supabase.from("incident_logs").select("id, category, status, created_at, property_id, details_json, properties(name), tenants(name)").neq("status", "resolved").order("created_at", { ascending: false }).limit(50),
  };
  if (scoped) {
    q.properties = q.properties.eq("id", propertyId);
    q.units      = q.units.eq("property_id", propertyId);
    q.tenants    = q.tenants.eq("units.property_id", propertyId);
    q.payments   = q.payments.eq("units.property_id", propertyId);
    q.tickets    = q.tickets.eq("units.property_id", propertyId);
    q.incidents  = q.incidents.eq("property_id", propertyId);
  }
  const keys = Object.keys(q);
  const results = await Promise.all(keys.map((k) => q[k]));
  const out = {};
  keys.forEach((k, i) => { out[k] = results[i].data || []; out[`${k}Error`] = results[i].error?.message || null; });
  out.tenants = out.tenants.filter((t) => !t.archived);   // archived (past) tenants no longer occupy a unit (archived may be NULL)
  out.balances = await fetchLandlordBalances(supabase);
  return out;
}

function Section({ title, sub, action, children }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontFamily: "var(--m-font)", fontSize:"var(--m-fs-section)", fontWeight: 600, color: C.text, margin: 0 }}>{title}</h2>
          {sub && <div style={{ fontSize: 13, color: C.textMuted, marginTop: 3 }}>{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, sub, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} type={onClick ? "button" : undefined} className={onClick ? "d-stat d-stat-link" : "d-stat"}>
      <div style={{ fontSize: 13, color: C.textSub }}>{label}</div>
      <div style={{ fontFamily: "var(--m-font)", fontSize: 20, fontWeight: 600, color: C.text, lineHeight: 1.2, margin: "6px 0 2px", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 12, color: C.textMuted }}>{sub}</div>
    </Tag>
  );
}

function AttentionRow({ a, onGo }) {
  const sev = SEVERITY[a.severity];
  const quiet = a.severity >= 2;
  return (
    <div className={`d-att${a.severity === 0 ? " d-att-urgent" : ""}`}>
      <span className="d-sev" style={{ color: sev.color }}><i style={{ background: sev.color }}/>{sev.label}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: C.text, overflowWrap: "anywhere" }}>{a.title}</div>
        <div style={{ fontSize: 13, color: C.textSub, marginTop: 3, overflowWrap: "anywhere" }}>{a.detail}</div>
      </div>
      <button type="button" onClick={() => onGo(a.action.to)} className={`m-btn m-btn-ghost m-btn-small${quiet ? " d-quiet" : ""}`}>{a.action.label}</button>
    </div>
  );
}

export default function LandlordDashboard() {
  const navigate = useNavigate();
  const { selectedPropertyId, selectedName, isAll } = usePropertyScope();
  const { data, loading, error, reload } = useScopedLoad("dashboard", loadDashboard);
  const [landlordName, setLandlordName] = useState("");
  // "Show all" belongs to the scope it was opened in; a new scope starts with the short list again.
  const [showAllFor, setShowAllFor] = useState(null);
  const showAllAttention = showAllFor === selectedPropertyId;
  const setShowAllAttention = (fn) => setShowAllFor(fn(showAllAttention) ? selectedPropertyId : null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.full_name) setLandlordName(user.user_metadata.full_name);
    });
  }, []);

  const d = data || { properties: [], units: [], tenants: [], payments: [], tickets: [], incidents: [], balances: { mode: "loading", byTenant: new Map() } };
  const now = new Date();
  const attention = loading && !data ? [] : buildAttention({ tickets: d.tickets, incidents: d.incidents, tenants: d.tenants, balances: d.balances, now });
  const shown = showAllAttention ? attention : attention.slice(0, 6);

  const occupied = new Set(d.tenants.filter((t) => t.unit_id).map((t) => t.unit_id));
  const totalUnits = d.units.length;
  const occupiedUnits = d.units.filter((u) => occupied.has(u.id)).length;
  const monthPaid = d.payments.filter((p) => {
    if (p.status !== "paid") return false;
    const dt = new Date(p.paid_at || p.created_at);
    return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
  });
  const collectedCents = monthPaid.reduce((s, p) => s + paymentCents(p), 0);
  const expectedCents = d.units.filter((u) => occupied.has(u.id)).reduce((s, u) => s + Math.round((Number(u.rent_amount) || 0) * 100), 0);
  const activeMaint = d.tickets.length;
  const urgentMaint = d.tickets.filter((t) => t.is_emergency || t.priority === "urgent").length;
  const leasesSoon = d.tenants.filter((t) => { if (!t.lease_end) return false; const days = (new Date(`${t.lease_end}T12:00:00`) - now) / 864e5; return days >= 0 && days <= 60; }).length;
  const ledger = d.balances?.mode === "ledger";
  const owing = ledger ? d.tenants.filter((t) => rentStanding(t, d.balances).status === "owes").length : null;
  const usd = (c) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  const rentRoll = d.units.map((u) => {
    const tenant = d.tenants.find((t) => t.unit_id === u.id);
    const property = d.properties.find((p) => p.id === u.property_id);
    const standing = rentStanding(tenant, d.balances);
    return { id: u.id, unit: u.unit_number, property: property?.name || "", tenant, rent: Number(u.rent_amount) || 0, standing };
  }).sort((a, b) => String(a.unit).localeCompare(String(b.unit), undefined, { numeric: true }));

  const hour = now.getHours();
  const greeting = `Good ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}${landlordName ? `, ${landlordName.split(" ")[0]}` : ""}`;

  const top = shown[0];
  const rest = shown.slice(1);
  const decisions = rest.filter((a) => a.severity < 2);
  const followUps = rest.filter((a) => a.severity >= 2);
  const onlyFollowUps = top && top.severity >= 2;


  return (
    <LandlordLayout openMaintenance={activeMaint} unreadMessages={0}>
      <style>{`
        .d-card{background:${C.surface};border-radius:14px;overflow:hidden;}
        .d-next{position:relative;background:${C.surface};border-radius:16px;padding:24px 24px 24px 28px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px 24px;align-items:center;}
        .d-next::before{content:"";position:absolute;left:0;top:18px;bottom:18px;width:3px;border-radius:0 3px 3px 0;}
        .d-next-urgent::before{background:${C.red};} .d-next-decision::before{background:${C.action};} .d-next-follow::before{background:${C.blue};}
        .d-next .m-btn{min-height:44px;padding:0 22px;font-size:14px;}
        .d-sev{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:500;white-space:nowrap;}
        .d-sev i{width:7px;height:7px;border-radius:50%;display:inline-block;}
        .d-att{display:grid;grid-template-columns:92px minmax(0,1fr) auto;align-items:center;gap:16px;padding:16px 20px;border-top:1px solid ${C.border};}
        .d-att:first-child{border-top:none;}
        .d-att-urgent{box-shadow:inset 3px 0 0 ${C.red};}
        .d-quiet{color:${C.textSub}!important;border-color:transparent!important;}
        .d-quiet:hover{color:${C.text}!important;background:rgba(255,255,255,0.04)!important;}
        .d-group{font-size:13px;font-weight:500;color:${C.textSub};margin:22px 0 10px;}
        .d-stat{display:block;width:100%;text-align:left;background:${C.surface};border:none;border-radius:12px;padding:14px 16px;font:inherit;color:inherit;}
        .d-stat-link{cursor:pointer;} .d-stat-link:hover{background:${C.raised};}
        .d-roll{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:16px;align-items:center;padding:13px 20px;border-top:1px solid ${C.border};}
        .d-roll:first-child{border-top:none;}
        @media (max-width:720px){
          .d-next{grid-template-columns:1fr;padding:20px 18px 20px 22px;}
          .d-next .m-btn{width:100%;}
          .d-att{grid-template-columns:1fr;gap:8px;padding:16px;}
          .d-att .m-btn{justify-self:start;}
          .d-roll{grid-template-columns:minmax(0,1fr) auto;padding:13px 16px;}
          .d-roll-rent{display:none;}
        }
      `}</style>

      <div className="m-page" style={{ color: C.text, maxWidth: 1120 }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: "var(--m-font)", fontSize: "var(--m-fs-title)", fontWeight: 600, margin: 0, lineHeight: 1.2 }}>{greeting}</h1>
          <div style={{ fontSize: 13, color: C.textMuted, marginTop: 6 }}>
            {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {selectedName}
          </div>
        </div>

        {error && (
          <div role="alert" style={{ background: "rgba(240,112,112,0.1)", border: "1px solid rgba(240,112,112,0.35)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: C.red, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            The dashboard couldn't load: {error}
            <button type="button" onClick={reload} className="m-btn m-btn-ghost m-btn-small" style={{ color: C.red, borderColor: "rgba(240,112,112,0.4)" }}>Retry</button>
          </div>
        )}

        {/* 1. Needs attention: the most important item first, then decisions, then quieter follow-ups */}
        <Section title="Needs attention"
          sub={loading && !data ? "Checking maintenance, owner-action items and leases…" : attention.length ? `${attention.length} item${attention.length === 1 ? "" : "s"} waiting on you` : null}>
          {loading && !data && <div className="d-card" style={{ padding: 20, fontSize: 13, color: C.textSub }}>Loading…</div>}
          {!loading && attention.length === 0 && (
            <div className="d-card" style={{ padding: "20px", display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: C.textSub }}>
              <span aria-hidden="true" style={{ color: C.green, fontSize: 16 }}>✓</span>
              You're all caught up{isAll ? "" : " for this property"}. No urgent maintenance, approvals or lease deadlines.
            </div>
          )}
          {top && (
            <div className={`d-next ${top.severity === 0 ? "d-next-urgent" : top.severity === 1 ? "d-next-decision" : "d-next-follow"}`}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>
                  Next up · <span style={{ color: SEVERITY[top.severity].color }}>{SEVERITY[top.severity].label}</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: C.text, lineHeight: 1.35, overflowWrap: "anywhere" }}>{top.title}</div>
                <div style={{ fontSize: 14, color: C.textSub, marginTop: 4, overflowWrap: "anywhere" }}>{top.detail}</div>
              </div>
              <PrimaryBtn onClick={() => navigate(top.action.to)}>{top.action.label}</PrimaryBtn>
            </div>
          )}
          {decisions.length > 0 && (
            <>
              <div className="d-group">Also waiting on you</div>
              <div className="d-card">{decisions.map((a) => <AttentionRow key={a.id} a={a} onGo={navigate}/>)}</div>
            </>
          )}
          {followUps.length > 0 && (
            <>
              <div className="d-group">{onlyFollowUps && !decisions.length ? "More follow-ups" : "Follow-ups"}</div>
              <div className="d-card">{followUps.map((a) => <AttentionRow key={a.id} a={a} onGo={navigate}/>)}</div>
            </>
          )}
          {attention.length > 6 && (
            <button type="button" onClick={() => setShowAllAttention((v) => !v)} className="m-btn m-btn-ghost" style={{ marginTop: 12, color: C.action, borderColor: "transparent" }}>
              {showAllAttention ? "Show fewer" : `Show all ${attention.length}`}
            </button>
          )}
        </Section>

        {/* 2. Portfolio snapshot (secondary to the action queue) */}
        <Section title={isAll ? "Portfolio" : selectedName}>
          <div className="m-grid">
            <Stat label="Occupancy" value={loading && !data ? "—" : totalUnits ? `${Math.round((occupiedUnits / totalUnits) * 100)}%` : "—"}
              sub={`${occupiedUnits} of ${totalUnits} units occupied`} onClick={() => navigate("/landlord/tenants")}/>
            <Stat label={`Collected · ${now.toLocaleDateString("en-US", { month: "short" })}`} value={loading && !data ? "—" : usd(collectedCents)}
              sub={expectedCents ? `Recorded · rent on file ${usd(expectedCents)}` : "Recorded payments this month"} onClick={() => navigate("/landlord/financials")}/>
            <Stat label="Active maintenance" value={loading && !data ? "—" : String(activeMaint)}
              sub={urgentMaint ? `${urgentMaint} urgent` : "No urgent tickets"} onClick={() => navigate("/landlord/maintenance")}/>
            {ledger
              ? <Stat label="Balances due" value={String(owing)} sub="Tenants with a ledger balance" onClick={() => navigate("/landlord/financials")}/>
              : <Stat label="Leases ending" value={loading && !data ? "—" : String(leasesSoon)} sub="In the next 60 days" onClick={() => navigate("/landlord/tenants")}/>}
          </div>
        </Section>

        {/* 3. Rent roll (compact) */}
        <Section title="Rent roll" sub={ledger ? "Standing from the receivables ledger" : "Rent balances aren't tracked until receivables are active"}
          action={<button type="button" className="m-btn m-btn-ghost m-btn-small d-quiet" onClick={() => navigate("/landlord/tenants")}>All tenants →</button>}>
          <div className="d-card">
            {loading && !data && <div style={{ padding: 18, fontSize: 13, color: C.textSub }}>Loading…</div>}
            {!loading && rentRoll.length === 0 && <div style={{ padding: 18, fontSize: 13, color: C.textSub }}>No units{isAll ? "" : " for this property"} yet.</div>}
            {rentRoll.slice(0, 8).map((r) => {
              const st = STANDING[r.standing.status] || STANDING.untracked;
              return (
                <div key={r.id} className="d-roll">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflowWrap: "anywhere" }}>
                      Unit {r.unit}{r.tenant ? <span style={{ fontWeight: 400, color: C.textSub }}> · {r.tenant.name}</span> : null}
                    </div>
                    {isAll && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{r.property}</div>}
                  </div>
                  <div className="d-roll-rent" style={{ fontSize: 13, color: C.textSub, fontVariantNumeric: "tabular-nums" }}>{r.rent ? `$${r.rent.toLocaleString("en-US")}/mo` : "—"}</div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: TONE[st.tone] || C.textSub, whiteSpace: "nowrap" }}>{st.label}</span>
                </div>
              );
            })}
            {rentRoll.length > 8 && (
              <button type="button" onClick={() => navigate("/landlord/tenants")} className="m-btn m-btn-ghost d-quiet" style={{ width: "100%", borderRadius: 0, borderTop: `1px solid ${C.border}` }}>
                View all {rentRoll.length} units
              </button>
            )}
          </div>
        </Section>
      </div>
    </LandlordLayout>
  );
}
