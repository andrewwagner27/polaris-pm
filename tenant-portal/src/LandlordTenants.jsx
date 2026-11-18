import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";
import { fetchLandlordBalances, rentStanding, standingDisplay } from "./lib/tenantFinancials";
import { usePropertyScope, useScopedLoad, ALL } from "./lib/propertyScope";
import { telHref } from "./lib/maintenanceView";
import { PrimaryBtn } from "./ui/Button";

const C = {
  bg:       "#0B0D10",
  surface:  "#15191F",
  raised:   "#1C2129",
  border:   "#303640",
  text:     "#F5F2EB",
  textSub:  "#B7BBC4",
  textMuted:"#9298A3",
  gold:     "#C9A968",
  goldDim:  "#6B4F24",
  blue:     "#6AAEF0",
  green:    "#72B02A",
  red:      "#F07070",
  amber:    "#F0A430",
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


function GhostBtn({ children, onClick, small }) {
  return <button type="button" onClick={onClick} className={`m-btn m-btn-ghost${small?" m-btn-small":""}`} style={{ borderColor:C.border,color:C.textSub,fontWeight:500,fontFamily:"'DM Sans',sans-serif" }}>{children}</button>;
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
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,width:"min(520px, calc(100vw - 24px))",maxHeight:"92vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
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
// Everything on the tenants page for one scope. The property id is passed explicitly; RLS decides what is readable.
async function loadTenants(propertyId) {
  const scoped = propertyId !== ALL;
  let tq = supabase.from("tenants").select(`*, units${scoped ? "!inner" : ""}(property_id)`);
  let uq = supabase.from("units").select("id, property_id, unit_number, rent_amount");
  let pq = supabase.from("properties").select("id, name, address, city, state");
  let payq = supabase.from("payments").select(`id, tenant_id, status, paid_at, created_at, voided_at, units${scoped ? "!inner" : ""}(property_id)`).order("created_at", { ascending: false }).limit(500);
  if (scoped) { tq = tq.eq("units.property_id", propertyId); uq = uq.eq("property_id", propertyId); pq = pq.eq("id", propertyId); payq = payq.eq("units.property_id", propertyId); }
  const [t, u, p, pay] = await Promise.all([tq, uq, pq, payq]);
  const err = t.error || u.error || p.error;
  if (err) throw new Error(err.message);
  return { tenants: t.data || [], units: u.data || [], properties: p.data || [], payments: (pay.data || []).filter((x) => !x.voided_at), balances: await fetchLandlordBalances(supabase) };
}

function H({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", margin: "20px 0 6px" }}>{children}</div>;
}

// Tenant detail drawer: who, where, lease, how to reach them, their maintenance, and their ledger standing (only when
// the receivables ledger is active). Actions go to the full profile, messages or the ledger.
function TenantDrawer({ t, balancesMode, onClose }) {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    let live = true;
    supabase.from("maintenance_requests").select("id, title, status, priority, created_at").eq("tenant_id", t.id).order("created_at", { ascending: false }).limit(8)
      .then(({ data }) => { if (live) setTickets(data || []); });
    return () => { live = false; };
  }, [t.id]);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const tel = telHref(t.phone);
  const v = standingDisplay({ status: t.payStatus, cents: t.balance });
  const fmt = (d) => d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const row = (k, val) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 13, color: C.textSub }}>{k}</span><span style={{ fontSize: 13, fontWeight: 500, color: C.text, textAlign: "right", overflowWrap: "anywhere" }}>{val}</span>
    </div>
  );
  return (
    <>
      <div className="m-scrim" onClick={onClose}/>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tenant-drawer-title" className="m-drawer" style={{ background: C.surface, borderLeft: `1px solid ${C.border}`, outline: "none" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 2, background: C.raised, borderBottom: `1px solid ${C.border}`, padding: "16px 20px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 id="tenant-drawer-title" style={{ fontSize: 18, fontWeight: 600, margin: 0, color: C.text, overflowWrap: "anywhere" }}>{t.name || "Tenant"}</h2>
            <div style={{ fontSize: 13, color: C.textSub, marginTop: 3 }}>{t.property} · Unit {t.unit}{t.archived ? " · Past tenant" : ""}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close tenant details" style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.textSub, cursor: "pointer", fontSize: 15 }}>✕</button>
        </div>
        <div style={{ padding: "4px 20px 24px" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0 4px" }}>
            {tel && <a className="t-chip" href={tel} aria-label={`Call ${t.name}`}>📞 Call</a>}
            {t.email && <a className="t-chip" href={`mailto:${t.email}`} aria-label={`Email ${t.name}`}>✉ Email</a>}
            <button type="button" className="t-chip" onClick={() => navigate("/landlord/messages", { state: { tenantId: t.id } })}>💬 Message</button>
          </div>

          <H>Lease</H>
          {row("Rent on file", t.rent ? `$${Number(t.rent).toLocaleString("en-US")}/mo` : "—")}
          {row("Lease start", fmt(t.lease_start))}
          {row("Lease end", t.lease_end ? `${fmt(t.lease_end)}${t.daysLeft != null ? (t.daysLeft >= 0 ? ` · ${t.daysLeft} d left` : " · ended") : ""}` : "No end date")}
          {row("Rent due day", t.rent_due_day ? `Day ${t.rent_due_day}` : "—")}
          {row("Portal", t.isRegistered ? "Registered" : t.isInvited ? "Invitation sent" : "Not invited")}
          {row("Autopay", "Autopay not available yet")}

          <H>Contact</H>
          {row("Phone", t.phone || "—")}
          {row("Email", t.email || "—")}
          {t.emergency_contact_name && row("Emergency contact", `${t.emergency_contact_name}${t.emergency_contact_relationship ? ` (${t.emergency_contact_relationship})` : ""}`)}

          <H>Balance</H>
          <div style={{ padding: "10px 12px", background: C.raised, border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: v.tone === "red" ? C.red : v.tone === "green" ? C.green : C.text }}>{balancesMode === "loading" ? "—" : (v.amountText ?? v.label)}</div>
            {v.note && <div style={{ fontSize: 12, color: C.textSub, marginTop: 4, lineHeight: 1.45 }}>{v.note}</div>}
          </div>

          <H>Maintenance</H>
          {tickets === null && <div style={{ fontSize: 13, color: C.textSub }}>Loading…</div>}
          {tickets?.length === 0 && <div style={{ fontSize: 13, color: C.textSub }}>No maintenance requests.</div>}
          {tickets?.map((m) => (
            <button key={m.id} type="button" onClick={() => navigate(`/landlord/maintenance/${m.id}`)} className="t-related">
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title || "Request"}</span>
              <span style={{ fontSize: 12, color: m.status === "resolved" ? C.green : C.amber, whiteSpace: "nowrap" }}>{m.status === "resolved" ? "Resolved" : String(m.status || "open").replace(/_/g, " ")}</span>
            </button>
          ))}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 24 }}>
            <PrimaryBtn onClick={() => navigate(`/landlord/tenants/${t.id}`)}>Open full profile</PrimaryBtn>
            <GhostBtn onClick={() => navigate(`/landlord/financials/${t.id}`)}>Payments &amp; ledger</GhostBtn>
          </div>
        </div>
      </div>
    </>
  );
}

export default function LandlordTenants() {
  const width    = useWindowWidth();
  const isMobile = width < 768;
  const { selectedPropertyId, selectedName, isAll } = usePropertyScope();
  const { data, loading: loadingAny, error, reload: fetchAll } = useScopedLoad("tenants", loadTenants);
  const loading = loadingAny && !data;
  const tenants = data?.tenants || [], units = data?.units || [], properties = data?.properties || [], payments = data?.payments || [];
  const balances = data?.balances || { mode: "loading", byTenant: new Map() };

  const [search,     setSearch]     = useState("");
  const [activeTab,  setActiveTab]  = useState("all");   // all | late | ending_soon | new_move_ins | past
  const [sortCol,    setSortCol]    = useState("name");
  const [sortDir,    setSortDir]    = useState("asc");
  const [showAdd,    setShowAdd]    = useState(false);
  // Drawer selection belongs to the scope it was opened in: switching property closes it.
  const [openFor,    setOpenFor]    = useState(null);    // { id, scope }
  const openId = openFor?.scope === selectedPropertyId ? openFor.id : null;
  const openerRef = useRef(null);
  const openTenant = (id) => { openerRef.current = document.activeElement; setOpenFor({ id, scope: selectedPropertyId }); };
  const closeTenant = () => { setOpenFor(null); const el = openerRef.current; if (el?.isConnected) setTimeout(() => el.focus(), 0); };

  const [todayDate] = useState(() => new Date());   // one clock per visit: lease countdowns don't shift mid-render
  const now = todayDate.getTime();

  function paidThisMonth(tenantId) {
    const y = todayDate.getFullYear(), m = todayDate.getMonth();
    return payments.some(p => {
      if (p.tenant_id !== tenantId || p.status !== "paid") return false;
      const d = new Date(p.paid_at || p.created_at);
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }

  const enriched = tenants.map((t,i) => {
    const unit        = units.find(u=>u.id===t.unit_id);
    const property    = properties.find(p=>p.id===unit?.property_id);
    const latestPay   = payments.find(p=>p.tenant_id===t.id);
    const accentColor = AVATAR_COLORS[i%AVATAR_COLORS.length];
    const initials    = (t.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
    const isRegistered = !!t.user_id;
    const isInvited    = !t.user_id && !!t.invite_sent_at;
    const leaseEnd   = t.lease_end   ? new Date(t.lease_end)   : null;
    const leaseStart = t.lease_start ? new Date(t.lease_start) : null;
    const daysLeft   = leaseEnd ? Math.ceil((leaseEnd.getTime() - now) / 86400000) : null;
    const isEndingSoon = daysLeft !== null && daysLeft > 0 && daysLeft <= 90;
    const isNewMoveIn  = leaseStart && ((now - leaseStart.getTime()) / 86400000) <= 30;
    // Balance and "balance due" come only from the receivables ledger, never from rent minus payment records.
    const hasPaidThisMonth = paidThisMonth(t.id);
    const standing  = rentStanding(t, balances);
    const isLate    = !t.archived && standing.status === "owes";
    return {
      ...t,
      unit:        unit?.unit_number||"—",
      property:    property?.name||"—",
      property_id: property?.id,
      rent:        unit?.rent_amount || 0,
      isRegistered, isInvited,
      daysLeft, isEndingSoon, isNewMoveIn,
      payStatus: standing.status, isLate, hasPaidThisMonth,
      lastPaid:  latestPay?.paid_at ? new Date(latestPay.paid_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "—",
      balance: standing.cents,
      initials, accentColor,
    };
  });

  const activeEnriched   = enriched.filter(t=>!t.archived);
  const archivedEnriched = enriched.filter(t=>t.archived);
  const endingSoonCount = activeEnriched.filter(t=>t.isEndingSoon).length;
  const newMoveInCount  = activeEnriched.filter(t=>t.isNewMoveIn).length;
  const lateCount       = activeEnriched.filter(t=>t.isLate).length;
  const pastCount       = archivedEnriched.length;

  let tabPool;
  if (activeTab==="ending_soon")  tabPool = activeEnriched.filter(t=>t.isEndingSoon);
  else if (activeTab==="new_move_ins") tabPool = activeEnriched.filter(t=>t.isNewMoveIn);
  else if (activeTab==="late")    tabPool = activeEnriched.filter(t=>t.isLate);
  else if (activeTab==="past")    tabPool = archivedEnriched;
  else                            tabPool = activeEnriched;

  const q = search.trim().toLowerCase();
  const filtered = tabPool.filter(t => !q || [t.name, t.unit, t.email, t.phone, t.property].some(v => String(v||"").toLowerCase().includes(q)));

  function handleSort(col) {
    if (sortCol===col) setSortDir(d=>d==="asc"?"desc":"asc");
    else { setSortCol(col); setSortDir("asc"); }
  }
  function SortIcon({ col }) {
    if (sortCol!==col) return <span aria-hidden="true" style={{ color:C.textMuted,marginLeft:3 }}>↕</span>;
    return <span aria-hidden="true" style={{ color:C.gold,marginLeft:3 }}>{sortDir==="asc"?"↑":"↓"}</span>;
  }
  const sorted = [...filtered].sort((a,b) => {
    let aVal, bVal;
    if (sortCol==="name")     { aVal=a.name||"";    bVal=b.name||""; }
    if (sortCol==="property") { aVal=a.property+a.unit; bVal=b.property+b.unit; }
    if (sortCol==="rent")     { aVal=a.rent;    bVal=b.rent; }
    if (sortCol==="lease")    { aVal=a.daysLeft??99999; bVal=b.daysLeft??99999; }
    if (sortCol==="balance")  { aVal=a.balance ?? -Infinity; bVal=b.balance ?? -Infinity; }
    if (typeof aVal==="string") return sortDir==="asc"?aVal.localeCompare(bVal):bVal.localeCompare(aVal);
    return sortDir==="asc"?(aVal-bVal):(bVal-aVal);
  });

  const TABS = [
    { key:"all",          label:"All leases",  count:activeEnriched.length },
    ...(balances.mode === "ledger" ? [{ key:"late", label:"Balance due", count:lateCount, accent:C.red }] : []),
    { key:"ending_soon",  label:"Ending soon", count:endingSoonCount, accent:C.amber },
    { key:"new_move_ins", label:"New move-ins",count:newMoveInCount,  accent:C.green },
    { key:"past",         label:"Past tenants",count:pastCount,       accent:C.textSub },
  ];
  const emptyText = activeTab==="late"?"No tenant has a ledger balance due.":activeTab==="ending_soon"?"No leases ending within 90 days.":activeTab==="new_move_ins"?"No move-ins in the last 30 days.":activeTab==="past"?"No past tenants.":q?"No tenants match your search.":`No tenants${isAll?"":" at this property"} yet.`;
  const balanceText = (t) => { const v = standingDisplay({ status:t.payStatus, cents:t.balance }); return { v, text: balances.mode==="loading" ? "—" : (v.amountText ?? v.label) }; };
  const portalBadge = (t) => t.isRegistered
    ? <span className="t-badge" style={{ color:C.green, borderColor:"rgba(93,187,99,0.35)" }}>Registered</span>
    : t.isInvited ? <span className="t-badge" style={{ color:C.blue, borderColor:"rgba(106,174,240,0.35)" }}>Invite sent</span>
    : <span className="t-badge">Not invited</span>;
  const openTenantRow = enriched.find(t => t.id === openId);

  return (
    <LandlordLayout openMaintenance={0} unreadMessages={0}>
      <style>{`
        .m-row:hover td{background:${C.raised}!important;cursor:pointer;}
        .t-badge{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:6px;border:1px solid ${C.border};color:${C.textSub};white-space:nowrap;}
        .t-card{display:block;width:100%;text-align:left;font:inherit;color:inherit;background:${C.surface};border:1px solid ${C.border};border-radius:12px;padding:14px 16px;margin-bottom:10px;cursor:pointer;}
        .t-card:hover{border-color:#3C4350;}
        .t-chip{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid ${C.border};background:${C.raised};color:${C.text};font:inherit;font-size:13px;font-weight:500;text-decoration:none;cursor:pointer;}
        .t-chip:hover{border-color:${C.gold};}
        .t-related{display:flex;justify-content:space-between;gap:12px;align-items:center;width:100%;min-height:44px;padding:0 12px;margin-bottom:6px;background:${C.raised};border:1px solid ${C.border};border-radius:10px;color:${C.text};font:inherit;font-size:13px;cursor:pointer;text-align:left;}
        .t-tabs{display:flex;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid ${C.border};}
        .t-tabs::-webkit-scrollbar{display:none;}
        .t-sort{background:none;border:none;font:inherit;color:inherit;cursor:pointer;text-transform:inherit;letter-spacing:inherit;padding:0;}
        @media (max-width:1024px){ .t-sort{min-height:44px;} }
      `}</style>

      <div className="m-page" style={{ color:C.text,fontFamily:"'DM Sans',sans-serif" }}>
        <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:12 }}>
          <div>
            <h1 style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:"clamp(22px, 4vw, 28px)",fontWeight:600,margin:0 }}>Tenants</h1>
            <div style={{ fontSize:13,color:C.textSub,marginTop:3 }}>{loading?"Loading…":`${activeEnriched.length} active lease${activeEnriched.length===1?"":"s"} · ${selectedName}`}</div>
          </div>
          <PrimaryBtn onClick={()=>setShowAdd(true)}>+ Add tenant</PrimaryBtn>
        </div>

        {error && (
          <div role="alert" style={{ background:"rgba(240,112,112,0.1)",border:"1px solid rgba(240,112,112,0.35)",borderRadius:10,padding:"12px 16px",marginBottom:16,fontSize:13,color:C.red,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap" }}>
            Tenants couldn't load: {error}
            <button type="button" onClick={fetchAll} className="m-btn m-btn-ghost m-btn-small" style={{ color:C.red,borderColor:"rgba(240,112,112,0.4)" }}>Retry</button>
          </div>
        )}

        <label style={{ display:"flex",alignItems:"center",gap:8,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"0 12px",minHeight:44,maxWidth:420,marginBottom:14 }}>
          <span aria-hidden="true" style={{ color:C.textMuted }}>⌕</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, unit, email or phone" aria-label="Search tenants"
            style={{ flex:1,minWidth:0,border:"none",outline:"none",fontSize:14,fontFamily:"'DM Sans',sans-serif",background:"transparent",color:C.text }}/>
        </label>

        <div className="t-tabs" role="tablist" aria-label="Lease filters">
          {TABS.map(tab=>{
            const active = activeTab===tab.key;
            const accentCol = tab.accent||C.gold;
            return (
              <button key={tab.key} type="button" role="tab" aria-selected={active} onClick={()=>setActiveTab(tab.key)}
                style={{ minHeight:44,padding:"0 16px",fontSize:13,fontWeight:active?600:500,color:active?accentCol:C.textSub,background:"transparent",border:"none",borderBottom:active?`2px solid ${accentCol}`:"2px solid transparent",marginBottom:-1,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6,flexShrink:0 }}>
                {tab.label}
                {tab.count>0&&<span style={{ fontSize:11,fontWeight:600,padding:"1px 7px",borderRadius:10,background:C.raised,color:active?accentCol:C.textSub }}>{tab.count}</span>}
              </button>
            );
          })}
        </div>
        {balances.mode !== "ledger" && balances.mode !== "loading" && (
          <div style={{ fontSize:12,color:C.textMuted,margin:"10px 0 0" }}>Balances aren't tracked: receivables aren't active, so "Not tracked" means unknown, not $0.</div>
        )}

        <div style={{ marginTop:14 }}>
          {loading && <div style={{ padding:32,textAlign:"center",color:C.textSub,fontSize:13 }}>Loading tenants…</div>}
          {!loading && sorted.length===0 && <div style={{ padding:32,textAlign:"center",color:C.textSub,fontSize:14,border:`1px dashed ${C.border}`,borderRadius:12 }}>{emptyText}</div>}

          {/* Phones: readable record cards */}
          {!loading && isMobile && sorted.map(t => {
            const b = balanceText(t);
            return (
              <button key={t.id} type="button" className="t-card" onClick={()=>openTenant(t.id)} aria-haspopup="dialog">
                <span style={{ display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start" }}>
                  <span style={{ minWidth:0 }}>
                    <span style={{ display:"block",fontSize:15,fontWeight:600,overflowWrap:"anywhere" }}>{t.name}</span>
                    <span style={{ display:"block",fontSize:12,color:C.textSub,marginTop:2 }}>{isAll?`${t.property} · `:""}Unit {t.unit}{t.rent?` · $${Number(t.rent).toLocaleString("en-US")}/mo`:""}</span>
                  </span>
                  <span style={{ fontSize:13,fontWeight:600,whiteSpace:"nowrap",color:b.v.tone==="red"?C.red:b.v.tone==="green"?C.green:C.textSub }}>{b.text}</span>
                </span>
                <span style={{ display:"flex",gap:6,flexWrap:"wrap",marginTop:10,alignItems:"center" }}>
                  {portalBadge(t)}
                  {t.isLate&&<span className="t-badge" style={{ color:C.red,borderColor:"rgba(240,112,112,0.4)" }}>Balance due</span>}
                  {t.eviction_watch&&<span className="t-badge" style={{ color:C.red,borderColor:"rgba(240,112,112,0.4)" }}>Eviction watch</span>}
                  <span style={{ fontSize:12,color:t.daysLeft!=null&&t.daysLeft<=90?C.amber:C.textSub }}>{t.daysLeft==null?"No lease end date":t.daysLeft<=0?"Lease ended":`Lease ends in ${t.daysLeft} d`}</span>
                </span>
              </button>
            );
          })}

          {/* Tablet & desktop: efficient table */}
          {!loading && !isMobile && sorted.length>0 && (
            <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",overflowX:"auto" }}>
              <table style={{ width:"100%",borderCollapse:"collapse" }}>
                <thead>
                  <tr>
                    {[
                      { col:"name",     label:"Tenant" },
                      { col:"property", label:isAll?"Property · Unit":"Unit" },
                      { col:"lease",    label:"Lease" },
                      { col:"balance",  label:"Balance", right:true },
                      { col:null,       label:"" },
                    ].map(h=>(
                      <th key={h.label||"actions"} scope="col" aria-sort={h.col&&sortCol===h.col?(sortDir==="asc"?"ascending":"descending"):undefined}
                        style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",padding:"12px 16px",textAlign:h.right?"right":"left",borderBottom:`1px solid ${C.border}`,background:C.raised,whiteSpace:"nowrap" }}>
                        {h.col ? <button type="button" className="t-sort" onClick={()=>handleSort(h.col)}>{h.label}<SortIcon col={h.col}/></button> : h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(t=>{
                    const b = balanceText(t);
                    return (
                      <tr key={t.id} className="m-row" onClick={()=>openTenant(t.id)}>
                        <td style={{ padding:"12px 16px",borderBottom:`1px solid ${C.border}` }}>
                          <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                            <div aria-hidden="true" style={{ width:36,height:36,borderRadius:"50%",background:`${t.accentColor}22`,border:`1px solid ${t.accentColor}55`,color:t.accentColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0 }}>{t.initials}</div>
                            <div style={{ minWidth:0 }}>
                              <button type="button" onClick={(e)=>{ e.stopPropagation(); openTenant(t.id); }} style={{ background:"none",border:"none",padding:0,font:"inherit",fontSize:14,fontWeight:600,color:C.text,cursor:"pointer",textAlign:"left" }}>{t.name}</button>
                              <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginTop:4 }}>
                                {portalBadge(t)}
                                {t.isLate&&<span className="t-badge" style={{ color:C.red,borderColor:"rgba(240,112,112,0.4)" }}>Balance due</span>}
                                {t.eviction_watch&&<span className="t-badge" style={{ color:C.red,borderColor:"rgba(240,112,112,0.4)" }}>Eviction watch</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize:13,padding:"12px 16px",borderBottom:`1px solid ${C.border}` }}>
                          {isAll&&<div style={{ fontWeight:500 }}>{t.property}</div>}
                          <div style={{ fontSize:12,color:C.textSub,marginTop:isAll?2:0 }}>Unit {t.unit}{t.rent?` · $${Number(t.rent).toLocaleString("en-US")}/mo`:""}</div>
                        </td>
                        <td style={{ padding:"12px 16px",borderBottom:`1px solid ${C.border}` }}><LeaseBadge daysLeft={t.daysLeft} leaseEnd={t.lease_end}/></td>
                        <td style={{ padding:"12px 16px",borderBottom:`1px solid ${C.border}`,textAlign:"right" }}>
                          <span title={b.v.note} style={{ fontSize:b.v.amountText?14:12,fontWeight:600,color:b.v.tone==="red"?C.red:b.v.tone==="green"?C.green:C.textSub }}>{b.text}</span>
                        </td>
                        <td style={{ padding:"12px 16px",borderBottom:`1px solid ${C.border}`,textAlign:"right" }}>
                          <span aria-hidden="true" style={{ color:C.textMuted }}>›</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {openTenantRow && <TenantDrawer t={openTenantRow} balancesMode={balances.mode} onClose={closeTenant}/>}
      {showAdd&&(
        <AddTenantModal properties={properties} units={units} onClose={()=>setShowAdd(false)} onSaved={()=>{ setShowAdd(false); fetchAll(); }}/>
      )}
    </LandlordLayout>
  );
}
