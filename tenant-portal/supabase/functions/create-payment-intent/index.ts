import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, getCaller, json } from "../_shared/security.ts";

const MAX_AMOUNT_CENTS = 10_000_000; // $100,000 sanity cap

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    const body = await req.json();
    const { tenant_id, payment_method_id, customer_id } = body;
    // Client sends rentAmount * 100, which can carry float error (e.g. 123455.99999)
    const amount_cents = Math.round(Number(body.amount_cents));

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY not set");

    const supabase = adminClient();

    // ── Authorization: caller must be the signed-in tenant who owns tenant_id ──
    const caller = await getCaller(req, supabase);
    if (!caller?.user) return json(req, { error: "Authentication required" }, 401);

    if (!tenant_id || !customer_id || !payment_method_id) {
      return json(req, { error: "tenant_id, customer_id and payment_method_id are required" }, 400);
    }
    if (!Number.isFinite(amount_cents) || amount_cents <= 0 || amount_cents > MAX_AMOUNT_CENTS) {
      return json(req, { error: "Invalid amount" }, 400);
    }

    // Look up the property owner's Stripe Connect account via: tenant → unit → property → landlord
    const { data: tenant } = await supabase
      .from("tenants")
      .select("unit_id, property_id, user_id")
      .eq("id", tenant_id)
      .maybeSingle();

    if (!tenant || tenant.user_id !== caller.user.id) {
      return json(req, { error: "Not authorized for this tenant" }, 403);
    }

    // The Stripe customer must belong to this tenant (created by create-setup-intent
    // with metadata.tenant_id, or recorded in tenant_payment_methods).
    const customerRes = await fetch(`https://api.stripe.com/v1/customers/${encodeURIComponent(customer_id)}`, {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    });
    const customer = await customerRes.json();
    let ownsCustomer = !customer.error && customer?.metadata?.tenant_id === tenant_id;
    if (!ownsCustomer) {
      const { data: savedMethod } = await supabase
        .from("tenant_payment_methods")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("stripe_customer_id", customer_id)
        .limit(1)
        .maybeSingle();
      ownsCustomer = !!savedMethod;
    }
    if (!ownsCustomer) return json(req, { error: "Payment method does not belong to this tenant" }, 403);

    const unit_id = tenant.unit_id || null;

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

    return json(req, {
      payment_intent_id: paymentIntent.id,
      status: paymentIntent.status,
    });

  } catch (err) {
    return json(req, { error: err.message }, 400);
  }
});