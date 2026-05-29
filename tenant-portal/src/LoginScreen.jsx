import { useState } from "react";

const s = {
  app: {
    width: "100%",
    maxWidth: "100%",
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
    width: 56,
    height: 56,
    borderRadius: 16,
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 16px",
    fontSize: 26,
  },
  appName: {
    fontSize: 22,
    fontWeight: 700,
    color: "#fff",
    marginBottom: 6,
  },
  appTagline: {
    fontSize: 13,
    color: "#85B7EB",
    lineHeight: 1.5,
  },
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
    display: "flex",
    background: "#f4f5f7",
    borderRadius: 10,
    padding: 4,
    marginBottom: 24,
    gap: 4,
  },
  tabActive: {
    flex: 1,
    padding: "9px 0",
    background: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    color: "#0C447C",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  tabInactive: {
    flex: 1,
    padding: "9px 0",
    background: "transparent",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 400,
    color: "#888",
    cursor: "pointer",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#555",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    display: "block",
    marginBottom: 5,
  },
  input: {
    width: "100%",
    padding: "11px 14px",
    fontSize: 14,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    color: "#1a1a1a",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  passwordWrap: { position: "relative" },
  eyeBtn: {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 16,
    color: "#888",
    padding: 0,
  },
  fieldErr: { fontSize: 11, color: "#c0392b", marginTop: 4 },
  forgotWrap: { textAlign: "right", marginBottom: 20, marginTop: -8 },
  forgotLink: {
    fontSize: 12,
    color: "#185FA5",
    textDecoration: "none",
    cursor: "pointer",
    background: "none",
    border: "none",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    padding: 0,
  },
  submitBtn: (loading) => ({
    width: "100%",
    padding: 13,
    border: "none",
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    background: loading ? "#378ADD" : "#0C447C",
    color: "#fff",
    cursor: loading ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    transition: "background 0.15s",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    opacity: loading ? 0.85 : 1,
  }),
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    margin: "20px 0",
  },
  dividerLine: { flex: 1, height: 1, background: "#e8eaed" },
  dividerText: { fontSize: 12, color: "#aaa", whiteSpace: "nowrap" },
  magicBtn: {
    width: "100%",
    padding: 12,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    background: "#fff",
    color: "#1a1a1a",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    transition: "background 0.15s",
  },
  termsText: {
    fontSize: 11,
    color: "#aaa",
    textAlign: "center",
    marginTop: 20,
    lineHeight: 1.6,
  },
  termsLink: { color: "#185FA5", cursor: "pointer" },
  // Magic link sent state
  magicWrap: { textAlign: "center", padding: "20px 0" },
  magicIcon: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: "#E6F1FB",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 18px",
    fontSize: 28,
  },
  // Success / logged in state
  successWrap: { textAlign: "center", padding: "20px 0 10px" },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: "#e8f5e9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 18px",
    fontSize: 28,
  },
};

function Spinner() {
  return (
    <span style={{
      width: 16, height: 16,
      border: "2px solid rgba(255,255,255,0.35)",
      borderTopColor: "#fff",
      borderRadius: "50%",
      display: "inline-block",
      animation: "spin 0.7s linear infinite",
    }} />
  );
}

function FocusInput({ type = "text", value, onChange, placeholder, style: extraStyle = {} }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{
        ...s.input,
        ...extraStyle,
        borderColor: focused ? "#185FA5" : "#d1d5db",
        boxShadow: focused ? "0 0 0 3px rgba(24,95,165,0.1)" : "none",
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

// ── Sign In form ──────────────────────────────────────────────────────────────
function SignInForm({ onSuccess }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [errors, setErrors]     = useState({});
  const [loading, setLoading]   = useState(false);

  function validate() {
    const e = {};
    if (!email.trim() || !email.includes("@")) e.email = "Enter a valid email address";
    if (!password || password.length < 6)       e.password = "Password must be at least 6 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);
    // TODO: replace with Supabase auth
    // const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    // if (error) { setErrors({ password: error.message }); setLoading(false); return; }
    await new Promise(r => setTimeout(r, 1500));
    setLoading(false);
    onSuccess(email);
  }

  return (
    <div>
      <div style={s.fieldWrap}>
        <label style={s.fieldLabel}>Email</label>
        <FocusInput
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: "" })); }}
          placeholder="maria@email.com"
        />
        {errors.email && <p style={s.fieldErr}>{errors.email}</p>}
      </div>

      <div style={s.fieldWrap}>
        <label style={s.fieldLabel}>Password</label>
        <div style={s.passwordWrap}>
          <FocusInput
            type={showPw ? "text" : "password"}
            value={password}
            onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: "" })); }}
            placeholder="••••••••"
            style={{ paddingRight: 40 }}
          />
          <button style={s.eyeBtn} onClick={() => setShowPw(v => !v)}>
            {showPw ? "🙈" : "👁️"}
          </button>
        </div>
        {errors.password && <p style={s.fieldErr}>{errors.password}</p>}
      </div>

      <div style={s.forgotWrap}>
        <button style={s.forgotLink}>Forgot password?</button>
      </div>

      <button style={s.submitBtn(loading)} onClick={handleSubmit} disabled={loading}>
        {loading ? <><Spinner /> Signing in…</> : "Sign in"}
      </button>
    </div>
  );
}

// ── Sign Up form ──────────────────────────────────────────────────────────────
function SignUpForm({ onSuccess }) {
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [unit, setUnit]         = useState("");
  const [errors, setErrors]     = useState({});
  const [loading, setLoading]   = useState(false);

  function validate() {
    const e = {};
    if (!name.trim())                           e.name     = "Enter your full name";
    if (!email.trim() || !email.includes("@")) e.email    = "Enter a valid email address";
    if (!password || password.length < 8)       e.password = "Password must be at least 8 characters";
    if (!unit.trim())                           e.unit     = "Enter your unit number";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);
    // TODO: replace with Supabase auth
    // const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name, unit } } });
    // if (error) { setErrors({ email: error.message }); setLoading(false); return; }
    await new Promise(r => setTimeout(r, 1500));
    setLoading(false);
    onSuccess(email);
  }

  return (
    <div>
      <div style={s.fieldWrap}>
        <label style={s.fieldLabel}>Full name</label>
        <FocusInput value={name} onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: "" })); }} placeholder="Maria Rodriguez" />
        {errors.name && <p style={s.fieldErr}>{errors.name}</p>}
      </div>

      <div style={s.fieldWrap}>
        <label style={s.fieldLabel}>Email</label>
        <FocusInput type="email" value={email} onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: "" })); }} placeholder="maria@email.com" />
        {errors.email && <p style={s.fieldErr}>{errors.email}</p>}
      </div>

      <div style={s.fieldWrap}>
        <label style={s.fieldLabel}>Unit number</label>
        <FocusInput value={unit} onChange={e => { setUnit(e.target.value); setErrors(p => ({ ...p, unit: "" })); }} placeholder="4B" />
        {errors.unit && <p style={s.fieldErr}>{errors.unit}</p>}
      </div>

      <div style={s.fieldWrap}>
        <label style={s.fieldLabel}>Password</label>
        <div style={s.passwordWrap}>
          <FocusInput
            type={showPw ? "text" : "password"}
            value={password}
            onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: "" })); }}
            placeholder="Min. 8 characters"
            style={{ paddingRight: 40 }}
          />
          <button style={s.eyeBtn} onClick={() => setShowPw(v => !v)}>
            {showPw ? "🙈" : "👁️"}
          </button>
        </div>
        {errors.password && <p style={s.fieldErr}>{errors.password}</p>}
      </div>

      <button style={s.submitBtn(loading)} onClick={handleSubmit} disabled={loading}>
        {loading ? <><Spinner /> Creating account…</> : "Create account"}
      </button>

      <p style={s.termsText}>
        By signing up you agree to our{" "}
        <span style={s.termsLink}>Terms of Service</span> and{" "}
        <span style={s.termsLink}>Privacy Policy</span>
      </p>
    </div>
  );
}

// ── Magic link sent screen ────────────────────────────────────────────────────
function MagicLinkSent({ email, onBack }) {
  return (
    <div style={s.magicWrap}>
      <div style={s.magicIcon}>✉️</div>
      <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Check your email</p>
      <p style={{ fontSize: 14, color: "#666", lineHeight: 1.6, marginBottom: 24 }}>
        We sent a sign-in link to <strong>{email}</strong>. Click the link to sign in — no password needed.
      </p>
      <p style={{ fontSize: 12, color: "#aaa", marginBottom: 20 }}>Didn't get it? Check your spam folder.</p>
      <button style={{ ...s.magicBtn, justifyContent: "center" }} onClick={onBack}>
        ← Try a different email
      </button>
    </div>
  );
}

// ── Logged in state ───────────────────────────────────────────────────────────
function LoggedIn({ email, onSignOut, onPortal }) {
  return (
    <div style={s.successWrap}>
      <div style={s.successIcon}>✅</div>
      <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>You're signed in</p>
      <p style={{ fontSize: 14, color: "#666", marginBottom: 28 }}>{email}</p>
      <div style={{
        background: "#f8f9fa", border: "1px solid #e8eaed",
        borderRadius: 10, padding: "14px 16px", marginBottom: 24, textAlign: "left",
      }}>
        {[["Unit", "4B"], ["Property", "Clifton Manor"], ["Lease ends", "Dec 31, 2026"]].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "9px 0", borderBottom: "1px solid #e8eaed" }}>
            <span style={{ fontSize: 13, color: "#666", flexShrink: 0 }}>{k}</span>
            <span style={{ fontSize: 13, fontWeight: 600, textAlign: "right" }}>{v}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "9px 0" }}>
          <span style={{ fontSize: 13, color: "#666", flexShrink: 0 }}>Rent due</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#854F0B", textAlign: "right" }}>Jun 1 · $1,150</span>
        </div>
      </div>
      <button
        style={{ ...s.submitBtn(false), background: "#0C447C", color: "#fff", marginBottom: 10 }}
        onClick={() => onPortal && onPortal()}
      >
        Go to my portal →
      </button>
      <button
        style={{ ...s.magicBtn, marginTop: 8 }}
        onClick={onSignOut}
      >
        Sign out
      </button>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function LoginScreen({ onSuccess }) {
  const [tab, setTab]           = useState("signin");
  const [magicEmail, setMagicEmail] = useState("");
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  async function handleMagicLink() {
    if (!magicEmail.includes("@")) return;
    setMagicLoading(true);
    // TODO: await supabase.auth.signInWithOtp({ email: magicEmail });
    await new Promise(r => setTimeout(r, 1200));
    setMagicLoading(false);
    setMagicSent(true);
  }

  if (loggedIn) {
    return (
      <div style={s.app}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; }`}</style>
        <div style={s.hero}>
          <div style={s.logoWrap}>🏢</div>
          <div style={s.appName}>Polaris Tenant</div>
          <div style={s.appTagline}>Your property portal</div>
        </div>
        <div style={s.card}>
          <LoggedIn email={userEmail} onSignOut={() => { setLoggedIn(false); setUserEmail(""); }} onPortal={onSuccess} />
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; } body { margin: 0; background: #0C447C; }`}</style>
      <div style={s.app}>

        {/* Hero */}
        <div style={s.hero}>
          <div style={s.logoWrap}>🏢</div>
          <div style={s.appName}>Polaris Tenant</div>
          <div style={s.appTagline}>Pay rent, submit requests,<br />and message your property manager</div>
        </div>

        {/* Card */}
        <div style={s.card}>

          {magicSent ? (
            <MagicLinkSent email={magicEmail} onBack={() => { setMagicSent(false); setMagicEmail(""); }} />
          ) : (
            <>
              {/* Tabs */}
              <div style={s.tabs}>
                <button style={tab === "signin" ? s.tabActive : s.tabInactive} onClick={() => setTab("signin")}>Sign in</button>
                <button style={tab === "signup" ? s.tabActive : s.tabInactive} onClick={() => setTab("signup")}>Create account</button>
              </div>

              {tab === "signin" ? (
                <SignInForm onSuccess={email => { setUserEmail(email); setLoggedIn(true); }} />
              ) : (
                <SignUpForm onSuccess={email => { setUserEmail(email); setLoggedIn(true); }} />
              )}

              {/* Magic link option */}
              <div style={s.divider}>
                <div style={s.dividerLine} />
                <span style={s.dividerText}>or sign in with a link</span>
                <div style={s.dividerLine} />
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <FocusInput
                  type="email"
                  value={magicEmail}
                  onChange={e => setMagicEmail(e.target.value)}
                  placeholder="Enter your email"
                  style={{ ...s.input, flex: 1 }}
                />
                <button
                  onClick={handleMagicLink}
                  disabled={magicLoading || !magicEmail.includes("@")}
                  style={{
                    padding: "11px 14px", border: "none", borderRadius: 8,
                    background: magicEmail.includes("@") ? "#0C447C" : "#d1d5db",
                    color: "#fff", fontSize: 13, fontWeight: 600,
                    cursor: magicEmail.includes("@") ? "pointer" : "not-allowed",
                    whiteSpace: "nowrap", fontFamily: "'Inter', 'Segoe UI', sans-serif",
                    display: "flex", alignItems: "center", gap: 6,
                    transition: "background 0.15s",
                  }}
                >
                  {magicLoading ? <Spinner /> : "Send link ✉️"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
