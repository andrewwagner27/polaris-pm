import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "./supabase";

const C = {
  bg:       "#0A0B0D",
  surface:  "#111316",
  raised:   "#181C21",
  border:   "#252930",
  text:     "#EDEAE2",
  textSub:  "#9095A0",
  textMuted:"#5C6270",
  gold:     "#C9A96E",
  goldDim:  "#7A5C2E",
  blue:     "#4A9AE8",
  green:    "#72B02A",
  red:      "#E05555",
  amber:    "#F0A430",
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

function ContinueBtn({ onClick, loading, label="Continue →" }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{ width:"100%",padding:"12px",border:`1px solid ${C.goldDim}`,borderRadius:8,fontSize:14,fontWeight:500,background:loading?"rgba(201,169,110,0.07)":"transparent",color:C.gold,cursor:loading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"'DM Sans',sans-serif",opacity:loading?0.7:1 }}>
      {loading?<><Spinner/> Saving…</>:label}
    </button>
  );
}

function InputField({ label, value, onChange, type="text", placeholder }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:11,fontWeight:600,color:C.textSub,letterSpacing:"0.08em",textTransform:"uppercase",display:"block",marginBottom:6 }}>{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
        style={{ width:"100%",padding:"11px 14px",fontSize:14,border:`1px solid ${focused?C.gold:C.border}`,borderRadius:8,background:C.raised,color:C.text,outline:"none",boxSizing:"border-box",fontFamily:"'DM Sans',sans-serif",transition:"border-color 0.15s",boxShadow:focused?`0 0 0 3px rgba(201,169,110,0.08)`:"none" }}/>
    </div>
  );
}

export default function TenantOnboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [invitedTenantId, setInvitedTenantId] = useState(searchParams.get("tenant_id")||null);
  const isInvited = !!invitedTenantId;

  // Steps differ based on whether tenant was invited (needs to set password) or self-signed up
  const STEPS = isInvited
    ? ["Your info", "Set password", "Find your unit", "Emergency contact", "Move-in checklist", "All set"]
    : ["Your info", "Find your unit", "Emergency contact", "Move-in checklist", "All set"];

  const [step,           setStep]           = useState(0);
  const [linkedTenantId, setLinkedTenantId] = useState(null);
  const [autoLinked,     setAutoLinked]     = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState("");

  // Step 0 — personal info
  const [fullName, setFullName] = useState("");
  const [phone,    setPhone]    = useState("");

  // Step 1 (invited only) — set password
  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Find unit step
  const [code,          setCode]          = useState("");
  const [unitNum,       setUnitNum]       = useState("");
  const [foundProperty, setFoundProperty] = useState(null);

  // Emergency contact
  const [ecName,         setEcName]         = useState("");
  const [ecPhone,        setEcPhone]        = useState("");
  const [ecRelationship, setEcRelationship] = useState("");

  // Move-in checklist
  const [checklist, setChecklist] = useState(
    ROOMS.map(r=>({ room:r.id, condition:"", notes:"", completed:false }))
  );

  useEffect(() => {
    async function autoLink() {
      if (!invitedTenantId||autoLinked) return;
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("tenants").update({ user_id:user.id }).eq("id",invitedTenantId).is("user_id",null);
      if (!error) {
        setAutoLinked(true);
        setLinkedTenantId(invitedTenantId);
        const { data:t } = await supabase.from("tenants").select("name").eq("id",invitedTenantId).single();
        if (t?.name) setFullName(t.name);
      }
    }
    autoLink();
  }, [invitedTenantId]);

  const progress = (step/(STEPS.length-1))*100;

  // Helper — which logical step name is current
  function currentStepName() { return STEPS[step]; }

  async function handlePersonalInfo() {
    if (!fullName.trim()||!phone.trim()) { setError("Please fill in both fields."); return; }
    setLoading(true); setError("");
    try { await supabase.auth.updateUser({ data:{ full_name:fullName, phone } }); } catch(e) {}
    setLoading(false);
    setStep(s=>s+1);
  }

  async function handleSetPassword() {
    if (!password) { setError("Please enter a password."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    setLoading(true); setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError("Failed to set password. Please try again."); return; }
    setStep(s=>s+1);
  }

  async function handlePropertyCode() {
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

      await supabase.from("tenants").update({ user_id:user.id, name:fullName||tenantData.name, phone }).eq("id",tenantData.id);
      setLinkedTenantId(tenantData.id);
      setFoundProperty({ property:propertyData.name, address:`${propertyData.address}, ${propertyData.city} ${propertyData.state}`, unit:unitData.unit_number });
      await supabase.auth.updateUser({ data:{ onboarding_complete:true, full_name:fullName, phone } });
      setLoading(false);
      setStep(s=>s+1);
    } catch(e) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  async function handleEmergencyContact() {
    if (!ecName.trim()||!ecPhone.trim()) { setError("Please fill in name and phone."); return; }
    setLoading(true); setError("");
    try {
      if (linkedTenantId) {
        await supabase.from("tenants").update({
          emergency_contact_name:         ecName.trim(),
          emergency_contact_phone:        ecPhone.trim(),
          emergency_contact_relationship: ecRelationship,
        }).eq("id", linkedTenantId);
      }
    } catch(e) {}
    setLoading(false);
    setStep(s=>s+1);
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

  async function handleFinish() {
    setLoading(true);
    await supabase.auth.updateUser({ data:{ onboarding_complete:true } });
    navigate("/home");
  }

  const completedRooms = checklist.filter(r=>r.condition!=="").length;
  const stepName = currentStepName();

  return (
    <div style={{ width:"100%",fontFamily:"'DM Sans',sans-serif",background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        .rel-btn:hover{border-color:${C.goldDim}!important;color:${C.text}!important;}
      `}</style>

      {/* Header */}
      <div style={{ background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"28px 24px 24px",textAlign:"center" }}>
        <div style={{ display:"flex",justifyContent:"center",marginBottom:14 }}><ModusMark size={36}/></div>
        <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.text,letterSpacing:"0.1em" }}>MODUS</div>
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
            <span key={i} style={{ fontSize:10,fontWeight:i<=step?600:400,color:i<step?C.green:i===step?C.gold:C.textMuted }}>{s}</span>
          ))}
        </div>
      </div>

      <div style={{ flex:1,padding:"28px 24px 48px",width:"100%",maxWidth:520,margin:"0 auto",boxSizing:"border-box" }}>

        {error&&<div style={{ background:"rgba(224,85,85,0.1)",border:`1px solid rgba(224,85,85,0.2)`,borderRadius:8,padding:"10px 14px",marginBottom:20,fontSize:13,color:C.red }}>{error}</div>}

        {/* ── Your info ── */}
        {stepName==="Your info"&&(
          <>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:C.text,marginBottom:6 }}>Your information</div>
            <div style={{ fontSize:14,color:C.textSub,lineHeight:1.6,marginBottom:24 }}>This is how your landlord will identify you and how we'll address your receipts and documents.</div>
            <InputField label="Full name"     value={fullName} onChange={v=>{setFullName(v);setError("");}} placeholder="Maria Rodriguez"/>
            <InputField label="Phone number"  value={phone}    onChange={v=>{setPhone(v);setError("");}}    placeholder="(614) 555-0192" type="tel"/>
            <ContinueBtn onClick={handlePersonalInfo} loading={loading}/>
          </>
        )}

        {/* ── Set password (invited only) ── */}
        {stepName==="Set password"&&(
          <>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:C.text,marginBottom:6 }}>Create a password</div>
            <div style={{ fontSize:14,color:C.textSub,lineHeight:1.6,marginBottom:24 }}>Set a password so you can log back in anytime.</div>
            <InputField label="Password"         value={password}        onChange={v=>{setPassword(v);setError("");}}        placeholder="At least 8 characters" type="password"/>
            <InputField label="Confirm password" value={confirmPassword} onChange={v=>{setConfirmPassword(v);setError("");}} placeholder="Repeat your password"    type="password"/>
            <div style={{ marginBottom:20 }}>
              <div style={{ height:4,background:C.raised,borderRadius:2,overflow:"hidden" }}>
                <div style={{ height:"100%",borderRadius:2,transition:"width 0.3s, background 0.3s",
                  width: password.length===0?"0%":password.length<6?"30%":password.length<8?"60%":"100%",
                  background: password.length<6?C.red:password.length<8?C.amber:C.green
                }}/>
              </div>
              <div style={{ fontSize:11,color:C.textMuted,marginTop:4 }}>
                {password.length===0?"":password.length<6?"Weak":password.length<8?"Almost there":"Strong password ✓"}
              </div>
            </div>
            <ContinueBtn onClick={handleSetPassword} loading={loading} label="Set password & continue →"/>
          </>
        )}

        {/* ── Find your unit ── */}
        {stepName==="Find your unit"&&(
          <>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:C.text,marginBottom:6 }}>Find your unit</div>
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
              <label style={{ fontSize:11,fontWeight:600,color:C.textSub,letterSpacing:"0.08em",textTransform:"uppercase",display:"block",marginBottom:6 }}>Property code</label>
              <input value={code} onChange={e=>{setCode(e.target.value.toUpperCase());setError("");setFoundProperty(null);}} placeholder="e.g. CLIFTON" maxLength={10}
                style={{ width:"100%",padding:"14px",fontSize:22,fontWeight:700,border:`1px solid ${C.border}`,borderRadius:8,textAlign:"center",letterSpacing:"0.15em",outline:"none",boxSizing:"border-box",fontFamily:"'DM Sans',sans-serif",textTransform:"uppercase",color:C.gold,background:C.raised }}/>
              <div style={{ fontSize:11,color:C.textMuted,textAlign:"center",marginTop:8 }}>Your landlord provided this code when you were added as a tenant.</div>
            </div>
            <InputField label="Unit number" value={unitNum} onChange={v=>{setUnitNum(v);setError("");}} placeholder="e.g. 3"/>
            <ContinueBtn onClick={handlePropertyCode} loading={loading} label="Verify & continue →"/>
            <button onClick={()=>setStep(s=>s+1)} style={{ width:"100%",padding:"10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontWeight:500,background:"transparent",color:C.textSub,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",marginTop:10 }}>
              Skip for now
            </button>
          </>
        )}

        {/* ── Emergency contact ── */}
        {stepName==="Emergency contact"&&(
          <>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:C.text,marginBottom:6 }}>Emergency contact</div>
            <div style={{ fontSize:14,color:C.textSub,lineHeight:1.6,marginBottom:24 }}>Who should your property manager contact in case of an emergency?</div>
            <InputField label="Full name"    value={ecName}  onChange={v=>{setEcName(v);setError("");}}  placeholder="Jane Rodriguez"/>
            <InputField label="Phone number" value={ecPhone} onChange={v=>{setEcPhone(v);setError("");}} placeholder="(614) 555-0100" type="tel"/>
            <div style={{ marginBottom:24 }}>
              <label style={{ fontSize:11,fontWeight:600,color:C.textSub,letterSpacing:"0.08em",textTransform:"uppercase",display:"block",marginBottom:8 }}>Relationship</label>
              <div style={{ display:"flex",flexWrap:"wrap",gap:8 }}>
                {RELATIONSHIPS.map(r=>(
                  <button key={r} className="rel-btn" onClick={()=>setEcRelationship(r)}
                    style={{ padding:"7px 14px",borderRadius:20,fontSize:13,fontWeight:500,background:ecRelationship===r?C.goldDim:"transparent",color:ecRelationship===r?C.text:C.textSub,border:`1px solid ${ecRelationship===r?C.goldDim:C.border}`,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.12s" }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <ContinueBtn onClick={handleEmergencyContact} loading={loading}/>
            <button onClick={()=>setStep(s=>s+1)} style={{ width:"100%",padding:"10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontWeight:500,background:"transparent",color:C.textSub,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",marginTop:10 }}>
              Skip for now
            </button>
          </>
        )}

        {/* ── Move-in checklist ── */}
        {stepName==="Move-in checklist"&&(
          <>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:C.text,marginBottom:6 }}>Move-in checklist</div>
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
                            cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.12s" }}>
                          {c}
                        </button>
                      ))}
                    </div>
                    {item.condition&&(
                      <input value={item.notes} onChange={e=>updateChecklist(i,"notes",e.target.value)} placeholder="Add notes (optional)…"
                        style={{ width:"100%",padding:"8px 10px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,background:C.raised,color:C.text,outline:"none",fontFamily:"'DM Sans',sans-serif",boxSizing:"border-box" }}/>
                    )}
                  </div>
                );
              })}
            </div>
            <ContinueBtn onClick={handleChecklist} loading={loading} label={completedRooms===0?"Skip checklist →":"Save & continue →"}/>
          </>
        )}

        {/* ── All set ── */}
        {stepName==="All set"&&(
          <>
            <div style={{ width:72,height:72,borderRadius:"50%",background:`${C.green}18`,border:`1px solid ${C.green}33`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:28,color:C.green,animation:"popIn 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>✓</div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:C.text,textAlign:"center",marginBottom:6 }}>You're all set!</div>
            <div style={{ fontSize:14,color:C.textSub,textAlign:"center",marginBottom:24 }}>Your account is ready. Here's a summary of what we set up:</div>
            <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",marginBottom:24 }}>
              {[
                ["Name",              fullName||"—"],
                ["Phone",             phone||"—"],
                ["Password",          isInvited?"✓ Set":"—"],
                ["Property",          foundProperty?.property||"Not linked yet"],
                ["Unit",              foundProperty?.unit||"—"],
                ["Emergency contact", ecName||"Not provided"],
                ["Move-in checklist", completedRooms>0?`${completedRooms}/${ROOMS.length} areas documented`:"Not completed"],
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