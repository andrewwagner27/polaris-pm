import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, getCaller, json } from "../_shared/security.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    const { tenant_id, customer_email, customer_name } = await req.json();

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY not set");

    // ── Authorization: caller must be the signed-in tenant who owns tenant_id ──
    const supabase = adminClient();
    const caller = await getCaller(req, supabase);
    if (!caller?.user) return json(req, { error: "Authentication required" }, 401);
    if (!tenant_id) return json(req, { error: "tenant_id required" }, 400);

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, user_id")
      .eq("id", tenant_id)
      .maybeSingle();
    if (!tenant || tenant.user_id !== caller.user.id) {
      return json(req, { error: "Not authorized for this tenant" }, 403);
    }

    // Create or retrieve Stripe customer
    const customerRes = await fetch("https://api.stripe.com/v1/customers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: customer_email || caller.user.email || "",
        name: customer_name || "",
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

    return json(req, {
      client_secret: setupIntent.client_secret,
      customer_id: customer.id,
      setup_intent_id: setupIntent.id,
    });

  } catch (err) {
    return json(req, { error: err.message }, 400);
  }
});