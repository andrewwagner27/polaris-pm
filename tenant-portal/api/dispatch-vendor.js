// /api/dispatch-vendor.js
// Landlord-only manual trigger for emergency vendor dispatch.
// classify-and-route calls the shared dispatchVendor() directly (no HTTP hop).

import { requireCaller, isLandlord } from "./_lib/auth.js";
import { dispatchVendor } from "./_lib/dispatchVendor.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!isLandlord(caller)) return res.status(403).json({ error: "Landlord access required" });

  const { ticket_id, description, unit, property } = req.body || {};
  if (!ticket_id) return res.status(400).json({ error: "ticket_id required" });

  try {
    const result = await dispatchVendor({ ticket_id, description, unit, property });
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("dispatch-vendor error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
