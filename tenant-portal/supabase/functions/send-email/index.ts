// supabase/functions/send-email/index.ts
// NOT DEPLOYED. Locks the free-form email relay down to landlords and the service role.
//
// Before: any signed-in tenant, or anyone holding an unexpired vendor link token, could send any subject
// and HTML (e.g. a fake "pay here" link) to an allow-list of management addresses, as
// notifications@getmodusam.com. The allow-list defaulted to an obsolete address
// (capitalpathwaysapw@gmail.com).
// Now: tenants and vendors are refused (403/401). The app no longer calls this function for tenant or
// vendor notifications: those go through the Vercel /api/notify and /api/vendor-ticket routes, which
// build the email on the server and choose the recipient. Nothing is hard-coded here.
//
// Authorization:  service role or landlord → any valid recipient (max 10). Everyone else → refused.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, getCaller, isLandlord, json } from "../_shared/security.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "Modus Property Management <notifications@getmodusam.com>";
const EMAIL_RE = /^[^\s@<>",]+@[^\s@<>",]+\.[^\s@<>",]+$/;
const MAX_RECIPIENTS = 10;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const admin = adminClient();
    const caller = await getCaller(req, admin);
    if (!caller) return json(req, { error: "Authentication required" }, 401);
    if (!isLandlord(caller)) return json(req, { error: "Landlord access required" }, 403);

    const { to, subject, html } = await req.json();
    const recipients = (Array.isArray(to) ? to : [to]).map((e) => String(e || "").trim()).filter(Boolean);
    if (!recipients.length || recipients.length > MAX_RECIPIENTS || recipients.some((r) => !EMAIL_RE.test(r))) {
      return json(req, { error: "A valid recipient is required" }, 400);
    }
    if (typeof subject !== "string" || !subject.trim() || typeof html !== "string" || !html) {
      return json(req, { error: "subject and html are required" }, 400);
    }
    if (!RESEND_API_KEY) return json(req, { error: "Email is not configured" }, 500);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM_EMAIL, to: recipients, subject: subject.replace(/[\r\n]+/g, " ").slice(0, 200), html }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) console.error("Resend error:", res.status, data?.name);
    return json(req, res.ok ? { id: data?.id ?? null } : { error: "Email failed" }, res.ok ? 200 : 502);
  } catch (err) {
    console.error("send-email error:", (err as Error).message);
    return json(req, { error: "Email failed" }, 500);
  }
});
