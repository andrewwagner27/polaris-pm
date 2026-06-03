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
  green:    "#72B02A",
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

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [sent, setSent]       = useState(false);

  async function handleSubmit() {
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setLoading(true); setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSent(true);
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

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
          <ModusMark size={36} />
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: C.text, letterSpacing: "0.08em", marginTop: 12 }}>Reset password</div>
          <div style={{ fontSize: 13, color: C.textSub, marginTop: 6, textAlign: "center", lineHeight: 1.6 }}>
            {sent ? "Check your email for a reset link." : "Enter your email and we'll send you a link to reset your password."}
          </div>
        </div>

        {error && (
          <div style={{ background: "rgba(224,85,85,0.1)", border: `1px solid rgba(224,85,85,0.2)`, borderRadius: 8, padding: "10px 14px", marginBottom: 18, fontSize: 13, color: C.red }}>{error}</div>
        )}

        {sent ? (
          <>
            <div style={{ background: "rgba(114,176,42,0.1)", border: `1px solid rgba(114,176,42,0.2)`, borderRadius: 8, padding: "16px 14px", marginBottom: 20, fontSize: 13, color: C.green, textAlign: "center", lineHeight: 1.7 }}>
              Reset link sent to <span style={{ fontWeight: 600, color: C.text }}>{email}</span>.<br />
              Check your inbox and click the link to set a new password.
            </div>
            <button onClick={() => setSent(false)} style={{ width: "100%", padding: "12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontWeight: 500, background: "transparent", color: C.textSub, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              Resend email
            </button>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.textSub, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Email address</label>
              <Input value={email} onChange={e => { setEmail(e.target.value); setError(""); }} placeholder="you@email.com" type="email" onKeyDown={e => e.key === "Enter" && handleSubmit()} />
            </div>
            <button onClick={handleSubmit} disabled={loading} style={{
              width: "100%", padding: "12px", border: `1px solid ${C.goldDim}`, borderRadius: 8,
              fontSize: 14, fontWeight: 500, background: loading ? "rgba(201,169,110,0.07)" : "transparent",
              color: C.gold, cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              fontFamily: "'DM Sans', sans-serif", opacity: loading ? 0.7 : 1,
            }}
              onMouseOver={e => !loading && (e.currentTarget.style.background = "rgba(201,169,110,0.07)")}
              onMouseOut={e => !loading && (e.currentTarget.style.background = "transparent")}
            >
              {loading ? <><Spinner /> Sending…</> : "Send reset link →"}
            </button>
          </>
        )}

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button onClick={() => navigate(-1)} style={{ fontSize: 12, color: C.textMuted, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "color 0.15s" }}
            onMouseOver={e => e.currentTarget.style.color = C.textSub}
            onMouseOut={e => e.currentTarget.style.color = C.textMuted}
          >← Back to login</button>
        </div>
      </div>
    </div>
  );
}