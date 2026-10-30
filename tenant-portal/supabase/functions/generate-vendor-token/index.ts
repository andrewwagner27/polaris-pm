import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  adminClient, corsHeaders as buildCors, generatePin, generateToken, getCaller, isLandlord,
} from "../_shared/security.ts";

serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { request_id, vendor_name, vendor_phone } = await req.json();

    const supabase = adminClient();

    // ── Authorization: landlord only ──
    const caller = await getCaller(req, supabase);
    if (!isLandlord(caller)) {
      return new Response(JSON.stringify({ error: caller ? "Landlord access required" : "Authentication required" }), {
        status: caller ? 403 : 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!request_id) throw new Error("request_id required");

    const token   = generateToken();
    const pin     = generatePin();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    const { error } = await supabase
      .from("maintenance_requests")
      .update({
        vendor_name,
        vendor_phone:            vendor_phone || null,
        vendor_token:            token,
        vendor_pin:              pin,
        vendor_token_expires_at: expires,
      })
      .eq("id", request_id);

    if (error) throw new Error(error.message);

    return new Response(JSON.stringify({ token, pin }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("generate-vendor-token error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});