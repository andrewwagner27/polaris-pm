import { useState, useEffect, useCallback } from "react";
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
    <select value={value} onChange={onChange} disabled={disabled}
      style={{ width:"100%",padding:"10px 12px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,background:C.raised,color:value?C.text:C.textSub,outline:"none",boxSizing:"border-box",fontFamily:"'DM Sans',sans-serif",cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1 }}>
      {children}
    </select>
  );
}

function PrimaryBtn({ children, onClick, small, disabled }) {
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

function StatusBadge({ status }) {
  const cfg = {
    paid:      { label:"Paid",     color:C.green, bg:"rgba(114,176,42,0.12)",  border:"rgba(114,176,42,0.25)" },
    unpaid:    { label:"Unpaid",   color:C.amber, bg:"rgba(240,164,48,0.12)",  border:"rgba(240,164,48,0.25)" },
    overdue:   { label:"Overdue",  color:C.red,   bg:"rgba(224,85,85,0.12)",   border:"rgba(224,85,85,0.25)"  },
    pending:   { label:"Pending",  color:C.blue,  bg:"rgba(74,154,232,0.12)",  border:"rgba(74,154,232,0.25)" },
    failed:    { label:"Failed",   color:C.red,   bg:"rgba(224,85,85,0.12)",   border:"rgba(224,85,85,0.25)"  },
    active:    { label:"Active",   color:C.green, bg:"rgba(114,176,42,0.12)",  border:"rgba(114,176,42,0.25)" },
    paused:    { label:"Paused",   color:C.amber, bg:"rgba(240,164,48,0.12)",  border:"rgba(240,164,48,0.25)" },
    cancelled: { label:"Cancelled",color:C.textSub,bg:"rgba(92,98,112,0.12)", border:C.border                },
  }[status?.toLowerCase()] || { label:status||"—", color:C.textSub, bg:"transparent", border:C.border };
  return (
    <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.border}`,whiteSpace:"nowrap" }}>
      {cfg.label}
    </span>
  );
}

// ─── Request Money Modal ───────────────────────────────────────────────────
function RequestMoneyModal({ tenants, onClose, onSaved }) {
  const [form, setForm] = useState({ tenant_id:"", amount:"", category:"Rent", due_date:"", notes:"" });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const update = (k,v) => setForm(f=>({ ...f, [k]:v }));

  async function submit() {
    if (!form.tenant_id) { setError("Please select a tenant."); return; }
    if (!form.amount || isNaN(parseFloat(form.amount))) { setError("Enter a valid amount."); return; }
    if (!form.due_date) { setError("Due date is required."); return; }
    setSaving(true); setError("");

    const { error:err } = await supabase.from("payments").insert({
      tenant_id:   form.tenant_id,
      amount_cents: Math.round(parseFloat(form.amount) * 100),
      category:    form.category,
      due_date:    form.due_date,
      notes:       form.notes||null,
      status:      "unpaid",
    });

    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,width:480,maxHeight:"90vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"18px 22px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div style={{ fontSize:15,fontWeight:600,color:C.text }}>Request Money</div>
          <button onClick={onClose} style={{ background:"none",border:"none",fontSize:16,cursor:"pointer",color:C.textSub }}>✕</button>
        </div>
        <div style={{ padding:"16px 22px" }}>
          {error&&<div style={{ background:"rgba(224,85,85,0.1)",color:C.red,fontSize:12,padding:"10px 12px",borderRadius:7,marginBottom:14,border:`1px solid rgba(224,85,85,0.2)` }}>{error}</div>}
          <div style={{ marginBottom:12 }}>
            <FieldLabel>Tenant *</FieldLabel>
            <Select value={form.tenant_id} onChange={e=>update("tenant_id",e.target.value)}>
              <option value="">Select tenant…</option>
              {tenants.map(t=><option key={t.id} value={t.id}>{t.name} — Unit {t.unit}</option>)}
            </Select>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
            <div>
              <FieldLabel>Amount ($) *</FieldLabel>
              <Input type="number" value={form.amount} onChange={e=>update("amount",e.target.value)} placeholder="0.00"/>
            </div>
            <div>
              <FieldLabel>Category</FieldLabel>
              <Select value={form.category} onChange={e=>update("category",e.target.value)}>
                {["Rent","Pet Fee","Parking","Utility Surcharge","Late Fee","Security Deposit","Other"].map(c=><option key={c}>{c}</option>)}
              </Select>
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <FieldLabel>Due Date *</FieldLabel>
            <Input type="date" value={form.due_date} onChange={e=>update("due_date",e.target.value)}/>
          </div>
          <div style={{ marginBottom:16 }}>
            <FieldLabel>Notes</FieldLabel>
            <Input value={form.notes} onChange={e=>update("notes",e.target.value)} placeholder="Optional note for this request…"/>
          </div>
        </div>
        <div style={{ padding:"12px 22px 16px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10,justifyContent:"flex-end" }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={saving}>{saving?"Sending…":"Send Request"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Add Recurring Charge Modal ────────────────────────────────────────────
function AddRecurringModal({ tenants, onClose, onSaved }) {
  const [form, setForm] = useState({ tenant_id:"", category:"Rent", amount:"", due_day:"1", start_date:"", end_date:"" });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const update = (k,v) => setForm(f=>({ ...f, [k]:v }));

  async function submit() {
    if (!form.tenant_id) { setError("Select a tenant."); return; }
    if (!form.amount || isNaN(parseFloat(form.amount))) { setError("Enter a valid amount."); return; }
    setSaving(true); setError("");

    const tenant = tenants.find(t=>t.id===form.tenant_id);

    const { error:err } = await supabase.from("recurring_charges").insert({
      tenant_id:  form.tenant_id,
      unit_id:    tenant?.unit_id||null,
      category:   form.category,
      amount:     parseFloat(form.amount),
      due_day:    parseInt(form.due_day)||1,
      start_date: form.start_date||null,
      end_date:   form.end_date||null,
      status:     "active",
    });

    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,width:480,maxHeight:"90vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"18px 22px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div style={{ fontSize:15,fontWeight:600,color:C.text }}>Add Recurring Charge</div>
          <button onClick={onClose} style={{ background:"none",border:"none",fontSize:16,cursor:"pointer",color:C.textSub }}>✕</button>
        </div>
        <div style={{ padding:"16px 22px" }}>
          {error&&<div style={{ background:"rgba(224,85,85,0.1)",color:C.red,fontSize:12,padding:"10px 12px",borderRadius:7,marginBottom:14,border:`1px solid rgba(224,85,85,0.2)` }}>{error}</div>}
          <div style={{ marginBottom:12 }}>
            <FieldLabel>Tenant *</FieldLabel>
            <Select value={form.tenant_id} onChange={e=>update("tenant_id",e.target.value)}>
              <option value="">Select tenant…</option>
              {tenants.map(t=><option key={t.id} value={t.id}>{t.name} — Unit {t.unit}</option>)}
            </Select>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
            <div>
              <FieldLabel>Category</FieldLabel>
              <Select value={form.category} onChange={e=>update("category",e.target.value)}>
                {["Rent","Pet Fee","Parking","Utility Surcharge","Other"].map(c=><option key={c}>{c}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>Amount ($) *</FieldLabel>
              <Input type="number" value={form.amount} onChange={e=>update("amount",e.target.value)} placeholder="0.00"/>
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <FieldLabel>Due Day of Month</FieldLabel>
            <Input type="number" value={form.due_day} onChange={e=>update("due_day",e.target.value)} placeholder="1"/>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16 }}>
            <div><FieldLabel>Start Date</FieldLabel><Input type="date" value={form.start_date} onChange={e=>update("start_date",e.target.value)}/></div>
            <div><FieldLabel>End Date</FieldLabel><Input type="date" value={form.end_date} onChange={e=>update("end_date",e.target.value)}/></div>
          </div>
        </div>
        <div style={{ padding:"12px 22px 16px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10,justifyContent:"flex-end" }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={saving}>{saving?"Saving…":"Add Charge"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Payment Requests Tab ──────────────────────────────────────────────────
function PaymentRequestsTab({ payments, tenantMap, onRefresh }) {
  const [filter, setFilter] = useState("all");

  const filtered = payments.filter(p => {
    if (filter==="unpaid")  return ["unpaid","overdue"].includes(p.status?.toLowerCase());
    if (filter==="paid")    return p.status?.toLowerCase()==="paid";
    if (filter==="pending") return p.status?.toLowerCase()==="pending";
    return true;
  });

  const totalOwed = payments.filter(p=>["unpaid","overdue"].includes(p.status?.toLowerCase()))
    .reduce((s,p)=>s+(p.amount_cents||0)/100,0);

  return (
    <div>
      {/* Mini summary */}
      <div style={{ display:"flex",gap:16,marginBottom:20,flexWrap:"wrap" }}>
        {[
          { label:"Total Requests", value:payments.length,  color:C.textSub },
          { label:"Outstanding",    value:`$${totalOwed.toLocaleString("en-US",{minimumFractionDigits:2})}`, color:totalOwed>0?C.amber:C.green },
          { label:"Paid",           value:payments.filter(p=>p.status?.toLowerCase()==="paid").length, color:C.green },
        ].map((s,i)=>(
          <div key={i} style={{ background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 18px",minWidth:130 }}>
            <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5 }}>{s.label}</div>
            <div style={{ fontSize:20,fontWeight:600,color:s.color,fontFamily:"'Cormorant Garamond',serif" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Sub-filter */}
      <div style={{ display:"flex",gap:6,marginBottom:16 }}>
        {[["all","All"],["unpaid","Unpaid"],["paid","Paid"],["pending","Pending"]].map(([k,l])=>(
          <button key={k} onClick={()=>setFilter(k)}
            style={{ padding:"5px 12px",borderRadius:6,fontSize:12,background:filter===k?C.goldDim:"transparent",color:filter===k?C.gold:C.textSub,border:`1px solid ${filter===k?C.goldDim:C.border}`,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden" }}>
        <table style={{ width:"100%",borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:C.raised }}>
              {["Tenant · Unit","Category","Due Date","Amount","Status","Actions"].map(h=>(
                <th key={h} style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.09em",padding:"10px 14px",textAlign:"left",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0&&(
              <tr><td colSpan={6} style={{ padding:28,textAlign:"center",color:C.textSub,fontSize:13 }}>No payment requests found.</td></tr>
            )}
            {filtered.map(p=>{
              const tenant = tenantMap[p.tenant_id];
              const amtDollars = (p.amount_cents||0)/100;
              return (
                <tr key={p.id} style={{ transition:"background 0.1s" }}
                  onMouseOver={e=>e.currentTarget.style.background=C.raised}
                  onMouseOut={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}`,fontSize:13 }}>
                    <div style={{ fontWeight:500,color:C.text }}>{tenant?.name||"Unknown"}</div>
                    <div style={{ fontSize:11,color:C.textSub }}>Unit {tenant?.unit||"—"}</div>
                  </td>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}`,fontSize:12,color:C.textSub }}>{p.category||"—"}</td>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}`,fontSize:12,color:C.textSub }}>
                    {p.due_date ? new Date(p.due_date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—"}
                  </td>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}`,fontSize:13,fontWeight:600,color:C.text }}>
                    ${amtDollars.toLocaleString("en-US",{minimumFractionDigits:2})}
                  </td>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}` }}>
                    <StatusBadge status={p.status}/>
                  </td>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}` }}>
                    <GhostBtn small>View</GhostBtn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Recurring Charges Tab ─────────────────────────────────────────────────
function RecurringChargesTab({ charges, tenantMap, onRefresh }) {
  const activeCharges = charges.filter(c=>c.status==="active");

  async function toggleStatus(charge) {
    const newStatus = charge.status==="active" ? "paused" : "active";
    await supabase.from("recurring_charges").update({ status:newStatus }).eq("id",charge.id);
    onRefresh();
  }

  async function deleteCharge(id) {
    if (!window.confirm("Delete this recurring charge?")) return;
    await supabase.from("recurring_charges").delete().eq("id",id);
    onRefresh();
  }

  const totalMonthly = activeCharges.reduce((s,c)=>s+parseFloat(c.amount||0),0);

  return (
    <div>
      <div style={{ display:"flex",gap:16,marginBottom:20,flexWrap:"wrap" }}>
        <div style={{ background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 18px",minWidth:140 }}>
          <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5 }}>Monthly Recurring</div>
          <div style={{ fontSize:20,fontWeight:600,color:C.gold,fontFamily:"'Cormorant Garamond',serif" }}>${totalMonthly.toLocaleString("en-US",{minimumFractionDigits:2})}</div>
        </div>
        <div style={{ background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 18px",minWidth:100 }}>
          <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5 }}>Active</div>
          <div style={{ fontSize:20,fontWeight:600,color:C.green,fontFamily:"'Cormorant Garamond',serif" }}>{activeCharges.length}</div>
        </div>
      </div>

      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden" }}>
        <table style={{ width:"100%",borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:C.raised }}>
              {["Tenant · Unit","Category","Amount","Due Day","Start → End","Status","Actions"].map(h=>(
                <th key={h} style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.09em",padding:"10px 14px",textAlign:"left",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {charges.length===0&&(
              <tr><td colSpan={7} style={{ padding:28,textAlign:"center",color:C.textSub,fontSize:13 }}>No recurring charges configured. Add one above.</td></tr>
            )}
            {charges.map(c=>{
              // recurring_charges.tenant_id references tenants(id)
              const tenant = tenantMap[c.tenant_id];
              return (
                <tr key={c.id} style={{ transition:"background 0.1s" }}
                  onMouseOver={e=>e.currentTarget.style.background=C.raised}
                  onMouseOut={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}`,fontSize:13 }}>
                    <div style={{ fontWeight:500,color:C.text }}>{tenant?.name||"Unknown"}</div>
                    <div style={{ fontSize:11,color:C.textSub }}>Unit {tenant?.unit||"—"}</div>
                  </td>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}`,fontSize:12,color:C.textSub }}>{c.category}</td>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}`,fontSize:13,fontWeight:600,color:C.text }}>
                    ${parseFloat(c.amount||0).toLocaleString("en-US",{minimumFractionDigits:2})}/mo
                  </td>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}`,fontSize:12,color:C.textSub }}>
                    {c.due_day ? `${c.due_day}${c.due_day===1?"st":c.due_day===2?"nd":c.due_day===3?"rd":"th"} of month` : "—"}
                  </td>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}`,fontSize:11,color:C.textSub }}>
                    {c.start_date ? new Date(c.start_date).toLocaleDateString("en-US",{month:"short",year:"numeric"}) : "—"}
                    {" → "}
                    {c.end_date ? new Date(c.end_date).toLocaleDateString("en-US",{month:"short",year:"numeric"}) : "Ongoing"}
                  </td>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}` }}>
                    <StatusBadge status={c.status}/>
                  </td>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}` }}>
                    <div style={{ display:"flex",gap:6 }}>
                      <GhostBtn small onClick={()=>toggleStatus(c)}>
                        {c.status==="active"?"Pause":"Resume"}
                      </GhostBtn>
                      <button onClick={()=>deleteCharge(c.id)}
                        style={{ background:"transparent",border:`1px solid rgba(224,85,85,0.25)`,color:C.red,fontSize:11,padding:"3px 8px",borderRadius:6,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Lease Terms Tab ───────────────────────────────────────────────────────
function LeaseTermsTab({ tenants }) {
  const [selected, setSelected] = useState("all");
  const now = Date.now();

  const display = selected==="all" ? tenants : tenants.filter(t=>t.id===selected);

  return (
    <div>
      <div style={{ marginBottom:16 }}>
        <Select value={selected} onChange={e=>setSelected(e.target.value)}>
          <option value="all">All tenants</option>
          {tenants.map(t=><option key={t.id} value={t.id}>{t.name} — Unit {t.unit}</option>)}
        </Select>
      </div>

      {display.length===0&&(
        <div style={{ padding:28,textAlign:"center",color:C.textSub,fontSize:13 }}>No tenant lease data found.</div>
      )}

      <div style={{ display:"grid",gap:12 }}>
        {display.map(t=>{
          const leaseEnd   = t.lease_end   ? new Date(t.lease_end)   : null;
          const leaseStart = t.lease_start ? new Date(t.lease_start) : null;
          const daysLeft   = leaseEnd ? Math.ceil((leaseEnd.getTime()-now)/86400000) : null;
          const isExpiring = daysLeft!==null && daysLeft>0 && daysLeft<=90;

          return (
            <div key={t.id} style={{ background:C.surface,border:`1px solid ${isExpiring?C.amber:C.border}`,borderRadius:10,padding:"18px 20px" }}>
              <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:8 }}>
                <div>
                  <div style={{ fontSize:14,fontWeight:600,color:C.text }}>{t.name}</div>
                  <div style={{ fontSize:12,color:C.textSub }}>{t.property} · Unit {t.unit}</div>
                </div>
                {isExpiring&&(
                  <span style={{ fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:6,background:"rgba(240,164,48,0.12)",color:C.amber,border:"1px solid rgba(240,164,48,0.25)" }}>
                    ⚠ Ending in {daysLeft} days
                  </span>
                )}
                {daysLeft!==null&&daysLeft<=0&&(
                  <span style={{ fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:6,background:"rgba(224,85,85,0.12)",color:C.red,border:"1px solid rgba(224,85,85,0.25)" }}>
                    Lease Expired
                  </span>
                )}
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12 }}>
                {[
                  { label:"Lease Start",  value:leaseStart ? leaseStart.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—" },
                  { label:"Lease End",    value:leaseEnd   ? leaseEnd.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})   : "—" },
                  { label:"Days Left",    value:daysLeft!==null ? (daysLeft<=0?"Expired":`${daysLeft} days`) : "—", accent:daysLeft!==null&&daysLeft<=90?C.amber:C.text },
                  { label:"Monthly Rent", value:t.rent ? `$${parseFloat(t.rent).toLocaleString("en-US",{minimumFractionDigits:2})}` : "—", accent:C.gold },
                  { label:"Autopay",      value:t.autopay_enabled ? "On" : "Off", accent:t.autopay_enabled?C.green:C.textSub },
                  { label:"Term Type",    value:t.lease_end_action==="month_to_month"?"Month-to-Month":"Fixed" },
                ].map((f,i)=>(
                  <div key={i} style={{ background:C.raised,borderRadius:6,padding:"10px 12px" }}>
                    <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4 }}>{f.label}</div>
                    <div style={{ fontSize:13,fontWeight:500,color:f.accent||C.text }}>{f.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:12,fontSize:11,color:C.textMuted,fontStyle:"italic" }}>
                Adding lease information here does not create payment requests. Visit Payment Requests to create or update payments.
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Transactions Tab ──────────────────────────────────────────────────────
function TransactionsTab({ payments, tenantMap }) {
  const [sub, setSub] = useState("all");

  const display = sub==="all" ? payments : [];

  return (
    <div>
      <div style={{ display:"flex",gap:6,marginBottom:16 }}>
        {[["all","All Transactions"],["review","Needs Review"],["excluded","Excluded"]].map(([k,l])=>(
          <button key={k} onClick={()=>setSub(k)}
            style={{ padding:"5px 12px",borderRadius:6,fontSize:12,background:sub===k?C.goldDim:"transparent",color:sub===k?C.gold:C.textSub,border:`1px solid ${sub===k?C.goldDim:C.border}`,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden" }}>
        <table style={{ width:"100%",borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:C.raised }}>
              {["Date","Tenant · Unit","Category","Amount","Status","Actions"].map(h=>(
                <th key={h} style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.09em",padding:"10px 14px",textAlign:"left",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {display.length===0&&(
              <tr><td colSpan={6} style={{ padding:28,textAlign:"center",color:C.textSub,fontSize:13 }}>
                {sub==="all"?"No transactions recorded yet.":sub==="review"?"No transactions need review.":"No excluded transactions."}
              </td></tr>
            )}
            {display.map(p=>{
              const tenant = tenantMap[p.tenant_id];
              const amtDollars = (p.amount_cents||0)/100;
              const isPaid = p.status?.toLowerCase()==="paid";
              return (
                <tr key={p.id} style={{ transition:"background 0.1s" }}
                  onMouseOver={e=>e.currentTarget.style.background=C.raised}
                  onMouseOut={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}`,fontSize:12,color:C.textSub }}>
                    {p.created_at ? new Date(p.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—"}
                  </td>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}`,fontSize:13 }}>
                    <div style={{ fontWeight:500,color:C.text }}>{tenant?.name||"Unknown"}</div>
                    <div style={{ fontSize:11,color:C.textSub }}>Unit {tenant?.unit||"—"}</div>
                  </td>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}`,fontSize:12,color:C.textSub }}>{p.category||"Payment"}</td>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}`,fontSize:13,fontWeight:600,color:isPaid?C.green:C.text }}>
                    {isPaid?"+":""} ${amtDollars.toLocaleString("en-US",{minimumFractionDigits:2})}
                  </td>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}` }}>
                    <StatusBadge status={p.status}/>
                  </td>
                  <td style={{ padding:"11px 14px",borderBottom:`1px solid ${C.border}` }}>
                    <GhostBtn small>View</GhostBtn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function LandlordFinancials() {
  const navigate   = useNavigate();
  const width      = useWindowWidth();
  const isMobile   = width < 768;

  const [tab,            setTab]            = useState("requests");
  const [loading,        setLoading]        = useState(true);
  const [tenants,        setTenants]        = useState([]);
  const [units,          setUnits]          = useState([]);
  const [properties,     setProperties]     = useState([]);
  const [payments,       setPayments]       = useState([]);
  const [recurringCharges,setRecurringCharges]=useState([]);
  const [showRequestMoney,setShowRequestMoney]=useState(false);
  const [showAddRecurring,setShowAddRecurring]=useState(false);

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
      // recurring_charges.tenant_id references tenants(id) — join accordingly
      supabase.from("recurring_charges").select("*, tenants:tenant_id(id, name, email, autopay_enabled, unit_id, lease_end_action), units:unit_id(unit_number, address)").order("created_at",{ ascending:false }),
    ]);
    setTenants(tenantsData||[]);
    setUnits(unitsData||[]);
    setProperties(propsData||[]);
    setPayments(paymentsData||[]);
    setRecurringCharges(chargesData||[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Enrich tenants with unit + property for display
  const enrichedTenants = (tenants||[]).map(t => {
    const unit     = (units||[]).find(u=>u.id===t.unit_id);
    const property = (properties||[]).find(p=>p.id===unit?.property_id);
    return { ...t, unit:unit?.unit_number||"—", property:property?.name||"—", rent:unit?.rent_amount||0 };
  });

  // Fast lookup: tenant_id → enriched tenant
  const tenantMap = {};
  enrichedTenants.forEach(t=>{ tenantMap[t.id]=t; });

  // YTD and summary metrics
  const now = new Date();
  const ytdStart = new Date(now.getFullYear(),0,1);
  const ytdPayments = payments.filter(p=>p.status?.toLowerCase()==="paid" && new Date(p.created_at)>=ytdStart);
  const ytdCollected = ytdPayments.reduce((s,p)=>s+(p.amount_cents||0)/100, 0);
  const outstanding  = payments.filter(p=>["unpaid","overdue"].includes(p.status?.toLowerCase())).reduce((s,p)=>s+(p.amount_cents||0)/100, 0);
  const inTransit    = payments.filter(p=>p.status?.toLowerCase()==="pending").reduce((s,p)=>s+(p.amount_cents||0)/100, 0);
  const evictionCount= tenants.filter(t=>t.eviction_watch).length;

  const TABS = [
    { key:"requests",    label:"Payment Requests" },
    { key:"recurring",   label:"Recurring" },
    { key:"transactions",label:"Transactions" },
    { key:"leases",      label:"Lease Terms" },
  ];

  return (
    <LandlordLayout openMaintenance={0} unreadMessages={0}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
      `}</style>

      <div style={{ background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',sans-serif",padding:isMobile?"20px 16px":"28px 32px 48px" }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:10 }}>
          <div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:isMobile?20:24,fontWeight:600,color:C.text }}>Financials</div>
            <div style={{ fontSize:13,color:C.textSub,marginTop:3 }}>
              {loading?"Loading…":`${enrichedTenants.length} active tenants · ${recurringCharges.filter(c=>c.status==="active").length} recurring charges`}
            </div>
          </div>
          <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
            <GhostBtn onClick={()=>setShowAddRecurring(true)}>+ Recurring Charge</GhostBtn>
            <PrimaryBtn onClick={()=>setShowRequestMoney(true)}>+ Request Money</PrimaryBtn>
          </div>
        </div>

        {/* Analytics ribbon */}
        <div style={{ display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)",gap:10,marginBottom:24 }}>
          {[
            { label:"Collected YTD",     value:`$${ytdCollected.toLocaleString("en-US",{minimumFractionDigits:2})}`, sub:"all paid payments",        accent:C.green },
            { label:"Outstanding",       value:`$${outstanding.toLocaleString("en-US",{minimumFractionDigits:2})}`,  sub:"unpaid & overdue",          accent:outstanding>0?C.amber:C.green },
            { label:"In Transit",        value:`$${inTransit.toLocaleString("en-US",{minimumFractionDigits:2})}`,   sub:"pending settlement",         accent:C.blue  },
            { label:"Eviction Watch",    value:evictionCount,                                                        sub:"overdue accounts",           accent:evictionCount>0?C.red:C.textSub },
          ].map((s,i)=>(
            <div key={i} style={{ background:C.surface,border:`1px solid ${s.accent===C.red&&evictionCount>0?"rgba(224,85,85,0.3)":C.border}`,borderRadius:10,padding:"16px 18px" }}>
              <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:10 }}>
                <div style={{ width:6,height:6,borderRadius:"50%",background:s.accent }}/>
                <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.09em" }}>{s.label}</div>
              </div>
              <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:26,fontWeight:600,color:s.accent,lineHeight:1,marginBottom:4 }}>{s.value}</div>
              <div style={{ fontSize:11,color:C.textSub }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{ display:"flex",gap:0,marginBottom:0,borderBottom:`1px solid ${C.border}` }}>
          {TABS.map(t=>{
            const active = tab===t.key;
            return (
              <button key={t.key} onClick={()=>setTab(t.key)}
                style={{ padding:"10px 18px",fontSize:13,fontWeight:active?600:400,color:active?C.gold:C.textSub,background:"transparent",border:"none",borderBottom:active?`2px solid ${C.gold}`:"2px solid transparent",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s",whiteSpace:"nowrap" }}>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderTop:"none",borderRadius:"0 0 10px 10px",padding:"20px 20px 24px" }}>
          {loading ? (
            <div style={{ padding:40,textAlign:"center",color:C.textSub,fontSize:13 }}>Loading financials…</div>
          ) : (
            <>
              {tab==="requests"&&(
                <PaymentRequestsTab payments={payments} tenantMap={tenantMap} onRefresh={fetchAll}/>
              )}
              {tab==="recurring"&&(
                <RecurringChargesTab charges={recurringCharges} tenantMap={tenantMap} onRefresh={fetchAll}/>
              )}
              {tab==="transactions"&&(
                <TransactionsTab payments={payments} tenantMap={tenantMap}/>
              )}
              {tab==="leases"&&(
                <LeaseTermsTab tenants={enrichedTenants}/>
              )}
            </>
          )}
        </div>
      </div>

      {showRequestMoney&&(
        <RequestMoneyModal
          tenants={enrichedTenants}
          onClose={()=>setShowRequestMoney(false)}
          onSaved={()=>{ setShowRequestMoney(false); fetchAll(); }}
        />
      )}
      {showAddRecurring&&(
        <AddRecurringModal
          tenants={enrichedTenants}
          onClose={()=>setShowAddRecurring(false)}
          onSaved={()=>{ setShowAddRecurring(false); fetchAll(); }}
        />
      )}
    </LandlordLayout>
  );
}