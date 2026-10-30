import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, getCaller, isLandlord, json } from "../_shared/security.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "Modus PM <notifications@getmodusam.com>";

// Addresses that tenants and vendors may email. Defaults match the addresses
// currently hardcoded in the frontend (src/notifications.js) and API routes.
function landlordNotifyEmails(): string[] {
  const raw = Deno.env.get("LANDLORD_NOTIFY_EMAILS") || "capitalpathwaysapw@gmail.com,moduspropmgmt@gmail.com";
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

// Authorization:
//   service role / landlord        → any recipient
//   signed-in tenant               → landlord notification addresses only
//   vendor (valid vendor_token)    → landlord notification addresses only
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const { to, subject, html, vendor_token } = await req.json();
    const recipients = (Array.isArray(to) ? to : [to]).map((e) => String(e || "").trim()).filter(Boolean);
    if (!recipients.length || !subject || !html) return json(req, { error: "Missing required fields" }, 400);

    const admin = adminClient();
    const caller = await getCaller(req, admin);

    let authorized = false;
    if (isLandlord(caller)) {
      authorized = true;
    } else {
      let restrictedSender = !!caller;
      if (!caller && typeof vendor_token === "string" && vendor_token) {
        const { data: ticket } = await admin
          .from("maintenance_requests")
          .select("id, vendor_token_expires_at")
          .eq("vendor_token", vendor_token)
          .maybeSingle();
        restrictedSender = !!ticket && !!ticket.vendor_token_expires_at &&
          new Date(ticket.vendor_token_expires_at) >= new Date();
      }
      const allowed = landlordNotifyEmails();
      authorized = restrictedSender && recipients.every((r) => allowed.includes(r.toLowerCase()));
    }

    if (!authorized) return json(req, { error: caller || vendor_token ? "Recipient not allowed" : "Authentication required" }, caller || vendor_token ? 403 : 401);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: recipients, subject, html }),
    });

    const data = await res.json();
    if (!res.ok) console.error("Resend error:", res.status, data?.name);

    return json(req, data, res.ok ? 200 : 400);
  } catch (err) {
    console.error("send-email error:", err.message);
    return json(req, { error: err.message }, 500);
  }
});
