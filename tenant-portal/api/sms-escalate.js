// api/sms-escalate.js
// LANDLORD ONLY: sends one test SMS to the designated emergency phone (LANDLORD_PHONE), so management can
// confirm the number is monitored and receives texts before turning emergency SMS on.
//
// Tenants and anyone else are refused (403/401): previously any signed-in tenant could text arbitrary
// content to LANDLORD_PHONE. Emergency SMS itself is sent only by the server (api/_lib/emergencySms.js),
// never from the browser, and only when EMERGENCY_SMS_ENABLED="true" and Twilio is fully configured.
// The destination is never taken from the request.
// Response: { status: "accepted" | "failed" | "disabled" | "not_configured" }. "accepted" means Twilio
// accepted the message; confirm on the phone that it arrived.

/* global process */
import { requireCaller, isLandlord } from "./_lib/auth.js";
import { sendEmergencySms } from "./_lib/emergencySms.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!isLandlord(caller)) return res.status(403).json({ error: "Landlord access required" });

  const result = await sendEmergencySms({ body: "[Modus] Test of the emergency SMS line. No reply is needed.", env: process.env });
  const code = result.status === "accepted" ? 200 : result.status === "failed" ? 502 : 409;
  return res.status(code).json({ status: result.status, ...(result.missing ? { missing: result.missing } : {}), ...(result.provider_status ? { provider_status: result.provider_status } : {}), ...(result.error ? { error: result.error } : {}) });
}
