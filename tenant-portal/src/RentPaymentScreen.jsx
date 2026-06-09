import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe } from "@stripe/react-stripe-js";
import { supabase } from "./supabase";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";

const STRIPE_PK = "pk_live_51TeL65HdLm1v28bseS1dKN57CGx4WL4MK1aBoaSXTw7JGX2BG2K58bFR0ys4gCdjTCxnMsAExjdp7LtwsINYkqq500qtDctcti";
const stripePromise = loadStripe(STRIPE_PK);

const C = {
  bg:        "#0A0B0D",
  surface:   "#111316",
  raised:    "#181C21",
  border:    "#252930",
  text:      "#EDEAE2",
  textSub:   "#9095A0",
  textMuted: "#5C6270",
  gold:      "#C9A96E",
  goldDim:   "#7A5C2E",
  green:     "#72B02A",
  red:       "#E05555",
  amber:     "#F0A430",
  blue:      "#4A9AE8",
};

function Spinner() {
  return <span style={{ width:16,height:16,border:"2px solid rgba(201,169,110,0.3)",borderTopColor:C.gold,borderRadius:"50%",display:"inline-block",animation:"spin 0.7s linear infinite" }}/>;
}

function ACHForm({ tenant, user, rentAmount }) {
  console.log("ACHForm rendered", { tenantId: tenant?.id, unitId: tenant?.unit_id, rent: rentAmount });
  const stripe   = useStripe();
  const navigate = useNavigate();

  const [step,            setStep]            = useState("idle");
  const [error,           setError]           = useState("");
  const [clientSecret,    setClientSecret]    = useState("");
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

    if (fnError || data?.error) {
      setError(fnError?.message || data?.error);
      setStep("idle"); return;
    }

    setClientSecret(data.client_secret);
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

        setStep("linked");
      }
    }
  }

  async function payNow() {
    const pmId   = paymentMethodId || savedMethod?.stripe_payment_method_id;
    const custId = customerId      || savedMethod?.stripe_customer_id;
    console.log("payNow called", { tenantId: tenant?.id, unitId: tenant?.unit_id, pmId, custId, rentAmount });
    setStep("paying"); setError("");

    const { data, error: fnError } = await supabase.functions.invoke("create-payment-intent", {
      body: {
        tenant_id:         tenant.id,
        unit_id:           tenant.unit_id,
        amount_cents:      rentAmount * 100,
        payment_method_id: pmId,
        customer_id:       custId,
      }
    });

    console.log("create-payment-intent response", { data, fnError });

    if (fnError || data?.error) {
      setError(fnError?.message || data?.error);
      setStep(savedMethod ? "idle" : "linked"); return;
    }

    setStep("success");
  }

  if (loadingMethod) return (
    <div style={{ textAlign:"center",padding:"40px 0",color:C.textSub,fontSize:13 }}>Loading…</div>
  );

  if (step === "success") return (
    <div style={{ textAlign:"center",padding:"32px 0" }}>
      <div style={{ width:64,height:64,borderRadius:"50%",background:`${C.green}18`,border:`1px solid ${C.green}33`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px",fontSize:26,color:C.green }}>✓</div>
      <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:C.text,marginBottom:6 }}>Payment submitted</div>
      <div style={{ fontSize:13,color:C.textSub,marginBottom:6 }}>${rentAmount.toLocaleString()} via ACH bank transfer</div>
      <div style={{ fontSize:12,color:C.textMuted,marginBottom:28 }}>ACH transfers take 2–3 business days to settle.</div>
      <button onClick={()=>navigate("/home")} style={{ padding:"11px 28px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,color:C.textSub,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
        ← Back to home
      </button>
    </div>
  );

  return (
    <div>
      {error&&(
        <div style={{ background:"rgba(224,85,85,0.1)",border:`1px solid rgba(224,85,85,0.2)`,borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13,color:C.red }}>{error}</div>
      )}

      {savedMethod&&step==="idle"&&(
        <>
          <div style={{ background:C.raised,border:`1px solid ${C.border}`,borderRadius:9,padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12 }}>
            <div style={{ width:38,height:38,borderRadius:8,background:`${C.green}18`,border:`1px solid ${C.green}33`,display:"flex",alignItems:"center",justifyContent:"center",color:C.green,fontSize:16 }}>🏦</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13,fontWeight:500,color:C.text }}>{savedMethod.bank_name}</div>
              <div style={{ fontSize:11,color:C.textSub }}>Account ending ···· {savedMethod.last4}</div>
            </div>
            <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",background:`${C.green}15`,color:C.green,borderRadius:5 }}>Linked</span>
          </div>
          <button onClick={payNow} style={{ width:"100%",padding:"13px",background:C.goldDim,border:"none",borderRadius:8,fontSize:14,fontWeight:500,color:C.text,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.02em",marginBottom:10 }}>
            Pay ${rentAmount.toLocaleString()} →
          </button>
          <button onClick={()=>{ setSavedMethod(null); setStep("idle"); }} style={{ width:"100%",padding:"10px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,color:C.textSub,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
            Use a different bank account
          </button>
        </>
      )}

      {!savedMethod&&step==="idle"&&(
        <div style={{ textAlign:"center",padding:"16px 0" }}>
          <div style={{ width:52,height:52,borderRadius:"50%",background:`${C.blue}18`,border:`1px solid ${C.blue}33`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:22 }}>🏦</div>
          <div style={{ fontSize:14,fontWeight:500,color:C.text,marginBottom:8 }}>Link your bank account</div>
          <div style={{ fontSize:13,color:C.textSub,lineHeight:1.6,marginBottom:24 }}>
            Connect your bank via ACH for free transfers.<br/>No fees — funds arrive in 2–3 business days.
          </div>
          <button onClick={linkBank} style={{ width:"100%",padding:"13px",background:C.goldDim,border:"none",borderRadius:8,fontSize:14,fontWeight:500,color:C.text,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.02em" }}>
            Link bank account →
          </button>
        </div>
      )}

      {step==="linking"&&(
        <div style={{ textAlign:"center",padding:"32px 0",color:C.textSub,fontSize:13,display:"flex",flexDirection:"column",alignItems:"center",gap:12 }}>
          <Spinner/><div>Connecting to your bank…</div>
        </div>
      )}

      {step==="linked"&&(
        <>
          <div style={{ background:`${C.green}0F`,border:`1px solid ${C.green}33`,borderRadius:9,padding:"14px 16px",marginBottom:20,display:"flex",alignItems:"center",gap:12 }}>
            <div style={{ color:C.green,fontSize:18 }}>✓</div>
            <div>
              <div style={{ fontSize:13,fontWeight:500,color:C.text }}>{bankName} ···· {last4}</div>
              <div style={{ fontSize:11,color:C.textSub }}>Bank account linked successfully</div>
            </div>
          </div>
          <button onClick={payNow} style={{ width:"100%",padding:"13px",background:C.goldDim,border:"none",borderRadius:8,fontSize:14,fontWeight:500,color:C.text,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.02em" }}>
            Pay ${rentAmount.toLocaleString()} →
          </button>
        </>
      )}

      {step==="paying"&&(
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
  const rentAmount = tenant?.rent || 1150;

  return (
    <TenantLayout tenantName={tenant?.name}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
      `}</style>

      <div style={{ background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',sans-serif",padding:"32px 20px 48px",maxWidth:580,margin:"0 auto" }}>

        <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:600,color:C.text,marginBottom:4 }}>Pay rent</div>
        <div style={{ fontSize:13,color:C.textSub,marginBottom:24 }}>
          {new Date().toLocaleDateString("en-US",{month:"long",year:"numeric"})}
        </div>

        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"20px 22px",marginBottom:20 }}>
          <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16 }}>
            <div>
              <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8 }}>Amount due</div>
              <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:38,fontWeight:600,color:C.gold,lineHeight:1 }}>
                ${rentAmount.toLocaleString()}
              </div>
              <div style={{ fontSize:12,color:C.textSub,marginTop:4 }}>
                Unit {tenant?.unit||"—"} · {tenant?.property||"—"}
              </div>
            </div>
            <span style={{ fontSize:10,fontWeight:600,padding:"4px 10px",background:"rgba(240,164,48,0.13)",color:C.amber,borderRadius:20 }}>Due 1st</span>
          </div>
          <div style={{ background:C.raised,borderRadius:7,padding:"10px 12px" }}>
            {[["Base rent",`$${(rentAmount-50).toLocaleString()}`],["Water / sewer","$50.00"]].map(([k,v])=>(
              <div key={k} style={{ display:"flex",justifyContent:"space-between",padding:"4px 0" }}>
                <span style={{ fontSize:12,color:C.textSub }}>{k}</span>
                <span style={{ fontSize:12,color:C.text }}>{v}</span>
              </div>
            ))}
            <div style={{ display:"flex",justifyContent:"space-between",borderTop:`1px solid ${C.border}`,marginTop:6,paddingTop:6 }}>
              <span style={{ fontSize:12,fontWeight:600,color:C.text }}>Total</span>
              <span style={{ fontSize:12,fontWeight:600,color:C.text }}>${rentAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"20px 22px" }}>
          <Elements stripe={stripePromise}>
            <ACHForm tenant={tenant} user={user} rentAmount={rentAmount}/>
          </Elements>
        </div>
      </div>
    </TenantLayout>
  );
}