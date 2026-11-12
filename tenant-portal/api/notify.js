// api/notify.js
// The only way the browser triggers maintenance and inspection emails.
//
// Request:  POST { event, ...ids }   Authorization: Bearer <Supabase session JWT>
//   Tenant (or landlord):  maintenance_created { ticket_id }
//                          tenant_comment      { ticket_id, comment_id }
//                          inspection_completed{ inspection_id }
//   Landlord only:         ticket_status       { ticket_id }
//                          landlord_comment    { ticket_id, comment_id }
//                          vendor_approved     { ticket_id, stage: "quote" | "work" }
//                          vendor_more_work    { ticket_id, comment_id }
// The caller never supplies a recipient, subject or HTML: api/_lib/maintenanceNotify.js loads the
// record, checks ownership, builds an escaped server-side template and resolves the recipient.
// Response: 200 { status: "sent" | "failed" | "duplicate" | "skipped", ... }; 4xx for a bad or
// unauthorized request. A "failed" status is also recorded on the ticket for management to see.
// Same-origin only: no CORS headers are sent.

/* global process */
import { supabaseAdmin, requireCaller } from "./_lib/auth.js";
import { sendEmail } from "./_lib/email.js";
import { EVENTS, NotifyError } from "./_lib/maintenanceNotify.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const run = typeof body.event === "string" && Object.prototype.hasOwnProperty.call(EVENTS, body.event) ? EVENTS[body.event] : null;
  if (!run) return res.status(400).json({ error: "Unknown event" });

  try {
    const result = await run({ db: supabaseAdmin, send: sendEmail, env: process.env, caller, body });
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof NotifyError) return res.status(err.status).json({ error: err.message });
    console.error("[notify] error:", err?.message || err);
    return res.status(500).json({ error: "Notification failed" });
  }
}
