import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";
import AssignVendorModal from "./AssignVendorModal";
import { notifyTicketStatusUpdate, notifyTenantNewComment } from "./notifications";

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

const PRIORITY = {
  low:    { label: "Low",    color: "#72B02A", bg: "rgba(114,176,42,0.13)" },
  normal: { label: "Normal", color: "#4A9AE8", bg: "rgba(74,154,232,0.13)" },
  high:   { label: "High",   color: "#F0A430", bg: "rgba(240,164,48,0.13)" },
  urgent: { label: "Urgent", color: "#E05555", bg: "rgba(224,85,85,0.15)" },
};

const STATUS = {
  open:        { label: "Open",        color: "#F0A430", bg: "rgba(240,164,48,0.13)" },
  in_progress: { label: "In Progress", color: "#4A9AE8", bg: "rgba(74,154,232,0.13)" },
  resolved:    { label: "Resolved",    color: "#72B02A", bg: "rgba(114,176,42,0.13)" },
};

const CATEGORY_ICONS = {
  plumbing: "🚿", electrical: "⚡", hvac: "🌡️",
  appliance: "🍳", pest: "🐛", other: "🔧",
};

function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

function Badge({ type, value }) {
  const cfg = type === "priority" ? PRIORITY[value] : STATUS[value];
  if (!cfg) return null;
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: cfg.bg, color: cfg.color, whiteSpace: "nowrap" }}>{cfg.label}</span>;
}

function PrimaryBtn({ children, onClick, disabled, color }) {
  const bg = color || C.goldDim;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: color ? color : "transparent",
      border: color ? "none" : `1px solid ${bg}`,
      color: color ? "#fff" : C.gold,
      fontSize: 13, fontWeight: 500, padding: "8px 16px", borderRadius: 7,
      cursor: disabled ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif",
      transition: "background 0.15s", opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap",
    }}
      onMouseOver={e => !disabled && !color && (e.currentTarget.style.background = "rgba(201,169,110,0.07)")}
      onMouseOut={e => !color && (e.currentTarget.style.background = "transparent")}
    >{children}</button>
  );
}

function GhostBtn({ children, onClick, small }) {
  return (
    <button onClick={onClick} style={{
      background: "transparent", border: `1px solid ${C.border}`,
      color: C.textSub, fontSize: small ? 11 : 13, fontWeight: 500,
      padding: small ? "5px 10px" : "8px 16px", borderRadius: 7,
      cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
    }}
      onMouseOver={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = "#353A44"; }}
      onMouseOut={e => { e.currentTarget.style.color = C.textSub; e.currentTarget.style.borderColor = C.border; }}
    >{children}</button>
  );
}

function field(ticket, key) {
  const map = {
    submittedAt: ticket.created_at ? new Date(ticket.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—",
    updatedAt:   ticket.updated_at ? new Date(ticket.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—",
    property:    ticket.units?.properties?.name || "—",
    unit:        ticket.units?.unit_number || "—",
    tenant:      ticket.tenants?.name || "Unknown",
    category:    ticket.category || "other",
    title:       ticket.title || "Untitled",
    description: ticket.description || "",
    priority:    ticket.priority || "normal",
    status:      ticket.status || "open",
    vendor:      ticket.vendor_name || null,
    scheduled:   ticket.scheduled_date || null,
    cost:        ticket.cost || null,
    notes:       ticket.notes || "",
  };
  return map[key];
}

export default function LandlordMaintenance() {
  const width    = useWindowWidth();
  const isMobile = width < 768;

  const [activeTab, setActiveTab]       = useState("Requests");
  const [statusFilter, setStatusFilter] = useState("all");
  const [propFilter, setPropFilter]     = useState("all");
  const [search, setSearch]             = useState("");
  const [selected, setSelected]         = useState(null);
  const [tickets, setTickets]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [fetchError, setFetchError]     = useState(null);
  const [notes, setNotes]               = useState("");
  const [saving, setSaving]             = useState(false);
  const [lightbox, setLightbox]         = useState(null);
  const [comments, setComments]         = useState([]);
  const [newComment, setNewComment]     = useState("");
  const [visibility, setVisibility]     = useState("hidden");
  const [posting, setPosting]           = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [vendorTicket, setVendorTicket] = useState(null);

  useEffect(() => { fetchTickets(); }, []);
  useEffect(() => { if (selected) fetchComments(selected.id); }, [selected?.id]);

  async function fetchTickets() {
    setLoading(true); setFetchError(null);
    const { data, error } = await supabase
      .from("maintenance_requests")
      .select("*, units(unit_number, property_id, properties(name)), tenants(name)")
      .order("created_at", { ascending: false });
    if (error) setFetchError(error.message);
    else setTickets(data || []);
    setLoading(false);
  }

  async function fetchComments(requestId) {
    const { data } = await supabase.from("maintenance_comments").select("*").eq("request_id", requestId).order("created_at", { ascending: true });
    setComments(data || []);
  }

  async function updateStatus(id, newStatus) {
    const { error } = await supabase.from("maintenance_requests").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", id);
    if (!error) {
      setTickets(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
      if (selected?.id === id) setSelected(prev => ({ ...prev, status: newStatus }));
      const ticket = tickets.find(t => t.id === id);
      if (ticket?.tenants?.name) {
        const { data: tenantAuth } = await supabase.from("tenants").select("email").eq("id", ticket.tenant_id).maybeSingle();
        notifyTicketStatusUpdate({ tenantEmail: tenantAuth?.email, tenantName: ticket.tenants?.name, title: ticket.title, newStatus, ticketId: id });
      }
    }
  }

  function handlePostComment() {
    if (!newComment.trim()) return;
    if (visibility === "visible") setShowConfirm(true);
    else postComment();
  }

  async function postComment() {
    setShowConfirm(false); setPosting(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("maintenance_comments").insert({
      request_id: selected.id, author_id: user.id,
      author_name: "Property Manager", body: newComment.trim(),
      visible_to_tenant: visibility === "visible",
    });
    if (visibility === "visible" && selected.tenants?.name) {
      const { data: tenantAuth } = await supabase.from("tenants").select("email").eq("id", selected.tenant_id).maybeSingle();
      notifyTenantNewComment({ tenantEmail: tenantAuth?.email, tenantName: selected.tenants?.name, title: selected.title, commentBody: newComment.trim(), ticketId: selected.id });
    }
    setNewComment("");
    await fetchComments(selected.id);
    setPosting(false);
  }

  const openCount       = tickets.filter(t => t.status === "open").length;
  const inProgressCount = tickets.filter(t => t.status === "in_progress").length;
  const resolvedCount   = tickets.filter(t => t.status === "resolved").length;
  const totalCost       = tickets.reduce((sum, t) => sum + (t.cost || 0), 0);

  const filtered = tickets.filter(t => {
    const prop = field(t, "property");
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    const matchProp   = propFilter === "all"
      || (propFilter === "clifton" && prop.includes("Clifton"))
      || (propFilter === "stpete"  && prop.includes("18th"));
    const matchSearch = field(t, "title").toLowerCase().includes(search.toLowerCase())
      || field(t, "tenant").toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchProp && matchSearch;
  });

  const stats = [
    { label: "Open",             value: loading ? "—" : openCount,       sub: "awaiting action",  accent: C.amber },
    { label: "In Progress",      value: loading ? "—" : inProgressCount, sub: "vendor assigned",  accent: C.blue },
    { label: "Resolved (MTD)",   value: loading ? "—" : resolvedCount,   sub: "this month",       accent: C.green },
    { label: "Maintenance Cost", value: loading ? "—" : `$${totalCost.toLocaleString()}`, sub: "total spent YTD", accent: C.gold },
  ];

  return (
    <LandlordLayout openMaintenance={openCount + inProgressCount} unreadMessages={0}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        .m-ticket:hover { border-color: #353A44 !important; }
        .m-row:hover td { background: ${C.raised} !important; }
        .m-filter:hover { color: ${C.text} !important; border-color: #353A44 !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "20px 16px" : "28px 32px 48px" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 20 : 24, fontWeight: 600, color: C.text }}>Maintenance</div>
            <div style={{ fontSize: 13, color: C.textSub, marginTop: 3 }}>
              {loading ? "Loading…" : `${openCount + inProgressCount} active tickets across all properties`}
            </div>
          </div>
        </div>

        {fetchError && (
          <div style={{ background: "rgba(224,85,85,0.1)", border: `1px solid rgba(224,85,85,0.2)`, borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: C.red }}>
            ⚠️ {fetchError}
            <button onClick={fetchTickets} style={{ marginLeft: 12, fontSize: 12, color: C.red, textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}>Retry</button>
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

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
          {["Requests", "Cost Tracker"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: "10px 18px", fontSize: 13, fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? C.gold : C.textSub, background: "none", border: "none",
              borderBottom: activeTab === tab ? `2px solid ${C.gold}` : "2px solid transparent",
              marginBottom: -1, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "color 0.15s",
            }}>{tab}</button>
          ))}
        </div>

        {/* ── Requests tab ── */}
        {activeTab === "Requests" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 12px", flex: 1, maxWidth: 260 }}>
                <span style={{ color: C.textMuted, fontSize: 13 }}>⌕</span>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets…"
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 13, fontFamily: "'DM Sans', sans-serif", background: "transparent", color: C.text }} />
              </div>
              {["all","open","in_progress","resolved"].map(f => (
                <button key={f} className="m-filter" onClick={() => setStatusFilter(f)} style={{
                  padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                  background: statusFilter === f ? C.goldDim : "transparent",
                  color: statusFilter === f ? C.text : C.textSub,
                  border: `1px solid ${statusFilter === f ? C.goldDim : C.border}`,
                  cursor: "pointer", fontFamily: "'DM Sans', sans-serif", textTransform: "capitalize", transition: "all 0.12s",
                }}>
                  {f === "all" ? `All (${tickets.length})` : f === "in_progress" ? `In Progress (${inProgressCount})` : `${f.charAt(0).toUpperCase()+f.slice(1)} (${tickets.filter(t=>t.status===f).length})`}
                </button>
              ))}
              {!isMobile && (
                <select value={propFilter} onChange={e => setPropFilter(e.target.value)} style={{ padding: "6px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, background: C.surface, color: C.textSub, outline: "none", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
                  <option value="all">All properties</option>
                  <option value="clifton">Clifton Manor</option>
                  <option value="stpete">944 18th Ave S</option>
                </select>
              )}
            </div>

            {loading && <div style={{ textAlign: "center", padding: 40, color: C.textSub, fontSize: 13 }}>Loading tickets…</div>}
            {!loading && filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: C.textSub, fontSize: 13, border: `1px dashed ${C.border}`, borderRadius: 10 }}>
                {tickets.length === 0 ? "No maintenance requests yet." : "No tickets match your filters."}
              </div>
            )}

            {!loading && filtered.map(ticket => {
              const priority = field(ticket, "priority");
              const status   = field(ticket, "status");
              return (
                <div key={ticket.id} className="m-ticket"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${PRIORITY[priority]?.color || C.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 8, cursor: "pointer", transition: "border-color 0.15s" }}
                  onClick={() => { setSelected(ticket); setNotes(field(ticket, "notes")); setNewComment(""); setVisibility("hidden"); }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 16 }}>{CATEGORY_ICONS[field(ticket, "category")] || "🔧"}</span>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{field(ticket, "title")}</div>
                      </div>
                      <div style={{ fontSize: 12, color: C.textSub }}>{field(ticket, "property")} · Unit {field(ticket, "unit")} · {field(ticket, "tenant")}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <Badge type="priority" value={priority} />
                      {!isMobile && <Badge type="status" value={status} />}
                    </div>
                  </div>

                  {!isMobile && field(ticket, "description") && (
                    <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.5, marginBottom: 10 }}>{field(ticket, "description")}</div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, color: C.textMuted }}>📅 {field(ticket, "submittedAt")}</span>
                      {!isMobile && field(ticket, "vendor") && <span style={{ fontSize: 11, color: C.blue }}>🔧 {field(ticket, "vendor")}</span>}
                      {!isMobile && field(ticket, "cost") && <span style={{ fontSize: 11, color: C.textMuted }}>💰 ${field(ticket, "cost")}</span>}
                    </div>
                    <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                      {status === "open"        && <PrimaryBtn onClick={() => setVendorTicket(ticket)}>{isMobile ? "→" : "Assign vendor"}</PrimaryBtn>}
                      {status === "in_progress" && <PrimaryBtn color={C.green} onClick={() => updateStatus(ticket.id, "resolved")}>{isMobile ? "✓" : "Mark resolved"}</PrimaryBtn>}
                      {status === "resolved"    && <span style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>✓ Resolved</span>}
                      <GhostBtn small onClick={() => { setSelected(ticket); setNotes(field(ticket, "notes")); setNewComment(""); setVisibility("hidden"); }}>View</GhostBtn>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ── Cost Tracker tab ── */}
        {activeTab === "Cost Tracker" && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Maintenance spend by ticket</div>
              <GhostBtn small>⬇ Export CSV</GhostBtn>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Property", "Unit", "Issue", "Vendor", "Cost", "Date"].map(h => (
                      <th key={h} style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", padding: "10px 16px", textAlign: "left", borderBottom: `1px solid ${C.border}`, background: C.raised, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tickets.filter(t => t.cost).map(t => (
                    <tr key={t.id} className="m-row">
                      <td style={{ padding: "11px 16px", fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}` }}>{field(t, "property")}</td>
                      <td style={{ padding: "11px 16px", fontSize: 13, color: C.textSub, borderBottom: `1px solid ${C.border}` }}>Unit {field(t, "unit")}</td>
                      <td style={{ padding: "11px 16px", fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}` }}>{field(t, "title")}</td>
                      <td style={{ padding: "11px 16px", fontSize: 13, color: C.textSub, borderBottom: `1px solid ${C.border}` }}>{field(t, "vendor") || "—"}</td>
                      <td style={{ padding: "11px 16px", fontSize: 13, color: C.text, fontWeight: 600, borderBottom: `1px solid ${C.border}` }}>${t.cost}</td>
                      <td style={{ padding: "11px 16px", fontSize: 13, color: C.textSub, borderBottom: `1px solid ${C.border}` }}>{field(t, "updatedAt")}</td>
                    </tr>
                  ))}
                  {tickets.filter(t => t.cost).length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 24, fontSize: 13, color: C.textSub, textAlign: "center" }}>No costs recorded yet.</td></tr>
                  )}
                  {tickets.some(t => t.cost) && (
                    <tr>
                      <td colSpan={4} style={{ padding: "11px 16px", fontSize: 13, fontWeight: 700, color: C.text, background: C.raised }}>Total</td>
                      <td style={{ padding: "11px 16px", fontSize: 14, fontWeight: 700, color: C.gold, background: C.raised }}>${totalCost.toLocaleString()}</td>
                      <td style={{ background: C.raised }} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail panel ── */}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", justifyContent: "flex-end" }} onClick={() => setSelected(null)}>
          <div style={{ width: "min(520px,100vw)", background: C.surface, height: "100vh", overflowY: "auto", borderLeft: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>

            <div style={{ background: C.raised, borderBottom: `1px solid ${C.border}`, padding: "20px 20px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 4 }}>{field(selected, "title")}</div>
                  <div style={{ fontSize: 12, color: C.textSub }}>{field(selected, "property")} · Unit {field(selected, "unit")} · {field(selected, "tenant")}</div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSub, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 13 }}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Badge type="priority" value={field(selected, "priority")} />
                <Badge type="status" value={field(selected, "status")} />
                {field(selected, "vendor") && <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: `${C.blue}18`, color: C.blue }}>🔧 {field(selected, "vendor")}</span>}
              </div>
            </div>

            <div style={{ padding: "20px" }}>

              {field(selected, "description") && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Description</div>
                  <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, margin: 0 }}>{field(selected, "description")}</p>
                </div>
              )}

              {selected.photos?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Photos ({selected.photos.length})</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {selected.photos.map((url, i) => (
                      <img key={i} src={url} alt={`photo-${i}`} onClick={() => setLightbox({ urls: selected.photos, index: i })}
                        style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 7, border: `1px solid ${C.border}`, cursor: "pointer" }} />
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Details</div>
                {[
                  ["Submitted",    field(selected, "submittedAt")],
                  ["Last updated", field(selected, "updatedAt")],
                  ["Category",     field(selected, "category")],
                  ["Vendor",       field(selected, "vendor") || "—"],
                  ["Scheduled",    field(selected, "scheduled") || "—"],
                  ["Cost",         field(selected, "cost") ? `$${field(selected, "cost")}` : "—"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 13, color: C.textSub }}>{k}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{v}</span>
                  </div>
                ))}
              </div>

              {field(selected, "status") !== "resolved" && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Actions</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {field(selected, "status") === "open" && (
                      <PrimaryBtn onClick={() => setVendorTicket(selected)}>Assign vendor</PrimaryBtn>
                    )}
                    {field(selected, "status") === "open" && (
                      <GhostBtn onClick={() => updateStatus(selected.id, "in_progress")}>→ In Progress</GhostBtn>
                    )}
                    {field(selected, "status") === "in_progress" && (
                      <PrimaryBtn color={C.green} onClick={() => updateStatus(selected.id, "resolved")}>✓ Mark Resolved</PrimaryBtn>
                    )}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Comments</div>
                <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 12 }}>
                  {comments.length === 0 && <div style={{ textAlign: "center", padding: "16px 0", color: C.textMuted, fontSize: 13 }}>No comments yet.</div>}
                  {comments.map(c => {
                    const isMe = c.author_name === "Property Manager";
                    const displayName = isMe ? "Property Manager" : (c.author_name || "Tenant");
                    const initials = displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                    const date = new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    return (
                      <div key={c.id} style={{ marginBottom: 14, display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexDirection: isMe ? "row-reverse" : "row" }}>
                          <div style={{ width: 26, height: 26, borderRadius: "50%", background: isMe ? C.goldDim : C.raised, border: `1px solid ${isMe ? C.gold : C.border}`, color: isMe ? C.gold : C.textSub, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.textSub }}>{displayName}</span>
                          {!c.visible_to_tenant && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 5, background: "rgba(240,164,48,0.13)", color: C.amber, fontWeight: 600 }}>🔒 Internal</span>}
                          {c.visible_to_tenant  && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 5, background: "rgba(114,176,42,0.13)", color: C.green, fontWeight: 600 }}>👁 Visible</span>}
                          <span style={{ fontSize: 10, color: C.textMuted }}>{date}</span>
                        </div>
                        <div style={{ maxWidth: "82%", background: isMe ? C.goldDim : C.raised, border: `1px solid ${isMe ? C.goldDim : C.border}`, borderRadius: isMe ? "14px 4px 14px 14px" : "4px 14px 14px 14px", padding: "10px 14px" }}>
                          <p style={{ fontSize: 13, color: isMe ? C.text : C.textSub, lineHeight: 1.5, margin: 0 }}>{c.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <textarea value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Add a comment…" rows={3}
                  style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, resize: "none", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", color: C.text, background: C.raised, lineHeight: 1.5, marginBottom: 8 }} />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select value={visibility} onChange={e => setVisibility(e.target.value)} style={{ flex: 1, padding: "8px 10px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 7, background: C.raised, fontFamily: "'DM Sans', sans-serif", outline: "none", color: C.textSub }}>
                    <option value="hidden">🔒 Internal only</option>
                    <option value="visible">👁 Visible to tenant</option>
                  </select>
                  <button onClick={handlePostComment} disabled={posting || !newComment.trim()} style={{ padding: "8px 16px", background: newComment.trim() ? C.goldDim : C.raised, color: newComment.trim() ? C.text : C.textMuted, border: `1px solid ${newComment.trim() ? C.goldDim : C.border}`, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: newComment.trim() ? "pointer" : "default", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap" }}>
                    {posting ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Timeline</div>
                {[
                  { color: C.amber, text: `Submitted by ${field(selected, "tenant")}`, time: field(selected, "submittedAt") },
                  field(selected, "vendor")    && { color: C.blue,  text: `Assigned to ${field(selected, "vendor")}`, time: field(selected, "updatedAt") },
                  field(selected, "scheduled") && { color: C.blue,  text: `Scheduled for ${field(selected, "scheduled")}`, time: field(selected, "updatedAt") },
                  field(selected, "status") === "resolved" && { color: C.green, text: "Ticket resolved", time: field(selected, "updatedAt") },
                ].filter(Boolean).map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0, marginTop: 5 }} />
                    <div>
                      <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>{item.text}</div>
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{item.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <button onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: (l.index - 1 + l.urls.length) % l.urls.length })); }} style={{ position: "absolute", left: 24, background: C.raised, border: `1px solid ${C.border}`, color: C.text, fontSize: 22, borderRadius: "50%", width: 44, height: 44, cursor: "pointer" }}>‹</button>
          <img src={lightbox.urls[lightbox.index]} alt="" style={{ maxHeight: "85vh", maxWidth: "85vw", borderRadius: 10 }} onClick={e => e.stopPropagation()} />
          <button onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: (l.index + 1) % l.urls.length })); }} style={{ position: "absolute", right: 24, background: C.raised, border: `1px solid ${C.border}`, color: C.text, fontSize: 22, borderRadius: "50%", width: 44, height: 44, cursor: "pointer" }}>›</button>
          <button onClick={() => setLightbox(null)} style={{ position: "absolute", top: 20, right: 20, background: C.raised, border: `1px solid ${C.border}`, color: C.textSub, fontSize: 13, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>✕</button>
          <div style={{ position: "absolute", bottom: 20, color: C.textSub, fontSize: 13 }}>{lightbox.index + 1} / {lightbox.urls.length}</div>
        </div>
      )}

      {/* Confirm comment */}
      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: "100%", maxWidth: 400, padding: "32px 28px", textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 10 }}>Your tenant will see this message.</div>
            <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 24, textAlign: "left" }}>
              <p style={{ fontSize: 13, color: C.text, margin: 0, lineHeight: 1.5 }}>{newComment}</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <GhostBtn onClick={() => setShowConfirm(false)}>Cancel</GhostBtn>
              <PrimaryBtn onClick={postComment}>Send message</PrimaryBtn>
            </div>
          </div>
        </div>
      )}

      {/* Assign vendor modal */}
      {vendorTicket && (
        <AssignVendorModal
          requestId={vendorTicket.id}
          requestTitle={field(vendorTicket, "title")}
          requestCategory={field(vendorTicket, "category")}
          propertyId={vendorTicket.units?.property_id || null}
          onClose={() => setVendorTicket(null)}
          onAssigned={() => { fetchTickets(); }}
        />
      )}
    </LandlordLayout>
  );
}