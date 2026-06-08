import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";

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
  blue:      "#4A9AE8",
  green:     "#72B02A",
  red:       "#E05555",
  amber:     "#F0A430",
};

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,width:"100%",maxWidth:420,padding:"28px 24px" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24 }}>
          <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.text }}>{title}</div>
          <button onClick={onClose} style={{ background:"none",border:"none",color:C.textMuted,cursor:"pointer",fontSize:20,lineHeight:1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type="text", placeholder }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6 }}>{label}</div>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{ width:"100%",background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",fontSize:14,color:C.text,fontFamily:"'DM Sans',sans-serif",outline:"none",boxSizing:"border-box" }}/>
    </div>
  );
}

function SaveButton({ onClick, loading, label="Save changes" }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{ width:"100%",padding:"12px",background:C.goldDim,border:"none",borderRadius:8,fontSize:14,fontWeight:500,color:C.text,cursor:loading?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",opacity:loading?0.7:1,marginTop:8 }}>
      {loading?"Saving…":label}
    </button>
  );
}

function leaseProgress(start, end) {
  const s=new Date(start||"2026-01-01"), e=new Date(end||"2026-12-31"), today=new Date();
  return Math.min(100,Math.max(0,Math.round(((today-s)/(e-s))*100)));
}

function daysRemaining(end) {
  const diff=Math.ceil((new Date(end||"2026-12-31")-new Date())/(1000*60*60*24));
  return Math.max(0,diff);
}

function insuranceDaysLeft(expires) {
  if (!expires) return null;
  return Math.ceil((new Date(expires)-new Date())/(1000*60*60*24));
}

export default function AccountScreen() {
  const navigate = useNavigate();
  const { tenant, user } = useTenant();
  const fileInputRef = useRef(null);

  const [modal,   setModal]   = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState(null);

  const [name,  setName]  = useState("");
  const [phone, setPhone] = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [notifRent,        setNotifRent]        = useState(true);
  const [notifMaintenance, setNotifMaintenance] = useState(true);
  const [notifMessages,    setNotifMessages]    = useState(true);
  const [notifLease,       setNotifLease]       = useState(true);
  const [autopay, setAutopay] = useState(false);

  const [insuranceUrl,     setInsuranceUrl]     = useState("");
  const [insuranceExpires, setInsuranceExpires] = useState("");
  const [insuranceFile,    setInsuranceFile]    = useState(null);
  const [insuranceExpiry,  setInsuranceExpiry]  = useState("");
  const [uploadingIns,     setUploadingIns]     = useState(false);

  useEffect(() => {
    if (tenant) {
      setInsuranceUrl(tenant.insurance_url || "");
      setInsuranceExpires(tenant.insurance_expires || "");
      setInsuranceExpiry(tenant.insurance_expires || "");
    }
  }, [tenant]);

  function showToast(msg, isError=false) {
    setToast({ msg, isError });
    setTimeout(()=>setToast(null), 3000);
  }

  async function handleSaveProfile() {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("tenants").update({ name:name.trim(), phone:phone.trim() }).eq("id", tenant?.id);
    setSaving(false);
    if (error) { showToast("Failed to save profile", true); return; }
    showToast("Profile updated");
    setModal(null);
  }

  async function handleChangePassword() {
    if (!newPw || newPw !== confirmPw) { showToast("Passwords don't match", true); return; }
    if (newPw.length < 8) { showToast("Password must be at least 8 characters", true); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSaving(false);
    if (error) { showToast("Failed to update password", true); return; }
    showToast("Password updated");
    setNewPw(""); setConfirmPw("");
    setModal(null);
  }

  async function handleInsuranceUpload() {
    if (!insuranceExpiry) { showToast("Please enter your policy expiry date", true); return; }
    if (!insuranceFile && !insuranceUrl) { showToast("Please select a file to upload", true); return; }
    setUploadingIns(true);
    try {
      let uploadedUrl = insuranceUrl;
      if (insuranceFile) {
        const ext  = insuranceFile.name.split(".").pop();
        const path = `${tenant.id}/policy-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("insurance-docs").upload(path, insuranceFile, { upsert: true });
        if (upErr) { showToast("Upload failed. Please try again.", true); setUploadingIns(false); return; }
        const { data: { publicUrl } } = supabase.storage.from("insurance-docs").getPublicUrl(path);
        uploadedUrl = publicUrl;
      }
      const { error: dbErr } = await supabase.from("tenants").update({ insurance_url: uploadedUrl, insurance_expires: insuranceExpiry }).eq("id", tenant.id);
      if (dbErr) { showToast("Failed to save insurance info", true); setUploadingIns(false); return; }

      // Notify landlord
      try {
        await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: "andrewwagner27@gmail.com",
            subject: `📄 ${tenant.name} uploaded renters insurance`,
            html: `<div style="background:#0A0B0D;padding:32px 20px;font-family:'Helvetica Neue',sans-serif;"><div style="background:#111316;border:1px solid #252930;border-radius:12px;max-width:560px;margin:0 auto;overflow:hidden;"><div style="padding:24px 32px 20px;border-bottom:1px solid #252930;"><p style="margin:0;font-size:11px;font-weight:600;color:#5C6270;letter-spacing:0.16em;text-transform:uppercase;">MODUS PROPERTY MANAGEMENT</p><h2 style="margin:8px 0 0;font-size:22px;font-weight:400;color:#EDEAE2;font-family:Georgia,serif;">Renters Insurance Upload</h2></div><div style="padding:24px 32px;"><p style="color:#9095A0;font-size:14px;margin:0 0 20px;"><strong style="color:#EDEAE2;">${tenant.name}</strong> has uploaded their renters insurance policy.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:8px 0;color:#9095A0;font-size:13px;border-bottom:1px solid #252930;width:140px;">Tenant</td><td style="padding:8px 0;font-weight:500;font-size:13px;color:#EDEAE2;border-bottom:1px solid #252930;">${tenant.name}</td></tr><tr><td style="padding:8px 0;color:#9095A0;font-size:13px;">Policy expires</td><td style="padding:8px 0;font-weight:500;font-size:13px;color:#EDEAE2;">${new Date(insuranceExpiry).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</td></tr></table><a href="https://polaris-pm.vercel.app/landlord/tenants/${tenant.id}" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#7A5C2E;color:#C9A96E;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;">View tenant →</a></div><div style="padding:16px 32px;border-top:1px solid #252930;"><p style="margin:0;font-size:11px;color:#5C6270;">Modus Property Management · Columbus, OH</p></div></div></div>`,
          }),
        });
      } catch(e) { /* non-fatal */ }

      setInsuranceUrl(uploadedUrl);
      setInsuranceExpires(insuranceExpiry);
      setInsuranceFile(null);
      showToast("Insurance uploaded successfully");
      setModal(null);
    } catch(e) {
      showToast("Something went wrong", true);
    }
    setUploadingIns(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  const name_val = tenant?.name || "Tenant";
  const initials = name_val.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const progress = leaseProgress(tenant?.lease_start, tenant?.lease_end);
  const daysLeft = daysRemaining(tenant?.lease_end);
  const insDays  = insuranceDaysLeft(insuranceExpires);
  const insStatus = !insuranceUrl ? "missing"
    : insDays === null ? "unknown"
    : insDays < 0     ? "expired"
    : insDays < 30    ? "expiring"
    : "verified";
  const INS_CFG = {
    missing:  { label:"Not uploaded",            color:C.red,   bg:`${C.red}15`   },
    expired:  { label:"Expired",                 color:C.red,   bg:`${C.red}15`   },
    expiring: { label:`Expires in ${insDays}d`,  color:C.amber, bg:`${C.amber}15` },
    verified: { label:"Verified",                color:C.green, bg:`${C.green}15` },
    unknown:  { label:"On file",                 color:C.blue,  bg:`${C.blue}15`  },
  };
  const insCfg = INS_CFG[insStatus];

  const SETTINGS_ITEMS = [
    { label:"Profile",       sub:"Name, phone number",           action:()=>{ setName(tenant?.name||""); setPhone(tenant?.phone||""); setModal("profile"); },  color:C.blue },
    { label:"Notifications", sub:"Rent reminders, alerts",       action:()=>setModal("notifications"), color:C.amber },
    { label:"Password",      sub:"Change your password",         action:()=>setModal("password"),      color:C.textSub },
    { label:"Autopay",       sub:autopay?"Currently on":"Currently off", action:()=>setAutopay(p=>!p), color:autopay?C.green:C.textSub, toggle:true, toggleVal:autopay },
  ];

  const LEASE_ROWS = [
    ["Property",     tenant?.property    || "—"],
    ["Unit",         tenant?.unit        ? `Unit ${tenant.unit}` : "—"],
    ["Lease start",  tenant?.lease_start ? new Date(tenant.lease_start).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}) : "—"],
    ["Lease end",    tenant?.lease_end   ? new Date(tenant.lease_end).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})   : "—"],
    ["Monthly rent", tenant?.rent        ? `$${Number(tenant.rent).toLocaleString()}` : "—"],
  ];

  return (
    <TenantLayout tenantName={name_val}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        .t-menu-item:hover{background:${C.raised}!important;}
        .t-toggle{position:relative;width:40px;height:22px;border-radius:11px;cursor:pointer;transition:background 0.2s;border:none;padding:0;flex-shrink:0;}
        .t-toggle-knob{position:absolute;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left 0.2s;}
        .ins-zone{border:2px dashed ${C.border};border-radius:10px;padding:24px;text-align:center;cursor:pointer;transition:border-color 0.15s;}
        .ins-zone:hover{border-color:${C.goldDim};}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
      `}</style>

      {toast && (
        <div style={{ position:"fixed",top:20,right:20,zIndex:300,background:toast.isError?C.red:C.green,color:"#fff",padding:"10px 18px",borderRadius:8,fontSize:13,fontWeight:500,fontFamily:"'DM Sans',sans-serif",boxShadow:"0 4px 16px rgba(0,0,0,0.4)" }}>
          {toast.msg}
        </div>
      )}

      <div style={{ background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',sans-serif",paddingBottom:80,maxWidth:680,margin:"0 auto" }}>

        {/* Header */}
        <div style={{ background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"28px 20px 24px",textAlign:"center" }}>
          <div style={{ width:68,height:68,borderRadius:"50%",background:`${C.gold}22`,border:`2px solid ${C.goldDim}`,color:C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,margin:"0 auto 14px" }}>{initials}</div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.text,marginBottom:4 }}>{name_val}</div>
          <div style={{ fontSize:12,color:C.textSub,marginBottom:12 }}>{tenant?.email||user?.email||"—"}</div>
          <span style={{ display:"inline-flex",alignItems:"center",gap:6,background:`${C.green}15`,border:`1px solid ${C.green}33`,borderRadius:20,padding:"5px 14px",fontSize:12,color:C.green }}>
            <div style={{ width:6,height:6,borderRadius:"50%",background:C.green }}/> Active tenant · Unit {tenant?.unit||"—"}
          </span>
        </div>

        <div style={{ padding:"20px 20px 0" }}>

          {/* Lease summary */}
          <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,marginTop:4 }}>Lease summary</div>
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",marginBottom:20 }}>
            {LEASE_ROWS.map(([k,v],i)=>(
              <div key={k} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<LEASE_ROWS.length-1?`1px solid ${C.border}`:"none" }}>
                <span style={{ fontSize:13,color:C.textSub }}>{k}</span>
                <span style={{ fontSize:13,fontWeight:500,color:C.text }}>{v}</span>
              </div>
            ))}
            <div style={{ marginTop:14 }}>
              <div style={{ display:"flex",justifyContent:"space-between",fontSize:11,color:C.textSub,marginBottom:6 }}>
                <span>Lease progress</span>
                <span style={{ color:daysLeft<60?C.amber:C.textSub }}>{daysLeft} days remaining</span>
              </div>
              <div style={{ height:4,background:C.raised,borderRadius:2,overflow:"hidden" }}>
                <div style={{ height:"100%",width:`${progress}%`,background:daysLeft<60?C.amber:C.gold,borderRadius:2,transition:"width 0.3s" }}/>
              </div>
            </div>
            {daysLeft<60&&(
              <div style={{ marginTop:12,padding:"10px 12px",background:`${C.amber}12`,border:`1px solid ${C.amber}33`,borderRadius:8,fontSize:12,color:C.amber }}>
                ⚠ Your lease expires in {daysLeft} days. Contact your property manager about renewal.
              </div>
            )}
          </div>

          {/* Renters Insurance */}
          <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10 }}>Renters Insurance</div>
          <div style={{ background:C.surface,border:`1px solid ${insStatus==="verified"?C.green:insStatus==="missing"||insStatus==="expired"?C.red:C.border}`,borderRadius:10,padding:"16px",marginBottom:20 }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:12 }}>
              <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                <div style={{ width:40,height:40,borderRadius:9,background:`${insCfg.color}18`,border:`1px solid ${insCfg.color}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18 }}>
                  {insStatus==="verified"?"✓":insStatus==="expiring"?"⚠":"📄"}
                </div>
                <div>
                  <div style={{ fontSize:13,fontWeight:500,color:C.text,marginBottom:2 }}>
                    {insStatus==="missing"?"No policy on file":"Renters Insurance Policy"}
                  </div>
                  <div style={{ fontSize:11,color:C.textSub }}>
                    {insStatus==="missing"?"Required — please upload your policy":
                     insStatus==="expired"?"Your policy has expired":
                     insStatus==="expiring"?`Expires in ${insDays} days — renew soon`:
                     insuranceExpires?`Expires ${new Date(insuranceExpires).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}`:"Policy on file"}
                  </div>
                </div>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:8,flexShrink:0 }}>
                <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:insCfg.bg,color:insCfg.color }}>{insCfg.label}</span>
                <button onClick={()=>{ setInsuranceFile(null); setInsuranceExpiry(insuranceExpires||""); setModal("insurance"); }}
                  style={{ fontSize:12,fontWeight:500,padding:"6px 12px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:7,color:C.textSub,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                  {insStatus==="missing"?"Upload":"Update"}
                </button>
              </div>
            </div>
            {insuranceUrl&&(
              <a href={insuranceUrl} target="_blank" rel="noreferrer"
                style={{ display:"inline-block",marginTop:12,fontSize:12,color:C.blue,textDecoration:"none" }}>
                View uploaded policy →
              </a>
            )}
          </div>

          {/* Settings */}
          <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10 }}>Settings</div>
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden",marginBottom:20 }}>
            {SETTINGS_ITEMS.map((item,i)=>(
              <div key={item.label} className="t-menu-item" onClick={item.action}
                style={{ display:"flex",alignItems:"center",padding:"14px 16px",borderBottom:i<SETTINGS_ITEMS.length-1?`1px solid ${C.border}`:"none",cursor:"pointer",gap:14,transition:"background 0.12s" }}>
                <div style={{ width:36,height:36,borderRadius:8,background:`${item.color}18`,border:`1px solid ${item.color}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                  <div style={{ width:8,height:8,borderRadius:"50%",background:item.color }}/>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13,fontWeight:500,color:C.text,marginBottom:2 }}>{item.label}</div>
                  <div style={{ fontSize:11,color:C.textSub }}>{item.sub}</div>
                </div>
                {item.toggle?(
                  <button className="t-toggle" style={{ background:item.toggleVal?C.green:C.border }} onClick={e=>{ e.stopPropagation(); item.action(); }}>
                    <div className="t-toggle-knob" style={{ left:item.toggleVal?"21px":"3px" }}/>
                  </button>
                ):(
                  <span style={{ fontSize:16,color:C.textMuted }}>›</span>
                )}
              </div>
            ))}
          </div>

          <button onClick={handleSignOut} style={{ width:"100%",padding:"12px",background:"rgba(224,85,85,0.08)",border:`1px solid rgba(224,85,85,0.2)`,borderRadius:8,fontSize:14,fontWeight:500,color:C.red,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",marginBottom:12 }}>
            Sign out
          </button>
          <div style={{ fontSize:11,color:C.textMuted,textAlign:"center",paddingBottom:8 }}>Modus PM · Built in Columbus, OH</div>
        </div>
      </div>

      {modal==="profile"&&(
        <Modal title="Edit profile" onClose={()=>setModal(null)}>
          <Field label="Full name" value={name} onChange={setName} placeholder="Your name"/>
          <Field label="Phone number" value={phone} onChange={setPhone} placeholder="+1 (555) 000-0000"/>
          <SaveButton onClick={handleSaveProfile} loading={saving}/>
        </Modal>
      )}

      {modal==="password"&&(
        <Modal title="Change password" onClose={()=>setModal(null)}>
          <Field label="New password" value={newPw} onChange={setNewPw} type="password" placeholder="At least 8 characters"/>
          <Field label="Confirm password" value={confirmPw} onChange={setConfirmPw} type="password" placeholder="Repeat new password"/>
          <SaveButton onClick={handleChangePassword} loading={saving}/>
        </Modal>
      )}

      {modal==="notifications"&&(
        <Modal title="Notification preferences" onClose={()=>setModal(null)}>
          {[
            ["Rent reminders",      notifRent,        setNotifRent],
            ["Maintenance updates", notifMaintenance, setNotifMaintenance],
            ["New messages",        notifMessages,    setNotifMessages],
            ["Lease expiry alerts", notifLease,       setNotifLease],
          ].map(([label,val,set])=>(
            <div key={label} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderBottom:`1px solid ${C.border}` }}>
              <span style={{ fontSize:14,color:C.text }}>{label}</span>
              <button className="t-toggle" style={{ background:val?C.green:C.border }} onClick={()=>set(p=>!p)}>
                <div className="t-toggle-knob" style={{ left:val?"21px":"3px" }}/>
              </button>
            </div>
          ))}
          <SaveButton onClick={()=>{ showToast("Preferences saved"); setModal(null); }} loading={false}/>
        </Modal>
      )}

      {modal==="insurance"&&(
        <Modal title="Renters Insurance" onClose={()=>setModal(null)}>
          <p style={{ fontSize:13,color:C.textSub,marginBottom:20,lineHeight:1.6 }}>
            Upload your renters insurance policy (PDF or image). Your property manager will be notified once submitted.
          </p>
          <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display:"none" }}
            onChange={e=>setInsuranceFile(e.target.files[0]||null)}/>
          <div className="ins-zone" onClick={()=>fileInputRef.current?.click()} style={{ marginBottom:16 }}>
            {insuranceFile?(
              <div style={{ fontSize:13,color:C.green,fontWeight:500 }}>✓ {insuranceFile.name}</div>
            ):insuranceUrl?(
              <div>
                <div style={{ fontSize:13,color:C.textSub,marginBottom:4 }}>Policy on file</div>
                <div style={{ fontSize:12,color:C.blue }}>Click to replace</div>
              </div>
            ):(
              <div>
                <div style={{ fontSize:24,marginBottom:8 }}>📄</div>
                <div style={{ fontSize:13,color:C.textSub,marginBottom:4 }}>Click to upload policy</div>
                <div style={{ fontSize:11,color:C.textMuted }}>PDF, JPG, or PNG</div>
              </div>
            )}
          </div>
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6 }}>Policy expiry date</div>
            <input type="date" value={insuranceExpiry} onChange={e=>setInsuranceExpiry(e.target.value)}
              style={{ width:"100%",background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",fontSize:14,color:C.text,fontFamily:"'DM Sans',sans-serif",outline:"none",boxSizing:"border-box" }}/>
          </div>
          <SaveButton onClick={handleInsuranceUpload} loading={uploadingIns} label="Upload policy"/>
        </Modal>
      )}
    </TenantLayout>
  );
}