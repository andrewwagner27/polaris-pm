import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const CACHE_KEY = "modus_tenant_cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(CACHE_KEY); return null; }
    return data;
  } catch { return null; }
}

function writeCache(data) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

export function clearTenantCache() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
}

export function useTenant() {
  const cached = readCache();
  const [tenant, setTenant]   = useState(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError]     = useState(null);
  const [user, setUser]       = useState(null);

  useEffect(() => {
    let mounted = true;

    async function fetchTenantData() {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser || !mounted) { setLoading(false); return; }
        setUser(authUser);

        // Fetch tenant + profile in parallel
        const [{ data: tenantData }, { data: profileData }] = await Promise.all([
          supabase.from("tenants").select("*").eq("user_id", authUser.id).maybeSingle(),
          supabase.from("profiles").select("role").eq("id", authUser.id).maybeSingle(),
        ]);

        const role     = profileData?.role || "tenant";
        const tenantId = tenantData?.id || authUser.id;

        // Fetch unit + all tenant-scoped data in parallel
        const [unitResult, paymentsResult, maintenanceResult, chargesResult] = await Promise.all([
          tenantData?.unit_id
            ? supabase.from("units").select("*, properties(*)").eq("id", tenantData.unit_id).maybeSingle()
            : Promise.resolve({ data: null }),
          supabase.from("payments").select("*").eq("tenant_id", tenantId).order("paid_at", { ascending: false }).limit(6),
          supabase.from("maintenance_requests").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(5),
          supabase.from("recurring_charges").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
        ]);

        if (!mounted) return;

        const unitData     = unitResult.data;
        const propertyData = unitData?.properties;

        const result = {
          id:               tenantId,
          user_id:          authUser.id,
          unit_id:          tenantData?.unit_id || null,
          name:             tenantData?.name     || authUser.user_metadata?.full_name || "Tenant",
          email:            authUser.email,
          phone:            tenantData?.phone    || authUser.user_metadata?.phone || "—",
          unit:             unitData?.unit_number || authUser.user_metadata?.unit_number || "—",
          property:         propertyData?.name   || "—",
          address:          propertyData
            ? `${propertyData.address}, ${propertyData.city} ${propertyData.state}`
            : "—",
          rent:             unitData?.rent_amount || 0,
          leaseStart:       tenantData?.lease_start || null,
          leaseEnd:         tenantData?.lease_end   || null,
          security_deposit: tenantData?.security_deposit ?? null,
          payments:         paymentsResult.data    || [],
          maintenance:      maintenanceResult.data  || [],
          recurringCharges: chargesResult.data      || [],
          raw:              tenantData,
          role,
        };

        writeCache(result);
        setTenant(result);
      } catch (err) {
        console.error("useTenant error:", err);
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    // If we had a cache hit, refresh in background without showing spinner
    fetchTenantData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) { clearTenantCache(); fetchTenantData(); }
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
  clearTenantCache();
  await supabase.auth.signOut();
  window.location.href = "/";
}
