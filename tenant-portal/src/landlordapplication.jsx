import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";

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

const STATUS = {
  pending:   { label: "Pending",   color: C.amber, bg: `${C.amber}15` },
  approved:  { label: "Approved",  color: C.green, bg: `${C.green}15` },
  declined:  { label: "Declined",  color: C.red,   bg: `${C.red}15`   },
};

function Badge({ status }) {
  const s = STATUS[status] || STATUS.pending;
  return <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:s.bg,color:s.color,whiteSpace:"nowrap" }}>{s.label}</span>;
}

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 24px 16px",borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:600,color:C.text }}>{title}</div>
          <button onClick={onClose} style={{ background:"none",border:"none",color:C.textMuted,cursor:"pointer",fontSize:18 }}>✕</button>
        </div>
        <div style={{ padding:"20px 24px" }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type="text", placeholder, required }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5 }}>
        {label}{required&&<span style={{ color:C.red }}> *</span>}
      </label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{ width:"100%",padding:"10px 12px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,background:C.raised,color:C.text,outline:"none",boxSizing:"border-box",fontFamily:"'DM Sans',sans-serif" }}/>
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, small }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background:"transparent",border:`1px solid ${C.goldDim}`,color:C.gold,fontSize:small?11:13,fontWeight:500,padding:small?"5px 10px":"9px 18px",borderRadius:7,cursor:disabled?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",transition:"background 0.15s",opacity:disabled?0.6:1,whiteSpace:"nowrap" }}
      onMouseOver={e=>!disabled&&(e.currentTarget.style.background="rgba(201,169,110,0.07)")}
      onMouseOut={e=>e.currentTarget.style.background="transparent"}
    >{children}</button>
  );
}

function GhostBtn({ children, onClick, small }) {
  return (
    <button onClick={onClick}
      style={{ background:"transparent",border:`1px solid ${C.border}`,color:C.textSub,fontSize:small?11:13,fontWeight:500,padding:small?"5px 10px":"9px 18px",borderRadius:7,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" }}
      onMouseOver={e=>{ e.currentTarget.style.color=C.text; e.currentTarget.style.borderColor="#353A44"; }}
      onMouseOut={e=>{ e.currentTarget.style.color=C.textSub; e.currentTarget.style.borderColor=C.border; }}
    >{children}</button>
  );
}

function DangerBtn({ children, onClick, small }) {
  return (
    <button onClick={onClick}
      style={{ background:"rgba(224,85,85,0.1)",border:`1px solid rgba(224,85,85,0.25)`,color:C.red,fontSize:small?11:13,fontWeight:500,padding:small?"5px 10px":"9px 18px",borderRadius:7,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" }}
    >{children}</button>
  );
}

export default function LandlordApplications() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [applications, setApplications] = useState([]);
  const [properties,   setProperties]   = useState([]);
  const [units,        setUnits]         = useState([]);
  const [loading,      setLoading]       = useState(true);
  const [selected,     setSelected]      = useState(null);
  const [showAdd,      setShowAdd]       = useState(false);
  const [saving,       setSaving]        = useState(false);
  const [toast,        setToast]         = useState(null);
  const [uploadingReport, setUploadingReport] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [convertingToTenant, setConvertingToTenant] = useState(false);

  // Add form
  const [form, setForm] = useState({ name:"", email:"", phone:"", property_id:"", unit_id:"", move_in_date:"", monthly_income:"", notes:"" });
  const update = (k,v) => setForm(f=>({ ...f, [k]:v }));

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [{ data: apps }, { data: props }, { data: unitData }] = await Promise.all([
      supabase.from("applications").select("*").order("created_at", { ascending: false }),
      supabase.from("properties").select("*"),
      supabase.from("units").select("*"),
    ]);
    setApplications(apps || []);
    setProperties(props || []);
    setUnits(unitData || []);
    setLoading(false);
  }

  function showToast(msg, isError=false) {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3000);
  }

  const filteredUnits = units.filter(u => u.property_id === form.property_id);

  async function handleAddApplication() {
    if (!form.name.trim()) { showToast("Name is required", true); return; }
    setSaving(true);
    const { error } = await supabase.from("applications").insert({
      name:           form.name.trim(),
      email:          form.email.trim() || null,
      phone:          form.phone.trim() || null,
      property_id:    form.property_id || null,
      unit_id:        form.unit_id     || null,
      move_in_date:   form.move_in_date || null,
      monthly_income: form.monthly_income ? parseFloat(form.monthly_income) : null,
      notes:          form.notes.trim() || null,
      status:         "pending",
    });
    setSaving(false);
    if (error) { showToast("Failed to save application", true); return; }
    showToast("Application added");
    setShowAdd(false);
    setForm({ name:"", email:"", phone:"", property_id:"", unit_id:"", move_in_date:"", monthly_income:"", notes:"" });
    fetchAll();
  }

  async function handleUploadReport(appId) {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploadingReport(true);
    const path = `${appId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("screening-reports").upload(path, file, { upsert: true });
    if (upErr) { showToast("Upload failed", true); setUploadingReport(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("screening-reports").getPublicUrl(path);
    const { error: dbErr } = await supabase.from("applications").update({ screening_report_url: publicUrl }).eq("id", appId);
    if (dbErr) { showToast("Failed to save report URL", true); setUploadingReport(false); return; }
    showToast("Report uploaded successfully");
    setUploadingReport(false);
    const updated = { ...selected, screening_report_url: publicUrl };
    setSelected(updated);
    setApplications(prev => prev.map(a => a.id === appId ? updated : a));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleApprove(app) {
    setConvertingToTenant(true);
    // Update application status
    await supabase.from("applications").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", app.id);

    // Create tenant record
    const { data: tenant, error: tenantErr } = await supabase.from("tenants").insert({
      name:       app.name,
      email:      app.email,
      phone:      app.phone,
      unit_id:    app.unit_id,
      move_in_date: app.move_in_date,
    }).select().single();

    if (tenantErr) {
      showToast("Application approved but tenant creation failed — add manually", true);
      setConvertingToTenant(false);
      fetchAll();
      return;
    }

    // Send portal invite
    if (app.email) {
      const unit = units.find(u => u.id === app.unit_id);
      const property = properties.find(p => p.id === app.property_id);
      await supabase.functions.invoke("invite-tenant", {
        body: {
          tenant_id:     tenant.id,
          tenant_name:   app.name,
          tenant_email:  app.email,
          unit_number:   unit?.unit_number || "—",
          property_name: property?.name    || "—",
          landlord_name: "Andrew Wagner",
        }
      });
    }

    setConvertingToTenant(false);
    showToast(`${app.name} approved and invited to portal`);
    setSelected(null);
    fetchAll();
  }

  async function handleDecline(app) {
    await supabase.from("applications").update({
      status:         "declined",
      decline_reason: declineReason.trim() || null,
      decided_at:     new Date().toISOString(),
    }).eq("id", app.id);

    // Send decline email
    if (app.email) {
      await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: app.email,
          subject: "Your rental application — update",
          html: `
            <div style="background:#0A0B0D;padding:32px 20px;font-family:'Helvetica Neue',sans-serif;">
              <div style="background:#111316;border:1px solid #252930;border-radius:12px;max-width:560px;margin:0 auto;overflow:hidden;">
                <div style="padding:24px 32px 20px;border-bottom:1px solid #252930;">
                  <p style="margin:0;font-size:11px;font-weight:600;color:#5C6270;letter-spacing:0.16em;text-transform:uppercase;">MODUS PROPERTY MANAGEMENT</p>
                  <h2 style="margin:8px 0 0;font-size:22px;font-weight:400;color:#EDEAE2;font-family:Georgia,serif;">Application Update</h2>
                </div>
                <div style="padding:24px 32px;">
                  <p style="color:#9095A0;font-size:14px;margin:0 0 16px;">Hi ${app.name},</p>
                  <p style="color:#9095A0;font-size:14px;margin:0 0 16px;">Thank you for your interest in our property. After careful review, we are unable to approve your application at this time.</p>
                  ${declineReason ? `<p style="color:#9095A0;font-size:14px;margin:0 0 16px;">${declineReason}</p>` : ""}
                  <p style="color:#9095A0;font-size:14px;margin:0;">If you have any questions, please don't hesitate to reach out.</p>
                </div>
                <div style="padding:16px 32px;border-top:1px solid #252930;">
                  <p style="margin:0;font-size:11px;color:#5C6270;">Modus Property Management · Columbus, OH</p>
                </div>
              </div>
            </div>
          `,
        }),
      });
    }

    showToast(`${app.name} declined`);
    setShowDeclineModal(false);
    setDeclineReason("");
    setSelected(null);
    fetchAll();
  }

  const pending  = applications.filter(a => a.status === "pending");
  const decided  = applications.filter(a => a.status !== "pending");

  const selectedProperty = selected ? properties.find(p => p.id === selected.property_id) : null;
  const selectedUnit     = selected ? units.find(u => u.id === selected.unit_id) : null;

  return (
    <LandlordLayout openMaintenance={0} unreadMessages={0}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        .app-row:hover td{background:${C.raised}!important;cursor:pointer;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
      `}</style>

      {toast&&(
        <div style={{ position:"fixed",top:20,right:20,zIndex:300,background:toast.isError?C.red:C.green,color:"#fff",padding:"10px 18px",borderRadius:8,fontSize:13,fontWeight:500,fontFamily:"'DM Sans',sans-serif",boxShadow:"0 4px 16px rgba(0,0,0,0.4)" }}>
          {toast.msg}
        </div>
      )}

      <div style={{ background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',sans-serif",padding:"28px 32px 48px" }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:28 }}>
          <div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:600,color:C.text }}>Applications</div>
            <div style={{ fontSize:13,color:C.textSub,marginTop:3 }}>{applications.length} total · {pending.length} pending review</div>
          </div>
          <PrimaryBtn onClick={()=>setShowAdd(true)}>+ New application</PrimaryBtn>
        </div>

        {/* Pending */}
        {pending.length > 0 && (
          <>
            <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10 }}>Pending review</div>
            <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden",marginBottom:24 }}>
              <table style={{ width:"100%",borderCollapse:"collapse" }}>
                <thead>
                  <tr>
                    {["Applicant","Property · Unit","Move-in","Income","Status","Report"].map(h=>(
                      <th key={h} style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",padding:"10px 16px",textAlign:"left",borderBottom:`1px solid ${C.border}`,background:C.raised }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pending.map(app=>{
                    const prop = properties.find(p=>p.id===app.property_id);
                    const unit = units.find(u=>u.id===app.unit_id);
                    return (
                      <tr key={app.id} className="app-row" onClick={()=>setSelected(app)}>
                        <td style={{ padding:"12px 16px",borderBottom:`1px solid ${C.border}` }}>
                          <div style={{ fontSize:13,fontWeight:600,color:C.text }}>{app.name}</div>
                          <div style={{ fontSize:11,color:C.textSub }}>{app.email||"—"}</div>
                        </td>
                        <td style={{ padding:"12px 16px",borderBottom:`1px solid ${C.border}`,fontSize:13,color:C.textSub }}>
                          {prop?.name||"—"}{unit?` · Unit ${unit.unit_number}`:""}
                        </td>
                        <td style={{ padding:"12px 16px",borderBottom:`1px solid ${C.border}`,fontSize:13,color:C.textSub }}>
                          {app.move_in_date?new Date(app.move_in_date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—"}
                        </td>
                        <td style={{ padding:"12px 16px",borderBottom:`1px solid ${C.border}`,fontSize:13,color:C.text,fontWeight:500 }}>
                          {app.monthly_income?`$${Number(app.monthly_income).toLocaleString()}/mo`:"—"}
                        </td>
                        <td style={{ padding:"12px 16px",borderBottom:`1px solid ${C.border}` }}><Badge status={app.status}/></td>
                        <td style={{ padding:"12px 16px",borderBottom:`1px solid ${C.border}` }}>
                          {app.screening_report_url
                            ? <span style={{ fontSize:11,color:C.green,fontWeight:500 }}>✓ Uploaded</span>
                            : <span style={{ fontSize:11,color:C.amber }}>Not uploaded</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Decided */}
        {decided.length > 0 && (
          <>
            <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10 }}>Past applications</div>
            <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
              <table style={{ width:"100%",borderCollapse:"collapse" }}>
                <thead>
                  <tr>
                    {["Applicant","Property · Unit","Decision date","Status"].map(h=>(
                      <th key={h} style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",padding:"10px 16px",textAlign:"left",borderBottom:`1px solid ${C.border}`,background:C.raised }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {decided.map(app=>{
                    const prop = properties.find(p=>p.id===app.property_id);
                    const unit = units.find(u=>u.id===app.unit_id);
                    return (
                      <tr key={app.id} className="app-row" onClick={()=>setSelected(app)}>
                        <td style={{ padding:"12px 16px",borderBottom:`1px solid ${C.border}` }}>
                          <div style={{ fontSize:13,fontWeight:600,color:C.text }}>{app.name}</div>
                          <div style={{ fontSize:11,color:C.textSub }}>{app.email||"—"}</div>
                        </td>
                        <td style={{ padding:"12px 16px",borderBottom:`1px solid ${C.border}`,fontSize:13,color:C.textSub }}>
                          {prop?.name||"—"}{unit?` · Unit ${unit.unit_number}`:""}
                        </td>
                        <td style={{ padding:"12px 16px",borderBottom:`1px solid ${C.border}`,fontSize:13,color:C.textSub }}>
                          {app.decided_at?new Date(app.decided_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—"}
                        </td>
                        <td style={{ padding:"12px 16px",borderBottom:`1px solid ${C.border}` }}><Badge status={app.status}/></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && applications.length === 0 && (
          <div style={{ textAlign:"center",padding:"60px 0",color:C.textSub,fontSize:13,border:`1px dashed ${C.border}`,borderRadius:10 }}>
            No applications yet — click "+ New application" to add one.
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:100,display:"flex",justifyContent:"flex-end" }} onClick={()=>setSelected(null)}>
          <div style={{ width:560,background:C.surface,height:"100vh",overflowY:"auto",borderLeft:`1px solid ${C.border}` }} onClick={e=>e.stopPropagation()}>

            <div style={{ padding:"20px 24px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:17,fontWeight:600,color:C.text }}>{selected.name}</div>
                <div style={{ fontSize:12,color:C.textSub,marginTop:2 }}>{selected.email||"—"} · {selected.phone||"—"}</div>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                <Badge status={selected.status}/>
                <button onClick={()=>setSelected(null)} style={{ background:C.raised,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:13,color:C.textSub }}>✕</button>
              </div>
            </div>

            <div style={{ padding:"20px 24px" }}>

              {/* Info */}
              <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10 }}>Application details</div>
              <div style={{ background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px",marginBottom:20 }}>
                {[
                  ["Property", selectedProperty?.name||"—"],
                  ["Unit", selectedUnit?`Unit ${selectedUnit.unit_number}`:"—"],
                  ["Move-in date", selected.move_in_date?new Date(selected.move_in_date).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}):"—"],
                  ["Monthly income", selected.monthly_income?`$${Number(selected.monthly_income).toLocaleString()}`:"—"],
                  ["Applied", new Date(selected.created_at).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})],
                ].map(([k,v],i,arr)=>(
                  <div key={k} style={{ display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none" }}>
                    <span style={{ fontSize:13,color:C.textSub }}>{k}</span>
                    <span style={{ fontSize:13,fontWeight:500,color:C.text }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Notes */}
              {selected.notes && (
                <>
                  <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8 }}>Notes</div>
                  <div style={{ background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px",marginBottom:20,fontSize:13,color:C.textSub,lineHeight:1.6 }}>{selected.notes}</div>
                </>
              )}

              {/* Screening report */}
              <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10 }}>Screening report</div>
              <div style={{ background:C.raised,border:`1px solid ${selected.screening_report_url?C.green:C.border}`,borderRadius:8,padding:"14px",marginBottom:20 }}>
                {selected.screening_report_url ? (
                  <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                    <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                      <span style={{ fontSize:16 }}>📄</span>
                      <div>
                        <div style={{ fontSize:13,fontWeight:500,color:C.text }}>Report uploaded</div>
                        <a href={selected.screening_report_url} target="_blank" rel="noreferrer"
                          style={{ fontSize:12,color:C.blue,textDecoration:"none" }}>View report →</a>
                      </div>
                    </div>
                    <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:`${C.green}15`,color:C.green }}>On file</span>
                  </div>
                ) : (
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:13,color:C.textSub,marginBottom:12 }}>No screening report uploaded yet</div>
                    <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display:"none" }}
                      onChange={()=>handleUploadReport(selected.id)}/>
                    <PrimaryBtn onClick={()=>fileInputRef.current?.click()} disabled={uploadingReport}>
                      {uploadingReport?"Uploading…":"Upload SmartMove report"}
                    </PrimaryBtn>
                  </div>
                )}
                {selected.screening_report_url && (
                  <div style={{ marginTop:10,textAlign:"center" }}>
                    <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display:"none" }}
                      onChange={()=>handleUploadReport(selected.id)}/>
                    <button onClick={()=>fileInputRef.current?.click()} style={{ fontSize:12,color:C.textMuted,background:"none",border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",textDecoration:"underline" }}>
                      Replace report
                    </button>
                  </div>
                )}
              </div>

              {/* Decline reason */}
              {selected.status==="declined"&&selected.decline_reason&&(
                <div style={{ background:`${C.red}10`,border:`1px solid ${C.red}25`,borderRadius:8,padding:"12px 14px",marginBottom:20 }}>
                  <div style={{ fontSize:11,fontWeight:600,color:C.red,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4 }}>Decline reason</div>
                  <div style={{ fontSize:13,color:C.textSub }}>{selected.decline_reason}</div>
                </div>
              )}

              {/* Actions */}
              {selected.status==="pending"&&(
                <div style={{ display:"flex",gap:10,marginTop:8 }}>
                  <button onClick={()=>handleApprove(selected)} disabled={convertingToTenant}
                    style={{ flex:1,padding:"12px",background:`${C.green}18`,border:`1px solid ${C.green}33`,borderRadius:8,fontSize:14,fontWeight:500,color:C.green,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                    {convertingToTenant?"Creating tenant…":"✓ Approve & invite to portal"}
                  </button>
                  <button onClick={()=>setShowDeclineModal(true)}
                    style={{ flex:1,padding:"12px",background:`${C.red}10`,border:`1px solid rgba(224,85,85,0.25)`,borderRadius:8,fontSize:14,fontWeight:500,color:C.red,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                    ✕ Decline
                  </button>
                </div>
              )}

              {selected.status==="approved"&&(
                <div style={{ padding:"12px 14px",background:`${C.green}10`,border:`1px solid ${C.green}25`,borderRadius:8,fontSize:13,color:C.green,textAlign:"center" }}>
                  ✓ Approved — tenant record created and invite sent
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Application Modal */}
      {showAdd&&(
        <Modal title="New application" onClose={()=>setShowAdd(false)}>
          <Field label="Full name" value={form.name} onChange={v=>update("name",v)} placeholder="Jane Smith" required/>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
            <Field label="Email" value={form.email} onChange={v=>update("email",v)} placeholder="jane@email.com" type="email"/>
            <Field label="Phone" value={form.phone} onChange={v=>update("phone",v)} placeholder="(614) 555-0100"/>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5 }}>Property</label>
            <select value={form.property_id} onChange={e=>{ update("property_id",e.target.value); update("unit_id",""); }}
              style={{ width:"100%",padding:"10px 12px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,background:C.raised,color:form.property_id?C.text:C.textSub,outline:"none",fontFamily:"'DM Sans',sans-serif" }}>
              <option value="">Select property…</option>
              {properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5 }}>Unit</label>
            <select value={form.unit_id} onChange={e=>update("unit_id",e.target.value)} disabled={!form.property_id}
              style={{ width:"100%",padding:"10px 12px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,background:C.raised,color:form.unit_id?C.text:C.textSub,outline:"none",fontFamily:"'DM Sans',sans-serif",opacity:!form.property_id?0.5:1 }}>
              <option value="">Select unit…</option>
              {filteredUnits.map(u=><option key={u.id} value={u.id}>Unit {u.unit_number}</option>)}
            </select>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
            <Field label="Move-in date" value={form.move_in_date} onChange={v=>update("move_in_date",v)} type="date"/>
            <Field label="Monthly income" value={form.monthly_income} onChange={v=>update("monthly_income",v)} placeholder="4500" type="number"/>
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5 }}>Notes</label>
            <textarea value={form.notes} onChange={e=>update("notes",e.target.value)} placeholder="Any additional notes…"
              style={{ width:"100%",padding:"10px 12px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,background:C.raised,color:C.text,outline:"none",fontFamily:"'DM Sans',sans-serif",resize:"vertical",minHeight:70,boxSizing:"border-box" }}/>
          </div>
          <div style={{ display:"flex",gap:10,justifyContent:"flex-end" }}>
            <GhostBtn onClick={()=>setShowAdd(false)}>Cancel</GhostBtn>
            <PrimaryBtn onClick={handleAddApplication} disabled={saving}>{saving?"Saving…":"Add application"}</PrimaryBtn>
          </div>
        </Modal>
      )}

      {/* Decline Modal */}
      {showDeclineModal&&selected&&(
        <Modal title="Decline application" onClose={()=>{ setShowDeclineModal(false); setDeclineReason(""); }}>
          <p style={{ fontSize:13,color:C.textSub,marginBottom:16,lineHeight:1.6 }}>
            Declining will send an email notification to <strong style={{ color:C.text }}>{selected.name}</strong>.
          </p>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5 }}>Reason (optional)</label>
            <textarea value={declineReason} onChange={e=>setDeclineReason(e.target.value)}
              placeholder="e.g. Income does not meet minimum requirements…"
              style={{ width:"100%",padding:"10px 12px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,background:C.raised,color:C.text,outline:"none",fontFamily:"'DM Sans',sans-serif",resize:"vertical",minHeight:80,boxSizing:"border-box" }}/>
          </div>
          <div style={{ display:"flex",gap:10,justifyContent:"flex-end" }}>
            <GhostBtn onClick={()=>{ setShowDeclineModal(false); setDeclineReason(""); }}>Cancel</GhostBtn>
            <DangerBtn onClick={()=>handleDecline(selected)}>Send decline notice</DangerBtn>
          </div>
        </Modal>
      )}
    </LandlordLayout>
  );
}