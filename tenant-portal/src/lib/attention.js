// "Needs Attention" for the management dashboard (pure; unit-tested in tests/attention.test.mjs).
// Only facts the database records are listed. Nothing is inferred about money: balance items appear only when the
// receivables ledger is active (balances.mode === "ledger"); otherwise no overdue/unpaid claim is made at all.
import { rentStanding, standingDisplay } from "./tenantFinancials.js";

const DAY = 864e5;
const INCIDENT_LABEL = { PARKING_DISPUTE: "Parking", TRASH: "Trash / dumpster", NOISE_COMPLAINT: "Noise", LEASE_VIOLATION: "Lease issue", TENANT_DAMAGE: "Damage", OTHER: "Owner action" };

// severity: 0 = safety/urgent, 1 = needs a decision, 2 = time-sensitive follow-up
export function buildAttention({ tickets = [], incidents = [], tenants = [], balances = null, now = new Date() } = {}) {
  const items = [];
  const where = (t) => [t.units?.properties?.name, t.units?.unit_number && `Unit ${t.units.unit_number}`].filter(Boolean).join(" · ");

  for (const t of tickets) {
    if (t.status === "resolved") continue;
    const to = `/landlord/maintenance/${t.id}`;
    const urgent = t.is_emergency || t.priority === "urgent";
    if (urgent && (t.status === "open" || !t.vendor_name)) {
      items.push({ id: `t-urgent-${t.id}`, kind: "maintenance", severity: 0, title: t.title || "Urgent maintenance", detail: `${t.is_emergency ? "Emergency" : "Urgent"} · ${where(t)}`, action: { label: t.vendor_name ? "Check status" : "Arrange contractor", to }, at: t.created_at });
    } else if (t.status === "quote_submitted") {
      items.push({ id: `t-quote-${t.id}`, kind: "quote", severity: 1, title: `Quote to approve: ${t.title || "maintenance"}`, detail: `${t.quote_amount != null ? `$${Number(t.quote_amount).toLocaleString("en-US")} · ` : ""}${t.vendor_name || "Contractor"} · ${where(t)}`, action: { label: "Review quote", to }, at: t.quote_submitted_at || t.created_at });
    } else if (t.owner_approval_required && !t.owner_approved_at) {
      items.push({ id: `t-owner-${t.id}`, kind: "approval", severity: 1, title: `Owner approval: ${t.title || "maintenance"}`, detail: where(t), action: { label: "Review", to }, at: t.created_at });
    } else if (t.status === "pending_review") {
      items.push({ id: `t-review-${t.id}`, kind: "approval", severity: 1, title: `Work completed: ${t.title || "maintenance"}`, detail: `Review the work and invoice · ${where(t)}`, action: { label: "Review & close", to }, at: t.updated_at || t.created_at });
    } else if (t.status === "open" && !t.vendor_name && now - new Date(t.created_at) > DAY) {
      items.push({ id: `t-unassigned-${t.id}`, kind: "maintenance", severity: 2, title: `No contractor yet: ${t.title || "maintenance"}`, detail: `Reported ${Math.floor((now - new Date(t.created_at)) / DAY)} d ago · ${where(t)}`, action: { label: "Assign", to }, at: t.created_at });
    }
  }

  for (const i of incidents) {
    if (i.status === "resolved") continue;
    const kind = i.details_json?.owner_topic_kind;
    items.push({ id: `i-${i.id}`, kind: "incident", severity: 1,
      title: `${INCIDENT_LABEL[i.category] || "Owner action"}${kind && !INCIDENT_LABEL[i.category] ? ` (${kind})` : ""} reported`,
      detail: [i.properties?.name, i.tenants?.name, i.details_json?.intent_summary].filter(Boolean).join(" · ") || "Owner-action item from a tenant message",
      action: { label: "Review in Agent Center", to: "/landlord/agent" }, at: i.created_at });
  }

  for (const t of tenants) {
    if (t.archived) continue;
    const name = t.name || "Tenant";
    const unit = t.units?.unit_number ? ` · Unit ${t.units.unit_number}` : "";
    if (t.lease_end) {
      const days = Math.ceil((new Date(`${t.lease_end}T12:00:00`) - now) / DAY);
      if (days >= 0 && days <= 60 && !t.lease_end_action) items.push({ id: `l-${t.id}`, kind: "lease", severity: 2, title: `Lease ends in ${days} d: ${name}`, detail: `Renewal decision not recorded${unit}`, action: { label: "Open tenant", to: `/landlord/tenants/${t.id}` }, at: t.lease_end });
      else if (days < 0 && days >= -30 && !t.lease_end_action) items.push({ id: `l-${t.id}`, kind: "lease", severity: 1, title: `Lease ended ${-days} d ago: ${name}`, detail: `No renewal or move-out recorded${unit}`, action: { label: "Open tenant", to: `/landlord/tenants/${t.id}` }, at: t.lease_end });
    }
    if (t.insurance_expires) {
      const days = Math.ceil((new Date(`${t.insurance_expires}T12:00:00`) - now) / DAY);
      if (days <= 14 && days >= -30) items.push({ id: `ins-${t.id}`, kind: "lease", severity: 2, title: days < 0 ? `Renter's insurance expired: ${name}` : `Renter's insurance expires in ${days} d: ${name}`, detail: unit.replace(/^ · /, "") || "Insurance on file", action: { label: "Open tenant", to: `/landlord/tenants/${t.id}` }, at: t.insurance_expires });
    }
    if (t.invite_sent_at && !t.user_id && now - new Date(t.invite_sent_at) > 3 * DAY) {
      items.push({ id: `inv-${t.id}`, kind: "lease", severity: 2, title: `Invitation not accepted: ${name}`, detail: `Sent ${Math.floor((now - new Date(t.invite_sent_at)) / DAY)} d ago${unit}`, action: { label: "Open tenant", to: `/landlord/tenants/${t.id}` }, at: t.invite_sent_at });
    }
    if (balances?.mode === "ledger") {
      const s = rentStanding(t, balances, { today: now });
      if (s.status === "owes") items.push({ id: `bal-${t.id}`, kind: "finance", severity: 1, title: `Balance due: ${name}`, detail: `${standingDisplay(s).amountText || "Ledger balance outstanding"}${unit}`, action: { label: "View ledger", to: `/landlord/financials/${t.id}` }, at: null });
    }
  }

  return items.sort((a, b) => a.severity - b.severity || String(a.at || "").localeCompare(String(b.at || "")));
}
