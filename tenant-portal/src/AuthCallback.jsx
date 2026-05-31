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
      
      // Check if onboarding is complete
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
      minHeight: "100vh", fontFamily: "'Inter',sans-serif",
      flexDirection: "column", gap: 12, color: "#555",
    }}>
      <div style={{
        width: 36, height: 36, border: "3px solid #E6F1FB",
        borderTopColor: "#0C447C", borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <div style={{ fontSize: 14 }}>Signing you in…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}