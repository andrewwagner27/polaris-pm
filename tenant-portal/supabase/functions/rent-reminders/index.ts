// rent-reminders/index.ts
// Invoked by Supabase cron every day at 9 AM ET.
// Sends reminder emails to tenants whose rent is due in 5 days or 1 day.
// Auth: caller must send "Authorization: Bearer <service_role key>" or "x-cron-secret: <CRON_SECRET>".

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isCronRequest } from "../_shared/security.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL           = "Modus Property Management <notifications@getmodusam.com>";
const RESEND_API_KEY       = Deno.env.get("RESEND_API_KEY")!;

// Server-to-server only (cron) — no browser CORS access.
const corsHeaders = {};

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  return res.ok;
}

function reminderHtml(name: string, amount: number, dueLabel: string, portalUrl: string) {
  const fmt = (n: number) =>
    "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0A0B0D;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#111316;border:1px solid #252930;border-radius:12px;overflow:hidden;">
    <div style="background:#111316;padding:28px 32px 20px;border-bottom:1px solid #252930;">
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#5C6270;margin-bottom:6px;">Modus Property Management</div>
      <div style="font-size:22px;font-weight:600;color:#EDEAE2;">Rent Reminder</div>
    </div>
    <div style="padding:28px 32px;">
      <p style="color:#9095A0;font-size:14px;margin:0 0 20px;">Hi ${name},</p>
      <p style="color:#EDEAE2;font-size:14px;margin:0 0 24px;line-height:1.6;">
        This is a friendly reminder that your rent payment of <strong style="color:#C9A96E;">${fmt(amount)}</strong>
        is due <strong style="color:#EDEAE2;">${dueLabel}</strong>.
      </p>
      <div style="background:#0A0B0D;border:1px solid #252930;border-radius:10px;padding:20px 24px;margin-bottom:28px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#5C6270;margin-bottom:6px;">Amount Due</div>
        <div style="font-size:32px;font-weight:700;color:#C9A96E;">${fmt(amount)}</div>
        <div style="font-size:12px;color:#5C6270;margin-top:4px;">Due ${dueLabel}</div>
      </div>
      <a href="${portalUrl}" style="display:block;text-align:center;padding:13px 24px;background:#7A5C2E;border-radius:8px;color:#EDEAE2;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.02em;">
        Pay Now &#8594;
      </a>
    </div>
    <div style="padding:20px 32px;border-top:1px solid #252930;">
      <p style="color:#5C6270;font-size:11px;margin:0;line-height:1.6;">
        You are receiving this because you have an active lease managed through Modus Property Management.
        Log in to your tenant portal to make a payment or view your account.
      </p>
    </div>
  </div>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!isCronRequest(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Fetch tenants with their unit's rent_amount and recurring charges
    const { data: tenants, error } = await supabase
      .from("tenants")
      .select("id, name, email, lease_start, lease_end, unit_id, units(rent_amount)")
      .not("email", "is", null);

    if (error) throw new Error("DB error: " + error.message);
    if (!tenants || tenants.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No eligible tenants" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all recurring charges for these tenants
    const tenantIds = tenants.map((t: { id: string }) => t.id);
    const { data: allCharges } = await supabase
      .from("recurring_charges")
      .select("tenant_id, amount")
      .in("tenant_id", tenantIds);

    const chargesByTenant: Record<string, number[]> = {};
    for (const c of allCharges || []) {
      if (!chargesByTenant[c.tenant_id]) chargesByTenant[c.tenant_id] = [];
      chargesByTenant[c.tenant_id].push(Number(c.amount || 0));
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const nextFirst = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const msPerDay  = 1000 * 60 * 60 * 24;
    const daysOut   = Math.round((nextFirst.getTime() - today.getTime()) / msPerDay);

    // Allow ?force=true or body {force:true} to bypass date check (for testing)
    let forceRun = false;
    try {
      const url = new URL(req.url);
      if (url.searchParams.get("force") === "true") forceRun = true;
    } catch (_) {}
    if (!forceRun) {
      try {
        const body = await req.clone().json();
        if (body?.force === true) forceRun = true;
      } catch (_) {}
    }

    const REMINDER_DAYS = [5, 1];
    if (!forceRun && !REMINDER_DAYS.includes(daysOut)) {
      return new Response(JSON.stringify({ sent: 0, message: `No reminder needed (${daysOut} days out)` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dueLabel  = daysOut === 1 ? "tomorrow (the 1st)" : "in 5 days (the 1st)";
    const portalUrl = "https://www.getmodusam.com/pay";

    let sent = 0;
    const results: { name: string; email: string; ok: boolean }[] = [];

    for (const tenant of tenants) {
      if (tenant.lease_start && new Date(tenant.lease_start + "T00:00:00") > today) continue;
      if (tenant.lease_end   && new Date(tenant.lease_end   + "T00:00:00") < today) continue;

      const charges = chargesByTenant[tenant.id] || [];
      let amount = charges.length > 0
        ? charges.reduce((s: number, n: number) => s + n, 0)
        : Number((tenant as any).units?.rent_amount || 0);
      if (amount <= 0) continue; // skip if no rent info

      const firstName = (tenant.name || "Resident").split(" ")[0];
      const subject   = daysOut === 1
        ? `Rent due tomorrow — ${new Date().toLocaleDateString("en-US", { month: "long" })} payment`
        : `Rent reminder — due in 5 days`;

      const html = reminderHtml(firstName, amount, dueLabel, portalUrl);
      const ok   = await sendEmail(tenant.email, subject, html);
      results.push({ name: tenant.name, email: tenant.email, ok });
      if (ok) sent++;

      await new Promise(r => setTimeout(r, 120));
    }

    console.log(`rent-reminders: sent=${sent}`, JSON.stringify(results));

    return new Response(JSON.stringify({ sent, total: tenants.length, daysOut, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("rent-reminders error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
