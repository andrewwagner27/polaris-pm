// src/AuthLinkError.jsx
// Where an expired or broken Modus email link lands when Supabase sent it somewhere other than the page that handles
// its own errors (e.g. the home page). Explains what happened and offers the right recovery action.
import { useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AUTH_LINK_MESSAGES, linkErrorRedirect } from "./lib/onboardingLink";

const C = { bg: "#F5F3EE", surface: "#FFFFFF", border: "#E4E1DA", text: "#18181B", textSub: "#52525B", gold: "#8B6914" };

export default function AuthLinkError() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const msg = AUTH_LINK_MESSAGES[params.get("reason") === "invalid" ? "invalid" : "expired"];
  const btn = { padding: "12px", minHeight: 44, borderRadius: 8, fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", width: "100%" };
  return (
    <main style={{ width: "100%", fontFamily: "'DM Sans',sans-serif", background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", boxSizing: "border-box" }}>
      <div role="alert" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "28px 24px", width: "100%", maxWidth: 440, textAlign: "center", boxSizing: "border-box" }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 600, color: C.text, margin: "0 0 10px" }}>{msg.title}</h1>
        <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6, margin: "0 0 22px" }}>{msg.body}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={() => navigate("/forgot-password")} style={{ ...btn, border: "none", background: C.gold, color: "#fff", fontWeight: 600 }}>Send me a new password-reset link</button>
          <button onClick={() => navigate("/login")} style={{ ...btn, border: `1px solid ${C.border}`, background: "transparent", color: C.textSub }}>Sign in</button>
        </div>
      </div>
    </main>
  );
}

// Mounted once inside the router: sends a failed auth link that landed on any other page to the page above.
// The onboarding and reset-password pages handle their own link errors and are left alone.
export function LinkErrorCatcher() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const to = linkErrorRedirect({ pathname: location.pathname, hash: location.hash || window.location.hash, search: location.search });
    if (to) navigate(to, { replace: true });
  }, [location.pathname, location.hash, location.search, navigate]);
  return null;
}
