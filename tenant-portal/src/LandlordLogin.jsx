import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

const LANDLORD_EMAILS = [
  "moduspropmgmt@gmail.com",
];

const C = {
  bg:       "#0B0D10",
  surface:  "#15191F",
  raised:   "#1C2129",
  border:   "#262B33",
  text:     "#F5F2EB",
  textSub:  "#B7BBC4",
  textMuted:"#9298A3",
  gold:     "#C9A968",
  goldDim:  "#6B4F24",
  blue:     "#6AAEF0",
  green:    "#72B02A",
  red:      "#F07070",
  amber:    "#F0A430",
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

function Input({ value, onChange, placeholder, type = "text", onKeyDown, id, autoComplete, required }) {
  const [focused, setFocused] = useState(false);
  return (
    <input id={id} name={id} autoComplete={autoComplete} required={required} type={type} value={value} onChange={onChange} placeholder={placeholder} onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ width: "100%", padding: "11px 14px", fontSize: 14, border: `1px solid ${focused ? C.gold : C.border}`, borderRadius: 8, background: C.raised, color: C.text, outline: "none", boxSizing: "border-box", fontFamily: "var(--m-font)", boxShadow: focused ? "0 0 0 3px rgba(201,169,110,0.08)" : "none", transition: "border-color 0.15s" }}
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
    <div style={{ width: "100%", fontFamily: "var(--m-font)", background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{`
        
        @keyframes spin { to { transform: rotate(360deg); } }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0B0D10; }
      `}</style>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "40px 36px", width: "100%", maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
          <ModusMark size={40} />
          <div style={{ fontFamily: "var(--m-font-brand)", fontSize: 22, fontWeight: 600, color: C.text, letterSpacing: "0.1em", marginTop: 12 }}>MODUS</div>
          <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: "0.16em", marginTop: 2 }}>PROPERTY MANAGEMENT</div>
          <div style={{ fontSize: 13, color: C.textSub, marginTop: 10 }}>Sign in to manage your portfolio</div>
        </div>

        {error && (
          <div style={{ background: "rgba(224,85,85,0.1)", border: `1px solid rgba(224,85,85,0.2)`, borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: C.red }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label htmlFor="landlord-login-email" style={{ fontSize:12, fontWeight: 600, color: C.textSub, display: "block", marginBottom: 6 }}>Email</label>
          <Input id="landlord-login-email" autoComplete="email" required value={email} onChange={e => { setEmail(e.target.value); setError(""); }} placeholder="you@email.com" type="email" onKeyDown={e => e.key === "Enter" && handleLogin()} />
        </div>

        <div style={{ marginBottom: 8 }}>
          <label htmlFor="landlord-login-password" style={{ fontSize:12, fontWeight: 600, color: C.textSub, display: "block", marginBottom: 6 }}>Password</label>
          <div style={{ position: "relative" }}>
            <Input id="landlord-login-password" autoComplete="current-password" required value={password} onChange={e => { setPassword(e.target.value); setError(""); }} placeholder="••••••••" type={showPw ? "text" : "password"} onKeyDown={e => e.key === "Enter" && handleLogin()} />
            <button type="button" aria-label={showPw ? "Hide password" : "Show password"} aria-pressed={showPw} aria-controls="landlord-login-password" onClick={()=>setShowPw(v=>!v)} style={{ position:"absolute",right:2,top:"50%",transform:"translateY(-50%)",width:44,height:44,background:"none",border:"none",cursor:"pointer",fontSize:14,color:C.textMuted,padding:0 }}>
              {showPw ? "○" : "●"}
            </button>
          </div>
        </div>

        <div style={{ textAlign: "right", marginBottom: 24 }}>
          <button onClick={() => navigate("/forgot-password")} style={{ fontSize: 12, color: "#C9A968", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--m-font)", padding: "0 4px",minHeight:44, transition: "color 0.15s" }}
            onMouseOver={e => e.currentTarget.style.color = C.gold}
            onMouseOut={e => e.currentTarget.style.color = "#C9A968"}
          >Forgot password?</button>
        </div>

        <button onClick={handleLogin} disabled={loading} style={{
          width: "100%", minHeight: 48, padding: "12px", border: `1px solid ${C.goldDim}`,
          borderRadius: 8, fontSize: 14, fontWeight: 500,
          background: loading ? "rgba(201,169,110,0.07)" : "transparent",
          color: C.gold, cursor: loading ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8, fontFamily: "var(--m-font)", transition: "background 0.15s",
          opacity: loading ? 0.7 : 1,
        }}
          onMouseOver={e => !loading && (e.currentTarget.style.background = "rgba(201,169,110,0.07)")}
          onMouseOut={e => !loading && (e.currentTarget.style.background = "transparent")}
        >
          {loading ? <><Spinner /> Signing in…</> : "Sign in to dashboard →"}
        </button>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button type="button" onClick={() => navigate("/")} style={{ minHeight: 44, padding: "0 8px", fontSize: 13, color: C.textMuted, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--m-font)", transition: "color 0.15s" }}
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