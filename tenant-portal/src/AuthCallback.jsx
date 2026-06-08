import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    async function handleCallback() {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        navigate("/login");
        return;
      }

      const user = session.user;

      // Check if this user came from a tenant invite (via metadata)
      const tenantId = user?.user_metadata?.tenant_id;

      if (tenantId) {
        // Link by tenant_id from metadata
        const { error: linkError } = await supabase
          .from("tenants")
          .update({ user_id: user.id })
          .eq("id", tenantId)
          .is("user_id", null); // only if not already linked

        if (linkError) console.error("Failed to link tenant by id:", linkError.message);

        await supabase.auth.updateUser({
          data: { onboarding_complete: false, role: "tenant" }
        });

        navigate("/onboarding?tenant_id=" + tenantId);
        return;
      }

      // Fallback — try to find tenant by email
      // This handles cases where the Edge Function timed out and tenant_id
      // wasn't embedded in the magic link metadata
      if (user?.email) {
        const { data: tenantByEmail } = await supabase
          .from("tenants")
          .select("id, user_id")
          .eq("email", user.email)
          .maybeSingle();

        if (tenantByEmail && !tenantByEmail.user_id) {
          // Found unlinked tenant with matching email — link it
          const { error: linkError } = await supabase
            .from("tenants")
            .update({ user_id: user.id })
            .eq("id", tenantByEmail.id);

          if (linkError) {
            console.error("Failed to link tenant by email:", linkError.message);
          } else {
            await supabase.auth.updateUser({
              data: { onboarding_complete: false, role: "tenant" }
            });
            navigate("/onboarding?tenant_id=" + tenantByEmail.id);
            return;
          }
        }

        if (tenantByEmail?.user_id === user.id) {
          // Already linked — check if onboarding complete
          if (user?.user_metadata?.onboarding_complete) {
            navigate("/home");
          } else {
            navigate("/onboarding?tenant_id=" + tenantByEmail.id);
          }
          return;
        }
      }

      // Check profile role for existing landlord users
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role === "landlord") {
        navigate("/landlord");
        return;
      }

      // Regular tenant flow
      if (user?.user_metadata?.onboarding_complete) {
        navigate("/home");
      } else {
        navigate("/onboarding");
      }
    }

    handleCallback();
  }, [navigate]);

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", fontFamily: "'DM Sans', sans-serif",
      flexDirection: "column", gap: 12, color: "#9095A0",
      background: "#0A0B0D",
    }}>
      <div style={{
        width: 36, height: 36,
        border: "3px solid rgba(201,169,110,0.2)",
        borderTopColor: "#C9A96E",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <div style={{ fontSize: 14 }}>Signing you in…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}