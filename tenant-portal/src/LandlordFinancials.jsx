import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";
import { EXPENSE_CATEGORIES, paidAtFromDate, paymentCents, paymentAmountConflict, expenseRowFromForm, expenseStatus, fmtCents, todayNY, paymentChannel, isCollected, netPaymentCents, refundsByPayment, receiptLinesFromForm } from "./lib/accounting";
import Receivables from "./Receivables";
import Collections from "./Collections";
import OwnerCash from "./OwnerCash";
import { A3_ENABLED } from "./lib/release";
import PaymentRouteWarning from "./PaymentRouteWarning";
import PaymentLinesField from "./PaymentLinesField";
import PaymentActions from "./PaymentActions";
import { PrimaryBtn } from "./ui/Button";
import { usePropertyScope, useScopedLoad, ALL } from "./lib/propertyScope";
import { fetchLandlordBalances, rentStanding } from "./lib/tenantFinancials";

const C = {
  bg:       "#0B0D10",
  surface:  "#15191F",
  raised:   "#1C2129",
  border:   "#262B33",
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

// ─── Shared UI atoms ───────────────────────────────────────────────────────

function GhostBtn({ children, onClick, small }) {
  return (
    <button className="m-touch-min" onClick={onClick}
      style={{ background:"transparent",border:`1px solid ${C.border}`,color:C.textSub,fontSize:small?11:13,fontWeight:500,padding:small?"5px 10px":"9px 18px",borderRadius:7,cursor:"pointer",fontFamily:"var(--m-font)",transition:"all 0.15s",whiteSpace:"nowrap" }}
      onMouseOver={e=>{ e.currentTarget.style.color=C.text; e.currentTarget.style.borderColor="#353A44"; }}
      onMouseOut={e=>{ e.currentTarget.style.color=C.textSub; e.currentTarget.style.borderColor=C.border; }}
    >{children}</button>
  );
}

function FieldLabel({ children }) {
  return <label style={{ fontSize:12,fontWeight:600,color:C.textSub,display:"block",marginBottom:5 }}>{children}</label>;
}

function Input({ value, onChange, placeholder, type="text", style: extraStyle }) {
  const [focused, setFocused] = useState(false);
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
      style={{ width:"100%",padding:"10px 12px",fontSize:13,border:`1px solid ${focused?C.gold:C.border}`,borderRadius:7,background:C.raised,color:C.text,outline:"none",boxSizing:"border-box",fontFamily:"var(--m-font)",boxShadow:focused?"0 0 0 3px rgba(201,169,110,0.08)":"none",transition:"border-color 0.15s",...extraStyle }}
    />
  );
}

function Select({ value, onChange, children, disabled }) {
  return (
    <select value={value} onChange={onChange} disabled={disabled}
      style={{ width:"100%",padding:"10px 12px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:7,background:C.raised,color:value?C.text:C.textSub,outline:"none",boxSizing:"border-box",fontFamily:"var(--m-font)",cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1 }}>
      {children}
    </select>
  );
}

function TH({ children, right }) {
  return <th style={{ fontSize:12,fontWeight:600,color:C.textSub,padding:"11px 16px",textAlign:right?"right":"left",borderBottom:`1px solid ${C.border}`,background:C.raised,whiteSpace:"nowrap" }}>{children}</th>;
}

function TD({ children, right, bold, muted, label = "" }) {
  return <td data-label={label} style={{ padding:"12px 16px",fontSize:13,color:muted?C.textSub:bold?C.text:C.textSub,fontWeight:bold?500:400,textAlign:right?"right":"left",borderBottom:`1px solid ${C.border}` }}>{children}</td>;
}

function Badge({ status }) {
  const map = {
    paid:    { bg:"rgba(114,176,42,0.13)",  color:C.green,  label:"Paid"    },
    pending: { bg:"rgba(240,164,48,0.13)",  color:C.amber,  label:"Pending" },
    failed:  { bg:"rgba(224,85,85,0.13)",   color:C.red,    label:"Failed"  },
    late:    { bg:"rgba(224,85,85,0.13)",   color:C.red,    label:"Late"    },
    unpaid:  { bg:"rgba(240,164,48,0.13)",  color:C.amber,  label:"Unpaid"  },
    void:    { bg:"rgba(92,98,112,0.13)",   color:C.textSub,label:"Void"    },
    returned:{ bg:"rgba(224,85,85,0.13)",   color:C.red,    label:"Returned"},
  };
  const cfg = map[status] || { bg:"rgba(92,98,112,0.13)", color:C.textSub, label:status||"—" };
  return <span style={{ fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:cfg.bg,color:cfg.color }}>{cfg.label}</span>;
}

const fmt = (n) => `$${parseFloat(n||0).toLocaleString("en-US",{minimumFractionDigits:2})}`;
const fmtDay  = (d) => d ? fmtDate(`${String(d).slice(0,10)}T12:00:00`) : "—";   // date-only values, no TZ shift
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—";

// ─── Record Payment Modal ──────────────────────────────────────────────────
function RecordPaymentModal({ tenants, initialTenant, onClose, onSaved }) {
  const [form, setForm]   = useState({ tenant_id:initialTenant||"", lines:[{ category:"", amount:"" }], paid_at:"", method:"ach" });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const update = (k,v) => setForm(f=>({...f,[k]:v}));

  async function submit() {
    if (!form.tenant_id) { setError("Select a tenant."); return; }
    const { lines, error:invalid } = receiptLinesFromForm(form.lines);
    if (invalid) { setError(invalid); return; }
    if (!paidAtFromDate(form.paid_at)) { setError("Enter the date the payment was actually received."); return; }
    setSaving(true); setError("");
    // One receipt per category (one statement, so all lines save or none do).
    const { error:err } = await supabase.from("payments").insert(lines.map(l=>({
      tenant_id:    form.tenant_id,
      unit_id:      tenants.find(t=>t.id===form.tenant_id)?.unit_id || null,   // the unit it is for, recorded now
      category:     l.category,
      amount_cents: l.cents,
      paid_at:      paidAtFromDate(form.paid_at),
      source:       form.method,
      status:       "paid",
    })));
    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,width:"min(460px, calc(100vw - 24px))",maxHeight:"90vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
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
          <PaymentLinesField tenantId={form.tenant_id} lines={form.lines} onChange={lines=>update("lines",lines)}/>
          <div style={{ marginBottom:12 }}>
            <div>
              <FieldLabel>Date received *</FieldLabel>
              <Input type="date" value={form.paid_at} onChange={e=>update("paid_at",e.target.value)} style={{ colorScheme:"dark" }}/>
            </div>
          </div>
          <div style={{ marginBottom:4 }}>
            <FieldLabel>Method (recorded offline)</FieldLabel>
            <Select value={form.method} onChange={e=>update("method",e.target.value)}>
              <option value="ach">ACH / Bank Transfer</option>
              <option value="check">Check</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </Select>
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
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,width:"min(460px, calc(100vw - 24px))",maxHeight:"90vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
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
          <table className="m-rtable" style={{ width:"100%",borderCollapse:"collapse" }}>
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
                    <TD bold label="Tenant">{tenant?.name||"—"}</TD>
                    <TD bold label="Category">{c.category}</TD>
                    <TD bold label="Amount">{fmt(c.amount)}/mo</TD>
                    <TD label="Period">
                      <span style={{ fontSize:11 }}>
                        {c.start_date?new Date(c.start_date).toLocaleDateString("en-US",{month:"short",year:"numeric"}):"—"}
                        {" → "}
                        {c.end_date?new Date(c.end_date).toLocaleDateString("en-US",{month:"short",year:"numeric"}):"Ongoing"}
                      </span>
                    </TD>
                    <TD label="">
                      <button onClick={()=>deleteCharge(c.id)}
                        style={{ background:"transparent",border:`1px solid rgba(224,85,85,0.25)`,color:C.red,fontSize:11,padding:"3px 8px",borderRadius:6,cursor:"pointer",fontFamily:"var(--m-font)" }}>
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
function PaymentsTab({ payments, refunds, tenantMap, onRefresh, tenants }) {
  const [showRecord, setShowRecord] = useState(false);
  const [filter, setFilter]         = useState("all");
  const [sortCol, setSortCol]        = useState("date");
  const [sortDir, setSortDir]        = useState("desc");

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir(col === "date" ? "desc" : "asc"); }
  }

  const baseFiltered = filter==="all" ? payments
    : filter==="paid" ? payments.filter(isCollected)
    : filter==="void" ? payments.filter(p=>p.voided_at)
    : payments.filter(p=>p.status===filter&&!p.voided_at);

  const filtered = [...baseFiltered].sort((a, b) => {
    let av, bv;
    if (sortCol === "tenant")  { av = tenantMap[a.tenant_id]?.name||""; bv = tenantMap[b.tenant_id]?.name||""; }
    else if (sortCol === "amount") { av = paymentCents(a); bv = paymentCents(b); }
    else if (sortCol === "status") { av = a.voided_at?"void":a.status; bv = b.voided_at?"void":b.status; }
    else { av = new Date(a.paid_at||a.created_at).getTime(); bv = new Date(b.paid_at||b.created_at).getTime(); }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const refunded = refundsByPayment(refunds);
  const totalPaid = payments.reduce((s,p)=>s+netPaymentCents(p,refunded),0);
  const totalPending = payments.filter(p=>p.status==="pending"&&!p.voided_at).reduce((s,p)=>s+paymentCents(p),0);

  return (
    <div>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10 }}>
        <div className="m-scroll-x" style={{ display:"flex",gap:8,maxWidth:"100%" }}>
          {["all","paid","pending","failed","returned","void"].map(f=>(
            <button key={f} type="button" className="f-pill" aria-pressed={filter===f} onClick={()=>setFilter(f)}
              style={{ padding:"5px 12px",fontSize:12,fontWeight:500,borderRadius:6,cursor:"pointer",fontFamily:"var(--m-font)",border:`1px solid ${filter===f?C.goldDim:C.border}`,background:filter===f?"rgba(201,169,110,0.12)":"transparent",color:filter===f?C.gold:C.textSub,transition:"all 0.15s" }}>
              {f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          ))}
        </div>
        <PrimaryBtn small onClick={()=>setShowRecord(true)}>+ Record payment</PrimaryBtn>
      </div>

      {/* Summary strip */}
      <div className="m-grid" style={{ marginBottom:18 }}>
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px" }}>
          <div style={{ fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:6 }}>Paid, net of refunds (all time)</div>
          <div style={{ fontFamily:"var(--m-font)", fontVariantNumeric:"tabular-nums",fontSize:"var(--m-fs-stat)",fontWeight:600,color:C.green }}>{fmtCents(totalPaid)}</div>
        </div>
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px" }}>
          <div style={{ fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:6 }}>Pending</div>
          <div style={{ fontFamily:"var(--m-font)", fontVariantNumeric:"tabular-nums",fontSize:"var(--m-fs-stat)",fontWeight:600,color:C.amber }}>{fmtCents(totalPending)}</div>
        </div>
      </div>

      {filtered.length===0?(
        <div style={{ textAlign:"center",padding:"40px 20px",color:C.textSub,fontSize:13 }}>No payments match this filter.</div>
      ):(
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
          <table className="m-rtable" style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:C.raised }}>
                {[["tenant","Tenant"],["for","For"],["amount","Amount"],["date","Date"],["channel","Received through"],["status","Status"]].map(([col,label])=>(
                  <th key={col} onClick={()=>["tenant","amount","date","status"].includes(col)&&toggleSort(col)}
                    style={{ fontSize:12,fontWeight:600,color:sortCol===col?C.gold:C.textSub,padding:"11px 16px",textAlign:"left",borderBottom:`1px solid ${C.border}`,background:C.raised,whiteSpace:"nowrap",cursor:["tenant","amount","date","status"].includes(col)?"pointer":"default",userSelect:"none" }}>
                    {label}{sortCol===col ? (sortDir==="asc"?" ↑":" ↓") : ""}
                  </th>
                ))}
                <TH>Note</TH><TH></TH>
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
                    <TD bold label="Tenant">{tenant?.name||"—"}</TD>
                    <TD label="For">{p.category||"—"}</TD>
                    <TD bold label="Amount">
                      {fmtCents(paymentCents(p))}{paymentAmountConflict(p)&&<span title="amount and amount_cents disagree — see Reports → Income Statement → reconciliation" style={{ marginLeft:6,color:C.amber }}>⚠</span>}
                      {refunded[p.id]>0&&<div style={{ fontSize:10,fontWeight:400,color:C.blue,marginTop:2 }}>{fmtCents(refunded[p.id])} refunded</div>}
                    </TD>
                    <TD label="Date">{fmtDate(p.paid_at||p.created_at)}</TD>
                    <TD label="Received through">{paymentChannel(p)}</TD>
                    <TD label="Status"><Badge status={p.voided_at?"void":p.status}/></TD>
                    <TD muted label="Note">{p.voided_at?`Void: ${p.void_reason}`:"—"}</TD>
                    <TD label=""><PaymentActions payment={p} refundedCents={refunded[p.id]||0} onDone={onRefresh}/></TD>
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

// ─── Record Expense Modal ──────────────────────────────────────────────────
function RecordExpenseModal({ properties, units, onClose, onSaved }) {
  const today = todayNY();
  const [form, setForm]     = useState({ property_id:"", unit_id:"", category:"", amount:"", date:today, paid:true, paid_at:today, vendor_name:"", description:"" });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const update = (k,v) => setForm(f=>({...f,[k]:v}));
  const propUnits = units.filter(u=>u.property_id===form.property_id);

  async function submit() {
    const { row, error:invalid } = expenseRowFromForm(form);
    if (invalid) { setError(invalid); return; }
    setSaving(true); setError("");
    const { error:err } = await supabase.from("expenses").insert(row);
    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }} onClick={onClose}>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,width:480,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"20px 24px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div style={{ fontSize:15,fontWeight:600,color:C.text }}>Record expense</div>
          <button onClick={onClose} style={{ background:"none",border:"none",fontSize:16,cursor:"pointer",color:C.textSub }}>✕</button>
        </div>
        <div style={{ padding:"18px 24px" }}>
          {error&&<div style={{ background:"rgba(224,85,85,0.1)",color:C.red,fontSize:12,padding:"10px 12px",borderRadius:7,marginBottom:14,border:`1px solid rgba(224,85,85,0.2)` }}>{error}</div>}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
            <div>
              <FieldLabel>Property *</FieldLabel>
              <Select value={form.property_id} onChange={e=>setForm(f=>({...f,property_id:e.target.value,unit_id:""}))}>
                <option value="">Select property…</option>
                {properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>Unit</FieldLabel>
              <Select value={form.unit_id} onChange={e=>update("unit_id",e.target.value)} disabled={propUnits.length===0}>
                <option value="">Whole property</option>
                {propUnits.map(u=><option key={u.id} value={u.id}>{u.unit_number}</option>)}
              </Select>
            </div>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
            <div>
              <FieldLabel>Category *</FieldLabel>
              <Select value={form.category} onChange={e=>update("category",e.target.value)}>
                <option value="">Select category…</option>
                {EXPENSE_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.value}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>Amount *</FieldLabel>
              <div style={{ position:"relative" }}>
                <span style={{ position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:C.textSub,fontSize:13 }}>$</span>
                <Input type="number" value={form.amount} onChange={e=>update("amount",e.target.value)} placeholder="0.00" style={{ paddingLeft:24 }}/>
              </div>
            </div>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
            <div>
              <FieldLabel>Vendor</FieldLabel>
              <Input value={form.vendor_name} onChange={e=>update("vendor_name",e.target.value)} placeholder="e.g. AEP Ohio"/>
            </div>
            <div>
              <FieldLabel>Invoice / bill date *</FieldLabel>
              <Input type="date" value={form.date} onChange={e=>update("date",e.target.value)} style={{ colorScheme:"dark" }}/>
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <FieldLabel>Description</FieldLabel>
            <Input value={form.description} onChange={e=>update("description",e.target.value)} placeholder="e.g. October electric — common areas"/>
          </div>
          <div style={{ background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px" }}>
            <label style={{ display:"flex",alignItems:"center",gap:8,fontSize:13,color:C.text,cursor:"pointer" }}>
              <input type="checkbox" checked={form.paid} onChange={e=>update("paid",e.target.checked)} style={{ accentColor:C.gold }}/>
              Already paid
            </label>
            {form.paid?(
              <div style={{ marginTop:10 }}>
                <FieldLabel>Date paid *</FieldLabel>
                <Input type="date" value={form.paid_at} onChange={e=>update("paid_at",e.target.value)} style={{ colorScheme:"dark" }}/>
              </div>
            ):(
              <div style={{ fontSize:11,color:C.textSub,marginTop:8,lineHeight:1.5 }}>Unpaid bills are not on the cash-basis income statement until you mark them paid.</div>
            )}
          </div>
        </div>
        <div style={{ padding:"14px 24px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10,justifyContent:"flex-end" }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={saving}>{saving?"Saving…":"Record expense"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Expenses Tab ──────────────────────────────────────────────────────────
function ExpensesTab({ expenses, properties, units, onRefresh }) {
  const [showRecord, setShowRecord] = useState(false);
  const [filter, setFilter]         = useState("all");
  const [payingId, setPayingId]     = useState(null);
  const [paidDate, setPaidDate]     = useState(todayNY());
  const [actionError, setActionError] = useState("");

  const propMap = {};
  properties.forEach(p => { propMap[p.id] = p; });
  const byProp   = expenses;   // already limited to the global property scope
  const filtered = filter==="all" ? byProp : byProp.filter(e=>expenseStatus(e)===filter);
  const sumCents = (list) => list.reduce((s,e)=>s+Math.round(parseFloat(e.amount||0)*100),0);
  const paidCents   = sumCents(byProp.filter(e=>expenseStatus(e)==="paid"));
  const unpaidCents = sumCents(byProp.filter(e=>expenseStatus(e)==="unpaid"));

  async function markPaid(e) {
    setActionError("");
    const { error } = await supabase.from("expenses").update({ paid_at:paidDate }).eq("id",e.id);
    if (error) { setActionError(error.message); return; }
    setPayingId(null); onRefresh();
  }
  async function voidExpense(e) {
    if (!window.confirm("Void this expense? It stays on record; if it was paid, the ledger records a reversal.")) return;
    setActionError("");
    const { error } = await supabase.from("expenses").update({ voided_at:new Date().toISOString() }).eq("id",e.id);
    if (error) { setActionError(error.message); return; }
    onRefresh();
  }

  return (
    <div>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10 }}>
        <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
          {["all","paid","unpaid","void"].map(f=>(
            <button key={f} type="button" className="f-pill" aria-pressed={filter===f} onClick={()=>setFilter(f)}
              style={{ padding:"5px 12px",fontSize:12,fontWeight:500,borderRadius:6,cursor:"pointer",fontFamily:"var(--m-font)",border:`1px solid ${filter===f?C.goldDim:C.border}`,background:filter===f?"rgba(201,169,110,0.12)":"transparent",color:filter===f?C.gold:C.textSub,transition:"all 0.15s" }}>
              {f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          ))}
        </div>
        <PrimaryBtn small onClick={()=>setShowRecord(true)}>+ Record expense</PrimaryBtn>
      </div>

      <div className="m-grid" style={{ marginBottom:18 }}>
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px" }}>
          <div style={{ fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:6 }}>Paid (all time)</div>
          <div style={{ fontFamily:"var(--m-font)", fontVariantNumeric:"tabular-nums",fontSize:"var(--m-fs-stat)",fontWeight:600,color:C.text }}>{fmtCents(paidCents)}</div>
        </div>
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px" }}>
          <div style={{ fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:6 }}>Unpaid — not yet on the income statement</div>
          <div style={{ fontFamily:"var(--m-font)", fontVariantNumeric:"tabular-nums",fontSize:"var(--m-fs-stat)",fontWeight:600,color:C.amber }}>{fmtCents(unpaidCents)}</div>
        </div>
      </div>

      {actionError&&<div style={{ background:"rgba(224,85,85,0.1)",color:C.red,fontSize:12,padding:"10px 12px",borderRadius:7,marginBottom:14 }}>{actionError}</div>}

      {filtered.length===0?(
        <div style={{ textAlign:"center",padding:"40px 20px",color:C.textSub,fontSize:13 }}>No expenses match this filter.</div>
      ):(
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"auto" }}>
          <table className="m-rtable" style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:C.raised }}>
                <TH>Date</TH><TH>Property</TH><TH>Category</TH><TH>Vendor / description</TH><TH right>Amount</TH><TH>Status</TH><TH>Actions</TH>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e=>{
                const status = expenseStatus(e);
                return (
                  <tr key={e.id}
                    style={{ transition:"background 0.1s",opacity:status==="void"?0.55:1 }}
                    onMouseOver={ev=>ev.currentTarget.style.background=C.raised}
                    onMouseOut={ev=>ev.currentTarget.style.background="transparent"}>
                    <TD label="Date">{fmtDay(e.date)}</TD>
                    <TD bold label="Property">{propMap[e.property_id]?.name||"—"}</TD>
                    <TD label="Category">{e.category||"—"}</TD>
                    <TD label="Vendor / description">{[e.vendor_name,e.description].filter(Boolean).join(" · ")||"—"}</TD>
                    <TD right bold label="Amount">{fmt(e.amount)}</TD>
                    <TD label="Status">
                      <Badge status={status}/>
                      {status==="paid"&&<div style={{ fontSize:10,color:C.textMuted,marginTop:3 }}>{fmtDay(e.paid_at)}</div>}
                    </TD>
                    <TD label="">
                      {status==="unpaid"&&(payingId===e.id?(
                        <div style={{ display:"flex",gap:6,alignItems:"center" }}>
                          <input type="date" value={paidDate} onChange={ev=>setPaidDate(ev.target.value)} aria-label="Date paid"
                            style={{ padding:"3px 6px",fontSize:11,background:C.raised,color:C.text,border:`1px solid ${C.border}`,borderRadius:5,colorScheme:"dark" }}/>
                          <PrimaryBtn small onClick={()=>markPaid(e)}>Save</PrimaryBtn>
                        </div>
                      ):(
                        <PrimaryBtn small onClick={()=>{ setPayingId(e.id); setPaidDate(todayNY()); }}>Mark paid</PrimaryBtn>
                      ))}
                      {status!=="void"&&(
                        <button onClick={()=>voidExpense(e)}
                          style={{ marginLeft:6,background:"transparent",border:`1px solid rgba(224,85,85,0.25)`,color:C.red,fontSize:11,padding:"3px 8px",borderRadius:6,cursor:"pointer",fontFamily:"var(--m-font)" }}>
                          Void
                        </button>
                      )}
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showRecord&&(
        <RecordExpenseModal
          properties={properties}
          units={units}
          onClose={()=>setShowRecord(false)}
          onSaved={()=>{ setShowRecord(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
// Everything on Financials for one scope (ALL or a property id), passed explicitly; RLS decides what is readable.
// Payments and tenants are scoped through their unit's property; expenses carry their own property id; recurring charges
// follow their tenant.
async function loadFinancials(propertyId) {
  const scoped = propertyId !== ALL;
  let tq   = supabase.from("tenants").select(`*, units${scoped ? "!inner" : ""}(property_id)`);
  let uq   = supabase.from("units").select("*");
  let pq   = supabase.from("properties").select("*");
  let payq = supabase.from("payments").select(`*, units${scoped ? "!inner" : ""}(property_id)`).order("created_at",{ ascending:false });
  let eq   = supabase.from("expenses").select("*").order("date",{ ascending:false });
  if (scoped) { tq = tq.eq("units.property_id", propertyId); uq = uq.eq("property_id", propertyId); pq = pq.eq("id", propertyId); payq = payq.eq("units.property_id", propertyId); eq = eq.eq("property_id", propertyId); }
  const [t, u, p, pay, ch, ex, rf] = await Promise.all([
    tq, uq, pq, payq,
    supabase.from("recurring_charges").select("*").order("created_at",{ ascending:false }),
    eq,
    supabase.from("payment_refunds").select("*"),   // not there before A2 is applied: treated as none
  ]);
  const err = t.error || u.error || p.error || pay.error;
  if (err) throw new Error(err.message);
  const tenants = (t.data || []).filter(x => !x.archived);
  const ids = new Set((t.data || []).map(x => x.id));
  return {
    tenants, units: u.data || [], properties: p.data || [], payments: pay.data || [],
    // Recurring charges have no property of their own: in a property scope keep the charges of that property's tenants.
    recurringCharges: (ch.data || []).filter(c => !scoped || ids.has(c.tenant_id)),
    expenses: ex.data || [], refunds: rf.data || [],
    balances: await fetchLandlordBalances(supabase),
  };
}

export default function LandlordFinancials() {
  const { tenantId: paramTenantId } = useParams();
  const navigate = useNavigate();
  const { selectedName, isAll } = usePropertyScope();
  const { data, loading: loadingAny, error, reload: fetchAll } = useScopedLoad("financials", loadFinancials);
  const loading = loadingAny && !data;
  const tenants = data?.tenants || [], units = data?.units || [], properties = data?.properties || [];
  const payments = data?.payments || [], recurringCharges = data?.recurringCharges || [], expenses = data?.expenses || [], refunds = data?.refunds || [];
  const balances = data?.balances || { mode: "loading", byTenant: new Map() };

  const [activeTab,        setActiveTab]        = useState("payments");
  const [tenantChoice,     setTenantFilter]     = useState(paramTenantId||"all");
  const [recordFor,        setRecordFor]        = useState(null);   // Collections → Record payment
  // A tenant filter only survives a scope change if that tenant is still in scope.
  const tenantFilter = tenantChoice === "all" || tenants.some(t => t.id === tenantChoice) || loading ? tenantChoice : "all";

  const tenantMap = {};
  tenants.forEach(t => { tenantMap[t.id] = t; });

  const filteredPayments  = tenantFilter==="all" ? payments  : payments.filter(p=>p.tenant_id===tenantFilter);
  const filteredCharges   = tenantFilter==="all" ? recurringCharges : recurringCharges.filter(c=>c.tenant_id===tenantFilter);

  const [now]     = useState(() => new Date());   // one clock per visit
  const refunded  = refundsByPayment(refunds);
  const thisMonth = payments.filter(p=>{
    if (!isCollected(p)) return false;
    const d = new Date(p.paid_at||p.created_at);
    return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
  });
  const collectedThisMonth = thisMonth.reduce((s,p)=>s+netPaymentCents(p,refunded),0)/100;
  const monthlyRecurring   = recurringCharges.reduce((s,c)=>s+parseFloat(c.amount||0),0);
  // Balances come only from the receivables ledger. Without it Modus doesn't know who owes what, so nothing is inferred
  // from "no payment recorded this month".
  const ledger = balances.mode === "ledger";
  const owing  = ledger ? tenants.filter(t => rentStanding(t, balances).status === "owes") : [];

  // Exceptions worth acting on, listed only when they exist.
  const since = now.getTime() - 60 * 864e5;
  const failedPayments = payments.filter(p => !p.voided_at && (p.status === "failed" || p.status === "returned") && new Date(p.created_at).getTime() >= since);
  const unpaidExpenses = expenses.filter(e => expenseStatus(e) === "unpaid");
  const exceptions = [
    ...(ledger && owing.length ? [{ key: "owing", tone: C.red, text: `${owing.length} tenant${owing.length === 1 ? "" : "s"} with a ledger balance due`, action: "Receivables", go: () => setActiveTab("receivables") }] : []),
    ...(failedPayments.length ? [{ key: "failed", tone: C.red, text: `${failedPayments.length} failed or returned payment${failedPayments.length === 1 ? "" : "s"} in the last 60 days`, action: "Review", go: () => setActiveTab("payments") }] : []),
    ...(unpaidExpenses.length ? [{ key: "unpaid", tone: C.amber, text: `${unpaidExpenses.length} unpaid expense${unpaidExpenses.length === 1 ? "" : "s"} (${fmtCents(unpaidExpenses.reduce((s,e)=>s+Math.round(parseFloat(e.amount||0)*100),0))})`, action: "Expenses", go: () => setActiveTab("expenses") }] : []),
  ];

  const TABS = ["payments","collections","receivables","recurring","expenses","owner"].filter(t => A3_ENABLED || !["collections","owner"].includes(t));
  const TAB_LABELS = { payments:"Payments", collections:"Collections", receivables:"Receivables", recurring:"Scheduled charges", expenses:"Expenses", owner:"Owner & Cash" };

  return (
    <LandlordLayout>
      <style>{`
        .f-tabs{display:flex;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid ${C.border};margin-bottom:20px;}
        .f-tabs::-webkit-scrollbar{display:none;}
        .f-pill{white-space:nowrap;flex-shrink:0;}
        @media (max-width:1024px){ .f-pill{min-height:44px;padding:0 14px!important;font-size:13px!important;} }
        .f-tile{background:${C.surface};border:1px solid ${C.border};border-radius:12px;padding:14px 16px;}
        /* Phones: wide tables become record cards (each cell shows its column label). */
        @media (max-width:720px){
          table.m-rtable, table.m-rtable tbody, table.m-rtable tr, table.m-rtable td{display:block;width:100%;}
          table.m-rtable thead{display:none;}
          table.m-rtable tr{border-bottom:1px solid ${C.border};padding:10px 4px;}
          table.m-rtable td{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:none!important;padding:5px 12px!important;text-align:right!important;}
          table.m-rtable td::before{content:attr(data-label);flex-shrink:0;text-align:left;font-size:12px;font-weight:600;color:${C.textSub};}
          table.m-rtable td[data-label=""]::before{content:none;}
          table.m-rtable td[data-label=""]{justify-content:flex-end;}
        }
      `}</style>

      <div className="m-page" style={{ color:C.text,fontFamily:"var(--m-font)" }}>
        <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:12 }}>
          <div>
            <h1 style={{ fontFamily:"var(--m-font)",fontSize:"clamp(22px, 4vw, 28px)",fontWeight:600,margin:0 }}>Financials</h1>
            <div style={{ fontSize:13,color:C.textSub,marginTop:3 }}>
              {loading?"Loading…":`${tenants.length} active tenant${tenants.length===1?"":"s"} · ${selectedName}`}
            </div>
          </div>
          <select value={tenantFilter} onChange={e=>setTenantFilter(e.target.value)} aria-label="Filter by tenant"
            style={{ minHeight:44,padding:"0 14px",border:`1px solid ${C.border}`,borderRadius:10,fontSize:14,background:C.surface,color:C.text,outline:"none",fontFamily:"var(--m-font)",cursor:"pointer",maxWidth:"100%",colorScheme:"dark" }}>
            <option value="all">All tenants{isAll ? "" : " at this property"}</option>
            {tenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {error && (
          <div role="alert" style={{ background:"rgba(240,112,112,0.1)",border:"1px solid rgba(240,112,112,0.35)",borderRadius:10,padding:"12px 16px",marginBottom:16,fontSize:13,color:C.red,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap" }}>
            Financials couldn't load: {error}
            <button type="button" onClick={fetchAll} className="m-btn m-btn-ghost m-btn-small" style={{ color:C.red,borderColor:"rgba(240,112,112,0.4)" }}>Retry</button>
          </div>
        )}

        <PaymentRouteWarning/>

        {/* Exceptions first, only when there are any */}
        {!loading && exceptions.length > 0 && (
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,marginBottom:16,overflow:"hidden" }}>
            {exceptions.map(x => (
              <div key={x.key} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"10px 16px",borderBottom:`1px solid ${C.border}`,flexWrap:"wrap" }}>
                <span style={{ display:"flex",alignItems:"center",gap:10,fontSize:14,color:C.text }}><span aria-hidden="true" style={{ width:8,height:8,borderRadius:"50%",background:x.tone }}/>{x.text}</span>
                <button type="button" className="m-btn m-btn-ghost m-btn-small" onClick={x.go}>{x.action}</button>
              </div>
            ))}
          </div>
        )}

        {/* Summary: recorded money, scheduled charges, and ledger balances (or a clear "not tracked") */}
        {!loading&&(
          <div className="m-grid" style={{ marginBottom:20 }}>
            <div className="f-tile">
              <div style={{ fontSize:12,fontWeight:600,color:C.textSub,}}>Collected · {now.toLocaleDateString("en-US",{ month:"long" })}</div>
              <div style={{ fontFamily:"var(--m-font)", fontVariantNumeric:"tabular-nums",fontSize:"var(--m-fs-stat)",fontWeight:600,color:C.text,marginTop:4 }}>{fmt(collectedThisMonth)}</div>
              <div style={{ fontSize:12,color:C.textSub }}>Recorded payments, net of refunds</div>
            </div>
            <div className="f-tile">
              <div style={{ fontSize:12,fontWeight:600,color:C.textSub,}}>Scheduled monthly charges</div>
              <div style={{ fontFamily:"var(--m-font)", fontVariantNumeric:"tabular-nums",fontSize:"var(--m-fs-stat)",fontWeight:600,color:C.text,marginTop:4 }}>{fmt(monthlyRecurring)}</div>
              <div style={{ fontSize:12,color:C.textSub }}>Recurring charges on file, not a balance</div>
            </div>
            <div className="f-tile">
              <div style={{ fontSize:12,fontWeight:600,color:C.textSub,}}>Balances due</div>
              <div style={{ fontFamily:"var(--m-font)", fontVariantNumeric:"tabular-nums",fontSize:"var(--m-fs-stat)",fontWeight:600,color:ledger&&owing.length?C.red:C.text,marginTop:4 }}>{ledger ? owing.length : "Not tracked"}</div>
              <div style={{ fontSize:12,color:C.textSub }}>{ledger ? "Tenants with a receivables-ledger balance" : "Receivables aren't active: unknown, not $0"}</div>
            </div>
          </div>
        )}

        <div className="f-tabs" role="tablist" aria-label="Financial views">
          {TABS.map(tab=>{
            const active = activeTab===tab;
            return (
              <button key={tab} type="button" role="tab" aria-selected={active} onClick={()=>setActiveTab(tab)}
                style={{ minHeight:44,padding:"0 18px",fontSize:14,fontWeight:active?600:500,color:active?C.gold:C.textSub,background:"transparent",border:"none",borderBottom:active?`2px solid ${C.gold}`:"2px solid transparent",cursor:"pointer",fontFamily:"var(--m-font)",whiteSpace:"nowrap",marginBottom:-1,flexShrink:0 }}>
                {TAB_LABELS[tab]}
              </button>
            );
          })}
        </div>

        {loading?(
          <div style={{ padding:40,textAlign:"center",color:C.textSub,fontSize:13 }}>Loading…</div>
        ):activeTab==="payments"?(
          <PaymentsTab payments={filteredPayments} refunds={refunds} tenantMap={tenantMap} tenants={tenants} onRefresh={fetchAll}/>
        ):activeTab==="collections"?(
          <Collections onRecordPayment={setRecordFor}/>
        ):activeTab==="owner"?(
          <OwnerCash properties={properties} tenants={tenants} units={units} onChanged={fetchAll}/>
        ):activeTab==="receivables"?(
          <Receivables tenants={tenants} onChanged={fetchAll}/>
        ):activeTab==="expenses"?(
          <ExpensesTab expenses={expenses} properties={properties} units={units} onRefresh={fetchAll}/>
        ):(
          <RecurringChargesTab charges={filteredCharges} tenantMap={tenantMap} onRefresh={fetchAll}/>
        )}
        {recordFor&&(
          <RecordPaymentModal tenants={tenants} initialTenant={recordFor} onClose={()=>setRecordFor(null)} onSaved={()=>{ setRecordFor(null); fetchAll(); }}/>
        )}
        {!isAll && <div style={{ fontSize:12,color:C.textMuted,marginTop:16 }}>Showing {selectedName} only. <button type="button" onClick={()=>navigate("/landlord/snapshot")} style={{ background:"none",border:"none",color:C.gold,cursor:"pointer",font:"inherit",textDecoration:"underline",padding:0 }}>Financial overview</button> has portfolio reports.</div>}
      </div>
    </LandlordLayout>
  );
}
