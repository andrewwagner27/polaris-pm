import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";

// ─── Modus Design Tokens ───────────────────────────────────────────────────
const C = {
  bg:      "#0A0B0D",
  bg2:     "#111316",
  bg3:     "#181B1F",
  bg4:     "#1E2227",
  border:  "#2A2D35",
  border2: "#353A44",
  text:    "#F0EEE8",
  text2:   "#8B8F9A",
  text3:   "#5A5E6A",
  gold:    "#C9A96E",
  gold2:   "#8B6A3A",
  blue:    "#378ADD",
  green:   "#639922",
  red:     "#E24B4A",
  amber:   "#EF9F27",
};

const STATUS_CONFIG = {
  paid:    { label: "Paid",    color: "#8fc04a", bg: "rgba(99,153,34,0.15)" },
  pending: { label: "Pending", color: C.amber,   bg: "rgba(239,159,39,0.15)" },
  late:    { label: "Late",    color: C.red,     bg: "rgba(226,75,74,0.15)" },
  failed:  { label: "Failed",  color: C.red,     bg: "rgba(226,75,74,0.15)" },
  vacant:  { label: "Vacant",  color: C.text3,   bg: "rgba(90,94,106,0.2)" },
};

const PRIORITY_CONFIG = {
  low:    { label: "Low",    color: "#8fc04a",  bg: "rgba(99,153,34,0.15)" },
  normal: { label: "Normal", color: C.blue,     bg: "rgba(55,138,221,0.15)" },
  high:   { label: "High",   color: C.red,      bg: "rgba(226,75,74,0.15)" },
  urgent: { label: "Urgent", color: C.red,      bg: "rgba(226,75,74,0.2)" },
};

const PROP_COLORS = [C.gold, C.blue, C.green, C.amber, C.red];

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setWidth(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return width;
}

// ─── Logo Mark ────────────────────────────────────────────────────────────
function ModusLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 32V10L20 26L34 10V32" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 10L20 26L34 10" stroke={C.gold2} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Shared components ────────────────────────────────────────────────────
function Badge({ status, type = "status" }) {
  const cfg = type === "status" ? STATUS_CONFIG[status] : PRIORITY_CONFIG[status];
  if (!cfg) return null;
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 8,
      background: cfg.bg, color: cfg.color, whiteSpace: "nowrap",
    }}>{cfg.label}</span>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`,
      borderRadius: 10, overflow: "hidden", ...style,
    }}>{children}</div>
  );
}

function CardHeader({ title, sub, action, onAction }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 14px", borderBottom: `1px solid ${C.border}`,
    }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.text, letterSpacing: "0.04em" }}>{title}</div>
        {sub && <div style={{ fontSize: 10, color: C.text3, marginTop: 2 }}>{sub}</div>}
      </div>
      {action && (
        <button onClick={onAction} style={{
          fontSize: 11, color: C.gold2, background: "none", border: "none",
          cursor: "pointer", fontFamily: "'DM Sans', sans-serif", padding: 0,
          transition: "color 0.15s",
        }}
          onMouseOver={e => e.target.style.color = C.gold}
          onMouseOut={e => e.target.style.color = C.gold2}
        >{action}</button>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 9, letterSpacing: "0.18em", color: C.text3,
      textTransform: "uppercase", padding: "0 16px", marginBottom: 8, fontWeight: 500,
    }}>{children}</div>
  );
}

function SidebarItem({ icon, label, active, badge, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 16px", cursor: "pointer",
      fontSize: 12, color: active ? C.gold : C.text2,
      background: active ? "linear-gradient(90deg,rgba(201,169,110,0.08),transparent)" : "transparent",
      position: "relative", transition: "all 0.15s",
      borderLeft: active ? `2px solid ${C.gold}` : "2px solid transparent",
    }}>
      <span style={{ fontSize: 14, width: 18, textAlign: "center" }}>{icon}</span>
      <span>{label}</span>
      {badge > 0 && (
        <span style={{
          marginLeft: "auto", background: C.red, color: "#fff",
          fontSize: 9, fontWeight: 600, padding: "2px 5px",
          borderRadius: 8, minWidth: 16, textAlign: "center",
        }}>{badge}</span>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────
export default function LandlordDashboard() {
  const navigate = useNavigate();
  const width    = useWindowWidth();
  const isMobile = width < 768;

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
      { data: propsData },
      { data: unitsData },
      { data: tenantsData },
      { data: paymentsData },
      { data: maintData },
    ] = await Promise.all([
      supabase.from("properties").select("*"),
      supabase.from("units").select("*"),
      supabase.from("tenants").select("*"),
      supabase.from("payments").select("*, tenants(name), units(unit_number, properties(name))").order("created_at", { ascending: false }),
      supabase.from("maintenance_requests").select("*, units(unit_number, properties(name)), tenants(name)").neq("status", "resolved").order("created_at", { ascending: false }),
    ]);
    setProperties(propsData || []);
    setUnits(unitsData || []);
    setTenants(tenantsData || []);
    setPayments(paymentsData || []);
    setMaintenance(maintData || []);
    setLoading(false);
  }

  // ── Derived data ──
  const totalUnits    = units.length;
  const occupiedUnits = tenants.length;
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

  const now       = new Date();
  const thisMonth = payments.filter(p => {
    const d = new Date(p.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const collectedCents = thisMonth.filter(p => p.status === "paid").reduce((s, p) => s + (p.amount_cents || 0), 0);
  const collected  = (collectedCents / 100).toLocaleString("en-US");
  const expectedCents = units.reduce((s, u) => s + ((u.rent_amount || 0) * 100), 0);
  const expected   = (expectedCents / 100).toLocaleString("en-US");

  const openMaintenance = maintenance.filter(m => m.status !== "resolved");

  const rentRollRows = units.map(unit => {
    const tenant   = tenants.find(t => t.unit_id === unit.id);
    const property = properties.find(p => p.id === unit.property_id);
    if (!tenant) return { unitId: unit.id, unit: unit.unit_number, property: property?.name || "—", tenant: "—", rent: unit.rent_amount || 0, status: "vacant" };
    const latestPayment = payments.find(p => p.unit_id === unit.id);
    let status = "pending";
    if (latestPayment?.status === "paid") status = "paid";
    else if (latestPayment?.status === "failed") status = "late";
    return { unitId: unit.id, unit: unit.unit_number, property: property?.name || "—", tenant: tenant.name, rent: unit.rent_amount || 0, status };
  });

  const filteredRoll = rentFilter === "all" ? rentRollRows : rentRollRows.filter(r => r.status === rentFilter);

  const recentActivity = payments.slice(0, 4).map(p => ({
    paid: p.status === "paid",
    text: `${p.tenants?.name || "Tenant"} ${p.status === "paid" ? "paid" : "payment failed"} $${((p.amount_cents || 0) / 100).toLocaleString()} — ${p.units?.unit_number ? `Unit ${p.units.unit_number}` : ""} ${p.units?.properties?.name || ""}`,
    time: new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  const stats = [
    { label: "Collected · " + now.toLocaleDateString("en-US", { month: "short" }), value: loading ? "—" : `$${collected}`, sub: `of $${expected} expected`, accent: C.blue },
    { label: "Outstanding",      value: loading ? "—" : rentRollRows.filter(r => r.status === "pending" || r.status === "late").length, sub: "tenants pending / late", accent: C.red },
    { label: "Occupancy",        value: loading ? "—" : `${occupancyRate}%`, sub: `${occupiedUnits} of ${totalUnits} units`, accent: C.green },
    { label: "Open Maintenance", value: loading ? "—" : openMaintenance.length, sub: "active requests", accent: C.amber },
  ];

  // ── Fonts ──
  const fontLink = `@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@300;400;500;600&display=swap');`;

  return (
    <LandlordLayout openMaintenance={openMaintenance.length} unreadMessages={0}>
      <style>{`
        ${fontLink}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; font-family: 'DM Sans', sans-serif; }
        .modus-sidebar-item:hover { color: ${C.text} !important; background: ${C.bg3} !important; }
        .modus-card-action:hover { color: ${C.gold} !important; }
        .modus-filter-btn:hover { color: ${C.text} !important; }
        .modus-rent-row:hover td { background: ${C.bg3} !important; }
        .modus-add-btn:hover { background: rgba(201,169,110,0.08) !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border2}; border-radius: 2px; }
      `}</style>

      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ padding: isMobile ? "16px" : "24px" }}>

          {/* Top bar */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: isMobile ? 16 : 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <ModusLogo size={isMobile ? 28 : 34} />
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 20 : 24, fontWeight: 600, letterSpacing: "0.02em", color: C.text }}>
                  Good morning, Andrew
                </div>
                <div style={{ fontSize: 11, color: C.text3, marginTop: 2, letterSpacing: "0.05em" }}>
                  {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </div>
              </div>
            </div>
            {!isMobile && (
              <button className="modus-add-btn" onClick={() => navigate("/landlord/tenants")} style={{
                background: "transparent", border: `1px solid ${C.gold2}`, color: C.gold,
                fontSize: 11, fontWeight: 500, padding: "7px 16px", borderRadius: 6,
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em",
                transition: "background 0.15s",
              }}>+ Add tenant</button>
            )}
          </div>

          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
            {stats.map((stat, i) => (
              <div key={i} style={{
                background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px",
                borderTop: `2px solid ${stat.accent}`,
              }}>
                <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: C.text3, marginBottom: 8, fontWeight: 500 }}>
                  {stat.label}
                </div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 22 : 26, fontWeight: 600, color: C.text, lineHeight: 1, marginBottom: 4 }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 10, color: C.text3 }}>{stat.sub}</div>
              </div>
            ))}
          </div>

          {/* Properties */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: C.text3, fontWeight: 600 }}>Properties</span>
            <button className="modus-card-action" onClick={() => navigate("/landlord/properties")} style={{
              fontSize: 11, color: C.gold2, background: "none", border: "none",
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "color 0.15s",
            }}>+ Add property</button>
          </div>

          {loading ? (
            <div style={{ color: C.text3, fontSize: 12, marginBottom: 20 }}>Loading properties…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
              {properties.map((prop, i) => {
                const propUnits    = units.filter(u => u.property_id === prop.id);
                const propTenants  = tenants.filter(t => propUnits.some(u => u.id === t.unit_id));
                const occupied     = propTenants.length;
                const total        = propUnits.length;
                const occPct       = total > 0 ? Math.round((occupied / total) * 100) : 0;
                const color        = PROP_COLORS[i % PROP_COLORS.length];
                const propPayments = payments.filter(p => propUnits.some(u => u.id === p.unit_id) && p.status === "paid");
                const propCollected = (propPayments.reduce((s, p) => s + (p.amount_cents || 0), 0) / 100).toLocaleString();
                return (
                  <div key={prop.id} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, borderTop: `2px solid ${color}` }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 2 }}>{prop.name}</div>
                    <div style={{ fontSize: 10, color: C.text3, marginBottom: 10 }}>{prop.address}, {prop.city} {prop.state}</div>
                    <div style={{ height: 2, background: C.bg4, borderRadius: 1, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${occPct}%`, background: color, borderRadius: 1 }} />
                    </div>
                    <div style={{ fontSize: 9, color: C.text3, marginTop: 5, marginBottom: 8 }}>{occupied}/{total} units occupied · {occPct}%</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <div style={{ background: C.bg3, borderRadius: 6, padding: "7px 8px", textAlign: "center" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color }}>${propCollected}</div>
                        <div style={{ fontSize: 9, color: C.text3, marginTop: 1 }}>Collected</div>
                      </div>
                      <div style={{ background: C.bg3, borderRadius: 6, padding: "7px 8px", textAlign: "center" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text2 }}>{total}</div>
                        <div style={{ fontSize: 9, color: C.text3, marginTop: 1 }}>Total units</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {properties.length === 0 && (
                <div style={{ color: C.text3, fontSize: 12, padding: 20, textAlign: "center" }}>No properties yet.</div>
              )}
              {/* Add property placeholder */}
              <div onClick={() => navigate("/landlord/properties")} style={{
                background: "transparent", border: `1px dashed ${C.border2}`, borderRadius: 10,
                padding: 14, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", minHeight: 120,
              }}>
                <div style={{ textAlign: "center", color: C.text3 }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>+</div>
                  <div style={{ fontSize: 10, letterSpacing: "0.08em" }}>Add property</div>
                </div>
              </div>
            </div>
          )}

          {/* Rent Roll + Right Column */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>

            {/* Rent Roll */}
            <Card>
              <CardHeader
                title={`Rent Roll — ${now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`}
                sub={`${rentRollRows.filter(r => r.status === "paid").length} paid · ${rentRollRows.filter(r => r.status === "pending" || r.status === "late").length} outstanding`}
                action="View all"
                onAction={() => navigate("/landlord/rentroll")}
              />
              {/* Filters */}
              <div style={{ display: "flex", gap: 4, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
                {["all","paid","pending","late","vacant"].map(f => (
                  <button key={f} className="modus-filter-btn" onClick={() => setRentFilter(f)} style={{
                    padding: "3px 9px", borderRadius: 4, fontSize: 10, fontWeight: rentFilter === f ? 600 : 400,
                    background: rentFilter === f ? C.gold2 : C.bg3,
                    color: rentFilter === f ? C.text : C.text3,
                    border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                    textTransform: "capitalize", transition: "all 0.12s",
                  }}>{f}</button>
                ))}
              </div>
              <div style={{ overflowY: "auto", maxHeight: 300, overflowX: "auto" }}>
                {loading ? (
                  <div style={{ padding: 20, color: C.text3, fontSize: 12, textAlign: "center" }}>Loading…</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Unit","Tenant",...(!isMobile ? ["Rent"] : []),"Status"].map(h => (
                          <th key={h} style={{
                            fontSize: 9, fontWeight: 600, color: C.text3, textTransform: "uppercase",
                            letterSpacing: "0.1em", padding: "8px 12px", textAlign: h === "Rent" ? "right" : "left",
                            borderBottom: `1px solid ${C.border}`, background: C.bg3,
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRoll.length === 0 && (
                        <tr><td colSpan={4} style={{ padding: 20, color: C.text3, fontSize: 12, textAlign: "center" }}>No records.</td></tr>
                      )}
                      {filteredRoll.map((row, i) => (
                        <tr key={i} className="modus-rent-row">
                          <td style={{ fontSize: 11, color: C.text, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
                            <div style={{ fontWeight: 500 }}>{row.unit}</div>
                            <div style={{ fontSize: 9, color: C.text3 }}>{row.property}</div>
                          </td>
                          <td style={{ fontSize: 11, color: C.text, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>{row.tenant}</td>
                          {!isMobile && (
                            <td style={{ fontSize: 11, color: C.text, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "right", fontWeight: 500 }}>
                              ${(row.rent || 0).toLocaleString()}
                            </td>
                          )}
                          <td style={{ fontSize: 11, color: C.text, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

              {/* Maintenance queue */}
              <Card>
                <CardHeader
                  title="Maintenance Queue"
                  sub={`${openMaintenance.length} open requests`}
                  action="View all"
                  onAction={() => navigate("/landlord/maintenance")}
                />
                {loading && <div style={{ padding: 16, color: C.text3, fontSize: 12 }}>Loading…</div>}
                {!loading && openMaintenance.length === 0 && (
                  <div style={{ padding: 16, color: C.text3, fontSize: 12, textAlign: "center" }}>No open requests</div>
                )}
                {!loading && (
                  <div style={{ overflowY: "auto", maxHeight: 200 }}>
                    {openMaintenance.map((m, i) => (
                      <div key={m.id} style={{
                        padding: "10px 14px", borderBottom: i === openMaintenance.length - 1 ? "none" : `1px solid ${C.border}`,
                        display: "flex", alignItems: "flex-start", gap: 10,
                      }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: "50%", marginTop: 5, flexShrink: 0,
                          background: PRIORITY_CONFIG[m.priority]?.color || C.text3,
                        }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 500, color: C.text, marginBottom: 2 }}>{m.title}</div>
                          <div style={{ fontSize: 10, color: C.text3 }}>
                            {m.units?.properties?.name || "—"} · Unit {m.units?.unit_number || "—"} · {m.tenants?.name || "Unknown"}
                          </div>
                          <div style={{ fontSize: 9, color: C.text3, marginTop: 2 }}>
                            {new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </div>
                        </div>
                        <Badge status={m.priority} type="priority" />
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Activity feed */}
              <Card>
                <CardHeader title="Recent Activity" />
                {loading && <div style={{ padding: 16, color: C.text3, fontSize: 12 }}>Loading…</div>}
                {!loading && recentActivity.length === 0 && (
                  <div style={{ padding: 16, color: C.text3, fontSize: 12, textAlign: "center" }}>No payment activity yet.</div>
                )}
                {!loading && recentActivity.map((a, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "9px 14px", borderBottom: i === recentActivity.length - 1 ? "none" : `1px solid ${C.border}`,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                      background: a.paid ? "rgba(99,153,34,0.15)" : "rgba(226,75,74,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                    }}>{a.paid ? "💰" : "⚠️"}</div>
                    <div>
                      <div style={{ fontSize: 10, color: C.text2, lineHeight: 1.5 }}>{a.text}</div>
                      <div style={{ fontSize: 9, color: C.text3, marginTop: 2 }}>{a.time}</div>
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