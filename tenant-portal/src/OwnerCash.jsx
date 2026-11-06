import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { BOOK_TXN_TYPES, CASH_ACCOUNTS, OPENING_ACCOUNTS, bookTxnEffect, fmtCents, parseDollarsToCents, todayNY } from "./lib/accounting";

const C = {
  surface:"#14181F", raised:"#1A1F29", border:"rgba(255,255,255,0.08)", text:"#EDEAE2", textSub:"#9095A0", textMuted:"#5C6270",
  gold:"#C9A96E", goldDim:"#6B4F24", green:"#72B02A", red:"#E05555", amber:"#F0A430", blue:"#4A9AE8",
};
const field = { padding:"8px 10px",fontSize:12,border:`1px solid ${C.border}`,borderRadius:6,background:C.raised,color:C.text,outline:"none",fontFamily:"'DM Sans',sans-serif",colorScheme:"dark",minWidth:0 };
const th = (right) => ({ fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.08em",padding:"9px 12px",textAlign:right?"right":"left",borderBottom:`1px solid ${C.border}`,background:C.raised,whiteSpace:"nowrap" });
const td = (right, color, bold) => ({ fontSize:13,color:color||(bold?C.text:C.textSub),fontWeight:bold?600:400,padding:"9px 12px",borderBottom:`1px solid ${C.border}`,textAlign:right?"right":"left",fontVariantNumeric:"tabular-nums" });
const btn = (gold) => ({ background:"transparent",border:`1px solid ${gold?C.goldDim:C.border}`,color:gold?C.gold:C.textSub,fontSize:12,fontWeight:500,padding:"7px 14px",borderRadius:7,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" });
const fmtDay = (d) => d ? new Date(`${String(d).slice(0,10)}T12:00:00`).toLocaleDateString("en-US",{ month:"short",day:"numeric",year:"numeric" }) : "—";

function Card({ title, sub, children }) {
  return (
    <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,marginBottom:16,overflow:"hidden" }}>
      <div style={{ padding:"14px 18px",borderBottom:`1px solid ${C.border}` }}>
        <div style={{ fontSize:14,fontWeight:600,color:C.text }}>{title}</div>
        {sub&&<div style={{ fontSize:12,color:C.textSub,marginTop:3,lineHeight:1.5 }}>{sub}</div>}
      </div>
      <div style={{ padding:"14px 18px" }}>{children}</div>
    </div>
  );
}

const EMPTY = { type:"owner_contribution", books:"", property:"", date:todayNY(), amount:"", cash:"1000", from:"1050", account:"1000", tenant:"", memo:"" };

// Owner money and cash movements that aren't tenant receipts or expenses: each posts to the journal and voids by reversal.
export default function OwnerCash({ properties, tenants, units, onChanged }) {
  const [rev, setRev]       = useState(0);
  const [status, setStatus] = useState([]);
  const [txns, setTxns]     = useState([]);
  const [books, setBooks]   = useState([]);
  const [form, setForm]     = useState(EMPTY);
  const [msg, setMsg]       = useState(null);
  const up = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    let live = true;
    (async () => {
      const [{ data: s }, { data: t }, { data: b }] = await Promise.all([
        supabase.rpc("a3_books_status", { p_as_of: todayNY() }),
        supabase.from("book_transactions").select("*").order("txn_date", { ascending:false }),
        supabase.from("accounting_entities").select("id, name").order("name"),
      ]);
      if (live) { setStatus(s || []); setTxns(t || []); setBooks(b || []); }
    })();
    return () => { live = false; };
  }, [rev]);

  const bookName = (id) => books.find(b => b.id === id)?.name || "—";
  const propName = (id) => properties.find(p => p.id === id)?.name || "";
  const tenantName = (id) => tenants.find(t => t.id === id)?.name || "";
  const inBooks = properties.filter(p => p.accounting_entity_id === form.books);
  const unitProp = Object.fromEntries((units || []).map(u => [u.id, u.property_id]));
  const tenantsInBooks = tenants.filter(t => inBooks.some(p => p.id === unitProp[t.unit_id]));
  const needsOpening = status.filter(b => b.opening_entries === 0);
  const meta = BOOK_TXN_TYPES.find(t => t.value === form.type);

  async function save() {
    const cents = parseDollarsToCents(form.amount);
    if (!form.books) { setMsg({ ok:false, text:"Select a set of books." }); return; }
    if (cents == null) { setMsg({ ok:false, text:"Enter an amount greater than $0." }); return; }
    if (!form.date) { setMsg({ ok:false, text:"Enter the date." }); return; }
    if (!form.memo.trim()) { setMsg({ ok:false, text:"Add a note saying what this is." }); return; }
    if (form.type === "cash_transfer" && form.cash === form.from) { setMsg({ ok:false, text:"A transfer needs two different accounts." }); return; }
    const { error } = await supabase.rpc("a3_record_book_txn", {
      p_books: form.books, p_type: form.type, p_date: form.date, p_amount_cents: cents, p_memo: form.memo.trim(),
      p_property: form.property || null, p_cash_account: form.cash, p_from_account: form.type === "cash_transfer" ? form.from : null,
      p_account_code: form.type === "opening_balance" ? form.account : null, p_tenant: form.type === "opening_balance" && form.account === "2100" ? (form.tenant || null) : null,
    });
    setMsg(error ? { ok:false, text:error.message } : { ok:true, text:`Recorded: ${bookTxnEffect({ txn_type:form.type, amount_cents:cents, cash_account:form.cash, from_account:form.from, account_code:form.account })}.` });
    if (!error) { setForm(f => ({ ...EMPTY, type:f.type, books:f.books, date:f.date })); setRev(n=>n+1); onChanged?.(); }
  }

  async function voidTxn(t) {
    const reason = window.prompt(`Reason for voiding this ${BOOK_TXN_TYPES.find(x=>x.value===t.txn_type)?.label.toLowerCase()} (${fmtCents(t.amount_cents)})? It stays on record and is reversed in the journal.`);
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc("a3_void_book_txn", { p_id: t.id, p_reason: reason.trim() });
    setMsg(error ? { ok:false, text:error.message } : { ok:true, text:"Voided. The row stays on record and a reversal is in the journal, dated today." });
    if (!error) { setRev(n=>n+1); onChanged?.(); }
  }

  return (
    <div>
      <Card title="Books at a glance" sub="Each owner's books are separate. Opening balances are only what you enter here; Modus never infers them.">
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead><tr><th style={th()}>Owner</th><th style={th()}>Books</th><th style={th(true)}>Cash</th><th style={th(true)}>Liabilities</th><th style={th(true)}>Equity + net income</th><th style={th()}>Opening balances</th><th style={th()}>Balances?</th></tr></thead>
            <tbody>{status.map(b=>(
              <tr key={b.books}>
                <td style={td(false,undefined,true)}>{b.owner_name}<span style={{ color:C.textMuted,fontWeight:400 }}> · {b.owner_type==="individual"?"individual":b.owner_type==="llc"?"LLC":"other"}</span></td>
                <td style={td()}>{b.books_name}</td>
                <td style={td(true,Number(b.cash_cents)<0?C.amber:undefined)}>{fmtCents(b.cash_cents)}</td>
                <td style={td(true)}>{fmtCents(b.liabilities_cents)}</td>
                <td style={td(true)}>{fmtCents(Number(b.equity_cents)+Number(b.net_income_cents))}</td>
                <td style={td(false,b.opening_entries?C.green:C.amber)}>{b.opening_entries?`${b.opening_entries} entered`:"None entered"}</td>
                <td style={td(false,b.in_balance?C.green:C.red)}>{b.in_balance?"✓":"✗"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{ fontSize:12,color:C.textMuted,marginTop:10,lineHeight:1.5 }}>A Stripe payout reaching the owner's bank is a cash transfer. A distribution is the owner taking money out of these books. Modus's 5% is never in the owner's cash, so no distribution can include it.</div>
        {needsOpening.length>0&&<div style={{ fontSize:12,color:C.amber,marginTop:10 }}>{needsOpening.length} set{needsOpening.length===1?"":"s"} of books {needsOpening.length===1?"has":"have"} no opening balance yet. Until entered, cash and equity show only activity recorded in Modus.</div>}
      </Card>

      <Card title="Record a transaction" sub={meta?.help}>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,alignItems:"center" }}>
          <select aria-label="Transaction type" value={form.type} onChange={e=>up("type",e.target.value)} style={field}>{BOOK_TXN_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select>
          <select aria-label="Books" value={form.books} onChange={e=>setForm(f=>({ ...f, books:e.target.value, property:"", tenant:"" }))} style={field}><option value="">Set of books…</option>{books.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <select aria-label="Property" value={form.property} onChange={e=>up("property",e.target.value)} style={field} disabled={!form.books}><option value="">No specific property</option>{inBooks.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input aria-label="Date" type="date" value={form.date} onChange={e=>up("date",e.target.value)} style={field}/>
          <input aria-label="Amount" placeholder="$0.00" value={form.amount} onChange={e=>up("amount",e.target.value)} style={field}/>
          {form.type==="opening_balance"&&<select aria-label="Opening account" value={form.account} onChange={e=>up("account",e.target.value)} style={field}>{OPENING_ACCOUNTS.map(a=><option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</select>}
          {form.type==="opening_balance"&&form.account==="2100"&&<select aria-label="Deposit tenant" value={form.tenant} onChange={e=>up("tenant",e.target.value)} style={field}><option value="">Tenant (optional)</option>{tenantsInBooks.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>}
          {form.type==="cash_transfer"&&<select aria-label="From account" value={form.from} onChange={e=>up("from",e.target.value)} style={field}>{CASH_ACCOUNTS.map(a=><option key={a.code} value={a.code}>From {a.name}</option>)}</select>}
          {form.type!=="opening_balance"&&<select aria-label="Cash account" value={form.cash} onChange={e=>up("cash",e.target.value)} style={field}>{CASH_ACCOUNTS.map(a=><option key={a.code} value={a.code}>{form.type==="cash_transfer"?"To ":""}{a.name}</option>)}</select>}
          <input aria-label="Note" placeholder="Note, e.g. what and why" value={form.memo} onChange={e=>up("memo",e.target.value)} style={{ ...field,gridColumn:"span 2" }}/>
          <button style={btn(true)} onClick={save}>Record</button>
        </div>
        {msg&&<div style={{ fontSize:12,color:msg.ok?C.green:C.red,marginTop:10 }}>{msg.text}</div>}
      </Card>

      <Card title="Transactions" sub="Immutable. A void keeps the row and reverses it in the journal.">
        {txns.length===0 ? <div style={{ fontSize:13,color:C.textSub }}>None recorded yet.</div> : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead><tr><th style={th()}>Date</th><th style={th()}>Type</th><th style={th()}>Books</th><th style={th()}>Detail</th><th style={th(true)}>Amount</th><th style={th()}>Entry</th><th style={th()}></th></tr></thead>
              <tbody>{txns.map(t=>(
                <tr key={t.id} style={{ opacity:t.voided_at?0.55:1 }}>
                  <td style={td()}>{fmtDay(t.txn_date)}</td>
                  <td style={td(false,undefined,true)}>{BOOK_TXN_TYPES.find(x=>x.value===t.txn_type)?.label}</td>
                  <td style={td()}>{bookName(t.accounting_entity_id)}</td>
                  <td style={td()}>{[t.memo, propName(t.property_id), tenantName(t.tenant_id)].filter(Boolean).join(" · ")}{t.voided_at?` · VOID: ${t.void_reason}`:""}</td>
                  <td style={td(true,C.text)}>{fmtCents(t.amount_cents)}</td>
                  <td style={td(false,C.textMuted)}>{bookTxnEffect(t)}</td>
                  <td style={td()}>{!t.voided_at&&<button style={{ ...btn(),fontSize:11,padding:"4px 9px" }} onClick={()=>voidTxn(t)}>Void</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
