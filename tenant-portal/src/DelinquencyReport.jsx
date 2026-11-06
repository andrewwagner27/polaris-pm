import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { SCOPES, balanceDisplayRows, delinquencyCSV, fmtCents, todayNY } from "./lib/accounting";

const C = {
  surface:"#14181F", raised:"#1A1F29", border:"rgba(255,255,255,0.08)", text:"#EDEAE2", textSub:"#9095A0",
  textMuted:"#5C6270", gold:"#C9A96E", goldDim:"#6B4F24", green:"#72B02A", red:"#E05555", amber:"#F0A430", blue:"#4A9AE8",
};
const selectStyle = { padding:"8px 12px",fontSize:12,border:`1px solid ${C.border}`,borderRadius:7,background:C.raised,color:C.textSub,outline:"none",fontFamily:"'DM Sans',sans-serif",colorScheme:"dark" };
const th = (right) => ({ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",padding:"10px 14px",textAlign:right?"right":"left",borderBottom:`1px solid ${C.border}`,background:C.raised,whiteSpace:"nowrap" });
const td = (right, color, bold) => ({ fontSize:13,color:color||(bold?C.text:C.textSub),fontWeight:bold?600:400,padding:"10px 14px",borderBottom:`1px solid ${C.border}`,textAlign:right?"right":"left",fontVariantNumeric:"tabular-nums" });
const fmtDay = (d) => d ? new Date(`${String(d).slice(0,10)}T12:00:00`).toLocaleDateString("en-US",{ month:"short",day:"numeric",year:"numeric" }) : "—";

// Tenants who owe money, from the receivables ledger. Click a tenant to see each open charge and its days past due.
export default function DelinquencyReport({ properties = [] }) {
  const [asOf, setAsOf]       = useState(todayNY());
  const [scope, setScope]     = useState("portfolio");
  const [scopeId, setScopeId] = useState("");
  const [options, setOptions] = useState({ owner:[], books:[] });
  const [rows, setRows]       = useState(null);
  const [error, setError]     = useState("");
  const [open, setOpen]       = useState(null);   // { tenant_id, rows }

  useEffect(() => {
    let live = true;
    Promise.all([
      supabase.from("accounting_entities").select("id, name, owner_entity_id").order("name"),
      supabase.from("ownership_entities").select("id, name").order("name"),
    ]).then(([{ data: books }, { data: owners }]) => {
      if (live) setOptions({ books: books || [], owner: owners || [] });
    });
    return () => { live = false; };
  }, []);

  const scopeOptions = scope === "property" ? properties : (options[scope] || []);
  const scopeReady = scope === "portfolio" || !!scopeId;
  const scopeLabel = scope === "portfolio" ? "Portfolio"
    : `${SCOPES.find(s => s.value === scope).label}: ${scopeOptions.find(o => o.id === scopeId)?.name || "—"}`;

  useEffect(() => {
    if (!scopeReady) return undefined;
    let live = true;
    supabase.rpc("a2_tenant_balances", { p_as_of: asOf, p_scope: scope, p_scope_id: scope === "portfolio" ? null : scopeId })
      .then(({ data, error: err }) => {
        if (!live) return;
        setError(err ? err.message : "");
        setRows(data || []);
        setOpen(null);
      });
    return () => { live = false; };
  }, [asOf, scope, scopeId, scopeReady]);

  async function toggle(tenantId) {
    if (open?.tenant_id === tenantId) { setOpen(null); return; }
    const { data } = await supabase.rpc("a2_tenant_open_charges", { p_tenant: tenantId, p_as_of: asOf, p_scope: scope, p_scope_id: scope === "portfolio" ? null : scopeId });
    setOpen({ tenant_id: tenantId, rows: data || [] });
  }

  const source = (rows || []).filter(r => Number(r.balance_cents) > 0);
  const display = balanceDisplayRows(source);
  const body = display.filter(r => !r.total);
  const total = display.find(r => r.total);

  function exportCSV() {
    const blob = new Blob([delinquencyCSV(source, { scopeLabel, asOf })], { type:"text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `Modus_Delinquency_${asOf}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",alignItems:"center" }}>
        <div>
          <div style={{ fontSize:14,fontWeight:600,color:C.text }}>Delinquency Report</div>
          <div style={{ fontSize:12,color:C.textSub,marginTop:3 }}>{scopeLabel} · as of {fmtDay(asOf)}. Not income; the Income Statement stays cash basis.</div>
        </div>
        <div style={{ display:"flex",gap:8,flexWrap:"wrap",alignItems:"center" }}>
          <select aria-label="Scope" value={scope} onChange={e=>{ setScope(e.target.value); setScopeId(""); }} style={selectStyle}>
            {SCOPES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {scope!=="portfolio"&&(
            <select aria-label="Scope item" value={scopeId} onChange={e=>setScopeId(e.target.value)} style={selectStyle}>
              <option value="">Select…</option>
              {scopeOptions.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          <input aria-label="As of" type="date" value={asOf} onChange={e=>e.target.value&&setAsOf(e.target.value)} style={selectStyle}/>
          <button onClick={exportCSV} disabled={!rows} style={{ background:"transparent",border:`1px solid ${C.goldDim}`,color:C.gold,fontSize:12,fontWeight:500,padding:"7px 14px",borderRadius:7,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>Export CSV</button>
        </div>
      </div>
      {error&&<div style={{ padding:"12px 20px",color:C.red,fontSize:12 }}>{error}</div>}
      {!scopeReady&&<div style={{ padding:24,textAlign:"center",color:C.textSub,fontSize:13 }}>Select a {SCOPES.find(s=>s.value===scope).label.toLowerCase()}.</div>}
      {scopeReady&&rows&&body.length===0&&<div style={{ padding:28,textAlign:"center",color:C.green,fontSize:14,fontWeight:600 }}>No tenant owes a balance.</div>}
      {scopeReady&&body.length>0&&(
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead><tr>
              <th style={th()}>Tenant</th><th style={th()}>Property</th><th style={th()}>Books</th>
              <th style={th(true)}>Open</th><th style={th(true)}>Credit</th><th style={th(true)}>Balance</th>
            </tr></thead>
            <tbody>
              {source.map((r,i)=>{
                const d = body[i];
                return [
                  <tr key={r.tenant_id} onClick={()=>toggle(r.tenant_id)} style={{ cursor:"pointer" }}>
                    <td style={td(false,null,true)}>{d.name}</td><td style={td()}>{d.property||"—"}</td><td style={td()}>{d.books||"—"}</td>
                    <td style={td(true)}>{fmtCents(d.open_cents)}</td>
                    <td style={td(true, d.credit_cents?C.blue:null)}>{d.credit_cents?fmtCents(d.credit_cents):"—"}</td>
                    <td style={td(true, C.red, true)}>{fmtCents(d.balance_cents)}</td>
                  </tr>,
                  open?.tenant_id===r.tenant_id&&(
                    <tr key={`${r.tenant_id}-d`}><td colSpan={6} style={{ background:C.raised,padding:"10px 14px",borderBottom:`1px solid ${C.border}` }}>
                      <table style={{ width:"100%",borderCollapse:"collapse" }}>
                        <thead><tr><th style={th()}>Charge</th><th style={th()}>Due</th><th style={th(true)}>Days past due</th><th style={th(true)}>Amount</th><th style={th(true)}>Paid</th><th style={th(true)}>Open</th></tr></thead>
                        <tbody>{open.rows.map(c=>(
                          <tr key={c.charge_id}>
                            <td style={td(false,C.text)}>{c.category}{c.period?` ${c.period}`:""}{c.memo?` · ${c.memo}`:""}</td>
                            <td style={td()}>{fmtDay(c.due_date)}</td><td style={td(true)}>{Math.max(c.days_past_due,0)}</td>
                            <td style={td(true)}>{fmtCents(c.amount_cents)}</td><td style={td(true)}>{fmtCents(c.applied_cents)}</td><td style={td(true,C.text)}>{fmtCents(c.open_cents)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </td></tr>
                  ),
                ];
              })}
              <tr>
                <td colSpan={3} style={td(false,null,true)}>Total</td>
                <td style={td(true,null,true)}>{fmtCents(total.open_cents)}</td>
                <td style={td(true,C.blue,true)}>{total.credit_cents?fmtCents(total.credit_cents):"—"}</td>
                <td style={td(true,C.red,true)}>{fmtCents(total.balance_cents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
