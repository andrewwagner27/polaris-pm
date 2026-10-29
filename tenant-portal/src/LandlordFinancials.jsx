import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
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

// ─── Shared UI atoms ───────────────────────────────────────────────────────
function PrimaryBtn({ children, onClick, disabled, small }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background:"transparent",border:`1px solid ${C.goldDim}`,color:C.gold,fontSize:small?11:13,fontWeight:500,padding:small?"5px 10px":"9px 18px",borderRadius:7,cursor:disabled?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.04em",transition:"background 0.15s",whiteSpace:"nowrap",opacity:disabled?0.6:1 }}
      onMouseOver={e=>!disabled&&(e.currentTarget.style.background="rgba(201,169,110,0.07)")}
      onMouseOut={e=>e.currentTarget.style.background="transparent"}
    >{children}</button>
  );
}

function GhostBtn({ children, onClick, small }) {
  return (
    <button onClick={onClick}
      style={{ background:"transparent",border:`1px solid ${C.border}`,color:C.textSub,fontSize:small?11:13,fontWeight:500,padding:small?"5px 10px":"9px 18px",borderRadius:7,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s",whiteSpace:"nowrap" }}
      onMouseOver={e=>{ e.currentTarget.style.color=C.text; e.currentTarget.style.borderColor="#353A44"; }}
      onMouseOut={e=>{ e.currentTarget.style.color=C.textSub; e.currentTarget.style.borderColor=C.border; }}
    >{children}</button>
  );
}

function FieldLabel({ children }) {
  return <label style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.07em",display:"block",marginBottom:5 }}>{children}</label>;
}

function Input({ value, onChange, placeholder, type="text", style: extraStyle }) {
  const [focused, setFocused] = useState(false);
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
      style={{ width:"100%",padding:"10px 12px",fontSize:13,border:`1px solid ${focused?C.gold:C.border}`,borderRadius:7,background:C.raised,color:C.text,outline:"none",boxSizing:"border-box",fontFamily:"'DM Sans',sans-serif",boxShadow:focused?"0 0 0 3px rgba(201,169,110,0.08)":"none",transition:"border-color 0.15s",...extraStyle }}
    />
  );
}

function Select({ value, onChange, children, disabled }) {
  return (
    <select value={value} onChange={onChange} disabled={disabled}
      style={{ width:"100%",padding:"10px 12px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,background:C.raised,color:value?C.text:C.textSub,outline:"none",boxSizing:"border-box",fontFamily:"'DM Sans',sans-serif",cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1 }}>
      {children}
    </select>
  );
}

function TH({ children, right }) {
  return <th style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",padding:"11px 16px",textAlign:right?"right":"left",borderBottom:`1px solid ${C.border}`,background:C.raised,whiteSpace:"nowrap" }}>{children}</th>;
}

function TD({ children, right, bold, muted }) {
  return <td style={{ padding:"12px 16px",fontSize:13,color:muted?C.textSub:bold?C.text:C.textSub,fontWeight:bold?500:400,textAlign:right?"right":"left",borderBottom:`1px solid ${C.border}` }}>{children}</td>;
}

function Badge({ status }) {
  const map = {
    paid:    { bg:"rgba(114,176,42,0.13)",  color:C.green,  label:"Paid"    },
    pending: { bg:"rgba(240,164,48,0.13)",  color:C.amber,  label:"Pending" },
    failed:  { bg:"rgba(224,85,85,0.13)",   color:C.red,    label:"Failed"  },
    late:    { bg:"rgba(224,85,85,0.13)",   color:C.red,    label:"Late"    },
  };
  const cfg = map[status] || { bg:"rgba(92,98,112,0.13)", color:C.textSub, label:status||"—" };
  return <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:cfg.bg,color:cfg.color }}>{cfg.label}</span>;
}

const fmt = (n) => `$${parseFloat(n||0).toLocaleString("en-US",{minimumFractionDigits:2})}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—";

// ─── Record Payment Modal ──────────────────────────────────────────────────
function RecordPaymentModal({ tenants, onClose, onSaved }) {
  const [form, setForm]   = useState({ tenant_id:"", amount:"", paid_at:new Date().toISOString().slice(0,10), method:"ach", note:"" });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const update = (k,v) => setForm(f=>({...f,[k]:v}));

  async function submit() {
    if (!form.tenant_id) { setError("Select a tenant."); return; }
    if (!form.amount || isNaN(parseFloat(form.amount))) { setError("Enter a valid amount."); return; }
    setSaving(true); setError("");
    const { error:err } = await supabase.from("payments").insert({
      tenant_id: form.tenant_id,
      amount:    parseFloat(form.amount),
      paid_at:   form.paid_at ? new Date(form.paid_at).toISOString() : new Date().toISOString(),
      method:    form.method,
      status:    "paid",
      note:      form.note||null,
    });
    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,width:460,maxHeight:"90vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"20px 24px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div style={{ fontSize:15,fontWeight:600,color:C.text }}>Record payment</div>
          <button onClick={onClose} style={{ background:"none",border:"none",fontSize:16,cursor:"pointer",color:C.textSub }}>✕</button>
        </div>
        <div style={{ padding:"18px 24px" }}>
          {error&&<div style={{ background:"rgba(224,85,85,0.1)",color:C.red,fontSize:12,padding:"10px 12px",borderRadius:7,marginBottom:14,border:`1px solid rgba(224,85,85,0.2)` }}>{error}</div>}
          <div style={{ marginBottom:12 }}>
            <FieldLabel>Tenant *</FieldLabel>
            <Select value={form.tenant_id} onChange={e=>update("tenant_id",e.target.value)}>
              <option value="">Select tenant…</option>
              {tenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
            <div>
              <FieldLabel>Amount *</FieldLabel>
              <div style={{ position:"relative" }}>
                <span style={{ position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:C.textSub,fontSize:13 }}>$</span>
                <Input type="number" value={form.amount} onChange={e=>update("amount",e.target.value)} placeholder="0.00" style={{ paddingLeft:24 }}/>
              </div>
            </div>
            <div>
              <FieldLabel>Date</FieldLabel>
              <Input type="date" value={form.paid_at} onChange={e=>update("paid_at",e.target.value)}/>
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <FieldLabel>Method</FieldLabel>
            <Select value={form.method} onChange={e=>update("method",e.target.value)}>
              <option value="ach">ACH / Bank Transfer</option>
              <option value="check">Check</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div style={{ marginBottom:4 }}>
            <FieldLabel>Note (optional)</FieldLabel>
            <Input value={form.note} onChange={e=>update("note",e.target.value)} placeholder="e.g. March rent"/>
          </div>
        </div>
        <div style={{ padding:"14px 24px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10,justifyContent:"flex-end" }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={saving}>{saving?"Saving…":"Record payment"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Add Recurring Charge Modal ────────────────────────────────────────────
function AddRecurringChargeModal({ tenants, onClose, onSaved }) {
  const [form, setForm]     = useState({ tenant_id:"", category:"Rent", amount:"", start_date:"", end_date:"" });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const update = (k,v) => setForm(f=>({...f,[k]:v}));

  async function submit() {
    if (!form.tenant_id) { setError("Select a tenant."); return; }
    if (!form.amount || isNaN(parseFloat(form.amount))) { setError("Enter a valid amount."); return; }
    setSaving(true); setError("");
    const { error:err } = await supabase.from("recurring_charges").insert({
      tenant_id:  form.tenant_id,
      category:   form.category,
      amount:     parseFloat(form.amount),
      start_date: form.start_date||null,
      end_date:   form.end_date||null,
    });
    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,width:460,maxHeight:"90vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"20px 24px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div style={{ fontSize:15,fontWeight:600,color:C.text }}>Add recurring charge</div>
          <button onClick={onClose} style={{ background:"none",border:"none",fontSize:16,cursor:"pointer",color:C.textSub }}>✕</button>
        </div>
        <div style={{ padding:"18px 24px" }}>
          {error&&<div style={{ background:"rgba(224,85,85,0.1)",color:C.red,fontSize:12,padding:"10px 12px",borderRadius:7,marginBottom:14,border:`1px solid rgba(224,85,85,0.2)` }}>{error}</div>}
          <div style={{ marginBottom:12 }}>
            <FieldLabel>Tenant *</FieldLabel>
            <Select value={form.tenant_id} onChange={e=>update("tenant_id",e.target.value)}>
              <option value="">Select tenant…</option>
              {tenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
            <div>
              <FieldLabel>Category</FieldLabel>
              <Select value={form.category} onChange={e=>update("category",e.target.value)}>
                <option value="Rent">Rent</option>
                <option value="Pet Fee">Pet Fee</option>
                <option value="Parking">Parking</option>
                <option value="Storage">Storage</option>
                <option value="Utilities">Utilities</option>
                <option value="Laundry">Laundry</option>
                <option value="Other">Other</option>
              </Select>
            </div>
            <div>
              <FieldLabel>Monthly amount *</FieldLabel>
              <div style={{ position:"relative" }}>
                <span style={{ position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:C.textSub,fontSize:13 }}>$</span>
                <Input type="number" value={form.amount} onChange={e=>update("amount",e.target.value)} placeholder="0.00" style={{ paddingLeft:24 }}/>
              </div>
            </div>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:4 }}>
            <div>
              <FieldLabel>Start date</FieldLabel>
              <Input type="date" value={form.start_date} onChange={e=>update("start_date",e.target.value)}/>
            </div>
            <div>
              <FieldLabel>End date</FieldLabel>
              <Input type="date" value={form.end_date} onChange={e=>update("end_date",e.target.value)}/>
            </div>
          </div>
        </div>
        <div style={{ padding:"14px 24px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10,justifyContent:"flex-end" }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={saving}>{saving?"Saving…":"Add charge"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Recurring Charges Tab ─────────────────────────────────────────────────
function RecurringChargesTab({ charges, tenantMap, onRefresh }) {
  // All fetched charges are active (no status column in DB yet)
  const activeCharges = charges;

  async function deleteCharge(id) {
    if (!window.confirm("Delete this recurring charge?")) return;
    await supabase.from("recurring_charges").delete().eq("id",id);
    onRefresh();
  }

  const totalMonthly = activeCharges.reduce((s,c)=>s+parseFloat(c.amount||0),0);
  const [showAdd, setShowAdd] = useState(false);

  // Build tenant list from tenantMap for the modal
  const tenantList = Object.values(tenantMap);

  return (
    <div>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16 }}>
        <div>
          <div style={{ fontSize:13,color:C.textSub }}>
            {activeCharges.length} charges · <span style={{ color:C.gold,fontWeight:600 }}>{fmt(totalMonthly)}/mo</span> total
          </div>
        </div>
        <PrimaryBtn small onClick={()=>setShowAdd(true)}>+ Add charge</PrimaryBtn>
      </div>

      {activeCharges.length===0?(
        <div style={{ textAlign:"center",padding:"40px 20px",color:C.textSub,fontSize:13 }}>
          No recurring charges yet. Add one above.
        </div>
      ):(
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:C.raised }}>
                <TH>Tenant</TH><TH>Category</TH><TH>Amount</TH><TH>Start → End</TH><TH>Actions</TH>
              </tr>
            </thead>
            <tbody>
              {activeCharges.map(c=>{
                const tenant = tenantMap[c.tenant_id];
                return (
                  <tr key={c.id}
                    style={{ transition:"background 0.1s" }}
                    onMouseOver={e=>e.currentTarget.style.background=C.raised}
                    onMouseOut={e=>e.currentTarget.style.background="transparent"}>
                    <TD bold>{tenant?.name||"—"}</TD>
                    <TD bold>{c.category}</TD>
                    <TD bold>{fmt(c.amount)}/mo</TD>
                    <TD>
                      <span style={{ fontSize:11 }}>
                        {c.start_date?new Date(c.start_date).toLocaleDateString("en-US",{month:"short",year:"numeric"}):"—"}
                        {" → "}
                        {c.end_date?new Date(c.end_date).toLocaleDateString("en-US",{month:"short",year:"numeric"}):"Ongoing"}
                      </span>
                    </TD>
                    <TD>
                      <button onClick={()=>deleteCharge(c.id)}
                        style={{ background:"transparent",border:`1px solid rgba(224,85,85,0.25)`,color:C.red,fontSize:11,padding:"3px 8px",borderRadius:6,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                        Delete
                      </button>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd&&(
        <AddRecurringChargeModal
          tenants={tenantList}
          onClose={()=>setShowAdd(false)}
          onSaved={()=>{ setShowAdd(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── Payments Tab ──────────────────────────────────────────────────────────
function PaymentsTab({ payments, tenantMap, onRefresh, tenants }) {
  const [showRecord, setShowRecord] = useState(false);
  const [filter, setFilter]         = useState("all");

  const filtered = filter==="all" ? payments : payments.filter(p=>p.status===filter);

  const totalPaid = payments.filter(p=>p.status==="paid").reduce((s,p)=>s+parseFloat(p.amount||0),0);
  const totalPending = payments.filter(p=>p.status==="pending").reduce((s,p)=>s+parseFloat(p.amount||0),0);

  return (
    <div>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10 }}>
        <div style={{ display:"flex",gap:8 }}>
          {["all","paid","pending","failed"].map(f=>(
            <button key={f} onClick={()=>setFilter(f)}
              style={{ padding:"5px 12px",fontSize:12,fontWeight:500,borderRadius:6,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",border:`1px solid ${filter===f?C.goldDim:C.border}`,background:filter===f?"rgba(201,169,110,0.12)":"transparent",color:filter===f?C.gold:C.textSub,transition:"all 0.15s" }}>
              {f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          ))}
        </div>
        <PrimaryBtn small onClick={()=>setShowRecord(true)}>+ Record payment</PrimaryBtn>
      </div>

      {/* Summary strip */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:18 }}>
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px" }}>
          <div style={{ fontSize:10,fontWeight:600,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6 }}>Paid (all time)</div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:600,color:C.green }}>{fmt(totalPaid)}</div>
        </div>
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px" }}>
          <div style={{ fontSize:10,fontWeight:600,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6 }}>Pending</div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:600,color:C.amber }}>{fmt(totalPending)}</div>
        </div>
      </div>

      {filtered.length===0?(
        <div style={{ textAlign:"center",padding:"40px 20px",color:C.textSub,fontSize:13 }}>No payments match this filter.</div>
      ):(
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:C.raised }}>
                <TH>Tenant</TH><TH>Amount</TH><TH>Date</TH><TH>Method</TH><TH>Status</TH><TH>Note</TH>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p=>{
                const tenant = tenantMap[p.tenant_id];
                return (
                  <tr key={p.id}
                    style={{ transition:"background 0.1s" }}
                    onMouseOver={e=>e.currentTarget.style.background=C.raised}
                    onMouseOut={e=>e.currentTarget.style.background="transparent"}>
                    <TD bold>{tenant?.name||"—"}</TD>
                    <TD bold>{fmt(p.amount)}</TD>
                    <TD>{fmtDate(p.paid_at||p.created_at)}</TD>
                    <TD>{p.method||"—"}</TD>
                    <TD><Badge status={p.status}/></TD>
                    <TD muted>{p.note||"—"}</TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showRecord&&(
        <RecordPaymentModal
          tenants={tenants}
          onClose={()=>setShowRecord(false)}
          onSaved={()=>{ setShowRecord(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function LandlordFinancials() {
  const { tenantId: paramTenantId } = useParams();
  const navigate = useNavigate();

  const [tenants,          setTenants]          = useState([]);
  const [units,            setUnits]            = useState([]);
  const [properties,       setProperties]       = useState([]);
  const [payments,         setPayments]         = useState([]);
  const [recurringCharges, setRecurringCharges] = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [activeTab,        setActiveTab]        = useState("payments");
  const [tenantFilter,     setTenantFilter]     = useState(paramTenantId||"all");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [
      { data:tenantsData },
      { data:unitsData },
      { data:propsData },
      { data:paymentsData },
      { data:chargesData },
    ] = await Promise.all([
      supabase.from("tenants").select("*").eq("archived",false),
      supabase.from("units").select("*"),
      supabase.from("properties").select("*"),
      supabase.from("payments").select("*").order("created_at",{ ascending:false }),
      supabase.from("recurring_charges").select("*").order("created_at",{ ascending:false }),
    ]);
    setTenants(tenantsData||[]);
    setUnits(unitsData||[]);
    setProperties(propsData||[]);
    setPayments(paymentsData||[]);
    setRecurringCharges(chargesData||[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Build a quick tenant lookup map
  const tenantMap = {};
  tenants.forEach(t => { tenantMap[t.id] = t; });

  // Filter by selected tenant
  const filteredPayments  = tenantFilter==="all" ? payments  : payments.filter(p=>p.tenant_id===tenantFilter);
  const filteredCharges   = tenantFilter==="all" ? recurringCharges : recurringCharges.filter(c=>c.tenant_id===tenantFilter);

  // Portfolio-level stats
  const now       = new Date();
  const thisMonth = payments.filter(p=>{
    if (p.status!=="paid") return false;
    const d = new Date(p.paid_at||p.created_at);
    return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
  });
  const collectedThisMonth = thisMonth.reduce((s,p)=>s+parseFloat(p.amount||0),0);
  const monthlyRecurring   = recurringCharges.reduce((s,c)=>s+parseFloat(c.amount||0),0);
  const outstandingTenants = tenants.filter(t=>{
    const hasPaid = payments.some(p=>{
      if (p.tenant_id!==t.id||p.status!=="paid") return false;
      const d = new Date(p.paid_at||p.created_at);
      return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
    });
    return !hasPaid;
  });

  const TABS = ["payments","recurring"];

  return (
    <LandlordLayout>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
      `}</style>

      <div style={{ background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',sans-serif",padding:"28px 32px 48px" }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:10 }}>
          <div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:600,color:C.text }}>Financials</div>
            <div style={{ fontSize:13,color:C.textSub,marginTop:3 }}>
              {loading?"Loading…":`${tenants.length} active tenants · ${recurringCharges.length} recurring charges`}
            </div>
          </div>
          {/* Tenant filter */}
          <select value={tenantFilter} onChange={e=>setTenantFilter(e.target.value)}
            style={{ padding:"8px 14px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:13,background:C.surface,color:C.textSub,outline:"none",fontFamily:"'DM Sans',sans-serif",cursor:"pointer" }}>
            <option value="all">All Tenants</option>
            {tenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {/* Stats */}
        {!loading&&(
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:28 }}>
            {[
              { label:"Collected This Month", value:fmt(collectedThisMonth), color:C.green },
              { label:"Monthly Recurring",    value:fmt(monthlyRecurring),   color:C.gold  },
              { label:"Outstanding Tenants",  value:outstandingTenants.length, color:outstandingTenants.length>0?C.red:C.green },
            ].map(s=>(
              <div key={s.label} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 20px" }}>
                <div style={{ fontSize:10,fontWeight:600,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10 }}>{s.label}</div>
                <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:600,color:s.color,lineHeight:1 }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ borderBottom:`1px solid ${C.border}`,marginBottom:24 }}>
          <div style={{ display:"flex",gap:0 }}>
            {TABS.map(tab=>{
              const label = tab==="payments"?"Payment History":"Recurring Charges";
              const active = activeTab===tab;
              return (
                <button key={tab} onClick={()=>setActiveTab(tab)}
                  style={{ padding:"10px 20px",fontSize:13,fontWeight:active?600:400,color:active?C.gold:C.textSub,background:"transparent",border:"none",borderBottom:active?`2px solid ${C.gold}`:"2px solid transparent",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s",whiteSpace:"nowrap",marginBottom:-1 }}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        {loading?(
          <div style={{ padding:40,textAlign:"center",color:C.textSub,fontSize:13 }}>Loading…</div>
        ):activeTab==="payments"?(
          <PaymentsTab
            payments={filteredPayments}
            tenantMap={tenantMap}
            tenants={tenants}
            onRefresh={fetchAll}
          />
        ):(
          <RecurringChargesTab
            charges={filteredCharges}
            tenantMap={tenantMap}
            onRefresh={fetchAll}
          />
        )}
      </div>
    </LandlordLayout>
  );
}
