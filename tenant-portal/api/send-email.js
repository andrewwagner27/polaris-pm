// api/send-email.js
// Authenticated email relay.
//   Landlord (profiles.role = 'landlord') → any recipient (applicants, tenants, vendors).
//   Any other signed-in user (tenant)     → landlord notification addresses only.
// Same-origin only: no CORS headers are sent.

import { requireCaller, isLandlord } from "./_lib/auth.js";
import { sendEmail, landlordNotifyEmails, normalizeRecipients } from "./_lib/email.js";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const caller = await requireCaller(req, res);
  if (!caller) return;

  const { to, subject, html } = req.body || {};
  const recipients = normalizeRecipients(to);

  if (!recipients.length || !subject || !html) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!isLandlord(caller)) {
    const allowed = landlordNotifyEmails();
    if (!recipients.every(r => allowed.includes(r.toLowerCase()))) {
      return res.status(403).json({ error: 'Recipient not allowed' });
    }
  }

  const { ok, status, data } = await sendEmail({ to: recipients, subject, html });

  if (!ok) {
    return res.status(status).json({ error: data });
  }

  return res.status(200).json({ success: true, id: data.id });
}
