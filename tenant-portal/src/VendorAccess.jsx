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
  blue:      "#4A9AE8",
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

// ── Work Order Screen ─────────────────────────────────────────────────────
function WorkOrderScreen({ ticket, vendorName, onAccept }) {
  const [sigName, setSigName]   = useState("");
  const [signing, setSigning]   = useState(false);
  const [vendorEmail, setVendorEmail] = useState("");
  const [agreed, setAgreed]     = useState(false);
  const today = new Date().toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" });

  async function handleAccept() {
    if (!sigName.trim()) return;
    setSigning(true);

    // Store e-sig: name + timestamp (IP captured server-side if needed)
    await supabase.from("maintenance_requests").update({
      work_order_accepted_at: new Date().toISOString(),
      work_order_accepted_by: sigName.trim(),
      vendor_email: vendorEmail.trim() || null,
    }).eq("id", ticket.id);

    // Log as comment
    await supabase.from("maintenance_comments").insert({
      request_id:        ticket.id,
      body:              `Work order accepted and signed by ${sigName.trim()} on ${today}.`,
      author_type:       "vendor",
      author_name:       vendorName,
      visible_to_tenant: false,
    });

    setSigning(false);
    onAccept();
  }

  const propertyAddress = ticket.property_address || "Property address on file";

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif", padding:"24px 20px 60px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"14px 20px", display:"flex", alignItems:"center", gap:12, margin:"-24px -20px 24px" }}>
        <ModusMark size={26}/>
        <div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:15, fontWeight:600, color:C.text, letterSpacing:"0.08em" }}>MODUS</div>
          <div style={{ fontSize:10, color:C.textMuted, letterSpacing:"0.12em" }}>PROPERTY MANAGEMENT</div>
        </div>
      </div>

      <div style={{ maxWidth:640, margin:"0 auto" }}>

        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:600, color:C.text, marginBottom:4 }}>Work Order</div>
        <div style={{ fontSize:13, color:C.textSub, marginBottom:24 }}>Please review and sign before proceeding to the job.</div>

        {/* Work order document */}
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden", marginBottom:20 }}>

          {/* Header */}
          <div style={{ background:C.raised, borderBottom:`1px solid ${C.border}`, padding:"20px 24px", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:18, fontWeight:600, color:C.text }}>Modus Property Management</div>
              <div style={{ fontSize:12, color:C.textSub, marginTop:2 }}>Columbus, OH · moduspm.com</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:10, fontWeight:600, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.08em" }}>Work Order</div>
              <div style={{ fontSize:12, color:C.textSub, marginTop:2 }}>{today}</div>
            </div>
          </div>

          <div style={{ padding:"20px 24px" }}>

            {/* Parties */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
              <div style={{ background:C.raised, borderRadius:8, padding:"12px 14px" }}>
                <div style={{ fontSize:10, fontWeight:600, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Client</div>
                <div style={{ fontSize:13, fontWeight:500, color:C.text }}>Modus Property Management</div>
                <div style={{ fontSize:12, color:C.textSub, marginTop:2 }}>{propertyAddress}</div>
              </div>
              <div style={{ background:C.raised, borderRadius:8, padding:"12px 14px" }}>
                <div style={{ fontSize:10, fontWeight:600, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Contractor</div>
                <div style={{ fontSize:13, fontWeight:500, color:C.text }}>{vendorName}</div>
                <div style={{ fontSize:12, color:C.textSub, marginTop:2 }}>Licensed & insured contractor</div>
              </div>
            </div>

            {/* Scope */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:10, fontWeight:600, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Scope of work</div>
              <div style={{ background:C.raised, borderRadius:8, padding:"12px 14px" }}>
                <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:4 }}>{ticket.title}</div>
                {ticket.description && <div style={{ fontSize:13, color:C.textSub, lineHeight:1.6 }}>{ticket.description}</div>}
                <div style={{ marginTop:8, display:"flex", gap:12, flexWrap:"wrap" }}>
                  {ticket.category && <span style={{ fontSize:11, color:C.textSub }}>Category: <strong style={{ color:C.text }}>{ticket.category}</strong></span>}
                  {ticket.priority && <span style={{ fontSize:11, color:C.textSub }}>Priority: <strong style={{ color:C.text }}>{ticket.priority}</strong></span>}
                  {ticket.scheduled_date && <span style={{ fontSize:11, color:C.textSub }}>Scheduled: <strong style={{ color:C.gold }}>{ticket.scheduled_date}{ticket.scheduled_time ? ` · ${ticket.scheduled_time}` : ""}</strong></span>}
                </div>
              </div>
            </div>

            {/* Terms */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:10, fontWeight:600, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Terms & conditions</div>
              <div style={{ background:C.raised, borderRadius:8, padding:"14px 16px", display:"flex", flexDirection:"column", gap:10 }}>
                {[
                  ["Payment terms", "Net 30 days from invoice approval date."],
                  ["Quote requirement", "Contractor must submit a quote for approval before commencing work. No work may begin until quote is approved by Modus Property Management."],
                  ["Budget authorization", "Contractor may not exceed the approved quote amount without prior written authorization. Unauthorized overages will not be compensated."],
                  ["Material receipts", "Receipts required for all material purchases. Submit with invoice for reimbursement."],
                  ["Change orders", "Any scope changes requiring additional cost must be submitted via the Modus vendor portal and approved before additional work commences."],
                  ["Workmanship", "Contractor warrants all work for 90 days. Defective work will be corrected at no additional charge."],
                  ["Insurance", "Contractor represents they maintain adequate liability insurance and workers compensation coverage."],
                ].map(([k, v]) => (
                  <div key={k} style={{ display:"flex", gap:10 }}>
                    <div style={{ width:6, height:6, borderRadius:"50%", background:C.goldDim, flexShrink:0, marginTop:6 }}/>
                    <div>
                      <span style={{ fontSize:12, fontWeight:600, color:C.text }}>{k}: </span>
                      <span style={{ fontSize:12, color:C.textSub, lineHeight:1.6 }}>{v}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Lien waiver */}
            <div style={{ background:`${C.blue}08`, border:`1px solid ${C.blue}22`, borderRadius:8, padding:"14px 16px", marginBottom:20 }}>
              <div style={{ fontSize:10, fontWeight:600, color:C.blue, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Conditional Lien Waiver</div>
              <div style={{ fontSize:12, color:C.textSub, lineHeight:1.7 }}>
                Upon receipt of payment in the amount stated in the approved invoice, Contractor conditionally waives and releases any and all mechanic's liens, materialman's liens, or other claims or rights against the above-referenced property arising from labor, services, equipment, or materials furnished by Contractor through the date of this waiver. This waiver is conditioned upon receipt of the agreed payment and shall become effective upon clearance of such payment.
              </div>
            </div>

          </div>
        </div>

        {/* E-signature */}
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"20px 24px", marginBottom:16 }}>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:16, fontWeight:600, color:C.text, marginBottom:4 }}>Electronic signature</div>
          <div style={{ fontSize:13, color:C.textSub, marginBottom:20, lineHeight:1.5 }}>
            By typing your full name and clicking "Accept & proceed", you agree to the terms above. This constitutes a legally binding electronic signature under the ESIGN Act.
          </div>

          {/* Agree checkbox */}
          <div onClick={() => setAgreed(v => !v)} style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:16, cursor:"pointer" }}>
            <div style={{ width:18, height:18, borderRadius:4, border:`2px solid ${agreed ? C.gold : C.border}`, background:agreed ? C.gold : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2, transition:"all 0.12s" }}>
              {agreed && <span style={{ fontSize:10, color:C.bg, fontWeight:700 }}>✓</span>}
            </div>
            <div style={{ fontSize:13, color:C.textSub, lineHeight:1.5 }}>
              I have read and agree to the work order terms, payment conditions, and conditional lien waiver above.
            </div>
          </div>

          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, fontWeight:600, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:6 }}>
              Full name (typed signature) *
            </label>
            <input value={sigName} onChange={e => setSigName(e.target.value)}
              placeholder="Type your full legal name"
              style={{ width:"100%", padding:"11px 14px", fontSize:14, border:`1px solid ${C.border}`, borderRadius:8, background:C.raised, color:C.text, outline:"none", fontFamily:"'Cormorant Garamond',serif", fontStyle:"italic", letterSpacing:"0.04em", boxSizing:"border-box" }}/>
            {sigName && <div style={{ fontSize:11, color:C.textSub, marginTop:4 }}>Signed: {today}</div>}
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, fontWeight:600, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:6 }}>
              Email address <span style={{ color:C.textMuted, fontWeight:400, textTransform:"none" }}>(for job updates)</span>
            </label>
            <input type="email" value={vendorEmail} onChange={e => setVendorEmail(e.target.value)}
              placeholder="your@email.com"
              style={{ width:"100%", padding:"11px 14px", fontSize:14, border:`1px solid ${C.border}`, borderRadius:8, background:C.raised, color:C.text, outline:"none", fontFamily:"'DM Sans',sans-serif", boxSizing:"border-box" }}/>
          </div>

          <button onClick={handleAccept} disabled={signing || !sigName.trim() || !agreed}
            style={{ width:"100%", padding:"13px", background:sigName.trim() && agreed ? C.goldDim : C.raised, border:`1px solid ${sigName.trim() && agreed ? C.goldDim : C.border}`, borderRadius:8, fontSize:14, fontWeight:500, color:sigName.trim() && agreed ? C.text : C.textMuted, cursor:sigName.trim() && agreed ? "pointer" : "not-allowed", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:8, transition:"all 0.15s" }}>
            {signing ? <><Spinner/> Signing…</> : "Accept & proceed to ticket →"}
          </button>
        </div>

        <div style={{ fontSize:11, color:C.textMuted, textAlign:"center", lineHeight:1.6 }}>
          Your electronic signature is stored securely with a timestamp. For questions contact your property manager.
        </div>
      </div>
    </div>
  );
}

// ── Main PIN Entry ────────────────────────────────────────────────────────
export default function VendorAccess() {
  const { token }  = useParams();
  const navigate   = useNavigate();
  const [pin, setPin]           = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [checking, setChecking] = useState(true);
  const [valid, setValid]       = useState(false);
  const [ticket, setTicket]     = useState(null);
  const [showWorkOrder, setShowWorkOrder] = useState(false);

  useEffect(() => {
    async function checkToken() {
      const { data } = await supabase
        .from("maintenance_requests")
        .select("id, title, description, category, priority, scheduled_date, scheduled_time, vendor_token_expires_at, status, work_order_accepted_at, vendor_name")
        .eq("vendor_token", token)
        .single();

      if (!data) { setValid(false); setChecking(false); return; }
      if (new Date(data.vendor_token_expires_at) < new Date()) { setValid(false); setChecking(false); return; }
      setTicket(data);
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
      .select("id, vendor_pin, work_order_accepted_at")
      .eq("vendor_token", token)
      .single();

    if (!data || data.vendor_pin !== pin) {
      setError("Incorrect PIN. Please try again.");
      setLoading(false); return;
    }

    localStorage.setItem("vendor_token", token);
    localStorage.setItem("vendor_ticket_id", data.id);
    setLoading(false);

    // If work order already signed, go straight to ticket
    if (data.work_order_accepted_at) {
      navigate(`/vendor/ticket/${token}`);
    } else {
      setShowWorkOrder(true);
    }
  }

  if (checking) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <Spinner/>
    </div>
  );

  if (showWorkOrder && ticket) return (
    <WorkOrderScreen
      ticket={ticket}
      vendorName={ticket.vendor_name || "Vendor"}
      onAccept={() => navigate(`/vendor/ticket/${token}`)}
    />
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
                You've been invited to a maintenance job.<br/>
                <strong style={{ color:C.text }}>{ticket?.title}</strong>
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

              <button onClick={verifyPin} disabled={loading || pin.length !== 4}
                style={{ width:"100%", padding:"12px", background:pin.length === 4 ? C.goldDim : C.raised, border:`1px solid ${pin.length === 4 ? C.goldDim : C.border}`, borderRadius:8, fontSize:14, fontWeight:500, color:pin.length === 4 ? C.text : C.textMuted, cursor:pin.length === 4 ? "pointer" : "not-allowed", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:8, transition:"all 0.15s" }}>
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