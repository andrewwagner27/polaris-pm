import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";

// ─── Modus tokens ──────────────────────────────────────────────────────────
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
  blue:     "#4A9AE8",
  green:    "#72B02A",
  red:      "#E05555",
  amber:    "#F0A430",
};

const STATUS = {
  paid:    { label: "Paid",    color: "#72B02A", bg: "rgba(114,176,42,0.13)" },
  pending: { label: "Pending", color: "#F0A430", bg: "rgba(240,164,48,0.13)" },
  late:    { label: "Late",    color: "#E05555", bg: "rgba(224,85,85,0.13)" },
  vacant:  { label: "Vacant",  color: "#5C6270", bg: "rgba(92,98,112,0.15)" },
};

const PROP_COLORS = [C.gold, C.blue, C.green, C.amber, C.red];

function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

// ─── Shared ────────────────────────────────────────────────────────────────
function Badge({ status }) {
  const cfg = STATUS[status];
  if (!cfg) return null;
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>;
}

function PrimaryBtn({ children, onClick, small }) {
  return (
    <button onClick={onClick} style={{
      background: "transparent", border: `1px solid ${C.goldDim}`,
      color: C.gold, fontSize: small ? 11 : 13, fontWeight: 500,
      padding: small ? "6px 12px" : "9px 18px", borderRadius: 7,
      cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
      letterSpacing: "0.04em", transition: "background 0.15s",
    }}
      onMouseOver={e => e.currentTarget.style.background = "rgba(201,169,110,0.07)"}
      onMouseOut={e => e.currentTarget.style.background = "transparent"}
    >{children}</button>
  );
}

function GhostBtn({ children, onClick, small }) {
  return (
    <button onClick={onClick} style={{
      background: "transparent", border: `1px solid ${C.border}`,
      color: C.textSub, fontSize: small ? 11 : 13, fontWeight: 500,
      padding: small ? "6px 12px" : "9px 18px", borderRadius: 7,
      cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
    }}
      onMouseOver={e => { e.currentTarget.style.borderColor = C.border2; e.currentTarget.style.color = C.text; }}
      onMouseOut={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSub; }}
    >{children}</button>
  );
}

function FieldLabel({ children }) {
  return <label style={{ fontSize: 11, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 5 }}>{children}</label>;
}

function Input({ value, onChange, placeholder, type = "text", maxLength }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type} value={value} onChange={onChange} placeholder={placeholder} maxLength={maxLength}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{
        width: "100%", padding: "10px 12px", fontSize: 13,
        border: `1px solid ${focused ? C.gold : C.border}`,
        borderRadius: 7, background: C.raised, color: C.text,
        outline: "none", boxSizing: "border-box",
        fontFamily: "'DM Sans', sans-serif",
        boxShadow: focused ? `0 0 0 3px rgba(201,169,110,0.08)` : "none",
        transition: "border-color 0.15s",
      }}
    />
  );
}

// ─── Add Property Modal ────────────────────────────────────────────────────
function AddPropertyModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", address: "", city: "", state: "", zip: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim() || !form.address.trim()) { setError("Name and address are required."); return; }
    setSaving(true);
    const { error } = await supabase.from("properties").insert({ name: form.name, address: form.address, city: form.city, state: form.state, zip: form.zip });
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: 480, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Add property</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: C.textSub }}>✕</button>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {error && <div style={{ background: "rgba(224,85,85,0.1)", color: C.red, fontSize: 12, padding: "10px 12px", borderRadius: 7, marginBottom: 16, border: `1px solid rgba(224,85,85,0.2)` }}>{error}</div>}
          <div style={{ marginBottom: 14 }}><FieldLabel>Property name *</FieldLabel><Input value={form.name} onChange={e => update("name", e.target.value)} placeholder="e.g. Clifton Manor" /></div>
          <div style={{ marginBottom: 14 }}><FieldLabel>Street address *</FieldLabel><Input value={form.address} onChange={e => update("address", e.target.value)} placeholder="e.g. 12009 Clifton Blvd" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div><FieldLabel>City</FieldLabel><Input value={form.city} onChange={e => update("city", e.target.value)} placeholder="Lakewood" /></div>
            <div><FieldLabel>State</FieldLabel><Input value={form.state} onChange={e => update("state", e.target.value)} placeholder="OH" maxLength={2} /></div>
          </div>
          <div style={{ marginBottom: 14 }}><FieldLabel>ZIP code</FieldLabel><Input value={form.zip} onChange={e => update("zip", e.target.value)} placeholder="44107" maxLength={10} /></div>
        </div>
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={save}>{saving ? "Saving…" : "Add property"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Add Unit Modal ────────────────────────────────────────────────────────
function AddUnitModal({ propertyId, onClose, onSaved }) {
  const [form, setForm] = useState({ unit_number: "", bedrooms: "", bathrooms: "", rent_amount: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.unit_number.trim()) { setError("Unit number is required."); return; }
    setSaving(true);
    const { error } = await supabase.from("units").insert({
      property_id: propertyId,
      unit_number: form.unit_number,
      bedrooms: form.bedrooms ? parseInt(form.bedrooms) : null,
      bathrooms: form.bathrooms ? parseFloat(form.bathrooms) : null,
      rent_amount: form.rent_amount ? parseFloat(form.rent_amount) : null,
    });
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: 480, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Add unit</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: C.textSub }}>✕</button>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {error && <div style={{ background: "rgba(224,85,85,0.1)", color: C.red, fontSize: 12, padding: "10px 12px", borderRadius: 7, marginBottom: 16, border: `1px solid rgba(224,85,85,0.2)` }}>{error}</div>}
          <div style={{ marginBottom: 14 }}><FieldLabel>Unit number *</FieldLabel><Input value={form.unit_number} onChange={e => update("unit_number", e.target.value)} placeholder="e.g. 1A, 2B, Main" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div><FieldLabel>Bedrooms</FieldLabel><Input type="number" value={form.bedrooms} onChange={e => update("bedrooms", e.target.value)} placeholder="2" /></div>
            <div><FieldLabel>Bathrooms</FieldLabel><Input type="number" value={form.bathrooms} onChange={e => update("bathrooms", e.target.value)} placeholder="1" /></div>
          </div>
          <div style={{ marginBottom: 14 }}><FieldLabel>Monthly rent ($)</FieldLabel><Input type="number" value={form.rent_amount} onChange={e => update("rent_amount", e.target.value)} placeholder="1250" /></div>
        </div>
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={save}>{saving ? "Saving…" : "Add unit"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function LandlordProperties() {
  const navigate = useNavigate();
  const width    = useWindowWidth();
  const isMobile = width < 768;

  const [properties, setProperties]   = useState([]);
  const [units, setUnits]             = useState([]);
  const [tenants, setTenants]         = useState([]);
  const [payments, setPayments]       = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(null);
  const [detailTab, setDetailTab]     = useState("Overview");
  const [showAddProp, setShowAddProp] = useState(false);
  const [showAddUnit, setShowAddUnit] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [
      { data: propsData },
      { data: unitsData },
      { data: tenantsData },
      { data: paymentsData },
      { data: maintData },
    ] = await Promise.all([
      supabase.from("properties").select("*"),
      supabase.from("units").select("*"),
      supabase.from("tenants").select("*"),
      supabase.from("payments").select("*"),
      supabase.from("maintenance_requests").select("id, unit_id, status, priority, title").neq("status", "resolved"),
    ]);
    setProperties(propsData || []);
    setUnits(unitsData || []);
    setTenants(tenantsData || []);
    setPayments(paymentsData || []);
    setMaintenance(maintData || []);
    setLoading(false);
  }

  const totalUnits    = units.length;
  const totalOccupied = tenants.length;

  const prop      = selected ? properties.find(p => p.id === selected) : null;
  const propIdx   = prop ? properties.indexOf(prop) : 0;
  const propColor = PROP_COLORS[propIdx % PROP_COLORS.length];

  function propUnitsFor(id)    { return units.filter(u => u.property_id === id); }
  function propTenantsFor(id)  { return tenants.filter(t => propUnitsFor(id).some(u => u.id === t.unit_id)); }
  function propMaintFor(id)    { return maintenance.filter(m => propUnitsFor(id).some(u => u.id === m.unit_id)); }
  function propCollectedFor(id) {
    const ids = propUnitsFor(id).map(u => u.id);
    return payments.filter(p => ids.includes(p.unit_id) && p.status === "paid").reduce((s, p) => s + (p.amount_cents || 0), 0) / 100;
  }
  function unitRosterFor(id) {
    return propUnitsFor(id).map(unit => {
      const tenant = tenants.find(t => t.unit_id === unit.id);
      const pay    = payments.find(p => p.unit_id === unit.id);
      let status   = "vacant";
      if (tenant) status = pay?.status === "paid" ? "paid" : pay?.status === "failed" ? "late" : "pending";
      return { id: unit.id, unit: unit.unit_number, tenant: tenant?.name || "—", rent: unit.rent_amount || 0, status };
    });
  }

  // Gross rental revenue = sum of rent_amount for all occupied units
  const grossRevenue = units
    .filter(u => tenants.some(t => t.unit_id === u.id))
    .reduce((s, u) => s + (u.rent_amount || 0), 0);

  const stats = [
    { label: "Total properties",   value: loading ? "—" : properties.length,  sub: "in portfolio",              accent: C.gold },
    { label: "Total units",        value: loading ? "—" : totalUnits,          sub: `${totalOccupied} occupied`, accent: C.blue },
    { label: "Occupancy",          value: loading ? "—" : totalUnits > 0 ? `${Math.round((totalOccupied/totalUnits)*100)}%` : "—", sub: "across all properties", accent: C.green },
    { label: "Gross Rent Revenue", value: loading ? "—" : `$${grossRevenue.toLocaleString()}`, sub: "occupied units · monthly", accent: C.amber },
  ];

  return (
    <LandlordLayout openMaintenance={maintenance.length} unreadMessages={0}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        .m-prop-card:hover { border-color: #353A44 !important; }
        .m-row:hover td { background: ${C.raised} !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "20px 16px" : "28px 32px 48px" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 20 : 24, fontWeight: 600, color: C.text }}>Properties</div>
            <div style={{ fontSize: 13, color: C.textSub, marginTop: 3 }}>{loading ? "Loading…" : `${properties.length} properties · ${totalUnits} total units`}</div>
          </div>
          <PrimaryBtn onClick={() => setShowAddProp(true)}>+ Add property</PrimaryBtn>
        </div>

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 10, marginBottom: 24 }}>
          {stats.map((s, i) => (
            <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.accent }} />
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em" }}>{s.label}</div>
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 600, color: s.accent, lineHeight: 1, marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: C.textSub }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Property cards */}
        {loading ? (
          <div style={{ color: C.textSub, fontSize: 13 }}>Loading properties…</div>
        ) : properties.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: C.textSub, fontSize: 13, border: `1px dashed ${C.border}`, borderRadius: 10 }}>
            No properties yet. Click "+ Add property" to get started.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 12 }}>
            {properties.map((prop, i) => {
              const color    = PROP_COLORS[i % PROP_COLORS.length];
              const pUnits   = propUnitsFor(prop.id);
              const pTenants = propTenantsFor(prop.id);
              const pMaint   = propMaintFor(prop.id);
              const occupied = pTenants.length;
              const total    = pUnits.length;
              const occPct   = total > 0 ? Math.round((occupied / total) * 100) : 0;
              const collected = propCollectedFor(prop.id);
              return (
                <div key={prop.id} className="m-prop-card"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s" }}
                  onClick={() => { setSelected(prop.id); setDetailTab("Overview"); }}
                >
                  {/* Card top accent */}
                  <div style={{ height: 3, background: color }} />
                  <div style={{ padding: "16px 18px" }}>
                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, marginTop: 5, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{prop.name}</div>
                        <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{prop.address}</div>
                        <div style={{ fontSize: 11, color: C.textSub }}>{prop.city}, {prop.state} {prop.zip}</div>
                      </div>
                    </div>

                    {/* Occupancy bar */}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.textSub, marginBottom: 5 }}>
                      <span>{occupied}/{total} units occupied</span>
                      <span style={{ fontWeight: 600, color }}>{occPct}%</span>
                    </div>
                    <div style={{ height: 3, background: C.raised, borderRadius: 2, overflow: "hidden", marginBottom: 14 }}>
                      <div style={{ height: "100%", width: `${occPct}%`, background: color, borderRadius: 2 }} />
                    </div>

                    {/* Mini KPIs */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
                      {[
                        { label: "Collected",    value: `$${collected.toLocaleString()}`,       color },
                        { label: "Total units",  value: total,                                  color: C.text },
                        { label: "Open tickets", value: pMaint.length,                          color: pMaint.length > 0 ? C.amber : C.textSub },
                        { label: "Vacant",       value: total - occupied,                       color: total - occupied > 0 ? C.red : C.textSub },
                      ].map((k, j) => (
                        <div key={j} style={{ background: C.raised, borderRadius: 7, padding: "8px 10px", textAlign: "center" }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: k.color }}>{k.value}</div>
                          <div style={{ fontSize: 10, color: C.textSub, marginTop: 2 }}>{k.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Footer buttons */}
                    <div style={{ display: "flex", gap: 8, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                      <button onClick={e => { e.stopPropagation(); setSelected(prop.id); setDetailTab("Units"); }} style={{
                        flex: 1, padding: "7px 0", background: "transparent",
                        border: `1px solid ${C.goldDim}`, borderRadius: 6,
                        fontSize: 11, fontWeight: 500, color: C.gold, cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif", transition: "background 0.15s",
                      }}>View units</button>
                      <button onClick={e => { e.stopPropagation(); navigate("/landlord/maintenance"); }} style={{
                        flex: 1, padding: "7px 0", background: "transparent",
                        border: `1px solid ${C.border}`, borderRadius: 6,
                        fontSize: 11, fontWeight: 500, color: C.textSub, cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
                      }}>Maintenance</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Detail panel ── */}
      {prop && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", justifyContent: "flex-end" }} onClick={() => setSelected(null)}>
          <div style={{ width: 540, background: C.surface, height: "100vh", overflowY: "auto", borderLeft: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>

            {/* Panel header */}
            <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: propColor }} />
                  <div style={{ fontSize: 17, fontWeight: 600, color: C.text }}>{prop.name}</div>
                </div>
                <div style={{ fontSize: 12, color: C.textSub }}>{prop.address}, {prop.city} {prop.state} {prop.zip}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 13, color: C.textSub }}>✕</button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "0 24px" }}>
              {["Overview", "Units"].map(tab => (
                <button key={tab} onClick={() => setDetailTab(tab)} style={{
                  padding: "11px 16px", fontSize: 13, fontWeight: detailTab === tab ? 600 : 400,
                  color: detailTab === tab ? C.gold : C.textSub,
                  background: "none", border: "none",
                  borderBottom: detailTab === tab ? `2px solid ${C.gold}` : "2px solid transparent",
                  marginBottom: -1, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  transition: "color 0.15s",
                }}>{tab}</button>
              ))}
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Overview */}
              {detailTab === "Overview" && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Property Summary</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                    {[
                      ["Total units",  propUnitsFor(prop.id).length],
                      ["Occupied",     propTenantsFor(prop.id).length],
                      ["Vacant",       propUnitsFor(prop.id).length - propTenantsFor(prop.id).length],
                      ["Open tickets", propMaintFor(prop.id).length],
                      ["Collected",    `$${propCollectedFor(prop.id).toLocaleString()}`],
                      ["City",         `${prop.city}, ${prop.state}`],
                    ].map(([k, v]) => (
                      <div key={k} style={{ background: C.raised, borderRadius: 8, padding: "11px 14px" }}>
                        <div style={{ fontSize: 11, color: C.textSub, marginBottom: 4 }}>{k}</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <PrimaryBtn onClick={() => setDetailTab("Units")}>View units →</PrimaryBtn>
                    <GhostBtn onClick={() => navigate("/landlord/maintenance")}>View maintenance →</GhostBtn>
                  </div>
                </>
              )}

              {/* Units */}
              {detailTab === "Units" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      Unit roster — {propUnitsFor(prop.id).length} units
                    </div>
                    <PrimaryBtn onClick={() => setShowAddUnit(true)} small>+ Add unit</PrimaryBtn>
                  </div>
                  {unitRosterFor(prop.id).length === 0 ? (
                    <div style={{ textAlign: "center", padding: 32, color: C.textSub, fontSize: 13, border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                      No units yet — click "+ Add unit" to add one.
                    </div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          {["Unit", "Tenant", "Rent", "Status"].map(h => (
                            <th key={h} style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em", padding: "9px 12px", textAlign: "left", borderBottom: `1px solid ${C.border}`, background: C.raised }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {unitRosterFor(prop.id).map((u, i) => (
                          <tr key={i} className="m-row">
                            <td style={{ fontSize: 13, padding: "11px 12px", borderBottom: `1px solid ${C.border}`, color: C.text, fontWeight: 600 }}>{u.unit}</td>
                            <td style={{ fontSize: 13, padding: "11px 12px", borderBottom: `1px solid ${C.border}`, color: C.textSub }}>{u.tenant}</td>
                            <td style={{ fontSize: 13, padding: "11px 12px", borderBottom: `1px solid ${C.border}`, color: C.text, fontWeight: 600 }}>${(u.rent || 0).toLocaleString()}</td>
                            <td style={{ fontSize: 13, padding: "11px 12px", borderBottom: `1px solid ${C.border}` }}><Badge status={u.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showAddProp && <AddPropertyModal onClose={() => setShowAddProp(false)} onSaved={() => { setShowAddProp(false); fetchAll(); }} />}
      {showAddUnit && prop && <AddUnitModal propertyId={prop.id} onClose={() => setShowAddUnit(false)} onSaved={() => { setShowAddUnit(false); fetchAll(); }} />}
    </LandlordLayout>
  );
}