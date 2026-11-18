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
  border:   "#EAE6DE",
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
  open:        { label: "Received",    color: "#92400E", bg: "#FFFBEB", border: "#FDE68A", next: "Management will review it shortly" },
  in_progress: { label: "In progress", color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE", next: "Being taken care of. We'll message you with updates" },
  resolved:    { label: "Resolved",    color: "#166534", bg: "#F0FDF4", border: "#BBF7D0", next: "Completed" },
};
const statusOf = (s) => (s === "resolved" ? "resolved" : s === "open" ? "open" : "in_progress");

// Restrained line icons (no emoji) by category.
const CATEGORY_ICON = {
  plumbing: "M12 3c3 4 5 6.5 5 9a5 5 0 01-10 0c0-2.5 2-5 5-9z",
  electrical: "M13 3L5 14h6l-1 7 8-11h-6l1-7z",
  hvac: "M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4",
  appliance: "M6 3h12v18H6zM6 9h12M9 6h.01",
  pest: "M12 8a3 3 0 100-6 3 3 0 000 6zM8 14a4 4 0 008 0v-2a4 4 0 00-8 0zM4 10l4 2M20 10l-4 2M4 18l4-2M20 18l-4-2",
  other: "M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z",
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
        
        .t-ticket{display:flex;align-items:flex-start;gap:14px;width:100%;text-align:left;font:inherit;color:inherit;background:${C.surface};border:1px solid transparent;border-radius:16px;padding:18px 20px;margin-bottom:12px;cursor:pointer;min-height:64px;box-shadow:0 1px 2px rgba(24,24,27,0.04),0 4px 16px rgba(24,24,27,0.04);}
        .t-ticket:hover{border-color:#E2D6BC;}
        .t-seg{display:inline-flex;gap:4px;padding:4px;border-radius:14px;background:#EDE9E0;margin-bottom:18px;max-width:100%;overflow-x:auto;}
        .t-filter{min-height:40px;padding:0 16px;border-radius:10px;border:none;font:inherit;font-size:14px;font-weight:500;cursor:pointer;white-space:nowrap;background:transparent;color:${C.textSub};}
        .t-filter[aria-pressed="true"]{background:${C.surface};color:${C.text};box-shadow:0 1px 2px rgba(24,24,27,0.08);}
        @media (max-width:1024px){ .t-filter{min-height:44px;} }
        .t-new{min-height:44px;padding:0 16px;background:${C.gold};border:none;border-radius:10px;font:inherit;font-size:14px;font-weight:600;color:#FFFFFF;cursor:pointer;white-space:nowrap;}
      `}</style>

      <div className="t-light" style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "var(--m-font)", padding: "28px 20px 32px", maxWidth: 820, margin: "0 auto" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontFamily: "var(--m-font)", fontSize:"var(--m-fs-title)", fontWeight: 600, color: C.text, margin: 0 }}>Maintenance</h1>
            <div style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>
              {loading ? "Loading…" : `${activeCount} active request${activeCount !== 1 ? "s" : ""}`}
            </div>
          </div>
          <button type="button" className="t-new" onClick={() => navigate("/maintenance/new")}>+ New request</button>
        </div>

        <div role="group" aria-label="Show requests" className="t-seg">
          {FILTERS.map(([f, label]) => (
            <button key={f} type="button" className="t-filter" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {label}
            </button>
          ))}
        </div>

        {loading && <div style={{ textAlign: "center", padding: 24, color: C.textSub, fontSize: 13 }}>Loading requests…</div>}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: "20px", background: C.surface, borderRadius: 16, fontSize: 14, color: C.textSub }}>
            {filter === "resolved" ? "No resolved requests yet." : tickets.length === 0 ? "No requests yet. Tap “New request” if something needs fixing." : "Nothing active right now."}
          </div>
        )}

        {!loading && filtered.map(ticket => {
          const sc   = STATUS[statusOf(ticket.status)];
          const date = new Date(ticket.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          const icon = CATEGORY_ICON[ticket.category] || CATEGORY_ICON.other;
          return (
            <button type="button" key={ticket.id} className="t-ticket" onClick={() => navigate(`/maintenance/${ticket.id}`)}>
              <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: C.goldBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={icon}/></svg>
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: C.text, overflowWrap: "anywhere" }}>{ticket.title}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, padding: "4px 10px", borderRadius: 999, background: sc.bg, color: sc.color, whiteSpace: "nowrap", flexShrink: 0 }}>{sc.label}</span>
                </span>
                {ticket.description && <span style={{ display: "block", fontSize: 13, color: C.textSub, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.description}</span>}
                <span style={{ display: "block", fontSize: 14, color: C.textSub, marginTop: 6 }}>{sc.next}</span>
                <span style={{ display: "block", fontSize: 13, color: C.textMuted, marginTop: 4 }}>Submitted {date}</span>
              </span>
            </button>
          );
        })}
      </div>
    </TenantLayout>
  );
}
