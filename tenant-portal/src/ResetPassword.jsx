import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

const s = {
  app: { width: "100%", fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: 14, color: "#1a1a1a", background: "#0C1F3F", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { background: "#fff", borderRadius: 16, padding: "36px 32px", width: "100%", maxWidth: 400, boxSizing: "border-box", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" },
  logoWrap: { width: 52, height: 52, borderRadius: 14, background: "#E6F1FB", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24 },
  title: { fontSize: 22, fontWeight: 800, color: "#0C447C", textAlign: "center", marginBottom: 4 },
  sub: { fontSize: 13, color: "#888", textAlign: "center", marginBottom: 28 },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: 600, color: "#555", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 5 },
  input: { width: "100%", padding: "11px 14px", fontSize: 14, border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#1a1a1a", outline: "none", boxSizing: "border-box", fontFamily: "'Inter',sans-serif" },
  passwordWrap: { position: "relative" },
  eyeBtn: { position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#888", padding: 0 },
  submitBtn: (loading) => ({ width: "100%", padding: 13, border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, background: loading ? "#378ADD" : "#0C447C", color: "#fff", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Inter',sans-serif", marginTop: 8 }),
  errorBanner: { background: "#FDECEA", border: "1px solid #f5c6c6", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#A32D2D" },
  successBanner: { background: "#EAF3DE", border: "1px solid #c3e6cb", borderRadius: 8, padding: "16px 14px", marginBottom: 16, fontSize: 13, color: "#3B6D11", textAlign: "center", lineHeight: 1.6 },
  strengthBar: (strength) => ({ height: 4, borderRadius: 2, marginTop: 6, background: strength === 0 ? "#f0f0f0" : strength === 1 ? "#E24B4A" : strength === 2 ? "#854F0B" : "#3B6D11", width: strength === 0 ? "0%" : strength === 1 ? "33%" : strength === 2 ? "66%" : "100%", transition: "all 0.3s" }),
  strengthLabel: (strength) => ({ fontSize: 11, color: strength === 1 ? "#E24B4A" : strength === 2 ? "#854F0B" : "#3B6D11", marginTop: 3 }),
};

function Spinner() {
  return <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />;
}

function getStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  return score;
}

export default function ResetPassword() {
  const navigate    = useNavigate();
  const [password, setPassword]     = useState("");
  const [confirm, setConfirm]       = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [done, setDone]             = useState(false);
  const [validSession, setValidSession] = useState(false);
  const [checking, setChecking]     = useState(true);

  useEffect(() => {
    // Supabase puts the access token in the URL hash when redirecting from email
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setValidSession(true);
        setChecking(false);
      }
    });

    // Also check if we already have a session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setValidSession(true);
      }
      setChecking(false);
    });
  }, []);

  async function handleReset() {
    if (!password) { setError("Please enter a new password."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }

    setLoading(true);
    setError("");

    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) { setError(error.message); return; }
    setDone(true);

    // Redirect after 2 seconds
    setTimeout(() => navigate("/login"), 2500);
  }

  const strength = getStrength(password);
  const strengthLabels = ["", "Weak", "Fair", "Strong"];

  if (checking) {
    return (
      <div style={s.app}>
        <style>{`* { box-sizing: border-box; } body { margin: 0; background: #0C1F3F; }`}</style>
        <div style={{ color: "#fff", fontSize: 14 }}>Verifying reset link…</div>
      </div>
    );
  }

  return (
    <div style={s.app}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; } body { margin: 0; background: #0C1F3F; }`}</style>
      <div style={s.card}>
        <div style={s.logoWrap}>🔒</div>
        <div style={s.title}>Set new password</div>
        <div style={s.sub}>Choose a strong password for your account.</div>

        {error && <div style={s.errorBanner}>⚠️ {error}</div>}

        {done ? (
          <div style={s.successBanner}>
            ✅ Password updated successfully!<br />
            Redirecting you to login…
          </div>
        ) : (
          <>
            <div style={s.fieldWrap}>
              <label style={s.fieldLabel}>New password</label>
              <div style={s.passwordWrap}>
                <input
                  style={{ ...s.input, paddingRight: 40 }}
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(""); }}
                  placeholder="Min. 8 characters"
                />
                <button style={s.eyeBtn} onClick={() => setShowPw(v => !v)}>
                  {showPw ? "🙈" : "👁️"}
                </button>
              </div>
              {password && (
                <>
                  <div style={s.strengthBar(strength)} />
                  <div style={s.strengthLabel(strength)}>{strengthLabels[strength]}</div>
                </>
              )}
            </div>

            <div style={s.fieldWrap}>
              <label style={s.fieldLabel}>Confirm password</label>
              <input
                style={{ ...s.input, borderColor: confirm && confirm !== password ? "#E24B4A" : "#d1d5db" }}
                type={showPw ? "text" : "password"}
                value={confirm}
                onChange={e => { setConfirm(e.target.value); setError(""); }}
                placeholder="Repeat your new password"
                onKeyDown={e => e.key === "Enter" && handleReset()}
              />
              {confirm && confirm !== password && (
                <div style={{ fontSize: 11, color: "#E24B4A", marginTop: 4 }}>Passwords don't match</div>
              )}
            </div>

            <button style={s.submitBtn(loading)} onClick={handleReset} disabled={loading}>
              {loading ? <><Spinner /> Saving…</> : "Save new password →"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}