import { useState } from "react";
import { useNavigate } from "react-router-dom";

const PROPERTIES = [
  {
    id: 1,
    name: "Clifton Manor",
    address: "12009 Clifton Blvd",
    city: "Lakewood, OH 44107",
    type: "Multifamily",
    yearBuilt: 1962,
    sqft: 8400,
    units: 12,
    occupied: 10,
    vacant: 2,
    image: "🏢",
    color: "#0C447C",
    bg: "#E6F1FB",
    monthlyRent: 13800,
    collected: 11500,
    outstanding: 2300,
    noi: 7200,
    expenses: 4300,
    openMaintenance: 2,
    capRate: 5.8,
    purchasePrice: 1015000,
    purchaseDate: "Aug 2024",
    currentValue: 1380000,
    loanBalance: 1450000,
    insurance: "Nationwide",
    insuranceExpiry: "Dec 31, 2026",
    units_list: [
      { unit: "1A", tenant: "James W.",  rent: 1150, status: "paid",    leaseEnd: "Dec 31, 2026" },
      { unit: "1B", tenant: "Sarah M.",  rent: 1150, status: "paid",    leaseEnd: "Dec 31, 2026" },
      { unit: "2A", tenant: "Jordan K.", rent: 1200, status: "paid",    leaseEnd: "Dec 31, 2026" },
      { unit: "2B", tenant: "Priya M.",  rent: 1150, status: "late",    leaseEnd: "Sep 30, 2026" },
      { unit: "3A", tenant: "Maria R.",  rent: 1150, status: "paid",    leaseEnd: "Dec 31, 2026" },
      { unit: "3B", tenant: "Alex T.",   rent: 1150, status: "pending", leaseEnd: "Dec 31, 2026" },
      { unit: "4A", tenant: "Sam P.",    rent: 1200, status: "paid",    leaseEnd: "Jun 30, 2026" },
      { unit: "4B", tenant: "Chris L.",  rent: 1150, status: "pending", leaseEnd: "Dec 31, 2026" },
      { unit: "5A", tenant: "Diana F.",  rent: 1150, status: "paid",    leaseEnd: "Dec 31, 2026" },
      { unit: "5B", tenant: "Marcus B.", rent: 1150, status: "paid",    leaseEnd: "Jan 31, 2027" },
      { unit: "6A", tenant: "—",         rent: 1150, status: "vacant",  leaseEnd: "—" },
      { unit: "6B", tenant: "—",         rent: 1150, status: "vacant",  leaseEnd: "—" },
    ],
  },
  {
    id: 2,
    name: "944 18th Ave S",
    address: "944 18th Ave S",
    city: "St. Petersburg, FL 33705",
    type: "Mixed Use",
    yearBuilt: 1955,
    sqft: 3200,
    units: 6,
    occupied: 4,
    vacant: 2,
    image: "🏖️",
    color: "#3B6D11",
    bg: "#EAF3DE",
    monthlyRent: 8400,
    collected: 7050,
    outstanding: 1350,
    noi: 4800,
    expenses: 2250,
    openMaintenance: 1,
    capRate: 6.2,
    purchasePrice: 680000,
    purchaseDate: "Jun 2023",
    currentValue: 780000,
    loanBalance: 640000,
    insurance: "Nationwide",
    insuranceExpiry: "May 31, 2027",
    units_list: [
      { unit: "Main",    tenant: "Kaidyn T.", rent: 2200, status: "paid",    leaseEnd: "Dec 31, 2026" },
      { unit: "ADU",     tenant: "Airbnb",    rent: 1350, status: "paid",    leaseEnd: "Rolling" },
      { unit: "New 1A",  tenant: "Pending",   rent: 1600, status: "pending", leaseEnd: "—" },
      { unit: "New 1B",  tenant: "Pending",   rent: 1600, status: "pending", leaseEnd: "—" },
      { unit: "New 1C",  tenant: "—",         rent: 1600, status: "vacant",  leaseEnd: "—" },
      { unit: "New 1D",  tenant: "—",         rent: 1600, status: "vacant",  leaseEnd: "—" },
    ],
  },
  {
    id: 3,
    name: "Columbus Portfolio",
    address: "3021 N High St",
    city: "Columbus, OH 43202",
    type: "Mixed Use — Development",
    yearBuilt: null,
    sqft: null,
    units: 45,
    occupied: 0,
    vacant: 45,
    image: "🏗️",
    color: "#854F0B",
    bg: "#FAEEDA",
    monthlyRent: 0,
    collected: 0,
    outstanding: 0,
    noi: 0,
    expenses: 0,
    openMaintenance: 0,
    capRate: null,
    purchasePrice: null,
    purchaseDate: "In due diligence",
    currentValue: null,
    loanBalance: 0,
    insurance: "—",
    insuranceExpiry: "—",
    units_list: [],
  },
];

const STATUS_CONFIG = {
  paid:    { label: "Paid",    color: "#3B6D11", bg: "#EAF3DE" },
  pending: { label: "Pending", color: "#854F0B", bg: "#FAEEDA" },
  late:    { label: "Late",    color: "#A32D2D", bg: "#FDECEA" },
  vacant:  { label: "Vacant",  color: "#888",    bg: "#f4f5f7" },
};

const NAV_ITEMS = [
  { icon: "📊", label: "Dashboard",   route: "/landlord" },
  { icon: "🏢", label: "Properties",  route: "/landlord/properties" },
  { icon: "👥", label: "Tenants",     route: "/landlord/tenants" },
  { icon: "💰", label: "Rent Roll",   route: "/landlord/rentroll" },
  { icon: "🔧", label: "Maintenance", route: "/landlord/maintenance" },
  { icon: "📈", label: "Financials",  route: "/landlord/financials" },
  { icon: "💬", label: "Messages",    route: "/landlord/messages" },
  { icon: "⚙️", label: "Settings",   route: "/landlord/settings" },
];

const s = {
  app: { display: "flex", fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: 14, color: "#1a1a1a", background: "#f4f5f7", minHeight: "100vh" },
  sidebar: { width: 220, background: "#0C1F3F", minHeight: "100vh", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh" },
  sidebarLogo: { padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 8 },
  logoText: { fontSize: 15, fontWeight: 700, color: "#fff" },
  logoSub: { fontSize: 10, color: "#5B7FA6", marginTop: 2 },
  navItem: (active) => ({ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: active ? "rgba(255,255,255,0.1)" : "transparent", borderLeft: active ? "3px solid #378ADD" : "3px solid transparent", cursor: "pointer", color: active ? "#fff" : "#7A9CC4", fontSize: 13, fontWeight: active ? 600 : 400 }),
  sidebarFooter: { marginTop: "auto", padding: "16px", borderTop: "1px solid rgba(255,255,255,0.08)" },
  sidebarUser: { display: "flex", alignItems: "center", gap: 10 },
  sidebarAvatar: { width: 32, height: 32, borderRadius: "50%", background: "#185FA5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 },
  sidebarName: { fontSize: 12, fontWeight: 600, color: "#fff" },
  sidebarRole: { fontSize: 10, color: "#5B7FA6" },
  main: { flex: 1, padding: "28px", overflowY: "auto" },
  topBar: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  pageTitle: { fontSize: 22, fontWeight: 700 },
  pageSub: { fontSize: 13, color: "#888", marginTop: 2 },
  btn: (primary) => ({ padding: "9px 16px", background: primary ? "#0C447C" : "#fff", color: primary ? "#fff" : "#1a1a1a", border: primary ? "none" : "1px solid #e8eaed", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", gap: 6 }),
  // Portfolio KPI row
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 28 },
  kpiCard: (accent) => ({ background: "#fff", border: "1px solid #e8eaed", borderRadius: 10, padding: "14px 16px", borderTop: `3px solid ${accent}` }),
  kpiLabel: { fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 },
  kpiValue: { fontSize: 26, fontWeight: 700, color: "#1a1a1a" },
  kpiSub: { fontSize: 11, color: "#888", marginTop: 2 },
  // Property cards
  propGrid: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20, marginBottom: 24 },
  propCard: (color) => ({ background: "#fff", border: "1px solid #e8eaed", borderRadius: 14, overflow: "hidden", cursor: "pointer", transition: "box-shadow 0.15s", borderTop: `3px solid ${color}` }),
  propCardHeader: (color, bg) => ({ background: bg, padding: "18px 18px 14px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }),
  propIcon: { fontSize: 32 },
  propName: (color) => ({ fontSize: 15, fontWeight: 700, color }),
  propAddr: { fontSize: 12, color: "#555", marginTop: 2 },
  propType: { fontSize: 10, fontWeight: 600, color: "#888", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.05em" },
  propDevBadge: { fontSize: 10, fontWeight: 600, padding: "3px 8px", background: "#FAEEDA", color: "#854F0B", borderRadius: 10 },
  propBody: { padding: "14px 18px 16px" },
  occupancyWrap: { marginBottom: 14 },
  occupancyRow: { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", marginBottom: 5 },
  occupancyBar: { height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" },
  occupancyFill: (pct, color) => ({ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }),
  kpiGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 },
  miniKpi: (color, bg) => ({ background: bg, borderRadius: 8, padding: "9px 10px", textAlign: "center" }),
  miniKpiVal: (color) => ({ fontSize: 16, fontWeight: 700, color }),
  miniKpiLabel: { fontSize: 10, color: "#888", marginTop: 2 },
  propFooter: { display: "flex", gap: 8, paddingTop: 12, borderTop: "1px solid #f4f5f7" },
  propBtn: { flex: 1, padding: "7px 0", background: "#f8f9fa", border: "1px solid #e8eaed", borderRadius: 8, fontSize: 11, fontWeight: 600, color: "#555", cursor: "pointer", fontFamily: "'Inter',sans-serif", textAlign: "center" },
  propBtnPrimary: { flex: 1, padding: "7px 0", background: "#E6F1FB", border: "1px solid #B5D4F4", borderRadius: 8, fontSize: 11, fontWeight: 600, color: "#185FA5", cursor: "pointer", fontFamily: "'Inter',sans-serif', textAlign: 'center'" },
  alertDot: { width: 8, height: 8, borderRadius: "50%", background: "#E24B4A", display: "inline-block", marginRight: 4 },
  // Detail panel overlay
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", justifyContent: "flex-end" },
  detailPanel: { width: 560, background: "#fff", height: "100vh", overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.15)" },
  detailHeader: (color, bg) => ({ background: bg, padding: "20px 24px 18px", borderBottom: `3px solid ${color}` }),
  detailName: (color) => ({ fontSize: 20, fontWeight: 700, color, marginBottom: 3 }),
  detailAddr: { fontSize: 13, color: "#555", marginBottom: 10 },
  detailMetaRow: { display: "flex", gap: 12, flexWrap: "wrap" },
  detailMetaItem: { fontSize: 11, color: "#888", display: "flex", alignItems: "center", gap: 4 },
  detailBody: { padding: "20px 24px" },
  tabs: { display: "flex", borderBottom: "2px solid #e8eaed", marginBottom: 20 },
  tab: (active) => ({ padding: "9px 16px", fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#0C447C" : "#888", cursor: "pointer", background: "none", border: "none", borderBottom: active ? "2px solid #0C447C" : "2px solid transparent", marginBottom: -2, fontFamily: "'Inter',sans-serif" }),
  sectionTitle: { fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 },
  infoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 },
  infoBox: { background: "#f8f9fa", borderRadius: 8, padding: "10px 12px" },
  infoBoxLabel: { fontSize: 11, color: "#888", marginBottom: 3 },
  infoBoxVal: { fontSize: 14, fontWeight: 700, color: "#1a1a1a" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #f0f0f0", background: "#fafafa" },
  td: { fontSize: 13, padding: "10px 12px", borderBottom: "1px solid #f8f9fa", color: "#1a1a1a" },
  statusBadge: (status) => ({ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: STATUS_CONFIG[status]?.bg, color: STATUS_CONFIG[status]?.color }),
};

export default function LandlordProperties() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [detailTab, setDetailTab] = useState("Overview");

  const totalUnits    = PROPERTIES.reduce((s, p) => s + p.units, 0);
  const totalOccupied = PROPERTIES.reduce((s, p) => s + p.occupied, 0);
  const totalNOI      = PROPERTIES.reduce((s, p) => s + p.noi, 0);
  const totalValue    = PROPERTIES.reduce((s, p) => s + (p.currentValue || 0), 0);

  const prop = selected ? PROPERTIES.find(p => p.id === selected) : null;

  return (
    <div style={s.app}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }`}</style>

      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.sidebarLogo}>
          <div style={s.logoText}>🏢 Polaris PM</div>
          <div style={s.logoSub}>Property Management</div>
        </div>
        {NAV_ITEMS.map(item => (
          <div key={item.route} style={s.navItem(item.label === "Properties")} onClick={() => navigate(item.route)}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>{item.label}
          </div>
        ))}
        <div style={s.sidebarFooter}>
          <div style={s.sidebarUser}>
            <div style={s.sidebarAvatar}>AW</div>
            <div><div style={s.sidebarName}>Andrew Wagner</div><div style={s.sidebarRole}>Portfolio Owner</div></div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={s.main}>
        <div style={s.topBar}>
          <div>
            <div style={s.pageTitle}>Properties</div>
            <div style={s.pageSub}>{PROPERTIES.length} properties · {totalUnits} total units</div>
          </div>
          <button style={s.btn(true)}>+ Add property</button>
        </div>

        {/* Portfolio KPIs */}
        <div style={s.kpiRow}>
          {[
            { label: "Portfolio value",   value: `$${(totalValue/1000000).toFixed(2)}M`, sub: "2 active properties",    accent: "#0C447C" },
            { label: "Total units",        value: totalUnits,                              sub: `${totalOccupied} occupied`, accent: "#185FA5" },
            { label: "Portfolio NOI/mo",   value: `$${totalNOI.toLocaleString()}`,         sub: "active properties only",   accent: "#3B6D11" },
            { label: "Avg occupancy",      value: `${Math.round((totalOccupied / (totalUnits - 45)) * 100)}%`, sub: "excl. development", accent: "#854F0B" },
          ].map((k, i) => (
            <div key={i} style={s.kpiCard(k.accent)}>
              <div style={s.kpiLabel}>{k.label}</div>
              <div style={s.kpiValue}>{k.value}</div>
              <div style={s.kpiSub}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Property cards */}
        <div style={s.propGrid}>
          {PROPERTIES.map(prop => {
            const occPct = prop.units > 0 ? Math.round((prop.occupied / prop.units) * 100) : 0;
            const isDev  = prop.purchaseDate === "In due diligence";
            return (
              <div key={prop.id} style={s.propCard(prop.color)} onClick={() => setSelected(prop.id)}>
                <div style={s.propCardHeader(prop.color, prop.bg)}>
                  <div>
                    <div style={s.propName(prop.color)}>{prop.name}</div>
                    <div style={s.propAddr}>{prop.address}</div>
                    <div style={s.propAddr}>{prop.city}</div>
                    <div style={s.propType}>{prop.type}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <span style={{ fontSize: 32 }}>{prop.image}</span>
                    {isDev && <span style={s.propDevBadge}>Development</span>}
                  </div>
                </div>

                <div style={s.propBody}>
                  {/* Occupancy bar */}
                  <div style={s.occupancyWrap}>
                    <div style={s.occupancyRow}>
                      <span>{prop.occupied}/{prop.units} units occupied</span>
                      <span style={{ fontWeight: 600, color: prop.color }}>{occPct}%</span>
                    </div>
                    <div style={s.occupancyBar}>
                      <div style={s.occupancyFill(occPct, prop.color)} />
                    </div>
                  </div>

                  {/* KPI grid */}
                  {!isDev ? (
                    <div style={s.kpiGrid}>
                      <div style={s.miniKpi(prop.color, prop.bg)}>
                        <div style={s.miniKpiVal(prop.color)}>${prop.collected.toLocaleString()}</div>
                        <div style={s.miniKpiLabel}>Collected/mo</div>
                      </div>
                      <div style={s.miniKpi("#1a1a1a", "#f8f9fa")}>
                        <div style={s.miniKpiVal("#1a1a1a")}>${prop.noi.toLocaleString()}</div>
                        <div style={s.miniKpiLabel}>NOI/mo</div>
                      </div>
                      <div style={s.miniKpi(prop.outstanding > 0 ? "#A32D2D" : "#3B6D11", prop.outstanding > 0 ? "#FDECEA" : "#EAF3DE")}>
                        <div style={s.miniKpiVal(prop.outstanding > 0 ? "#A32D2D" : "#3B6D11")}>${prop.outstanding.toLocaleString()}</div>
                        <div style={s.miniKpiLabel}>Outstanding</div>
                      </div>
                      <div style={s.miniKpi(prop.openMaintenance > 0 ? "#854F0B" : "#3B6D11", prop.openMaintenance > 0 ? "#FAEEDA" : "#EAF3DE")}>
                        <div style={s.miniKpiVal(prop.openMaintenance > 0 ? "#854F0B" : "#3B6D11")}>{prop.openMaintenance}</div>
                        <div style={s.miniKpiLabel}>Open tickets</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: "#FAEEDA", borderRadius: 8, padding: "12px", textAlign: "center", marginBottom: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#854F0B" }}>🏗️ In due diligence</div>
                      <div style={{ fontSize: 11, color: "#854F0B", marginTop: 3 }}>45-unit entitlement · UGN-1 zoning · 3021 N High St</div>
                    </div>
                  )}

                  <div style={s.propFooter}>
                    <button style={s.propBtnPrimary} onClick={e => { e.stopPropagation(); setSelected(prop.id); setDetailTab("Units"); }}>View units</button>
                    <button style={s.propBtn} onClick={e => { e.stopPropagation(); navigate("/landlord/financials"); }}>Financials</button>
                    <button style={s.propBtn} onClick={e => { e.stopPropagation(); navigate("/landlord/maintenance"); }}>Maintenance</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Detail slide-out panel ── */}
      {prop && (
        <div style={s.overlay} onClick={() => setSelected(null)}>
          <div style={s.detailPanel} onClick={e => e.stopPropagation()}>

            <div style={s.detailHeader(prop.color, prop.bg)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={s.detailName(prop.color)}>{prop.image} {prop.name}</div>
                  <div style={s.detailAddr}>{prop.address}, {prop.city}</div>
                  <div style={s.detailMetaRow}>
                    {[
                      { icon: "🏠", text: prop.type },
                      prop.yearBuilt && { icon: "📅", text: `Built ${prop.yearBuilt}` },
                      prop.sqft && { icon: "📐", text: `${prop.sqft.toLocaleString()} sqft` },
                      { icon: "🏢", text: `${prop.units} units` },
                    ].filter(Boolean).map((m, i) => (
                      <span key={i} style={s.detailMetaItem}>{m.icon} {m.text}</span>
                    ))}
                  </div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: "rgba(0,0,0,0.1)", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 13, color: "#555" }}>✕</button>
              </div>
            </div>

            <div style={s.detailBody}>
              <div style={s.tabs}>
                {["Overview", "Units", "Financials", "Documents"].map(tab => (
                  <button key={tab} style={s.tab(detailTab === tab)} onClick={() => setDetailTab(tab)}>{tab}</button>
                ))}
              </div>

              {/* Overview tab */}
              {detailTab === "Overview" && (
                <>
                  <div style={s.sectionTitle}>Property details</div>
                  <div style={s.infoGrid}>
                    {[
                      ["Purchase price",  prop.purchasePrice ? `$${prop.purchasePrice.toLocaleString()}` : "—"],
                      ["Purchase date",   prop.purchaseDate],
                      ["Current value",   prop.currentValue ? `$${prop.currentValue.toLocaleString()}` : "—"],
                      ["Loan balance",    `$${prop.loanBalance.toLocaleString()}`],
                      ["Cap rate",        prop.capRate ? `${prop.capRate}%` : "—"],
                      ["Equity",          prop.currentValue ? `$${(prop.currentValue - prop.loanBalance).toLocaleString()}` : "—"],
                      ["Insurance",       prop.insurance],
                      ["Ins. expiry",     prop.insuranceExpiry],
                    ].map(([k, v]) => (
                      <div key={k} style={s.infoBox}>
                        <div style={s.infoBoxLabel}>{k}</div>
                        <div style={s.infoBoxVal}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={s.sectionTitle}>Monthly performance</div>
                  <div style={s.infoGrid}>
                    {[
                      ["Gross rent roll", `$${prop.monthlyRent.toLocaleString()}`, "#185FA5"],
                      ["Collected",       `$${prop.collected.toLocaleString()}`,   "#3B6D11"],
                      ["Outstanding",     `$${prop.outstanding.toLocaleString()}`, "#A32D2D"],
                      ["NOI",             `$${prop.noi.toLocaleString()}`,         "#0C447C"],
                    ].map(([k, v, c]) => (
                      <div key={k} style={s.infoBox}>
                        <div style={s.infoBoxLabel}>{k}</div>
                        <div style={{ ...s.infoBoxVal, color: c }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={{ ...s.btn(true), flex: 1, justifyContent: "center" }} onClick={() => navigate("/landlord/financials")}>View full financials →</button>
                    <button style={{ ...s.btn(false), flex: 1, justifyContent: "center" }} onClick={() => navigate("/landlord/tenants")}>View tenants →</button>
                  </div>
                </>
              )}

              {/* Units tab */}
              {detailTab === "Units" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={s.sectionTitle}>Unit roster — {prop.units_list.length} units</div>
                    <button style={{ ...s.btn(true), padding: "6px 12px", fontSize: 11 }}>+ Add unit</button>
                  </div>
                  {prop.units_list.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "30px", color: "#aaa", fontSize: 13 }}>🏗️ No units yet — in development</div>
                  ) : (
                    <table style={s.table}>
                      <thead>
                        <tr>
                          {["Unit", "Tenant", "Rent", "Status", "Lease ends"].map(h => (
                            <th key={h} style={s.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {prop.units_list.map((u, i) => (
                          <tr key={i} style={{ cursor: "pointer" }}>
                            <td style={{ ...s.td, fontWeight: 600 }}>{u.unit}</td>
                            <td style={s.td}>{u.tenant}</td>
                            <td style={{ ...s.td, fontWeight: 600 }}>${u.rent.toLocaleString()}</td>
                            <td style={s.td}><span style={s.statusBadge(u.status)}>{STATUS_CONFIG[u.status]?.label}</span></td>
                            <td style={{ ...s.td, fontSize: 12, color: "#888" }}>{u.leaseEnd}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}

              {/* Financials tab */}
              {detailTab === "Financials" && (
                <>
                  <div style={s.sectionTitle}>Financial summary</div>
                  {[
                    ["Gross monthly rent",  `$${prop.monthlyRent.toLocaleString()}`,  "#3B6D11"],
                    ["Monthly expenses",    `$${prop.expenses.toLocaleString()}`,     "#A32D2D"],
                    ["Monthly NOI",         `$${prop.noi.toLocaleString()}`,          "#0C447C"],
                    ["Annual NOI",          `$${(prop.noi * 12).toLocaleString()}`,   "#0C447C"],
                    ["Cap rate",            prop.capRate ? `${prop.capRate}%` : "—",  "#854F0B"],
                    ["Implied value",       prop.capRate && prop.noi ? `$${Math.round((prop.noi * 12 / (prop.capRate / 100))).toLocaleString()}` : "—", "#185FA5"],
                  ].map(([k, v, c], i, arr) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: i === arr.length - 1 ? "none" : "1px solid #f4f5f7" }}>
                      <span style={{ fontSize: 13, color: "#888" }}>{k}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</span>
                    </div>
                  ))}
                  <button style={{ ...s.btn(true), width: "100%", justifyContent: "center", marginTop: 16 }} onClick={() => navigate("/landlord/financials")}>
                    Open full financials & DSCR →
                  </button>
                </>
              )}

              {/* Documents tab */}
              {detailTab === "Documents" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={s.sectionTitle}>Property documents</div>
                    <button style={{ ...s.btn(true), padding: "6px 12px", fontSize: 11 }}>+ Upload</button>
                  </div>
                  {[
                    { icon: "📋", name: "Purchase Agreement",      date: prop.purchaseDate,    size: "2.4 MB" },
                    { icon: "🏦", name: "Mortgage Documents",       date: prop.purchaseDate,    size: "5.1 MB" },
                    { icon: "🛡️", name: "Property Insurance Policy", date: "Updated Jan 2026",  size: "1.2 MB" },
                    { icon: "📐", name: "Floor Plans",               date: "Original",           size: "8.3 MB" },
                    { icon: "🔍", name: "Inspection Report",         date: prop.purchaseDate,    size: "3.7 MB" },
                  ].map((doc, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f8f9fa" }}>
                      <span style={{ fontSize: 22 }}>{doc.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{doc.name}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>{doc.date} · {doc.size}</div>
                      </div>
                      <button style={{ ...s.btn(false), padding: "5px 10px", fontSize: 11 }}>View</button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
