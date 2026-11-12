// src/notifications.js
// Browser side of maintenance and inspection notifications. The browser only names the event and the
// record ids; /api/notify checks ownership, builds the email on the server (escaped template) and
// chooses the recipient (management from LANDLORD_EMAIL, or the tenant/vendor on record).
// No address, subject or HTML is ever composed here.
//
// Every function resolves to { status, ... } and never throws:
//   "sent" | "duplicate" | "skipped"  — fine
//   "failed"                           — the server recorded the failure on the ticket for management
//   "unreachable"                      — the request didn't complete; the caller should tell the user
// Vendor quote/completion emails are sent by /api/vendor-ticket itself, and emergency SMS only by the
// server: nothing here sends them.

import { authHeaders } from "./supabase";

export async function notify(event, ids) {
  try {
    const res = await fetch("/api/notify", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ event, ...ids }) });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) { console.error(`notify ${event} refused:`, res.status, data?.error); return { status: "failed", error: data?.error || `HTTP ${res.status}` }; }
    return data || { status: "failed" };
  } catch (err) {
    console.error(`notify ${event} failed:`, err);
    return { status: "unreachable" };
  }
}

// Tenant
export const notifyNewMaintenanceTicket = ({ ticketId }) => notify("maintenance_created", { ticket_id: ticketId });
export const notifyLandlordTenantComment = ({ ticketId, commentId }) => notify("tenant_comment", { ticket_id: ticketId, comment_id: commentId });
export const notifyInspectionCompleted = ({ inspectionId }) => notify("inspection_completed", { inspection_id: inspectionId });

// Landlord
export const notifyTicketStatusUpdate = ({ ticketId }) => notify("ticket_status", { ticket_id: ticketId });
export const notifyTenantNewComment = ({ ticketId, commentId }) => notify("landlord_comment", { ticket_id: ticketId, comment_id: commentId });
export const notifyVendorApproved = ({ ticketId, stage }) => notify("vendor_approved", { ticket_id: ticketId, stage });
export const notifyVendorMoreWork = ({ ticketId, commentId }) => notify("vendor_more_work", { ticket_id: ticketId, comment_id: commentId });
