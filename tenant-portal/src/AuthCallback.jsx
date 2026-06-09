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

      // Primary: link by tenant_id from invite metadata
      const tenantId = user?.user_metadata?.tenant_id;

      if (tenantId) {
        await supabase
          .from("tenants")
          .update({ user_id: user.id })
          .eq("id", tenantId)
          .is("user_id", null);

        await supabase.auth.updateUser({
          data: { onboarding_complete: false, role: "tenant" }
        });

        navigate("/onboarding?tenant_id=" + tenantId);
        return;
      }

      // Fallback: find tenant by email if tenant_id not in metadata
      if (user?.email) {
        const { data: tenantByEmail } = await supabase
          .from("tenants")
          .select("id, user_id")
          .eq("email", user.email)
          .maybeSingle();

        if (tenantByEmail && !tenantByEmail.user_id) {
          // Link unmatched tenant
          await supabase
            .from("tenants")
            .update({ user_id: user.id })
            .eq("id", tenantByEmail.id);

          await supabase.auth.updateUser({
            data: { onboarding_complete: false, role: "tenant" }
          });

          navigate("/onboarding?tenant_id=" + tenantByEmail.id);
          return;
        }

        if (tenantByEmail?.user_id === user.id) {
          // Already linked
          if (user?.user_metadata?.onboarding_complete) {
            navigate("/home");
          } else {
            navigate("/onboarding?tenant_id=" + tenantByEmail.id);
          }
          return;
        }
      }

      // Check if landlord
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role === "landlord") {
        navigate("/landlord");
        return;
      }

      // Default tenant flow
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