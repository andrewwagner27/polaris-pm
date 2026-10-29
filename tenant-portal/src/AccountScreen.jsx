import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import { useTenant } from "./useTenant";
import TenantLayout from "./TenantLayout";

const C = {
  bg:"#F5F3EE",surface:"#FFFFFF",raised:"#F8F7F4",border:"#E4E1DA",
  text:"#18181B",textSub:"#52525B",textMuted:"#A1A1AA",
  gold:"#8B6914",goldBg:"#FBF6EC",goldDim:"#C9A96E",blue:"#1D4ED8",green:"#15803D",red:"#DC2626",amber:"#92400E",
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d+"T00:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
}

function InputField({ label, value, onChange, type="text", placeholder, readOnly=false }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom:16 }}>
      <label style={{ fontSize:11,fontWeight:600,color:C.textSub,letterSpacing:"0.08em",textTransform:"uppercase",display:"block",marginBottom:6 }}>{label}</label>
      <input type={type} value={value} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder} readOnly={readOnly}
        onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
        style={{ width:"100%",padding:"11px 14px",fontSize:14,border:`1px solid ${readOnly?C.border:focused?C.gold:C.border}`,borderRadius:8,background:readOnly?C.bg:C.raised,color:readOnly?C.textMuted:C.text,outline:"none",boxSizing:"border-box",fontFamily:"'DM Sans',sans-serif",transition:"border-color 0.15s",cursor:readOnly?"default":"text" }}/>
    </div>
  );
}

const VIEWS = ["Settings & Profile","Lease","Inspections"];

export default function AccountScreen() {
  const navigate = useNavigate();
  const { tenant, user, loading } = useTenant();
  const [view, setView] = useState("Settings & Profile");

  // Profile fields
  const [name,     setName]     = useState("");
  const [phone,    setPhone]    = useState("");
  const [email,    setEmail]    = useState("");
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  // Password
  const [newPw,    setNewPw]    = useState("");
  const [confirmPw,setConfirmPw]= useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg,    setPwMsg]    = useState("");

  // Notifications
  const [emailNotif, setEmailNotif] = useState(true);
  const [smsNotif,   setSmsNotif]   = useState(true);

  useEffect(() => {
    if (tenant) {
      setName(tenant.name || "");
      setPhone(tenant.phone || "");
      setEmail(tenant.email || "");
    }
  }, [tenant]);

  async function saveProfile() {
    setSaving(true); setSaved(false);
    await supabase.from("tenants").update({ name, phone }).eq("id", tenant.id);
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function changePassword() {
    if (newPw !== confirmPw) { setPwMsg("Passwords don't match."); return; }
    if (newPw.length < 8) { setPwMsg("Password must be at least 8 characters."); return; }
    setPwSaving(true); setPwMsg("");
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwSaving(false);
    setPwMsg(error ? "Error: " + error.message : "Password updated successfully.");
    if (!error) { setNewPw(""); setConfirmPw(""); }
  }

  const initials = (tenant?.name||"T").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();

  if (loading) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:C.bg,color:C.textMuted,fontFamily:"'DM Sans',sans-serif",fontSize:14 }}>Loading…</div>;

  return (
    <TenantLayout tenantName={tenant?.name||"Tenant"}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;}
        @media(max-width:767px){.acct-layout{flex-direction:column!important;} .acct-sidebar{width:100%!important;border-right:none!important;border-bottom:1px solid ${C.border}!important;flex-direction:row!important;gap:4px!important;padding:10px 8px!important;overflow-x:auto!important;} .acct-wrap{padding:16px 14px 80px!important;}}
      `}</style>

      <div className="acct-wrap" style={{ background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',sans-serif",padding:"28px 20px 80px",maxWidth:900,margin:"0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom:28 }}>
          <div style={{ fontSize:12,color:C.textMuted,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6 }}>Account</div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:34,fontWeight:600,color:C.text,lineHeight:1 }}>{tenant?.name||"Tenant"}</div>
          <div style={{ fontSize:13,color:C.textSub,marginTop:4 }}>Unit {tenant?.unit||"—"} · {tenant?.property||"—"}</div>
        </div>

        <div className="acct-layout" style={{ display:"flex",gap:20,alignItems:"flex-start" }}>

          {/* Sub-nav sidebar */}
          <div className="acct-sidebar" style={{ width:180,flexShrink:0,display:"flex",flexDirection:"column",gap:2,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px",position:"sticky",top:20 }}>
            {VIEWS.map(v => (
              <button key={v} onClick={()=>setView(v)}
                style={{ padding:"11px 14px",textAlign:"left",background:view===v?`rgba(201,169,110,0.08)`:"transparent",border:`1px solid ${view===v?C.goldDim:"transparent"}`,borderRadius:7,color:view===v?C.gold:C.textSub,fontSize:13,fontWeight:view===v?500:400,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.12s" }}>
                {v}
              </button>
            ))}
          </div>

          {/* Main panel */}
          <div style={{ flex:1,minWidth:0 }}>

            {/* ── Settings & Profile ── */}
            {view === "Settings & Profile" && (
              <div style={{ display:"flex",flexDirection:"column",gap:16 }}>

                {/* Avatar + name */}
                <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"24px" }}>
                  <div style={{ display:"flex",alignItems:"center",gap:16,marginBottom:24 }}>
                    <div style={{ width:56,height:56,borderRadius:"50%",background:`${C.gold}22`,border:`1px solid ${C.goldDim}`,color:C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700 }}>{initials}</div>
                    <div>
                      <div style={{ fontSize:16,fontWeight:600,color:C.text }}>{tenant?.name||"Tenant"}</div>
                      <div style={{ fontSize:12,color:C.textMuted,marginTop:2 }}>{tenant?.email}</div>
                    </div>
                  </div>
                  <InputField label="Full Name" value={name} onChange={setName} placeholder="Your full name" />
                  <InputField label="Phone" value={phone} onChange={setPhone} type="tel" placeholder="(555) 000-0000" />
                  <InputField label="Email" value={email} readOnly placeholder="—" />
                  <button onClick={saveProfile} disabled={saving}
                    style={{ padding:"10px 20px",background:C.gold,border:"none",borderRadius:8,color:C.text,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",opacity:saving?0.7:1 }}>
                    {saving?"Saving…":saved?"Saved ✓":"Save Changes"}
                  </button>
                </div>

                {/* Password */}
                <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"24px" }}>
                  <div style={{ fontSize:13,fontWeight:600,color:C.text,marginBottom:16 }}>Change Password</div>
                  <InputField label="New Password" value={newPw} onChange={setNewPw} type="password" placeholder="Min. 8 characters" />
                  <InputField label="Confirm Password" value={confirmPw} onChange={setConfirmPw} type="password" placeholder="Confirm new password" />
                  {pwMsg && <div style={{ fontSize:12,color:pwMsg.includes("Error")?C.red:C.green,marginBottom:10 }}>{pwMsg}</div>}
                  <button onClick={changePassword} disabled={pwSaving}
                    style={{ padding:"10px 20px",background:"transparent",border:`1px solid ${C.gold}`,borderRadius:8,color:C.gold,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",opacity:pwSaving?0.7:1 }}>
                    {pwSaving?"Updating…":"Update Password"}
                  </button>
                </div>

                {/* Notification preferences */}
                <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"24px" }}>
                  <div style={{ fontSize:13,fontWeight:600,color:C.text,marginBottom:16 }}>Notification Preferences</div>
                  {[["Email notifications",emailNotif,setEmailNotif],["SMS notifications",smsNotif,setSmsNotif]].map(([label,val,set])=>(
                    <div key={label} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderBottom:`1px solid ${C.border}` }}>
                      <span style={{ fontSize:13,color:C.text }}>{label}</span>
                      <div onClick={()=>set(v=>!v)} style={{ width:40,height:22,borderRadius:11,background:val?C.gold:C.border,cursor:"pointer",transition:"background 0.2s",position:"relative",flexShrink:0 }}>
                        <div style={{ position:"absolute",top:3,left:val?20:3,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left 0.2s" }}/>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Sign out */}
                <button onClick={async()=>{ await supabase.auth.signOut(); navigate("/login"); }}
                  style={{ padding:"11px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,color:C.red,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",width:"100%" }}>
                  Sign Out
                </button>
              </div>
            )}

            {/* ── Lease ── */}
            {view === "Lease" && (
              <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"28px" }}>
                <div style={{ fontSize:13,fontWeight:600,color:C.text,marginBottom:20 }}>Lease Details</div>
                {[
                  ["Tenant Name",    tenant?.name||"—"],
                  ["Unit",           `Unit ${tenant?.unit||"—"}`],
                  ["Property",       tenant?.property||"—"],
                  ["Lease Start",    fmtDate(tenant?.leaseStart)],
                  ["Lease End",      fmtDate(tenant?.leaseEnd)],
                  ["Monthly Rent",   tenant?.rent ? `$${Number(tenant.rent).toLocaleString()}` : "—"],
                  ["Security Deposit", tenant?.raw?.security_deposit ? `$${Number(tenant.raw.security_deposit).toLocaleString()}` : "—"],
                ].map(([label,val])=>(
                  <div key={label} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 0",borderBottom:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:12,color:C.textMuted }}>{label}</span>
                    <span style={{ fontSize:13,fontWeight:500,color:C.text }}>{val}</span>
                  </div>
                ))}
                <div style={{ marginTop:20,padding:"14px 16px",background:C.raised,borderRadius:8,fontSize:12,color:C.textSub }}>
                  For lease documents, contact Modus Property Management.
                </div>
              </div>
            )}

            {/* ── Inspections ── */}
            {view === "Inspections" && (
              <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"28px",textAlign:"center" }}>
                <div style={{ fontSize:13,fontWeight:600,color:C.text,marginBottom:12 }}>Move-In Inspection</div>
                <div style={{ fontSize:13,color:C.textSub,marginBottom:20 }}>View or complete your move-in inspection report.</div>
                <button onClick={()=>navigate("/inspection")}
                  style={{ padding:"11px 24px",background:"transparent",border:`1px solid ${C.gold}`,borderRadius:8,color:C.gold,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                  Open Inspection →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </TenantLayout>
  );
}
