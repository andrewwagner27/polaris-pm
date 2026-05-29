import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const TENANTS_DB = {
  1:  { id: 1,  name: "James W.",   fullName: "James Wilson",     email: "james@email.com",   phone: "(216) 555-0101", property: "Clifton Manor",  address: "12009 Clifton Blvd, Lakewood OH 44107", unit: "1A", rent: 1150, deposit: 1150, status: "current",  leaseStart: "Jan 1, 2025",  leaseEnd: "Dec 31, 2026", balance: 0,    avatar: "JW", color: "#185FA5", bg: "#E6F1FB", moveIn: "Jan 1, 2025",  autopay: true,  roommates: [], notes: "Long-term tenant. Always pays early. Great for referrals." },
  2:  { id: 2,  name: "Sarah M.",   fullName: "Sarah Mitchell",   email: "sarah@email.com",   phone: "(216) 555-0102", property: "Clifton Manor",  address: "12009 Clifton Blvd, Lakewood OH 44107", unit: "1B", rent: 1150, deposit: 1150, status: "current",  leaseStart: "Mar 1, 2025",  leaseEnd: "Dec 31, 2026", balance: 0,    avatar: "SM", color: "#3B6D11", bg: "#EAF3DE", moveIn: "Mar 1, 2025",  autopay: false, roommates: [], notes: "" },
  3:  { id: 3,  name: "Jordan K.",  fullName: "Jordan Kim",       email: "jordan@email.com",  phone: "(216) 555-0103", property: "Clifton Manor",  address: "12009 Clifton Blvd, Lakewood OH 44107", unit: "2A", rent: 1200, deposit: 1200, status: "current",  leaseStart: "Jan 1, 2026",  leaseEnd: "Dec 31, 2026", balance: 0,    avatar: "JK", color: "#854F0B", bg: "#FAEEDA", moveIn: "Jan 1, 2026",  autopay: false, roommates: [{ name: "Taylor J.", email: "taylor@email.com", phone: "(216) 555-0133" }], notes: "Has a roommate — Taylor. Both on lease." },
  4:  { id: 4,  name: "Priya M.",   fullName: "Priya Mehta",      email: "priya@email.com",   phone: "(216) 555-0104", property: "Clifton Manor",  address: "12009 Clifton Blvd, Lakewood OH 44107", unit: "2B", rent: 1150, deposit: 1150, status: "late",     leaseStart: "Oct 1, 2025",  leaseEnd: "Sep 30, 2026", balance: 1150, avatar: "PM", color: "#A32D2D", bg: "#FDECEA", moveIn: "Oct 1, 2025",  autopay: false, roommates: [], notes: "June rent overdue. Called on Jun 3 — no answer. Send formal notice if not received by Jun 7." },
  5:  { id: 5,  name: "Maria R.",   fullName: "Maria Rodriguez",  email: "maria@email.com",   phone: "(614) 555-0192", property: "Clifton Manor",  address: "12009 Clifton Blvd, Lakewood OH 44107", unit: "3A", rent: 1150, deposit: 1150, status: "current",  leaseStart: "Jan 1, 2026",  leaseEnd: "Dec 31, 2026", balance: 0,    avatar: "MR", color: "#185FA5", bg: "#E6F1FB", moveIn: "Jan 1, 2026",  autopay: false, roommates: [{ name: "Jordan K.", email: "jordan2@email.com", phone: "(216) 555-0155" }], notes: "" },
  7:  { id: 7,  name: "Sam P.",     fullName: "Sam Park",         email: "sam@email.com",     phone: "(216) 555-0107", property: "Clifton Manor",  address: "12009 Clifton Blvd, Lakewood OH 44107", unit: "4A", rent: 1200, deposit: 1200, status: "current",  leaseStart: "Jul 1, 2025",  leaseEnd: "Jun 30, 2026", balance: 0,    avatar: "SP", color: "#854F0B", bg: "#FAEEDA", moveIn: "Jul 1, 2025",  autopay: true,  roommates: [], notes: "Lease expiring Jun 30. Send renewal offer ASAP." },
  11: { id: 11, name: "Kaidyn T.",  fullName: "Kaidyn Torres",    email: "kaidyn@email.com",  phone: "(727) 555-0111", property: "944 18th Ave S", address: "944 18th Ave S, St. Petersburg FL 33705", unit: "Main", rent: 2200, deposit: 2200, status: "current", leaseStart: "Apr 1, 2026", leaseEnd: "Dec 31, 2026", balance: 0, avatar: "KT", color: "#3B6D11", bg: "#EAF3DE", moveIn: "Apr 1, 2026", autopay: false, roommates: [], notes: "New tenant. Strong rental history." },
};

const PAYMENTS_DB = {
  4: [
    { date: "May 1, 2026",  desc: "May Rent",       amount: 1150, status: "paid" },
    { date: "Apr 1, 2026",  desc: "April Rent",      amount: 1150, status: "paid" },
    { date: "Mar 6, 2026",  desc: "Late Fee",        amount: 75,   status: "paid" },
    { date: "Mar 1, 2026",  desc: "March Rent",      amount: 1150, status: "paid" },
    { date: "Oct 1, 2025",  desc: "Security Deposit",amount: 1150, status: "paid" },
  ],
  default: [
    { date: "Jun 1, 2026",  desc: "June Rent",       amount: null, status: "upcoming" },
    { date: "May 1, 2026",  desc: "May Rent",        amount: null, status: "paid" },
    { date: "Apr 1, 2026",  desc: "April Rent",      amount: null, status: "paid" },
    { date: "Mar 1, 2026",  desc: "March Rent",      amount: null, status: "paid" },
  ],
};

const MAINTENANCE_DB = {
  5: [
    { date: "May 18, 2026", issue: "Kitchen faucet dripping",    status: "in_progress", priority: "normal" },
    { date: "Apr 22, 2026", issue: "Bathroom exhaust fan",       status: "resolved",    priority: "normal" },
  ],
  default: [],
};

const STATUS_CONFIG = {
  current:  { label: "Current",  color: "#3B6D11", bg: "#EAF3DE" },
  pending:  { label: "Pending",  color: "#854F0B", bg: "#FAEEDA" },
  late:     { label: "Late",     color: "#A32D2D", bg: "#FDECEA" },
  paid:     { label: "Paid",     color: "#3B6D11", bg: "#EAF3DE" },
  upcoming: { label: "Upcoming", color: "#185FA5", bg: "#E6F1FB" },
  in_progress: { label: "In Progress", color: "#185FA5", bg: "#E6F1FB" },
  resolved:    { label: "Resolved",    color: "#3B6D11", bg: "#EAF3DE" },
};

const TABS = ["Overview", "Payments", "Maintenance", "Documents", "Notes"];

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
  backBtn: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#185FA5", cursor: "pointer", background: "none", border: "none", fontFamily: "'Inter',sans-serif", padding: 0, marginBottom: 16 },
  headerCard: { background: "#fff", border: "1px solid #e8eaed", borderRadius: 14, padding: "20px 24px", marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 },
  headerLeft: { display: "flex", alignItems: "flex-start", gap: 16 },
  avatar: (color, bg) => ({ width: 56, height: 56, borderRadius: "50%", background: bg, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, flexShrink: 0 }),
  tenantName: { fontSize: 20, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 },
  tenantMeta: { fontSize: 13, color: "#888", marginBottom: 3 },
  statusBadge: (status) => ({ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 10, background: STATUS_CONFIG[status]?.bg, color: STATUS_CONFIG[status]?.color }),
  contactRow: { display: "flex", gap: 20, marginTop: 10 },
  contactItem: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#555" },
  actionBtns: { display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" },
  btn: (primary) => ({ padding: "8px 14px", background: primary ? "#0C447C" : "#fff", color: primary ? "#fff" : "#1a1a1a", border: primary ? "none" : "1px solid #e8eaed", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" }),
  btnDanger: { padding: "8px 14px", background: "#FDECEA", color: "#A32D2D", border: "1px solid #f5c6c6", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" },
  tabs: { display: "flex", gap: 0, borderBottom: "2px solid #e8eaed", marginBottom: 20 },
  tab: (active) => ({ padding: "10px 16px", fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#0C447C" : "#888", cursor: "pointer", borderBottom: active ? "2px solid #0C447C" : "2px solid transparent", marginBottom: -2, background: "none", border: "none", borderBottom: active ? "2px solid #0C447C" : "2px solid transparent", fontFamily: "'Inter',sans-serif" }),
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 },
  card: (span) => ({ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px", gridColumn: span === 2 ? "span 2" : "span 1" }),
  cardTitle: { fontSize: 12, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 },
  infoRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f4f5f7" },
  infoRowLast: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0" },
  infoKey: { fontSize: 13, color: "#888" },
  infoVal: { fontSize: 13, fontWeight: 600, color: "#1a1a1a" },
  balanceVal: (bal) => ({ fontSize: 22, fontWeight: 700, color: bal > 0 ? "#A32D2D" : "#3B6D11", marginBottom: 4 }),
  table: { width: "100%", borderCollapse: "collapse" },
  th: { fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", padding: "10px 14px", textAlign: "left", borderBottom: "1px solid #f0f0f0", background: "#fafafa" },
  td: { fontSize: 13, padding: "10px 14px", borderBottom: "1px solid #f8f9fa", color: "#1a1a1a" },
  payBadge: (status) => ({ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: STATUS_CONFIG[status]?.bg, color: STATUS_CONFIG[status]?.color }),
  roommateCard: { background: "#f8f9fa", border: "1px solid #e8eaed", borderRadius: 8, padding: "10px 12px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" },
  roommateLeft: { display: "flex", alignItems: "center", gap: 10 },
  roommateAvatar: { width: 28, height: 28, borderRadius: "50%", background: "#E6F1FB", color: "#185FA5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 },
  notesArea: { width: "100%", minHeight: 120, padding: "10px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 8, resize: "vertical", fontFamily: "'Inter',sans-serif", color: "#1a1a1a", outline: "none", lineHeight: 1.6, boxSizing: "border-box" },
  saveNoteBtn: { marginTop: 8, padding: "8px 16px", background: "#0C447C", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" },
  progressBar: { height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden", marginTop: 8 },
  progressFill: (pct) => ({ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#185FA5,#0C447C)", borderRadius: 3 }),
  emptyState: { textAlign: "center", padding: "30px", color: "#aaa", fontSize: 13 },
};

function leaseProgress(start, end) {
  const s = new Date(start.replace(",", "")); 
  const e = new Date(end.replace(",", ""));
  const t = new Date();
  return Math.min(100, Math.max(0, Math.round(((t - s) / (e - s)) * 100)));
}

export default function LandlordTenantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const tenant = TENANTS_DB[Number(id)] || TENANTS_DB[5];
  const payments = (PAYMENTS_DB[Number(id)] || PAYMENTS_DB.default).map(p => ({ ...p, amount: p.amount || tenant.rent }));
  const maintenance = MAINTENANCE_DB[Number(id)] || MAINTENANCE_DB.default;

  const [activeTab, setActiveTab] = useState("Overview");
  const [notes, setNotes] = useState(tenant.notes || "");
  const [noteSaved, setNoteSaved] = useState(false);

  const daysLeft = Math.ceil((new Date(tenant.leaseEnd) - new Date()) / (1000 * 60 * 60 * 24));
  const progress = 58; // simplified

  function saveNote() {
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
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
          <div key={item.route} style={s.navItem(item.label === "Tenants")} onClick={() => navigate(item.route)}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>
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
        <button style={s.backBtn} onClick={() => navigate("/landlord/tenants")}>← Back to Tenants</button>

        {/* Header card */}
        <div style={s.headerCard}>
          <div style={s.headerLeft}>
            <div style={s.avatar(tenant.color, tenant.bg)}>{tenant.avatar}</div>
            <div>
              <div style={s.tenantName}>{tenant.fullName}</div>
              <div style={s.tenantMeta}>{tenant.property} · Unit {tenant.unit} · {tenant.address}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <span style={s.statusBadge(tenant.status)}>● {STATUS_CONFIG[tenant.status]?.label}</span>
                {tenant.autopay && <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 10, background: "#EAF3DE", color: "#3B6D11" }}>🔄 Autopay on</span>}
                {daysLeft < 60 && daysLeft > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 10, background: "#FAEEDA", color: "#854F0B" }}>⚠️ Lease expiring in {daysLeft}d</span>}
              </div>
              <div style={s.contactRow}>
                <span style={s.contactItem}>📧 {tenant.email}</span>
                <span style={s.contactItem}>📞 {tenant.phone}</span>
                <span style={s.contactItem}>📅 Move-in: {tenant.moveIn}</span>
              </div>
            </div>
          </div>
          <div style={s.actionBtns}>
            <button style={s.btn(true)}>💬 Message</button>
            <button style={s.btn(false)}>💰 Record payment</button>
            <button style={s.btn(false)}>📋 Renew lease</button>
            {tenant.status === "late" && <button style={s.btnDanger}>⚠️ Send notice</button>}
          </div>
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          {TABS.map(tab => (
            <button key={tab} style={s.tab(activeTab === tab)} onClick={() => setActiveTab(tab)}>{tab}</button>
          ))}
        </div>

        {/* ── Overview tab ── */}
        {activeTab === "Overview" && (
          <div style={s.grid}>

            {/* Balance */}
            <div style={s.card(1)}>
              <div style={s.cardTitle}>Balance</div>
              <div style={s.balanceVal(tenant.balance)}>{tenant.balance > 0 ? `-$${tenant.balance.toLocaleString()}` : "$0.00"}</div>
              <div style={{ fontSize: 12, color: tenant.balance > 0 ? "#A32D2D" : "#3B6D11" }}>
                {tenant.balance > 0 ? "Amount overdue" : "Fully paid ✓"}
              </div>
              {tenant.balance > 0 && (
                <button style={{ ...s.btn(true), marginTop: 12, width: "100%", justifyContent: "center", display: "flex" }}>
                  Send payment reminder
                </button>
              )}
            </div>

            {/* Lease */}
            <div style={s.card(1)}>
              <div style={s.cardTitle}>Lease details</div>
              {[
                ["Monthly rent",   `$${tenant.rent.toLocaleString()}`],
                ["Deposit held",   `$${tenant.deposit.toLocaleString()}`],
                ["Lease start",    tenant.leaseStart],
                ["Lease end",      tenant.leaseEnd],
              ].map(([k, v], i, arr) => (
                <div key={k} style={i === arr.length - 1 ? s.infoRowLast : s.infoRow}>
                  <span style={s.infoKey}>{k}</span>
                  <span style={s.infoVal}>{v}</span>
                </div>
              ))}
              <div style={s.progressBar}>
                <div style={s.progressFill(progress)} />
              </div>
              <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>{progress}% through lease · {daysLeft > 0 ? `${daysLeft} days remaining` : "Expired"}</div>
            </div>

            {/* Occupants */}
            <div style={s.card(1)}>
              <div style={s.cardTitle}>Occupants ({1 + tenant.roommates.length})</div>
              <div style={s.roommateCard}>
                <div style={s.roommateLeft}>
                  <div style={s.roommateAvatar}>{tenant.avatar}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{tenant.fullName}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{tenant.email}</div>
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", background: "#EAF3DE", color: "#3B6D11", borderRadius: 10 }}>Primary</span>
              </div>
              {tenant.roommates.map((r, i) => (
                <div key={i} style={s.roommateCard}>
                  <div style={s.roommateLeft}>
                    <div style={s.roommateAvatar}>{r.name.split(" ").map(n => n[0]).join("")}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: "#888" }}>{r.email}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", background: "#E6F1FB", color: "#185FA5", borderRadius: 10 }}>Roommate</span>
                </div>
              ))}
              <button style={{ ...s.btn(false), width: "100%", marginTop: 8 }}>+ Add occupant</button>
            </div>

            {/* Recurring charges */}
            <div style={s.card(1)}>
              <div style={s.cardTitle}>Recurring charges</div>
              {[
                { label: "Base rent",  amount: tenant.rent, freq: "Monthly · due 1st" },
                { label: "Water/sewer", amount: 50,         freq: "Monthly · RUBS split" },
              ].map((c, i, arr) => (
                <div key={i} style={i === arr.length - 1 ? s.infoRowLast : s.infoRow}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{c.label}</div>
                    <div style={{ fontSize: 11, color: "#aaa" }}>{c.freq}</div>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>${c.amount}</span>
                </div>
              ))}
              <div style={{ ...s.infoRow, borderBottom: "none", marginTop: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Total monthly</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#0C447C" }}>${tenant.rent + 50}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Payments tab ── */}
        {activeTab === "Payments" && (
          <div style={s.card(2)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #f0f0f0" }}>
              <div>
                <div style={s.cardTitle}>Payment history</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: -10 }}>{payments.filter(p => p.status === "paid").length} payments recorded</div>
              </div>
              <button style={s.btn(true)}>⬇️ Download ledger</button>
            </div>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Date</th>
                  <th style={s.th}>Description</th>
                  <th style={{ ...s.th, textAlign: "right" }}>Amount</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={i}>
                    <td style={s.td}>{p.date}</td>
                    <td style={s.td}>{p.desc}</td>
                    <td style={{ ...s.td, textAlign: "right", fontWeight: 600 }}>${p.amount.toLocaleString()}</td>
                    <td style={s.td}><span style={s.payBadge(p.status)}>{STATUS_CONFIG[p.status]?.label}</span></td>
                    <td style={s.td}>
                      {p.status === "paid" && <button style={s.btn(false)}>Receipt</button>}
                      {p.status === "upcoming" && <button style={s.btn(true)}>Request</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Maintenance tab ── */}
        {activeTab === "Maintenance" && (
          <div style={s.card(2)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #f0f0f0" }}>
              <div style={s.cardTitle}>Maintenance history</div>
              <button style={s.btn(true)}>+ New request</button>
            </div>
            {maintenance.length === 0 ? (
              <div style={s.emptyState}>🎉 No maintenance requests for this unit</div>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Issue</th>
                    <th style={s.th}>Priority</th>
                    <th style={s.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenance.map((m, i) => (
                    <tr key={i}>
                      <td style={s.td}>{m.date}</td>
                      <td style={s.td}>{m.issue}</td>
                      <td style={s.td}><span style={s.payBadge(m.priority === "normal" ? "upcoming" : "late")}>{m.priority}</span></td>
                      <td style={s.td}><span style={s.payBadge(m.status)}>{STATUS_CONFIG[m.status]?.label}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Documents tab ── */}
        {activeTab === "Documents" && (
          <div style={s.card(2)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #f0f0f0" }}>
              <div style={s.cardTitle}>Documents</div>
              <button style={s.btn(true)}>+ Upload</button>
            </div>
            {[
              { icon: "📋", name: "Lease Agreement", date: tenant.leaseStart, size: "1.2 MB" },
              { icon: "🏠", name: "Move-In Inspection", date: tenant.moveIn, size: "3.4 MB" },
              { icon: "🛡️", name: "Renters Insurance", date: "Updated May 1, 2026", size: "88 KB" },
            ].map((doc, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid #f8f9fa" }}>
                <span style={{ fontSize: 24 }}>{doc.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{doc.name}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{doc.date} · {doc.size}</div>
                </div>
                <button style={s.btn(false)}>View</button>
                <button style={s.btn(false)}>⬇️</button>
              </div>
            ))}
          </div>
        )}

        {/* ── Notes tab ── */}
        {activeTab === "Notes" && (
          <div style={s.card(2)}>
            <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #f0f0f0" }}>
              <div style={s.cardTitle}>Private notes</div>
              <div style={{ fontSize: 11, color: "#aaa", marginTop: -10 }}>Only visible to you — never shown to the tenant</div>
            </div>
            <div style={{ padding: "14px 16px" }}>
              <textarea
                style={s.notesArea}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add private notes about this tenant — payment behavior, communications, maintenance patterns, renewal intent…"
              />
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button style={s.saveNoteBtn} onClick={saveNote}>
                  {noteSaved ? "✓ Saved!" : "Save notes"}
                </button>
                <span style={{ fontSize: 11, color: "#aaa" }}>{notes.length} characters</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
