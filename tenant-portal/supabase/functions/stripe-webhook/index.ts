import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyStripeSignature } from "../_shared/security.ts";
import { applyStripePaymentEvent, stripeGetter, STRIPE_PAYMENT_EVENTS } from "../_shared/stripe-events.js";

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const body = await req.text();
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  // Fail closed: never process an event we cannot authenticate.
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not set — rejecting webhook");
    return new Response("Webhook not configured", { status: 500 });
  }
  if (!(await verifyStripeSignature(body, req.headers.get("Stripe-Signature"), webhookSecret))) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const obj = event.data?.object;

  // ── Payments: succeeded (Stripe timestamp + fee), failed, refunds — shared with api/stripe-webhook.js ──
  if (STRIPE_PAYMENT_EVENTS.includes(event.type)) {
    let result;
    try {
      result = await applyStripePaymentEvent(event, { db: supabase, stripeGet: stripeGetter(Deno.env.get("STRIPE_SECRET_KEY")!) });
    } catch (err) {
      console.error("[stripe-webhook]", event.type, err.message);
      return new Response("Processing failed", { status: 500 });   // Stripe retries; handling is idempotent
    }
    const payment = result.action === "paid" ? result.payment : null;
    if (payment) {
      await supabase.functions.invoke("send-email", {
        body: {
          type: "payment_received",
          tenant_id: payment.tenant_id,
          amount: payment.amount_cents / 100,
        }
      });
    }
  }

  // ── Stripe Connect: landlord completed onboarding ───────────────────────
  if (event.type === "account.updated") {
    const account = obj;
    // details_submitted = landlord finished filling out Stripe's form
    if (account?.details_submitted) {
      const landlordId = account?.metadata?.landlord_id;
      if (landlordId) {
        await supabase.from("landlords")
          .update({ stripe_onboarded: true })
          .eq("id", landlordId);
      } else {
        // Fallback: match by stripe_account_id if metadata wasn't set
        await supabase.from("landlords")
          .update({ stripe_onboarded: true })
          .eq("stripe_account_id", account.id);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});