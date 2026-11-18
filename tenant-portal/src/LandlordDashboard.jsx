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
  { label: "Decision", color: C.amber, bg: "rgba(227,154,53,0.12)" },
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
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: C.text, margin: 0 }}>{title}</h2>
          {sub && <div style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>{sub}</div>}
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
      <div style={{ fontSize: 11, fontWeight: 600, color: C.textSub, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 600, color: C.text, lineHeight: 1.1, margin: "6px 0 2px" }}>{value}</div>
      <div style={{ fontSize: 12, color: C.textSub }}>{sub}</div>
    </Tag>
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

  return (
    <LandlordLayout openMaintenance={activeMaint} unreadMessages={0}>
      <style>{`
        .d-stat{display:block;width:100%;text-align:left;background:${C.surface};border:1px solid ${C.border};border-radius:12px;padding:16px 18px;font:inherit;color:inherit;}
        .d-stat-link{cursor:pointer;} .d-stat-link:hover{border-color:${C.textMuted};}
        .d-att{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid ${C.border};}
        .d-att:last-child{border-bottom:none;}
        .d-roll{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:center;padding:11px 16px;border-bottom:1px solid ${C.border};}
        .d-roll:last-child{border-bottom:none;}
        @media (max-width:720px){
          .d-att{grid-template-columns:1fr;gap:8px;}
          .d-att .m-btn{width:100%;}
          .d-roll{grid-template-columns:minmax(0,1fr) auto;}
          .d-roll-rent{display:none;}
        }
      `}</style>

      <div className="m-page" style={{ color: C.text }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(24px, 4vw, 30px)", fontWeight: 600, margin: 0, lineHeight: 1.15 }}>{greeting}</h1>
          <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>
            {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {selectedName}
          </div>
        </div>

        {error && (
          <div role="alert" style={{ background: "rgba(240,112,112,0.1)", border: "1px solid rgba(240,112,112,0.35)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: C.red, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            The dashboard couldn't load: {error}
            <button type="button" onClick={reload} className="m-btn m-btn-ghost m-btn-small" style={{ color: C.red, borderColor: "rgba(240,112,112,0.4)" }}>Retry</button>
          </div>
        )}

        {/* 1. Needs Attention */}
        <Section title="Needs attention"
          sub={loading && !data ? "Checking maintenance, owner-action items and leases…" : attention.length ? `${attention.length} item${attention.length === 1 ? "" : "s"} waiting on you` : "Nothing is waiting on you right now."}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {loading && !data && <div style={{ padding: 18, fontSize: 13, color: C.textSub }}>Loading…</div>}
            {!loading && attention.length === 0 && (
              <div style={{ padding: "18px 16px", display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: C.textSub }}>
                <span aria-hidden="true" style={{ color: C.green, fontSize: 16 }}>✓</span>
                No urgent maintenance, quotes to approve, owner-action items, or lease deadlines{isAll ? "" : " for this property"}.
              </div>
            )}
            {shown.map((a) => {
              const sev = SEVERITY[a.severity];
              return (
                <div key={a.id} className="d-att">
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, color: sev.color, background: sev.bg, whiteSpace: "nowrap", justifySelf: "start" }}>{sev.label}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflowWrap: "anywhere" }}>{a.title}</div>
                    <div style={{ fontSize: 12, color: C.textSub, marginTop: 2, overflowWrap: "anywhere" }}>{a.detail}</div>
                  </div>
                  <PrimaryBtn small onClick={() => navigate(a.action.to)}>{a.action.label}</PrimaryBtn>
                </div>
              );
            })}
            {attention.length > 6 && (
              <button type="button" onClick={() => setShowAllAttention((v) => !v)} className="m-btn m-btn-ghost" style={{ width: "100%", borderRadius: 0, border: "none", borderTop: `1px solid ${C.border}`, color: C.action }}>
                {showAllAttention ? "Show fewer" : `Show all ${attention.length}`}
              </button>
            )}
          </div>
          {!loading && d.balances?.mode !== "ledger" && (
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>
              Rent balances aren't listed: receivables aren't active, so Modus doesn't know who owes what.
            </div>
          )}
        </Section>

        {/* 2. Portfolio Snapshot */}
        <Section title={isAll ? "Portfolio snapshot" : `${selectedName} snapshot`}>
          <div className="m-grid">
            <Stat label="Occupancy" value={loading && !data ? "—" : totalUnits ? `${Math.round((occupiedUnits / totalUnits) * 100)}%` : "—"}
              sub={`${occupiedUnits} of ${totalUnits} units occupied`} onClick={() => navigate("/landlord/tenants")}/>
            <Stat label={`Collected · ${now.toLocaleDateString("en-US", { month: "short" })}`} value={loading && !data ? "—" : usd(collectedCents)}
              sub={expectedCents ? `Recorded payments · rent on file ${usd(expectedCents)}` : "Recorded payments this month"} onClick={() => navigate("/landlord/financials")}/>
            <Stat label="Active maintenance" value={loading && !data ? "—" : String(activeMaint)}
              sub={urgentMaint ? `${urgentMaint} urgent` : "No urgent tickets"} onClick={() => navigate("/landlord/maintenance")}/>
            {ledger
              ? <Stat label="Balances due" value={String(owing)} sub="Tenants with a ledger balance" onClick={() => navigate("/landlord/financials")}/>
              : <Stat label="Leases ending" value={loading && !data ? "—" : String(leasesSoon)} sub="In the next 60 days" onClick={() => navigate("/landlord/tenants")}/>}
          </div>
        </Section>

        {/* 3. Rent roll (compact) */}
        <Section title="Rent roll" sub={ledger ? "Standing from the receivables ledger" : "Balances aren't tracked until receivables are active"}
          action={<button type="button" className="m-btn m-btn-ghost m-btn-small" onClick={() => navigate("/landlord/tenants")}>All tenants →</button>}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {loading && !data && <div style={{ padding: 18, fontSize: 13, color: C.textSub }}>Loading…</div>}
            {!loading && rentRoll.length === 0 && <div style={{ padding: 18, fontSize: 13, color: C.textSub }}>No units{isAll ? "" : " for this property"} yet.</div>}
            {rentRoll.slice(0, 8).map((r) => {
              const st = STANDING[r.standing.status] || STANDING.untracked;
              return (
                <div key={r.id} className="d-roll">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" }}>
                      Unit {r.unit}{r.tenant ? <span style={{ fontWeight: 400, color: C.textSub }}> · {r.tenant.name}</span> : null}
                    </div>
                    {isAll && <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{r.property}</div>}
                  </div>
                  <div className="d-roll-rent" style={{ fontSize: 13, color: C.text, fontVariantNumeric: "tabular-nums" }}>{r.rent ? `$${r.rent.toLocaleString("en-US")}/mo` : "—"}</div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, color: TONE[st.tone] || C.textSub, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{st.label}</span>
                </div>
              );
            })}
            {rentRoll.length > 8 && (
              <button type="button" onClick={() => navigate("/landlord/tenants")} className="m-btn m-btn-ghost" style={{ width: "100%", borderRadius: 0, border: "none", borderTop: `1px solid ${C.border}` }}>
                View all {rentRoll.length} units
              </button>
            )}
          </div>
        </Section>
      </div>
    </LandlordLayout>
  );
}
