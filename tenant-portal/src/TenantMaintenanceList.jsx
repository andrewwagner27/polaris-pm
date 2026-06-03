import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";

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
  open:        { label: "Open",        color: "#F0A430", bg: "rgba(240,164,48,0.13)" },
  in_progress: { label: "In Progress", color: "#4A9AE8", bg: "rgba(74,154,232,0.13)" },
  resolved:    { label: "Resolved",    color: "#72B02A", bg: "rgba(114,176,42,0.13)" },
};

const CATEGORY_ICONS = {
  plumbing: "🚿", electrical: "⚡", hvac: "🌡️",
  appliance: "🍳", pest: "🐛", other: "🔧",
};

export default function TenantMaintenanceList() {
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("all");

  useEffect(() => { fetchTickets(); }, []);

  async function fetchTickets() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("maintenance_requests")
      .select("*")
      .eq("tenant_id", user.id)
      .order("created_at", { ascending: false });
    setTickets(data || []);
    setLoading(false);
  }

  const filtered   = filter === "all" ? tickets : tickets.filter(t => t.status === filter);
  const openCount  = tickets.filter(t => t.status === "open" || t.status === "in_progress").length;

  return (
    <TenantLayout tenantName={tenant?.name}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        .t-ticket:hover { border-color: #353A44 !important; }
        .t-filter:hover { color: ${C.text} !important; border-color: #353A44 !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif", padding: "24px 20px", maxWidth: 820, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: C.text }}>Maintenance</div>
            <div style={{ fontSize: 13, color: C.textSub, marginTop: 3 }}>
              {loading ? "Loading…" : `${openCount} active request${openCount !== 1 ? "s" : ""}`}
            </div>
          </div>
          <button onClick={() => navigate("/maintenance/new")} style={{
            padding: "9px 16px", background: "transparent", border: `1px solid ${C.goldDim}`,
            borderRadius: 7, fontSize: 13, fontWeight: 500, color: C.gold,
            cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "background 0.15s",
          }}
            onMouseOver={e => e.currentTarget.style.background = "rgba(201,169,110,0.07)"}
            onMouseOut={e => e.currentTarget.style.background = "transparent"}
          >+ New request</button>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {["all", "open", "in_progress", "resolved"].map(f => (
            <button key={f} className="t-filter" onClick={() => setFilter(f)} style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500,
              background: filter === f ? C.goldDim : "transparent",
              color: filter === f ? C.text : C.textSub,
              border: `1px solid ${filter === f ? C.goldDim : C.border}`,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.12s",
            }}>
              {f === "all" ? `All (${tickets.length})` : f === "in_progress" ? `In Progress (${tickets.filter(t => t.status === "in_progress").length})` : `${f.charAt(0).toUpperCase()+f.slice(1)} (${tickets.filter(t => t.status === f).length})`}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && <div style={{ textAlign: "center", padding: 40, color: C.textSub, fontSize: 13 }}>Loading tickets…</div>}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚙</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>
              {filter === "all" ? "No requests yet" : `No ${filter.replace("_", " ")} requests`}
            </div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 16 }}>
              {filter === "all" && "Submit a request and we'll take care of it."}
            </div>
            {filter === "all" && (
              <button onClick={() => navigate("/maintenance/new")} style={{
                padding: "9px 18px", background: "transparent", border: `1px solid ${C.goldDim}`,
                borderRadius: 7, fontSize: 13, fontWeight: 500, color: C.gold,
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              }}>+ New request</button>
            )}
          </div>
        )}

        {/* Ticket list */}
        {!loading && filtered.map(ticket => {
          const sc   = STATUS[ticket.status] || STATUS.open;
          const date = new Date(ticket.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          const icon = CATEGORY_ICONS[ticket.category] || "🔧";
          return (
            <div key={ticket.id} className="t-ticket"
              onClick={() => navigate(`/maintenance/${ticket.id}`)}
              style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderLeft: `3px solid ${sc.color}`,
                borderRadius: 10, padding: "14px 16px", marginBottom: 8,
                cursor: "pointer", display: "flex", alignItems: "flex-start",
                gap: 14, transition: "border-color 0.15s",
              }}>
              <div style={{ width: 40, height: 40, borderRadius: 9, background: sc.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                {icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{ticket.title}</div>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: sc.bg, color: sc.color, whiteSpace: "nowrap", flexShrink: 0 }}>{sc.label}</span>
                </div>
                {ticket.description && (
                  <div style={{ fontSize: 12, color: C.textSub, marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.description}</div>
                )}
                <div style={{ fontSize: 11, color: C.textMuted }}>Submitted {date}</div>
              </div>
            </div>
          );
        })}
      </div>
    </TenantLayout>
  );
}