// api/_lib/maintenanceNotify.js
// Server-side notifications for maintenance tickets, vendor work and inspections.
//
// Callers name an EVENT and the ids involved — never recipients, subjects or HTML. Each event:
//   1. checks the caller may raise it (tenant owns the ticket/inspection; landlord for landlord events),
//   2. loads every value it shows from the database,
//   3. resolves the recipient here (management via recipients.js; tenant/vendor from their records),
//   4. sends with an idempotency key that includes a hash of the exact payload (email.payloadKey), so one
//      key is only ever used with one payload; transient failures are retried with the same key+payload,
//   5. records failures, unconfirmed sends and new-request notifications as an internal ticket note
//      (maintenance_comments, author_type "system", author "Modus notifications", visible_to_tenant
//      false, hidden from vendors), so problems are visible to management in the ticket thread.
// Trusted markers are only notes with author_type "system" and no author_id: tenants can't write those
// (WP1 insert policy requires author_type 'tenant' and author_id = auth.uid()). No migration needed.
// Every function returns { status, ... } and never throws except NotifyError for bad/unauthorized requests.
// "sent" means Resend returned an email id; "unconfirmed" means the outcome is unknown.

import { detectEmergency } from "./aiSafety.js";
import { managementRecipients } from "./recipients.js";
import { sendEmailReliably, payloadKey } from "./email.js";
import { sendEmergencySms, smsBody } from "./emergencySms.js";
import { isValidEmail, APP_URL } from "../../src/lib/emailSafety.js";
import * as T from "./notificationTemplates.js";

export const NOTE_AUTHOR = "Modus notifications";
const CREATED_NOTE = "Management emailed about this new request";
const SMS_NOTE = "Emergency SMS";
// A tenant may raise the new-request alert only shortly after creating the ticket (the form calls it
// immediately); older tickets can't be used to re-trigger alerts or SMS. Landlords are not limited.
export const TENANT_ALERT_WINDOW_MS = 30 * 60 * 1000;

export class NotifyError extends Error { constructor(status, message) { super(message); this.status = status; } }

const isLandlord = (caller) => caller?.role === "landlord";
const uid = (caller) => caller?.user?.id || null;
const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Malformed ids are the client's error (400), not a database failure (500).
export function requireUuid(value, name) {
  const v = str(value);
  if (!v) throw new NotifyError(400, `${name} is required`);
  if (!UUID_RE.test(v)) throw new NotifyError(400, `${name} is not a valid id`);
  return v;
}
// Notes only the service role can have written (see header).
const isTrustedNote = (c) => c?.author_type === "system" && c?.author_name === NOTE_AUTHOR && !c?.author_id;
async function trustedNotes(db, ticketId) {
  const { data } = await db.from("maintenance_comments").select("id, body, author_type, author_name, author_id")
    .eq("request_id", ticketId).eq("author_type", "system").eq("author_name", NOTE_AUTHOR);
  return (data || []).filter(isTrustedNote);
}

async function loadTicket(db, ticketId) {
  ticketId = requireUuid(ticketId, "ticket_id");
  const { data, error } = await db.from("maintenance_requests")
    .select("*, tenants(id, name, email, user_id), units(unit_number, properties(name))")
    .eq("id", ticketId).maybeSingle();
  if (error) throw new NotifyError(500, "Could not load the ticket");
  if (!data) throw new NotifyError(404, "Ticket not found");
  return data;
}

const ticketView = (t) => ({
  id: t.id, title: t.title, description: t.description, category: t.category, priority: t.priority, status: t.status,
  tenantName: t.tenants?.name || null, propertyName: t.units?.properties?.name || null, unitNumber: t.units?.unit_number || null,
});

async function note(db, ticketId, body) {
  try {
    const { error } = await db.from("maintenance_comments").insert({
      request_id: ticketId, body: String(body).slice(0, 1000), author_type: "system", author_name: NOTE_AUTHOR, visible_to_tenant: false,
    });
    if (error) console.error("[notify] could not record ticket note:", error.message || error);
  } catch (e) { console.error("[notify] could not record ticket note:", e?.message || e); }
}

// Sends one email and returns { status: "sent" | "failed" | "unconfirmed" | "duplicate", ... }.
// key is a base ("maintenance-created:<id>"); the payload hash is appended here, so a changed payload can
// never reuse a key. Records a ticket note unless sent (and on success when successNote is given).
async function deliver({ db, send, ticketId, to, email, key, label, successNote = null, retryDelayMs }) {
  const args = { to, subject: email.subject, html: email.html, text: email.text };
  const r = await sendEmailReliably({ ...args, idempotencyKey: payloadKey(key, args) }, { send, retryDelayMs });
  if (r.ok) {
    if (ticketId && successNote) await note(db, ticketId, successNote);
    return { status: "sent", provider_id: r.data?.id ?? null, attempts: r.attempts };
  }
  const error = String(r.error || "send failed").slice(0, 200);
  if (r.result === "duplicate") return { status: "duplicate", attempts: r.attempts };
  if (r.result === "unconfirmed") {
    console.error(`[notify] ${label} email unconfirmed:`, error);
    if (ticketId) await note(db, ticketId, `Email NOT CONFIRMED — ${label}: ${error}. It may or may not have arrived; check the inbox and follow up directly.`);
    return { status: "unconfirmed", error, attempts: r.attempts };
  }
  console.error(`[notify] ${label} email failed:`, error);
  if (ticketId) await note(db, ticketId, `Email FAILED — ${label}: ${error}. Follow up directly.`);
  return { status: "failed", error, attempts: r.attempts };
}

async function toManagement({ db, env, ticketId, label }) {
  const to = managementRecipients(env);
  if (!to.ok) {
    console.error("[notify]", to.error);
    if (ticketId) await note(db, ticketId, `Email FAILED — ${label}: no management email is configured (LANDLORD_EMAIL).`);
  }
  return to;
}

// ── Tenant events ────────────────────────────────────────────

// A tenant submitted a ticket (or a landlord asks to re-send the alert for one).
export async function maintenanceCreated({ db, send, sms = sendEmergencySms, env, caller, body, retryDelayMs, now = () => Date.now() }) {
  const t = await loadTicket(db, body?.ticket_id);
  if (!isLandlord(caller)) {
    if (t.tenants?.user_id !== uid(caller)) throw new NotifyError(403, "Not your ticket");
    const created = Date.parse(t.created_at);
    if (!Number.isFinite(created) || now() - created > TENANT_ALERT_WINDOW_MS) throw new NotifyError(409, "This request's alert can no longer be raised from the tenant portal");
  }

  const detected = detectEmergency(`${t.title || ""}\n${t.description || ""}`);
  const emergency = detected || (t.is_emergency ? { kind: "reported", lifeSafety: false } : null);
  const guidance = detected ? { kind: detected.kind, lifeSafety: detected.lifeSafety, guidance: detected.guidance } : null;

  const notes = await trustedNotes(db, t.id);
  // Already emailed for this ticket (a retried or repeated call): no second email.
  const emailed = notes.some((c) => String(c.body || "").startsWith(CREATED_NOTE));

  let result = { status: "duplicate" };
  if (!emailed) {
    const label = emergency ? "emergency maintenance alert" : "new maintenance request";
    const to = await toManagement({ db, env, ticketId: t.id, label });
    result = to.ok
      ? await deliver({ db, send, ticketId: t.id, to: to.recipients, key: `maintenance-created:${t.id}`, label, retryDelayMs,
          email: T.maintenanceCreatedEmail({ ticket: ticketView(t), emergency }), successNote: `${CREATED_NOTE} (${to.recipients.length} recipient${to.recipients.length === 1 ? "" : "s"}).` })
      : { status: "failed", error: to.code };
  }

  // Emergency SMS: at most one attempt per ticket. The "sending" note is written BEFORE Twilio is called;
  // any earlier trusted SMS note (sending, accepted, failed, not sent) means no further SMS for this ticket.
  // Residual race (documented): two requests overlapping within milliseconds could both pass this check;
  // the tenant window above and the single call from the form keep that to an edge case.
  let smsStatus = null;
  if (emergency && !notes.some((c) => String(c.body || "").startsWith(SMS_NOTE))) {
    const v = ticketView(t);
    const smsArgs = { env, body: smsBody(["[Modus] EMERGENCY maintenance", String(emergency.kind).replace(/_/g, " "), [v.propertyName, v.unitNumber && `Unit ${v.unitNumber}`].filter(Boolean).join(" "), v.tenantName, v.title, `${APP_URL}/landlord/maintenance`]) };
    const cfgProbe = await sms({ ...smsArgs, dryRun: true });   // disabled / not_configured → no claim, no send
    if (cfgProbe?.status === "ready") {
      await note(db, t.id, `${SMS_NOTE}: sending.`);
      const r = await sms(smsArgs);
      smsStatus = r.status;
      if (r.status === "accepted") await note(db, t.id, `${SMS_NOTE} accepted by Twilio for delivery (delivery not confirmed).`);
      else await note(db, t.id, `${SMS_NOTE} FAILED: ${r.error || r.status}. Call management directly.`);
    } else {
      smsStatus = cfgProbe?.status || "not_sent";
    }
  } else if (emergency) {
    smsStatus = "duplicate";
  }
  return { ...result, emergency: guidance, ...(smsStatus ? { sms: smsStatus } : {}) };
}

// A tenant replied on their own ticket. The comment must exist, be theirs, and be tenant-visible.
export async function tenantComment({ db, send, env, caller, body, retryDelayMs }) {
  const t = await loadTicket(db, body?.ticket_id);
  if (t.tenants?.user_id !== uid(caller)) throw new NotifyError(403, "Not your ticket");
  const c = await loadComment(db, body?.comment_id, t.id);
  if (c.author_id !== uid(caller) || c.visible_to_tenant !== true || (c.author_type ?? "tenant") !== "tenant") throw new NotifyError(403, "Not your comment");
  const label = "tenant reply";
  const to = await toManagement({ db, env, ticketId: t.id, label });
  if (!to.ok) return { status: "failed", error: to.code };
  return deliver({ db, send, ticketId: t.id, to: to.recipients, key: `tenant-comment:${c.id}`, label, retryDelayMs,
    email: T.tenantReplyEmail({ ticket: ticketView(t), tenantName: t.tenants?.name, commentBody: c.body }) });
}

// A tenant completed their move-in walkthrough.
export async function inspectionCompleted({ db, send, env, caller, body, retryDelayMs }) {
  const id = requireUuid(body?.inspection_id, "inspection_id");
  const { data: i, error } = await db.from("inspections")
    .select("id, status, tenant_signature, tenant_signed_at, tenant_photos, tenants(id, name, user_id, units(unit_number, properties(name)))")
    .eq("id", id).maybeSingle();
  if (error) throw new NotifyError(500, "Could not load the inspection");
  if (!i) throw new NotifyError(404, "Inspection not found");
  if (!isLandlord(caller) && i.tenants?.user_id !== uid(caller)) throw new NotifyError(403, "Not your inspection");
  if (i.status !== "tenant_complete") throw new NotifyError(409, "Inspection is not complete");
  const to = managementRecipients(env);
  if (!to.ok) { console.error("[notify]", to.error); return { status: "failed", error: to.code }; }
  const signedAt = i.tenant_signed_at ? new Date(i.tenant_signed_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) : "";
  return deliver({ db, send, ticketId: null, to: to.recipients, key: `inspection-complete:${i.id}`, label: "walkthrough complete", retryDelayMs,
    email: T.inspectionCompleteEmail({ tenantName: i.tenants?.name, signature: i.tenant_signature, signedAt, photoCount: Array.isArray(i.tenant_photos) ? i.tenant_photos.length : 0,
      propertyName: i.tenants?.units?.properties?.name, unitNumber: i.tenants?.units?.unit_number }) });
}

async function loadComment(db, commentId, ticketId) {
  commentId = requireUuid(commentId, "comment_id");
  const { data, error } = await db.from("maintenance_comments").select("*").eq("id", commentId).maybeSingle();
  if (error) throw new NotifyError(500, "Could not load the comment");
  if (!data || data.request_id !== ticketId) throw new NotifyError(404, "Comment not found on this ticket");
  return data;
}

// ── Landlord events ──────────────────────────────────────────

function requireLandlord(caller) { if (!isLandlord(caller)) throw new NotifyError(403, "Landlord access required"); }

export async function ticketStatus({ db, send, caller, body, retryDelayMs }) {
  requireLandlord(caller);
  const t = await loadTicket(db, body?.ticket_id);
  const email = t.tenants?.email;
  if (!isValidEmail(email)) return { status: "skipped", reason: "tenant has no valid email" };
  return deliver({ db, send, ticketId: t.id, to: [email], key: `ticket-status:${t.id}:${t.status}:${t.updated_at || ""}`, label: "status update to tenant", retryDelayMs,
    email: T.ticketStatusEmail({ tenantName: t.tenants?.name, ticketTitle: t.title, status: t.status, ticketId: t.id }) });
}

export async function landlordComment({ db, send, caller, body, retryDelayMs }) {
  requireLandlord(caller);
  const t = await loadTicket(db, body?.ticket_id);
  const c = await loadComment(db, body?.comment_id, t.id);
  if (c.visible_to_tenant !== true) throw new NotifyError(409, "Comment is not visible to the tenant");
  const email = t.tenants?.email;
  if (!isValidEmail(email)) return { status: "skipped", reason: "tenant has no valid email" };
  return deliver({ db, send, ticketId: t.id, to: [email], key: `landlord-comment:${c.id}`, label: "message to tenant", retryDelayMs,
    email: T.landlordCommentEmail({ tenantName: t.tenants?.name, ticketTitle: t.title, commentBody: c.body, ticketId: t.id }) });
}

async function vendorEmailFor(db, t) {
  if (isValidEmail(t.vendor_email)) return t.vendor_email;
  if (!t.vendor_name) return null;
  const { data } = await db.from("vendors").select("email").eq("name", t.vendor_name).maybeSingle();
  return isValidEmail(data?.email) ? data.email : null;
}

export async function vendorApproved({ db, send, caller, body, retryDelayMs }) {
  requireLandlord(caller);
  const t = await loadTicket(db, body?.ticket_id);
  const stage = body?.stage === "quote" ? "quote" : "work";
  if (stage === "quote" && !t.quote_approved_at) throw new NotifyError(409, "Quote is not approved");
  if (stage === "work" && t.status !== "resolved") throw new NotifyError(409, "Work is not approved");
  const email = await vendorEmailFor(db, t);
  if (!email) return { status: "skipped", reason: "vendor has no valid email" };
  return deliver({ db, send, ticketId: t.id, to: [email], key: `vendor-approved:${stage}:${t.id}`, label: `${stage} approval to vendor`, retryDelayMs,
    email: T.vendorApprovedEmail({ vendorName: t.vendor_name, ticketTitle: t.title, propertyName: t.units?.properties?.name, stage }) });
}

export async function vendorMoreWork({ db, send, caller, body, retryDelayMs }) {
  requireLandlord(caller);
  const t = await loadTicket(db, body?.ticket_id);
  const c = await loadComment(db, body?.comment_id, t.id);
  if (c.author_type !== "pm_to_vendor") throw new NotifyError(409, "Not a request to the vendor");
  if (!t.vendor_token) return { status: "skipped", reason: "ticket has no vendor link" };
  const email = await vendorEmailFor(db, t);
  if (!email) return { status: "skipped", reason: "vendor has no valid email" };
  const notes = String(c.body || "").replace(/^PM requested more work:\s*/, "");
  return deliver({ db, send, ticketId: t.id, to: [email], key: `vendor-more-work:${c.id}`, label: "rework request to vendor", retryDelayMs,
    email: T.vendorMoreWorkEmail({ vendorName: t.vendor_name, ticketTitle: t.title, pmNotes: notes, vendorLink: `${APP_URL}/vendor/${encodeURIComponent(t.vendor_token)}` }) });
}

// ── Vendor events (called by api/vendor-ticket.js with the session-bound ticket) ──

export async function vendorQuoteSubmitted({ db, send, env, ticket, retryDelayMs }) {
  const t = await loadTicket(db, ticket.id);
  const label = "vendor quote";
  const to = await toManagement({ db, env, ticketId: t.id, label });
  if (!to.ok) return { status: "failed", error: to.code };
  return deliver({ db, send, ticketId: t.id, to: to.recipients, key: `vendor-quote:${t.id}:${t.quote_submitted_at || ""}`, label, retryDelayMs,
    email: T.vendorQuoteEmail({ ticket: ticketView(t), vendorName: t.vendor_name, quoteAmount: t.quote_amount, quoteNotes: t.quote_notes }) });
}

// actionAt: when the vendor marked the work complete (one key per completion, so a rework-and-resubmit
// is a new notification while retries of the same one are not).
export async function vendorWorkCompleted({ db, send, env, ticket, actionAt, retryDelayMs }) {
  const t = await loadTicket(db, ticket.id);
  const label = "vendor work complete";
  const to = await toManagement({ db, env, ticketId: t.id, label });
  if (!to.ok) return { status: "failed", error: to.code };
  return deliver({ db, send, ticketId: t.id, to: to.recipients, key: `vendor-complete:${t.id}:${actionAt || t.updated_at || ""}`, label, retryDelayMs,
    email: T.vendorCompleteEmail({ ticket: ticketView(t), vendorName: t.vendor_name, hasInvoice: !!t.invoice_url, invoiceNotes: t.invoice_notes }) });
}

export const TENANT_EVENTS = Object.freeze({ maintenance_created: maintenanceCreated, tenant_comment: tenantComment, inspection_completed: inspectionCompleted });
export const LANDLORD_EVENTS = Object.freeze({ ticket_status: ticketStatus, landlord_comment: landlordComment, vendor_approved: vendorApproved, vendor_more_work: vendorMoreWork });
export const EVENTS = Object.freeze({ ...TENANT_EVENTS, ...LANDLORD_EVENTS });
