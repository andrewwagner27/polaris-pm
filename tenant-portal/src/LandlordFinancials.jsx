import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useNavigate } from "react-router-dom";
import DebtDSCR from './DebtDSCR';
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

// ─── Static data ───────────────────────────────────────────────────────────
const MONTHLY_DATA = [
  { month: "Jan", income: 20600, expenses: 4200, noi: 16400 },
  { month: "Feb", income: 20600, expenses: 3800, noi: 16800 },
  { month: "Mar", income: 21350, expenses: 5200, noi: 16150 },
  { month: "Apr", income: 21350, expenses: 4100, noi: 17250 },
  { month: "May", income: 21350, expenses: 4550, noi: 16800 },
  { month: "Jun", income: 18550, expenses: 3650, noi: 14900 },
];

const EXPENSES = [
  { id: 1,  date: "Jun 2, 2026",  property: "Clifton Manor",  category: "Maintenance", description: "Plumbing repair — Unit 2B",        amount: 150,  vendor: "Mike's Plumbing" },
  { id: 2,  date: "May 22, 2026", property: "Clifton Manor",  category: "Utilities",   description: "Water/sewer — May",                amount: 620,  vendor: "City of Lakewood" },
  { id: 3,  date: "May 18, 2026", property: "944 18th Ave S", category: "Insurance",   description: "Property insurance — Q2",          amount: 890,  vendor: "Nationwide" },
  { id: 4,  date: "May 15, 2026", property: "Clifton Manor",  category: "Maintenance", description: "Exhaust fan replacement — Unit 3A", amount: 220,  vendor: "Handy Andy LLC" },
  { id: 5,  date: "May 10, 2026", property: "Clifton Manor",  category: "Management",  description: "Property mgmt software",           amount: 0,    vendor: "Modus PM" },
  { id: 6,  date: "May 5, 2026",  property: "Clifton Manor",  category: "Landscaping", description: "Spring cleanup",                   amount: 350,  vendor: "Green Thumb" },
  { id: 7,  date: "Apr 22, 2026", property: "944 18th Ave S", category: "Maintenance", description: "AC tune-up",                       amount: 180,  vendor: "CoolAir HVAC" },
  { id: 8,  date: "Apr 1, 2026",  property: "Clifton Manor",  category: "Mortgage",    description: "Mortgage payment — April",         amount: 5800, vendor: "Union Savings Bank" },
  { id: 9,  date: "Apr 1, 2026",  property: "944 18th Ave S", category: "Mortgage",    description: "Mortgage payment — April",         amount: 2100, vendor: "Union Savings Bank" },
  { id: 10, date: "Mar 15, 2026", property: "Clifton Manor",  category: "Taxes",       description: "Property tax Q1",                  amount: 1850, vendor: "City of Lakewood" },
];

const INCOME = [
  { id: 1, date: "Jun 1, 2026",  property: "Clifton Manor",  category: "Rent",     description: "June rent — 8 of 10 units collected", amount: 9200,  tenant: "Multiple" },
  { id: 2, date: "Jun 1, 2026",  property: "944 18th Ave S", category: "Rent",     description: "June rent — Main unit",                amount: 2200,  tenant: "Kaidyn T." },
  { id: 3, date: "May 1, 2026",  property: "Clifton Manor",  category: "Rent",     description: "May rent — 10 of 10 units",            amount: 11500, tenant: "Multiple" },
  { id: 4, date: "May 1, 2026",  property: "944 18th Ave S", category: "Rent",     description: "May rent — Main + ADU",                amount: 3550,  tenant: "Multiple" },
  { id: 5, date: "May 1, 2026",  property: "944 18th Ave S", category: "Airbnb",   description: "ADU Airbnb revenue — May",             amount: 1350,  tenant: "Airbnb" },
  { id: 6, date: "Mar 6, 2026",  property: "Clifton Manor",  category: "Late Fee", description: "Late fee — Unit 2B",                   amount: 75,    tenant: "Priya M." },
];

const EXPENSE_CATEGORIES = [
  { label: "Mortgage",    color: C.blue,    pct: 42 },
  { label: "Maintenance", color: C.amber,   pct: 18 },
  { label: "Taxes",       color: C.gold,    pct: 15 },
  { label: "Insurance",   color: C.green,   pct: 12 },
  { label: "Utilities",   color: "#6B9AE8", pct: 8  },
  { label: "Other",       color: C.textSub, pct: 5  },
];

const CAT_COLORS = {
  Mortgage:    C.blue,
  Maintenance: C.amber,
  Taxes:       C.gold,
  Insurance:   C.green,
  Utilities:   "#6B9AE8",
  Landscaping: C.green,
  Management:  C.textSub,
  Rent:        C.green,
  Airbnb:      C.amber,
  "Late Fee":  C.red,
};

// ─── Shared components ─────────────────────────────────────────────────────
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

function PrimaryBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: "transparent", border: `1px solid ${C.goldDim}`, color: C.gold,
      fontSize: 12, fontWeight: 500, padding: "7px 14px", borderRadius: 7,
      cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "background 0.15s",
    }}
      onMouseOver={e => e.currentTarget.style.background = "rgba(201,169,110,0.07)"}
      onMouseOut={e => e.currentTarget.style.background = "transparent"}
    >{children}</button>
  );
}

function CatBadge({ cat }) {
  const color = CAT_COLORS[cat] || C.textSub;
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: `${color}18`, color, whiteSpace: "nowrap" }}>{cat}</span>;
}

function PropBadge({ prop }) {
  const color = prop === "Clifton Manor" ? C.blue : C.green;
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: `${color}18`, color }}>{prop.split(" ")[0]}</span>;
}

function Card({ children, style }) {
  return <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", ...style }}>{children}</div>;
}

function CardHeader({ title, sub, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

const TH = ({ children, right }) => (
  <th style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em", padding: "10px 16px", textAlign: right ? "right" : "left", borderBottom: `1px solid ${C.border}`, background: C.raised, whiteSpace: "nowrap" }}>{children}</th>
);
const TD = ({ children, right, bold, color }) => (
  <td style={{ fontSize: 13, color: color || (bold ? C.text : C.textSub), fontWeight: bold ? 600 : 400, padding: "11px 16px", borderBottom: `1px solid ${C.border}`, textAlign: right ? "right" : "left", verticalAlign: "middle" }}>{children}</td>
);

// ─── Bar chart ─────────────────────────────────────────────────────────────
function BarChart({ data, view }) {
  const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expenses)));
  return (
    <div>
      <div style={{ padding: "20px 18px", overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 160, minWidth: 400 }}>
          {data.map((d, i) => {
            const incomeH = Math.round((d.income   / maxVal) * 140);
            const expH    = Math.round((d.expenses / maxVal) * 140);
            const noiH    = Math.round((d.noi      / maxVal) * 140);
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3 }}>
                  {view !== "expenses" && <div style={{ width: 16, height: incomeH, background: C.green,   borderRadius: "3px 3px 0 0", transition: "height 0.3s" }} title={`Income: $${d.income.toLocaleString()}`} />}
                  {view !== "income"   && <div style={{ width: 16, height: expH,    background: C.red,     borderRadius: "3px 3px 0 0", transition: "height 0.3s" }} title={`Expenses: $${d.expenses.toLocaleString()}`} />}
                  {view === "noi"      && <div style={{ width: 16, height: noiH,    background: C.blue,    borderRadius: "3px 3px 0 0", transition: "height 0.3s" }} title={`NOI: $${d.noi.toLocaleString()}`} />}
                </div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 6 }}>{d.month}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, padding: "0 18px 14px", justifyContent: "flex-end" }}>
        {view !== "expenses" && <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.textSub }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green }} />Income</div>}
        {view !== "income"   && <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.textSub }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: C.red   }} />Expenses</div>}
        {view === "noi"      && <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.textSub }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: C.blue  }} />NOI</div>}
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function LandlordFinancials() {
  const [activeTab, setActiveTab]     = useState("Overview");
  const [chartView, setChartView]     = useState("both");
  const [expenseProp, setExpenseProp] = useState("all");
  const [expenseCat, setExpenseCat]     = useState("all");
  const [realExpenses, setRealExpenses] = useState([]);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [properties, setProperties]     = useState([]);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [addForm, setAddForm]           = useState({ description:"", amount:"", vendor_name:"", category:"Maintenance", property_id:"", date: new Date().toISOString().split("T")[0] });
  const [addSaving, setAddSaving]       = useState(false);

  useEffect(() => { fetchExpenses(); fetchProperties(); }, []);

  async function fetchExpenses() {
    setExpensesLoading(true);
    const { data } = await supabase
      .from("expenses")
      .select("*, properties(name), units(unit_number)")
      .order("date", { ascending: false });
    setRealExpenses(data || []);
    setExpensesLoading(false);
  }

  async function fetchProperties() {
    const { data } = await supabase.from("properties").select("id, name");
    setProperties(data || []);
  }

  async function saveExpense() {
    if (!addForm.description || !addForm.amount) return;
    setAddSaving(true);
    await supabase.from("expenses").insert({
      ...addForm,
      amount: parseFloat(addForm.amount),
      property_id: addForm.property_id || null,
    });
    setAddSaving(false);
    setShowAddExpense(false);
    setAddForm({ description:"", amount:"", vendor_name:"", category:"Maintenance", property_id:"", date: new Date().toISOString().split("T")[0] });
    fetchExpenses();
  }

  const ytdIncome   = MONTHLY_DATA.reduce((s, d) => s + d.income, 0);
  const ytdExpenses = MONTHLY_DATA.reduce((s, d) => s + d.expenses, 0);
  const ytdNOI      = MONTHLY_DATA.reduce((s, d) => s + d.noi, 0);
  const noMargin    = Math.round((ytdNOI / ytdIncome) * 100);

  const filteredExpenses = EXPENSES.filter(e => {
    const matchProp = expenseProp === "all" || e.property === expenseProp;
    const matchCat  = expenseCat  === "all" || e.category === expenseCat;
    return matchProp && matchCat;
  });
  const totalFilteredExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);

  const TABS = ["Overview", "Income", "Expenses", "By Property", "Debt & DSCR"];

  const stats = [
    { label: "YTD Income",   value: `$${(ytdIncome/1000).toFixed(1)}k`,   sub: "Gross revenue",        accent: C.green, change: "+12% vs 2025" },
    { label: "YTD Expenses", value: `$${(ytdExpenses/1000).toFixed(1)}k`, sub: "All properties",       accent: C.red,   change: "-3% vs 2025"  },
    { label: "YTD NOI",      value: `$${(ytdNOI/1000).toFixed(1)}k`,      sub: "Net operating income", accent: C.blue,  change: "+18% vs 2025" },
    { label: "NOI Margin",   value: `${noMargin}%`,                       sub: "Income retained",      accent: C.gold,  change: "Healthy range" },
  ];

  return (
    <LandlordLayout openMaintenance={0} unreadMessages={0}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        .m-row:hover td { background: ${C.raised} !important; }
        .m-chart-btn:hover { background: ${C.raised} !important; color: ${C.text} !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif", padding: "28px 32px 48px" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: C.text }}>Financials</div>
            <div style={{ fontSize: 13, color: C.textSub, marginTop: 3 }}>Portfolio performance · Jan–Jun 2026</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select style={{ padding: "7px 12px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12, background: C.surface, color: C.textSub, outline: "none", fontFamily: "'DM Sans', sans-serif" }}>
              <option>2026 YTD</option>
              <option>2025 Full Year</option>
              <option>Last 12 months</option>
            </select>
            <GhostBtn>⬇ Export</GhostBtn>
            <PrimaryBtn>+ Add expense</PrimaryBtn>
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 24 }}>
          {stats.map((s, i) => (
            <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.accent }} />
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em" }}>{s.label}</div>
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 600, color: s.accent, lineHeight: 1, marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: C.textSub }}>{s.sub}</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: s.accent, marginTop: 4 }}>↑ {s.change}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: "10px 16px", fontSize: 13, fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? C.gold : C.textSub,
              background: "none", border: "none",
              borderBottom: activeTab === tab ? `2px solid ${C.gold}` : "2px solid transparent",
              marginBottom: -1, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "color 0.15s",
            }}>{tab}</button>
          ))}
        </div>

        {/* ── Overview ── */}
        {activeTab === "Overview" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
              {/* Chart */}
              <Card>
                <CardHeader
                  title="Cash Flow — Jan to Jun 2026"
                  sub="Income vs expenses vs NOI"
                  action={
                    <div style={{ display: "flex", gap: 5 }}>
                      {[["both","All"],["income","Income"],["expenses","Expenses"],["noi","NOI"]].map(([v,l]) => (
                        <button key={v} className="m-chart-btn" onClick={() => setChartView(v)} style={{
                          padding: "4px 9px", borderRadius: 5, fontSize: 11, fontWeight: chartView === v ? 600 : 400,
                          background: chartView === v ? C.goldDim : "transparent",
                          color: chartView === v ? C.text : C.textSub,
                          border: `1px solid ${chartView === v ? C.goldDim : C.border}`,
                          cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.12s",
                        }}>{l}</button>
                      ))}
                    </div>
                  }
                />
                <BarChart data={MONTHLY_DATA} view={chartView} />
              </Card>

              {/* Expense breakdown */}
              <Card>
                <CardHeader title="Expense breakdown" />
                <div style={{ padding: "16px 18px" }}>
                  <div style={{ textAlign: "center", marginBottom: 14 }}>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: C.red }}>${ytdExpenses.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: C.textSub }}>Total expenses YTD</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {EXPENSE_CATEGORIES.map((cat, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11, color: C.textSub, width: 80, flexShrink: 0 }}>{cat.label}</span>
                        <div style={{ flex: 1, height: 5, background: C.raised, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${cat.pct}%`, background: cat.color, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.text, width: 28, textAlign: "right", flexShrink: 0 }}>{cat.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            {/* Monthly table */}
            <Card>
              <CardHeader title="Monthly summary" action={<button style={{ fontSize: 11, color: C.goldDim, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Export CSV</button>} />
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><TH>Month</TH><TH right>Gross Income</TH><TH right>Expenses</TH><TH right>NOI</TH><TH>Margin</TH></tr></thead>
                <tbody>
                  {MONTHLY_DATA.map((d, i) => (
                    <tr key={i} className="m-row">
                      <TD bold>{d.month} 2026</TD>
                      <TD right bold color={C.green}>${d.income.toLocaleString()}</TD>
                      <TD right bold color={C.red}>${d.expenses.toLocaleString()}</TD>
                      <TD right bold color={C.blue}>${d.noi.toLocaleString()}</TD>
                      <td style={{ padding: "11px 16px", borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 4, background: C.raised, borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${Math.round((d.noi/d.income)*100)}%`, background: C.gold, borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.text, width: 32 }}>{Math.round((d.noi/d.income)*100)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 18px", background: C.raised, borderTop: `1px solid ${C.border}`, flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>YTD Total</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.green }}>${ytdIncome.toLocaleString()}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.red }}>${ytdExpenses.toLocaleString()}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.blue }}>${ytdNOI.toLocaleString()}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.gold }}>{noMargin}% avg</span>
              </div>
            </Card>
          </>
        )}

        {/* ── Income ── */}
        {activeTab === "Income" && (
          <Card>
            <CardHeader
              title="Income ledger"
              sub={`${INCOME.length} transactions · $${INCOME.reduce((s,i) => s+i.amount,0).toLocaleString()} total`}
              action={<GhostBtn small>⬇ Export</GhostBtn>}
            />
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><TH>Date</TH><TH>Property</TH><TH>Category</TH><TH>Description</TH><TH>Tenant</TH><TH right>Amount</TH></tr></thead>
                <tbody>
                  {INCOME.map(row => (
                    <tr key={row.id} className="m-row">
                      <TD>{row.date}</TD>
                      <TD><PropBadge prop={row.property} /></TD>
                      <TD><CatBadge cat={row.category} /></TD>
                      <TD>{row.description}</TD>
                      <TD>{row.tenant}</TD>
                      <TD right bold color={C.green}>${row.amount.toLocaleString()}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 18px", background: C.raised, borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Total income</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.green }}>${INCOME.reduce((s,i) => s+i.amount,0).toLocaleString()}</span>
            </div>
          </Card>
        )}

        {/* ── Expenses ── */}
        {activeTab === "Expenses" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
              <select value={expenseProp} onChange={e => setExpenseProp(e.target.value)} style={{ padding: "7px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, background: C.surface, color: C.textSub, outline: "none", fontFamily: "'DM Sans', sans-serif" }}>
                <option value="all">All properties</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={expenseCat} onChange={e => setExpenseCat(e.target.value)} style={{ padding: "7px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, background: C.surface, color: C.textSub, outline: "none", fontFamily: "'DM Sans', sans-serif" }}>
                <option value="all">All categories</option>
                {["Maintenance","Mortgage","Taxes","Insurance","Utilities","Landscaping","Management","Other"].map(c => <option key={c}>{c}</option>)}
              </select>
              <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: C.red }}>
                {expensesLoading ? "Loading…" : `${realExpenses.filter(e => (expenseProp==="all"||e.property_id===expenseProp)&&(expenseCat==="all"||e.category===expenseCat)).length} expenses · $${realExpenses.filter(e=>(expenseProp==="all"||e.property_id===expenseProp)&&(expenseCat==="all"||e.category===expenseCat)).reduce((s,e)=>s+(e.amount||0),0).toLocaleString()}`}
              </span>
            </div>
            <Card>
              <CardHeader title="Expense ledger" action={
                <div style={{ display:"flex", gap:8 }}>
                  <GhostBtn small onClick={() => setShowAddExpense(true)}>+ Add expense</GhostBtn>
                  <GhostBtn small>⬇ Export</GhostBtn>
                </div>
              }/>
              {expensesLoading ? (
                <div style={{ padding:24, textAlign:"center", color:C.textSub, fontSize:13 }}>Loading expenses…</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><TH>Date</TH><TH>Property</TH><TH>Category</TH><TH>Description</TH><TH>Vendor</TH><TH right>Amount</TH></tr></thead>
                    <tbody>
                      {realExpenses
                        .filter(e => (expenseProp==="all"||e.property_id===expenseProp)&&(expenseCat==="all"||e.category===expenseCat))
                        .map(row => (
                          <tr key={row.id} className="m-row">
                            <TD>{row.date}</TD>
                            <TD>{row.properties?.name ? <PropBadge prop={row.properties.name} /> : "—"}</TD>
                            <TD><CatBadge cat={row.category || "Other"} /></TD>
                            <TD>{row.description}</TD>
                            <TD>{row.vendor_name || "—"}</TD>
                            <TD right bold color={C.red}>${(row.amount||0).toLocaleString()}</TD>
                          </tr>
                        ))
                      }
                      {realExpenses.filter(e=>(expenseProp==="all"||e.property_id===expenseProp)&&(expenseCat==="all"||e.category===expenseCat)).length === 0 && (
                        <tr><td colSpan={6} style={{ padding:24, textAlign:"center", color:C.textSub, fontSize:13 }}>No expenses yet. Approved maintenance invoices will appear here automatically.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 18px", background: C.raised, borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Total expenses</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.red }}>${realExpenses.filter(e=>(expenseProp==="all"||e.property_id===expenseProp)&&(expenseCat==="all"||e.category===expenseCat)).reduce((s,e)=>s+(e.amount||0),0).toLocaleString()}</span>
              </div>
            </Card>

            {/* Add expense modal */}
            {showAddExpense && (
              <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={() => setShowAddExpense(false)}>
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, width:460, padding:"24px" }} onClick={e => e.stopPropagation()}>
                  <div style={{ fontSize:15, fontWeight:600, color:C.text, marginBottom:20 }}>Add expense</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    <div>
                      <label style={{ fontSize:11, fontWeight:600, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:5 }}>Description *</label>
                      <input value={addForm.description} onChange={e => setAddForm(f=>({...f,description:e.target.value}))} placeholder="e.g. Plumbing repair Unit 2B"
                        style={{ width:"100%", padding:"10px 12px", fontSize:13, border:`1px solid ${C.border}`, borderRadius:7, background:C.raised, color:C.text, outline:"none", fontFamily:"'DM Sans',sans-serif", boxSizing:"border-box" }}/>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                      <div>
                        <label style={{ fontSize:11, fontWeight:600, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:5 }}>Amount ($) *</label>
                        <input type="number" value={addForm.amount} onChange={e => setAddForm(f=>({...f,amount:e.target.value}))} placeholder="0.00"
                          style={{ width:"100%", padding:"10px 12px", fontSize:13, border:`1px solid ${C.border}`, borderRadius:7, background:C.raised, color:C.text, outline:"none", fontFamily:"'DM Sans',sans-serif", boxSizing:"border-box" }}/>
                      </div>
                      <div>
                        <label style={{ fontSize:11, fontWeight:600, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:5 }}>Date</label>
                        <input type="date" value={addForm.date} onChange={e => setAddForm(f=>({...f,date:e.target.value}))}
                          style={{ width:"100%", padding:"10px 12px", fontSize:13, border:`1px solid ${C.border}`, borderRadius:7, background:C.raised, color:C.text, outline:"none", fontFamily:"'DM Sans',sans-serif", boxSizing:"border-box" }}/>
                      </div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                      <div>
                        <label style={{ fontSize:11, fontWeight:600, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:5 }}>Category</label>
                        <select value={addForm.category} onChange={e => setAddForm(f=>({...f,category:e.target.value}))}
                          style={{ width:"100%", padding:"10px 12px", fontSize:13, border:`1px solid ${C.border}`, borderRadius:7, background:C.raised, color:C.text, outline:"none", fontFamily:"'DM Sans',sans-serif" }}>
                          {["Maintenance","Mortgage","Taxes","Insurance","Utilities","Landscaping","Management","Other"].map(c=><option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize:11, fontWeight:600, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:5 }}>Property</label>
                        <select value={addForm.property_id} onChange={e => setAddForm(f=>({...f,property_id:e.target.value}))}
                          style={{ width:"100%", padding:"10px 12px", fontSize:13, border:`1px solid ${C.border}`, borderRadius:7, background:C.raised, color:C.text, outline:"none", fontFamily:"'DM Sans',sans-serif" }}>
                          <option value="">All / General</option>
                          {properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize:11, fontWeight:600, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:5 }}>Vendor</label>
                      <input value={addForm.vendor_name} onChange={e => setAddForm(f=>({...f,vendor_name:e.target.value}))} placeholder="e.g. Mike's Plumbing"
                        style={{ width:"100%", padding:"10px 12px", fontSize:13, border:`1px solid ${C.border}`, borderRadius:7, background:C.raised, color:C.text, outline:"none", fontFamily:"'DM Sans',sans-serif", boxSizing:"border-box" }}/>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:10, marginTop:20, justifyContent:"flex-end" }}>
                    <GhostBtn onClick={() => setShowAddExpense(false)}>Cancel</GhostBtn>
                    <PrimaryBtn onClick={saveExpense}>{addSaving ? "Saving…" : "Add expense"}</PrimaryBtn>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── By Property ── */}
        {activeTab === "By Property" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { name: "Clifton Manor",  units: 12, income: 103400, expenses: 19800, noi: 83600, occupancy: 83, color: C.blue },
              { name: "944 18th Ave S", units: 6,  income: 21100,  expenses: 5700,  noi: 15400, occupancy: 83, color: C.green },
            ].map((prop, i) => (
              <Card key={i} style={{ borderTop: `2px solid ${prop.color}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{prop.name}</div>
                  <span style={{ fontSize: 11, color: C.textSub }}>{prop.units} units · {prop.occupancy}% occupied</span>
                </div>
                <div style={{ padding: "16px 18px" }}>
                  {[
                    ["Gross income",   `$${prop.income.toLocaleString()}`,   C.green],
                    ["Total expenses", `$${prop.expenses.toLocaleString()}`, C.red],
                    ["NOI",           `$${prop.noi.toLocaleString()}`,       prop.color],
                    ["NOI margin",    `${Math.round((prop.noi/prop.income)*100)}%`, C.text],
                  ].map(([k, v, c], idx, arr) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: idx === arr.length-1 ? "none" : `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 13, color: C.textSub }}>{k}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: c }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.textSub, marginBottom: 5 }}>
                      <span>NOI margin</span>
                      <span>{Math.round((prop.noi/prop.income)*100)}%</span>
                    </div>
                    <div style={{ height: 6, background: C.raised, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.round((prop.noi/prop.income)*100)}%`, background: prop.color, borderRadius: 3 }} />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {activeTab === "Debt & DSCR" && <DebtDSCR />}
      </div>
    </LandlordLayout>
  );
}