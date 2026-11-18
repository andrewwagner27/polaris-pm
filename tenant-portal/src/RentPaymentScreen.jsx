import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe } from "@stripe/react-stripe-js";
import { supabase } from "./supabase";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";
import { A3_ENABLED } from "./lib/release";

const STRIPE_PK = "pk_live_51TeL65HdLm1v28bseS1dKN57CGx4WL4MK1aBoaSXTw7JGX2BG2K58bFR0ys4gCdjTCxnMsAExjdp7LtwsINYkqq500qtDctcti";
const stripePromise = loadStripe(STRIPE_PK);

const C = {
  bg:       "#F5F3EE",
  surface:  "#FFFFFF",
  raised:   "#F8F7F4",
  border:   "#EAE6DE",
  text:     "#18181B",
  textSub:  "#52525B",
  textMuted:"#6B6B73",
  gold:     "#7A5C12",
  goldBg:   "#FBF6EC",
  goldDim:  "#C9A96E",
  blue:     "#1D4ED8",
  green:    "#15803D",
  red:      "#B91C1C",
  amber:    "#92400E",
};

function Spinner() {
  return <span style={{ width:16,height:16,border:"2px solid rgba(201,169,110,0.3)",borderTopColor:C.gold,borderRadius:"50%",display:"inline-block",animation:"spin 0.7s linear infinite" }}/>;
}

const money = (cents) => {
  const n = Number(cents) || 0;
  return `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
};
const monthOf = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });

// Nothing collects rent automatically yet, so this is a notice and not a setting.
function AutopayUnavailable() {
  return (
    <div style={{ background:C.surface,borderRadius:16,boxShadow:"0 1px 2px rgba(24,24,27,0.04), 0 4px 16px rgba(24,24,27,0.04)",padding:"16px 20px",marginBottom:16 }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:12 }}>
        <div>
          <div style={{ fontSize:14,fontWeight:500,color:C.text,marginBottom:2 }}>Autopay</div>
          <div style={{ fontSize:13,color:C.textSub }}>Automatic payments aren't available yet. Rent is only paid when you submit it here.</div>
        </div>
        <span style={{ fontSize:12,fontWeight:500,padding:"4px 10px",background:C.raised,color:C.textSub,borderRadius:999,flexShrink:0 }}>Not available yet</span>
      </div>
    </div>
  );
}

function ACHForm({ tenant, user, payableCents, onAmountChanged }) {
  const stripe   = useStripe();
  const navigate = useNavigate();

  const [step,            setStep]            = useState("idle");
  const [error,           setError]           = useState("");
  const [customerId,      setCustomerId]      = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [bankName,        setBankName]        = useState("");
  const [last4,           setLast4]           = useState("");
  const [savedMethod,     setSavedMethod]     = useState(null);
  const [loadingMethod,   setLoadingMethod]   = useState(true);

  useEffect(() => {
    async function checkSaved() {
      if (!tenant?.id) { setLoadingMethod(false); return; }
      const { data } = await supabase.from("tenant_payment_methods")
        .select("*").eq("tenant_id", tenant.id).eq("status", "active").single();
      if (data) setSavedMethod(data);
      setLoadingMethod(false);
    }
    checkSaved();
  }, [tenant?.id]);

  async function linkBank() {
    if (!stripe) return;
    setStep("linking"); setError("");

    const { data, error: fnError } = await supabase.functions.invoke("create-setup-intent", {
      body: { tenant_id: tenant.id, customer_email: user.email, customer_name: tenant.name }
    });

    if (fnError || data?.error) { setError(fnError?.message || data?.error); setStep("idle"); return; }

    setCustomerId(data.customer_id);

    const { setupIntent, error: stripeError } = await stripe.collectBankAccountForSetup({
      clientSecret: data.client_secret,
      params: {
        payment_method_type: "us_bank_account",
        payment_method_data: { billing_details: { name: tenant.name, email: user.email } },
      },
    });

    if (stripeError) { setError(stripeError.message); setStep("idle"); return; }

    if (setupIntent?.status === "requires_confirmation") {
      const { setupIntent: confirmed, error: confirmError } = await stripe.confirmUsBankAccountSetup(data.client_secret);
      if (confirmError) { setError(confirmError.message); setStep("idle"); return; }

      const pm = confirmed?.payment_method;
      if (pm) {
        const pmId   = typeof pm === "string" ? pm : pm.id;
        const pmData = typeof pm === "object" ? pm : null;
        setPaymentMethodId(pmId);
        setBankName(pmData?.us_bank_account?.bank_name || "Bank account");
        setLast4(pmData?.us_bank_account?.last4 || "****");

        await supabase.from("tenant_payment_methods").upsert({
          tenant_id:                tenant.id,
          stripe_customer_id:       data.customer_id,
          stripe_payment_method_id: pmId,
          bank_name: pmData?.us_bank_account?.bank_name || "Bank",
          last4:     pmData?.us_bank_account?.last4 || "****",
          status:    "active",
        });

        setSavedMethod({
          tenant_id: tenant.id,
          stripe_customer_id: data.customer_id,
          stripe_payment_method_id: pmId,
          bank_name: pmData?.us_bank_account?.bank_name || "Bank",
          last4: pmData?.us_bank_account?.last4 || "****",
          status: "active",
        });

        setStep("linked");
      }
    }
  }

  async function payNow() {
    const pmId   = paymentMethodId || savedMethod?.stripe_payment_method_id;
    const custId = customerId      || savedMethod?.stripe_customer_id;
    setStep("paying"); setError("");

    const { data, error: fnError } = await supabase.functions.invoke("create-payment-intent", {
      body: {
        tenant_id:         tenant.id,
        unit_id:           tenant.unit_id,
        amount_cents:      payableCents,   // the server refuses anything but the ledger's own figure
        purpose:           "rent",   // explicit Pay Rent workflow → categorised as Rent server-side
        payment_method_id: pmId,
        customer_id:       custId,
      }
    });

    if (fnError || data?.error) {
      setError(fnError?.message || data?.error);
      setStep(savedMethod ? "idle" : "linked");
      onAmountChanged();
      return;
    }

    setStep("success");
  }

  if (loadingMethod) return (
    <div style={{ textAlign:"center",padding:"40px 0",color:C.textSub,fontSize:13 }}>Loading…</div>
  );

  if (step === "success") return (
    <div style={{ textAlign:"center",padding:"32px 0" }}>
      <div style={{ width:64,height:64,borderRadius:"50%",background:`${C.green}18`,border:`1px solid ${C.green}33`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px",fontSize:26,color:C.green }}>✓</div>
      <div style={{ fontFamily:"var(--m-font)",fontSize:"var(--m-fs-title)",fontWeight:600,color:C.text,marginBottom:6 }}>Payment submitted</div>
      <div style={{ fontSize:13,color:C.textSub,marginBottom:6 }}>{money(payableCents)} via ACH bank transfer</div>
      <div style={{ fontSize:12,color:C.textMuted,marginBottom:28 }}>ACH transfers take 2–3 business days to settle.</div>
      <button onClick={()=>navigate("/home")} style={{ padding:"11px 28px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,color:C.textSub,cursor:"pointer",fontFamily:"var(--m-font)" }}>
        ← Back to home
      </button>
    </div>
  );

  const effectiveSaved = savedMethod || (step === "linked" ? { bank_name: bankName, last4 } : null);

  return (
    <div>
      {error&&(
        <div style={{ background:"rgba(224,85,85,0.1)",border:`1px solid rgba(224,85,85,0.2)`,borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13,color:C.red }}>{error}</div>
      )}

      {effectiveSaved && step !== "linking" && step !== "paying" && (
        <>
          <div style={{ background:C.raised,border:`1px solid ${C.border}`,borderRadius:9,padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12 }}>
            <div style={{ width:38,height:38,borderRadius:8,background:`${C.green}18`,border:`1px solid ${C.green}33`,display:"flex",alignItems:"center",justifyContent:"center",color:C.green,fontSize:16 }}>🏦</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13,fontWeight:500,color:C.text }}>{effectiveSaved.bank_name}</div>
              <div style={{ fontSize:11,color:C.textSub }}>Account ending ···· {effectiveSaved.last4}</div>
            </div>
            <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",background:`${C.green}15`,color:C.green,borderRadius:5 }}>Linked</span>
          </div>
          <button onClick={payNow} disabled={!(payableCents > 0)} style={{ opacity:payableCents > 0 ? 1 : 0.5,width:"100%",padding:"13px",background:C.gold,border:"none",borderRadius:8,fontSize:14,fontWeight:500,color:C.text,cursor:"pointer",fontFamily:"var(--m-font)",letterSpacing:"0.02em",marginBottom:10 }}>
            Pay {money(payableCents)} →
          </button>
          {savedMethod && (
            <button onClick={()=>{ setSavedMethod(null); setStep("idle"); }} style={{ width:"100%",padding:"10px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,color:C.textSub,cursor:"pointer",fontFamily:"var(--m-font)" }}>
              Use a different bank account
            </button>
          )}
        </>
      )}

      {!effectiveSaved && step === "idle" && (
        <div style={{ textAlign:"center",padding:"16px 0" }}>
          <div style={{ width:52,height:52,borderRadius:"50%",background:`${C.blue}18`,border:`1px solid ${C.blue}33`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:22 }}>🏦</div>
          <div style={{ fontSize:14,fontWeight:500,color:C.text,marginBottom:8 }}>Link your bank account</div>
          <div style={{ fontSize:13,color:C.textSub,lineHeight:1.6,marginBottom:24 }}>
            Connect your bank via ACH for free transfers.<br/>No fees — funds arrive in 2–3 business days.
          </div>
          <button onClick={linkBank} style={{ width:"100%",padding:"13px",background:C.gold,border:"none",borderRadius:8,fontSize:14,fontWeight:500,color:C.text,cursor:"pointer",fontFamily:"var(--m-font)",letterSpacing:"0.02em" }}>
            Link bank account →
          </button>
        </div>
      )}

      {step === "linking" && (
        <div style={{ textAlign:"center",padding:"32px 0",color:C.textSub,fontSize:13,display:"flex",flexDirection:"column",alignItems:"center",gap:12 }}>
          <Spinner/><div>Connecting to your bank…</div>
        </div>
      )}

      {step === "paying" && (
        <div style={{ textAlign:"center",padding:"32px 0",color:C.textSub,fontSize:13,display:"flex",flexDirection:"column",alignItems:"center",gap:12 }}>
          <Spinner/><div>Submitting payment…</div>
        </div>
      )}

      <div style={{ fontSize:11,color:C.textMuted,textAlign:"center",marginTop:16 }}>
        ACH payments are free · Secured by Stripe · PCI DSS compliant
      </div>
    </div>
  );
}

export default function RentPaymentScreen() {
  const { tenant, user } = useTenant();
  const [due, setDue] = useState(null);   // from the tenant's ledger; null while loading

  async function loadDue() {
    const { data, error } = A3_ENABLED
      ? await supabase.rpc("a3_pay_rent_due", { p_tenant: tenant.id })
      : await supabase.rpc("a2_pay_rent_due", { p_tenant: tenant.id });
    setDue(error || !data ? { ledger_active: false } : data);   // no ledger figure, no online payment
  }

  useEffect(() => {
    if (tenant?.id) loadDue();
  }, [tenant?.id]);

  const payableCents = Number(due?.payable_cents) || 0;
  const pendingCents = Number(due?.pending_cents) || 0;
  const creditApplied = Number(due?.credit_applied_cents) || 0;
  const creditWaiting = Number(due?.credit_waiting_cents) || 0;
  const pastDueCents = Number(due?.past_due_cents) || 0;
  const rentLines = due?.rent_lines || [];
  const otherLines = due?.other_lines || [];

  return (
    <TenantLayout tenantName={tenant?.name}>
      <style>{`
        
        @keyframes spin { to { transform: rotate(360deg); } }
        @media(max-width:767px){.pay-wrap{padding:16px 14px 24px!important;}}
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
      `}</style>

      <div className="pay-wrap" style={{ background:C.bg,minHeight:"100%",color:C.text,fontFamily:"var(--m-font)",padding:"32px 24px 64px",maxWidth:720,margin:"0 auto" }}>

        <div style={{ fontFamily:"var(--m-font)",fontSize:"var(--m-fs-title)",fontWeight:600,color:C.text,marginBottom:4 }}>Pay rent</div>
        <div style={{ fontSize:14,color:C.textSub,marginBottom:24 }}>
          {new Date().toLocaleDateString("en-US",{month:"long",year:"numeric"})}
        </div>

        {/* Receivables not active: one short explanation instead of an empty amount and a repeated notice below it */}
        {due && !due.ledger_active && (
          <div role="status" style={{ background:C.surface,borderRadius:16,boxShadow:"0 1px 2px rgba(24,24,27,0.04), 0 4px 16px rgba(24,24,27,0.04)",padding:"20px 22px",marginBottom:14 }}>
            <div style={{ fontSize:16,fontWeight:600,color:C.text,marginBottom:6 }}>Online payment isn't available yet</div>
            <div style={{ fontSize:14,color:C.textSub,lineHeight:1.6 }}>
              There's no amount to pay here and nothing has been charged. Pay rent the way your lease describes, or message management with billing questions.
            </div>
            <div style={{ fontSize:13,color:C.textMuted,marginTop:12 }}>Unit {tenant?.unit||"—"} · {tenant?.property||"—"}</div>
          </div>
        )}

        {/* Amount summary */}
        {(!due || due.ledger_active) && (
        <div style={{ background:C.surface,borderRadius:16,boxShadow:"0 1px 2px rgba(24,24,27,0.04), 0 4px 16px rgba(24,24,27,0.04)",padding:"20px 22px",marginBottom:14 }}>
          <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between" }}>
            <div>
              <div style={{ fontSize:12,fontWeight:600,color:C.textSub,marginBottom:8 }}>Amount due</div>
              <div style={{ fontFamily:"var(--m-font)",fontSize:"var(--m-fs-stat)", fontVariantNumeric:"tabular-nums",fontWeight:600,color:C.gold,lineHeight:1 }}>
                {due?.ledger_active ? money(payableCents) : "—"}
              </div>
              {due?.ledger_active && payableCents===0 && <div style={{ fontSize:12,color:C.green,marginTop:6 }}>{pendingCents>0 ? `Your ${money(pendingCents)} payment is processing. Nothing more to pay right now.` : "Nothing to pay right now."}</div>}
              <div style={{ fontSize:12,color:C.textSub,marginTop:6 }}>
                Unit {tenant?.unit||"—"} · {tenant?.property||"—"}
              </div>
            </div>
            {payableCents>0&&<span style={{ fontSize:10,fontWeight:600,padding:"4px 10px",background:pastDueCents>0?"rgba(220,38,38,0.1)":"rgba(240,164,48,0.13)",color:pastDueCents>0?C.red:C.amber,borderRadius:20 }}>{pastDueCents>0?"Past due":"Due 1st"}</span>}
          </div>
          {due?.ledger_active && (rentLines.length>0 || pendingCents>0 || creditApplied>0 || creditWaiting>0 || otherLines.length>0) && (
            <div style={{ marginTop:16,paddingTop:14,borderTop:`1px solid ${C.border}`,fontSize:12,color:C.textSub,lineHeight:1.7 }}>
              {rentLines.map(l=>(
                <div key={l.charge_id} style={{ display:"flex",justifyContent:"space-between",gap:12 }}>
                  <span>{monthOf(l.due_date)} rent{l.past_due?" (past due)":""}{l.open_cents<l.amount_cents?` · ${money(l.amount_cents)} less ${money(l.amount_cents-l.open_cents)} already applied`:""}</span>
                  <span style={{ color:C.text }}>{money(l.open_cents)}</span>
                </div>
              ))}
              {pendingCents>0&&payableCents>0&&(
                <div style={{ display:"flex",justifyContent:"space-between",gap:12 }}><span>Payment still processing</span><span style={{ color:C.text }}>−{money(pendingCents)}</span></div>
              )}
              {creditApplied>0&&<div style={{ color:C.green }}>Includes a {money(creditApplied)} rental credit against this month's rent.</div>}
              {creditWaiting>0&&<div style={{ color:C.green }}>A {money(creditWaiting)} credit on your account will apply to your next rent charge.</div>}
              {otherLines.length>0&&(
                <div style={{ marginTop:8 }}>
                  <div style={{ fontWeight:600,color:C.text }}>Not included in this payment</div>
                  {otherLines.map(l=>(
                    <div key={l.category} style={{ display:"flex",justifyContent:"space-between",gap:12 }}><span>{l.category}{l.past_due?" (past due)":""}</span><span style={{ color:C.text }}>{money(l.open_cents)}</span></div>
                  ))}
                  <div style={{ color:C.textMuted,fontSize:11 }}>This screen pays rent only. Please pay these to your property manager.</div>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Autopay notice only where online payment exists at all (otherwise the card above already says so) */}
        {(!due || due.ledger_active) && <AutopayUnavailable/>}

        {/* Payment form (only where a payment can actually be made or its absence explained) */}
        {(!due || due.ledger_active) && (
        <div style={{ background:C.surface,borderRadius:16,boxShadow:"0 1px 2px rgba(24,24,27,0.04), 0 4px 16px rgba(24,24,27,0.04)",padding:"20px 22px" }}>
          {!due ? (
            <div style={{ textAlign:"center",padding:"20px 0",color:C.textSub,fontSize:13 }}>Loading…</div>
          ) : due.online_available === false ? (
            <div role="status" style={{ textAlign:"center",padding:"24px 8px",fontSize:13,lineHeight:1.6 }}>
              <div style={{ fontWeight:600,color:C.text,marginBottom:6 }}>Online payment isn't set up for your property yet</div>
              <div style={{ color:C.textSub }}>Your property manager is still finishing setup with our payment processor. Until then, please pay your rent to your property manager directly. Nothing has been charged.</div>
            </div>
          ) : (
            <Elements stripe={stripePromise}>
              <ACHForm tenant={tenant} user={user} payableCents={payableCents} onAmountChanged={loadDue}/>
            </Elements>
          )}
        </div>
        )}

        {/* Wallet link: only when online payment is actually available */}
        {due?.ledger_active && due.online_available !== false && (
          <div style={{ marginTop:12,textAlign:"center" }}>
            <a href="/wallet" style={{ display:"inline-flex",alignItems:"center",minHeight:44,fontSize:13,color:C.gold,textDecoration:"none" }}>
              Manage saved bank accounts →
            </a>
          </div>
        )}
      </div>
    </TenantLayout>
  );
}
