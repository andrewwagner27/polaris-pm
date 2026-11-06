import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { ScopeSelects } from "./ScopeFilter";
import { useScope, selectStyle } from "./lib/useScope";
import {
  balanceSheetModel, balanceSheetCSV, trialBalanceModel, trialBalanceCSV, balanceTotals, fmtCents, todayNY,
} from "./lib/accounting";

const C = {
  bg:"#0C0E12", surface:"#14181F", raised:"#1A1F29", border:"rgba(255,255,255,0.08)", text:"#EDEAE2", textSub:"#9095A0", textMuted:"#5C6270",
  gold:"#C9A96E", green:"#72B02A", red:"#E05555", amber:"#F0A430", blue:"#4A9AE8",
};
const th = (right) => ({ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",padding:"10px 16px",textAlign:right?"right":"left",borderBottom:`1px solid ${C.border}`,background:C.raised,whiteSpace:"nowrap" });
const td = (right, bold, color, indent) => ({ fontSize:13,color:color||(bold?C.text:C.textSub),fontWeight:bold?600:400,padding:`10px 16px 10px ${indent?32:16}px`,borderBottom:`1px solid ${C.border}`,textAlign:right?"right":"left",fontVariantNumeric:"tabular-nums" });
const Ghost = ({ children, onClick, disabled }) => <button onClick={onClick} disabled={disabled} style={{ background:"transparent",border:`1px solid ${C.border}`,color:C.textSub,fontSize:12,fontWeight:500,padding:"7px 14px",borderRadius:7,cursor:disabled?"default":"pointer",fontFamily:"'DM Sans',sans-serif",opacity:disabled?0.5:1 }}>{children}</button>;
const Note = ({ color, children }) => <div style={{ margin:"12px 20px 0",background:`${color}11`,border:`1px solid ${color}33`,borderRadius:8,padding:"10px 14px",fontSize:12,color,lineHeight:1.5 }}>{children}</div>;
const Empty = ({ children, color }) => <div style={{ padding:24,textAlign:"center",color:color||C.textSub,fontSize:13 }}>{children}</div>;

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type:"text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
const slug = (s) => String(s).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");

// Which sets of books a scope covers.
function booksInScope(s, status) {
  if (s.scope === "portfolio") return status;
  if (s.scope === "books") return status.filter(b => b.books === s.scopeId);
  if (s.scope === "owner") {
    const ids = new Set(s.books.filter(b => b.owner_entity_id === s.scopeId).map(b => b.id));
    return status.filter(b => ids.has(b.books));
  }
  const p = s.properties.find(x => x.id === s.scopeId);
  return status.filter(b => b.books === p?.accounting_entity_id);
}

function Header({ title, s, asOf, onCsv, canCsv, badge }) {
  return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:`1px solid ${C.border}`,flexWrap:"wrap",gap:10 }}>
      <div>
        <div style={{ fontSize:14,fontWeight:600,color:C.text }}>{title} <span style={{ fontWeight:400,color:C.textSub }}>· cash basis</span></div>
        <div style={{ fontSize:12,color:C.textSub,marginTop:3 }}>{s.label} · as of {asOf}</div>
      </div>
      <div style={{ display:"flex",alignItems:"center",gap:12 }}>
        {badge}
        <Ghost disabled={!canCsv} onClick={onCsv}>⬇ CSV</Ghost>
      </div>
    </div>
  );
}

function Filters({ s, asOf, setAsOf }) {
  return (
    <div style={{ display:"flex",alignItems:"center",gap:8,padding:"10px 20px",borderBottom:`1px solid ${C.border}`,flexWrap:"wrap" }}>
      <span style={{ fontSize:12,color:C.textMuted }}>As of</span>
      <input aria-label="As of" type="date" value={asOf} onChange={e=>setAsOf(e.target.value)} style={selectStyle}/>
      <ScopeSelects s={s}/>
    </div>
  );
}

function Activity({ asOf, rpcScope, code, name }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let live = true;
    supabase.rpc("a3_account_activity", { p_as_of: asOf, ...rpcScope, p_account_code: code }).then(({ data }) => { if (live) setRows(data || []); });
    return () => { live = false; };
  }, [asOf, rpcScope.p_scope, rpcScope.p_scope_id, code]);   // eslint-disable-line react-hooks/exhaustive-deps
  const cell = { fontSize:12,color:C.textSub,padding:"7px 10px",borderBottom:`1px solid ${C.border}` };
  if (!rows) return <div style={{ padding:12,fontSize:12,color:C.textSub }}>Loading…</div>;
  return (
    <div style={{ overflowX:"auto" }}>
      <div style={{ fontSize:11,color:C.textMuted,padding:"10px 0 6px" }}>{rows.length} entr{rows.length===1?"y":"ies"} · {code} {name}</div>
      <table style={{ width:"100%",borderCollapse:"collapse" }}>
        <thead><tr>{["Date","Description","Books","Property","Tenant","Debit","Credit","Balance"].map((h,i)=><th key={h} style={{ ...cell,fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:600,textAlign:i>=5?"right":"left" }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map(r=>(
          <tr key={r.entry_id}>
            <td style={cell}>{r.entry_date}</td>
            <td style={{ ...cell,color:C.text }}>{r.memo}{r.kind==="reversal"&&<span style={{ marginLeft:6,fontSize:10,color:C.amber }}>REVERSAL</span>}</td>
            <td style={cell}>{r.books_name}</td><td style={cell}>{r.property_name||"—"}</td><td style={cell}>{r.tenant_name||"—"}</td>
            <td style={{ ...cell,textAlign:"right" }}>{Number(r.debit_cents)?fmtCents(r.debit_cents):"—"}</td>
            <td style={{ ...cell,textAlign:"right" }}>{Number(r.credit_cents)?fmtCents(r.credit_cents):"—"}</td>
            <td style={{ ...cell,textAlign:"right",color:C.text }}>{fmtCents(r.balance_cents)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function BalanceSheet() {
  const s = useScope();
  const [asOf, setAsOf] = useState(todayNY());
  const [data, setData] = useState({ key:null, rows:[], error:"" });
  const [status, setStatus] = useState([]);
  const [memo, setMemo] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [excCount, setExcCount] = useState(0);
  const [openCode, setOpenCode] = useState(null);

  const key = s.ready && asOf ? JSON.stringify({ asOf, ...s.rpcScope }) : null;
  useEffect(() => {
    if (!key) return;
    let live = true;
    (async () => {
      const [{ data:r, error }, { data:st }, { data:ag }, { data:dp }, { data:ex }] = await Promise.all([
        supabase.rpc("a3_balance_sheet", { p_as_of: asOf, ...s.rpcScope }),
        supabase.rpc("a3_books_status", { p_as_of: asOf }),
        supabase.rpc("a2_tenant_balances", { p_as_of: asOf, ...s.rpcScope }),
        supabase.rpc("a3_deposit_detail", { p_as_of: asOf, ...s.rpcScope }),
        supabase.rpc("a1_open_exceptions"),
      ]);
      if (!live) return;
      setData({ key, rows: r || [], error: error?.message || "" });
      setStatus(st || []); setMemo(balanceTotals(ag || [])); setDeposits(dp || []);
      setExcCount((ex || []).filter(x => x.severity === "error").length);
    })();
    return () => { live = false; };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps

  const loading = !!key && data.key !== key;
  const model = !loading && key ? balanceSheetModel(data.rows) : null;
  const inScope = booksInScope(s, status);
  const noOpening = inScope.filter(b => b.opening_entries === 0 && (Number(b.debit_cents) > 0));
  const negCash = model?.assets.filter(l => l.cents < 0) || [];
  const ownersShown = new Set(inScope.filter(b => Number(b.debit_cents) > 0).map(b => b.owner_name));
  const hasDue = (model?.liabilities || []).find(l => l.code === "2190");
  const feeOwed = (model?.liabilities || []).find(l => l.code === "2195");

  const badge = model && <span style={{ fontSize:12,fontWeight:600,color:model.balanced?C.green:C.red }}>{model.balanced?"✓ Balanced":`✗ Out of balance by ${fmtCents(model.difference)}`}</span>;

  const section = (title, list, totalLabel, total) => [
    <tr key={`h-${title}`}><td colSpan={2} style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",padding:"14px 16px 6px" }}>{title}</td></tr>,
    ...list.map(l => {
      const can = !!l.code; const open = openCode === l.code && can;
      return [
        <tr key={`${title}-${l.name}`} style={{ cursor:can?"pointer":"default" }} onClick={()=>can&&setOpenCode(open?null:l.code)}>
          <td style={td(false,false,undefined,true)}>{can&&<span style={{ color:C.textMuted,marginRight:8 }}>{l.code}</span>}{l.name}{can&&<span style={{ color:C.textMuted }}> {open?"▾":"▸"}</span>}</td>
          <td style={td(true,false,l.cents<0?C.amber:undefined)}>{fmtCents(l.cents)}</td>
        </tr>,
        open&&<tr key={`d-${l.code}`}><td colSpan={2} style={{ padding:"0 16px 12px 32px",borderBottom:`1px solid ${C.border}`,background:C.bg }}><Activity asOf={asOf} rpcScope={s.rpcScope} code={l.code} name={l.name}/></td></tr>,
      ];
    }),
    list.length===0&&<tr key={`none-${title}`}><td colSpan={2} style={td(false,false,C.textMuted,true)}>None recorded</td></tr>,
    <tr key={`t-${title}`}><td style={td(false,true)}>{totalLabel}</td><td style={td(true,true)}>{fmtCents(total)}</td></tr>,
  ];

  return (
    <>
      <Header title="Balance Sheet" s={s} asOf={asOf} badge={badge} canCsv={!!model}
        onCsv={()=>download(`Modus_Balance_Sheet_${slug(s.label)}_${asOf}.csv`, balanceSheetCSV(model, { scopeLabel:s.label, asOf }))}/>
      <Filters s={s} asOf={asOf} setAsOf={setAsOf}/>

      {noOpening.length>0&&<Note color={C.amber}>⚠ <strong>{noOpening.map(b=>b.books_name).join(", ")}</strong> {noOpening.length===1?"has":"have"} no opening balances entered, so cash and equity here show only what Modus has recorded since it started. Modus never infers them. Enter them in Financials → Owner &amp; Cash.</Note>}
      {excCount>0&&<Note color={C.amber}>⚠ {excCount} transaction{excCount===1?"":"s"} could not be posted and {excCount===1?"is":"are"} not on this statement. Review them in Reports → Income Statement → reconciliation.</Note>}
      {negCash.length>0&&<Note color={C.amber}>⚠ {negCash.map(l=>l.name).join(", ")} {negCash.length===1?"is":"are"} negative. Check for a missing opening balance, or a Stripe payout or owner contribution not yet recorded.</Note>}
      {hasDue&&hasDue.cents>0&&<Note color={C.amber}>⚠ {fmtCents(hasDue.cents)} of returned or refunded rent is owed to Modus until the transfer is reversed in Stripe. See Financials → Receivables.</Note>}
      {hasDue&&hasDue.cents<0&&<Note color={C.amber}>⚠ Modus owes this owner {fmtCents(-hasDue.cents)}: a reversal took back more than the owner's 95%. See Financials → Receivables.</Note>}
      {feeOwed&&<Note color={C.blue}>{fmtCents(feeOwed.cents)} of Modus's 5% is owed on rent collected outside Stripe. Pay it in Financials → Owner &amp; Cash.</Note>}
      {s.scope==="portfolio"&&ownersShown.size>1&&<Note color={C.blue}>Combined view of {ownersShown.size} separate owners, including any third-party clients. Their books stay separate; this is a management view, not a consolidated statement. Filter by ownership entity for one owner's statement.</Note>}
      {s.scope==="property"&&<Note color={C.blue}>A property view shows entries recorded against this property. Items recorded at the set-of-books level, such as a bank opening balance or an owner draw with no property, are in the set-of-books view only.</Note>}

      <div style={{ overflowX:"auto",marginTop:14 }}>
        {!s.ready&&<Empty>Select one to view the statement.</Empty>}
        {s.ready&&loading&&<Empty>Loading…</Empty>}
        {data.error&&!loading&&<Empty color={C.red}>{data.error}</Empty>}
        {model&&!data.error&&(
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead><tr><th style={th()}>Account</th><th style={th(true)}>Amount</th></tr></thead>
            <tbody>
              {section("Assets", model.assets, "Total assets", model.totalAssets)}
              {section("Liabilities", model.liabilities, "Total liabilities", model.totalLiabilities)}
              {section("Equity", model.equity, "Total equity", model.totalEquity)}
              <tr style={{ background:C.raised }}><td style={td(false,true)}>Total liabilities and equity</td><td style={td(true,true,model.balanced?C.green:C.red)}>{fmtCents(model.totalLiabilities+model.totalEquity)}</td></tr>
            </tbody>
          </table>
        )}
      </div>

      {model&&memo&&(
        <div style={{ padding:"16px 20px",borderTop:`1px solid ${C.border}`,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:16 }}>
          <div>
            <div style={{ fontSize:12,fontWeight:600,color:C.text,marginBottom:6 }}>Not on a cash-basis Balance Sheet</div>
            <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,color:C.textSub,padding:"3px 0" }}><span>Tenant receivables (open charges)</span><span>{fmtCents(memo.open_cents)}</span></div>
            <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,color:C.textSub,padding:"3px 0" }}><span>Tenant credits</span><span>{fmtCents(memo.credit_cents)}</span></div>
            <div style={{ fontSize:11,color:C.textMuted,marginTop:6,lineHeight:1.5 }}>Property values and loans aren't tracked in Modus yet, so equity here reflects cash activity only.</div>
          </div>
          <div>
            <div style={{ fontSize:12,fontWeight:600,color:C.text,marginBottom:6 }}>Security deposits held, by tenant</div>
            {deposits.length===0?<div style={{ fontSize:12,color:C.textMuted }}>None recorded.</div>:deposits.map(d=>(
              <div key={d.tenant_id||d.tenant_name} style={{ display:"flex",justifyContent:"space-between",fontSize:12,color:C.textSub,padding:"3px 0" }}><span>{d.tenant_name}{d.property_name?` · ${d.property_name}`:""}</span><span>{fmtCents(d.held_cents)}</span></div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function TrialBalance() {
  const s = useScope();
  const [asOf, setAsOf] = useState(todayNY());
  const [data, setData] = useState({ key:null, rows:[], error:"", is:null });
  const [openCode, setOpenCode] = useState(null);

  const key = s.ready && asOf ? JSON.stringify({ asOf, ...s.rpcScope }) : null;
  useEffect(() => {
    if (!key) return;
    let live = true;
    (async () => {
      const [{ data:r, error }, { data:is }] = await Promise.all([
        supabase.rpc("a3_trial_balance", { p_as_of: asOf, ...s.rpcScope }),
        supabase.rpc("a1_income_statement", { p_from:"0001-01-01", p_to:asOf, ...s.rpcScope }),
      ]);
      if (live) setData({ key, rows: r || [], error: error?.message || "", is: is || [] });
    })();
    return () => { live = false; };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps

  const loading = !!key && data.key !== key;
  const model = !loading && key ? trialBalanceModel(data.rows) : null;
  const isNet = (data.is || []).reduce((a,x)=>a+(x.account_type==="income"?1:-1)*Number(x.amount_cents),0);
  const ties = model && isNet === model.netIncome;
  const badge = model && <span style={{ fontSize:12,fontWeight:600,color:model.balanced?C.green:C.red }}>{model.balanced?"✓ Debits = credits":`✗ Out of balance by ${fmtCents(model.difference)}`}</span>;

  return (
    <>
      <Header title="Trial Balance" s={s} asOf={asOf} badge={badge} canCsv={!!model}
        onCsv={()=>download(`Modus_Trial_Balance_${slug(s.label)}_${asOf}.csv`, trialBalanceCSV(model, { scopeLabel:s.label, asOf }))}/>
      <Filters s={s} asOf={asOf} setAsOf={setAsOf}/>
      <div style={{ overflowX:"auto" }}>
        {!s.ready&&<Empty>Select one to view the Trial Balance.</Empty>}
        {s.ready&&loading&&<Empty>Loading…</Empty>}
        {data.error&&!loading&&<Empty color={C.red}>{data.error}</Empty>}
        {model&&!data.error&&(
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead><tr><th style={th()}>Account</th><th style={th()}>Type</th><th style={th(true)}>Debit</th><th style={th(true)}>Credit</th></tr></thead>
            <tbody>
              {model.lines.map(l=>{
                const open = openCode===l.code;
                return [
                  <tr key={l.code} style={{ cursor:"pointer" }} onClick={()=>setOpenCode(open?null:l.code)}>
                    <td style={td(false,true)}><span style={{ color:C.textMuted,marginRight:8,fontWeight:400 }}>{l.code}</span>{l.name} <span style={{ color:C.textMuted }}>{open?"▾":"▸"}</span></td>
                    <td style={td()}>{l.type}</td>
                    <td style={td(true)}>{l.debit?fmtCents(l.debit):"—"}</td>
                    <td style={td(true)}>{l.credit?fmtCents(l.credit):"—"}</td>
                  </tr>,
                  open&&<tr key={`d-${l.code}`}><td colSpan={4} style={{ padding:"0 16px 12px 32px",borderBottom:`1px solid ${C.border}`,background:C.bg }}><Activity asOf={asOf} rpcScope={s.rpcScope} code={l.code} name={l.name}/></td></tr>,
                ];
              })}
              {model.lines.length===0&&<tr><td colSpan={4} style={td(false,false,C.textMuted)}>No journal entries through this date.</td></tr>}
              <tr style={{ background:C.raised }}><td colSpan={2} style={td(false,true)}>Total</td><td style={td(true,true)}>{fmtCents(model.totalDebit)}</td><td style={td(true,true,model.balanced?C.green:C.red)}>{fmtCents(model.totalCredit)}</td></tr>
            </tbody>
          </table>
        )}
      </div>
      {model&&!data.error&&(
        <div style={{ padding:"14px 20px",fontSize:12,color:ties?C.green:C.red,borderTop:`1px solid ${C.border}` }}>
          {ties?"✓":"✗"} Income and expense accounts net to {fmtCents(model.netIncome)}{ties?", the same as the Income Statement for all dates through this one.":`, but the Income Statement shows ${fmtCents(isNet)}.`}
          <div style={{ color:C.textMuted,marginTop:4 }}>Cumulative and unadjusted: no closing entries are made, so income and expense accounts carry their all-time totals.</div>
        </div>
      )}
    </>
  );
}
