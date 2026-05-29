import { useState } from "react";
import { useNavigate } from "react-router-dom";

const CARRIERS = [
  "State Farm", "Lemonade", "GEICO", "Progressive", "Allstate",
  "Nationwide", "Liberty Mutual", "Farmers", "USAA", "Travelers",
  "American Family", "Other",
];

// ── Status logic ──────────────────────────────────────────────────────────────
function getStatus(expiryDate) {
  if (!expiryDate) return null;
  const today = new Date();
  const expiry = new Date(expiryDate);
  const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0)  return { id: "lapsed",   label: "Lapsed",         color: "#A32D2D", bg: "#FDECEA", dot: "#E24B4A" };
  if (daysLeft <= 30) return { id: "expiring", label: "Expiring Soon",  color: "#854F0B", bg: "#FAEEDA", dot: "#F5A623", days: daysLeft };
  return              { id: "verified",  label: "Verified",        color: "#3B6D11", bg: "#EAF3DE", dot: "#639922" };
}

const DAILY_PENALTY = 4.99;

const s = {
  app: {
    width: "100%",
    maxWidth: "100%",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontSize: 14,
    color: "#1a1a1a",
    background: "#f4f5f7",
    minHeight: "100vh",
    paddingBottom: 80,
  },
  header: {
    background: "#0C447C",
    padding: "18px 20px 22px",
  },
  headerTop: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  backBtn: {
    background: "rgba(255,255,255,0.15)",
    border: "none",
    borderRadius: 8,
    width: 32, height: 32,
    cursor: "pointer",
    color: "#E6F1FB",
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerTitle: { fontSize: 15, fontWeight: 600, color: "#E6F1FB" },
  headerSub: { fontSize: 12, color: "#85B7EB", marginTop: 2, paddingLeft: 42 },
  body: { padding: "20px 20px 0" },
  // ── Status card ──
  statusCard: (bg) => ({
    background: bg,
    borderRadius: 14,
    padding: "18px",
    marginBottom: 20,
    border: `1px solid ${bg}`,
  }),
  statusRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  statusLeft: { display: "flex", alignItems: "center", gap: 10 },
  statusDot: (color) => ({
    width: 12, height: 12, borderRadius: "50%",
    background: color, flexShrink: 0,
    boxShadow: `0 0 0 3px ${color}30`,
  }),
  statusLabel: (color) => ({ fontSize: 16, fontWeight: 700, color }),
  statusBadge: (color, bg) => ({
    fontSize: 11, fontWeight: 600,
    padding: "4px 10px", borderRadius: 20,
    background: "#fff", color,
    border: `1px solid ${color}40`,
  }),
  statusDetail: (color) => ({
    fontSize: 12, color, opacity: 0.8, lineHeight: 1.5,
  }),
  // ── Penalty banner ──
  penaltyBanner: {
    background: "#1a1a1a",
    borderRadius: 12,
    padding: "16px",
    marginBottom: 20,
    border: "1px solid #A32D2D",
  },
  penaltyTitle: {
    fontSize: 13, fontWeight: 700, color: "#fff",
    display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
  },
  penaltyBody: { fontSize: 12, color: "#ccc", lineHeight: 1.6, marginBottom: 12 },
  penaltyRate: {
    background: "rgba(163,45,45,0.2)",
    border: "1px solid rgba(163,45,45,0.4)",
    borderRadius: 8,
    padding: "10px 12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  penaltyRateLabel: { fontSize: 11, color: "#ccc" },
  penaltyRateVal: { fontSize: 16, fontWeight: 700, color: "#E24B4A" },
  penaltyBtn: {
    width: "100%", padding: "11px",
    background: "#E24B4A", border: "none",
    borderRadius: 8, fontSize: 13, fontWeight: 600,
    color: "#fff", cursor: "pointer",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  // ── Form ──
  sectionTitle: {
    fontSize: 11, fontWeight: 600, color: "#555",
    letterSpacing: "0.07em", textTransform: "uppercase",
    marginBottom: 12,
  },
  card: {
    background: "#fff", border: "1px solid #e8eaed",
    borderRadius: 12, padding: "16px", marginBottom: 16,
  },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 11, fontWeight: 600, color: "#555",
    letterSpacing: "0.06em", textTransform: "uppercase",
    display: "block", marginBottom: 5,
  },
  select: {
    width: "100%", padding: "10px 12px", fontSize: 14,
    border: "1px solid #d1d5db", borderRadius: 8,
    background: "#fff", color: "#1a1a1a", outline: "none",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    appearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    paddingRight: 32,
    boxSizing: "border-box",
  },
  input: {
    width: "100%", padding: "10px 12px", fontSize: 14,
    border: "1px solid #d1d5db", borderRadius: 8,
    background: "#fff", color: "#1a1a1a", outline: "none",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    boxSizing: "border-box",
  },
  halfGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  fieldErr: { fontSize: 11, color: "#c0392b", marginTop: 4 },
  submitBtn: (loading, valid) => ({
    width: "100%", padding: 13,
    background: loading ? "#378ADD" : "#0C447C",
    color: "#fff", border: "none", borderRadius: 8,
    fontSize: 15, fontWeight: 600,
    cursor: loading ? "not-allowed" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    transition: "background 0.15s",
    marginTop: 4,
  }),
  requirementRow: {
    display: "flex", alignItems: "flex-start",
    gap: 10, padding: "8px 0",
    borderBottom: "1px solid #f4f5f7",
  },
  requirementIcon: { fontSize: 16, flexShrink: 0, marginTop: 1 },
  requirementText: { fontSize: 12, color: "#555", lineHeight: 1.5 },
  requirementBold: { fontWeight: 600, color: "#1a1a1a" },
};

const REQUIREMENTS = [
  { icon: "✅", text: "Minimum liability coverage:", bold: "$100,000" },
  { icon: "✅", text: "Personal property coverage:", bold: "$10,000+" },
  { icon: "✅", text: "Policy must name landlord as:", bold: "Additional Interested Party" },
  { icon: "⚠️", text: "Policy must remain active for:", bold: "Full lease term" },
];

export default function InsuranceValidator() {
  const navigate = useNavigate();

  // Pre-populate with a verified policy for demo — change expiry to test states:
  // Past date → Lapsed, within 30 days → Expiring Soon, future → Verified
  const [carrier, setCarrier]   = useState("Lemonade");
  const [policyNum, setPolicyNum] = useState("LEM-2026-449821");
  const [expiry, setExpiry]     = useState("2026-12-31");
  const [coverage, setCoverage] = useState("150000");
  const [errors, setErrors]     = useState({});
  const [loading, setLoading]   = useState(false);
  const [saved, setSaved]       = useState(true); // starts as already saved for demo

  const status = getStatus(expiry);
  const daysUntilExpiry = expiry
    ? Math.ceil((new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  function validate() {
    const e = {};
    if (!carrier)                   e.carrier   = "Select your insurance carrier";
    if (!policyNum.trim())          e.policyNum = "Enter your policy number";
    if (!expiry)                    e.expiry    = "Select expiration date";
    if (!coverage || isNaN(Number(coverage))) e.coverage = "Enter coverage amount";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 1500));
    setLoading(false);
    setSaved(true);
  }

  return (
    <div style={s.app}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
        * { box-sizing: border-box; }
        body { margin: 0; background: #f4f5f7; }
      `}</style>

      {/* ── Header ── */}
      <div style={s.header}>
        <div style={s.headerTop}>
          <button style={s.backBtn} onClick={() => navigate("/home")}>←</button>
          <div style={s.headerTitle}>Renters Insurance</div>
        </div>
        <div style={s.headerSub}>Unit 4B · Compliance required</div>
      </div>

      <div style={s.body}>

        {/* ── Status card ── */}
        {status && (
          <div style={s.statusCard(status.bg)}>
            <div style={s.statusRow}>
              <div style={s.statusLeft}>
                <div style={s.statusDot(status.dot)} />
                <span style={s.statusLabel(status.color)}>{status.label}</span>
              </div>
              <span style={s.statusBadge(status.color, status.bg)}>
                {status.id === "verified"  && "✓ Policy on file"}
                {status.id === "expiring"  && `${status.days} days left`}
                {status.id === "lapsed"    && "Action required"}
              </span>
            </div>
            <p style={s.statusDetail(status.color)}>
              {status.id === "verified"  && `Your policy with ${carrier} is active and meets all lease requirements. You're covered through ${new Date(expiry).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`}
              {status.id === "expiring"  && `Your policy expires in ${status.days} days. Please renew and update your policy details before it lapses to avoid penalty charges.`}
              {status.id === "lapsed"    && "Your renters insurance policy has lapsed. You are currently enrolled in the landlord master policy and being charged a daily penalty rate."}
            </p>
          </div>
        )}

        {/* ── Penalty banner — only shows when lapsed ── */}
        {status?.id === "lapsed" && (
          <div style={s.penaltyBanner}>
            <div style={s.penaltyTitle}>
              🚨 Auto-Enrolled: Master Policy Penalty
            </div>
            <p style={s.penaltyBody}>
              Because your personal renters insurance policy has lapsed, you have been automatically enrolled in the landlord's commercial master policy as required by Section 12.4 of your lease agreement. A daily penalty rate applies until valid proof of your own policy is submitted.
            </p>
            <div style={s.penaltyRate}>
              <div>
                <div style={s.penaltyRateLabel}>Daily penalty rate</div>
                <div style={s.penaltyRateLabel}>Accruing since policy lapse</div>
              </div>
              <div style={s.penaltyRateVal}>${DAILY_PENALTY}/day</div>
            </div>
            <button style={s.penaltyBtn}>
              Upload New Policy to Stop Charges →
            </button>
          </div>
        )}

        {/* ── Policy form ── */}
        <div style={s.sectionTitle}>Your policy details</div>
        <div style={s.card}>

          <div style={s.fieldWrap}>
            <label style={s.fieldLabel}>Insurance carrier</label>
            <select
              style={s.select}
              value={carrier}
              onChange={e => { setCarrier(e.target.value); setErrors(p => ({...p, carrier: ""})); setSaved(false); }}
            >
              <option value="">Select carrier…</option>
              {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.carrier && <p style={s.fieldErr}>{errors.carrier}</p>}
          </div>

          <div style={s.fieldWrap}>
            <label style={s.fieldLabel}>Policy number</label>
            <input
              style={s.input}
              value={policyNum}
              onChange={e => { setPolicyNum(e.target.value); setErrors(p => ({...p, policyNum: ""})); setSaved(false); }}
              placeholder="e.g. LEM-2026-449821"
            />
            {errors.policyNum && <p style={s.fieldErr}>{errors.policyNum}</p>}
          </div>

          <div style={s.halfGrid}>
            <div style={s.fieldWrap}>
              <label style={s.fieldLabel}>Expiration date</label>
              <input
                type="date"
                style={s.input}
                value={expiry}
                onChange={e => { setExpiry(e.target.value); setErrors(p => ({...p, expiry: ""})); setSaved(false); }}
              />
              {errors.expiry && <p style={s.fieldErr}>{errors.expiry}</p>}
            </div>
            <div style={s.fieldWrap}>
              <label style={s.fieldLabel}>Liability coverage</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#888", fontSize: 14 }}>$</span>
                <input
                  style={{ ...s.input, paddingLeft: 22 }}
                  value={coverage}
                  onChange={e => { setCoverage(e.target.value.replace(/\D/g, "")); setErrors(p => ({...p, coverage: ""})); setSaved(false); }}
                  placeholder="100000"
                  inputMode="numeric"
                />
              </div>
              {errors.coverage && <p style={s.fieldErr}>{errors.coverage}</p>}
            </div>
          </div>

          <button
            style={s.submitBtn(loading, true)}
            onClick={handleSave}
            disabled={loading}
          >
            {loading
              ? <><span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />Verifying…</>
              : saved ? "✓ Policy saved — update if renewed" : "Save policy details"}
          </button>
        </div>

        {/* ── Requirements checklist ── */}
        <div style={s.sectionTitle}>Lease requirements</div>
        <div style={s.card}>
          {REQUIREMENTS.map((r, i) => (
            <div key={i} style={{ ...s.requirementRow, borderBottom: i === REQUIREMENTS.length - 1 ? "none" : "1px solid #f4f5f7" }}>
              <span style={s.requirementIcon}>{r.icon}</span>
              <span style={s.requirementText}>
                {r.text} <span style={s.requirementBold}>{r.bold}</span>
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
