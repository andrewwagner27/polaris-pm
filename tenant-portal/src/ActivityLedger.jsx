import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useTenant } from "./useTenant";
import TenantLayout from "./TenantLayout";

const C = {
  bg:"#0A0B0D",surface:"#111316",raised:"#181C21",border:"#252930",
  text:"#EDEAE2",textSub:"#9095A0",textMuted:"#5C6270",
  gold:"#C9A96E",goldDim:"#7A5C2E",blue:"#4A9AE8",green:"#72B02A",red:"#E05555",amber:"#F0A430",
};

function fmt(n) {
  const v = Math.abs(Number(n));
  return `$${v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
}

export default function ActivityLedger() {
  const { tenant, user, loading } = useTenant();
  const [entries, setEntries] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (tenant?.id) fetchLedger();
  }, [tenant?.id]);

  async function fetchLedger() {
    setFetching(true);

    // Try ledger_entries table first; fall back to payments table
    const { data: ledger, error: ledgerErr } = await supabase
      .from("ledger_entries")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("posted_at", { ascending: false });

    if (!ledgerErr && ledger && ledger.length > 0) {
      setEntries(buildLedger(ledger));
    } else {
      // Fallback: build from payments table
      const { data: payments } = await supabase
        .from("payments")
        .select("*")
        .eq("tenant_id", tenant.id)
        .order("paid_at", { ascending: false });
      setEntries(buildFromPayments(payments || [], tenant));
    }

    setFetching(false);
  }

  function buildLedger(rows) {
    let running = 0;
    // Sort ascending to compute running balance
    const sorted = [...rows].sort((a,b) => new Date(a.posted_at) - new Date(b.posted_at));
    const withBal = sorted.map(e => {
      if (e.type === "charge") running += Number(e.amount);
      else if (e.type === "payment" || e.type === "refund") running -= Number(e.amount);
      return { ...e, running_balance: running };
    });
    return withBal.reverse(); // newest first for display
  }

  function buildFromPayments(payments, tenant) {
    const recurringTotal = tenant?.recurringCharges?.length > 0
      ? tenant.recurringCharges.reduce((s, c) => s + parseFloat(c.amount || 0), 0)
      : 0;
    const rentAmount = recurringTotal > 0 ? recurringTotal : (tenant?.rent || 0);
    const rows = [];
    let running = 0;

    // Build synthetic charge + payment pairs from oldest
    const sorted = [...payments].sort((a,b) => new Date(a.paid_at||a.created_at) - new Date(b.paid_at||b.created_at));
    sorted.forEach(p => {
      const amount = (p.amount_cents || 0) / 100 || Number(p.amount) || rentAmount;
      // Charge row
      running += rentAmount;
      rows.push({ id: p.id+"_c", type:"charge", description:"Monthly Rent", amount: rentAmount, posted_at: p.paid_at||p.created_at, running_balance: running });
      // Payment row
      running -= amount;
      rows.push({ id: p.id+"_p", type:"payment", description:`Rent Payment${p.last4?" ("+p.last4+")":""}`, amount: amount, posted_at: p.paid_at||p.created_at, running_balance: running });
    });

    return rows.reverse();
  }

  if (loading) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:C.bg,color:C.textSub,fontFamily:"'DM Sans',sans-serif",fontSize:14 }}>Loading…</div>;

  const currentBalance = entries.length > 0 ? entries[0].running_balance : 0;

  return (
    <TenantLayout tenantName={tenant?.name||"Tenant"} unreadMessages={unread}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;}
        .ledger-row:hover{background:${C.raised}!important;}
        @media(max-width:767px){
          .ledger-pad{padding:16px!important;}
          .ledger-table{font-size:12px!important;}
          .ledger-col-hide{display:none!important;}
        }
      `}</style>

      <div className="ledger-pad" style={{ background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',sans-serif",padding:"36px 40px 80px",maxWidth:1000,margin:"0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom:28 }}>
          <div style={{ fontSize:12,color:C.textMuted,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6 }}>Payment History</div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:34,fontWeight:600,color:C.text,lineHeight:1 }}>Activity Ledger</div>
        </div>

        {/* Balance summary */}
        <div style={{ display:"flex",gap:14,marginBottom:24,flexWrap:"wrap" }}>
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 22px",flex:1,minWidth:140 }}>
            <div style={{ fontSize:10,fontWeight:600,color:C.textMuted,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6 }}>Current Balance</div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:30,fontWeight:600,color:currentBalance>0?C.red:currentBalance<0?C.green:C.textSub }}>
              {currentBalance<0?"CR ":""}{fmt(currentBalance)}
            </div>
            <div style={{ fontSize:11,color:C.textMuted,marginTop:4 }}>{currentBalance>0?"Amount due":currentBalance<0?"Credit on account":"Account current"}</div>
          </div>
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 22px",flex:1,minWidth:140 }}>
            <div style={{ fontSize:10,fontWeight:600,color:C.textMuted,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6 }}>Monthly Rent</div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:30,fontWeight:600,color:C.gold }}>${((tenant?.recurringCharges?.length > 0 ? tenant.recurringCharges.reduce((s,c)=>s+parseFloat(c.amount||0),0) : tenant?.rent)||0).toLocaleString()}</div>
            <div style={{ fontSize:11,color:C.textMuted,marginTop:4 }}>Due 1st of each month</div>
          </div>

        </div>

        {/* Ledger table */}
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>

          {/* Table header */}
          <div className="ledger-table" style={{ display:"grid",gridTemplateColumns:"140px 1fr 120px 120px 130px",gap:0,borderBottom:`1px solid ${C.border}`,padding:"12px 20px",background:C.raised,fontSize:11,fontWeight:600,color:C.textMuted,letterSpacing:"0.06em",textTransform:"uppercase" }}>
            <div>Date Posted</div>
            <div>Description</div>
            <div className="ledger-col-hide" style={{ textAlign:"right" }}>Charges</div>
            <div className="ledger-col-hide" style={{ textAlign:"right" }}>Payment</div>
            <div style={{ textAlign:"right" }}>Balance</div>
          </div>

          {fetching ? (
            <div style={{ padding:"40px",textAlign:"center",color:C.textMuted,fontSize:13 }}>Loading ledger…</div>
          ) : entries.length === 0 ? (
            <div style={{ padding:"40px",textAlign:"center",color:C.textMuted,fontSize:13 }}>No transactions yet.</div>
          ) : entries.map((e, i) => {
            const isCharge = e.type === "charge";
            const isPayment = e.type === "payment" || e.type === "credit";
            const isRefund = e.type === "refund" || e.type === "deposit_return";
            const balColor = e.running_balance > 0 ? C.red : e.running_balance < 0 ? C.green : C.textSub;

            return (
              <div key={e.id} className="ledger-table ledger-row"
                style={{ display:"grid",gridTemplateColumns:"140px 1fr 120px 120px 130px",gap:0,padding:"13px 20px",borderBottom:i<entries.length-1?`1px solid ${C.border}`:"none",transition:"background 0.1s",alignItems:"center",fontSize:13 }}>
                <div style={{ color:C.textSub,fontSize:12 }}>{fmtDate(e.posted_at)}</div>
                <div>
                  <div style={{ fontWeight:500,color:C.text }}>{e.description || (isCharge?"Monthly Rent":isRefund?"Refund":"Payment")}</div>
                  {e.memo&&<div style={{ fontSize:11,color:C.textMuted,marginTop:1 }}>{e.memo}</div>}
                </div>
                <div className="ledger-col-hide" style={{ textAlign:"right",color:isCharge?C.red:C.textMuted,fontWeight:isCharge?500:400 }}>
                  {isCharge ? fmt(e.amount) : "—"}
                </div>
                <div className="ledger-col-hide" style={{ textAlign:"right",color:isPayment||isRefund?C.green:C.textMuted,fontWeight:isPayment||isRefund?500:400 }}>
                  {isPayment||isRefund ? fmt(e.amount) : "—"}
                </div>
                <div style={{ textAlign:"right",fontWeight:600,color:balColor }}>
                  {e.running_balance<0?"CR ":""}{fmt(e.running_balance)}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop:16,fontSize:11,color:C.textMuted,textAlign:"right" }}>
          Negative balance indicates a credit. Contact Modus Property Management with any discrepancies.
        </div>
      </div>
    </TenantLayout>
  );
}
