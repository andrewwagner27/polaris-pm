// api/daily-recap.js
// Sends management a morning summary of everything needing attention (Vercel Cron, vercel.json).
// ENV: RESEND_API_KEY, LANDLORD_EMAIL (recipient, via api/_lib/recipients.js), SUPABASE_URL,
//      SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
// Auth: Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; a signed-in landlord may also trigger it.
//
// Reliability: a failed database read never crashes the recap — that section says it could not be
// loaded and the recap is marked incomplete. The email is sent with a per-day idempotency key and one
// retry on a transient failure. With no recipient configured nothing is sent and the response is 500
// with a clear error (visible in the Vercel cron log).

/* global process */
import { hasCronSecret, getCaller, isLandlord } from "./_lib/auth.js";
import { recapSince } from "./_lib/escalationNotify.js";
import { buildDailyRecap } from "./_lib/dailyRecap.js";
import { managementRecipients } from "./_lib/recipients.js";
import { sendEmailReliably, payloadKey } from "./_lib/email.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).end();

  if (!hasCronSecret(req) && !isLandlord(await getCaller(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const to = managementRecipients();
  if (!to.ok) {
    console.error("[daily-recap]", to.error);
    return res.status(500).json({ error: to.code, detail: to.error });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Returns the rows, or null when the read failed (HTTP error, network error, or a non-array body).
  async function sbFetch(path) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
      });
      if (!r.ok) { console.error(`[daily-recap] read failed (${r.status}): ${path.split("?")[0]}`); return null; }
      const data = await r.json();
      return Array.isArray(data) ? data : null;
    } catch (e) {
      console.error(`[daily-recap] read failed: ${path.split("?")[0]}:`, e?.message || e);
      return null;
    }
  }

  const since = encodeURIComponent(recapSince());
  const [tickets, inspections, tenants, escalationRows, messages] = await Promise.all([
    sbFetch("maintenance_requests?select=id,title,priority,status,created_at,tenants(name,units(unit_number))&status=neq.resolved&order=created_at.desc"),
    sbFetch("inspections?select=id,status,inspection_date,created_at,tenants(name,units(unit_number))&status=neq.closed&order=created_at.desc"),
    sbFetch("tenants?select=id,name,lease_end,units(unit_number)&archived=eq.false&lease_end=not.is.null"),
    // Backstop: escalations and emergencies from the last 24 hours with their email status. Listed only; never re-sent.
    // Every routing row in the window is read; escalationRecapSection keeps escalations, emergencies (including
    // those routed as maintenance tickets) and rows with a recorded notification, and drops ordinary replies.
    sbFetch(`ai_routing_logs?select=id,message_id,created_at,detected_intent,raw_message,action_taken,raw_openai_response,tenants(name,units(unit_number))&created_at=gte.${encodeURIComponent(recapSince())}&order=created_at.desc`),
    // Tenant messages in the same window, to list any the assistant never processed.
    sbFetch(`messages?select=id,sender_id,body,created_at,tenants(name,user_id)&created_at=gte.${since}&order=created_at.desc`),
  ]);

  const recap = buildDailyRecap({ tickets, inspections, tenants, escalationRows, messages, now: new Date() });
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  // One key per day AND per content (payloadKey): a repeated scheduled call with the same content can't
  // send twice; a manual run always sends. A key is never reused with a different payload.
  const args = { to: to.recipients, subject: recap.subject, html: recap.html, text: recap.text };
  const key = hasCronSecret(req) ? payloadKey(`daily-recap:${day}`, args) : `daily-recap:manual:${Date.now()}`;
  const r = await sendEmailReliably({ ...args, idempotencyKey: key });

  if (!r.ok) {
    console.error(`[daily-recap] email ${r.result}:`, r.error);
    return res.status(r.status && r.status >= 400 ? r.status : 502).json({ error: r.error || "Email failed", result: r.result, attempts: r.attempts });
  }
  return res.status(200).json({ success: true, id: r.data?.id ?? null, incomplete: recap.incomplete, attempts: r.attempts });
}
