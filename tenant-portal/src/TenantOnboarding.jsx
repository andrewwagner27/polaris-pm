import { normalizeTenantPhone, passwordIssue, savedSetupStep } from "./lib/tenantSetup";
import { useState, useEffect, useId, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "./supabase";
import { inviteLinkState, LINK_MESSAGES } from "./lib/onboardingLink";
import { claimTenantRecord, CLAIM_MESSAGES } from "./lib/tenantClaim";
import { stripePromise } from "./lib/stripeClient";
import { Elements, useStripe } from "@stripe/react-stripe-js";

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

const ROOMS = [
  { id:"living_room", label:"Living Room" },
  { id:"kitchen",     label:"Kitchen" },
  { id:"bedroom",     label:"Bedroom" },
  { id:"bathroom",    label:"Bathroom" },
  { id:"exterior",    label:"Exterior / Entry" },
];

const CONDITIONS    = ["Good", "Fair", "Needs attention"];
const RELATIONSHIPS = ["Spouse / Partner", "Parent", "Sibling", "Friend", "Other"];

function Spinner() {
  return <span style={{ width:16,height:16,border:"2px solid rgba(201,169,110,0.3)",borderTopColor:C.gold,borderRadius:"50%",display:"inline-block",animation:"spin 0.7s linear infinite" }}/>;
}

function ModusMark({ size=32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M6 33V10L20 27L34 10V33" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 10L20 27L34 10" stroke={C.goldDim} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ContinueBtn({ onClick, loading, type="button", label="Continue →" }) {
  return (
    <button type={type} onClick={onClick} disabled={loading}
      style={{ width:"100%",padding:"12px",border:`1px solid ${C.goldDim}`,borderRadius:8,fontSize:14,fontWeight:500,background:loading?"rgba(201,169,110,0.07)":"transparent",color:C.gold,cursor:loading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"var(--m-font)",opacity:loading?0.7:1 }}>
      {loading?<><Spinner/> Saving…</>:label}
    </button>
  );
}

function InputField({ id: fieldId, label, value, onChange, type="text", placeholder, error, autoComplete, required }) {
  const generatedId = useId();
  const id = fieldId || generatedId;
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom:14 }}>
      <label htmlFor={id} style={{ fontSize:12,fontWeight:600,color:C.textSub,display:"block",marginBottom:6 }}>{label}</label>
      <input id={id} type={type} autoComplete={autoComplete} required={required} aria-invalid={error ? true : undefined} aria-describedby={error ? id + "-error" : undefined} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
        style={{ width:"100%",padding:"11px 14px",fontSize:14,border:`1px solid ${focused?C.gold:C.border}`,borderRadius:8,background:C.raised,color:C.text,outline:"none",boxSizing:"border-box",fontFamily:"var(--m-font)",transition:"border-color 0.15s",boxShadow:focused?`0 0 0 3px rgba(201,169,110,0.08)`:"none" }}/>
      {error && <p id={id + "-error"} role="alert" style={{ color:C.red, fontSize:12, marginTop:6 }}>{error}</p>}
    </div>
  );
}

function BankLinkStep({ linkedTenantId, bankLinked, bankName, bankLast4, onLinked, onContinue, loading }) {
  const stripe = useStripe();
  const [linkStep,  setLinkStep]  = useState("idle"); // idle | linking | linked
  const [linkError, setLinkError] = useState("");

  async function linkBank() {
    if (!stripe || !linkedTenantId) return;
    setLinkStep("linking"); setLinkError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;

    const { data, error: fnError } = await supabase.functions.invoke("create-setup-intent", {
      body: { tenant_id: linkedTenantId, customer_email: user?.email, customer_name: user?.user_metadata?.full_name || "" }
    });

    if (fnError || data?.error) {
      setLinkError(fnError?.message || data?.error || "Could not start bank linking. Please try again.");
      setLinkStep("idle");
      return;
    }

    const { setupIntent, error: stripeError } = await stripe.collectBankAccountForSetup({
      clientSecret: data.client_secret,
      params: {
        payment_method_type: "us_bank_account",
        payment_method_data: { billing_details: { name: user?.user_metadata?.full_name || "", email: user?.email || "" } },
      },
    });

    if (stripeError) { setLinkError(stripeError.message); setLinkStep("idle"); return; }

    if (setupIntent?.status === "requires_confirmation") {
      const { setupIntent: confirmed, error: confirmError } = await stripe.confirmUsBankAccountSetup(data.client_secret);
      if (confirmError) { setLinkError(confirmError.message); setLinkStep("idle"); return; }

      const pm     = confirmed?.payment_method;
      const pmId   = typeof pm === "string" ? pm : pm?.id;
      const pmData = typeof pm === "object" ? pm : null;
      const name   = pmData?.us_bank_account?.bank_name || "Bank account";
      const last4  = pmData?.us_bank_account?.last4     || "****";

      await supabase.from("tenant_payment_methods").upsert({
        tenant_id:                linkedTenantId,
        stripe_customer_id:       data.customer_id,
        stripe_payment_method_id: pmId,
        bank_name: name,
        last4,
        status: "active",
      });

      onLinked(name, last4);
      setLinkStep("linked");
    } else {
      // Bank requires micro-deposit verification — still counts as initiated
      setLinkStep("linked");
      onLinked("Bank account", "****");
    }
  }

  const C2 = { green:"#15803D", gold:"#7A5C12", goldDim:"#C9A96E", text:"#18181B", textSub:"#52525B", textMuted:"#6B6B73", border:"#EAE6DE", raised:"#F8F7F4", red:"#B91C1C" };

  return (
    <>
      <div style={{ fontFamily:"var(--m-font)",fontSize:"var(--m-fs-section)",fontWeight:600,color:C2.text,marginBottom:6 }}>Link your bank account</div>
      <div style={{ fontSize:14,color:C2.textSub,lineHeight:1.6,marginBottom:24 }}>Connect a bank account so you can pay rent online. This takes about a minute and uses bank-level security.</div>

      {linkError && <div role="alert" style={{ background:"rgba(224,85,85,0.1)",border:"1px solid rgba(224,85,85,0.2)",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13,color:C2.red }}>{linkError}</div>}

      {(bankLinked || linkStep === "linked") ? (
        <div style={{ background:`${C2.green}0F`,border:`1px solid ${C2.green}33`,borderRadius:10,padding:"16px 20px",marginBottom:24,display:"flex",alignItems:"center",gap:12 }}>
          <div style={{ width:40,height:40,borderRadius:9,background:`${C2.green}18`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18,color:C2.green }}>✓</div>
          <div>
            <div style={{ fontSize:14,fontWeight:600,color:C2.green,marginBottom:2 }}>Bank account linked</div>
            <div style={{ fontSize:13,color:C2.textSub }}>{bankName} {bankLast4 !== "****" ? `····${bankLast4}` : ""}</div>
          </div>
        </div>
      ) : (
        <div style={{ background:"#F8F7F4",border:"1px solid #EAE6DE",borderRadius:10,padding:"16px 20px",marginBottom:24 }}>
          <div style={{ fontSize:13,color:C2.textSub,marginBottom:14,lineHeight:1.5 }}>You'll be guided through securely connecting your bank. Most banks connect instantly via Plaid.</div>
          <button onClick={linkBank} disabled={linkStep === "linking" || !stripe}
            style={{ width:"100%",padding:"11px",border:`1px solid ${C2.goldDim}`,borderRadius:8,fontSize:14,fontWeight:500,background:"transparent",color:C2.gold,cursor:linkStep==="linking"?"not-allowed":"pointer",fontFamily:"var(--m-font)",display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:linkStep==="linking"?0.7:1 }}>
            {linkStep === "linking" ? <><span style={{ width:14,height:14,border:"2px solid rgba(201,169,110,0.3)",borderTopColor:C2.gold,borderRadius:"50%",display:"inline-block",animation:"spin 0.7s linear infinite" }}/> Connecting…</> : "Connect bank account →"}
          </button>
        </div>
      )}

      <button onClick={onContinue} disabled={loading}
        style={{ width:"100%",padding:"12px",border:`1px solid ${C2.goldDim}`,borderRadius:8,fontSize:14,fontWeight:500,background:"transparent",color:C2.gold,cursor:"pointer",fontFamily:"var(--m-font)",display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:loading?0.7:1 }}>
        {bankLinked || linkStep === "linked" ? "Continue →" : "Skip for now →"}
      </button>
    </>
  );
}

export default function TenantOnboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invitedTenantId = searchParams.get("tenant_id") || null;
  const isInvited = !!invitedTenantId;

  const STEPS = isInvited
    ? ["Your info", "Set password", "Your unit", "Emergency contact", "Link bank", "All set"]
    : ["Your info", "Find your unit", "Emergency contact", "Link bank", "All set"];

  const [step,           setStep]           = useState(0);
  const [linkedTenantId, setLinkedTenantId] = useState(null);
  const [autoLinked,     setAutoLinked]     = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState("");

  // Step 0
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const nameEdited = useRef(false);
  const phoneEdited = useRef(false);

  // Set password (invited only)
  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Find unit (self-signup only)
  const [code,    setCode]    = useState("");
  const [unitNum, setUnitNum] = useState("");

  // Shared — found property info
  const [foundProperty, setFoundProperty] = useState(null);

  // Emergency contact
  const [ecName,         setEcName]         = useState("");
  const [ecPhone,        setEcPhone]        = useState("");
  const [ecRelationship, setEcRelationship] = useState("");

  // Move-in checklist
  const [checklist, setChecklist] = useState(
    ROOMS.map(r=>({ room:r.id, condition:"", notes:"", completed:false }))
  );

  // Expired, used or invalid invitation links come back with an error in the URL instead of a session.
  // Show what happened and what to do, instead of a form whose saves would silently fail.
  const [linkState, setLinkState] = useState({ state: "checking" });
  useEffect(() => {
    let live = true;
    const { hash, search } = window.location;
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data?.session;
      // A management account must never run tenant onboarding: landlords may update any tenant row, so the claim
      // below would link the landlord's login to the tenant. If the role cannot be read, treat it as management.
      let isManagement = false;
      if (session) {
        const { data: profile, error: roleErr } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
        isManagement = Boolean(roleErr) || profile?.role === "landlord";
      }
      if (!live) return;
      const metadata = session?.user.user_metadata;
      const resumed = savedSetupStep(metadata, invitedTenantId, STEPS.length);
      const sameInvite = invitedTenantId && (metadata?.tenant_id === invitedTenantId || metadata?.tenant_setup?.tenantId === invitedTenantId);
      const canResume = session && !isManagement && sameInvite && (resumed > 0 || metadata?.onboarding_complete === true);
      const state = canResume ? { state: "ready" } : inviteLinkState({ hash, search, hasSession: Boolean(session), isManagement });
      if (state.state === "ready") {
        if (metadata?.onboarding_complete === true) { navigate("/home", { replace: true }); return; }
        if (!invitedTenantId && resumed >= 2) {
          const { data: ownedTenant } = await supabase.from("tenants").select("id").eq("user_id", session.user.id).maybeSingle();
          if (!live) return;
          if (ownedTenant) setLinkedTenantId(ownedTenant.id);
        }
        setStep(resumed);
        if (!nameEdited.current && typeof metadata?.full_name === "string") setFullName(metadata.full_name);
        if (!phoneEdited.current && typeof metadata?.phone === "string") setPhone(metadata.phone);
      }
      setLinkState(state);
    }).catch(() => { if (live) setLinkState(inviteLinkState({ hash, search, hasSession: false })); });
    return () => { live = false; };
  }, [invitedTenantId, navigate, STEPS.length]);

  // Auto-link invited tenant and pre-load unit info
  useEffect(() => {
    async function autoLink() {
      // Only after the link check confirmed a tenant session (never for management, expired or invalid links).
      if (!invitedTenantId||autoLinked||linkState.state!=="ready") return;
      // claimTenantRecord re-checks the account (never management) and links only an unclaimed record whose email
      // matches the verified sign-in email (enforced by RLS), reading back the result.
      const claim = await claimTenantRecord(supabase, invitedTenantId);
      const linked = claim.ok;
      if (!linked) { setError(CLAIM_MESSAGES[claim.reason] || CLAIM_MESSAGES.mismatch); return; }

      if (linked) {
        setAutoLinked(true);
        setLinkedTenantId(invitedTenantId);

        // Pre-load name and unit info
        const { data:t } = await supabase
          .from("tenants")
          .select("name, phone, units(unit_number, properties(name, address, city, state))")
          .eq("id", invitedTenantId)
          .single();

        if (t?.name && !nameEdited.current) setFullName(v => v || t.name);
        if (t?.phone && !phoneEdited.current) setPhone(v => v || t.phone);
        if (t?.units) {
          setFoundProperty({
            property: t.units.properties?.name || "—",
            address:  `${t.units.properties?.address||""}, ${t.units.properties?.city||""} ${t.units.properties?.state||""}`,
            unit:     t.units.unit_number || "—",
          });
        }
      }
    }
    autoLink();
  }, [invitedTenantId, linkState.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = (step/(STEPS.length-1))*100;
  const stepName = STEPS[step];

  async function saveStep({ data, password: newPassword } = {}) {
    const next = step + 1;
    const result = await supabase.auth.updateUser({
      ...(newPassword ? { password: newPassword } : {}),
      data: { ...data, tenant_setup: { tenantId: invitedTenantId, step: next } },
    });
    if (!result.error) setStep(next);
    return result.error;
  }

  async function advance() {
    setLoading(true); setError("");
    try {
      if (await saveStep()) setError("We couldn’t save your progress. Please try again.");
    } catch {
      setError("We couldn’t save your progress. Please try again.");
    } finally { setLoading(false); }
  }

  async function handlePersonalInfo(event) {
    event.preventDefault();
    if (loading) return;
    const name = fullName.trim();
    const normalizedPhone = normalizeTenantPhone(phone);
    const errors = {
      ...(!name ? { name: "Enter your full name." } : {}),
      ...(!normalizedPhone ? { phone: phone.trim() ? "Enter a valid US or Canadian phone number." : "Enter your phone number." } : {}),
    };
    setFieldErrors(errors);
    if (errors.name || errors.phone) {
      document.getElementById(errors.name ? "setup-name" : "setup-phone")?.focus();
      return;
    }
    if (isInvited && !linkedTenantId) { setError("We couldn’t verify your invitation. Reopen the link or ask your manager for a new one."); return; }
    setLoading(true); setError("");
    try {
      if (linkedTenantId) {
        const { data, error: updateError } = await supabase.from("tenants")
          .update({ name, phone: normalizedPhone }).eq("id", linkedTenantId).select("id").maybeSingle();
        if (updateError || !data) throw new Error("Tenant details were not saved");
      }
      if (await saveStep({ data: { full_name: name, phone: normalizedPhone } })) throw new Error("Progress was not saved");
      setPhone(normalizedPhone);
    } catch {
      setError("We couldn’t save your information. Please try again.");
    } finally { setLoading(false); }
  }

  async function handleSetPassword(event) {
    event.preventDefault();
    if (loading) return;
    const issue = passwordIssue(password);
    if (issue) { setError(issue); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    setLoading(true); setError("");
    try {
      const authError = await saveStep({ password });
      if (authError) {
        setError(authError.code === "weak_password" ? "Your account security policy rejected that password. Try a longer, unique passphrase." : "We couldn’t set your password. Please try again.");
        return;
      }
      setPassword("");
      setConfirmPassword("");
    } catch {
      setError("We couldn’t set your password. Please try again.");
    } finally { setLoading(false); }
  }

  async function handlePropertyCode() {
    // Invited tenants already linked — just advance
    if (linkedTenantId) { await advance(); return; }

    if (!code.trim())    { setError("Please enter your property code."); return; }
    if (!unitNum.trim()) { setError("Please enter your unit number."); return; }
    setError(""); setLoading(true);

    try {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { setError("Session expired. Please log in again."); setLoading(false); return; }

      const { data:propertyData, error:propErr } = await supabase
        .from("properties").select("id,name,address,city,state")
        .eq("property_code", code.toUpperCase().trim()).single();
      if (propErr||!propertyData) { setError("Property code not found. Check with your landlord."); setLoading(false); return; }

      const { data:unitData, error:unitErr } = await supabase
        .from("units").select("id,unit_number")
        .eq("property_id", propertyData.id).ilike("unit_number", unitNum.trim()).limit(1).single();
      if (unitErr||!unitData) { setError(`Unit ${unitNum} not found at ${propertyData.name}.`); setLoading(false); return; }

      const { data:tenantData, error:tenantErr } = await supabase
        .from("tenants").select("id,name,user_id").eq("unit_id", unitData.id).limit(1).single();
      if (tenantErr||!tenantData) { setError(`No tenant record found for Unit ${unitNum}. Ask your landlord to add you first.`); setLoading(false); return; }
      if (tenantData.user_id&&tenantData.user_id!==user.id) { setError("This unit is already claimed by another account."); setLoading(false); return; }

      // Link first (authorization checked inside); only then write the name and phone.
      const claim = await claimTenantRecord(supabase, tenantData.id);
      if (!claim.ok) { setError(CLAIM_MESSAGES[claim.reason] || CLAIM_MESSAGES.mismatch); setLoading(false); return; }
      const { data: savedTenant, error: infoError } = await supabase.from("tenants").update({ name:fullName||tenantData.name, phone }).eq("id",tenantData.id).eq("user_id", user.id).select("id").maybeSingle();
      if (infoError || !savedTenant) throw new Error("Tenant details were not saved");
      setLinkedTenantId(tenantData.id);
      setFoundProperty({ property:propertyData.name, address:`${propertyData.address}, ${propertyData.city} ${propertyData.state}`, unit:unitData.unit_number });
      if (await saveStep()) throw new Error("Progress was not saved");
      setLoading(false);
    } catch(e) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  async function handleEmergencyContact() {
    const normalizedPhone = normalizeTenantPhone(ecPhone);
    if (!ecName.trim() || !normalizedPhone) { setError("Enter a name and a valid US or Canadian phone number."); return; }
    if (isInvited && !linkedTenantId) { setError("Wait for your unit to finish loading before saving."); return; }
    setLoading(true); setError("");
    try {
      if (linkedTenantId) {
        const { data, error } = await supabase.from("tenants").update({
          emergency_contact_name: ecName.trim(),
          emergency_contact_phone: normalizedPhone,
          emergency_contact_relationship: ecRelationship,
        }).eq("id", linkedTenantId).select("id").maybeSingle();
        if (error || !data) throw new Error("Emergency contact was not saved");
      }
      if (await saveStep()) throw new Error("Progress was not saved");
    } catch {
      setError("We couldn’t save your emergency contact. Please try again.");
    } finally { setLoading(false); }
  }

  async function handleChecklist() {
    setLoading(true);
    try {
      if (linkedTenantId) {
        const rows = checklist.map(item=>({ tenant_id:linkedTenantId, room:item.room, condition:item.condition||"Good", notes:item.notes, completed:item.condition!=="" }));
        await supabase.from("move_in_checklist").delete().eq("tenant_id", linkedTenantId);
        await supabase.from("move_in_checklist").insert(rows);
      }
    } catch(e) {}
    setLoading(false);
    setStep(s=>s+1);
  }

  function updateChecklist(index, field, value) {
    setChecklist(prev=>prev.map((item,i)=>i===index?{ ...item, [field]:value }:item));
  }

  // Bank linking state (lifted here so it survives re-renders of the inner component)
  const [bankLinked, setBankLinked]   = useState(false);
  const [bankName,   setBankName2]    = useState("");
  const [bankLast4,  setBankLast4]    = useState("");

  async function handleFinish() {
    if (isInvited && !linkedTenantId) { setError("Wait for your unit to finish loading before finishing setup."); return; }
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.updateUser({ data: { onboarding_complete: true } });
      if (error) throw error;
      navigate("/home", { replace: true });
    } catch {
      setError("We couldn’t finish setup. Please try again.");
    } finally { setLoading(false); }
  }

  const completedRooms = checklist.filter(r=>r.condition!=="").length;

  if (linkState.state !== "ready") {
    const msg = LINK_MESSAGES[linkState.state];
    return (
      <div style={{ width:"100%",fontFamily:"var(--m-font)",background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px",boxSizing:"border-box" }}>
        <div role={msg ? "alert" : "status"} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"28px 24px",width:"100%",maxWidth:440,textAlign:"center" }}>
          <div style={{ display:"flex",justifyContent:"center",marginBottom:14 }}><ModusMark size={32}/></div>
          {!msg ? <div style={{ fontSize:14,color:C.textSub }}>Checking your invitation…</div> : (
            <>
              <div style={{ fontFamily:"var(--m-font)",fontSize:"var(--m-fs-title)",fontWeight:600,color:C.text,marginBottom:10 }}>{msg.title}</div>
              <div style={{ fontSize:14,color:C.textSub,lineHeight:1.6,marginBottom:22 }}>{msg.body}</div>
              <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                <button onClick={()=>navigate("/login")} style={{ padding:"12px",borderRadius:8,border:"none",background:C.gold,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"var(--m-font)" }}>Sign in</button>
                <button onClick={()=>navigate("/forgot-password")} style={{ padding:"12px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.textSub,fontSize:14,cursor:"pointer",fontFamily:"var(--m-font)" }}>Forgot or never set a password?</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width:"100%",fontFamily:"var(--m-font)",background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column" }}>
      <style>{`
        
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        .rel-btn:hover{border-color:${C.goldDim}!important;color:${C.text}!important;}
      `}</style>

      {/* Header */}
      <div style={{ background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"28px 24px 24px",textAlign:"center" }}>
        <div style={{ display:"flex",justifyContent:"center",marginBottom:14 }}><ModusMark size={36}/></div>
        <div style={{ fontFamily:"var(--m-font-brand)",fontSize:20,fontWeight:600,color:C.text,letterSpacing:"0.1em" }}>MODUS</div>
        <div style={{ fontSize:9,color:C.textMuted,letterSpacing:"0.18em",marginTop:2,marginBottom:12 }}>PROPERTY MANAGEMENT</div>
        <div style={{ fontSize:13,color:C.textSub }}>Let's get your account set up — takes about 3 minutes</div>
      </div>

      {/* Progress */}
      <div style={{ background:C.surface,padding:"12px 24px 16px",borderBottom:`1px solid ${C.border}` }}>
        <div style={{ height:3,background:C.raised,borderRadius:2,overflow:"hidden",marginBottom:8 }}>
          <div style={{ height:"100%",width:`${progress}%`,background:C.gold,borderRadius:2,transition:"width 0.4s ease" }}/>
        </div>
        <div style={{ display:"flex",justifyContent:"space-between" }}>
          {STEPS.map((s,i)=>(
            <span key={i} aria-current={i === step ? "step" : undefined} style={{ fontSize:10,fontWeight:i<=step?600:400,color:i<step?C.green:i===step?C.gold:C.textMuted }}>{s}</span>
          ))}
        </div>
      </div>

      <div style={{ flex:1,padding:"28px 24px 48px",width:"100%",maxWidth:520,margin:"0 auto",boxSizing:"border-box" }}>

        {error&&<div role="alert" style={{ background:"rgba(224,85,85,0.1)",border:`1px solid rgba(224,85,85,0.2)`,borderRadius:8,padding:"10px 14px",marginBottom:20,fontSize:13,color:C.red }}>{error}</div>}

        {/* ── Your info ── */}
        {stepName==="Your info"&&(
          <form noValidate onSubmit={handlePersonalInfo}>
            <div style={{ fontFamily:"var(--m-font)",fontSize:"var(--m-fs-section)",fontWeight:600,color:C.text,marginBottom:6 }}>Your information</div>
            <div style={{ fontSize:14,color:C.textSub,lineHeight:1.6,marginBottom:24 }}>This is how your landlord will identify you and how we'll address your receipts and documents.</div>
            <InputField id="setup-name" label="Full name" value={fullName} onChange={v=>{nameEdited.current=true;setFullName(v);setFieldErrors(e=>({...e,name:""}));}} autoComplete="name" required error={fieldErrors.name}/>
            <InputField id="setup-phone" label="Phone number" value={phone} onChange={v=>{phoneEdited.current=true;setPhone(v);setFieldErrors(e=>({...e,phone:""}));}} placeholder="(614) 555-0192" type="tel" autoComplete="tel" required error={fieldErrors.phone}/>
            <ContinueBtn type="submit" loading={loading}/>
          </form>
        )}

        {/* ── Set password (invited only) ── */}
        {stepName==="Set password"&&(
          <form onSubmit={handleSetPassword}>
            <div style={{ fontFamily:"var(--m-font)",fontSize:"var(--m-fs-section)",fontWeight:600,color:C.text,marginBottom:6 }}>Create a password</div>
            <div style={{ fontSize:14,color:C.textSub,lineHeight:1.6,marginBottom:24 }}>Set a password so you can log back in anytime.</div>
            <InputField label="Password"         value={password}        onChange={v=>{setPassword(v);setError("");}}        placeholder="At least 8 characters" type="password" autoComplete="new-password"/>
            <InputField label="Confirm password" value={confirmPassword} onChange={v=>{setConfirmPassword(v);setError("");}} placeholder="Repeat your password"    type="password" autoComplete="new-password"/>
            <p aria-live="polite" style={{ marginBottom:20, fontSize:13, color:C.textSub }}>
              {password ? passwordIssue(password) || "Ready to check against your account’s security policy." : "Use at least 8 characters. A unique passphrase is easier to remember."}
            </p>
            <ContinueBtn type="submit" loading={loading} label="Set password & continue →"/>
          </form>
        )}

        {/* ── Your unit (invited — read only) ── */}
        {stepName==="Your unit"&&(
          <>
            <div style={{ fontFamily:"var(--m-font)",fontSize:"var(--m-fs-section)",fontWeight:600,color:C.text,marginBottom:6 }}>Your unit</div>
            <div style={{ fontSize:14,color:C.textSub,lineHeight:1.6,marginBottom:24 }}>Your unit has already been linked to your account via your invite.</div>
            {foundProperty?(
              <div style={{ background:`${C.green}0F`,border:`1px solid ${C.green}33`,borderRadius:10,padding:"20px",marginBottom:24 }}>
                <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                  <div style={{ width:44,height:44,borderRadius:10,background:`${C.green}18`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                    <div style={{ width:12,height:12,borderRadius:"50%",background:C.green }}/>
                  </div>
                  <div>
                    <div style={{ fontSize:15,fontWeight:600,color:C.green,marginBottom:2 }}>✓ {foundProperty.property}</div>
                    <div style={{ fontSize:13,color:C.text }}>Unit {foundProperty.unit}</div>
                    <div style={{ fontSize:12,color:C.textSub,marginTop:2 }}>{foundProperty.address}</div>
                  </div>
                </div>
              </div>
            ):(
              <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px",marginBottom:24,fontSize:13,color:C.textSub }}>
                Loading your unit info…
              </div>
            )}
            <ContinueBtn onClick={advance} loading={loading || !linkedTenantId} label="Continue →"/>
          </>
        )}

        {/* ── Find your unit (self-signup only) ── */}
        {stepName==="Find your unit"&&(
          <>
            <div style={{ fontFamily:"var(--m-font)",fontSize:"var(--m-fs-section)",fontWeight:600,color:C.text,marginBottom:6 }}>Find your unit</div>
            <div style={{ fontSize:14,color:C.textSub,lineHeight:1.6,marginBottom:24 }}>Enter the property code your landlord gave you, then your unit number.</div>
            {foundProperty&&(
              <div style={{ background:`${C.green}0F`,border:`1px solid ${C.green}33`,borderRadius:10,padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12 }}>
                <div style={{ width:40,height:40,borderRadius:9,background:`${C.green}18`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                  <div style={{ width:10,height:10,borderRadius:"50%",background:C.green }}/>
                </div>
                <div>
                  <div style={{ fontSize:14,fontWeight:600,color:C.green }}>✓ {foundProperty.property} — Unit {foundProperty.unit}</div>
                  <div style={{ fontSize:12,color:C.textSub,marginTop:2 }}>{foundProperty.address}</div>
                </div>
              </div>
            )}
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12,fontWeight:600,color:C.textSub,display:"block",marginBottom:6 }}>Property code</label>
              <input value={code} onChange={e=>{setCode(e.target.value.toUpperCase());setError("");setFoundProperty(null);}} placeholder="e.g. CLIFTON" maxLength={10}
                style={{ width:"100%",padding:"14px",fontSize:22,fontWeight:600,border:`1px solid ${C.border}`,borderRadius:8,textAlign:"center",outline:"none",boxSizing:"border-box",fontFamily:"var(--m-font)",color:C.gold,background:C.raised }}/>
              <div style={{ fontSize:11,color:C.textMuted,textAlign:"center",marginTop:8 }}>Your landlord provided this code when you were added as a tenant.</div>
            </div>
            <InputField label="Unit number" value={unitNum} onChange={v=>{setUnitNum(v);setError("");}} placeholder="e.g. 3"/>
            <ContinueBtn onClick={handlePropertyCode} loading={loading} label="Verify & continue →"/>
            <button onClick={advance} disabled={loading} style={{ width:"100%",padding:"10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontWeight:500,background:"transparent",color:C.textSub,cursor:"pointer",fontFamily:"var(--m-font)",marginTop:10 }}>
              Skip for now
            </button>
          </>
        )}

        {/* ── Emergency contact ── */}
        {stepName==="Emergency contact"&&(
          <>
            <div style={{ fontFamily:"var(--m-font)",fontSize:"var(--m-fs-section)",fontWeight:600,color:C.text,marginBottom:6 }}>Emergency contact</div>
            <div style={{ fontSize:14,color:C.textSub,lineHeight:1.6,marginBottom:24 }}>Who should your property manager contact in case of an emergency?</div>
            <InputField label="Full name"    value={ecName}  onChange={v=>{setEcName(v);setError("");}}  placeholder="Jane Rodriguez"/>
            <InputField label="Phone number" value={ecPhone} onChange={v=>{setEcPhone(v);setError("");}} placeholder="(614) 555-0100" type="tel"/>
            <div style={{ marginBottom:24 }}>
              <label style={{ fontSize:12,fontWeight:600,color:C.textSub,display:"block",marginBottom:8 }}>Relationship</label>
              <div style={{ display:"flex",flexWrap:"wrap",gap:8 }}>
                {RELATIONSHIPS.map(r=>(
                  <button key={r} className="rel-btn" onClick={()=>setEcRelationship(r)}
                    style={{ padding:"7px 14px",borderRadius:20,fontSize:13,fontWeight:500,background:ecRelationship===r?C.goldDim:"transparent",color:ecRelationship===r?C.text:C.textSub,border:`1px solid ${ecRelationship===r?C.goldDim:C.border}`,cursor:"pointer",fontFamily:"var(--m-font)",transition:"all 0.12s" }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <ContinueBtn onClick={handleEmergencyContact} loading={loading}/>
            <button onClick={advance} disabled={loading} style={{ width:"100%",padding:"10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontWeight:500,background:"transparent",color:C.textSub,cursor:"pointer",fontFamily:"var(--m-font)",marginTop:10 }}>
              Skip for now
            </button>
          </>
        )}

        {/* ── Move-in checklist ── */}
        {stepName==="Move-in checklist"&&(
          <>
            <div style={{ fontFamily:"var(--m-font)",fontSize:"var(--m-fs-section)",fontWeight:600,color:C.text,marginBottom:6 }}>Move-in checklist</div>
            <div style={{ fontSize:14,color:C.textSub,lineHeight:1.6,marginBottom:8 }}>Document the condition of each area when you move in. This protects your deposit.</div>
            <div style={{ fontSize:12,color:C.textMuted,marginBottom:24 }}>{completedRooms} of {ROOMS.length} areas completed</div>
            <div style={{ display:"flex",flexDirection:"column",gap:12,marginBottom:24 }}>
              {ROOMS.map((room,i)=>{
                const item = checklist[i];
                return (
                  <div key={room.id} style={{ background:C.surface,border:`1px solid ${item.condition?C.goldDim:C.border}`,borderRadius:10,padding:"14px 16px",transition:"border-color 0.15s" }}>
                    <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
                      <div style={{ fontSize:14,fontWeight:500,color:C.text }}>{room.label}</div>
                      {item.condition&&<div style={{ width:8,height:8,borderRadius:"50%",background:C.green }}/>}
                    </div>
                    <div style={{ display:"flex",gap:8,marginBottom:item.condition?10:0 }}>
                      {CONDITIONS.map(c=>(
                        <button key={c} onClick={()=>updateChecklist(i,"condition",c)}
                          style={{ flex:1,padding:"7px 4px",borderRadius:7,fontSize:12,fontWeight:500,
                            background:item.condition===c?(c==="Good"?`${C.green}20`:c==="Fair"?`${C.amber}20`:`${C.red}20`):"transparent",
                            color:item.condition===c?(c==="Good"?C.green:c==="Fair"?C.amber:C.red):C.textSub,
                            border:`1px solid ${item.condition===c?(c==="Good"?C.green:c==="Fair"?C.amber:C.red):C.border}`,
                            cursor:"pointer",fontFamily:"var(--m-font)",transition:"all 0.12s" }}>
                          {c}
                        </button>
                      ))}
                    </div>
                    {item.condition&&(
                      <input value={item.notes} onChange={e=>updateChecklist(i,"notes",e.target.value)} placeholder="Add notes (optional)…"
                        style={{ width:"100%",padding:"8px 10px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,background:C.raised,color:C.text,outline:"none",fontFamily:"var(--m-font)",boxSizing:"border-box" }}/>
                    )}
                  </div>
                );
              })}
            </div>
            <ContinueBtn onClick={handleChecklist} loading={loading} label={completedRooms===0?"Skip checklist →":"Save & continue →"}/>
          </>
        )}

        {/* ── Link bank ── */}
        {stepName==="Link bank"&&(
          <Elements stripe={stripePromise}>
            <BankLinkStep
              linkedTenantId={linkedTenantId}
              bankLinked={bankLinked}
              bankName={bankName}
              bankLast4={bankLast4}
              onLinked={(name, last4) => { setBankLinked(true); setBankName2(name); setBankLast4(last4); }}
              onContinue={advance}
              loading={loading}
            />
          </Elements>
        )}

        {/* ── All set ── */}
        {stepName==="All set"&&(
          <>
            <div style={{ width:72,height:72,borderRadius:"50%",background:`${C.green}18`,border:`1px solid ${C.green}33`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:28,color:C.green,animation:"popIn 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>✓</div>
            <div style={{ fontFamily:"var(--m-font)",fontSize:"var(--m-fs-title)",fontWeight:600,color:C.text,textAlign:"center",marginBottom:6 }}>You're all set!</div>
            <div style={{ fontSize:14,color:C.textSub,textAlign:"center",marginBottom:24 }}>Your account is ready. Here's what we set up:</div>
            <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",marginBottom:24 }}>
              {[
                ["Name",              fullName||"—"],
                ["Phone",             phone||"—"],
                ...(isInvited ? [["Password", "✓ Set"]] : []),
                ["Property",          foundProperty?.property||"Not linked yet"],
                ["Unit",              foundProperty?.unit||"—"],
                ["Emergency contact", ecName||"Not provided"],
                ["Bank account",      bankLinked ? `${bankName} ····${bankLast4}` : "Not linked"],
              ].map(([k,v],i,arr)=>(
                <div key={k} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none" }}>
                  <span style={{ fontSize:13,color:C.textSub }}>{k}</span>
                  <span style={{ fontSize:13,fontWeight:500,color:v==="✓ Set"?C.green:C.text }}>{v}</span>
                </div>
              ))}
            </div>
            <ContinueBtn onClick={handleFinish} loading={loading} label="Go to my portal →"/>
          </>
        )}
      </div>
    </div>
  );
}
