import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";
import { Btn } from "./FinancialInputs";
import { C, font } from "./lib/financialTheme";
import { todayNY } from "./lib/accounting";
import {
  MONTHS, VIEWS, BUDGET_ACCOUNTS, budgetPeriod, propertyBudgetReport, portfolioBudgetReport, monthlyTrend,
  distributeAnnual, gridToLines, linesToGrid, toCents, centsToStr, rowTotal, fmtUsd, fmtVariance, fmtVarPct,
} from "./lib/budget";

// ─── A3.2 Actual vs. Budget ────────────────────────────────────────────────
// Budgets are entered here (property_budgets / property_budget_lines, saved atomically by a32_save_budget).
// Actuals come only from the ledger (a32_monthly_actuals). Every definition lives in lib/budget.js.

const serif = "'Cormorant Garamond', serif";
const ACTUAL = "#B5893F", BUDGET = "#5A8FD6";   // validated pair (dataviz validator, dark surface #14181F)
const GOOD = "#7FA35A", BAD = "#D27C7C";
const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14 };
const selectStyle = { padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12, background: "transparent", color: C.textSub, outline: "none", fontFamily: font, cursor: "pointer" };
const cellInput = { width: 74, padding: "6px 6px", fontSize: 12, textAlign: "right", border: `1px solid ${C.border}`, borderRadius: 6, background: C.raised, color: C.text, outline: "none", fontFamily: font, fontVariantNumeric: "tabular-nums" };

const CSS = `
  .ba-sum { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .ba-split { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 20px; align-items: start; }
  .ba-row { display: grid; grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr)) 20px; gap: 12px; align-items: center; padding: 15px 22px; border-top: 1px solid ${C.border}; }
  .ba-click { cursor: pointer; transition: background .15s; } .ba-click:hover { background: rgba(255,255,255,0.025); }
  .ba-num { text-align: right; font-variant-numeric: tabular-nums; font-size: 14px; }
  .ba-lbl { display: none; }
  .ba-cat { display: grid; grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr)); gap: 12px; padding: 10px 0; border-bottom: 1px solid ${C.border}; font-size: 13px; align-items: baseline; }
  .ba-link { background: none; border: none; color: ${C.gold}; font: inherit; font-size: 12px; cursor: pointer; padding: 0; }
  .ba-link:hover { text-decoration: underline; }
  .ba-grid td, .ba-grid th { padding: 5px 4px; white-space: nowrap; }
  .ba-grid input:focus { border-color: ${C.goldDim}; }
  @media (max-width: 1000px) { .ba-split { grid-template-columns: 1fr; } }
  @media (max-width: 760px) {
    .ba-sum { grid-template-columns: 1fr; }
    .ba-head { display: none !important; }
    .ba-row { grid-template-columns: 1fr 1fr; padding: 15px 18px; }
    .ba-row > :first-child { grid-column: 1 / -1; }
    .ba-row > :last-child { display: none; }
    .ba-num { text-align: left; }
    .ba-lbl { display: block; font-size: 10px; color: ${C.textMuted}; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 2px; }
    .ba-cat { grid-template-columns: 1fr 1fr 1fr; } .ba-cat > :nth-child(2) { display: none; }
  }
`;

// Favorable / unfavorable: a small word plus color, never color alone.
function Variance({ v, size = 13 }) {
  if (!v || v.variance == null) return <span style={{ color: C.textMuted, fontSize: size }}>—</span>;
  const c = v.favorable == null ? C.textSub : v.favorable ? GOOD : BAD;
  return (
    <span style={{ color: c, fontSize: size, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      {fmtVariance(v.variance)}{v.variancePct != null && <span style={{ opacity: 0.8 }}> ({fmtVarPct(v.variancePct)})</span>}
    </span>
  );
}
const verdict = (v) => (v?.favorable == null ? (v?.variance === 0 ? "On budget" : "") : v.favorable ? "Favorable" : "Unfavorable");

function SummaryCard({ label, t, explain, reason, fullLabel }) {
  const ok = t.actual != null && t.budget != null && t.variance != null;
  return (
    <div style={{ ...card, padding: "22px 22px 18px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: C.textSub, fontWeight: 500 }}>{label}</div>
      <div style={{ fontFamily: serif, fontSize: 34, fontWeight: 600, lineHeight: 1.05, color: ok ? (t.actual < 0 ? BAD : C.text) : C.textMuted }}>{ok ? fmtUsd(t.actual) : "—"}</div>
      <div style={{ fontSize: 12, color: C.textMuted }}>{ok ? (t.toDate ? <>Actual · <span style={{ color: C.textSub }}>Budget to date {fmtUsd(t.budget)}</span> · {fullLabel} {fmtUsd(t.budgetFull)}</> : <>Actual · budget {fmtUsd(t.budget)}</>) : reason}</div>
      {ok && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
          <Variance v={t} size={15} />
          <span style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{verdict(t)}</span>
        </div>
      )}
      <div style={{ fontSize: 11, color: C.textMuted, marginTop: "auto", paddingTop: 6, lineHeight: 1.5 }}>{explain}</div>
    </div>
  );
}

// ─── Monthly NOI: budget vs actual ──────────────────────────────────────────
function TrendChart({ trend }) {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const H = 220, M = { t: 10, r: 8, b: 28, l: 52 };
  const vals = trend.flatMap((m) => [m.budget, m.actual ?? 0]);
  const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals);
  const span = hi - lo || 100000, p10 = 10 ** Math.floor(Math.log10(span / 4)), f = span / 4 / p10;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p10;
  const top = Math.ceil(hi / step) * step || step, bot = Math.floor(lo / step) * step;
  const ticks = []; for (let v = bot; v <= top + 1e-9; v += step) ticks.push(v);
  const pw = w - M.l - M.r, ph = H - M.t - M.b, gw = pw / 12;
  const y = (v) => M.t + ph * (1 - (v - bot) / (top - bot));
  const bw = Math.max(3, Math.min(14, (gw * 0.6 - 2) / 2));
  const k = (c) => { const d = Math.abs(c) / 100; return `${c < 0 ? "−" : ""}$${d >= 1e6 ? `${+(d / 1e6).toFixed(1)}M` : d >= 1e3 ? `${+(d / 1e3).toFixed(d >= 1e4 ? 0 : 1)}k` : Math.round(d)}`; };
  const bar = (x, v, color, dashed) => {
    const y0 = y(0), y1 = y(v), h = Math.abs(y1 - y0); if (h < 0.5) return null;
    return <rect x={x} y={Math.min(y0, y1)} width={bw} height={h} rx={Math.min(3, bw / 2)} fill={dashed ? "transparent" : color} stroke={dashed ? color : "none"} strokeDasharray={dashed ? "3 2" : undefined} />;
  };
  const h = hover != null ? trend[hover] : null;
  return (
    <div ref={ref} style={{ position: "relative", width: "100%", minHeight: H, overflow: "hidden" }}>
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label="Net operating income by month, budget versus actual" style={{ display: "block" }} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => <g key={t}><line x1={M.l} x2={w - M.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.05)"} /><text x={M.l - 10} y={y(t) + 4} textAnchor="end" fontSize="11" fill={C.textMuted} fontFamily={font}>{k(t)}</text></g>)}
          {trend.map((m, i) => {
            const cx = M.l + gw * i + gw / 2;
            return (
              <g key={m.month}>
                {hover === i && <rect x={M.l + gw * i + 1} y={M.t} width={gw - 2} height={ph} fill="rgba(255,255,255,0.035)" rx="4" />}
                {bar(cx - bw - 1, m.budget, BUDGET)}
                {m.actual != null && bar(cx + 1, m.actual, ACTUAL, m.partial)}
                {(gw >= 30 || i % 2 === 0) && <text x={cx} y={H - 9} textAnchor="middle" fontSize="11" fill={C.textMuted} fontFamily={font}>{MONTHS[i]}</text>}
                <rect x={M.l + gw * i} y={M.t} width={gw} height={ph + 18} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
      )}
      {h && w > 0 && (
        <div style={{ position: "absolute", top: 4, left: Math.min(Math.max(M.l + gw * hover + gw / 2 - 95, 0), w - 190), width: 190, pointerEvents: "none", background: "#0F1217", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 12, color: C.text, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
          <div style={{ color: C.textSub, marginBottom: 6 }}>{MONTHS[h.month - 1]} NOI{h.partial ? " · month to date" : ""}</div>
          {(h.partial ? [["Budget (full month)", h.budget, BUDGET], ["Budget to date", h.budgetToDate, BUDGET], ["Actual to date", h.actual, ACTUAL]] : [["Budget", h.budget, BUDGET], ["Actual", h.actual, ACTUAL]]).map(([lab, v, c]) => (
            <div key={lab} style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center", color: C.textSub }}><span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{lab}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{v == null ? "Not yet" : fmtUsd(v)}</span>
            </div>
          ))}
          {h.actual != null && <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border}` }}><span style={{ color: C.textSub }}>Variance</span><Variance v={{ variance: h.actual - h.budgetToDate, favorable: h.actual === h.budgetToDate ? null : h.actual > h.budgetToDate }} size={12} /></div>}
        </div>
      )}
      <table style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        <caption>Monthly NOI, budget and actual</caption>
        <thead><tr><th>Month</th><th>Budget</th><th>Actual</th></tr></thead>
        <tbody>{trend.map((m) => <tr key={m.month}><td>{MONTHS[m.month - 1]}</td><td>{fmtUsd(m.budget)}</td><td>{m.actual == null ? "Not yet" : fmtUsd(m.actual)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
function TrendCard({ trend, title }) {
  const any = trend.some((m) => m.budget || m.actual);
  return (
    <div style={{ ...card, padding: "22px 22px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div><div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{title}</div><div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>Net operating income by month · full year</div></div>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.textSub }}>
          {[["Budget", BUDGET], ["Actual", ACTUAL]].map(([k2, c]) => <span key={k2} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{k2}</span>)}
        </div>
      </div>
      {any ? <TrendChart trend={trend} /> : <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontSize: 13, border: `1px dashed ${C.border}`, borderRadius: 10, marginBottom: 10 }}>No budget or recorded activity for this year yet.</div>}
    </div>
  );
}

// ─── Category breakdown and drivers ─────────────────────────────────────────
function Categories({ categories, toDate }) {
  const groups = [["Income", "income"], ["Operating expenses", "expense"]];
  return (
    <div style={{ ...card, padding: "20px 22px" }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 10 }}>By category</div>
      {groups.map(([title, type]) => {
        const rows = categories.filter((c) => c.type === type && (c.budgetCents != null || c.actualCents));
        return (
          <div key={type} style={{ marginTop: 12 }}>
            <div className="ba-cat" style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", borderBottomColor: C.border }}>
              <div>{title}</div><div className="ba-num" style={{ fontSize: 11 }}>{toDate ? "Budget to date" : "Budget"}</div><div className="ba-num" style={{ fontSize: 11 }}>Actual</div><div className="ba-num" style={{ fontSize: 11 }}>Variance</div>
            </div>
            {rows.length === 0 && <div style={{ fontSize: 12, color: C.textMuted, padding: "10px 0" }}>Nothing budgeted or recorded.</div>}
            {rows.map((c) => (
              <div key={c.code} className="ba-cat">
                <div style={{ color: C.text, minWidth: 0 }}>{c.name}
                  {c.status === "partial" && <span style={{ color: C.textMuted, fontSize: 11 }}> · {c.missingMonths} month{c.missingMonths === 1 ? "" : "s"} not budgeted</span>}
                  {c.unbudgetedProps > 0 && c.status === "budgeted" && <span style={{ color: C.textMuted, fontSize: 11 }}> · includes unbudgeted spend</span>}
                </div>
                <div className="ba-num" style={{ color: c.budgetCents == null ? C.textMuted : C.textSub, fontSize: 13 }}>{c.budgetCents == null ? "Not budgeted" : fmtUsd(c.budgetCents)}</div>
                <div className="ba-num" style={{ color: c.actualCents == null ? C.textMuted : C.text, fontSize: 13 }}>{fmtUsd(c.actualCents)}</div>
                <div className="ba-num"><Variance v={c} /></div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
function Drivers({ drivers, unbudgeted }) {
  return (
    <div style={{ ...card, padding: "20px 22px" }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 14 }}>What's driving the variance</div>
      {drivers.length === 0 && <div style={{ fontSize: 13, color: C.textMuted }}>No variance to explain yet.</div>}
      <div style={{ display: "grid", gap: 14 }}>
        {drivers.map((d) => {
          const unb = d.budgetCents == null, good = d.impact > 0;
          const amount = `$${Math.round(Math.abs(d.variance ?? d.actualCents) / 100).toLocaleString("en-US")}`;
          const what = unb ? `${amount} ${d.type === "income" ? "received" : "spent"} with no budget`
            : d.type === "income" ? `${amount} ${d.variance > 0 ? "above" : "below"} budget` : `${amount} ${d.variance > 0 ? "over" : "under"} budget`;
          return (
            <div key={d.code} style={{ display: "grid", gridTemplateColumns: "10px 1fr", gap: 12 }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, marginTop: 6, background: good ? GOOD : BAD }} aria-hidden="true" />
              <div><div style={{ fontSize: 13, color: C.text }}>{d.name}</div><div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{what} · {good ? "helps" : "reduces"} NOI</div></div>
            </div>
          );
        })}
      </div>
      {unbudgeted?.length > 0 && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 16, lineHeight: 1.5 }}>Recorded but not budgeted: {unbudgeted.map((c) => c.name).join(", ")}.</div>}
    </div>
  );
}

// ─── Budget editor ──────────────────────────────────────────────────────────
function BudgetEditor({ property, books, year, budget, lines, units, onCancel, onSaved }) {
  const [grid, setGrid] = useState(() => linesToGrid(lines));
  const [notes, setNotes] = useState(budget?.notes || "");
  const [suggested, setSuggested] = useState({});
  const [spread, setSpread] = useState(null);   // { code, value }
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (code, i, v) => { setGrid((g) => ({ ...g, [code]: g[code].map((x, j) => (j === i ? v : x)) })); setSuggested((s) => ({ ...s, [code]: false })); };
  const fillAcross = (code) => setGrid((g) => ({ ...g, [code]: Array(12).fill(g[code][0]) }));
  const clear = (code) => { setGrid((g) => ({ ...g, [code]: Array(12).fill("") })); setSuggested((s) => ({ ...s, [code]: false })); };
  const applySpread = () => {
    const cents = toCents(spread.value);
    if (cents == null) return setErr("Enter the annual amount in dollars.");
    setGrid((g) => ({ ...g, [spread.code]: distributeAnnual(cents).map(centsToStr) })); setSpread(null); setErr("");
  };
  const rentRoll = units.reduce((s, u) => s + Math.round(Number(u.rent_amount || 0) * 100), 0);
  const suggestRent = () => {
    if (!rentRoll) return setErr("This property has no units with a rent amount to suggest from.");
    if (grid["4000"].some((c) => String(c).trim() !== "")) return setErr("Rental income already has amounts. Clear the row first to use the suggestion.");
    setGrid((g) => ({ ...g, "4000": Array(12).fill(centsToStr(rentRoll)) })); setSuggested((s) => ({ ...s, "4000": true })); setErr("");
  };
  const status = (cells) => { const f = cells.filter((c) => String(c).trim() !== "").length; return f === 0 ? "none" : f === 12 ? "full" : "partial"; };
  const total = (type) => BUDGET_ACCOUNTS.filter((a) => a.type === type).reduce((s, a) => s + rowTotal(grid[a.code]), 0);
  const notBudgeted = BUDGET_ACCOUNTS.filter((a) => status(grid[a.code]) === "none");

  async function save() {
    const { lines: out, error } = gridToLines(grid);
    if (error) return setErr(error);
    setSaving(true); setErr("");
    const { error: e } = await supabase.rpc("a32_save_budget", { p_property: property.id, p_year: year, p_lines: out, p_notes: notes });
    setSaving(false);
    if (e) return setErr(e.message);
    onSaved();
  }

  const row = (a) => {
    const cells = grid[a.code], st = status(cells);
    return (
      <tr key={a.code}>
        <td style={{ paddingRight: 12, position: "sticky", left: 0, background: C.surface, zIndex: 1 }}>
          <div style={{ fontSize: 13, color: C.text }}>{a.name}</div>
          <div style={{ fontSize: 11, color: st === "partial" ? C.amber : C.textMuted }}>
            {a.code} · {st === "full" ? "Budgeted" : st === "partial" ? "Incomplete: fill all months" : "Not budgeted"}
            {suggested[a.code] && <span style={{ color: C.gold }}> · Suggested from rent roll, review before saving</span>}
          </div>
        </td>
        {cells.map((v, i) => <td key={i}><input aria-label={`${a.name} ${MONTHS[i]}`} inputMode="decimal" value={v} onChange={(e) => set(a.code, i, e.target.value)} style={{ ...cellInput, borderColor: suggested[a.code] ? C.goldDim : C.border }} /></td>)}
        <td style={{ textAlign: "right", fontSize: 12, color: C.textSub, fontVariantNumeric: "tabular-nums", paddingLeft: 10 }}>{st === "none" ? "—" : fmtUsd(rowTotal(cells))}</td>
        <td style={{ paddingLeft: 10 }}>
          {spread?.code === a.code ? (
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input aria-label={`${a.name} annual amount`} autoFocus inputMode="decimal" placeholder="Annual $" value={spread.value} onChange={(e) => setSpread({ ...spread, value: e.target.value })} onKeyDown={(e) => e.key === "Enter" && applySpread()} style={{ ...cellInput, width: 90 }} />
              <Btn small gold onClick={applySpread}>Spread</Btn><Btn small onClick={() => setSpread(null)}>Cancel</Btn>
            </span>
          ) : (
            <span style={{ display: "inline-flex", gap: 6 }}>
              <Btn small onClick={() => fillAcross(a.code)} disabled={String(cells[0]).trim() === ""}>Copy Jan →</Btn>
              <Btn small onClick={() => setSpread({ code: a.code, value: "" })}>Annual ÷ 12</Btn>
              {st !== "none" && <Btn small onClick={() => clear(a.code)}>Clear</Btn>}
            </span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <button className="ba-link" onClick={onCancel} style={{ fontSize: 13 }}>← Actual vs. Budget</button>
        <div style={{ fontFamily: serif, fontSize: 32, fontWeight: 600, color: C.text, marginTop: 12 }}>{year} budget · {property.name}</div>
        <div style={{ fontSize: 13, color: C.textSub, marginTop: 6 }}>{books?.name || ""}. Enter monthly amounts in dollars. A row is either all 12 months or empty: enter 0 for an intentional zero.</div>
      </div>
      <div style={{ ...card, padding: "16px 18px", display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
        <span style={{ color: C.textSub }}>Budgeted income <b style={{ color: C.text, fontWeight: 600 }}>{fmtUsd(total("income"))}</b></span>
        <span style={{ color: C.textSub }}>Operating expenses <b style={{ color: C.text, fontWeight: 600 }}>{fmtUsd(total("expense"))}</b></span>
        <span style={{ color: C.textSub }}>NOI <b style={{ color: C.text, fontWeight: 600 }}>{fmtUsd(total("income") - total("expense"))}</b></span>
        <span style={{ marginLeft: "auto" }}><Btn small onClick={suggestRent}>Suggest rental income from rent roll</Btn></span>
      </div>
      <div style={{ ...card, padding: "8px 0 8px 14px", overflowX: "auto" }}>
        <table className="ba-grid" style={{ borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={{ textAlign: "left", fontSize: 11, color: C.textMuted, fontWeight: 500, position: "sticky", left: 0, background: C.surface, zIndex: 1 }}>Category</th>
            {MONTHS.map((m) => <th key={m} style={{ fontSize: 11, color: C.textMuted, fontWeight: 500, textAlign: "right" }}>{m}</th>)}
            <th style={{ fontSize: 11, color: C.textMuted, fontWeight: 500, textAlign: "right", paddingLeft: 10 }}>Year</th><th />
          </tr></thead>
          <tbody>
            <tr><td style={{ fontSize: 11, color: C.gold, textTransform: "uppercase", letterSpacing: "0.1em", paddingTop: 12, position: "sticky", left: 0, background: C.surface, zIndex: 1 }}>Income</td><td colSpan={14} /></tr>
            {BUDGET_ACCOUNTS.filter((a) => a.type === "income").map(row)}
            <tr><td style={{ fontSize: 11, color: C.gold, textTransform: "uppercase", letterSpacing: "0.1em", paddingTop: 16, position: "sticky", left: 0, background: C.surface, zIndex: 1 }}>Operating expenses</td><td colSpan={14} /></tr>
            {BUDGET_ACCOUNTS.filter((a) => a.type === "expense").map(row)}
          </tbody>
        </table>
      </div>
      {notBudgeted.length > 0 && <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>Not budgeted yet: {notBudgeted.map((a) => a.name).join(", ")}. That's fine if they don't apply; enter 0 to record an intentional zero.</div>}
      <label style={{ display: "grid", gap: 6, maxWidth: 560 }}>
        <span style={{ fontSize: 11, color: C.textSub }}>Notes</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...cellInput, width: "100%", textAlign: "left", padding: "9px 11px", fontSize: 13 }} />
      </label>
      {err && <div role="alert" style={{ color: BAD, fontSize: 13 }}>{err}</div>}
      <div style={{ display: "flex", gap: 10 }}><Btn gold onClick={save} disabled={saving}>{saving ? "Saving…" : "Save budget"}</Btn><Btn onClick={onCancel}>Cancel</Btn></div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function BudgetVsActual() {
  const today = todayNY();
  const thisYear = Number(today.slice(0, 4)), thisMonth = Number(today.slice(5, 7));
  const [params, setParams] = useSearchParams();
  const selected = params.get("property"), editing = params.get("edit");
  const [year, setYear] = useState(thisYear);
  const [view, setView] = useState("ytd");
  const [month, setMonth] = useState(thisMonth);
  const [scope, setScope] = useState("all");
  const [base, setBase] = useState(null);       // { properties, books, owners, units }
  const [yr, setYr] = useState({ year: null, budgets: [], lines: [], actuals: [] });
  const [state, setState] = useState({ loading: true, error: "", missing: false });
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([
      supabase.from("properties").select("id, name, address, city, state, accounting_entity_id").order("name"),
      supabase.from("accounting_entities").select("id, name, owner_entity_id"),
      supabase.from("ownership_entities").select("id, name, managed_for_client").order("name"),
      supabase.from("units").select("id, property_id, rent_amount"),
    ]).then((res) => {
      if (!live) return;
      const e = res.find((r) => r.error)?.error;
      if (e) return setState({ loading: false, error: e.message, missing: false });
      setBase({ properties: res[0].data, books: res[1].data, owners: res[2].data, units: res[3].data });
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      const [b, a] = await Promise.all([
        supabase.from("property_budgets").select("*").eq("year", year),
        supabase.rpc("a32_monthly_actuals", { p_from: `${year}-01-01`, p_to: `${year}-12-31` }),
      ]);
      if (!live) return;
      const err = b.error || a.error;
      if (err) return setState({ loading: false, error: /does not exist|schema cache|PGRST20[25]|42P01/.test(`${err.code} ${err.message}`) ? "" : err.message, missing: /does not exist|schema cache|PGRST20[25]|42P01/.test(`${err.code} ${err.message}`) });
      const ids = (b.data || []).map((x) => x.id);
      const l = ids.length ? await supabase.from("property_budget_lines").select("budget_id, account_code, month, amount_cents").in("budget_id", ids) : { data: [] };
      if (!live) return;
      if (l.error) return setState({ loading: false, error: l.error.message, missing: false });
      setYr({ year, budgets: b.data || [], lines: l.data || [], actuals: (a.data || []).map((x) => ({ ...x, month: String(x.month).slice(0, 10) })) });
      setState({ loading: false, error: "", missing: false });
    })();
    return () => { live = false; };
  }, [year, rev]);

  const period = useMemo(() => budgetPeriod({ year, view, month }, today), [year, view, month, today]);
  const model = useMemo(() => {
    if (!base || yr.year !== year) return null;
    const bookById = Object.fromEntries(base.books.map((b) => [b.id, b])), ownerById = Object.fromEntries(base.owners.map((o) => [o.id, o]));
    const rows = base.properties.map((p) => {
      const books = bookById[p.accounting_entity_id] || null, owner = books ? ownerById[books.owner_entity_id] || null : null;
      const budget = yr.budgets.find((b) => b.property_id === p.id) || null;
      const lines = budget ? yr.lines.filter((l) => l.budget_id === budget.id) : [];
      const actuals = yr.actuals.filter((x) => x.property_id === p.id);
      return { property: p, books, owner, budget, lines, actuals, report: propertyBudgetReport({ property: p, budget, lines, actuals, period }) };
    });
    const inScope = rows.filter((r) => scope === "all" || (scope === "owned" ? r.owner && !r.owner.managed_for_client : r.owner?.managed_for_client));
    const comp = inScope.filter((r) => r.report.comparable || (r.report.hasBudget && r.report.hasBooks));
    return { rows, inScope, portfolio: portfolioBudgetReport(inScope.map((r) => r.report)), trend: monthlyTrend({ year, today, items: comp }) };
  }, [base, yr, year, period, scope, today]);

  const sel = model?.rows.find((r) => r.property.id === (editing || selected)) || null;
  const go = (p) => { setParams(p); window.scrollTo(0, 0); };
  const periodNote = period.status === "not_started" ? "This period hasn't started, so there are no actuals yet."
    : period.prorate ? `${MONTHS[period.prorate.month - 1]} is in progress: its actuals run through today and are compared with its budget to date (${period.prorate.day} of ${period.prorate.days} days).${period.status === "partial" ? " Later months show budget only." : ""}`
    : period.status === "partial" ? "Later months show budget only; variances compare against the budget for elapsed months." : "";
  const reasonFor = (r) => r?.reason || "";
  const fullLabel = view === "month" ? "full month" : view === "year" ? "full year" : `full Jan–${MONTHS[(period.months.at(-1) || 1) - 1]}`;

  const controls = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <select aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))} style={selectStyle}>{[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}</select>
      <select aria-label="View" value={view} onChange={(e) => setView(e.target.value)} style={selectStyle}>{VIEWS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}</select>
      {view === "month" && <select aria-label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))} style={selectStyle}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>}
      {!sel && <select aria-label="Scope" value={scope} onChange={(e) => setScope(e.target.value)} style={selectStyle}><option value="all">All properties</option><option value="owned">Personally owned</option><option value="managed">Managed for clients</option></select>}
    </div>
  );

  return (
    <LandlordLayout>
      <style>{CSS}</style>
      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: font, padding: "clamp(24px, 4vw, 44px) clamp(16px, 4vw, 44px) 64px" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", display: "grid", gap: 24 }}>
          {state.loading && <div style={{ color: C.textSub, fontSize: 13 }}>Loading…</div>}
          {state.missing && <div style={{ color: C.textSub, fontSize: 13 }}>Budgets aren't available on this database yet.</div>}
          {state.error && <div role="alert" style={{ color: BAD, fontSize: 13 }}>{state.error}</div>}

          {model && editing && sel && (sel.property.accounting_entity_id ? (
            <BudgetEditor key={`${sel.property.id}-${year}`} property={sel.property} books={sel.books} year={year} budget={sel.budget} lines={sel.lines}
              units={base.units.filter((u) => u.property_id === sel.property.id)} onCancel={() => go(selected ? { property: selected } : {})} onSaved={() => { setRev((n) => n + 1); go({ property: sel.property.id }); }} />
          ) : <div style={{ fontSize: 14, color: C.textSub }}>{sel.property.name} isn't assigned to a set of books, so it can't have a budget yet. <button className="ba-link" onClick={() => go({})}>Back</button></div>)}

          {model && !editing && (<>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
              <div>
                {sel && <button className="ba-link" onClick={() => go({})} style={{ fontSize: 13, marginBottom: 12 }}>← All properties</button>}
                <div style={{ fontFamily: serif, fontSize: "clamp(30px, 4vw, 38px)", fontWeight: 600, lineHeight: 1.1 }}>{sel ? sel.property.name : "Actual vs. Budget"}</div>
                <div style={{ fontSize: 14, color: C.textSub, marginTop: 8 }}>{sel ? `${sel.owner ? (sel.owner.managed_for_client ? `Managed for ${sel.owner.name}` : sel.owner.name) : "No owner assigned"} · ${period.label}` : "How your properties are tracking against plan."}</div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {controls}
                {sel && sel.property.accounting_entity_id && <Btn gold onClick={() => go({ property: sel.property.id, edit: sel.property.id })}>{sel.budget ? "Edit budget" : `Create ${year} budget`}</Btn>}
              </div>
            </div>
            {(periodNote || (!sel && model.portfolio.coverage.comparable < model.portfolio.coverage.of)) && (
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: -8, lineHeight: 1.6 }}>
                {!sel && `${period.label}. `}{periodNote}
                {!sel && model.portfolio.coverage.comparable < model.portfolio.coverage.of && ` Comparing ${model.portfolio.coverage.comparable} of ${model.portfolio.coverage.of} properties; the others are listed below.`}
              </div>
            )}

            {(() => {
              const R = sel ? sel.report : null, T = sel ? R.totals : model.portfolio.totals;
              const why = sel ? reasonFor(R) : model.portfolio.coverage.comparable ? "" : (period.status === "not_started" ? "This period hasn't started" : `No property has a ${year} budget yet`);
              return (
                <div className="ba-sum">
                  <SummaryCard label="Income" fullLabel={fullLabel} t={T.income} reason={why} explain="Collected in this period vs budget. Above budget is favorable." />
                  <SummaryCard label="Operating expenses" fullLabel={fullLabel} t={T.expense} reason={why} explain="Paid in this period vs budget. Over budget is unfavorable." />
                  <SummaryCard label="Net operating income" fullLabel={fullLabel} t={T.noi} reason={why} explain="Income less operating expenses vs budget." />
                </div>
              );
            })()}

            <TrendCard trend={sel ? monthlyTrend({ year, today, items: sel.report.hasBooks ? [sel] : [] }) : model.trend} title={sel ? "Budget vs actual" : "Portfolio budget vs actual"} />

            {!sel && (
              <div style={{ ...card, overflow: "hidden" }}>
                <div style={{ padding: "20px 22px 4px", fontSize: 15, fontWeight: 600, color: C.text }}>Properties</div>
                <div className="ba-row ba-head" style={{ fontSize: 11, color: C.textMuted, borderTop: "none", paddingTop: 12, paddingBottom: 8 }}>
                  <div>Property</div><div className="ba-num" style={{ fontSize: 11 }}>Budget NOI</div><div className="ba-num" style={{ fontSize: 11 }}>Actual NOI</div><div className="ba-num" style={{ fontSize: 11 }}>Variance</div><div />
                </div>
                {model.inScope.map((r) => {
                  const t = r.report.totals.noi;
                  return (
                    <div key={r.property.id} className="ba-row ba-click" role="button" tabIndex={0} onClick={() => go({ property: r.property.id })} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go({ property: r.property.id })}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{r.property.name}</div>
                        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>
                          {r.owner ? (r.owner.managed_for_client ? `Client · ${r.owner.name}` : r.owner.name) : "No owner assigned"}
                          {!r.report.comparable && <> · {r.report.reason}{r.report.hasBooks && !r.report.hasBudget && <> · <button className="ba-link" onClick={(e) => { e.stopPropagation(); go({ property: r.property.id, edit: r.property.id }); }}>Create budget</button></>}</>}
                          {r.report.booksMismatch && " · budget set under different books"}
                        </div>
                      </div>
                      <div className="ba-num"><span className="ba-lbl">Budget NOI</span><span style={{ color: r.report.hasBudget ? C.textSub : C.textMuted }}>{r.report.hasBudget ? fmtUsd(t.budget) : "—"}</span></div>
                      <div className="ba-num"><span className="ba-lbl">Actual NOI</span><span style={{ color: t.actual == null ? C.textMuted : C.text }}>{fmtUsd(t.actual)}</span></div>
                      <div className="ba-num"><span className="ba-lbl">Variance</span><Variance v={t} /></div>
                      <div style={{ color: C.textMuted, fontSize: 16, textAlign: "right" }}>›</div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="ba-split">
              <Categories categories={sel ? sel.report.categories : model.portfolio.categories} toDate={(sel ? sel.report.totals : model.portfolio.totals).noi.toDate} />
              <Drivers drivers={sel ? sel.report.drivers : model.portfolio.drivers} unbudgeted={sel ? sel.report.unbudgeted : model.portfolio.categories.filter((c) => c.status === "none" && c.actualCents)} />
            </div>
            {sel && sel.report.hasBudget && sel.report.notBudgeted.length > 0 && <div style={{ fontSize: 12, color: C.textMuted }}>Not budgeted: {sel.report.notBudgeted.map((c) => c.name).join(", ")}.</div>}
          </>)}
        </div>
      </div>
    </LandlordLayout>
  );
}
