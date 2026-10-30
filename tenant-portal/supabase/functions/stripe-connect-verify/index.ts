import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, getCaller, json } from "../_shared/security.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    const { landlord_id } = await req.json();

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY not set");

    const supabase = adminClient();

    // ── Authorization: caller must be the landlord who owns landlord_id ──
    const caller = await getCaller(req, supabase);
    if (!caller?.user || caller.role !== "landlord") {
      return json(req, { error: caller ? "Landlord access required" : "Authentication required" }, caller ? 403 : 401);
    }

    // Use the stored Stripe account, never one supplied by the client
    const { data: landlord } = await supabase
      .from("landlords")
      .select("id, stripe_account_id, auth_user_id")
      .eq("id", landlord_id)
      .maybeSingle();

    if (!landlord || landlord.auth_user_id !== caller.user.id) {
      return json(req, { error: "Not authorized for this landlord account" }, 403);
    }
    if (!landlord.stripe_account_id) throw new Error("No Stripe account on file");

    // Fetch the account directly from Stripe to check if onboarding is complete
    const accountRes = await fetch(`https://api.stripe.com/v1/accounts/${encodeURIComponent(landlord.stripe_account_id)}`, {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    });
    const account = await accountRes.json();
    if (account.error) throw new Error(account.error.message);

    const onboarded = account.details_submitted === true;

    if (onboarded) {
      await supabase
        .from("landlords")
        .update({ stripe_onboarded: true })
        .eq("id", landlord.id);
    }

    return json(req, { onboarded, charges_enabled: account.charges_enabled });

  } catch (err) {
    return json(req, { error: err.message }, 400);
  }
});
