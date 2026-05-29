import { useState } from "react";

// ── Mortgage calculator helpers ───────────────────────────────────────────────
function calcMonthlyPayment(principal, annualRate, termYears) {
  if (!principal || !annualRate || !termYears) return 0;
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function buildAmortization(principal, annualRate, termYears, startDate) {
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  const payment = calcMonthlyPayment(principal, annualRate, termYears);
  let balance = principal;
  const rows = [];
  const start = startDate ? new Date(startDate) : new Date();

  for (let i = 1; i <= Math.min(n, 360); i++) {
    const interest  = balance * r;
    const princ     = payment - interest;
    balance        -= princ;
    const date = new Date(start);
    date.setMonth(date.getMonth() + i);
    rows.push({
      payment: i,
      date: date.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      principal: princ < 0 ? 0 : princ,
      interest,
      balance: balance < 0 ? 0 : balance,
    });
  }
  return rows;
}

const DSCR_THRESHOLDS = [
  { min: 1.35, label: "Strong",   color: "#3B6D11", bg: "#EAF3DE", desc: "Lenders will love this. Well-covered debt service." },
  { min: 1.25, label: "Good",     color: "#185FA5", bg: "#E6F1FB", desc: "Meets most conventional lender minimums." },
  { min: 1.10, label: "Marginal", color: "#854F0B", bg: "#FAEEDA", desc: "Below typical minimums. Consider increasing rents or reducing expenses." },
  { min: 0,    label: "Negative", color: "#A32D2D", bg: "#FDECEA", desc: "NOI does not cover debt service. Requires immediate attention." },
];

function getDSCR(dscr) {
  if (!dscr || !isFinite(dscr)) return null;
  return DSCR_THRESHOLDS.find(t => dscr >= t.min) || DSCR_THRESHOLDS[3];
}

const INITIAL_PROPERTIES = [
  {
    id: 1,
    name: "Clifton Manor",
    address: "12009 Clifton Blvd, Lakewood OH",
    parcel: "302-10-014",
    // Loan
    loanBalance: 1450000,
    originalLoan: 1600000,
    rate: 6.25,
    termYears: 30,
    loanStart: "2024-08-01",
    // OpEx
    annualTaxes: 22200,
    annualInsurance: 10680,
    annualOther: 8400,
    // Income
    grossAnnualIncome: 123800,
    vacancyPct: 8,
  },
  {
    id: 2,
    name: "944 18th Ave S",
    address: "944 18th Ave S, St. Petersburg FL",
    parcel: "20-31-16-19278-000-0010",
    loanBalance: 680000,
    originalLoan: 720000,
    rate: 7.0,
    termYears: 30,
    loanStart: "2023-06-01",
    annualTaxes: 8400,
    annualInsurance: 6200,
    annualOther: 3600,
    grossAnnualIncome: 42600,
    vacancyPct: 12,
  },
];

const s = {
  wrap: { padding: "0 0 40px" },
  propSelector: { display: "flex", gap: 10, marginBottom: 24 },
  propTab: (active, color) => ({ flex: 1, padding: "12px 16px", background: active ? "#fff" : "#f8f9fa", border: active ? `2px solid ${color}` : "1px solid #e8eaed", borderRadius: 10, cursor: "pointer", transition: "all 0.15s", textAlign: "left" }),
  propTabName: (active, color) => ({ fontSize: 13, fontWeight: 700, color: active ? color : "#1a1a1a" }),
  propTabAddr: { fontSize: 11, color: "#888", marginTop: 2 },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 },
  card: { background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, overflow: "hidden" },
  cardHeader: { padding: "14px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 13, fontWeight: 700, color: "#1a1a1a" },
  cardSub: { fontSize: 11, color: "#888", marginTop: 2 },
  cardBody: { padding: "16px" },
  sectionTitle: { fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, marginTop: 4 },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: 600, color: "#555", letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 5 },
  input: { width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff", fontFamily: "'Inter',sans-serif", outline: "none", color: "#1a1a1a", boxSizing: "border-box" },
  inputPrefix: { position: "relative" },
  prefix: { position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#888", fontSize: 13, pointerEvents: "none" },
  inputWithPrefix: { paddingLeft: 20 },
  inputSuffix: { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#888", fontSize: 12 },
  halfGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  infoRow: (last) => ({ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: last ? "none" : "1px solid #f4f5f7" }),
  infoKey: { fontSize: 13, color: "#888" },
  infoVal: (color) => ({ fontSize: 13, fontWeight: 600, color: color || "#1a1a1a" }),
  // DSCR gauge
  dscrCard: (bg) => ({ background: bg, border: `1px solid ${bg}`, borderRadius: 12, padding: "20px", marginBottom: 20, textAlign: "center" }),
  dscrVal: (color) => ({ fontSize: 48, fontWeight: 800, color, lineHeight: 1, marginBottom: 6 }),
  dscrLabel: (color) => ({ fontSize: 16, fontWeight: 700, color, marginBottom: 8 }),
  dscrDesc: { fontSize: 13, color: "#444", lineHeight: 1.5 },
  dscrGauge: { height: 10, background: "#f0f0f0", borderRadius: 5, overflow: "hidden", margin: "14px 0 6px" },
  dscrFill: (pct, color) => ({ height: "100%", width: `${Math.min(100, pct)}%`, background: color, borderRadius: 5, transition: "width 0.5s" }),
  // Amortization table
  table: { width: "100%", borderCollapse: "collapse" },
  th: { fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #f0f0f0", background: "#fafafa" },
  thRight: { textAlign: "right" },
  td: { fontSize: 12, color: "#1a1a1a", padding: "8px 12px", borderBottom: "1px solid #f8f9fa" },
  tdRight: { textAlign: "right", fontWeight: 500 },
  parcelRow: { display: "flex", gap: 8, alignItems: "center" },
  parcelInput: { flex: 1, padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: "none" },
  parcelBtn: { padding: "9px 14px", background: "#0C447C", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" },
  saveBtn: { width: "100%", padding: "11px", background: "#0C447C", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif", marginTop: 4 },
  summaryHighlight: (color, bg) => ({ background: bg, border: `1px solid ${color}30`, borderRadius: 10, padding: "12px 14px" }),
};

export default function DebtDSCR() {
  const [properties, setProperties] = useState(INITIAL_PROPERTIES);
  const [activeProp, setActiveProp] = useState(0);
  const [showFullAmort, setShowFullAmort] = useState(false);
  const [saved, setSaved] = useState(false);

  const prop = properties[activeProp];

  function updateProp(field, value) {
    setProperties(prev => prev.map((p, i) => i === activeProp ? { ...p, [field]: value } : p));
    setSaved(false);
  }

  // ── Calculations ─────────────────────────────────────────────────────────
  const monthlyPI   = calcMonthlyPayment(prop.loanBalance, prop.rate, prop.termYears);
  const annualPI    = monthlyPI * 12;
  const effectiveIncome = prop.grossAnnualIncome * (1 - prop.vacancyPct / 100);
  const annualOpEx  = prop.annualTaxes + prop.annualInsurance + prop.annualOther;
  const noi         = effectiveIncome - annualOpEx;
  const dscr        = annualPI > 0 ? noi / annualPI : 0;
  const dscrInfo    = getDSCR(dscr);
  const dscrPct     = Math.min(100, (dscr / 2) * 100);
  const equityPct   = prop.originalLoan > 0 ? Math.round(((prop.originalLoan - prop.loanBalance) / prop.originalLoan) * 100) : 0;

  const amortRows   = buildAmortization(prop.loanBalance, prop.rate, prop.termYears, prop.loanStart);
  const displayRows = showFullAmort ? amortRows : amortRows.slice(0, 24);

  const PROP_COLORS = ["#0C447C", "#3B6D11"];

  return (
    <div style={s.wrap}>
      {/* Property selector */}
      <div style={s.propSelector}>
        {properties.map((p, i) => (
          <button key={p.id} style={s.propTab(activeProp === i, PROP_COLORS[i])} onClick={() => setActiveProp(i)}>
            <div style={s.propTabName(activeProp === i, PROP_COLORS[i])}>{p.name}</div>
            <div style={s.propTabAddr}>{p.address}</div>
          </button>
        ))}
      </div>

      {/* DSCR gauge — full width */}
      {dscrInfo && (
        <div style={s.dscrCard(dscrInfo.bg)}>
          <div style={{ fontSize: 11, fontWeight: 600, color: dscrInfo.color, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Debt Service Coverage Ratio</div>
          <div style={s.dscrVal(dscrInfo.color)}>{dscr.toFixed(2)}x</div>
          <div style={s.dscrLabel(dscrInfo.color)}>{dscrInfo.label}</div>
          <div style={s.dscrDesc}>{dscrInfo.desc}</div>
          <div style={s.dscrGauge}>
            <div style={s.dscrFill(dscrPct, dscrInfo.color)} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#aaa" }}>
            <span>0.00x Negative</span>
            <span>1.00x Break-even</span>
            <span>1.25x Min</span>
            <span>2.00x+ Strong</span>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div style={s.grid3}>
        <div style={s.summaryHighlight("#3B6D11", "#EAF3DE")}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#3B6D11", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Effective Gross Income</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#3B6D11" }}>${Math.round(effectiveIncome).toLocaleString()}</div>
          <div style={{ fontSize: 11, color: "#3B6D11", opacity: 0.8, marginTop: 2 }}>After {prop.vacancyPct}% vacancy</div>
        </div>
        <div style={s.summaryHighlight("#A32D2D", "#FDECEA")}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#A32D2D", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Total OpEx (T+I+Other)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#A32D2D" }}>${annualOpEx.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: "#A32D2D", opacity: 0.8, marginTop: 2 }}>Taxes + Insurance + Other</div>
        </div>
        <div style={s.summaryHighlight("#0C447C", "#E6F1FB")}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#0C447C", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>NOI (covers P&I)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0C447C" }}>${Math.round(noi).toLocaleString()}</div>
          <div style={{ fontSize: 11, color: "#0C447C", opacity: 0.8, marginTop: 2 }}>vs ${Math.round(annualPI).toLocaleString()} annual P&I</div>
        </div>
      </div>

      <div style={s.grid2}>
        {/* Left — input panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Mortgage */}
          <div style={s.card}>
            <div style={s.cardHeader}>
              <div>
                <div style={s.cardTitle}>🏦 Mortgage</div>
                <div style={s.cardSub}>Loan details for amortization</div>
              </div>
            </div>
            <div style={s.cardBody}>
              <div style={s.halfGrid}>
                <div style={s.field}>
                  <label style={s.fieldLabel}>Current balance</label>
                  <div style={s.inputPrefix}>
                    <span style={s.prefix}>$</span>
                    <input style={{ ...s.input, ...s.inputWithPrefix }} type="number" value={prop.loanBalance} onChange={e => updateProp("loanBalance", Number(e.target.value))} />
                  </div>
                </div>
                <div style={s.field}>
                  <label style={s.fieldLabel}>Original loan</label>
                  <div style={s.inputPrefix}>
                    <span style={s.prefix}>$</span>
                    <input style={{ ...s.input, ...s.inputWithPrefix }} type="number" value={prop.originalLoan} onChange={e => updateProp("originalLoan", Number(e.target.value))} />
                  </div>
                </div>
                <div style={s.field}>
                  <label style={s.fieldLabel}>Interest rate</label>
                  <div style={s.inputPrefix}>
                    <input style={{ ...s.input, paddingRight: 24 }} type="number" step="0.25" value={prop.rate} onChange={e => updateProp("rate", Number(e.target.value))} />
                    <span style={s.inputSuffix}>%</span>
                  </div>
                </div>
                <div style={s.field}>
                  <label style={s.fieldLabel}>Term (years)</label>
                  <input style={s.input} type="number" value={prop.termYears} onChange={e => updateProp("termYears", Number(e.target.value))} />
                </div>
              </div>
              <div style={s.field}>
                <label style={s.fieldLabel}>Loan start date</label>
                <input style={s.input} type="date" value={prop.loanStart} onChange={e => updateProp("loanStart", e.target.value)} />
              </div>
              <div style={{ background: "#f8f9fa", borderRadius: 8, padding: "10px 12px", display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 11, color: "#888" }}>Monthly P&I</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0C447C" }}>${Math.round(monthlyPI).toLocaleString()}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "#888" }}>Equity paid down</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#3B6D11" }}>{equityPct}%</div>
                </div>
              </div>
            </div>
          </div>

          {/* Taxes */}
          <div style={s.card}>
            <div style={s.cardHeader}>
              <div>
                <div style={s.cardTitle}>🏛️ Property Taxes</div>
                <div style={s.cardSub}>Lookup by parcel or enter manually</div>
              </div>
            </div>
            <div style={s.cardBody}>
              <div style={s.field}>
                <label style={s.fieldLabel}>Parcel number</label>
                <div style={s.parcelRow}>
                  <input style={s.parcelInput} value={prop.parcel} onChange={e => updateProp("parcel", e.target.value)} placeholder="e.g. 302-10-014" />
                  <button style={s.parcelBtn} onClick={() => alert("County assessor API lookup — connects to your county in production.")}>
                    🔍 Lookup
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>Parcel lookup connects to county assessor APIs in production</div>
              </div>
              <div style={s.field}>
                <label style={s.fieldLabel}>Annual property taxes</label>
                <div style={s.inputPrefix}>
                  <span style={s.prefix}>$</span>
                  <input style={{ ...s.input, ...s.inputWithPrefix }} type="number" value={prop.annualTaxes} onChange={e => updateProp("annualTaxes", Number(e.target.value))} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#888" }}>Monthly: <strong>${Math.round(prop.annualTaxes / 12).toLocaleString()}</strong></div>
            </div>
          </div>

          {/* Insurance & Other */}
          <div style={s.card}>
            <div style={s.cardHeader}>
              <div style={s.cardTitle}>🛡️ Insurance & Other OpEx</div>
            </div>
            <div style={s.cardBody}>
              <div style={s.field}>
                <label style={s.fieldLabel}>Annual insurance premium</label>
                <div style={s.inputPrefix}>
                  <span style={s.prefix}>$</span>
                  <input style={{ ...s.input, ...s.inputWithPrefix }} type="number" value={prop.annualInsurance} onChange={e => updateProp("annualInsurance", Number(e.target.value))} />
                </div>
              </div>
              <div style={s.field}>
                <label style={s.fieldLabel}>Other annual OpEx (utilities, mgmt, etc.)</label>
                <div style={s.inputPrefix}>
                  <span style={s.prefix}>$</span>
                  <input style={{ ...s.input, ...s.inputWithPrefix }} type="number" value={prop.annualOther} onChange={e => updateProp("annualOther", Number(e.target.value))} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#888" }}>Total monthly OpEx: <strong>${Math.round(annualOpEx / 12).toLocaleString()}</strong></div>
            </div>
          </div>

          {/* Income */}
          <div style={s.card}>
            <div style={s.cardHeader}><div style={s.cardTitle}>💰 Income</div></div>
            <div style={s.cardBody}>
              <div style={s.field}>
                <label style={s.fieldLabel}>Gross annual income</label>
                <div style={s.inputPrefix}>
                  <span style={s.prefix}>$</span>
                  <input style={{ ...s.input, ...s.inputWithPrefix }} type="number" value={prop.grossAnnualIncome} onChange={e => updateProp("grossAnnualIncome", Number(e.target.value))} />
                </div>
              </div>
              <div style={s.field}>
                <label style={s.fieldLabel}>Vacancy rate</label>
                <div style={s.inputPrefix}>
                  <input style={{ ...s.input, paddingRight: 24 }} type="number" step="1" value={prop.vacancyPct} onChange={e => updateProp("vacancyPct", Number(e.target.value))} />
                  <span style={s.inputSuffix}>%</span>
                </div>
              </div>
              <button style={s.saveBtn} onClick={() => setSaved(true)}>
                {saved ? "✓ Saved" : "Save property data"}
              </button>
            </div>
          </div>
        </div>

        {/* Right — summary + NOI bridge */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* NOI Bridge */}
          <div style={s.card}>
            <div style={s.cardHeader}>
              <div>
                <div style={s.cardTitle}>NOI Bridge</div>
                <div style={s.cardSub}>From gross income to DSCR</div>
              </div>
            </div>
            <div style={s.cardBody}>
              {[
                ["Gross annual income",  `$${prop.grossAnnualIncome.toLocaleString()}`,        "#3B6D11", false],
                [`Vacancy (${prop.vacancyPct}%)`, `-$${Math.round(prop.grossAnnualIncome * prop.vacancyPct / 100).toLocaleString()}`, "#A32D2D", false],
                ["= Effective gross income", `$${Math.round(effectiveIncome).toLocaleString()}`, "#185FA5", true],
                ["Property taxes",   `-$${prop.annualTaxes.toLocaleString()}`,     "#A32D2D", false],
                ["Insurance",        `-$${prop.annualInsurance.toLocaleString()}`,  "#A32D2D", false],
                ["Other OpEx",       `-$${prop.annualOther.toLocaleString()}`,      "#A32D2D", false],
                ["= NOI",            `$${Math.round(noi).toLocaleString()}`,        "#0C447C", true],
                ["Annual P&I",       `-$${Math.round(annualPI).toLocaleString()}`,  "#854F0B", false],
                ["= Cash flow",      `$${Math.round(noi - annualPI).toLocaleString()}`, noi - annualPI >= 0 ? "#3B6D11" : "#A32D2D", true],
              ].map(([k, v, color, bold], i, arr) => (
                <div key={i} style={{ ...s.infoRow(i === arr.length - 1), background: bold ? "#f8f9fa" : "transparent", borderRadius: bold ? 6 : 0, padding: bold ? "8px 8px" : "7px 0" }}>
                  <span style={{ fontSize: 13, color: bold ? "#1a1a1a" : "#888", fontWeight: bold ? 700 : 400 }}>{k}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* DSCR detail */}
          <div style={s.card}>
            <div style={s.cardHeader}><div style={s.cardTitle}>DSCR Breakdown</div></div>
            <div style={s.cardBody}>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>NOI ÷ Annual Debt Service</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>
                  ${Math.round(noi).toLocaleString()} ÷ ${Math.round(annualPI).toLocaleString()}
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: dscrInfo?.color || "#1a1a1a", marginTop: 8 }}>
                  = {dscr.toFixed(2)}x
                </div>
              </div>
              {[
                ["Monthly P&I",     `$${Math.round(monthlyPI).toLocaleString()}`],
                ["Annual P&I",      `$${Math.round(annualPI).toLocaleString()}`],
                ["Annual NOI",      `$${Math.round(noi).toLocaleString()}`],
                ["DSCR",            `${dscr.toFixed(2)}x`],
                ["Min lender DSCR", "1.25x"],
                ["Coverage cushion",`${((dscr - 1.25) * 100).toFixed(0)}% ${dscr >= 1.25 ? "above" : "below"} min`],
              ].map(([k, v], i, arr) => (
                <div key={i} style={s.infoRow(i === arr.length - 1)}>
                  <span style={s.infoKey}>{k}</span>
                  <span style={{ ...s.infoVal(i === 3 ? dscrInfo?.color : null) }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Amortization schedule */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <div>
            <div style={s.cardTitle}>Amortization Schedule — {prop.name}</div>
            <div style={s.cardSub}>${Math.round(monthlyPI).toLocaleString()}/mo · {prop.rate}% · {prop.termYears}yr · ${prop.loanBalance.toLocaleString()} balance</div>
          </div>
          <button onClick={() => setShowFullAmort(v => !v)} style={{ padding: "6px 14px", background: "#f4f5f7", border: "1px solid #e8eaed", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
            {showFullAmort ? "Show less" : `Show all ${amortRows.length} payments`}
          </button>
        </div>
        <div style={{ overflowX: "auto", maxHeight: showFullAmort ? 600 : 400, overflowY: "auto" }}>
          <table style={s.table}>
            <thead>
              <tr>
                {["#", "Date", "Payment", "Principal", "Interest", "Balance", "% Principal"].map((h, i) => (
                  <th key={h} style={{ ...s.th, textAlign: i > 1 ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => {
                const princPct = Math.round((row.principal / monthlyPI) * 100);
                return (
                  <tr key={i}>
                    <td style={s.td}>{row.payment}</td>
                    <td style={s.td}>{row.date}</td>
                    <td style={{ ...s.td, ...s.tdRight, fontWeight: 600 }}>${Math.round(monthlyPI).toLocaleString()}</td>
                    <td style={{ ...s.td, ...s.tdRight, color: "#3B6D11" }}>${Math.round(row.principal).toLocaleString()}</td>
                    <td style={{ ...s.td, ...s.tdRight, color: "#A32D2D" }}>${Math.round(row.interest).toLocaleString()}</td>
                    <td style={{ ...s.td, ...s.tdRight, color: "#0C447C" }}>${Math.round(row.balance).toLocaleString()}</td>
                    <td style={{ ...s.td, textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                        <div style={{ width: 40, height: 4, background: "#f0f0f0", borderRadius: 2 }}>
                          <div style={{ height: "100%", width: `${princPct}%`, background: "#3B6D11", borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 11, color: "#555" }}>{princPct}%</span>
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
