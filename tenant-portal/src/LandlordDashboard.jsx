import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

const STATUS_CONFIG = {
  paid:    { label: "Paid",    color: "#3B6D11", bg: "#EAF3DE" },
  pending: { label: "Pending", color: "#854F0B", bg: "#FAEEDA" },
  late:    { label: "Late",    color: "#A32D2D", bg: "#FDECEA" },
  failed:  { label: "Failed",  color: "#A32D2D", bg: "#FDECEA" },
  vacant:  { label: "Vacant",  color: "#666",    bg: "#f4f5f7" },
};

const PRIORITY_CONFIG = {
  low:    { label: "Low",    color: "#3B6D11", bg: "#EAF3DE" },
  normal: { label: "Normal", color: "#185FA5", bg: "#E6F1FB" },
  high:   { label: "High",   color: "#A32D2D", bg: "#FDECEA" },
  urgent: { label: "Urgent", color: "#A32D2D", bg: "#FDECEA" },
};

const NAV_ITEMS = [
  { icon: "📊", label: "Dashboard",   id: "dashboard",   route: "/landlord" },
  { icon: "🏢", label: "Properties",  id: "properties",  route: "/landlord/properties" },
  { icon: "👥", label: "Tenants",     id: "tenants",     route: "/landlord/tenants" },
  { icon: "📋", label: "Reports", route: "/landlord/rentroll" },
  { icon: "🔧", label: "Maintenance", id: "maintenance", route: "/landlord/maintenance" },
  { icon: "📈", label: "Financials",  id: "financials",  route: "/landlord/financials" },
  { icon: "💬", label: "Messages",    id: "messages",    route: "/landlord/messages" },
  { icon: "⚙️", label: "Settings",   id: "settings",    route: "/landlord/settings" },
];

const PROP_COLORS = ["#0C447C","#3B6D11","#854F0B","#6B3FA0","#185FA5"];
const PROP_BGS    = ["#E6F1FB","#EAF3DE","#FAEEDA","#F0E6FB","#E6F1FB"];
const PROP_ICONS  = ["🏢","🏖️","🏗️","🏠","🏘️"];

const s = {
  app: { display: "flex", fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: 14, color: "#1a1a1a", background: "#f4f5f7", minHeight: "100vh" },
  sidebar: { width: 220, background: "#0C1F3F", minHeight: "100vh", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto" },
  sidebarLogo: { padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 8 },
  logoText: { fontSize: 15, fontWeight: 700, color: "#fff" },
  logoSub: { fontSize: 10, color: "#5B7FA6", marginTop: 2 },
  navItem: (active) => ({ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: active ? "rgba(255,255,255,0.1)" : "transparent", borderLeft: active ? "3px solid #378ADD" : "3px solid transparent", cursor: "pointer", transition: "all 0.15s", color: active ? "#fff" : "#7A9CC4", fontSize: 13, fontWeight: active ? 600 : 400 }),
  navIcon: { fontSize: 16, flexShrink: 0 },
  sidebarFooter: { marginTop: "auto", padding: "16px", borderTop: "1px solid rgba(255,255,255,0.08)" },
  sidebarUser: { display: "flex", alignItems: "center", gap: 10, cursor: "pointer" },
  sidebarAvatar: { width: 32, height: 32, borderRadius: "50%", background: "#185FA5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  sidebarName: { fontSize: 12, fontWeight: 600, color: "#fff" },
  sidebarRole: { fontSize: 10, color: "#5B7FA6" },
  main: { flex: 1, padding: "28px", overflowY: "auto" },
  topBar: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  pageTitle: { fontSize: 22, fontWeight: 700, color: "#1a1a1a" },
  pageSub: { fontSize: 13, color: "#888", marginTop: 2 },
  topBarRight: { display: "flex", alignItems: "center", gap: 12 },
  addBtn: { padding: "9px 16px", background: "#0C447C", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "'Inter',sans-serif" },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 },
  statCard: (accent) => ({ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "18px", borderTop: `3px solid ${accent}` }),
  statLabel: { fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 },
  statValue: { fontSize: 28, fontWeight: 700, color: "#1a1a1a", lineHeight: 1, marginBottom: 4 },
  statSub: { fontSize: 12, color: "#888" },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 },
  threeCol: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 },
  card: { background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, overflow: "hidden" },
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #f4f5f7" },
  cardTitle: { fontSize: 13, fontWeight: 700, color: "#1a1a1a" },
  cardSub: { fontSize: 11, color: "#888", marginTop: 2 },
  cardAction: { fontSize: 12, color: "#185FA5", cursor: "pointer", background: "none", border: "none", fontFamily: "'Inter',sans-serif", padding: 0 },
  propCard: (color) => ({ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px", borderLeft: `4px solid ${color}` }),
  propHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 },
  propIcon: (bg) => ({ width: 40, height: 40, borderRadius: 10, background: bg, fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }),
  propName: { fontSize: 14, fontWeight: 700, color: "#1a1a1a" },
  propAddr: { fontSize: 11, color: "#888", marginTop: 2 },
  propStats: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 },
  propStat: (bg) => ({ background: bg, borderRadius: 8, padding: "8px 10px", textAlign: "center" }),
  occupancyBar: { height: 4, background: "#f0f0f0", borderRadius: 2, overflow: "hidden", marginTop: 10 },
  occupancyFill: (pct, color) => ({ height: "100%", width: `${pct}%`, background: color, borderRadius: 2 }),
  table: { width: "100%", borderCollapse: "collapse" },
  th: { fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", padding: "10px 14px", textAlign: "left", borderBottom: "1px solid #f0f0f0", background: "#fafafa" },
  td: { fontSize: 13, color: "#1a1a1a", padding: "10px 14px", borderBottom: "1px solid #f8f9fa" },
  statusBadge: (status) => ({ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: STATUS_CONFIG[status]?.bg || "#f4f5f7", color: STATUS_CONFIG[status]?.color || "#666", whiteSpace: "nowrap" }),
  priorityBadge: (priority) => ({ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: PRIORITY_CONFIG[priority]?.bg, color: PRIORITY_CONFIG[priority]?.color }),
  activityItem: { display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 16px", borderBottom: "1px solid #f8f9fa" },
  activityIcon: (color) => ({ width: 32, height: 32, borderRadius: "50%", background: `${color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }),
  activityText: { fontSize: 12, color: "#444", lineHeight: 1.5 },
  activityTime: { fontSize: 10, color: "#aaa", marginTop: 3 },
};

export default function LandlordDashboard() {
  const navigate = useNavigate();
  const [activeNav, setActiveNav]     = useState("dashboard");
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

  // Derived stats
  const totalUnits    = units.length;
  const occupiedUnits = tenants.length;
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

  const now = new Date();
  const thisMonth = payments.filter(p => {
    const d = new Date(p.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const collectedCents = thisMonth.filter(p => p.status === "paid").reduce((s, p) => s + (p.amount_cents || 0), 0);
  const collected = (collectedCents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 });
  const expectedCents = units.reduce((s, u) => s + ((u.rent_amount || 0) * 100), 0);
  const expected = (expectedCents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 });

  const openMaintenance = maintenance.filter(m => m.status !== "resolved");

  const rentRollRows = units.map(unit => {
    const tenant = tenants.find(t => t.unit_id === unit.id);
    const property = properties.find(p => p.id === unit.property_id);
    if (!tenant) return { unitId: unit.id, unit: unit.unit_number, property: property?.name || "—", tenant: "—", rent: unit.rent_amount || 0, status: "vacant" };
    const latestPayment = payments.find(p => p.unit_id === unit.id);
    let status = "pending";
    if (latestPayment?.status === "paid") status = "paid";
    else if (latestPayment?.status === "failed") status = "late";
    return { unitId: unit.id, unit: unit.unit_number, property: property?.name || "—", tenant: tenant.name, rent: unit.rent_amount || 0, status };
  });

  const filteredRoll = rentFilter === "all" ? rentRollRows : rentRollRows.filter(r => r.status === rentFilter);

  const recentActivity = payments.slice(0, 5).map(p => ({
    icon: p.status === "paid" ? "💰" : "⚠️",
    color: p.status === "paid" ? "#3B6D11" : "#A32D2D",
    text: `${p.tenants?.name || "Tenant"} ${p.status === "paid" ? "paid" : "payment failed"} $${((p.amount_cents || 0) / 100).toLocaleString()} — ${p.units?.unit_number ? `Unit ${p.units.unit_number}` : ""} ${p.units?.properties?.name || ""}`,
    time: new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  return (
    <div style={s.app}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; } tr:hover td { background: #fafafa; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }`}</style>

      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.sidebarLogo}>
          <div style={s.logoText}>🏢 Polaris PM</div>
          <div style={s.logoSub}>Property Management</div>
        </div>
        {NAV_ITEMS.map(item => (
          <div key={item.id} style={s.navItem(activeNav === item.id)} onClick={() => { setActiveNav(item.id); navigate(item.route); }}>
            <span style={s.navIcon}>{item.icon}</span>
            {item.label}
            {item.id === "maintenance" && openMaintenance.length > 0 && (
              <span style={{ marginLeft: "auto", background: "#E24B4A", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>{openMaintenance.length}</span>
            )}
          </div>
        ))}
        <div style={s.sidebarFooter}>
          <div style={s.sidebarUser}>
            <div style={s.sidebarAvatar}>AW</div>
            <div>
              <div style={s.sidebarName}>Andrew Wagner</div>
              <div style={s.sidebarRole}>Portfolio Owner</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={s.main}>

        {/* Top bar */}
        <div style={s.topBar}>
          <div>
            <div style={s.pageTitle}>Good morning, Andrew 👋</div>
            <div style={s.pageSub}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
          </div>
          <div style={s.topBarRight}>
            <button style={s.addBtn} onClick={() => navigate("/landlord/tenants")}>+ Add tenant</button>
          </div>
        </div>

        {/* Stat cards */}
        <div style={s.statGrid}>
          {[
            { label: "Collected this month", value: loading ? "—" : `$${collected}`, sub: `of $${expected} expected`, accent: "#185FA5" },
            { label: "Outstanding",          value: loading ? "—" : rentRollRows.filter(r => r.status === "pending" || r.status === "late").length, sub: "tenants pending/late", accent: "#E24B4A" },
            { label: "Occupancy",            value: loading ? "—" : `${occupancyRate}%`, sub: `${occupiedUnits} of ${totalUnits} units occupied`, accent: "#3B6D11" },
            { label: "Open Maintenance",     value: loading ? "—" : openMaintenance.length, sub: "active requests", accent: "#854F0B" },
          ].map((stat, i) => (
            <div key={i} style={s.statCard(stat.accent)}>
              <div style={s.statLabel}>{stat.label}</div>
              <div style={s.statValue}>{stat.value}</div>
              <div style={s.statSub}>{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Properties */}
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Properties</span>
          <button style={s.cardAction} onClick={() => navigate("/landlord/properties")}>+ Add property</button>
        </div>
        {loading ? (
          <div style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>Loading properties…</div>
        ) : (
          <div style={s.threeCol}>
            {properties.map((prop, i) => {
              const propUnits   = units.filter(u => u.property_id === prop.id);
              const propTenants = tenants.filter(t => propUnits.some(u => u.id === t.unit_id));
              const occupied    = propTenants.length;
              const total       = propUnits.length;
              const occPct      = total > 0 ? Math.round((occupied / total) * 100) : 0;
              const color       = PROP_COLORS[i % PROP_COLORS.length];
              const bg          = PROP_BGS[i % PROP_BGS.length];
              const icon        = PROP_ICONS[i % PROP_ICONS.length];
              const propPayments = payments.filter(p => propUnits.some(u => u.id === p.unit_id) && p.status === "paid");
              const propCollected = (propPayments.reduce((s, p) => s + (p.amount_cents || 0), 0) / 100).toLocaleString();
              return (
                <div key={prop.id} style={s.propCard(color)}>
                  <div style={s.propHeader}>
                    <div>
                      <div style={s.propName}>{prop.name}</div>
                      <div style={s.propAddr}>{prop.address}, {prop.city} {prop.state}</div>
                    </div>
                    <div style={s.propIcon(bg)}>{icon}</div>
                  </div>
                  <div style={s.occupancyBar}>
                    <div style={s.occupancyFill(occPct, color)} />
                  </div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 4, marginBottom: 8 }}>{occupied}/{total} units occupied · {occPct}%</div>
                  <div style={s.propStats}>
                    <div style={s.propStat(bg)}>
                      <div style={{ fontSize: 16, fontWeight: 700, color }}>${propCollected}</div>
                      <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>Collected</div>
                    </div>
                    <div style={s.propStat("#f8f9fa")}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>{total}</div>
                      <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>Total units</div>
                    </div>
                  </div>
                </div>
              );
            })}
            {properties.length === 0 && (
              <div style={{ gridColumn: "1/-1", color: "#888", fontSize: 13, padding: 20, textAlign: "center" }}>No properties yet.</div>
            )}
          </div>
        )}

        {/* Rent Roll + Right Column */}
        <div style={s.twoCol}>

          {/* Rent Roll */}
          <div style={s.card}>
            <div style={s.cardHeader}>
              <div>
                <div style={s.cardTitle}>Rent Roll — {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
                <div style={s.cardSub}>{rentRollRows.filter(r => r.status === "paid").length} paid · {rentRollRows.filter(r => r.status === "pending" || r.status === "late").length} outstanding</div>
              </div>
              <button style={s.cardAction} onClick={() => navigate("/landlord/rentroll")}>View all</button>
            </div>
            <div style={{ display: "flex", gap: 4, padding: "10px 14px", borderBottom: "1px solid #f0f0f0" }}>
              {["all","paid","pending","late","vacant"].map(f => (
                <button key={f} onClick={() => setRentFilter(f)} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: rentFilter === f ? 600 : 400, background: rentFilter === f ? "#0C447C" : "#f4f5f7", color: rentFilter === f ? "#fff" : "#666", border: "none", cursor: "pointer", fontFamily: "'Inter',sans-serif", textTransform: "capitalize" }}>
                  {f}
                </button>
              ))}
            </div>
            <div style={{ overflowY: "auto", maxHeight: 340 }}>
              {loading ? (
                <div style={{ padding: 20, color: "#888", fontSize: 13, textAlign: "center" }}>Loading…</div>
              ) : (
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Unit</th>
                      <th style={s.th}>Tenant</th>
                      <th style={{ ...s.th, textAlign: "right" }}>Rent</th>
                      <th style={s.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRoll.length === 0 && (
                      <tr><td colSpan={4} style={{ ...s.td, textAlign: "center", color: "#888" }}>No records.</td></tr>
                    )}
                    {filteredRoll.map((row, i) => (
                      <tr key={i} style={{ cursor: "pointer" }}>
                        <td style={s.td}>
                          <div style={{ fontWeight: 600 }}>{row.unit}</div>
                          <div style={{ fontSize: 10, color: "#aaa" }}>{row.property}</div>
                        </td>
                        <td style={s.td}>{row.tenant}</td>
                        <td style={{ ...s.td, textAlign: "right", fontWeight: 600 }}>${(row.rent || 0).toLocaleString()}</td>
                        <td style={s.td}><span style={s.statusBadge(row.status)}>{STATUS_CONFIG[row.status]?.label}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Maintenance queue */}
            <div style={s.card}>
              <div style={s.cardHeader}>
                <div>
                  <div style={s.cardTitle}>Maintenance Queue</div>
                  <div style={s.cardSub}>{openMaintenance.length} open requests</div>
                </div>
                <button style={s.cardAction} onClick={() => navigate("/landlord/maintenance")}>View all</button>
              </div>
              {loading && <div style={{ padding: 16, color: "#888", fontSize: 13 }}>Loading…</div>}
              {!loading && openMaintenance.length === 0 && (
                <div style={{ padding: 16, color: "#888", fontSize: 13, textAlign: "center" }}>No open requests 🎉</div>
              )}
              {!loading && (
                <div style={{ overflowY: "auto", maxHeight: 240 }}>
                  {openMaintenance.map((m, i) => (
                    <div key={m.id} style={{ padding: "10px 14px", borderBottom: i === openMaintenance.length - 1 ? "none" : "1px solid #f8f9fa", display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{m.title}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>{m.units?.properties?.name || "—"} · Unit {m.units?.unit_number || "—"} · {m.tenants?.name || "Unknown"}</div>
                        <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>{new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                        <span style={s.priorityBadge(m.priority)}>{PRIORITY_CONFIG[m.priority]?.label}</span>
                        <span style={{ fontSize: 10, color: "#888", textTransform: "capitalize" }}>{m.status?.replace("_", " ")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity feed */}
            <div style={s.card}>
              <div style={s.cardHeader}>
                <div style={s.cardTitle}>Recent Activity</div>
              </div>
              {loading && <div style={{ padding: 16, color: "#888", fontSize: 13 }}>Loading…</div>}
              {!loading && recentActivity.length === 0 && (
                <div style={{ padding: 16, color: "#888", fontSize: 13, textAlign: "center" }}>No payment activity yet.</div>
              )}
              {!loading && recentActivity.map((a, i) => (
                <div key={i} style={s.activityItem}>
                  <div style={s.activityIcon(a.color)}>{a.icon}</div>
                  <div>
                    <div style={s.activityText}>{a.text}</div>
                    <div style={s.activityTime}>{a.time}</div>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}