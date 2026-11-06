import { useState } from "react";
import { supabase } from "./supabase";
import { fmtCents, paymentCents, parseDollarsToCents, todayNY, isCollected } from "./lib/accounting";
import { A3_ENABLED } from "./lib/release";

const C = {
  surface:"#14181F", raised:"#1A1F29", border:"rgba(255,255,255,0.08)", text:"#EDEAE2", textSub:"#9095A0",
  textMuted:"#5C6270", gold:"#C9A96E", goldDim:"#6B4F24", red:"#E05555",
};
const field = { width:"100%",padding:"9px 11px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,background:C.raised,color:C.text,outline:"none",fontFamily:"'DM Sans',sans-serif",colorScheme:"dark" };
const small = (color, border) => ({ background:"transparent",border:`1px solid ${border}`,color,fontSize:11,padding:"3px 8px",borderRadius:6,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",marginRight:6,whiteSpace:"nowrap" });

// A2.5: void a manual receipt entered in error, or record a refund of one. The row is always kept and
// the database posts the journal entries. Stripe receipts are refunded in Stripe; the webhook records them.
export default function PaymentActions({ payment, refundedCents = 0, onDone }) {
  const [mode, setMode]       = useState(null);   // "void" | "refund"
  const [reason, setReason]   = useState("");
  const [amount, setAmount]   = useState("");
  const [date, setDate]       = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  if (!("voided_at" in (payment || {}))) return null;   // receivables not installed yet
  if (!isCollected(payment)) return null;
  if (payment.stripe_payment_intent_id) {
    return <span title={A3_ENABLED ? "Adjust a tenant with a rental credit from their ledger. Stripe reports returned payments to Modus automatically." : "Refund this payment in Stripe. Stripe reports the refund to Modus, and it posts automatically."} style={{ fontSize:11,color:C.textMuted }}>Via Stripe</span>;
  }
  const remaining = paymentCents(payment) - refundedCents;
  const isRent = String(payment.category || "").trim().toLowerCase() === "rent";
  const today = todayNY();

  function open(m) { setMode(m); setReason(""); setAmount(""); setDate(""); setError(""); }

  async function submit() {
    setError("");
    if (!reason.trim()) { setError("Enter a reason."); return; }
    let call;
    if (mode === "void") {
      call = supabase.rpc("a2_void_payment", { p_payment: payment.id, p_reason: reason.trim() });
    } else if (mode === "returned") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError("Enter the date the payment came back."); return; }
      if (date > today) { setError("A return can't be dated in the future."); return; }
      call = supabase.rpc("a3_record_payment_return", { p_payment: payment.id, p_returned_on: date, p_reason: reason.trim() });
    } else {
      const cents = parseDollarsToCents(amount);
      if (cents == null) { setError("Enter an amount greater than $0 (up to 2 decimals)."); return; }
      if (cents > remaining) { setError(`The most that can be refunded is ${fmtCents(remaining)}.`); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError("Enter the date the refund was paid."); return; }
      if (date > today) { setError("A refund can't be dated in the future."); return; }
      call = supabase.rpc("a2_record_refund", { p_payment: payment.id, p_amount_cents: cents, p_refunded_on: date, p_reason: reason.trim() });
    }
    setSaving(true);
    const { error: err } = await call;
    setSaving(false);
    if (err) { setError(err.message); return; }
    setMode(null);
    onDone?.();
  }

  return (
    <>
      {/* With A3, rent adjustments are rental credits, so its refunds are for deposits and other non-rent money. */}
      {(A3_ENABLED ? remaining > 0 && !isRent : remaining > 0) && <button style={small(C.textSub, C.border)} onClick={()=>open("refund")}>Refund</button>}
      {A3_ENABLED && refundedCents === 0 && <button style={small(C.textSub, C.border)} onClick={()=>open("returned")}>Returned</button>}
      <button style={small(C.red, "rgba(224,85,85,0.25)")} onClick={()=>open("void")}>Void</button>
      {mode&&(
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }} onClick={()=>setMode(null)}>
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,width:420,maxWidth:"100%" }} onClick={e=>e.stopPropagation()}>
            <div style={{ padding:"18px 22px 14px",borderBottom:`1px solid ${C.border}`,fontSize:15,fontWeight:600,color:C.text }}>
              {mode==="void"?"Void payment":mode==="returned"?"Payment returned":"Record refund"} · {fmtCents(paymentCents(payment))}
            </div>
            <div style={{ padding:"16px 22px",display:"grid",gap:12,fontSize:12,color:C.textSub,lineHeight:1.6 }}>
              {mode==="void"
                ? <div>Use this for a payment entered by mistake. The record stays in history, its journal entry is reversed, and it leaves the tenant's balance.</div>
                : mode==="returned" ? <div>Use this when a check or bank payment came back unpaid. The payment still shows as collected before this date. From this date the rent and Modus's 5% reverse, and the charges it paid reopen.</div>
                : <div>Use this when money went back to the tenant. It posts on the refund date, reduces income in that period, and raises the tenant's balance. Up to {fmtCents(remaining)} can be refunded.</div>}
              {error&&<div style={{ color:C.red }}>{error}</div>}
              {mode==="returned"&&<input aria-label="Return date" type="date" max={today} value={date} onChange={e=>setDate(e.target.value)} style={field}/>}
              {mode==="refund"&&(
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                  <input aria-label="Refund amount" inputMode="decimal" placeholder="$0.00" value={amount} onChange={e=>setAmount(e.target.value)} style={field}/>
                  <input aria-label="Refund date" type="date" max={today} value={date} onChange={e=>setDate(e.target.value)} style={field}/>
                </div>
              )}
              <input aria-label="Reason" placeholder={mode==="void"?"Reason, e.g. entered twice":mode==="returned"?"Reason, e.g. insufficient funds":"Reason, e.g. overpayment returned"} value={reason} onChange={e=>setReason(e.target.value)} style={field}/>
            </div>
            <div style={{ padding:"12px 22px 16px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10,justifyContent:"flex-end" }}>
              <button style={small(C.textSub, C.border)} onClick={()=>setMode(null)}>Cancel</button>
              <button style={small(C.gold, C.goldDim)} disabled={saving} onClick={submit}>{saving?"Saving…":mode==="void"?"Void payment":mode==="returned"?"Record return":"Record refund"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
