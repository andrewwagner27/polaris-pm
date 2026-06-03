import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

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
  blue:     "#4A9AE8",
  red:      "#E05555",
};

function ModusMark({ size = 32 }) {
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

function FieldLabel({ children }) {
  return <label style={{ fontSize: 11, fontWeight: 600, color: C.textSub, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{children}</label>;
}

function ErrorBanner({ message }) {
  if (!message) return null;
  return <div style={{ background: "rgba(224,85,85,0.1)", border: `1px solid rgba(224,85,85,0.2)`, borderRadius: 8, padding: "10px 14px", marginBottom: 18, fontSize: 13, color: C.red }}>{message}</div>;
}

function SubmitBtn({ loading, children, onClick }) {
  return (
    <button onClick={onClick} disabled={loading} style={{
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
      {loading ? <><Spinner /> {children}</> : children}
    </button>
  );
}

// ─── Sign In ───────────────────────────────────────────────────────────────
function SignInForm({ onSuccess }) {
  const navigate = useNavigate();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit() {
    if (!email || !password) { setError("Please enter your email and password."); return; }
    setLoading(true); setError("");
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) { setError(authError.message); return; }
    onSuccess(data.user);
  }

  return (
    <div>
      <ErrorBanner message={error} />
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Email</FieldLabel>
        <Input value={email} onChange={e => { setEmail(e.target.value); setError(""); }} placeholder="you@email.com" type="email" onKeyDown={e => e.key === "Enter" && handleSubmit()} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <FieldLabel>Password</FieldLabel>
        <div style={{ position: "relative" }}>
          <Input value={password} onChange={e => { setPassword(e.target.value); setError(""); }} placeholder="••••••••" type={showPw ? "text" : "password"} onKeyDown={e => e.key === "Enter" && handleSubmit()} />
          <button onClick={() => setShowPw(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.textMuted, padding: 0 }}>
            {showPw ? "○" : "●"}
          </button>
        </div>
      </div>
      <div style={{ textAlign: "right", marginBottom: 22 }}>
        <button onClick={() => navigate("/forgot-password")} style={{ fontSize: 12, color: C.goldDim, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", padding: 0, transition: "color 0.15s" }}
          onMouseOver={e => e.currentTarget.style.color = C.gold}
          onMouseOut={e => e.currentTarget.style.color = C.goldDim}
        >Forgot password?</button>
      </div>
      <SubmitBtn loading={loading} onClick={handleSubmit}>{loading ? "Signing in…" : "Sign in →"}</SubmitBtn>
    </div>
  );
}

// ─── Sign Up ───────────────────────────────────────────────────────────────
function SignUpForm({ onSuccess }) {
  const [name, setName]           = useState("");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [unit, setUnit]           = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [emailSent, setEmailSent] = useState(false);

  async function handleSubmit() {
    if (!name || !email || !password || !unit) { setError("Please fill in all fields."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true); setError("");
    const { error: authError } = await supabase.auth.signUp({
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
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${C.gold}18`, border: `1px solid ${C.goldDim}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 22, color: C.gold }}>✉</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 10 }}>Check your email</div>
        <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, marginBottom: 6 }}>
          We sent a confirmation link to <span style={{ color: C.text, fontWeight: 500 }}>{email}</span>.
        </div>
        <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.7 }}>
          Click the link to verify your address and access your portal. Check spam if you don't see it.
        </div>
      </div>
    );
  }

  return (
    <div>
      <ErrorBanner message={error} />
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Full name</FieldLabel>
        <Input value={name} onChange={e => { setName(e.target.value); setError(""); }} placeholder="Maria Rodriguez" />
      </div>
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Email</FieldLabel>
        <Input value={email} onChange={e => { setEmail(e.target.value); setError(""); }} placeholder="you@email.com" type="email" />
      </div>
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Unit number</FieldLabel>
        <Input value={unit} onChange={e => { setUnit(e.target.value); setError(""); }} placeholder="4B" />
      </div>
      <div style={{ marginBottom: 22 }}>
        <FieldLabel>Password</FieldLabel>
        <div style={{ position: "relative" }}>
          <Input value={password} onChange={e => { setPassword(e.target.value); setError(""); }} placeholder="Min. 8 characters" type={showPw ? "text" : "password"} />
          <button onClick={() => setShowPw(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.textMuted, padding: 0 }}>
            {showPw ? "○" : "●"}
          </button>
        </div>
      </div>
      <SubmitBtn loading={loading} onClick={handleSubmit}>{loading ? "Creating account…" : "Create account →"}</SubmitBtn>
      <div style={{ fontSize: 11, color: C.textMuted, textAlign: "center", marginTop: 16, lineHeight: 1.6 }}>
        By signing up you agree to our Terms and Privacy Policy
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function LoginScreen({ onSuccess }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("signin");

  function handleSuccess(user) {
    if (onSuccess) onSuccess(user);
    else navigate("/home");
  }

  return (
    <div style={{ width: "100%", fontFamily: "'DM Sans', sans-serif", background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0A0B0D; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "48px 24px 40px", textAlign: "center", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <ModusMark size={36} />
        </div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: C.text, letterSpacing: "0.1em" }}>MODUS</div>
        <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.18em", marginTop: 2, marginBottom: 14 }}>PROPERTY MANAGEMENT</div>
        <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6 }}>
          Pay rent, submit requests,<br />and message your property manager
        </div>
      </div>

      {/* Card */}
      <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "0 24px 40px" }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "0 0 14px 14px", width: "100%", maxWidth: 420, padding: "28px 28px 32px", borderTop: "none" }}>

          {/* Tabs */}
          <div style={{ display: "flex", background: C.raised, borderRadius: 8, padding: 4, marginBottom: 24, gap: 4, border: `1px solid ${C.border}` }}>
            {["signin", "signup"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: "9px 0",
                background: tab === t ? C.surface : "transparent",
                border: tab === t ? `1px solid ${C.border}` : "none",
                borderRadius: 6, fontSize: 13,
                fontWeight: tab === t ? 600 : 400,
                color: tab === t ? C.text : C.textSub,
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                transition: "all 0.15s",
              }}>
                {t === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {tab === "signin"
            ? <SignInForm onSuccess={handleSuccess} />
            : <SignUpForm onSuccess={handleSuccess} />
          }

          <div style={{ textAlign: "center", marginTop: 20, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
            <button onClick={() => navigate("/landlord/login")} style={{ fontSize: 12, color: C.textMuted, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "color 0.15s" }}
              onMouseOver={e => e.currentTarget.style.color = C.gold}
              onMouseOut={e => e.currentTarget.style.color = C.textMuted}
            >Landlord? Sign in here →</button>
          </div>
        </div>
      </div>
    </div>
  );
}