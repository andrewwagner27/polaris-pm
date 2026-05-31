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

  if (checking) return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", fontFamily: "'Inter',sans-serif",
      flexDirection: "column", gap: 12, color: "#555",
      background: "#f4f5f7",
    }}>
      <div style={{
        width: 36, height: 36, border: "3px solid #E6F1FB",
        borderTopColor: "#0C447C", borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <div style={{ fontSize: 14 }}>Verifying access…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (!authorized) return null;

  return children;
}