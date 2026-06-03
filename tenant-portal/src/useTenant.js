import { useState, useEffect } from "react";
import { supabase } from "./supabase";

export function useTenant() {
  const [tenant, setTenant]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [user, setUser]       = useState(null);

  useEffect(() => {
    let mounted = true;

    async function fetchTenantData() {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser || !mounted) { setLoading(false); return; }
        setUser(authUser);

        const { data: profileData } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authUser.id)
          .maybeSingle();
        const role = profileData?.role || "tenant";

        // Fetch tenant record by user_id
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("*")
          .eq("user_id", authUser.id)
          .maybeSingle();

        // Fetch unit if tenant has one
        let unitData = null;
        let propertyData = null;
        if (tenantData?.unit_id) {
          const { data: unit } = await supabase
            .from("units")
            .select("*, properties(*)")
            .eq("id", tenantData.unit_id)
            .maybeSingle();
          unitData = unit;
          propertyData = unit?.properties;
        }

        // Fetch payments
        const { data: payments } = await supabase
          .from("payments")
          .select("*")
          .eq("tenant_id", tenantData?.id || authUser.id)
          .order("paid_at", { ascending: false })
          .limit(6);

        // Fetch maintenance requests
        const { data: maintenance } = await supabase
          .from("maintenance_requests")
          .select("*")
          .eq("tenant_id", tenantData?.id || authUser.id)
          .order("created_at", { ascending: false })
          .limit(5);

        if (!mounted) return;

        setTenant({
          id:       tenantData?.id || authUser.id,   // ← tenant table UUID
          user_id:  authUser.id,                      // ← auth UUID
          unit_id:  tenantData?.unit_id || null,
          name:     tenantData?.name     || authUser.user_metadata?.full_name || "Tenant",
          email:    authUser.email,
          phone:    tenantData?.phone    || authUser.user_metadata?.phone || "—",
          unit:     unitData?.unit_number || authUser.user_metadata?.unit_number || "—",
          property: propertyData?.name   || "—",
          address:  propertyData
            ? `${propertyData.address}, ${propertyData.city} ${propertyData.state}`
            : "—",
          rent:     unitData?.rent_amount || 0,
          leaseStart: tenantData?.lease_start || null,
          leaseEnd:   tenantData?.lease_end   || null,
          payments:    payments    || [],
          maintenance: maintenance || [],
          raw:  tenantData,
          role: role,
        });
      } catch (err) {
        console.error("useTenant error:", err);
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchTenantData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) fetchTenantData();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { tenant, user, loading, error };
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "/";
}