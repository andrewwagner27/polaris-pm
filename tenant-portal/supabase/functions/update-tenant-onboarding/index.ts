// supabase/functions/update-tenant-onboarding/index.ts
// Called by TenantOnboarding.jsx to save name/phone (and optionally emergency contact) using the
// admin client, bypassing any column-level trigger restrictions on the tenants table.
// Auth: requires a valid tenant JWT whose uid matches the tenant record's user_id.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders as buildCors, getCaller } from "../_shared/security.ts";

serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = adminClient();
    const caller = await getCaller(req, supabaseAdmin);
    if (!caller?.id) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { tenant_id, name, phone, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship } = body;

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the caller owns this tenant record
    const { data: tenantRow } = await supabaseAdmin
      .from("tenants").select("id, user_id").eq("id", tenant_id).maybeSingle();

    if (!tenantRow) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (tenantRow.user_id !== caller.id) {
      return new Response(JSON.stringify({ error: "Not authorized for this tenant" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build update payload — only include fields that were sent
    const updates: Record<string, string> = {};
    if (typeof name === "string" && name.trim()) updates.name = name.trim();
    if (typeof phone === "string" && phone.trim()) updates.phone = phone.trim();
    if (typeof emergency_contact_name === "string") updates.emergency_contact_name = emergency_contact_name.trim();
    if (typeof emergency_contact_phone === "string") updates.emergency_contact_phone = emergency_contact_phone.trim();
    if (typeof emergency_contact_relationship === "string") updates.emergency_contact_relationship = emergency_contact_relationship.trim();

    if (Object.keys(updates).length === 0) {
      return new Response(JSON.stringify({ ok: true, updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updateError } = await supabaseAdmin
      .from("tenants").update(updates).eq("id", tenant_id);

    if (updateError) {
      console.error("[update-tenant-onboarding] update failed:", updateError.message);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[update-tenant-onboarding] unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
