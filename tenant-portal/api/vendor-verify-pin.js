// api/vendor-verify-pin.js
// Server-side vendor PIN check. The PIN never leaves the server.
// Accepts: POST { token: string, pin: string }
// Returns: { ok: true, ticket_id, work_order_accepted_at, session, session_expires_at } or 400/401/404/410/500.
//
// `session` is a short-lived signed vendor session (see api/_lib/vendorSession.js) that
// authorizes all further calls to /api/vendor-ticket for this one ticket.
// ENV: VENDOR_SESSION_SECRET (required — fails closed with 500 if missing).

import { supabaseAdmin as supabase, timingSafeEqualStr } from "./_lib/auth.js";
import { createVendorSession, isVendorSessionConfigured } from "./_lib/vendorSession.js";

const FAILURE_DELAY_MS = 750; // slows brute-force attempts against the 4-digit PIN

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (!isVendorSessionConfigured()) {
    console.error("VENDOR_SESSION_SECRET not configured — vendor login disabled");
    return res.status(500).json({ error: "Vendor access is not configured" });
  }

  const { token, pin } = req.body || {};
  if (typeof token !== "string" || !token || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: "token and 4-digit pin required" });
  }

  const { data: ticket } = await supabase
    .from("maintenance_requests")
    .select("id, vendor_token, vendor_pin, vendor_token_expires_at, work_order_accepted_at")
    .eq("vendor_token", token)
    .maybeSingle();

  if (!ticket) {
    await sleep(FAILURE_DELAY_MS);
    return res.status(404).json({ error: "Invalid link" });
  }

  if (!ticket.vendor_token_expires_at || new Date(ticket.vendor_token_expires_at) < new Date()) {
    return res.status(410).json({ error: "Link expired" });
  }

  if (!timingSafeEqualStr(String(ticket.vendor_pin || ""), pin)) {
    await sleep(FAILURE_DELAY_MS);
    return res.status(401).json({ error: "Incorrect PIN" });
  }

  const { session, expiresAt } = createVendorSession({
    ticketId: ticket.id,
    vendorToken: ticket.vendor_token,
    tokenExpiresAt: ticket.vendor_token_expires_at,
  });

  return res.status(200).json({
    ok: true,
    ticket_id: ticket.id,
    work_order_accepted_at: ticket.work_order_accepted_at,
    session,
    session_expires_at: expiresAt,
  });
}
