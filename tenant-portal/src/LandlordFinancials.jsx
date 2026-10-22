import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";

// ─── Design tokens (matches rest of app) ────────────────────────────────────
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

const TABS = ["Payment Requests", "Recurring", "Lease Terms"];

const PAYMENT_STATUSES = {
  Paid:     { color:"#72B02A", bg:"rgba(114,176,42,0.13)"  },
  Unpaid:   { color:"#E05555", bg:"rgba(224,85,85,0.13)"   },
  Overdue:  { color:"#E05555", bg:"rgba(224,85,85,0.18)"   },
  Partial:  { color:"#F0A430", bg:"rgba(240,164,48,0.13)"  },
  Pending:  { color:"#4A9AE8", bg:"rgba(74,154,232,0.13)"  },
};

const CATEGORIES = ["Rent","Late Fee","Utilities","Security Deposit","Pet Fee","Parking","Other"];

// ─── Small UI atoms ──────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = PAYMENT_STATUSES[status] || { color:C.textSub, bg:"transparent" };
  return (
    <span style={{ fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:5,background:cfg.bg,color:cfg.color,letterSpacing:"0.05em",whiteSpace:"nowrap" }}>
      {status?.toUpperCase()}
    </span>
  );
}

function PrimaryBtn({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background:"transparent",border:`1px solid ${C.goldDim}`,color:C.gold,fontSize:12,fontWeight:500,padding:"7px 14px",borderRadius:7,cursor:disabled?"default":"pointer",fontFamily:"'DM Sans',sans-serif",opacity:disabled?0.6:1,whiteSpace:"nowrap" }}
      onMouseOver={e=>!disabled&&(e.currentTarget.style.background="rgba(201,169,110,0.07)")}
      onMouseOut={e=>e.currentTarget.style.background="transparent"}
    >{children}</button>
  );
}

function GhostBtn({ children, onClick, disabled, danger }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background:"transparent",border:`1px solid ${danger?"rgba(224,85,85,0.35)":C.border}`,color:danger?C.red:C.textSub,fontSize:12,fontWeight:500,padding:"7px 14px",borderRadius:7,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",opacity:disabled?0.5:1,whiteSpace:"nowrap" }}
    >{children}</button>
  );
}

function Input({ label, value, onChange, type="text", placeholder, disabled }) {
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
      {label && <label style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.07em" }}>{label}</label>}
      <input
        type={type} value={value||""} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        style={{ background:C.raised,border:`1px solid ${C.border}`,borderRadius:7,color:C.text,fontSize:13,padding:"8px 11px",fontFamily:"'DM Sans',sans-serif",outline:"none",width:"100%",boxSizing:"border-box",opacity:disabled?0.6:1 }}
      />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
      {label && <label style={{ fontSize:11,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.07em" }}>{label}</label>}
      <select value={value||""} onChange={e=>onChange(e.target.value)}
        style={{ background:C.raised,border:`1px solid ${C.border}`,borderRadius:7,color:C.text,fontSize:13,padding:"8px 11px",fontFamily:"'DM Sans',sans-serif",outline:"none",width:"100%",boxSizing:"border-box" }}>
        {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
      </select>
    </div>
  );
}

const TH = ({ children, right }) => (
  <th style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",padding:"10px 14px",textAlign:right?"right":"left",borderBottom:`1px solid ${C.border}`,background:C.raised,whiteSpace:"nowrap" }}>{children}</th>
);
const TD = ({ children, right, bold, color, mono }) => (
  <td style={{ fontSize:13,color:color||(bold?C.text:C.textSub),fontWeight:bold?600:400,padding:"12px 14px",borderBottom:`1px solid ${C.border}`,textAlign:right?"right":"left",verticalAlign:"middle",fontFamily:mono?"'JetBrains Mono',monospace":undefined }}>{children}</td>
);

function fmt$(n) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US",{ minimumFractionDigits:2,maximumFractionDigits:2 });
  return n < 0 ? `-$${s}` : `$${s}`;
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US",{ month:"short",day:"numeric",year:"numeric" });
}

// ─── Request Money Modal ─────────────────────────────────────────────────────
function RequestMoneyModal({ tenants, onClose, onSave }) {
  const [form, setForm] = useState({ tenant_id:"", category:"Rent", amount:"", due_date:"", note:"" });
  const [saving, setSaving] = useState(false);
  const set = k => v => setForm(f=>({...f,[k]:v}));

  async function save() {
    if (!form.tenant_id || !form.amount || !form.due_date) return;
    setSaving(true);
    const amt = parseFloat(form.amount);
    const { error } = await supabase.from("payments").insert({
      tenant_id: form.tenant_id,
      category: form.category,
      amount: amt,
      amount_cents: Math.round(amt * 100),
      balance_due: amt,
      due_date: form.due_date,
      status: "Unpaid",
      is_recurring: false,
      created_at: new Date().toISOString(),
    });
    setSaving(false);
    if (!error) { onSave(); onClose(); }
    else alert("Error: " + error.message);
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,width:440,padding:"28px" }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.text,marginBottom:20 }}>Request Money</div>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          <Select label="Tenant" value={form.tenant_id} onChange={set("tenant_id")}
            options={[{value:"",label:"Select tenant…"},...tenants.map(t=>({value:t.id,label:t.full_name||t.name||"Unnamed"}))]} />
          <Select label="Category" value={form.category} onChange={set("category")} options={CATEGORIES} />
          <Input label="Amount ($)" type="number" value={form.amount} onChange={set("amount")} placeholder="0.00" />
          <Input label="Due Date" type="date" value={form.due_date} onChange={set("due_date")} />
          <Input label="Note (optional)" value={form.note} onChange={set("note")} placeholder="Optional description" />
        </div>
        <div style={{ display:"flex",gap:10,justifyContent:"flex-end",marginTop:22 }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={save} disabled={saving||!form.tenant_id||!form.amount||!form.due_date}>{saving?"Saving…":"Send Request"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Send Money Modal ────────────────────────────────────────────────────────
function SendMoneyModal({ tenants, onClose, onSave }) {
  const [form, setForm] = useState({ tenant_id:"", category:"Security Deposit", amount:"", note:"" });
  const [saving, setSaving] = useState(false);
  const set = k => v => setForm(f=>({...f,[k]:v}));

  async function save() {
    if (!form.tenant_id || !form.amount) return;
    setSaving(true);
    const amt = parseFloat(form.amount);
    const { error } = await supabase.from("payments").insert({
      tenant_id: form.tenant_id,
      category: form.category,
      amount: -amt,
      amount_cents: -Math.round(amt * 100),
      balance_due: 0,
      due_date: new Date().toISOString().split("T")[0],
      status: "Paid",
      is_recurring: false,
      created_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
    });
    setSaving(false);
    if (!error) { onSave(); onClose(); }
    else alert("Error: " + error.message);
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,width:440,padding:"28px" }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.text,marginBottom:20 }}>Send Money</div>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          <Select label="Tenant" value={form.tenant_id} onChange={set("tenant_id")}
            options={[{value:"",label:"Select tenant…"},...tenants.map(t=>({value:t.id,label:t.full_name||t.name||"Unnamed"}))]} />
          <Select label="Category" value={form.category} onChange={set("category")} options={["Security Deposit","Refund","Other"]} />
          <Input label="Amount ($)" type="number" value={form.amount} onChange={set("amount")} placeholder="0.00" />
          <Input label="Note (optional)" value={form.note} onChange={set("note")} placeholder="e.g. Security deposit refund" />
        </div>
        <div style={{ display:"flex",gap:10,justifyContent:"flex-end",marginTop:22 }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={save} disabled={saving||!form.tenant_id||!form.amount}>{saving?"Saving…":"Send Payment"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Offline Transaction Modal ───────────────────────────────────────────────
function OfflineModal({ tenants, onClose, onSave }) {
  const [form, setForm] = useState({ tenant_id:"", category:"Rent", amount:"", paid_at:"", method:"Check", note:"" });
  const [saving, setSaving] = useState(false);
  const set = k => v => setForm(f=>({...f,[k]:v}));

  async function save() {
    if (!form.tenant_id || !form.amount || !form.paid_at) return;
    setSaving(true);
    const amt = parseFloat(form.amount);
    const { error } = await supabase.from("payments").insert({
      tenant_id: form.tenant_id,
      category: form.category,
      amount: amt,
      amount_cents: Math.round(amt * 100),
      balance_due: 0,
      due_date: form.paid_at,
      status: "Paid",
      is_recurring: false,
      created_at: new Date().toISOString(),
      paid_at: new Date(form.paid_at).toISOString(),
    });
    setSaving(false);
    if (!error) { onSave(); onClose(); }
    else alert("Error: " + error.message);
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,width:440,padding:"28px" }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.text,marginBottom:20 }}>Track Offline Transaction</div>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          <Select label="Tenant" value={form.tenant_id} onChange={set("tenant_id")}
            options={[{value:"",label:"Select tenant…"},...tenants.map(t=>({value:t.id,label:t.full_name||t.name||"Unnamed"}))]} />
          <Select label="Category" value={form.category} onChange={set("category")} options={CATEGORIES} />
          <Input label="Amount ($)" type="number" value={form.amount} onChange={set("amount")} placeholder="0.00" />
          <Input label="Date Received" type="date" value={form.paid_at} onChange={set("paid_at")} />
          <Select label="Method" value={form.method} onChange={set("method")} options={["Check","Cash","Zelle","Venmo","Other"]} />
          <Input label="Note (optional)" value={form.note} onChange={set("note")} placeholder="Optional note" />
        </div>
        <div style={{ display:"flex",gap:10,justifyContent:"flex-end",marginTop:22 }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={save} disabled={saving||!form.tenant_id||!form.amount||!form.paid_at}>{saving?"Saving…":"Record Payment"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Payment Modal ──────────────────────────────────────────────────────
function EditPaymentModal({ payment, onClose, onSave }) {
  const [form, setForm] = useState({
    status: payment.status||"Unpaid",
    amount: payment.amount||"",
    balance_due: payment.balance_due||"",
    due_date: payment.due_date||"",
  });
  const [saving, setSaving] = useState(false);
  const set = k => v => setForm(f=>({...f,[k]:v}));

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("payments").update({
      status: form.status,
      amount: parseFloat(form.amount),
      amount_cents: Math.round(parseFloat(form.amount)*100),
      balance_due: parseFloat(form.balance_due),
      due_date: form.due_date,
      paid_at: form.status === "Paid" ? new Date().toISOString() : null,
    }).eq("id", payment.id);
    setSaving(false);
    if (!error) { onSave(); onClose(); }
    else alert("Error: " + error.message);
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,width:400,padding:"28px" }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.text,marginBottom:20 }}>Edit Payment</div>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          <Select label="Status" value={form.status} onChange={set("status")} options={["Unpaid","Pending","Paid","Partial","Overdue"]} />
          <Input label="Amount ($)" type="number" value={form.amount} onChange={set("amount")} />
          <Input label="Balance Due ($)" type="number" value={form.balance_due} onChange={set("balance_due")} />
          <Input label="Due Date" type="date" value={form.due_date} onChange={set("due_date")} />
        </div>
        <div style={{ display:"flex",gap:10,justifyContent:"flex-end",marginTop:22 }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={save} disabled={saving}>{saving?"Saving…":"Save Changes"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Payment Requests Tab ────────────────────────────────────────────────────
function PaymentRequestsTab({ tenantId, tenantMap, onRefresh }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState(null);
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterCategory, setFilterCategory] = useState("All");

  async function load() {
    setLoading(true);
    let q = supabase.from("payments").select("*").order("due_date", { ascending: false });
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data } = await q;
    setPayments(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [tenantId]);

  async function cancel(id) {
    if (!window.confirm("Cancel this payment request?")) return;
    await supabase.from("payments").delete().eq("id", id);
    load();
  }

  async function markPaid(row) {
    await supabase.from("payments").update({ status:"Paid", balance_due:0, paid_at:new Date().toISOString() }).eq("id", row.id);
    load();
  }

  const filtered = payments.filter(p => {
    if (filterStatus !== "All" && p.status !== filterStatus) return false;
    if (filterCategory !== "All" && p.category !== filterCategory) return false;
    return true;
  });

  const totalBalance = filtered.filter(p=>p.status!=="Paid").reduce((s,p)=>s+(p.balance_due||0),0);

  return (
    <div>
      {/* Filters */}
      <div style={{ display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center" }}>
        <div style={{ display:"flex",gap:6 }}>
          {["All","Unpaid","Overdue","Partial","Pending","Paid"].map(s=>(
            <button key={s} onClick={()=>setFilterStatus(s)}
              style={{ fontSize:11,fontWeight:600,padding:"5px 10px",borderRadius:5,cursor:"pointer",border:`1px solid ${filterStatus===s?C.gold:C.border}`,background:filterStatus===s?"rgba(201,169,110,0.1)":"transparent",color:filterStatus===s?C.gold:C.textSub,transition:"all 0.15s" }}>
              {s}
            </button>
          ))}
        </div>
        <select value={filterCategory} onChange={e=>setFilterCategory(e.target.value)}
          style={{ background:C.raised,border:`1px solid ${C.border}`,borderRadius:7,color:C.textSub,fontSize:12,padding:"5px 10px",fontFamily:"'DM Sans',sans-serif",outline:"none" }}>
          <option value="All">All categories</option>
          {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        {totalBalance > 0 && (
          <div style={{ marginLeft:"auto",fontSize:13,color:C.red,fontWeight:600 }}>
            Outstanding: {fmt$(totalBalance)}
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ color:C.textMuted,fontSize:13,padding:"40px 0",textAlign:"center" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color:C.textMuted,fontSize:13,padding:"40px 0",textAlign:"center" }}>No payment requests found.</div>
      ) : (
        <div style={{ overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}` }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead>
              <tr>
                {!tenantId && <TH>Tenant</TH>}
                <TH>Category</TH>
                <TH>Due Date</TH>
                <TH>Status</TH>
                <TH right>Amount</TH>
                <TH right>Balance Due</TH>
                <TH>Actions</TH>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p=>(
                <tr key={p.id} style={{ background:p.status==="Overdue"?"rgba(224,85,85,0.03)":"transparent" }}>
                  {!tenantId && <TD bold>{tenantMap[p.tenant_id]||"—"}</TD>}
                  <TD bold>{p.category||"—"}</TD>
                  <TD>{fmtDate(p.due_date)}</TD>
                  <TD><StatusBadge status={p.status} /></TD>
                  <TD right mono bold>{fmt$(p.amount)}</TD>
                  <TD right mono color={p.balance_due>0?C.red:C.green}>{fmt$(p.balance_due)}</TD>
                  <TD>
                    <div style={{ display:"flex",gap:6 }}>
                      {p.status !== "Paid" && (
                        <button onClick={()=>markPaid(p)}
                          style={{ fontSize:10,padding:"3px 8px",borderRadius:4,border:`1px solid rgba(114,176,42,0.4)`,background:"rgba(114,176,42,0.08)",color:C.green,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                          Mark Paid
                        </button>
                      )}
                      <button onClick={()=>setEditTarget(p)}
                        style={{ fontSize:10,padding:"3px 8px",borderRadius:4,border:`1px solid ${C.border}`,background:"transparent",color:C.textSub,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                        Edit
                      </button>
                      <button onClick={()=>cancel(p.id)}
                        style={{ fontSize:10,padding:"3px 8px",borderRadius:4,border:"1px solid rgba(224,85,85,0.3)",background:"transparent",color:C.red,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                        Cancel
                      </button>
                    </div>
                  </TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editTarget && (
        <EditPaymentModal payment={editTarget} onClose={()=>setEditTarget(null)} onSave={load} />
      )}
    </div>
  );
}

// ─── Recurring Requests Tab ──────────────────────────────────────────────────
function RecurringTab({ tenantId, tenantMap }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    async function load() {
      setLoading(true);
      let q = supabase.from("payments").select("*").eq("is_recurring", true).order("due_date",{ascending:false});
      if (tenantId) q = q.eq("tenant_id", tenantId);
      const { data } = await q;
      setRows(data||[]);
      setLoading(false);
    }
    load();
  },[tenantId]);

  return (
    <div>
      <div style={{ fontSize:12,color:C.textMuted,marginBottom:16 }}>
        Recurring charges are generated automatically each month. Edit the schedule in your lease settings.
      </div>
      {loading ? (
        <div style={{ color:C.textMuted,fontSize:13,padding:"40px 0",textAlign:"center" }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ color:C.textMuted,fontSize:13,padding:"40px 0",textAlign:"center" }}>No recurring charges set up yet.</div>
      ) : (
        <div style={{ overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}` }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead>
              <tr>
                {!tenantId && <TH>Tenant</TH>}
                <TH>Category</TH>
                <TH>Due Date</TH>
                <TH>Status</TH>
                <TH right>Amount</TH>
                <TH right>Balance Due</TH>
              </tr>
            </thead>
            <tbody>
              {rows.map(p=>(
                <tr key={p.id}>
                  {!tenantId && <TD bold>{tenantMap[p.tenant_id]||"—"}</TD>}
                  <TD bold>{p.category||"—"}</TD>
                  <TD>{fmtDate(p.due_date)}</TD>
                  <TD><StatusBadge status={p.status} /></TD>
                  <TD right mono bold>{fmt$(p.amount)}</TD>
                  <TD right mono color={p.balance_due>0?C.red:C.green}>{fmt$(p.balance_due)}</TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Lease Terms Tab ─────────────────────────────────────────────────────────
function LeaseTermsTab({ tenantId }) {
  const [lease, setLease] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    if (!tenantId) { setLoading(false); return; }
    async function load() {
      const [{ data: t }, { data: l }] = await Promise.all([
        supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
        supabase.from("leases").select("*").eq("tenant_id", tenantId).order("created_at",{ascending:false}).limit(1).maybeSingle(),
      ]);
      setTenant(t);
      setLease(l);
      setLoading(false);
    }
    load();
  },[tenantId]);

  if (!tenantId) return (
    <div style={{ color:C.textMuted,fontSize:13,padding:"40px 0",textAlign:"center" }}>
      Select a tenant to view lease terms.
    </div>
  );

  if (loading) return <div style={{ color:C.textMuted,fontSize:13,padding:"40px 0",textAlign:"center" }}>Loading…</div>;

  function row(label, value, last, color) {
    return (
      <div key={label} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:last?"none":`1px solid ${C.border}` }}>
        <span style={{ fontSize:13,color:C.textSub }}>{label}</span>
        <span style={{ fontSize:13,fontWeight:500,color:color||C.text }}>{value||"—"}</span>
      </div>
    );
  }

  function card(title, children, borderColor) {
    return (
      <div style={{ background:C.surface,border:`1px solid ${borderColor||C.border}`,borderRadius:10,overflow:"hidden",marginBottom:16 }}>
        <div style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",padding:"12px 16px",borderBottom:`1px solid ${C.border}` }}>{title}</div>
        <div style={{ padding:"4px 16px 8px" }}>{children}</div>
      </div>
    );
  }

  return (
    <div>
      {/* Disclaimer */}
      <div style={{ background:"rgba(201,169,110,0.07)",border:`1px solid rgba(201,169,110,0.2)`,borderRadius:8,padding:"10px 14px",marginBottom:20,fontSize:12,color:C.amber,lineHeight:1.5 }}>
        ⚠️ Adding or editing lease information here does not create or update payment requests. Visit the <strong>Payment Requests</strong> tab to create or update payments.
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
        <div>
          {card("Lease Details", <>
            {row("Lease Start", fmtDate(lease?.start_date))}
            {row("Lease End", fmtDate(lease?.end_date))}
            {row("Term Type", lease?.term_type || "Fixed")}
            {row("Move-out Date", fmtDate(lease?.move_out_date), true)}
          </>)}

          {card("Financials", <>
            {row("Monthly Rent", fmt$(lease?.rent_amount || tenant?.rent_amount))}
            {row("Security Deposit", fmt$(lease?.security_deposit))}
            {row("Rent Due Date", "1st of each month")}
            {row("Grace Period", "Through 5th (11:59 PM)", true)}
          </>)}
        </div>
        <div>
          {card("Late Fee Settings", <>
            {row("Late Fee Charged", "6th of each month")}
            {row("Frequency", "One-time")}
            {row("Amount", "$50.00", true, C.amber)}
          </>, "rgba(240,164,48,0.3)")}

          {card("Tenant Info", <>
            {row("Name", tenant?.full_name||tenant?.name)}
            {row("Email", tenant?.email)}
            {row("Phone", tenant?.phone)}
            {row("Bank Connected", tenant?.bank_connected ? "✓ Yes" : "No")}
            {row("Autopay", tenant?.autopay_enabled ? "On" : "Off", true)}
          </>)}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function LandlordFinancials() {
  const { tenantId } = useParams(); // optional — /financials or /financials/:tenantId
  const navigate = useNavigate();

  const [tab, setTab] = useState(0);
  const [tenants, setTenants] = useState([]);
  const [tenantMap, setTenantMap] = useState({});
  const [selectedTenant, setSelectedTenant] = useState(tenantId || "");
  const [modal, setModal] = useState(null); // "request"|"send"|"offline"
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(()=>{
    async function load() {
      const { data } = await supabase.from("tenants").select("id,full_name,name,email").eq("is_active",true).order("full_name");
      const list = data||[];
      setTenants(list);
      const map = {};
      list.forEach(t=>{ map[t.id]=t.full_name||t.name||"Unnamed"; });
      setTenantMap(map);
    }
    load();
  },[]);

  const refresh = () => setRefreshKey(k=>k+1);
  const filteredTenantId = selectedTenant || null;

  return (
    <LandlordLayout>
      <div style={{ maxWidth:1100,margin:"0 auto",padding:"32px 24px",fontFamily:"'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28,flexWrap:"wrap",gap:12 }}>
          <div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:600,color:C.text,letterSpacing:"-0.01em" }}>
              Financials
            </div>
            <div style={{ fontSize:13,color:C.textSub,marginTop:3 }}>
              Payment requests, recurring charges, and lease terms
            </div>
          </div>
          <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
            <GhostBtn onClick={()=>setModal("offline")}>📋 Track Offline</GhostBtn>
            <GhostBtn onClick={()=>setModal("send")}>💸 Send Money</GhostBtn>
            <PrimaryBtn onClick={()=>setModal("request")}>＋ Request Money</PrimaryBtn>
          </div>
        </div>

        {/* Tenant filter */}
        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:20 }}>
          <span style={{ fontSize:12,color:C.textSub,whiteSpace:"nowrap" }}>Filter by tenant:</span>
          <select value={selectedTenant} onChange={e=>setSelectedTenant(e.target.value)}
            style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,color:C.text,fontSize:13,padding:"7px 11px",fontFamily:"'DM Sans',sans-serif",outline:"none",minWidth:200 }}>
            <option value="">All tenants</option>
            {tenants.map(t=><option key={t.id} value={t.id}>{t.full_name||t.name||"Unnamed"}</option>)}
          </select>
          {selectedTenant && (
            <button onClick={()=>setSelectedTenant("")}
              style={{ fontSize:11,color:C.textMuted,background:"transparent",border:"none",cursor:"pointer",padding:0 }}>✕ Clear</button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display:"flex",gap:2,marginBottom:24,borderBottom:`1px solid ${C.border}` }}>
          {TABS.map((t,i)=>(
            <button key={t} onClick={()=>setTab(i)}
              style={{ fontSize:13,fontWeight:500,padding:"10px 16px",background:"transparent",border:"none",borderBottom:`2px solid ${tab===i?C.gold:"transparent"}`,color:tab===i?C.gold:C.textSub,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s",marginBottom:-1 }}>
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 0 && <PaymentRequestsTab key={refreshKey} tenantId={filteredTenantId} tenantMap={tenantMap} onRefresh={refresh} />}
        {tab === 1 && <RecurringTab key={refreshKey} tenantId={filteredTenantId} tenantMap={tenantMap} />}
        {tab === 2 && <LeaseTermsTab tenantId={filteredTenantId} />}

        {/* Modals */}
        {modal==="request" && <RequestMoneyModal tenants={tenants} onClose={()=>setModal(null)} onSave={refresh} />}
        {modal==="send"    && <SendMoneyModal    tenants={tenants} onClose={()=>setModal(null)} onSave={refresh} />}
        {modal==="offline" && <OfflineModal      tenants={tenants} onClose={()=>setModal(null)} onSave={refresh} />}
      </div>
    </LandlordLayout>
  );
}