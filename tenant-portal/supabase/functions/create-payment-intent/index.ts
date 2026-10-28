import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { tenant_id, unit_id, amount_cents, payment_method_id, customer_id } = await req.json();

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up the property owner's Stripe Connect account via: tenant → unit → property → landlord
    const { data: tenant } = await supabase
      .from("tenants")
      .select("unit_id, property_id")
      .eq("id", tenant_id)
      .single();

    const { data: property } = await supabase
      .from("properties")
      .select("landlord_id")
      .eq("id", tenant?.property_id || unit_id)
      .single();

    const { data: landlord } = await supabase
      .from("landlords")
      .select("stripe_account_id, stripe_onboarded")
      .eq("id", property?.landlord_id)
      .single();

    const ownerStripeAccountId = landlord?.stripe_onboarded ? landlord?.stripe_account_id : null;

    // 5% platform fee
    const platformFee = Math.round(amount_cents * 0.05);

    // Build payment intent params
    const params: Record<string, string> = {
      amount: String(amount_cents),
      currency: "usd",
      customer: customer_id,
      payment_method: payment_method_id,
      "payment_method_types[]": "us_bank_account",
      confirm: "true",
      "mandate_data[customer_acceptance][type]": "online",
      "mandate_data[customer_acceptance][online][ip_address]": "127.0.0.1",
      "mandate_data[customer_acceptance][online][user_agent]": "Modus PM",
      "metadata[tenant_id]": tenant_id,
      "metadata[unit_id]": unit_id || "",
    };

    // If owner has a connected Stripe account, route funds there minus 5%
    if (ownerStripeAccountId) {
      params["application_fee_amount"] = String(platformFee);
      params["transfer_data[destination]"] = ownerStripeAccountId;
      params["metadata[owner_stripe_account]"] = ownerStripeAccountId;
      params["metadata[platform_fee_cents]"] = String(platformFee);
    }

    const paymentRes = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    });

    const paymentIntent = await paymentRes.json();
    if (paymentIntent.error) throw new Error(paymentIntent.error.message);

    // Record pending payment
    await supabase.from("payments").insert({
      tenant_id,
      unit_id,
      amount_cents,
      platform_fee_cents: ownerStripeAccountId ? platformFee : 0,
      owner_stripe_account: ownerStripeAccountId || null,
      status: "pending",
      stripe_payment_intent_id: paymentIntent.id,
      source: "ach",
    });

    return new Response(JSON.stringify({
      payment_intent_id: paymentIntent.id,
      status: paymentIntent.status,
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