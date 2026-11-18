import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import { TICKET_COLUMNS } from "./lib/maintenanceColumns";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";

const C = {
  bg:       "#F5F3EE",
  surface:  "#FFFFFF",
  raised:   "#F8F7F4",
  border:   "#E4E1DA",
  text:     "#18181B",
  textSub:  "#52525B",
  textMuted:"#6B6B73",
  gold:     "#7A5C12",
  goldBg:   "#FBF6EC",
  goldDim:  "#C9A96E",
  blue:     "#1D4ED8",
  green:    "#15803D",
  red:      "#B91C1C",
  amber:    "#92400E",
};

// Light-surface status colours (AA on white and on the tinted chip). Stages the tenant can't act on read as
// "In progress"; nothing about contractors, quotes or approvals is shown here.
const STATUS = {
  open:        { label: "Received",    color: "#92400E", bg: "#FFFBEB", border: "#FDE68A" },
  in_progress: { label: "In progress", color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE" },
  resolved:    { label: "Resolved",    color: "#166534", bg: "#F0FDF4", border: "#BBF7D0" },
};
const statusOf = (s) => (s === "resolved" ? "resolved" : s === "open" ? "open" : "in_progress");

const CATEGORY_ICONS = {
  plumbing: "🚿", electrical: "⚡", hvac: "🌡️",
  appliance: "🍳", pest: "🐛", other: "🔧",
};

export default function TenantMaintenanceList() {
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("active");

  useEffect(() => { if (tenant?.id) fetchTickets(); }, [tenant?.id]);

  async function fetchTickets() {
    setLoading(true);
    const { data } = await supabase
      .from("maintenance_requests")
      .select(TICKET_COLUMNS)
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false });
    setTickets(data || []);
    setLoading(false);
  }

  const activeCount   = tickets.filter(t => t.status !== "resolved").length;
  const resolvedCount = tickets.length - activeCount;
  const filtered = filter === "all" ? tickets : filter === "active" ? tickets.filter(t => t.status !== "resolved") : tickets.filter(t => t.status === "resolved");
  const FILTERS = [["active", `Active (${activeCount})`], ["resolved", `Resolved (${resolvedCount})`], ["all", `All (${tickets.length})`]];

  return (
    <TenantLayout tenantName={tenant?.name}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        body { background: ${C.bg}; }
        .t-ticket{display:flex;align-items:flex-start;gap:12px;width:100%;text-align:left;font:inherit;color:inherit;background:${C.surface};border:1px solid ${C.border};border-radius:12px;padding:14px 16px;margin-bottom:10px;cursor:pointer;min-height:64px;}
        .t-ticket:hover{border-color:${C.gold};}
        .t-filter{min-height:44px;padding:0 16px;border-radius:999px;font:inherit;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;}
        .t-new{min-height:44px;padding:0 16px;background:${C.gold};border:none;border-radius:10px;font:inherit;font-size:14px;font-weight:600;color:#FFFFFF;cursor:pointer;white-space:nowrap;}
      `}</style>

      <div className="t-light" style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif", padding: "20px 16px 24px", maxWidth: 820, margin: "0 auto" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: C.text, margin: 0 }}>Maintenance</h1>
            <div style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>
              {loading ? "Loading…" : `${activeCount} active request${activeCount !== 1 ? "s" : ""}`}
            </div>
          </div>
          <button type="button" className="t-new" onClick={() => navigate("/maintenance/new")}>+ New request</button>
        </div>

        <div role="group" aria-label="Show requests" style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto" }}>
          {FILTERS.map(([f, label]) => (
            <button key={f} type="button" className="t-filter" aria-pressed={filter === f} onClick={() => setFilter(f)}
              style={{ background: filter === f ? C.goldBg : C.surface, color: filter === f ? C.gold : C.textSub, border: `1px solid ${filter === f ? C.gold : C.border}`, fontWeight: filter === f ? 600 : 500 }}>
              {label}
            </button>
          ))}
        </div>

        {loading && <div style={{ textAlign: "center", padding: 24, color: C.textSub, fontSize: 13 }}>Loading requests…</div>}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: "18px 16px", background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, fontSize: 14, color: C.textSub }}>
            {filter === "resolved" ? "No resolved requests yet." : tickets.length === 0 ? "No requests yet. Tap “New request” if something needs fixing." : "Nothing active right now."}
          </div>
        )}

        {!loading && filtered.map(ticket => {
          const sc   = STATUS[statusOf(ticket.status)];
          const date = new Date(ticket.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          const icon = CATEGORY_ICONS[ticket.category] || "🔧";
          return (
            <button type="button" key={ticket.id} className="t-ticket" onClick={() => navigate(`/maintenance/${ticket.id}`)}>
              <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: sc.bg, border: `1px solid ${sc.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: C.text, overflowWrap: "anywhere" }}>{ticket.title}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, whiteSpace: "nowrap", flexShrink: 0 }}>{sc.label}</span>
                </span>
                {ticket.description && <span style={{ display: "block", fontSize: 13, color: C.textSub, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.description}</span>}
                <span style={{ display: "block", fontSize: 12, color: C.textMuted, marginTop: 4 }}>Submitted {date}</span>
              </span>
            </button>
          );
        })}
      </div>
    </TenantLayout>
  );
}
