import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";

const PRIORITY_CONFIG = {
  low:    { label: "Low",    color: "#3B6D11", bg: "#EAF3DE" },
  normal: { label: "Normal", color: "#185FA5", bg: "#E6F1FB" },
  high:   { label: "High",   color: "#854F0B", bg: "#FAEEDA" },
  urgent: { label: "Urgent", color: "#A32D2D", bg: "#FDECEA" },
};

const STATUS_CONFIG = {
  open:        { label: "Open",        color: "#854F0B", bg: "#FAEEDA" },
  in_progress: { label: "In Progress", color: "#185FA5", bg: "#E6F1FB" },
  resolved:    { label: "Resolved",    color: "#3B6D11", bg: "#EAF3DE" },
};

const CATEGORY_ICONS = {
  plumbing: "🚿", electrical: "⚡", hvac: "🌡️",
  appliance: "🍳", pest: "🐛", other: "🔧",
};

const s = {
  main: { flex: 1, padding: "28px", overflowY: "auto" },
  btn: (primary) => ({ padding: "9px 16px", background: primary ? "#0C447C" : "#fff", color: primary ? "#fff" : "#1a1a1a", border: primary ? "none" : "1px solid #e8eaed", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", gap: 6 }),
  statGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 },
  statGridMobile: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 },
  statCard: (accent) => ({ background: "#fff", border: "1px solid #e8eaed", borderRadius: 10, padding: "14px 16px", borderTop: `3px solid ${accent}` }),
  statLabel: { fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 },
  statValue: { fontSize: 26, fontWeight: 700, color: "#1a1a1a" },
  statSub: { fontSize: 11, color: "#888", marginTop: 2 },
  tabs: { display: "flex", gap: 0, borderBottom: "2px solid #e8eaed", marginBottom: 20 },
  tab: (active) => ({ padding: "10px 18px", fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#0C447C" : "#888", cursor: "pointer", background: "none", border: "none", borderBottom: active ? "2px solid #0C447C" : "2px solid transparent", marginBottom: -2, fontFamily: "'Inter',sans-serif" }),
  filterRow: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" },
  filterBtn: (active) => ({ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: active ? 600 : 400, background: active ? "#0C447C" : "#fff", color: active ? "#fff" : "#555", border: "1px solid #e8eaed", cursor: "pointer", fontFamily: "'Inter',sans-serif" }),
  searchBar: { display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e8eaed", borderRadius: 8, padding: "7px 12px", flex: 1, maxWidth: 280 },
  searchInput: { flex: 1, border: "none", outline: "none", fontSize: 13, fontFamily: "'Inter',sans-serif", background: "transparent" },
  ticketCard: (priority) => ({ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px", marginBottom: 10, cursor: "pointer", transition: "box-shadow 0.15s", borderLeft: `4px solid ${PRIORITY_CONFIG[priority]?.color || "#e8eaed"}` }),
  ticketHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 },
  ticketTitle: { fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 3 },
  ticketMeta: { fontSize: 12, color: "#888" },
  ticketBadges: { display: "flex", gap: 6, alignItems: "center", flexShrink: 0 },
  badge: (color, bg) => ({ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: bg, color, whiteSpace: "nowrap" }),
  ticketFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid #f4f5f7" },
  ticketFooterLeft: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  ticketFooterItem: { fontSize: 11, color: "#888", display: "flex", alignItems: "center", gap: 4 },
  actionBtn: { padding: "5px 10px", background: "#f4f5f7", border: "1px solid #e8eaed", borderRadius: 6, fontSize: 11, fontWeight: 600, color: "#555", cursor: "pointer", fontFamily: "'Inter',sans-serif" },
  actionBtnPrimary: { padding: "5px 10px", background: "#E6F1FB", border: "1px solid #B5D4F4", borderRadius: 6, fontSize: 11, fontWeight: 600, color: "#185FA5", cursor: "pointer", fontFamily: "'Inter',sans-serif" },
  detailOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", justifyContent: "flex-end" },
  detailPanel: { width: "min(520px, 100vw)", background: "#fff", height: "100vh", overflowY: "auto", boxShadow: "-4px 0 20px rgba(0,0,0,0.15)" },
  detailHeader: { background: "#0C447C", padding: "20px 20px 16px" },
  detailTitle: { fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 4 },
  detailMeta: { fontSize: 12, color: "#85B7EB" },
  detailBody: { padding: "20px" },
  detailSection: { marginBottom: 20 },
  detailSectionTitle: { fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 },
  infoRow: { display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f4f5f7" },
  infoKey: { fontSize: 13, color: "#888" },
  infoVal: { fontSize: 13, fontWeight: 600, color: "#1a1a1a" },
  notesArea: { width: "100%", minHeight: 80, padding: "10px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 8, resize: "vertical", fontFamily: "'Inter',sans-serif", outline: "none", boxSizing: "border-box", color: "#1a1a1a", background: "#fff" },
  timelineItem: { display: "flex", gap: 10, marginBottom: 12 },
  timelineDot: (color) => ({ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 4 }),
  timelineText: { fontSize: 12, color: "#444", lineHeight: 1.5 },
  timelineTime: { fontSize: 10, color: "#aaa", marginTop: 2 },
};

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

export default function LandlordMaintenance() {
  const navigate = useNavigate();
  const width    = useWindowWidth();
  const isMobile = width < 768;

  const [activeTab, setActiveTab]       = useState("Requests");
  const [statusFilter, setStatusFilter] = useState("all");
  const [propFilter, setPropFilter]     = useState("all");
  const [search, setSearch]             = useState("");
  const [selected, setSelected]         = useState(null);
  const [tickets, setTickets]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [notes, setNotes]               = useState("");
  const [saving, setSaving]             = useState(false);
  const [lightbox, setLightbox]         = useState(null);

  // Comments state
  const [comments, setComments]         = useState([]);
  const [newComment, setNewComment]     = useState("");
  const [visibility, setVisibility]     = useState("hidden");
  const [posting, setPosting]           = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);

  useEffect(() => { fetchTickets(); }, []);
  useEffect(() => { if (selected) fetchComments(selected.id); }, [selected?.id]);

  async function fetchTickets() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("maintenance_requests")
      .select(`*, units(unit_number, property_id, properties(name)), tenants(name)`)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setTickets(data || []);
    setLoading(false);
  }

  async function fetchComments(requestId) {
    const { data } = await supabase
      .from("maintenance_comments")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });
    setComments(data || []);
  }

  async function updateStatus(id, newStatus) {
    const { error } = await supabase
      .from("maintenance_requests")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      setTickets(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
      if (selected?.id === id) setSelected(prev => ({ ...prev, status: newStatus }));
    }
  }

  async function saveNotes(id) {
    setSaving(true);
    await supabase.from("maintenance_requests").update({ notes, updated_at: new Date().toISOString() }).eq("id", id);
    setTickets(prev => prev.map(t => t.id === id ? { ...t, notes } : t));
    setSaving(false);
  }

  function handlePostComment() {
    if (!newComment.trim()) return;
    if (visibility === "visible") {
      setShowConfirm(true);
    } else {
      postComment();
    }
  }

  async function postComment() {
    setShowConfirm(false);
    setPosting(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("maintenance_comments").insert({
      request_id:        selected.id,
      author_id:         user.id,
      author_name:       "Property Manager",
      body:              newComment.trim(),
      visible_to_tenant: visibility === "visible",
    });
    setNewComment("");
    await fetchComments(selected.id);
    setPosting(false);
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

  return (
    <LandlordLayout openMaintenance={openCount + inProgressCount}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }`}</style>
      <div style={{ padding: isMobile ? "16px" : "28px" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isMobile ? 16 : 24 }}>
          <div>
            <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700 }}>Maintenance</div>
            <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
              {loading ? "Loading…" : `${openCount + inProgressCount} active tickets across all properties`}
            </div>
          </div>
          <button style={s.btn(true)}>+ New request</button>
        </div>

        {error && (
          <div style={{ background: "#FDECEA", border: "1px solid #F5C6C6", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#A32D2D" }}>
            ⚠️ Error: {error}
            <button onClick={fetchTickets} style={{ marginLeft: 12, fontSize: 12, color: "#A32D2D", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}>Retry</button>
          </div>
        )}

        {/* Stats */}
        <div style={isMobile ? s.statGridMobile : s.statGrid}>
          {[
            { label: "Open",             value: loading ? "—" : openCount,       sub: "awaiting action",  accent: "#854F0B" },
            { label: "In progress",      value: loading ? "—" : inProgressCount, sub: "vendor assigned",  accent: "#185FA5" },
            { label: "Resolved (MTD)",   value: loading ? "—" : resolvedCount,   sub: "this month",       accent: "#3B6D11" },
            { label: "Maintenance cost", value: loading ? "—" : `$${totalCost.toLocaleString()}`, sub: "total spent YTD", accent: "#6B3FA0" },
          ].map((stat, i) => (
            <div key={i} style={s.statCard(stat.accent)}>
              <div style={s.statLabel}>{stat.label}</div>
              <div style={s.statValue}>{stat.value}</div>
              <div style={s.statSub}>{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          {["Requests", "Cost Tracker"].map(tab => (
            <button key={tab} style={s.tab(activeTab === tab)} onClick={() => setActiveTab(tab)}>{tab}</button>
          ))}
        </div>

        {/* Requests */}
        {activeTab === "Requests" && (
          <>
            <div style={s.filterRow}>
              <div style={s.searchBar}>
                <span>🔍</span>
                <input style={s.searchInput} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets…" />
              </div>
              {["all","open","in_progress","resolved"].map(f => (
                <button key={f} style={s.filterBtn(statusFilter === f)} onClick={() => setStatusFilter(f)}>
                  {f === "all" ? `All (${tickets.length})` : f === "in_progress" ? `In Progress (${inProgressCount})` : `${f.charAt(0).toUpperCase()+f.slice(1)} (${tickets.filter(t=>t.status===f).length})`}
                </button>
              ))}
              {!isMobile && (
                <select style={{ padding: "7px 12px", border: "1px solid #e8eaed", borderRadius: 8, fontSize: 12, background: "#fff", fontFamily: "'Inter',sans-serif", outline: "none", color: "#1a1a1a" }}
                  value={propFilter} onChange={e => setPropFilter(e.target.value)}>
                  <option value="all">All properties</option>
                  <option value="clifton">Clifton Manor</option>
                  <option value="stpete">944 18th Ave S</option>
                </select>
              )}
            </div>

            {loading && <div style={{ textAlign: "center", padding: 40, color: "#888", fontSize: 13 }}>Loading tickets…</div>}
            {!loading && filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "#888", fontSize: 13 }}>
                {tickets.length === 0 ? "No maintenance requests yet." : "No tickets match your filters."}
              </div>
            )}

            {!loading && filtered.map(ticket => {
              const priority = field(ticket, "priority");
              const status   = field(ticket, "status");
              return (
                <div key={ticket.id} style={s.ticketCard(priority)} onClick={() => { setSelected(ticket); setNotes(field(ticket, "notes")); setNewComment(""); setVisibility("hidden"); }}>
                  <div style={s.ticketHeader}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 18 }}>{CATEGORY_ICONS[field(ticket, "category")] || "🔧"}</span>
                        <div style={s.ticketTitle}>{field(ticket, "title")}</div>
                      </div>
                      <div style={s.ticketMeta}>{field(ticket, "property")} · Unit {field(ticket, "unit")} · {field(ticket, "tenant")}</div>
                    </div>
                    <div style={s.ticketBadges}>
                      <span style={s.badge(PRIORITY_CONFIG[priority]?.color, PRIORITY_CONFIG[priority]?.bg)}>{PRIORITY_CONFIG[priority]?.label}</span>
                      {!isMobile && <span style={s.badge(STATUS_CONFIG[status]?.color, STATUS_CONFIG[status]?.bg)}>{STATUS_CONFIG[status]?.label}</span>}
                    </div>
                  </div>
                  {!isMobile && <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5, marginBottom: 8 }}>{field(ticket, "description")}</div>}
                  <div style={s.ticketFooter}>
                    <div style={s.ticketFooterLeft}>
                      <span style={s.ticketFooterItem}>📅 {field(ticket, "submittedAt")}</span>
                      {!isMobile && field(ticket, "vendor") && <span style={s.ticketFooterItem}>🔧 {field(ticket, "vendor")}</span>}
                      {!isMobile && field(ticket, "cost") && <span style={s.ticketFooterItem}>💰 ${field(ticket, "cost")}</span>}
                    </div>
                    <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                      {status === "open"        && <button style={s.actionBtnPrimary} onClick={() => updateStatus(ticket.id, "in_progress")}>{isMobile ? "→" : "Assign vendor"}</button>}
                      {status === "in_progress" && <button style={s.actionBtnPrimary} onClick={() => updateStatus(ticket.id, "resolved")}>{isMobile ? "✓" : "Mark resolved"}</button>}
                      {status === "resolved"    && <span style={{ fontSize: 11, color: "#3B6D11", fontWeight: 600 }}>✓</span>}
                      <button style={s.actionBtn} onClick={() => { setSelected(ticket); setNotes(field(ticket, "notes")); setNewComment(""); setVisibility("hidden"); }}>View</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Cost Tracker */}
        {activeTab === "Cost Tracker" && (
          <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Maintenance spend by ticket</div>
              <button style={s.btn(false)}>⬇️ Export CSV</button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Property", "Unit", "Issue", "Vendor", "Cost", "Date"].map(h => (
                      <th key={h} style={{ fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", padding: "10px 14px", textAlign: "left", borderBottom: "1px solid #f0f0f0", background: "#fafafa", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tickets.filter(t => t.cost).map(t => (
                    <tr key={t.id}>
                      <td style={{ padding: "10px 14px", fontSize: 13, borderBottom: "1px solid #f8f9fa" }}>{field(t, "property")}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13, borderBottom: "1px solid #f8f9fa" }}>Unit {field(t, "unit")}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13, borderBottom: "1px solid #f8f9fa" }}>{field(t, "title")}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13, borderBottom: "1px solid #f8f9fa" }}>{field(t, "vendor") || "—"}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, borderBottom: "1px solid #f8f9fa" }}>${t.cost}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13, color: "#888", borderBottom: "1px solid #f8f9fa" }}>{field(t, "updatedAt")}</td>
                    </tr>
                  ))}
                  {tickets.filter(t => t.cost).length === 0 && (
                    <tr><td colSpan={6} style={{ padding: "20px 14px", fontSize: 13, color: "#888", textAlign: "center" }}>No costs recorded yet.</td></tr>
                  )}
                  {tickets.some(t => t.cost) && (
                    <tr>
                      <td colSpan={4} style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, background: "#fafafa" }}>Total</td>
                      <td style={{ padding: "10px 14px", fontSize: 14, fontWeight: 700, color: "#0C447C", background: "#fafafa" }}>${totalCost.toLocaleString()}</td>
                      <td style={{ background: "#fafafa" }}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Ticket detail panel */}
      {selected && (
        <div style={s.detailOverlay} onClick={() => setSelected(null)}>
          <div style={s.detailPanel} onClick={e => e.stopPropagation()}>
            <div style={s.detailHeader}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={s.detailTitle}>{field(selected, "title")}</div>
                  <div style={s.detailMeta}>{field(selected, "property")} · Unit {field(selected, "unit")} · {field(selected, "tenant")}</div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 13 }}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <span style={s.badge(PRIORITY_CONFIG[field(selected,"priority")]?.color, "rgba(255,255,255,0.2)")}>{PRIORITY_CONFIG[field(selected,"priority")]?.label} priority</span>
                <span style={s.badge(STATUS_CONFIG[field(selected,"status")]?.color, "rgba(255,255,255,0.2)")}>{STATUS_CONFIG[field(selected,"status")]?.label}</span>
              </div>
            </div>

            <div style={s.detailBody}>

              {/* Description */}
              <div style={s.detailSection}>
                <div style={s.detailSectionTitle}>Description</div>
                <p style={{ fontSize: 13, color: "#444", lineHeight: 1.6, margin: 0 }}>{field(selected, "description")}</p>
              </div>

              {/* Photos */}
              {selected.photos?.length > 0 && (
                <div style={s.detailSection}>
                  <div style={s.detailSectionTitle}>Photos ({selected.photos.length})</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {selected.photos.map((url, i) => (
                      <img key={i} src={url} alt={`photo-${i}`}
                        onClick={() => setLightbox({ urls: selected.photos, index: i })}
                        style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #e8eaed", cursor: "pointer" }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Lightbox */}
              {lightbox && (
                <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <button onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: (l.index - 1 + l.urls.length) % l.urls.length })); }} style={{ position: "absolute", left: 24, background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 24, borderRadius: "50%", width: 44, height: 44, cursor: "pointer" }}>‹</button>
                  <img src={lightbox.urls[lightbox.index]} alt="" style={{ maxHeight: "85vh", maxWidth: "85vw", borderRadius: 10 }} onClick={e => e.stopPropagation()} />
                  <button onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: (l.index + 1) % l.urls.length })); }} style={{ position: "absolute", right: 24, background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 24, borderRadius: "50%", width: 44, height: 44, cursor: "pointer" }}>›</button>
                  <button onClick={() => setLightbox(null)} style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 16, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>✕</button>
                  <div style={{ position: "absolute", bottom: 20, color: "#fff", fontSize: 13 }}>{lightbox.index + 1} / {lightbox.urls.length}</div>
                </div>
              )}

              {/* Details */}
              <div style={s.detailSection}>
                <div style={s.detailSectionTitle}>Details</div>
                {[
                  ["Submitted",    field(selected, "submittedAt")],
                  ["Last updated", field(selected, "updatedAt")],
                  ["Category",     field(selected, "category")],
                  ["Vendor",       field(selected, "vendor") || "—"],
                  ["Scheduled",    field(selected, "scheduled") || "—"],
                  ["Cost",         field(selected, "cost") ? `$${field(selected, "cost")}` : "—"],
                ].map(([k, v]) => (
                  <div key={k} style={s.infoRow}>
                    <span style={s.infoKey}>{k}</span>
                    <span style={s.infoVal}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Update status */}
              {field(selected, "status") !== "resolved" && (
                <div style={s.detailSection}>
                  <div style={s.detailSectionTitle}>Update status</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {field(selected, "status") === "open" && (
                      <button style={{ ...s.btn(true), flex: 1, justifyContent: "center" }} onClick={() => updateStatus(selected.id, "in_progress")}>→ In Progress</button>
                    )}
                    {field(selected, "status") === "in_progress" && (
                      <button style={{ ...s.btn(true), flex: 1, justifyContent: "center", background: "#3B6D11" }} onClick={() => updateStatus(selected.id, "resolved")}>✓ Mark Resolved</button>
                    )}
                  </div>
                </div>
              )}

              {/* Comments */}
              <div style={s.detailSection}>
                <div style={s.detailSectionTitle}>Comments</div>

                {/* Comment list */}
                <div style={{ maxHeight: 240, overflowY: "auto", marginBottom: 12 }}>
                  {comments.length === 0 && (
                    <div style={{ textAlign: "center", padding: "16px 0", color: "#aaa", fontSize: 13 }}>No comments yet.</div>
                  )}
                  {comments.map(c => {
                    const isMe = c.author_name === "Property Manager";
                    const displayName = isMe ? "Property Manager" : (c.author_name || "Tenant");
                    const initials = displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                    const date = new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    return (
                      <div key={c.id} style={{ marginBottom: 16, display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                        {/* Name + avatar row */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexDirection: isMe ? "row-reverse" : "row" }}>
                          <div style={{ width: 26, height: 26, borderRadius: "50%", background: isMe ? "#0C447C" : "#e8eaed", color: isMe ? "#fff" : "#555", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                            {initials}
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#555" }}>{displayName}</span>
                          {!c.visible_to_tenant && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "#FAEEDA", color: "#854F0B", fontWeight: 600 }}>🔒 Internal</span>}
                          {c.visible_to_tenant && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "#EAF3DE", color: "#3B6D11", fontWeight: 600 }}>👁 Visible</span>}
                          <span style={{ fontSize: 10, color: "#aaa" }}>{date}</span>
                        </div>
                        {/* Bubble */}
                        <div style={{ maxWidth: "80%", background: isMe ? "#0C447C" : "#f0f0f0", borderRadius: isMe ? "16px 4px 16px 16px" : "4px 16px 16px 16px", padding: "10px 14px", opacity: !c.visible_to_tenant ? 0.85 : 1, border: !c.visible_to_tenant ? "1px dashed #d1a050" : "none" }}>
                          <p style={{ fontSize: 13, color: isMe ? "#fff" : "#1a1a1a", lineHeight: 1.5, margin: 0 }}>{c.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add comment */}
                <textarea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Add a comment…"
                  rows={3}
                  style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 8, resize: "none", fontFamily: "'Inter',sans-serif", outline: "none", boxSizing: "border-box", color: "#1a1a1a", background: "#fff", lineHeight: 1.5, marginBottom: 8 }}
                />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select
                    value={visibility}
                    onChange={e => setVisibility(e.target.value)}
                    style={{ flex: 1, padding: "8px 10px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontFamily: "'Inter',sans-serif", outline: "none", color: "#1a1a1a" }}
                  >
                    <option value="hidden">🔒 Internal only (hidden from tenant)</option>
                    <option value="visible">👁 Visible to tenant</option>
                  </select>
                  <button
                    onClick={handlePostComment}
                    disabled={posting || !newComment.trim()}
                    style={{ padding: "8px 14px", background: newComment.trim() ? "#0C447C" : "#e8eaed", color: newComment.trim() ? "#fff" : "#aaa", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: newComment.trim() ? "pointer" : "default", fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" }}>
                    {posting ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>

              {/* Timeline */}
              <div style={s.detailSection}>
                <div style={s.detailSectionTitle}>Timeline</div>
                {[
                  { color: "#854F0B", text: `Submitted by ${field(selected, "tenant")}`, time: field(selected, "submittedAt") },
                  field(selected, "vendor") && { color: "#185FA5", text: `Assigned to ${field(selected, "vendor")}`, time: field(selected, "updatedAt") },
                  field(selected, "scheduled") && { color: "#185FA5", text: `Scheduled for ${field(selected, "scheduled")}`, time: field(selected, "updatedAt") },
                  field(selected, "status") === "resolved" && { color: "#3B6D11", text: "Ticket resolved", time: field(selected, "updatedAt") },
                ].filter(Boolean).map((item, i) => (
                  <div key={i} style={s.timelineItem}>
                    <div style={s.timelineDot(item.color)} />
                    <div>
                      <div style={s.timelineText}>{item.text}</div>
                      <div style={s.timelineTime}>{item.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation popup */}
      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, padding: "32px 28px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#FAEEDA", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", marginBottom: 10 }}>Your tenant will see this message.</div>
            <div style={{ fontSize: 14, color: "#666", lineHeight: 1.6, marginBottom: 24 }}>
              This message will be sent directly to your tenant. Please make sure everything looks good before sending.
            </div>
            <div style={{ background: "#f8f9fa", borderRadius: 10, padding: "12px 14px", marginBottom: 24, textAlign: "left" }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Message preview</div>
              <p style={{ fontSize: 13, color: "#1a1a1a", margin: 0, lineHeight: 1.5 }}>{newComment}</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowConfirm(false)}
                style={{ flex: 1, padding: "11px", background: "#fff", border: "1px solid #e8eaed", borderRadius: 8, fontSize: 14, fontWeight: 600, color: "#1a1a1a", cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
                Cancel
              </button>
              <button onClick={postComment}
                style={{ flex: 1, padding: "11px", background: "#0C447C", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, color: "#fff", cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
                Send message
              </button>
            </div>
          </div>
        </div>
      )}
    </LandlordLayout>
  );
}