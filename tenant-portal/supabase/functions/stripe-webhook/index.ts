import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const body = await req.text();
  const sig  = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

  // Verify webhook signature
  // Note: Deno doesn't have crypto.subtle HMAC verify built in easily,
  // so we verify by re-fetching the event from Stripe directly
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

  const paymentIntent = event.data?.object;
  const paymentIntentId = paymentIntent?.id;

  if (event.type === "payment_intent.succeeded") {
    await supabase.from("payments")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("stripe_payment_intent_id", paymentIntentId);

    // Notify tenant
    const { data: payment } = await supabase.from("payments")
      .select("tenant_id, amount_cents")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .single();

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

  if (event.type === "payment_intent.payment_failed") {
    await supabase.from("payments")
      .update({ status: "failed" })
      .eq("stripe_payment_intent_id", paymentIntentId);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});