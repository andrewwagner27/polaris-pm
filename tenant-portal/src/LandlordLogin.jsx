import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

const LANDLORD_EMAILS = [
  "andrewwagner27@gmail.com",
  "polarispropertysolutions@gmail.com",
  "capitalpathwaysapw@gmail.com"
];

const C = {
  bg:       "#0A0B0D",
  surface:  "#111316",
  raised:   "#181C21",
  border:   "#252930",
  text:     "#EDEAE2",
  textSub:  "#9095A0",
  textMuted:"#5C6270",
  gold:     "#C9A96E",
  goldDim:  "#7A5C2E",
  red:      "#E05555",
};

function ModusMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M6 33V10L20 27L34 10V33" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 10L20 27L34 10" stroke={C.goldDim} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function Spinner() {
  return <span style={{ width: 16, height: 16, border: "2px solid rgba(201,169,110,0.3)", borderTopColor: C.gold, borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />;
}

function Input({ value, onChange, placeholder, type = "text", onKeyDown }) {
  const [focused, setFocused] = useState(false);
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ width: "100%", padding: "11px 14px", fontSize: 14, border: `1px solid ${focused ? C.gold : C.border}`, borderRadius: 8, background: C.raised, color: C.text, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", boxShadow: focused ? "0 0 0 3px rgba(201,169,110,0.08)" : "none", transition: "border-color 0.15s" }}
    />
  );
}

export default function LandlordLogin() {
  const navigate = useNavigate();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleLogin() {
    if (!email || !password) { setError("Please enter your email and password."); return; }
    setLoading(true); setError("");
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) { setError(authError.message); return; }
    if (!LANDLORD_EMAILS.includes(data.user.email)) {
      await supabase.auth.signOut();
      setError("This account does not have landlord access. Please use the tenant portal.");
      return;
    }
    localStorage.setItem("polaris_landlord", "true");
    navigate("/landlord");
  }

  return (
    <div style={{ width: "100%", fontFamily: "'DM Sans', sans-serif", background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0A0B0D; }
      `}</style>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "40px 36px", width: "100%", maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
          <ModusMark size={40} />
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: C.text, letterSpacing: "0.1em", marginTop: 12 }}>MODUS</div>
          <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: "0.16em", marginTop: 2 }}>PROPERTY MANAGEMENT</div>
          <div style={{ fontSize: 13, color: C.textSub, marginTop: 10 }}>Sign in to manage your portfolio</div>
        </div>

        {error && (
          <div style={{ background: "rgba(224,85,85,0.1)", border: `1px solid rgba(224,85,85,0.2)`, borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: C.red }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.textSub, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Email</label>
          <Input value={email} onChange={e => { setEmail(e.target.value); setError(""); }} placeholder="you@email.com" type="email" onKeyDown={e => e.key === "Enter" && handleLogin()} />
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.textSub, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Password</label>
          <div style={{ position: "relative" }}>
            <Input value={password} onChange={e => { setPassword(e.target.value); setError(""); }} placeholder="••••••••" type={showPw ? "text" : "password"} onKeyDown={e => e.key === "Enter" && handleLogin()} />
            <button onClick={() => setShowPw(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.textMuted, padding: 0 }}>
              {showPw ? "○" : "●"}
            </button>
          </div>
        </div>

        <div style={{ textAlign: "right", marginBottom: 24 }}>
          <button onClick={() => navigate("/forgot-password")} style={{ fontSize: 12, color: C.goldDim, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", padding: 0, transition: "color 0.15s" }}
            onMouseOver={e => e.currentTarget.style.color = C.gold}
            onMouseOut={e => e.currentTarget.style.color = C.goldDim}
          >Forgot password?</button>
        </div>

        <button onClick={handleLogin} disabled={loading} style={{
          width: "100%", padding: "12px", border: `1px solid ${C.goldDim}`,
          borderRadius: 8, fontSize: 14, fontWeight: 500,
          background: loading ? "rgba(201,169,110,0.07)" : "transparent",
          color: C.gold, cursor: loading ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8, fontFamily: "'DM Sans', sans-serif", transition: "background 0.15s",
          opacity: loading ? 0.7 : 1,
        }}
          onMouseOver={e => !loading && (e.currentTarget.style.background = "rgba(201,169,110,0.07)")}
          onMouseOut={e => !loading && (e.currentTarget.style.background = "transparent")}
        >
          {loading ? <><Spinner /> Signing in…</> : "Sign in to dashboard →"}
        </button>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button onClick={() => navigate("/")} style={{ fontSize: 12, color: C.textMuted, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "color 0.15s" }}
            onMouseOver={e => e.currentTarget.style.color = C.textSub}
            onMouseOut={e => e.currentTarget.style.color = C.textMuted}
          >← Back to home</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, color: C.textMuted, marginTop: 20 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.textMuted }} />
          Secure landlord access · Not a tenant portal
        </div>
      </div>
    </div>
  );
}