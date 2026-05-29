import { useState } from "react";
import { useNavigate } from "react-router-dom";

// ── Portfolio data ────────────────────────────────────────────────────────────
const PROPERTIES = [
  {
    id: 1,
    name: "Clifton Manor",
    address: "12009 Clifton Blvd, Lakewood OH",
    units: 12,
    occupied: 10,
    image: "🏢",
    color: "#0C447C",
    bg: "#E6F1FB",
    monthlyRent: 13800,
    collected: 11500,
    outstanding: 2300,
    noi: 7200,
    expenses: 4300,
  },
  {
    id: 2,
    name: "944 18th Ave S",
    address: "St. Petersburg, FL",
    units: 6,
    occupied: 5,
    image: "🏖️",
    color: "#3B6D11",
    bg: "#EAF3DE",
    monthlyRent: 8400,
    collected: 7050,
    outstanding: 1350,
    noi: 4800,
    expenses: 2250,
  },
  {
    id: 3,
    name: "Columbus Portfolio",
    address: "Columbus, OH — In development",
    units: 45,
    occupied: 0,
    image: "🏗️",
    color: "#854F0B",
    bg: "#FAEEDA",
    monthlyRent: 0,
    collected: 0,
    outstanding: 0,
    noi: 0,
    expenses: 0,
  },
];

const RENT_ROLL = [
  { id: 1, property: "Clifton Manor", unit: "1A", tenant: "James W.",    rent: 1150, status: "paid",    dueDate: "Jun 1", paidDate: "May 31" },
  { id: 2, property: "Clifton Manor", unit: "1B", tenant: "Sarah M.",    rent: 1150, status: "paid",    dueDate: "Jun 1", paidDate: "Jun 1"  },
  { id: 3, property: "Clifton Manor", unit: "2A", tenant: "Jordan K.",   rent: 1200, status: "paid",    dueDate: "Jun 1", paidDate: "Jun 1"  },
  { id: 4, property: "Clifton Manor", unit: "2B", tenant: "Priya M.",    rent: 1150, status: "late",    dueDate: "Jun 1", paidDate: null     },
  { id: 5, property: "Clifton Manor", unit: "3A", tenant: "Maria R.",    rent: 1150, status: "paid",    dueDate: "Jun 1", paidDate: "Jun 1"  },
  { id: 6, property: "Clifton Manor", unit: "3B", tenant: "Alex T.",     rent: 1150, status: "pending", dueDate: "Jun 1", paidDate: null     },
  { id: 7, property: "Clifton Manor", unit: "4A", tenant: "Sam P.",      rent: 1200, status: "paid",    dueDate: "Jun 1", paidDate: "Jun 2"  },
  { id: 8, property: "Clifton Manor", unit: "4B", tenant: "Chris L.",    rent: 1150, status: "pending", dueDate: "Jun 1", paidDate: null     },
  { id: 9, property: "Clifton Manor", unit: "5A", tenant: "Diana F.",    rent: 1150, status: "paid",    dueDate: "Jun 1", paidDate: "Jun 1"  },
  { id:10, property: "Clifton Manor", unit: "5B", tenant: "Marcus B.",   rent: 1150, status: "paid",    dueDate: "Jun 1", paidDate: "Jun 1"  },
  { id:11, property: "Clifton Manor", unit: "6A", tenant: "—",           rent: 1150, status: "vacant",  dueDate: "—",     paidDate: null     },
  { id:12, property: "Clifton Manor", unit: "6B", tenant: "—",           rent: 1150, status: "vacant",  dueDate: "—",     paidDate: null     },
  { id:13, property: "944 18th Ave S", unit: "Main", tenant: "Kaidyn T.", rent: 2200, status: "paid",   dueDate: "Jun 1", paidDate: "Jun 1"  },
  { id:14, property: "944 18th Ave S", unit: "ADU",  tenant: "Airbnb",   rent: 1350, status: "paid",    dueDate: "—",     paidDate: "Rolling"},
  { id:15, property: "944 18th Ave S", unit: "1A",   tenant: "Pending",  rent: 1600, status: "pending", dueDate: "—",     paidDate: null     },
  { id:16, property: "944 18th Ave S", unit: "1B",   tenant: "Pending",  rent: 1600, status: "pending", dueDate: "—",     paidDate: null     },
  { id:17, property: "944 18th Ave S", unit: "1C",   tenant: "—",        rent: 1600, status: "vacant",  dueDate: "—",     paidDate: null     },
  { id:18, property: "944 18th Ave S", unit: "1D",   tenant: "—",        rent: 1600, status: "vacant",  dueDate: "—",     paidDate: null     },
];

const MAINTENANCE = [
  { id: 1, property: "Clifton Manor", unit: "2B", tenant: "Priya M.",  issue: "Kitchen faucet dripping",    priority: "normal", status: "in_progress", submitted: "May 18" },
  { id: 2, property: "Clifton Manor", unit: "4B", tenant: "Chris L.",  issue: "Bathroom exhaust fan broken", priority: "normal", status: "open",        submitted: "Jun 1"  },
  { id: 3, property: "944 18th Ave S", unit: "Main", tenant: "Kaidyn T.", issue: "AC not cooling properly", priority: "high",   status: "open",        submitted: "Jun 2"  },
  { id: 4, property: "Clifton Manor", unit: "1A", tenant: "James W.",  issue: "Window seal cracked",         priority: "low",    status: "open",        submitted: "May 25" },
];

const ACTIVITY = [
  { icon: "💰", text: "Sarah M. paid $1,150 — Unit 1B, Clifton Manor", time: "2h ago", color: "#3B6D11" },
  { icon: "🔧", text: "New request: AC issue — Unit Main, 944 18th Ave", time: "4h ago", color: "#854F0B" },
  { icon: "⚠️", text: "Priya M. rent overdue 5 days — Unit 2B, Clifton Manor", time: "5h ago", color: "#A32D2D" },
  { icon: "📋", text: "Lease renewal sent — Jordan K., Unit 2A", time: "1d ago", color: "#185FA5" },
  { icon: "💰", text: "Kaidyn T. paid $2,200 — Main Unit, St. Pete", time: "1d ago", color: "#3B6D11" },
];

const STATUS_CONFIG = {
  paid:    { label: "Paid",    color: "#3B6D11", bg: "#EAF3DE" },
  pending: { label: "Pending", color: "#854F0B", bg: "#FAEEDA" },
  late:    { label: "Late",    color: "#A32D2D", bg: "#FDECEA" },
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
  { icon: "💰", label: "Rent Roll",   id: "rentroll",    route: "/landlord/rentroll" },
  { icon: "🔧", label: "Maintenance", id: "maintenance", route: "/landlord/maintenance" },
  { icon: "📈", label: "Financials",  id: "financials",  route: "/landlord/financials" },
  { icon: "💬", label: "Messages",    id: "messages",    route: "/landlord/messages" },
  { icon: "⚙️", label: "Settings",   id: "settings",    route: "/landlord/settings" },
];

const s = {
  app: {
    display: "flex",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontSize: 14,
    color: "#1a1a1a",
    background: "#f4f5f7",
    minHeight: "100vh",
  },
  // ── Sidebar ──
  sidebar: {
    width: 220,
    background: "#0C1F3F",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    position: "sticky",
    top: 0,
    height: "100vh",
    overflowY: "auto",
  },
  sidebarLogo: {
    padding: "20px 20px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    marginBottom: 8,
  },
  logoText: { fontSize: 15, fontWeight: 700, color: "#fff" },
  logoSub: { fontSize: 10, color: "#5B7FA6", marginTop: 2 },
  navItem: (active) => ({
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 16px",
    background: active ? "rgba(255,255,255,0.1)" : "transparent",
    borderLeft: active ? "3px solid #378ADD" : "3px solid transparent",
    cursor: "pointer",
    transition: "all 0.15s",
    color: active ? "#fff" : "#7A9CC4",
    fontSize: 13,
    fontWeight: active ? 600 : 400,
  }),
  navIcon: { fontSize: 16, flexShrink: 0 },
  sidebarFooter: {
    marginTop: "auto",
    padding: "16px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  sidebarUser: {
    display: "flex", alignItems: "center", gap: 10,
    cursor: "pointer",
  },
  sidebarAvatar: {
    width: 32, height: 32, borderRadius: "50%",
    background: "#185FA5", color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 12, fontWeight: 700, flexShrink: 0,
  },
  sidebarName: { fontSize: 12, fontWeight: 600, color: "#fff" },
  sidebarRole: { fontSize: 10, color: "#5B7FA6" },
  // ── Main content ──
  main: { flex: 1, padding: "28px 28px", overflowY: "auto" },
  topBar: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  pageTitle: { fontSize: 22, fontWeight: 700, color: "#1a1a1a" },
  pageSub: { fontSize: 13, color: "#888", marginTop: 2 },
  topBarRight: { display: "flex", alignItems: "center", gap: 12 },
  addBtn: {
    padding: "9px 16px",
    background: "#0C447C", color: "#fff",
    border: "none", borderRadius: 8,
    fontSize: 13, fontWeight: 600, cursor: "pointer",
    display: "flex", alignItems: "center", gap: 6,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  notifBtn: {
    width: 36, height: 36, borderRadius: 8,
    background: "#fff", border: "1px solid #e8eaed",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", fontSize: 16,
  },
  // ── Stat cards ──
  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 16,
    marginBottom: 24,
  },
  statCard: (accent) => ({
    background: "#fff",
    border: "1px solid #e8eaed",
    borderRadius: 12,
    padding: "18px",
    borderTop: `3px solid ${accent}`,
  }),
  statLabel: { fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 },
  statValue: { fontSize: 28, fontWeight: 700, color: "#1a1a1a", lineHeight: 1, marginBottom: 4 },
  statSub: { fontSize: 12, color: "#888" },
  statChange: (positive) => ({
    fontSize: 11, fontWeight: 600,
    color: positive ? "#3B6D11" : "#A32D2D",
    marginTop: 4,
  }),
  // ── Two col layout ──
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 },
  threeCol: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 },
  card: {
    background: "#fff",
    border: "1px solid #e8eaed",
    borderRadius: 12,
    overflow: "hidden",
  },
  cardHeader: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderBottom: "1px solid #f4f5f7",
  },
  cardTitle: { fontSize: 13, fontWeight: 700, color: "#1a1a1a" },
  cardSub: { fontSize: 11, color: "#888", marginTop: 2 },
  cardAction: {
    fontSize: 12, color: "#185FA5", cursor: "pointer",
    background: "none", border: "none",
    fontFamily: "'Inter', 'Segoe UI', sans-serif", padding: 0,
  },
  // ── Property cards ──
  propCard: (color, bg) => ({
    background: "#fff",
    border: "1px solid #e8eaed",
    borderRadius: 12,
    padding: "16px",
    borderLeft: `4px solid ${color}`,
  }),
  propHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 },
  propIcon: (bg) => ({
    width: 40, height: 40, borderRadius: 10,
    background: bg, fontSize: 20,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  }),
  propName: { fontSize: 14, fontWeight: 700, color: "#1a1a1a" },
  propAddr: { fontSize: 11, color: "#888", marginTop: 2 },
  propStats: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 },
  propStat: (bg) => ({
    background: bg, borderRadius: 8, padding: "8px 10px",
    textAlign: "center",
  }),
  propStatVal: (color) => ({ fontSize: 16, fontWeight: 700, color }),
  propStatLabel: { fontSize: 10, color: "#888", marginTop: 2 },
  occupancyBar: {
    height: 4, background: "#f0f0f0",
    borderRadius: 2, overflow: "hidden", marginTop: 10,
  },
  occupancyFill: (pct, color) => ({
    height: "100%", width: `${pct}%`,
    background: color, borderRadius: 2,
  }),
  // ── Rent roll table ──
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    fontSize: 10, fontWeight: 600, color: "#888",
    textTransform: "uppercase", letterSpacing: "0.06em",
    padding: "10px 14px", textAlign: "left",
    borderBottom: "1px solid #f0f0f0", background: "#fafafa",
  },
  td: {
    fontSize: 13, color: "#1a1a1a",
    padding: "10px 14px",
    borderBottom: "1px solid #f8f9fa",
  },
  statusBadge: (status) => ({
    fontSize: 10, fontWeight: 600,
    padding: "3px 8px", borderRadius: 10,
    background: STATUS_CONFIG[status]?.bg,
    color: STATUS_CONFIG[status]?.color,
    whiteSpace: "nowrap",
  }),
  priorityBadge: (priority) => ({
    fontSize: 10, fontWeight: 600,
    padding: "3px 8px", borderRadius: 10,
    background: PRIORITY_CONFIG[priority]?.bg,
    color: PRIORITY_CONFIG[priority]?.color,
  }),
  // ── Activity feed ──
  activityItem: {
    display: "flex", alignItems: "flex-start",
    gap: 12, padding: "10px 16px",
    borderBottom: "1px solid #f8f9fa",
  },
  activityIcon: (color) => ({
    width: 32, height: 32, borderRadius: "50%",
    background: `${color}20`,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 14, flexShrink: 0,
  }),
  activityText: { fontSize: 12, color: "#444", lineHeight: 1.5 },
  activityTime: { fontSize: 10, color: "#aaa", marginTop: 3 },
  // ── Quick stats row ──
  quickStats: {
    display: "flex", gap: 8,
    padding: "12px 16px",
    borderBottom: "1px solid #f4f5f7",
    background: "#fafafa",
  },
  quickStat: (color, bg) => ({
    flex: 1, background: bg, borderRadius: 8,
    padding: "8px 10px", textAlign: "center",
  }),
  quickStatVal: (color) => ({ fontSize: 18, fontWeight: 700, color, display: "block" }),
  quickStatLabel: { fontSize: 10, color: "#888" },
};

// ── Portfolio totals ──────────────────────────────────────────────────────────
const totalUnits     = PROPERTIES.reduce((s, p) => s + p.units, 0);
const totalOccupied  = PROPERTIES.reduce((s, p) => s + p.occupied, 0);
const totalCollected = PROPERTIES.reduce((s, p) => s + p.collected, 0);
const totalOutstanding = PROPERTIES.reduce((s, p) => s + p.outstanding, 0);
const totalNOI       = PROPERTIES.reduce((s, p) => s + p.noi, 0);
const occupancyRate  = Math.round((totalOccupied / (totalUnits - 45)) * 100); // exclude dev units

export default function LandlordDashboard() {
  const navigate = useNavigate();
  const [activeNav, setActiveNav] = useState("dashboard");
  const [rentFilter, setRentFilter] = useState("all");

  const filteredRoll = rentFilter === "all"
    ? RENT_ROLL
    : RENT_ROLL.filter(r => r.status === rentFilter);

  const openMaintenance = MAINTENANCE.filter(m => m.status !== "resolved");

  return (
    <div style={s.app}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #f4f5f7; }
        tr:hover td { background: #fafafa; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #f1f1f1; }
        ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
      `}</style>

      {/* ── Sidebar ── */}
      <div style={s.sidebar}>
        <div style={s.sidebarLogo}>
          <div style={s.logoText}>🏢 Polaris PM</div>
          <div style={s.logoSub}>Property Management</div>
        </div>

        {NAV_ITEMS.map(item => (
          <div key={item.id} style={s.navItem(activeNav === item.id)} onClick={() => { setActiveNav(item.id); if (item.route) navigate(item.route); }}>
            <span style={s.navIcon}>{item.icon}</span>
            {item.label}
            {item.id === "maintenance" && openMaintenance.length > 0 && (
              <span style={{ marginLeft: "auto", background: "#E24B4A", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>
                {openMaintenance.length}
              </span>
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

      {/* ── Main content ── */}
      <div style={s.main}>

        {/* ── Top bar ── */}
        <div style={s.topBar}>
          <div>
            <div style={s.pageTitle}>Good morning, Andrew 👋</div>
            <div style={s.pageSub}>Here's your portfolio for {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
          </div>
          <div style={s.topBarRight}>
            <div style={s.notifBtn}>🔔</div>
            <button style={s.addBtn}>+ Add tenant</button>
          </div>
        </div>

        {/* ── Portfolio stat cards ── */}
        <div style={s.statGrid}>
          {[
            { label: "Collected this month", value: `$${totalCollected.toLocaleString()}`, sub: "of $22,200 expected", accent: "#185FA5", change: "+8% vs last month", positive: true },
            { label: "Outstanding", value: `$${totalOutstanding.toLocaleString()}`, sub: `${RENT_ROLL.filter(r => r.status === "late" || r.status === "pending").length} tenants`, accent: "#E24B4A", change: "2 overdue", positive: false },
            { label: "Occupancy", value: `${occupancyRate}%`, sub: `${totalOccupied} of ${totalUnits - 45} units`, accent: "#3B6D11", change: "2 vacancies", positive: false },
            { label: "Monthly NOI", value: `$${totalNOI.toLocaleString()}`, sub: "across 2 active properties", accent: "#854F0B", change: "+$420 vs May", positive: true },
          ].map((stat, i) => (
            <div key={i} style={s.statCard(stat.accent)}>
              <div style={s.statLabel}>{stat.label}</div>
              <div style={s.statValue}>{stat.value}</div>
              <div style={s.statSub}>{stat.sub}</div>
              <div style={s.statChange(stat.positive)}>{stat.positive ? "↑" : "↓"} {stat.change}</div>
            </div>
          ))}
        </div>

        {/* ── Properties ── */}
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>Properties</span>
          <button style={s.cardAction}>+ Add property</button>
        </div>
        <div style={s.threeCol}>
          {PROPERTIES.map(prop => {
            const occPct = prop.units > 0 ? Math.round((prop.occupied / prop.units) * 100) : 0;
            return (
              <div key={prop.id} style={s.propCard(prop.color, prop.bg)}>
                <div style={s.propHeader}>
                  <div>
                    <div style={s.propName}>{prop.name}</div>
                    <div style={s.propAddr}>{prop.address}</div>
                  </div>
                  <div style={s.propIcon(prop.bg)}>{prop.image}</div>
                </div>
                <div style={s.occupancyBar}>
                  <div style={s.occupancyFill(occPct, prop.color)} />
                </div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 4, marginBottom: 8 }}>
                  {prop.occupied}/{prop.units} units occupied · {occPct}%
                </div>
                <div style={s.propStats}>
                  <div style={s.propStat(prop.bg)}>
                    <div style={s.propStatVal(prop.color)}>${prop.collected.toLocaleString()}</div>
                    <div style={s.propStatLabel}>Collected</div>
                  </div>
                  <div style={s.propStat("#f8f9fa")}>
                    <div style={s.propStatVal("#1a1a1a")}>${prop.noi.toLocaleString()}</div>
                    <div style={s.propStatLabel}>NOI</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Rent Roll + Activity ── */}
        <div style={s.twoCol}>

          {/* Rent Roll */}
          <div style={s.card}>
            <div style={s.cardHeader}>
              <div>
                <div style={s.cardTitle}>Rent Roll — June 2026</div>
                <div style={s.cardSub}>{RENT_ROLL.filter(r => r.status === "paid").length} paid · {RENT_ROLL.filter(r => r.status === "pending" || r.status === "late").length} outstanding</div>
              </div>
              <button style={s.cardAction}>Export</button>
            </div>

            {/* Filter tabs */}
            <div style={{ display: "flex", gap: 4, padding: "10px 14px", borderBottom: "1px solid #f0f0f0" }}>
              {["all", "paid", "pending", "late", "vacant"].map(f => (
                <button
                  key={f}
                  onClick={() => setRentFilter(f)}
                  style={{
                    padding: "4px 10px", borderRadius: 6,
                    fontSize: 11, fontWeight: rentFilter === f ? 600 : 400,
                    background: rentFilter === f ? "#0C447C" : "#f4f5f7",
                    color: rentFilter === f ? "#fff" : "#666",
                    border: "none", cursor: "pointer",
                    fontFamily: "'Inter', 'Segoe UI', sans-serif",
                    textTransform: "capitalize",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>

            <div style={{ overflowY: "auto", maxHeight: 340 }}>
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
                  {filteredRoll.map(row => (
                    <tr key={row.id} style={{ cursor: "pointer" }}>
                      <td style={s.td}>
                        <div style={{ fontWeight: 600 }}>{row.unit}</div>
                        <div style={{ fontSize: 10, color: "#aaa" }}>{row.property.split(" ")[0]}</div>
                      </td>
                      <td style={s.td}>{row.tenant}</td>
                      <td style={{ ...s.td, textAlign: "right", fontWeight: 600 }}>${row.rent.toLocaleString()}</td>
                      <td style={s.td}>
                        <span style={s.statusBadge(row.status)}>{STATUS_CONFIG[row.status]?.label}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right column — maintenance + activity */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Maintenance queue */}
            <div style={s.card}>
              <div style={s.cardHeader}>
                <div>
                  <div style={s.cardTitle}>Maintenance Queue</div>
                  <div style={s.cardSub}>{openMaintenance.length} open requests</div>
                </div>
                <button style={s.cardAction}>View all</button>
              </div>
              {openMaintenance.map((m, i) => (
                <div key={m.id} style={{ padding: "10px 14px", borderBottom: i === openMaintenance.length - 1 ? "none" : "1px solid #f8f9fa", display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 2 }}>{m.issue}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{m.property} · Unit {m.unit} · {m.tenant}</div>
                    <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>Submitted {m.submitted}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                    <span style={s.priorityBadge(m.priority)}>{PRIORITY_CONFIG[m.priority].label}</span>
                    <span style={{ fontSize: 10, color: "#888", textTransform: "capitalize" }}>{m.status.replace("_", " ")}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Activity feed */}
            <div style={s.card}>
              <div style={s.cardHeader}>
                <div style={s.cardTitle}>Recent Activity</div>
                <button style={s.cardAction}>View all</button>
              </div>
              {ACTIVITY.map((a, i) => (
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
