// api/_lib/maintenanceFollowup.js
// Completion follow-ups: the tenant is the source of truth for "is it actually fixed?".
//
//   Trigger                                   → ask the tenant (portal message + email when they have one)
//   contractor marks the work complete         → immediately (vendor portal "complete"; the sweep is the backstop)
//   the scheduled visit's time window passed   → at the next sweep (daily cron, any landlord/tenant page load)
//   no answer 24 h after the ask               → ONE reminder
//   no answer 24 h after the reminder          → flagged for management (email + ticket note); never auto-closed
//
// Each check belongs to one "cycle" (anchor): a specific contractor completion (done:<vendor comment id>) or a
// specific appointment (appt:<date>|<time window>). Progress is recorded as trusted system notes on the ticket
// ("[followup <anchor> <step>] …"), written BEFORE anything is sent, so a repeated or overlapping run never sends
// twice, and emails carry an idempotency key per step. A tenant reply only ever answers the newest open check on
// one of THEIR OWN tickets; once a ticket moves to a new cycle (reopened, rescheduled, re-completed), an old answer
// can't close it.
//
// What a tenant answer can do — and what it never does:
//   fixed        → recorded. The ticket is resolved only if it is not an emergency, has no contractor link, quote or
//                  invoice outstanding; otherwise management is asked to review/approve as usual. A tenant answer
//                  never approves a quote or invoice, never logs an expense, never pays anyone.
//   not fixed /  → recorded; the ticket is (re)opened as in progress; the contractor is told through the existing
//   no-show        vendor-portal email when they have one; management gets a suggested message and the contractor's
//                  primary/backup numbers (it never calls or texts anyone, never sends a different contractor and
//                  never authorises extra spending). A second failed cycle is marked "repeatedly unresolved".
//   return visit → recorded; management is asked to confirm the new appointment date.
//   unclear      → the tenant is asked to clarify; nothing changes.

import { note, deliver, vendorEmailFor, NOTE_AUTHOR } from "./maintenanceNotify.js";
import { managementRecipients } from "./recipients.js";
import { isValidEmail, APP_URL } from "../../src/lib/emailSafety.js";
import { contractorContacts } from "../../src/lib/vendorRouting.js";
import * as T from "./notificationTemplates.js";

export const REMINDER_AFTER_MS = 24 * 60 * 60 * 1000;
export const FLAG_AFTER_MS = 24 * 60 * 60 * 1000;
export const SWEEP_MAX_TICKETS = 25;
export const AI_NAME = "Modus AI Assistant";
const DAY = 24 * 60 * 60 * 1000;
const MARK = /^\[followup (\S+) (asked|reminded|flagged|answered:[a-z_]+)\]/;

// ── Interpreting the tenant's words ──────────────────────────────────────────────────────────────────────────
const norm = (s) => String(s || "").toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/\s+/g, " ").trim();
const NO_SHOW = /\b(?:nobody|no one|no-one|noone)\b[^.!?]{0,15}\b(?:showed|show|came|come|arrived|turned up)\b|\b(?:never|didn't|did not|hasn't|has not|haven't) (?:show(?:ed)? up|showed|come|came|arrive[d]?|turn(?:ed)? up)\b|\bno[- ]show\b|\bstill waiting for (?:him|her|them|the (?:contractor|plumber|handyman|guy|tech))\b/;
const RETURN = /\b(?:be|come|coming|is coming|will come|'ll come|'ll be) back\b|\b(?:return|returning) (?:tomorrow|later|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next)\b|\b(?:needs?|has) to (?:order|get) (?:a |the )?part|\b(?:ordering|ordered|waiting (?:on|for)) (?:a |the )?parts?\b|\bcome back\b/;
const NOT_FIXED = /\bstill\b[^.!?]{0,25}\b(?:leak\w*|drip\w*|broken|not working|doesn't work|isn't working|running|clogged|cold|no heat|no hot water|happening|there|the same|an issue|a problem|bad|wet)\b|\b(?:not|isn't|wasn't|hasn't been|never got|didn't get|did not get) (?:really |actually |fully |completely )?(?:fixed|working|resolved|repaired)\b|\b(?:didn't|did not|doesn't|does not) (?:fix|work|help)\b|\bsame (?:problem|issue)\b|\b(?:getting |got |even )?worse\b|\b(?:happen\w*|broke|broken|leak\w*|drip\w*|started|stopped working|clogged|out) again\b|^(?:no|nope|nah)(?:[.!,]|$)|^not (?:really|yet)\b/;
const FIXED = /\b(?:fixed|repaired|resolved)\b|\b(?:works|working) (?:now|fine|great|again|perfectly)\b|\beverything (?:works|is working|is fine|is good)\b|\ball (?:good|set|fixed|done)\b|\b(?:good|fine|great) now\b|\bno (?:more )?(?:leak\w*|drip\w*|problems?|issues?)\b|^(?:yes|yep|yeah|yup|it is|it's fine|it is fine)\b/;
// Messages that are clearly about the repair even when the outcome is unclear (so it's worth asking).
const ABOUT_REPAIR = /\b(?:fix\w*|repair\w*|plumber|contractor|handyman|technician|tech|guy|he|she|they|came|come|showed|visit|work(?:ed|ing)?|done|finished|leak\w*|drip\w*|heat|toilet|sink|lock|still)\b/;

export function interpretCompletionReply(message) {
  const t = norm(message);
  if (!t) return "unclear";
  if (NO_SHOW.test(t)) return "no_show";
  if (RETURN.test(t)) return "return_visit";
  if (NOT_FIXED.test(t)) return "not_fixed";
  if (FIXED.test(t)) return "fixed";
  return "unclear";
}

// ── Cycles (anchors) and their recorded state ────────────────────────────────────────────────────────────────
// End of a scheduled time window, as an instant (America/New_York). "Morning (8am–12pm)" → 12:00; unknown → 17:00.
export function appointmentEnd(dateStr, timeWindow) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ""))) return null;
  const hours = [...String(timeWindow || "").matchAll(/(\d{1,2})\s*(am|pm)/gi)].map(([, h, ap]) => (Number(h) % 12) + (ap.toLowerCase() === "pm" ? 12 : 0));
  const endHour = hours.length ? hours[hours.length - 1] : 17;
  const guess = Date.parse(`${dateStr}T${String(endHour).padStart(2, "0")}:00:00Z`);
  // New York offset on that date (−4 or −5 h).
  const nyHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date(guess)));
  const offset = ((endHour - nyHour) + 24) % 24;
  return guess + offset * 60 * 60 * 1000;
}

const isCompletionComment = (c) => c?.author_type === "vendor" && /marked work as complete/i.test(String(c.body || ""));

// The current cycle for a ticket, or null when no check applies. comments: all of the ticket's comments.
export function currentAnchor(ticket, comments, now) {
  if (!ticket || ticket.status === "resolved" || ticket.status === "open" || ticket.status === "quote_submitted") return null;
  if (ticket.status === "pending_review") {
    const done = (comments || []).filter(isCompletionComment).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    return done ? { anchor: `done:${done.id}`, reason: "done", dueAt: Date.parse(done.created_at) || 0 } : null;
  }
  if (ticket.status === "in_progress" && ticket.scheduled_date) {
    const end = appointmentEnd(ticket.scheduled_date, ticket.scheduled_time);
    if (end && now >= end && now - end < 14 * DAY) return { anchor: `appt:${ticket.scheduled_date}|${String(ticket.scheduled_time || "").replace(/\s+/g, "")}`, reason: "appt", dueAt: end };
  }
  return null;
}

const trusted = (c) => c?.author_type === "system" && c?.author_name === NOTE_AUTHOR && !c?.author_id;
// { asked, reminded, flagged, answered } (timestamps / outcome) recorded for one anchor.
export function cycleState(comments, anchor) {
  const st = { asked: null, reminded: null, flagged: null, answered: null };
  for (const c of (comments || []).filter(trusted)) {
    const m = String(c.body || "").match(MARK);
    if (!m || m[1] !== anchor) continue;
    const at = Date.parse(c.created_at) || 0;
    if (m[2] === "asked") st.asked = st.asked ?? at;
    else if (m[2] === "reminded") st.reminded = st.reminded ?? at;
    else if (m[2] === "flagged") st.flagged = st.flagged ?? at;
    else st.answered = m[2].slice("answered:".length);
  }
  return st;
}

// What the sweep should do now for this ticket: "ask" | "remind" | "flag" | null.
export function nextStep(state, now, dueAt = 0) {
  if (state.answered) return null;
  if (!state.asked) return now >= dueAt ? "ask" : null;
  if (!state.reminded) return now - state.asked >= REMINDER_AFTER_MS ? "remind" : null;
  if (!state.flagged) return now - state.reminded >= FLAG_AFTER_MS ? "flag" : null;
  return null;
}

// ── Data access ──────────────────────────────────────────────────────────────────────────────────────────────
const TICKET_COLS = "id, tenant_id, title, description, status, is_emergency, scheduled_date, scheduled_time, vendor_name, vendor_email, vendor_token, quote_amount, quote_approved_at, invoice_url, invoice_amount, created_at, updated_at, tenants(id, name, email, user_id, archived), units(unit_number, property_id, properties(name))";

async function loadComments(db, ticketId) {
  const { data, error } = await db.from("maintenance_comments").select("id, body, author_type, author_name, author_id, created_at").eq("request_id", ticketId);
  if (error) throw new Error(`comments: ${error.message || error}`);
  return data || [];
}

const view = (t) => ({ id: t.id, title: t.title, status: t.status, tenantName: t.tenants?.name || null,
  propertyName: t.units?.properties?.name || null, unitNumber: t.units?.unit_number || null });

async function vendorRecord(db, t) {
  if (!t.vendor_name) return null;
  const { data } = await db.from("vendors").select("id, name, phone, email, notes, active").eq("name", t.vendor_name).limit(1);
  return data?.[0] || null;
}

async function tellManagement({ db, send, env, t, key, headline, detail, tenantWords = null, withContractor = false, draft = null, retryDelayMs }) {
  const to = managementRecipients(env || {});
  if (!to.ok) { await note(db, t.id, `Email FAILED — follow-up to management (${headline}): no management email is configured (LANDLORD_EMAIL).`); return { status: "failed" }; }
  let contractor = null;
  if (withContractor && t.vendor_name) { const v = await vendorRecord(db, t); contractor = { name: t.vendor_name, ...contractorContacts(v) }; }
  return deliver({ db, send, ticketId: t.id, to: to.recipients, key, label: `follow-up to management (${headline})`, retryDelayMs,
    email: T.followupManagementEmail({ ticket: view(t), headline, detail, tenantWords, contractor, draft }) });
}

async function askTenant({ db, send, t, anchor, reason, reminder, retryDelayMs }) {
  const tenant = t.tenants;
  const where = reason === "appt" ? "Your repair visit has passed" : "The contractor has marked your repair as complete";
  const body = `${reminder ? "Reminder: " : ""}${where} — "${t.title}". Is it fully fixed? You can just reply here, for example "Yes, it's fixed", "Nobody showed up" or "It's still leaking".`;
  const out = { portal: "skipped", email: "skipped" };
  if (tenant?.user_id) {
    const { error } = await db.from("messages").insert({ sender_id: null, recipient_id: tenant.user_id, tenant_id: t.tenant_id, body, read: false, agent_name: AI_NAME, agent_photo: null });
    out.portal = error ? "failed" : "sent";
    if (error) await note(db, t.id, `Follow-up portal message FAILED (${reminder ? "reminder" : "completion check"}): ${String(error.message || error).slice(0, 150)}.`);
  }
  if (isValidEmail(tenant?.email)) {
    const r = await deliver({ db, send, ticketId: t.id, to: [tenant.email], key: `followup:${t.id}:${anchor}:${reminder ? "reminder" : "ask"}`,
      label: `completion ${reminder ? "reminder" : "check"} to tenant`, retryDelayMs,
      email: T.completionCheckEmail({ tenantName: tenant.name, ticketTitle: t.title, reason, reminder }) });
    out.email = r.status;
  }
  return out;
}

// Claim a step atomically enough for overlapping runs: insert the marker, then re-read; only the run whose marker is
// the earliest for this anchor+step (ties broken by id) goes on to send. A losing run sends nothing.
export async function claimStep(db, ticketId, anchor, step, body) {
  const marker = `[followup ${anchor} ${step}]`;
  const { data: mine, error } = await db.from("maintenance_comments").insert({
    request_id: ticketId, body: `${marker} ${body}`.slice(0, 1000), author_type: "system", author_name: NOTE_AUTHOR, visible_to_tenant: false,
  }).select("id, created_at").single();
  if (error || !mine?.id) { console.error("[followup] could not record step:", error?.message || error); return false; }
  const all = await loadComments(db, ticketId);
  const same = all.filter((c) => trusted(c) && String(c.body || "").startsWith(step.startsWith("answered:") ? `[followup ${anchor} answered:` : marker))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
  return same[0]?.id === mine.id;
}

// ── The sweep (scheduled / opportunistic) ────────────────────────────────────────────────────────────────────
// tenantId limits the sweep to one tenant's tickets (tenant page loads); ticketId to one ticket (vendor completion).
export async function sweepCompletionFollowups({ db, send, env, now = () => Date.now(), tenantId = null, ticketId = null, retryDelayMs } = {}) {
  const at = now();
  let q = db.from("maintenance_requests").select(TICKET_COLS).in("status", ["pending_review", "in_progress"]).not("tenant_id", "is", null);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  if (ticketId) q = q.eq("id", ticketId);
  const { data: tickets, error } = await q.order("updated_at", { ascending: true }).limit(SWEEP_MAX_TICKETS);
  if (error) return { status: "failed", error: String(error.message || error) };
  const out = { status: "ok", asked: 0, reminded: 0, flagged: 0, failed: 0 };
  for (const t of tickets || []) {
    if (!t.tenants || t.tenants.archived === true) continue;
    try {
      const comments = await loadComments(db, t.id);
      const cycle = currentAnchor(t, comments, at);
      if (!cycle) continue;
      const step = nextStep(cycleState(comments, cycle.anchor), at, cycle.dueAt);
      if (!step) continue;
      // Claim first: the marker is written before anything is sent, so an overlapping run sees it and stops.
      if (step === "ask") {
        if (!await claimStep(db, t.id, cycle.anchor, "asked", `Asked the tenant to confirm the repair (${cycle.reason === "appt" ? "scheduled visit passed" : "contractor reported completion"}).`)) continue;
        await askTenant({ db, send, t, anchor: cycle.anchor, reason: cycle.reason, reminder: false, retryDelayMs });
        out.asked++;
      } else if (step === "remind") {
        if (!await claimStep(db, t.id, cycle.anchor, "reminded", "No reply after 24 hours; one reminder sent to the tenant.")) continue;
        await askTenant({ db, send, t, anchor: cycle.anchor, reason: cycle.reason, reminder: true, retryDelayMs });
        out.reminded++;
      } else if (step === "flag") {
        if (!await claimStep(db, t.id, cycle.anchor, "flagged", "No reply to the completion check or the reminder. Flagged for management; the ticket stays open.")) continue;
        await tellManagement({ db, send, env, t, key: `followup-flag:${t.id}:${cycle.anchor}`, retryDelayMs, withContractor: true,
          headline: "No reply to completion check", detail: "The tenant hasn't answered the completion check or the reminder (48 hours). The ticket was NOT closed. Please check with the tenant directly." });
        out.flagged++;
      }
    } catch (e) {
      console.error("[followup] ticket failed:", t.id, e?.message || e);
      out.failed++;
    }
  }
  return out;
}

// ── Tenant replies (called by /api/classify-and-route before the AI) ───────────────────────────────────────────
// Returns null when the message isn't an answer to an open completion check (the normal assistant handles it), or
// { reply, outcome, ticketId } after recording and acting on it. Callers must skip this for emergencies.
export async function handleCompletionReply({ db, send, env, tenantId, message, now = () => Date.now(), retryDelayMs }) {
  if (!tenantId) return null;
  const at = now();
  const { data: tickets, error } = await db.from("maintenance_requests").select(TICKET_COLS)
    .eq("tenant_id", tenantId).in("status", ["pending_review", "in_progress"]);
  if (error || !tickets?.length) return null;

  // Open checks: asked, not answered, still the ticket's CURRENT cycle (a reopened/rescheduled ticket has a new one).
  const open = [];
  for (const t of tickets) {
    if (t.tenant_id !== tenantId) continue;                  // defence in depth: never another tenant's ticket
    const comments = await loadComments(db, t.id);
    const cycle = currentAnchor(t, comments, at);
    if (!cycle) continue;
    const st = cycleState(comments, cycle.anchor);
    if (st.asked && !st.answered) open.push({ t, cycle, comments, askedAt: st.asked });
  }
  if (!open.length) return null;

  const outcome = interpretCompletionReply(message);
  if (outcome === "unclear") {
    if (!ABOUT_REPAIR.test(norm(message))) return null;      // probably about something else: the assistant answers
    const titles = open.map((o) => `"${o.t.title}"`).join(" or ");
    return { outcome, ticketId: null, reply: `Thanks! Just to check on ${titles}: is it fully fixed now, or is something still not right? (For example "Yes, it's fixed", "Nobody came" or "It's still leaking".)` };
  }
  if (open.length > 1) {
    return { outcome: "which", ticketId: null, reply: `Thanks — which repair is that about: ${open.map((o) => `"${o.t.title}"`).join(", ")}? Please include a word or two from the request so I update the right one.` };
  }

  const { t, cycle } = open[0];
  const words = String(message).slice(0, 500);
  // Only one answer per check: a concurrent reply that loses the claim changes nothing.
  if (!await claimStep(db, t.id, cycle.anchor, `answered:${outcome}`, `Tenant replied: "${words}"`)) return null;

  if (outcome === "fixed") {
    const billable = t.vendor_token || t.quote_amount != null || t.invoice_url || t.invoice_amount != null || t.status === "pending_review";
    const emergency = t.is_emergency === true;
    if (!billable && !emergency) {
      // Guarded on the status we read, so a concurrent change (e.g. management reopened it) is never overwritten.
      const { error: upErr } = await db.from("maintenance_requests").update({ status: "resolved", resolved_at: new Date(at).toISOString(), updated_at: new Date(at).toISOString() })
        .eq("id", t.id).eq("tenant_id", tenantId).eq("status", t.status);
      if (!upErr) {
        await note(db, t.id, "Closed after the tenant confirmed the repair is fixed (no contractor link, quote or invoice outstanding).");
        return { outcome, ticketId: t.id, reply: `Great, thanks for confirming! I've closed "${t.title}". If anything comes back, just message me here.` };
      }
    }
    await tellManagement({ db, send, env, t, key: `followup-confirmed:${t.id}:${cycle.anchor}`, retryDelayMs, tenantWords: words,
      headline: "Tenant confirmed the repair",
      detail: emergency
        ? "The tenant says this emergency repair is fixed. Emergency tickets are never closed automatically: please verify and close it."
        : "The tenant says the repair is fixed. Review the contractor's completion (and any quote or invoice) and approve or close it as usual. The tenant's confirmation did not approve anything." });
    return { outcome, ticketId: t.id, reply: `Great, thanks for confirming! I've let management know so they can wrap up "${t.title}".` };
  }

  if (outcome === "return_visit") {
    if (t.status !== "in_progress") await db.from("maintenance_requests").update({ status: "in_progress", updated_at: new Date(at).toISOString() }).eq("id", t.id).eq("status", t.status);
    await tellManagement({ db, send, env, t, key: `followup-return:${t.id}:${cycle.anchor}`, retryDelayMs, tenantWords: words, withContractor: true,
      headline: "Contractor returning",
      detail: "The tenant says the contractor will come back. Please confirm the new visit date in Modus (Assign / reschedule) so the next check happens after it." });
    return { outcome, ticketId: t.id, reply: `Thanks for the update. I've noted that the contractor is coming back for "${t.title}" and asked management to confirm the new visit time.` };
  }

  // not_fixed / no_show: reopen, tell the contractor through the existing vendor-portal email if they have one, and
  // give management the numbers and a suggested message. Nothing is paid, approved or re-dispatched.
  if (t.status !== "in_progress") {
    await db.from("maintenance_requests").update({ status: "in_progress", updated_at: new Date(at).toISOString() }).eq("id", t.id).eq("status", t.status);
    await note(db, t.id, `Reopened (in progress): the tenant reports ${outcome === "no_show" ? "the contractor did not arrive" : "the problem is not fixed"}.`);
  }
  const failedCycles = new Set(open[0].comments.filter(trusted).map((c) => String(c.body || "").match(MARK)).filter((m) => m && /^answered:(not_fixed|no_show)$/.test(m[2])).map((m) => m[1]));
  failedCycles.add(cycle.anchor);
  const repeated = failedCycles.size >= 2;
  const issue = outcome === "no_show" ? "The contractor did not arrive for the scheduled visit." : "The tenant reports the problem is not fixed.";
  const draft = `Hi${t.vendor_name ? ` ${t.vendor_name}` : ""}, this is Modus Property Management about "${t.title}" at ${[view(t).propertyName, view(t).unitNumber && `Unit ${view(t).unitNumber}`].filter(Boolean).join(", ")}. ${outcome === "no_show" ? "The tenant says nobody arrived for the scheduled visit." : "The tenant says the problem is still not fixed."} Can you give us a new time to come back? No additional work is approved beyond the original scope without our sign-off.`;

  let vendor = "no_email";
  const email = t.vendor_token ? await vendorEmailFor(db, t) : null;
  if (email) {
    const r = await deliver({ db, send, ticketId: t.id, to: [email], key: `followup-vendor:${t.id}:${cycle.anchor}`, label: "follow-up request to contractor", retryDelayMs,
      email: T.vendorMoreWorkEmail({ vendorName: t.vendor_name, ticketTitle: t.title, pmNotes: `${issue} Tenant: "${words}". Please reply in the portal with a new visit time. No additional work is approved beyond the original scope.`, vendorLink: `${APP_URL}/vendor/${encodeURIComponent(t.vendor_token)}` }) });
    vendor = r.status;
  }
  await tellManagement({ db, send, env, t, key: `followup-unresolved:${t.id}:${cycle.anchor}`, retryDelayMs, tenantWords: words, withContractor: true, draft,
    headline: repeated ? "Repeatedly unresolved" : outcome === "no_show" ? "Contractor didn't arrive" : "Repair not fixed",
    detail: `${issue}${repeated ? " This is at least the second follow-up that failed for this ticket." : ""} The ticket is back in progress. ${vendor === "sent" ? "The contractor was emailed through the Modus vendor portal and asked for a new time." : "The contractor has no portal email on file: please contact them (primary number first; the backup only if the primary is unavailable)."}` });
  return { outcome, ticketId: t.id, reply: outcome === "no_show"
    ? `Sorry about that. I've reopened "${t.title}" and asked for a new visit time. Management has been told.`
    : `Sorry it's still not right. I've reopened "${t.title}" and asked for a follow-up visit. Management has been told. If it becomes unsafe (water pouring, sparks, a gas smell), tell me right away and call 911 if anyone is in danger.` };
}
