import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyStripeSignature } from "../_shared/security.ts";
import { applyStripePaymentEvent, stripeGetter, STRIPE_PAYMENT_EVENTS } from "../_shared/stripe-events.js";

// Destination-charge webhook architecture (two registered Stripe endpoints):
//
//   Platform endpoint  (scope: "Your account")
//     Secret:  STRIPE_WEBHOOK_SECRET
//     Events:  payment_intent.*, charge.*, refund.*, application_fee.*, transfer.reversed
//     Identifies as: event.account is undefined/null
//
//   Connect endpoint   (scope: "Connected accounts")
//     Secret:  STRIPE_CONNECT_WEBHOOK_SECRET
//     Events:  account.updated, account.application.deauthorized
//     Identifies as: event.account = "acct_..." (connected account ID)
//
// Both endpoints share this single Edge Function URL. The handler selects the
// correct signing secret by trying the platform secret first, then the connect
// secret. After verification, the event's scope (platform vs. connected) is
// re-confirmed from event.account so that a connected-account event that
// accidentally arrives at the platform secret cannot trigger payment processing.
//
// Fail-closed: if neither secret is configured for the event's actual scope,
// the request is rejected with 500 (misconfiguration) rather than silently accepted.

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const body = await req.text();
  const sigHeader = req.headers.get("Stripe-Signature");

  const platformSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const connectSecret  = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET");

  // ── Signature verification ──────────────────────────────────────────────────
  // Try platform secret first; fall back to connect secret.
  // `verifiedWith` records which secret matched so we can enforce scope below.
  let verifiedWith: "platform" | "connect" | null = null;

  if (platformSecret && await verifyStripeSignature(body, sigHeader, platformSecret)) {
    verifiedWith = "platform";
  } else if (connectSecret && await verifyStripeSignature(body, sigHeader, connectSecret)) {
    verifiedWith = "connect";
  }

  if (!verifiedWith) {
    // Distinguish misconfiguration (no secrets at all) from a bad signature so
    // ops can tell the difference in logs.
    if (!platformSecret && !connectSecret) {
      console.error("[stripe-webhook] neither STRIPE_WEBHOOK_SECRET nor STRIPE_CONNECT_WEBHOOK_SECRET is set");
      return new Response("Webhook not configured", { status: 500 });
    }
    return new Response("Invalid signature", { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // ── Scope enforcement ───────────────────────────────────────────────────────
  // Connected-account events carry a top-level `account` field ("acct_...").
  // Platform events do not. Enforce that each secret only authorises events
  // from its own scope, regardless of which secret the signature matched.
  const connectedAccountId = typeof event.account === "string" && event.account.startsWith("acct_")
    ? event.account : null;
  const isConnectEvent = connectedAccountId !== null;

  if (isConnectEvent && verifiedWith === "platform") {
    // A connected-account event was signed with the platform secret.
    // This should not happen in a correctly configured integration; treat it as
    // a misconfiguration rather than silently processing payment events on behalf
    // of a connected account.
    console.error(`[stripe-webhook] connected-account event ${event.type} for ${connectedAccountId} arrived via platform endpoint — check Stripe Dashboard endpoint scopes`);
    return new Response("Wrong endpoint scope", { status: 400 });
  }

  if (!isConnectEvent && verifiedWith === "connect") {
    // A platform event was signed with the connect secret.
    // Same mismatch in the other direction.
    console.error(`[stripe-webhook] platform event ${event.type} arrived via connect endpoint — check Stripe Dashboard endpoint scopes`);
    return new Response("Wrong endpoint scope", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const obj = event.data?.object as Record<string, unknown> | undefined;

  // ── Platform events: payment lifecycle ─────────────────────────────────────
  if (!isConnectEvent && STRIPE_PAYMENT_EVENTS.includes(event.type as string)) {
    let result;
    try {
      result = await applyStripePaymentEvent(event, {
        db: supabase,
        stripeGet: stripeGetter(Deno.env.get("STRIPE_SECRET_KEY")!),
      });
    } catch (err) {
      console.error("[stripe-webhook]", event.type, (err as Error).message);
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

  // ── Connect events: landlord onboarding ────────────────────────────────────
  // Only process account.updated when it arrives via the connect endpoint.
  // The connected account ID comes from event.account, not from event data, to
  // prevent a crafted payload from updating an unrelated landlord record.
  if (isConnectEvent && event.type === "account.updated") {
    const account = obj as Record<string, unknown> | undefined;
    // Double-check: event.account must equal account.id inside the payload.
    // If they differ the event is malformed; ignore it rather than updating the wrong record.
    if (account?.id && account.id === connectedAccountId) {
      const ready = account.details_submitted === true
        && account.charges_enabled === true
        && account.payouts_enabled === true;
      // Only advance stripe_onboarded to true; never clear it here. Stripe can send
      // account.updated with charges_enabled=false during transient reviews, which
      // would block all tenant payments until the next event. The live check in
      // create-payment-intent guards against a stale true value at charge time.
      if (ready) {
        const { error } = await supabase.from("landlords")
          .update({ stripe_onboarded: true })
          .eq("stripe_account_id", connectedAccountId);
        if (error) {
          console.error("[stripe-webhook] account readiness update failed", error.message);
          return new Response("Processing failed", { status: 500 });
        }
      } else {
        console.warn(`[stripe-webhook] account.updated for ${connectedAccountId} — not fully ready; stripe_onboarded unchanged`);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
