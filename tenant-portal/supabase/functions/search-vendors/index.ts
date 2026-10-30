import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders as buildCors, getCaller, isLandlord } from "../_shared/security.ts";

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
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Authorization: landlord only (protects Google Places quota) ──
    const caller = await getCaller(req, adminClient());
    if (!isLandlord(caller)) {
      return new Response(JSON.stringify({ error: caller ? "Landlord access required" : "Authentication required" }), {
        status: caller ? 403 : 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { category, address } = await req.json();

    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!GOOGLE_API_KEY) throw new Error("GOOGLE_PLACES_API_KEY not set");

    const trade = TRADE_MAP[category] || "contractor";
    const query = `${trade} near ${address}`;

    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    
    console.log("Google status:", data.status);
    console.log("Result count:", data.results?.length || 0);
    if (data.error_message) console.error("Google error:", data.error_message);

    const results = (data.results || []).slice(0, 8).map((p: any) => ({
      name:          p.name,
      address:       p.formatted_address,
      rating:        p.rating,
      total_ratings: p.user_ratings_total,
      place_id:      p.place_id,
    }));

    return new Response(JSON.stringify({ results, status: data.status }), {
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