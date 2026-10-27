// /api/dispatch-vendor.js
// Called by classify-and-route for emergency tickets requiring immediate vendor dispatch.
// Finds the best available vendor for the category, assigns them, and sends notification.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const APP_URL = "https://www.getmodusam.com";

function generateToken(length = 12) {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let token = "";
  for (let i = 0; i < length; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { ticket_id, tenant_id, description, priority, unit, property } = req.body || {};
  if (!ticket_id) return res.status(400).json({ error: "ticket_id required" });

  try {
    // 1. Get ticket to determine category and property
    const { data: ticket } = await supabase
      .from("maintenance_requests")
      .select("*, units(property_id)")
      .eq("id", ticket_id)
      .single();

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const propertyId = ticket.units?.property_id;

    // 2. Find best available vendor for this category + property
    let vendorQuery = supabase.from("vendors").select("*").eq("active", true);
    if (ticket.category) vendorQuery = vendorQuery.eq("category", ticket.category);
    if (propertyId) vendorQuery = vendorQuery.eq("property_id", propertyId);

    const { data: vendors } = await vendorQuery.limit(1);

    // If no property-specific vendor, try any active vendor with matching category
    let vendor = vendors?.[0];
    if (!vendor && ticket.category) {
      const { data: fallbackVendors } = await supabase
        .from("vendors").select("*").eq("active", true).eq("category", ticket.category).limit(1);
      vendor = fallbackVendors?.[0];
    }

    // 3. Generate access token for vendor portal
    const token = generateToken();
    const pin   = generatePin();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days for emergency

    // 4. Update ticket with vendor assignment and token
    await supabase.from("maintenance_requests").update({
      vendor_name:             vendor?.name || "Emergency Dispatch",
      vendor_phone:            vendor?.phone || null,
      vendor_email:            vendor?.email || null,
      vendor_token:            token,
      vendor_pin:              pin,
      vendor_token_expires_at: expires,
      status:                  "in_progress",
    }).eq("id", ticket_id);

    // 5. Log dispatch as comment
    await supabase.from("maintenance_comments").insert({
      request_id:        ticket_id,
      body:              `🚨 Emergency dispatch triggered. ${vendor ? `Vendor: ${vendor.name}` : "No vendor assigned — manual dispatch required."} Access link generated.`,
      author_type:       "system",
      author_name:       "Modus PM",
      visible_to_tenant: false,
    });

    // 6. Send email to landlord for emergency escalation
    const vendorLink = `${APP_URL}/vendor/${token}`;
    try {
      await fetch(`${APP_URL}/api/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: "moduspropmgmt@gmail.com",
          subject: `🚨 Emergency dispatch: ${ticket.title || description}`,
          html: `
            <div style="background:#0A0B0D;padding:32px 20px;font-family:'Helvetica Neue',sans-serif;">
              <div style="background:#111316;border:1px solid #E05555;border-radius:12px;max-width:560px;margin:0 auto;overflow:hidden;">
                <div style="padding:20px 28px;border-bottom:1px solid #252930;">
                  <p style="margin:0;font-size:11px;font-weight:600;color:#E05555;letter-spacing:0.16em;text-transform:uppercase;">🚨 EMERGENCY DISPATCH</p>
                  <h2 style="margin:8px 0 0;font-size:20px;font-weight:400;color:#EDEAE2;font-family:Georgia,serif;">${ticket.title || description}</h2>
                </div>
                <div style="padding:20px 28px;">
                  <p style="color:#9095A0;font-size:13px;margin:0 0 16px;">Unit ${unit || "—"} · ${property || "—"}</p>
                  ${vendor ? `<p style="color:#EDEAE2;font-size:13px;margin:0 0 8px;"><strong>Vendor assigned:</strong> ${vendor.name}${vendor.phone ? ` · ${vendor.phone}` : ""}</p>` : `<p style="color:#F0A430;font-size:13px;margin:0 0 8px;">⚠️ No vendor on file — please dispatch manually.</p>`}
                  <p style="color:#9095A0;font-size:13px;margin:0 0 16px;">Vendor access link: <a href="${vendorLink}" style="color:#C9A96E;">${vendorLink}</a><br>PIN: <strong style="color:#EDEAE2;">${pin}</strong></p>
                  <a href="${APP_URL}/landlord/maintenance" style="display:inline-block;padding:11px 22px;background:#7A5C2E;color:#C9A96E;border-radius:8px;text-decoration:none;font-weight:500;font-size:13px;">Review ticket →</a>
                </div>
              </div>
            </div>
          `,
        }),
      });
    } catch (emailErr) {
      console.warn("Emergency email failed (non-fatal):", emailErr.message);
    }

    return res.status(200).json({ dispatched: true, vendor: vendor?.name || null, token, pin });

  } catch (err) {
    console.error("dispatch-vendor error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
