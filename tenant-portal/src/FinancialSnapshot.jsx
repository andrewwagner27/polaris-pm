import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";
import { todayNY } from "./lib/accounting";
import {
  KIND_LABEL, KIND_HELP, VALUE_SOURCES, SNAPSHOT_PERIODS, snapshotRange, propertySnapshot, portfolioSnapshot,
  loanPayment, loanBalance, monthlySeries, attentionItems, fmtMoney, fmtPctValue, fmtRatio, fmtDate, fmtMonth,
} from "./lib/snapshot";
import { Btn, ProfileModal, LoanModal } from "./FinancialInputs";
import { C, font } from "./lib/financialTheme";

// ─── A3.1 Financial Overview ───────────────────────────────────────────────
// Presentation only. Data and definitions are unchanged: actuals from the ledger (a31_property_ledger, and
// a1_scoped_lines for the monthly chart), owner-entered inputs, and lib/snapshot.js for every calculation.

const serif = "'Cormorant Garamond', serif";
const KIND_COLOR = { actual: "#7FA35A", scheduled: "#6F8FB8", entered: "#B5893F", estimate: "#A88A5C" };
const INCOME = "#B5893F", EXPENSE = "#5A8FD6";   // validated pair: dataviz validator, dark mode, surface #14181F
const selectStyle = { padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12, background: "transparent", color: C.textSub, outline: "none", fontFamily: font, cursor: "pointer" };
const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14 };

const CSS = `
  .fo-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
  .fo-split { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 20px; align-items: start; }
  .fo-inv { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px 18px; }
  .fo-prow { display: grid; grid-template-columns: minmax(0, 2.2fr) repeat(3, minmax(0, 1fr)) minmax(0, 0.9fr) 20px; gap: 12px; align-items: center; padding: 16px 22px; border-top: 1px solid ${C.border}; cursor: pointer; transition: background .15s; }
  .fo-prow:hover { background: rgba(255,255,255,0.025); }
  .fo-phead { cursor: default; border-top: none; padding-top: 14px; padding-bottom: 10px; }
  .fo-phead:hover { background: transparent; }
  .fo-cell { text-align: right; font-variant-numeric: tabular-nums; font-size: 14px; color: ${C.text}; }
  .fo-cell-label { display: none; }
  .fo-detail-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; }
  .fo-link { background: none; border: none; color: ${C.gold}; font: inherit; font-size: 12px; cursor: pointer; padding: 0; }
  .fo-link:hover { text-decoration: underline; }
  @media (max-width: 1100px) { .fo-split { grid-template-columns: 1fr; } }
  @media (max-width: 900px) { .fo-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .fo-detail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 720px) {
    .fo-inv { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .fo-phead { display: none; }
    .fo-prow { grid-template-columns: 1fr 1fr; gap: 10px 16px; padding: 16px 18px; }
    .fo-prow > :first-child { grid-column: 1 / -1; }
    .fo-prow > :last-child { display: none; }
    .fo-cell { text-align: left; }
    .fo-cell-label { display: block; font-size: 10px; color: ${C.textMuted}; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 2px; }
  }
  @media (max-width: 420px) { .fo-kpis { grid-template-columns: 1fr; } }
  .fo-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;

// Provenance: a small dot and word. Present everywhere a figure is, never loud.
function Prov({ kind }) {
  if (!kind) return null;
  return (
    <span title={KIND_HELP[kind]} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: C.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: KIND_COLOR[kind] }} />{KIND_LABEL[kind]}
    </span>
  );
}

const fmtShortDate = (d) => fmtDate(d).replace(/, \d{4}$/, "");
const periodText = (preset, range) => `${SNAPSHOT_PERIODS.find((p) => p.value === preset).label} · ${fmtShortDate(range.from)}, ${range.from.slice(0, 4)} – ${fmtDate(range.to)}`;

// ─── Primary KPI ────────────────────────────────────────────────────────────
function Kpi({ label, metric, fmt, explain }) {
  const m = metric, partial = m.available && m.coverage && m.coverage.have < m.coverage.of;
  return (
    <div style={{ ...card, padding: "22px 22px 18px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: C.textSub, fontWeight: 500 }}>{label}</div>
      <div style={{ fontFamily: serif, fontSize: 36, fontWeight: 600, lineHeight: 1.05, color: !m.available ? C.textMuted : m.value < 0 ? "#D27C7C" : C.text, fontVariantNumeric: "tabular-nums" }}>
        {m.available ? fmt(m.value) : "—"}
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, minHeight: 36 }}>{m.available ? explain : m.reason?.replace(/^Not available for any property: /, "")}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: "auto", paddingTop: 6 }}>
        <Prov kind={m.available ? m.kind : null} />
        {partial && <span title={m.note} style={{ fontSize: 11, color: C.textMuted }}>{m.coverage.have} of {m.coverage.of} properties</span>}
      </div>
    </div>
  );
}

// ─── Income vs operating expenses ───────────────────────────────────────────
const niceStep = (span) => { const p = 10 ** Math.floor(Math.log10(span || 1)), f = span / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
const compact = (cents) => { const d = cents / 100, a = Math.abs(d); const s = a >= 1e6 ? `${+(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${+(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k` : `${Math.round(a)}`; return `${d < 0 ? "−" : ""}$${s}`; };
function barPath(x, yBase, yVal, w, r) {
  const h = Math.abs(yBase - yVal); r = Math.min(r, h, w / 2);
  if (h < 0.5) return "";
  return yVal < yBase
    ? `M${x},${yBase}V${yVal + r}Q${x},${yVal} ${x + r},${yVal}H${x + w - r}Q${x + w},${yVal} ${x + w},${yVal + r}V${yBase}Z`
    : `M${x},${yBase}V${yVal - r}Q${x},${yVal} ${x + r},${yVal}H${x + w - r}Q${x + w},${yVal} ${x + w},${yVal - r}V${yBase}Z`;
}

function IncomeExpenseChart({ series }) {
  const ref = useRef(null);
  const [w, setW] = useState(0);   // measured from the container; the SVG never sets the width itself
  const [hover, setHover] = useState(null);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const H = 240, M = { t: 10, r: 8, b: 30, l: 52 };
  const months = series.months, n = months.length;
  const vals = months.flatMap((m) => [m.income, m.expenses]);
  const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals);
  const step = niceStep((hi - lo) / 4 || 100000);
  const top = Math.ceil(hi / step) * step || step, bot = Math.floor(lo / step) * step;
  const ticks = []; for (let v = bot; v <= top + 1e-9; v += step) ticks.push(v);
  const pw = w - M.l - M.r, ph = H - M.t - M.b, gw = pw / n;
  const y = (v) => M.t + ph * (1 - (v - bot) / (top - bot));
  const bw = Math.max(3, Math.min(16, (gw * 0.62 - 2) / 2));
  const every = gw < 30 ? 3 : gw < 44 ? 2 : 1;
  const h = hover != null ? months[hover] : null;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", minHeight: H, overflow: "hidden" }}>
      {w > 0 && <svg width={w} height={H} role="img" aria-label="Monthly income and operating expenses" style={{ display: "block" }} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={w - M.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.05)"} />
            <text x={M.l - 10} y={y(t) + 4} textAnchor="end" fontSize="11" fill={C.textMuted} fontFamily={font}>{compact(t)}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx = M.l + gw * i + gw / 2;
          return (
            <g key={m.month}>
              {hover === i && <rect x={M.l + gw * i + 1} y={M.t} width={gw - 2} height={ph} fill="rgba(255,255,255,0.035)" rx="4" />}
              <path d={barPath(cx - bw - 1, y(0), y(m.income), bw, 4)} fill={INCOME} />
              <path d={barPath(cx + 1, y(0), y(m.expenses), bw, 4)} fill={EXPENSE} />
              {(i % every === 0) && (
                <text x={cx} y={H - 10} textAnchor="middle" fontSize="11" fill={C.textMuted} fontFamily={font}>{fmtMonth(m.month, i === 0 || m.month.endsWith("-01"))}</text>
              )}
              <rect x={M.l + gw * i} y={M.t} width={gw} height={ph + 20} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          );
        })}
      </svg>}
      {h && w > 0 && (
        <div style={{ position: "absolute", top: 4, left: Math.min(Math.max(M.l + gw * hover + gw / 2 - 90, 0), w - 180), width: 180, pointerEvents: "none", background: "#0F1217", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 12, color: C.text, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
          <div style={{ color: C.textSub, marginBottom: 6 }}>{fmtShortDate(h.from)} – {fmtDate(h.to)}{h.partial ? " (part month)" : ""}</div>
          {[["Income", h.income, INCOME], ["Operating expenses", h.expenses, EXPENSE]].map(([k, v, c]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 3 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.textSub }}><span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{k}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMoney(v)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
            <span style={{ color: C.textSub }}>Net</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMoney(h.income - h.expenses)}</span>
          </div>
        </div>
      )}
      <table className="fo-sr">
        <caption>Monthly income and operating expenses</caption>
        <thead><tr><th>Month</th><th>Income</th><th>Operating expenses</th></tr></thead>
        <tbody>{months.map((m) => <tr key={m.month}><td>{m.month}</td><td>{fmtMoney(m.income)}</td><td>{fmtMoney(m.expenses)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function ChartCard({ series, periodLabel }) {
  return (
    <div style={{ ...card, padding: "22px 22px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Income and operating expenses</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>By month · {periodLabel}</div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.textSub, alignItems: "center" }}>
          {[["Income", INCOME], ["Operating expenses", EXPENSE]].map(([k, c]) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{k}</span>
          ))}
          <Prov kind="actual" />
        </div>
      </div>
      {series.hasData ? <IncomeExpenseChart series={series} /> : (
        <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: C.textMuted, fontSize: 13, lineHeight: 1.6, border: `1px dashed ${C.border}`, borderRadius: 10, margin: "4px 0 8px" }}>
          No income or expenses recorded in this period.<br />The chart fills in as payments and expenses are recorded.
        </div>
      )}
    </div>
  );
}

// ─── Property performance ───────────────────────────────────────────────────
function PropertyList({ rows, onOpen }) {
  const num = (m, label) => (
    <div className="fo-cell" title={m.available ? "" : m.reason}>
      <span className="fo-cell-label">{label}</span>
      <span style={{ color: !m.available ? C.textMuted : m.value < 0 ? "#D27C7C" : C.text }}>{m.available ? fmtMoney(m.value) : "—"}</span>
    </div>
  );
  return (
    <div style={{ ...card, overflow: "hidden" }}>
      <div style={{ padding: "20px 22px 4px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Property performance</div>
        <div style={{ fontSize: 12, color: C.textMuted }}>{rows.length} propert{rows.length === 1 ? "y" : "ies"}</div>
      </div>
      <div className="fo-prow fo-phead" style={{ fontSize: 11, color: C.textMuted, letterSpacing: "0.04em" }}>
        <div>Property</div><div className="fo-cell" style={{ fontSize: 11, color: C.textMuted }}>Rent collected</div>
        <div className="fo-cell" style={{ fontSize: 11, color: C.textMuted }}>Operating exp.</div><div className="fo-cell" style={{ fontSize: 11, color: C.textMuted }}>NOI</div>
        <div className="fo-cell" style={{ fontSize: 11, color: C.textMuted }}>Occupancy</div><div />
      </div>
      {rows.length === 0 && <div style={{ padding: "28px 22px", fontSize: 13, color: C.textMuted, borderTop: `1px solid ${C.border}` }}>No properties in this view.</div>}
      {rows.map((r) => {
        const m = r.snap.metrics, occ = m.occupancy;
        return (
          <div key={r.property.id} className="fo-prow" role="button" tabIndex={0} onClick={() => onOpen(r.property.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(r.property.id)}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.property.name}</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.owner ? (r.owner.managed_for_client ? `Client · ${r.owner.name}` : r.owner.name) : "No owner assigned"}
                {r.snap.missing.length > 0 && <span> · <span style={{ color: C.textSub }}>details incomplete</span></span>}
              </div>
            </div>
            {num(m.rentCollected, "Rent collected")}{num(m.opex, "Operating exp.")}{num(m.noi, "NOI")}
            <div className="fo-cell">
              <span className="fo-cell-label">Occupancy</span>
              {occ.available ? <><span>{fmtPctValue(occ.value)}</span><div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{r.snap.occupiedCount}/{r.snap.unitCount} units</div></> : <span style={{ color: C.textMuted }}>—</span>}
            </div>
            <div style={{ color: C.textMuted, fontSize: 16, textAlign: "right" }}>›</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Investment metrics (secondary) ─────────────────────────────────────────
const INVEST = [
  { key: "value", label: "Portfolio value", fmt: fmtMoney }, { key: "debt", label: "Debt outstanding", fmt: fmtMoney },
  { key: "equity", label: "Equity", fmt: fmtMoney }, { key: "capRate", label: "Cap rate", fmt: fmtPctValue },
  { key: "cashOnCash", label: "Cash-on-cash", fmt: fmtPctValue }, { key: "dscr", label: "DSCR", fmt: fmtRatio },
];
function InvestmentMetrics({ metrics }) {
  const gaps = INVEST.filter((d) => !metrics[d.key].available).length;
  return (
    <div style={{ ...card, padding: "20px 22px 22px" }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 18 }}>Investment metrics</div>
      <div className="fo-inv">
        {INVEST.map((d) => {
          const m = metrics[d.key], partial = m.available && m.coverage && m.coverage.have < m.coverage.of;
          return (
            <div key={d.key} title={m.available ? (partial ? m.note : "") : m.reason} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: C.textSub }}>{d.label}</div>
              <div style={{ fontFamily: serif, fontSize: 24, fontWeight: 600, color: m.available ? (m.value < 0 ? "#D27C7C" : C.text) : C.textMuted, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{m.available ? d.fmt(m.value) : "—"}</div>
              <div style={{ marginTop: 4, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Prov kind={m.available ? m.kind : null} />
                {partial && <span style={{ fontSize: 10, color: C.textMuted }}>{m.coverage.have}/{m.coverage.of} properties</span>}
              </div>
            </div>
          );
        })}
      </div>
      {gaps > 0 && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 18, lineHeight: 1.5 }}>{gaps === INVEST.length ? "These need property values, loans and a full year of recorded income." : "Some figures need more information."} Hover a figure for the reason, or see Needs attention.</div>}
    </div>
  );
}

// ─── Needs attention ────────────────────────────────────────────────────────
function Attention({ items, onOpen }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 4);
  return (
    <div style={{ ...card, padding: "20px 22px 18px" }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 14 }}>Needs attention</div>
      {items.length === 0 && <div style={{ fontSize: 13, color: C.textMuted }}>Nothing needs your attention right now.</div>}
      <div style={{ display: "grid", gap: 14 }}>
        {shown.map((it, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "10px 1fr", gap: 12 }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, marginTop: 6, background: it.level === "attention" ? C.amber : C.textMuted }} aria-label={it.level === "attention" ? "Needs action" : "Information"} />
            <div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.45 }}>{it.title}</div>
              <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, marginTop: 2 }}>{it.detail}</div>
              {it.propertyId && <button className="fo-link" style={{ marginTop: 4 }} onClick={() => onOpen(it.propertyId)}>Open property</button>}
            </div>
          </div>
        ))}
      </div>
      {items.length > 4 && <button className="fo-link" style={{ marginTop: 14 }} onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show ${items.length - 4} more`}</button>}
    </div>
  );
}

// ─── Property detail ────────────────────────────────────────────────────────
function Figure({ label, metric, fmt, sub }) {
  const m = metric;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: C.textSub }}>{label}</div>
      <div style={{ fontFamily: serif, fontSize: 26, fontWeight: 600, marginTop: 4, color: !m.available ? C.textMuted : m.value < 0 ? "#D27C7C" : C.text, fontVariantNumeric: "tabular-nums" }}>{m.available ? fmt(m.value) : "—"}</div>
      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, lineHeight: 1.45 }}>{m.available ? (sub || m.note || "") : m.reason}</div>
      <div style={{ marginTop: 6 }}><Prov kind={m.available ? m.kind : null} /></div>
    </div>
  );
}
function Section({ title, action, children, note }) {
  return (
    <div style={{ ...card, padding: "22px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div><div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{title}</div>{note && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>{note}</div>}</div>
        {action}
      </div>
      {children}
    </div>
  );
}
const Line = ({ label, value, strong }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13, color: strong ? C.text : C.textSub, fontWeight: strong ? 600 : 400 }}>
    <span>{label}</span><span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{value}</span>
  </div>
);

function PropertyDetail({ row, periodLabel, onBack, onEditProfile, onEditLoan, onAddLoan, onDeleteLoan }) {
  const [confirmDel, setConfirmDel] = useState(null);
  const today = todayNY();
  const { property: p, owner, books, profile, loans, ledger, snap } = row;
  const m = snap.metrics;
  const income = ledger.filter((r) => r.account_type === "income"), expenses = ledger.filter((r) => r.account_type === "expense");
  const total = (rs) => rs.reduce((s, r) => s + Number(r.amount_cents), 0);
  const gaps = snap.missing.filter((x) => x !== "set of books");
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <button className="fo-link" onClick={onBack} style={{ fontSize: 13 }}>← Financial Overview</button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginTop: 14 }}>
          <div>
            <div style={{ fontFamily: serif, fontSize: 34, fontWeight: 600, color: C.text, lineHeight: 1.1 }}>{p.name}</div>
            <div style={{ fontSize: 13, color: C.textSub, marginTop: 6 }}>{[p.address, p.city, p.state].filter(Boolean).join(", ")}</div>
          </div>
          <Btn gold onClick={onEditProfile}>Edit financial details</Btn>
        </div>
      </div>

      <Section title="Property overview">
        <div className="fo-detail-grid">
          <div><div style={{ fontSize: 12, color: C.textSub }}>Ownership</div><div style={{ fontSize: 14, color: C.text, marginTop: 6 }}>{owner ? (owner.managed_for_client ? "Managed for a client" : "Personally owned") : "No owner assigned"}</div><div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>{owner?.name || ""}{books ? ` · ${books.name}` : ""}</div></div>
          <Figure label="Occupancy" metric={m.occupancy} fmt={fmtPctValue} />
          <Figure label="Gross scheduled rent (annual)" metric={m.gsr} fmt={fmtMoney} />
          <Figure label="Debt service" metric={m.debtService} fmt={fmtMoney} />
        </div>
        {gaps.length > 0 && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 18 }}>Missing: {gaps.join(", ")}. <button className="fo-link" onClick={onEditProfile}>Add them</button></div>}
      </Section>

      <Section title="Operating performance" note={periodLabel}>
        <div className="fo-detail-grid">
          <Figure label="Rent collected" metric={m.rentCollected} fmt={fmtMoney} />
          <Figure label="Other income" metric={m.otherIncome} fmt={fmtMoney} />
          <Figure label="Operating expenses" metric={m.opex} fmt={fmtMoney} />
          <Figure label="Net operating income" metric={m.noi} fmt={fmtMoney} sub="Income less operating expenses" />
        </div>
        <div style={{ marginTop: 22 }}>
          {!p.accounting_entity_id ? <div style={{ fontSize: 13, color: C.textMuted }}>Assign this property to a set of books to record its income and expenses.</div>
            : ledger.length === 0 ? <div style={{ fontSize: 13, color: C.textMuted }}>No income or expenses recorded in this period.</div> : (<>
              {income.map((r) => <Line key={r.account_code} label={`${r.account_code} ${r.account_name}`} value={fmtMoney(r.amount_cents)} />)}
              <Line label="Total income" value={fmtMoney(total(income))} strong />
              {expenses.map((r) => <Line key={r.account_code} label={`${r.account_code} ${r.account_name}`} value={fmtMoney(r.amount_cents)} />)}
              <Line label="Total operating expenses" value={fmtMoney(total(expenses))} strong />
            </>)}
        </div>
      </Section>

      <Section title="Investment performance" note="Value, debt and equity as of today; returns over the selected period">
        <div className="fo-detail-grid">
          <Figure label="Current value" metric={m.value} fmt={fmtMoney}
            sub={profile?.value_as_of ? `${VALUE_SOURCES.find((s) => s.value === profile.value_source)?.label || "Entered"}, as of ${fmtDate(profile.value_as_of)}${m.value.note?.includes("over a year old") ? " (over a year old)" : ""}` : null} />
          <Figure label="Debt outstanding" metric={m.debt} fmt={fmtMoney} />
          <Figure label="Equity" metric={m.equity} fmt={fmtMoney} />
          <Figure label="Net cash flow" metric={m.netCashFlow} fmt={fmtMoney} />
          <Figure label="Cap rate" metric={m.capRate} fmt={fmtPctValue} />
          <Figure label="Cash-on-cash return" metric={m.cashOnCash} fmt={fmtPctValue} />
          <Figure label="DSCR" metric={m.dscr} fmt={fmtRatio} />
        </div>
      </Section>

      <Section title="Debt and loans" action={<Btn small gold onClick={onAddLoan}>+ Add loan</Btn>}>
        {loans.length === 0 ? <div style={{ fontSize: 13, color: C.textMuted }}>{profile?.no_debt ? "Confirmed: no debt on this property." : "No loans entered. Add one, or confirm there's no debt under Edit financial details."}</div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>{["Lender", "Original", "Rate", "Payment / mo", "Balance today", ""].map((h, i) => (
                <th key={i} style={{ fontSize: 11, fontWeight: 500, color: C.textMuted, padding: "0 10px 10px", textAlign: i && i < 5 ? "right" : "left", borderBottom: `1px solid ${C.border}` }}>{h}</th>))}</tr></thead>
              <tbody>{loans.map((l) => {
                const pay = loanPayment(l), bal = loanBalance(l, today);
                const td = (v, right) => <td style={{ padding: "12px 10px", borderBottom: `1px solid ${C.border}`, color: C.textSub, textAlign: right ? "right" : "left", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{v}</td>;
                return (
                  <tr key={l.id}>
                    {td(<>{l.lender || "—"}{l.paid_off_on && <span style={{ color: C.textMuted }}> · paid off {fmtDate(l.paid_off_on)}</span>}</>)}
                    {td(fmtMoney(l.original_amount_cents), true)}
                    {td(`${Number(l.annual_rate_pct)}%${l.interest_only ? " IO" : ""}`, true)}
                    {td(<span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>{fmtMoney(pay.cents)} <Prov kind={pay.kind} /></span>, true)}
                    {td(<span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>{fmtMoney(bal.cents)} <Prov kind={bal.kind} /></span>, true)}
                    {td(confirmDel === l.id
                      ? <span style={{ display: "inline-flex", gap: 6 }}><Btn small danger onClick={() => { setConfirmDel(null); onDeleteLoan(l); }}>Remove</Btn><Btn small onClick={() => setConfirmDel(null)}>Keep</Btn></span>
                      : <span style={{ display: "inline-flex", gap: 6 }}><Btn small onClick={() => onEditLoan(l)}>Edit</Btn><Btn small danger onClick={() => setConfirmDel(l.id)}>Remove</Btn></span>, true)}
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Financial inputs" note="Entered by you" action={<Btn small onClick={onEditProfile}>Edit</Btn>}>
        <Line label="Purchase price" value={profile?.purchase_price_cents ? fmtMoney(profile.purchase_price_cents) : "—"} />
        <Line label="Purchase date" value={profile?.purchase_date ? fmtDate(profile.purchase_date) : "—"} />
        <Line label="Cash invested" value={profile?.cash_invested_cents ? fmtMoney(profile.cash_invested_cents) : "—"} />
        <Line label="Current value" value={profile?.current_value_cents ? `${fmtMoney(profile.current_value_cents)} · ${VALUE_SOURCES.find((s) => s.value === profile.value_source)?.label || ""}, ${fmtDate(profile.value_as_of)}` : "—"} />
        <Line label="Debt" value={loans.length ? `${loans.length} loan${loans.length === 1 ? "" : "s"}` : profile?.no_debt ? "Confirmed none" : "Not entered"} />
      </Section>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function FinancialSnapshot() {
  const today = todayNY();
  const [params, setParams] = useSearchParams();
  const selected = params.get("property");
  const [preset, setPreset] = useState("ttm");
  const [scope, setScope] = useState("all");
  const [data, setData] = useState(null);       // { properties, units, tenants, books, owners, profiles, loans, history }
  const [ledger, setLedger] = useState({ rows: [], lines: [] });
  const [state, setState] = useState({ loading: true, error: "", missing: false });
  const [modal, setModal] = useState(null);     // { type: "profile" } | { type: "loan", loan }
  const [rev, setRev] = useState(0);
  const range = useMemo(() => snapshotRange(preset, today), [preset, today]);
  const periodLabel = periodText(preset, range);

  useEffect(() => {
    let live = true;
    (async () => {
      const [pr, un, te, bk, ow, pf, lo, hi] = await Promise.all([
        supabase.from("properties").select("id, name, address, city, state, accounting_entity_id").order("name"),
        supabase.from("units").select("id, property_id, rent_amount"),
        supabase.from("tenants").select("unit_id, archived"),
        supabase.from("accounting_entities").select("id, name, owner_entity_id"),
        supabase.from("ownership_entities").select("id, name, type, managed_for_client").order("name"),
        supabase.from("property_financial_profiles").select("*"),
        supabase.from("property_loans").select("*").order("created_at"),
        supabase.rpc("a31_property_history"),
      ]);
      if (!live) return;
      const notInstalled = [ow, pf, lo, hi].some((r) => r.error && /does not exist|schema cache|PGRST20[25]|42703|42P01/.test(`${r.error.code} ${r.error.message}`));
      if (notInstalled) return setState({ loading: false, error: "", missing: true });
      const firstErr = [pr, un, te, bk, ow, pf, lo, hi].find((r) => r.error)?.error;
      if (firstErr) return setState({ loading: false, error: firstErr.message, missing: false });
      setData({ properties: pr.data, units: un.data, tenants: te.data, books: bk.data, owners: ow.data, profiles: pf.data, loans: lo.data, history: hi.data });
      setState({ loading: false, error: "", missing: false });
    })();
    return () => { live = false; };
  }, [rev]);

  useEffect(() => {
    let live = true;
    Promise.all([
      supabase.rpc("a31_property_ledger", { p_from: range.from, p_to: range.to }),
      supabase.rpc("a1_scoped_lines", { p_from: range.from, p_to: range.to, p_scope: "portfolio", p_scope_id: null }),
    ]).then(([a, b]) => {
      if (!live) return;
      const err = a.error || b.error;
      if (err) setState((s) => ({ ...s, error: s.missing ? s.error : err.message }));
      setLedger({ rows: a.data || [], lines: b.data || [] });
    });
    return () => { live = false; };
  }, [range.from, range.to, rev]);

  const model = useMemo(() => {
    if (!data) return null;
    const bookById = Object.fromEntries(data.books.map((b) => [b.id, b]));
    const ownerById = Object.fromEntries(data.owners.map((o) => [o.id, o]));
    const occupied = new Set(data.tenants.filter((t) => t.unit_id && !t.archived).map((t) => t.unit_id));
    const rows = data.properties.map((p) => {
      const books = bookById[p.accounting_entity_id] || null;
      const owner = books ? ownerById[books.owner_entity_id] || null : null;
      const profile = data.profiles.find((x) => x.property_id === p.id) || null;
      const loans = data.loans.filter((l) => l.property_id === p.id);
      const pl = ledger.rows.filter((r) => r.property_id === p.id);
      const snap = propertySnapshot({
        property: p, units: data.units.filter((u) => u.property_id === p.id).map((u) => ({ rent_amount: u.rent_amount, occupied: occupied.has(u.id) })),
        profile, loans, ledger: pl, history: data.history.find((h) => h.property_id === p.id) || null, period: range, today,
      });
      return { property: p, books, owner, profile, loans, ledger: pl, snap };
    });
    const inScope = rows.filter((r) => scope === "all" || (scope === "owned" ? r.owner && !r.owner.managed_for_client
      : scope === "managed" ? r.owner?.managed_for_client : r.owner?.id === scope));
    return {
      rows, inScope, portfolio: portfolioSnapshot(inScope.map((r) => r.snap)),
      series: monthlySeries(ledger.lines, range, inScope.map((r) => r.property.id)),
      attention: attentionItems(inScope, { today }),
    };
  }, [data, ledger, range, today, scope]);

  const sel = model?.rows.find((r) => r.property.id === selected) || null;
  const open = (id) => { setParams({ property: id }); window.scrollTo(0, 0); };
  const back = () => setParams({});
  const reload = () => { setModal(null); setRev((n) => n + 1); };
  async function deleteLoan(l) {
    const { error } = await supabase.from("property_loans").delete().eq("id", l.id);
    if (error) setState((s) => ({ ...s, error: error.message })); else reload();
  }
  const hasClients = data?.owners.some((o) => o.managed_for_client);
  const pm = model?.portfolio.metrics;

  return (
    <LandlordLayout>
      <style>{CSS}</style>
      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: font, padding: "clamp(24px, 4vw, 44px) clamp(16px, 4vw, 44px) 64px" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", display: "grid", gap: 24 }}>
          {!sel && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: serif, fontSize: "clamp(30px, 4vw, 38px)", fontWeight: 600, letterSpacing: "0.005em", lineHeight: 1.1 }}>Financial Overview</div>
                <div style={{ fontSize: 14, color: C.textSub, marginTop: 8 }}>Your portfolio's financial health at a glance.</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select aria-label="Period" value={preset} onChange={(e) => setPreset(e.target.value)} style={selectStyle}>
                  {SNAPSHOT_PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <select aria-label="Scope" value={scope} onChange={(e) => setScope(e.target.value)} style={selectStyle}>
                  <option value="all">All properties</option>
                  <option value="owned">Personally owned</option>
                  <option value="managed">Managed for clients</option>
                  {data?.owners.length > 0 && <optgroup label="Owner">{data.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>}
                </select>
              </div>
            </div>
          )}

          {state.loading && <div style={{ color: C.textSub, fontSize: 13 }}>Loading…</div>}
          {state.missing && <div style={{ color: C.textSub, fontSize: 13 }}>The financial overview isn't available on this database yet.</div>}
          {state.error && <div style={{ color: "#D27C7C", fontSize: 13 }}>{state.error}</div>}

          {model && sel && (
            <PropertyDetail row={sel} periodLabel={periodLabel} onBack={back}
              onEditProfile={() => setModal({ type: "profile" })} onAddLoan={() => setModal({ type: "loan", loan: null })}
              onEditLoan={(l) => setModal({ type: "loan", loan: l })} onDeleteLoan={deleteLoan} />
          )}

          {model && !sel && (<>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: -8 }}>
              {periodLabel}{scope === "all" && hasClients ? " · Includes properties you manage for clients" : ""}
            </div>
            <div className="fo-kpis">
              <Kpi label="Portfolio NOI" metric={pm.noi} fmt={fmtMoney} explain="Income less operating expenses, before loan payments." />
              <Kpi label="Rent collected" metric={pm.rentCollected} fmt={fmtMoney} explain="Rent actually received in this period." />
              <Kpi label="Operating expenses" metric={pm.opex} fmt={fmtMoney} explain="Paid in this period. Loan payments aren't included." />
              <Kpi label="Occupancy" metric={pm.occupancy} fmt={fmtPctValue} explain={pm.occupancy.note || "Units with a current tenant."} />
            </div>
            <ChartCard series={model.series} periodLabel={periodLabel} />
            <PropertyList rows={model.inScope} onOpen={open} />
            <div className="fo-split">
              <InvestmentMetrics metrics={pm} />
              <Attention items={model.attention} onOpen={open} />
            </div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 11, color: C.textMuted }}>
              {Object.keys(KIND_LABEL).map((k) => <span key={k} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Prov kind={k} /><span>{KIND_HELP[k]}</span></span>)}
            </div>
          </>)}

          {sel && modal?.type === "profile" && <ProfileModal property={sel.property} profile={sel.profile} owner={sel.owner} onClose={() => setModal(null)} onSaved={reload} />}
          {sel && modal?.type === "loan" && <LoanModal property={sel.property} loan={modal.loan} onClose={() => setModal(null)} onSaved={reload} />}
        </div>
      </div>
    </LandlordLayout>
  );
}
