import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import { ScopeSelects } from "./ScopeFilter";
import { useScope, selectStyle } from "./lib/useScope";
import {
  CHARGE_CATEGORIES, COLLECTION_STATUS, collectionsCSV, collectionsTotals, filterCollections, fmtCents, parseDollarsToCents, todayNY,
} from "./lib/accounting";

const C = {
  bg:"#0C0E12", surface:"#14181F", raised:"#1A1F29", border:"rgba(255,255,255,0.08)", text:"#EDEAE2", textSub:"#9095A0", textMuted:"#5C6270",
  gold:"#C9A96E", goldDim:"#6B4F24", green:"#72B02A", red:"#E05555", amber:"#F0A430", blue:"#4A9AE8",
};
const th = (right) => ({ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",padding:"9px 12px",textAlign:right?"right":"left",borderBottom:`1px solid ${C.border}`,background:C.raised,whiteSpace:"nowrap" });
const td = (right, color, bold) => ({ fontSize:13,color:color||(bold?C.text:C.textSub),fontWeight:bold?600:400,padding:"10px 12px",borderBottom:`1px solid ${C.border}`,textAlign:right?"right":"left",fontVariantNumeric:"tabular-nums",verticalAlign:"top" });
const btn = (gold) => ({ background:"transparent",border:`1px solid ${gold?C.goldDim:C.border}`,color:gold?C.gold:C.textSub,fontSize:11,padding:"4px 9px",borderRadius:6,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" });
const fmtDay = (d) => d ? new Date(`${String(d).slice(0,10)}T12:00:00`).toLocaleDateString("en-US",{ month:"short",day:"numeric",year:"numeric" }) : "—";
const STATUS_COLOR = { settling:C.blue, returned:C.red, failed:C.red, partial:C.amber, no_payment:C.red, not_yet_due:C.textSub };
const AGE_FILTERS = [{ v:0, l:"All" }, { v:1, l:"Past due" }, { v:30, l:"30+ days" }, { v:60, l:"60+ days" }, { v:90, l:"90+ days" }];

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type:"text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// Who owes what, worst first. Every figure comes from the receivables ledger; legacy balance columns aren't read.
export default function Collections({ onRecordPayment }) {
  const navigate = useNavigate();
  const today = todayNY();
  const s = useScope();
  const [active, setActive] = useState(null);
  const [rows, setRows]     = useState(null);
  const [error, setError]   = useState("");
  const [rev, setRev]       = useState(0);
  const [age, setAge]       = useState(0);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState([]);
  const [chargeFor, setChargeFor] = useState(null);   // { tenant_id, name, category, amount, due, memo }
  const [msg, setMsg]       = useState(null);

  const key = s.ready ? JSON.stringify({ ...s.rpcScope, rev }) : null;
  useEffect(() => {
    if (!key) return;
    let live = true;
    (async () => {
      const { data: st } = await supabase.rpc("a2_status");
      if (!live) return;
      setActive(!!st?.active);
      if (!st?.active) { setRows([]); return; }
      const { data, error: err } = await supabase.rpc("a3_collections", { p_as_of: today, ...s.rpcScope });
      if (live) { setRows(data || []); setError(err?.message || ""); }
    })();
    return () => { live = false; };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(r) {
    if (openId === r.tenant_id) { setOpenId(null); return; }
    setOpenId(r.tenant_id); setDetail([]);
    const { data } = await supabase.rpc("a2_tenant_open_charges", { p_tenant: r.tenant_id, p_as_of: today, ...s.rpcScope });
    setDetail(data || []);
  }

  async function addCharge() {
    const cents = parseDollarsToCents(chargeFor.amount);
    if (cents == null) { setMsg({ ok:false, text:"Enter an amount greater than $0." }); return; }
    if (!chargeFor.due) { setMsg({ ok:false, text:"Enter the due date." }); return; }
    const { error: err } = await supabase.rpc("a2_add_charge", {
      p_tenant: chargeFor.tenant_id, p_category: chargeFor.category, p_amount_cents: cents, p_due_date: chargeFor.due, p_memo: chargeFor.memo.trim() || null, p_opening: false,
    });
    setMsg(err ? { ok:false, text: err.message } : { ok:true, text:`Charge added to ${chargeFor.name}. It affects their balance only; income is recognized when money is received.` });
    if (!err) { setChargeFor(null); setRev(n=>n+1); }
  }

  if (active === false) return <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:32,textAlign:"center",color:C.textSub,fontSize:13 }}>Collections start once receivables are activated in Financials → Receivables.</div>;

  const shown = filterCollections(rows || [], { age, status, search });
  const totals = collectionsTotals(shown);
  const statusesPresent = [...new Set((rows || []).map(r => r.payment_status))];

  return (
    <div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:16 }}>
        {[["Open charges",totals.open,C.red],["Past due",totals.overdue,totals.overdue>0?C.red:C.green],["90+ days",totals.d90,totals.d90>0?C.red:C.textSub],["Tenants",totals.tenants,C.text,true],["Late fees open",totals.fees,totals.fees>0?C.amber:C.textSub]].map(([l,v,c,plain])=>(
          <div key={l} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px" }}>
            <div style={{ fontSize:10,fontWeight:600,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6 }}>{l}</div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:600,color:c }}>{plain?v:fmtCents(v)}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:12 }}>
        {AGE_FILTERS.map(f=>(
          <button key={f.v} onClick={()=>setAge(f.v)} style={{ padding:"5px 12px",fontSize:12,fontWeight:500,borderRadius:6,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",border:`1px solid ${age===f.v?C.goldDim:C.border}`,background:age===f.v?"rgba(201,169,110,0.12)":"transparent",color:age===f.v?C.gold:C.textSub }}>{f.l}</button>
        ))}
        <select aria-label="Payment status" value={status} onChange={e=>setStatus(e.target.value)} style={selectStyle}>
          <option value="all">Any payment status</option>
          {statusesPresent.map(x=><option key={x} value={x}>{COLLECTION_STATUS[x]||x}</option>)}
        </select>
        <ScopeSelects s={s}/>
        <input aria-label="Search tenants" placeholder="Search tenant or property" value={search} onChange={e=>setSearch(e.target.value)} style={{ ...selectStyle,minWidth:180,color:C.text }}/>
        <button style={{ ...btn(),marginLeft:"auto",padding:"7px 14px",fontSize:12 }} disabled={!shown.length} onClick={()=>download(`Modus_Collections_${today}.csv`, collectionsCSV(shown, { scopeLabel:s.label, asOf:today }))}>⬇ CSV</button>
      </div>

      {msg&&<div style={{ fontSize:12,color:msg.ok?C.green:C.red,marginBottom:10 }}>{msg.text}</div>}
      {error&&<div style={{ fontSize:13,color:C.red,padding:16 }}>{error}</div>}

      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
        {!s.ready ? <div style={{ padding:32,textAlign:"center",color:C.textSub,fontSize:13 }}>Select one to filter the list.</div>
        : rows===null ? <div style={{ padding:32,textAlign:"center",color:C.textSub,fontSize:13 }}>Loading…</div>
        : shown.length===0 ? <div style={{ padding:32,textAlign:"center",color:C.textSub,fontSize:13 }}>{(rows||[]).length?"Nobody matches these filters.":"Nothing is owed. No open charges."}</div>
        : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead><tr>
                <th style={th()}>Tenant</th><th style={th()}>Property</th><th style={th(true)}>Open</th><th style={th(true)}>Oldest past due</th><th style={th(true)}>Overdue charges</th>
                <th style={th()}>Payment status</th><th style={th()}>Last payment</th><th style={th()}></th>
              </tr></thead>
              <tbody>
                {shown.map(r=>{
                  const open = openId===r.tenant_id;
                  return [
                    <tr key={r.tenant_id} style={{ cursor:"pointer" }} onClick={()=>toggle(r)}>
                      <td style={td(false,undefined,true)}>{r.tenant_name} <span style={{ color:C.textMuted,fontWeight:400 }}>{open?"▾":"▸"}</span>{r.eviction_watch&&<div style={{ fontSize:10,color:C.red,fontWeight:500,marginTop:2 }}>Eviction Watch</div>}</td>
                      <td style={td()}>{r.property_name||"—"}{r.unit_number?` · ${r.unit_number}`:""}<div style={{ fontSize:11,color:C.textMuted,marginTop:2 }}>{r.owner_name||""}</div></td>
                      <td style={td(true,C.red,true)}>{fmtCents(r.open_cents)}
                        {Number(r.rental_credit_cents)>0&&<div style={{ fontSize:11,color:C.blue,fontWeight:400,marginTop:2 }}>{fmtCents(r.rental_credit_cents)} rental credit</div>}
                        {Number(r.cash_overpayment_cents)>0&&<div style={{ fontSize:11,color:C.blue,fontWeight:400,marginTop:2 }}>{fmtCents(r.cash_overpayment_cents)} overpaid</div>}
                        {Number(r.opening_credit_cents)>0&&<div style={{ fontSize:11,color:C.blue,fontWeight:400,marginTop:2 }}>{fmtCents(r.opening_credit_cents)} opening credit</div>}</td>
                      <td style={td(true,r.days_past_due>=60?C.red:r.days_past_due>=30?C.amber:undefined)}>{r.days_past_due>0?`${r.days_past_due} days`:"—"}{r.oldest_due&&<div style={{ fontSize:11,color:C.textMuted,marginTop:2 }}>due {fmtDay(r.oldest_due)}</div>}</td>
                      <td style={td(true)}>{r.overdue_charges}{Number(r.overdue_cents)>0&&<div style={{ fontSize:11,color:C.textMuted,marginTop:2 }}>{fmtCents(r.overdue_cents)}</div>}</td>
                      <td style={td(false,STATUS_COLOR[r.payment_status])}>{COLLECTION_STATUS[r.payment_status]||r.payment_status}</td>
                      <td style={td()}>{r.last_payment_on?<>{fmtCents(r.last_payment_cents)}<div style={{ fontSize:11,color:C.textMuted,marginTop:2 }}>{fmtDay(r.last_payment_on)}</div></>:"None"}</td>
                      <td style={td()} onClick={e=>e.stopPropagation()}>
                        <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
                          <button style={btn(true)} onClick={()=>onRecordPayment?.(r.tenant_id)}>Record payment</button>
                          <button style={btn()} onClick={()=>{ setMsg(null); setChargeFor({ tenant_id:r.tenant_id, name:r.tenant_name, category:"Other", amount:"", due:today, memo:"" }); }}>Add charge</button>
                          <button style={btn()} onClick={()=>navigate(`/landlord/tenants/${r.tenant_id}?tab=Ledger`)}>Ledger</button>
                        </div>
                      </td>
                    </tr>,
                    chargeFor?.tenant_id===r.tenant_id&&(
                      <tr key={`${r.tenant_id}-charge`}><td colSpan={8} style={{ background:C.raised,padding:"12px 14px",borderBottom:`1px solid ${C.border}` }}>
                        <div style={{ display:"flex",gap:8,flexWrap:"wrap",alignItems:"center" }}>
                          <span style={{ fontSize:12,color:C.text,fontWeight:600 }}>New charge for {chargeFor.name}</span>
                          <select aria-label="Charge category" value={chargeFor.category} onChange={e=>setChargeFor(c=>({ ...c, category:e.target.value }))} style={selectStyle}>
                            {CHARGE_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.value}</option>)}
                          </select>
                          <input aria-label="Charge amount" placeholder="$0.00" value={chargeFor.amount} onChange={e=>setChargeFor(c=>({ ...c, amount:e.target.value }))} style={{ ...selectStyle,width:100,color:C.text }}/>
                          <input aria-label="Charge due date" type="date" value={chargeFor.due} onChange={e=>setChargeFor(c=>({ ...c, due:e.target.value }))} style={selectStyle}/>
                          <input aria-label="Charge note" placeholder="Note (optional)" value={chargeFor.memo} onChange={e=>setChargeFor(c=>({ ...c, memo:e.target.value }))} style={{ ...selectStyle,flex:1,minWidth:150,color:C.text }}/>
                          <button style={btn(true)} onClick={addCharge}>Add charge</button>
                          <button style={btn()} onClick={()=>setChargeFor(null)}>Cancel</button>
                        </div>
                      </td></tr>
                    ),
                    open&&(
                      <tr key={`${r.tenant_id}-d`}><td colSpan={8} style={{ background:C.bg,padding:"10px 14px 14px",borderBottom:`1px solid ${C.border}` }}>
                        {Number(r.credit_cents)>0&&<div style={{ fontSize:12,color:C.blue,marginBottom:8 }}>A credit stays in its own category and doesn't pay other kinds of charges.</div>}
                        <table style={{ width:"100%",borderCollapse:"collapse" }}>
                          <thead><tr><th style={th()}>Charge</th><th style={th()}>Due</th><th style={th(true)}>Days past due</th><th style={th(true)}>Amount</th><th style={th(true)}>Paid</th><th style={th(true)}>Open</th></tr></thead>
                          <tbody>{detail.map(d=>(
                            <tr key={d.charge_id}><td style={td(false,C.text)}>{d.memo||`${d.category}${d.period?` ${d.period}`:""}`}<span style={{ color:C.textMuted }}> · {d.category}</span></td><td style={td()}>{fmtDay(d.due_date)}</td><td style={td(true)}>{d.days_past_due>0?d.days_past_due:"—"}</td><td style={td(true)}>{fmtCents(d.amount_cents)}</td><td style={td(true)}>{Number(d.applied_cents)?fmtCents(d.applied_cents):"—"}</td><td style={td(true,C.text)}>{fmtCents(d.open_cents)}</td></tr>
                          ))}</tbody>
                        </table>
                      </td></tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div style={{ fontSize:11,color:C.textMuted,marginTop:8 }}>Worst first. From the receivables ledger as of {fmtDay(today)}. Income is recognized when money is received, so charges added here don't change the Income Statement.</div>
    </div>
  );
}
