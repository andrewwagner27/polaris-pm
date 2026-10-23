import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

const EVICTION_STATUSES = [
  { key: "3_day_notice_issued",  label: "3-Day Notice Issued",  icon: "📄" },
  { key: "cure_period",          label: "Cure Period Active",    icon: "⏳" },
  { key: "filed_with_attorney",  label: "Filed w/ Attorney",     icon: "⚖️" },
  { key: "court_date_scheduled", label: "Court Date Scheduled",  icon: "🏛️" },
  { key: "resolved",             label: "Resolved",              icon: "✅" },
  { key: "evicted",              label: "Evicted",               icon: "🔴" },
];

const FREQ_OPTIONS = ["Monthly","Weekly","Bi-Weekly","Quarterly","Annually"];
const CATEGORY_OPTIONS = ["Rent","Pet Fee","Parking","Utility Surcharge","Storage","Other"];

const TABS = ["Overview","Lease & Documents","Recurring Charges","Payments","Messages","Maintenance","Move-in","Notes","Eviction Watch"];
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

function PrimaryBtn({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background:"transparent",border:`1px solid ${C.goldDim}`,color:C.gold,fontSize:12,fontWeight:500,padding:"7px 14px",borderRadius:7,cursor:disabled?"default":"pointer",fontFamily:"'DM Sans',sans-serif",transition:"background 0.15s",opacity:disabled?0.6:1,whiteSpace:"nowrap" }}
      onMouseOver={e=>!disabled&&(e.currentTarget.style.background="rgba(201,169,110,0.07)")}
      onMouseOut={e=>e.currentTarget.style.background="transparent"}
    >{children}</button>
  );
}

function GhostBtn({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background:"transparent",border:`1px solid ${C.border}`,color:C.textSub,fontSize:12,fontWeight:500,padding:"7px 14px",borderRadius:7,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s",whiteSpace:"nowrap",opacity:disabled?0.6:1 }}
      onMouseOver={e=>{ e.currentTarget.style.color=C.text; e.currentTarget.style.borderColor="#353A44"; }}
      onMouseOut={e=>{ e.currentTarget.style.color=C.textSub; e.currentTarget.style.borderColor=C.border; }}
    >{children}</button>
  );
}

function DangerBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ background:"rgba(224,85,85,0.1)",border:`1px solid rgba(224,85,85,0.25)`,color:C.red,fontSize:12,fontWeight:500,padding:"7px 14px",borderRadius:7,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" }}>{children}</button>
  );
}

function InfoCard({ title, children, borderColor, action }) {
  return (
    <div style={{ background:C.surface,border:`1px solid ${borderColor||C.border}`,borderRadius:10,overflow:"hidden" }}>
      <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",padding:"12px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
        <span>{title}</span>
        {action}
      </div>
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

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.07em",display:"block",marginBottom:5 }}>{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, type="text", placeholder="" }) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      style={{ width:"100%",padding:"9px 11px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,background:C.raised,color:C.text,outline:"none",fontFamily:"'DM Sans',sans-serif",boxSizing:"border-box" }}/>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={onChange}
      style={{ width:"100%",padding:"9px 11px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,background:C.raised,color:C.text,outline:"none",fontFamily:"'DM Sans',sans-serif",boxSizing:"border-box" }}>
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  );
}

const TH = ({ children, right }) => (
  <th style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",padding:"10px 14px",textAlign:right?"right":"left",borderBottom:`1px solid ${C.border}`,background:C.raised,whiteSpace:"nowrap" }}>{children}</th>
);
const TD = ({ children, right, bold, color }) => (
  <td style={{ fontSize:13,color:color||(bold?C.text:C.textSub),fontWeight:bold?600:400,padding:"11px 14px",borderBottom:`1px solid ${C.border}`,textAlign:right?"right":"left",verticalAlign:"middle" }}>{children}</td>
);

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

function insuranceDaysLeft(expires) {
  if (!expires) return null;
  return Math.ceil((new Date(expires) - new Date()) / (1000*60*60*24));
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

// ─── Recurring Charge Modal ────────────────────────────────────────────────
function RecurringChargeModal({ tenantId, existing, onSave, onClose }) {
  const editing = !!existing;
  const blank = { category:"Rent", amount:"", frequency:"Monthly", start_date:"", end_date:"", day_of_month:"1", note:"" };
  const [form, setForm] = useState(existing ? {
    category:     existing.category    || "Rent",
    amount:       existing.amount      || "",
    frequency:    existing.frequency   || "Monthly",
    start_date:   existing.start_date  || "",
    end_date:     existing.end_date    || "",
    day_of_month: existing.day_of_month?.toString() || "1",
    note:         existing.note        || "",
  } : blank);
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);
  const set = k => v => { setErr(null); setForm(f=>({...f,[k]:v})); };

  async function save() {
    if (!form.amount || !form.start_date) { setErr("Amount and start date are required."); return; }
    setSaving(true); setErr(null);
    const payload = {
      tenant_id:    tenantId,
      category:     form.category,
      amount:       parseFloat(form.amount),
      frequency:    form.frequency,
      start_date:   form.start_date,
      end_date:     form.end_date || null,
      day_of_month: form.frequency==="Monthly" ? parseInt(form.day_of_month,10) : null,
      note:         form.note || null,
      active:       true,
    };
    let saveErr;
    if (editing) {
      ({ error: saveErr } = await supabase.from("recurring_charges").update(payload).eq("id", existing.id));
    } else {
      payload.created_at = new Date().toISOString();
      ({ error: saveErr } = await supabase.from("recurring_charges").insert(payload));
    }
    setSaving(false);
    if (!saveErr) { onSave(); onClose(); } else setErr(saveErr.message);
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto" }}>
        <div style={{ padding:"20px 22px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <span style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:600,color:C.text }}>{editing?"Edit Recurring Charge":"Add Recurring Charge"}</span>
          <button onClick={onClose} style={{ background:"none",border:"none",color:C.textSub,fontSize:18,cursor:"pointer",lineHeight:1 }}>✕</button>
        </div>
        <div style={{ padding:"18px 22px",display:"flex",flexDirection:"column",gap:14 }}>
          {err&&<div style={{ fontSize:12,color:C.red,padding:"8px 12px",background:"rgba(224,85,85,0.08)",borderRadius:7,border:"1px solid rgba(224,85,85,0.2)" }}>⚠ {err}</div>}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
            <Field label="Category">
              <Select value={form.category} onChange={e=>set("category")(e.target.value)} options={CATEGORY_OPTIONS}/>
            </Field>
            <Field label="Amount ($)">
              <Input type="number" value={form.amount} onChange={e=>set("amount")(e.target.value)} placeholder="0.00"/>
            </Field>
            <Field label="Frequency">
              <Select value={form.frequency} onChange={e=>set("frequency")(e.target.value)} options={FREQ_OPTIONS}/>
            </Field>
            {form.frequency==="Monthly"&&(
              <Field label="Day of Month">
                <Select value={form.day_of_month} onChange={e=>set("day_of_month")(e.target.value)}
                  options={Array.from({length:28},(_,i)=>(i+1).toString())}/>
              </Field>
            )}
            <Field label="Start Date">
              <Input type="date" value={form.start_date} onChange={e=>set("start_date")(e.target.value)}/>
            </Field>
            <Field label="End Date (optional)">
              <Input type="date" value={form.end_date} onChange={e=>set("end_date")(e.target.value)}/>
            </Field>
          </div>
          <Field label="Note (optional)">
            <Input value={form.note} onChange={e=>set("note")(e.target.value)} placeholder="e.g. Covered parking spot #4"/>
          </Field>
        </div>
        <div style={{ padding:"14px 22px",borderTop:`1px solid ${C.border}`,display:"flex",gap:8,justifyContent:"flex-end" }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={save} disabled={saving}>{saving?"Saving…":editing?"Save changes":"Add charge"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Recurring Charges Tab ─────────────────────────────────────────────────
function RecurringChargesTab({ tenantId, onAddClick, modalOpen, onModalClose, editingCharge }) {
  const [charges,  setCharges]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showAdd,  setShowAdd]  = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("recurring_charges").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: true });
    setCharges(data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(c) {
    await supabase.from("recurring_charges").update({ active: !c.active }).eq("id", c.id);
    load();
  }

  async function deleteCharge(c) {
    if (!window.confirm(`Delete ${c.category} – $${c.amount}?`)) return;
    setDeleting(c.id);
    await supabase.from("recurring_charges").delete().eq("id", c.id);
    setDeleting(null);
    load();
  }

  const active = charges.filter(c => c.active !== false);
  const paused = charges.filter(c => c.active === false);

  function fmtFreq(c) {
    if (c.frequency === "Monthly" && c.day_of_month) return `Monthly · due ${c.day_of_month}${ordinal(c.day_of_month)}`;
    return c.frequency || "Monthly";
  }

  function ordinal(n) {
    const s = ["th","st","nd","rd"], v = n%100;
    return s[(v-20)%10]||s[v]||s[0];
  }

  if (loading) return <div style={{ padding:32,textAlign:"center",color:C.textSub,fontSize:13 }}>Loading…</div>;

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
      <div style={{ display:"flex",justifyContent:"flex-end" }}>
        <PrimaryBtn onClick={()=>setShowAdd(true)}>＋ Add Recurring Charge</PrimaryBtn>
      </div>

      {charges.length===0&&(
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"40px",textAlign:"center" }}>
          <div style={{ fontSize:32,marginBottom:12 }}>💳</div>
          <div style={{ fontSize:14,fontWeight:500,color:C.text,marginBottom:6 }}>No recurring charges yet</div>
          <div style={{ fontSize:13,color:C.textSub,marginBottom:20 }}>Add rent and any additional charges for this tenant.</div>
          <PrimaryBtn onClick={()=>setShowAdd(true)}>＋ Add Recurring Charge</PrimaryBtn>
        </div>
      )}

      {active.length>0&&(
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
          <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",padding:"12px 16px",borderBottom:`1px solid ${C.border}` }}>Active ({active.length})</div>
          {active.map((c,i)=>(
            <div key={c.id} style={{ padding:"14px 16px",borderBottom:i<active.length-1?`1px solid ${C.border}`:"none",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap" }}>
              <div style={{ display:"flex",alignItems:"center",gap:14 }}>
                <div style={{ width:38,height:38,borderRadius:8,background:"rgba(201,169,110,0.1)",border:`1px solid rgba(201,169,110,0.2)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0 }}>
                  {c.category==="Rent"?"🏠":c.category==="Pet Fee"?"🐾":c.category==="Parking"?"🚗":c.category==="Utility Surcharge"?"⚡":"📋"}
                </div>
                <div>
                  <div style={{ fontSize:13,fontWeight:600,color:C.text }}>{c.category}</div>
                  <div style={{ fontSize:11,color:C.textSub,marginTop:1 }}>{fmtFreq(c)}{c.note&&` · ${c.note}`}</div>
                  <div style={{ fontSize:11,color:C.textMuted,marginTop:1 }}>
                    {c.start_date&&`From ${new Date(c.start_date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`}
                    {c.end_date&&` → ${new Date(c.end_date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`}
                    {!c.end_date&&" · Cancel upon move-out"}
                  </div>
                </div>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:16 }}>
                <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.gold }}>${parseFloat(c.amount).toLocaleString("en-US",{minimumFractionDigits:2})}</div>
                <div style={{ display:"flex",gap:6 }}>
                  <GhostBtn onClick={()=>setEditing(c)}>Edit</GhostBtn>
                  <GhostBtn onClick={()=>toggleActive(c)}>Pause</GhostBtn>
                  <DangerBtn onClick={()=>deleteCharge(c)}>{deleting===c.id?"…":"Delete"}</DangerBtn>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {paused.length>0&&(
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
          <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",padding:"12px 16px",borderBottom:`1px solid ${C.border}` }}>Paused ({paused.length})</div>
          {paused.map((c,i)=>(
            <div key={c.id} style={{ padding:"14px 16px",borderBottom:i<paused.length-1?`1px solid ${C.border}`:"none",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",opacity:0.65 }}>
              <div style={{ display:"flex",alignItems:"center",gap:14 }}>
                <div style={{ width:38,height:38,borderRadius:8,background:C.raised,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0 }}>
                  {c.category==="Rent"?"🏠":c.category==="Pet Fee"?"🐾":c.category==="Parking"?"🚗":"📋"}
                </div>
                <div>
                  <div style={{ fontSize:13,fontWeight:600,color:C.text }}>{c.category} <span style={{ fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,background:`${C.amber}15`,color:C.amber,marginLeft:4 }}>PAUSED</span></div>
                  <div style={{ fontSize:11,color:C.textSub,marginTop:1 }}>{fmtFreq(c)}</div>
                </div>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:16 }}>
                <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.textSub }}>${parseFloat(c.amount).toLocaleString("en-US",{minimumFractionDigits:2})}</div>
                <div style={{ display:"flex",gap:6 }}>
                  <PrimaryBtn onClick={()=>toggleActive(c)}>Resume</PrimaryBtn>
                  <DangerBtn onClick={()=>deleteCharge(c)}>{deleting===c.id?"…":"Delete"}</DangerBtn>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(showAdd||editing)&&(
        <RecurringChargeModal
          tenantId={tenantId}
          existing={editing}
          onSave={load}
          onClose={()=>{ setShowAdd(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ─── Lease & Documents Tab ─────────────────────────────────────────────────
function LeaseDocumentsTab({ tenant, unit, onLeaseUpdated }) {
  const [editMode, setEditMode] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState(null);
  const [saved,    setSaved]    = useState(false);
  const [form, setForm] = useState({
    lease_start:     tenant.lease_start     || "",
    lease_end:       tenant.lease_end       || "",
    security_deposit:tenant.security_deposit||"",
    late_fee_amount: tenant.late_fee_amount  ||"",
    late_fee_day:    tenant.late_fee_day     ||"6",
    lease_notes:     tenant.lease_notes      ||"",
  });

  const set = k => v => { setErr(null); setForm(f=>({...f,[k]:v})); };

  async function saveLease() {
    setSaving(true); setErr(null);
    const payload = {
      lease_start:      form.lease_start      || null,
      lease_end:        form.lease_end        || null,
      security_deposit: form.security_deposit ? parseFloat(form.security_deposit) : null,
      late_fee_amount:  form.late_fee_amount  ? parseFloat(form.late_fee_amount)  : null,
      late_fee_day:     form.late_fee_day     ? parseInt(form.late_fee_day, 10)   : null,
      lease_notes:      form.lease_notes      || null,
    };
    const { error } = await supabase.from("tenants").update(payload).eq("id", tenant.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setSaved(true);
    setTimeout(()=>setSaved(false), 2500);
    setEditMode(false);
    if (onLeaseUpdated) onLeaseUpdated();
  }

  const fmtDate = d => d ? new Date(d).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}) : "—";
  const fmtMoney = v => v ? `$${parseFloat(v).toLocaleString("en-US",{minimumFractionDigits:2})}` : "—";

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
      {/* Lease Terms */}
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
        <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",padding:"12px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <span>Lease Terms</span>
          {!editMode
            ? <button onClick={()=>setEditMode(true)} style={{ background:"none",border:"none",color:C.gold,fontSize:12,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:500 }}>Edit</button>
            : <div style={{ display:"flex",gap:8 }}>
                <GhostBtn onClick={()=>{ setEditMode(false); setErr(null); }}>Cancel</GhostBtn>
                <PrimaryBtn onClick={saveLease} disabled={saving}>{saving?"Saving…":saved?"✓ Saved!":"Save changes"}</PrimaryBtn>
              </div>
          }
        </div>
        {err&&<div style={{ margin:"12px 16px 0",fontSize:12,color:C.red,padding:"8px 12px",background:"rgba(224,85,85,0.08)",borderRadius:7,border:"1px solid rgba(224,85,85,0.2)" }}>⚠ {err}</div>}
        <div style={{ padding:"16px" }}>
          {!editMode ? (
            <>
              <InfoRow label="Lease start"      value={fmtDate(tenant.lease_start)}/>
              <InfoRow label="Lease end"        value={fmtDate(tenant.lease_end)}/>
              <InfoRow label="Security deposit" value={fmtMoney(tenant.security_deposit)}/>
              <InfoRow label="Monthly rent"     value={unit?.rent_amount?`$${parseFloat(unit.rent_amount).toLocaleString("en-US",{minimumFractionDigits:2})}`:"—"}/>
              <InfoRow label="Rent due"         value={`1st of the month`}/>
              <InfoRow label="Late fee amount"  value={fmtMoney(tenant.late_fee_amount)}/>
              <InfoRow label="Late fee charged" value={tenant.late_fee_day?`${tenant.late_fee_day}${ordinalSuffix(tenant.late_fee_day)} of the month`:"—"} last/>
              {tenant.lease_notes&&(
                <div style={{ marginTop:12,padding:"10px 12px",background:C.raised,borderRadius:8,fontSize:12,color:C.textSub,lineHeight:1.6 }}>
                  <span style={{ fontSize:10,fontWeight:600,color:C.textMuted,textTransform:"uppercase",display:"block",marginBottom:4 }}>Notes</span>
                  {tenant.lease_notes}
                </div>
              )}
            </>
          ) : (
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
              <Field label="Lease Start">
                <Input type="date" value={form.lease_start} onChange={e=>set("lease_start")(e.target.value)}/>
              </Field>
              <Field label="Lease End">
                <Input type="date" value={form.lease_end} onChange={e=>set("lease_end")(e.target.value)}/>
              </Field>
              <Field label="Security Deposit ($)">
                <Input type="number" value={form.security_deposit} onChange={e=>set("security_deposit")(e.target.value)} placeholder="0.00"/>
              </Field>
              <Field label="Late Fee Amount ($)">
                <Input type="number" value={form.late_fee_amount} onChange={e=>set("late_fee_amount")(e.target.value)} placeholder="50.00"/>
              </Field>
              <Field label="Late Fee Charged On (day of month)">
                <Select value={form.late_fee_day} onChange={e=>set("late_fee_day")(e.target.value)}
                  options={Array.from({length:28},(_,i)=>(i+1).toString())}/>
              </Field>
              <div style={{ gridColumn:"1 / -1" }}>
                <Field label="Lease Notes (optional)">
                  <textarea value={form.lease_notes} onChange={e=>set("lease_notes")(e.target.value)}
                    placeholder="Month-to-month clause, special terms, etc."
                    style={{ width:"100%",minHeight:80,padding:"9px 11px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,background:C.raised,color:C.text,outline:"none",fontFamily:"'DM Sans',sans-serif",resize:"vertical",lineHeight:1.5,boxSizing:"border-box" }}/>
                </Field>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Documents */}
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
        <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",padding:"12px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <span>Lease & Documents</span>
          <PrimaryBtn onClick={()=>{}}>＋ Upload</PrimaryBtn>
        </div>
        <div style={{ padding:"16px" }}>
          {tenant.lease_url ? (
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",background:C.raised,borderRadius:8,border:`1px solid ${C.border}` }}>
              <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                <span style={{ fontSize:20 }}>📄</span>
                <div>
                  <div style={{ fontSize:13,fontWeight:500,color:C.text }}>Signed Lease Agreement</div>
                  <div style={{ fontSize:11,color:C.textSub }}>Uploaded lease document</div>
                </div>
              </div>
              <a href={tenant.lease_url} target="_blank" rel="noreferrer" style={{ fontSize:12,color:C.blue,textDecoration:"none" }}>View →</a>
            </div>
          ) : (
            <div style={{ textAlign:"center",padding:"24px 0",color:C.textSub,fontSize:13 }}>
              <div style={{ fontSize:28,marginBottom:8 }}>📂</div>
              No documents uploaded yet. Upload the signed lease or any addenda.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ordinalSuffix(n) {
  const s = ["th","st","nd","rd"], v = n%100;
  return s[(v-20)%10]||s[v]||s[0];
}

// ─── Messages Tab ──────────────────────────────────────────────────────────
function MessagesTab({ tenant }) {
  const [messages,  setMessages]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [reply,     setReply]     = useState("");
  const [sending,   setSending]   = useState(false);
  const [sendErr,   setSendErr]   = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("messages")
        .select("*")
        .or(`tenant_id.eq.${tenant.id},sender_id.eq.${tenant.user_id}`)
        .order("created_at", { ascending: true });
      setMessages(data || []);
      setLoading(false);
    }
    load();
  }, [tenant.id, tenant.user_id]);

  async function sendMessage() {
    if (!reply.trim()) return;
    setSending(true); setSendErr(null);
    const { error } = await supabase.from("messages").insert({
      tenant_id: tenant.id,
      body:      reply.trim(),
      sender:    "landlord",
      created_at: new Date().toISOString(),
    });
    setSending(false);
    if (error) { setSendErr(error.message); return; }
    setReply("");
    // Re-fetch
    const { data } = await supabase.from("messages").select("*")
      .or(`tenant_id.eq.${tenant.id},sender_id.eq.${tenant.user_id}`)
      .order("created_at", { ascending: true });
    setMessages(data || []);
  }

  if (loading) return <div style={{ padding:32,textAlign:"center",color:C.textSub,fontSize:13 }}>Loading messages…</div>;

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
      {/* Thread */}
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
        <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",padding:"12px 16px",borderBottom:`1px solid ${C.border}` }}>
          Message thread with {tenant.name}
        </div>
        <div style={{ padding:"16px",display:"flex",flexDirection:"column",gap:10,maxHeight:420,overflowY:"auto" }}>
          {messages.length===0&&(
            <div style={{ textAlign:"center",padding:"24px 0",color:C.textSub,fontSize:13 }}>No messages yet.</div>
          )}
          {messages.map(m=>{
            const isLandlord = m.sender==="landlord";
            return (
              <div key={m.id} style={{ display:"flex",justifyContent:isLandlord?"flex-end":"flex-start" }}>
                <div style={{
                  maxWidth:"70%",
                  padding:"10px 14px",
                  borderRadius:isLandlord?"12px 12px 2px 12px":"12px 12px 12px 2px",
                  background:isLandlord?"rgba(201,169,110,0.12)":C.raised,
                  border:`1px solid ${isLandlord?"rgba(201,169,110,0.2)":C.border}`,
                }}>
                  <div style={{ fontSize:13,color:C.text,lineHeight:1.5 }}>{m.body||m.message||m.content}</div>
                  <div style={{ fontSize:10,color:C.textMuted,marginTop:4,textAlign:isLandlord?"right":"left" }}>
                    {isLandlord?"You":"Tenant"} · {new Date(m.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reply */}
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px" }}>
        {sendErr&&<div style={{ fontSize:12,color:C.red,marginBottom:8,padding:"6px 10px",background:"rgba(224,85,85,0.08)",borderRadius:6,border:"1px solid rgba(224,85,85,0.2)" }}>⚠ {sendErr}</div>}
        <textarea value={reply} onChange={e=>{ setSendErr(null); setReply(e.target.value); }}
          placeholder={`Send a message to ${tenant.name}…`}
          rows={3}
          style={{ width:"100%",padding:"10px 12px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,resize:"vertical",fontFamily:"'DM Sans',sans-serif",color:C.text,background:C.raised,outline:"none",lineHeight:1.6,boxSizing:"border-box",marginBottom:10 }}
        />
        <div style={{ display:"flex",justifyContent:"flex-end" }}>
          <PrimaryBtn onClick={sendMessage} disabled={sending||!reply.trim()}>{sending?"Sending…":"Send message"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Eviction Watch Tab ────────────────────────────────────────────────────
function EvictionWatchTab({ tenant, tenantId, onFlagChange }) {
  const [eviction,   setEviction]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [toggling,   setToggling]   = useState(false);
  const [newNote,    setNewNote]    = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved,  setNoteSaved]  = useState(false);
  const [form, setForm] = useState({
    status:        "3_day_notice_issued",
    notice_date:   "",
    cure_deadline: "",
    attorney_name: "",
    court_date:    "",
    case_number:   "",
  });

  useEffect(() => { fetchEviction(); }, [tenantId]);

  async function fetchEviction() {
    setLoading(true);
    const { data } = await supabase.from("evictions").select("*").eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) {
      setEviction(data);
      setForm({ status:data.status||"3_day_notice_issued", notice_date:data.notice_date||"", cure_deadline:data.cure_deadline||"", attorney_name:data.attorney_name||"", court_date:data.court_date||"", case_number:data.case_number||"" });
      setNewNote(data.notes||"");
    }
    setLoading(false);
  }

  async function toggleFlag() {
    setToggling(true);
    const newVal = !tenant.eviction_watch;
    await supabase.from("tenants").update({ eviction_watch: newVal }).eq("id", tenantId);
    if (newVal && !eviction) {
      const { data } = await supabase.from("evictions").insert({ tenant_id:tenantId, status:"3_day_notice_issued", notice_date:new Date().toISOString().split("T")[0] }).select().single();
      if (data) { setEviction(data); setForm(f=>({...f, status:data.status, notice_date:data.notice_date||""})); }
    }
    onFlagChange(newVal);
    setToggling(false);
  }

  async function saveEviction() {
    if (!eviction) return;
    setSaving(true);
    const { data } = await supabase.from("evictions").update({ ...form, updated_at:new Date().toISOString() }).eq("id",eviction.id).select().single();
    if (data) setEviction(data);
    setSaving(false);
  }

  async function saveNote() {
    if (!eviction) return;
    setSavingNote(true);
    await supabase.from("evictions").update({ notes:newNote, updated_at:new Date().toISOString() }).eq("id",eviction.id);
    setSavingNote(false); setNoteSaved(true);
    setTimeout(()=>setNoteSaved(false), 2000);
  }

  const currentStepIdx = EVICTION_STATUSES.findIndex(s=>s.key===form.status);
  if (loading) return <div style={{ padding:32,textAlign:"center",color:C.textSub,fontSize:13 }}>Loading…</div>;

  if (!tenant.eviction_watch) {
    return (
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"32px 28px",textAlign:"center" }}>
        <div style={{ fontSize:32,marginBottom:14 }}>⚖️</div>
        <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.text,marginBottom:8 }}>Eviction Watch</div>
        <div style={{ fontSize:13,color:C.textSub,maxWidth:420,margin:"0 auto 24px",lineHeight:1.6 }}>
          Flag this tenant to open an eviction case. Track the status pipeline, set key dates, add legal notes, and manage the case through resolution.
        </div>
        <button onClick={toggleFlag} disabled={toggling}
          style={{ background:"rgba(224,85,85,0.1)",border:`1px solid rgba(224,85,85,0.35)`,color:C.red,fontSize:13,fontWeight:600,padding:"10px 24px",borderRadius:8,cursor:toggling?"default":"pointer",fontFamily:"'DM Sans',sans-serif",opacity:toggling?0.6:1 }}>
          {toggling?"Flagging…":"⚑ Flag for Eviction Watch"}
        </button>
        <div style={{ fontSize:11,color:C.textMuted,marginTop:12 }}>Only visible to you — not to the tenant</div>
      </div>
    );
  }

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
      <div style={{ background:"rgba(224,85,85,0.08)",border:`1px solid rgba(224,85,85,0.25)`,borderRadius:10,padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap" }}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <span style={{ fontSize:16 }}>⚑</span>
          <div>
            <div style={{ fontSize:13,fontWeight:600,color:C.red }}>Eviction Watch Active</div>
            <div style={{ fontSize:11,color:C.textSub,marginTop:1 }}>{eviction?.created_at?`Opened ${new Date(eviction.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`:"Case opened"}</div>
          </div>
        </div>
        <button onClick={toggleFlag} disabled={toggling}
          style={{ background:"transparent",border:`1px solid rgba(224,85,85,0.25)`,color:C.red,fontSize:11,fontWeight:500,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",opacity:toggling?0.5:1 }}>
          {toggling?"…":"Remove flag"}
        </button>
      </div>

      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
        <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",padding:"12px 16px",borderBottom:`1px solid ${C.border}` }}>Case Status Pipeline</div>
        <div style={{ padding:"16px",display:"flex",gap:6,flexWrap:"wrap" }}>
          {EVICTION_STATUSES.map((s,i)=>{
            const isActive=s.key===form.status, isPast=i<currentStepIdx;
            return (
              <button key={s.key} onClick={()=>setForm(f=>({...f,status:s.key}))}
                style={{ flex:"1 1 auto",minWidth:100,padding:"10px 8px",borderRadius:8,border:`1px solid ${isActive?"rgba(224,85,85,0.5)":isPast?`${C.green}44`:C.border}`,background:isActive?"rgba(224,85,85,0.12)":isPast?`${C.green}0F`:"transparent",color:isActive?C.red:isPast?C.green:C.textSub,fontSize:11,fontWeight:isActive?600:400,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",textAlign:"center",transition:"all 0.15s" }}>
                <div style={{ fontSize:14,marginBottom:3 }}>{s.icon}</div>
                <div>{s.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
        <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",padding:"12px 16px",borderBottom:`1px solid ${C.border}` }}>Case Details</div>
        <div style={{ padding:"16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
          <Field label="Notice Date"><Input type="date" value={form.notice_date} onChange={e=>setForm(f=>({...f,notice_date:e.target.value}))}/></Field>
          <Field label="Cure Deadline"><Input type="date" value={form.cure_deadline} onChange={e=>setForm(f=>({...f,cure_deadline:e.target.value}))}/></Field>
          <Field label="Attorney Name"><Input value={form.attorney_name} onChange={e=>setForm(f=>({...f,attorney_name:e.target.value}))} placeholder="e.g. Smith & Associates"/></Field>
          <Field label="Court Date"><Input type="date" value={form.court_date} onChange={e=>setForm(f=>({...f,court_date:e.target.value}))}/></Field>
          <div style={{ gridColumn:"1 / -1" }}><Field label="Case Number"><Input value={form.case_number} onChange={e=>setForm(f=>({...f,case_number:e.target.value}))} placeholder="e.g. CV-2026-00142"/></Field></div>
        </div>
        <div style={{ padding:"0 16px 16px",display:"flex",justifyContent:"flex-end" }}>
          <PrimaryBtn onClick={saveEviction} disabled={saving}>{saving?"Saving…":"Save case details"}</PrimaryBtn>
        </div>
      </div>

      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
        <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",padding:"12px 16px",borderBottom:`1px solid ${C.border}` }}>Case Notes</div>
        <div style={{ padding:"16px" }}>
          <textarea value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Add legal notes, timeline entries, communication logs…"
            style={{ width:"100%",minHeight:120,padding:"10px 12px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,resize:"vertical",fontFamily:"'DM Sans',sans-serif",color:C.text,background:C.raised,outline:"none",lineHeight:1.6,boxSizing:"border-box" }}/>
          <div style={{ display:"flex",alignItems:"center",gap:12,marginTop:10 }}>
            <PrimaryBtn onClick={saveNote} disabled={savingNote}>{noteSaved?"✓ Saved!":savingNote?"Saving…":"Save notes"}</PrimaryBtn>
            <span style={{ fontSize:11,color:C.textMuted }}>{newNote.length} characters</span>
          </div>
        </div>
      </div>
      {eviction?.updated_at&&(
        <div style={{ fontSize:11,color:C.textMuted,textAlign:"right" }}>
          Last updated {new Date(eviction.updated_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})}
        </div>
      )}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function LandlordTenantDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const width    = useWindowWidth();
  const isMobile = width < 768;

  const [tenant,      setTenant]      = useState(null);
  const [unit,        setUnit]        = useState(null);
  const [property,    setProperty]    = useState(null);
  const [payments,    setPayments]    = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [checklist,   setChecklist]   = useState([]);
  const [charges,     setCharges]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState("Overview");
  const [notes,       setNotes]       = useState("");
  const [noteSaved,   setNoteSaved]   = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [inviting,    setInviting]    = useState(false);
  const [inviteSent,  setInviteSent]  = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [archiving,   setArchiving]   = useState(false);
  const [showAddCharge, setShowAddCharge] = useState(false);

  useEffect(() => { fetchAll(); }, [id]);

  async function fetchAll() {
    setLoading(true);
    const { data: tenantData } = await supabase.from("tenants").select("*").eq("id", id).single();
    if (!tenantData) { setLoading(false); return; }
    setTenant(tenantData);
    setNotes(tenantData.notes || "");
    const [{ data: unitData }, { data: paymentsData }, { data: maintData }, { data: checklistData }, { data: chargesData }] = await Promise.all([
      supabase.from("units").select("*, properties(*)").eq("id", tenantData.unit_id).single(),
      supabase.from("payments").select("*").eq("tenant_id", id).order("created_at", { ascending: false }),
      supabase.from("maintenance_requests").select("*").eq("tenant_id", id).order("created_at", { ascending: false }),
      supabase.from("move_in_checklist").select("*").eq("tenant_id", id).order("created_at", { ascending: true }),
      supabase.from("recurring_charges").select("*").eq("tenant_id", id).order("created_at", { ascending: true }),
    ]);
    setUnit(unitData || null);
    setProperty(unitData?.properties || null);
    setPayments(paymentsData || []);
    setMaintenance(maintData || []);
    setChecklist(checklistData || []);
    setCharges(chargesData || []);
    setLoading(false);
  }

  async function sendInvite() {
    if (!tenant.email) { setInviteError("No email on tenant record."); return; }
    setInviting(true); setInviteError("");
    const { error } = await supabase.functions.invoke("invite-tenant", {
      body: { tenant_id:tenant.id, tenant_name:tenant.name, tenant_email:tenant.email, unit_number:unit?.unit_number||"—", property_name:property?.name||"—", landlord_name:"Modus Property Management" }
    });
    setInviting(false);
    if (error) { setInviteError(error.message); return; }
    setInviteSent(true);
  }

  async function archiveTenant() {
    setArchiving(true);
    await supabase.from("tenants").update({ archived:true }).eq("id", id);
    setArchiving(false);
    navigate("/landlord/tenants");
  }

  async function saveNotes() {
    setSavingNotes(true);
    await supabase.from("tenants").update({ notes }).eq("id", id);
    setSavingNotes(false); setNoteSaved(true);
    setTimeout(()=>setNoteSaved(false), 2000);
  }

  function handleEvictionFlagChange(newVal) {
    setTenant(t=>({...t, eviction_watch:newVal}));
  }

  if (loading) return <LandlordLayout><div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg,color:C.textSub,fontSize:14 }}>Loading tenant…</div></LandlordLayout>;
  if (!tenant)  return <LandlordLayout><div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg,color:C.textSub,fontSize:14 }}>Tenant not found.</div></LandlordLayout>;

  const initials      = tenant.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const accentColor   = AVATAR_COLORS[0];
  const latestPayment = payments[0];
  let payStatus = "current";
  if (latestPayment?.status==="failed") payStatus="late";
  else if (!latestPayment||latestPayment.status==="pending") payStatus="pending";
  const balance    = payStatus!=="paid"&&latestPayment?.status!=="paid"?(unit?.rent_amount||0):0;
  const leaseStart = tenant.lease_start ? new Date(tenant.lease_start) : null;
  const leaseEnd   = tenant.lease_end   ? new Date(tenant.lease_end)   : null;
  const daysLeft   = leaseEnd ? Math.ceil((leaseEnd-new Date())/(1000*60*60*24)) : null;
  const progress   = leaseStart&&leaseEnd ? Math.min(100,Math.max(0,Math.round(((new Date()-leaseStart)/(leaseEnd-leaseStart))*100))) : 0;
  const completedChecklist = checklist.filter(r=>r.completed).length;
  const insDays    = insuranceDaysLeft(tenant.insurance_expires);
  const activeCharges = charges.filter(c=>c.active!==false);

  // Portal status badge
  const portalStatus = tenant.user_id ? "Registered" : tenant.invited_at ? "Invited" : "Not Invited";
  const portalStatusColor = tenant.user_id ? C.green : tenant.invited_at ? C.amber : C.textMuted;
  const portalStatusBg = tenant.user_id ? `${C.green}15` : tenant.invited_at ? `${C.amber}15` : `${C.textMuted}15`;

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

        <button onClick={()=>navigate("/landlord/tenants")} style={{ display:"flex",alignItems:"center",gap:6,fontSize:12,color:C.goldDim,background:"none",border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",marginBottom:20,padding:0 }}
          onMouseOver={e=>e.currentTarget.style.color=C.gold}
          onMouseOut={e=>e.currentTarget.style.color=C.goldDim}
        >← Back to Tenants</button>

        {tenant.archived&&(
          <div style={{ background:"rgba(240,164,48,0.1)",border:`1px solid rgba(240,164,48,0.25)`,borderRadius:8,padding:"10px 16px",marginBottom:16,fontSize:13,color:C.amber,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
            <span>⚠ This tenant is archived.</span>
            <button onClick={async()=>{ await supabase.from("tenants").update({archived:false}).eq("id",id); fetchAll(); }} style={{ background:"none",border:"none",color:C.amber,cursor:"pointer",fontSize:12,fontFamily:"'DM Sans',sans-serif",textDecoration:"underline" }}>Unarchive</button>
          </div>
        )}

        {/* Header */}
        <div style={{ background:C.surface,border:`1px solid ${tenant.eviction_watch?"rgba(224,85,85,0.4)":C.border}`,borderRadius:10,padding:"20px 24px",marginBottom:20,display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:20,flexWrap:"wrap" }}>
          <div style={{ display:"flex",alignItems:"flex-start",gap:16 }}>
            <div style={{ width:56,height:56,borderRadius:"50%",background:`${accentColor}22`,border:`1px solid ${accentColor}44`,color:accentColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,flexShrink:0 }}>{initials}</div>
            <div>
              <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:C.text,marginBottom:4,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" }}>
                {tenant.name}
                {/* Portal status badge */}
                <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:portalStatusBg,color:portalStatusColor,letterSpacing:"0.04em" }}>
                  {tenant.user_id?"● ":"○ "}{portalStatus}
                </span>
                {tenant.eviction_watch&&(
                  <span style={{ fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:5,background:"rgba(224,85,85,0.15)",color:C.red,border:`1px solid rgba(224,85,85,0.3)`,letterSpacing:"0.05em" }}>⚑ EVICTION WATCH</span>
                )}
              </div>
              <div style={{ fontSize:13,color:C.textSub,marginBottom:6 }}>
                {property?.name||"—"} · Unit {unit?.unit_number||"—"}
                {property?.address&&` · ${property.address}, ${property.city} ${property.state}`}
              </div>
              {/* Bank / Autopay badges */}
              <div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:8 }}>
                <Badge status={payStatus}/>
                {tenant.bank_account_linked&&(
                  <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:`${C.green}15`,color:C.green }}>✓ Bank added</span>
                )}
                {tenant.autopay_enabled&&(
                  <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:`${C.green}15`,color:C.green }}>✓ Autopay on</span>
                )}
                {daysLeft!==null&&daysLeft<60&&daysLeft>0&&(
                  <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:"rgba(240,164,48,0.13)",color:C.amber }}>⚠ Lease expiring in {daysLeft}d</span>
                )}
                {!tenant.insurance_url&&(
                  <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:`${C.red}15`,color:C.red }}>No insurance on file</span>
                )}
              </div>
              <div style={{ display:"flex",gap:16,flexWrap:"wrap" }}>
                {tenant.email&&<span style={{ fontSize:12,color:C.textSub }}>✉ {tenant.email}</span>}
                {tenant.phone&&<span style={{ fontSize:12,color:C.textSub }}>☎ {tenant.phone}</span>}
                {tenant.lease_start&&<span style={{ fontSize:12,color:C.textSub }}>Move-in: {new Date(tenant.lease_start).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>}
              </div>
            </div>
          </div>
          <div style={{ display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end",alignItems:"flex-start" }}>
            <PrimaryBtn onClick={()=>setActiveTab("Messages")}>Message</PrimaryBtn>
            {!tenant.user_id&&(
              inviteSent
                ? <span style={{ fontSize:12,color:C.green,fontWeight:500,padding:"7px 0" }}>✓ Invite sent</span>
                : <GhostBtn onClick={sendInvite} disabled={inviting}>{inviting?"Sending…":"Send invite"}</GhostBtn>
            )}
            <GhostBtn>Record payment</GhostBtn>
            {payStatus==="late"&&<DangerBtn>Send notice</DangerBtn>}
            {!tenant.archived&&<DangerBtn onClick={()=>setShowArchive(true)}>Archive</DangerBtn>}
            {inviteError&&<div style={{ fontSize:11,color:C.red,width:"100%",marginTop:2 }}>{inviteError}</div>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex",borderBottom:`1px solid ${C.border}`,marginBottom:20,overflowX:"auto" }}>
          {TABS.map(tab=>{
            const isEviction = tab==="Eviction Watch";
            const isActive = activeTab===tab;
            const tabColor = isActive ? (isEviction&&tenant.eviction_watch?C.red:C.gold) : C.textSub;
            const borderColor = isActive ? (isEviction&&tenant.eviction_watch?C.red:C.gold) : "transparent";
            return (
              <button key={tab} onClick={()=>setActiveTab(tab)} style={{ padding:"10px 16px",fontSize:13,fontWeight:isActive?600:400,color:tabColor,background:"none",border:"none",borderBottom:`2px solid ${borderColor}`,marginBottom:-1,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"color 0.15s",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5 }}>
                {isEviction&&tenant.eviction_watch&&<span style={{ fontSize:9 }}>⚑</span>}
                {tab==="Recurring Charges"&&activeCharges.length>0&&(
                  <span style={{ fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:4,background:isActive?"rgba(201,169,110,0.2)":"rgba(201,169,110,0.1)",color:C.gold }}>{activeCharges.length}</span>
                )}
                {tab}
              </button>
            );
          })}
        </div>

        {/* ── Overview ── */}
        {activeTab==="Overview"&&(
          <div style={{ display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:12 }}>
            <InfoCard title="Balance">
              <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:600,color:balance>0?C.red:C.green,marginBottom:4 }}>
                {balance>0?`-$${balance.toLocaleString()}`:"$0.00"}
              </div>
              <div style={{ fontSize:12,color:balance>0?C.red:C.green,marginBottom:balance>0?14:0 }}>{balance>0?"Amount overdue":"Fully paid ✓"}</div>
              {balance>0&&<PrimaryBtn onClick={()=>{}}>Send payment reminder</PrimaryBtn>}
            </InfoCard>

            {/* Recurring Charges summary */}
            <InfoCard title="Recurring Charges"
              action={<button onClick={()=>setActiveTab("Recurring Charges")} style={{ background:"none",border:"none",color:C.gold,fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:500 }}>View all →</button>}>
              {activeCharges.length===0?(
                <div style={{ fontSize:13,color:C.textSub,textAlign:"center",padding:"8px 0" }}>
                  No recurring charges set up.
                  <div style={{ marginTop:10 }}><PrimaryBtn onClick={()=>setActiveTab("Recurring Charges")}>＋ Add charges</PrimaryBtn></div>
                </div>
              ):(
                <>
                  {activeCharges.slice(0,3).map(c=>(
                    <div key={c.id} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.border}` }}>
                      <span style={{ fontSize:13,color:C.textSub }}>{c.category}</span>
                      <span style={{ fontSize:13,fontWeight:600,color:C.text }}>${parseFloat(c.amount).toLocaleString("en-US",{minimumFractionDigits:2})}<span style={{ fontSize:11,color:C.textSub,fontWeight:400 }}>/mo</span></span>
                    </div>
                  ))}
                  {activeCharges.length>3&&<div style={{ fontSize:11,color:C.textMuted,marginTop:6 }}>+{activeCharges.length-3} more charges</div>}
                  <div style={{ marginTop:12 }}><PrimaryBtn onClick={()=>setShowAddCharge(true)}>＋ Add charge</PrimaryBtn></div>
                </>
              )}
            </InfoCard>

            <InfoCard title="Lease Details">
              <InfoRow label="Monthly rent"   value={unit?.rent_amount?`$${unit.rent_amount.toLocaleString()}`:"—"}/>
              <InfoRow label="Lease start"    value={tenant.lease_start?new Date(tenant.lease_start).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—"}/>
              <InfoRow label="Lease end"      value={tenant.lease_end?new Date(tenant.lease_end).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—"}/>
              <InfoRow label="Days remaining" value={daysLeft!==null?(daysLeft>0?`${daysLeft} days`:"Expired"):"—"} last/>
              {leaseStart&&leaseEnd&&(
                <>
                  <div style={{ height:4,background:C.raised,borderRadius:2,overflow:"hidden",marginTop:12 }}>
                    <div style={{ height:"100%",width:`${progress}%`,background:C.gold,borderRadius:2 }}/>
                  </div>
                  <div style={{ fontSize:10,color:C.textMuted,marginTop:4 }}>{progress}% through lease</div>
                </>
              )}
              <div style={{ marginTop:12 }}>
                <button onClick={()=>setActiveTab("Lease & Documents")} style={{ background:"none",border:"none",color:C.gold,fontSize:12,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:500,padding:0 }}>Edit lease terms →</button>
              </div>
            </InfoCard>

            <InfoCard title="Unit Info">
              <InfoRow label="Property"  value={property?.name||"—"}/>
              <InfoRow label="Unit"      value={unit?.unit_number||"—"}/>
              <InfoRow label="Bedrooms"  value={unit?.bedrooms??"—"}/>
              <InfoRow label="Bathrooms" value={unit?.bathrooms??"—"}/>
              <InfoRow label="Rent"      value={unit?.rent_amount?`$${unit.rent_amount.toLocaleString()}/mo`:"—"} last/>
            </InfoCard>

            <InfoCard title="Emergency Contact">
              {tenant.emergency_contact_name ? (
                <>
                  <InfoRow label="Name"         value={tenant.emergency_contact_name}/>
                  <InfoRow label="Phone"        value={tenant.emergency_contact_phone||"—"}/>
                  <InfoRow label="Relationship" value={tenant.emergency_contact_relationship||"—"} last/>
                </>
              ) : (
                <div style={{ fontSize:13,color:C.textMuted,textAlign:"center",padding:"8px 0" }}>No emergency contact provided</div>
              )}
            </InfoCard>

            <div style={{ gridColumn:isMobile?"1":"1 / -1" }}>
              <InsuranceCard tenant={tenant}/>
            </div>
          </div>
        )}

        {/* ── Lease & Documents ── */}
        {activeTab==="Lease & Documents"&&(
          <LeaseDocumentsTab tenant={tenant} unit={unit} onLeaseUpdated={fetchAll}/>
        )}

        {/* ── Recurring Charges ── */}
        {activeTab==="Recurring Charges"&&(
          <RecurringChargesTab tenantId={id}/>
        )}

        {/* ── Messages ── */}
        {activeTab==="Messages"&&(
          <MessagesTab tenant={tenant}/>
        )}

        {/* ── Payments ── */}
        {activeTab==="Payments"&&(
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
            <div style={{ padding:"14px 16px",borderBottom:`1px solid ${C.border}` }}>
              <div style={{ fontSize:13,fontWeight:600,color:C.text }}>Payment history</div>
              <div style={{ fontSize:12,color:C.textSub,marginTop:2 }}>{payments.length} payments recorded</div>
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
                      <TD right bold>${((p.amount_cents||0)/100).toLocaleString()}</TD>
                      <TD><Badge status={p.status}/></TD>
                      <TD>{p.source||"—"}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
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

        {/* ── Move-in ── */}
        {activeTab==="Move-in"&&(
          <div>
            <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:13,fontWeight:600,color:C.text,marginBottom:2 }}>Move-in checklist</div>
                <div style={{ fontSize:12,color:C.textSub }}>
                  {checklist.length===0?"Tenant has not completed the move-in checklist yet.":`${completedChecklist} of ${checklist.length} areas documented`}
                </div>
              </div>
              {checklist.length>0&&(
                <span style={{ fontSize:10,fontWeight:600,padding:"3px 10px",borderRadius:5,background:completedChecklist===checklist.length?`${C.green}15`:`${C.amber}15`,color:completedChecklist===checklist.length?C.green:C.amber }}>
                  {completedChecklist===checklist.length?"Complete":"In progress"}
                </span>
              )}
            </div>
            {checklist.length===0?(
              <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"40px",textAlign:"center" }}>
                <div style={{ fontSize:32,marginBottom:12 }}>📋</div>
                <div style={{ fontSize:14,fontWeight:500,color:C.text,marginBottom:6 }}>No checklist submitted yet</div>
                <div style={{ fontSize:13,color:C.textSub }}>The tenant will complete this during onboarding.</div>
              </div>
            ):(
              <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                {checklist.map(item=>{
                  const condColor=item.condition==="Good"?C.green:item.condition==="Fair"?C.amber:C.red;
                  return (
                    <div key={item.id} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px" }}>
                      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:item.notes?8:0 }}>
                        <div style={{ fontSize:14,fontWeight:500,color:C.text }}>{ROOM_LABELS[item.room]||item.room}</div>
                        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                          {item.condition&&<span style={{ fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:5,background:`${condColor}18`,color:condColor }}>{item.condition}</span>}
                          {!item.completed&&<span style={{ fontSize:11,color:C.textMuted }}>Not documented</span>}
                        </div>
                      </div>
                      {item.notes&&<div style={{ fontSize:12,color:C.textSub,marginTop:6,padding:"8px 10px",background:C.raised,borderRadius:7 }}>{item.notes}</div>}
                    </div>
                  );
                })}
                <div style={{ fontSize:11,color:C.textMuted,textAlign:"right",marginTop:4 }}>
                  Submitted {checklist[0]?.created_at?new Date(checklist[0].created_at).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}):"—"}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Notes ── */}
        {activeTab==="Notes"&&(
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
            <div style={{ padding:"14px 16px",borderBottom:`1px solid ${C.border}` }}>
              <div style={{ fontSize:13,fontWeight:600,color:C.text }}>Private notes</div>
              <div style={{ fontSize:11,color:C.textMuted,marginTop:2 }}>Only visible to you — never shown to the tenant</div>
            </div>
            <div style={{ padding:"16px" }}>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Add private notes about this tenant…"
                style={{ width:"100%",minHeight:140,padding:"10px 12px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,resize:"vertical",fontFamily:"'DM Sans',sans-serif",color:C.text,background:C.raised,outline:"none",lineHeight:1.6,boxSizing:"border-box" }}/>
              <div style={{ display:"flex",alignItems:"center",gap:12,marginTop:10 }}>
                <PrimaryBtn onClick={saveNotes} disabled={savingNotes}>{noteSaved?"✓ Saved!":savingNotes?"Saving…":"Save notes"}</PrimaryBtn>
                <span style={{ fontSize:11,color:C.textMuted }}>{notes.length} characters</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Eviction Watch ── */}
        {activeTab==="Eviction Watch"&&(
          <EvictionWatchTab tenant={tenant} tenantId={id} onFlagChange={handleEvictionFlagChange}/>
        )}
      </div>

      {/* Quick-add charge modal from Overview */}
      {showAddCharge&&(
        <RecurringChargeModal
          tenantId={id}
          existing={null}
          onSave={fetchAll}
          onClose={()=>setShowAddCharge(false)}
        />
      )}

      {showArchive&&(
        <ArchiveModal tenantName={tenant.name} onConfirm={archiveTenant} onCancel={()=>setShowArchive(false)} archiving={archiving}/>
      )}
    </LandlordLayout>
  );
}