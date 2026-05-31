import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

const s = {
  app: {
    width: "100%",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontSize: 14,
    color: "#1a1a1a",
    background: "#0C447C",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  hero: {
    background: "linear-gradient(160deg, #0C447C 0%, #185FA5 100%)",
    padding: "52px 32px 40px",
    textAlign: "center",
  },
  logoWrap: {
    width: 56, height: 56, borderRadius: 16,
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.25)",
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 16px", fontSize: 26,
  },
  appName: { fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 6 },
  appTagline: { fontSize: 13, color: "#85B7EB", lineHeight: 1.5 },
  card: {
    background: "#fff",
    borderRadius: "20px 20px 0 0",
    flex: 1,
    padding: "28px 24px 40px",
    marginTop: -16,
    width: "100%",
    maxWidth: 560,
    margin: "-16px auto 0",
    boxSizing: "border-box",
  },
  tabs: {
    display: "flex", background: "#f4f5f7",
    borderRadius: 10, padding: 4, marginBottom: 24, gap: 4,
  },
  tabActive: {
    flex: 1, padding: "9px 0", background: "#fff", border: "none",
    borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#0C447C",
    cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  tabInactive: {
    flex: 1, padding: "9px 0", background: "transparent", border: "none",
    borderRadius: 8, fontSize: 13, fontWeight: 400, color: "#888",
    cursor: "pointer", fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
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
    boxSizing: "border-box", fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  passwordWrap: { position: "relative" },
  eyeBtn: {
    position: "absolute", right: 12, top: "50%",
    transform: "translateY(-50%)", background: "none",
    border: "none", cursor: "pointer", fontSize: 16,
    color: "#888", padding: 0,
  },
  fieldErr: { fontSize: 11, color: "#c0392b", marginTop: 4 },
  errorBanner: {
    background: "#FDECEA", border: "1px solid #f5c6c6",
    borderRadius: 8, padding: "10px 14px", marginBottom: 16,
    fontSize: 13, color: "#A32D2D", display: "flex", alignItems: "center", gap: 8,
  },
  successBanner: {
    background: "#EAF3DE", border: "1px solid #c3e6a0",
    borderRadius: 8, padding: "10px 14px", marginBottom: 16,
    fontSize: 13, color: "#3B6D11", display: "flex", alignItems: "center", gap: 8,
  },
  forgotWrap: { textAlign: "right", marginBottom: 20, marginTop: -8 },
  forgotLink: {
    fontSize: 12, color: "#185FA5", cursor: "pointer",
    background: "none", border: "none",
    fontFamily: "'Inter', 'Segoe UI', sans-serif", padding: 0,
  },
  submitBtn: (loading) => ({
    width: "100%", padding: 13, border: "none", borderRadius: 8,
    fontSize: 15, fontWeight: 600,
    background: loading ? "#378ADD" : "#0C447C",
    color: "#fff", cursor: loading ? "not-allowed" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: 8, transition: "background 0.15s",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    opacity: loading ? 0.85 : 1,
  }),
  divider: {
    display: "flex", alignItems: "center", gap: 12, margin: "20px 0",
  },
  dividerLine: { flex: 1, height: 1, background: "#e8eaed" },
  dividerText: { fontSize: 12, color: "#aaa", whiteSpace: "nowrap" },

  termsText: {
    fontSize: 11, color: "#aaa", textAlign: "center",
    marginTop: 20, lineHeight: 1.6,
  },
  termsLink: { color: "#185FA5", cursor: "pointer" },

};

function Spinner() {
  return (
    <span style={{
      width: 16, height: 16,
      border: "2px solid rgba(255,255,255,0.35)",
      borderTopColor: "#fff", borderRadius: "50%",
      display: "inline-block", animation: "spin 0.7s linear infinite",
    }} />
  );
}

// ── Sign In ───────────────────────────────────────────────────────────────────
function SignInForm({ onSuccess }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit() {
    if (!email || !password) { setError("Please enter your email and password."); return; }
    setLoading(true);
    setError("");
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) { setError(authError.message); return; }
    onSuccess(data.user);
  }

  return (
    <div>
      {error && <div style={s.errorBanner}>⚠️ {error}</div>}
      <div style={s.fieldWrap}>
        <label style={s.fieldLabel}>Email</label>
        <input style={s.input} type="email" value={email}
          onChange={e => { setEmail(e.target.value); setError(""); }}
          placeholder="you@email.com" onKeyDown={e => e.key === "Enter" && handleSubmit()} />
      </div>
      <div style={s.fieldWrap}>
        <label style={s.fieldLabel}>Password</label>
        <div style={s.passwordWrap}>
          <input style={{ ...s.input, paddingRight: 40 }}
            type={showPw ? "text" : "password"} value={password}
            onChange={e => { setPassword(e.target.value); setError(""); }}
            placeholder="••••••••" onKeyDown={e => e.key === "Enter" && handleSubmit()} />
          <button style={s.eyeBtn} onClick={() => setShowPw(v => !v)}>
            {showPw ? "🙈" : "👁️"}
          </button>
        </div>
      </div>
      <div style={s.forgotWrap}>
        <button style={s.forgotLink} onClick={async () => {
          if (!email) { setError("Enter your email first."); return; }
          await supabase.auth.resetPasswordForEmail(email);
          setError(""); alert("Password reset email sent!");
        }}>Forgot password?</button>
      </div>
      <button style={s.submitBtn(loading)} onClick={handleSubmit} disabled={loading}>
        {loading ? <><Spinner /> Signing in…</> : "Sign in"}
      </button>
    </div>
  );
}

// ── Sign Up ───────────────────────────────────────────────────────────────────
function SignUpForm({ onSuccess }) {
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [unit, setUnit]         = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [emailSent, setEmailSent] = useState(false);

  async function handleSubmit() {
    if (!name || !email || !password || !unit) { setError("Please fill in all fields."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    setError("");
    const { data, error: authError } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name, unit_number: unit } }
    });
    setLoading(false);
    if (authError) { setError(authError.message); return; }
    setEmailSent(true);
  }

  if (emailSent) {
    return (
      <div style={{ textAlign: "center", padding: "20px 0" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#E6F1FB", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", fontSize: 28 }}>✉️</div>
        <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Check your email</p>
        <p style={{ fontSize: 14, color: "#666", lineHeight: 1.6, marginBottom: 6 }}>
          We sent a confirmation link to <strong>{email}</strong>.
        </p>
        <p style={{ fontSize: 13, color: "#888", lineHeight: 1.6, marginBottom: 20 }}>
          Click the link in the email to verify your address and access your portal. Check your spam folder if you don't see it.
        </p>
        <p style={{ fontSize: 12, color: "#aaa" }}>Once confirmed, come back and sign in.</p>
      </div>
    );
  }

  return (
    <div>
      {error && <div style={s.errorBanner}>⚠️ {error}</div>}
      <div style={s.fieldWrap}>
        <label style={s.fieldLabel}>Full name</label>
        <input style={s.input} value={name} onChange={e => { setName(e.target.value); setError(""); }} placeholder="Maria Rodriguez" />
      </div>
      <div style={s.fieldWrap}>
        <label style={s.fieldLabel}>Email</label>
        <input style={s.input} type="email" value={email} onChange={e => { setEmail(e.target.value); setError(""); }} placeholder="you@email.com" />
      </div>
      <div style={s.fieldWrap}>
        <label style={s.fieldLabel}>Unit number</label>
        <input style={s.input} value={unit} onChange={e => { setUnit(e.target.value); setError(""); }} placeholder="4B" />
      </div>
      <div style={s.fieldWrap}>
        <label style={s.fieldLabel}>Password</label>
        <div style={s.passwordWrap}>
          <input style={{ ...s.input, paddingRight: 40 }}
            type={showPw ? "text" : "password"} value={password}
            onChange={e => { setPassword(e.target.value); setError(""); }}
            placeholder="Min. 8 characters" />
          <button style={s.eyeBtn} onClick={() => setShowPw(v => !v)}>
            {showPw ? "🙈" : "👁️"}
          </button>
        </div>
      </div>
      <button style={s.submitBtn(loading)} onClick={handleSubmit} disabled={loading}>
        {loading ? <><Spinner /> Creating account…</> : "Create account"}
      </button>
      <p style={s.termsText}>
        By signing up you agree to our <span style={s.termsLink}>Terms</span> and <span style={s.termsLink}>Privacy Policy</span>
      </p>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function LoginScreen({ onSuccess }) {
  const navigate = useNavigate();
  const [tab, setTab]             = useState("signin");


  function handleSuccess(user) {
    if (onSuccess) onSuccess(user);
    else navigate("/home");
  }

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; } body { margin: 0; background: #0C447C; }`}</style>
      <div style={s.app}>
        <div style={s.hero}>
          <div style={s.logoWrap}>🏢</div>
          <div style={s.appName}>Polaris Tenant</div>
          <div style={s.appTagline}>Pay rent, submit requests,<br />and message your property manager</div>
        </div>

        <div style={s.card}>
          <div style={s.tabs}>
            <button style={tab === "signin" ? s.tabActive : s.tabInactive} onClick={() => setTab("signin")}>Sign in</button>
            <button style={tab === "signup" ? s.tabActive : s.tabInactive} onClick={() => setTab("signup")}>Create account</button>
          </div>

          {tab === "signin"
            ? <SignInForm onSuccess={handleSuccess} />
            : <SignUpForm onSuccess={handleSuccess} />
          }
        </div>
      </div>
    </>
  );
}