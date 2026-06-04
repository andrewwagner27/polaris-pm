import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");

const TRADE_MAP: Record<string, string> = {
  plumbing:   "plumber",
  electrical: "electrician",
  hvac:       "hvac contractor",
  appliance:  "appliance repair",
  pest:       "pest control",
  general:    "handyman",
  other:      "contractor",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { category, address } = await req.json();
    if (!GOOGLE_API_KEY) throw new Error("GOOGLE_PLACES_API_KEY not set");

    const trade = TRADE_MAP[category] || "contractor";
    const query = `${trade} near ${address}`;

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}`
    );
    const data = await res.json();

    // Return simplified results
    const results = (data.results || []).slice(0, 8).map((p: any) => ({
      name:             p.name,
      address:          p.formatted_address,
      rating:           p.rating,
      total_ratings:    p.user_ratings_total,
      place_id:         p.place_id,
      business_status:  p.business_status,
    }));

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("search-vendors error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});