import { useNavigate } from "react-router-dom";
import { useTenant } from "./useTenant";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import TenantLayout from "./TenantLayout";

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
  open:        { bg: "rgba(240,164,48,0.13)",  color: "#F0A430", label: "Open" },
  in_progress: { bg: "rgba(74,154,232,0.13)",  color: "#4A9AE8", label: "In progress" },
  resolved:    { bg: "rgba(114,176,42,0.13)",  color: "#72B02A", label: "Resolved" },
};

const ACTIONS = [
  { label: "Pay rent",  color: C.gold,  route: "/pay" },
  { label: "Request",   color: C.blue,  route: "/maintenance" },
  { label: "Messages",  color: C.green, route: "/messages" },
  { label: "Documents", color: C.amber, route: "/documents" },
];

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: accent }} />
        <div style={{ fontSize: 9, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div>
      </div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: accent, lineHeight: 1, marginBottom: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textSub }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, action, onAction, badge }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em" }}>{title}</span>
        {badge > 0 && <span style={{ background: C.blue, color: "#fff", borderRadius: 8, fontSize: 9, fontWeight: 700, padding: "2px 6px" }}>{badge}</span>}
      </div>
      {action && <button onClick={onAction} style={{ fontSize: 12, color: C.goldDim, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", padding: 0, transition: "color 0.15s" }}
        onMouseOver={e => e.currentTarget.style.color = C.gold}
        onMouseOut={e => e.currentTarget.style.color = C.goldDim}
      >{action}</button>}
    </div>
  );
}

export default function HomeDashboard({ onNavigate }) {
  const navigate = useNavigate();
  const { tenant, user, loading } = useTenant();
  const [messages, setMessages]       = useState([]);
  const [msgsLoading, setMsgsLoading] = useState(true);

  const nav = onNavigate || navigate;

  useEffect(() => { if (user) fetchMessages(); }, [user]);

  async function fetchMessages() {
    setMsgsLoading(true);
    const { data: tenantData } = await supabase.from("tenants").select("id").eq("user_id", user.id).single();
    if (!tenantData) { setMsgsLoading(false); return; }
    const { data } = await supabase.from("messages").select("*").eq("tenant_id", tenantData.id).order("created_at", { ascending: false }).limit(3);
    setMessages(data || []);
    setMsgsLoading(false);
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: C.bg, color: C.textSub, fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
      Loading your portal…
    </div>
  );

  const firstName   = (tenant?.name || "Tenant").split(" ")[0];
  const unitNum     = tenant?.unit || "—";
  const propName    = tenant?.property || "Your Property";
  const rentAmount  = tenant?.rent || 0;
  const payments    = tenant?.payments || [];
  const maintenance = tenant?.maintenance || [];
  const unreadCount = messages.filter(m => !m.read && m.recipient_id === user?.id).length;
  const hour        = new Date().getHours();
  const timeOfDay   = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  return (
    <TenantLayout tenantName={tenant?.name || "Tenant"} unreadMessages={unreadCount}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        .t-action:hover { border-color: #353A44 !important; background: ${C.raised} !important; }
        .t-maint:hover { border-color: #353A44 !important; }
        .t-msg:hover { border-color: #353A44 !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 }}>

        {/* Hero / rent card */}
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "24px 20px 20px" }}>
          <div style={{ fontSize: 13, color: C.textSub, marginBottom: 2 }}>Good {timeOfDay},</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: C.text, marginBottom: 18 }}>{firstName}</div>

          {/* Rent card */}
          <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 18px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Rent due</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 600, color: C.gold, lineHeight: 1 }}>
                  {rentAmount > 0 ? `$${rentAmount.toLocaleString()}` : "—"}
                </div>
                <div style={{ fontSize: 12, color: C.textSub, marginTop: 4 }}>Unit {unitNum} · {propName}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, padding: "4px 10px", background: "rgba(240,164,48,0.13)", color: C.amber, borderRadius: 20 }}>Due 1st</span>
            </div>
            <button onClick={() => nav("/pay")} style={{ width: "100%", padding: "11px", background: C.goldDim, border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, color: C.text, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.03em", transition: "opacity 0.15s" }}
              onMouseOver={e => e.currentTarget.style.opacity = "0.85"}
              onMouseOut={e => e.currentTarget.style.opacity = "1"}
            >Pay rent →</button>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
              <span style={{ fontSize: 11, color: C.textMuted }}>Autopay is off</span>
              <span style={{ fontSize: 10, color: C.goldDim, cursor: "pointer" }}>Turn on →</span>
            </div>
          </div>
        </div>

        <div style={{ padding: "20px 20px 0" }}>

          {/* Quick actions */}
          <div style={{ marginBottom: 24 }}>
            <SectionHeader title="Quick actions" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
              {ACTIONS.map((a, i) => (
                <button key={i} className="t-action" onClick={() => nav(a.route)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 6px 12px", cursor: "pointer", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "all 0.15s" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: `${a.color}18`, border: `1px solid ${a.color}33`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: a.color }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, color: C.textSub, lineHeight: 1.2 }}>{a.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24 }}>
            <StatCard label="Open tickets" value={maintenance.filter(m => m.status !== "resolved").length || "0"} sub="maintenance requests" accent={C.amber} />
            <StatCard label="Messages" value={unreadCount || "0"} sub="unread" accent={C.blue} />
          </div>

          {/* Payment history */}
          <div style={{ marginBottom: 24 }}>
            <SectionHeader title="Payment history" action="See all" onAction={() => nav("/pay")} />
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              {payments.length === 0 && (
                <div style={{ textAlign: "center", padding: "20px", color: C.textSub, fontSize: 13 }}>No payment history yet.</div>
              )}
              {payments.slice(0, 4).map((p, i) => {
                const amount = (p.amount_cents || 0) / 100;
                const date   = new Date(p.paid_at || p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                const isPaid = p.status === "paid";
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: i < Math.min(payments.length, 4) - 1 ? `1px solid ${C.border}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: isPaid ? C.green : C.red, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{isPaid ? "Rent payment" : "Payment failed"}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{date}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: isPaid ? C.green : C.red }}>${amount.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Maintenance */}
          <div style={{ marginBottom: 24 }}>
            <SectionHeader title="Maintenance" action="See all" onAction={() => nav("/maintenance")} />
            {maintenance.length === 0 ? (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, textAlign: "center", color: C.textSub, fontSize: 13 }}>No maintenance requests yet.</div>
            ) : (
              maintenance.slice(0, 3).map((m, i) => {
                const sc   = STATUS[m.status] || STATUS.open;
                const date = new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                return (
                  <div key={m.id} className="t-maint"
                    style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, cursor: "pointer", transition: "border-color 0.15s" }}
                    onClick={() => nav(`/maintenance/${m.id}`)}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 3 }}>{m.title}</div>
                      <div style={{ fontSize: 11, color: C.textMuted }}>Submitted {date}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", background: sc.bg, color: sc.color, borderRadius: 5, whiteSpace: "nowrap" }}>{sc.label}</span>
                  </div>
                );
              })
            )}
          </div>

          {/* Messages */}
          <div style={{ marginBottom: 24 }}>
            <SectionHeader title="Messages" action="See all" onAction={() => nav("/messages")} badge={unreadCount} />
            {msgsLoading && <div style={{ color: C.textSub, fontSize: 13, padding: "12px 0" }}>Loading messages…</div>}
            {!msgsLoading && messages.length === 0 && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, textAlign: "center", color: C.textSub, fontSize: 13 }}>No messages yet.</div>
            )}
            {!msgsLoading && messages.map((m, i) => {
              const isUnread = !m.read && m.recipient_id === user?.id;
              const date = new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <div key={m.id} className="t-msg"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 8, display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", transition: "border-color 0.15s" }}
                  onClick={() => nav("/messages")}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${C.gold}18`, border: `1px solid ${C.goldDim}`, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>M</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 2 }}>Modus Property Management</div>
                    <div style={{ fontSize: 12, color: C.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.body}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: C.textMuted }}>{date}</span>
                    {isUnread && <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.blue }} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </TenantLayout>
  );
}