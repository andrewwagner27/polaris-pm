import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

const LANDLORD_EMAILS = [
  "andrewwagner27@gmail.com",
  "polarispropertysolutions@gmail.com",
  "capitalpathwaysapw@gmail.com"
];

const s = {
  app: {
    width: "100%", fontFamily: "'Inter','Segoe UI',sans-serif",
    fontSize: 14, color: "#1a1a1a", background: "#0C1F3F",
    minHeight: "100vh", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  card: {
    background: "#fff", borderRadius: 16, padding: "36px 32px",
    width: "100%", maxWidth: 400, boxSizing: "border-box",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  },
  logoWrap: {
    width: 52, height: 52, borderRadius: 14, background: "#E6F1FB",
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 16px", fontSize: 24,
  },
  title: { fontSize: 22, fontWeight: 800, color: "#0C447C", textAlign: "center", marginBottom: 4 },
  sub: { fontSize: 13, color: "#888", textAlign: "center", marginBottom: 28 },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 11, fontWeight: 600, color: "#555",
    letterSpacing: "0.06em", textTransform: "uppercase",
    display: "block", marginBottom: 5,
  },
  input: {
    width: "100%", padding: "11px 14px", fontSize: 14,
    border: "1px solid #d1d5db", borderRadius: 8,
    background: "#fff", color: "#1a1a1a", outline: "none",
    boxSizing: "border-box", fontFamily: "'Inter',sans-serif",
  },
  passwordWrap: { position: "relative" },
  eyeBtn: {
    position: "absolute", right: 12, top: "50%",
    transform: "translateY(-50%)", background: "none",
    border: "none", cursor: "pointer", fontSize: 16, color: "#888", padding: 0,
  },
  errorBanner: {
    background: "#FDECEA", border: "1px solid #f5c6c6",
    borderRadius: 8, padding: "10px 14px", marginBottom: 16,
    fontSize: 13, color: "#A32D2D",
  },
  forgotWrap: { textAlign: "right", marginBottom: 16, marginTop: -8 },
  forgotLink: {
    fontSize: 12, color: "#185FA5", cursor: "pointer",
    background: "none", border: "none",
    fontFamily: "'Inter',sans-serif", padding: 0,
  },
  submitBtn: (loading) => ({
    width: "100%", padding: 13, border: "none", borderRadius: 8,
    fontSize: 15, fontWeight: 600,
    background: loading ? "#378ADD" : "#0C447C",
    color: "#fff", cursor: loading ? "not-allowed" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: 8, fontFamily: "'Inter',sans-serif", marginTop: 8,
  }),
  backLink: { textAlign: "center", marginTop: 16, fontSize: 13, color: "#888" },
  backBtn: {
    color: "#185FA5", cursor: "pointer", background: "none",
    border: "none", fontFamily: "'Inter',sans-serif", fontSize: 13,
  },
  securityNote: {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 11, color: "#aaa", textAlign: "center",
    marginTop: 20, justifyContent: "center",
  },
};

function Spinner() {
  return (
    <span style={{
      width: 16, height: 16, border: "2px solid rgba(255,255,255,0.35)",
      borderTopColor: "#fff", borderRadius: "50%", display: "inline-block",
      animation: "spin 0.7s linear infinite",
    }} />
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
    setLoading(true);
    setError("");

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
    <div style={s.app}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; } body { margin: 0; background: #0C1F3F; }`}</style>
      <div style={s.card}>
        <div style={s.logoWrap}>🏢</div>
        <div style={s.title}>Landlord Portal</div>
        <div style={s.sub}>Sign in to manage your portfolio</div>

        {error && <div style={s.errorBanner}>⚠️ {error}</div>}

        <div style={s.fieldWrap}>
          <label style={s.fieldLabel}>Email</label>
          <input style={s.input} type="email" value={email}
            onChange={e => { setEmail(e.target.value); setError(""); }}
            placeholder="you@email.com"
            onKeyDown={e => e.key === "Enter" && handleLogin()} />
        </div>

        <div style={s.fieldWrap}>
          <label style={s.fieldLabel}>Password</label>
          <div style={s.passwordWrap}>
            <input style={{ ...s.input, paddingRight: 40 }}
              type={showPw ? "text" : "password"} value={password}
              onChange={e => { setPassword(e.target.value); setError(""); }}
              placeholder="••••••••"
              onKeyDown={e => e.key === "Enter" && handleLogin()} />
            <button style={s.eyeBtn} onClick={() => setShowPw(v => !v)}>
              {showPw ? "🙈" : "👁️"}
            </button>
          </div>
        </div>

        <div style={s.forgotWrap}>
          <button style={s.forgotLink} onClick={() => navigate("/forgot-password")}>
            Forgot password?
          </button>
        </div>

        <button style={s.submitBtn(loading)} onClick={handleLogin} disabled={loading}>
          {loading ? <><Spinner /> Signing in…</> : "Sign in to dashboard →"}
        </button>

        <div style={s.backLink}>
          <button style={s.backBtn} onClick={() => navigate("/")}>← Back to home</button>
        </div>

        <div style={s.securityNote}>
          🔒 Secure landlord access · Not a tenant portal
        </div>
      </div>
    </div>
  );
}