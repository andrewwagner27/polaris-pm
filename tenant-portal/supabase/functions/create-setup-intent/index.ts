import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { tenant_id, landlord_stripe_account_id, customer_email, customer_name } = await req.json();

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY not set");

    // Create or retrieve Stripe customer
    const customerRes = await fetch("https://api.stripe.com/v1/customers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: customer_email,
        name: customer_name,
        "metadata[tenant_id]": tenant_id,
      }),
    });
    const customer = await customerRes.json();
    if (customer.error) throw new Error(customer.error.message);

    // Create SetupIntent for ACH Direct Debit
    const setupRes = await fetch("https://api.stripe.com/v1/setup_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: customer.id,
        "payment_method_types[]": "us_bank_account",
        "payment_method_options[us_bank_account][verification_method]": "instant",
        "metadata[tenant_id]": tenant_id,
      }),
    });
    const setupIntent = await setupRes.json();
    if (setupIntent.error) throw new Error(setupIntent.error.message);

    return new Response(JSON.stringify({
      client_secret: setupIntent.client_secret,
      customer_id: customer.id,
      setup_intent_id: setupIntent.id,
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