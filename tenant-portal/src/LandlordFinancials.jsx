import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";

// ─── Design tokens ────────────────────────────────────────────────────────────
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

const CATEGORIES = ["Rent","Late Fee","Utilities","Security Deposit","Pet Fee","Parking","Maintenance","Other"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt$(n) {
  if (n == null || n === "") return "—";
  const abs = Math.abs(Number(n));
  const s = abs.toLocaleString("en-US",{ minimumFractionDigits:2, maximumFractionDigits:2 });
  return Number(n) < 0 ? `-$${s}` : `$${s}`;
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US",{ month:"short", day:"numeric", year:"numeric" });
}
function startOfYear() { return new Date(new Date().getFullYear(),0,1).toISOString().split("T")[0]; }
function startOfMonth() { return new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().split("T")[0]; }
function startOfLastMonth() {
  const d = new Date(); d.setMonth(d.getMonth()-1,1);
  return d.toISOString().split("T")[0];
}
function endOfLastMonth() {
  const d = new Date(); d.setDate(0);
  return d.toISOString().split("T")[0];
}
function today() { return new Date().toISOString().split("T")[0]; }

// ─── useFinancialsData hook ───────────────────────────────────────────────────
function useFinancialsData() {
  const [tenants,    setTenants]    = useState([]);
  const [leases,     setLeases]     = useState([]);
  const [payments,   setPayments]   = useState([]);
  const [properties, setProperties] = useState([]);
  const [units,      setUnits]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        { data: tData, error: tErr },
        { data: lData, error: lErr },
        { data: pData, error: pErr },
        { data: prData, error: prErr },
        { data: uData, error: uErr },
      ] = await Promise.all([
        supabase.from("tenants").select("id,name,email,phone,eviction_watch,autopay_enabled,bank_connected").eq("is_active",true).order("name"),
        supabase.from("leases").select("*").order("created_at",{ascending:false}),
        supabase.from("payments").select("*").order("due_date",{ascending:false}),
        supabase.from("properties").select("id,name,address"),
        supabase.from("units").select("id,unit_number,property_id"),
      ]);
      if (tErr) throw tErr;
      if (lErr) throw lErr;
      if (pErr) throw pErr;
      setTenants(tData || []);
      setLeases(lData || []);
      setPayments(pData || []);
      setProperties(prData || []);
      setUnits(uData || []);
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derived maps
  const tenantMap  = Object.fromEntries((tenants||[]).map(t=>[t.id, t.name||"Unknown Tenant"]));
  const leaseMap   = Object.fromEntries((leases||[]).map(l=>[l.tenant_id, l]));
  const propMap    = Object.fromEntries((properties||[]).map(p=>[p.id, p]));
  const unitMap    = Object.fromEntries((units||[]).map(u=>[u.id, u]));

  return { tenants, leases, payments, properties, units, loading, error, reload:load, tenantMap, leaseMap, propMap, unitMap };
}

// ─── Atoms ───────────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const MAP = {
    Paid:        { color:"#72B02A", bg:"rgba(114,176,42,0.13)"  },
    Unpaid:      { color:"#E05555", bg:"rgba(224,85,85,0.13)"   },
    Overdue:     { color:"#E05555", bg:"rgba(224,85,85,0.18)"   },
    Partial:     { color:"#F0A430", bg:"rgba(240,164,48,0.13)"  },
    Pending:     { color:"#4A9AE8", bg:"rgba(74,154,232,0.13)"  },
    Settled:     { color:"#72B02A", bg:"rgba(114,176,42,0.13)"  },
    Failed:      { color:"#E05555", bg:"rgba(224,85,85,0.13)"   },
    Reconciled:  { color:"#4A9AE8", bg:"rgba(74,154,232,0.13)"  },
    "Needs Review":{ color:"#F0A430", bg:"rgba(240,164,48,0.13)"},
  };
  const cfg = MAP[status] || { color:C.textSub, bg:"rgba(144,149,160,0.1)" };
  return <span style={{ fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:5,background:cfg.bg,color:cfg.color,letterSpacing:"0.05em",whiteSpace:"nowrap" }}>{status}</span>;
}

function PrimaryBtn({ children, onClick, disabled, small }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background:"transparent",border:`1px solid ${C.goldDim}`,color:C.gold,fontSize:small?11:12,fontWeight:500,padding:small?"5px 10px":"7px 14px",borderRadius:7,cursor:disabled?"default":"pointer",fontFamily:"'DM Sans',sans-serif",opacity:disabled?0.6:1,whiteSpace:"nowrap" }}
      onMouseOver={e=>!disabled&&(e.currentTarget.style.background="rgba(201,169,110,0.09)")}
      onMouseOut={e=>e.currentTarget.style.background="transparent"}
    >{children}</button>
  );
}
function GhostBtn({ children, onClick, disabled, small, danger, active }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background:active?"rgba(201,169,110,0.08)":"transparent",border:`1px solid ${active?C.goldDim:danger?"rgba(224,85,85,0.35)":C.border}`,color:active?C.gold:danger?C.red:C.textSub,fontSize:small?11:12,fontWeight:500,padding:small?"5px 10px":"7px 14px",borderRadius:7,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",opacity:disabled?0.5:1,whiteSpace:"nowrap" }}
    >{children}</button>
  );
}

function Inp({ label, value, onChange, type="text", placeholder, disabled }) {
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
      {label&&<label style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.07em" }}>{label}</label>}
      <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
        style={{ background:C.raised,border:`1px solid ${C.border}`,borderRadius:7,color:C.text,fontSize:13,padding:"8px 11px",fontFamily:"'DM Sans',sans-serif",outline:"none",width:"100%",boxSizing:"border-box",opacity:disabled?0.6:1 }} />
    </div>
  );
}
function Sel({ label, value, onChange, options }) {
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
      {label&&<label style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.07em" }}>{label}</label>}
      <select value={value||""} onChange={e=>onChange(e.target.value)}
        style={{ background:C.raised,border:`1px solid ${C.border}`,borderRadius:7,color:value?C.text:C.textSub,fontSize:13,padding:"8px 11px",fontFamily:"'DM Sans',sans-serif",outline:"none",width:"100%",boxSizing:"border-box" }}>
        {options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}
      </select>
    </div>
  );
}

const TH = ({ children, right }) => (
  <th style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",padding:"10px 14px",textAlign:right?"right":"left",borderBottom:`1px solid ${C.border}`,background:C.raised,whiteSpace:"nowrap" }}>{children}</th>
);
const TD = ({ children, right, bold, color, mono, nowrap }) => (
  <td style={{ fontSize:13,color:color||(bold?C.text:C.textSub),fontWeight:bold?600:400,padding:"11px 14px",borderBottom:`1px solid ${C.border}`,textAlign:right?"right":"left",verticalAlign:"middle",fontFamily:mono?"monospace":undefined,whiteSpace:nowrap?"nowrap":undefined }}>{children}</td>
);

// ─── Analytics Summary Bar ────────────────────────────────────────────────────
function SummaryBar({ payments, tenants }) {
  const now = new Date();
  const ytdStart = new Date(now.getFullYear(),0,1);

  const collected = payments
    .filter(p=>p.status==="Paid" && new Date(p.paid_at||p.due_date)>=ytdStart)
    .reduce((s,p)=>s+(p.amount||0),0);

  const outstanding = payments
    .filter(p=>["Unpaid","Overdue","Partial"].includes(p.status))
    .reduce((s,p)=>s+(p.balance_due||0),0);

  const pending = payments
    .filter(p=>p.status==="Pending")
    .reduce((s,p)=>s+(p.balance_due||0),0);

  const onWatch = tenants.filter(t=>t.eviction_watch).length;

  const tiles = [
    { label:"Collected YTD",         value:fmt$(collected),  color:C.green,  icon:"↗" },
    { label:"Outstanding Balance",    value:fmt$(outstanding),color:outstanding>0?C.red:C.textSub, icon:"⚠" },
    { label:"Pending / In Transit",   value:fmt$(pending),    color:C.amber,  icon:"⏳" },
    { label:"Eviction Watch Accounts",value:String(onWatch),  color:onWatch>0?C.red:C.textSub, icon:"⚑" },
  ];

  return (
    <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24 }}>
      {tiles.map(t=>(
        <div key={t.label} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 18px" }}>
          <div style={{ fontSize:10,fontWeight:600,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6 }}>{t.label}</div>
          <div style={{ fontSize:22,fontWeight:700,color:t.color,fontFamily:"'DM Sans',sans-serif",letterSpacing:"-0.02em" }}>{t.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Filter Drawer ────────────────────────────────────────────────────────────
const DEFAULT_FILTERS = {
  tenantId:"", category:"", status:"", minAmount:"", maxAmount:"",
  datePreset:"all", startDate:"", endDate:"", keyword:"",
};

function FilterDrawer({ open, onClose, filters, onChange, tenants, onClear }) {
  if (!open) return null;

  function setF(k,v) { onChange({...filters,[k]:v}); }

  function applyPreset(preset) {
    let s="", e="";
    if (preset==="this_month")  { s=startOfMonth();    e=today(); }
    if (preset==="last_month")  { s=startOfLastMonth(); e=endOfLastMonth(); }
    if (preset==="ytd")         { s=startOfYear();     e=today(); }
    onChange({...filters, datePreset:preset, startDate:s, endDate:e});
  }

  return (
    <>
      <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200 }} />
      <div style={{ position:"fixed",top:0,right:0,bottom:0,width:360,background:C.surface,borderLeft:`1px solid ${C.border}`,zIndex:201,overflowY:"auto",fontFamily:"'DM Sans',sans-serif" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 20px 16px",borderBottom:`1px solid ${C.border}` }}>
          <span style={{ fontSize:15,fontWeight:600,color:C.text }}>Filters</span>
          <div style={{ display:"flex",gap:8 }}>
            <GhostBtn small onClick={onClear}>Clear all</GhostBtn>
            <GhostBtn small onClick={onClose}>✕</GhostBtn>
          </div>
        </div>

        <div style={{ padding:"20px",display:"flex",flexDirection:"column",gap:20 }}>
          {/* Tenant */}
          <Sel label="Tenant" value={filters.tenantId} onChange={v=>setF("tenantId",v)}
            options={[{value:"",label:"All tenants"},...tenants.map(t=>({value:t.id,label:t.name||"Unknown Tenant"}))]} />

          {/* Category */}
          <Sel label="Category" value={filters.category} onChange={v=>setF("category",v)}
            options={[{value:"",label:"All categories"},...CATEGORIES.map(c=>({value:c,label:c}))]} />

          {/* Status */}
          <Sel label="Status" value={filters.status} onChange={v=>setF("status",v)}
            options={[{value:"",label:"All statuses"},{value:"Unpaid",label:"Unpaid"},{value:"Overdue",label:"Overdue"},{value:"Paid",label:"Paid"},{value:"Partial",label:"Partial"},{value:"Pending",label:"Pending"}]} />

          {/* Date Range */}
          <div>
            <label style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.07em",display:"block",marginBottom:8 }}>Date Range</label>
            <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:10 }}>
              {[["all","All Time"],["this_month","This Month"],["last_month","Last Month"],["ytd","Year to Date"],["custom","Custom"]].map(([k,l])=>(
                <button key={k} onClick={()=>applyPreset(k)}
                  style={{ fontSize:11,padding:"4px 9px",borderRadius:5,border:`1px solid ${filters.datePreset===k?C.gold:C.border}`,background:filters.datePreset===k?"rgba(201,169,110,0.1)":"transparent",color:filters.datePreset===k?C.gold:C.textSub,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                  {l}
                </button>
              ))}
            </div>
            {filters.datePreset==="custom"&&(
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                <Inp label="Start" type="date" value={filters.startDate} onChange={v=>setF("startDate",v)} />
                <Inp label="End"   type="date" value={filters.endDate}   onChange={v=>setF("endDate",v)} />
              </div>
            )}
          </div>

          {/* Amount Range */}
          <div>
            <label style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.07em",display:"block",marginBottom:8 }}>Amount Range</label>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
              <Inp label="Min ($)" type="number" value={filters.minAmount} onChange={v=>setF("minAmount",v)} placeholder="0" />
              <Inp label="Max ($)" type="number" value={filters.maxAmount} onChange={v=>setF("maxAmount",v)} placeholder="∞" />
            </div>
          </div>

          {/* Keyword */}
          <Inp label="Search / Keyword" value={filters.keyword} onChange={v=>setF("keyword",v)} placeholder="Tenant name, note, reference…" />
        </div>
      </div>
    </>
  );
}

// Active filter chips
function FilterChips({ filters, onChange }) {
  const chips = [];
  const tenantLabel = filters._tenantLabel;
  if (filters.tenantId)   chips.push({ key:"tenantId",   label:`Tenant: ${tenantLabel||filters.tenantId}` });
  if (filters.category)   chips.push({ key:"category",   label:`Category: ${filters.category}` });
  if (filters.status)     chips.push({ key:"status",     label:`Status: ${filters.status}` });
  if (filters.datePreset && filters.datePreset!=="all") chips.push({ key:"datePreset", label:`Date: ${filters.datePreset.replace("_"," ")}` });
  if (filters.minAmount)  chips.push({ key:"minAmount",  label:`Min: $${filters.minAmount}` });
  if (filters.maxAmount)  chips.push({ key:"maxAmount",  label:`Max: $${filters.maxAmount}` });
  if (filters.keyword)    chips.push({ key:"keyword",    label:`"${filters.keyword}"` });
  if (!chips.length) return null;

  function remove(key) {
    const reset = key==="datePreset" ? { datePreset:"all",startDate:"",endDate:"" } : { [key]:"" };
    onChange({...filters,...reset});
  }

  return (
    <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:12 }}>
      {chips.map(c=>(
        <span key={c.key} style={{ fontSize:11,padding:"4px 10px",borderRadius:20,background:"rgba(201,169,110,0.1)",color:C.gold,border:`1px solid rgba(201,169,110,0.25)`,display:"flex",alignItems:"center",gap:6 }}>
          {c.label}
          <button onClick={()=>remove(c.key)} style={{ background:"none",border:"none",color:C.gold,cursor:"pointer",padding:0,fontSize:12,lineHeight:1 }}>✕</button>
        </span>
      ))}
    </div>
  );
}

// Apply filters to payments array
function applyFilters(payments, filters, tenantMap) {
  return payments.filter(p => {
    if (filters.tenantId && p.tenant_id !== filters.tenantId) return false;
    if (filters.category && p.category !== filters.category) return false;
    if (filters.status   && p.status   !== filters.status)   return false;
    if (filters.minAmount && (p.amount||0) < parseFloat(filters.minAmount)) return false;
    if (filters.maxAmount && (p.amount||0) > parseFloat(filters.maxAmount)) return false;
    if (filters.startDate && (p.due_date||p.paid_at||"") < filters.startDate) return false;
    if (filters.endDate   && (p.due_date||p.paid_at||"") > filters.endDate)   return false;
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      const name = (tenantMap[p.tenant_id]||"").toLowerCase();
      if (!name.includes(kw) && !(p.category||"").toLowerCase().includes(kw) && !(p.id||"").toLowerCase().includes(kw)) return false;
    }
    return true;
  });
}

// ─── Modals ───────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,width:460,padding:"28px",maxHeight:"90vh",overflowY:"auto" }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.text,marginBottom:20 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function RequestMoneyModal({ tenants, onClose, onSave }) {
  const [form,setForm]=useState({ tenant_id:"",category:"Rent",amount:"",due_date:"",note:"" });
  const [saving,setSaving]=useState(false);
  const set=k=>v=>setForm(f=>({...f,[k]:v}));
  async function save() {
    setSaving(true);
    const amt=parseFloat(form.amount);
    const {error}=await supabase.from("payments").insert({ tenant_id:form.tenant_id,category:form.category,amount:amt,amount_cents:Math.round(amt*100),balance_due:amt,due_date:form.due_date,status:"Unpaid",is_recurring:false,created_at:new Date().toISOString() });
    setSaving(false);
    if (!error){onSave();onClose();}else alert(error.message);
  }
  return (
    <Modal title="Request Money" onClose={onClose}>
      <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
        <Sel label="Tenant" value={form.tenant_id} onChange={set("tenant_id")} options={[{value:"",label:"Select tenant…"},...tenants.map(t=>({value:t.id,label:t.name||"Unknown Tenant"}))]} />
        <Sel label="Category" value={form.category} onChange={set("category")} options={CATEGORIES} />
        <Inp label="Amount ($)" type="number" value={form.amount} onChange={set("amount")} placeholder="0.00" />
        <Inp label="Due Date" type="date" value={form.due_date} onChange={set("due_date")} />
        <Inp label="Note (optional)" value={form.note} onChange={set("note")} placeholder="Optional description" />
      </div>
      <div style={{ display:"flex",gap:10,justifyContent:"flex-end",marginTop:22 }}>
        <GhostBtn onClick={onClose}>Cancel</GhostBtn>
        <PrimaryBtn onClick={save} disabled={saving||!form.tenant_id||!form.amount||!form.due_date}>{saving?"Saving…":"Send Request"}</PrimaryBtn>
      </div>
    </Modal>
  );
}

function SendMoneyModal({ tenants, onClose, onSave }) {
  const [form,setForm]=useState({ tenant_id:"",category:"Security Deposit",amount:"",note:"" });
  const [saving,setSaving]=useState(false);
  const set=k=>v=>setForm(f=>({...f,[k]:v}));
  async function save() {
    setSaving(true);
    const amt=parseFloat(form.amount);
    const {error}=await supabase.from("payments").insert({ tenant_id:form.tenant_id,category:form.category,amount:-amt,amount_cents:-Math.round(amt*100),balance_due:0,due_date:today(),status:"Paid",is_recurring:false,created_at:new Date().toISOString(),paid_at:new Date().toISOString() });
    setSaving(false);
    if (!error){onSave();onClose();}else alert(error.message);
  }
  return (
    <Modal title="Send Money" onClose={onClose}>
      <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
        <Sel label="Tenant" value={form.tenant_id} onChange={set("tenant_id")} options={[{value:"",label:"Select tenant…"},...tenants.map(t=>({value:t.id,label:t.name||"Unknown Tenant"}))]} />
        <Sel label="Category" value={form.category} onChange={set("category")} options={["Security Deposit","Refund","Other"]} />
        <Inp label="Amount ($)" type="number" value={form.amount} onChange={set("amount")} placeholder="0.00" />
        <Inp label="Note (optional)" value={form.note} onChange={set("note")} />
      </div>
      <div style={{ display:"flex",gap:10,justifyContent:"flex-end",marginTop:22 }}>
        <GhostBtn onClick={onClose}>Cancel</GhostBtn>
        <PrimaryBtn onClick={save} disabled={saving||!form.tenant_id||!form.amount}>{saving?"Saving…":"Send Payment"}</PrimaryBtn>
      </div>
    </Modal>
  );
}

function OfflineModal({ tenants, onClose, onSave }) {
  const [form,setForm]=useState({ tenant_id:"",category:"Rent",amount:"",paid_at:"",method:"Check",note:"" });
  const [saving,setSaving]=useState(false);
  const set=k=>v=>setForm(f=>({...f,[k]:v}));
  async function save() {
    setSaving(true);
    const amt=parseFloat(form.amount);
    const {error}=await supabase.from("payments").insert({ tenant_id:form.tenant_id,category:form.category,amount:amt,amount_cents:Math.round(amt*100),balance_due:0,due_date:form.paid_at,status:"Paid",is_recurring:false,created_at:new Date().toISOString(),paid_at:new Date(form.paid_at).toISOString() });
    setSaving(false);
    if (!error){onSave();onClose();}else alert(error.message);
  }
  return (
    <Modal title="Track Offline Transaction" onClose={onClose}>
      <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
        <Sel label="Tenant" value={form.tenant_id} onChange={set("tenant_id")} options={[{value:"",label:"Select tenant…"},...tenants.map(t=>({value:t.id,label:t.name||"Unknown Tenant"}))]} />
        <Sel label="Category" value={form.category} onChange={set("category")} options={CATEGORIES} />
        <Inp label="Amount ($)" type="number" value={form.amount} onChange={set("amount")} placeholder="0.00" />
        <Inp label="Date Received" type="date" value={form.paid_at} onChange={set("paid_at")} />
        <Sel label="Method" value={form.method} onChange={set("method")} options={["Check","Cash","Zelle","Venmo","Other"]} />
        <Inp label="Note (optional)" value={form.note} onChange={set("note")} />
      </div>
      <div style={{ display:"flex",gap:10,justifyContent:"flex-end",marginTop:22 }}>
        <GhostBtn onClick={onClose}>Cancel</GhostBtn>
        <PrimaryBtn onClick={save} disabled={saving||!form.tenant_id||!form.amount||!form.paid_at}>{saving?"Saving…":"Record Payment"}</PrimaryBtn>
      </div>
    </Modal>
  );
}

function EditPaymentModal({ payment, onClose, onSave }) {
  const [form,setForm]=useState({ status:payment.status||"Unpaid",amount:payment.amount||"",balance_due:payment.balance_due||"",due_date:payment.due_date||"" });
  const [saving,setSaving]=useState(false);
  const set=k=>v=>setForm(f=>({...f,[k]:v}));
  async function save() {
    setSaving(true);
    const {error}=await supabase.from("payments").update({ status:form.status,amount:parseFloat(form.amount),amount_cents:Math.round(parseFloat(form.amount)*100),balance_due:parseFloat(form.balance_due),due_date:form.due_date,paid_at:form.status==="Paid"?new Date().toISOString():null }).eq("id",payment.id);
    setSaving(false);
    if (!error){onSave();onClose();}else alert(error.message);
  }
  return (
    <Modal title="Edit Payment" onClose={onClose}>
      <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
        <Sel label="Status" value={form.status} onChange={set("status")} options={["Unpaid","Pending","Paid","Partial","Overdue"]} />
        <Inp label="Amount ($)" type="number" value={form.amount} onChange={set("amount")} />
        <Inp label="Balance Due ($)" type="number" value={form.balance_due} onChange={set("balance_due")} />
        <Inp label="Due Date" type="date" value={form.due_date} onChange={set("due_date")} />
      </div>
      <div style={{ display:"flex",gap:10,justifyContent:"flex-end",marginTop:22 }}>
        <GhostBtn onClick={onClose}>Cancel</GhostBtn>
        <PrimaryBtn onClick={save} disabled={saving}>{saving?"Saving…":"Save Changes"}</PrimaryBtn>
      </div>
    </Modal>
  );
}

// ─── Payment Requests Tab ─────────────────────────────────────────────────────
function PaymentRequestsTab({ payments, filters, onChange, tenantMap, reload }) {
  const [editTarget,setEditTarget]=useState(null);
  const filtered = applyFilters(payments.filter(p=>!["Paid"].includes(p.status)||filters.status==="Paid"), filters, tenantMap);
  // Show all non-settled unless explicitly filtering for paid
  const display = applyFilters(payments, filters, tenantMap);
  const outstanding = display.filter(p=>["Unpaid","Overdue","Partial"].includes(p.status)).reduce((s,p)=>s+(p.balance_due||0),0);

  async function markPaid(row) {
    await supabase.from("payments").update({ status:"Paid",balance_due:0,paid_at:new Date().toISOString() }).eq("id",row.id);
    reload();
  }
  async function cancel(id) {
    if (!window.confirm("Cancel this payment request?")) return;
    await supabase.from("payments").delete().eq("id",id);
    reload();
  }

  return (
    <div>
      {outstanding > 0 && (
        <div style={{ background:"rgba(224,85,85,0.07)",border:"1px solid rgba(224,85,85,0.2)",borderRadius:8,padding:"10px 16px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ fontSize:13,color:C.textSub }}>Total outstanding balance</span>
          <span style={{ fontSize:15,fontWeight:700,color:C.red }}>{fmt$(outstanding)}</span>
        </div>
      )}
      {display.length === 0 ? (
        <div style={{ color:C.textMuted,fontSize:13,padding:"60px 0",textAlign:"center" }}>No payment requests match your filters.</div>
      ) : (
        <div style={{ overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}` }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead><tr>
              <TH>Tenant</TH><TH>Category</TH><TH>Due Date</TH><TH>Status</TH>
              <TH right>Amount</TH><TH right>Balance Due</TH><TH>Actions</TH>
            </tr></thead>
            <tbody>
              {display.map(p=>(
                <tr key={p.id} style={{ background:p.status==="Overdue"?"rgba(224,85,85,0.03)":"transparent",transition:"background 0.1s" }}
                  onMouseOver={e=>e.currentTarget.style.background="rgba(255,255,255,0.02)"}
                  onMouseOut={e=>e.currentTarget.style.background=p.status==="Overdue"?"rgba(224,85,85,0.03)":"transparent"}>
                  <TD bold>{tenantMap[p.tenant_id]||"—"}</TD>
                  <TD>{p.category||"—"}</TD>
                  <TD nowrap>{fmtDate(p.due_date)}</TD>
                  <TD><StatusBadge status={p.status} /></TD>
                  <TD right mono bold>{fmt$(p.amount)}</TD>
                  <TD right mono color={(p.balance_due||0)>0?C.red:C.green}>{fmt$(p.balance_due)}</TD>
                  <TD>
                    <div style={{ display:"flex",gap:5 }}>
                      {p.status!=="Paid"&&<button onClick={()=>markPaid(p)} style={{ fontSize:10,padding:"3px 7px",borderRadius:4,border:"1px solid rgba(114,176,42,0.4)",background:"rgba(114,176,42,0.08)",color:C.green,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" }}>Mark Paid</button>}
                      <button onClick={()=>setEditTarget(p)} style={{ fontSize:10,padding:"3px 7px",borderRadius:4,border:`1px solid ${C.border}`,background:"transparent",color:C.textSub,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>Edit</button>
                      <button onClick={()=>cancel(p.id)} style={{ fontSize:10,padding:"3px 7px",borderRadius:4,border:"1px solid rgba(224,85,85,0.3)",background:"transparent",color:C.red,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>✕</button>
                    </div>
                  </TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editTarget&&<EditPaymentModal payment={editTarget} onClose={()=>setEditTarget(null)} onSave={reload} />}
    </div>
  );
}

// ─── Transactions Tab ─────────────────────────────────────────────────────────
const TX_SUBTABS = ["All Transactions","Needs Review","Excluded"];

function TransactionsTab({ payments, filters, tenantMap, reload }) {
  const [sub,setSub]=useState(0);
  const [excluded,setExcluded]=useState(new Set());
  const [needsReview,setNeedsReview]=useState(new Set());

  // Settled = Paid or Overdue (for ledger purposes)
  const settled = applyFilters(payments.filter(p=>["Paid","Overdue","Partial","Pending"].includes(p.status)), filters, tenantMap);
  const allTx   = applyFilters(payments, filters, tenantMap).filter(p=>!excluded.has(p.id)&&!needsReview.has(p.id));
  const reviewTx= applyFilters(payments, filters, tenantMap).filter(p=>needsReview.has(p.id));
  const excTx   = applyFilters(payments, filters, tenantMap).filter(p=>excluded.has(p.id));

  const rows = sub===0 ? allTx : sub===1 ? reviewTx : excTx;

  function txStatus(p) {
    if (p.status==="Paid") return "Settled";
    if (p.status==="Pending") return "Pending";
    if (p.status==="Overdue") return "Overdue";
    return p.status||"—";
  }

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display:"flex",gap:2,marginBottom:20,borderBottom:`1px solid ${C.border}` }}>
        {TX_SUBTABS.map((t,i)=>(
          <button key={t} onClick={()=>setSub(i)}
            style={{ fontSize:12,fontWeight:500,padding:"8px 14px",background:"transparent",border:"none",borderBottom:`2px solid ${sub===i?C.gold:"transparent"}`,color:sub===i?C.gold:C.textSub,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",marginBottom:-1 }}>
            {t}{i===1&&reviewTx.length>0&&<span style={{ marginLeft:5,fontSize:9,padding:"2px 6px",borderRadius:10,background:"rgba(240,164,48,0.2)",color:C.amber }}>{reviewTx.length}</span>}
          </button>
        ))}
      </div>

      {rows.length===0?(
        <div style={{ color:C.textMuted,fontSize:13,padding:"60px 0",textAlign:"center" }}>
          {sub===1?"No transactions flagged for review.":sub===2?"No excluded transactions.":"No transactions found."}
        </div>
      ):(
        <div style={{ overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}` }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead><tr>
              <TH>Date</TH><TH>Tenant</TH><TH>Category</TH>
              <TH>Reference</TH><TH>Status</TH>
              <TH right>Amount</TH><TH>Actions</TH>
            </tr></thead>
            <tbody>
              {rows.map(p=>{
                const incoming = (p.amount||0) >= 0;
                return (
                  <tr key={p.id}
                    onMouseOver={e=>e.currentTarget.style.background="rgba(255,255,255,0.02)"}
                    onMouseOut={e=>e.currentTarget.style.background="transparent"}>
                    <TD nowrap>{fmtDate(p.paid_at||p.due_date)}</TD>
                    <TD bold>{tenantMap[p.tenant_id]||"—"}</TD>
                    <TD>{p.category||"—"}</TD>
                    <TD><span style={{ fontSize:11,fontFamily:"monospace",color:C.textMuted }}>{p.id?.slice(0,8).toUpperCase()}</span></TD>
                    <TD><StatusBadge status={txStatus(p)} /></TD>
                    <TD right mono bold color={incoming?C.green:C.red}>{incoming?"+":""}{fmt$(p.amount)}</TD>
                    <TD>
                      <div style={{ display:"flex",gap:5 }}>
                        {sub!==1&&<button onClick={()=>setNeedsReview(s=>{const n=new Set(s);n.has(p.id)?n.delete(p.id):n.add(p.id);return n;})} style={{ fontSize:10,padding:"3px 7px",borderRadius:4,border:`1px solid ${C.border}`,background:"transparent",color:C.amber,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" }}>Flag</button>}
                        {sub===1&&<button onClick={()=>setNeedsReview(s=>{const n=new Set(s);n.delete(p.id);return n;})} style={{ fontSize:10,padding:"3px 7px",borderRadius:4,border:`1px solid ${C.border}`,background:"transparent",color:C.green,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" }}>Unflag</button>}
                        {sub!==2&&<button onClick={()=>setExcluded(s=>{const n=new Set(s);n.add(p.id);return n;})} style={{ fontSize:10,padding:"3px 7px",borderRadius:4,border:"1px solid rgba(224,85,85,0.3)",background:"transparent",color:C.red,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" }}>Exclude</button>}
                        {sub===2&&<button onClick={()=>setExcluded(s=>{const n=new Set(s);n.delete(p.id);return n;})} style={{ fontSize:10,padding:"3px 7px",borderRadius:4,border:`1px solid ${C.border}`,background:"transparent",color:C.textSub,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" }}>Restore</button>}
                      </div>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Recurring Tab ────────────────────────────────────────────────────────────
function RecurringTab({ payments, filters, tenantMap }) {
  const display = applyFilters(payments.filter(p=>p.is_recurring), filters, tenantMap);
  return (
    <div>
      <div style={{ fontSize:12,color:C.textMuted,marginBottom:14 }}>Recurring charges generated automatically each month.</div>
      {display.length===0?(
        <div style={{ color:C.textMuted,fontSize:13,padding:"60px 0",textAlign:"center" }}>No recurring charges found.</div>
      ):(
        <div style={{ overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}` }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead><tr><TH>Tenant</TH><TH>Category</TH><TH>Due Date</TH><TH>Status</TH><TH right>Amount</TH><TH right>Balance Due</TH></tr></thead>
            <tbody>
              {display.map(p=>(
                <tr key={p.id} onMouseOver={e=>e.currentTarget.style.background="rgba(255,255,255,0.02)"} onMouseOut={e=>e.currentTarget.style.background="transparent"}>
                  <TD bold>{tenantMap[p.tenant_id]||"—"}</TD>
                  <TD>{p.category||"—"}</TD>
                  <TD nowrap>{fmtDate(p.due_date)}</TD>
                  <TD><StatusBadge status={p.status} /></TD>
                  <TD right mono bold>{fmt$(p.amount)}</TD>
                  <TD right mono color={(p.balance_due||0)>0?C.red:C.green}>{fmt$(p.balance_due)}</TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Lease Terms Tab ──────────────────────────────────────────────────────────
function LeaseTermsTab({ tenants, leases, filters, onChange }) {
  const selectedId = filters.tenantId;

  const activePairs = tenants.map(t=>({
    tenant:t,
    lease: leases.find(l=>l.tenant_id===t.id) || null,
  }));

  const display = selectedId ? activePairs.filter(p=>p.tenant.id===selectedId) : activePairs;

  function infoRow(label,value,last,color) {
    return (
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:last?"none":`1px solid ${C.border}` }}>
        <span style={{ fontSize:12,color:C.textSub }}>{label}</span>
        <span style={{ fontSize:12,fontWeight:500,color:color||C.text }}>{value||"—"}</span>
      </div>
    );
  }

  return (
    <div>
      <div style={{ background:"rgba(201,169,110,0.07)",border:"1px solid rgba(201,169,110,0.2)",borderRadius:8,padding:"10px 14px",marginBottom:20,fontSize:12,color:C.amber,lineHeight:1.5 }}>
        ⚠️ Editing lease information here does not create or update payment requests. Use the <strong>Payment Requests</strong> tab to create or update payments.
      </div>

      {display.length===0?(
        <div style={{ color:C.textMuted,fontSize:13,padding:"60px 0",textAlign:"center" }}>No active tenants found.</div>
      ):(
        <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
          {display.map(({tenant,lease})=>(
            <div key={tenant.id} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden" }}>
              {/* Tenant header */}
              <div style={{ padding:"14px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:C.raised }}>
                <div>
                  <div style={{ fontSize:14,fontWeight:600,color:C.text }}>{tenant.name||"Unknown Tenant"}</div>
                  <div style={{ fontSize:11,color:C.textMuted,marginTop:2 }}>{tenant.email}</div>
                </div>
                <div style={{ display:"flex",gap:8 }}>
                  {tenant.eviction_watch&&<span style={{ fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:3,background:"rgba(224,85,85,0.15)",color:C.red,border:"1px solid rgba(224,85,85,0.3)" }}>⚑ WATCH</span>}
                  <span style={{ fontSize:10,padding:"3px 8px",borderRadius:5,background:tenant.autopay_enabled?"rgba(114,176,42,0.1)":"rgba(144,149,160,0.1)",color:tenant.autopay_enabled?C.green:C.textMuted,border:`1px solid ${tenant.autopay_enabled?"rgba(114,176,42,0.3)":"rgba(144,149,160,0.15)"}` }}>{tenant.autopay_enabled?"Autopay On":"Autopay Off"}</span>
                  <span style={{ fontSize:10,padding:"3px 8px",borderRadius:5,background:tenant.bank_connected?"rgba(74,154,232,0.1)":"rgba(144,149,160,0.1)",color:tenant.bank_connected?C.blue:C.textMuted,border:`1px solid ${tenant.bank_connected?"rgba(74,154,232,0.3)":"rgba(144,149,160,0.15)"}` }}>{tenant.bank_connected?"Bank Added":"No Bank"}</span>
                </div>
              </div>

              {/* Lease grid */}
              {!lease?(
                <div style={{ padding:"20px 18px",color:C.textMuted,fontSize:12 }}>No lease record found for this tenant.</div>
              ):(
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:0 }}>
                  {[
                    ["Lease Start",  fmtDate(lease.start_date)],
                    ["Lease End",    fmtDate(lease.end_date)],
                    ["Term Type",    lease.term_type||"Fixed"],
                    ["Monthly Rent", fmt$(lease.rent_amount)],
                    ["Security Deposit", fmt$(lease.security_deposit)],
                    ["Rent Due",     "1st of month"],
                    ["Grace Period", "Through 5th (11:59 PM)"],
                    ["Late Fee Date","6th of month"],
                    ["Late Fee",     "$50.00 one-time", null, C.amber],
                  ].map(([label,value,,color],i,arr)=>(
                    <div key={label} style={{ padding:"12px 18px",borderBottom:`1px solid ${C.border}`,borderRight:i%3!==2?`1px solid ${C.border}`:"none" }}>
                      <div style={{ fontSize:10,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4 }}>{label}</div>
                      <div style={{ fontSize:13,fontWeight:500,color:color||C.text }}>{value||"—"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const MAIN_TABS = ["Payment Requests","Transactions","Recurring","Lease Terms"];

export default function LandlordFinancials() {
  const { tenantId } = useParams();
  const { tenants, leases, payments, loading, error, reload, tenantMap } = useFinancialsData();

  const [tab,setTab]       = useState(0);
  const [modal,setModal]   = useState(null);
  const [drawerOpen,setDrawerOpen] = useState(false);
  const [filters,setFilters] = useState({ ...DEFAULT_FILTERS, tenantId: tenantId||"" });

  // Keep _tenantLabel in sync for chips display
  useEffect(()=>{
    if (filters.tenantId && tenantMap[filters.tenantId]) {
      setFilters(f=>({...f, _tenantLabel:tenantMap[filters.tenantId]}));
    }
  },[filters.tenantId, tenantMap]);

  function clearFilters() { setFilters({ ...DEFAULT_FILTERS, _tenantLabel:"" }); }

  const activeFilterCount = [filters.tenantId,filters.category,filters.status,filters.keyword,filters.minAmount,filters.maxAmount].filter(Boolean).length + (filters.datePreset&&filters.datePreset!=="all"?1:0);

  return (
    <LandlordLayout>
      <div style={{ maxWidth:1200,margin:"0 auto",padding:"32px 24px",fontFamily:"'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,flexWrap:"wrap",gap:12 }}>
          <div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:600,color:C.text,letterSpacing:"-0.01em" }}>Financials</div>
            <div style={{ fontSize:13,color:C.textSub,marginTop:3 }}>Payment requests, transactions, recurring charges, and lease terms</div>
          </div>
          <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
            <GhostBtn onClick={()=>setModal("offline")}>📋 Track Offline</GhostBtn>
            <GhostBtn onClick={()=>setModal("send")}>💸 Send Money</GhostBtn>
            <PrimaryBtn onClick={()=>setModal("request")}>＋ Request Money</PrimaryBtn>
          </div>
        </div>

        {/* Analytics Summary Bar */}
        {!loading && <SummaryBar payments={payments} tenants={tenants} />}

        {/* Search + Filter bar */}
        <div style={{ display:"flex",gap:10,alignItems:"center",marginBottom:16 }}>
          <div style={{ position:"relative",flex:1,maxWidth:340 }}>
            <span style={{ position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.textMuted,fontSize:14,pointerEvents:"none" }}>🔍</span>
            <input value={filters.keyword} onChange={e=>setFilters(f=>({...f,keyword:e.target.value}))} placeholder="Search tenant, category, reference…"
              style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,padding:"8px 11px 8px 32px",fontFamily:"'DM Sans',sans-serif",outline:"none",width:"100%",boxSizing:"border-box" }} />
          </div>
          <div style={{ position:"relative" }}>
            <GhostBtn onClick={()=>setDrawerOpen(true)} active={activeFilterCount>0}>
              ⚙ Filters{activeFilterCount>0?` (${activeFilterCount})`:""}
            </GhostBtn>
          </div>
          {/* Tenant quick filter */}
          <select value={filters.tenantId} onChange={e=>setFilters(f=>({...f,tenantId:e.target.value}))}
            style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,color:filters.tenantId?C.text:C.textSub,fontSize:13,padding:"8px 11px",fontFamily:"'DM Sans',sans-serif",outline:"none" }}>
            <option value="">All tenants</option>
            {tenants.map(t=><option key={t.id} value={t.id}>{t.name||"Unknown Tenant"}</option>)}
          </select>
          {(filters.tenantId||activeFilterCount>0)&&(
            <button onClick={clearFilters} style={{ fontSize:11,color:C.textMuted,background:"transparent",border:"none",cursor:"pointer" }}>✕ Clear</button>
          )}
        </div>

        {/* Active filter chips */}
        <FilterChips filters={filters} onChange={setFilters} />

        {/* Main tabs */}
        <div style={{ display:"flex",gap:2,marginBottom:24,borderBottom:`1px solid ${C.border}` }}>
          {MAIN_TABS.map((t,i)=>(
            <button key={t} onClick={()=>setTab(i)}
              style={{ fontSize:13,fontWeight:500,padding:"10px 18px",background:"transparent",border:"none",borderBottom:`2px solid ${tab===i?C.gold:"transparent"}`,color:tab===i?C.gold:C.textSub,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s",marginBottom:-1,whiteSpace:"nowrap" }}>
              {t}
            </button>
          ))}
        </div>

        {/* Loading / error */}
        {loading&&<div style={{ color:C.textMuted,fontSize:13,padding:"60px 0",textAlign:"center" }}>Loading financials…</div>}
        {error&&<div style={{ color:C.red,fontSize:13,padding:"20px",background:"rgba(224,85,85,0.07)",borderRadius:8,marginBottom:16 }}>Error: {error}</div>}

        {/* Tab content */}
        {!loading&&tab===0&&<PaymentRequestsTab payments={payments} filters={filters} onChange={setFilters} tenantMap={tenantMap} reload={reload} />}
        {!loading&&tab===1&&<TransactionsTab    payments={payments} filters={filters} tenantMap={tenantMap} reload={reload} />}
        {!loading&&tab===2&&<RecurringTab       payments={payments} filters={filters} tenantMap={tenantMap} />}
        {!loading&&tab===3&&<LeaseTermsTab      tenants={tenants}   leases={leases}   filters={filters} onChange={setFilters} />}

        {/* Filter drawer */}
        <FilterDrawer open={drawerOpen} onClose={()=>setDrawerOpen(false)} filters={filters} onChange={setFilters} tenants={tenants} onClear={clearFilters} />

        {/* Modals */}
        {modal==="request"&&<RequestMoneyModal tenants={tenants} onClose={()=>setModal(null)} onSave={reload} />}
        {modal==="send"   &&<SendMoneyModal    tenants={tenants} onClose={()=>setModal(null)} onSave={reload} />}
        {modal==="offline"&&<OfflineModal      tenants={tenants} onClose={()=>setModal(null)} onSave={reload} />}
      </div>
    </LandlordLayout>
  );
}