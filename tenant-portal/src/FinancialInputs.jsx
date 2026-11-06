import { useState } from "react";
import { supabase } from "./supabase";
import { todayNY } from "./lib/accounting";
import { VALUE_SOURCES, loanPayment, fmtMoney, dollarsToCents, centsToDollars } from "./lib/snapshot";

// ─── A3.1 financial inputs: value, purchase, cash invested, debt status, owner relationship, loans ───
// Moved unchanged from FinancialSnapshot.jsx (A3.1 UI redesign). Writes go to property_financial_profiles,
// property_loans and ownership_entities.managed_for_client, under the existing landlord-only RLS.

import { C, font } from "./lib/financialTheme";
const field = { width: "100%", padding: "9px 11px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, background: C.raised, color: C.text, outline: "none", fontFamily: font, colorScheme: "dark", boxSizing: "border-box" };
export function Btn({ children, onClick, gold, danger, small, disabled }) {
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
export function ProfileModal({ property, profile, owner, onClose, onSaved }) {
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

export function LoanModal({ property, loan, onClose, onSaved }) {
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

