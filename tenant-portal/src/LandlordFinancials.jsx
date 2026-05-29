import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DebtDSCR from './DebtDSCR'

// ── Data ──────────────────────────────────────────────────────────────────────
const MONTHLY_DATA = [
  { month: "Jan", income: 20600, expenses: 4200, noi: 16400 },
  { month: "Feb", income: 20600, expenses: 3800, noi: 16800 },
  { month: "Mar", income: 21350, expenses: 5200, noi: 16150 },
  { month: "Apr", income: 21350, expenses: 4100, noi: 17250 },
  { month: "May", income: 21350, expenses: 4550, noi: 16800 },
  { month: "Jun", income: 18550, expenses: 3650, noi: 14900 },
];

const EXPENSES = [
  { id: 1,  date: "Jun 2, 2026",  property: "Clifton Manor",  category: "Maintenance", description: "Plumbing repair — Unit 2B",       amount: 150,  vendor: "Mike's Plumbing" },
  { id: 2,  date: "May 22, 2026", property: "Clifton Manor",  category: "Utilities",   description: "Water/sewer — May",               amount: 620,  vendor: "City of Lakewood" },
  { id: 3,  date: "May 18, 2026", property: "944 18th Ave S", category: "Insurance",   description: "Property insurance — Q2",         amount: 890,  vendor: "Nationwide" },
  { id: 4,  date: "May 15, 2026", property: "Clifton Manor",  category: "Maintenance", description: "Exhaust fan replacement — Unit 3A",amount: 220,  vendor: "Handy Andy LLC" },
  { id: 5,  date: "May 10, 2026", property: "Clifton Manor",  category: "Management",  description: "Property mgmt software",          amount: 0,    vendor: "Polaris PM" },
  { id: 6,  date: "May 5, 2026",  property: "Clifton Manor",  category: "Landscaping", description: "Spring cleanup",                  amount: 350,  vendor: "Green Thumb" },
  { id: 7,  date: "Apr 22, 2026", property: "944 18th Ave S", category: "Maintenance", description: "AC tune-up",                      amount: 180,  vendor: "CoolAir HVAC" },
  { id: 8,  date: "Apr 1, 2026",  property: "Clifton Manor",  category: "Mortgage",    description: "Mortgage payment — April",        amount: 5800, vendor: "Union Savings Bank" },
  { id: 9,  date: "Apr 1, 2026",  property: "944 18th Ave S", category: "Mortgage",    description: "Mortgage payment — April",        amount: 2100, vendor: "Union Savings Bank" },
  { id: 10, date: "Mar 15, 2026", property: "Clifton Manor",  category: "Taxes",       description: "Property tax Q1",                 amount: 1850, vendor: "City of Lakewood" },
];

const INCOME = [
  { id: 1,  date: "Jun 1, 2026",  property: "Clifton Manor",  category: "Rent",     description: "June rent — 8 of 10 units collected", amount: 9200, tenant: "Multiple" },
  { id: 2,  date: "Jun 1, 2026",  property: "944 18th Ave S", category: "Rent",     description: "June rent — Main unit",                amount: 2200, tenant: "Kaidyn T." },
  { id: 3,  date: "May 1, 2026",  property: "Clifton Manor",  category: "Rent",     description: "May rent — 10 of 10 units",            amount: 11500,tenant: "Multiple" },
  { id: 4,  date: "May 1, 2026",  property: "944 18th Ave S", category: "Rent",     description: "May rent — Main + ADU",                amount: 3550, tenant: "Multiple" },
  { id: 5,  date: "May 1, 2026",  property: "944 18th Ave S", category: "Airbnb",   description: "ADU Airbnb revenue — May",             amount: 1350, tenant: "Airbnb" },
  { id: 6,  date: "Mar 6, 2026",  property: "Clifton Manor",  category: "Late Fee", description: "Late fee — Unit 2B",                   amount: 75,   tenant: "Priya M." },
];

const EXPENSE_CATEGORIES = [
  { label: "Mortgage",    color: "#0C447C", pct: 42 },
  { label: "Maintenance", color: "#185FA5", pct: 18 },
  { label: "Taxes",       color: "#378ADD", pct: 15 },
  { label: "Insurance",   color: "#85B7EB", pct: 12 },
  { label: "Utilities",   color: "#B5D4F4", pct: 8  },
  { label: "Other",       color: "#E6F1FB", pct: 5  },
];

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
  topBarRight: { display: "flex", alignItems: "center", gap: 10 },
  btn: (primary) => ({ padding: "9px 16px", background: primary ? "#0C447C" : "#fff", color: primary ? "#fff" : "#1a1a1a", border: primary ? "none" : "1px solid #e8eaed", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", gap: 6 }),
  statGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 },
  statCard: (accent) => ({ background: "#fff", border: "1px solid #e8eaed", borderRadius: 10, padding: "14px 16px", borderTop: `3px solid ${accent}` }),
  statLabel: { fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 },
  statValue: { fontSize: 26, fontWeight: 700, color: "#1a1a1a" },
  statSub: { fontSize: 11, color: "#888", marginTop: 2 },
  statChange: (pos) => ({ fontSize: 11, fontWeight: 600, color: pos ? "#3B6D11" : "#A32D2D", marginTop: 3 }),
  tabs: { display: "flex", gap: 0, borderBottom: "2px solid #e8eaed", marginBottom: 20 },
  tab: (active) => ({ padding: "10px 18px", fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#0C447C" : "#888", cursor: "pointer", background: "none", border: "none", borderBottom: active ? "2px solid #0C447C" : "2px solid transparent", marginBottom: -2, fontFamily: "'Inter',sans-serif" }),
  twoCol: { display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20 },
  card: { background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, overflow: "hidden" },
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #f0f0f0" },
  cardTitle: { fontSize: 13, fontWeight: 700, color: "#1a1a1a" },
  cardSub: { fontSize: 11, color: "#888", marginTop: 2 },
  cardAction: { fontSize: 12, color: "#185FA5", cursor: "pointer", background: "none", border: "none", fontFamily: "'Inter',sans-serif", padding: 0 },
  // Chart
  chartWrap: { padding: "20px 16px", overflowX: "auto" },
  chartArea: { display: "flex", alignItems: "flex-end", gap: 8, height: 160, minWidth: 400 },
  barGroup: { display: "flex", alignItems: "flex-end", gap: 3, flex: 1 },
  barLabel: { fontSize: 10, color: "#aaa", textAlign: "center", marginTop: 6 },
  chartLegend: { display: "flex", gap: 16, padding: "0 16px 14px", justifyContent: "flex-end" },
  legendItem: { display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#888" },
  legendDot: (color) => ({ width: 8, height: 8, borderRadius: "50%", background: color }),
  // Donut
  donutWrap: { padding: "20px 16px" },
  donutList: { display: "flex", flexDirection: "column", gap: 8, marginTop: 16 },
  donutItem: { display: "flex", alignItems: "center", gap: 10 },
  donutBar: (color, pct) => ({ flex: 1, height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden", position: "relative" }),
  donutFill: (color, pct) => ({ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }),
  donutLabel: { fontSize: 12, color: "#555", width: 80, flexShrink: 0 },
  donutPct: { fontSize: 12, fontWeight: 600, color: "#1a1a1a", width: 30, textAlign: "right", flexShrink: 0 },
  // Table
  table: { width: "100%", borderCollapse: "collapse" },
  th: { fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", padding: "10px 14px", textAlign: "left", borderBottom: "1px solid #f0f0f0", background: "#fafafa" },
  td: { fontSize: 13, color: "#1a1a1a", padding: "10px 14px", borderBottom: "1px solid #f8f9fa", verticalAlign: "middle" },
  catBadge: (cat) => {
    const colors = { Mortgage: ["#0C447C","#E6F1FB"], Maintenance: ["#854F0B","#FAEEDA"], Taxes: ["#6B3FA0","#F3EEFB"], Insurance: ["#3B6D11","#EAF3DE"], Utilities: ["#185FA5","#E6F1FB"], Landscaping: ["#3B6D11","#EAF3DE"], Management: ["#555","#f4f5f7"], Rent: ["#3B6D11","#EAF3DE"], Airbnb: ["#854F0B","#FAEEDA"], "Late Fee": ["#A32D2D","#FDECEA"] };
    const [c, bg] = colors[cat] || ["#555","#f4f5f7"];
    return { fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: bg, color: c };
  },
  propBadge: (prop) => ({ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: prop === "Clifton Manor" ? "#E6F1FB" : "#EAF3DE", color: prop === "Clifton Manor" ? "#185FA5" : "#3B6D11" }),
  filterRow: { display: "flex", gap: 8, marginBottom: 16, alignItems: "center" },
  select: { padding: "7px 12px", border: "1px solid #e8eaed", borderRadius: 8, fontSize: 12, background: "#fff", fontFamily: "'Inter',sans-serif", outline: "none" },
  summaryRow: { display: "flex", justifyContent: "space-between", padding: "8px 16px", borderTop: "1px solid #e8eaed", background: "#fafafa" },
};

// ── Mini bar chart ────────────────────────────────────────────────────────────
function BarChart({ data, view }) {
  const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expenses)));
  return (
    <div>
      <div style={s.chartWrap}>
        <div style={s.chartArea}>
          {data.map((d, i) => {
            const incomeH = Math.round((d.income / maxVal) * 140);
            const expH    = Math.round((d.expenses / maxVal) * 140);
            const noiH    = Math.round((d.noi / maxVal) * 140);
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={s.barGroup}>
                  {view !== "expenses" && <div style={{ width: 18, height: incomeH, background: "#185FA5", borderRadius: "3px 3px 0 0", transition: "height 0.3s" }} title={`Income: $${d.income.toLocaleString()}`} />}
                  {view !== "income"   && <div style={{ width: 18, height: expH,    background: "#E24B4A", borderRadius: "3px 3px 0 0", transition: "height 0.3s" }} title={`Expenses: $${d.expenses.toLocaleString()}`} />}
                  {view === "noi"      && <div style={{ width: 18, height: noiH,    background: "#3B6D11", borderRadius: "3px 3px 0 0", transition: "height 0.3s" }} title={`NOI: $${d.noi.toLocaleString()}`} />}
                </div>
                <div style={s.barLabel}>{d.month}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={s.chartLegend}>
        {view !== "expenses" && <div style={s.legendItem}><div style={s.legendDot("#185FA5")} />Income</div>}
        {view !== "income"   && <div style={s.legendItem}><div style={s.legendDot("#E24B4A")} />Expenses</div>}
        {view === "noi"      && <div style={s.legendItem}><div style={s.legendDot("#3B6D11")} />NOI</div>}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function LandlordFinancials() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab]   = useState("Overview");
  const [chartView, setChartView]   = useState("both");
  const [expenseProp, setExpenseProp] = useState("all");
  const [expenseCat, setExpenseCat]   = useState("all");

  const ytdIncome   = MONTHLY_DATA.reduce((s, d) => s + d.income, 0);
  const ytdExpenses = MONTHLY_DATA.reduce((s, d) => s + d.expenses, 0);
  const ytdNOI      = MONTHLY_DATA.reduce((s, d) => s + d.noi, 0);
  const noMargin    = Math.round((ytdNOI / ytdIncome) * 100);

  const filteredExpenses = EXPENSES.filter(e => {
    const matchProp = expenseProp === "all" || e.property === expenseProp;
    const matchCat  = expenseCat === "all"  || e.category === expenseCat;
    return matchProp && matchCat;
  });

  const totalFilteredExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);

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
          <div key={item.route} style={s.navItem(item.label === "Financials")} onClick={() => navigate(item.route)}>
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
            <div style={s.pageTitle}>Financials</div>
            <div style={s.pageSub}>Portfolio performance · Jan–Jun 2026</div>
          </div>
          <div style={s.topBarRight}>
            <select style={s.select}>
              <option>2026 YTD</option>
              <option>2025 Full Year</option>
              <option>Last 12 months</option>
            </select>
            <button style={s.btn(false)}>⬇️ Export</button>
            <button style={s.btn(true)}>+ Add expense</button>
          </div>
        </div>

        {/* KPI cards */}
        <div style={s.statGrid}>
          {[
            { label: "YTD Income",   value: `$${(ytdIncome/1000).toFixed(1)}k`,   sub: "Gross revenue",         accent: "#3B6D11", change: "+12% vs 2025", pos: true },
            { label: "YTD Expenses", value: `$${(ytdExpenses/1000).toFixed(1)}k`, sub: "All properties",        accent: "#E24B4A", change: "-3% vs 2025",  pos: true },
            { label: "YTD NOI",      value: `$${(ytdNOI/1000).toFixed(1)}k`,      sub: "Net operating income",  accent: "#185FA5", change: "+18% vs 2025", pos: true },
            { label: "NOI Margin",   value: `${noMargin}%`,                       sub: "Income retained",       accent: "#854F0B", change: "Healthy range", pos: true },
          ].map((s2, i) => (
            <div key={i} style={s.statCard(s2.accent)}>
              <div style={s.statLabel}>{s2.label}</div>
              <div style={s.statValue}>{s2.value}</div>
              <div style={s.statSub}>{s2.sub}</div>
              <div style={s.statChange(s2.pos)}>↑ {s2.change}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          {["Overview", "Income", "Expenses", "By Property", "Debt & DSCR"].map(tab => (
            <button key={tab} style={s.tab(activeTab === tab)} onClick={() => setActiveTab(tab)}>{tab}</button>
          ))}
        </div>

        {/* ── Overview ── */}
        {activeTab === "Overview" && (
          <>
            <div style={s.twoCol}>
              {/* Chart */}
              <div style={s.card}>
                <div style={s.cardHeader}>
                  <div>
                    <div style={s.cardTitle}>Cash Flow — Jan to Jun 2026</div>
                    <div style={s.cardSub}>Income vs expenses vs NOI</div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["both","All"],["income","Income"],["expenses","Expenses"],["noi","NOI"]].map(([v,l]) => (
                      <button key={v} onClick={() => setChartView(v)} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: chartView === v ? 600 : 400, background: chartView === v ? "#0C447C" : "#f4f5f7", color: chartView === v ? "#fff" : "#666", border: "none", cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>{l}</button>
                    ))}
                  </div>
                </div>
                <BarChart data={MONTHLY_DATA} view={chartView} />
              </div>

              {/* Expense breakdown */}
              <div style={s.card}>
                <div style={s.cardHeader}>
                  <div style={s.cardTitle}>Expense breakdown</div>
                </div>
                <div style={s.donutWrap}>
                  <div style={{ textAlign: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>${ytdExpenses.toLocaleString()}</div>
                    <div style={{ fontSize: 12, color: "#888" }}>Total expenses YTD</div>
                  </div>
                  <div style={s.donutList}>
                    {EXPENSE_CATEGORIES.map((cat, i) => (
                      <div key={i} style={s.donutItem}>
                        <span style={s.donutLabel}>{cat.label}</span>
                        <div style={s.donutBar(cat.color, cat.pct)}>
                          <div style={s.donutFill(cat.color, cat.pct)} />
                        </div>
                        <span style={s.donutPct}>{cat.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Monthly table */}
            <div style={s.card}>
              <div style={s.cardHeader}>
                <div style={s.cardTitle}>Monthly summary</div>
                <button style={s.cardAction}>Export CSV</button>
              </div>
              <table style={s.table}>
                <thead>
                  <tr>
                    {["Month","Gross Income","Expenses","NOI","Margin"].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MONTHLY_DATA.map((d, i) => (
                    <tr key={i}>
                      <td style={{ ...s.td, fontWeight: 600 }}>{d.month} 2026</td>
                      <td style={{ ...s.td, color: "#3B6D11", fontWeight: 600 }}>${d.income.toLocaleString()}</td>
                      <td style={{ ...s.td, color: "#A32D2D", fontWeight: 600 }}>${d.expenses.toLocaleString()}</td>
                      <td style={{ ...s.td, fontWeight: 700, color: "#0C447C" }}>${d.noi.toLocaleString()}</td>
                      <td style={s.td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, height: 4, background: "#f0f0f0", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${Math.round((d.noi/d.income)*100)}%`, background: "#185FA5", borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#555", width: 32 }}>{Math.round((d.noi/d.income)*100)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={s.summaryRow}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>YTD Total</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#3B6D11" }}>${ytdIncome.toLocaleString()}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#A32D2D" }}>${ytdExpenses.toLocaleString()}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#0C447C" }}>${ytdNOI.toLocaleString()}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{noMargin}% avg</span>
              </div>
            </div>
          </>
        )}

        {/* ── Income tab ── */}
        {activeTab === "Income" && (
          <div style={s.card}>
            <div style={s.cardHeader}>
              <div>
                <div style={s.cardTitle}>Income ledger</div>
                <div style={s.cardSub}>{INCOME.length} transactions · ${INCOME.reduce((s,i) => s+i.amount,0).toLocaleString()} total</div>
              </div>
              <button style={s.btn(false)}>⬇️ Export</button>
            </div>
            <table style={s.table}>
              <thead>
                <tr>
                  {["Date","Property","Category","Description","Tenant","Amount"].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {INCOME.map(row => (
                  <tr key={row.id}>
                    <td style={s.td}>{row.date}</td>
                    <td style={s.td}><span style={s.propBadge(row.property)}>{row.property.split(" ")[0]}</span></td>
                    <td style={s.td}><span style={s.catBadge(row.category)}>{row.category}</span></td>
                    <td style={s.td}>{row.description}</td>
                    <td style={{ ...s.td, color: "#888" }}>{row.tenant}</td>
                    <td style={{ ...s.td, fontWeight: 700, color: "#3B6D11" }}>${row.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={s.summaryRow}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Total income</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#3B6D11" }}>${INCOME.reduce((s,i) => s+i.amount,0).toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* ── Expenses tab ── */}
        {activeTab === "Expenses" && (
          <>
            <div style={s.filterRow}>
              <select style={s.select} value={expenseProp} onChange={e => setExpenseProp(e.target.value)}>
                <option value="all">All properties</option>
                <option value="Clifton Manor">Clifton Manor</option>
                <option value="944 18th Ave S">944 18th Ave S</option>
              </select>
              <select style={s.select} value={expenseCat} onChange={e => setExpenseCat(e.target.value)}>
                <option value="all">All categories</option>
                {["Mortgage","Maintenance","Taxes","Insurance","Utilities","Landscaping"].map(c => <option key={c}>{c}</option>)}
              </select>
              <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: "#A32D2D" }}>
                {filteredExpenses.length} expenses · ${totalFilteredExpenses.toLocaleString()}
              </span>
            </div>
            <div style={s.card}>
              <div style={s.cardHeader}>
                <div style={s.cardTitle}>Expense ledger</div>
                <button style={s.btn(false)}>⬇️ Export</button>
              </div>
              <table style={s.table}>
                <thead>
                  <tr>
                    {["Date","Property","Category","Description","Vendor","Amount"].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map(row => (
                    <tr key={row.id}>
                      <td style={s.td}>{row.date}</td>
                      <td style={s.td}><span style={s.propBadge(row.property)}>{row.property.split(" ")[0]}</span></td>
                      <td style={s.td}><span style={s.catBadge(row.category)}>{row.category}</span></td>
                      <td style={s.td}>{row.description}</td>
                      <td style={{ ...s.td, color: "#888" }}>{row.vendor}</td>
                      <td style={{ ...s.td, fontWeight: 700, color: "#A32D2D" }}>${row.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={s.summaryRow}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Total expenses</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#A32D2D" }}>${totalFilteredExpenses.toLocaleString()}</span>
              </div>
            </div>
          </>
        )}

        {/* ── By Property tab ── */}
        {activeTab === "By Property" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {[
              { name: "Clifton Manor",  units: 12, income: 103400, expenses: 19800, noi: 83600, occupancy: 83, color: "#0C447C" },
              { name: "944 18th Ave S", units: 6,  income: 21100,  expenses: 5700,  noi: 15400, occupancy: 83, color: "#3B6D11" },
            ].map((prop, i) => (
              <div key={i} style={{ ...s.card, borderTop: `3px solid ${prop.color}` }}>
                <div style={s.cardHeader}>
                  <div style={s.cardTitle}>{prop.name}</div>
                  <span style={{ fontSize: 11, color: "#888" }}>{prop.units} units · {prop.occupancy}% occupied</span>
                </div>
                <div style={{ padding: "16px" }}>
                  {[
                    ["Gross income",  `$${prop.income.toLocaleString()}`,   "#3B6D11"],
                    ["Total expenses",`$${prop.expenses.toLocaleString()}`, "#A32D2D"],
                    ["NOI",           `$${prop.noi.toLocaleString()}`,      prop.color],
                    ["NOI margin",    `${Math.round((prop.noi/prop.income)*100)}%`, "#555"],
                  ].map(([k, v, c], idx, arr) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: idx === arr.length-1 ? "none" : "1px solid #f4f5f7" }}>
                      <span style={{ fontSize: 13, color: "#888" }}>{k}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#888", marginBottom: 5 }}>
                      <span>NOI margin</span>
                      <span>{Math.round((prop.noi/prop.income)*100)}%</span>
                    </div>
                    <div style={{ height: 8, background: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.round((prop.noi/prop.income)*100)}%`, background: prop.color, borderRadius: 4 }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

{activeTab === "Debt & DSCR" && <DebtDSCR />}

      </div>
    </div>
  );
}
