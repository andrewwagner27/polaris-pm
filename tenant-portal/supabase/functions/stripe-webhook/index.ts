import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const body = await req.text();
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

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

  // ── Rent payment succeeded ──────────────────────────────────────────────
  if (event.type === "payment_intent.succeeded") {
    const paymentIntentId = obj?.id;
    await supabase.from("payments")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("stripe_payment_intent_id", paymentIntentId);

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

  // ── Rent payment failed ─────────────────────────────────────────────────
  if (event.type === "payment_intent.payment_failed") {
    await supabase.from("payments")
      .update({ status: "failed" })
      .eq("stripe_payment_intent_id", obj?.id);
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