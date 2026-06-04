import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { tenant_id, tenant_name, tenant_email, unit_number, property_name, landlord_name } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Generate magic invite link
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: tenant_email,
      options: {
        redirectTo: `https://polaris-pm.vercel.app/onboarding?tenant_id=${tenant_id}`,
        data: {
          full_name: tenant_name,
          tenant_id,
          invited: true,
        }
      }
    });

    if (inviteError) throw new Error(inviteError.message);
    const inviteLink = inviteData?.properties?.action_link;
    if (!inviteLink) throw new Error("Failed to generate invite link");

    // Send via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not set");

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Modus Property Management <noreply@moduspm.com>",
        to: tenant_email,
        subject: `You've been invited to your tenant portal — ${property_name}`,
        html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A0B0D;font-family:'Helvetica Neue',sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0B0D;padding:40px 20px;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0" style="background:#111316;border:1px solid #252930;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
                <tr><td style="padding:32px 40px 24px;border-bottom:1px solid #252930;">
                  <p style="margin:0;font-size:11px;font-weight:600;color:#5C6270;letter-spacing:0.16em;text-transform:uppercase;">MODUS PROPERTY MANAGEMENT</p>
                </td></tr>
                <tr><td style="padding:36px 40px;">
                  <h1 style="margin:0 0 8px;font-size:28px;font-weight:400;color:#EDEAE2;font-family:Georgia,serif;">Welcome, ${tenant_name}</h1>
                  <p style="margin:0 0 24px;font-size:15px;color:#9095A0;line-height:1.6;">${landlord_name} has invited you to manage your tenancy at <strong style="color:#EDEAE2;">${property_name}</strong>, Unit ${unit_number} through Modus.</p>
                  <p style="margin:0 0 32px;font-size:14px;color:#9095A0;line-height:1.7;">Your tenant portal lets you pay rent, submit maintenance requests, message your property manager, and access your documents — all in one place.</p>
                  <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
                    <a href="${inviteLink}" style="display:inline-block;padding:14px 32px;background:#7A5C2E;color:#C9A96E;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500;letter-spacing:0.03em;">Set up your account →</a>
                  </td></tr></table>
                  <p style="margin:28px 0 0;font-size:12px;color:#5C6270;text-align:center;">This link expires in 24 hours. If you didn't expect this email, you can safely ignore it.</p>
                </td></tr>
                <tr><td style="padding:20px 40px;border-top:1px solid #252930;">
                  <p style="margin:0;font-size:11px;color:#5C6270;">Modus Property Management · Columbus, OH</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body></html>`,
      }),
    });

    if (!emailRes.ok) {
      const emailErr = await emailRes.json();
      throw new Error(`Resend error: ${emailErr.message}`);
    }

    // Mark tenant as invited
    await supabaseAdmin.from("tenants")
      .update({ invite_sent_at: new Date().toISOString(), invite_email: tenant_email })
      .eq("id", tenant_id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});