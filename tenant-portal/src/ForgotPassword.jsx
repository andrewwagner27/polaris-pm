import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

const s = {
  app: { width: "100%", fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: 14, color: "#1a1a1a", background: "#0C1F3F", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { background: "#fff", borderRadius: 16, padding: "36px 32px", width: "100%", maxWidth: 400, boxSizing: "border-box", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" },
  logoWrap: { width: 52, height: 52, borderRadius: 14, background: "#E6F1FB", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24 },
  title: { fontSize: 22, fontWeight: 800, color: "#0C447C", textAlign: "center", marginBottom: 4 },
  sub: { fontSize: 13, color: "#888", textAlign: "center", marginBottom: 28, lineHeight: 1.5 },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: 600, color: "#555", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 5 },
  input: { width: "100%", padding: "11px 14px", fontSize: 14, border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#1a1a1a", outline: "none", boxSizing: "border-box", fontFamily: "'Inter',sans-serif" },
  submitBtn: (loading) => ({ width: "100%", padding: 13, border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, background: loading ? "#378ADD" : "#0C447C", color: "#fff", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Inter',sans-serif", marginTop: 8 }),
  errorBanner: { background: "#FDECEA", border: "1px solid #f5c6c6", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#A32D2D" },
  successBanner: { background: "#EAF3DE", border: "1px solid #c3e6cb", borderRadius: 8, padding: "16px 14px", marginBottom: 16, fontSize: 13, color: "#3B6D11", textAlign: "center", lineHeight: 1.6 },
  backLink: { textAlign: "center", marginTop: 16, fontSize: 13, color: "#888" },
  backBtn: { color: "#185FA5", cursor: "pointer", background: "none", border: "none", fontFamily: "'Inter',sans-serif", fontSize: 13 },
};

function Spinner() {
  return <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />;
}

export default function ForgotPassword() {
  const navigate  = useNavigate();
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [sent, setSent]       = useState(false);

  async function handleSubmit() {
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    if (error) { setError(error.message); return; }
    setSent(true);
  }

  return (
    <div style={s.app}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; } body { margin: 0; background: #0C1F3F; }`}</style>
      <div style={s.card}>
        <div style={s.logoWrap}>🔑</div>
        <div style={s.title}>Reset password</div>
        <div style={s.sub}>
          {sent ? "Check your email for a reset link." : "Enter your email and we'll send you a link to reset your password."}
        </div>

        {error && <div style={s.errorBanner}>⚠️ {error}</div>}

        {sent ? (
          <>
            <div style={s.successBanner}>
              ✅ Reset link sent to <strong>{email}</strong>.<br />
              Check your inbox and click the link to set a new password.
            </div>
            <button style={s.submitBtn(false)} onClick={() => setSent(false)}>
              Resend email
            </button>
          </>
        ) : (
          <>
            <div style={s.fieldWrap}>
              <label style={s.fieldLabel}>Email address</label>
              <input
                style={s.input}
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(""); }}
                placeholder="you@email.com"
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
              />
            </div>
            <button style={s.submitBtn(loading)} onClick={handleSubmit} disabled={loading}>
              {loading ? <><Spinner /> Sending…</> : "Send reset link →"}
            </button>
          </>
        )}

        <div style={s.backLink}>
          <button style={s.backBtn} onClick={() => navigate(-1)}>← Back to login</button>
        </div>
      </div>
    </div>
  );
}