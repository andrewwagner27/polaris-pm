// api/sms-escalate.js
// Sends an SMS via Twilio. Requires a signed-in user.
// Non-landlord callers can only text LANDLORD_PHONE; a custom "to" is honored for landlords only.
// ENV vars needed in Vercel:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, LANDLORD_PHONE

import { requireCaller, isLandlord } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const caller = await requireCaller(req, res);
  if (!caller) return;

  const { to, message } = req.body || {};
  const toNumber   = (isLandlord(caller) && to) ? to : process.env.LANDLORD_PHONE;
  const fromNumber = process.env.TWILIO_FROM;
  const sid        = process.env.TWILIO_ACCOUNT_SID;
  const token      = process.env.TWILIO_AUTH_TOKEN;

  if (!toNumber || !fromNumber || !sid || !token || !message) {
    return res.status(400).json({ error: "Missing required fields or env vars" });
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const body = new URLSearchParams({ To: toNumber, From: fromNumber, Body: String(message).slice(0, 1600) });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
    },
    body,
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Twilio error:", data?.code, data?.message);
    return res.status(response.status).json({ error: data });
  }
  return res.status(200).json({ success: true, sid: data.sid });
}
