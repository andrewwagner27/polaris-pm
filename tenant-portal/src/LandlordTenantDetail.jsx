import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "./supabase";

const STATUS_CONFIG = {
  current:     { label: "Current",     color: "#3B6D11", bg: "#EAF3DE" },
  pending:     { label: "Pending",     color: "#854F0B", bg: "#FAEEDA" },
  late:        { label: "Late",        color: "#A32D2D", bg: "#FDECEA" },
  paid:        { label: "Paid",        color: "#3B6D11", bg: "#EAF3DE" },
  upcoming:    { label: "Upcoming",    color: "#185FA5", bg: "#E6F1FB" },
  failed:      { label: "Failed",      color: "#A32D2D", bg: "#FDECEA" },
  in_progress: { label: "In Progress", color: "#185FA5", bg: "#E6F1FB" },
  resolved:    { label: "Resolved",    color: "#3B6D11", bg: "#EAF3DE" },
  open:        { label: "Open",        color: "#854F0B", bg: "#FAEEDA" },
};

const TABS = ["Overview", "Payments", "Maintenance", "Notes"];

const NAV_ITEMS = [
  { icon: "📊", label: "Dashboard",   route: "/landlord" },
  { icon: "🏢", label: "Properties",  route: "/landlord/properties" },
  { icon: "👥", label: "Tenants",     route: "/landlord/tenants" },
  { icon: "💰", label: "Rent Roll",   route: "/landlord/rentroll" },
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
  backBtn: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#185FA5", cursor: "pointer", background: "none", border: "none", fontFamily: "'Inter',sans-serif", padding: 0, marginBottom: 16 },
  headerCard: { background: "#fff", border: "1px solid #e8eaed", borderRadius: 14, padding: "20px 24px", marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 },
  headerLeft: { display: "flex", alignItems: "flex-start", gap: 16 },
  avatar: (color, bg) => ({ width: 56, height: 56, borderRadius: "50%", background: bg, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, flexShrink: 0 }),
  statusBadge: (status) => ({ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 10, background: STATUS_CONFIG[status]?.bg || "#f4f5f7", color: STATUS_CONFIG[status]?.color || "#555" }),
  contactRow: { display: "flex", gap: 20, marginTop: 10, flexWrap: "wrap" },
  contactItem: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#555" },
  actionBtns: { display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" },
  btn: (primary) => ({ padding: "8px 14px", background: primary ? "#0C447C" : "#fff", color: primary ? "#fff" : "#1a1a1a", border: primary ? "none" : "1px solid #e8eaed", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" }),
  btnDanger: { padding: "8px 14px", background: "#FDECEA", color: "#A32D2D", border: "1px solid #f5c6c6", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" },
  tabs: { display: "flex", gap: 0, borderBottom: "2px solid #e8eaed", marginBottom: 20 },
  tab: (active) => ({ padding: "10px 16px", fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#0C447C" : "#888", cursor: "pointer", background: "none", border: "none", borderBottom: active ? "2px solid #0C447C" : "2px solid transparent", marginBottom: -2, fontFamily: "'Inter',sans-serif" }),
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 },
  card: (span) => ({ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px", gridColumn: span === 2 ? "span 2" : "span 1" }),
  cardTitle: { fontSize: 12, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 },
  infoRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f4f5f7" },
  infoRowLast: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0" },
  infoKey: { fontSize: 13, color: "#888" },
  infoVal: { fontSize: 13, fontWeight: 600, color: "#1a1a1a" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", padding: "10px 14px", textAlign: "left", borderBottom: "1px solid #f0f0f0", background: "#fafafa" },
  td: { fontSize: 13, padding: "10px 14px", borderBottom: "1px solid #f8f9fa", color: "#1a1a1a" },
  payBadge: (status) => ({ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: STATUS_CONFIG[status]?.bg || "#f4f5f7", color: STATUS_CONFIG[status]?.color || "#555" }),
  notesArea: { width: "100%", minHeight: 120, padding: "10px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 8, resize: "vertical", fontFamily: "'Inter',sans-serif", color: "#1a1a1a", outline: "none", lineHeight: 1.6, boxSizing: "border-box" },
  progressBar: { height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden", marginTop: 8 },
  progressFill: (pct) => ({ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#185FA5,#0C447C)", borderRadius: 3 }),
  emptyState: { textAlign: "center", padding: "30px", color: "#aaa", fontSize: 13 },
};

const AVATAR_COLORS = [
  { color: "#185FA5", bg: "#E6F1FB" },
  { color: "#3B6D11", bg: "#EAF3DE" },
  { color: "#854F0B", bg: "#FAEEDA" },
  { color: "#A32D2D", bg: "#FDECEA" },
  { color: "#6B3FA0", bg: "#F3EEFB" },
];

export default function LandlordTenantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [tenant, setTenant]         = useState(null);
  const [unit, setUnit]             = useState(null);
  const [property, setProperty]     = useState(null);
  const [payments, setPayments]     = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState("Overview");
  const [notes, setNotes]           = useState("");
  const [noteSaved, setNoteSaved]   = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => { fetchAll(); }, [id]);

  async function fetchAll() {
    setLoading(true);
    const { data: tenantData } = await supabase.from("tenants").select("*").eq("id", id).single();
    if (!tenantData) { setLoading(false); return; }
    setTenant(tenantData);
    setNotes(tenantData.notes || "");

    const [
      { data: unitData },
      { data: paymentsData },
      { data: maintData },
    ] = await Promise.all([
      supabase.from("units").select("*, properties(*)").eq("id", tenantData.unit_id).single(),
      supabase.from("payments").select("*").eq("tenant_id", id).order("created_at", { ascending: false }),
      supabase.from("maintenance_requests").select("*").eq("tenant_id", id).order("created_at", { ascending: false }),
    ]);

    setUnit(unitData || null);
    setProperty(unitData?.properties || null);
    setPayments(paymentsData || []);
    setMaintenance(maintData || []);
    setLoading(false);
  }

  async function saveNotes() {
    setSavingNotes(true);
    await supabase.from("tenants").update({ notes }).eq("id", id);
    setSavingNotes(false);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  }

  if (loading) {
    return (
      <div style={{ ...s.app, alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#888", fontSize: 14 }}>Loading tenant…</div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div style={{ ...s.app, alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#888", fontSize: 14 }}>Tenant not found.</div>
      </div>
    );
  }

  const initials = tenant.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const ac = AVATAR_COLORS[0];

  const latestPayment = payments[0];
  let status = "current";
  if (latestPayment?.status === "failed") status = "late";
  else if (!latestPayment || latestPayment.status === "pending") status = "pending";

  const balance = status !== "paid" && latestPayment?.status !== "paid" ? (unit?.rent_amount || 0) : 0;

  const leaseStart = tenant.lease_start ? new Date(tenant.lease_start) : null;
  const leaseEnd   = tenant.lease_end   ? new Date(tenant.lease_end)   : null;
  const daysLeft   = leaseEnd ? Math.ceil((leaseEnd - new Date()) / (1000 * 60 * 60 * 24)) : null;
  const progress   = leaseStart && leaseEnd
    ? Math.min(100, Math.max(0, Math.round(((new Date() - leaseStart) / (leaseEnd - leaseStart)) * 100)))
    : 0;

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
          <div key={item.route} style={s.navItem(item.label === "Tenants")} onClick={() => navigate(item.route)}>
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
        <button style={s.backBtn} onClick={() => navigate("/landlord/tenants")}>← Back to Tenants</button>

        {/* Header */}
        <div style={s.headerCard}>
          <div style={s.headerLeft}>
            <div style={s.avatar(ac.color, ac.bg)}>{initials}</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{tenant.name}</div>
              <div style={{ fontSize: 13, color: "#888", marginBottom: 3 }}>
                {property?.name || "—"} · Unit {unit?.unit_number || "—"}
                {property?.address && ` · ${property.address}, ${property.city} ${property.state}`}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                <span style={s.statusBadge(status)}>● {STATUS_CONFIG[status]?.label}</span>
                {daysLeft !== null && daysLeft < 60 && daysLeft > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 10, background: "#FAEEDA", color: "#854F0B" }}>⚠️ Lease expiring in {daysLeft}d</span>
                )}
              </div>
              <div style={s.contactRow}>
                {tenant.email && <span style={s.contactItem}>📧 {tenant.email}</span>}
                {tenant.phone && <span style={s.contactItem}>📞 {tenant.phone}</span>}
                {tenant.lease_start && <span style={s.contactItem}>📅 Move-in: {new Date(tenant.lease_start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
              </div>
            </div>
          </div>
          <div style={s.actionBtns}>
            <button style={s.btn(true)} onClick={() => navigate("/landlord/messages")}>💬 Message</button>
            <button style={s.btn(false)}>💰 Record payment</button>
            {status === "late" && <button style={s.btnDanger}>⚠️ Send notice</button>}
          </div>
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          {TABS.map(tab => (
            <button key={tab} style={s.tab(activeTab === tab)} onClick={() => setActiveTab(tab)}>{tab}</button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === "Overview" && (
          <div style={s.grid}>
            <div style={s.card(1)}>
              <div style={s.cardTitle}>Balance</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: balance > 0 ? "#A32D2D" : "#3B6D11", marginBottom: 4 }}>
                {balance > 0 ? `-$${balance.toLocaleString()}` : "$0.00"}
              </div>
              <div style={{ fontSize: 12, color: balance > 0 ? "#A32D2D" : "#3B6D11" }}>
                {balance > 0 ? "Amount overdue" : "Fully paid ✓"}
              </div>
              {balance > 0 && (
                <button style={{ ...s.btn(true), marginTop: 12, width: "100%", justifyContent: "center", display: "flex" }}>
                  Send payment reminder
                </button>
              )}
            </div>

            <div style={s.card(1)}>
              <div style={s.cardTitle}>Lease details</div>
              {[
                ["Monthly rent",  unit?.rent_amount ? `$${unit.rent_amount.toLocaleString()}` : "—"],
                ["Lease start",   tenant.lease_start ? new Date(tenant.lease_start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"],
                ["Lease end",     tenant.lease_end   ? new Date(tenant.lease_end).toLocaleDateString("en-US",   { month: "short", day: "numeric", year: "numeric" }) : "—"],
                ["Days remaining", daysLeft !== null ? (daysLeft > 0 ? `${daysLeft} days` : "Expired") : "—"],
              ].map(([k, v], i, arr) => (
                <div key={k} style={i === arr.length - 1 ? s.infoRowLast : s.infoRow}>
                  <span style={s.infoKey}>{k}</span>
                  <span style={s.infoVal}>{v}</span>
                </div>
              ))}
              {leaseStart && leaseEnd && (
                <>
                  <div style={s.progressBar}><div style={s.progressFill(progress)} /></div>
                  <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>{progress}% through lease</div>
                </>
              )}
            </div>

            <div style={s.card(1)}>
              <div style={s.cardTitle}>Unit info</div>
              {[
                ["Property",   property?.name || "—"],
                ["Unit",       unit?.unit_number || "—"],
                ["Bedrooms",   unit?.bedrooms ?? "—"],
                ["Bathrooms",  unit?.bathrooms ?? "—"],
                ["Rent",       unit?.rent_amount ? `$${unit.rent_amount.toLocaleString()}/mo` : "—"],
              ].map(([k, v], i, arr) => (
                <div key={k} style={i === arr.length - 1 ? s.infoRowLast : s.infoRow}>
                  <span style={s.infoKey}>{k}</span>
                  <span style={s.infoVal}>{v}</span>
                </div>
              ))}
            </div>

            <div style={s.card(1)}>
              <div style={s.cardTitle}>Payment summary</div>
              {[
                ["Total payments",  payments.filter(p => p.status === "paid").length],
                ["Last payment",    latestPayment?.paid_at ? new Date(latestPayment.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"],
                ["Last amount",     latestPayment?.amount_cents ? `$${(latestPayment.amount_cents / 100).toLocaleString()}` : "—"],
                ["Payment status",  latestPayment?.status || "No payments"],
              ].map(([k, v], i, arr) => (
                <div key={k} style={i === arr.length - 1 ? s.infoRowLast : s.infoRow}>
                  <span style={s.infoKey}>{k}</span>
                  <span style={s.infoVal}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payments */}
        {activeTab === "Payments" && (
          <div style={s.card(2)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #f0f0f0" }}>
              <div>
                <div style={s.cardTitle}>Payment history</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: -10 }}>{payments.length} payments recorded</div>
              </div>
            </div>
            {payments.length === 0 ? (
              <div style={s.emptyState}>No payment history yet.</div>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Date</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Amount</th>
                    <th style={s.th}>Status</th>
                    <th style={s.th}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, i) => (
                    <tr key={i}>
                      <td style={s.td}>{new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                      <td style={{ ...s.td, textAlign: "right", fontWeight: 600 }}>${((p.amount_cents || 0) / 100).toLocaleString()}</td>
                      <td style={s.td}><span style={s.payBadge(p.status)}>{STATUS_CONFIG[p.status]?.label || p.status}</span></td>
                      <td style={{ ...s.td, fontSize: 12, color: "#888" }}>{p.source || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Maintenance */}
        {activeTab === "Maintenance" && (
          <div style={s.card(2)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #f0f0f0" }}>
              <div style={s.cardTitle}>Maintenance history</div>
              <button style={s.btn(true)} onClick={() => navigate("/landlord/maintenance")}>View all</button>
            </div>
            {maintenance.length === 0 ? (
              <div style={s.emptyState}>🎉 No maintenance requests for this tenant.</div>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Issue</th>
                    <th style={s.th}>Category</th>
                    <th style={s.th}>Priority</th>
                    <th style={s.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenance.map((m, i) => (
                    <tr key={i}>
                      <td style={s.td}>{new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                      <td style={s.td}>{m.title}</td>
                      <td style={{ ...s.td, textTransform: "capitalize" }}>{m.category || "—"}</td>
                      <td style={s.td}><span style={s.payBadge(m.priority === "high" || m.priority === "urgent" ? "late" : "upcoming")}>{m.priority}</span></td>
                      <td style={s.td}><span style={s.payBadge(m.status)}>{STATUS_CONFIG[m.status]?.label}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Notes */}
        {activeTab === "Notes" && (
          <div style={s.card(2)}>
            <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #f0f0f0" }}>
              <div style={s.cardTitle}>Private notes</div>
              <div style={{ fontSize: 11, color: "#aaa", marginTop: -10 }}>Only visible to you — never shown to the tenant</div>
            </div>
            <div style={{ padding: "14px 16px" }}>
              <textarea
                style={s.notesArea}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add private notes about this tenant — payment behavior, communications, maintenance patterns, renewal intent…"
              />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                <button style={{ padding: "8px 16px", background: "#0C447C", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }} onClick={saveNotes} disabled={savingNotes}>
                  {noteSaved ? "✓ Saved!" : savingNotes ? "Saving…" : "Save notes"}
                </button>
                <span style={{ fontSize: 11, color: "#aaa" }}>{notes.length} characters</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}