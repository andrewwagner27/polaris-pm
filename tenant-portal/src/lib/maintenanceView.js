// Presentation rules for maintenance tickets (no React, no Supabase; unit-tested in tests/maintenance-view.test.mjs).
// Everything here is derived from the ticket's own recorded fields. A stage is shown as done only when the ticket
// says it happened; a stage that a later stage overtook is shown as "skipped", never as done.

export const STAGES = ["reported", "assigned", "quoted", "approved", "resolved"];
export const STAGE_LABEL = { reported: "Reported", assigned: "Assigned", quoted: "Quoted", approved: "Approved", resolved: "Resolved" };

// [{ key, label, state: done|current|upcoming|skipped, at: ISO|null }]
export function ticketTimeline(t) {
  const resolved = t?.status === "resolved";
  const done = {
    reported: true,
    assigned: !!(t?.vendor_name || t?.work_order_accepted_at),
    quoted:   !!(t?.quote_submitted_at || (t?.quote_amount != null && t?.quote_amount !== "")),
    approved: !!(t?.quote_approved_at || t?.owner_approved_at),
    resolved,
  };
  const at = {
    reported: t?.created_at || null,
    assigned: t?.work_order_accepted_at || null,          // accepted time; the assignment time itself isn't recorded
    quoted:   t?.quote_submitted_at || null,
    approved: t?.quote_approved_at || t?.owner_approved_at || null,
    resolved: resolved ? (t?.resolved_at || null) : null,
  };
  const lastDone = Math.max(...STAGES.map((s, i) => (done[s] ? i : -1)));
  let currentMarked = false;
  return STAGES.map((key, i) => {
    let state;
    if (done[key]) state = "done";
    else if (i < lastDone) state = "skipped";
    else if (!resolved && !currentMarked) { state = "current"; currentMarked = true; }
    else state = "upcoming";
    return { key, label: STAGE_LABEL[key], state, at: done[key] ? at[key] : null };
  });
}

const money = (n) => `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

// The one thing management should do next, or null when nothing is waiting on them.
// { label, owner: "you" | "contractor" | "tenant", tone: "urgent" | "action" | "waiting" }
export function nextAction(t) {
  if (!t || t.status === "resolved") return null;
  const urgent = t.is_emergency || t.priority === "urgent";
  if (t.owner_approval_required && !t.owner_approved_at) return { label: "Owner approval required before work continues", owner: "you", tone: "action" };
  switch (t.status) {
    case "open":
      return t.vendor_name
        ? { label: `Waiting for ${t.vendor_name} to accept the work order`, owner: "contractor", tone: urgent ? "urgent" : "waiting" }
        : { label: urgent ? "Urgent: arrange a contractor now" : "Assign a contractor", owner: "you", tone: urgent ? "urgent" : "action" };
    case "quote_submitted":
      return { label: t.quote_amount != null ? `Review the ${money(t.quote_amount)} quote` : "Review the contractor's quote", owner: "you", tone: "action" };
    case "pending_review":
      return { label: "Review the completed work and invoice, then approve or request more work", owner: "you", tone: "action" };
    case "in_progress":
      if (t.vendor_name && !t.work_order_accepted_at) return { label: `Waiting for ${t.vendor_name} to accept the work order`, owner: "contractor", tone: "waiting" };
      return { label: "Contractor working. Mark resolved once the work is confirmed", owner: "contractor", tone: "waiting" };
    default:
      return { label: "Review this ticket", owner: "you", tone: "action" };
  }
}

// "3 h", "2 d", "5 wk" since `iso` (or "—").
export function ageLabel(iso, now = new Date()) {
  const ms = now - new Date(iso);
  if (!iso || !Number.isFinite(ms)) return "—";
  const h = Math.max(0, Math.floor(ms / 3.6e6));
  if (h < 1) return "just now";
  if (h < 48) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 21) return `${d} d`;
  return `${Math.floor(d / 7)} wk`;
}

// A tel: link only for a complete North American number (10 digits, or 11 starting with 1). Anything else — partial,
// placeholder, letters, international without a known format — gets no call chip.
export function telHref(phone) {
  if (typeof phone !== "string") return null;
  if (/[a-z]/i.test(phone)) return null;
  const d = phone.replace(/\D/g, "");
  const n = d.length === 11 && d[0] === "1" ? d.slice(1) : d;
  if (n.length !== 10 || /^[01]/.test(n) || /^(\d)\1{9}$/.test(n) || /^555/.test(n.slice(3))) return null;
  return `tel:+1${n}`;
}
