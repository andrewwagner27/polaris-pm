import { useState } from "react";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Data ──────────────────────────────────────────────────────────────────────
const RENT_ROLL = [
  { property: "Clifton Manor",  unit: "1A", tenant: "James W.",   rent: 1150, status: "paid",    leaseEnd: "Dec 31, 2026", paidDate: "May 31", balance: 0    },
  { property: "Clifton Manor",  unit: "1B", tenant: "Sarah M.",   rent: 1150, status: "paid",    leaseEnd: "Dec 31, 2026", paidDate: "Jun 1",  balance: 0    },
  { property: "Clifton Manor",  unit: "2A", tenant: "Jordan K.",  rent: 1200, status: "paid",    leaseEnd: "Dec 31, 2026", paidDate: "Jun 1",  balance: 0    },
  { property: "Clifton Manor",  unit: "2B", tenant: "Priya M.",   rent: 1150, status: "late",    leaseEnd: "Sep 30, 2026", paidDate: "—",      balance: 1150 },
  { property: "Clifton Manor",  unit: "3A", tenant: "Maria R.",   rent: 1150, status: "paid",    leaseEnd: "Dec 31, 2026", paidDate: "Jun 1",  balance: 0    },
  { property: "Clifton Manor",  unit: "3B", tenant: "Alex T.",    rent: 1150, status: "pending", leaseEnd: "Dec 31, 2026", paidDate: "—",      balance: 1150 },
  { property: "Clifton Manor",  unit: "4A", tenant: "Sam P.",     rent: 1200, status: "paid",    leaseEnd: "Jun 30, 2026", paidDate: "Jun 2",  balance: 0    },
  { property: "Clifton Manor",  unit: "4B", tenant: "Chris L.",   rent: 1150, status: "pending", leaseEnd: "Dec 31, 2026", paidDate: "—",      balance: 1150 },
  { property: "Clifton Manor",  unit: "5A", tenant: "Diana F.",   rent: 1150, status: "paid",    leaseEnd: "Dec 31, 2026", paidDate: "Jun 1",  balance: 0    },
  { property: "Clifton Manor",  unit: "5B", tenant: "Marcus B.",  rent: 1150, status: "paid",    leaseEnd: "Jan 31, 2027", paidDate: "Jun 1",  balance: 0    },
  { property: "Clifton Manor",  unit: "6A", tenant: "Vacant",     rent: 1150, status: "vacant",  leaseEnd: "—",            paidDate: "—",      balance: 0    },
  { property: "Clifton Manor",  unit: "6B", tenant: "Vacant",     rent: 1150, status: "vacant",  leaseEnd: "—",            paidDate: "—",      balance: 0    },
  { property: "944 18th Ave S", unit: "Main",   tenant: "Kaidyn T.", rent: 2200, status: "paid",    leaseEnd: "Dec 31, 2026", paidDate: "Jun 1", balance: 0 },
  { property: "944 18th Ave S", unit: "ADU",    tenant: "Airbnb",    rent: 1350, status: "paid",    leaseEnd: "Rolling",      paidDate: "Rolling",balance: 0},
  { property: "944 18th Ave S", unit: "New 1A", tenant: "Pending",   rent: 1600, status: "pending", leaseEnd: "—",            paidDate: "—",      balance: 0 },
  { property: "944 18th Ave S", unit: "New 1B", tenant: "Pending",   rent: 1600, status: "pending", leaseEnd: "—",            paidDate: "—",      balance: 0 },
  { property: "944 18th Ave S", unit: "New 1C", tenant: "Vacant",    rent: 1600, status: "vacant",  leaseEnd: "—",            paidDate: "—",      balance: 0 },
  { property: "944 18th Ave S", unit: "New 1D", tenant: "Vacant",    rent: 1600, status: "vacant",  leaseEnd: "—",            paidDate: "—",      balance: 0 },
];

const DELINQUENCY = RENT_ROLL.filter(r => r.status === "late" || r.status === "pending");

const VACANCIES = RENT_ROLL.filter(r => r.status === "vacant");

const LEASE_EXPIRY = RENT_ROLL
  .filter(r => r.leaseEnd !== "—" && r.leaseEnd !== "Rolling")
  .map(r => {
    const days = Math.ceil((new Date(r.leaseEnd) - new Date()) / (1000 * 60 * 60 * 24));
    return { ...r, daysLeft: days };
  })
  .filter(r => r.daysLeft < 180)
  .sort((a, b) => a.daysLeft - b.daysLeft);

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

const REPORT_CARDS = [
  { id: "rentroll",    icon: "💰", title: "Rent Roll",           sub: "Current payment status for all units",      status: "live",    color: "#185FA5", bg: "#E6F1FB" },
  { id: "delinquency", icon: "⚠️", title: "Delinquency Report", sub: "Late & pending payments with aging",        status: "live",    color: "#A32D2D", bg: "#FDECEA" },
  { id: "vacancy",     icon: "🏠", title: "Vacancy Report",      sub: "Vacant units and lost revenue",            status: "live",    color: "#854F0B", bg: "#FAEEDA" },
  { id: "expiry",      icon: "📅", title: "Lease Expiration",    sub: "Leases expiring in the next 180 days",     status: "live",    color: "#3B6D11", bg: "#EAF3DE" },
  { id: "income",      icon: "📈", title: "Income Statement",    sub: "Revenue vs expenses by property",          status: "coming",  color: "#888",    bg: "#f4f5f7" },
  { id: "cashflow",    icon: "💸", title: "Cash Flow Report",    sub: "Monthly cash in vs cash out",              status: "coming",  color: "#888",    bg: "#f4f5f7" },
  { id: "maintenance", icon: "🔧", title: "Maintenance Cost",    sub: "Spend by vendor, property, category",     status: "coming",  color: "#888",    bg: "#f4f5f7" },
  { id: "yearend",     icon: "📁", title: "Year-End Summary",    sub: "CPA-ready annual income & expense report", status: "coming",  color: "#888",    bg: "#f4f5f7" },
];

// ── PDF generators ────────────────────────────────────────────────────────────
function generateRentRollPDF(data, month) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const navy = [12, 68, 124];
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(...navy);
  doc.rect(0, 0, pageW, 28, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("POLARIS PROPERTY SOLUTIONS", 14, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(133, 183, 235);
  doc.text(`RENT ROLL REPORT — ${month.toUpperCase()}`, 14, 19);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, 14, 24);

  const collected  = data.filter(r => r.status === "paid").reduce((s, r) => s + r.rent, 0);
  const outstanding = data.filter(r => r.status !== "paid" && r.status !== "vacant").reduce((s, r) => s + r.rent, 0);
  const grossRoll  = data.reduce((s, r) => s + r.rent, 0);

  const stats = [[`$${collected.toLocaleString()}`, "COLLECTED"], [`$${outstanding.toLocaleString()}`, "OUTSTANDING"], [`${data.filter(r => r.status === "paid").length}`, "PAID"], [`${data.filter(r => r.status === "vacant").length}`, "VACANT"]];
  const bw = 45;
  stats.forEach((s, i) => {
    const x = 14 + i * (bw + 4);
    doc.setFillColor(245, 246, 247);
    doc.roundedRect(x, 32, bw, 18, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(12, 68, 124);
    doc.text(s[0], x + bw / 2, 42, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(s[1], x + bw / 2, 47, { align: "center" });
  });

  autoTable(doc, {
    startY: 55,
    margin: { left: 14, right: 14 },
    head: [["PROPERTY", "UNIT", "TENANT", "RENT", "STATUS", "PAID DATE", "BALANCE", "LEASE END"]],
    body: data.map(r => [r.property, r.unit, r.tenant, `$${r.rent.toLocaleString()}`, r.status.toUpperCase(), r.paidDate, r.balance > 0 ? `-$${r.balance}` : "$0", r.leaseEnd]),
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold", cellPadding: 4 },
    bodyStyles: { fontSize: 8, cellPadding: 3 },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    didParseCell: (data) => {
      if (data.column.index === 4 && data.section === "body") {
        const status = data.cell.raw.toLowerCase();
        if (status === "paid")    data.cell.styles.textColor = [59, 109, 17];
        if (status === "late")    data.cell.styles.textColor = [163, 45, 45];
        if (status === "pending") data.cell.styles.textColor = [133, 79, 11];
      }
    },
  });

  const finalY = doc.lastAutoTable.finalY + 8;
  doc.setFillColor(245, 246, 247);
  doc.rect(0, finalY, pageW, 16, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text("Polaris Property Solutions LLC · Columbus, OH · This is an official rent roll report.", pageW / 2, finalY + 8, { align: "center" });

  doc.save(`Polaris_Rent_Roll_${month.replace(" ", "_")}.pdf`);
}

// ── Styles ────────────────────────────────────────────────────────────────────
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
  reportGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 32 },
  reportCard: (active, color, bg, coming) => ({ background: coming ? "#fafafa" : active ? bg : "#fff", border: `1px solid ${active ? color + "40" : "#e8eaed"}`, borderRadius: 12, padding: "16px", cursor: coming ? "not-allowed" : "pointer", opacity: coming ? 0.6 : 1, transition: "all 0.15s", borderTop: `3px solid ${coming ? "#e8eaed" : color}` }),
  reportIcon: { fontSize: 24, marginBottom: 10 },
  reportTitle: (active, color) => ({ fontSize: 13, fontWeight: 700, color: active ? color : "#1a1a1a", marginBottom: 4 }),
  reportSub: { fontSize: 11, color: "#888", lineHeight: 1.5 },
  reportBadge: (status) => ({ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: status === "live" ? "#EAF3DE" : "#f4f5f7", color: status === "live" ? "#3B6D11" : "#aaa", marginTop: 8 }),
  reportContent: { background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, overflow: "hidden" },
  reportHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #f0f0f0", background: "#fafafa" },
  reportTitle2: { fontSize: 15, fontWeight: 700 },
  reportMeta: { fontSize: 12, color: "#888", marginTop: 2 },
  exportBtns: { display: "flex", gap: 8 },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", padding: "10px 16px", textAlign: "left", borderBottom: "1px solid #f0f0f0", background: "#fafafa" },
  td: { fontSize: 13, color: "#1a1a1a", padding: "11px 16px", borderBottom: "1px solid #f8f9fa", verticalAlign: "middle" },
  statusBadge: (status) => ({ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: STATUS_CONFIG[status]?.bg, color: STATUS_CONFIG[status]?.color }),
  propBadge: (prop) => ({ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: prop === "Clifton Manor" ? "#E6F1FB" : "#EAF3DE", color: prop === "Clifton Manor" ? "#185FA5" : "#3B6D11" }),
  summaryRow: { display: "flex", justifyContent: "space-between", padding: "12px 20px", background: "#f8f9fa", borderTop: "1px solid #e8eaed" },
  filterRow: { display: "flex", gap: 10, padding: "12px 20px", borderBottom: "1px solid #f0f0f0", alignItems: "center" },
  select: { padding: "7px 12px", border: "1px solid #e8eaed", borderRadius: 8, fontSize: 12, background: "#fff", fontFamily: "'Inter',sans-serif", outline: "none" },
  statRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, padding: "16px 20px", borderBottom: "1px solid #f0f0f0", background: "#fafafa" },
  statBox: (color, bg) => ({ background: bg, borderRadius: 8, padding: "10px 12px", textAlign: "center" }),
  statVal: (color) => ({ fontSize: 18, fontWeight: 700, color }),
  statLabel: { fontSize: 10, color: "#888", marginTop: 2 },
  alertBanner: (color, bg) => ({ background: bg, border: `1px solid ${color}30`, borderRadius: 8, padding: "10px 14px", margin: "12px 20px 0", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color }),
};

export default function LandlordReports() {
  const navigate = useNavigate();
  const [activeReport, setActiveReport] = useState("rentroll");
  const [propFilter, setPropFilter]     = useState("all");
  const [month] = useState("June 2026");
  const [generating, setGenerating]     = useState(false);

  const filteredRoll = propFilter === "all" ? RENT_ROLL : RENT_ROLL.filter(r => r.property === propFilter);
  const paid = filteredRoll.filter(r => r.status === "paid");
  const late = filteredRoll.filter(r => r.status === "late");
  const pending = filteredRoll.filter(r => r.status === "pending");
  const vacant = filteredRoll.filter(r => r.status === "vacant");
  const totalRoll = filteredRoll.reduce((s, r) => s + r.rent, 0);
  const totalCollected = paid.reduce((s, r) => s + r.rent, 0);
  const totalOutstanding = [...late, ...pending].reduce((s, r) => s + r.rent, 0);

  async function handlePDFExport() {
    setGenerating(true);
    await new Promise(r => setTimeout(r, 600));
    generateRentRollPDF(filteredRoll, month);
    setGenerating(false);
  }

  function exportCSV() {
    const headers = ["Property", "Unit", "Tenant", "Rent", "Status", "Paid Date", "Balance", "Lease End"];
    const rows = filteredRoll.map(r => [r.property, r.unit, r.tenant, r.rent, r.status, r.paidDate, r.balance, r.leaseEnd]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `Rent_Roll_${month.replace(" ","_")}.csv`; a.click();
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
          <div key={item.route} style={s.navItem(item.label === "Rent Roll")} onClick={() => navigate(item.route)}>
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
            <div style={s.pageTitle}>Reports</div>
            <div style={s.pageSub}>Portfolio reporting · {month}</div>
          </div>
        </div>

        {/* Report cards */}
        <div style={s.reportGrid}>
          {REPORT_CARDS.map(card => (
            <div key={card.id} style={s.reportCard(activeReport === card.id, card.color, card.bg, card.status === "coming")}
              onClick={() => card.status === "live" && setActiveReport(card.id)}>
              <div style={s.reportIcon}>{card.icon}</div>
              <div style={s.reportTitle(activeReport === card.id, card.color)}>{card.title}</div>
              <div style={s.reportSub}>{card.sub}</div>
              <div style={s.reportBadge(card.status)}>
                {card.status === "live" ? "● Live" : "Coming soon"}
              </div>
            </div>
          ))}
        </div>

        {/* ── Rent Roll ── */}
        {activeReport === "rentroll" && (
          <div style={s.reportContent}>
            <div style={s.reportHeader}>
              <div>
                <div style={s.reportTitle2}>Rent Roll — {month}</div>
                <div style={s.reportMeta}>{filteredRoll.length} units · {paid.length} paid · {late.length + pending.length} outstanding · {vacant.length} vacant</div>
              </div>
              <div style={s.exportBtns}>
                <button style={s.btn(false)} onClick={exportCSV}>⬇️ CSV</button>
                <button style={s.btn(true)} onClick={handlePDFExport} disabled={generating}>
                  {generating ? "⏳ Generating…" : "⬇️ Download PDF"}
                </button>
              </div>
            </div>
            <div style={s.statRow}>
              {[
                { label: "Gross Roll",    value: `$${totalRoll.toLocaleString()}`,       color: "#185FA5", bg: "#E6F1FB" },
                { label: "Collected",     value: `$${totalCollected.toLocaleString()}`,   color: "#3B6D11", bg: "#EAF3DE" },
                { label: "Outstanding",   value: `$${totalOutstanding.toLocaleString()}`, color: "#A32D2D", bg: "#FDECEA" },
                { label: "Collection %",  value: `${Math.round((totalCollected/totalRoll)*100)}%`, color: "#0C447C", bg: "#E6F1FB" },
              ].map((s2, i) => (
                <div key={i} style={s.statBox(s2.color, s2.bg)}>
                  <div style={s.statVal(s2.color)}>{s2.value}</div>
                  <div style={s.statLabel}>{s2.label}</div>
                </div>
              ))}
            </div>
            <div style={s.filterRow}>
              <select style={s.select} value={propFilter} onChange={e => setPropFilter(e.target.value)}>
                <option value="all">All properties</option>
                <option value="Clifton Manor">Clifton Manor</option>
                <option value="944 18th Ave S">944 18th Ave S</option>
              </select>
              <span style={{ fontSize: 12, color: "#888", marginLeft: "auto" }}>{filteredRoll.length} units</span>
            </div>
            <table style={s.table}>
              <thead>
                <tr>
                  {["Property", "Unit", "Tenant", "Rent", "Status", "Paid Date", "Balance", "Lease End"].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRoll.map((r, i) => (
                  <tr key={i}>
                    <td style={s.td}><span style={s.propBadge(r.property)}>{r.property.split(" ")[0]}</span></td>
                    <td style={{ ...s.td, fontWeight: 600 }}>{r.unit}</td>
                    <td style={s.td}>{r.tenant}</td>
                    <td style={{ ...s.td, fontWeight: 600 }}>${r.rent.toLocaleString()}</td>
                    <td style={s.td}><span style={s.statusBadge(r.status)}>{STATUS_CONFIG[r.status]?.label}</span></td>
                    <td style={{ ...s.td, color: "#888" }}>{r.paidDate}</td>
                    <td style={{ ...s.td, fontWeight: 600, color: r.balance > 0 ? "#A32D2D" : "#3B6D11" }}>{r.balance > 0 ? `-$${r.balance}` : "✓ $0"}</td>
                    <td style={{ ...s.td, fontSize: 12, color: "#888" }}>{r.leaseEnd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={s.summaryRow}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Totals</span>
              <span style={{ fontSize: 13, color: "#888" }}>{paid.length} paid · {late.length} late · {pending.length} pending · {vacant.length} vacant</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#3B6D11" }}>Collected: ${totalCollected.toLocaleString()}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#A32D2D" }}>Outstanding: ${totalOutstanding.toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* ── Delinquency ── */}
        {activeReport === "delinquency" && (
          <div style={s.reportContent}>
            <div style={s.reportHeader}>
              <div>
                <div style={s.reportTitle2}>Delinquency Report — {month}</div>
                <div style={s.reportMeta}>{DELINQUENCY.length} tenants with outstanding balances · ${DELINQUENCY.reduce((s,r) => s+r.rent, 0).toLocaleString()} total</div>
              </div>
              <button style={s.btn(true)}>⬇️ Export PDF</button>
            </div>
            {DELINQUENCY.length > 0 && (
              <div style={s.alertBanner("#A32D2D", "#FDECEA")}>
                🚨 <strong>{DELINQUENCY.length} tenants</strong> have outstanding balances totaling <strong>${DELINQUENCY.reduce((s,r) => s+r.rent,0).toLocaleString()}</strong>. Consider sending payment reminders.
              </div>
            )}
            <table style={{ ...s.table, marginTop: 12 }}>
              <thead>
                <tr>
                  {["Property", "Unit", "Tenant", "Rent Due", "Status", "Days Late", "Action"].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DELINQUENCY.map((r, i) => (
                  <tr key={i}>
                    <td style={s.td}><span style={s.propBadge(r.property)}>{r.property.split(" ")[0]}</span></td>
                    <td style={{ ...s.td, fontWeight: 600 }}>{r.unit}</td>
                    <td style={s.td}>{r.tenant}</td>
                    <td style={{ ...s.td, fontWeight: 700, color: "#A32D2D" }}>${r.rent.toLocaleString()}</td>
                    <td style={s.td}><span style={s.statusBadge(r.status)}>{STATUS_CONFIG[r.status]?.label}</span></td>
                    <td style={s.td}><span style={{ fontSize: 12, fontWeight: 600, color: r.status === "late" ? "#A32D2D" : "#854F0B" }}>{r.status === "late" ? "5 days" : "< 5 days"}</span></td>
                    <td style={s.td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={{ padding: "4px 10px", background: "#FDECEA", border: "1px solid #f5c6c6", borderRadius: 6, fontSize: 11, fontWeight: 600, color: "#A32D2D", cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>Send notice</button>
                        <button style={{ padding: "4px 10px", background: "#E6F1FB", border: "1px solid #B5D4F4", borderRadius: 6, fontSize: 11, fontWeight: 600, color: "#185FA5", cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>Message</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Vacancy ── */}
        {activeReport === "vacancy" && (
          <div style={s.reportContent}>
            <div style={s.reportHeader}>
              <div>
                <div style={s.reportTitle2}>Vacancy Report — {month}</div>
                <div style={s.reportMeta}>{VACANCIES.length} vacant units · ${VACANCIES.reduce((s,r) => s+r.rent,0).toLocaleString()} lost monthly revenue</div>
              </div>
              <button style={s.btn(true)}>⬇️ Export PDF</button>
            </div>
            <div style={s.alertBanner("#854F0B", "#FAEEDA")}>
              💸 <strong>${(VACANCIES.reduce((s,r) => s+r.rent,0) * 12).toLocaleString()}/year</strong> in lost revenue from {VACANCIES.length} vacant units. Fill vacancies to maximize NOI.
            </div>
            <table style={{ ...s.table, marginTop: 12 }}>
              <thead>
                <tr>
                  {["Property", "Unit", "Monthly Rent", "Annual Lost Revenue", "Status"].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {VACANCIES.map((r, i) => (
                  <tr key={i}>
                    <td style={s.td}><span style={s.propBadge(r.property)}>{r.property.split(" ")[0]}</span></td>
                    <td style={{ ...s.td, fontWeight: 600 }}>{r.unit}</td>
                    <td style={{ ...s.td, fontWeight: 600 }}>${r.rent.toLocaleString()}</td>
                    <td style={{ ...s.td, fontWeight: 700, color: "#854F0B" }}>${(r.rent * 12).toLocaleString()}</td>
                    <td style={s.td}><span style={s.statusBadge("vacant")}>Vacant</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={s.summaryRow}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Total lost revenue</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#854F0B" }}>${VACANCIES.reduce((s,r) => s+r.rent,0).toLocaleString()}/mo · ${(VACANCIES.reduce((s,r) => s+r.rent,0)*12).toLocaleString()}/yr</span>
            </div>
          </div>
        )}

        {/* ── Lease Expiry ── */}
        {activeReport === "expiry" && (
          <div style={s.reportContent}>
            <div style={s.reportHeader}>
              <div>
                <div style={s.reportTitle2}>Lease Expiration — Next 180 Days</div>
                <div style={s.reportMeta}>{LEASE_EXPIRY.length} leases expiring · action required</div>
              </div>
              <button style={s.btn(true)}>⬇️ Export PDF</button>
            </div>
            {LEASE_EXPIRY.some(r => r.daysLeft < 60) && (
              <div style={s.alertBanner("#A32D2D", "#FDECEA")}>
                ⚠️ <strong>{LEASE_EXPIRY.filter(r => r.daysLeft < 60).length} lease(s)</strong> expiring within 60 days. Send renewal offers immediately to avoid vacancy.
              </div>
            )}
            <table style={{ ...s.table, marginTop: 12 }}>
              <thead>
                <tr>
                  {["Property", "Unit", "Tenant", "Rent", "Expiry Date", "Days Left", "Action"].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LEASE_EXPIRY.map((r, i) => (
                  <tr key={i}>
                    <td style={s.td}><span style={s.propBadge(r.property)}>{r.property.split(" ")[0]}</span></td>
                    <td style={{ ...s.td, fontWeight: 600 }}>{r.unit}</td>
                    <td style={s.td}>{r.tenant}</td>
                    <td style={{ ...s.td, fontWeight: 600 }}>${r.rent.toLocaleString()}</td>
                    <td style={s.td}>{r.leaseEnd}</td>
                    <td style={s.td}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: r.daysLeft < 60 ? "#A32D2D" : r.daysLeft < 90 ? "#854F0B" : "#3B6D11" }}>
                        {r.daysLeft}d
                      </span>
                    </td>
                    <td style={s.td}>
                      <button style={{ padding: "4px 10px", background: "#E6F1FB", border: "1px solid #B5D4F4", borderRadius: 6, fontSize: 11, fontWeight: 600, color: "#185FA5", cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
                        Send renewal
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
