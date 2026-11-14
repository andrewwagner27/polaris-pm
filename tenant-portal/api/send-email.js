// api/send-email.js
// Free-form email relay for LANDLORDS ONLY (profiles.role = 'landlord'): application decisions and
// inspection emails the landlord composes in the portal. Landlord pages escape every untrusted value with
// src/lib/emailSafety.js before building the HTML.
//
// Tenants, vendors and anonymous callers are refused (403/401). They used to be able to send any subject
// and HTML to an allow-list of management addresses; they now raise events through /api/notify, which
// builds the email on the server and chooses the recipient itself.
// Same-origin only: no CORS headers are sent.

import { rejectIfIsolated } from "./_lib/deployEnv.js";
import { requireCaller, isLandlord } from "./_lib/auth.js";
import { sendEmail, normalizeRecipients } from "./_lib/email.js";
import { parseEmailList } from "../src/lib/emailSafety.js";

const MAX_RECIPIENTS = 10;
const MAX_HTML = 200_000;

export default async function handler(req, res) {
  if (rejectIfIsolated(res)) return;   // Preview must not touch production data or payments (api/_lib/deployEnv.js)
  if (req.method !== 'POST') return res.status(405).end();

  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!isLandlord(caller)) return res.status(403).json({ error: 'Landlord access required' });

  const { to, subject, html } = req.body || {};
  const { valid, invalid } = parseEmailList(normalizeRecipients(to));

  if (!valid.length || invalid.length || typeof subject !== 'string' || !subject.trim() || typeof html !== 'string' || !html) {
    return res.status(400).json({ error: 'A valid recipient, subject and html are required' });
  }
  if (valid.length > MAX_RECIPIENTS || html.length > MAX_HTML) return res.status(413).json({ error: 'Email too large' });

  const { ok, status, data, error } = await sendEmail({ to: valid, subject, html });

  if (!ok) {
    console.error('[send-email] failed:', error);
    return res.status(status && status >= 400 ? status : 502).json({ error: error || 'Email failed' });
  }

  return res.status(200).json({ success: true, id: data?.id ?? null });
}
