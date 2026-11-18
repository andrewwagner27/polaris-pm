import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

export default function ProtectedLandlordRoute({ children }) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      // 1. Check if logged in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/landlord/login");
        return;
      }

      // 2. Check role from profiles table
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile || profile.role !== "landlord") {
        navigate("/landlord/login");
        return;
      }

      setAuthorized(true);
      setChecking(false);
    }

    checkAuth();
  }, [navigate]);

  // Same dark surface as the management app, so navigating between landlord pages doesn't flash a light screen.
  if (checking) return (
    <div role="status" aria-live="polite" style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", fontFamily: "'DM Sans',sans-serif",
      flexDirection: "column", gap: 12, color: "#B7BBC4",
      background: "#0B0D10",
    }}>
      <div aria-hidden="true" style={{
        width: 32, height: 32, border: "3px solid #303640",
        borderTopColor: "#C9A968", borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <div style={{ fontSize: 14 }}>Verifying access…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }`}</style>
    </div>
  );

  if (!authorized) return null;

  return children;
}