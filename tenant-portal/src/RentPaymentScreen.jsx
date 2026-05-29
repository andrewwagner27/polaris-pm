import { useState } from "react";

function formatCardNumber(val) {
  return val.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}
function formatExpiry(val) {
  const d = val.replace(/\D/g, "").slice(0, 4);
  return d.length >= 3 ? d.slice(0, 2) + "/" + d.slice(2) : d;
}
function detectBrand(num) {
  const n = num.replace(/\s/g, "");
  if (/^4/.test(n)) return "visa";
  if (/^5[1-5]/.test(n)) return "mastercard";
  if (/^3[47]/.test(n)) return "amex";
  return "";
}

const brandInfo = {
  visa:       { label: "VISA", color: "#1434CB" },
  mastercard: { label: "MC",   color: "#EB001B" },
  amex:       { label: "AMEX", color: "#016FD0" },
};

const s = {
  app: {
    maxWidth: 460,
    margin: "40px auto",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontSize: 14,
    color: "#1a1a1a",
    background: "#f4f5f7",
    minHeight: "100vh",
    padding: "0 0 40px",
  },
  header: {
    background: "#0C447C",
    borderRadius: "12px 12px 0 0",
    padding: "18px 20px 22px",
  },
  backBtn: {
    background: "rgba(255,255,255,0.15)",
    border: "none",
    borderRadius: 8,
    width: 32,
    height: 32,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#E6F1FB",
    fontSize: 18,
    marginBottom: 14,
  },
  headerTitle: { fontSize: 15, fontWeight: 600, color: "#E6F1FB", marginBottom: 14 },
  balanceBox: {
    background: "rgba(255,255,255,0.12)",
    border: "0.5px solid rgba(255,255,255,0.2)",
    borderRadius: 10,
    padding: "14px 16px",
  },
  unitRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  unitLabel: { fontSize: 11, color: "#85B7EB", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 3 },
  unitAddr:  { fontSize: 13, color: "#B5D4F4" },
  duePill: {
    fontSize: 11, padding: "3px 10px", background: "#FAEEDA",
    color: "#854F0B", borderRadius: 20, fontWeight: 600, flexShrink: 0,
  },
  amountLabel: { fontSize: 11, color: "#85B7EB", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3, borderTop: "0.5px solid rgba(255,255,255,0.15)", paddingTop: 10 },
  amountVal: { fontSize: 32, fontWeight: 600, color: "#fff", lineHeight: 1 },
  body: {
    background: "#fff",
    border: "1px solid #e8eaed",
    borderTop: "none",
    borderRadius: "0 0 12px 12px",
    padding: 20,
  },
  breakdown: {
    background: "#f8f9fa",
    border: "1px solid #e8eaed",
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 18,
  },
  breakdownRow: { display: "flex", justifyContent: "space-between", padding: "4px 0" },
  breakdownKey: { fontSize: 13, color: "#666" },
  breakdownVal: { fontSize: 13, color: "#1a1a1a" },
  breakdownTotal: {
    display: "flex", justifyContent: "space-between",
    borderTop: "1px solid #e8eaed", marginTop: 6, paddingTop: 6,
  },
  breakdownTotalText: { fontSize: 13, fontWeight: 600, color: "#1a1a1a" },
  tabs: {
    display: "flex", gap: 4, background: "#f8f9fa",
    border: "1px solid #e8eaed", borderRadius: 10, padding: 4, marginBottom: 18,
  },
  tabActive: {
    flex: 1, padding: "9px 0", background: "#fff", border: "1px solid #B5D4F4",
    borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#0C447C",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
  },
  tabInactive: {
    flex: 1, padding: "9px 0", background: "transparent", border: "1px solid transparent",
    borderRadius: 8, fontSize: 13, fontWeight: 400, color: "#888",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
  },
  fieldLabel: {
    fontSize: 11, fontWeight: 600, color: "#555",
    letterSpacing: "0.06em", textTransform: "uppercase",
    display: "block", marginBottom: 5,
  },
  fieldWrap: { marginBottom: 14 },
  input: {
    width: "100%", padding: "10px 12px", fontSize: 14,
    border: "1px solid #d1d5db", borderRadius: 8,
    background: "#fff", color: "#1a1a1a", outline: "none",
    boxSizing: "border-box",
  },
  inputWrap: { position: "relative" },
  fieldErr: { fontSize: 11, color: "#c0392b", marginTop: 4 },
  halfGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  payBtn: {
    width: "100%", padding: 13, border: "none", borderRadius: 8,
    fontSize: 15, fontWeight: 600, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 4, transition: "background 0.15s",
  },
  autopayRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    marginTop: 16, padding: "12px 14px", background: "#f8f9fa",
    border: "1px solid #e8eaed", borderRadius: 10, cursor: "pointer",
  },
  autopayTitle: { fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 2 },
  autopaySub: { fontSize: 11, color: "#888" },
  secureNote: {
    fontSize: 11, color: "#999", textAlign: "center",
    marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
  },
  successWrap: { textAlign: "center", padding: "36px 20px 28px" },
  successIcon: {
    width: 64, height: 64, borderRadius: "50%", background: "#e8f5e9",
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 18px", fontSize: 30,
  },
  receiptBox: {
    background: "#f8f9fa", border: "1px solid #e8eaed",
    borderRadius: 10, padding: "14px 16px", textAlign: "left", marginBottom: 22,
  },
  receiptRow: {
    display: "flex", justifyContent: "space-between",
    padding: "6px 0", borderBottom: "1px solid #e8eaed",
  },
  receiptRowLast: { display: "flex", justifyContent: "space-between", padding: "6px 0" },
  receiptKey: { fontSize: 13, color: "#666" },
  receiptVal: { fontSize: 13, fontWeight: 600, color: "#1a1a1a" },
  backPortalBtn: {
    width: "100%", padding: 12, background: "transparent",
    border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14,
    fontWeight: 600, color: "#1a1a1a", cursor: "pointer",
  },
  achWrap: { textAlign: "center", padding: "24px 0" },
  achIcon: {
    width: 52, height: 52, borderRadius: "50%", background: "#E6F1FB",
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 14px", fontSize: 24,
  },
  achTitle: { fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 },
  achSub: { fontSize: 13, color: "#888", lineHeight: 1.6, marginBottom: 20 },
  achNote: { fontSize: 11, color: "#999", marginTop: 10 },
};

function BrandBadge({ brand }) {
  const info = brandInfo[brand];
  if (!info) return null;
  return (
    <span style={{
      position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
      fontSize: 10, fontWeight: 700, color: info.color,
      border: `1px solid ${info.color}40`, borderRadius: 3, padding: "2px 5px",
      letterSpacing: "0.04em",
    }}>
      {info.label}
    </span>
  );
}

function Input({ value, onChange, placeholder, maxLength, inputMode }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      maxLength={maxLength}
      inputMode={inputMode}
      style={{ ...s.input, borderColor: focused ? "#185FA5" : "#d1d5db", boxShadow: focused ? "0 0 0 3px rgba(24,95,165,0.1)" : "none" }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

function CardForm({ onSubmit, loading }) {
  const [num, setNum]       = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc]       = useState("");
  const [name, setName]     = useState("");
  const [errors, setErrors] = useState({});

  function validate() {
    const e = {};
    if (num.replace(/\s/g, "").length < 15) e.num = "Enter a valid card number";
    if (expiry.length < 5)  e.expiry = "Enter MM/YY";
    if (cvc.length < 3)     e.cvc    = "Enter CVC";
    if (!name.trim())       e.name   = "Enter name on card";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  return (
    <div>
      <div style={s.fieldWrap}>
        <label style={s.fieldLabel}>Card number</label>
        <div style={s.inputWrap}>
          <Input value={num} onChange={e => { setNum(formatCardNumber(e.target.value)); setErrors(p => ({...p, num: ""})); }}
            placeholder="1234 5678 9012 3456" maxLength={19} inputMode="numeric" />
          <BrandBadge brand={detectBrand(num)} />
        </div>
        {errors.num && <p style={s.fieldErr}>{errors.num}</p>}
      </div>

      <div style={s.halfGrid}>
        <div style={s.fieldWrap}>
          <label style={s.fieldLabel}>Expiry</label>
          <Input value={expiry} onChange={e => { setExpiry(formatExpiry(e.target.value)); setErrors(p => ({...p, expiry: ""})); }}
            placeholder="MM/YY" maxLength={5} inputMode="numeric" />
          {errors.expiry && <p style={s.fieldErr}>{errors.expiry}</p>}
        </div>
        <div style={s.fieldWrap}>
          <label style={s.fieldLabel}>CVC</label>
          <Input value={cvc} onChange={e => { setCvc(e.target.value.replace(/\D/g,"").slice(0,4)); setErrors(p => ({...p, cvc: ""})); }}
            placeholder="123" maxLength={4} inputMode="numeric" />
          {errors.cvc && <p style={s.fieldErr}>{errors.cvc}</p>}
        </div>
      </div>

      <div style={s.fieldWrap}>
        <label style={s.fieldLabel}>Name on card</label>
        <Input value={name} onChange={e => { setName(e.target.value); setErrors(p => ({...p, name: ""})); }}
          placeholder="Maria Rodriguez" />
        {errors.name && <p style={s.fieldErr}>{errors.name}</p>}
      </div>

      <button
        onClick={() => { if (validate()) onSubmit({ number: num, expiry, cvc, name }); }}
        disabled={loading}
        style={{ ...s.payBtn, background: loading ? "#378ADD" : "#0C447C", color: "#fff", opacity: loading ? 0.85 : 1 }}
      >
        {loading
          ? <><Spinner /> Processing…</>
          : <>🔒 Pay $1,150.00</>}
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <span style={{
      width: 16, height: 16, border: "2px solid rgba(255,255,255,0.35)",
      borderTopColor: "#fff", borderRadius: "50%", display: "inline-block",
      animation: "spin 0.7s linear infinite",
    }} />
  );
}

function ACHForm() {
  return (
    <div style={s.achWrap}>
      <div style={s.achIcon}>🏦</div>
      <p style={s.achTitle}>Pay by bank transfer (ACH)</p>
      <p style={s.achSub}>Link your bank account via Plaid for free ACH payments. No fees — ideal for recurring monthly rent.</p>
      <button style={{ ...s.payBtn, background: "#0C447C", color: "#fff" }}>
        🏦 Connect bank via Plaid
      </button>
      <p style={s.achNote}>2–3 business days to process · $0 fee</p>
    </div>
  );
}

function SuccessScreen({ last4, onReset }) {
  const conf = "PAY-" + Math.random().toString(36).slice(2, 9).toUpperCase();
  const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return (
    <div style={s.successWrap}>
      <div style={s.successIcon}>✅</div>
      <p style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Payment received</p>
      <p style={{ fontSize: 15, color: "#666", marginBottom: 24 }}>$1,150.00 charged to card ending {last4}</p>
      <div style={s.receiptBox}>
        {[["Payment", "$1,150.00"], ["Date", date], ["Confirmation", conf]].map(([k, v]) => (
          <div key={k} style={s.receiptRow}>
            <span style={s.receiptKey}>{k}</span>
            <span style={s.receiptVal}>{v}</span>
          </div>
        ))}
        <div style={s.receiptRowLast}>
          <span style={s.receiptKey}>Receipt</span>
          <span style={{ ...s.receiptVal, color: "#185FA5" }}>Send to email</span>
        </div>
      </div>
      <button style={s.backPortalBtn} onClick={onReset}>← Back to portal</button>
    </div>
  );
}

export default function RentPaymentScreen() {
  const [method, setMethod]   = useState("card");
  const [loading, setLoading] = useState(false);
  const [paid, setPaid]       = useState(false);
  const [last4, setLast4]     = useState("4242");
  const [autopay, setAutopay] = useState(false);

  async function handleSubmit(cardData) {
    setLoading(true);
    // TODO: replace with real Stripe call once backend is live
    // const token = await createStripeToken(cardData);
    // await fetch("/api/charge", { method:"POST", body: JSON.stringify({ token: token.id, amount: 1150, autopay }) });
    await new Promise(r => setTimeout(r, 2000)); // simulated delay — remove in production
    setLast4(cardData.number.replace(/\s/g, "").slice(-4) || "4242");
    setLoading(false);
    setPaid(true);
  }

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        body { margin: 0; background: #f4f5f7; }
      `}</style>

      <div style={s.app}>
        {/* ── Header ── */}
        <div style={s.header}>
          <div style={s.headerTitle}>Pay rent</div>
          <div style={s.balanceBox}>
            <div style={s.unitRow}>
              <div>
                <div style={s.unitLabel}>Unit 4B · Clifton Manor</div>
                <div style={s.unitAddr}>12009 Clifton Blvd, Lakewood OH</div>
              </div>
              <span style={s.duePill}>Due Jun 1</span>
            </div>
            <div style={s.amountLabel}>Amount due</div>
            <div style={s.amountVal}>$1,150.00</div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={s.body}>
          {paid ? (
            <SuccessScreen last4={last4} onReset={() => { setPaid(false); }} />
          ) : (
            <>
              {/* Charge breakdown */}
              <div style={s.breakdown}>
                <div style={s.breakdownRow}>
                  <span style={s.breakdownKey}>Base rent</span>
                  <span style={s.breakdownVal}>$1,100.00</span>
                </div>
                <div style={s.breakdownRow}>
                  <span style={s.breakdownKey}>Water / sewer</span>
                  <span style={s.breakdownVal}>$50.00</span>
                </div>
                <div style={s.breakdownTotal}>
                  <span style={s.breakdownTotalText}>Total</span>
                  <span style={s.breakdownTotalText}>$1,150.00</span>
                </div>
              </div>

              {/* Payment method tabs */}
              <div style={s.tabs}>
                <button style={method === "card" ? s.tabActive : s.tabInactive} onClick={() => setMethod("card")}>
                  💳 Credit / debit
                </button>
                <button style={method === "ach" ? s.tabActive : s.tabInactive} onClick={() => setMethod("ach")}>
                  🏦 Bank account
                </button>
              </div>

              {method === "card" ? (
                <CardForm onSubmit={handleSubmit} loading={loading} />
              ) : (
                <ACHForm />
              )}

              {/* Autopay toggle */}
              {method === "card" && (
                <div style={s.autopayRow} onClick={() => setAutopay(a => !a)}>
                  <div>
                    <div style={s.autopayTitle}>Enable autopay</div>
                    <div style={s.autopaySub}>Auto-charge this card on the 1st of each month</div>
                  </div>
                  <div style={{ width: 40, height: 22, borderRadius: 11, background: autopay ? "#185FA5" : "#ccc", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: autopay ? 20 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                  </div>
                </div>
              )}

              <p style={s.secureNote}>🔒 Payments secured by Stripe · PCI DSS compliant</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
