import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";
import { todayNY } from "./lib/accounting";
import {
  KIND_LABEL, KIND_HELP, VALUE_SOURCES, SNAPSHOT_PERIODS, snapshotRange, propertySnapshot, portfolioSnapshot,
  loanPayment, loanBalance, fmtMoney, fmtPctValue, fmtRatio, dollarsToCents, centsToDollars,
} from "./lib/snapshot";

// ─── A3.1 Financial Snapshot ───────────────────────────────────────────────
// Portfolio summary and property snapshots. Actuals come from the ledger; value, purchase, cash invested and
// loans are entered here. Definitions live in lib/snapshot.js, shared by both views.

const C = {
  bg: "#0C0E12", surface: "#14181F", raised: "#1A1F29", border: "rgba(255,255,255,0.08)",
  text: "#EDEAE2", textSub: "#9095A0", textMuted: "#5C6270",
  gold: "#C9A96E", goldDim: "#6B4F24", blue: "#4A9AE8", green: "#72B02A", red: "#E05555", amber: "#F0A430",
};
const KIND_COLOR = { actual: C.green, scheduled: C.blue, entered: C.gold, estimate: C.amber };
const font = "'DM Sans', sans-serif";
const field = { width: "100%", padding: "9px 11px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, background: C.raised, color: C.text, outline: "none", fontFamily: font, colorScheme: "dark", boxSizing: "border-box" };
const selectStyle = { padding: "7px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, background: C.raised, color: C.textSub, outline: "none", fontFamily: font };

// Metric order and formats: the eleven A3.1 metrics, plus occupancy and debt service as context.
const METRICS = [
  { key: "noi",           label: "Net operating income", fmt: fmtMoney },
  { key: "gsr",           label: "Gross scheduled rent (annual)", fmt: fmtMoney },
  { key: "rentCollected", label: "Rent collected", fmt: fmtMoney },
  { key: "opex",          label: "Operating expenses", fmt: fmtMoney },
  { key: "netCashFlow",   label: "Net cash flow", fmt: fmtMoney },
  { key: "capRate",       label: "Cap rate", fmt: fmtPctValue },
  { key: "cashOnCash",    label: "Cash-on-cash return", fmt: fmtPctValue },
  { key: "dscr",          label: "DSCR", fmt: fmtRatio },
  { key: "value",         label: "Current property value", fmt: fmtMoney },
  { key: "debt",          label: "Outstanding debt", fmt: fmtMoney },
  { key: "equity",        label: "Owner equity", fmt: fmtMoney },
  { key: "debtService",   label: "Debt service", fmt: fmtMoney },
  { key: "occupancy",     label: "Occupancy", fmt: fmtPctValue },
];
const POINT_IN_TIME = new Set(["value", "debt", "equity", "gsr", "occupancy"]);

function Btn({ children, onClick, gold, danger, small, disabled }) {
  const color = danger ? C.red : gold ? C.gold : C.textSub;
  const border = danger ? "rgba(224,85,85,0.3)" : gold ? C.goldDim : C.border;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: "transparent", border: `1px solid ${border}`, color, fontSize: small ? 11 : 12, fontWeight: 500,
      padding: small ? "4px 9px" : "7px 14px", borderRadius: 7, cursor: disabled ? "default" : "pointer", fontFamily: font,
      opacity: disabled ? 0.55 : 1, whiteSpace: "nowrap",
    }}>{children}</button>
  );
}

function KindChip({ kind }) {
  if (!kind) return null;
  const c = KIND_COLOR[kind];
  return <span title={KIND_HELP[kind]} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "2px 6px", borderRadius: 4, color: c, background: `${c}1A`, border: `1px solid ${c}33`, whiteSpace: "nowrap" }}>{KIND_LABEL[kind]}</span>;
}

function MetricCard({ def, metric, periodLabel }) {
  const m = metric;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", minHeight: 104, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.09em", lineHeight: 1.4 }}>{def.label}</div>
        <KindChip kind={m.available ? m.kind : null} />
      </div>
      {m.available ? (
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: m.value < 0 ? C.red : C.text, lineHeight: 1.1 }}>{def.fmt(m.value)}</div>
      ) : (
        <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.1, fontWeight: 600 }}>Not available</div>
      )}
      <div style={{ fontSize: 11, color: m.available ? C.textMuted : C.amber, lineHeight: 1.45 }}>
        {m.available ? (m.note || (POINT_IN_TIME.has(def.key) ? "As of today" : periodLabel)) : m.reason}
      </div>
    </div>
  );
}

function MetricGrid({ metrics, periodLabel, keys }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
      {METRICS.filter((d) => !keys || keys.includes(d.key)).map((d) => <MetricCard key={d.key} def={d} metric={metrics[d.key]} periodLabel={periodLabel} />)}
    </div>
  );
}

function Modal({ title, onClose, children, footer }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: 520, maxWidth: "100%", maxHeight: "92vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textSub, fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: "16px 22px", overflowY: "auto", display: "grid", gap: 14 }}>{children}</div>
        <div style={{ padding: "12px 22px 16px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>{footer}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.09em" }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.45 }}>{hint}</span>}
    </label>
  );
}
const two = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };

// ─── Inputs: value, purchase, cash invested, debt status, owner relationship ──
function ProfileModal({ property, profile, owner, onClose, onSaved }) {
  const [f, setF] = useState({
    current_value: centsToDollars(profile?.current_value_cents), value_as_of: profile?.value_as_of || "", value_source: profile?.value_source || "owner_estimate",
    purchase_price: centsToDollars(profile?.purchase_price_cents), purchase_date: profile?.purchase_date || "",
    cash_invested: centsToDollars(profile?.cash_invested_cents), no_debt: !!profile?.no_debt, notes: profile?.notes || "",
    managed_for_client: !!owner?.managed_for_client,
  });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const today = todayNY();

  async function save() {
    const value = dollarsToCents(f.current_value), price = dollarsToCents(f.purchase_price), cash = dollarsToCents(f.cash_invested);
    if (value.error || price.error || cash.error) return setErr("Amounts must be dollars, with up to 2 decimals.");
    if ([value.cents, price.cents, cash.cents].some((c) => c === 0)) return setErr("Leave an amount blank rather than entering $0.");
    if (value.cents != null && !f.value_as_of) return setErr("Enter the date the value is as of.");
    if (value.cents == null && f.value_as_of) return setErr("Enter the value, or clear its date.");
    if (f.value_as_of > today || f.purchase_date > today) return setErr("Dates can't be in the future.");
    setSaving(true); setErr("");
    const row = {
      property_id: property.id, current_value_cents: value.cents, value_as_of: f.value_as_of || null,
      value_source: value.cents != null ? f.value_source : null, purchase_price_cents: price.cents, purchase_date: f.purchase_date || null,
      cash_invested_cents: cash.cents, no_debt: f.no_debt, notes: f.notes.trim() || null,
    };
    const { error } = await supabase.from("property_financial_profiles").upsert(row, { onConflict: "property_id" });
    if (error) { setSaving(false); return setErr(error.message); }
    if (owner && f.managed_for_client !== !!owner.managed_for_client) {
      const { error: e2 } = await supabase.from("ownership_entities").update({ managed_for_client: f.managed_for_client }).eq("id", owner.id);
      if (e2) { setSaving(false); return setErr(e2.message); }
    }
    setSaving(false); onSaved();
  }

  return (
    <Modal title={`Financial details · ${property.name}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn gold onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn></>}>
      {err && <div style={{ color: C.red, fontSize: 12 }}>{err}</div>}
      <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>These figures are entered by you and shown as Entered or Estimate. Leave anything you don't know blank: metrics that need it will say so instead of guessing.</div>
      <div style={two}>
        <Field label="Current value"><input inputMode="decimal" placeholder="$0" value={f.current_value} onChange={(e) => set("current_value", e.target.value)} style={field} /></Field>
        <Field label="Value as of"><input type="date" max={today} value={f.value_as_of} onChange={(e) => set("value_as_of", e.target.value)} style={field} /></Field>
      </div>
      <Field label="Value source">
        <select value={f.value_source} onChange={(e) => set("value_source", e.target.value)} style={field}>
          {VALUE_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </Field>
      <div style={two}>
        <Field label="Purchase price"><input inputMode="decimal" placeholder="$0" value={f.purchase_price} onChange={(e) => set("purchase_price", e.target.value)} style={field} /></Field>
        <Field label="Purchase date" hint="Return ratios start after a full year of ownership."><input type="date" max={today} value={f.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} style={field} /></Field>
      </div>
      <Field label="Total cash invested" hint="Down payment, closing costs and capital improvements paid in cash. Used for cash-on-cash return.">
        <input inputMode="decimal" placeholder="$0" value={f.cash_invested} onChange={(e) => set("cash_invested", e.target.value)} style={field} />
      </Field>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12, color: C.textSub, lineHeight: 1.5, cursor: "pointer" }}>
        <input type="checkbox" checked={f.no_debt} onChange={(e) => set("no_debt", e.target.checked)} style={{ marginTop: 2 }} />
        <span>This property has no mortgage or other loan. <span style={{ color: C.textMuted }}>Without loans or this confirmation, debt metrics stay unavailable.</span></span>
      </label>
      {owner && (
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12, color: C.textSub, lineHeight: 1.5, cursor: "pointer" }}>
          <input type="checkbox" checked={f.managed_for_client} onChange={(e) => set("managed_for_client", e.target.checked)} style={{ marginTop: 2 }} />
          <span>{owner.name} is a third-party client you manage for. <span style={{ color: C.textMuted }}>Applies to every property this owner holds.</span></span>
        </label>
      )}
      <Field label="Notes"><input value={f.notes} onChange={(e) => set("notes", e.target.value)} style={field} /></Field>
    </Modal>
  );
}

function LoanModal({ property, loan, onClose, onSaved }) {
  const [f, setF] = useState({
    lender: loan?.lender || "", original_amount: centsToDollars(loan?.original_amount_cents), annual_rate_pct: loan?.annual_rate_pct ?? "",
    interest_only: !!loan?.interest_only, amortization_years: loan?.amortization_months ? String(loan.amortization_months / 12) : "30",
    first_payment_date: loan?.first_payment_date || "", monthly_payment: centsToDollars(loan?.monthly_payment_cents),
    current_balance: centsToDollars(loan?.current_balance_cents), balance_as_of: loan?.balance_as_of || "", paid_off_on: loan?.paid_off_on || "",
  });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const today = todayNY();

  async function save() {
    const amt = dollarsToCents(f.original_amount), pay = dollarsToCents(f.monthly_payment), bal = dollarsToCents(f.current_balance);
    if (amt.error || pay.error || bal.error) return setErr("Amounts must be dollars, with up to 2 decimals.");
    if (!amt.cents) return setErr("Enter the original loan amount.");
    const rate = Number(f.annual_rate_pct);
    if (f.annual_rate_pct === "" || !(rate >= 0 && rate < 100)) return setErr("Enter the interest rate as a percentage, e.g. 6.25.");
    const months = Math.round(Number(f.amortization_years) * 12);
    if (!f.interest_only && !(months >= 1 && months <= 600)) return setErr("Enter the amortization in years (up to 50).");
    if (!f.first_payment_date) return setErr("Enter the first payment date.");
    if ((bal.cents != null) !== !!f.balance_as_of) return setErr("Enter the balance and its as-of date together, or leave both blank.");
    if (f.balance_as_of > today || f.paid_off_on > today) return setErr("Dates can't be in the future.");
    setSaving(true); setErr("");
    const row = {
      property_id: property.id, lender: f.lender.trim() || null, original_amount_cents: amt.cents, annual_rate_pct: rate,
      interest_only: f.interest_only, amortization_months: f.interest_only ? null : months, first_payment_date: f.first_payment_date,
      monthly_payment_cents: pay.cents || null, current_balance_cents: bal.cents, balance_as_of: f.balance_as_of || null, paid_off_on: f.paid_off_on || null,
    };
    const { error } = loan ? await supabase.from("property_loans").update(row).eq("id", loan.id) : await supabase.from("property_loans").insert(row);
    setSaving(false);
    if (error) return setErr(error.message);
    onSaved();
  }
  const preview = (() => {
    const a = dollarsToCents(f.original_amount).cents, r = Number(f.annual_rate_pct);
    if (!a || f.annual_rate_pct === "" || !(r >= 0)) return null;
    return loanPayment({ original_amount_cents: a, annual_rate_pct: r, interest_only: f.interest_only, amortization_months: Math.round(Number(f.amortization_years) * 12) }).cents;
  })();

  return (
    <Modal title={`${loan ? "Edit" : "Add"} loan · ${property.name}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn gold onClick={save} disabled={saving}>{saving ? "Saving…" : "Save loan"}</Btn></>}>
      {err && <div style={{ color: C.red, fontSize: 12 }}>{err}</div>}
      <Field label="Lender"><input value={f.lender} onChange={(e) => set("lender", e.target.value)} style={field} /></Field>
      <div style={two}>
        <Field label="Original amount *"><input inputMode="decimal" placeholder="$0" value={f.original_amount} onChange={(e) => set("original_amount", e.target.value)} style={field} /></Field>
        <Field label="Interest rate (%) *"><input inputMode="decimal" placeholder="6.25" value={f.annual_rate_pct} onChange={(e) => set("annual_rate_pct", e.target.value)} style={field} /></Field>
      </div>
      <div style={two}>
        <Field label="Amortization (years)"><input inputMode="decimal" disabled={f.interest_only} value={f.interest_only ? "" : f.amortization_years} onChange={(e) => set("amortization_years", e.target.value)} style={{ ...field, opacity: f.interest_only ? 0.5 : 1 }} /></Field>
        <Field label="First payment date *"><input type="date" value={f.first_payment_date} onChange={(e) => set("first_payment_date", e.target.value)} style={field} /></Field>
      </div>
      <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: C.textSub, cursor: "pointer" }}>
        <input type="checkbox" checked={f.interest_only} onChange={(e) => set("interest_only", e.target.checked)} /> Interest-only
      </label>
      <Field label="Monthly payment (principal & interest)" hint={`Leave blank to calculate from the terms${preview ? `: ${fmtMoney(preview)} a month` : ""}. Don't include escrow for taxes or insurance; those are operating expenses.`}>
        <input inputMode="decimal" placeholder={preview ? centsToDollars(preview) : "$0"} value={f.monthly_payment} onChange={(e) => set("monthly_payment", e.target.value)} style={field} />
      </Field>
      <div style={two}>
        <Field label="Current balance" hint="From a recent statement. Blank = estimated from the terms."><input inputMode="decimal" placeholder="$0" value={f.current_balance} onChange={(e) => set("current_balance", e.target.value)} style={field} /></Field>
        <Field label="Balance as of"><input type="date" max={today} value={f.balance_as_of} onChange={(e) => set("balance_as_of", e.target.value)} style={field} /></Field>
      </div>
      <Field label="Paid off on" hint="Leave blank while the loan is outstanding."><input type="date" max={today} value={f.paid_off_on} onChange={(e) => set("paid_off_on", e.target.value)} style={field} /></Field>
    </Modal>
  );
}

// ─── Property detail ────────────────────────────────────────────────────────
function PropertyDetail({ snap, owner, books, profile, loans, ledger, periodLabel, onEditProfile, onEditLoan, onAddLoan, onDeleteLoan }) {
  const [confirmDel, setConfirmDel] = useState(null);
  const today = todayNY();
  const p = snap.property;
  const expenses = ledger.filter((r) => r.account_type === "expense");
  const income = ledger.filter((r) => r.account_type === "income");
  const line = (label, value, strong) => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12, color: strong ? C.text : C.textSub, fontWeight: strong ? 600 : 400 }}>
      <span>{label}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.goldDim}`, borderRadius: 12, padding: 20, display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: C.text }}>{p.name}</div>
          <div style={{ fontSize: 12, color: C.textSub, marginTop: 4 }}>
            {[p.address, p.city, p.state].filter(Boolean).join(", ")} · {owner ? `${owner.name}${owner.managed_for_client ? " (client, managed)" : " (owned)"}` : "No owner assigned"}{books ? ` · ${books.name}` : ""}
          </div>
        </div>
        <Btn gold onClick={onEditProfile}>Edit financial details</Btn>
      </div>
      {snap.missing.length > 0 && (
        <div style={{ background: `${C.amber}11`, border: `1px solid ${C.amber}33`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.amber, lineHeight: 1.5 }}>
          Missing: {snap.missing.join(", ")}. Metrics that need these show "Not available".
        </div>
      )}
      <MetricGrid metrics={snap.metrics} periodLabel={periodLabel} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6 }}>Ledger · {periodLabel} <KindChip kind="actual" /></div>
          {!p.accounting_entity_id ? <div style={{ fontSize: 12, color: C.amber }}>Assign this property to a set of books to record income and expenses.</div> : ledger.length === 0 ? (
            <div style={{ fontSize: 12, color: C.textMuted }}>Nothing recorded in this period.</div>
          ) : (<>
            {income.map((r) => line(`${r.account_code} ${r.account_name}`, fmtMoney(r.amount_cents)))}
            {line("Total income", fmtMoney(income.reduce((s, r) => s + Number(r.amount_cents), 0)), true)}
            {expenses.map((r) => line(`${r.account_code} ${r.account_name}`, fmtMoney(r.amount_cents)))}
            {line("Total operating expenses", fmtMoney(expenses.reduce((s, r) => s + Number(r.amount_cents), 0)), true)}
          </>)}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6 }}>Entered details <KindChip kind="entered" /></div>
          {line("Purchase price", profile?.purchase_price_cents ? fmtMoney(profile.purchase_price_cents) : "—")}
          {line("Purchase date", profile?.purchase_date || "—")}
          {line("Cash invested", profile?.cash_invested_cents ? fmtMoney(profile.cash_invested_cents) : "—")}
          {line("Current value", profile?.current_value_cents ? `${fmtMoney(profile.current_value_cents)} · ${VALUE_SOURCES.find((s) => s.value === profile.value_source)?.label || ""}, ${profile.value_as_of}` : "—")}
          {line("Debt", loans.length ? `${loans.length} loan${loans.length === 1 ? "" : "s"}` : profile?.no_debt ? "Confirmed none" : "Not entered")}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.09em" }}>Loans</div>
          <Btn small gold onClick={onAddLoan}>+ Add loan</Btn>
        </div>
        {loans.length === 0 ? <div style={{ fontSize: 12, color: C.textMuted }}>{profile?.no_debt ? "Confirmed: no debt on this property." : "No loans entered. Add one, or confirm there's no debt under Edit financial details."}</div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr>{["Lender", "Original", "Rate", "Payment / mo", "Balance today", ""].map((h, i) => (
                <th key={i} style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em", padding: "8px 10px", textAlign: i && i < 5 ? "right" : "left", borderBottom: `1px solid ${C.border}`, background: C.raised }}>{h}</th>))}</tr></thead>
              <tbody>{loans.map((l) => {
                const pay = loanPayment(l), bal = loanBalance(l, today);
                const td = (v, right) => <td style={{ padding: "9px 10px", borderBottom: `1px solid ${C.border}`, color: C.textSub, textAlign: right ? "right" : "left", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{v}</td>;
                return (
                  <tr key={l.id}>
                    {td(<>{l.lender || "—"}{l.paid_off_on && <span style={{ color: C.textMuted }}> · paid off {l.paid_off_on}</span>}</>)}
                    {td(fmtMoney(l.original_amount_cents), true)}
                    {td(`${Number(l.annual_rate_pct)}%${l.interest_only ? " IO" : ""}`, true)}
                    {td(<>{fmtMoney(pay.cents)} <KindChip kind={pay.kind} /></>, true)}
                    {td(<>{fmtMoney(bal.cents)} <KindChip kind={bal.kind} /></>, true)}
                    {td(confirmDel === l.id
                      ? <span style={{ display: "inline-flex", gap: 6 }}><Btn small danger onClick={() => { setConfirmDel(null); onDeleteLoan(l); }}>Remove</Btn><Btn small onClick={() => setConfirmDel(null)}>Keep</Btn></span>
                      : <span style={{ display: "inline-flex", gap: 6 }}><Btn small onClick={() => onEditLoan(l)}>Edit</Btn><Btn small danger onClick={() => setConfirmDel(l.id)}>Remove</Btn></span>, true)}
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function FinancialSnapshot() {
  const today = todayNY();
  const [preset, setPreset] = useState("ttm");
  const [scope, setScope] = useState("all");
  const [data, setData] = useState(null);       // { properties, units, tenants, books, owners, profiles, loans, history }
  const [ledger, setLedger] = useState({ key: null, rows: [] });
  const [state, setState] = useState({ loading: true, error: "", missing: false });
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);     // { type: "profile" } | { type: "loan", loan }
  const [rev, setRev] = useState(0);
  const range = useMemo(() => snapshotRange(preset, today), [preset, today]);
  const periodLabel = `${SNAPSHOT_PERIODS.find((p) => p.value === preset).label} · ${range.from} to ${range.to}`;
  const rangeKey = `${range.from}|${range.to}|${rev}`;

  useEffect(() => {
    let live = true;
    (async () => {
      const [pr, un, te, bk, ow, pf, lo, hi] = await Promise.all([
        supabase.from("properties").select("id, name, address, city, state, accounting_entity_id").order("name"),
        supabase.from("units").select("id, property_id, rent_amount"),
        supabase.from("tenants").select("unit_id, archived"),
        supabase.from("accounting_entities").select("id, name, owner_entity_id"),
        supabase.from("ownership_entities").select("id, name, type, managed_for_client").order("name"),
        supabase.from("property_financial_profiles").select("*"),
        supabase.from("property_loans").select("*").order("created_at"),
        supabase.rpc("a31_property_history"),
      ]);
      if (!live) return;
      const notInstalled = [ow, pf, lo, hi].some((r) => r.error && /does not exist|schema cache|PGRST20[25]|42703|42P01/.test(`${r.error.code} ${r.error.message}`));
      if (notInstalled) return setState({ loading: false, error: "", missing: true });
      const firstErr = [pr, un, te, bk, ow, pf, lo, hi].find((r) => r.error)?.error;
      if (firstErr) return setState({ loading: false, error: firstErr.message, missing: false });
      setData({ properties: pr.data, units: un.data, tenants: te.data, books: bk.data, owners: ow.data, profiles: pf.data, loans: lo.data, history: hi.data });
      setState({ loading: false, error: "", missing: false });
    })();
    return () => { live = false; };
  }, [rev]);

  useEffect(() => {
    let live = true;
    supabase.rpc("a31_property_ledger", { p_from: range.from, p_to: range.to }).then(({ data: rows, error }) => {
      if (!live) return;
      if (error) setState((s) => ({ ...s, error: s.missing ? s.error : error.message }));
      setLedger({ key: rangeKey, rows: rows || [] });
    });
    return () => { live = false; };
  }, [rangeKey, range.from, range.to]);

  const model = useMemo(() => {
    if (!data) return null;
    const bookById = Object.fromEntries(data.books.map((b) => [b.id, b]));
    const ownerById = Object.fromEntries(data.owners.map((o) => [o.id, o]));
    const occupied = new Set(data.tenants.filter((t) => t.unit_id && !t.archived).map((t) => t.unit_id));
    const rows = data.properties.map((p) => {
      const books = bookById[p.accounting_entity_id] || null;
      const owner = books ? ownerById[books.owner_entity_id] || null : null;
      const profile = data.profiles.find((x) => x.property_id === p.id) || null;
      const loans = data.loans.filter((l) => l.property_id === p.id);
      const pl = ledger.rows.filter((r) => r.property_id === p.id);
      const snap = propertySnapshot({
        property: p, units: data.units.filter((u) => u.property_id === p.id).map((u) => ({ rent_amount: u.rent_amount, occupied: occupied.has(u.id) })),
        profile, loans, ledger: pl, history: data.history.find((h) => h.property_id === p.id) || null, period: range, today,
      });
      return { p, books, owner, profile, loans, ledger: pl, snap };
    });
    const inScope = rows.filter((r) => scope === "all" || (scope === "owned" ? r.owner && !r.owner.managed_for_client
      : scope === "managed" ? r.owner?.managed_for_client : r.owner?.id === scope));
    return { rows, inScope, portfolio: portfolioSnapshot(inScope.map((r) => r.snap)) };
  }, [data, ledger.rows, range, today, scope]);

  const sel = model?.rows.find((r) => r.p.id === selected) || null;
  const reload = () => { setModal(null); setRev((n) => n + 1); };
  async function deleteLoan(l) {
    const { error } = await supabase.from("property_loans").delete().eq("id", l.id);
    if (error) setState((s) => ({ ...s, error: error.message })); else reload();
  }
  const hasClients = data?.owners.some((o) => o.managed_for_client);
  const scopeLabel = scope === "all" ? "All properties" : scope === "owned" ? "Owned properties" : scope === "managed" ? "Managed for clients" : data?.owners.find((o) => o.id === scope)?.name;

  return (
    <LandlordLayout>
      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: font, padding: "clamp(20px, 4vw, 32px) clamp(16px, 4vw, 32px) 56px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 600, letterSpacing: "0.01em" }}>Financial Snapshot</div>
            <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>{scopeLabel} · {periodLabel}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select aria-label="Period" value={preset} onChange={(e) => setPreset(e.target.value)} style={selectStyle}>
              {SNAPSHOT_PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <select aria-label="Scope" value={scope} onChange={(e) => { setScope(e.target.value); setSelected(null); }} style={selectStyle}>
              <option value="all">All properties</option>
              <option value="owned">Owned properties</option>
              <option value="managed">Managed for clients</option>
              {data?.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: C.textSub, marginBottom: 18, alignItems: "center" }}>
          {Object.keys(KIND_LABEL).map((k) => <span key={k} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><KindChip kind={k} />{KIND_HELP[k]}</span>)}
        </div>

        {state.loading && <div style={{ color: C.textSub, fontSize: 13 }}>Loading…</div>}
        {state.missing && <div style={{ color: C.amber, fontSize: 13 }}>The financial snapshot isn't installed on this database yet.</div>}
        {state.error && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{state.error}</div>}

        {model && (<>
          {scope === "all" && hasClients && (
            <div style={{ background: `${C.blue}11`, border: `1px solid ${C.blue}33`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.blue, marginBottom: 14 }}>
              These totals combine your own properties with properties you manage for clients. Choose "Owned properties" for your own portfolio only.
            </div>
          )}
          <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
            Portfolio summary · {model.inScope.length} propert{model.inScope.length === 1 ? "y" : "ies"}
          </div>
          <MetricGrid metrics={model.portfolio.metrics} periodLabel={periodLabel} />

          <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", margin: "28px 0 10px" }}>Properties</div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Property", "Owner", "NOI", "Rent collected", "Cap rate", "DSCR", "Equity", "Inputs"].map((h, i) => (
                <th key={h} style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em", padding: "10px 14px", textAlign: i >= 2 && i <= 6 ? "right" : "left", borderBottom: `1px solid ${C.border}`, background: C.raised, whiteSpace: "nowrap" }}>{h}</th>))}</tr></thead>
              <tbody>
                {model.inScope.length === 0 && <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", fontSize: 13, color: C.textSub }}>No properties in this view.</td></tr>}
                {model.inScope.map((r) => {
                  const m = r.snap.metrics;
                  const cell = (metric, fmt) => <td style={{ padding: "11px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums", color: metric.available ? (metric.value < 0 ? C.red : C.text) : C.textMuted }} title={metric.available ? "" : metric.reason}>{metric.available ? fmt(metric.value) : "—"}</td>;
                  const active = r.p.id === selected;
                  return (
                    <tr key={r.p.id} onClick={() => setSelected(active ? null : r.p.id)} style={{ cursor: "pointer", background: active ? C.raised : "transparent" }}>
                      <td style={{ padding: "11px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 13, color: C.text, fontWeight: 500 }}>{r.p.name}</td>
                      <td style={{ padding: "11px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.textSub }}>{r.owner ? `${r.owner.name}${r.owner.managed_for_client ? " · client" : ""}` : "—"}</td>
                      {cell(m.noi, fmtMoney)}{cell(m.rentCollected, fmtMoney)}{cell(m.capRate, fmtPctValue)}{cell(m.dscr, fmtRatio)}{cell(m.equity, fmtMoney)}
                      <td style={{ padding: "11px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 11, color: r.snap.missing.length ? C.amber : C.green, whiteSpace: "nowrap" }}>
                        {r.snap.missing.length ? `${r.snap.missing.length} missing` : "Complete"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>Select a property for its full snapshot and to enter its value, purchase details and loans.</div>

          {sel && (
            <div style={{ marginTop: 18 }}>
              <PropertyDetail snap={sel.snap} owner={sel.owner} books={sel.books} profile={sel.profile} loans={sel.loans} ledger={sel.ledger} periodLabel={periodLabel}
                onEditProfile={() => setModal({ type: "profile" })} onAddLoan={() => setModal({ type: "loan", loan: null })}
                onEditLoan={(l) => setModal({ type: "loan", loan: l })} onDeleteLoan={deleteLoan} />
            </div>
          )}
          {sel && modal?.type === "profile" && <ProfileModal property={sel.p} profile={sel.profile} owner={sel.owner} onClose={() => setModal(null)} onSaved={reload} />}
          {sel && modal?.type === "loan" && <LoanModal property={sel.p} loan={modal.loan} onClose={() => setModal(null)} onSaved={reload} />}
        </>)}
      </div>
    </LandlordLayout>
  );
}
