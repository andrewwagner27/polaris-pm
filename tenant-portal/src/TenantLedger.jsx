import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { CHARGE_CATEGORIES, fmtCents, parseDollarsToCents, ledgerBalanceCents, todayNY } from "./lib/accounting";
import { A3_ENABLED } from "./lib/release";

const C = {
  surface:"#14181F", raised:"#1A1F29", border:"rgba(255,255,255,0.08)", text:"#EDEAE2", textSub:"#9095A0",
  textMuted:"#5C6270", gold:"#C9A96E", goldDim:"#6B4F24", green:"#72B02A", red:"#E05555", amber:"#F0A430", blue:"#4A9AE8",
};
const field = { padding:"8px 10px",fontSize:12,border:`1px solid ${C.border}`,borderRadius:6,background:C.raised,color:C.text,outline:"none",fontFamily:"'DM Sans',sans-serif",colorScheme:"dark",minWidth:0 };
const btn = (color, border) => ({ background:"transparent",border:`1px solid ${border}`,color,fontSize:11,padding:"4px 9px",borderRadius:6,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" });
const th = (right) => ({ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",padding:"9px 12px",textAlign:right?"right":"left",borderBottom:`1px solid ${C.border}`,background:C.raised,whiteSpace:"nowrap" });
const td = (right, color) => ({ fontSize:13,color:color||C.textSub,padding:"9px 12px",borderBottom:`1px solid ${C.border}`,textAlign:right?"right":"left",fontVariantNumeric:"tabular-nums" });
const fmtDay = (d) => d ? new Date(`${String(d).slice(0,10)}T12:00:00`).toLocaleDateString("en-US",{ month:"short",day:"numeric",year:"numeric" }) : "—";
const STATUS_COLOR = { paid:C.green, received:C.green, open:C.amber, "partly paid":C.amber, void:C.textMuted, refunded:C.blue, credit:C.blue, "not yet due":C.textSub, returned:C.red };
const CHARGE_KINDS = new Set(["charge","late_fee","opening","rental_credit"]);

const nextMonthFirst = (d) => { const [y, m] = d.split("-").map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); };

// Landlord view of one tenant's receivables: real charges and receipts with a running balance.
export default function TenantLedger({ tenantId }) {
  const [status, setStatus]   = useState(null);
  const [rows, setRows]       = useState([]);
  const [open, setOpen]       = useState([]);
  const [history, setHistory] = useState([]);       // the stored application record
  const [applied, setApplied] = useState(null);    // { payment_id, rows }
  const [rev, setRev]         = useState(0);
  const [form, setForm]       = useState({ category:"Other", amount:"", due:todayNY(), memo:"" });
  const [msg, setMsg]         = useState(null);
  const [voiding, setVoiding] = useState(null);    // { id, reason }
  const [pin, setPin]         = useState(null);    // { payment_id, category, charge_id, amount, reason }
  const [credits, setCredits] = useState(null);    // { cash_overpayment_cents, rental_credit_cents, opening_credit_cents }
  const [creditForm, setCreditForm] = useState({ amount:"", from:"", reason:"" });

  useEffect(() => {
    let live = true;
    (async () => {
      const { data: s } = await supabase.rpc("a2_status");
      if (!live) return;
      setStatus(s || { active:false });
      if (s?.active) {
        const [{ data: l }, { data: o }, { data: h }, { data: cb }] = await Promise.all([
          supabase.rpc("a2_tenant_ledger", { p_tenant: tenantId }),
          supabase.rpc("a2_open_charges", { p_tenant: tenantId }),
          A3_ENABLED ? supabase.rpc("a3_application_history", { p_tenant: tenantId }) : Promise.resolve({ data: [] }),
          A3_ENABLED ? supabase.rpc("a3_credit_breakdown", { p_as_of: todayNY(), p_tenant: tenantId }) : Promise.resolve({ data: [] }),
        ]);
        if (live) { setRows(l || []); setOpen(o || []); setHistory(h || []); setCredits(cb?.[0] || null); }
      }
    })();
    return () => { live = false; };
  }, [tenantId, rev]);

  async function addCharge() {
    const cents = parseDollarsToCents(form.amount);
    if (cents == null) { setMsg({ ok:false, text:"Enter an amount greater than $0." }); return; }
    if (!form.due) { setMsg({ ok:false, text:"Enter the due date." }); return; }
    const { error } = await supabase.rpc("a2_add_charge", {
      p_tenant: tenantId, p_category: form.category, p_amount_cents: cents, p_due_date: form.due, p_memo: form.memo.trim() || null, p_opening: false,
    });
    setMsg(error ? { ok:false, text:error.message } : { ok:true, text:"Charge added. It affects the tenant's balance only; income is recognized when money is received." });
    if (!error) { setForm(f=>({ ...f, amount:"", memo:"" })); setRev(n=>n+1); }
  }

  // The normal way to adjust a tenant: no cash moves and nothing posts. It lowers the rent they owe from next month.
  async function issueCredit() {
    const cents = parseDollarsToCents(creditForm.amount);
    if (cents == null) { setMsg({ ok:false, text:"Enter a credit amount greater than $0." }); return; }
    if (!creditForm.reason.trim()) { setMsg({ ok:false, text:"Enter who authorized this credit and why." }); return; }
    const { error } = await supabase.rpc("a3_issue_rental_credit", { p_tenant: tenantId, p_amount_cents: cents, p_reason: creditForm.reason.trim(), p_applies_from: creditForm.from || null });
    setMsg(error ? { ok:false, text:error.message } : { ok:true, text:"Rental credit issued. It comes off next month's rent, not any older balance. No cash moved and nothing posts to the journal." });
    if (!error) { setCreditForm({ amount:"", from:"", reason:"" }); setRev(n=>n+1); }
  }

  async function confirmVoid() {
    if (!voiding.reason.trim()) { setMsg({ ok:false, text:"Enter a reason to void the charge." }); return; }
    const { error } = await supabase.rpc("a2_void_charge", { p_charge: voiding.id, p_reason: voiding.reason.trim() });
    setMsg(error ? { ok:false, text:error.message } : { ok:true, text:"Charge voided. It stays in the ledger and no longer counts toward the balance." });
    setVoiding(null);
    if (!error) setRev(n=>n+1);
  }

  async function savePin() {
    const cents = parseDollarsToCents(pin.amount);
    if (!pin.charge_id) { setMsg({ ok:false, text:"Choose the charge to apply this payment to." }); return; }
    if (cents == null) { setMsg({ ok:false, text:"Enter the amount to apply." }); return; }
    if (A3_ENABLED && !pin.reason?.trim()) { setMsg({ ok:false, text:"Enter why this payment is being re-applied." }); return; }
    const { error } = A3_ENABLED
      ? await supabase.rpc("a3_reapply", { p_payment: pin.payment_id, p_charge: pin.charge_id, p_amount_cents: cents, p_reason: pin.reason.trim() })
      : await supabase.rpc("a2_pin_application", { p_payment: pin.payment_id, p_charge: pin.charge_id, p_amount_cents: cents });
    setMsg(error ? { ok:false, text:error.message } : { ok:true, text:A3_ENABLED ? "Payment re-applied. The earlier application stays on record. Income and the journal don't change; only which charge it pays." : "Payment re-applied. Income and the journal don't change; only which charge it pays." });
    if (!error) { setPin(null); setApplied(null); setRev(n=>n+1); }
  }

  async function showApplied(paymentId) {
    if (applied?.payment_id === paymentId) { setApplied(null); return; }
    const { data, error } = await supabase.rpc("a2_payment_applications", { p_payment: paymentId });
    if (error) { setMsg({ ok:false, text:error.message }); return; }
    setApplied({ payment_id: paymentId, rows: data || [] });
  }

  async function undoReapply(paymentId, chargeId) {
    const { error } = await supabase.rpc("a2_unpin_application", { p_payment: paymentId, p_charge: chargeId });
    setMsg(error ? { ok:false, text:error.message } : { ok:true, text:"Re-application undone. The payment follows the standard order again: oldest open charge first." });
    if (!error) { setApplied(null); setRev(n=>n+1); }
  }

  async function reverseRefund(id) {
    const reason = window.prompt("Reason for reversing this refund? Use this only for a refund entered in error.");
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc("a2_reverse_refund", { p_refund: id, p_reason: reason.trim() });
    setMsg(error ? { ok:false, text:error.message } : { ok:true, text:"Refund reversed. Its journal entry is reversed and the row stays in the ledger." });
    if (!error) setRev(n=>n+1);
  }

  // Take back one stored application. The row stays; the money returns to the standard order.
  async function reverseApplication(h) {
    const reason = window.prompt(`Reason for reversing ${fmtCents(h.active_cents)} applied to ${h.charge_label}? The money returns to the standard order: oldest open charge, or credit.`);
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc("a3_reverse_application", { p_application: h.id, p_reason: reason.trim() });
    setMsg(error ? { ok:false, text:error.message } : { ok:true, text:"Application reversed. The earlier rows stay on record." });
    if (!error) { setApplied(null); setRev(n=>n+1); }
  }

  if (!status) return <div style={{ padding:32,textAlign:"center",color:C.textSub,fontSize:13 }}>Loading…</div>;
  if (!status.active) return (
    <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:32,textAlign:"center",color:C.textSub,fontSize:13 }}>
      The tenant ledger starts once receivables are activated in Financials → Receivables.
    </div>
  );

  const balance = ledgerBalanceCents(rows);
  const chargesFor = (category) => open.filter(c => c.category?.toLowerCase() === category?.toLowerCase() && Number(c.open_cents) > 0);

  return (
    <div>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,marginBottom:16,overflow:"hidden" }}>
        <div style={{ padding:"14px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:13,fontWeight:600,color:C.text }}>Tenant ledger</div>
            <div style={{ fontSize:12,color:C.textSub,marginTop:2 }}>Since {fmtDay(status.cutover_date)}. Payments apply to charges of the same category, oldest first.{A3_ENABLED?" Applications are stored permanently; corrections leave a record.":""}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:10,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.08em" }}>{balance<0?"Credit on account":"Balance"}</div>
            <div style={{ fontSize:20,fontWeight:600,color:balance>0?C.red:C.green,fontVariantNumeric:"tabular-nums" }}>{fmtCents(Math.abs(balance))}</div>
            {Number(credits?.rental_credit_cents)>0&&<div style={{ fontSize:11,color:C.textSub,marginTop:3 }}>After {fmtCents(credits.rental_credit_cents)} rental credit for future rent. {fmtCents(open.reduce((a,c)=>a+Number(c.open_cents||0),0))} is open now.</div>}
          </div>
        </div>
        {msg&&<div style={{ padding:"10px 16px",fontSize:12,color:msg.ok?C.green:C.red,borderBottom:`1px solid ${C.border}` }}>{msg.text}</div>}
        {credits&&(Number(credits.rental_credit_cents)>0||Number(credits.cash_overpayment_cents)>0||Number(credits.opening_credit_cents)>0)&&(
          <div style={{ padding:"10px 16px",fontSize:12,color:C.textSub,borderBottom:`1px solid ${C.border}`,display:"flex",gap:18,flexWrap:"wrap" }}>
            {Number(credits.rental_credit_cents)>0&&<span style={{ color:C.blue }}>Rental credit waiting: {fmtCents(credits.rental_credit_cents)} <span style={{ color:C.textMuted }}>(an adjustment, not money received)</span></span>}
            {Number(credits.cash_overpayment_cents)>0&&<span style={{ color:C.blue }}>Overpayment: {fmtCents(credits.cash_overpayment_cents)} <span style={{ color:C.textMuted }}>(cash received)</span></span>}
            {Number(credits.opening_credit_cents)>0&&<span style={{ color:C.blue }}>Opening credit: {fmtCents(credits.opening_credit_cents)}</span>}
          </div>
        )}
        {rows.length===0 ? <div style={{ padding:32,textAlign:"center",color:C.textSub,fontSize:13 }}>No charges or payments since the cutover.</div> : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead><tr><th style={th()}>Date</th><th style={th()}>Description</th><th style={th()}>Status</th><th style={th(true)}>Charge</th><th style={th(true)}>Payment</th><th style={th(true)}>Balance</th><th style={th()}></th></tr></thead>
              <tbody>
                {rows.map(r=>[
                  <tr key={`${r.ref_id}-${r.seq}`} style={{ opacity:r.status==="void"?0.55:1 }}>
                    <td style={td()}>{fmtDay(r.event_date)}</td>
                    <td style={td(false, C.text)}>{r.description}</td>
                    <td style={td(false, STATUS_COLOR[r.status])}>{r.status}{r.open_cents!=null&&r.status==="partly paid"?` · ${fmtCents(r.open_cents)} open`:""}</td>
                    <td style={td(true)}>{Number(r.charge_cents)?fmtCents(r.charge_cents):"—"}</td>
                    <td style={td(true)}>{Number(r.payment_cents)?fmtCents(r.payment_cents):"—"}</td>
                    <td style={td(true, C.text)}>{fmtCents(r.balance_cents)}</td>
                    <td style={td()}>
                      {CHARGE_KINDS.has(r.kind)&&r.status!=="void"&&<button style={btn(C.red,"rgba(224,85,85,0.25)")} onClick={()=>setVoiding({ id:r.ref_id, reason:"" })}>Void</button>}
                      {r.kind==="payment"&&<button style={{ ...btn(C.textSub,C.border),marginRight:6 }} onClick={()=>showApplied(r.ref_id)}>Applied to</button>}
                      {r.kind==="refund"&&r.status!=="void"&&!/Stripe/.test(r.description)&&<button style={btn(C.textSub,C.border)} onClick={()=>reverseRefund(r.ref_id)}>Reverse</button>}
                      {r.kind==="payment"&&chargesFor(r.category).length>0&&<button style={btn(C.textSub,C.border)} onClick={()=>setPin({ payment_id:r.ref_id, category:r.category, charge_id:"", amount:"", reason:"" })}>Re-apply</button>}
                    </td>
                  </tr>,
                  applied?.payment_id===r.ref_id&&r.kind==="payment"&&(
                    <tr key={`${r.ref_id}-applied`}><td colSpan={7} style={{ background:C.raised,padding:"10px 14px",borderBottom:`1px solid ${C.border}` }}>
                      {applied.rows.length===0 ? <div style={{ fontSize:12,color:C.textSub }}>Nothing left to apply; this payment was refunded.</div> : applied.rows.map((a,i)=>(
                        <div key={i} style={{ display:"flex",justifyContent:"space-between",gap:16,fontSize:12,color:C.textSub,padding:"3px 0" }}>
                          <span>{a.applied_to}{a.due_date?` · due ${fmtDay(a.due_date)}`:""}{a.re_applied?" · re-applied":""}</span>
                          <span style={{ display:"flex",alignItems:"center",gap:8 }}>
                            <span style={{ color:C.text,fontVariantNumeric:"tabular-nums" }}>{fmtCents(a.amount_cents)}</span>
                            {!A3_ENABLED&&a.re_applied&&<button style={btn(C.textSub,C.border)} onClick={()=>undoReapply(r.ref_id,a.charge_id)}>Undo re-apply</button>}
                          </span>
                        </div>
                      ))}
                      {history.some(h=>h.payment_id===r.ref_id)&&(
                        <div style={{ marginTop:10,borderTop:`1px solid ${C.border}`,paddingTop:8 }}>
                          <div style={{ fontSize:10,fontWeight:600,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6 }}>Application record</div>
                          {history.filter(h=>h.payment_id===r.ref_id).map(h=>(
                            <div key={h.id} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,fontSize:12,color:C.textSub,padding:"3px 0" }}>
                              <span>
                                <span style={{ color:h.kind==="reversal"?C.amber:C.green }}>{h.kind==="reversal"?"Reversed":"Applied"}</span> {h.kind==="reversal"?"from":"to"} {h.charge_label} · effective {fmtDay(h.effective_on)} · {h.event}
                                <span style={{ color:C.textMuted }}> · recorded {fmtDay(String(h.recorded_at).slice(0,10))} by {h.recorded_by}</span>
                              </span>
                              <span style={{ display:"flex",alignItems:"center",gap:8,flexShrink:0 }}>
                                <span style={{ color:C.text,fontVariantNumeric:"tabular-nums" }}>{h.kind==="reversal"?`(${fmtCents(h.amount_cents)})`:fmtCents(h.amount_cents)}</span>
                                {h.kind==="apply"&&Number(h.active_cents)>0&&<button style={btn(C.textSub,C.border)} onClick={()=>reverseApplication(h)}>Reverse</button>}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td></tr>
                  ),
                ])}
              </tbody>
            </table>
          </div>
        )}
        {voiding&&(
          <div style={{ display:"flex",gap:8,padding:"12px 16px",borderTop:`1px solid ${C.border}`,flexWrap:"wrap" }}>
            <input aria-label="Void reason" placeholder="Reason for voiding this charge" value={voiding.reason} onChange={e=>setVoiding(v=>({ ...v, reason:e.target.value }))} style={{ ...field,flex:1 }}/>
            <button style={btn(C.red,"rgba(224,85,85,0.25)")} onClick={confirmVoid}>Void charge</button>
            <button style={btn(C.textSub,C.border)} onClick={()=>setVoiding(null)}>Cancel</button>
          </div>
        )}
        {pin&&(
          <div style={{ display:"flex",gap:8,padding:"12px 16px",borderTop:`1px solid ${C.border}`,flexWrap:"wrap" }}>
            <select aria-label="Apply to charge" value={pin.charge_id} onChange={e=>setPin(p=>({ ...p, charge_id:e.target.value }))} style={{ ...field,flex:1 }}>
              <option value="">Apply this {pin.category} payment to…</option>
              {chargesFor(pin.category).map(c=><option key={c.charge_id} value={c.charge_id}>{c.period||c.category} · due {fmtDay(c.due_date)} · {fmtCents(c.open_cents)} open</option>)}
            </select>
            <input aria-label="Amount to apply" placeholder="$0.00" value={pin.amount} onChange={e=>setPin(p=>({ ...p, amount:e.target.value }))} style={{ ...field,width:110 }}/>
            {A3_ENABLED&&<input aria-label="Re-apply reason" placeholder="Why (kept on record)" value={pin.reason} onChange={e=>setPin(p=>({ ...p, reason:e.target.value }))} style={{ ...field,flex:1,minWidth:180 }}/>}
            <button style={btn(C.gold,C.goldDim)} onClick={savePin}>Apply</button>
            <button style={btn(C.textSub,C.border)} onClick={()=>setPin(null)}>Cancel</button>
          </div>
        )}
      </div>

      {A3_ENABLED&&<div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",marginBottom:16 }}>
        <div style={{ fontSize:13,fontWeight:600,color:C.text,marginBottom:4 }}>Issue rental credit</div>
        <div style={{ fontSize:12,color:C.textSub,marginBottom:10 }}>The way to adjust a tenant. It reduces next month's rent, and any remainder carries forward. Older balances stay open. No cash moves.</div>
        <div style={{ display:"flex",gap:8,flexWrap:"wrap",alignItems:"center" }}>
          <input aria-label="Credit amount" placeholder="$0.00" value={creditForm.amount} onChange={e=>setCreditForm(f=>({ ...f, amount:e.target.value }))} style={{ ...field,width:110 }}/>
          <input aria-label="Credit applies from" type="date" min={nextMonthFirst(todayNY())} title="First rent due date it applies to (blank = next month)" value={creditForm.from} onChange={e=>setCreditForm(f=>({ ...f, from:e.target.value }))} style={field}/>
          <input aria-label="Credit reason" placeholder="Who authorized it and why" value={creditForm.reason} onChange={e=>setCreditForm(f=>({ ...f, reason:e.target.value }))} style={{ ...field,flex:1,minWidth:160 }}/>
          <button style={btn(C.gold,C.goldDim)} onClick={issueCredit}>Issue credit</button>
        </div>
      </div>}

      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px" }}>
        <div style={{ fontSize:13,fontWeight:600,color:C.text,marginBottom:10 }}>Add one-time charge</div>
        <div style={{ display:"flex",gap:8,flexWrap:"wrap",alignItems:"center" }}>
          <select aria-label="Charge category" value={form.category} onChange={e=>setForm(f=>({ ...f, category:e.target.value }))} style={field}>
            {CHARGE_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.value}</option>)}
          </select>
          <input aria-label="Charge amount" placeholder="$0.00" value={form.amount} onChange={e=>setForm(f=>({ ...f, amount:e.target.value }))} style={{ ...field,width:110 }}/>
          <input aria-label="Charge due date" type="date" value={form.due} onChange={e=>setForm(f=>({ ...f, due:e.target.value }))} style={field}/>
          <input aria-label="Charge note" placeholder="Note (optional)" value={form.memo} onChange={e=>setForm(f=>({ ...f, memo:e.target.value }))} style={{ ...field,flex:1,minWidth:160 }}/>
          <button style={btn(C.gold,C.goldDim)} onClick={addCharge}>Add charge</button>
        </div>
      </div>
    </div>
  );
}
