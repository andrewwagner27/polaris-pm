import { useState } from "react";
import { useNavigate } from "react-router-dom";

const TICKETS = [
  { id: 1,  property: "Clifton Manor",  unit: "2B", tenant: "Priya M.",   category: "plumbing",    title: "Kitchen faucet dripping",       description: "The kitchen faucet has been dripping constantly for about a week. Getting worse over time.", priority: "normal", status: "in_progress", submitted: "May 18, 2026", updated: "May 20, 2026", vendor: "Mike's Plumbing",    vendorPhone: "(216) 555-9001", cost: 150,  scheduled: "Jun 2, 2026",  notes: "Parts ordered. Mike confirmed Jun 2 visit 10am-12pm." },
  { id: 2,  property: "Clifton Manor",  unit: "4B", tenant: "Chris L.",   category: "electrical",  title: "Bathroom exhaust fan broken",   description: "Fan stopped working completely. No noise, no airflow.", priority: "normal", status: "open",        submitted: "Jun 1, 2026",  updated: "Jun 1, 2026",  vendor: null,              vendorPhone: null,             cost: null, scheduled: null,           notes: "" },
  { id: 3,  property: "944 18th Ave S", unit: "Main", tenant: "Kaidyn T.", category: "hvac",       title: "AC not cooling properly",       description: "AC runs but room temperature stays at 82F. Thermostat set to 72F.", priority: "high",   status: "open",        submitted: "Jun 2, 2026",  updated: "Jun 2, 2026",  vendor: null,              vendorPhone: null,             cost: null, scheduled: null,           notes: "" },
  { id: 4,  property: "Clifton Manor",  unit: "1A", tenant: "James W.",   category: "other",       title: "Window seal cracked",           description: "Seal around bedroom window is cracked. Drafty in winter.", priority: "low",    status: "open",        submitted: "May 25, 2026", updated: "May 25, 2026", vendor: null,              vendorPhone: null,             cost: null, scheduled: null,           notes: "" },
  { id: 5,  property: "Clifton Manor",  unit: "3A", tenant: "Maria R.",   category: "plumbing",    title: "Bathroom exhaust fan replaced", description: "Old fan was rattling loudly.", priority: "normal", status: "resolved",    submitted: "Apr 10, 2026", updated: "Apr 22, 2026", vendor: "Handy Andy LLC",  vendorPhone: "(216) 555-9002", cost: 220,  scheduled: null,           notes: "Resolved. New fan installed Apr 22." },
  { id: 6,  property: "Clifton Manor",  unit: "5B", tenant: "Marcus B.",  category: "appliance",   title: "Dishwasher not draining",       description: "Standing water after every cycle.", priority: "normal", status: "resolved",    submitted: "Apr 5, 2026",  updated: "Apr 8, 2026",  vendor: "Handy Andy LLC",  vendorPhone: "(216) 555-9002", cost: 85,   scheduled: null,           notes: "Clog cleared. Working fine." },
];

const VENDORS = [
  { id: 1, name: "Mike's Plumbing",   specialty: "Plumbing",          phone: "(216) 555-9001", email: "mike@mikesplumbing.com",  rating: 5, jobs: 8,  avgCost: 185 },
  { id: 2, name: "Handy Andy LLC",    specialty: "General",           phone: "(216) 555-9002", email: "andy@handyandy.com",      rating: 4, jobs: 14, avgCost: 120 },
  { id: 3, name: "CoolAir HVAC",      specialty: "HVAC",              phone: "(216) 555-9003", email: "info@coolair.com",        rating: 5, jobs: 3,  avgCost: 340 },
  { id: 4, name: "Spark Electric",    specialty: "Electrical",        phone: "(216) 555-9004", email: "info@sparkelectric.com",  rating: 4, jobs: 5,  avgCost: 210 },
];

const PRIORITY_CONFIG = {
  low:    { label: "Low",    color: "#3B6D11", bg: "#EAF3DE" },
  normal: { label: "Normal", color: "#185FA5", bg: "#E6F1FB" },
  high:   { label: "High",   color: "#854F0B", bg: "#FAEEDA" },
  urgent: { label: "Urgent", color: "#A32D2D", bg: "#FDECEA" },
};

const STATUS_CONFIG = {
  open:        { label: "Open",        color: "#854F0B", bg: "#FAEEDA" },
  in_progress: { label: "In Progress", color: "#185FA5", bg: "#E6F1FB" },
  resolved:    { label: "Resolved",    color: "#3B6D11", bg: "#EAF3DE" },
};

const CATEGORY_ICONS = {
  plumbing: "🚿", electrical: "⚡", hvac: "🌡️",
  appliance: "🍳", pest: "🐛", other: "🔧",
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
  statGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 },
  statCard: (accent) => ({ background: "#fff", border: "1px solid #e8eaed", borderRadius: 10, padding: "14px 16px", borderTop: `3px solid ${accent}` }),
  statLabel: { fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 },
  statValue: { fontSize: 26, fontWeight: 700, color: "#1a1a1a" },
  statSub: { fontSize: 11, color: "#888", marginTop: 2 },
  tabs: { display: "flex", gap: 0, borderBottom: "2px solid #e8eaed", marginBottom: 20 },
  tab: (active) => ({ padding: "10px 18px", fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#0C447C" : "#888", cursor: "pointer", background: "none", border: "none", borderBottom: active ? "2px solid #0C447C" : "2px solid transparent", marginBottom: -2, fontFamily: "'Inter',sans-serif" }),
  filterRow: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" },
  filterBtn: (active) => ({ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: active ? 600 : 400, background: active ? "#0C447C" : "#fff", color: active ? "#fff" : "#555", border: "1px solid #e8eaed", cursor: "pointer", fontFamily: "'Inter',sans-serif" }),
  searchBar: { display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e8eaed", borderRadius: 8, padding: "7px 12px", flex: 1, maxWidth: 280 },
  searchInput: { flex: 1, border: "none", outline: "none", fontSize: 13, fontFamily: "'Inter',sans-serif", background: "transparent" },
  // Ticket card
  ticketCard: (priority) => ({ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px", marginBottom: 10, cursor: "pointer", transition: "box-shadow 0.15s", borderLeft: `4px solid ${PRIORITY_CONFIG[priority]?.color || "#e8eaed"}` }),
  ticketHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 },
  ticketTitle: { fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 3 },
  ticketMeta: { fontSize: 12, color: "#888" },
  ticketBadges: { display: "flex", gap: 6, alignItems: "center", flexShrink: 0 },
  badge: (color, bg) => ({ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: bg, color, whiteSpace: "nowrap" }),
  ticketFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid #f4f5f7" },
  ticketFooterLeft: { display: "flex", alignItems: "center", gap: 12 },
  ticketFooterItem: { fontSize: 11, color: "#888", display: "flex", alignItems: "center", gap: 4 },
  actionBtn: { padding: "5px 10px", background: "#f4f5f7", border: "1px solid #e8eaed", borderRadius: 6, fontSize: 11, fontWeight: 600, color: "#555", cursor: "pointer", fontFamily: "'Inter',sans-serif" },
  actionBtnPrimary: { padding: "5px 10px", background: "#E6F1FB", border: "1px solid #B5D4F4", borderRadius: 6, fontSize: 11, fontWeight: 600, color: "#185FA5", cursor: "pointer", fontFamily: "'Inter',sans-serif" },
  // Vendor card
  vendorCard: { background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px", marginBottom: 10 },
  vendorHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  vendorName: { fontSize: 14, fontWeight: 700 },
  vendorSpecialty: { fontSize: 11, color: "#888", marginTop: 2 },
  stars: (n) => "⭐".repeat(n),
  // Detail panel
  detailOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", justifyContent: "flex-end" },
  detailPanel: { width: 480, background: "#fff", height: "100vh", overflowY: "auto", boxShadow: "-4px 0 20px rgba(0,0,0,0.15)" },
  detailHeader: { background: "#0C447C", padding: "20px 20px 16px" },
  detailTitle: { fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 4 },
  detailMeta: { fontSize: 12, color: "#85B7EB" },
  detailBody: { padding: "20px" },
  detailSection: { marginBottom: 20 },
  detailSectionTitle: { fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 },
  infoRow: { display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f4f5f7" },
  infoKey: { fontSize: 13, color: "#888" },
  infoVal: { fontSize: 13, fontWeight: 600, color: "#1a1a1a" },
  select: { width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff", fontFamily: "'Inter',sans-serif", outline: "none", marginBottom: 8 },
  notesArea: { width: "100%", minHeight: 80, padding: "10px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 8, resize: "vertical", fontFamily: "'Inter',sans-serif", outline: "none", boxSizing: "border-box" },
  timelineItem: { display: "flex", gap: 10, marginBottom: 12 },
  timelineDot: (color) => ({ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 4 }),
  timelineText: { fontSize: 12, color: "#444", lineHeight: 1.5 },
  timelineTime: { fontSize: 10, color: "#aaa", marginTop: 2 },
};

export default function LandlordMaintenance() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab]     = useState("Requests");
  const [statusFilter, setStatusFilter] = useState("all");
  const [propFilter, setPropFilter]   = useState("all");
  const [search, setSearch]           = useState("");
  const [selected, setSelected]       = useState(null);
  const [tickets, setTickets]         = useState(TICKETS);

  const openCount       = tickets.filter(t => t.status === "open").length;
  const inProgressCount = tickets.filter(t => t.status === "in_progress").length;
  const resolvedCount   = tickets.filter(t => t.status === "resolved").length;
  const totalCost       = tickets.reduce((s, t) => s + (t.cost || 0), 0);

  const filtered = tickets.filter(t => {
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    const matchProp   = propFilter === "all" || t.property === "Clifton Manor" && propFilter === "clifton" || t.property === "944 18th Ave S" && propFilter === "stpete";
    const matchSearch = t.title.toLowerCase().includes(search.toLowerCase()) || t.tenant.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchProp && matchSearch;
  });

  function updateStatus(id, newStatus) {
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status: newStatus, updated: "Just now" } : t));
    if (selected?.id === id) setSelected(prev => ({ ...prev, status: newStatus }));
  }

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
          <div key={item.route} style={s.navItem(item.label === "Maintenance")} onClick={() => navigate(item.route)}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            {item.label}
            {item.label === "Maintenance" && openCount + inProgressCount > 0 && (
              <span style={{ marginLeft: "auto", background: "#E24B4A", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>
                {openCount + inProgressCount}
              </span>
            )}
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
            <div style={s.pageTitle}>Maintenance</div>
            <div style={s.pageSub}>{openCount + inProgressCount} active tickets across all properties</div>
          </div>
          <button style={s.btn(true)}>+ New request</button>
        </div>

        {/* Stats */}
        <div style={s.statGrid}>
          {[
            { label: "Open",          value: openCount,       sub: "awaiting action",    accent: "#854F0B" },
            { label: "In progress",   value: inProgressCount, sub: "vendor assigned",    accent: "#185FA5" },
            { label: "Resolved (MTD)",value: resolvedCount,   sub: "this month",         accent: "#3B6D11" },
            { label: "Maintenance cost",value: `$${totalCost.toLocaleString()}`, sub: "total spent YTD", accent: "#6B3FA0" },
          ].map((stat, i) => (
            <div key={i} style={s.statCard(stat.accent)}>
              <div style={s.statLabel}>{stat.label}</div>
              <div style={s.statValue}>{stat.value}</div>
              <div style={s.statSub}>{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          {["Requests", "Vendors", "Cost Tracker"].map(tab => (
            <button key={tab} style={s.tab(activeTab === tab)} onClick={() => setActiveTab(tab)}>{tab}</button>
          ))}
        </div>

        {/* ── Requests tab ── */}
        {activeTab === "Requests" && (
          <>
            <div style={s.filterRow}>
              <div style={s.searchBar}>
                <span>🔍</span>
                <input style={s.searchInput} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets…" />
              </div>
              {["all","open","in_progress","resolved"].map(f => (
                <button key={f} style={s.filterBtn(statusFilter === f)} onClick={() => setStatusFilter(f)}>
                  {f === "all" ? `All (${tickets.length})` : f === "in_progress" ? `In Progress (${inProgressCount})` : `${f.charAt(0).toUpperCase()+f.slice(1)} (${tickets.filter(t=>t.status===f).length})`}
                </button>
              ))}
              <select style={{ padding: "7px 12px", border: "1px solid #e8eaed", borderRadius: 8, fontSize: 12, background: "#fff", fontFamily: "'Inter',sans-serif", outline: "none" }}
                value={propFilter} onChange={e => setPropFilter(e.target.value)}>
                <option value="all">All properties</option>
                <option value="clifton">Clifton Manor</option>
                <option value="stpete">944 18th Ave S</option>
              </select>
            </div>

            {filtered.map(ticket => (
              <div key={ticket.id} style={s.ticketCard(ticket.priority)} onClick={() => setSelected(ticket)}>
                <div style={s.ticketHeader}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 18 }}>{CATEGORY_ICONS[ticket.category]}</span>
                      <div style={s.ticketTitle}>{ticket.title}</div>
                    </div>
                    <div style={s.ticketMeta}>{ticket.property} · Unit {ticket.unit} · {ticket.tenant}</div>
                  </div>
                  <div style={s.ticketBadges}>
                    <span style={s.badge(PRIORITY_CONFIG[ticket.priority].color, PRIORITY_CONFIG[ticket.priority].bg)}>{PRIORITY_CONFIG[ticket.priority].label}</span>
                    <span style={s.badge(STATUS_CONFIG[ticket.status].color, STATUS_CONFIG[ticket.status].bg)}>{STATUS_CONFIG[ticket.status].label}</span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5, marginBottom: 8 }}>{ticket.description}</div>
                <div style={s.ticketFooter}>
                  <div style={s.ticketFooterLeft}>
                    <span style={s.ticketFooterItem}>📅 {ticket.submitted}</span>
                    {ticket.vendor && <span style={s.ticketFooterItem}>🔧 {ticket.vendor}</span>}
                    {ticket.scheduled && <span style={s.ticketFooterItem}>📆 Scheduled {ticket.scheduled}</span>}
                    {ticket.cost && <span style={s.ticketFooterItem}>💰 ${ticket.cost}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                    {ticket.status === "open" && <button style={s.actionBtnPrimary} onClick={() => updateStatus(ticket.id, "in_progress")}>Assign vendor</button>}
                    {ticket.status === "in_progress" && <button style={s.actionBtnPrimary} onClick={() => updateStatus(ticket.id, "resolved")}>Mark resolved</button>}
                    {ticket.status === "resolved" && <span style={{ fontSize: 11, color: "#3B6D11", fontWeight: 600 }}>✓ Resolved</span>}
                    <button style={s.actionBtn} onClick={() => setSelected(ticket)}>View</button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── Vendors tab ── */}
        {activeTab === "Vendors" && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <button style={s.btn(true)}>+ Add vendor</button>
            </div>
            {VENDORS.map(vendor => (
              <div key={vendor.id} style={s.vendorCard}>
                <div style={s.vendorHeader}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: "#E6F1FB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🔧</div>
                    <div>
                      <div style={s.vendorName}>{vendor.name}</div>
                      <div style={s.vendorSpecialty}>{vendor.specialty} · {vendor.phone}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, marginBottom: 3 }}>{s.stars(vendor.rating)}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{vendor.jobs} jobs · avg ${vendor.avgCost}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={s.actionBtnPrimary}>Assign to ticket</button>
                  <button style={s.actionBtn}>📞 Call</button>
                  <button style={s.actionBtn}>✉️ Email</button>
                  <button style={s.actionBtn}>View history</button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── Cost Tracker tab ── */}
        {activeTab === "Cost Tracker" && (
          <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Maintenance spend by ticket</div>
              <button style={s.btn(false)}>⬇️ Export CSV</button>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Property", "Unit", "Issue", "Vendor", "Cost", "Date"].map(h => (
                    <th key={h} style={{ fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", padding: "10px 14px", textAlign: "left", borderBottom: "1px solid #f0f0f0", background: "#fafafa" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tickets.filter(t => t.cost).map(t => (
                  <tr key={t.id}>
                    <td style={{ padding: "10px 14px", fontSize: 13, borderBottom: "1px solid #f8f9fa" }}>{t.property}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13, borderBottom: "1px solid #f8f9fa" }}>Unit {t.unit}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13, borderBottom: "1px solid #f8f9fa" }}>{t.title}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13, borderBottom: "1px solid #f8f9fa" }}>{t.vendor}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, borderBottom: "1px solid #f8f9fa" }}>${t.cost}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13, color: "#888", borderBottom: "1px solid #f8f9fa" }}>{t.updated}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, background: "#fafafa" }}>Total</td>
                  <td style={{ padding: "10px 14px", fontSize: 14, fontWeight: 700, color: "#0C447C", background: "#fafafa" }}>${totalCost}</td>
                  <td style={{ background: "#fafafa" }}></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Ticket detail panel ── */}
      {selected && (
        <div style={s.detailOverlay} onClick={() => setSelected(null)}>
          <div style={s.detailPanel} onClick={e => e.stopPropagation()}>
            <div style={s.detailHeader}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={s.detailTitle}>{selected.title}</div>
                  <div style={s.detailMeta}>{selected.property} · Unit {selected.unit} · {selected.tenant}</div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 13 }}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <span style={s.badge(PRIORITY_CONFIG[selected.priority].color, "rgba(255,255,255,0.2)")}>{PRIORITY_CONFIG[selected.priority].label} priority</span>
                <span style={s.badge(STATUS_CONFIG[selected.status].color, "rgba(255,255,255,0.2)")}>{STATUS_CONFIG[selected.status].label}</span>
              </div>
            </div>

            <div style={s.detailBody}>
              {/* Description */}
              <div style={s.detailSection}>
                <div style={s.detailSectionTitle}>Description</div>
                <p style={{ fontSize: 13, color: "#444", lineHeight: 1.6, margin: 0 }}>{selected.description}</p>
              </div>

              {/* Details */}
              <div style={s.detailSection}>
                <div style={s.detailSectionTitle}>Details</div>
                {[
                  ["Submitted",  selected.submitted],
                  ["Last updated", selected.updated],
                  ["Category",   selected.category],
                  ["Vendor",     selected.vendor || "—"],
                  ["Scheduled",  selected.scheduled || "—"],
                  ["Cost",       selected.cost ? `$${selected.cost}` : "—"],
                ].map(([k, v]) => (
                  <div key={k} style={s.infoRow}>
                    <span style={s.infoKey}>{k}</span>
                    <span style={s.infoVal}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Assign vendor */}
              {selected.status !== "resolved" && (
                <div style={s.detailSection}>
                  <div style={s.detailSectionTitle}>Assign vendor</div>
                  <select style={s.select}>
                    <option value="">Select vendor…</option>
                    {VENDORS.map(v => <option key={v.id}>{v.name} · {v.specialty}</option>)}
                  </select>
                  <input placeholder="Schedule date (e.g. Jun 10, 2026)" style={{ ...s.select, marginBottom: 8 }} />
                  <input placeholder="Estimated cost ($)" style={{ ...s.select, marginBottom: 8 }} />
                </div>
              )}

              {/* Update status */}
              {selected.status !== "resolved" && (
                <div style={s.detailSection}>
                  <div style={s.detailSectionTitle}>Update status</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {selected.status === "open" && <button style={{ ...s.btn(true), flex: 1, justifyContent: "center" }} onClick={() => updateStatus(selected.id, "in_progress")}>→ In Progress</button>}
                    {selected.status === "in_progress" && <button style={{ ...s.btn(true), flex: 1, justifyContent: "center", background: "#3B6D11" }} onClick={() => updateStatus(selected.id, "resolved")}>✓ Mark Resolved</button>}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div style={s.detailSection}>
                <div style={s.detailSectionTitle}>Internal notes</div>
                <textarea
                  style={s.notesArea}
                  defaultValue={selected.notes}
                  placeholder="Add notes visible only to you — vendor contact, parts needed, cost breakdown…"
                />
                <button style={{ ...s.btn(true), marginTop: 8 }}>Save notes</button>
              </div>

              {/* Timeline */}
              <div style={s.detailSection}>
                <div style={s.detailSectionTitle}>Timeline</div>
                {[
                  { color: "#854F0B", text: `Ticket submitted by ${selected.tenant}`, time: selected.submitted },
                  selected.vendor && { color: "#185FA5", text: `Assigned to ${selected.vendor}`, time: selected.updated },
                  selected.scheduled && { color: "#185FA5", text: `Repair scheduled for ${selected.scheduled}`, time: selected.updated },
                  selected.status === "resolved" && { color: "#3B6D11", text: "Ticket resolved", time: selected.updated },
                ].filter(Boolean).map((item, i) => (
                  <div key={i} style={s.timelineItem}>
                    <div style={s.timelineDot(item.color)} />
                    <div>
                      <div style={s.timelineText}>{item.text}</div>
                      <div style={s.timelineTime}>{item.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
