// src/lib/tenantFinancials.js
// What the tenant Home dashboard shows about money. Pure helpers plus one read-only fetch; no writes.
//
// Three separate concepts, never substituted for one another:
//   1. Base rent on file   — units.rent_amount. Shown only as rent, never as an amount owed.
//   2. Recurring charges   — active recurring_charges rows (rent, parking, storage, pets…): the
//                            scheduled monthly charges. Not an amount currently owed.
//   3. Balance due         — posted charges minus payments, credits and adjustments, from the
//                            authoritative receivables ledger (a2_tenant_ledger, integer cents).
//                            When receivables are inactive, the ledger can't be read, or it has no
//                            posted activity, the balance is "unavailable": no rent or charge total is
//                            ever shown in its place.
//
// Evidence for a balance (including $0): the ledger returned at least one posted row. a2_tenant_ledger
// returns rows only for a tenant it recognises and the caller may see, once receivables are active, so a
// non-empty result establishes all three. An EMPTY result is ambiguous (unknown tenant, no access, not yet
// set up, missing opening balance, or genuinely no activity) and is never shown as $0. The tenant cannot
// read the landlord-only opening-balance confirmations, so a "confirmed zero" with no rows stays unavailable.
//
// ledger_entries is not read: nothing posts to it yet, and it is not the receivables source of truth.
// Legacy payments rows are shown only as records with their own status; they never produce a balance.

import { paymentCents } from "./accounting.js";

// ── Recurring charges ──────────────────────────────────────────────────────

const isActiveCharge = (c) => c && c.active !== false && (c.status == null || String(c.status).toLowerCase() === "active");

// Integer cents for one recurring charge: amount (dollars) when set, else amount_cents. null if neither.
export function chargeCents(c) {
  if (c?.amount != null && c.amount !== "" && Number.isFinite(Number(c.amount))) return Math.round(Number(c.amount) * 100);
  if (c?.amount_cents != null && Number.isFinite(Number(c.amount_cents))) return Math.round(Number(c.amount_cents));
  return null;
}

// Rent-category charges are listed as rent; everything else is an additional recurring charge.
// The category is taken as recorded; nothing is inferred to be rent.
export const isRentCharge = (c) => String(c?.category || "").trim().toLowerCase() === "rent";

export function monthlyChargesSummary(charges) {
  const items = (charges || []).filter(isActiveCharge).map((c) => {
    const cents = chargeCents(c);
    return {
      id: c.id ?? null,
      label: String(c.category || "").trim() || "Recurring charge",
      note: c.note ? String(c.note) : "",
      cents,
      isRent: isRentCharge(c),
      startDate: c.start_date || null,
    };
  });
  // Rent first, then the rest in their recorded order.
  const ordered = [...items.filter((i) => i.isRent), ...items.filter((i) => !i.isRent)];
  const totalCents = ordered.reduce((s, i) => s + (i.cents ?? 0), 0);
  return { items: ordered, totalCents, hasCharges: ordered.length > 0, missingAmounts: ordered.some((i) => i.cents == null) };
}

// ── Balance due ────────────────────────────────────────────────────────────

// statusResult / ledgerResult are Supabase responses: { data, error }.
// reasons: "error" | "receivables_inactive" | "no_activity".
export function resolveBalance({ statusResult, ledgerResult }) {
  if (!statusResult || statusResult.error || !statusResult.data) return { state: "unavailable", reason: "error" };
  if (statusResult.data.active !== true) return { state: "unavailable", reason: "receivables_inactive" };
  if (!ledgerResult || ledgerResult.error || !Array.isArray(ledgerResult.data)) return { state: "unavailable", reason: "error" };
  const rows = ledgerResult.data;
  if (!rows.length) return { state: "unavailable", reason: "no_activity" };   // ambiguous: never a confirmed $0
  const last = rows[rows.length - 1]?.balance_cents;
  if (last == null || last === "" || !Number.isFinite(Number(last))) return { state: "unavailable", reason: "error" };
  return { state: "available", cents: Math.round(Number(last)) };
}

// Read-only: a2_status, then (only if receivables are active) the caller's own a2_tenant_ledger.
// Returns { mode, balance, rows }: mode "ledger" when the ledger was read, "legacy" when receivables
// are inactive, "error" when the status or ledger couldn't be read. rows are the ledger rows (ledger mode
// only). Home and Activity both use this, so they always show the same balance. Never throws.
export async function fetchTenantLedger(client) {
  try {
    const statusResult = await client.rpc("a2_status");
    if (statusResult?.error || !statusResult?.data) return { mode: "error", balance: resolveBalance({ statusResult }), rows: [] };
    if (statusResult.data.active !== true) return { mode: "legacy", balance: resolveBalance({ statusResult }), rows: [] };
    const ledgerResult = await client.rpc("a2_tenant_ledger", { p_tenant: null });
    const balance = resolveBalance({ statusResult, ledgerResult });
    if (ledgerResult?.error || !Array.isArray(ledgerResult?.data)) return { mode: "error", balance, rows: [] };
    return { mode: "ledger", balance, rows: ledgerResult.data };
  } catch {
    return { mode: "error", balance: { state: "unavailable", reason: "error" }, rows: [] };
  }
}

export async function fetchTenantBalance(client) {
  return (await fetchTenantLedger(client)).balance;
}

// ── Legacy payment records (receivables inactive) ─────────────────────────
// Shown as records only. "received" is true only for status "paid" (any case) that isn't voided; every
// other status — Unpaid, pending, failed, refunded, unknown — is not money received.
const STATUS_TEXT = {
  paid: "Paid", unpaid: "Unpaid — not received", pending: "Processing — not yet received",
  processing: "Processing — not yet received", failed: "Failed — not received", refunded: "Refunded",
  canceled: "Canceled — not received", cancelled: "Canceled — not received",
};
export function paymentRecordStatus(p) {
  if (p?.voided_at) return { label: "Voided — not received", received: false };
  const s = String(p?.status ?? "").trim().toLowerCase();
  if (s === "paid") return { label: "Paid", received: true };
  return { label: STATUS_TEXT[s] || (s ? `${p.status} — not confirmed received` : "Status unknown — not confirmed received"), received: false };
}

export function paymentRecordsView(payments) {
  return (payments || []).map((p) => {
    const st = paymentRecordStatus(p);
    const cents = paymentCents(p);
    return {
      id: p.id,
      date: p.paid_at || p.created_at || null,
      description: ["Payment record", p.category, p.source || p.method].filter(Boolean).join(" · "),
      cents: Number.isFinite(cents) ? cents : null,
      statusLabel: st.label,
      received: st.received,
    };
  }).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

export const formatCents = (cents) =>
  `$${(Math.abs(Number(cents)) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// What the Balance Due card says. tone: "neutral" | "due" | "clear".
export function balancePresentation(balance) {
  if (!balance || balance.state === "loading") return { amountText: "…", detail: "Loading your balance…", tone: "neutral", available: false };
  if (balance.state !== "available") {
    if (balance.reason === "no_activity") {
      return { amountText: "Balance unavailable — no posted activity yet", detail: "Contact management to confirm what you owe.", tone: "neutral", available: false };
    }
    return {
      amountText: "Balance unavailable",
      detail: balance.reason === "receivables_inactive"
        ? "Your account balance isn't available online yet. Contact management to confirm what you owe."
        : "We couldn't load your balance right now. Refresh the page, or contact management to confirm what you owe.",
      tone: "neutral",
      available: false,
    };
  }
  const c = balance.cents;
  if (c > 0) return { amountText: formatCents(c), detail: "Amount due", tone: "due", available: true };
  if (c < 0) return { amountText: formatCents(c), detail: "Credit on account", tone: "clear", available: true };
  return { amountText: formatCents(0), detail: "Account current", tone: "clear", available: true };
}

// ── Landlord views: each tenant's standing ─────────────────────────────────
// Lease defines base rent; recurring charges define billing; ONLY the receivables ledger defines what is owed.
// Landlord screens (dashboard and reports rent rolls, properties roster, tenant list, tenant detail) previously showed
// a unit's rent as "overdue" whenever no paid payment record existed — e.g. "-$1 Amount overdue" for a brand-new
// dummy tenant with no charges. They now use this: a balance appears only from a2_tenant_balances while receivables
// are active; otherwise the tenant is "Not tracked" with the reason. Rent is never shown as an amount owed.

// → { mode: "ledger" | "inactive" | "error", byTenant: Map(tenantId → balance cents) }. Never throws.
export async function fetchLandlordBalances(client, { asOf } = {}) {
  const none = (mode) => ({ mode, byTenant: new Map() });
  try {
    const st = await client.rpc("a2_status");
    if (st?.error || !st?.data) return none("error");
    if (st.data.active !== true) return none("inactive");
    const r = await client.rpc("a2_tenant_balances", { p_as_of: asOf ?? null, p_scope: "portfolio", p_scope_id: null });
    if (r?.error || !Array.isArray(r?.data)) return none("error");
    const byTenant = new Map();
    for (const row of r.data) {
      const c = row?.balance_cents;
      if (row?.tenant_id && c != null && c !== "" && Number.isFinite(Number(c))) byTenant.set(row.tenant_id, Math.round(Number(c)));
    }
    return { mode: "ledger", byTenant };
  } catch {
    return none("error");
  }
}

const localDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

// status: "vacant" | "archived" | "owes" | "current" | "credit" | "upcoming" | "untracked"
// cents: ledger balance (positive = owed, negative = credit) or null when there is no ledger balance.
// reason (untracked/upcoming): "receivables_inactive" | "error" | "no_activity".
export function rentStanding(tenant, balances, { today = new Date() } = {}) {
  if (!tenant) return { status: "vacant", cents: null };
  if (tenant.archived) return { status: "archived", cents: null };
  const start = localDate(tenant.lease_start);
  const upcoming = Boolean(start && start.getTime() > today.getTime());
  const mode = balances?.mode;
  if (mode !== "ledger") {
    return { status: upcoming ? "upcoming" : "untracked", cents: null, reason: mode === "inactive" ? "receivables_inactive" : "error" };
  }
  if (!balances.byTenant?.has(tenant.id)) return { status: upcoming ? "upcoming" : "untracked", cents: null, reason: "no_activity" };
  const cents = balances.byTenant.get(tenant.id);
  return { status: cents > 0 ? "owes" : cents < 0 ? "credit" : "current", cents };
}

export const STANDING = Object.freeze({
  owes:      { label: "Balance due",    tone: "red" },
  current:   { label: "Paid up",        tone: "green" },
  credit:    { label: "Credit",         tone: "green" },
  untracked: { label: "Not tracked",    tone: "muted" },
  upcoming:  { label: "Lease upcoming", tone: "muted" },
  vacant:    { label: "Vacant",         tone: "muted" },
  archived:  { label: "Past tenant",    tone: "muted" },
});

const REASON_TEXT = {
  receivables_inactive: "Receivables aren't active yet, so balances aren't tracked online. Confirm amounts outside Modus.",
  no_activity: "No posted charges or payments in the receivables ledger for this tenant.",
  error: "The balance couldn't be loaded. Try again, or check Receivables.",
};

// What a balance cell/card shows. amountText is null when there is no ledger balance (never "$0" in that case).
export function standingDisplay(s) {
  const cfg = STANDING[s?.status] || STANDING.untracked;
  const usd = (c) => `$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (s && Number.isFinite(s.cents)) {
    const amountText = s.cents > 0 ? `${usd(s.cents)} due` : s.cents < 0 ? `${usd(s.cents)} credit` : "$0.00";
    return { label: cfg.label, tone: cfg.tone, amountText, note: "From the receivables ledger." };
  }
  return { label: cfg.label, tone: cfg.tone, amountText: null, note: s?.reason ? REASON_TEXT[s.reason] : "" };
}

// Sum of ledger balances owed (cents) across standings; null when no standing has a ledger balance.
export function totalOwedCents(standings) {
  const owed = (standings || []).filter((s) => Number.isFinite(s?.cents));
  return owed.length ? owed.reduce((sum, s) => sum + Math.max(0, s.cents), 0) : null;
}
