import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { landlord_id, stripe_account_id } = await req.json();

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY not set");

    // Fetch the account directly from Stripe to check if onboarding is complete
    const accountRes = await fetch(`https://api.stripe.com/v1/accounts/${stripe_account_id}`, {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    });
    const account = await accountRes.json();
    if (account.error) throw new Error(account.error.message);

    const onboarded = account.details_submitted === true;

    if (onboarded) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabase
        .from("landlords")
        .update({ stripe_onboarded: true })
        .eq("id", landlord_id);
    }

    return new Response(JSON.stringify({ onboarded, charges_enabled: account.charges_enabled }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
