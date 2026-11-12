import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useTenant } from "./useTenant";
import TenantLayout from "./TenantLayout";
import { ledgerToActivity } from "./lib/accounting";
import { fetchTenantLedger, balancePresentation, monthlyChargesSummary, paymentRecordsView, formatCents } from "./lib/tenantFinancials";

const C = {
  bg:"#F5F3EE",surface:"#FFFFFF",raised:"#F8F7F4",border:"#E4E1DA",
  text:"#18181B",textSub:"#52525B",textMuted:"#A1A1AA",
  gold:"#8B6914",goldBg:"#FBF6EC",goldDim:"#C9A96E",blue:"#1D4ED8",green:"#15803D",red:"#DC2626",amber:"#92400E",
};

function fmt(n) {
  const v = Math.abs(Number(n));
  return `$${v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
}

const cardLabel = { fontSize:10,fontWeight:600,color:C.textMuted,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6 };

export default function ActivityLedger() {
  const { tenant, loading } = useTenant();
  // ledger:  { mode: "ledger" | "legacy" | "error", balance, rows } from fetchTenantLedger — the same read Home uses.
  const [ledger, setLedger]   = useState(null);
  // Legacy payment records (receivables inactive or unreadable): { rows } or { error: true }. Records only, never a balance.
  const [records, setRecords] = useState(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (tenant?.id) fetchLedger();
  }, [tenant?.id]);

  async function fetchLedger() {
    setFetching(true);
    const result = await fetchTenantLedger(supabase);
    setLedger(result);
    if (result.mode !== "ledger") {
      // No authoritative ledger: list the payment records as they are. No charges are invented and no
      // balance is computed from them.
      const { data, error } = await supabase.from("payments").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false });
      setRecords(error ? { error: true } : { rows: paymentRecordsView(data) });
    } else {
      setRecords(null);
    }
    setFetching(false);
  }

  if (loading) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:C.bg,color:C.textMuted,fontFamily:"'DM Sans',sans-serif",fontSize:14 }}>Loading…</div>;

  const isLedger = ledger?.mode === "ledger";
  const entries  = isLedger ? ledgerToActivity(ledger.rows) : [];
  const bal      = balancePresentation(ledger ? ledger.balance : { state: "loading" });
  const monthly  = monthlyChargesSummary(tenant?.recurringCharges);

  return (
    <TenantLayout tenantName={tenant?.name||"Tenant"}>
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

        {/* Summary: the actual balance (or why it's unavailable), then the scheduled monthly charges */}
        <div style={{ display:"flex",gap:14,marginBottom:24,flexWrap:"wrap" }}>
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 22px",flex:1,minWidth:200 }}>
            <div style={cardLabel}>Current Balance</div>
            {bal.available ? (
              <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:30,fontWeight:600,color:bal.tone==="due"?C.red:bal.tone==="clear"?C.green:C.textSub }}>
                {ledger.balance.cents<0?"CR ":""}{bal.amountText}
              </div>
            ) : (
              <div data-balance-state={ledger ? ledger.balance.state : "loading"} style={{ fontSize:18,fontWeight:600,color:C.textSub,lineHeight:1.3 }}>{bal.amountText}</div>
            )}
            <div role={ledger && !bal.available ? "status" : undefined} style={{ fontSize:11,color:C.textMuted,marginTop:4 }}>{bal.detail}</div>
          </div>
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 22px",flex:1,minWidth:200 }}>
            <div style={cardLabel}>Monthly Recurring Charges</div>
            {monthly.hasCharges ? (
              <>
                <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:30,fontWeight:600,color:C.gold }}>{formatCents(monthly.totalCents)}</div>
                <div style={{ fontSize:11,color:C.textMuted,marginTop:4 }}>
                  {monthly.items.map(i => `${i.label} ${i.cents == null ? "—" : formatCents(i.cents)}`).join(" · ")}
                </div>
                <div style={{ fontSize:11,color:C.textMuted,marginTop:2 }}>Scheduled each month. Not a balance due.</div>
              </>
            ) : (
              <div style={{ fontSize:13,color:C.textSub }}>No recurring charges are set up on your account.</div>
            )}
          </div>
        </div>

        {isLedger ? (
          <>
            {/* Receivables ledger: posted charges and payments with the running balance */}
            <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
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
                <div style={{ padding:"40px",textAlign:"center",color:C.textMuted,fontSize:13 }}>No posted activity yet.</div>
              ) : entries.map((e, i) => {
                const isCharge = e.type === "charge";
                const isPayment = e.type === "payment";
                const balColor = e.running_balance > 0 ? C.red : e.running_balance < 0 ? C.green : C.textSub;
                return (
                  <div key={e.id} className="ledger-table ledger-row"
                    style={{ display:"grid",gridTemplateColumns:"140px 1fr 120px 120px 130px",gap:0,padding:"13px 20px",borderBottom:i<entries.length-1?`1px solid ${C.border}`:"none",transition:"background 0.1s",alignItems:"center",fontSize:13 }}>
                    <div style={{ color:C.textSub,fontSize:12 }}>{fmtDate(e.posted_at)}</div>
                    <div style={{ fontWeight:500,color:C.text }}>{e.description}</div>
                    <div className="ledger-col-hide" style={{ textAlign:"right",color:isCharge?C.red:C.textMuted,fontWeight:isCharge?500:400 }}>
                      {isCharge ? fmt(e.amount) : "—"}
                    </div>
                    <div className="ledger-col-hide" style={{ textAlign:"right",color:isPayment?C.green:C.textMuted,fontWeight:isPayment?500:400 }}>
                      {isPayment ? fmt(e.amount) : "—"}
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
          </>
        ) : (
          <>
            {/* No authoritative ledger: payment records exactly as recorded, with their status. No balance. */}
            <div style={{ fontSize:12,color:C.textSub,marginBottom:10,lineHeight:1.5 }}>
              Payment records on file. These are not a statement of your balance. Only records marked Paid were received.
            </div>
            <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
              <div className="ledger-table" style={{ display:"grid",gridTemplateColumns:"140px 1fr 120px 200px",gap:0,borderBottom:`1px solid ${C.border}`,padding:"12px 20px",background:C.raised,fontSize:11,fontWeight:600,color:C.textMuted,letterSpacing:"0.06em",textTransform:"uppercase" }}>
                <div>Date</div>
                <div>Record</div>
                <div style={{ textAlign:"right" }}>Amount</div>
                <div style={{ textAlign:"right" }}>Status</div>
              </div>

              {fetching || !records ? (
                <div style={{ padding:"40px",textAlign:"center",color:C.textMuted,fontSize:13 }}>Loading payment records…</div>
              ) : records.error ? (
                <div role="status" style={{ padding:"40px",textAlign:"center",color:C.textSub,fontSize:13 }}>We couldn't load your payment records. Refresh the page, or contact management.</div>
              ) : records.rows.length === 0 ? (
                <div style={{ padding:"40px",textAlign:"center",color:C.textMuted,fontSize:13 }}>No payment records on file.</div>
              ) : records.rows.map((r, i) => (
                <div key={r.id || i} className="ledger-table ledger-row"
                  style={{ display:"grid",gridTemplateColumns:"140px 1fr 120px 200px",gap:0,padding:"13px 20px",borderBottom:i<records.rows.length-1?`1px solid ${C.border}`:"none",transition:"background 0.1s",alignItems:"center",fontSize:13 }}>
                  <div style={{ color:C.textSub,fontSize:12 }}>{fmtDate(r.date)}</div>
                  <div style={{ fontWeight:500,color:C.text }}>{r.description}</div>
                  <div style={{ textAlign:"right",color:C.text }}>{r.cents == null ? "—" : formatCents(r.cents)}</div>
                  <div style={{ textAlign:"right",fontWeight:600,color:r.received?C.green:C.amber }}>{r.statusLabel}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:16,fontSize:11,color:C.textMuted,textAlign:"right" }}>
              Contact Modus Property Management to confirm your balance or with any discrepancies.
            </div>
          </>
        )}
      </div>
    </TenantLayout>
  );
}
