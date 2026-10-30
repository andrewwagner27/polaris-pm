import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe } from "@stripe/react-stripe-js";
import { supabase } from "./supabase";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";

const STRIPE_PK = "pk_live_51TeL65HdLm1v28bseS1dKN57CGx4WL4MK1aBoaSXTw7JGX2BG2K58bFR0ys4gCdjTCxnMsAExjdp7LtwsINYkqq500qtDctcti";
const stripePromise = loadStripe(STRIPE_PK);

const C = {
  bg:       "#F5F3EE",
  surface:  "#FFFFFF",
  raised:   "#F8F7F4",
  border:   "#E4E1DA",
  text:     "#18181B",
  textSub:  "#52525B",
  textMuted:"#A1A1AA",
  gold:     "#8B6914",
  goldBg:   "#FBF6EC",
  goldDim:  "#C9A96E",
  green:    "#15803D",
  red:      "#DC2626",
  amber:    "#92400E",
  blue:     "#1D4ED8",
};

function Spinner() {
  return <span style={{ width:16,height:16,border:"2px solid rgba(201,169,110,0.3)",borderTopColor:C.gold,borderRadius:"50%",display:"inline-block",animation:"spin 0.7s linear infinite" }}/>;
}

function LinkBankForm({ tenant, user, onLinked }) {
  const stripe = useStripe();
  const [step, setStep]   = useState("idle");
  const [error, setError] = useState("");

  async function linkBank() {
    if (!stripe) return;
    setStep("linking"); setError("");

    const { data, error: fnError } = await supabase.functions.invoke("create-setup-intent", {
      body: { tenant_id: tenant.id, customer_email: user.email, customer_name: tenant.name }
    });

    if (fnError || data?.error) {
      setError(fnError?.message || data?.error || "Failed to start bank link. Please try again.");
      setStep("idle"); return;
    }

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
        const bankName = pmData?.us_bank_account?.bank_name || "Bank account";
        const last4    = pmData?.us_bank_account?.last4     || "****";

        // Deactivate old methods first
        await supabase.from("tenant_payment_methods")
          .update({ status: "inactive" })
          .eq("tenant_id", tenant.id);

        // Save new method
        await supabase.from("tenant_payment_methods").upsert({
          tenant_id:                tenant.id,
          stripe_customer_id:       data.customer_id,
          stripe_payment_method_id: pmId,
          bank_name,
          last4,
          status: "active",
        });

        setStep("idle");
        onLinked({ bank_name: bankName, last4, stripe_customer_id: data.customer_id, stripe_payment_method_id: pmId, status: "active", tenant_id: tenant.id });
      }
    }
  }

  return (
    <div>
      {error && (
        <div style={{ background:"rgba(224,85,85,0.1)",border:`1px solid rgba(224,85,85,0.2)`,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13,color:C.red }}>
          {error}
        </div>
      )}
      {step === "linking" ? (
        <div style={{ display:"flex",alignItems:"center",gap:10,padding:"12px 0",color:C.textSub,fontSize:13 }}>
          <Spinner/> Connecting to your bank…
        </div>
      ) : (
        <button
          onClick={linkBank}
          style={{ width:"100%",padding:"12px",background:"rgba(139,105,20,0.10)",border:`1px solid ${C.gold}`,borderRadius:8,fontSize:13,fontWeight:500,color:C.gold,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.02em" }}
        >
          + Link new bank account
        </button>
      )}
    </div>
  );
}

function WalletContent({ tenant, user }) {
  const [methods,        setMethods]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [autopay,        setAutopay]        = useState(false);
  const [autopayLoading, setAutopayLoading] = useState(false);
  const [removing,       setRemoving]       = useState(null);
  const [showLink,       setShowLink]       = useState(false);
  const [successMsg,     setSuccessMsg]     = useState("");

  useEffect(() => {
    if (!tenant?.id) return;
    loadData();
  }, [tenant?.id]);

  async function loadData() {
    setLoading(true);
    const [methodsRes, tenantRes] = await Promise.all([
      supabase.from("tenant_payment_methods")
        .select("*")
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false }),
      supabase.from("tenants")
        .select("autopay_enabled")
        .eq("id", tenant.id)
        .single(),
    ]);
    setMethods(methodsRes.data || []);
    setAutopay(!!tenantRes.data?.autopay_enabled);
    setLoading(false);
  }

  async function removeMethod(method) {
    setRemoving(method.id);
    await supabase.from("tenant_payment_methods")
      .update({ status: "removed" })
      .eq("id", method.id);

    // If this was the active method and autopay was on, disable autopay
    if (method.status === "active" && autopay) {
      await supabase.from("tenants").update({ autopay_enabled: false }).eq("id", tenant.id);
      setAutopay(false);
    }

    setMethods(prev => prev.filter(m => m.id !== method.id));
    setRemoving(null);
  }

  async function setDefault(method) {
    // Deactivate all, then activate the selected one
    await supabase.from("tenant_payment_methods")
      .update({ status: "inactive" })
      .eq("tenant_id", tenant.id);
    await supabase.from("tenant_payment_methods")
      .update({ status: "active" })
      .eq("id", method.id);
    setMethods(prev => prev.map(m => ({ ...m, status: m.id === method.id ? "active" : (m.status === "active" ? "inactive" : m.status) })));
    setSuccessMsg("Default bank account updated.");
    setTimeout(() => setSuccessMsg(""), 3000);
  }

  async function toggleAutopay() {
    const activeMethod = methods.find(m => m.status === "active");
    if (!activeMethod && !autopay) {
      setSuccessMsg(""); return;
    }
    setAutopayLoading(true);
    const next = !autopay;
    await supabase.from("tenants").update({ autopay_enabled: next }).eq("id", tenant.id);
    setAutopay(next);
    setAutopayLoading(false);
    setSuccessMsg(next ? "Autopay enabled — rent will be paid automatically on the 1st." : "Autopay disabled.");
    setTimeout(() => setSuccessMsg(""), 4000);
  }

  function handleLinked(newMethod) {
    setMethods(prev => {
      const updated = prev.map(m => m.status === "active" ? { ...m, status: "inactive" } : m);
      return [newMethod, ...updated];
    });
    setShowLink(false);
    setSuccessMsg("Bank account linked successfully.");
    setTimeout(() => setSuccessMsg(""), 3000);
  }

  if (loading) return (
    <div style={{ textAlign:"center",padding:"60px 0",color:C.textSub,fontSize:13,display:"flex",flexDirection:"column",alignItems:"center",gap:12 }}>
      <Spinner/> Loading wallet…
    </div>
  );

  const activeMethods  = methods.filter(m => m.status === "active");
  const inactiveMethods = methods.filter(m => m.status === "inactive");

  return (
    <div>
      {/* Success banner */}
      {successMsg && (
        <div style={{ background:`${C.green}12`,border:`1px solid ${C.green}33`,borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13,color:C.green }}>
          ✓ {successMsg}
        </div>
      )}

      {/* ACH-only notice */}
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",marginBottom:20,display:"flex",alignItems:"flex-start",gap:12 }}>
        <div style={{ fontSize:18,flexShrink:0,marginTop:1 }}>🏦</div>
        <div>
          <div style={{ fontSize:12,fontWeight:600,color:C.text,marginBottom:3 }}>ACH bank accounts only</div>
          <div style={{ fontSize:11,color:C.textSub,lineHeight:1.6 }}>
            Modus accepts bank account payments via ACH transfer only. No credit cards or debit cards are accepted. ACH transfers are free and arrive in 2–3 business days.
          </div>
        </div>
      </div>

      {/* Active account */}
      {activeMethods.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10 }}>Default account</div>
          {activeMethods.map(method => (
            <div key={method.id} style={{ background:C.surface,border:`1px solid ${C.green}44`,borderRadius:10,padding:"14px 16px",display:"flex",alignItems:"center",gap:12,marginBottom:8 }}>
              <div style={{ width:40,height:40,borderRadius:9,background:`${C.green}18`,border:`1px solid ${C.green}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0 }}>🏦</div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:13,fontWeight:500,color:C.text,marginBottom:2 }}>{method.bank_name}</div>
                <div style={{ fontSize:11,color:C.textSub }}>Account ending ···· {method.last4}</div>
              </div>
              <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0 }}>
                <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",background:`${C.green}15`,color:C.green,borderRadius:5 }}>Default</span>
                <button
                  onClick={() => removeMethod(method)}
                  disabled={removing === method.id}
                  style={{ fontSize:10,color:C.red,background:"none",border:"none",cursor:"pointer",padding:0,opacity: removing === method.id ? 0.5 : 1 }}
                >
                  {removing === method.id ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Autopay toggle */}
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px",marginBottom:20 }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:13,fontWeight:500,color:C.text,marginBottom:2 }}>Autopay</div>
            <div style={{ fontSize:11,color:C.textSub }}>
              {autopay
                ? "Rent paid automatically on the 1st each month"
                : activeMethods.length > 0
                  ? "Auto-pay rent on the 1st using your default account"
                  : "Link a bank account to enable autopay"}
            </div>
          </div>
          <button
            onClick={toggleAutopay}
            disabled={autopayLoading || activeMethods.length === 0}
            style={{
              position:"relative",
              width:44, height:24,
              borderRadius:12,
              border:"none",
              cursor: (autopayLoading || activeMethods.length === 0) ? "not-allowed" : "pointer",
              background: autopay ? C.green : C.raised,
              transition:"background 0.2s",
              flexShrink:0,
              outline:"none",
              padding:0,
              opacity: activeMethods.length === 0 ? 0.4 : 1,
            }}
            aria-label={autopay ? "Disable autopay" : "Enable autopay"}
          >
            <span style={{
              position:"absolute",
              top:3, left: autopay ? 23 : 3,
              width:18, height:18,
              borderRadius:"50%",
              background:C.text,
              transition:"left 0.2s",
              display:"block",
            }}/>
          </button>
        </div>
        {autopay && (
          <div style={{ marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,fontSize:11,color:C.textMuted }}>
            ✓ Autopay active · Charges your default bank account on the 1st · Cancel anytime
          </div>
        )}
      </div>

      {/* Other saved accounts */}
      {inactiveMethods.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10 }}>Other accounts</div>
          {inactiveMethods.map(method => (
            <div key={method.id} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",display:"flex",alignItems:"center",gap:12,marginBottom:8 }}>
              <div style={{ width:40,height:40,borderRadius:9,background:`${C.blue}18`,border:`1px solid ${C.blue}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0 }}>🏦</div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:13,fontWeight:500,color:C.text,marginBottom:2 }}>{method.bank_name}</div>
                <div style={{ fontSize:11,color:C.textSub }}>Account ending ···· {method.last4}</div>
              </div>
              <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0 }}>
                <button
                  onClick={() => setDefault(method)}
                  style={{ fontSize:10,color:C.gold,background:"none",border:"none",cursor:"pointer",padding:0 }}
                >
                  Set default
                </button>
                <button
                  onClick={() => removeMethod(method)}
                  disabled={removing === method.id}
                  style={{ fontSize:10,color:C.red,background:"none",border:"none",cursor:"pointer",padding:0,opacity: removing === method.id ? 0.5 : 1 }}
                >
                  {removing === method.id ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {methods.length === 0 && !showLink && (
        <div style={{ textAlign:"center",padding:"32px 0",marginBottom:16 }}>
          <div style={{ width:56,height:56,borderRadius:"50%",background:`${C.blue}18`,border:`1px solid ${C.blue}33`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:24 }}>🏦</div>
          <div style={{ fontSize:14,fontWeight:500,color:C.text,marginBottom:6 }}>No bank accounts saved</div>
          <div style={{ fontSize:13,color:C.textSub,lineHeight:1.6 }}>
            Link a bank account to pay rent and enable autopay.
          </div>
        </div>
      )}

      {/* Link new account */}
      {showLink ? (
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px",marginBottom:12 }}>
          <div style={{ fontSize:12,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12 }}>Link bank account</div>
          <Elements stripe={stripePromise}>
            <LinkBankForm tenant={tenant} user={user} onLinked={handleLinked}/>
          </Elements>
          <button
            onClick={() => setShowLink(false)}
            style={{ width:"100%",padding:"10px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,color:C.textSub,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",marginTop:10 }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowLink(true)}
          style={{ width:"100%",padding:"12px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,color:C.textSub,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}
        >
          + Link new bank account
        </button>
      )}

      <div style={{ fontSize:11,color:C.textMuted,textAlign:"center",marginTop:20,lineHeight:1.7 }}>
        Bank connections are secured by Stripe · PCI DSS compliant<br/>
        ACH transfers only — no credit or debit cards accepted
      </div>
    </div>
  );
}

export default function Wallet() {
  const { tenant, user } = useTenant();

  return (
    <TenantLayout tenantName={tenant?.name}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:#F5F3EE;}
      `}</style>

      <div style={{ background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',sans-serif",padding:"32px 20px 64px" }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:600,color:C.text,marginBottom:4 }}>Wallet</div>
        <div style={{ fontSize:13,color:C.textSub,marginBottom:24 }}>Saved bank accounts &amp; autopay settings</div>

        {tenant?.id ? (
          <WalletContent tenant={tenant} user={user}/>
        ) : (
          <div style={{ textAlign:"center",padding:"60px 0",color:C.textSub,fontSize:13 }}>Loading…</div>
        )}
      </div>
    </TenantLayout>
  );
}
