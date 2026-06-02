import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";

// ─── Modus tokens ──────────────────────────────────────────────────────────
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
  blue:      "#4A9AE8",
  green:     "#72B02A",
  red:       "#E05555",
  amber:     "#F0A430",
};

const STATUS = {
  current: { label: "Current", color: "#72B02A", bg: "rgba(114,176,42,0.13)" },
  pending: { label: "Pending", color: "#F0A430", bg: "rgba(240,164,48,0.13)" },
  late:    { label: "Late",    color: "#E05555", bg: "rgba(224,85,85,0.13)" },
  notice:  { label: "Notice",  color: "#C9A96E", bg: "rgba(201,169,110,0.13)" },
};

const AVATAR_COLORS = [C.gold, C.blue, C.green, C.amber, C.red];

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
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: cfg.bg, color: cfg.color, whiteSpace: "nowrap" }}>{cfg.label}</span>;
}

function FieldLabel({ children }) {
  return <label style={{ fontSize: 11, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 5 }}>{children}</label>;
}

function Input({ value, onChange, placeholder, type = "text" }) {
  const [focused, setFocused] = useState(false);
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{
        width: "100%", padding: "10px 12px", fontSize: 13,
        border: `1px solid ${focused ? C.gold : C.border}`,
        borderRadius: 7, background: C.raised, color: C.text,
        outline: "none", boxSizing: "border-box",
        fontFamily: "'DM Sans', sans-serif",
        boxShadow: focused ? "0 0 0 3px rgba(201,169,110,0.08)" : "none",
        transition: "border-color 0.15s",
      }}
    />
  );
}

function Select({ value, onChange, children, disabled }) {
  return (
    <select value={value} onChange={onChange} disabled={disabled} style={{
      width: "100%", padding: "10px 12px", fontSize: 13,
      border: `1px solid ${C.border}`, borderRadius: 7,
      background: C.raised, color: value ? C.text : C.textSub,
      outline: "none", boxSizing: "border-box",
      fontFamily: "'DM Sans', sans-serif", cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
    }}>{children}</select>
  );
}

function PrimaryBtn({ children, onClick, small }) {
  return (
    <button onClick={onClick} style={{
      background: "transparent", border: `1px solid ${C.goldDim}`,
      color: C.gold, fontSize: small ? 11 : 13, fontWeight: 500,
      padding: small ? "5px 10px" : "9px 18px", borderRadius: 7,
      cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
      letterSpacing: "0.04em", transition: "background 0.15s", whiteSpace: "nowrap",
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
      padding: small ? "5px 10px" : "9px 18px", borderRadius: 7,
      cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
      transition: "all 0.15s", whiteSpace: "nowrap",
    }}
      onMouseOver={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = "#353A44"; }}
      onMouseOut={e => { e.currentTarget.style.color = C.textSub; e.currentTarget.style.borderColor = C.border; }}
    >{children}</button>
  );
}

// ─── Add Tenant Modal ──────────────────────────────────────────────────────
function AddTenantModal({ properties, units, onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", property_id: "", unit_id: "", lease_start: "", lease_end: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const filteredUnits = units.filter(u => u.property_id === form.property_id);

  async function save() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.unit_id)     { setError("Please select a unit."); return; }
    setSaving(true);
    const { error } = await supabase.from("tenants").insert({
      name: form.name, email: form.email || null, phone: form.phone || null,
      unit_id: form.unit_id, lease_start: form.lease_start || null, lease_end: form.lease_end || null,
    });
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: 500, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Add tenant</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: C.textSub }}>✕</button>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {error && <div style={{ background: "rgba(224,85,85,0.1)", color: C.red, fontSize: 12, padding: "10px 12px", borderRadius: 7, marginBottom: 16, border: `1px solid rgba(224,85,85,0.2)` }}>{error}</div>}
          <div style={{ marginBottom: 14 }}><FieldLabel>Full name *</FieldLabel><Input value={form.name} onChange={e => update("name", e.target.value)} placeholder="e.g. James Wilson" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div><FieldLabel>Email</FieldLabel><Input type="email" value={form.email} onChange={e => update("email", e.target.value)} placeholder="james@email.com" /></div>
            <div><FieldLabel>Phone</FieldLabel><Input value={form.phone} onChange={e => update("phone", e.target.value)} placeholder="(216) 555-0101" /></div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Property *</FieldLabel>
            <Select value={form.property_id} onChange={e => update("property_id", e.target.value)}>
              <option value="">Select property…</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Unit *</FieldLabel>
            <Select value={form.unit_id} onChange={e => update("unit_id", e.target.value)} disabled={!form.property_id}>
              <option value="">Select unit…</option>
              {filteredUnits.map(u => <option key={u.id} value={u.id}>Unit {u.unit_number} — ${(u.rent_amount || 0).toLocaleString()}/mo</option>)}
            </Select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div><FieldLabel>Lease start</FieldLabel><Input type="date" value={form.lease_start} onChange={e => update("lease_start", e.target.value)} /></div>
            <div><FieldLabel>Lease end</FieldLabel><Input type="date" value={form.lease_end} onChange={e => update("lease_end", e.target.value)} /></div>
          </div>
        </div>
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={save}>{saving ? "Saving…" : "Add tenant"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function LandlordTenants() {
  const navigate = useNavigate();
  const width    = useWindowWidth();
  const isMobile = width < 768;

  const [tenants, setTenants]       = useState([]);
  const [units, setUnits]           = useState([]);
  const [properties, setProperties] = useState([]);
  const [payments, setPayments]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [propFilter, setPropFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortCol, setSortCol]       = useState("name");
  const [sortDir, setSortDir]       = useState("asc");
  const [showAdd, setShowAdd]       = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [
      { data: tenantsData },
      { data: unitsData },
      { data: propsData },
      { data: paymentsData },
    ] = await Promise.all([
      supabase.from("tenants").select("*"),
      supabase.from("units").select("*"),
      supabase.from("properties").select("*"),
      supabase.from("payments").select("*").order("created_at", { ascending: false }),
    ]);
    setTenants(tenantsData || []);
    setUnits(unitsData || []);
    setProperties(propsData || []);
    setPayments(paymentsData || []);
    setLoading(false);
  }

  const enriched = tenants.map((t, i) => {
    const unit      = units.find(u => u.id === t.unit_id);
    const property  = properties.find(p => p.id === unit?.property_id);
    const latestPay = payments.find(p => p.tenant_id === t.id);
    const accentColor = AVATAR_COLORS[i % AVATAR_COLORS.length];
    let status = "current";
    if (latestPay?.status === "failed") status = "late";
    else if (!latestPay || latestPay.status === "pending") status = "pending";
    const initials = t.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return {
      ...t,
      unit:        unit?.unit_number || "—",
      property:    property?.name || "—",
      property_id: property?.id,
      rent:        unit?.rent_amount || 0,
      status,
      lastPaid:    latestPay?.paid_at ? new Date(latestPay.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—",
      balance:     latestPay?.status !== "paid" ? (unit?.rent_amount || 0) : 0,
      initials,
      accentColor,
    };
  });

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  function SortIcon({ col }) {
    if (sortCol !== col) return <span style={{ color: C.textMuted, marginLeft: 3 }}>↕</span>;
    return <span style={{ color: C.gold, marginLeft: 3 }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const filtered = enriched.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
                        t.unit.toLowerCase().includes(search.toLowerCase()) ||
                        (t.email || "").toLowerCase().includes(search.toLowerCase());
    const matchProp   = propFilter === "all" || t.property_id === propFilter;
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchProp && matchStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    let aVal, bVal;
    if (sortCol === "name")     { aVal = a.name;    bVal = b.name; }
    if (sortCol === "property") { aVal = a.property + a.unit; bVal = b.property + b.unit; }
    if (sortCol === "rent")     { aVal = a.rent;    bVal = b.rent; }
    if (sortCol === "status")   { aVal = a.status;  bVal = b.status; }
    if (sortCol === "balance")  { aVal = a.balance; bVal = b.balance; }
    if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  const currentCount     = enriched.filter(t => t.status === "current").length;
  const outstandingCount = enriched.filter(t => t.status === "late" || t.status === "pending").length;

  async function inviteTenant(tenant) {
    if (!tenant.email) { alert("No email on file for this tenant."); return; }
    const { error } = await supabase.auth.signInWithOtp({
      email: tenant.email,
      options: { data: { tenant_id: tenant.id, role: "tenant" }, emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) alert("Failed to send invite: " + error.message);
    else alert(`Invite sent to ${tenant.email}`);
  }

  const stats = [
    { label: "Total tenants", value: loading ? "—" : tenants.length,    sub: "across all properties", accent: C.blue },
    { label: "Current",       value: loading ? "—" : currentCount,       sub: "paid & up to date",     accent: C.green },
    { label: "Outstanding",   value: loading ? "—" : outstandingCount,   sub: "need follow-up",        accent: C.red },
    { label: "Properties",    value: loading ? "—" : properties.length,  sub: "in portfolio",          accent: C.gold },
  ];

  return (
    <LandlordLayout openMaintenance={0} unreadMessages={0}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        .m-row:hover td { background: ${C.raised} !important; cursor: pointer; }
        .m-filter-pill:hover { color: ${C.text} !important; border-color: #353A44 !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "20px 16px" : "28px 32px 48px" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 20 : 24, fontWeight: 600, color: C.text }}>Tenants</div>
            <div style={{ fontSize: 13, color: C.textSub, marginTop: 3 }}>{loading ? "Loading…" : `${tenants.length} tenants across ${properties.length} properties`}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!isMobile && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 12px", width: 240 }}>
                <span style={{ color: C.textMuted, fontSize: 13 }}>⌕</span>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, unit, email…"
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 13, fontFamily: "'DM Sans', sans-serif", background: "transparent", color: C.text }} />
              </div>
            )}
            <PrimaryBtn onClick={() => setShowAdd(true)}>+ Add tenant</PrimaryBtn>
          </div>
        </div>

        {isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 12px", marginBottom: 16 }}>
            <span style={{ color: C.textMuted }}>⌕</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, unit, email…"
              style={{ flex: 1, border: "none", outline: "none", fontSize: 13, fontFamily: "'DM Sans', sans-serif", background: "transparent", color: C.text }} />
          </div>
        )}

        {/* Stats */}
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

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <select value={propFilter} onChange={e => setPropFilter(e.target.value)} style={{
            padding: "7px 12px", border: `1px solid ${C.border}`, borderRadius: 7,
            fontSize: 12, background: C.surface, color: C.textSub,
            outline: "none", fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
          }}>
            <option value="all">All Properties</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {["all", "current", "pending", "late"].map(f => (
            <button key={f} className="m-filter-pill" onClick={() => setStatusFilter(f)} style={{
              padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
              background: statusFilter === f ? C.goldDim : "transparent",
              color: statusFilter === f ? C.text : C.textSub,
              border: `1px solid ${statusFilter === f ? C.goldDim : C.border}`,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              textTransform: "capitalize", transition: "all 0.12s",
            }}>
              {f === "all" ? `All (${enriched.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${enriched.filter(t => t.status === f).length})`}
            </button>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 12, color: C.textMuted }}>{filtered.length} results</span>
        </div>

        {/* Table */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", overflowX: "auto" }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: C.textSub, fontSize: 13 }}>Loading tenants…</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[
                    { col: "name",     label: "Tenant",          always: true },
                    { col: "property", label: "Property · Unit",  always: false },
                    { col: "rent",     label: "Rent",             always: true,  right: true },
                    { col: "status",   label: "Status",           always: true },
                    { col: "balance",  label: "Balance",          always: false, right: true },
                    { col: null,       label: "Actions",          always: true },
                  ].filter(h => h.always || !isMobile).map(h => (
                    <th key={h.label}
                      onClick={h.col ? () => handleSort(h.col) : undefined}
                      style={{
                        fontSize: 10, fontWeight: 600, color: C.textSub,
                        textTransform: "uppercase", letterSpacing: "0.1em",
                        padding: "10px 16px", textAlign: h.right ? "right" : "left",
                        borderBottom: `1px solid ${C.border}`, background: C.raised,
                        cursor: h.col ? "pointer" : "default", whiteSpace: "nowrap",
                      }}>
                      {h.label}{h.col && <SortIcon col={h.col} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: C.textSub, fontSize: 13 }}>No tenants match your search.</td></tr>
                )}
                {sorted.map(t => (
                  <tr key={t.id} className="m-row" onClick={() => navigate(`/landlord/tenants/${t.id}`)}>
                    <td style={{ fontSize: 13, color: C.text, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: "50%",
                          background: `${t.accentColor}22`,
                          border: `1px solid ${t.accentColor}44`,
                          color: t.accentColor,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700, flexShrink: 0,
                        }}>{t.initials}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{t.name}</div>
                          <div style={{ fontSize: 11, color: C.textSub }}>{isMobile ? `${t.property} · Unit ${t.unit}` : (t.email || "—")}</div>
                        </div>
                      </div>
                    </td>
                    {!isMobile && (
                      <td style={{ fontSize: 13, color: C.text, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ fontWeight: 500 }}>{t.property}</div>
                        <div style={{ fontSize: 11, color: C.textSub }}>Unit {t.unit}</div>
                      </td>
                    )}
                    <td style={{ fontSize: 13, color: C.text, padding: "12px 16px", borderBottom: `1px solid ${C.border}`, textAlign: "right", fontWeight: 600 }}>
                      ${(t.rent || 0).toLocaleString()}
                    </td>
                    <td style={{ fontSize: 13, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
                      <Badge status={t.status} />
                    </td>
                    {!isMobile && (
                      <td style={{ fontSize: 13, padding: "12px 16px", borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>
                        <span style={{ fontWeight: 600, color: t.balance > 0 ? C.red : C.green }}>
                          {t.balance > 0 ? `-$${t.balance.toLocaleString()}` : "✓ $0"}
                        </span>
                      </td>
                    )}
                    <td style={{ fontSize: 13, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}
                      onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <PrimaryBtn small onClick={() => navigate(`/landlord/tenants/${t.id}`)}>View</PrimaryBtn>
                        {!isMobile && <GhostBtn small onClick={() => navigate("/landlord/messages", { state: { tenantId: t.id } })}>Message</GhostBtn>}
                        {!t.user_id && <GhostBtn small onClick={() => inviteTenant(t)}>Invite</GhostBtn>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showAdd && (
        <AddTenantModal
          properties={properties}
          units={units}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); fetchAll(); }}
        />
      )}
    </LandlordLayout>
  );
}