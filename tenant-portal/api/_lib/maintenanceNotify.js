// api/_lib/maintenanceNotify.js
// Server-side notifications for maintenance tickets, vendor work and inspections.
//
// Callers name an EVENT and the ids involved — never recipients, subjects or HTML. Each event:
//   1. checks the caller may raise it (tenant owns the ticket/inspection; landlord for landlord events),
//   2. loads every value it shows from the database,
//   3. resolves the recipient here (management via recipients.js; tenant/vendor from their records),
//   4. sends once per idempotency key (Resend Idempotency-Key, one safe retry on transient failure),
//   5. records failures — and new-request notifications — as an internal ticket note
//      (maintenance_comments, author "Modus notifications", visible_to_tenant false, hidden from vendors),
//      so a failed email is visible to management in the ticket thread. No migration needed.
// Every function returns { status, ... } and never throws. "sent" means Resend accepted the email.

import { detectEmergency } from "./aiSafety.js";
import { managementRecipients } from "./recipients.js";
import { sendEmailReliably } from "./email.js";
import { sendEmergencySms, smsBody } from "./emergencySms.js";
import { isValidEmail, APP_URL } from "../../src/lib/emailSafety.js";
import * as T from "./notificationTemplates.js";

export const NOTE_AUTHOR = "Modus notifications";
const CREATED_NOTE = "Management emailed about this new request";

export class NotifyError extends Error { constructor(status, message) { super(message); this.status = status; } }

const isLandlord = (caller) => caller?.role === "landlord";
const uid = (caller) => caller?.user?.id || null;
const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function loadTicket(db, ticketId) {
  if (!str(ticketId)) throw new NotifyError(400, "ticket_id is required");
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

// Sends one email and returns { status: "sent" | "failed", ... }. Records a ticket note on failure
// (and on success when successNote is given). label is the human name of the notification.
async function deliver({ db, send, ticketId, to, email, key, label, successNote = null, retryDelayMs }) {
  const r = await sendEmailReliably({ to, subject: email.subject, html: email.html, text: email.text, idempotencyKey: key }, { send, retryDelayMs });
  if (r.ok) {
    if (ticketId && successNote) await note(db, ticketId, successNote);
    return { status: "sent", provider_id: r.data?.id ?? null, attempts: r.attempts };
  }
  const error = String(r.error || "send failed").slice(0, 200);
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
export async function maintenanceCreated({ db, send, sms = sendEmergencySms, env, caller, body, retryDelayMs }) {
  const t = await loadTicket(db, body?.ticket_id);
  if (!isLandlord(caller) && t.tenants?.user_id !== uid(caller)) throw new NotifyError(403, "Not your ticket");

  const detected = detectEmergency(`${t.title || ""}\n${t.description || ""}`);
  const emergency = detected || (t.is_emergency ? { kind: "reported", lifeSafety: false } : null);
  const guidance = detected ? { kind: detected.kind, lifeSafety: detected.lifeSafety, guidance: detected.guidance } : null;

  // Already emailed for this ticket (a retried or repeated call): nothing more is sent.
  const { data: prior } = await db.from("maintenance_comments").select("id, body").eq("request_id", t.id).eq("author_name", NOTE_AUTHOR);
  if ((prior || []).some((c) => String(c.body || "").startsWith(CREATED_NOTE))) return { status: "duplicate", emergency: guidance };

  const label = emergency ? "emergency maintenance alert" : "new maintenance request";
  const to = await toManagement({ db, env, ticketId: t.id, label });
  const result = to.ok
    ? await deliver({ db, send, ticketId: t.id, to: to.recipients, key: `maintenance-created:${t.id}`, label, retryDelayMs,
        email: T.maintenanceCreatedEmail({ ticket: ticketView(t), emergency }), successNote: `${CREATED_NOTE} (${to.recipients.length} recipient${to.recipients.length === 1 ? "" : "s"}).` })
    : { status: "failed", error: to.code };

  let smsResult = null;
  if (emergency) {
    const v = ticketView(t);
    smsResult = await sms({ env, body: smsBody(["[Modus] EMERGENCY maintenance", String(emergency.kind).replace(/_/g, " "), [v.propertyName, v.unitNumber && `Unit ${v.unitNumber}`].filter(Boolean).join(" "), v.tenantName, v.title, `${APP_URL}/landlord/maintenance`]) });
    if (smsResult.status === "accepted") await note(db, t.id, "Emergency SMS accepted by Twilio for delivery (delivery not confirmed).");
    else if (smsResult.status === "failed") await note(db, t.id, `Emergency SMS FAILED: ${smsResult.error || "unknown error"}. Call management directly.`);
  }
  return { ...result, emergency: guidance, ...(smsResult ? { sms: smsResult.status } : {}) };
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
  const id = str(body?.inspection_id);
  if (!id) throw new NotifyError(400, "inspection_id is required");
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
  if (!str(commentId)) throw new NotifyError(400, "comment_id is required");
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
