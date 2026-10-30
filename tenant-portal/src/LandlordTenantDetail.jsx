import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "./supabase";
import { getSignedStorageUrl, extractStoragePath } from "./storageUtils";
import LandlordLayout from "./LandlordLayout";

const C = {
  bg:       "#0C0E12",
  surface:  "#14181F",
  raised:   "#1A1F29",
  border:   "rgba(255,255,255,0.08)",
  text:     "#EDEAE2",
  textSub:  "#9095A0",
  textMuted:"#5C6270",
  gold:     "#C9A96E",
  goldDim:  "#6B4F24",
  blue:     "#4A9AE8",
  green:    "#72B02A",
  red:      "#E05555",
  amber:    "#F0A430",
};

const STATUS = {
  current:     { label:"Current",     color:"#72B02A", bg:"rgba(114,176,42,0.13)"  },
  pending:     { label:"Pending",     color:"#F0A430", bg:"rgba(240,164,48,0.13)"  },
  late:        { label:"Late",        color:"#E05555", bg:"rgba(224,85,85,0.13)"   },
  paid:        { label:"Paid",        color:"#72B02A", bg:"rgba(114,176,42,0.13)"  },
  upcoming:    { label:"Upcoming",    color:"#4A9AE8", bg:"rgba(74,154,232,0.13)"  },
  failed:      { label:"Failed",      color:"#E05555", bg:"rgba(224,85,85,0.13)"   },
  in_progress: { label:"In Progress", color:"#4A9AE8", bg:"rgba(74,154,232,0.13)"  },
  resolved:    { label:"Resolved",    color:"#72B02A", bg:"rgba(114,176,42,0.13)"  },
  open:        { label:"Open",        color:"#F0A430", bg:"rgba(240,164,48,0.13)"  },
};

const TABS = ["Overview","Payments","Recurring","Maintenance","Lease","Inspections","Notes"];
const AVATAR_COLORS = [C.gold, C.blue, C.green, C.amber, C.red];

const ROOM_LABELS = {
  living_room: "Living Room",
  kitchen:     "Kitchen",
  bedroom:     "Bedroom",
  bathroom:    "Bathroom",
  exterior:    "Exterior / Entry",
};

function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

function Badge({ status }) {
  const cfg = STATUS[status];
  if (!cfg) return null;
  return <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:cfg.bg,color:cfg.color,whiteSpace:"nowrap" }}>{cfg.label}</span>;
}

function PrimaryBtn({ children, onClick, disabled, small }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background:"transparent",border:`1px solid ${C.goldDim}`,color:C.gold,fontSize:small?11:12,fontWeight:500,padding:small?"5px 10px":"7px 14px",borderRadius:7,cursor:disabled?"default":"pointer",fontFamily:"'DM Sans',sans-serif",transition:"background 0.15s",opacity:disabled?0.6:1,whiteSpace:"nowrap" }}
      onMouseOver={e=>!disabled&&(e.currentTarget.style.background="rgba(201,169,110,0.07)")}
      onMouseOut={e=>e.currentTarget.style.background="transparent"}
    >{children}</button>
  );
}

function GhostBtn({ children, onClick, disabled, small }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background:"transparent",border:`1px solid ${C.border}`,color:C.textSub,fontSize:small?11:12,fontWeight:500,padding:small?"5px 10px":"7px 14px",borderRadius:7,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s",whiteSpace:"nowrap",opacity:disabled?0.6:1 }}
      onMouseOver={e=>{ e.currentTarget.style.color=C.text; e.currentTarget.style.borderColor="#353A44"; }}
      onMouseOut={e=>{ e.currentTarget.style.color=C.textSub; e.currentTarget.style.borderColor=C.border; }}
    >{children}</button>
  );
}

function DangerBtn({ children, onClick, small }) {
  return (
    <button onClick={onClick}
      style={{ background:"rgba(224,85,85,0.1)",border:`1px solid rgba(224,85,85,0.25)`,color:C.red,fontSize:small?11:12,fontWeight:500,padding:small?"5px 10px":"7px 14px",borderRadius:7,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" }}>
      {children}
    </button>
  );
}

function FieldLabel({ children }) {
  return <label style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.07em",display:"block",marginBottom:5 }}>{children}</label>;
}

function Input({ value, onChange, placeholder, type="text" }) {
  const [focused, setFocused] = useState(false);
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
      style={{ width:"100%",padding:"10px 12px",fontSize:13,border:`1px solid ${focused?C.gold:C.border}`,borderRadius:7,background:C.raised,color:C.text,outline:"none",boxSizing:"border-box",fontFamily:"'DM Sans',sans-serif",boxShadow:focused?"0 0 0 3px rgba(201,169,110,0.08)":"none",transition:"border-color 0.15s" }}
    />
  );
}

function SelectField({ value, onChange, children }) {
  return (
    <select value={value} onChange={onChange}
      style={{ width:"100%",padding:"10px 12px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,background:C.raised,color:value?C.text:C.textSub,outline:"none",boxSizing:"border-box",fontFamily:"'DM Sans',sans-serif",cursor:"pointer" }}>
      {children}
    </select>
  );
}

function InfoCard({ title, children, borderColor }) {
  return (
    <div style={{ background:C.surface,border:`1px solid ${borderColor||C.border}`,borderRadius:10,overflow:"hidden" }}>
      <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",padding:"12px 16px",borderBottom:`1px solid ${C.border}` }}>{title}</div>
      <div style={{ padding:"14px 16px" }}>{children}</div>
    </div>
  );
}

function InfoRow({ label, value, last, valueColor }) {
  return (
    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:last?"none":`1px solid ${C.border}` }}>
      <span style={{ fontSize:13,color:C.textSub }}>{label}</span>
      <span style={{ fontSize:13,fontWeight:500,color:valueColor||C.text }}>{value}</span>
    </div>
  );
}

const TH = ({ children, right }) => (
  <th style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",padding:"10px 14px",textAlign:right?"right":"left",borderBottom:`1px solid ${C.border}`,background:C.raised,whiteSpace:"nowrap" }}>{children}</th>
);
const TD = ({ children, right, bold, color }) => (
  <td style={{ fontSize:13,color:color||(bold?C.text:C.textSub),fontWeight:bold?600:400,padding:"11px 14px",borderBottom:`1px solid ${C.border}`,textAlign:right?"right":"left",verticalAlign:"middle" }}>{children}</td>
);

// ─── Record Payment Modal ──────────────────────────────────────────────────
function RecordPaymentModal({ tenantId, unit, onClose, onSaved }) {
  const [form, setForm] = useState({ amount:"", method:"cash", date:new Date().toISOString().split("T")[0], notes:"" });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const update = (k,v) => setForm(f=>({ ...f,[k]:v }));

  async function submit() {
    if (!form.amount || isNaN(parseFloat(form.amount))) { setError("Enter a valid amount."); return; }
    setSaving(true); setError("");
    const { error:err } = await supabase.from("payments").insert({
      tenant_id:    tenantId,
      amount_cents: Math.round(parseFloat(form.amount)*100),
      status:       "paid",
      source:       form.method,
      paid_at:      form.date ? new Date(form.date).toISOString() : new Date().toISOString(),
      notes:        form.notes||null,
    });
    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,width:440,maxHeight:"90vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"18px 22px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div style={{ fontSize:15,fontWeight:600,color:C.text }}>Record Payment</div>
          <button onClick={onClose} style={{ background:"none",border:"none",fontSize:16,cursor:"pointer",color:C.textSub }}>✕</button>
        </div>
        <div style={{ padding:"16px 22px" }}>
          {error&&<div style={{ background:"rgba(224,85,85,0.1)",color:C.red,fontSize:12,padding:"10px 12px",borderRadius:7,marginBottom:14,border:`1px solid rgba(224,85,85,0.2)` }}>{error}</div>}
          <div style={{ marginBottom:12 }}>
            <FieldLabel>Amount ($) *</FieldLabel>
            <Input type="number" value={form.amount} onChange={e=>update("amount",e.target.value)} placeholder={`${unit?.rent_amount||"0"}.00`}/>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
            <div>
              <FieldLabel>Payment Method</FieldLabel>
              <SelectField value={form.method} onChange={e=>update("method",e.target.value)}>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="venmo">Venmo</option>
                <option value="zelle">Zelle</option>
                <option value="ach">ACH / Bank Transfer</option>
                <option value="other">Other</option>
              </SelectField>
            </div>
            <div>
              <FieldLabel>Payment Date</FieldLabel>
              <Input type="date" value={form.date} onChange={e=>update("date",e.target.value)}/>
            </div>
          </div>
          <div style={{ marginBottom:16 }}>
            <FieldLabel>Notes</FieldLabel>
            <Input value={form.notes} onChange={e=>update("notes",e.target.value)} placeholder="Optional note…"/>
          </div>
        </div>
        <div style={{ padding:"12px 22px 16px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10,justifyContent:"flex-end" }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={saving}>{saving?"Saving…":"Record Payment"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Archive Modal ─────────────────────────────────────────────────────────
function ArchiveModal({ tenantName, onConfirm, onCancel, archiving }) {
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,width:400,padding:"28px 28px 24px" }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.text,marginBottom:10 }}>Archive tenant?</div>
        <div style={{ fontSize:13,color:C.textSub,lineHeight:1.6,marginBottom:24 }}>
          <strong style={{ color:C.text }}>{tenantName}</strong> will be removed from your active tenant list. Their records will be preserved.
        </div>
        <div style={{ display:"flex",gap:10,justifyContent:"flex-end" }}>
          <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
          <DangerBtn onClick={onConfirm}>{archiving?"Archiving…":"Archive tenant"}</DangerBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Insurance Card ────────────────────────────────────────────────────────
function insuranceDaysLeft(expires) {
  if (!expires) return null;
  return Math.ceil((new Date(expires)-new Date())/(1000*60*60*24));
}

function InsuranceCard({ tenant }) {
  const url     = tenant?.insurance_url;
  const expires = tenant?.insurance_expires;
  const days    = insuranceDaysLeft(expires);
  const status  = !url?"missing":days===null?"unknown":days<0?"expired":days<30?"expiring":"verified";
  const CFG = {
    missing:  { label:"Not uploaded",        color:C.red,   bg:`${C.red}15`,   icon:"✕" },
    expired:  { label:"Expired",             color:C.red,   bg:`${C.red}15`,   icon:"✕" },
    expiring: { label:`Expires in ${days}d`, color:C.amber, bg:`${C.amber}15`, icon:"⚠" },
    verified: { label:"Verified",            color:C.green, bg:`${C.green}15`, icon:"✓" },
    unknown:  { label:"On file",             color:C.blue,  bg:`${C.blue}15`,  icon:"📄" },
  };
  const cfg = CFG[status];
  return (
    <div style={{ background:C.surface,border:`1px solid ${status==="verified"?C.green:status==="missing"||status==="expired"?C.red:C.border}`,borderRadius:10,overflow:"hidden" }}>
      <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",padding:"12px 16px",borderBottom:`1px solid ${C.border}` }}>Renters Insurance</div>
      <div style={{ padding:"14px 16px" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:12 }}>
          <div style={{ display:"flex",alignItems:"center",gap:12 }}>
            <div style={{ width:36,height:36,borderRadius:8,background:cfg.bg,border:`1px solid ${cfg.color}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0 }}>{cfg.icon}</div>
            <div>
              <div style={{ fontSize:13,fontWeight:500,color:C.text,marginBottom:2 }}>{status==="missing"?"No policy on file":"Policy on file"}</div>
              <div style={{ fontSize:11,color:C.textSub }}>
                {status==="missing"  ?"Tenant has not uploaded insurance":
                 status==="expired"  ?`Expired ${expires?new Date(expires).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):""}`:
                 status==="expiring" ?`Expires in ${days} days — remind tenant`:
                 expires             ?`Expires ${new Date(expires).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}`:"Expiry date not set"}
              </div>
            </div>
          </div>
          <span style={{ fontSize:10,fontWeight:600,padding:"3px 10px",borderRadius:5,background:cfg.bg,color:cfg.color,flexShrink:0 }}>{cfg.label}</span>
        </div>
        {url&&<a href={url} target="_blank" rel="noreferrer" style={{ display:"inline-block",marginTop:12,fontSize:12,color:C.blue,textDecoration:"none" }}>View policy document →</a>}
        {(status==="missing"||status==="expired"||status==="expiring")&&(
          <div style={{ marginTop:12,padding:"10px 12px",background:`${cfg.color}10`,border:`1px solid ${cfg.color}25`,borderRadius:8,fontSize:12,color:cfg.color }}>
            {status==="missing"?"⚠ Renters insurance is required. Tenant has not uploaded a policy.":
             status==="expired"?"⚠ Policy has expired. Request an updated policy from the tenant.":
             `⚠ Policy expires in ${days} days. Consider sending a renewal reminder.`}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Recurring Charges Tab ─────────────────────────────────────────────────
function RecurringChargesTab({ tenantId, unit, onChargeChanged }) {
  const [charges,    setCharges]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showAdd,    setShowAdd]    = useState(false);
  const [form,       setForm]       = useState({ category:"Rent", amount:"", start_date:"", end_date:"" });
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState("");

  const fetchCharges = useCallback(async () => {
    setLoading(true);
    // recurring_charges.tenant_id references tenants(id) — tenantId IS tenants.id
    const { data } = await supabase.from("recurring_charges").select("*").eq("tenant_id",tenantId).order("created_at",{ascending:false});
    setCharges(data||[]);
    setLoading(false);
  },[tenantId]);

  useEffect(() => { fetchCharges(); },[fetchCharges]);

  const update = (k,v) => setForm(f=>({ ...f,[k]:v }));

  async function addCharge() {
    if (!form.amount||isNaN(parseFloat(form.amount))) { setFormError("Enter a valid amount."); return; }
    setSaving(true); setFormError("");
    const { error } = await supabase.from("recurring_charges").insert({
      tenant_id:  tenantId,
      category:   form.category,
      amount:     parseFloat(form.amount),
      start_date: form.start_date||null,
      end_date:   form.end_date||null,
    });
    setSaving(false);
    if (error) { setFormError(error.message); return; }
    setForm({ category:"Rent",amount:"",start_date:"",end_date:"" });
    setShowAdd(false);
    fetchCharges();
    if (onChargeChanged) onChargeChanged();
  }

  async function toggleStatus(charge) {
    // No status column in DB — charges are active unless deleted
    // This is a no-op; UI hides pause button
    fetchCharges();
  }

  async function deleteCharge(id) {
    if (!window.confirm("Delete this recurring charge?")) return;
    await supabase.from("recurring_charges").delete().eq("id",id);
    fetchCharges();
    if (onChargeChanged) onChargeChanged();
  }

  const totalMonthly = charges.reduce((s,c)=>s+parseFloat(c.amount||0),0);

  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
        <div>
          <div style={{ fontSize:13,fontWeight:600,color:C.text }}>Recurring Charges</div>
          <div style={{ fontSize:12,color:C.textSub,marginTop:2 }}>
            {loading?"Loading…":`${charges.length} active · $${totalMonthly.toLocaleString("en-US",{minimumFractionDigits:2})}/mo`}
          </div>
        </div>
        <PrimaryBtn onClick={()=>setShowAdd(v=>!v)}>
          {showAdd?"Cancel":"+ Add Charge"}
        </PrimaryBtn>
      </div>

      {showAdd&&(
        <div style={{ background:C.raised,border:`1px solid ${C.gold}`,borderRadius:10,padding:"16px",marginBottom:16 }}>
          {formError&&<div style={{ color:C.red,fontSize:12,marginBottom:12 }}>{formError}</div>}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
            <div>
              <FieldLabel>Category</FieldLabel>
              <SelectField value={form.category} onChange={e=>update("category",e.target.value)}>
                {["Rent","Pet Fee","Parking","Utility Surcharge","Other"].map(c=><option key={c}>{c}</option>)}
              </SelectField>
            </div>
            <div>
              <FieldLabel>Monthly Amount ($) *</FieldLabel>
              <Input type="number" value={form.amount} onChange={e=>update("amount",e.target.value)} placeholder="0.00"/>
            </div>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14 }}>
            <div>
              <FieldLabel>Start Date</FieldLabel>
              <Input type="date" value={form.start_date} onChange={e=>update("start_date",e.target.value)}/>
            </div>
            <div>
              <FieldLabel>End Date</FieldLabel>
              <Input type="date" value={form.end_date} onChange={e=>update("end_date",e.target.value)}/>
            </div>
          </div>
          <div style={{ display:"flex",gap:8 }}>
            <PrimaryBtn onClick={addCharge} disabled={saving}>{saving?"Saving…":"Save Charge"}</PrimaryBtn>
            <GhostBtn onClick={()=>{ setShowAdd(false); setFormError(""); }}>Cancel</GhostBtn>
          </div>
        </div>
      )}

      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden" }}>
        {loading?(
          <div style={{ padding:24,textAlign:"center",color:C.textSub,fontSize:13 }}>Loading charges…</div>
        ):charges.length===0?(
          <div style={{ padding:32,textAlign:"center",color:C.textSub,fontSize:13 }}>
            No recurring charges yet.{" "}
            <button onClick={()=>setShowAdd(true)} style={{ background:"none",border:"none",color:C.gold,cursor:"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif" }}>Add one</button>
          </div>
        ):(
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:C.raised }}>
                <TH>Category</TH><TH>Amount</TH><TH>Start → End</TH><TH>Actions</TH>
              </tr>
            </thead>
            <tbody>
              {charges.map(c=>(
                <tr key={c.id} style={{ transition:"background 0.1s" }}
                  onMouseOver={e=>e.currentTarget.style.background=C.raised}
                  onMouseOut={e=>e.currentTarget.style.background="transparent"}>
                  <TD bold>{c.category}</TD>
                  <TD bold>${parseFloat(c.amount||0).toLocaleString("en-US",{minimumFractionDigits:2})}/mo</TD>
                  <TD>
                    <span style={{ fontSize:11 }}>
                      {c.start_date?new Date(c.start_date).toLocaleDateString("en-US",{month:"short",year:"numeric"}):"—"}
                      {" → "}
                      {c.end_date?new Date(c.end_date).toLocaleDateString("en-US",{month:"short",year:"numeric"}):"Ongoing"}
                    </span>
                  </TD>

                  <TD>
                    <div style={{ display:"flex",gap:6 }}>
<button onClick={()=>deleteCharge(c.id)}
                        style={{ background:"transparent",border:`1px solid rgba(224,85,85,0.25)`,color:C.red,fontSize:11,padding:"3px 8px",borderRadius:6,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                        Delete
                      </button>
                    </div>
                  </TD>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Lease Tab ─────────────────────────────────────────────────────────────
function LeaseTab({ tenant, unit, property, onUpdate }) {
  const [form, setForm] = useState({
    lease_start:      tenant.lease_start||"",
    lease_end:        tenant.lease_end||"",
    lease_end_action: tenant.lease_end_action||"month_to_month",
    security_deposit: tenant.security_deposit||tenant.raw?.security_deposit||"",
  });
  const [saving,          setSaving]          = useState(false);
  const [saved,           setSaved]           = useState(false);
  // leaseDocUrl holds a short-lived signed URL for display only (not stored in DB)
  const [leaseDocUrl,     setLeaseDocUrl]     = useState("");
  // leaseDocStored tracks whether a document path is on file (truthy = yes)
  const [leaseDocStored,  setLeaseDocStored]  = useState(!!(tenant.lease_document_url));
  const [uploading,       setUploading]       = useState(false);
  const [uploadMsg,       setUploadMsg]       = useState("");
  const [uploadErr,       setUploadErr]       = useState("");

  // On mount: if tenant has a stored path/URL, generate a signed URL for display
  useEffect(() => {
    if (tenant.lease_document_url) {
      getSignedStorageUrl("lease-documents", tenant.lease_document_url)
        .then(signed => { if (signed) setLeaseDocUrl(signed); });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (k,v) => setForm(f=>({ ...f,[k]:v }));

  async function uploadLeaseDoc(file) {
    if (!file) return;
    if (file.type !== "application/pdf") { setUploadErr("Please upload a PDF file."); return; }
    if (file.size > 20 * 1024 * 1024) { setUploadErr("File must be under 20 MB."); return; }
    setUploading(true); setUploadMsg(""); setUploadErr("");
    const path = `${tenant.id}/lease-${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage.from("lease-documents").upload(path, file, { upsert: true, contentType: "application/pdf" });
    if (upErr) { setUploadErr(upErr.message); setUploading(false); return; }
    // Store the object PATH in DB (not a public URL) — bucket is/will be private
    const { error: dbErr } = await supabase.from("tenants").update({ lease_document_url: path }).eq("id", tenant.id);
    if (dbErr) { setUploadErr(dbErr.message); setUploading(false); return; }
    // Generate a short-lived signed URL for immediate display
    const signed = await getSignedStorageUrl("lease-documents", path);
    setLeaseDocUrl(signed || "");
    setLeaseDocStored(true);
    setUploadMsg("Lease uploaded — tenant can now view it in their portal.");
    setUploading(false);
    setTimeout(() => setUploadMsg(""), 5000);
  }

  async function removeLeaseDoc() {
    await supabase.from("tenants").update({ lease_document_url: null }).eq("id", tenant.id);
    setLeaseDocUrl("");
    setLeaseDocStored(false);
    setUploadMsg("Lease document removed.");
    setTimeout(() => setUploadMsg(""), 3000);
  }

  const [saveErr, setSaveErr] = useState("");
  async function save() {
    setSaving(true); setSaved(false); setSaveErr("");
    // Build update payload — only include columns that exist in schema
    // Only update columns confirmed to exist in schema
    const payload = {
      lease_start:      form.lease_start||null,
      lease_end:        form.lease_end||null,
      security_deposit: form.security_deposit ? parseFloat(form.security_deposit) : null,
    };
    const { error: err } = await supabase.from("tenants").update(payload).eq("id",tenant.id);
    setSaving(false);
    if (!err) {
      setSaved(true);
      setTimeout(()=>setSaved(false),2000);
    } else {
      setSaveErr(err.message);
      console.error("Lease save error:", err);
    }
  }

  const parseDateLocal = (s) => { if (!s) return null; const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
  const leaseEnd   = parseDateLocal(form.lease_end);
  const leaseStart = form.lease_start ? new Date(form.lease_start) : null;
  const daysLeft   = leaseEnd ? Math.ceil((leaseEnd.getTime()-Date.now())/86400000) : null;
  const progress   = leaseStart&&leaseEnd ? Math.min(100,Math.max(0,Math.round(((Date.now()-leaseStart.getTime())/(leaseEnd.getTime()-leaseStart.getTime()))*100))) : 0;

  return (
    <div style={{ display:"grid",gridTemplateColumns:"1fr",gap:14 }}>
      {/* Renewal banner */}
      {daysLeft!==null&&daysLeft>0&&daysLeft<=90&&(
        <div style={{ background:"rgba(240,164,48,0.08)",border:`1px solid rgba(240,164,48,0.25)`,borderRadius:10,padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12 }}>
          <div>
            <div style={{ fontSize:13,fontWeight:600,color:C.amber,marginBottom:2 }}>⚠ Lease Ending Soon</div>
            <div style={{ fontSize:12,color:C.textSub }}>{daysLeft} days remaining · expires {new Date(form.lease_end).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
          </div>
          <span style={{ fontSize:11,fontWeight:600,padding:"4px 12px",borderRadius:6,background:"rgba(240,164,48,0.15)",color:C.amber,border:"1px solid rgba(240,164,48,0.3)",whiteSpace:"nowrap" }}>
            Renewal Needed
          </span>
        </div>
      )}
      {daysLeft!==null&&daysLeft<=0&&(
        <div style={{ background:"rgba(224,85,85,0.08)",border:`1px solid rgba(224,85,85,0.25)`,borderRadius:10,padding:"14px 18px" }}>
          <div style={{ fontSize:13,fontWeight:600,color:C.red }}>✕ Lease Expired</div>
          <div style={{ fontSize:12,color:C.textSub,marginTop:2 }}>This tenant's lease has expired. Update lease terms or archive the tenant.</div>
        </div>
      )}

      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"18px 20px" }}>
        <div style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:14 }}>Lease Dates</div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14 }}>
          <div><FieldLabel>Lease Start</FieldLabel><Input type="date" value={form.lease_start} onChange={e=>update("lease_start",e.target.value)}/></div>
          <div><FieldLabel>Lease End</FieldLabel><Input type="date" value={form.lease_end} onChange={e=>update("lease_end",e.target.value)}/></div>
        </div>

        {leaseStart&&leaseEnd&&leaseEnd>leaseStart&&(
          <div style={{ marginBottom:14 }}>
            <div style={{ height:4,background:C.raised,borderRadius:2,overflow:"hidden",marginBottom:4 }}>
              <div style={{ height:"100%",width:`${progress}%`,background:daysLeft&&daysLeft<=30?C.red:daysLeft&&daysLeft<=90?C.amber:C.gold,borderRadius:2,transition:"width 0.3s" }}/>
            </div>
            <div style={{ display:"flex",justifyContent:"space-between",fontSize:10,color:C.textMuted }}>
              <span>{progress}% through lease</span>
              {daysLeft!==null&&daysLeft>0&&<span>{daysLeft} days remaining</span>}
            </div>
          </div>
        )}

        <div style={{ marginBottom:14 }}>
          <FieldLabel>Security Deposit</FieldLabel>
          <div style={{ position:"relative" }}>
            <span style={{ position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:C.textSub,fontSize:13,pointerEvents:"none" }}>$</span>
            <Input type="number" value={form.security_deposit} onChange={e=>update("security_deposit",e.target.value)} style={{ paddingLeft:24 }} placeholder="0.00"/>
          </div>
        </div>

        <div style={{ marginBottom:16 }}>
          <FieldLabel>At Lease Expiration</FieldLabel>
          <div style={{ display:"flex",gap:8 }}>
            {[
              { val:"month_to_month", label:"Month-to-Month", desc:"Auto-continue at same rent" },
              { val:"terminate",      label:"Terminate Lease", desc:"End lease, notify tenant" },
            ].map(opt=>(
              <div key={opt.val} onClick={()=>update("lease_end_action",opt.val)}
                style={{ flex:1,padding:"12px 14px",borderRadius:8,border:`1px solid ${form.lease_end_action===opt.val?C.gold:C.border}`,background:form.lease_end_action===opt.val?"rgba(201,169,110,0.06)":C.raised,cursor:"pointer",transition:"all 0.15s" }}>
                <div style={{ fontSize:12,fontWeight:600,color:form.lease_end_action===opt.val?C.gold:C.text,marginBottom:3 }}>{opt.label}</div>
                <div style={{ fontSize:11,color:C.textSub }}>{opt.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display:"flex",alignItems:"center",gap:12 }}>
          <PrimaryBtn onClick={save} disabled={saving}>{saved?"✓ Saved!":saving?"Saving…":"Save Lease Terms"}</PrimaryBtn>
          <span style={{ fontSize:11,color:C.textMuted,fontStyle:"italic" }}>Changes here do not create payment requests. Visit Financials to manage payments.</span>
        </div>
        {saveErr&&<div style={{ marginTop:8,fontSize:12,color:C.red,background:"rgba(224,85,85,0.1)",border:`1px solid ${C.red}`,borderRadius:6,padding:"8px 12px" }}>Save failed: {saveErr}</div>}
      </div>

      {/* Read-only summary */}
      <InfoCard title="Lease Summary">
        <InfoRow label="Monthly Rent"    value={unit?.rent_amount?`$${parseFloat(unit.rent_amount).toLocaleString("en-US",{minimumFractionDigits:2})}`:"—"}/>
        <InfoRow label="Term Type"       value={form.lease_end_action==="month_to_month"?"Month-to-Month":"Fixed Term"}/>
        <InfoRow label="Bedrooms"        value={unit?.bedrooms??"—"}/>
        <InfoRow label="Bathrooms"       value={unit?.bathrooms??"—"}/>
        <InfoRow label="Payment Due Day" value={unit?.payment_due_day?`${unit.payment_due_day}${unit.payment_due_day===1?"st":unit.payment_due_day===2?"nd":unit.payment_due_day===3?"rd":"th"} of month`:"—"} last/>
      </InfoCard>

      {/* ── Lease Document Upload ─────────────────────────────── */}
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"18px 20px" }}>
        <div style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:14 }}>Lease Document</div>

        {uploadMsg && (
          <div style={{ background:"rgba(114,176,42,0.10)",border:`1px solid rgba(114,176,42,0.25)`,borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:12,color:C.green }}>
            ✓ {uploadMsg}
          </div>
        )}
        {uploadErr && (
          <div style={{ background:"rgba(224,85,85,0.10)",border:`1px solid rgba(224,85,85,0.25)`,borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:12,color:C.red }}>
            {uploadErr}
          </div>
        )}

        {leaseDocStored ? (
          <div>
            <div style={{ display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:C.raised,borderRadius:8,border:`1px solid ${C.border}`,marginBottom:12 }}>
              <div style={{ width:36,height:36,borderRadius:7,background:`rgba(74,154,232,0.12)`,border:`1px solid rgba(74,154,232,0.2)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0 }}>📄</div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:13,fontWeight:500,color:C.text }}>Lease Agreement</div>
                <div style={{ fontSize:11,color:C.textSub }}>Visible to tenant in their portal</div>
              </div>
              {leaseDocUrl ? (
                <a href={leaseDocUrl} target="_blank" rel="noreferrer"
                  style={{ fontSize:12,color:C.blue,textDecoration:"none",fontWeight:500,flexShrink:0 }}>
                  View →
                </a>
              ) : (
                <span style={{ fontSize:12,color:C.textMuted,flexShrink:0 }}>Loading…</span>
              )}
            </div>
            <div style={{ display:"flex",gap:8 }}>
              <label style={{ flex:1,padding:"10px 14px",background:"rgba(201,169,110,0.08)",border:`1px solid ${C.gold}`,borderRadius:7,fontSize:12,fontWeight:500,color:C.gold,cursor:"pointer",textAlign:"center",display:"block" }}>
                {uploading ? "Uploading…" : "Replace document"}
                <input type="file" accept="application/pdf" style={{ display:"none" }} disabled={uploading}
                  onChange={e => uploadLeaseDoc(e.target.files?.[0])}/>
              </label>
              <button onClick={removeLeaseDoc}
                style={{ padding:"10px 14px",background:"none",border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,color:C.textSub,cursor:"pointer" }}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ textAlign:"center",padding:"20px 0 16px",marginBottom:12 }}>
              <div style={{ width:48,height:48,borderRadius:"50%",background:"rgba(74,154,232,0.10)",border:`1px solid rgba(74,154,232,0.2)`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px",fontSize:22 }}>📄</div>
              <div style={{ fontSize:13,fontWeight:500,color:C.text,marginBottom:4 }}>No lease document uploaded</div>
              <div style={{ fontSize:12,color:C.textSub,lineHeight:1.5 }}>Upload a PDF — the tenant will see it in their portal under Lease &amp; Docs.</div>
            </div>
            <label style={{ display:"block",width:"100%",padding:"11px 14px",background:"rgba(201,169,110,0.08)",border:`1px solid ${C.gold}`,borderRadius:7,fontSize:13,fontWeight:500,color:C.gold,cursor:"pointer",textAlign:"center",boxSizing:"border-box" }}>
              {uploading ? "Uploading…" : "Upload lease PDF"}
              <input type="file" accept="application/pdf" style={{ display:"none" }} disabled={uploading}
                onChange={e => uploadLeaseDoc(e.target.files?.[0])}/>
            </label>
            <div style={{ fontSize:11,color:C.textMuted,textAlign:"center",marginTop:8 }}>PDF only · max 20 MB</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function LandlordTenantDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const width    = useWindowWidth();
  const isMobile = width < 768;

  const [tenant,       setTenant]       = useState(null);
  const [unit,         setUnit]         = useState(null);
  const [property,     setProperty]     = useState(null);
  const [payments,     setPayments]     = useState([]);
  const [maintenance,  setMaintenance]  = useState([]);
  const [checklist,    setChecklist]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [activeTab,    setActiveTab]    = useState("Overview");
  const [notes,        setNotes]        = useState("");
  const [noteSaved,    setNoteSaved]    = useState(false);
  const [savingNotes,  setSavingNotes]  = useState(false);
  const [inviting,     setInviting]     = useState(false);
  const [inviteSent,   setInviteSent]   = useState(false);
  const [inviteError,  setInviteError]  = useState("");
  const [showArchive,  setShowArchive]  = useState(false);
  const [archiving,    setArchiving]    = useState(false);
  const [showRecordPmt,setShowRecordPmt]= useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data:tenantData } = await supabase.from("tenants").select("*").eq("id",id).single();
    if (!tenantData) { setLoading(false); return; }
    setTenant(tenantData);
    setNotes(tenantData.notes||"");
    const [{ data:unitData },{ data:paymentsData },{ data:maintData },{ data:checklistData }] = await Promise.all([
      supabase.from("units").select("*, properties(*)").eq("id",tenantData.unit_id).single(),
      supabase.from("payments").select("*").eq("tenant_id",id).order("created_at",{ascending:false}),
      supabase.from("maintenance_requests").select("*").eq("tenant_id",id).order("created_at",{ascending:false}),
      supabase.from("move_in_checklist").select("*").eq("tenant_id",id).order("created_at",{ascending:true}),
    ]);
    setUnit(unitData||null);
    setProperty(unitData?.properties||null);
    setPayments(paymentsData||[]);
    setMaintenance(maintData||[]);
    setChecklist(checklistData||[]);
    setLoading(false);
  },[id]);

  useEffect(() => { fetchAll(); },[fetchAll]);

  // SECURITY: Never expose landlord personal name — always use company name
  async function sendInvite() {
    if (!tenant.email) { setInviteError("No email on tenant record."); return; }
    setInviting(true); setInviteError("");
    const { error } = await supabase.functions.invoke("invite-tenant", {
      body: { tenant_id:tenant.id, tenant_name:tenant.name, tenant_email:tenant.email, unit_number:unit?.unit_number||"—", property_name:property?.name||"—", landlord_name:"Modus Property Management" }
    });
    setInviting(false);
    if (error) { setInviteError(error.message); return; }
    setInviteSent(true);
    await supabase.from("tenants").update({ invite_sent_at:new Date().toISOString() }).eq("id",id);
    fetchAll();
  }

  async function archiveTenant() {
    setArchiving(true);
    await supabase.from("tenants").update({archived:true}).eq("id",id);
    setArchiving(false);
    navigate("/landlord/tenants");
  }

  async function saveNotes() {
    setSavingNotes(true);
    await supabase.from("tenants").update({notes}).eq("id",id);
    setSavingNotes(false);
    setNoteSaved(true);
    setTimeout(()=>setNoteSaved(false),2000);
  }

  if (loading) return <LandlordLayout><div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg,color:C.textSub,fontSize:14 }}>Loading tenant…</div></LandlordLayout>;
  if (!tenant) return <LandlordLayout><div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg,color:C.textSub,fontSize:14 }}>Tenant not found.</div></LandlordLayout>;

  const initials      = (tenant.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const accentColor   = AVATAR_COLORS[0];
  const latestPayment = payments[0];
  // Declare dates first to avoid temporal dead zone
  // Parse date strings as LOCAL dates (not UTC) to avoid off-by-one-day in ET
  const parseDateLocal = (s) => { if (!s) return null; const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
  const leaseEnd   = parseDateLocal(tenant.lease_end);
  const leaseStart = parseDateLocal(tenant.lease_start);
  // Determine status — never flag overdue/pending if lease hasn't started yet
  const leaseStarted = leaseStart ? leaseStart.getTime() <= Date.now() : true;
  let status = "current";
  if (!leaseStarted) {
    status = "upcoming";
  } else if (latestPayment?.status==="failed") {
    status = "late";
  } else if (!latestPayment||latestPayment.status==="pending") {
    status = "pending";
  }
  const balance    = !leaseStarted ? 0 : (status!=="paid"&&latestPayment?.status!=="paid"?(unit?.rent_amount||0):0);
  const daysLeft   = leaseEnd ? Math.ceil((leaseEnd.getTime()-Date.now())/86400000) : null;
  const progress   = leaseStart&&leaseEnd ? Math.min(100,Math.max(0,Math.round(((Date.now()-leaseStart.getTime())/(leaseEnd.getTime()-leaseStart.getTime()))*100))) : 0;
  const completedChecklist = checklist.filter(r=>r.completed).length;
  const insDays    = insuranceDaysLeft(tenant.insurance_expires);

  const isRegistered = !!tenant.user_id;
  const isInvited    = !tenant.user_id && !!tenant.invite_sent_at;

  return (
    <LandlordLayout openMaintenance={0} unreadMessages={0}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        .m-row:hover td{background:${C.raised}!important;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
      `}</style>

      <div style={{ background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',sans-serif",padding:isMobile?"20px 16px":"28px 32px 48px" }}>

        <button onClick={()=>navigate("/landlord/tenants")} style={{ display:"flex",alignItems:"center",gap:6,fontSize:12,color:C.gold,background:"none",border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",marginBottom:20,padding:0 }}
          onMouseOver={e=>e.currentTarget.style.color=C.gold}
          onMouseOut={e=>e.currentTarget.style.color=C.goldDim}
        >← Back to Tenants</button>

        {tenant.archived&&(
          <div style={{ background:"rgba(240,164,48,0.1)",border:`1px solid rgba(240,164,48,0.25)`,borderRadius:8,padding:"10px 16px",marginBottom:16,fontSize:13,color:C.amber,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
            <span>⚠ This tenant is archived.</span>
            <button onClick={async()=>{ await supabase.from("tenants").update({archived:false}).eq("id",id); fetchAll(); }} style={{ background:"none",border:"none",color:C.amber,cursor:"pointer",fontSize:12,fontFamily:"'DM Sans',sans-serif",textDecoration:"underline" }}>Unarchive</button>
          </div>
        )}

        {/* ─── Compact Executive Header ─────────────────────────── */}
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 22px",marginBottom:20 }}>
          {/* Top row: avatar + name + actions */}
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap",marginBottom:12 }}>
            <div style={{ display:"flex",alignItems:"center",gap:14 }}>
              <div style={{ width:46,height:46,borderRadius:"50%",background:`${accentColor}22`,border:`1px solid ${accentColor}44`,color:accentColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,flexShrink:0 }}>{initials}</div>
              <div>
                <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.text,lineHeight:1.2 }}>{tenant.name}</div>
                <div style={{ fontSize:12,color:C.textSub,marginTop:3 }}>
                  {property?.name||"—"} · Unit {unit?.unit_number||"—"}
                  {property?.address&&` · ${property.address}`}
                </div>
              </div>
            </div>
            {/* Action buttons */}
            <div style={{ display:"flex",gap:7,flexWrap:"wrap",alignItems:"center" }}>
              <PrimaryBtn onClick={()=>navigate("/landlord/messages")}>Message</PrimaryBtn>
              <PrimaryBtn onClick={()=>setShowRecordPmt(true)}>Record Payment</PrimaryBtn>
              {!tenant.user_id&&(
                inviteSent
                  ? <span style={{ fontSize:12,color:C.green,fontWeight:500 }}>✓ Invite sent</span>
                  : <GhostBtn onClick={sendInvite} disabled={inviting}>{inviting?"Sending…":"Send Invite"}</GhostBtn>
              )}
              {tenant.eviction_watch&&<DangerBtn>Send Notice</DangerBtn>}
              {!tenant.archived&&<DangerBtn onClick={()=>setShowArchive(true)}>Archive</DangerBtn>}
            </div>
          </div>
          {inviteError&&<div style={{ fontSize:11,color:C.red,marginBottom:8 }}>{inviteError}</div>}

          {/* Bottom row: contact info + status badges */}
          <div style={{ display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",borderTop:`1px solid ${C.border}`,paddingTop:12 }}>
            {/* Contact */}
            <div style={{ display:"flex",gap:14,flexWrap:"wrap" }}>
              {tenant.email&&<span style={{ fontSize:12,color:C.textSub }}>✉ {tenant.email}</span>}
              {tenant.phone&&<span style={{ fontSize:12,color:C.textSub }}>☎ {tenant.phone}</span>}
            </div>
            {/* Divider */}
            <div style={{ width:1,height:16,background:C.border,flexShrink:0 }}/>
            {/* Status badges */}
            <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
              {/* Payment */}
              <Badge status={status}/>
              {/* Registration */}
              {isRegistered
                ? <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:"rgba(114,176,42,0.12)",color:C.green,border:"1px solid rgba(114,176,42,0.2)" }}>✓ Registered</span>
                : isInvited
                  ? <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:"rgba(74,154,232,0.1)",color:C.blue,border:"1px solid rgba(74,154,232,0.2)" }}>✉ Invite Sent</span>
                  : <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:"rgba(92,98,112,0.15)",color:C.textSub,border:`1px solid ${C.border}` }}>✕ Not Invited</span>
              }
              {/* Autopay */}
              {tenant.autopay_enabled
                ? <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:"rgba(114,176,42,0.12)",color:C.green,border:"1px solid rgba(114,176,42,0.2)" }}>✓ Autopay On</span>
                : <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:"rgba(92,98,112,0.12)",color:C.textSub,border:`1px solid ${C.border}` }}>✕ Autopay Off</span>
              }
              {/* Lease countdown */}
              {daysLeft!==null&&daysLeft>0&&daysLeft<=90&&(
                <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:"rgba(240,164,48,0.13)",color:C.amber,border:"1px solid rgba(240,164,48,0.2)" }}>⚠ Lease: {daysLeft}d</span>
              )}
              {daysLeft!==null&&daysLeft<=0&&(
                <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:"rgba(224,85,85,0.12)",color:C.red,border:"1px solid rgba(224,85,85,0.2)" }}>Lease Expired</span>
              )}
              {!tenant.insurance_url&&(
                <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:`${C.red}15`,color:C.red }}>No Insurance</span>
              )}
              {tenant.eviction_watch&&(
                <span style={{ fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:5,background:"rgba(224,85,85,0.15)",color:C.red,border:"1px solid rgba(224,85,85,0.3)" }}>⚠ Eviction Watch</span>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display:"flex",borderBottom:`1px solid ${C.border}`,marginBottom:20,overflowX:"auto" }}>
          {TABS.map(tab=>(
            <button key={tab} onClick={()=>setActiveTab(tab)}
              style={{ padding:"10px 16px",fontSize:13,fontWeight:activeTab===tab?600:400,color:activeTab===tab?C.gold:C.textSub,background:"none",border:"none",borderBottom:activeTab===tab?`2px solid ${C.gold}`:"2px solid transparent",marginBottom:-1,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"color 0.15s",whiteSpace:"nowrap" }}>
              {tab}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {activeTab==="Overview"&&(
          <div style={{ display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:12 }}>
            <InfoCard title="Balance">
              <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:600,color:balance>0?C.red:C.green,marginBottom:4 }}>
                {balance>0?`-$${balance.toLocaleString()}`:"$0.00"}
              </div>
              <div style={{ fontSize:12,color:balance>0?C.red:(!leaseStarted?C.textSub:C.green),marginBottom:balance>0?14:0 }}>
                {balance>0?"Amount overdue":(!leaseStarted?(`Lease starts ${leaseStart.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`):"Fully paid ✓")}
              </div>
              {balance>0&&<PrimaryBtn>Send payment reminder</PrimaryBtn>}
            </InfoCard>

            <InfoCard title="Lease Overview">
              <InfoRow label="Monthly rent"   value={unit?.rent_amount?`$${parseFloat(unit.rent_amount).toLocaleString("en-US",{minimumFractionDigits:2})}`:"—"}/>
              <InfoRow label="Lease start"    value={tenant.lease_start?parseDateLocal(tenant.lease_start).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—"}/>
              <InfoRow label="Lease end"      value={tenant.lease_end?parseDateLocal(tenant.lease_end).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—"}/>
              <InfoRow label="Days remaining"    value={daysLeft!==null?(daysLeft>0?`${daysLeft} days`:"Expired"):"—"}/>
              <InfoRow label="Security deposit" value={tenant.security_deposit?`$${parseFloat(tenant.security_deposit).toLocaleString("en-US",{minimumFractionDigits:2})}`:"—"} last/>
              {leaseStart&&leaseEnd&&leaseEnd>leaseStart&&(
                <>
                  <div style={{ height:4,background:C.raised,borderRadius:2,overflow:"hidden",marginTop:12 }}>
                    <div style={{ height:"100%",width:`${progress}%`,background:daysLeft&&daysLeft<=30?C.red:daysLeft&&daysLeft<=90?C.amber:C.gold,borderRadius:2 }}/>
                  </div>
                  <div style={{ fontSize:10,color:C.textMuted,marginTop:4 }}>{progress}% through lease</div>
                </>
              )}
            </InfoCard>

            <InfoCard title="Unit Info">
              <InfoRow label="Property"  value={property?.name||"—"}/>
              <InfoRow label="Unit"      value={unit?.unit_number||"—"}/>
              <InfoRow label="Bedrooms"  value={unit?.bedrooms??"—"}/>
              <InfoRow label="Bathrooms" value={unit?.bathrooms??"—"}/>
              <InfoRow label="Rent"      value={unit?.rent_amount?`$${parseFloat(unit.rent_amount).toLocaleString("en-US",{minimumFractionDigits:2})}/mo`:"—"} last/>
            </InfoCard>

            <InfoCard title="Emergency Contact">
              {tenant.emergency_contact_name?(
                <>
                  <InfoRow label="Name"         value={tenant.emergency_contact_name}/>
                  <InfoRow label="Phone"        value={tenant.emergency_contact_phone||"—"}/>
                  <InfoRow label="Relationship" value={tenant.emergency_contact_relationship||"—"} last/>
                </>
              ):(
                <div style={{ fontSize:13,color:C.textMuted,textAlign:"center",padding:"8px 0" }}>No emergency contact provided</div>
              )}
            </InfoCard>

            <div style={{ gridColumn:isMobile?"1":"1 / -1" }}>
              <InsuranceCard tenant={tenant}/>
            </div>
          </div>
        )}

        {/* ── Payments ── */}
        {activeTab==="Payments"&&(
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
            <div style={{ padding:"14px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <div>
                <div style={{ fontSize:13,fontWeight:600,color:C.text }}>Payment history</div>
                <div style={{ fontSize:12,color:C.textSub,marginTop:2 }}>{payments.length} payments recorded</div>
              </div>
              <PrimaryBtn onClick={()=>setShowRecordPmt(true)}>+ Record Payment</PrimaryBtn>
            </div>
            {payments.length===0?(
              <div style={{ textAlign:"center",padding:32,color:C.textSub,fontSize:13 }}>No payment history yet.</div>
            ):(
              <table style={{ width:"100%",borderCollapse:"collapse" }}>
                <thead><tr><TH>Date</TH><TH right>Amount</TH><TH>Status</TH><TH>Source</TH></tr></thead>
                <tbody>
                  {payments.map((p,i)=>(
                    <tr key={i} className="m-row">
                      <TD>{new Date(p.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</TD>
                      <TD right bold>${((p.amount_cents||0)/100).toLocaleString("en-US",{minimumFractionDigits:2})}</TD>
                      <TD><Badge status={p.status}/></TD>
                      <TD>{p.source||"—"}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Recurring Charges ── */}
        {activeTab==="Recurring"&&(
          <RecurringChargesTab tenantId={id} unit={unit} onChargeChanged={fetchAll}/>
        )}

        {/* ── Maintenance ── */}
        {activeTab==="Maintenance"&&(
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",borderBottom:`1px solid ${C.border}` }}>
              <div style={{ fontSize:13,fontWeight:600,color:C.text }}>Maintenance history</div>
              <GhostBtn onClick={()=>navigate("/landlord/maintenance")}>View all</GhostBtn>
            </div>
            {maintenance.length===0?(
              <div style={{ textAlign:"center",padding:32,color:C.green,fontSize:13 }}>No maintenance requests for this tenant.</div>
            ):(
              <table style={{ width:"100%",borderCollapse:"collapse" }}>
                <thead><tr><TH>Date</TH><TH>Issue</TH><TH>Category</TH><TH>Priority</TH><TH>Status</TH></tr></thead>
                <tbody>
                  {maintenance.map((m,i)=>(
                    <tr key={i} className="m-row">
                      <TD>{new Date(m.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</TD>
                      <TD bold>{m.title}</TD>
                      <TD>{m.category||"—"}</TD>
                      <TD><Badge status={m.priority==="high"||m.priority==="urgent"?"late":"upcoming"}/></TD>
                      <TD><Badge status={m.status}/></TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Lease ── */}
        {activeTab==="Lease"&&(
          <LeaseTab tenant={tenant} unit={unit} property={property} onUpdate={fetchAll}/>
        )}

        {/* ── Inspections ── */}
        {activeTab==="Inspections"&&(
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"20px 18px" }}>
            <div style={{ fontSize:13,fontWeight:600,color:C.text,marginBottom:4 }}>Inspections</div>
            <div style={{ fontSize:12,color:C.textSub,marginBottom:18 }}>
              View and manage property inspection records for this tenant.
            </div>
            <a
              href="/landlord/inspections"
              style={{ display:"inline-block",padding:"10px 20px",background:"rgba(201,169,110,0.12)",borderRadius:8,fontSize:13,fontWeight:500,color:C.gold,textDecoration:"none",fontFamily:"'DM Sans',sans-serif" }}
            >
              Open Inspections →
            </a>
          </div>
        )}

                {/* ── Notes ── */}
        {activeTab==="Notes"&&(
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
            <div style={{ padding:"14px 16px",borderBottom:`1px solid ${C.border}` }}>
              <div style={{ fontSize:13,fontWeight:600,color:C.text }}>Private notes</div>
              <div style={{ fontSize:11,color:C.textMuted,marginTop:2 }}>Only visible to you — never shown to the tenant</div>
            </div>
            <div style={{ padding:16 }}>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Add private notes about this tenant…"
                style={{ width:"100%",minHeight:140,padding:"10px 12px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,resize:"vertical",fontFamily:"'DM Sans',sans-serif",color:C.text,background:C.raised,outline:"none",lineHeight:1.6,boxSizing:"border-box" }}
              />
              <div style={{ display:"flex",alignItems:"center",gap:12,marginTop:10 }}>
                <PrimaryBtn onClick={saveNotes} disabled={savingNotes}>{noteSaved?"✓ Saved!":savingNotes?"Saving…":"Save notes"}</PrimaryBtn>
                <span style={{ fontSize:11,color:C.textMuted }}>{notes.length} characters</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {showArchive&&(
        <ArchiveModal tenantName={tenant.name} onConfirm={archiveTenant} onCancel={()=>setShowArchive(false)} archiving={archiving}/>
      )}
      {showRecordPmt&&(
        <RecordPaymentModal tenantId={id} unit={unit} onClose={()=>setShowRecordPmt(false)} onSaved={()=>{ setShowRecordPmt(false); fetchAll(); }}/>
      )}
    </LandlordLayout>
  );
}