import { useState, useEffect } from "react";
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
  amber:    "#F0A430",
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

function getStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  return score;
}

const STRENGTH_COLORS = ["", C.red, C.amber, C.green];
const STRENGTH_LABELS = ["", "Weak", "Fair", "Strong"];

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [done, setDone]           = useState(false);
  const [checking, setChecking]   = useState(true);

  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setChecking(false);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setChecking(false);
      else setChecking(false);
    });
  }, []);

  async function handleReset() {
    if (!password) { setError("Please enter a new password."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true); setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setTimeout(() => navigate("/login"), 2500);
  }

  const strength = getStrength(password);

  function InputField({ value, onChange, placeholder, hasError }) {
    const [focused, setFocused] = useState(false);
    const borderColor = hasError ? C.red : focused ? C.gold : C.border;
    return (
      <div style={{ position: "relative" }}>
        <input type={showPw ? "text" : "password"} value={value} onChange={onChange} placeholder={placeholder}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onKeyDown={e => e.key === "Enter" && handleReset()}
          style={{ width: "100%", padding: "11px 44px 11px 14px", fontSize: 14, border: `1px solid ${borderColor}`, borderRadius: 8, background: C.raised, color: C.text, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", boxShadow: focused ? "0 0 0 3px rgba(201,169,110,0.08)" : "none", transition: "border-color 0.15s" }}
        />
        <button onClick={() => setShowPw(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: C.textMuted, padding: 0 }}>
          {showPw ? "○" : "●"}
        </button>
      </div>
    );
  }

  if (checking) {
    return (
      <div style={{ width: "100%", background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{`*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } body { background: #0A0B0D; }`}</style>
        <div style={{ color: C.textSub, fontSize: 14 }}>Verifying reset link…</div>
      </div>
    );
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
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: C.text, letterSpacing: "0.08em", marginTop: 12 }}>Set new password</div>
          <div style={{ fontSize: 13, color: C.textSub, marginTop: 6 }}>Choose a strong password for your account.</div>
        </div>

        {error && (
          <div style={{ background: "rgba(224,85,85,0.1)", border: `1px solid rgba(224,85,85,0.2)`, borderRadius: 8, padding: "10px 14px", marginBottom: 18, fontSize: 13, color: C.red }}>{error}</div>
        )}

        {done ? (
          <div style={{ background: "rgba(114,176,42,0.1)", border: `1px solid rgba(114,176,42,0.2)`, borderRadius: 8, padding: "16px 14px", fontSize: 13, color: C.green, textAlign: "center", lineHeight: 1.7 }}>
            ✓ Password updated successfully!<br />
            <span style={{ color: C.textSub }}>Redirecting you to login…</span>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.textSub, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>New password</label>
              <InputField value={password} onChange={e => { setPassword(e.target.value); setError(""); }} placeholder="Min. 8 characters" />
              {password && (
                <>
                  <div style={{ height: 3, borderRadius: 2, marginTop: 8, background: STRENGTH_COLORS[strength] || C.border, width: strength === 0 ? "0%" : strength === 1 ? "33%" : strength === 2 ? "66%" : "100%", transition: "all 0.3s" }} />
                  <div style={{ fontSize: 11, color: STRENGTH_COLORS[strength], marginTop: 3 }}>{STRENGTH_LABELS[strength]}</div>
                </>
              )}
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.textSub, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Confirm password</label>
              <InputField value={confirm} onChange={e => { setConfirm(e.target.value); setError(""); }} placeholder="Repeat your new password" hasError={confirm && confirm !== password} />
              {confirm && confirm !== password && (
                <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>Passwords don't match</div>
              )}
            </div>

            <button onClick={handleReset} disabled={loading} style={{
              width: "100%", padding: "12px", border: `1px solid ${C.goldDim}`, borderRadius: 8,
              fontSize: 14, fontWeight: 500, background: loading ? "rgba(201,169,110,0.07)" : "transparent",
              color: C.gold, cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              fontFamily: "'DM Sans', sans-serif", opacity: loading ? 0.7 : 1,
            }}
              onMouseOver={e => !loading && (e.currentTarget.style.background = "rgba(201,169,110,0.07)")}
              onMouseOut={e => !loading && (e.currentTarget.style.background = "transparent")}
            >
              {loading ? <><Spinner /> Saving…</> : "Save new password →"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}