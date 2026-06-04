import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

const C = {
  bg:        "#0A0B0D",
  surface:   "#111316",
  raised:    "#181C21",
  border:    "#252930",
  text:      "#EDEAE2",
  textSub:   "#9095A0",
  textMuted: "#5C6270",
  gold:      "#C9A96E",
  goldDim:   "#7A5C2E",
  green:     "#72B02A",
  red:       "#E05555",
  amber:     "#F0A430",
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
  return <span style={{ width:16, height:16, border:"2px solid rgba(201,169,110,0.3)", borderTopColor:C.gold, borderRadius:"50%", display:"inline-block", animation:"spin 0.7s linear infinite" }}/>;
}

export default function VendorAccess() {
  const { token }  = useParams();
  const navigate   = useNavigate();
  const [pin, setPin]         = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [checking, setChecking] = useState(true);
  const [valid, setValid]     = useState(false);
  const [ticketTitle, setTicketTitle] = useState("");

  // Verify token exists and hasn't expired
  useEffect(() => {
    async function checkToken() {
      const { data } = await supabase
        .from("maintenance_requests")
        .select("id, title, vendor_token_expires_at, status")
        .eq("vendor_token", token)
        .single();

      if (!data) { setValid(false); setChecking(false); return; }
      if (new Date(data.vendor_token_expires_at) < new Date()) { setValid(false); setChecking(false); return; }
      setTicketTitle(data.title);
      setValid(true);
      setChecking(false);
    }
    checkToken();
  }, [token]);

  async function verifyPin() {
    if (pin.length !== 4) { setError("Enter a 4-digit PIN."); return; }
    setLoading(true); setError("");

    const { data } = await supabase
      .from("maintenance_requests")
      .select("id, vendor_pin")
      .eq("vendor_token", token)
      .single();

    if (!data || data.vendor_pin !== pin) {
      setError("Incorrect PIN. Please try again.");
      setLoading(false); return;
    }

    // Store vendor session in localStorage
    localStorage.setItem("vendor_token", token);
    localStorage.setItem("vendor_ticket_id", data.id);
    setLoading(false);
    navigate(`/vendor/ticket/${token}`);
  }

  if (checking) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <Spinner/>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif", padding:20 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
      `}</style>

      <div style={{ width:"100%", maxWidth:400 }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <ModusMark size={36}/>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:18, fontWeight:600, color:C.text, letterSpacing:"0.1em", marginTop:8 }}>MODUS</div>
          <div style={{ fontSize:10, color:C.textMuted, letterSpacing:"0.16em", marginTop:2 }}>PROPERTY MANAGEMENT</div>
        </div>

        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"28px 28px 24px" }}>
          {!valid ? (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:32, marginBottom:16 }}>🔒</div>
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, fontWeight:600, color:C.text, marginBottom:8 }}>Link expired or invalid</div>
              <div style={{ fontSize:13, color:C.textSub, lineHeight:1.6 }}>This vendor access link is no longer valid. Please contact your property manager for a new link.</div>
            </div>
          ) : (
            <>
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, fontWeight:600, color:C.text, marginBottom:6 }}>Vendor access</div>
              <div style={{ fontSize:13, color:C.textSub, marginBottom:24, lineHeight:1.5 }}>
                You've been given access to a maintenance ticket.<br/>
                <strong style={{ color:C.text }}>{ticketTitle}</strong>
              </div>

              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:11, fontWeight:600, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:8 }}>Enter your 4-digit PIN</label>
                <input
                  value={pin}
                  onChange={e => { setPin(e.target.value.replace(/\D/g,"").slice(0,4)); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && verifyPin()}
                  placeholder="••••"
                  maxLength={4}
                  inputMode="numeric"
                  style={{ width:"100%", padding:"14px", fontSize:24, fontWeight:600, border:`1px solid ${error ? C.red : C.border}`, borderRadius:8, background:C.raised, color:C.text, outline:"none", textAlign:"center", letterSpacing:"0.3em", fontFamily:"'DM Sans',sans-serif", boxSizing:"border-box" }}
                />
                {error && <div style={{ fontSize:12, color:C.red, marginTop:6 }}>{error}</div>}
              </div>

              <button onClick={verifyPin} disabled={loading || pin.length !== 4} style={{ width:"100%", padding:"12px", background:pin.length === 4 ? C.goldDim : C.raised, border:`1px solid ${pin.length === 4 ? C.goldDim : C.border}`, borderRadius:8, fontSize:14, fontWeight:500, color:pin.length === 4 ? C.text : C.textMuted, cursor:pin.length === 4 ? "pointer" : "not-allowed", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:8, transition:"all 0.15s" }}>
                {loading ? <><Spinner/> Verifying…</> : "Access ticket →"}
              </button>

              <div style={{ fontSize:11, color:C.textMuted, textAlign:"center", marginTop:16 }}>
                Your PIN was provided by the property manager.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}