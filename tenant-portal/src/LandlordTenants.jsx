import { useState } from "react";
import { useNavigate } from "react-router-dom";

const TENANTS = [
  { id: 1,  name: "James W.",    email: "james@email.com",   phone: "(216) 555-0101", property: "Clifton Manor",  unit: "1A", rent: 1150, status: "current",  leaseEnd: "2026-12-31", balance: 0,    lastPaid: "May 31", avatar: "JW", color: "#185FA5", bg: "#E6F1FB", moveIn: "Jan 1, 2025" },
  { id: 2,  name: "Sarah M.",    email: "sarah@email.com",   phone: "(216) 555-0102", property: "Clifton Manor",  unit: "1B", rent: 1150, status: "current",  leaseEnd: "2026-12-31", balance: 0,    lastPaid: "Jun 1",  avatar: "SM", color: "#3B6D11", bg: "#EAF3DE", moveIn: "Mar 1, 2025" },
  { id: 3,  name: "Jordan K.",   email: "jordan@email.com",  phone: "(216) 555-0103", property: "Clifton Manor",  unit: "2A", rent: 1200, status: "current",  leaseEnd: "2026-12-31", balance: 0,    lastPaid: "Jun 1",  avatar: "JK", color: "#854F0B", bg: "#FAEEDA", moveIn: "Jan 1, 2026" },
  { id: 4,  name: "Priya M.",    email: "priya@email.com",   phone: "(216) 555-0104", property: "Clifton Manor",  unit: "2B", rent: 1150, status: "late",     leaseEnd: "2026-09-30", balance: 1150, lastPaid: "May 1",  avatar: "PM", color: "#A32D2D", bg: "#FDECEA", moveIn: "Oct 1, 2025" },
  { id: 5,  name: "Maria R.",    email: "maria@email.com",   phone: "(614) 555-0192", property: "Clifton Manor",  unit: "3A", rent: 1150, status: "current",  leaseEnd: "2026-12-31", balance: 0,    lastPaid: "Jun 1",  avatar: "MR", color: "#185FA5", bg: "#E6F1FB", moveIn: "Jan 1, 2026" },
  { id: 6,  name: "Alex T.",     email: "alex@email.com",    phone: "(216) 555-0106", property: "Clifton Manor",  unit: "3B", rent: 1150, status: "pending",  leaseEnd: "2026-12-31", balance: 1150, lastPaid: "May 1",  avatar: "AT", color: "#6B3FA0", bg: "#F3EEFB", moveIn: "Feb 1, 2026" },
  { id: 7,  name: "Sam P.",      email: "sam@email.com",     phone: "(216) 555-0107", property: "Clifton Manor",  unit: "4A", rent: 1200, status: "current",  leaseEnd: "2026-06-30", balance: 0,    lastPaid: "Jun 2",  avatar: "SP", color: "#854F0B", bg: "#FAEEDA", moveIn: "Jul 1, 2025" },
  { id: 8,  name: "Chris L.",    email: "chris@email.com",   phone: "(216) 555-0108", property: "Clifton Manor",  unit: "4B", rent: 1150, status: "pending",  leaseEnd: "2026-12-31", balance: 1150, lastPaid: "May 3",  avatar: "CL", color: "#3B6D11", bg: "#EAF3DE", moveIn: "Jan 1, 2026" },
  { id: 9,  name: "Diana F.",    email: "diana@email.com",   phone: "(216) 555-0109", property: "Clifton Manor",  unit: "5A", rent: 1150, status: "current",  leaseEnd: "2026-12-31", balance: 0,    lastPaid: "Jun 1",  avatar: "DF", color: "#185FA5", bg: "#E6F1FB", moveIn: "Jan 1, 2026" },
  { id: 10, name: "Marcus B.",   email: "marcus@email.com",  phone: "(216) 555-0110", property: "Clifton Manor",  unit: "5B", rent: 1150, status: "current",  leaseEnd: "2027-01-31", balance: 0,    lastPaid: "Jun 1",  avatar: "MB", color: "#6B3FA0", bg: "#F3EEFB", moveIn: "Feb 1, 2026" },
  { id: 11, name: "Kaidyn T.",   email: "kaidyn@email.com",  phone: "(727) 555-0111", property: "944 18th Ave S", unit: "Main", rent: 2200, status: "current", leaseEnd: "2026-12-31", balance: 0,   lastPaid: "Jun 1",  avatar: "KT", color: "#3B6D11", bg: "#EAF3DE", moveIn: "Apr 1, 2026" },
  { id: 12, name: "Airbnb",      email: "—",                 phone: "—",              property: "944 18th Ave S", unit: "ADU",  rent: 1350, status: "current", leaseEnd: "Rolling",    balance: 0,   lastPaid: "Rolling", avatar: "AB", color: "#854F0B", bg: "#FAEEDA", moveIn: "Jan 1, 2026" },
];

const STATUS_CONFIG = {
  current: { label: "Current",  color: "#3B6D11", bg: "#EAF3DE" },
  pending: { label: "Pending",  color: "#854F0B", bg: "#FAEEDA" },
  late:    { label: "Late",     color: "#A32D2D", bg: "#FDECEA" },
  notice:  { label: "Notice",   color: "#6B3FA0", bg: "#F3EEFB" },
};

const PROPERTIES = ["All Properties", "Clifton Manor", "944 18th Ave S"];

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
  app: { display: "flex", fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: 14, color: "#1a1a1a", background: "#f4f5f7", minHeight: "100vh" },
  sidebar: { width: 220, background: "#0C1F3F", minHeight: "100vh", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto" },
  sidebarLogo: { padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 8 },
  logoText: { fontSize: 15, fontWeight: 700, color: "#fff" },
  logoSub: { fontSize: 10, color: "#5B7FA6", marginTop: 2 },
  navItem: (active) => ({ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: active ? "rgba(255,255,255,0.1)" : "transparent", borderLeft: active ? "3px solid #378ADD" : "3px solid transparent", cursor: "pointer", color: active ? "#fff" : "#7A9CC4", fontSize: 13, fontWeight: active ? 600 : 400 }),
  navIcon: { fontSize: 16, flexShrink: 0 },
  sidebarFooter: { marginTop: "auto", padding: "16px", borderTop: "1px solid rgba(255,255,255,0.08)" },
  sidebarUser: { display: "flex", alignItems: "center", gap: 10, cursor: "pointer" },
  sidebarAvatar: { width: 32, height: 32, borderRadius: "50%", background: "#185FA5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  sidebarName: { fontSize: 12, fontWeight: 600, color: "#fff" },
  sidebarRole: { fontSize: 10, color: "#5B7FA6" },
  main: { flex: 1, padding: "28px 28px", overflowY: "auto" },
  topBar: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  pageTitle: { fontSize: 22, fontWeight: 700, color: "#1a1a1a" },
  pageSub: { fontSize: 13, color: "#888", marginTop: 2 },
  topBarRight: { display: "flex", alignItems: "center", gap: 10 },
  addBtn: { padding: "9px 16px", background: "#0C447C", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "'Inter',sans-serif" },
  searchBar: { display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e8eaed", borderRadius: 8, padding: "8px 12px", width: 240 },
  searchInput: { flex: 1, border: "none", outline: "none", fontSize: 13, fontFamily: "'Inter',sans-serif", color: "#1a1a1a", background: "transparent" },
  filterRow: { display: "flex", gap: 8, marginBottom: 20, alignItems: "center" },
  filterSelect: { padding: "8px 12px", border: "1px solid #e8eaed", borderRadius: 8, fontSize: 13, background: "#fff", color: "#1a1a1a", outline: "none", fontFamily: "'Inter',sans-serif", cursor: "pointer" },
  statRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 },
  statCard: (accent) => ({ background: "#fff", border: "1px solid #e8eaed", borderRadius: 10, padding: "14px 16px", borderTop: `3px solid ${accent}` }),
  statLabel: { fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 },
  statValue: { fontSize: 24, fontWeight: 700, color: "#1a1a1a" },
  statSub: { fontSize: 11, color: "#888", marginTop: 2 },
  card: { background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", padding: "10px 16px", textAlign: "left", borderBottom: "1px solid #f0f0f0", background: "#fafafa", whiteSpace: "nowrap" },
  td: { fontSize: 13, color: "#1a1a1a", padding: "12px 16px", borderBottom: "1px solid #f8f9fa", verticalAlign: "middle" },
  avatar: (color, bg) => ({ width: 34, height: 34, borderRadius: "50%", background: bg, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }),
  tenantName: { fontSize: 13, fontWeight: 600, color: "#1a1a1a" },
  tenantEmail: { fontSize: 11, color: "#888", marginTop: 1 },
  statusBadge: (status) => ({ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: STATUS_CONFIG[status]?.bg || "#f4f5f7", color: STATUS_CONFIG[status]?.color || "#555", whiteSpace: "nowrap" }),
  leaseBadge: (daysLeft) => ({ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: daysLeft < 60 ? "#FAEEDA" : "#EAF3DE", color: daysLeft < 60 ? "#854F0B" : "#3B6D11" }),
  balanceText: (balance) => ({ fontSize: 13, fontWeight: 600, color: balance > 0 ? "#A32D2D" : "#3B6D11" }),
  actionBtn: { padding: "5px 10px", background: "#f4f5f7", border: "1px solid #e8eaed", borderRadius: 6, fontSize: 11, fontWeight: 600, color: "#555", cursor: "pointer", fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" },
  actionBtnPrimary: { padding: "5px 10px", background: "#E6F1FB", border: "1px solid #B5D4F4", borderRadius: 6, fontSize: 11, fontWeight: 600, color: "#185FA5", cursor: "pointer", fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" },
  emptyState: { textAlign: "center", padding: "40px 20px", color: "#aaa" },
};

function daysUntil(dateStr) {
  if (dateStr === "Rolling") return 999;
  const d = new Date(dateStr);
  return Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
}

export default function LandlordTenants() {
  const navigate = useNavigate();
  const [search, setSearch]     = useState("");
  const [propFilter, setPropFilter] = useState("All Properties");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [sortCol, setSortCol] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  function sortIcon(col) {
    if (sortCol !== col) return <span style={{ color: '#ccc', marginLeft: 3 }}>↕</span>;
    return <span style={{ color: '#185FA5', marginLeft: 3 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  const filtered = TENANTS.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
                        t.unit.toLowerCase().includes(search.toLowerCase()) ||
                        t.email.toLowerCase().includes(search.toLowerCase());
    const matchProp   = propFilter === "All Properties" || t.property === propFilter;
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchProp && matchStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    let aVal, bVal;
    if (sortCol === 'name')     { aVal = a.name;    bVal = b.name; }
    if (sortCol === 'property') { aVal = a.property + a.unit; bVal = b.property + b.unit; }
    if (sortCol === 'rent')     { aVal = a.rent;    bVal = b.rent; }
    if (sortCol === 'status')   { aVal = a.status;  bVal = b.status; }
    if (sortCol === 'balance')  { aVal = a.balance; bVal = b.balance; }
    if (sortCol === 'lease')    { aVal = daysUntil(a.leaseEnd); bVal = daysUntil(b.leaseEnd); }
    if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const stats = [
    { label: "Total tenants",   value: TENANTS.length,                                              sub: "across all properties", accent: "#185FA5" },
    { label: "Current",         value: TENANTS.filter(t => t.status === "current").length,          sub: "paid & up to date",     accent: "#3B6D11" },
    { label: "Outstanding",     value: TENANTS.filter(t => t.status === "late" || t.status === "pending").length, sub: "need follow-up", accent: "#E24B4A" },
    { label: "Leases expiring", value: TENANTS.filter(t => daysUntil(t.leaseEnd) < 90 && daysUntil(t.leaseEnd) > 0).length, sub: "within 90 days", accent: "#854F0B" },
  ];

  return (
    <div style={s.app}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; } tr:hover td { background: #fafafa; cursor: pointer; } ::-webkit-scrollbar { width: 6px; height: 6px; } ::-webkit-scrollbar-track { background: #f1f1f1; } ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }`}</style>

      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.sidebarLogo}>
          <div style={s.logoText}>🏢 Polaris PM</div>
          <div style={s.logoSub}>Property Management</div>
        </div>
        {NAV_ITEMS.map(item => (
          <div key={item.id} style={s.navItem(item.id === "tenants")} onClick={() => navigate(item.route)}>
            <span style={s.navIcon}>{item.icon}</span>
            {item.label}
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
        <div style={s.topBar}>
          <div>
            <div style={s.pageTitle}>Tenants</div>
            <div style={s.pageSub}>{TENANTS.length} tenants across {PROPERTIES.length - 1} properties</div>
          </div>
          <div style={s.topBarRight}>
            <div style={s.searchBar}>
              <span style={{ fontSize: 14 }}>🔍</span>
              <input style={s.searchInput} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, unit, email…" />
            </div>
            <button style={s.addBtn}>+ Add tenant</button>
          </div>
        </div>

        {/* Stats */}
        <div style={s.statRow}>
          {stats.map((stat, i) => (
            <div key={i} style={s.statCard(stat.accent)}>
              <div style={s.statLabel}>{stat.label}</div>
              <div style={s.statValue}>{stat.value}</div>
              <div style={s.statSub}>{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={s.filterRow}>
          <select style={s.filterSelect} value={propFilter} onChange={e => setPropFilter(e.target.value)}>
            {PROPERTIES.map(p => <option key={p}>{p}</option>)}
          </select>
          {["all","current","pending","late"].map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: statusFilter === f ? 600 : 400, background: statusFilter === f ? "#0C447C" : "#fff", color: statusFilter === f ? "#fff" : "#555", border: "1px solid #e8eaed", cursor: "pointer", fontFamily: "'Inter',sans-serif", textTransform: "capitalize" }}
            >
              {f === "all" ? `All (${TENANTS.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${TENANTS.filter(t => t.status === f).length})`}
            </button>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#888" }}>{filtered.length} results</span>
        </div>

        {/* Table */}
        <div style={{...s.card, overflowX: 'auto'}}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{...s.th, cursor:"pointer"}} onClick={() => handleSort("name")}>Tenant {sortIcon("name")}</th>
                <th style={{...s.th, cursor:"pointer"}} onClick={() => handleSort("property")}>Property · Unit {sortIcon("property")}</th>
                <th style={{...s.th, textAlign:"right", cursor:"pointer"}} onClick={() => handleSort("rent")}>Rent {sortIcon("rent")}</th>
                <th style={{...s.th, cursor:"pointer"}} onClick={() => handleSort("status")}>Status {sortIcon("status")}</th>
                <th style={{...s.th, textAlign:"right", cursor:"pointer"}} onClick={() => handleSort("balance")}>Balance {sortIcon("balance")}</th>
                <th style={{...s.th, cursor:"pointer"}} onClick={() => handleSort("lease")}>Lease ends {sortIcon("lease")}</th>
                <th style={s.th}>Last paid</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={8} style={s.emptyState}>No tenants match your search</td></tr>
              ) : sorted.map(t => {
                const days = daysUntil(t.leaseEnd);
                return (
                  <tr key={t.id} onClick={() => navigate(`/landlord/tenants/${t.id}`)}>
                    <td style={s.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={s.avatar(t.color, t.bg)}>{t.avatar}</div>
                        <div>
                          <div style={s.tenantName}>{t.name}</div>
                          <div style={s.tenantEmail}>{t.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={s.td}>
                      <div style={{ fontWeight: 500 }}>{t.property}</div>
                      <div style={{ fontSize: 11, color: "#888" }}>Unit {t.unit}</div>
                    </td>
                    <td style={{ ...s.td, textAlign: "right", fontWeight: 600 }}>${t.rent.toLocaleString()}</td>
                    <td style={s.td}><span style={s.statusBadge(t.status)}>{STATUS_CONFIG[t.status]?.label}</span></td>
                    <td style={{ ...s.td, textAlign: "right" }}>
                      <span style={s.balanceText(t.balance)}>{t.balance > 0 ? `-$${t.balance.toLocaleString()}` : "✓ $0"}</span>
                    </td>
                    <td style={s.td}>
                      <span style={s.leaseBadge(days)}>
                        {t.leaseEnd === "Rolling" ? "Rolling" : `${days < 0 ? "Expired" : `${days}d`}`}
                      </span>
                    </td>
                    <td style={s.td}><span style={{ fontSize: 12, color: "#555" }}>{t.lastPaid}</span></td>
                    <td style={s.td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={s.actionBtnPrimary} onClick={e => { e.stopPropagation(); navigate(`/landlord/tenants/${t.id}`); }}>View</button>
                        <button style={s.actionBtn} onClick={e => { e.stopPropagation(); }}>Message</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
