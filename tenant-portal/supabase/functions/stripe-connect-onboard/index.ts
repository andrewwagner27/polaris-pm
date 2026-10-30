import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders as buildCors, getCaller, isAllowedOrigin } from "../_shared/security.ts";

serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { landlord_id, return_url, refresh_url } = await req.json();

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY not set");

    const supabase = adminClient();

    // ── Authorization: caller must be the landlord who owns landlord_id ──
    const caller = await getCaller(req, supabase);
    if (!caller?.user || caller.role !== "landlord") {
      return new Response(JSON.stringify({ error: caller ? "Landlord access required" : "Authentication required" }), {
        status: caller ? 403 : 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if landlord already has a Stripe account
    const { data: landlord } = await supabase
      .from("landlords")
      .select("stripe_account_id, stripe_onboarded, email, name, auth_user_id")
      .eq("id", landlord_id)
      .maybeSingle();

    if (!landlord || landlord.auth_user_id !== caller.user.id) {
      return new Response(JSON.stringify({ error: "Not authorized for this landlord account" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let stripeAccountId = landlord?.stripe_account_id;

    // Create a new Stripe Connect Express account if none exists
    if (!stripeAccountId) {
      const createRes = await fetch("https://api.stripe.com/v1/accounts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          type: "express",
          country: "US",
          ...(landlord?.email ? { email: landlord.email } : {}),
          "capabilities[transfers][requested]": "true",
          "capabilities[us_bank_account_ach_payments][requested]": "true",
          "metadata[landlord_id]": landlord_id,
        }),
      });

      const account = await createRes.json();
      if (account.error) throw new Error(account.error.message);

      stripeAccountId = account.id;

      // Store the account ID immediately (status: pending)
      await supabase
        .from("landlords")
        .update({
          stripe_account_id: stripeAccountId,
          stripe_onboarded: false,
        })
        .eq("id", landlord_id);
    }

    // Generate the onboarding link
    const linkRes = await fetch("https://api.stripe.com/v1/account_links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        account: stripeAccountId,
        // Only redirect back to our own origins (prevents open-redirect via Stripe)
        refresh_url: isAllowedOrigin(refresh_url) ? refresh_url : "https://getmodusam.com/settings?stripe=refresh",
        return_url:  isAllowedOrigin(return_url)  ? return_url  : "https://getmodusam.com/settings?stripe=success",
        type: "account_onboarding",
      }),
    });

    const link = await linkRes.json();
    if (link.error) throw new Error(link.error.message);

    return new Response(JSON.stringify({
      onboarding_url: link.url,
      stripe_account_id: stripeAccountId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});