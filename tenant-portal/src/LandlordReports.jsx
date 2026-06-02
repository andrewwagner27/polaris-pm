import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";

// ─── Modus tokens ──────────────────────────────────────────────────────────
const C = {
  bg:        "#0A0B0D",
  surface:   "#111316",
  raised:    "#181C21",
  border:    "#252930",
  text:      "#EDEAE2",
  textSub:   "#9095A0",
  textMuted: "#5C6270",
  gold:      "#C9A96E",
  goldDim:   "#7A5C2E",
  blue:      "#4A9AE8",
  green:     "#72B02A",
  red:       "#E05555",
  amber:     "#F0A430",
};

const STATUS = {
  paid:    { label: "Paid",    color: "#72B02A", bg: "rgba(114,176,42,0.13)" },
  pending: { label: "Pending", color: "#F0A430", bg: "rgba(240,164,48,0.13)" },
  late:    { label: "Late",    color: "#E05555", bg: "rgba(224,85,85,0.13)" },
  vacant:  { label: "Vacant",  color: "#5C6270", bg: "rgba(92,98,112,0.15)" },
};

const REPORT_CARDS = [
  { id: "rentroll",    title: "Rent Roll",          sub: "Current payment status for all units",      status: "live",   accent: C.blue },
  { id: "delinquency", title: "Delinquency Report", sub: "Late & pending payments with aging",        status: "live",   accent: C.red },
  { id: "vacancy",     title: "Vacancy Report",     sub: "Vacant units and lost revenue",             status: "live",   accent: C.amber },
  { id: "expiry",      title: "Lease Expiration",   sub: "Leases expiring in the next 180 days",      status: "live",   accent: C.green },
  { id: "income",      title: "Income Statement",   sub: "Revenue vs expenses by property",           status: "coming", accent: C.textMuted },
  { id: "cashflow",    title: "Cash Flow Report",   sub: "Monthly cash in vs cash out",               status: "coming", accent: C.textMuted },
  { id: "maintenance", title: "Maintenance Cost",   sub: "Spend by vendor, property, category",      status: "coming", accent: C.textMuted },
  { id: "yearend",     title: "Year-End Summary",   sub: "CPA-ready annual income & expense report",  status: "coming", accent: C.textMuted },
];

function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

function Badge({ status }) {
  const cfg = STATUS[status];
  if (!cfg) return null;
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: cfg.bg, color: cfg.color, whiteSpace: "nowrap" }}>{cfg.label}</span>;
}

function PropBadge({ name }) {
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: "rgba(74,154,232,0.13)", color: C.blue }}>{name}</span>;
}

function PrimaryBtn({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: "transparent", border: `1px solid ${C.goldDim}`, color: C.gold,
      fontSize: 12, fontWeight: 500, padding: "7px 14px", borderRadius: 7,
      cursor: disabled ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif",
      transition: "background 0.15s", opacity: disabled ? 0.6 : 1,
    }}
      onMouseOver={e => !disabled && (e.currentTarget.style.background = "rgba(201,169,110,0.07)")}
      onMouseOut={e => e.currentTarget.style.background = "transparent"}
    >{children}</button>
  );
}

function GhostBtn({ children, onClick, small }) {
  return (
    <button onClick={onClick} style={{
      background: "transparent", border: `1px solid ${C.border}`, color: C.textSub,
      fontSize: small ? 11 : 12, fontWeight: 500, padding: small ? "5px 10px" : "7px 14px",
      borderRadius: 7, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
    }}
      onMouseOver={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = "#353A44"; }}
      onMouseOut={e => { e.currentTarget.style.color = C.textSub; e.currentTarget.style.borderColor = C.border; }}
    >{children}</button>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{children}</div>;
}

function StatBox({ label, value, accent }) {
  return (
    <div style={{ background: C.raised, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: accent, lineHeight: 1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 10, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
    </div>
  );
}

function AlertBanner({ color, children }) {
  return (
    <div style={{ background: `${color}11`, border: `1px solid ${color}33`, borderRadius: 8, padding: "10px 14px", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color }}>
      {children}
    </div>
  );
}

function generateRentRollPDF(data, month) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const navy = [12, 68, 124];
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageW, 28, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(255,255,255);
  doc.text("MODUS PROPERTY MANAGEMENT", 14, 12);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(133,183,235);
  doc.text(`RENT ROLL REPORT — ${month.toUpperCase()}`, 14, 19);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, 14, 24);
  const collected   = data.filter(r => r.status === "paid").reduce((s,r) => s+r.rent, 0);
  const outstanding = data.filter(r => r.status !== "paid" && r.status !== "vacant").reduce((s,r) => s+r.rent, 0);
  const stats = [[`$${collected.toLocaleString()}`, "COLLECTED"], [`$${outstanding.toLocaleString()}`, "OUTSTANDING"], [`${data.filter(r => r.status === "paid").length}`, "PAID"], [`${data.filter(r => r.status === "vacant").length}`, "VACANT"]];
  const bw = 45;
  stats.forEach((st, i) => {
    const x = 14 + i * (bw + 4);
    doc.setFillColor(245,246,247); doc.roundedRect(x, 32, bw, 18, 2, 2, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(12,68,124);
    doc.text(st[0], x + bw/2, 42, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(100,100,100);
    doc.text(st[1], x + bw/2, 47, { align: "center" });
  });
  autoTable(doc, {
    startY: 55, margin: { left: 14, right: 14 },
    head: [["PROPERTY","UNIT","TENANT","RENT","STATUS","PAID DATE","BALANCE","LEASE END"]],
    body: data.map(r => [r.property, r.unit, r.tenant, `$${r.rent.toLocaleString()}`, r.status.toUpperCase(), r.paidDate||"—", r.balance > 0 ? `-$${r.balance}` : "$0", r.leaseEnd||"—"]),
    headStyles: { fillColor: navy, textColor: [255,255,255], fontSize: 8, fontStyle: "bold", cellPadding: 4 },
    bodyStyles: { fontSize: 8, cellPadding: 3 },
    alternateRowStyles: { fillColor: [249,250,251] },
    didParseCell: (data) => {
      if (data.column.index === 4 && data.section === "body") {
        const s = data.cell.raw.toLowerCase();
        if (s === "paid")    data.cell.styles.textColor = [59,109,17];
        if (s === "late")    data.cell.styles.textColor = [163,45,45];
        if (s === "pending") data.cell.styles.textColor = [133,79,11];
      }
    },
  });
  const finalY = doc.lastAutoTable.finalY + 8;
  doc.setFillColor(245,246,247); doc.rect(0, finalY, pageW, 16, "F");
  doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(100,100,100);
  doc.text("Modus Property Management · Columbus, OH", pageW/2, finalY+8, { align: "center" });
  doc.save(`Modus_Rent_Roll_${month.replace(" ","_")}.pdf`);
}

export default function LandlordReports() {
  const navigate = useNavigate();
  const width    = useWindowWidth();
  const isMobile = width < 768;

  const [activeReport, setActiveReport] = useState("rentroll");
  const [propFilter, setPropFilter]     = useState("all");
  const [generating, setGenerating]     = useState(false);
  const [loading, setLoading]           = useState(true);
  const [properties, setProperties]     = useState([]);
  const [units, setUnits]               = useState([]);
  const [tenants, setTenants]           = useState([]);
  const [payments, setPayments]         = useState([]);

  const month = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [{ data: propsData }, { data: unitsData }, { data: tenantsData }, { data: paymentsData }] = await Promise.all([
      supabase.from("properties").select("*"),
      supabase.from("units").select("*"),
      supabase.from("tenants").select("*"),
      supabase.from("payments").select("*").order("created_at", { ascending: false }),
    ]);
    setProperties(propsData || []);
    setUnits(unitsData || []);
    setTenants(tenantsData || []);
    setPayments(paymentsData || []);
    setLoading(false);
  }

  const rentRoll = units.map(unit => {
    const tenant    = tenants.find(t => t.unit_id === unit.id);
    const property  = properties.find(p => p.id === unit.property_id);
    const latestPay = payments.find(p => p.unit_id === unit.id);
    let status = "vacant", balance = 0, paidDate = "—";
    if (tenant) {
      if (latestPay?.status === "paid") { status = "paid"; paidDate = new Date(latestPay.paid_at || latestPay.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
      else if (latestPay?.status === "failed") { status = "late"; balance = unit.rent_amount || 0; }
      else { status = "pending"; balance = unit.rent_amount || 0; }
    }
    return { id: unit.id, property: property?.name || "—", unit: unit.unit_number || "—", tenant: tenant?.name || "Vacant", rent: unit.rent_amount || 0, status, paidDate, balance, leaseEnd: tenant?.lease_end ? new Date(tenant.lease_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—", leaseEndRaw: tenant?.lease_end || null };
  });

  const filtered = propFilter === "all" ? rentRoll : rentRoll.filter(r => { const prop = properties.find(p => p.id === propFilter); return r.property === prop?.name; });
  const paid = filtered.filter(r => r.status === "paid");
  const late = filtered.filter(r => r.status === "late");
  const pending = filtered.filter(r => r.status === "pending");
  const vacant = filtered.filter(r => r.status === "vacant");
  const delinquent = filtered.filter(r => r.status === "late" || r.status === "pending");
  const vacancies  = filtered.filter(r => r.status === "vacant");
  const totalRoll        = filtered.reduce((s,r) => s+r.rent, 0);
  const totalCollected   = paid.reduce((s,r) => s+r.rent, 0);
  const totalOutstanding = delinquent.reduce((s,r) => s+r.balance, 0);
  const leaseExpiry = filtered.filter(r => r.leaseEndRaw).map(r => ({ ...r, daysLeft: Math.ceil((new Date(r.leaseEndRaw) - new Date()) / (1000*60*60*24)) })).filter(r => r.daysLeft < 180).sort((a,b) => a.daysLeft - b.daysLeft);

  async function handlePDFExport() {
    setGenerating(true);
    await new Promise(r => setTimeout(r, 300));
    generateRentRollPDF(filtered, month);
    setGenerating(false);
  }

  function exportCSV() {
    const headers = ["Property","Unit","Tenant","Rent","Status","Paid Date","Balance","Lease End"];
    const rows = filtered.map(r => [r.property, r.unit, r.tenant, r.rent, r.status, r.paidDate, r.balance, r.leaseEnd]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `Modus_Rent_Roll_${month.replace(" ","_")}.csv`; a.click();
  }

  const TH = ({ children, right }) => (
    <th style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em", padding: "10px 16px", textAlign: right ? "right" : "left", borderBottom: `1px solid ${C.border}`, background: C.raised, whiteSpace: "nowrap" }}>{children}</th>
  );
  const TD = ({ children, right, bold, color }) => (
    <td style={{ fontSize: 13, color: color || (bold ? C.text : C.textSub), fontWeight: bold ? 600 : 400, padding: "11px 16px", borderBottom: `1px solid ${C.border}`, textAlign: right ? "right" : "left", verticalAlign: "middle" }}>{children}</td>
  );

  return (
    <LandlordLayout openMaintenance={0} unreadMessages={0}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        .m-report-card:hover { border-color: #353A44 !important; }
        .m-row:hover td { background: ${C.raised} !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "20px 16px" : "28px 32px 48px" }}>

        {/* Top bar */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 20 : 24, fontWeight: 600, color: C.text }}>Reports</div>
          <div style={{ fontSize: 13, color: C.textSub, marginTop: 3 }}>Portfolio reporting · {month}</div>
        </div>

        {/* Report selector grid */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 10, marginBottom: 28 }}>
          {REPORT_CARDS.map(card => {
            const active  = activeReport === card.id;
            const coming  = card.status === "coming";
            return (
              <div key={card.id} className={coming ? "" : "m-report-card"}
                style={{
                  background: active ? `${card.accent}0F` : C.surface,
                  border: `1px solid ${active ? card.accent + "44" : C.border}`,
                  borderTop: `2px solid ${coming ? C.border : card.accent}`,
                  borderRadius: 10, padding: "14px 16px",
                  cursor: coming ? "not-allowed" : "pointer",
                  opacity: coming ? 0.5 : 1, transition: "border-color 0.15s",
                }}
                onClick={() => !coming && setActiveReport(card.id)}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: active ? card.accent : C.text, marginBottom: 4 }}>{card.title}</div>
                <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.5 }}>{card.sub}</div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, marginTop: 8, padding: "2px 8px", borderRadius: 5, background: coming ? C.raised : `${card.accent}15`, color: coming ? C.textMuted : card.accent }}>
                  {coming ? "Coming soon" : "● Live"}
                </div>
              </div>
            );
          })}
        </div>

        {loading && <div style={{ color: C.textSub, fontSize: 13, textAlign: "center", padding: 40 }}>Loading data…</div>}

        {!loading && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>

            {/* ── Rent Roll ── */}
            {activeReport === "rentroll" && (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Rent Roll — {month}</div>
                    <div style={{ fontSize: 12, color: C.textSub, marginTop: 3 }}>{filtered.length} units · {paid.length} paid · {delinquent.length} outstanding · {vacant.length} vacant</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <GhostBtn onClick={exportCSV}>⬇ CSV</GhostBtn>
                    <PrimaryBtn onClick={handlePDFExport} disabled={generating}>{generating ? "Generating…" : "⬇ PDF"}</PrimaryBtn>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
                  <StatBox label="Gross Roll"   value={`$${totalRoll.toLocaleString()}`}       accent={C.blue} />
                  <StatBox label="Collected"    value={`$${totalCollected.toLocaleString()}`}   accent={C.green} />
                  <StatBox label="Outstanding"  value={`$${totalOutstanding.toLocaleString()}`} accent={C.red} />
                  <StatBox label="Collection %" value={totalRoll > 0 ? `${Math.round((totalCollected/totalRoll)*100)}%` : "—"} accent={C.gold} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", borderBottom: `1px solid ${C.border}` }}>
                  <select value={propFilter} onChange={e => setPropFilter(e.target.value)} style={{ padding: "7px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, background: C.raised, color: C.textSub, outline: "none", fontFamily: "'DM Sans', sans-serif" }}>
                    <option value="all">All properties</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <span style={{ fontSize: 12, color: C.textMuted, marginLeft: "auto" }}>{filtered.length} units</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><TH>Property</TH><TH>Unit</TH><TH>Tenant</TH><TH right>Rent</TH><TH>Status</TH><TH>Paid Date</TH><TH right>Balance</TH><TH>Lease End</TH></tr></thead>
                    <tbody>
                      {filtered.length === 0 && <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: C.textSub, fontSize: 13 }}>No units found.</td></tr>}
                      {filtered.map((r, i) => (
                        <tr key={i} className="m-row">
                          <TD><PropBadge name={r.property} /></TD>
                          <TD bold>{r.unit}</TD>
                          <TD>{r.tenant}</TD>
                          <TD right bold>${r.rent.toLocaleString()}</TD>
                          <TD><Badge status={r.status} /></TD>
                          <TD>{r.paidDate}</TD>
                          <TD right bold color={r.balance > 0 ? C.red : C.green}>{r.balance > 0 ? `-$${r.balance}` : "✓ $0"}</TD>
                          <TD>{r.leaseEnd}</TD>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 20px", background: C.raised, borderTop: `1px solid ${C.border}`, flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Totals</span>
                  <span style={{ fontSize: 13, color: C.textSub }}>{paid.length} paid · {late.length} late · {pending.length} pending · {vacant.length} vacant</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.green }}>Collected: ${totalCollected.toLocaleString()}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.red }}>Outstanding: ${totalOutstanding.toLocaleString()}</span>
                </div>
              </>
            )}

            {/* ── Delinquency ── */}
            {activeReport === "delinquency" && (
              <>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Delinquency Report — {month}</div>
                  <div style={{ fontSize: 12, color: C.textSub, marginTop: 3 }}>{delinquent.length} tenants with outstanding balances · ${delinquent.reduce((s,r) => s+r.balance, 0).toLocaleString()} total</div>
                </div>
                <div style={{ padding: "16px 20px" }}>
                  {delinquent.length > 0 && <AlertBanner color={C.red}>🚨 <strong>{delinquent.length} tenants</strong> have outstanding balances totaling <strong>${delinquent.reduce((s,r) => s+r.balance, 0).toLocaleString()}</strong>.</AlertBanner>}
                  {delinquent.length === 0 && <div style={{ padding: "24px 0", textAlign: "center", color: C.green, fontSize: 14, fontWeight: 600 }}>🎉 No delinquent tenants this month!</div>}
                </div>
                {delinquent.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr><TH>Property</TH><TH>Unit</TH><TH>Tenant</TH><TH right>Rent Due</TH><TH>Status</TH><TH>Action</TH></tr></thead>
                      <tbody>
                        {delinquent.map((r, i) => (
                          <tr key={i} className="m-row">
                            <TD><PropBadge name={r.property} /></TD>
                            <TD bold>{r.unit}</TD>
                            <TD>{r.tenant}</TD>
                            <TD right bold color={C.red}>${r.balance.toLocaleString()}</TD>
                            <TD><Badge status={r.status} /></TD>
                            <TD><GhostBtn small onClick={() => navigate("/landlord/messages")}>Message</GhostBtn></TD>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* ── Vacancy ── */}
            {activeReport === "vacancy" && (
              <>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Vacancy Report — {month}</div>
                  <div style={{ fontSize: 12, color: C.textSub, marginTop: 3 }}>{vacancies.length} vacant units · ${vacancies.reduce((s,r) => s+r.rent, 0).toLocaleString()} lost monthly revenue</div>
                </div>
                <div style={{ padding: "16px 20px" }}>
                  {vacancies.length > 0 && <AlertBanner color={C.amber}>💸 <strong>${(vacancies.reduce((s,r) => s+r.rent,0)*12).toLocaleString()}/year</strong> in lost revenue from {vacancies.length} vacant units.</AlertBanner>}
                  {vacancies.length === 0 && <div style={{ padding: "24px 0", textAlign: "center", color: C.green, fontSize: 14, fontWeight: 600 }}>🎉 All units are occupied!</div>}
                </div>
                {vacancies.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr><TH>Property</TH><TH>Unit</TH><TH right>Monthly Rent</TH><TH right>Annual Lost Revenue</TH><TH>Status</TH></tr></thead>
                      <tbody>
                        {vacancies.map((r, i) => (
                          <tr key={i} className="m-row">
                            <TD><PropBadge name={r.property} /></TD>
                            <TD bold>{r.unit}</TD>
                            <TD right bold>${r.rent.toLocaleString()}</TD>
                            <TD right bold color={C.amber}>${(r.rent*12).toLocaleString()}</TD>
                            <TD><Badge status="vacant" /></TD>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* ── Lease Expiry ── */}
            {activeReport === "expiry" && (
              <>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Lease Expiration — Next 180 Days</div>
                  <div style={{ fontSize: 12, color: C.textSub, marginTop: 3 }}>{leaseExpiry.length} leases expiring · action required</div>
                </div>
                <div style={{ padding: "16px 20px" }}>
                  {leaseExpiry.some(r => r.daysLeft < 60) && <AlertBanner color={C.red}>⚠️ <strong>{leaseExpiry.filter(r => r.daysLeft < 60).length} lease(s)</strong> expiring within 60 days. Send renewal offers immediately.</AlertBanner>}
                  {leaseExpiry.length === 0 && <div style={{ padding: "24px 0", textAlign: "center", color: C.textSub, fontSize: 13 }}>No leases expiring in the next 180 days.</div>}
                </div>
                {leaseExpiry.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr><TH>Property</TH><TH>Unit</TH><TH>Tenant</TH><TH right>Rent</TH><TH>Expiry Date</TH><TH>Days Left</TH><TH>Action</TH></tr></thead>
                      <tbody>
                        {leaseExpiry.map((r, i) => (
                          <tr key={i} className="m-row">
                            <TD><PropBadge name={r.property} /></TD>
                            <TD bold>{r.unit}</TD>
                            <TD>{r.tenant}</TD>
                            <TD right bold>${r.rent.toLocaleString()}</TD>
                            <TD>{r.leaseEnd}</TD>
                            <TD><span style={{ fontSize: 13, fontWeight: 700, color: r.daysLeft < 60 ? C.red : r.daysLeft < 90 ? C.amber : C.green }}>{r.daysLeft}d</span></TD>
                            <TD><GhostBtn small onClick={() => navigate("/landlord/messages")}>Send renewal</GhostBtn></TD>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </LandlordLayout>
  );
}