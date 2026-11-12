// api/_lib/dispatchVendor.js
// Emergency vendor dispatch. Called in-process by classify-and-route and by the
// landlord-only /api/dispatch-vendor endpoint.
// Finds the best available vendor for the category, assigns them, and sends notification.

import { supabaseAdmin as supabase, generateToken, generatePin } from "./auth.js";
import { sendEmailReliably, payloadKey } from "./email.js";
import { managementRecipients } from "./recipients.js";
import { emergencyDispatchEmail } from "./notificationTemplates.js";
import { APP_URL } from "../../src/lib/emailSafety.js";

export async function dispatchVendor({ ticket_id, description, unit, property }) {
  // 1. Get ticket to determine category and property
  const { data: ticket } = await supabase
    .from("maintenance_requests")
    .select("*, units(property_id)")
    .eq("id", ticket_id)
    .single();

  if (!ticket) return { status: 404, body: { error: "Ticket not found" } };

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

  // 6. Email management (recipients.js: LANDLORD_EMAIL; nothing hard-coded). Escaped server template.
  //    A failure is logged and recorded on the ticket; it never undoes the dispatch.
  const vendorLink = `${APP_URL}/vendor/${token}`;
  let notification = "failed";
  const to = managementRecipients();
  if (!to.ok) {
    console.error("[dispatch-vendor]", to.error);
  } else {
    const email = emergencyDispatchEmail({
      ticket: { title: ticket.title, description, propertyName: property, unitNumber: unit },
      vendor: vendor ? { name: vendor.name, phone: vendor.phone } : null, vendorLink, pin,
    });
    const args = { to: to.recipients, subject: email.subject, html: email.html, text: email.text };
    const r = await sendEmailReliably({ ...args, idempotencyKey: payloadKey(`emergency-dispatch:${ticket_id}:${token}`, args) });
    notification = r.ok ? "sent" : r.result === "unconfirmed" ? "unconfirmed" : "failed";
    if (!r.ok) console.warn(`Emergency dispatch email ${notification} (non-fatal):`, r.error);
  }
  if (notification !== "sent") {
    await supabase.from("maintenance_comments").insert({
      request_id: ticket_id,
      body: notification === "unconfirmed"
        ? "Email NOT CONFIRMED — emergency dispatch alert to management may not have arrived. Follow up directly."
        : "Email FAILED — emergency dispatch alert to management. Follow up directly.",
      author_type: "system", author_name: "Modus notifications", visible_to_tenant: false,
    });
  }

  return { status: 200, body: { dispatched: true, vendor: vendor?.name || null, token, pin, notification } };
}
