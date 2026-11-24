import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "./supabase";

export default function ProtectedLandlordRoute({ children }) {
  const [access, setAccess] = useState("checking");

  useEffect(() => {
    let generation = 0;
    let active = true;
    let scheduledUser = null;

    async function verify(userId, current) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!active || current !== generation) return;
        if (user?.id !== userId) {
          setAccess("denied");
          return;
        }
        const { data: profile } = await supabase.from("profiles")
          .select("role").eq("id", user.id).maybeSingle();
        if (active && current === generation) {
          setAccess(profile?.role === "landlord" ? "allowed" : "denied");
        }
      } catch {
        if (active && current === generation) setAccess("denied");
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const userId = session?.user?.id ?? null;
      if (userId === scheduledUser && event !== "INITIAL_SESSION" && event !== "USER_UPDATED") return;
      scheduledUser = userId;
      const current = ++generation;
      setAccess(userId ? "checking" : "denied");
      // Run outside the auth callback so the session lock is released.
      if (userId) setTimeout(() => {
        if (active && current === generation) void verify(userId, current);
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Same dark surface as the management app, so navigating between landlord pages doesn't flash a light screen.
  if (access === "checking") return (
    <div role="status" aria-live="polite" style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", fontFamily: "var(--m-font)",
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

  if (access !== "allowed") return <Navigate to="/landlord/login" replace/>;

  return children;
}