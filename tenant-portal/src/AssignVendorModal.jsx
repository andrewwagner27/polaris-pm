import { useState, useEffect } from "react";
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

const CATEGORY_ICONS = {
  plumbing: "🚿", electrical: "⚡", hvac: "🌡️",
  appliance: "🍳", pest: "🐛", general: "🔧", other: "📋",
};

function FieldLabel({ children }) {
  return <label style={{ fontSize: 11, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>{children}</label>;
}

function Input({ value, onChange, placeholder, type = "text" }) {
  const [focused, setFocused] = useState(false);
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: `1px solid ${focused ? C.gold : C.border}`, borderRadius: 7, background: C.raised, color: C.text, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", boxShadow: focused ? "0 0 0 3px rgba(201,169,110,0.08)" : "none", transition: "border-color 0.15s" }}
    />
  );
}

export default function AssignVendorModal({ requestId, requestTitle, requestCategory, propertyId, onClose, onAssigned }) {
  const [vendors, setVendors]         = useState([]);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [vendorName, setVendorName]   = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");
  const [result, setResult]           = useState(null);
  const [useCustom, setUseCustom]     = useState(false);

  const BASE_URL = window.location.origin;

  useEffect(() => {
    async function fetchVendors() {
      setLoadingVendors(true);
      let query = supabase.from("vendors").select("*").eq("active", true);
      if (propertyId) query = query.eq("property_id", propertyId);
      const { data } = await query.order("name");
      // Filter by category if we have one, but show all if no matches
      const catMatch = (data || []).filter(v => v.category === requestCategory);
      setVendors(catMatch.length > 0 ? catMatch : (data || []));
      setLoadingVendors(false);
    }
    fetchVendors();
  }, [propertyId, requestCategory]);

  function selectVendor(v) {
    setSelectedVendor(v);
    setVendorName(v.name);
    setVendorPhone(v.phone || "");
    setUseCustom(false);
  }

  async function assign() {
    const name  = vendorName.trim();
    const phone = vendorPhone.trim();
    if (!name) { setError("Vendor name is required."); return; }
    setSaving(true); setError("");

    const { data, error: fnError } = await supabase.functions.invoke("generate-vendor-token", {
      body: { request_id: requestId, vendor_name: name, vendor_phone: phone || null }
    });

    setSaving(false);
    if (fnError || data?.error) { setError(fnError?.message || data?.error); return; }

    // Update status to in_progress
    await supabase.from("maintenance_requests").update({ status: "in_progress" }).eq("id", requestId);

    setResult({ token: data.token, pin: data.pin, link: `${BASE_URL}/vendor/${data.token}`, vendorName: name, vendorPhone: phone });
    onAssigned?.();
  }

  async function copyLink() { await navigator.clipboard.writeText(result.link); }
  async function copyPin()  { await navigator.clipboard.writeText(result.pin); }
  async function copyAll()  {
    const msg = `Hi ${result.vendorName}, here's your access link for the maintenance ticket:\n${result.link}\nPIN: ${result.pin}`;
    await navigator.clipboard.writeText(msg);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: 500, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Assign vendor</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: C.textSub }}>✕</button>
        </div>

        <div style={{ padding: "20px 22px" }}>
          {!result ? (
            <>
              <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, marginBottom: 20 }}>
                Assigning vendor to <strong style={{ color: C.text }}>{requestTitle}</strong>. A unique access link and PIN will be generated.
              </div>

              {error && <div style={{ background: "rgba(224,85,85,0.1)", color: C.red, fontSize: 12, padding: "10px 12px", borderRadius: 7, marginBottom: 16, border: `1px solid rgba(224,85,85,0.2)` }}>{error}</div>}

              {/* Saved vendors */}
              {!loadingVendors && vendors.length > 0 && !useCustom && (
                <div style={{ marginBottom: 20 }}>
                  <FieldLabel>Your vendors {requestCategory && `· ${CATEGORY_ICONS[requestCategory] || "🔧"} ${requestCategory}`}</FieldLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {vendors.map(v => (
                      <div key={v.id} onClick={() => selectVendor(v)}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", border: `1px solid ${selectedVendor?.id === v.id ? C.goldDim : C.border}`, borderRadius: 8, cursor: "pointer", background: selectedVendor?.id === v.id ? `${C.gold}08` : C.raised, transition: "all 0.12s" }}>
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: `${C.gold}18`, border: `1px solid ${C.goldDim}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                          {CATEGORY_ICONS[v.category] || "🔧"}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{v.name}</div>
                          {v.phone && <div style={{ fontSize: 11, color: C.textSub }}>{v.phone}</div>}
                        </div>
                        {selectedVendor?.id === v.id && <span style={{ fontSize: 12, color: C.gold }}>✓</span>}
                      </div>
                    ))}
                    <button onClick={() => { setUseCustom(true); setSelectedVendor(null); setVendorName(""); setVendorPhone(""); }}
                      style={{ padding: "10px", background: "transparent", border: `1px dashed ${C.border}`, borderRadius: 8, fontSize: 12, color: C.textSub, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.12s" }}>
                      + Use a different vendor
                    </button>
                  </div>
                </div>
              )}

              {/* Custom vendor entry */}
              {(useCustom || (!loadingVendors && vendors.length === 0)) && (
                <div style={{ marginBottom: 20 }}>
                  {vendors.length > 0 && (
                    <button onClick={() => { setUseCustom(false); setVendorName(""); setVendorPhone(""); }}
                      style={{ fontSize: 12, color: C.goldDim, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginBottom: 12, padding: 0 }}>← Back to saved vendors</button>
                  )}
                  {vendors.length === 0 && (
                    <div style={{ fontSize: 12, color: C.textSub, marginBottom: 12 }}>No saved vendors for this property. <a href="/landlord/settings" style={{ color: C.gold }}>Add vendors in Settings →</a></div>
                  )}
                  <div style={{ marginBottom: 12 }}>
                    <FieldLabel>Vendor / contractor name *</FieldLabel>
                    <Input value={vendorName} onChange={e => { setVendorName(e.target.value); setError(""); }} placeholder="e.g. Mike's Plumbing" />
                  </div>
                  <div>
                    <FieldLabel>Phone (optional)</FieldLabel>
                    <Input value={vendorPhone} onChange={e => setVendorPhone(e.target.value)} placeholder="(614) 555-0101" type="tel" />
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={onClose} style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, color: C.textSub, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
                <button onClick={assign} disabled={saving || (!vendorName.trim() && !selectedVendor)} style={{ padding: "9px 18px", background: "transparent", border: `1px solid ${C.goldDim}`, borderRadius: 7, fontSize: 13, fontWeight: 500, color: C.gold, cursor: saving ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", opacity: saving ? 0.7 : 1 }}>
                  {saving ? "Generating…" : "Generate access link"}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Success */}
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: `${C.green}18`, border: `1px solid ${C.green}33`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 22, color: C.green }}>✓</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 4 }}>Access link generated</div>
                <div style={{ fontSize: 13, color: C.textSub }}>Share with {result.vendorName}</div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <FieldLabel>Access link</FieldLabel>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1, padding: "10px 12px", background: C.raised, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{result.link}</div>
                  <button onClick={copyLink} style={{ padding: "10px 14px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12, color: C.textSub, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap" }}>Copy</button>
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <FieldLabel>PIN code</FieldLabel>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ padding: "12px 20px", background: C.raised, border: `1px solid ${C.goldDim}`, borderRadius: 7, fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 600, color: C.gold, letterSpacing: "0.3em" }}>{result.pin}</div>
                  <button onClick={copyPin} style={{ padding: "10px 14px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12, color: C.textSub, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Copy</button>
                  <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>Vendor needs this to access the ticket</div>
                </div>
              </div>

              {/* SMS template */}
              <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Text message template</div>
                <div style={{ fontSize: 12, color: C.text, lineHeight: 1.7 }}>
                  Hi {result.vendorName}, here's your access link for the maintenance ticket:<br/>
                  {result.link}<br/>
                  PIN: <strong>{result.pin}</strong>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={copyAll} style={{ flex: 1, padding: "11px", background: C.goldDim, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, color: C.text, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Copy message to clipboard</button>
                <button onClick={onClose} style={{ padding: "11px 18px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.textSub, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Done</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}