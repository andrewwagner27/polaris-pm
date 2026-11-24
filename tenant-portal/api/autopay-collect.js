// api/autopay-collect.js
// Vercel cron: runs at 14:00 UTC (9 AM ET) on the 1st of each month.
// Charges every tenant with autopay_enabled=true who has an active payment method and an open balance.
// Idempotent: Stripe idempotency key prevents double-charges on retry.

import { rejectIfIsolated } from "./_lib/deployEnv.js";
import { supabaseAdmin as supabase } from "./_lib/auth.js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const MAX_AMOUNT_CENTS = 10_000_000;

export default async function handler(req, res) {
  if (rejectIfIsolated(res)) return;
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).end();

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers["authorization"] !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Only run on the 1st (New York time). Allow ?force=true for testing.
  const nyDay = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", day: "numeric" });
  if (nyDay !== "1" && req.query.force !== "true") {
    return res.status(200).json({ skipped: true, reason: `Not the 1st (today is the ${nyDay})` });
  }

  const month = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit" });

  // All active tenants with autopay enabled and an active saved payment method
  const { data: tenants, error: tenantsError } = await supabase
    .from("tenants")
    .select("id, name, email, tenant_payment_methods!inner(stripe_customer_id, stripe_payment_method_id, bank_name, last4)")
    .eq("status", "active")
    .eq("autopay_enabled", true)
    .eq("tenant_payment_methods.status", "active");

  if (tenantsError) {
    console.error("[autopay-collect] tenants query failed:", tenantsError.message);
    return res.status(500).json({ error: "Failed to load tenants" });
  }

  const results = { charged: 0, skipped: 0, errors: 0, details: [] };

  for (const tenant of tenants || []) {
    const pm = Array.isArray(tenant.tenant_payment_methods)
      ? tenant.tenant_payment_methods[0]
      : tenant.tenant_payment_methods;

    if (!pm?.stripe_customer_id || !pm?.stripe_payment_method_id) {
      results.skipped++;
      results.details.push({ tenant: tenant.name, result: "skipped", reason: "no payment method" });
      continue;
    }

    try {
      // Get the amount owed from the ledger — never trust a client-supplied amount
      const { data: due, error: dueError } = await supabase.rpc("a2_pay_rent_internal", { p_tenant: tenant.id });

      if (dueError || !due?.ledger_active || !due?.online_available) {
        results.skipped++;
        results.details.push({ tenant: tenant.name, result: "skipped", reason: "online payment unavailable" });
        continue;
      }

      const payableCents = Number(due.payable_cents);
      if (!(payableCents > 0) || payableCents > MAX_AMOUNT_CENTS) {
        results.skipped++;
        results.details.push({ tenant: tenant.name, result: "skipped", reason: payableCents <= 0 ? "nothing due" : "amount exceeds cap" });
        continue;
      }

      // Look up the owner's Stripe account via tenant → unit → property → landlord
      const { data: tenantRow } = await supabase.from("tenants").select("unit_id").eq("id", tenant.id).maybeSingle();
      const { data: unit }      = tenantRow?.unit_id ? await supabase.from("units").select("property_id").eq("id", tenantRow.unit_id).maybeSingle() : { data: null };
      const { data: property }  = unit?.property_id  ? await supabase.from("properties").select("owner_email").eq("id", unit.property_id).maybeSingle() : { data: null };
      const { data: landlord }  = property?.owner_email ? await supabase.from("landlords").select("stripe_account_id, stripe_onboarded").eq("email", property.owner_email).eq("stripe_onboarded", true).maybeSingle() : { data: null };

      const ownerStripeAccountId = landlord?.stripe_onboarded ? landlord.stripe_account_id : null;
      if (!ownerStripeAccountId) {
        results.skipped++;
        results.details.push({ tenant: tenant.name, result: "skipped", reason: "owner stripe account not ready" });
        continue;
      }

      const platformFee = Math.round(payableCents * 0.05);
      // Stable per-tenant per-month key — Stripe deduplicates if we retry
      const idempotencyKey = `autopay-${month}-${tenant.id}`;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: payableCents,
        currency: "usd",
        customer: pm.stripe_customer_id,
        payment_method: pm.stripe_payment_method_id,
        payment_method_types: ["us_bank_account"],
        confirm: true,
        application_fee_amount: platformFee,
        transfer_data: { destination: ownerStripeAccountId },
        metadata: {
          tenant_id: tenant.id,
          unit_id: tenantRow?.unit_id || "",
          purpose: "rent",
          source: "autopay",
          owner_stripe_account: ownerStripeAccountId,
          platform_fee_cents: String(platformFee),
        },
      }, { idempotencyKey });

      if (!["processing", "succeeded"].includes(paymentIntent.status)) {
        throw new Error(`Unexpected status: ${paymentIntent.status}`);
      }

      // Record the payment
      await supabase.from("payments").upsert([{
        tenant_id: tenant.id,
        unit_id: tenantRow?.unit_id || null,
        amount_cents: payableCents,
        platform_fee_cents: platformFee,
        owner_stripe_account: ownerStripeAccountId,
        status: "pending",
        stripe_payment_intent_id: paymentIntent.id,
        source: "ach",
        category: "Rent",
        origin: "autopay",
      }], { onConflict: "stripe_payment_intent_id", ignoreDuplicates: true });

      results.charged++;
      results.details.push({ tenant: tenant.name, result: "charged", amount_cents: payableCents, pi: paymentIntent.id });

    } catch (err) {
      console.error(`[autopay-collect] error for ${tenant.name}:`, err.message);
      results.errors++;
      results.details.push({ tenant: tenant.name, result: "error", reason: err.message });
    }
  }

  console.log("[autopay-collect]", { month, ...results });
  return res.status(200).json({ ok: true, month, ...results });
}
