import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useTenant } from "./useTenant";
import TenantLayout from "./TenantLayout";
import { ledgerToActivity } from "./lib/accounting";
import { fetchTenantLedger, balancePresentation, monthlyChargesSummary, paymentRecordsView, formatCents } from "./lib/tenantFinancials";

const C = {
  bg:"#F5F3EE",surface:"#FFFFFF",raised:"#F8F7F4",border:"#E4E1DA",
  text:"#18181B",textSub:"#52525B",textMuted:"#6B6B73",
  gold:"#7A5C12",goldBg:"#FBF6EC",goldDim:"#C9A96E",blue:"#1D4ED8",green:"#15803D",red:"#B91C1C",amber:"#92400E",
};

function fmt(n) {
  const v = Math.abs(Number(n));
  return `$${v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
}

const cardLabel = { fontSize:13,fontWeight:500,color:C.textMuted,marginBottom:8 };

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

  if (loading) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:C.bg,color:C.textMuted,fontFamily:"var(--m-font)",fontSize:14 }}>Loading…</div>;

  const isLedger = ledger?.mode === "ledger";
  const entries  = isLedger ? ledgerToActivity(ledger.rows) : [];
  const bal      = balancePresentation(ledger ? ledger.balance : { state: "loading" });
  const monthly  = monthlyChargesSummary(tenant?.recurringCharges);

  return (
    <TenantLayout tenantName={tenant?.name||"Tenant"}>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;}
        .a-card{background:${C.surface};border-radius:16px;box-shadow:0 1px 2px rgba(24,24,27,0.04),0 4px 16px rgba(24,24,27,0.04);}
        .ledger-row:hover{background:${C.raised}!important;}
        .a-row{display:grid;align-items:center;column-gap:16px;padding:14px 20px;border-top:1px solid ${C.border};font-size:14px;}
        .a-row:first-child{border-top:none;}
        .a-head{display:grid;column-gap:16px;padding:12px 20px;font-size:13px;font-weight:500;color:${C.textMuted};border-bottom:1px solid ${C.border};}
        .a-ledger{grid-template-columns:130px minmax(0,1fr) 110px 110px 120px;}
        .a-records{grid-template-columns:130px minmax(0,1fr) 110px 190px;}
        .a-num{text-align:right;font-variant-numeric:tabular-nums;}
        .a-mob{display:none;}
        @media(max-width:767px){
          .ledger-pad{padding:20px 16px 32px!important;}
          .a-head{display:none;}
          .a-row{grid-template-columns:minmax(0,1fr) auto!important;row-gap:4px;padding:14px 16px;}
          .a-date{order:3;font-size:13px!important;}
          .a-desc{order:1;}
          .a-main-num{order:2;}
          .a-status{order:4;text-align:right;}
          .ledger-col-hide{display:none!important;}
          .a-mob{display:inline;}
        }
      `}</style>

      <div className="ledger-pad" style={{ background:C.bg,minHeight:"100%",color:C.text,fontFamily:"var(--m-font)",padding:"32px 32px 72px",maxWidth:960,margin:"0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom:24 }}>
          <h1 style={{ fontFamily:"var(--m-font)",fontSize:"var(--m-fs-title)",fontWeight:600,color:C.text,lineHeight:1.2,margin:0 }}>Activity</h1>
          <div style={{ fontSize:14,color:C.textSub,marginTop:4 }}>Your payment history</div>
        </div>

        {/* Summary: the actual balance (or why it's unavailable), then the scheduled monthly charges */}
        <div style={{ display:"grid",gap:16,marginBottom:28,gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,260px),1fr))" }}>
          <div className="a-card" style={{ padding:"20px 22px" }}>
            <div style={cardLabel}>Current Balance</div>
            {bal.available ? (
              <div style={{ fontFamily:"var(--m-font)",fontSize:"var(--m-fs-stat)", fontVariantNumeric:"tabular-nums",fontWeight:600,color:bal.tone==="due"?C.red:bal.tone==="clear"?C.green:C.textSub }}>
                {ledger.balance.cents<0?"CR ":""}{bal.amountText}
              </div>
            ) : (
              <div data-balance-state={ledger ? ledger.balance.state : "loading"} style={{ fontSize:17,fontWeight:500,color:C.textSub,lineHeight:1.3 }}>{bal.amountText}</div>
            )}
            <div role={ledger && !bal.available ? "status" : undefined} style={{ fontSize:13,color:C.textMuted,marginTop:6,lineHeight:1.5 }}>{bal.detail}</div>
          </div>
          <div className="a-card" style={{ padding:"20px 22px" }}>
            <div style={cardLabel}>Monthly Recurring Charges</div>
            {monthly.hasCharges ? (
              <>
                <div style={{ fontFamily:"var(--m-font)",fontSize:"var(--m-fs-stat)", fontVariantNumeric:"tabular-nums",fontWeight:600,color:C.text }}>{formatCents(monthly.totalCents)}</div>
                <div style={{ fontSize:13,color:C.textMuted,marginTop:6 }}>
                  {monthly.items.map(i => `${i.label} ${i.cents == null ? "—" : formatCents(i.cents)}`).join(" · ")}
                </div>
                <div style={{ fontSize:13,color:C.textMuted,marginTop:2 }}>Scheduled each month. Not a balance due.</div>
              </>
            ) : (
              <div style={{ fontSize:14,color:C.textSub }}>No recurring charges are set up on your account.</div>
            )}
          </div>
        </div>

        {isLedger ? (
          <>
            {/* Receivables ledger: posted charges and payments with the running balance */}
            <div className="a-card" style={{ overflow:"hidden" }}>
              <div className="a-head a-ledger">
                <div>Date posted</div>
                <div>Description</div>
                <div className="a-num">Charges</div>
                <div className="a-num">Payment</div>
                <div className="a-num">Balance</div>
              </div>
              <div>
              {fetching ? (
                <div style={{ padding:"20px",textAlign:"center",color:C.textMuted,fontSize:14 }}>Loading ledger…</div>
              ) : entries.length === 0 ? (
                <div style={{ padding:"20px",textAlign:"center",color:C.textMuted,fontSize:14 }}>No posted activity yet.</div>
              ) : entries.map((e) => {
                const isCharge = e.type === "charge";
                const isPayment = e.type === "payment";
                const balColor = e.running_balance > 0 ? C.red : e.running_balance < 0 ? C.green : C.textSub;
                return (
                  <div key={e.id} className="a-row a-ledger ledger-row">
                    <div className="a-date" style={{ color:C.textSub,fontSize:13 }}>{fmtDate(e.posted_at)}{isCharge ? <span className="a-mob"> · charge {fmt(e.amount)}</span> : isPayment ? <span className="a-mob"> · payment {fmt(e.amount)}</span> : null}</div>
                    <div className="a-desc" style={{ fontWeight:500,color:C.text,minWidth:0,overflowWrap:"anywhere" }}>{e.description}</div>
                    <div className="a-num ledger-col-hide" style={{ color:isCharge?C.red:C.textMuted }}>{isCharge ? fmt(e.amount) : "—"}</div>
                    <div className="a-num ledger-col-hide" style={{ color:isPayment?C.green:C.textMuted }}>{isPayment ? fmt(e.amount) : "—"}</div>
                    <div className="a-num a-main-num" style={{ fontWeight:600,color:balColor }}>{e.running_balance<0?"CR ":""}{fmt(e.running_balance)}</div>
                  </div>
                );
              })}
              </div>
            </div>
            <div style={{ marginTop:14,fontSize:13,color:C.textMuted }}>
              A negative balance is a credit. Contact Modus Property Management with any discrepancies.
            </div>
          </>
        ) : (
          <>
            {/* No authoritative ledger: payment records exactly as recorded, with their status. No balance. */}
            <div style={{ fontSize:14,color:C.textSub,marginBottom:12,lineHeight:1.55 }}>
              Payment records on file. These are not a statement of your balance. Only records marked Paid were received.
            </div>
            <div className="a-card" style={{ overflow:"hidden" }}>
              <div className="a-head a-records">
                <div>Date</div>
                <div>Record</div>
                <div className="a-num">Amount</div>
                <div className="a-num">Status</div>
              </div>
              <div>
              {fetching || !records ? (
                <div style={{ padding:"20px",textAlign:"center",color:C.textMuted,fontSize:14 }}>Loading payment records…</div>
              ) : records.error ? (
                <div role="status" style={{ padding:"20px",textAlign:"center",color:C.textSub,fontSize:14 }}>We couldn't load your payment records. Refresh the page, or contact management.</div>
              ) : records.rows.length === 0 ? (
                <div style={{ padding:"20px",textAlign:"center",color:C.textMuted,fontSize:14 }}>No payment records on file.</div>
              ) : records.rows.map((r, i) => (
                <div key={r.id || i} className="a-row a-records ledger-row">
                  <div className="a-date" style={{ color:C.textSub,fontSize:13 }}>{fmtDate(r.date)}</div>
                  <div className="a-desc" style={{ fontWeight:500,color:C.text,minWidth:0,overflowWrap:"anywhere" }}>{r.description}</div>
                  <div className="a-num a-main-num" style={{ color:C.text }}>{r.cents == null ? "—" : formatCents(r.cents)}</div>
                  <div className="a-num a-status" style={{ fontSize:13,fontWeight:500,color:r.received?C.green:C.amber }}>{r.statusLabel}</div>
                </div>
              ))}
              </div>
            </div>
            <div style={{ marginTop:14,fontSize:13,color:C.textMuted }}>
              Questions about a record? Message management.
            </div>
          </>
        )}
      </div>
    </TenantLayout>
  );
}
