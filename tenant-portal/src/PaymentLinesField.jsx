import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { PAYMENT_CATEGORIES, fmtCents, centsToDecimal, openByCategory } from "./lib/accounting";

const C = {
  raised:"#1A1F29", border:"rgba(255,255,255,0.08)", text:"#EDEAE2", textSub:"#9095A0", textMuted:"#5C6270", gold:"#C9A96E",
};
const field = { width:"100%",padding:"9px 11px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,background:C.raised,color:C.text,outline:"none",fontFamily:"'DM Sans',sans-serif" };
const labelStyle = { fontSize:11,fontWeight:600,color:C.textSub,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em" };

// D5: payments apply within their own category, so one payment covering rent and a late fee is
// recorded as one line per category. Shows the tenant's open charges once receivables are active.
export default function PaymentLinesField({ tenantId, lines, onChange }) {
  const [loaded, setLoaded] = useState({ tenantId:null, open:[] });
  const open = loaded.tenantId === tenantId ? loaded.open : [];

  useEffect(() => {
    if (!tenantId) return undefined;
    let live = true;
    supabase.rpc("a2_open_charges", { p_tenant: tenantId }).then(({ data, error }) => {
      if (live) setLoaded({ tenantId, open: error ? [] : openByCategory(data) });   // no receivables yet: the form works without the hint
    });
    return () => { live = false; };
  }, [tenantId]);

  const set = (i, k, v) => onChange(lines.map((l, j) => j === i ? { ...l, [k]: v } : l));
  const remove = (i) => onChange(lines.filter((_, j) => j !== i));
  const add = () => onChange([...lines, { category:"", amount:"" }]);

  // Fill the form from the open charges: one line per category, at the open amount.
  const fillOpen = () => onChange(open.map(o => ({ category:o.category, amount:centsToDecimal(o.cents) })));

  return (
    <div style={{ marginBottom:12 }}>
      {open.length>0&&(
        <div style={{ background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",marginBottom:12 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:6 }}>
            <div style={labelStyle}>Open charges</div>
            <button type="button" onClick={fillOpen} style={{ background:"none",border:"none",color:C.gold,fontSize:12,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",padding:0 }}>Use these amounts</button>
          </div>
          {open.map(o=>(
            <div key={o.category} style={{ display:"flex",justifyContent:"space-between",fontSize:12,color:C.textSub,padding:"2px 0" }}>
              <span>{o.category}</span><span style={{ fontVariantNumeric:"tabular-nums" }}>{fmtCents(o.cents)}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 130px 24px",gap:8,marginBottom:5 }}>
        <div style={labelStyle}>Payment for *</div><div style={labelStyle}>Amount *</div><div/>
      </div>
      {lines.map((l,i)=>(
        <div key={i} style={{ display:"grid",gridTemplateColumns:"1fr 130px 24px",gap:8,marginBottom:8,alignItems:"center" }}>
          <select aria-label="Payment for" value={l.category} onChange={e=>set(i,"category",e.target.value)} style={field}>
            <option value="">Select…</option>
            {PAYMENT_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.value}</option>)}
          </select>
          <input aria-label="Amount" inputMode="decimal" value={l.amount} onChange={e=>set(i,"amount",e.target.value)} placeholder="$0.00" style={field}/>
          {lines.length>1
            ? <button type="button" aria-label="Remove line" onClick={()=>remove(i)} style={{ background:"none",border:"none",color:C.textSub,cursor:"pointer",fontSize:14 }}>✕</button>
            : <span/>}
        </div>
      ))}
      <button type="button" onClick={add} style={{ background:"none",border:"none",color:C.gold,fontSize:12,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",padding:0 }}>+ Add another category</button>
      <div style={{ fontSize:11,color:C.textSub,marginTop:6,lineHeight:1.5 }}>You are recording money received offline. Each line applies only to charges of its category. Online Pay Rent payments arrive through Stripe and apply to Rent only; late fees are paid offline for now.</div>
    </div>
  );
}
