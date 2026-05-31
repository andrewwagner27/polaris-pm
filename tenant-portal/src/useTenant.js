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
        // Fetch user role
const { data: profileData } = await supabase
  .from("profiles")
  .select("role")
  .eq("id", authUser.id)
  .maybeSingle();

const role = profileData?.role || "tenant";

        // Fetch tenant profile — simple query, no joins
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("*")
          .eq("id", authUser.id)
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
          .eq("tenant_id", authUser.id)
          .order("paid_at", { ascending: false })
          .limit(6);

        // Fetch maintenance requests
        const { data: maintenance } = await supabase
          .from("maintenance_requests")
          .select("*")
          .eq("tenant_id", authUser.id)
          .order("created_at", { ascending: false })
          .limit(5);

        if (!mounted) return;

        setTenant({
          // Profile data
          id:       authUser.id,
          name:     tenantData?.name     || authUser.user_metadata?.full_name || "Tenant",
          email:    authUser.email,
          phone:    tenantData?.phone    || authUser.user_metadata?.phone || "—",
          // Unit & property
          unit:     unitData?.unit_number || authUser.user_metadata?.unit_number || "—",
          property: propertyData?.name   || "—",
          address:  propertyData
            ? `${propertyData.address}, ${propertyData.city} ${propertyData.state}`
            : "—",
          rent:     unitData?.rent_amount || 0,
          // Lease
          leaseStart: tenantData?.lease_start || null,
          leaseEnd:   tenantData?.lease_end   || null,
          // Activity
          payments:    payments    || [],
          maintenance: maintenance || [],
          // Raw data
          raw: tenantData,
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
