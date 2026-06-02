import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";

// ─── Design Tokens ─────────────────────────────────────────────────────────
const C = {
  bg:       "#0A0B0D",   // page background
  surface:  "#111316",   // card surface
  raised:   "#181C21",   // table header / raised elements
  border:   "#252930",   // all borders — one value, no confusion
  text:     "#EDEAE2",   // primary text — warm white, fully legible
  textSub:  "#9095A0",   // secondary text — readable on dark
  textMuted:"#5C6270",   // timestamps, minor labels
  gold:     "#C9A96E",   // brand accent
  goldDim:  "#7A5C2E",   // dimmed gold for links/borders
  blue:     "#4A9AE8",   // collected
  red:      "#E05555",   // outstanding
  green:    "#72B02A",   // occupancy
  amber:    "#F0A430",   // maintenance
};

const STATUS = {
  paid:    { label: "Paid",    color: "#72B02A", bg: "rgba(114,176,42,0.13)" },
  pending: { label: "Pending", color: "#F0A430", bg: "rgba(240,164,48,0.13)" },
  late:    { label: "Late",    color: "#E05555", bg: "rgba(224,85,85,0.13)" },
  failed:  { label: "Failed",  color: "#E05555", bg: "rgba(224,85,85,0.13)" },
  vacant:  { label: "Vacant",  color: "#5C6270", bg: "rgba(92,98,112,0.15)" },
};

const PRIORITY = {
  low:    { label: "Low",    color: "#72B02A", bg: "rgba(114,176,42,0.13)" },
  normal: { label: "Normal", color: "#4A9AE8", bg: "rgba(74,154,232,0.13)" },
  high:   { label: "High",   color: "#E05555", bg: "rgba(224,85,85,0.13)" },
  urgent: { label: "Urgent", color: "#E05555", bg: "rgba(224,85,85,0.18)" },
};

const PROP_COLORS = [C.gold, C.blue, C.green, C.amber, C.red];

function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

// ─── M Mark ───────────────────────────────────────────────────────────────
function ModusMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M6 33V10L20 27L34 10V33" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 10L20 27L34 10" stroke={C.goldDim} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Badge ─────────────────────────────────────────────────────────────────
function Badge({ status, type = "status" }) {
  const cfg = type === "status" ? STATUS[status] : PRIORITY[status];
  if (!cfg) return null;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 5,
      background: cfg.bg, color: cfg.color, whiteSpace: "nowrap", letterSpacing: "0.02em",
    }}>{cfg.label}</span>
  );
}

// ─── Card shell ────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, overflow: "hidden", ...style,
    }}>{children}</div>
  );
}

// ─── Card header ───────────────────────────────────────────────────────────
function CardHeader({ title, sub, action, onAction }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 18px", borderBottom: `1px solid ${C.border}`,
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, letterSpacing: "0.01em" }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: C.textSub, marginTop: 3 }}>{sub}</div>}
      </div>
      {action && (
        <button onClick={onAction} style={{
          fontSize: 12, color: C.goldDim, background: "none", border: "none",
          cursor: "pointer", fontFamily: "'DM Sans', sans-serif", padding: 0, transition: "color 0.15s",
        }}
          onMouseOver={e => e.currentTarget.style.color = C.gold}
          onMouseOut={e => e.currentTarget.style.color = C.goldDim}
        >{action}</button>
      )}
    </div>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: "18px 20px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: C.textSub, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>
        {label}
      </div>
      <div style={{
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: 32, fontWeight: 600, color: accent,
        lineHeight: 1, marginBottom: 6,
      }}>{value}</div>
      <div style={{ fontSize: 12, color: C.textSub }}>{sub}</div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function LandlordDashboard() {
  const navigate  = useNavigate();
  const width     = useWindowWidth();
  const isMobile  = width < 768;

  const [rentFilter, setRentFilter]   = useState("all");
  const [properties, setProperties]   = useState([]);
  const [units, setUnits]             = useState([]);
  const [tenants, setTenants]         = useState([]);
  const [payments, setPayments]       = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [
      { data: props },
      { data: units },
      { data: tenants },
      { data: payments },
      { data: maint },
    ] = await Promise.all([
      supabase.from("properties").select("*"),
      supabase.from("units").select("*"),
      supabase.from("tenants").select("*"),
      supabase.from("payments").select("*, tenants(name), units(unit_number, properties(name))").order("created_at", { ascending: false }),
      supabase.from("maintenance_requests").select("*, units(unit_number, properties(name)), tenants(name)").neq("status", "resolved").order("created_at", { ascending: false }),
    ]);
    setProperties(props || []);
    setUnits(units || []);
    setTenants(tenants || []);
    setPayments(payments || []);
    setMaintenance(maint || []);
    setLoading(false);
  }

  const now            = new Date();
  const totalUnits     = units.length;
  const occupiedUnits  = tenants.length;
  const occupancyRate  = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

  const thisMonth      = payments.filter(p => {
    const d = new Date(p.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const collected      = (thisMonth.filter(p => p.status === "paid").reduce((s, p) => s + (p.amount_cents || 0), 0) / 100).toLocaleString("en-US");
  const expected       = (units.reduce((s, u) => s + ((u.rent_amount || 0) * 100), 0) / 100).toLocaleString("en-US");
  const openMaint      = maintenance.filter(m => m.status !== "resolved");

  const rentRollRows   = units.map(unit => {
    const tenant   = tenants.find(t => t.unit_id === unit.id);
    const property = properties.find(p => p.id === unit.property_id);
    if (!tenant) return { unit: unit.unit_number, property: property?.name || "—", tenant: "—", rent: unit.rent_amount || 0, status: "vacant" };
    const pay = payments.find(p => p.unit_id === unit.id);
    const status = pay?.status === "paid" ? "paid" : pay?.status === "failed" ? "late" : "pending";
    return { unit: unit.unit_number, property: property?.name || "—", tenant: tenant.name, rent: unit.rent_amount || 0, status };
  });

  const filteredRoll   = rentFilter === "all" ? rentRollRows : rentRollRows.filter(r => r.status === rentFilter);
  const recentActivity = payments.slice(0, 4).map(p => ({
    paid: p.status === "paid",
    text: `${p.tenants?.name || "Tenant"} ${p.status === "paid" ? "paid" : "payment failed"} $${((p.amount_cents || 0) / 100).toLocaleString()} — Unit ${p.units?.unit_number || ""} · ${p.units?.properties?.name || ""}`,
    time: new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  const stats = [
    { label: "Collected · " + now.toLocaleDateString("en-US", { month: "short" }), value: loading ? "—" : `$${collected}`, sub: `of $${expected} expected`, accent: C.blue },
    { label: "Outstanding",      value: loading ? "—" : String(rentRollRows.filter(r => r.status === "pending" || r.status === "late").length), sub: "tenants pending or late", accent: C.red },
    { label: "Occupancy",        value: loading ? "—" : `${occupancyRate}%`, sub: `${occupiedUnits} of ${totalUnits} units`, accent: C.green },
    { label: "Open Maintenance", value: loading ? "—" : String(openMaint.length), sub: "active requests", accent: C.amber },
  ];

  return (
    <LandlordLayout openMaintenance={openMaint.length} unreadMessages={0}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        .m-action:hover  { color: ${C.gold} !important; }
        .m-row:hover td  { background: ${C.raised} !important; }
        .m-addbtn:hover  { background: rgba(201,169,110,0.06) !important; }
        .m-prop:hover    { border-color: #353A44 !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #2A2D35; border-radius: 2px; }
      `}</style>

      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ padding: isMobile ? "20px 16px" : "32px 32px 48px" }}>

          {/* ── Greeting ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isMobile ? 24 : 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <ModusMark size={isMobile ? 28 : 36} />
              <div>
                <div style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: isMobile ? 22 : 26, fontWeight: 600,
                  color: C.text, letterSpacing: "0.01em", lineHeight: 1.2,
                }}>Good morning, Andrew</div>
                <div style={{ fontSize: 13, color: C.textSub, marginTop: 4, letterSpacing: "0.02em" }}>
                  {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </div>
              </div>
            </div>
            {!isMobile && (
              <button className="m-addbtn" onClick={() => navigate("/landlord/tenants")} style={{
                background: "transparent", border: `1px solid ${C.goldDim}`,
                color: C.gold, fontSize: 13, fontWeight: 500,
                padding: "9px 20px", borderRadius: 7, cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.04em", transition: "background 0.15s",
              }}>+ Add Tenant</button>
            )}
          </div>

          {/* ── KPI Cards ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)",
            gap: 12, marginBottom: 28,
          }}>
            {stats.map((s, i) => <StatCard key={i} {...s} />)}
          </div>

          {/* ── Properties ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.textSub, letterSpacing: "0.08em", textTransform: "uppercase" }}>Properties</span>
            <button className="m-action" onClick={() => navigate("/landlord/properties")} style={{
              fontSize: 13, color: C.goldDim, background: "none", border: "none",
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "color 0.15s",
            }}>+ Add property</button>
          </div>

          {loading ? (
            <div style={{ color: C.textSub, fontSize: 13, marginBottom: 28 }}>Loading…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 12, marginBottom: 28 }}>
              {properties.map((prop, i) => {
                const propUnits    = units.filter(u => u.property_id === prop.id);
                const propTenants  = tenants.filter(t => propUnits.some(u => u.id === t.unit_id));
                const occ          = propTenants.length;
                const total        = propUnits.length;
                const pct          = total > 0 ? Math.round((occ / total) * 100) : 0;
                const color        = PROP_COLORS[i % PROP_COLORS.length];
                const propPaid     = payments.filter(p => propUnits.some(u => u.id === p.unit_id) && p.status === "paid");
                const propTotal    = (propPaid.reduce((s, p) => s + (p.amount_cents || 0), 0) / 100).toLocaleString();
                return (
                  <div key={prop.id} className="m-prop" style={{
                    background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 10, padding: "18px 18px 16px", transition: "border-color 0.15s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{prop.name}</div>
                        <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{prop.address}, {prop.city} {prop.state}</div>
                      </div>
                    </div>
                    <div style={{ height: 2, background: C.raised, borderRadius: 1, overflow: "hidden", marginBottom: 6 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 1 }} />
                    </div>
                    <div style={{ fontSize: 12, color: C.textSub, marginBottom: 12 }}>{occ}/{total} units · {pct}% occupied</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div style={{ background: C.raised, borderRadius: 7, padding: "10px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color }}>${propTotal}</div>
                        <div style={{ fontSize: 11, color: C.textSub, marginTop: 3 }}>Collected</div>
                      </div>
                      <div style={{ background: C.raised, borderRadius: 7, padding: "10px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{total}</div>
                        <div style={{ fontSize: 11, color: C.textSub, marginTop: 3 }}>Total units</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {properties.length === 0 && (
                <div style={{ color: C.textSub, fontSize: 13, padding: 24, textAlign: "center" }}>No properties yet.</div>
              )}
              <div onClick={() => navigate("/landlord/properties")} style={{
                background: "transparent", border: `1px dashed ${C.border}`,
                borderRadius: 10, minHeight: 130,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
              }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, color: C.goldDim, marginBottom: 6 }}>+</div>
                  <div style={{ fontSize: 12, color: C.textSub, letterSpacing: "0.06em" }}>Add property</div>
                </div>
              </div>
            </div>
          )}

          {/* ── Rent Roll + Right column ── */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>

            {/* Rent Roll */}
            <Card>
              <CardHeader
                title={`Rent Roll — ${now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`}
                sub={`${rentRollRows.filter(r => r.status === "paid").length} paid · ${rentRollRows.filter(r => r.status === "pending" || r.status === "late").length} outstanding`}
                action="View all"
                onAction={() => navigate("/landlord/rentroll")}
              />
              {/* Filter pills */}
              <div style={{ display: "flex", gap: 6, padding: "10px 16px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
                {["all","paid","pending","late","vacant"].map(f => (
                  <button key={f} onClick={() => setRentFilter(f)} style={{
                    padding: "4px 12px", borderRadius: 5, fontSize: 12, fontWeight: 500,
                    background: rentFilter === f ? C.goldDim : "transparent",
                    color: rentFilter === f ? C.text : C.textSub,
                    border: `1px solid ${rentFilter === f ? C.goldDim : C.border}`,
                    cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                    textTransform: "capitalize", transition: "all 0.12s",
                  }}>{f}</button>
                ))}
              </div>
              <div style={{ overflowY: "auto", maxHeight: 340 }}>
                {loading ? (
                  <div style={{ padding: 24, color: C.textSub, fontSize: 13, textAlign: "center" }}>Loading…</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Unit", "Tenant", ...(!isMobile ? ["Rent"] : []), "Status"].map(h => (
                          <th key={h} style={{
                            fontSize: 11, fontWeight: 600, color: C.textSub,
                            textTransform: "uppercase", letterSpacing: "0.08em",
                            padding: "10px 16px", textAlign: h === "Rent" ? "right" : "left",
                            borderBottom: `1px solid ${C.border}`, background: C.raised,
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRoll.length === 0 && (
                        <tr><td colSpan={4} style={{ padding: 24, color: C.textSub, fontSize: 13, textAlign: "center" }}>No records.</td></tr>
                      )}
                      {filteredRoll.map((row, i) => (
                        <tr key={i} className="m-row">
                          <td style={{ fontSize: 13, color: C.text, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
                            <div style={{ fontWeight: 600 }}>{row.unit}</div>
                            <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{row.property}</div>
                          </td>
                          <td style={{ fontSize: 13, color: C.textSub, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>{row.tenant}</td>
                          {!isMobile && (
                            <td style={{ fontSize: 13, color: C.text, padding: "12px 16px", borderBottom: `1px solid ${C.border}`, textAlign: "right", fontWeight: 600 }}>
                              ${(row.rent || 0).toLocaleString()}
                            </td>
                          )}
                          <td style={{ fontSize: 13, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
                            <Badge status={row.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>

            {/* Right column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Maintenance */}
              <Card>
                <CardHeader
                  title="Maintenance Queue"
                  sub={`${openMaint.length} open request${openMaint.length !== 1 ? "s" : ""}`}
                  action="View all"
                  onAction={() => navigate("/landlord/maintenance")}
                />
                {loading && <div style={{ padding: 18, color: C.textSub, fontSize: 13 }}>Loading…</div>}
                {!loading && openMaint.length === 0 && (
                  <div style={{ padding: 24, color: C.textSub, fontSize: 13, textAlign: "center" }}>No open requests</div>
                )}
                {!loading && openMaint.slice(0, 5).map((m, i, arr) => (
                  <div key={m.id} style={{
                    padding: "13px 18px",
                    borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none",
                    display: "flex", alignItems: "flex-start", gap: 12,
                  }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: "50%", marginTop: 5, flexShrink: 0,
                      background: PRIORITY[m.priority]?.color || C.textSub,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 3 }}>{m.title}</div>
                      <div style={{ fontSize: 12, color: C.textSub }}>
                        {m.units?.properties?.name || "—"} · Unit {m.units?.unit_number || "—"} · {m.tenants?.name || "Unknown"}
                      </div>
                    </div>
                    <Badge status={m.priority} type="priority" />
                  </div>
                ))}
              </Card>

              {/* Activity */}
              <Card>
                <CardHeader title="Recent Activity" />
                {loading && <div style={{ padding: 18, color: C.textSub, fontSize: 13 }}>Loading…</div>}
                {!loading && recentActivity.length === 0 && (
                  <div style={{ padding: 24, color: C.textSub, fontSize: 13, textAlign: "center" }}>No recent activity.</div>
                )}
                {!loading && recentActivity.map((a, i, arr) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 18px",
                    borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none",
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                      background: a.paid ? "rgba(114,176,42,0.13)" : "rgba(224,85,85,0.13)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
                    }}>{a.paid ? "💰" : "⚠️"}</div>
                    <div>
                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{a.text}</div>
                      <div style={{ fontSize: 11, color: C.textSub, marginTop: 3 }}>{a.time}</div>
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          </div>
        </div>
      </div>
    </LandlordLayout>
  );
}