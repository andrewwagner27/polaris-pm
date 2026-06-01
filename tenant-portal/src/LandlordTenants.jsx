import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

const STATUS_CONFIG = {
  current: { label: "Current", color: "#3B6D11", bg: "#EAF3DE" },
  pending: { label: "Pending", color: "#854F0B", bg: "#FAEEDA" },
  late:    { label: "Late",    color: "#A32D2D", bg: "#FDECEA" },
  notice:  { label: "Notice",  color: "#6B3FA0", bg: "#F3EEFB" },
};

const AVATAR_COLORS = [
  { color: "#185FA5", bg: "#E6F1FB" },
  { color: "#3B6D11", bg: "#EAF3DE" },
  { color: "#854F0B", bg: "#FAEEDA" },
  { color: "#A32D2D", bg: "#FDECEA" },
  { color: "#6B3FA0", bg: "#F3EEFB" },
];

const NAV_ITEMS = [
  { icon: "📊", label: "Dashboard",   id: "dashboard",   route: "/landlord" },
  { icon: "🏢", label: "Properties",  id: "properties",  route: "/landlord/properties" },
  { icon: "👥", label: "Tenants",     id: "tenants",     route: "/landlord/tenants" },
  { icon: "💰", label: "Rent Roll",   id: "rentroll",    route: "/landlord/rentroll" },
  { icon: "🔧", label: "Maintenance", id: "maintenance", route: "/landlord/maintenance" },
  { icon: "📈", label: "Financials",  id: "financials",  route: "/landlord/financials" },
  { icon: "💬", label: "Messages",    id: "messages",    route: "/landlord/messages" },
  { icon: "⚙️", label: "Settings",   id: "settings",    route: "/landlord/settings" },
];

const s = {
  app: { display: "flex", fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: 14, color: "#1a1a1a", background: "#f4f5f7", minHeight: "100vh" },
  sidebar: { width: 220, background: "#0C1F3F", minHeight: "100vh", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto" },
  sidebarLogo: { padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 8 },
  logoText: { fontSize: 15, fontWeight: 700, color: "#fff" },
  logoSub: { fontSize: 10, color: "#5B7FA6", marginTop: 2 },
  navItem: (active) => ({ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: active ? "rgba(255,255,255,0.1)" : "transparent", borderLeft: active ? "3px solid #378ADD" : "3px solid transparent", cursor: "pointer", color: active ? "#fff" : "#7A9CC4", fontSize: 13, fontWeight: active ? 600 : 400 }),
  navIcon: { fontSize: 16, flexShrink: 0 },
  sidebarFooter: { marginTop: "auto", padding: "16px", borderTop: "1px solid rgba(255,255,255,0.08)" },
  sidebarUser: { display: "flex", alignItems: "center", gap: 10 },
  sidebarAvatar: { width: 32, height: 32, borderRadius: "50%", background: "#185FA5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  sidebarName: { fontSize: 12, fontWeight: 600, color: "#fff" },
  sidebarRole: { fontSize: 10, color: "#5B7FA6" },
  main: { flex: 1, padding: "28px", overflowY: "auto" },
  topBar: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  pageTitle: { fontSize: 22, fontWeight: 700 },
  pageSub: { fontSize: 13, color: "#888", marginTop: 2 },
  topBarRight: { display: "flex", alignItems: "center", gap: 10 },
  addBtn: { padding: "9px 16px", background: "#0C447C", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "'Inter',sans-serif" },
  searchBar: { display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e8eaed", borderRadius: 8, padding: "8px 12px", width: 240 },
  searchInput: { flex: 1, border: "none", outline: "none", fontSize: 13, fontFamily: "'Inter',sans-serif", background: "transparent" },
  filterRow: { display: "flex", gap: 8, marginBottom: 20, alignItems: "center", flexWrap: "wrap" },
  filterSelect: { padding: "8px 12px", border: "1px solid #e8eaed", borderRadius: 8, fontSize: 13, background: "#fff", outline: "none", fontFamily: "'Inter',sans-serif", cursor: "pointer" },
  statRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 },
  statCard: (accent) => ({ background: "#fff", border: "1px solid #e8eaed", borderRadius: 10, padding: "14px 16px", borderTop: `3px solid ${accent}` }),
  statLabel: { fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 },
  statValue: { fontSize: 24, fontWeight: 700, color: "#1a1a1a" },
  statSub: { fontSize: 11, color: "#888", marginTop: 2 },
  card: { background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", padding: "10px 16px", textAlign: "left", borderBottom: "1px solid #f0f0f0", background: "#fafafa", whiteSpace: "nowrap" },
  td: { fontSize: 13, color: "#1a1a1a", padding: "12px 16px", borderBottom: "1px solid #f8f9fa", verticalAlign: "middle" },
  avatar: (color, bg) => ({ width: 34, height: 34, borderRadius: "50%", background: bg, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }),
  statusBadge: (status) => ({ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: STATUS_CONFIG[status]?.bg || "#f4f5f7", color: STATUS_CONFIG[status]?.color || "#555", whiteSpace: "nowrap" }),
  actionBtn: { padding: "5px 10px", background: "#f4f5f7", border: "1px solid #e8eaed", borderRadius: 6, fontSize: 11, fontWeight: 600, color: "#555", cursor: "pointer", fontFamily: "'Inter',sans-serif" },
  actionBtnPrimary: { padding: "5px 10px", background: "#E6F1FB", border: "1px solid #B5D4F4", borderRadius: 6, fontSize: 11, fontWeight: 600, color: "#185FA5", cursor: "pointer", fontFamily: "'Inter',sans-serif" },
  // Modal
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: "#fff", borderRadius: 14, width: 500, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" },
  modalHeader: { padding: "20px 24px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 16, fontWeight: 700 },
  modalBody: { padding: "20px 24px" },
  modalFooter: { padding: "16px 24px", borderTop: "1px solid #f0f0f0", display: "flex", gap: 10, justifyContent: "flex-end" },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 },
  input: { width: "100%", padding: "10px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", outline: "none", boxSizing: "border-box", fontFamily: "'Inter',sans-serif", color: "#1a1a1a" },
select: { width: "100%", padding: "10px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", outline: "none", boxSizing: "border-box", fontFamily: "'Inter',sans-serif", color: "#1a1a1a" },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  btn: (primary) => ({ padding: "9px 16px", background: primary ? "#0C447C" : "#fff", color: primary ? "#fff" : "#1a1a1a", border: primary ? "none" : "1px solid #e8eaed", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }),
};

// ── Add Tenant Modal ──────────────────────────────────────────────────────────
function AddTenantModal({ properties, units, onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", property_id: "", unit_id: "", lease_start: "", lease_end: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const filteredUnits = units.filter(u => u.property_id === form.property_id);

  async function save() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.unit_id)     { setError("Please select a unit."); return; }
    setSaving(true);

    const { error } = await supabase.from("tenants").insert({
      name:        form.name,
      email:       form.email || null,
      phone:       form.phone || null,
      unit_id:     form.unit_id,
      lease_start: form.lease_start || null,
      lease_end:   form.lease_end   || null,
    });

    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved();
  }

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <div style={s.modalTitle}>Add tenant</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#888" }}>✕</button>
        </div>
        <div style={s.modalBody}>
          {error && <div style={{ background: "#FDECEA", color: "#A32D2D", fontSize: 12, padding: "10px 12px", borderRadius: 8, marginBottom: 16 }}>{error}</div>}

          <div style={s.fieldWrap}>
            <label style={s.fieldLabel}>Full name *</label>
            <input style={s.input} placeholder="e.g. James Wilson" value={form.name} onChange={e => update("name", e.target.value)} />
          </div>

          <div style={{ ...s.twoCol, marginBottom: 16 }}>
            <div>
              <label style={s.fieldLabel}>Email</label>
              <input style={s.input} type="email" placeholder="james@email.com" value={form.email} onChange={e => update("email", e.target.value)} />
            </div>
            <div>
              <label style={s.fieldLabel}>Phone</label>
              <input style={s.input} placeholder="(216) 555-0101" value={form.phone} onChange={e => update("phone", e.target.value)} />
            </div>
          </div>

          <div style={s.fieldWrap}>
            <label style={s.fieldLabel}>Property *</label>
            <select style={s.select} value={form.property_id} onChange={e => update("property_id", e.target.value)}>
              <option value="">Select property…</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div style={s.fieldWrap}>
            <label style={s.fieldLabel}>Unit *</label>
            <select style={s.select} value={form.unit_id} onChange={e => update("unit_id", e.target.value)} disabled={!form.property_id}>
              <option value="">Select unit…</option>
              {filteredUnits.map(u => <option key={u.id} value={u.id}>Unit {u.unit_number} — ${(u.rent_amount || 0).toLocaleString()}/mo</option>)}
            </select>
          </div>

          <div style={{ ...s.twoCol, marginBottom: 16 }}>
            <div>
              <label style={s.fieldLabel}>Lease start</label>
              <input style={s.input} type="date" value={form.lease_start} onChange={e => update("lease_start", e.target.value)} />
            </div>
            <div>
              <label style={s.fieldLabel}>Lease end</label>
              <input style={s.input} type="date" value={form.lease_end} onChange={e => update("lease_end", e.target.value)} />
            </div>
          </div>
        </div>
        <div style={s.modalFooter}>
          <button style={s.btn(false)} onClick={onClose}>Cancel</button>
          <button style={s.btn(true)} onClick={save} disabled={saving}>{saving ? "Saving…" : "Add tenant"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LandlordTenants() {
  const navigate = useNavigate();
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

  // Enrich tenants with unit/property/payment data
  const enriched = tenants.map((t, i) => {
    const unit     = units.find(u => u.id === t.unit_id);
    const property = properties.find(p => p.id === unit?.property_id);
    const latestPay = payments.find(p => p.tenant_id === t.id);
    const ac = AVATAR_COLORS[i % AVATAR_COLORS.length];

    let status = "current";
    if (latestPay?.status === "failed") status = "late";
    else if (!latestPay || latestPay.status === "pending") status = "pending";

    const initials = t.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

    return {
      ...t,
      unit:         unit?.unit_number || "—",
      unit_id:      unit?.id,
      property:     property?.name || "—",
      property_id:  property?.id,
      rent:         unit?.rent_amount || 0,
      status,
      lastPaid:     latestPay?.paid_at ? new Date(latestPay.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—",
      balance:      latestPay?.status !== "paid" ? (unit?.rent_amount || 0) : 0,
      initials,
      color:        ac.color,
      bg:           ac.bg,
    };
  });

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  function sortIcon(col) {
    if (sortCol !== col) return <span style={{ color: "#ccc", marginLeft: 3 }}>↕</span>;
    return <span style={{ color: "#185FA5", marginLeft: 3 }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
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
    if (sortCol === "name")     { aVal = a.name;     bVal = b.name; }
    if (sortCol === "property") { aVal = a.property + a.unit; bVal = b.property + b.unit; }
    if (sortCol === "rent")     { aVal = a.rent;     bVal = b.rent; }
    if (sortCol === "status")   { aVal = a.status;   bVal = b.status; }
    if (sortCol === "balance")  { aVal = a.balance;  bVal = b.balance; }
    if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  const currentCount = enriched.filter(t => t.status === "current").length;
  const outstandingCount = enriched.filter(t => t.status === "late" || t.status === "pending").length;

async function inviteTenant(tenant) {
  if (!tenant.email) { alert("No email on file for this tenant."); return; }
  const { error } = await supabase.auth.signInWithOtp({
    email: tenant.email,
    options: {
      data: { tenant_id: tenant.id, role: "tenant" },
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    }
  });
  if (error) alert("Failed to send invite: " + error.message);
  else alert(`Invite sent to ${tenant.email}`);
}

  return (
    <div style={s.app}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; } tr:hover td { background: #fafafa; cursor: pointer; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }`}</style>

      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.sidebarLogo}>
          <div style={s.logoText}>🏢 Polaris PM</div>
          <div style={s.logoSub}>Property Management</div>
        </div>
        {NAV_ITEMS.map(item => (
          <div key={item.id} style={s.navItem(item.id === "tenants")} onClick={() => navigate(item.route)}>
            <span style={s.navIcon}>{item.icon}</span>{item.label}
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
            <div style={s.pageTitle}>Tenants</div>
            <div style={s.pageSub}>{loading ? "Loading…" : `${tenants.length} tenants across ${properties.length} properties`}</div>
          </div>
          <div style={s.topBarRight}>
            <div style={s.searchBar}>
              <span>🔍</span>
              <input style={s.searchInput} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, unit, email…" />
            </div>
            <button style={s.addBtn} onClick={() => setShowAdd(true)}>+ Add tenant</button>
          </div>
        </div>

        {/* Stats */}
        <div style={s.statRow}>
          {[
            { label: "Total tenants",   value: loading ? "—" : tenants.length,     sub: "across all properties", accent: "#185FA5" },
            { label: "Current",         value: loading ? "—" : currentCount,        sub: "paid & up to date",     accent: "#3B6D11" },
            { label: "Outstanding",     value: loading ? "—" : outstandingCount,    sub: "need follow-up",        accent: "#E24B4A" },
            { label: "Properties",      value: loading ? "—" : properties.length,   sub: "in portfolio",          accent: "#854F0B" },
          ].map((stat, i) => (
            <div key={i} style={s.statCard(stat.accent)}>
              <div style={s.statLabel}>{stat.label}</div>
              <div style={s.statValue}>{stat.value}</div>
              <div style={s.statSub}>{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={s.filterRow}>
          <select style={s.filterSelect} value={propFilter} onChange={e => setPropFilter(e.target.value)}>
            <option value="all">All Properties</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {["all","current","pending","late"].map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: statusFilter === f ? 600 : 400, background: statusFilter === f ? "#0C447C" : "#fff", color: statusFilter === f ? "#fff" : "#555", border: "1px solid #e8eaed", cursor: "pointer", fontFamily: "'Inter',sans-serif", textTransform: "capitalize" }}>
              {f === "all" ? `All (${enriched.length})` : `${f.charAt(0).toUpperCase()+f.slice(1)} (${enriched.filter(t => t.status === f).length})`}
            </button>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#888" }}>{filtered.length} results</span>
        </div>

        {/* Table */}
        <div style={{ ...s.card, overflowX: "auto" }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: "#888", fontSize: 13 }}>Loading tenants…</div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={{ ...s.th, cursor: "pointer" }} onClick={() => handleSort("name")}>Tenant {sortIcon("name")}</th>
                  <th style={{ ...s.th, cursor: "pointer" }} onClick={() => handleSort("property")}>Property · Unit {sortIcon("property")}</th>
                  <th style={{ ...s.th, textAlign: "right", cursor: "pointer" }} onClick={() => handleSort("rent")}>Rent {sortIcon("rent")}</th>
                  <th style={{ ...s.th, cursor: "pointer" }} onClick={() => handleSort("status")}>Status {sortIcon("status")}</th>
                  <th style={{ ...s.th, textAlign: "right", cursor: "pointer" }} onClick={() => handleSort("balance")}>Balance {sortIcon("balance")}</th>
                  <th style={s.th}>Last paid</th>
                  <th style={s.th}>Lease start</th>
                  <th style={s.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#aaa", fontSize: 13 }}>No tenants match your search.</td></tr>
                )}
                {sorted.map(t => (
                  <tr key={t.id}>
                    <td style={s.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={s.avatar(t.color, t.bg)}>{t.initials}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                          <div style={{ fontSize: 11, color: "#888" }}>{t.email || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td style={s.td}>
                      <div style={{ fontWeight: 500 }}>{t.property}</div>
                      <div style={{ fontSize: 11, color: "#888" }}>Unit {t.unit}</div>
                    </td>
                    <td style={{ ...s.td, textAlign: "right", fontWeight: 600 }}>${(t.rent || 0).toLocaleString()}</td>
                    <td style={s.td}><span style={s.statusBadge(t.status)}>{STATUS_CONFIG[t.status]?.label}</span></td>
                    <td style={{ ...s.td, textAlign: "right" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: t.balance > 0 ? "#A32D2D" : "#3B6D11" }}>
                        {t.balance > 0 ? `-$${t.balance.toLocaleString()}` : "✓ $0"}
                      </span>
                    </td>
                    <td style={s.td}><span style={{ fontSize: 12, color: "#555" }}>{t.lastPaid}</span></td>
                    <td style={s.td}>
                      <span style={{ fontSize: 12, color: "#555" }}>
                        {t.lease_start ? new Date(t.lease_start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                      </span>
                    </td>
                    <td style={s.td}>
                      <div style={{ display: "flex", gap: 6 }}>
<button style={s.actionBtnPrimary} onClick={() => navigate(`/landlord/tenants/${t.id}`)}>View</button>
<button style={s.actionBtn} onClick={() => navigate("/landlord/messages", { state: { tenantId: t.id } })}>Message</button>
{!t.user_id && (
  <button style={s.actionBtn} onClick={() => inviteTenant(t)}>Invite</button>
)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Tenant Modal */}
      {showAdd && (
        <AddTenantModal
          properties={properties}
          units={units}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); fetchAll(); }}
        />
      )}
    </div>
  );
}