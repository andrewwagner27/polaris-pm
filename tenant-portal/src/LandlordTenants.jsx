import { useState, useEffect } from "react";
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

const AVATAR_COLORS = [C.gold, C.blue, C.green, C.amber, C.red];

function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
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

function Select({ value, onChange, children, disabled }) {
  return (
    <select value={value} onChange={onChange} disabled={disabled} style={{ width:"100%",padding:"10px 12px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,background:C.raised,color:value?C.text:C.textSub,outline:"none",boxSizing:"border-box",fontFamily:"'DM Sans',sans-serif",cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1 }}>{children}</select>
  );
}

function PrimaryBtn({ children, onClick, small, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background:"transparent",border:`1px solid ${C.goldDim}`,color:C.gold,fontSize:small?11:13,fontWeight:500,padding:small?"5px 10px":"9px 18px",borderRadius:7,cursor:disabled?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.04em",transition:"background 0.15s",whiteSpace:"nowrap",opacity:disabled?0.6:1 }}
      onMouseOver={e=>!disabled&&(e.currentTarget.style.background="rgba(201,169,110,0.07)")}
      onMouseOut={e=>e.currentTarget.style.background="transparent"}
    >{children}</button>
  );
}

function GhostBtn({ children, onClick, small }) {
  return (
    <button onClick={onClick} style={{ background:"transparent",border:`1px solid ${C.border}`,color:C.textSub,fontSize:small?11:13,fontWeight:500,padding:small?"5px 10px":"9px 18px",borderRadius:7,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s",whiteSpace:"nowrap" }}
      onMouseOver={e=>{ e.currentTarget.style.color=C.text; e.currentTarget.style.borderColor="#353A44"; }}
      onMouseOut={e=>{ e.currentTarget.style.color=C.textSub; e.currentTarget.style.borderColor=C.border; }}
    >{children}</button>
  );
}

// ─── Lease countdown badge ─────────────────────────────────────────────────
function LeaseBadge({ daysLeft, leaseEnd }) {
  const endLabel = leaseEnd ? new Date(leaseEnd).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : null;
  if (daysLeft === null) return <span style={{ fontSize:12,color:C.textSub }}>No end date</span>;
  if (daysLeft <= 0)  return (
    <div>
      <span style={{ fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:"rgba(224,85,85,0.18)",color:C.red,border:"1px solid rgba(224,85,85,0.3)",display:"inline-block" }}>Expired</span>
      {endLabel&&<div style={{ fontSize:11,color:C.textMuted,marginTop:3 }}>{endLabel}</div>}
    </div>
  );
  if (daysLeft <= 30) return (
    <div>
      <span style={{ fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:"rgba(224,85,85,0.15)",color:C.red,border:"1px solid rgba(224,85,85,0.25)",display:"inline-block" }}>Expires in {daysLeft} days</span>
      {endLabel&&<div style={{ fontSize:11,color:C.textMuted,marginTop:3 }}>{endLabel}</div>}
    </div>
  );
  if (daysLeft <= 90) return (
    <div>
      <span style={{ fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:"rgba(240,164,48,0.15)",color:C.amber,border:"1px solid rgba(240,164,48,0.25)",display:"inline-block" }}>Expires in {daysLeft} days</span>
      {endLabel&&<div style={{ fontSize:11,color:C.textMuted,marginTop:3 }}>{endLabel}</div>}
    </div>
  );
  return (
    <div>
      <span style={{ fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:"rgba(114,176,42,0.13)",color:C.green,border:"1px solid rgba(114,176,42,0.22)",display:"inline-block" }}>Expires in {daysLeft} days</span>
      {endLabel&&<div style={{ fontSize:11,color:C.textMuted,marginTop:3 }}>{endLabel}</div>}
    </div>
  );
}

// ─── Add Tenant Modal ──────────────────────────────────────────────────────
function AddTenantModal({ properties, units, onClose, onSaved }) {
  const [form, setForm] = useState({ name:"",email:"",phone:"",property_id:"",unit_id:"",lease_start:"",lease_end:"" });
  const [sendInvite,   setSendInvite]   = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [step,         setStep]         = useState("form");
  const [error,        setError]        = useState("");
  const [inviteStatus, setInviteStatus] = useState("");

  const update = (k,v) => setForm(f=>({ ...f, [k]:v }));
  const filteredUnits = units.filter(u=>u.property_id===form.property_id);

  async function save() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.unit_id)     { setError("Please select a unit."); return; }
    if (sendInvite && !form.email.trim()) { setError("Email is required to send an invite."); return; }
    setSaving(true); setError("");

    const { data:tenant, error:insertError } = await supabase.from("tenants").insert({
      name:        form.name.trim(),
      email:       form.email.trim()||null,
      phone:       form.phone.trim()||null,
      unit_id:     form.unit_id,
      lease_start: form.lease_start||null,
      lease_end:   form.lease_end||null,
    }).select().single();

    if (insertError) { setError(insertError.message); setSaving(false); return; }

    if (sendInvite && form.email.trim()) {
      const unit     = units.find(u=>u.id===form.unit_id);
      const property = properties.find(p=>p.id===form.property_id);
      // SECURITY: Never expose landlord personal name — always use company name
      const { error:inviteError } = await supabase.functions.invoke("invite-tenant", {
        body: { tenant_id:tenant.id, tenant_name:form.name.trim(), tenant_email:form.email.trim(), unit_number:unit?.unit_number||"—", property_name:property?.name||"—", landlord_name:"Modus Property Management" }
      });
      setInviteStatus(inviteError?"failed":"sent");
    } else {
      setInviteStatus("skipped");
    }

    setSaving(false);
    setStep("success");
  }

  const selectedUnit     = units.find(u=>u.id===form.unit_id);
  const selectedProperty = properties.find(p=>p.id===form.property_id);

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,width:520,maxHeight:"92vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"20px 24px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div style={{ fontSize:15,fontWeight:600,color:C.text }}>{step==="success"?"Tenant added":"Add tenant"}</div>
          <button onClick={onClose} style={{ background:"none",border:"none",fontSize:16,cursor:"pointer",color:C.textSub }}>✕</button>
        </div>

        {step==="success"?(
          <div style={{ padding:"32px 24px",textAlign:"center" }}>
            <div style={{ width:60,height:60,borderRadius:"50%",background:`${C.green}18`,border:`1px solid ${C.green}33`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px",fontSize:24,color:C.green }}>✓</div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.text,marginBottom:8 }}>{form.name} added</div>
            <div style={{ fontSize:13,color:C.textSub,marginBottom:6 }}>{selectedProperty?.name} · Unit {selectedUnit?.unit_number}</div>
            {inviteStatus==="sent"    &&<div style={{ fontSize:13,color:C.green,  marginBottom:20 }}>✓ Invite email sent to {form.email}</div>}
            {inviteStatus==="failed"  &&<div style={{ fontSize:13,color:C.amber,  marginBottom:20 }}>⚠ Tenant added but invite failed — you can resend from their profile.</div>}
            {inviteStatus==="skipped" &&<div style={{ fontSize:13,color:C.textSub,marginBottom:20 }}>No invite sent — you can send one from their profile.</div>}
            <div style={{ display:"flex",gap:10,justifyContent:"center" }}>
              <GhostBtn onClick={onSaved}>Done</GhostBtn>
              <PrimaryBtn onClick={()=>{ setForm({name:"",email:"",phone:"",property_id:"",unit_id:"",lease_start:"",lease_end:""}); setStep("form"); setInviteStatus(""); }}>Add another</PrimaryBtn>
            </div>
          </div>
        ):(
          <>
            <div style={{ padding:"16px 24px" }}>
              {error&&<div style={{ background:"rgba(224,85,85,0.1)",color:C.red,fontSize:12,padding:"10px 12px",borderRadius:7,marginBottom:16,border:`1px solid rgba(224,85,85,0.2)` }}>{error}</div>}
              <div style={{ marginBottom:10 }}><FieldLabel>Full name *</FieldLabel><Input value={form.name} onChange={e=>update("name",e.target.value)} placeholder="e.g. James Wilson"/></div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:10 }}>
                <div><FieldLabel>Email</FieldLabel><Input type="email" value={form.email} onChange={e=>update("email",e.target.value)} placeholder="james@email.com"/></div>
                <div><FieldLabel>Phone</FieldLabel><Input value={form.phone} onChange={e=>update("phone",e.target.value)} placeholder="(216) 555-0101"/></div>
              </div>
              <div style={{ marginBottom:10 }}>
                <FieldLabel>Property *</FieldLabel>
                <Select value={form.property_id} onChange={e=>{ update("property_id",e.target.value); update("unit_id",""); }}>
                  <option value="">Select property…</option>
                  {properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
              <div style={{ marginBottom:10 }}>
                <FieldLabel>Unit *</FieldLabel>
                <Select value={form.unit_id} onChange={e=>update("unit_id",e.target.value)} disabled={!form.property_id}>
                  <option value="">Select unit…</option>
                  {filteredUnits.map(u=><option key={u.id} value={u.id}>Unit {u.unit_number} — ${(u.rent_amount||0).toLocaleString()}/mo</option>)}
                </Select>
                {form.property_id&&filteredUnits.length===0&&<div style={{ fontSize:11,color:C.amber,marginTop:5 }}>No units found for this property.</div>}
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
                <div><FieldLabel>Lease start</FieldLabel><Input type="date" value={form.lease_start} onChange={e=>update("lease_start",e.target.value)}/></div>
                <div><FieldLabel>Lease end</FieldLabel><Input type="date" value={form.lease_end} onChange={e=>update("lease_end",e.target.value)}/></div>
              </div>
              <div style={{ background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer" }} onClick={()=>setSendInvite(v=>!v)}>
                <div>
                  <div style={{ fontSize:13,fontWeight:500,color:C.text,marginBottom:2 }}>Send invite email</div>
                  <div style={{ fontSize:11,color:C.textSub }}>Tenant gets a magic link to set up their account</div>
                </div>
                <div style={{ width:36,height:20,borderRadius:10,background:sendInvite?C.goldDim:C.raised,border:`1px solid ${sendInvite?C.goldDim:C.border}`,position:"relative",transition:"all 0.2s",flexShrink:0 }}>
                  <div style={{ width:14,height:14,borderRadius:"50%",background:sendInvite?C.gold:C.textMuted,position:"absolute",top:2,left:sendInvite?19:2,transition:"left 0.2s" }}/>
                </div>
              </div>
            </div>
            <div style={{ padding:"14px 24px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10,justifyContent:"flex-end" }}>
              <GhostBtn onClick={onClose}>Cancel</GhostBtn>
              <PrimaryBtn onClick={save} disabled={saving}>
                {saving?(sendInvite?"Saving & sending invite…":"Saving…"):(sendInvite?"Add & send invite":"Add tenant")}
              </PrimaryBtn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function LandlordTenants() {
  const navigate = useNavigate();
  const width    = useWindowWidth();
  const isMobile = width < 768;

  const [tenants,    setTenants]    = useState([]);
  const [units,      setUnits]      = useState([]);
  const [properties, setProperties] = useState([]);
  const [payments,   setPayments]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [propFilter, setPropFilter] = useState("all");
  const [activeTab,  setActiveTab]  = useState("all");   // all | ending_soon | new_move_ins | past
  const [sortCol,    setSortCol]    = useState("name");
  const [sortDir,    setSortDir]    = useState("asc");
  const [showAdd,    setShowAdd]    = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [{ data:tenantsData },{ data:unitsData },{ data:propsData },{ data:paymentsData }] = await Promise.all([
      supabase.from("tenants").select("*"),
      supabase.from("units").select("*"),
      supabase.from("properties").select("*"),
      supabase.from("payments").select("*").order("created_at",{ ascending:false }),
    ]);
    setTenants(tenantsData||[]);
    setUnits(unitsData||[]);
    setProperties(propsData||[]);
    setPayments(paymentsData||[]);
    setLoading(false);
  }

  const now = Date.now();

  const enriched = tenants.map((t,i) => {
    const unit        = units.find(u=>u.id===t.unit_id);
    const property    = properties.find(p=>p.id===unit?.property_id);
    const latestPay   = payments.find(p=>p.tenant_id===t.id);
    const accentColor = AVATAR_COLORS[i%AVATAR_COLORS.length];
    const initials    = (t.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();

    // Onboarding / registration status
    const isRegistered = !!t.user_id;
    const isInvited    = !t.user_id && !!t.invite_sent_at;

    // Autopay
    const autopayOn = t.autopay_enabled === true;

    // Lease timing
    const leaseEnd   = t.lease_end   ? new Date(t.lease_end)   : null;
    const leaseStart = t.lease_start ? new Date(t.lease_start) : null;
    const daysLeft   = leaseEnd ? Math.ceil((leaseEnd.getTime() - now) / 86400000) : null;
    const isEndingSoon = daysLeft !== null && daysLeft > 0 && daysLeft <= 90;
    const isNewMoveIn  = leaseStart && ((now - leaseStart.getTime()) / 86400000) <= 30;

    // Payment info
    let payStatus = "pending";
    if (latestPay?.status==="paid")   payStatus = "current";
    if (latestPay?.status==="failed") payStatus = "late";

    return {
      ...t,
      unit:        unit?.unit_number||"—",
      property:    property?.name||"—",
      property_id: property?.id,
      rent:        unit?.rent_amount||0,
      isRegistered, isInvited, autopayOn,
      daysLeft, isEndingSoon, isNewMoveIn,
      payStatus,
      lastPaid:  latestPay?.paid_at ? new Date(latestPay.paid_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "—",
      balance:   latestPay?.status!=="paid" ? (unit?.rent_amount||0) : 0,
      initials, accentColor,
    };
  });

  const activeEnriched   = enriched.filter(t=>!t.archived);
  const archivedEnriched = enriched.filter(t=>t.archived);

  // Tab counts
  const endingSoonCount = activeEnriched.filter(t=>t.isEndingSoon).length;
  const newMoveInCount  = activeEnriched.filter(t=>t.isNewMoveIn).length;
  const pastCount       = archivedEnriched.length;

  // Tab → base pool
  let tabPool;
  if (activeTab==="ending_soon")  tabPool = activeEnriched.filter(t=>t.isEndingSoon);
  else if (activeTab==="new_move_ins") tabPool = activeEnriched.filter(t=>t.isNewMoveIn);
  else if (activeTab==="past")    tabPool = archivedEnriched;
  else                            tabPool = activeEnriched;

  // Search + property filter
  const filtered = tabPool.filter(t => {
    const matchSearch = (t.name||"").toLowerCase().includes(search.toLowerCase())
      || (t.unit||"").toLowerCase().includes(search.toLowerCase())
      || (t.email||"").toLowerCase().includes(search.toLowerCase());
    const matchProp = propFilter==="all" || t.property_id===propFilter;
    return matchSearch && matchProp;
  });

  function handleSort(col) {
    if (sortCol===col) setSortDir(d=>d==="asc"?"desc":"asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  function SortIcon({ col }) {
    if (sortCol!==col) return <span style={{ color:C.textMuted,marginLeft:3 }}>↕</span>;
    return <span style={{ color:C.gold,marginLeft:3 }}>{sortDir==="asc"?"↑":"↓"}</span>;
  }

  const sorted = [...filtered].sort((a,b) => {
    let aVal, bVal;
    if (sortCol==="name")     { aVal=a.name;    bVal=b.name; }
    if (sortCol==="property") { aVal=a.property+a.unit; bVal=b.property+b.unit; }
    if (sortCol==="rent")     { aVal=a.rent;    bVal=b.rent; }
    if (sortCol==="lease")    { aVal=a.daysLeft??99999; bVal=b.daysLeft??99999; }
    if (sortCol==="balance")  { aVal=a.balance; bVal=b.balance; }
    if (typeof aVal==="string") return sortDir==="asc"?aVal.localeCompare(bVal):bVal.localeCompare(aVal);
    return sortDir==="asc"?(aVal-bVal):(bVal-aVal);
  });

  const TABS = [
    { key:"all",          label:"All Leases",  count:activeEnriched.length },
    { key:"ending_soon",  label:"Ending Soon", count:endingSoonCount, accent:C.amber },
    { key:"new_move_ins", label:"New Move-Ins",count:newMoveInCount,  accent:C.green },
    { key:"past",         label:"Past Tenants",count:pastCount,       accent:C.textSub },
  ];

  return (
    <LandlordLayout openMaintenance={0} unreadMessages={0}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        .m-row:hover td{background:${C.raised}!important;cursor:pointer;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
      `}</style>

      <div style={{ background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',sans-serif",padding:isMobile?"20px 16px":"28px 32px 48px" }}>

        {/* Top bar */}
        <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:10 }}>
          <div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:isMobile?20:24,fontWeight:600,color:C.text }}>Tenants</div>
            <div style={{ fontSize:13,color:C.textSub,marginTop:3 }}>
              {loading?"Loading…":`${activeEnriched.length} active leases across ${properties.length} properties`}
            </div>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            {!isMobile&&(
              <div style={{ display:"flex",alignItems:"center",gap:8,background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 12px",width:240 }}>
                <span style={{ color:C.textMuted,fontSize:13 }}>⌕</span>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, unit, email…"
                  style={{ flex:1,border:"none",outline:"none",fontSize:13,fontFamily:"'DM Sans',sans-serif",background:"transparent",color:C.text }}/>
              </div>
            )}
            <select value={propFilter} onChange={e=>setPropFilter(e.target.value)} style={{ padding:"8px 12px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,background:C.surface,color:C.textSub,outline:"none",fontFamily:"'DM Sans',sans-serif",cursor:"pointer" }}>
              <option value="all">All Properties</option>
              {properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <PrimaryBtn onClick={()=>setShowAdd(true)}>+ Add tenant</PrimaryBtn>
          </div>
        </div>

        {isMobile&&(
          <div style={{ display:"flex",alignItems:"center",gap:8,background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 12px",marginBottom:16 }}>
            <span style={{ color:C.textMuted }}>⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, unit, email…"
              style={{ flex:1,border:"none",outline:"none",fontSize:13,fontFamily:"'DM Sans',sans-serif",background:"transparent",color:C.text }}/>
          </div>
        )}

        {/* Stat ribbon */}
        {!loading&&(
          <div style={{ display:"grid",gridTemplateColumns:`repeat(${isMobile?2:4},1fr)`,gap:12,marginBottom:24 }}>
            {[
              { label:"Active Leases",      value:activeEnriched.length,                                                          color:C.gold,   tab:"all"        },
              { label:"Outstanding Balance", value:`$${activeEnriched.reduce((s,t)=>s+(t.balance||0),0).toLocaleString()}`,       color:activeEnriched.some(t=>t.balance>0)?C.red:C.green, tab:null },
              { label:"Ending Soon",         value:endingSoonCount,                                                               color:endingSoonCount>0?C.amber:C.textSub, tab:"ending_soon" },
              { label:"Past Tenants",        value:pastCount,                                                                     color:C.textSub, tab:"past"       },
            ].map(s=>(
              <div key={s.label}
                onClick={s.tab?()=>setActiveTab(s.tab):undefined}
                style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 20px",cursor:s.tab?"pointer":"default",transition:"border-color 0.15s,background 0.15s" }}
                onMouseEnter={s.tab?e=>{e.currentTarget.style.borderColor=C.gold;e.currentTarget.style.background=C.raised;}:undefined}
                onMouseLeave={s.tab?e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.surface;}:undefined}
              >
                <div style={{ fontSize:10,fontWeight:600,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10 }}>{s.label}</div>
                <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:600,color:s.color,lineHeight:1 }}>{s.value}</div>
                {s.tab&&<div style={{ fontSize:10,color:C.textMuted,marginTop:8 }}>Click to filter →</div>}
              </div>
            ))}
          </div>
        )}

        {/* Smart lease filter tabs */}
        <div style={{ display:"flex",gap:0,marginBottom:0,borderBottom:`1px solid ${C.border}` }}>
          {TABS.map(tab=>{
            const active = activeTab===tab.key;
            const accentCol = tab.accent||C.gold;
            return (
              <button key={tab.key} onClick={()=>setActiveTab(tab.key)}
                style={{ padding:"10px 18px",fontSize:13,fontWeight:active?600:400,color:active?(tab.accent||C.gold):C.textSub,background:"transparent",border:"none",borderBottom:active?`2px solid ${tab.accent||C.gold}`:"2px solid transparent",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6 }}>
                {tab.label}
                {tab.count>0&&(
                  <span style={{ fontSize:10,fontWeight:600,padding:"1px 6px",borderRadius:10,background:active?`${accentCol}22`:`${C.textMuted}22`,color:active?accentCol:C.textMuted }}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
          <span style={{ marginLeft:"auto",display:"flex",alignItems:"center",padding:"0 4px",fontSize:12,color:C.textMuted }}>{filtered.length} results</span>
        </div>

        {/* Table */}
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderTop:"none",borderRadius:"0 0 10px 10px",overflow:"hidden",overflowX:"auto" }}>
          {loading?(
            <div style={{ padding:32,textAlign:"center",color:C.textSub,fontSize:13 }}>Loading tenants…</div>
          ):(
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  {[
                    { col:"name",     label:"Tenant",         always:true  },
                    { col:"property", label:"Property · Unit", always:false },
                    { col:"lease",    label:"Lease Status",    always:true  },
                    { col:"balance",  label:"Balance",         always:true,  right:true },
                    { col:null,       label:"Actions",         always:true  },
                  ].filter(h=>h.always||!isMobile).map(h=>(
                    <th key={h.label} onClick={h.col?()=>handleSort(h.col):undefined}
                      style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",padding:"12px 18px",textAlign:h.right?"right":"left",borderBottom:`1px solid ${C.border}`,background:C.raised,cursor:h.col?"pointer":"default",whiteSpace:"nowrap" }}>
                      {h.label}{h.col&&<SortIcon col={h.col}/>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.length===0&&(
                  <tr><td colSpan={6} style={{ padding:40,textAlign:"center",color:C.textSub,fontSize:13 }}>
                    {activeTab==="ending_soon"?"No leases ending within 90 days.":activeTab==="new_move_ins"?"No move-ins in the last 30 days.":activeTab==="past"?"No past tenants.":"No tenants match your search."}
                  </td></tr>
                )}
                {sorted.map(t=>(
                  <tr key={t.id} className="m-row" onClick={()=>navigate(`/landlord/tenants/${t.id}`)}>
                    {/* Tenant name + three status badges */}
                    <td style={{ fontSize:13,color:C.text,padding:"14px 18px",borderBottom:`1px solid ${C.border}` }}>
                      <div style={{ display:"flex",alignItems:"flex-start",gap:12 }}>
                        <div style={{ width:38,height:38,borderRadius:"50%",background:`${t.accentColor}22`,border:`1px solid ${t.accentColor}44`,color:t.accentColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0,marginTop:1 }}>{t.initials}</div>
                        <div>
                          <div style={{ fontSize:14,fontWeight:600,color:C.text,marginBottom:4 }}>{t.name}</div>
                          <div style={{ fontSize:12,color:C.textSub,marginBottom:6 }}>
                            {isMobile?`${t.property} · Unit ${t.unit}`:(t.email||"—")}
                          </div>
                          {/* Three status badges */}
                          <div style={{ display:"flex",gap:5,flexWrap:"wrap" }}>
                            {/* Autopay */}
                            {t.autopayOn
                              ? <span style={{ fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:4,background:"rgba(114,176,42,0.12)",color:C.green,border:"1px solid rgba(114,176,42,0.2)" }}>✓ Autopay On</span>
                              : <span style={{ fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:4,background:"rgba(224,85,85,0.08)",color:"#A0556A",border:"1px solid rgba(224,85,85,0.15)" }}>✕ Autopay Off</span>
                            }
                            {/* Registration */}
                            {t.isRegistered
                              ? <span style={{ fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:4,background:"rgba(114,176,42,0.12)",color:C.green,border:"1px solid rgba(114,176,42,0.2)" }}>✓ Registered</span>
                              : t.isInvited
                                ? <span style={{ fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:4,background:"rgba(74,154,232,0.1)",color:C.blue,border:"1px solid rgba(74,154,232,0.2)" }}>✉ Invite Sent</span>
                                : <span style={{ fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:4,background:"rgba(92,98,112,0.15)",color:C.textSub,border:`1px solid ${C.border}` }}>✕ Pending Invite</span>
                            }
                            {/* Eviction watch */}
                            {t.eviction_watch&&<span style={{ fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,background:"rgba(224,85,85,0.15)",color:C.red,border:"1px solid rgba(224,85,85,0.3)" }}>⚠ Eviction Watch</span>}
                          </div>
                        </div>
                      </div>
                    </td>

                    {!isMobile&&(
                      <td style={{ fontSize:13,color:C.text,padding:"14px 18px",borderBottom:`1px solid ${C.border}` }}>
                        <div style={{ fontWeight:500,fontSize:13 }}>{t.property}</div>
                        <div style={{ fontSize:12,color:C.textSub,marginTop:3 }}>Unit {t.unit}</div>
                      </td>
                    )}

                    {/* Lease status column */}
                    <td style={{ fontSize:13,padding:"14px 18px",borderBottom:`1px solid ${C.border}` }}>
                      <LeaseBadge daysLeft={t.daysLeft} leaseEnd={t.lease_end}/>
                    </td>

                    <td style={{ fontSize:13,padding:"14px 18px",borderBottom:`1px solid ${C.border}`,textAlign:"right" }}>
                      <span style={{ fontSize:14,fontWeight:600,color:t.balance>0?C.red:C.green }}>
                        {t.balance>0?`-$${t.balance.toLocaleString()}`:"$0"}
                      </span>
                    </td>

                    <td style={{ fontSize:13,padding:"12px 16px",borderBottom:`1px solid ${C.border}` }} onClick={e=>e.stopPropagation()}>
                      <div style={{ display:"flex",gap:6,alignItems:"center" }}>
                        <button onClick={()=>navigate("/landlord/messages",{ state:{ tenantId:t.id } })}
                          title="Message tenant"
                          style={{ width:32,height:32,borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.textSub,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"background 0.15s,color 0.15s" }}
                          onMouseEnter={e=>{e.currentTarget.style.background=C.raised;e.currentTarget.style.color=C.text;}}
                          onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=C.textSub;}}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showAdd&&(
        <AddTenantModal properties={properties} units={units} onClose={()=>setShowAdd(false)} onSaved={()=>{ setShowAdd(false); fetchAll(); }}/>
      )}
    </LandlordLayout>
  );
}