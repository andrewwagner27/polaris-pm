import { useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Sample data — replace with real Supabase data later ──────────────────────
const TENANT = {
  name: "Maria Rodriguez",
  email: "maria@email.com",
  phone: "(614) 555-0192",
  unit: "4B",
  property: "Clifton Manor",
  address: "12009 Clifton Blvd, Lakewood, OH 44107",
  leaseStart: "January 1, 2026",
  leaseEnd: "December 31, 2026",
  monthlyRent: 1150.00,
};

const LEDGER = [
  { date: "Jun 1, 2026",  description: "June Rent",         type: "Rent",    amount: 1150.00, status: "Pending" },
  { date: "May 1, 2026",  description: "May Rent",          type: "Rent",    amount: 1150.00, status: "Paid" },
  { date: "Apr 1, 2026",  description: "April Rent",        type: "Rent",    amount: 1150.00, status: "Paid" },
  { date: "Mar 6, 2026",  description: "Late Fee",          type: "Fee",     amount: 75.00,   status: "Paid" },
  { date: "Mar 1, 2026",  description: "March Rent",        type: "Rent",    amount: 1150.00, status: "Paid" },
  { date: "Feb 1, 2026",  description: "February Rent",     type: "Rent",    amount: 1150.00, status: "Paid" },
  { date: "Jan 1, 2026",  description: "January Rent",      type: "Rent",    amount: 1150.00, status: "Paid" },
  { date: "Jan 1, 2026",  description: "Security Deposit",  type: "Deposit", amount: 1150.00, status: "Paid" },
];

const LANDLORD = {
  name: "Polaris Property Solutions LLC",
  address: "Columbus, OH",
  phone: "(614) 555-0100",
  email: "info@polarispm.com",
};

// ── PDF Generator ─────────────────────────────────────────────────────────────
function generateLedgerPDF(tenant, ledger, landlord) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;

  // ── Colors ──
  const navy   = [12, 68, 124];
  const blue   = [24, 95, 165];
  const gray   = [100, 100, 100];
  const light  = [245, 246, 247];
  const green  = [59, 109, 17];
  const orange = [133, 79, 11];
  const red    = [163, 45, 45];

  // ── Header band ──
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageW, 36, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("POLARIS PROPERTY SOLUTIONS", margin, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(133, 183, 235);
  doc.text("TENANT PAYMENT LEDGER", margin, 21);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, margin, 27);

  // Confidential badge
  doc.setFillColor(...blue);
  doc.roundedRect(pageW - 50, 8, 30, 10, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("OFFICIAL", pageW - 43, 14.5);

  // ── Tenant info card ──
  let y = 44;
  doc.setFillColor(...light);
  doc.roundedRect(margin, y, pageW - margin * 2, 38, 3, 3, "F");

  doc.setTextColor(...navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(tenant.name, margin + 5, y + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...gray);

  const col1 = margin + 5;
  const col2 = pageW / 2;

  // Left column
  doc.text(`Unit:`, col1, y + 16);
  doc.setTextColor(30, 30, 30);
  doc.text(`${tenant.unit} · ${tenant.property}`, col1 + 18, y + 16);

  doc.setTextColor(...gray);
  doc.text(`Address:`, col1, y + 22);
  doc.setTextColor(30, 30, 30);
  doc.text(tenant.address, col1 + 22, y + 22);

  doc.setTextColor(...gray);
  doc.text(`Email:`, col1, y + 28);
  doc.setTextColor(30, 30, 30);
  doc.text(tenant.email, col1 + 18, y + 28);

  // Right column
  doc.setTextColor(...gray);
  doc.text(`Lease Start:`, col2, y + 16);
  doc.setTextColor(30, 30, 30);
  doc.text(tenant.leaseStart, col2 + 28, y + 16);

  doc.setTextColor(...gray);
  doc.text(`Lease End:`, col2, y + 22);
  doc.setTextColor(30, 30, 30);
  doc.text(tenant.leaseEnd, col2 + 26, y + 22);

  doc.setTextColor(...gray);
  doc.text(`Monthly Rent:`, col2, y + 28);
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.text(`$${tenant.monthlyRent.toFixed(2)}`, col2 + 30, y + 28);

  // Lease status badge
  doc.setFillColor(234, 243, 222);
  doc.roundedRect(col2, y + 31, 32, 6, 1.5, 1.5, "F");
  doc.setTextColor(...green);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("● ACTIVE LEASE", col2 + 3, y + 35.5);

  y += 46;

  // ── Summary stats row ──
  const stats = [
    { label: "Total Charged",  value: `$${ledger.reduce((s, r) => s + r.amount, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, color: navy },
    { label: "Total Paid",     value: `$${ledger.filter(r => r.status === "Paid").reduce((s, r) => s + r.amount, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, color: green },
    { label: "Balance Due",    value: `$${ledger.filter(r => r.status === "Pending").reduce((s, r) => s + r.amount, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, color: orange },
    { label: "Payments Made",  value: `${ledger.filter(r => r.status === "Paid").length}`, color: blue },
  ];

  const boxW = (pageW - margin * 2 - 9) / 4;
  stats.forEach((stat, i) => {
    const x = margin + i * (boxW + 3);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(x, y, boxW, 18, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...stat.color);
    doc.text(stat.value, x + boxW / 2, y + 10, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...gray);
    doc.text(stat.label.toUpperCase(), x + boxW / 2, y + 15, { align: "center" });
  });

  y += 24;

  // ── Ledger table ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text("PAYMENT HISTORY", margin, y + 1);

  doc.setDrawColor(...navy);
  doc.setLineWidth(0.5);
  doc.line(margin, y + 3, margin + 45, y + 3);

  y += 6;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["DATE", "DESCRIPTION", "TYPE", "AMOUNT", "STATUS"]],
    body: ledger.map(row => [
      row.date,
      row.description,
      row.type,
      `$${row.amount.toFixed(2)}`,
      row.status,
    ]),
    headStyles: {
      fillColor: navy,
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 8.5,
      cellPadding: 3.5,
      textColor: [30, 30, 30],
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 22 },
      3: { cellWidth: 24, halign: "right", fontStyle: "bold" },
      4: {
        cellWidth: 24,
        halign: "center",
        fontStyle: "bold",
      },
    },
    didParseCell: (data) => {
      if (data.column.index === 4 && data.section === "body") {
        const status = data.cell.raw;
        if (status === "Paid")    { data.cell.styles.textColor = green; }
        if (status === "Pending") { data.cell.styles.textColor = orange; }
        if (status === "Overdue") { data.cell.styles.textColor = red; }
      }
    },
  });

  // ── Footer ──
  const finalY = doc.lastAutoTable.finalY + 10;

  doc.setFillColor(...light);
  doc.rect(0, finalY, pageW, 30, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...gray);
  doc.text(`${landlord.name}  ·  ${landlord.address}  ·  ${landlord.phone}  ·  ${landlord.email}`, pageW / 2, finalY + 8, { align: "center" });
  doc.text("This document is an official record of payments processed through the Polaris Property Management platform.", pageW / 2, finalY + 14, { align: "center" });
  doc.text("For disputes or questions, contact your property manager directly.", pageW / 2, finalY + 19, { align: "center" });

  // Page number
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...navy);
  doc.text("POLARIS PROPERTY SOLUTIONS  ·  CONFIDENTIAL", pageW / 2, finalY + 26, { align: "center" });

  // ── Save ──
  const filename = `${tenant.name.replace(/ /g, "_")}_Ledger_${new Date().toISOString().slice(0, 7)}.pdf`;
  doc.save(filename);
}

// ── UI Component ──────────────────────────────────────────────────────────────
const s = {
  wrap: {
    background: "#fff",
    border: "1px solid #e8eaed",
    borderRadius: 12,
    padding: "16px",
    margin: "20px 20px 0",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: { fontSize: 13, fontWeight: 700, color: "#1a1a1a" },
  subtitle: { fontSize: 11, color: "#888", marginTop: 2 },
  previewTable: { width: "100%", borderCollapse: "collapse", marginBottom: 14 },
  th: {
    fontSize: 10, fontWeight: 600, color: "#555",
    textTransform: "uppercase", letterSpacing: "0.05em",
    padding: "6px 8px", borderBottom: "2px solid #e8eaed",
    textAlign: "left",
  },
  td: {
    fontSize: 12, color: "#1a1a1a",
    padding: "8px", borderBottom: "1px solid #f4f5f7",
  },
  statusBadge: (status) => ({
    fontSize: 10, fontWeight: 600,
    padding: "2px 8px", borderRadius: 10,
    background: status === "Paid" ? "#EAF3DE" : status === "Pending" ? "#FAEEDA" : "#FDECEA",
    color: status === "Paid" ? "#3B6D11" : status === "Pending" ? "#854F0B" : "#A32D2D",
  }),
  amountCell: (status) => ({
    fontSize: 12, fontWeight: 600,
    color: status === "Paid" ? "#3B6D11" : "#854F0B",
    textAlign: "right",
  }),
  downloadBtn: (loading) => ({
    width: "100%",
    padding: "12px",
    background: loading ? "#378ADD" : "#0C447C",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: loading ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    transition: "background 0.15s",
  }),
  summaryRow: {
    display: "flex",
    gap: 8,
    marginBottom: 14,
  },
  summaryBox: (color, bg) => ({
    flex: 1,
    background: bg,
    borderRadius: 8,
    padding: "10px 8px",
    textAlign: "center",
  }),
  summaryVal: (color) => ({
    fontSize: 15,
    fontWeight: 700,
    color,
    display: "block",
    marginBottom: 2,
  }),
  summaryLbl: {
    fontSize: 10,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
};

export default function TenantLedgerPDF() {
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const totalPaid    = LEDGER.filter(r => r.status === "Paid").reduce((s, r) => s + r.amount, 0);
  const totalPending = LEDGER.filter(r => r.status === "Pending").reduce((s, r) => s + r.amount, 0);

  async function handleDownload() {
    setLoading(true);
    await new Promise(r => setTimeout(r, 600));
    generateLedgerPDF(TENANT, LEDGER, LANDLORD);
    setLoading(false);
    setGenerated(true);
    setTimeout(() => setGenerated(false), 3000);
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div>
          <div style={s.title}>📄 Payment Ledger</div>
          <div style={s.subtitle}>Official record · lender-ready PDF</div>
        </div>
        {generated && (
          <span style={{ fontSize: 12, color: "#3B6D11", fontWeight: 600 }}>✅ Downloaded!</span>
        )}
      </div>

      {/* Summary stats */}
      <div style={s.summaryRow}>
        <div style={s.summaryBox("#3B6D11", "#EAF3DE")}>
          <span style={s.summaryVal("#3B6D11")}>${totalPaid.toLocaleString()}</span>
          <span style={s.summaryLbl}>Total paid</span>
        </div>
        <div style={s.summaryBox("#854F0B", "#FAEEDA")}>
          <span style={s.summaryVal("#854F0B")}>${totalPending.toLocaleString()}</span>
          <span style={s.summaryLbl}>Balance due</span>
        </div>
        <div style={s.summaryBox("#185FA5", "#E6F1FB")}>
          <span style={s.summaryVal("#185FA5")}>{LEDGER.filter(r => r.status === "Paid").length}</span>
          <span style={s.summaryLbl}>Payments</span>
        </div>
      </div>

      {/* Preview table — last 4 entries */}
      <table style={s.previewTable}>
        <thead>
          <tr>
            <th style={s.th}>Date</th>
            <th style={s.th}>Description</th>
            <th style={{ ...s.th, textAlign: "right" }}>Amount</th>
            <th style={{ ...s.th, textAlign: "center" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {LEDGER.slice(0, 4).map((row, i) => (
            <tr key={i}>
              <td style={s.td}>{row.date}</td>
              <td style={s.td}>{row.description}</td>
              <td style={{ ...s.td, ...s.amountCell(row.status) }}>${row.amount.toFixed(2)}</td>
              <td style={{ ...s.td, textAlign: "center" }}>
                <span style={s.statusBadge(row.status)}>{row.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ fontSize: 11, color: "#aaa", marginBottom: 12, textAlign: "center" }}>
        PDF includes full history · {LEDGER.length} transactions
      </p>

      <button style={s.downloadBtn(loading)} onClick={handleDownload} disabled={loading}>
        {loading
          ? <><span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} /> Generating PDF…</>
          : <>⬇️ Download Official Ledger</>}
      </button>
    </div>
  );
}
