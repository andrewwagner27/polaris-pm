import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";

const STATUS_CONFIG = {
  open:        { label: "Open",        color: "#854F0B", bg: "#FAEEDA" },
  in_progress: { label: "In Progress", color: "#185FA5", bg: "#E6F1FB" },
  resolved:    { label: "Resolved",    color: "#3B6D11", bg: "#EAF3DE" },
};

const CATEGORY_ICONS = {
  plumbing: "🚿", electrical: "⚡", hvac: "🌡️",
  appliance: "🍳", pest: "🐛", other: "🔧",
};

export default function TenantMaintenanceList() {
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const [tickets, setTickets]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState("all");

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

  const filtered = filter === "all" ? tickets : tickets.filter(t => t.status === filter);
  const openCount = tickets.filter(t => t.status === "open" || t.status === "in_progress").length;

  return (
    <TenantLayout tenantName={tenant?.name}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; }`}</style>
      <div style={{ padding: "24px 20px", maxWidth: 700, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>Maintenance</div>
            <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
              {loading ? "Loading…" : `${openCount} active request${openCount !== 1 ? "s" : ""}`}
            </div>
          </div>
          <button
            onClick={() => navigate("/maintenance/new")}
            style={{ padding: "9px 16px", background: "#0C447C", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
            + New request
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {["all", "open", "in_progress", "resolved"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: filter === f ? 600 : 400, background: filter === f ? "#0C447C" : "#fff", color: filter === f ? "#fff" : "#555", border: "1px solid #e8eaed", cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
              {f === "all" ? `All (${tickets.length})` : f === "in_progress" ? `In Progress (${tickets.filter(t => t.status === "in_progress").length})` : `${f.charAt(0).toUpperCase()+f.slice(1)} (${tickets.filter(t => t.status === f).length})`}
            </button>
          ))}
        </div>

        {/* Ticket list */}
        {loading && <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Loading tickets…</div>}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, background: "#fff", borderRadius: 12, border: "1px solid #e8eaed" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔧</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#555", marginBottom: 6 }}>
              {filter === "all" ? "No requests yet" : `No ${filter.replace("_", " ")} requests`}
            </div>
            <div style={{ fontSize: 13, color: "#aaa", marginBottom: 16 }}>
              {filter === "all" && "Submit a request and we'll take care of it."}
            </div>
            {filter === "all" && (
              <button onClick={() => navigate("/maintenance/new")}
                style={{ padding: "9px 18px", background: "#0C447C", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
                + New request
              </button>
            )}
          </div>
        )}

        {!loading && filtered.map(ticket => {
          const sc = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
          const date = new Date(ticket.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          const icon = CATEGORY_ICONS[ticket.category] || "🔧";
          return (
            <div key={ticket.id}
              onClick={() => navigate(`/maintenance/${ticket.id}`)}
              style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px", marginBottom: 10, cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 14, borderLeft: `4px solid ${sc.color}` }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: sc.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                {icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{ticket.title}</div>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: sc.bg, color: sc.color, whiteSpace: "nowrap", flexShrink: 0 }}>{sc.label}</span>
                </div>
                {ticket.description && (
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.description}</div>
                )}
                <div style={{ fontSize: 11, color: "#aaa" }}>Submitted {date}</div>
              </div>
            </div>
          );
        })}
      </div>
    </TenantLayout>
  );
}