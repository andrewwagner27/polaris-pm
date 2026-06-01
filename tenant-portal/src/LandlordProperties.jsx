import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

const STATUS_CONFIG = {
  paid:    { label: "Paid",    color: "#3B6D11", bg: "#EAF3DE" },
  pending: { label: "Pending", color: "#854F0B", bg: "#FAEEDA" },
  late:    { label: "Late",    color: "#A32D2D", bg: "#FDECEA" },
  vacant:  { label: "Vacant",  color: "#888",    bg: "#f4f5f7" },
};

const PROP_COLORS = ["#0C447C","#3B6D11","#854F0B","#6B3FA0","#185FA5"];
const PROP_BGS    = ["#E6F1FB","#EAF3DE","#FAEEDA","#F0E6FB","#E6F1FB"];
const PROP_ICONS  = ["🏢","🏖️","🏗️","🏠","🏘️"];

const NAV_ITEMS = [
  { icon: "📊", label: "Dashboard",   route: "/landlord" },
  { icon: "🏢", label: "Properties",  route: "/landlord/properties" },
  { icon: "👥", label: "Tenants",     route: "/landlord/tenants" },
  { icon: "📋", label: "Reports", route: "/landlord/rentroll" },
  { icon: "🔧", label: "Maintenance", route: "/landlord/maintenance" },
  { icon: "📈", label: "Financials",  route: "/landlord/financials" },
  { icon: "💬", label: "Messages",    route: "/landlord/messages" },
  { icon: "⚙️", label: "Settings",   route: "/landlord/settings" },
];

const s = {
  app: { display: "flex", fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: 14, color: "#1a1a1a", background: "#f4f5f7", minHeight: "100vh" },
  sidebar: { width: 220, background: "#0C1F3F", minHeight: "100vh", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh" },
  sidebarLogo: { padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 8 },
  logoText: { fontSize: 15, fontWeight: 700, color: "#fff" },
  logoSub: { fontSize: 10, color: "#5B7FA6", marginTop: 2 },
  navItem: (active) => ({ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: active ? "rgba(255,255,255,0.1)" : "transparent", borderLeft: active ? "3px solid #378ADD" : "3px solid transparent", cursor: "pointer", color: active ? "#fff" : "#7A9CC4", fontSize: 13, fontWeight: active ? 600 : 400 }),
  sidebarFooter: { marginTop: "auto", padding: "16px", borderTop: "1px solid rgba(255,255,255,0.08)" },
  sidebarUser: { display: "flex", alignItems: "center", gap: 10 },
  sidebarAvatar: { width: 32, height: 32, borderRadius: "50%", background: "#185FA5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 },
  sidebarName: { fontSize: 12, fontWeight: 600, color: "#fff" },
  sidebarRole: { fontSize: 10, color: "#5B7FA6" },
  main: { flex: 1, padding: "28px", overflowY: "auto" },
  topBar: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  pageTitle: { fontSize: 22, fontWeight: 700 },
  pageSub: { fontSize: 13, color: "#888", marginTop: 2 },
  btn: (primary) => ({ padding: "9px 16px", background: primary ? "#0C447C" : "#fff", color: primary ? "#fff" : "#1a1a1a", border: primary ? "none" : "1px solid #e8eaed", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", gap: 6 }),
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 28 },
  kpiCard: (accent) => ({ background: "#fff", border: "1px solid #e8eaed", borderRadius: 10, padding: "14px 16px", borderTop: `3px solid ${accent}` }),
  kpiLabel: { fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 },
  kpiValue: { fontSize: 26, fontWeight: 700, color: "#1a1a1a" },
  kpiSub: { fontSize: 11, color: "#888", marginTop: 2 },
  propGrid: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20, marginBottom: 24 },
  propCard: (color) => ({ background: "#fff", border: "1px solid #e8eaed", borderRadius: 14, overflow: "hidden", cursor: "pointer", transition: "box-shadow 0.15s", borderTop: `3px solid ${color}` }),
  propCardHeader: (bg) => ({ background: bg, padding: "18px 18px 14px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }),
  propName: (color) => ({ fontSize: 15, fontWeight: 700, color }),
  propAddr: { fontSize: 12, color: "#555", marginTop: 2 },
  propBody: { padding: "14px 18px 16px" },
  occupancyRow: { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", marginBottom: 5 },
  occupancyBar: { height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden", marginBottom: 14 },
  occupancyFill: (pct, color) => ({ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }),
  kpiGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 },
  miniKpi: (bg) => ({ background: bg, borderRadius: 8, padding: "9px 10px", textAlign: "center" }),
  propFooter: { display: "flex", gap: 8, paddingTop: 12, borderTop: "1px solid #f4f5f7" },
  propBtn: { flex: 1, padding: "7px 0", background: "#f8f9fa", border: "1px solid #e8eaed", borderRadius: 8, fontSize: 11, fontWeight: 600, color: "#555", cursor: "pointer", fontFamily: "'Inter',sans-serif", textAlign: "center" },
  propBtnPrimary: { flex: 1, padding: "7px 0", background: "#E6F1FB", border: "1px solid #B5D4F4", borderRadius: 8, fontSize: 11, fontWeight: 600, color: "#185FA5", cursor: "pointer", fontFamily: "'Inter',sans-serif", textAlign: "center" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", justifyContent: "flex-end" },
  detailPanel: { width: 560, background: "#fff", height: "100vh", overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.15)" },
  detailHeader: (bg) => ({ background: bg, padding: "20px 24px 18px" }),
  detailName: (color) => ({ fontSize: 20, fontWeight: 700, color, marginBottom: 3 }),
  detailAddr: { fontSize: 13, color: "#555", marginBottom: 10 },
  detailBody: { padding: "20px 24px" },
  tabs: { display: "flex", borderBottom: "2px solid #e8eaed", marginBottom: 20 },
  tab: (active) => ({ padding: "9px 16px", fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#0C447C" : "#888", cursor: "pointer", background: "none", border: "none", borderBottom: active ? "2px solid #0C447C" : "2px solid transparent", marginBottom: -2, fontFamily: "'Inter',sans-serif" }),
  sectionTitle: { fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 },
  infoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 },
  infoBox: { background: "#f8f9fa", borderRadius: 8, padding: "10px 12px" },
  infoBoxLabel: { fontSize: 11, color: "#888", marginBottom: 3 },
  infoBoxVal: { fontSize: 14, fontWeight: 700, color: "#1a1a1a" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #f0f0f0", background: "#fafafa" },
  td: { fontSize: 13, padding: "10px 12px", borderBottom: "1px solid #f8f9fa", color: "#1a1a1a" },
  statusBadge: (status) => ({ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: STATUS_CONFIG[status]?.bg || "#f4f5f7", color: STATUS_CONFIG[status]?.color || "#888" }),
  // Modal
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: "#fff", borderRadius: 14, width: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" },
  modalHeader: { padding: "20px 24px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 16, fontWeight: 700 },
  modalBody: { padding: "20px 24px" },
  modalFooter: { padding: "16px 24px", borderTop: "1px solid #f0f0f0", display: "flex", gap: 10, justifyContent: "flex-end" },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 },
  input: { width: "100%", padding: "10px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", outline: "none", boxSizing: "border-box", fontFamily: "'Inter',sans-serif" },
  twoInputRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
};

// ── Add Property Modal ────────────────────────────────────────────────────────
function AddPropertyModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", address: "", city: "", state: "", zip: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.name.trim() || !form.address.trim()) { setError("Name and address are required."); return; }
    setSaving(true);
    const { error } = await supabase.from("properties").insert({
      name: form.name,
      address: form.address,
      city: form.city,
      state: form.state,
      zip: form.zip,
    });
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved();
  }

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <div style={s.modalTitle}>Add property</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#888" }}>✕</button>
        </div>
        <div style={s.modalBody}>
          {error && <div style={{ background: "#FDECEA", color: "#A32D2D", fontSize: 12, padding: "10px 12px", borderRadius: 8, marginBottom: 16 }}>{error}</div>}
          <div style={s.fieldWrap}>
            <label style={s.fieldLabel}>Property name *</label>
            <input style={s.input} placeholder="e.g. Clifton Manor" value={form.name} onChange={e => update("name", e.target.value)} />
          </div>
          <div style={s.fieldWrap}>
            <label style={s.fieldLabel}>Street address *</label>
            <input style={s.input} placeholder="e.g. 12009 Clifton Blvd" value={form.address} onChange={e => update("address", e.target.value)} />
          </div>
          <div style={{ ...s.twoInputRow, marginBottom: 16 }}>
            <div>
              <label style={s.fieldLabel}>City</label>
              <input style={s.input} placeholder="Lakewood" value={form.city} onChange={e => update("city", e.target.value)} />
            </div>
            <div>
              <label style={s.fieldLabel}>State</label>
              <input style={s.input} placeholder="OH" value={form.state} onChange={e => update("state", e.target.value)} maxLength={2} />
            </div>
          </div>
          <div style={s.fieldWrap}>
            <label style={s.fieldLabel}>ZIP code</label>
            <input style={s.input} placeholder="44107" value={form.zip} onChange={e => update("zip", e.target.value)} maxLength={10} />
          </div>
        </div>
        <div style={s.modalFooter}>
          <button style={s.btn(false)} onClick={onClose}>Cancel</button>
          <button style={s.btn(true)} onClick={save} disabled={saving}>{saving ? "Saving…" : "Add property"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Add Unit Modal ────────────────────────────────────────────────────────────
function AddUnitModal({ propertyId, onClose, onSaved }) {
  const [form, setForm] = useState({ unit_number: "", bedrooms: "", bathrooms: "", rent_amount: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update(k, v) { setForm(f => ({ ...f, [k]: v })); }

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
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <div style={s.modalTitle}>Add unit</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#888" }}>✕</button>
        </div>
        <div style={s.modalBody}>
          {error && <div style={{ background: "#FDECEA", color: "#A32D2D", fontSize: 12, padding: "10px 12px", borderRadius: 8, marginBottom: 16 }}>{error}</div>}
          <div style={s.fieldWrap}>
            <label style={s.fieldLabel}>Unit number *</label>
            <input style={s.input} placeholder="e.g. 1A, 2B, Main" value={form.unit_number} onChange={e => update("unit_number", e.target.value)} />
          </div>
          <div style={{ ...s.twoInputRow, marginBottom: 16 }}>
            <div>
              <label style={s.fieldLabel}>Bedrooms</label>
              <input style={s.input} type="number" placeholder="2" value={form.bedrooms} onChange={e => update("bedrooms", e.target.value)} />
            </div>
            <div>
              <label style={s.fieldLabel}>Bathrooms</label>
              <input style={s.input} type="number" placeholder="1" value={form.bathrooms} onChange={e => update("bathrooms", e.target.value)} />
            </div>
          </div>
          <div style={s.fieldWrap}>
            <label style={s.fieldLabel}>Monthly rent ($)</label>
            <input style={s.input} type="number" placeholder="1250" value={form.rent_amount} onChange={e => update("rent_amount", e.target.value)} />
          </div>
        </div>
        <div style={s.modalFooter}>
          <button style={s.btn(false)} onClick={onClose}>Cancel</button>
          <button style={s.btn(true)} onClick={save} disabled={saving}>{saving ? "Saving…" : "Add unit"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LandlordProperties() {
  const navigate = useNavigate();
  const [properties, setProperties]       = useState([]);
  const [units, setUnits]                 = useState([]);
  const [tenants, setTenants]             = useState([]);
  const [payments, setPayments]           = useState([]);
  const [maintenance, setMaintenance]     = useState([]);
  const [loading, setLoading]             = useState(true);
  const [selected, setSelected]           = useState(null);
  const [detailTab, setDetailTab]         = useState("Overview");
  const [showAddProp, setShowAddProp]     = useState(false);
  const [showAddUnit, setShowAddUnit]     = useState(false);

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
      supabase.from("maintenance_requests").select("*").neq("status", "resolved"),
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

  const prop     = selected ? properties.find(p => p.id === selected) : null;
  const propIdx  = prop ? properties.indexOf(prop) : 0;
  const propColor = PROP_COLORS[propIdx % PROP_COLORS.length];
  const propBg    = PROP_BGS[propIdx % PROP_BGS.length];

  function propUnitsFor(propId) { return units.filter(u => u.property_id === propId); }
  function propTenantsFor(propId) { return tenants.filter(t => propUnitsFor(propId).some(u => u.id === t.unit_id)); }
  function propMaintFor(propId) { return maintenance.filter(m => propUnitsFor(propId).some(u => u.id === m.unit_id)); }
  function propCollectedFor(propId) {
    const propUnitIds = propUnitsFor(propId).map(u => u.id);
    return payments.filter(p => propUnitIds.includes(p.unit_id) && p.status === "paid").reduce((s, p) => s + (p.amount_cents || 0), 0) / 100;
  }

  // Unit roster for detail panel
  function unitRosterFor(propId) {
    return propUnitsFor(propId).map(unit => {
      const tenant = tenants.find(t => t.unit_id === unit.id);
      const latestPayment = payments.find(p => p.unit_id === unit.id);
      let status = "vacant";
      if (tenant) {
        status = latestPayment?.status === "paid" ? "paid" : latestPayment?.status === "failed" ? "late" : "pending";
      }
      return { id: unit.id, unit: unit.unit_number, tenant: tenant?.name || "—", rent: unit.rent_amount || 0, status, bedrooms: unit.bedrooms, bathrooms: unit.bathrooms };
    });
  }

  return (
    <div style={s.app}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }`}</style>

      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.sidebarLogo}>
          <div style={s.logoText}>🏢 Polaris PM</div>
          <div style={s.logoSub}>Property Management</div>
        </div>
        {NAV_ITEMS.map(item => (
          <div key={item.route} style={s.navItem(item.label === "Properties")} onClick={() => navigate(item.route)}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>{item.label}
          </div>
        ))}
        <div style={s.sidebarFooter}>
          <div style={s.sidebarUser}>
            <div style={s.sidebarAvatar}>AW</div>
            <div><div style={s.sidebarName}>Andrew Wagner</div><div style={s.sidebarRole}>Portfolio Owner</div></div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={s.main}>
        <div style={s.topBar}>
          <div>
            <div style={s.pageTitle}>Properties</div>
            <div style={s.pageSub}>{loading ? "Loading…" : `${properties.length} properties · ${totalUnits} total units`}</div>
          </div>
          <button style={s.btn(true)} onClick={() => setShowAddProp(true)}>+ Add property</button>
        </div>

        {/* KPI row */}
        <div style={s.kpiRow}>
          {[
            { label: "Total properties", value: loading ? "—" : properties.length,  sub: "in portfolio",          accent: "#0C447C" },
            { label: "Total units",       value: loading ? "—" : totalUnits,          sub: `${totalOccupied} occupied`, accent: "#185FA5" },
            { label: "Occupancy",         value: loading ? "—" : totalUnits > 0 ? `${Math.round((totalOccupied/totalUnits)*100)}%` : "—", sub: "across all properties", accent: "#3B6D11" },
            { label: "Open maintenance",  value: loading ? "—" : maintenance.length,  sub: "active tickets",       accent: "#854F0B" },
          ].map((k, i) => (
            <div key={i} style={s.kpiCard(k.accent)}>
              <div style={s.kpiLabel}>{k.label}</div>
              <div style={s.kpiValue}>{k.value}</div>
              <div style={s.kpiSub}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Property cards */}
        {loading ? (
          <div style={{ color: "#888", fontSize: 13 }}>Loading properties…</div>
        ) : (
          <div style={s.propGrid}>
            {properties.map((prop, i) => {
              const color    = PROP_COLORS[i % PROP_COLORS.length];
              const bg       = PROP_BGS[i % PROP_BGS.length];
              const icon     = PROP_ICONS[i % PROP_ICONS.length];
              const pUnits   = propUnitsFor(prop.id);
              const pTenants = propTenantsFor(prop.id);
              const pMaint   = propMaintFor(prop.id);
              const occupied = pTenants.length;
              const total    = pUnits.length;
              const occPct   = total > 0 ? Math.round((occupied / total) * 100) : 0;
              const collected = propCollectedFor(prop.id);
              return (
                <div key={prop.id} style={s.propCard(color)} onClick={() => { setSelected(prop.id); setDetailTab("Overview"); }}>
                  <div style={s.propCardHeader(bg)}>
                    <div>
                      <div style={s.propName(color)}>{prop.name}</div>
                      <div style={s.propAddr}>{prop.address}</div>
                      <div style={s.propAddr}>{prop.city}, {prop.state} {prop.zip}</div>
                    </div>
                    <span style={{ fontSize: 32 }}>{icon}</span>
                  </div>
                  <div style={s.propBody}>
                    <div style={s.occupancyRow}>
                      <span>{occupied}/{total} units occupied</span>
                      <span style={{ fontWeight: 600, color }}>{occPct}%</span>
                    </div>
                    <div style={s.occupancyBar}>
                      <div style={s.occupancyFill(occPct, color)} />
                    </div>
                    <div style={s.kpiGrid}>
                      <div style={s.miniKpi(bg)}>
                        <div style={{ fontSize: 16, fontWeight: 700, color }}>${collected.toLocaleString()}</div>
                        <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>Collected</div>
                      </div>
                      <div style={s.miniKpi("#f8f9fa")}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>{total}</div>
                        <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>Total units</div>
                      </div>
                      <div style={s.miniKpi(pMaint.length > 0 ? "#FAEEDA" : "#EAF3DE")}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: pMaint.length > 0 ? "#854F0B" : "#3B6D11" }}>{pMaint.length}</div>
                        <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>Open tickets</div>
                      </div>
                      <div style={s.miniKpi("#f8f9fa")}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>{total - occupied}</div>
                        <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>Vacant</div>
                      </div>
                    </div>
                    <div style={s.propFooter}>
                      <button style={s.propBtnPrimary} onClick={e => { e.stopPropagation(); setSelected(prop.id); setDetailTab("Units"); }}>View units</button>
                      <button style={s.propBtn} onClick={e => { e.stopPropagation(); navigate("/landlord/maintenance"); }}>Maintenance</button>
                    </div>
                  </div>
                </div>
              );
            })}
            {properties.length === 0 && (
              <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 40, color: "#888", fontSize: 13 }}>
                No properties yet. Click "+ Add property" to get started.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {prop && (
        <div style={s.overlay} onClick={() => setSelected(null)}>
          <div style={s.detailPanel} onClick={e => e.stopPropagation()}>
            <div style={s.detailHeader(propBg)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={s.detailName(propColor)}>{PROP_ICONS[propIdx % PROP_ICONS.length]} {prop.name}</div>
                  <div style={s.detailAddr}>{prop.address}, {prop.city} {prop.state} {prop.zip}</div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: "rgba(0,0,0,0.1)", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 13, color: "#555" }}>✕</button>
              </div>
            </div>
            <div style={s.detailBody}>
              <div style={s.tabs}>
                {["Overview", "Units"].map(tab => (
                  <button key={tab} style={s.tab(detailTab === tab)} onClick={() => setDetailTab(tab)}>{tab}</button>
                ))}
              </div>

              {/* Overview */}
              {detailTab === "Overview" && (
                <>
                  <div style={s.sectionTitle}>Property summary</div>
                  <div style={s.infoGrid}>
                    {[
                      ["Total units",   propUnitsFor(prop.id).length],
                      ["Occupied",      propTenantsFor(prop.id).length],
                      ["Vacant",        propUnitsFor(prop.id).length - propTenantsFor(prop.id).length],
                      ["Open tickets",  propMaintFor(prop.id).length],
                      ["Collected",     `$${propCollectedFor(prop.id).toLocaleString()}`],
                      ["City",          `${prop.city}, ${prop.state}`],
                    ].map(([k, v]) => (
                      <div key={k} style={s.infoBox}>
                        <div style={s.infoBoxLabel}>{k}</div>
                        <div style={s.infoBoxVal}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={{ ...s.btn(true), flex: 1, justifyContent: "center" }} onClick={() => setDetailTab("Units")}>View units →</button>
                    <button style={{ ...s.btn(false), flex: 1, justifyContent: "center" }} onClick={() => navigate("/landlord/maintenance")}>View maintenance →</button>
                  </div>
                </>
              )}

              {/* Units */}
              {detailTab === "Units" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={s.sectionTitle}>Unit roster — {propUnitsFor(prop.id).length} units</div>
                    <button style={{ ...s.btn(true), padding: "6px 12px", fontSize: 11 }} onClick={() => setShowAddUnit(true)}>+ Add unit</button>
                  </div>
                  {unitRosterFor(prop.id).length === 0 ? (
                    <div style={{ textAlign: "center", padding: "30px", color: "#aaa", fontSize: 13 }}>No units yet — click "+ Add unit" to add one.</div>
                  ) : (
                    <table style={s.table}>
                      <thead>
                        <tr>
                          {["Unit", "Tenant", "Rent", "Status"].map(h => (
                            <th key={h} style={s.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {unitRosterFor(prop.id).map((u, i) => (
                          <tr key={i}>
                            <td style={{ ...s.td, fontWeight: 600 }}>{u.unit}</td>
                            <td style={s.td}>{u.tenant}</td>
                            <td style={{ ...s.td, fontWeight: 600 }}>${(u.rent || 0).toLocaleString()}</td>
                            <td style={s.td}><span style={s.statusBadge(u.status)}>{STATUS_CONFIG[u.status]?.label}</span></td>
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

      {/* Add Property Modal */}
      {showAddProp && (
        <AddPropertyModal
          onClose={() => setShowAddProp(false)}
          onSaved={() => { setShowAddProp(false); fetchAll(); }}
        />
      )}

      {/* Add Unit Modal */}
      {showAddUnit && prop && (
        <AddUnitModal
          propertyId={prop.id}
          onClose={() => setShowAddUnit(false)}
          onSaved={() => { setShowAddUnit(false); fetchAll(); }}
        />
      )}
    </div>
  );
}