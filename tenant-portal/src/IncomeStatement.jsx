import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import {
  PERIOD_PRESETS, SCOPES, EXCEPTION_TEXT, PAYMENT_CATEGORIES, paidAtFromDate, periodRange, todayNY, buildStatement, statementRows,
  statementCSV, transactionsCSV, fmtCents, comparisonRange, comparisonRows, comparisonCSV, fmtPct,
} from "./lib/accounting";

const C = {
  bg:       "#0C0E12",
  surface:  "#14181F",
  raised:   "#1A1F29",
  border:   "rgba(255,255,255,0.08)",
  text:     "#EDEAE2",
  textSub:  "#9095A0",
  textMuted:"#5C6270",
  gold:     "#C9A96E",
  goldDim:  "#6B4F24",
  blue:     "#4A9AE8",
  green:    "#72B02A",
  red:      "#E05555",
  amber:    "#F0A430",
};

const selectStyle = { padding: "7px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, background: C.raised, color: C.textSub, outline: "none", fontFamily: "'DM Sans', sans-serif" };
const dateStyle   = { ...selectStyle, colorScheme: "dark" };

function GhostBtn({ children, onClick, small, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: "transparent", border: `1px solid ${C.border}`, color: C.textSub,
      fontSize: small ? 11 : 12, fontWeight: 500, padding: small ? "5px 10px" : "7px 14px",
      borderRadius: 7, cursor: disabled ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif", opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  );
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function TH({ children, right }) {
  return <th style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em", padding: "10px 16px", textAlign: right ? "right" : "left", borderBottom: `1px solid ${C.border}`, background: C.raised, whiteSpace: "nowrap" }}>{children}</th>;
}
function TD({ children, right, bold, color, indent }) {
  return <td style={{ fontSize: 13, color: color || (bold ? C.text : C.textSub), fontWeight: bold ? 600 : 400, padding: `10px 16px 10px ${indent ? 32 : 16}px`, borderBottom: `1px solid ${C.border}`, textAlign: right ? "right" : "left", fontVariantNumeric: "tabular-nums" }}>{children}</td>;
}

const slug = (s) => String(s).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");

export default function IncomeStatement({ properties }) {
  const today = todayNY();
  const [preset, setPreset]   = useState("ytd");
  const [range, setRange]     = useState(periodRange("ytd", today));
  const [scope, setScope]     = useState("portfolio");
  const [scopeId, setScopeId] = useState("");
  const [owners, setOwners]   = useState([]);
  const [books, setBooks]     = useState([]);
  const [result, setResult]   = useState({ key: null, model: null, error: "" });
  const [compare, setCompare] = useState("none");
  const [cmpResult, setCmpResult] = useState({ key: null, model: null });
  const [drillState, setDrill] = useState(null);   // { key, code, name, rows }
  const [recon, setRecon]     = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [showRecon, setShowRecon]   = useState(false);
  const [units, setUnits]           = useState([]);
  const [rev, setRev]               = useState(0);      // bumped after a classification so everything reloads
  const [fix, setFix]               = useState(null);   // { id, code, category, unit_id, saving, error }

  useEffect(() => {
    (async () => {
      const [{ data: o }, { data: b }, { data: u }] = await Promise.all([
        supabase.from("ownership_entities").select("id, name").order("name"),
        supabase.from("accounting_entities").select("id, name, owner_entity_id").order("name"),
        supabase.from("units").select("id, unit_number, property_id"),
      ]);
      setOwners(o || []); setBooks(b || []); setUnits(u || []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const [{ data: r }, { data: x }] = await Promise.all([supabase.rpc("a1_reconciliation"), supabase.rpc("a1_open_exceptions")]);
      setRecon(r || []); setExceptions(x || []);
    })();
  }, [rev]);

  // Classify a flagged receipt: the landlord states what it was for and/or which unit it was for.
  async function saveFix() {
    const patch = {};
    if (fix.category) patch.category = fix.category;
    if (fix.unit_id)  patch.unit_id  = fix.unit_id;
    if (fix.paid_on)  patch.paid_at  = paidAtFromDate(fix.paid_on);
    if (fix.code === "uncategorized_receipt" && !patch.category) { setFix(f => ({ ...f, error: "Select what the payment was for." })); return; }
    if (fix.code === "no_unit" && !patch.unit_id) { setFix(f => ({ ...f, error: "Select the unit the payment was for." })); return; }
    if (fix.code === "missing_paid_date" && !patch.paid_at) { setFix(f => ({ ...f, error: "Enter the date the money was actually received." })); return; }
    setFix(f => ({ ...f, saving: true, error: "" }));
    const { error: err } = await supabase.from("payments").update(patch).eq("id", fix.id);
    if (err) { setFix(f => ({ ...f, saving: false, error: err.message })); return; }
    setFix(null); setRev(n => n + 1);
  }
  const propName = Object.fromEntries((properties || []).map(p => [p.id, p.name]));
  const unitOptions = units.map(u => ({ id: u.id, label: `${propName[u.property_id] || "—"} · ${u.unit_number}` })).sort((a, b) => a.label.localeCompare(b.label));

  const scopeOptions = scope === "owner" ? owners : scope === "books" ? books : scope === "property" ? properties : [];
  const scopeReady   = scope === "portfolio" || !!scopeId;
  const scopeLabel   = scope === "portfolio" ? "Portfolio (all books)"
    : `${SCOPES.find(s => s.value === scope).label}: ${scopeOptions.find(o => o.id === scopeId)?.name || "—"}`;

  // The statement shown always belongs to the current filters; anything else is still loading.
  const params = { p_from: range?.from, p_to: range?.to, p_scope: scope, p_scope_id: scope === "portfolio" ? null : scopeId };
  const key    = scopeReady && range?.from && range?.to ? `${JSON.stringify(params)}#${rev}` : null;
  const current = result.key === key ? result : null;
  const model   = current?.model || null;
  const error   = current?.error || "";
  const loading = !!key && !current;
  const drill   = drillState?.key === key ? drillState : null;
  const cmpRange = compare === "none" ? null : comparisonRange(range, compare);
  const cmpKey  = key && cmpRange ? `${key}|${cmpRange.from}|${cmpRange.to}` : null;
  const cmpModel = cmpKey && cmpResult.key === cmpKey ? cmpResult.model : null;

  useEffect(() => {
    if (!key) return;
    let live = true;
    supabase.rpc("a1_income_statement", JSON.parse(key.slice(0, key.lastIndexOf("#")))).then(({ data, error: err }) => {
      if (live) setResult({ key, model: err ? null : buildStatement(data), error: err?.message || "" });
    });
    return () => { live = false; };
  }, [key]);

  // Same function, same cash-basis rules, a second date range.
  useEffect(() => {
    if (!cmpKey) return;
    let live = true;
    supabase.rpc("a1_income_statement", { ...JSON.parse(key.slice(0, key.lastIndexOf("#"))), p_from: cmpRange.from, p_to: cmpRange.to }).then(({ data, error: err }) => {
      if (live) setCmpResult({ key: cmpKey, model: err ? null : buildStatement(data) });
    });
    return () => { live = false; };
  }, [cmpKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function openDrill(line) {
    if (drill?.code === line.code) { setDrill(null); return; }
    setDrill({ key, code: line.code, name: line.name, rows: null });
    const { data, error: err } = await supabase.rpc("a1_account_transactions", { ...params, p_account_code: line.code });
    setDrill({ key, code: line.code, name: line.name, rows: err ? [] : (data || []), error: err?.message });
  }

  function choosePreset(p) {
    setPreset(p);
    if (p !== "custom") setRange(periodRange(p, today));
  }

  const errors   = exceptions.filter(x => x.severity === "error");
  const warnings = exceptions.filter(x => x.severity === "warning");
  const outOfBalance = recon.filter(r => Number(r.source_cents) !== Number(r.ledger_cents) || r.unposted_count > 0);

  const comparing = !!(model && cmpModel);
  const rows = model ? (comparing ? comparisonRows(model, cmpModel) : statementRows(model)) : [];
  const COLS = comparing ? 5 : 2;

  return (
    <>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Income Statement <span style={{ fontWeight: 400, color: C.textSub }}>· cash basis</span></div>
          <div style={{ fontSize: 12, color: C.textSub, marginTop: 3 }}>{scopeLabel} · {range?.from} to {range?.to}{cmpRange ? ` · compared with ${cmpRange.from} to ${cmpRange.to}` : ""}</div>
        </div>
        <GhostBtn disabled={!model} onClick={() => download(`Modus_Income_Statement_${slug(scopeLabel)}_${range.from}_${range.to}.csv`, comparing
          ? comparisonCSV(rows, { scopeLabel, from: range.from, to: range.to, compareFrom: cmpRange.from, compareTo: cmpRange.to })
          : statementCSV(model, { scopeLabel, from: range.from, to: range.to }))}>⬇ CSV</GhostBtn>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <select aria-label="Period" value={preset} onChange={e => choosePreset(e.target.value)} style={selectStyle}>
          {PERIOD_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        {preset === "custom" && (
          <>
            <input aria-label="From" type="date" value={range?.from || ""} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} style={dateStyle} />
            <span style={{ color: C.textMuted, fontSize: 12 }}>to</span>
            <input aria-label="To" type="date" value={range?.to || ""} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} style={dateStyle} />
          </>
        )}
        <select aria-label="Compare with" value={compare} onChange={e => setCompare(e.target.value)} style={selectStyle}>
          <option value="none">No comparison</option>
          <option value="previous">Compare: previous period</option>
          <option value="last_year">Compare: same period last year</option>
        </select>
        <select aria-label="Scope" value={scope} onChange={e => { setScope(e.target.value); setScopeId(""); }} style={selectStyle}>
          {SCOPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {scope !== "portfolio" && (
          <select aria-label="Scope item" value={scopeId} onChange={e => setScopeId(e.target.value)} style={selectStyle}>
            <option value="">Select…</option>
            {scopeOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </div>

      {/* Ledger completeness */}
      {(errors.length > 0 || outOfBalance.length > 0) && (
        <div style={{ margin: "14px 20px 0", background: `${C.amber}11`, border: `1px solid ${C.amber}33`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.amber, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>⚠ <strong>{errors.length}</strong> transaction{errors.length === 1 ? "" : "s"} could not be posted and {errors.length === 1 ? "is" : "are"} not in this report.</span>
          <button onClick={() => setShowRecon(s => !s)} style={{ marginLeft: "auto", background: "none", border: "none", color: C.amber, textDecoration: "underline", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
            {showRecon ? "Hide reconciliation" : "Review reconciliation"}
          </button>
        </div>
      )}
      {errors.length === 0 && outOfBalance.length === 0 && recon.length > 0 && (
        <div style={{ margin: "14px 20px 0", fontSize: 12, color: C.green }}>✓ Ledger reconciles to source payments and expenses for every set of books.</div>
      )}

      {/* Statement */}
      <div style={{ overflowX: "auto", marginTop: 14 }}>
        {!scopeReady && <div style={{ padding: 24, textAlign: "center", color: C.textSub, fontSize: 13 }}>Select a {SCOPES.find(s => s.value === scope).label.toLowerCase()}.</div>}
        {scopeReady && loading && <div style={{ padding: 24, textAlign: "center", color: C.textSub, fontSize: 13 }}>Loading…</div>}
        {scopeReady && error && <div style={{ padding: 24, textAlign: "center", color: C.red, fontSize: 13 }}>{error}</div>}
        {scopeReady && !loading && model && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><TH>Account</TH><TH right>{comparing ? `${range.from} to ${range.to}` : "Amount"}</TH>{comparing && <><TH right>{`${cmpRange.from} to ${cmpRange.to}`}</TH><TH right>Change</TH><TH right>%</TH></>}</tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const header = i === 0 || rows[i - 1].section !== r.section;
                const line = !r.total;
                const open = line && drill?.code === r.code;
                return [
                  header && r.section !== "Net" && (
                    <tr key={`h-${r.section}`}><td colSpan={COLS} style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", padding: "14px 16px 6px" }}>{r.section}</td></tr>
                  ),
                  <tr key={`${r.section}-${r.code || r.name}`} className={line ? "m-row" : ""} style={{ cursor: line ? "pointer" : "default", background: r.section === "Net" ? C.raised : undefined }}
                    onClick={() => line && openDrill(r)} title={line ? "Show transactions" : undefined}>
                    <TD indent={line} bold={r.total}>{line ? <><span style={{ color: C.textMuted, marginRight: 8 }}>{r.code}</span>{r.name} <span style={{ color: C.textMuted }}>{open ? "▾" : "▸"}</span></> : r.name}</TD>
                    <TD right bold={r.total} color={r.section === "Net" ? (r.cents < 0 ? C.red : C.green) : undefined}>{fmtCents(r.cents)}</TD>
                    {comparing && <>
                      <TD right bold={r.total}>{fmtCents(r.compareCents)}</TD>
                      <TD right bold={r.total}>{fmtCents(r.changeCents)}</TD>
                      <TD right bold={r.total}>{fmtPct(r.pct)}</TD>
                    </>}
                  </tr>,
                  open && (
                    <tr key={`d-${r.code}`}><td colSpan={COLS} style={{ padding: "0 16px 12px 32px", borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                      <Drill drill={drill} range={range} />
                    </td></tr>
                  ),
                ];
              })}
              {model.income.length === 0 && model.expenses.length === 0 && (
                <tr><td colSpan={COLS} style={{ padding: 16, textAlign: "center", color: C.textSub, fontSize: 13 }}>No posted transactions in this period.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Reconciliation */}
      {showRecon && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "16px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>Reconciliation — all dates</div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
            <thead><tr><TH>Books</TH><TH>Source</TH><TH right>Qualifying source</TH><TH right>In ledger</TH><TH right>Unposted</TH></tr></thead>
            <tbody>
              {recon.map(r => (
                <tr key={`${r.books}-${r.source_type}`}>
                  <TD bold>{r.books_name}</TD><TD>{r.source_type === "payment" ? "Receipts" : "Expenses"}</TD>
                  <TD right>{fmtCents(r.source_cents)}</TD>
                  <TD right color={Number(r.source_cents) === Number(r.ledger_cents) ? C.green : C.red}>{fmtCents(r.ledger_cents)}</TD>
                  <TD right>{r.unposted_count}</TD>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>Not posted ({errors.length}) · Notes ({warnings.length})</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><TH>Date</TH><TH>Source</TH><TH>Detail</TH><TH right>Amount</TH><TH>Reason</TH><TH></TH></tr></thead>
            <tbody>
              {exceptions.map(x => {
                const classifiable = x.source_type === "payment" && ["uncategorized_receipt", "no_unit", "missing_paid_date"].includes(x.code);
                const open = fix?.id === x.source_id;
                return [
                  <tr key={`${x.source_id}-${x.code}`}>
                    <TD>{x.source_date || "—"}</TD>
                    <TD>{x.source_type}</TD>
                    <TD bold>{x.description || "—"}</TD>
                    <TD right>{x.amount_cents == null ? "—" : fmtCents(x.amount_cents)}</TD>
                    <TD color={x.severity === "error" ? C.amber : C.textSub}>{EXCEPTION_TEXT[x.code] || x.code}</TD>
                    <TD>{classifiable && !open && <GhostBtn small onClick={() => setFix({ id: x.source_id, code: x.code, category: "", unit_id: "", paid_on: "", saving: false, error: "" })}>Classify</GhostBtn>}</TD>
                  </tr>,
                  open && (
                    <tr key={`fix-${x.source_id}`}><td colSpan={6} style={{ padding: "10px 16px 14px", borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <select aria-label="Payment for" value={fix.category} onChange={e => setFix(f => ({ ...f, category: e.target.value }))} style={selectStyle}>
                          <option value="">{x.code === "uncategorized_receipt" ? "Payment for… *" : "Keep category"}</option>
                          {PAYMENT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.value}</option>)}
                        </select>
                        <select aria-label="Unit" value={fix.unit_id} onChange={e => setFix(f => ({ ...f, unit_id: e.target.value }))} style={selectStyle}>
                          <option value="">{x.code === "no_unit" ? "Unit it was for… *" : "Keep recorded unit"}</option>
                          {unitOptions.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                        </select>
                        <input type="date" aria-label="Date received" title="Date the money was actually received" value={fix.paid_on}
                          onChange={e => setFix(f => ({ ...f, paid_on: e.target.value }))} style={dateStyle} />
                        <GhostBtn small disabled={fix.saving} onClick={saveFix}>{fix.saving ? "Saving…" : "Save"}</GhostBtn>
                        <GhostBtn small onClick={() => setFix(null)}>Cancel</GhostBtn>
                        {fix.error && <span style={{ fontSize: 12, color: C.red }}>{fix.error}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>Only what you select here is recorded on the payment; nothing is inferred. It posts as soon as it qualifies.</div>
                    </td></tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Drill({ drill, range }) {
  if (!drill.rows) return <div style={{ padding: 12, fontSize: 12, color: C.textSub }}>Loading transactions…</div>;
  if (drill.error) return <div style={{ padding: 12, fontSize: 12, color: C.red }}>{drill.error}</div>;
  const total = drill.rows.reduce((s, r) => s + Number(r.amount_cents), 0);
  const cell = { fontSize: 12, color: C.textSub, padding: "7px 10px", borderBottom: `1px solid ${C.border}` };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0 6px" }}>
        <span style={{ fontSize: 11, color: C.textMuted }}>{drill.rows.length} transaction{drill.rows.length === 1 ? "" : "s"} · {drill.code} {drill.name}</span>
        <GhostBtn small onClick={() => download(`Modus_${drill.code}_${slug(drill.name)}_${range.from}_${range.to}.csv`, transactionsCSV(drill.rows, { accountLabel: `${drill.code} ${drill.name}`, from: range.from, to: range.to }))}>⬇ CSV</GhostBtn>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{["Date", "Description", "Books", "Property", "Tenant", "Amount"].map((h, i) => <th key={h} style={{ ...cell, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: i === 5 ? "right" : "left", fontWeight: 600 }}>{h}</th>)}</tr></thead>
        <tbody>
          {drill.rows.map(r => (
            <tr key={r.entry_id}>
              <td style={cell}>{r.entry_date}</td>
              <td style={{ ...cell, color: C.text }}>{r.memo}{r.kind === "reversal" && <span style={{ marginLeft: 6, fontSize: 10, color: C.amber }}>REVERSAL</span>}</td>
              <td style={cell}>{r.books_name}</td>
              <td style={cell}>{r.property_name || "—"}</td>
              <td style={cell}>{r.tenant_name || "—"}</td>
              <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", color: Number(r.amount_cents) < 0 ? C.red : C.text }}>{fmtCents(r.amount_cents)}</td>
            </tr>
          ))}
          <tr><td colSpan={5} style={{ ...cell, fontWeight: 600, color: C.text }}>Total</td><td style={{ ...cell, textAlign: "right", fontWeight: 600, color: C.text }}>{fmtCents(total)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
