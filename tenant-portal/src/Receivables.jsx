import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { A3_ENABLED } from "./lib/release";
import { supabase } from "./supabase";
import {
  CHARGE_CATEGORIES, FEE_FLAG_TEXT, TRANSFER_STATUS_TEXT, REFUND_STATUS_TEXT, REFUND_STATUS_OK, RECOVERY_STATUS_TEXT, RECOVERY_DONE, RETURN_KIND_TEXT, COLLECTION_STATE_TEXT, FEE_COLLECTION_TEXT, MODUS_FLAG_TEXT, periodRange, balanceTotals, fmtCents, todayNY, parseSignedDollarsToCents,
} from "./lib/accounting";

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

const field = { padding:"8px 10px",fontSize:12,border:`1px solid ${C.border}`,borderRadius:6,background:C.raised,color:C.text,outline:"none",fontFamily:"'DM Sans',sans-serif",colorScheme:"dark" };

function Btn({ children, onClick, disabled, gold }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background:"transparent",border:`1px solid ${gold?C.goldDim:C.border}`,color:gold?C.gold:C.textSub,fontSize:12,fontWeight:500,padding:"7px 14px",borderRadius:7,cursor:disabled?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",opacity:disabled?0.5:1,whiteSpace:"nowrap" }}>
      {children}
    </button>
  );
}

function Card({ title, sub, children, right }) {
  return (
    <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,marginBottom:16,overflow:"hidden" }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"14px 18px",borderBottom:`1px solid ${C.border}`,flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:14,fontWeight:600,color:C.text }}>{title}</div>
          {sub&&<div style={{ fontSize:12,color:C.textSub,marginTop:3 }}>{sub}</div>}
        </div>
        {right}
      </div>
      <div style={{ padding:"14px 18px" }}>{children}</div>
    </div>
  );
}

function TH({ children, right }) {
  return <th style={{ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",padding:"9px 12px",textAlign:right?"right":"left",borderBottom:`1px solid ${C.border}`,background:C.raised,whiteSpace:"nowrap" }}>{children}</th>;
}
function TD({ children, right, bold, color }) {
  return <td style={{ fontSize:13,color:color||(bold?C.text:C.textSub),fontWeight:bold?600:400,padding:"9px 12px",borderBottom:`1px solid ${C.border}`,textAlign:right?"right":"left",fontVariantNumeric:"tabular-nums" }}>{children}</td>;
}

const Msg = ({ msg }) => msg ? <div style={{ fontSize:12,color:msg.ok?C.green:C.red,marginTop:10 }}>{msg.text}</div> : null;
const fmtDay = (d) => d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US",{ month:"short",day:"numeric",year:"numeric" }) : "—";

// A3's checks only run once A3 is released; until then each is empty and its section stays hidden.
const a3Rpc = (fn, args) => A3_ENABLED ? supabase.rpc(fn, args) : Promise.resolve({ data: [] });

export default function Receivables({ tenants, onChanged }) {
  const navigate = useNavigate();
  const today = todayNY();
  const [rev, setRev]         = useState(0);
  const [status, setStatus]   = useState(null);
  const [balances, setBalances] = useState([]);
  const [tie, setTie]         = useState([]);
  const [cutover, setCutover] = useState("");
  const [msg, setMsg]         = useState(null);
  const [results, setResults] = useState(null);   // { title, rows }
  const [busy, setBusy]       = useState(false);
  const [ob, setOb]           = useState({ tenant_id:"", category:"Rent", amount:"", credit:false, due:"", memo:"" });
  const [obMsg, setObMsg]     = useState(null);
  const [opening, setOpening] = useState([]);
  const [entries, setEntries] = useState([]);
  const [legacy, setLegacy]   = useState([]);
  const [unlinked, setUnlinked] = useState([]);
  const [fees, setFees]       = useState([]);
  const [categories, setCategories] = useState([]);
  const [stripeRefunds, setStripeRefunds] = useState([]);
  const [appCheck, setAppCheck] = useState([]);
  const [refundRecon, setRefundRecon] = useState([]);
  const [refundDue, setRefundDue] = useState([]);
  const [platform, setPlatform] = useState([]);
  const [recovery, setRecovery] = useState([]);
  const [recoveryTie, setRecoveryTie] = useState([]);
  const [repay, setRepay] = useState(null);   // the direct repayment being entered
  const [repayMsg, setRepayMsg] = useState(null);
  const [feePayable, setFeePayable] = useState([]);
  const [modusRange, setModusRange] = useState(periodRange("ytd", todayNY()));
  const [modusIncome, setModusIncome] = useState([]);
  const [lateLog, setLateLog] = useState([]);
  const [exemptions, setExemptions] = useState([]);
  const [ex, setEx]           = useState({ tenant_id:"", from:"", through:"", reason:"" });
  const [exMsg, setExMsg]     = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data: s } = await supabase.rpc("a2_status");
      if (!live) return;
      setStatus(s || { active:false, missing:true });
      if (s?.active) {
        const [{ data: a }, { data: t }, { data: op }, { data: en }, { data: lg }, { data: un }, { data: fe }, { data: ca }, { data: ll }, { data: xs }, { data: sr }, { data: ac }, { data: rr }, { data: rd }, { data: pl }, { data: rc }, { data: fp }, { data: rt }] = await Promise.all([
          supabase.rpc("a2_tenant_balances", { p_as_of: todayNY(), p_scope: "portfolio", p_scope_id: null }),
          supabase.rpc("a2_tie_out"),
          supabase.rpc("a2_opening_status"),
          supabase.rpc("a2_opening_entries"),
          supabase.rpc("a2_legacy_charge_rows"),
          supabase.rpc("a2_unlinked_receipts"),
          supabase.rpc("a2_stripe_fees"),
          supabase.rpc("a2_category_reconciliation", { p_tenant: null, p_as_of: todayNY() }),
          supabase.rpc("a2_late_fee_log", { p_limit: 25 }),
          supabase.from("a2_late_fee_exemptions").select("*").order("authorized_at", { ascending:false }),
          supabase.rpc("a2_stripe_refunds"),
          a3Rpc("a3_application_check"),
          a3Rpc("a3_refund_reconciliation"),
          a3Rpc("a3_refund_due_check", { p_as_of: todayNY() }),
          a3Rpc("a3_platform_economics"),
          a3Rpc("a3_return_recovery"),
          a3Rpc("a3_fee_payable_check", { p_as_of: todayNY() }),
          a3Rpc("a3_recovery_tie"),
        ]);
        if (live) {
          setBalances(a || []); setTie(t || []); setOpening(op || []); setEntries(en || []);
          setLegacy(lg || []); setUnlinked(un || []); setFees(fe || []); setCategories(ca || []); setLateLog(ll || []); setExemptions(xs || []); setStripeRefunds(sr || []);
          setAppCheck(ac || []); setRefundRecon(rr || []); setRefundDue(rd || []); setPlatform(pl || []); setRecovery(rc || []); setFeePayable(fp || []); setRecoveryTie(rt || []);
        }
      }
    })();
    return () => { live = false; };
  }, [rev]);

  useEffect(() => {
    if (!A3_ENABLED || !status?.active || !modusRange.from || !modusRange.to) return;
    let live = true;
    supabase.rpc("a3_modus_income", { p_from: modusRange.from, p_to: modusRange.to }).then(({ data }) => { if (live) setModusIncome(data || []); });
    return () => { live = false; };
  }, [status?.active, modusRange.from, modusRange.to, rev]);

  async function activate() {
    if (!cutover) { setMsg({ ok:false, text:"Choose the cutover date." }); return; }
    if (!window.confirm(`Start tenant receivables on ${fmtDay(cutover)}?\n\nRent is charged from the first 1st on or after this date; payments received on or after it are applied. Enter each tenant's balance at that date as an opening balance. The date can be changed until the first charge exists.`)) return;
    const { error } = await supabase.rpc("a2_set_cutover", { p_date: cutover });
    setMsg(error ? { ok:false, text:error.message } : { ok:true, text:"Receivables activated." });
    if (!error) setRev(n=>n+1);
  }

  async function runAction(fn, title) {
    setBusy(true); setResults(null);
    // Late fees always use today's New York date on the server; the caller can't choose it.
    const { data, error } = fn === "a2_assess_late_fees" ? await supabase.rpc(fn) : await supabase.rpc(fn, { p_as_of: today });
    setBusy(false);
    if (error) { setResults({ title, error: error.message, rows: [] }); return; }
    setResults({ title, rows: data || [] });
    setRev(n=>n+1);
  }

  async function addOpening() {
    const cents = parseSignedDollarsToCents(ob.amount);
    if (!ob.tenant_id) { setObMsg({ ok:false, text:"Select a tenant." }); return; }
    if (cents == null || cents <= 0) { setObMsg({ ok:false, text:"Enter an amount greater than $0." }); return; }
    if (!ob.due) { setObMsg({ ok:false, text:"Enter the date it was due." }); return; }
    if (!ob.memo.trim()) { setObMsg({ ok:false, text:"Add a note describing the balance." }); return; }
    const { error } = await supabase.rpc("a2_add_charge", {
      p_tenant: ob.tenant_id, p_category: ob.category, p_amount_cents: ob.credit ? -cents : cents,
      p_due_date: ob.due, p_memo: ob.memo.trim(), p_opening: true,
    });
    setObMsg(error ? { ok:false, text:error.message } : { ok:true, text:`Opening ${ob.credit?"credit":"balance"} recorded for ${tenants.find(t=>t.id===ob.tenant_id)?.name}.` });
    if (!error) { setOb(o=>({ ...o, amount:"", memo:"" })); setRev(n=>n+1); onChanged?.(); }
  }

  async function recordRepayment(r) {
    const cents = parseSignedDollarsToCents(repay.amount);
    if (cents == null || cents <= 0) { setRepayMsg({ ok:false, text:"Enter an amount greater than $0." }); return; }
    if (!repay.date) { setRepayMsg({ ok:false, text:"Enter the date of the repayment." }); return; }
    if (!repay.memo.trim()) { setRepayMsg({ ok:false, text:"Add a note." }); return; }
    const { error } = await supabase.rpc("a3_record_owner_repayment", { p_return: r.return_id, p_date: repay.date, p_amount_cents: cents, p_memo: repay.memo.trim(), p_cash_account: repay.account });
    setRepayMsg(error ? { ok:false, text:error.message } : { ok:true, text:`Repayment of ${fmtCents(cents)} recorded for ${r.tenant_name||"this payment"}.` });
    if (!error) { setRepay(null); setRev(n=>n+1); }
  }

  async function grantExemption() {
    if (!ex.tenant_id) { setExMsg({ ok:false, text:"Select a tenant." }); return; }
    if (!ex.from) { setExMsg({ ok:false, text:"Enter the first rent due date this covers." }); return; }
    if (!ex.reason.trim()) { setExMsg({ ok:false, text:"Enter who authorized this and why." }); return; }
    const { error } = await supabase.rpc("a2_grant_late_fee_exemption", { p_tenant: ex.tenant_id, p_due_from: ex.from, p_due_through: ex.through || null, p_reason: ex.reason.trim() });
    setExMsg(error ? { ok:false, text:error.message } : { ok:true, text:"Exemption recorded." });
    if (!error) { setEx({ tenant_id:"", from:"", through:"", reason:"" }); setRev(n=>n+1); }
  }

  async function revokeExemption(x) {
    const reason = window.prompt("Reason for revoking this exemption?");
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc("a2_revoke_late_fee_exemption", { p_id: x.id, p_reason: reason.trim() });
    setExMsg(error ? { ok:false, text:error.message } : { ok:true, text:"Exemption revoked. It stays on record." });
    if (!error) setRev(n=>n+1);
  }

  async function confirmZero(t) {
    if (!window.confirm(`Confirm ${t.tenant_name} owed nothing at the cutover?`)) return;
    const { error } = await supabase.rpc("a2_confirm_zero_opening", { p_tenant: t.tenant_id });
    setObMsg(error ? { ok:false, text:error.message } : { ok:true, text:`${t.tenant_name} confirmed at $0.00.` });
    if (!error) setRev(n=>n+1);
  }

  async function voidEntry(e) {
    const reason = window.prompt(`Reason for voiding this opening balance (${e.tenant_name}, ${fmtCents(e.amount_cents)})?`);
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc("a2_void_charge", { p_charge: e.charge_id, p_reason: reason.trim() });
    setObMsg(error ? { ok:false, text:error.message } : { ok:true, text:"Opening balance voided. It stays on record." });
    if (!error) setRev(n=>n+1);
  }

  if (!status) return <div style={{ padding:40,textAlign:"center",color:C.textSub,fontSize:13 }}>Loading…</div>;
  if (status.missing) return <div style={{ padding:40,textAlign:"center",color:C.textSub,fontSize:13 }}>Receivables are not installed in this environment yet.</div>;

  if (!status.active) {
    return (
      <Card title="Activate tenant receivables" sub="Rent charges and tenant balances start from one cutover date for all tenants.">
        <ul style={{ fontSize:12,color:C.textSub,lineHeight:1.8,margin:"0 0 14px 18px" }}>
          <li>Rent is charged automatically from recurring charges, due on the 1st, starting with the first 1st on or after the cutover.</li>
          <li>Payments received on or after the cutover are applied to charges of the same category, oldest first.</li>
          <li>Each tenant's balance at the cutover is entered explicitly as an opening balance. Nothing is inferred from history.</li>
          <li>The Income Statement stays cash basis. Charges never become income; only money received does.</li>
        </ul>
        <div style={{ display:"flex",gap:10,alignItems:"center",flexWrap:"wrap" }}>
          <input type="date" aria-label="Cutover date" value={cutover} onChange={e=>setCutover(e.target.value)} style={field}/>
          <Btn gold onClick={activate}>Set cutover date</Btn>
        </div>
        <Msg msg={msg}/>
      </Card>
    );
  }

  const day = Number(today.slice(8, 10));
  const totals = balanceTotals(balances);
  const tieOk = unlinked.length === 0 && categories.every(c => c.in_balance) && tie.every(t => Number(t.ledger_cents) === Number(t.journal_cents) && t.charges_in_journal === 0);
  const openingMissing = opening.filter(o => !o.is_explicit);
  const feeFlagged = fees.filter(f => f.flags?.length);
  const refundsToReview = refundRecon.filter(r => !REFUND_STATUS_OK.has(r.status));
  const dueOk = refundDue.every(d => d.in_balance) && recoveryTie.every(d => d.in_balance);
  const feeOk = feePayable.every(d => d.in_balance);
  const recoveryOpen = recovery.filter(r => !RECOVERY_DONE.has(r.recovery_status));
  const failedBefore = platform.filter(p => p.state === "failed_before_settlement");
  const platformShown = platform.filter(p => p.state !== "failed_before_settlement");
  const tenantName = (id) => tenants.find(t => t.id === id)?.name || "—";

  return (
    <div>
      <Card title={`Receivables active since ${fmtDay(status.cutover_date)}`}
        sub={`${status.charges ?? 0} tenant charges · balances as of ${fmtDay(today)}`}
        right={<div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
          <Btn gold disabled={busy} onClick={()=>runAction("a2_generate_charges", "Rent charges")}>Generate rent charges</Btn>
          <Btn disabled={busy||day<6} onClick={()=>runAction("a2_assess_late_fees", "Late fees")}>Assess late fees</Btn>
        </div>}>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10 }}>
          {[["Balance due", totals.balance_cents, totals.balance_cents>0?C.red:C.green],
            ["Open charges", totals.open_cents, C.text], ["Tenant credits", totals.credit_cents, C.blue]].map(([l,v,c])=>(
            <div key={l} style={{ background:C.raised,borderRadius:8,padding:"12px 14px" }}>
              <div style={{ fontSize:10,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6 }}>{l}</div>
              <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:c }}>{fmtCents(v)}</div>
            </div>
          ))}
        </div>
        {day<6&&<div style={{ fontSize:11,color:C.textMuted,marginTop:10 }}>Late fees are assessed on or after the 6th of the month, New York time: $50 per eligible rent charge.</div>}
        {results&&(
          <div style={{ marginTop:14 }}>
            <div style={{ fontSize:12,fontWeight:600,color:C.text,marginBottom:6 }}>{results.title}: {results.error ? <span style={{ color:C.red }}>{results.error}</span>
              : `${results.rows.filter(r=>/created|charged/.test(r.outcome)).length} created`}</div>
            {results.rows.filter(r=>!/^exists$|already/.test(r.outcome)).length>0&&(
              <table style={{ width:"100%",borderCollapse:"collapse" }}>
                <thead><tr><TH>Tenant</TH><TH>Period or rent due</TH><TH>Outcome</TH></tr></thead>
                <tbody>{results.rows.filter(r=>!/^exists$|already/.test(r.outcome)).map((r,i)=>(
                  <tr key={i}><TD bold>{r.tenant_name || tenants.find(t=>t.id===r.tenant_id)?.name || "—"}</TD><TD>{r.period||fmtDay(r.rent_due_date)}</TD>
                    <TD color={/skipped|deferred|exempt|not eligible/.test(r.outcome)?C.amber:/created|charged/.test(r.outcome)?C.green:C.textSub}>{r.outcome}</TD></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </Card>

      <Card title="Tenant balances" sub="Balance is open charges less credits. A credit stays in its own category. Click a tenant for their ledger.">
        {balances.length===0 ? <div style={{ fontSize:13,color:C.textSub }}>No open balances or credits.</div> : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead><tr><TH>Tenant</TH><TH>Property</TH><TH right>Open</TH><TH right>Credit</TH><TH right>Balance</TH></tr></thead>
              <tbody>
                {balances.map(r=>(
                  <tr key={r.tenant_id} style={{ cursor:"pointer" }} onClick={()=>navigate(`/landlord/tenants/${r.tenant_id}`)}>
                    <TD bold>{r.tenant_name}</TD><TD>{r.property_name||"—"}</TD>
                    <TD right>{fmtCents(r.open_cents)}</TD>
                    <TD right color={C.blue}>{Number(r.credit_cents)?fmtCents(r.credit_cents):"—"}</TD>
                    <TD right bold color={Number(r.balance_cents)>0?C.red:C.green}>{fmtCents(r.balance_cents)}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Opening balances" sub={`Each tenant's balance at the cutover (${fmtDay(status.cutover_date)}), entered explicitly by category. Recorded with who entered it and when.`}>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,alignItems:"center" }}>
          <select aria-label="Tenant" value={ob.tenant_id} onChange={e=>setOb(o=>({...o,tenant_id:e.target.value}))} style={field}>
            <option value="">Tenant…</option>{tenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select aria-label="Category" value={ob.category} onChange={e=>setOb(o=>({...o,category:e.target.value}))} style={field}>
            {CHARGE_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.value}</option>)}
          </select>
          <input aria-label="Amount" placeholder="$0.00" value={ob.amount} onChange={e=>setOb(o=>({...o,amount:e.target.value}))} style={field}/>
          <input aria-label="Due date" type="date" max={status.cutover_date} title="Date it was due (on or before the cutover)" value={ob.due} onChange={e=>setOb(o=>({...o,due:e.target.value}))} style={field}/>
          <input aria-label="Note" placeholder="Note, e.g. October rent unpaid at cutover" value={ob.memo} onChange={e=>setOb(o=>({...o,memo:e.target.value}))} style={field}/>
          <Btn gold onClick={addOpening}>Add</Btn>
        </div>
        <label style={{ display:"flex",alignItems:"center",gap:6,fontSize:12,color:C.textSub,marginTop:8,cursor:"pointer" }}>
          <input type="checkbox" checked={ob.credit} onChange={e=>setOb(o=>({...o,credit:e.target.checked}))} style={{ accentColor:C.gold }}/>
          This is a credit (tenant prepaid before the cutover)
        </label>
        <Msg msg={obMsg}/>

        <div style={{ fontSize:12,fontWeight:600,color:openingMissing.length?C.amber:C.green,margin:"16px 0 8px" }}>
          {openingMissing.length ? `${openingMissing.length} of ${opening.length} tenants still need an opening balance or a $0 confirmation` : `All ${opening.length} tenants have an explicit opening position`}
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead><tr><TH>Tenant</TH><TH>Property</TH><TH right>Opening balance</TH><TH>Status</TH><TH></TH></tr></thead>
            <tbody>{opening.map(o=>(
              <tr key={o.tenant_id}>
                <TD bold>{o.tenant_name}</TD><TD>{o.property_name||"—"}</TD><TD right>{fmtCents(o.opening_cents)}</TD>
                <TD color={o.is_explicit?C.green:C.amber}>{o.confirmed_zero?`Confirmed $0 on ${fmtDay(String(o.confirmed_at).slice(0,10))}`:o.entries>0?`${o.entries} entered`:"Not entered"}</TD>
                <TD>{!o.is_explicit&&<Btn onClick={()=>confirmZero(o)}>Confirm $0</Btn>}</TD>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {entries.length>0&&(
          <div style={{ overflowX:"auto",marginTop:14 }}>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead><tr><TH>Tenant</TH><TH>Category</TH><TH right>Amount</TH><TH>Due</TH><TH>Note</TH><TH>Entered</TH><TH></TH></tr></thead>
              <tbody>{entries.map(e=>(
                <tr key={e.charge_id} style={{ opacity:e.voided_at?0.55:1 }}>
                  <TD bold>{e.tenant_name}</TD><TD>{e.category}</TD><TD right>{fmtCents(e.amount_cents)}</TD><TD>{fmtDay(e.due_date)}</TD>
                  <TD>{e.memo}{e.voided_at?` · VOID: ${e.void_reason}`:""}</TD>
                  <TD>{fmtDay(String(e.entered_at).slice(0,10))}{e.entered_by?` · ${e.entered_by}`:""}</TD>
                  <TD>{!e.voided_at&&<Btn onClick={()=>voidEntry(e)}>Void</Btn>}</TD>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      {legacy.length>0&&(
        <Card title="Legacy charge rows to review" sub="Old unpaid-charge rows in the payments table. They are not counted in any balance. If one is still owed, enter it as an opening balance above. Nothing is converted automatically.">
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead><tr><TH>Tenant</TH><TH>Category</TH><TH>Status</TH><TH>Due</TH><TH right>Amount</TH><TH right>Balance due</TH></tr></thead>
              <tbody>{legacy.map(l=>(
                <tr key={l.payment_id}><TD bold>{l.tenant_name||"—"}</TD><TD>{l.category||"—"}</TD><TD>{l.status||"—"}</TD><TD>{fmtDay(l.due_date)}</TD>
                  <TD right>{l.amount_cents!=null?fmtCents(l.amount_cents):"—"}</TD><TD right>{l.balance_cents!=null?fmtCents(l.balance_cents):"—"}</TD></tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Late fees" sub="$50 per eligible rent charge, at most once, on or after the 6th (New York time). Rent covered by a Stripe payment still settling is deferred; if that payment fails, the next run assesses it. Every decision is logged. Late fees are paid offline.">
        <div style={{ fontSize:12,fontWeight:600,color:C.text,marginBottom:8 }}>Authorized exemptions</div>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,alignItems:"center" }}>
          <select aria-label="Exemption tenant" value={ex.tenant_id} onChange={e=>setEx(o=>({...o,tenant_id:e.target.value}))} style={field}>
            <option value="">Tenant…</option>{tenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input aria-label="Rent due from" type="date" title="First rent due date covered" value={ex.from} onChange={e=>setEx(o=>({...o,from:e.target.value}))} style={field}/>
          <input aria-label="Rent due through" type="date" title="Last rent due date covered (blank = until revoked)" value={ex.through} onChange={e=>setEx(o=>({...o,through:e.target.value}))} style={field}/>
          <input aria-label="Exemption reason" placeholder="Who authorized it and why" value={ex.reason} onChange={e=>setEx(o=>({...o,reason:e.target.value}))} style={field}/>
          <Btn gold onClick={grantExemption}>Add exemption</Btn>
        </div>
        <Msg msg={exMsg}/>
        {exemptions.length>0&&(
          <div style={{ overflowX:"auto",marginTop:10 }}>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead><tr><TH>Tenant</TH><TH>Rent due</TH><TH>Reason</TH><TH>Authorized</TH><TH></TH></tr></thead>
              <tbody>{exemptions.map(x=>(
                <tr key={x.id} style={{ opacity:x.revoked_at?0.55:1 }}>
                  <TD bold>{tenantName(x.tenant_id)}</TD><TD>{fmtDay(x.due_from)} → {x.due_through?fmtDay(x.due_through):"until revoked"}</TD>
                  <TD>{x.reason}{x.revoked_at?` · REVOKED: ${x.revoked_reason}`:""}</TD><TD>{fmtDay(String(x.authorized_at).slice(0,10))}</TD>
                  <TD>{!x.revoked_at&&<Btn onClick={()=>revokeExemption(x)}>Revoke</Btn>}</TD>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize:12,fontWeight:600,color:C.text,margin:"16px 0 8px" }}>Assessment log</div>
        {lateLog.length===0 ? <div style={{ fontSize:13,color:C.textSub }}>No late-fee runs yet.</div> : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead><tr><TH>Run date</TH><TH>By</TH><TH>Tenant</TH><TH>Rent due</TH><TH right>Rent open</TH><TH>Outcome</TH></tr></thead>
              <tbody>{lateLog.map((l,i)=>(
                <tr key={i}><TD>{fmtDay(l.as_of)}</TD><TD>{l.actor==="scheduler"?"Schedule":l.actor==="system"?"Modus":"Landlord"}</TD><TD bold>{l.tenant_name||"—"}</TD><TD>{fmtDay(l.rent_due_date)}</TD>
                  <TD right>{fmtCents(l.rent_open_cents)}</TD><TD color={/charged$/.test(l.outcome)&&!/already/.test(l.outcome)?C.green:/deferred:|exempt|not eligible/.test(l.outcome)?C.amber:undefined}>{l.outcome}</TD></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Tenant ledger ↔ accounting journal" sub="Every payment in the tenant ledger is the same payment the journal recorded; charges never post to the journal, so revenue is counted once."
        right={tie.length>0&&<span style={{ fontSize:12,fontWeight:600,color:tieOk?C.green:C.red }}>{tieOk?"✓ Ties out":"✗ Difference"}</span>}>
        {tie.length===0 ? <div style={{ fontSize:13,color:C.textSub }}>No payments received since the cutover yet.</div> : (
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead><tr><TH>Books</TH><TH>Category</TH><TH right>Payments</TH><TH right>Tenant ledger</TH><TH right>Journal income</TH><TH right>Charges in journal</TH></tr></thead>
            <tbody>{tie.map((t,i)=>(
              <tr key={i}><TD bold>{t.books_name}</TD><TD>{t.category}</TD><TD right>{t.receipts}</TD><TD right>{fmtCents(t.ledger_cents)}</TD>
                <TD right color={Number(t.ledger_cents)===Number(t.journal_cents)?C.green:C.red}>{fmtCents(t.journal_cents)}</TD><TD right>{t.charges_in_journal}</TD></tr>
            ))}</tbody>
          </table>
        )}
        {categories.length>0&&(
          <div style={{ overflowX:"auto",marginTop:14 }}>
            <div style={{ fontSize:12,fontWeight:600,color:C.text,marginBottom:6 }}>By category: journal = tenant ledger = applied to charges + credit</div>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead><tr><TH>Books</TH><TH>Category</TH><TH>Account</TH><TH right>Journal income</TH><TH right>Tenant ledger</TH><TH right>Applied to charges</TH><TH right>Credit</TH><TH></TH></tr></thead>
              <tbody>{categories.map((c,i)=>(
                <tr key={i}><TD bold>{c.books_name}</TD><TD>{c.category}</TD><TD>{c.account_code}</TD><TD right>{fmtCents(c.journal_cents)}</TD><TD right>{fmtCents(c.ledger_cents)}</TD>
                  <TD right>{fmtCents(c.applied_cents)}</TD><TD right>{fmtCents(c.credit_cents)}</TD><TD color={c.in_balance?C.green:C.red}>{c.in_balance?"✓":"✗"}</TD></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {unlinked.length>0&&(
          <div style={{ marginTop:14 }}>
            <div style={{ fontSize:12,fontWeight:600,color:C.amber,marginBottom:6 }}>{unlinked.length} receipt(s) are in the journal but on no tenant's ledger, because no tenant is recorded</div>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead><tr><TH>Books</TH><TH>Category</TH><TH>Received</TH><TH right>Amount</TH></tr></thead>
              <tbody>{unlinked.map(u=>(
                <tr key={u.payment_id}><TD bold>{u.books_name}</TD><TD>{u.category}</TD><TD>{fmtDay(u.paid_on)}</TD><TD right>{fmtCents(u.amount_cents)}</TD></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      {A3_ENABLED&&<>
      <Card title="Stored payment applications" sub="Each allocation of money to a charge is stored when it happens and never edited. Corrections are reversals plus new applications. See a payment's record in the tenant's ledger."
        right={<span style={{ fontSize:12,fontWeight:600,color:appCheck.length?C.red:C.green }}>{appCheck.length?`✗ ${appCheck.length} to review`:"✓ Record is sound"}</span>}>
        {appCheck.length===0 ? <div style={{ fontSize:13,color:C.textSub }}>No payment or charge is over-applied, no void charge holds money, and no money sits unapplied while a charge in its category is open.</div> : (
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead><tr><TH>Tenant</TH><TH>Problem</TH><TH>Detail</TH></tr></thead>
            <tbody>{appCheck.map((p,i)=><tr key={i}><TD bold>{p.tenant_name||"—"}</TD><TD color={C.red}>{p.problem.replace(/_/g," ")}</TD><TD>{p.detail}</TD></tr>)}</tbody>
          </table>
        )}
      </Card>

      <Card title="Returned payments: recovery" sub="A payment that came back after it succeeded: the rent and Modus's 5% reverse. Stripe doesn't reverse the owner's transfer on its own, so an authorized person does it in the Stripe Dashboard, or the owner repays Modus directly. Modus never initiates a reversal; it tracks what's still outstanding."
        right={recovery.length>0&&<span style={{ fontSize:12,fontWeight:600,color:recoveryOpen.length?C.amber:C.green }}>{recoveryOpen.length?`${recoveryOpen.length} open`:"✓ None open"}</span>}>
        {recovery.length===0 ? <div style={{ fontSize:13,color:C.textSub }}>No returned payments. ACH failures before settlement are listed under Modus's report: Stripe reverses those itself.</div> : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead><tr><TH>Tenant</TH><TH>Books</TH><TH>Type</TH><TH>Collected</TH><TH>Returned</TH><TH right>Payment</TH><TH right>Owner's 95%</TH><TH right>Reversed in Stripe</TH><TH right>Repaid directly</TH><TH right>Recoverable from owner</TH><TH>Status</TH></tr></thead>
              <tbody>{recovery.map(r=>[
                <tr key={r.return_id}><TD bold>{r.tenant_name||"—"}</TD><TD>{r.books_name||"—"}</TD><TD>{RETURN_KIND_TEXT[r.kind]||r.kind}</TD><TD>{fmtDay(r.paid_on)}</TD><TD>{fmtDay(r.returned_on)}</TD><TD right>{fmtCents(r.gross_cents)}</TD><TD right>{fmtCents(r.owner_share_cents)}</TD>
                  <TD right>{Number(r.transfer_reversed_cents)-Number(r.fee_refunded_cents)?fmtCents(Number(r.transfer_reversed_cents)-Number(r.fee_refunded_cents)):"—"}</TD>
                  <TD right>{Number(r.direct_repaid_cents)?fmtCents(r.direct_repaid_cents):"—"}</TD>
                  <TD right bold color={Number(r.outstanding_cents)?C.amber:C.green}>{fmtCents(r.outstanding_cents)}</TD>
                  <TD color={RECOVERY_DONE.has(r.recovery_status)?C.green:C.amber}>{RECOVERY_STATUS_TEXT[r.recovery_status]||r.recovery_status}</TD></tr>,
                !RECOVERY_DONE.has(r.recovery_status)&&(
                  <tr key={`${r.return_id}-d`}><td colSpan={11} style={{ padding:"0 12px 10px",borderBottom:`1px solid ${C.border}`,fontSize:11,color:C.textMuted }}>
                    Reason: {r.reason}{r.stripe_transfer_id?` · transfer ${r.stripe_transfer_id}`:""}{r.stripe_charge_id?` · charge ${r.stripe_charge_id}`:""}
                    {Number(r.outstanding_cents)>0&&repay?.return_id!==r.return_id&&(
                      <span style={{ marginLeft:10 }}><Btn onClick={()=>{ setRepayMsg(null); setRepay({ return_id:r.return_id, amount:(Number(r.outstanding_cents)/100).toFixed(2), date:today, account:"1000", memo:`Direct repayment for ${r.tenant_name||"tenant"}'s payment returned ${r.returned_on}` }); }}>Record direct repayment</Btn></span>
                    )}
                    {repay?.return_id===r.return_id&&(
                      <div style={{ display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginTop:8 }}>
                        <input aria-label="Repayment amount" value={repay.amount} onChange={e=>setRepay(x=>({ ...x, amount:e.target.value }))} style={{ ...field,width:100 }}/>
                        <input aria-label="Repayment date" type="date" value={repay.date} onChange={e=>setRepay(x=>({ ...x, date:e.target.value }))} style={field}/>
                        <select aria-label="Repayment paid from" value={repay.account} onChange={e=>setRepay(x=>({ ...x, account:e.target.value }))} style={field}><option value="1000">Paid from Operating Cash</option><option value="1050">Paid from Stripe Clearing</option></select>
                        <input aria-label="Repayment note" value={repay.memo} onChange={e=>setRepay(x=>({ ...x, memo:e.target.value }))} style={{ ...field,minWidth:260,flex:1 }}/>
                        <Btn gold onClick={()=>recordRepayment(r)}>Save repayment</Btn>
                        <Btn onClick={()=>setRepay(null)}>Cancel</Btn>
                      </div>
                    )}
                  </td></tr>
                ),
              ])}</tbody>
            </table>
            <Msg msg={repayMsg}/>
          </div>
        )}
      </Card>

      <Card title="Modus financials" sub="Modus's own income statement, kept apart from every owner's books. Modus earns 5% of rent collected. Stripe's fees and ACH return fees are Modus's expenses and never an owner's."
        right={<div style={{ display:"flex",gap:6,alignItems:"center" }}>
          <input aria-label="Modus from" type="date" value={modusRange.from} onChange={e=>setModusRange(m=>({ ...m, from:e.target.value }))} style={field}/>
          <span style={{ fontSize:12,color:C.textMuted }}>to</span>
          <input aria-label="Modus to" type="date" value={modusRange.to} onChange={e=>setModusRange(m=>({ ...m, to:e.target.value }))} style={field}/>
        </div>}>
        <table style={{ width:"100%",borderCollapse:"collapse",marginBottom:14 }}>
          <tbody>{modusIncome.map(l=>{
            const total = /^(Net revenue|Total expenses|Net to Modus)$/.test(l.line);
            if (l.section === "Memo") return <tr key={l.sort_key}><TD color={C.textMuted}>{l.line} (balance today)</TD><TD right color={Number(l.amount_cents)?C.amber:C.textMuted}>{fmtCents(l.amount_cents)}</TD></tr>;
            return <tr key={l.sort_key}><TD bold={total}>{l.line}</TD><TD right bold={total} color={l.line==="Net to Modus"?(Number(l.amount_cents)<0?C.red:C.green):undefined}>{fmtCents(l.amount_cents)}</TD></tr>;
          })}</tbody>
        </table>
        {feePayable.length>0&&(
          <div style={{ overflowX:"auto",marginBottom:14 }}>
            <div style={{ fontSize:12,fontWeight:600,color:feeOk?C.green:C.red,marginBottom:6 }}>{feeOk?"✓":"✗"} 5% owed by owners on rent collected outside Stripe (account 2195) = accrued − reversed − paid</div>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead><tr><TH>Books</TH><TH right>Accrued</TH><TH right>Reversed</TH><TH right>Paid</TH><TH right>Should be</TH><TH right>In the ledger</TH></tr></thead>
              <tbody>{feePayable.map(d=>(
                <tr key={d.books}><TD bold>{d.books_name}</TD><TD right>{fmtCents(d.accrued_cents)}</TD><TD right>{fmtCents(d.reversed_cents)}</TD><TD right>{fmtCents(d.paid_cents)}</TD><TD right>{fmtCents(d.expected_cents)}</TD><TD right color={d.in_balance?C.green:C.red}>{fmtCents(d.ledger_cents)}</TD></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {platformShown.length===0 ? <div style={{ fontSize:13,color:C.textSub }}>No rent collected yet.</div> : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead><tr><TH>Tenant</TH><TH>Collected</TH><TH>Status</TH><TH>5% is</TH><TH right>Rent</TH><TH right>Owner keeps</TH><TH right>Modus revenue</TH><TH right>Stripe fees</TH><TH right>Return fees</TH><TH right>Net to Modus</TH></tr></thead>
              <tbody>
                {platformShown.map(p=>[
                  <tr key={p.payment_id}><TD bold>{p.tenant_name||"—"}</TD><TD>{fmtDay(p.paid_on)}</TD><TD color={p.state==="returned"?C.red:undefined}>{COLLECTION_STATE_TEXT[p.state]||p.state}{p.returned_on?` ${fmtDay(p.returned_on)}`:""}</TD><TD>{FEE_COLLECTION_TEXT[p.fee_collection]||p.fee_collection}</TD>
                    <TD right>{fmtCents(p.gross_cents)}</TD><TD right>{fmtCents(p.owner_net_cents)}</TD><TD right>{fmtCents(p.revenue_cents)}</TD>
                    <TD right>{p.stripe_fee_cents==null?"—":fmtCents(Number(p.stripe_fee_cents)-Number(p.stripe_fee_returned_cents))}</TD><TD right>{Number(p.return_fee_cents)?fmtCents(p.return_fee_cents):"—"}</TD>
                    <TD right bold color={Number(p.net_to_modus_cents)<0?C.red:C.green}>{fmtCents(p.net_to_modus_cents)}</TD></tr>,
                  p.flags?.length>0&&<tr key={`${p.payment_id}-f`}><td colSpan={10} style={{ padding:"0 12px 10px",borderBottom:`1px solid ${C.border}`,fontSize:11,color:C.amber }}>{p.flags.map(x=>`⚠ ${MODUS_FLAG_TEXT[x]||x}`).join("   ")}</td></tr>,
                ])}
              </tbody>
            </table>
          </div>
        )}
        {failedBefore.length>0&&<div style={{ fontSize:12,color:C.textSub,marginTop:10 }}>{failedBefore.length} ACH payment{failedBefore.length===1?"":"s"} failed before settlement. Nothing was collected and Stripe reversed the transfer itself, so nothing is recorded as revenue. Stripe's failure fee isn't on the event Modus receives, so it isn't included above.</div>}
      </Card>
      </>}

      {refundRecon.length>0&&(
      <Card title="Rent refunds at Stripe" sub="Not a normal workflow: adjustments are rental credits. If a rent refund happens at Stripe, the rent and Modus's 5% reverse. Set both reverse_transfer and refund_application_fee when issuing it, or the outstanding amount here will show what's left."
        right={<span style={{ fontSize:12,fontWeight:600,color:refundsToReview.length?C.amber:C.green }}>{refundsToReview.length?`${refundsToReview.length} to review`:"✓ None to review"}</span>}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead><tr><TH>Tenant</TH><TH>Books</TH><TH>Refunded</TH><TH right>Refund</TH><TH right>Modus 5% reversed</TH><TH right>Transfer reversed</TH><TH right>Fee returned</TH><TH right>Outstanding</TH><TH>Status</TH></tr></thead>
            <tbody>{refundRecon.map(r=>(
              <tr key={r.refund_id}><TD bold>{r.tenant_name||"—"}</TD><TD>{r.books_name||"—"}</TD><TD>{fmtDay(r.refunded_on)}</TD><TD right>{fmtCents(r.refund_cents)}</TD><TD right>{fmtCents(r.modus_fee_share_cents)}</TD><TD right>{Number(r.transfer_reversed_cents)?fmtCents(r.transfer_reversed_cents):"—"}</TD>
                <TD right>{Number(r.fee_refunded_cents)?fmtCents(r.fee_refunded_cents):"—"}</TD><TD right color={Number(r.outstanding_cents)?C.amber:undefined}>{fmtCents(r.outstanding_cents)}</TD>
                <TD color={REFUND_STATUS_OK.has(r.status)?C.green:C.amber}>{REFUND_STATUS_TEXT[r.status]||r.status}</TD></tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
      )}

      {refundDue.length>0&&(
      <Card title="Due to Modus (account 2190)" sub="What owners hold of returned or refunded rent, against the ledger."
        right={<span style={{ fontSize:12,fontWeight:600,color:dueOk?C.green:C.red }}>{dueOk?"✓ Ties out":"✗ Difference"}</span>}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead><tr><TH>Books</TH><TH right>Owner's share of returns</TH><TH right>Of refunds</TH><TH right>Reversed</TH><TH right>Fee returned</TH><TH right>Repaid</TH><TH right>Should be</TH><TH right>In the ledger</TH></tr></thead>
            <tbody>{refundDue.map(d=>(
              <tr key={d.books}><TD bold>{d.books_name}</TD><TD right>{fmtCents(d.returns_cents)}</TD><TD right>{fmtCents(d.refunds_cents)}</TD><TD right>{fmtCents(d.reversed_cents)}</TD><TD right>{fmtCents(d.fee_refunded_cents)}</TD><TD right>{fmtCents(d.settled_cents)}</TD><TD right>{fmtCents(d.expected_cents)}</TD>
                <TD right color={d.in_balance?C.green:C.red}>{fmtCents(d.ledger_cents)}</TD></tr>
            ))}</tbody>
          </table>
        </div>
        {recoveryTie.map(t=>(
          <div key={t.books} style={{ fontSize:12,color:t.in_balance?C.textSub:C.red,marginTop:10 }}>
            {t.books_name} worklist: returns {fmtCents(t.returns_outstanding_cents)} + refunds {fmtCents(t.refunds_outstanding_cents)}{Number(t.unassigned_repaid_cents)?` − ${fmtCents(t.unassigned_repaid_cents)} repaid but not tied to a payment`:""} {t.in_balance?`= ${fmtCents(t.ledger_cents)} ✓`:`differs from the ledger's ${fmtCents(t.ledger_cents)} by ${fmtCents(t.difference_cents)}`}
          </div>
        ))}
      </Card>
      )}

      <Card title="Stripe fees and reversals" sub={A3_ENABLED?"Everything Stripe reported per payment. Stripe's own fee stays out of owner books. A transfer reversal and a fee return post when they happen; differences are flagged.":"Everything Stripe reported per payment. Stripe's own fee stays out of owner books. Only a refund to the tenant posts to the journal; reversals are recorded and differences are flagged."}
        right={feeFlagged.length>0&&<span style={{ fontSize:12,fontWeight:600,color:C.amber }}>{feeFlagged.length} flagged</span>}>
        {fees.length===0 ? <div style={{ fontSize:13,color:C.textSub }}>No Stripe payments yet.</div> : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead><tr><TH>Tenant</TH><TH>Received</TH><TH right>Payment</TH><TH right>Refunded</TH><TH right>Modus fee recorded</TH><TH right>At Stripe</TH><TH right>Refunded</TH><TH right>Stripe fee</TH><TH right>Returned</TH><TH right>Stripe net</TH></tr></thead>
              <tbody>{fees.map(f=>[
                <tr key={f.payment_id}><TD bold>{f.tenant_name||"—"}</TD><TD>{fmtDay(f.paid_on)}</TD><TD right>{fmtCents(f.gross_cents)}</TD><TD right>{Number(f.refunded_cents)?fmtCents(f.refunded_cents):"—"}</TD>
                  <TD right>{fmtCents(f.platform_fee_cents)}</TD><TD right>{f.stripe_application_fee_cents==null?"—":fmtCents(f.stripe_application_fee_cents)}</TD>
                  <TD right>{Number(f.application_fee_refunded_cents)?fmtCents(f.application_fee_refunded_cents):"—"}</TD>
                  <TD right>{f.stripe_fee_cents==null?"—":fmtCents(f.stripe_fee_cents)}</TD><TD right>{Number(f.stripe_fee_reversed_cents)?fmtCents(f.stripe_fee_reversed_cents):"—"}</TD>
                  <TD right>{f.stripe_net_cents==null?"—":fmtCents(f.stripe_net_cents)}</TD></tr>,
                (f.flags?.length>0||f.balance_transaction||Number(f.refunded_cents)>0)&&(
                  <tr key={`${f.payment_id}-d`}><td colSpan={10} style={{ padding:"0 12px 10px",borderBottom:`1px solid ${C.border}`,fontSize:11 }}>
                    {f.balance_transaction&&<span style={{ color:C.textMuted,marginRight:12 }}>Transaction {f.balance_transaction}{f.stripe_charge_id?` · charge ${f.stripe_charge_id}`:""}</span>}
                    {(f.flags||[]).map(x=><span key={x} style={{ color:C.amber,marginRight:12,whiteSpace:"nowrap" }}>⚠ {FEE_FLAG_TEXT[x]||x}</span>)}
                    {stripeRefunds.filter(r=>r.payment_id===f.payment_id).map(r=>(
                      <div key={r.refund_id} style={{ color:C.textSub,marginTop:4 }}>
                        Refund {r.stripe_refund_id} · {fmtCents(r.amount_cents)} on {fmtDay(r.refunded_on)} · <span style={{ color:/MISSING|SHORT|unconfirmed/.test(TRANSFER_STATUS_TEXT[r.transfer_status]||"")?C.amber:C.textSub }}>{TRANSFER_STATUS_TEXT[r.transfer_status]||r.transfer_status}</span>
                        {r.expected_reversal_cents!=null?` (expected ${fmtCents(r.expected_reversal_cents)}, reversed ${fmtCents(r.transfer_reversed_cents)})`:""}
                        {Number(r.stripe_fee_returned_cents)?` · Stripe returned ${fmtCents(r.stripe_fee_returned_cents)} of its fee`:""}
                      </div>
                    ))}
                  </td></tr>
                ),
              ])}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
