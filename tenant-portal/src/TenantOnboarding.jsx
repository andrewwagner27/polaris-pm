import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

const STEPS = ["Welcome", "Your info", "Find your unit", "All set"];

const s = {
  app: {
    width: "100%", fontFamily: "'Inter','Segoe UI',sans-serif",
    fontSize: 14, color: "#1a1a1a", background: "#f4f5f7",
    minHeight: "100vh", display: "flex", flexDirection: "column",
  },
  header: {
    background: "linear-gradient(160deg, #0C447C 0%, #185FA5 100%)",
    padding: "28px 24px 36px", textAlign: "center",
  },
  logoWrap: {
    width: 52, height: 52, borderRadius: 14,
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.25)",
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 12px", fontSize: 24,
  },
  headerTitle: { fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 4 },
  headerSub: { fontSize: 13, color: "#85B7EB" },
  // Progress bar
  progressWrap: { padding: "0 24px", marginTop: -8 },
  progressBar: { height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden" },
  progressFill: (pct) => ({ height: "100%", width: `${pct}%`, background: "#fff", borderRadius: 2, transition: "width 0.4s ease" }),
  progressSteps: { display: "flex", justifyContent: "space-between", marginTop: 6 },
  progressStep: (active, done) => ({ fontSize: 10, fontWeight: done || active ? 600 : 400, color: done || active ? "#fff" : "rgba(255,255,255,0.4)" }),
  // Card
  card: {
    background: "#fff", borderRadius: "20px 20px 0 0",
    flex: 1, padding: "28px 24px 40px",
    marginTop: -12, width: "100%",
    maxWidth: 520, margin: "-12px auto 0",
    boxSizing: "border-box",
  },
  stepTitle: { fontSize: 20, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 },
  stepSub: { fontSize: 14, color: "#888", lineHeight: 1.6, marginBottom: 24 },
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
  errorBanner: {
    background: "#FDECEA", border: "1px solid #f5c6c6",
    borderRadius: 8, padding: "10px 14px", marginBottom: 16,
    fontSize: 13, color: "#A32D2D",
  },
  successBanner: {
    background: "#EAF3DE", border: "1px solid #c3e6a0",
    borderRadius: 8, padding: "10px 14px", marginBottom: 16,
    fontSize: 13, color: "#3B6D11",
  },
  nextBtn: (loading) => ({
    width: "100%", padding: 13, border: "none", borderRadius: 8,
    fontSize: 15, fontWeight: 600,
    background: loading ? "#378ADD" : "#0C447C",
    color: "#fff", cursor: loading ? "not-allowed" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: 8, transition: "background 0.15s",
    fontFamily: "'Inter',sans-serif", marginTop: 8,
    opacity: loading ? 0.85 : 1,
  }),
  skipBtn: {
    width: "100%", padding: "10px", border: "1px solid #e8eaed",
    borderRadius: 8, fontSize: 13, fontWeight: 500,
    background: "transparent", color: "#888", cursor: "pointer",
    fontFamily: "'Inter',sans-serif", marginTop: 10,
  },
  // Welcome step
  welcomeIcon: { fontSize: 52, textAlign: "center", marginBottom: 16 },
  featureList: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 },
  featureItem: { display: "flex", alignItems: "center", gap: 12 },
  featureIconWrap: {
    width: 36, height: 36, borderRadius: 8, background: "#E6F1FB",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 18, flexShrink: 0,
  },
  featureText: { fontSize: 13, fontWeight: 600, color: "#1a1a1a" },
  featureSub: { fontSize: 11, color: "#888" },
  // Property code
  codeInput: {
    width: "100%", padding: "16px", fontSize: 22, fontWeight: 700,
    border: "2px solid #d1d5db", borderRadius: 10, textAlign: "center",
    letterSpacing: "0.15em", outline: "none", boxSizing: "border-box",
    fontFamily: "'Inter',sans-serif", textTransform: "uppercase",
    color: "#0C447C",
  },
  codeHint: { fontSize: 12, color: "#888", textAlign: "center", marginTop: 8, lineHeight: 1.5 },
  // Unit found card
  unitCard: {
    background: "#E6F1FB", border: "1px solid #B5D4F4",
    borderRadius: 12, padding: "16px", marginBottom: 16,
    display: "flex", alignItems: "center", gap: 14,
  },
  unitCardIcon: {
    width: 44, height: 44, borderRadius: 10, background: "#0C447C",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 22, flexShrink: 0,
  },
  unitCardName: { fontSize: 15, fontWeight: 700, color: "#0C447C" },
  unitCardAddr: { fontSize: 12, color: "#185FA5", marginTop: 2 },
  // Success step
  successCircle: {
    width: 80, height: 80, borderRadius: "50%", background: "#EAF3DE",
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 20px", fontSize: 36,
    animation: "popIn 0.4s cubic-bezier(0.34,1.56,0.64,1)",
  },
  summaryBox: {
    background: "#f8f9fa", border: "1px solid #e8eaed",
    borderRadius: 10, padding: "14px 16px", marginBottom: 20,
  },
  summaryRow: {
    display: "flex", justifyContent: "space-between",
    padding: "6px 0", borderBottom: "1px solid #f0f0f0",
  },
  summaryRowLast: { display: "flex", justifyContent: "space-between", padding: "6px 0" },
  summaryKey: { fontSize: 13, color: "#888" },
  summaryVal: { fontSize: 13, fontWeight: 600, color: "#1a1a1a" },
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

// Simulated property lookup — replace with real Supabase query later
const PROPERTY_CODES = {
  "CLIFTON": { property: "Clifton Manor", address: "12009 Clifton Blvd, Lakewood OH", unit: null, requiresUnit: true },
  "STPETE":  { property: "944 18th Ave S", address: "St. Petersburg, FL 33705", unit: null, requiresUnit: true },
};

export default function TenantOnboarding({ user }) {
  const navigate = useNavigate();
  const [step, setStep]         = useState(0);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  // Step 1 — personal info
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || "");
  const [phone, setPhone]       = useState("");

  // Step 2 — property code
  const [code, setCode]         = useState("");
  const [unitNum, setUnitNum]   = useState(user?.user_metadata?.unit_number || "");
  const [foundProperty, setFoundProperty] = useState(null);

  const progress = ((step) / (STEPS.length - 1)) * 100;

  async function handlePersonalInfo() {
    if (!fullName.trim() || !phone.trim()) { setError("Please fill in both fields."); return; }
    setLoading(true);
    setError("");
    // Update Supabase auth metadata
    await supabase.auth.updateUser({ data: { full_name: fullName, phone } });
    setLoading(false);
    setStep(2);
  }

  async function handlePropertyCode() {
    if (!code.trim()) { setError("Please enter your property code."); return; }
    setError("");
    const upperCode = code.toUpperCase().trim();
    const property = PROPERTY_CODES[upperCode];
    if (!property) { setError("Property code not found. Check with your landlord and try again."); return; }
    if (!unitNum.trim()) { setError("Please enter your unit number."); return; }
    setFoundProperty({ ...property, unit: unitNum });
    setLoading(true);

    // Save tenant profile to Supabase
    const { error: dbError } = await supabase.from("tenants").upsert({
      id: user.id,
      name: fullName,
      email: user.email,
      phone,
      status: "active",
    });

    setLoading(false);
    if (dbError) { setError("Could not save your profile. Please try again."); return; }
    setStep(3);
  }

  async function handleFinish() {
  setLoading(true);
  await supabase.auth.updateUser({ data: { onboarding_complete: true } });
  navigate("/home");
}

  return (
    <div style={s.app}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        * { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; }
      `}</style>

      {/* Header */}
      <div style={s.header}>
        <div style={s.logoWrap}>🏢</div>
        <div style={s.headerTitle}>Welcome to Polaris Tenant</div>
        <div style={s.headerSub}>Let's get your account set up — takes about 2 minutes</div>
      </div>

      {/* Progress */}
      {step > 0 && step < 3 && (
        <div style={{ background: "#185FA5", padding: "12px 24px 16px" }}>
          <div style={s.progressBar}>
            <div style={s.progressFill(progress)} />
          </div>
          <div style={s.progressSteps}>
            {STEPS.map((s2, i) => (
              <span key={i} style={s.progressStep(i === step, i < step)}>{s2}</span>
            ))}
          </div>
        </div>
      )}

      {/* Card */}
      <div style={s.card}>

        {/* ── Step 0: Welcome ── */}
        {step === 0 && (
          <>
            <div style={s.welcomeIcon}>👋</div>
            <div style={{ ...s.stepTitle, textAlign: "center" }}>Hi{fullName ? `, ${fullName.split(" ")[0]}` : ""}!</div>
            <div style={{ ...s.stepSub, textAlign: "center" }}>Here's what you can do with your tenant portal:</div>
            <div style={s.featureList}>
              {[
                { icon: "💳", title: "Pay rent online",      sub: "Card or bank transfer, autopay available" },
                { icon: "🔧", title: "Submit requests",      sub: "Photo uploads, real-time status tracking" },
                { icon: "💬", title: "Message your landlord", sub: "Secure, private messaging" },
                { icon: "📄", title: "Download your ledger", sub: "Official payment history PDF" },
              ].map((f, i) => (
                <div key={i} style={s.featureItem}>
                  <div style={s.featureIconWrap}>{f.icon}</div>
                  <div>
                    <div style={s.featureText}>{f.title}</div>
                    <div style={s.featureSub}>{f.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <button style={s.nextBtn(false)} onClick={() => setStep(1)}>
              Get started →
            </button>
          </>
        )}

        {/* ── Step 1: Personal info ── */}
        {step === 1 && (
          <>
            <div style={s.stepTitle}>Your information</div>
            <div style={s.stepSub}>This is how your landlord will identify you and how we'll address your receipts and documents.</div>
            {error && <div style={s.errorBanner}>⚠️ {error}</div>}
            <div style={s.fieldWrap}>
              <label style={s.fieldLabel}>Full name</label>
              <input style={s.input} value={fullName}
                onChange={e => { setFullName(e.target.value); setError(""); }}
                placeholder="Maria Rodriguez" />
            </div>
            <div style={s.fieldWrap}>
              <label style={s.fieldLabel}>Phone number</label>
              <input style={s.input} value={phone} type="tel"
                onChange={e => { setPhone(e.target.value); setError(""); }}
                placeholder="(614) 555-0192" />
            </div>
            <button style={s.nextBtn(loading)} onClick={handlePersonalInfo} disabled={loading}>
              {loading ? <><Spinner /> Saving…</> : "Continue →"}
            </button>
          </>
        )}

        {/* ── Step 2: Property code ── */}
        {step === 2 && (
          <>
            <div style={s.stepTitle}>Find your unit</div>
            <div style={s.stepSub}>Enter the property code your landlord gave you, then your unit number. Don't have a code? Contact your property manager.</div>
            {error && <div style={s.errorBanner}>⚠️ {error}</div>}

            {foundProperty && (
              <div style={s.unitCard}>
                <div style={s.unitCardIcon}>🏢</div>
                <div>
                  <div style={s.unitCardName}>✓ {foundProperty.property} — Unit {foundProperty.unit}</div>
                  <div style={s.unitCardAddr}>{foundProperty.address}</div>
                </div>
              </div>
            )}

            <div style={s.fieldWrap}>
              <label style={s.fieldLabel}>Property code</label>
              <input
                style={s.codeInput}
                value={code}
                onChange={e => { setCode(e.target.value.toUpperCase()); setError(""); setFoundProperty(null); }}
                placeholder="e.g. CLIFTON"
                maxLength={10}
              />
              <div style={s.codeHint}>Your landlord provided this code when you were added as a tenant.<br />Try: CLIFTON or STPETE for demo</div>
            </div>

            <div style={s.fieldWrap}>
              <label style={s.fieldLabel}>Unit number</label>
              <input style={s.input} value={unitNum}
                onChange={e => { setUnitNum(e.target.value); setError(""); }}
                placeholder="e.g. 4B" />
            </div>

            <button style={s.nextBtn(loading)} onClick={handlePropertyCode} disabled={loading}>
              {loading ? <><Spinner /> Verifying…</> : "Verify & continue →"}
            </button>
            <button style={s.skipBtn} onClick={() => setStep(3)}>Skip for now</button>
          </>
        )}

        {/* ── Step 3: All set ── */}
        {step === 3 && (
          <>
            <div style={s.successCircle}>✅</div>
            <div style={{ ...s.stepTitle, textAlign: "center" }}>You're all set!</div>
            <div style={{ ...s.stepSub, textAlign: "center" }}>Your account is ready. Here's a summary of what we set up:</div>
            <div style={s.summaryBox}>
              {[
                ["Name",     fullName || "—"],
                ["Email",    user?.email || "—"],
                ["Phone",    phone || "—"],
                ["Property", foundProperty?.property || "Not linked yet"],
                ["Unit",     foundProperty?.unit || "—"],
              ].map(([k, v], i, arr) => (
                <div key={k} style={i === arr.length - 1 ? s.summaryRowLast : s.summaryRow}>
                  <span style={s.summaryKey}>{k}</span>
                  <span style={s.summaryVal}>{v}</span>
                </div>
              ))}
            </div>
            <button style={s.nextBtn(loading)} onClick={handleFinish} disabled={loading}>
              {loading ? <><Spinner /> Loading…</> : "Go to my portal →"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
