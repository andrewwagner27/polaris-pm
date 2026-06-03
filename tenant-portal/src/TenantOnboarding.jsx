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
  open:        { label: "Open",        color: "#F0A430", bg: "rgba(240,164,48,0.13)" },
  in_progress: { label: "In progress", color: "#4A9AE8", bg: "rgba(74,154,232,0.13)" },
  resolved:    { label: "Resolved",    color: "#72B02A", bg: "rgba(114,176,42,0.13)" },
};

// SVG icon stencils — clean, no emojis
function Icon({ name, size = 16, color = C.textSub }) {
  const icons = {
    pay:      <><rect x="2" y="5" width="20" height="14" rx="2" stroke={color} strokeWidth="1.5" fill="none"/><path d="M2 10h20" stroke={color} strokeWidth="1.5"/></>,
    request:  <><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke={color} strokeWidth="1.5" fill="none"/></>,
    messages: <><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke={color} strokeWidth="1.5" fill="none"/></>,
    docs:     <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke={color} strokeWidth="1.5" fill="none"/><polyline points="14 2 14 8 20 8" stroke={color} strokeWidth="1.5" fill="none"/></>,
    arrow:    <><path d="M5 12h14M12 5l7 7-7 7" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></>,
    check:    <><polyline points="20 6 9 17 4 12" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></>,
    alert:    <><circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5" fill="none"/><line x1="12" y1="8" x2="12" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round"/><line x1="12" y1="16" x2="12.01" y2="16" stroke={color} strokeWidth="2" strokeLinecap="round"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {icons[name]}
    </svg>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>{children}</div>;
}

function Badge({ status }) {
  const s = STATUS[status] || STATUS.open;
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>{s.label}</span>;
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
    const { data } = await supabase.from("messages").select("*").eq("tenant_id", tenantData.id).order("created_at", { ascending: false }).limit(4);
    setMessages(data || []);
    setMsgsLoading(false);
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: C.bg, color: C.textSub, fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
      Loading your portal…
    </div>
  );

  const firstName   = (tenant?.name || "Tenant").split(" ")[0];
  const rentAmount  = tenant?.rent || 0;
  const payments    = tenant?.payments || [];
  const maintenance = tenant?.maintenance || [];
  const unreadCount = messages.filter(m => !m.read && m.recipient_id === user?.id).length;
  const openTickets = maintenance.filter(m => m.status !== "resolved").length;
  const hour        = new Date().getHours();
  const timeOfDay   = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  const ACTIONS = [
    { label: "Pay rent",   icon: "pay",      color: C.gold,  route: "/pay" },
    { label: "Request",    icon: "request",  color: C.blue,  route: "/maintenance" },
    { label: "Messages",   icon: "messages", color: C.green, route: "/messages", badge: unreadCount },
    { label: "Documents",  icon: "docs",     color: C.amber, route: "/documents" },
  ];

  return (
    <TenantLayout tenantName={tenant?.name || "Tenant"} unreadMessages={unreadCount}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        .t-action:hover { border-color: #353A44 !important; background: ${C.raised} !important; }
        .t-row:hover { background: ${C.raised} !important; }
        .t-maint:hover { border-color: #353A44 !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif", padding: "40px 48px 80px", maxWidth: 1000, margin: "0 auto" }}>

        {/* Greeting */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 13, color: C.textSub, marginBottom: 4 }}>Good {timeOfDay}</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 600, color: C.text, lineHeight: 1 }}>{firstName}</div>
        </div>

        {/* Top row — rent card + quick actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>

          {/* Rent card */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "24px 28px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Rent due</div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 44, fontWeight: 600, color: C.gold, lineHeight: 1, marginBottom: 6 }}>
                  {rentAmount > 0 ? `$${rentAmount.toLocaleString()}` : "—"}
                </div>
                <div style={{ fontSize: 12, color: C.textSub }}>Unit {tenant?.unit || "—"} · {tenant?.property || "—"}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, padding: "4px 12px", background: "rgba(240,164,48,0.13)", color: C.amber, borderRadius: 20, marginBottom: 4 }}>Due 1st</span>
            </div>
            <button onClick={() => nav("/pay")} style={{ width: "100%", padding: "11px", background: C.goldDim, border: "none", borderRadius: 7, fontSize: 14, fontWeight: 500, color: C.text, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.02em", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "opacity 0.15s" }}
              onMouseOver={e => e.currentTarget.style.opacity = "0.85"}
              onMouseOut={e => e.currentTarget.style.opacity = "1"}
            >
              Pay rent <Icon name="arrow" size={14} color={C.text} />
            </button>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
              <span style={{ fontSize: 11, color: C.textMuted }}>Autopay is off</span>
              <span style={{ fontSize: 11, color: C.goldDim, cursor: "pointer" }}>Turn on →</span>
            </div>
          </div>

          {/* Quick actions + stats */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Quick actions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {ACTIONS.map((a, i) => (
                <button key={i} className="t-action" onClick={() => nav(a.route)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: "16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "all 0.15s", position: "relative" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 7, background: `${a.color}15`, border: `1px solid ${a.color}28`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={a.icon} size={15} color={a.color} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{a.label}</span>
                  {a.badge > 0 && <span style={{ position: "absolute", top: 10, right: 10, background: C.red, color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 8, minWidth: 16, textAlign: "center" }}>{a.badge}</span>}
                </button>
              ))}
            </div>

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: "16px 18px" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Open tickets</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 600, color: openTickets > 0 ? C.amber : C.green, lineHeight: 1 }}>{openTickets}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>maintenance requests</div>
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: "16px 18px" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Messages</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 600, color: unreadCount > 0 ? C.blue : C.green, lineHeight: 1 }}>{unreadCount}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>unread</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom row — payment history + maintenance + messages */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {/* Payment history */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
              <SectionLabel>Payment history</SectionLabel>
              <button onClick={() => nav("/pay")} style={{ fontSize: 11, color: C.goldDim, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "color 0.15s" }}
                onMouseOver={e => e.currentTarget.style.color = C.gold}
                onMouseOut={e => e.currentTarget.style.color = C.goldDim}
              >See all →</button>
            </div>
            {payments.length === 0 ? (
              <div style={{ padding: "28px 20px", textAlign: "center", color: C.textMuted, fontSize: 13 }}>No payment history yet.</div>
            ) : payments.slice(0, 4).map((p, i) => {
              const amount = (p.amount_cents || 0) / 100;
              const date   = new Date(p.paid_at || p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
              const isPaid = p.status === "paid";
              return (
                <div key={p.id} className="t-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: i < Math.min(payments.length, 4) - 1 ? `1px solid ${C.border}` : "none", transition: "background 0.12s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: isPaid ? C.green : C.red, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{isPaid ? "Rent payment" : "Payment failed"}</div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>{date}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: isPaid ? C.green : C.red }}>${amount.toLocaleString()}</span>
                </div>
              );
            })}
          </div>

          {/* Right column — maintenance + messages stacked */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Maintenance */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
                <SectionLabel>Maintenance</SectionLabel>
                <button onClick={() => nav("/maintenance")} style={{ fontSize: 11, color: C.goldDim, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "color 0.15s" }}
                  onMouseOver={e => e.currentTarget.style.color = C.gold}
                  onMouseOut={e => e.currentTarget.style.color = C.goldDim}
                >See all →</button>
              </div>
              {maintenance.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", color: C.textMuted, fontSize: 13 }}>No maintenance requests yet.</div>
              ) : maintenance.slice(0, 3).map((m, i) => (
                <div key={m.id} className="t-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 20px", borderBottom: i < Math.min(maintenance.length, 3) - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", transition: "background 0.12s" }}
                  onClick={() => nav(`/maintenance/${m.id}`)}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{m.title}</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>Submitted {new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                  </div>
                  <Badge status={m.status} />
                </div>
              ))}
            </div>

            {/* Messages */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <SectionLabel>Messages</SectionLabel>
                  {unreadCount > 0 && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 8, background: C.blue, color: "#fff", marginTop: -10 }}>{unreadCount}</span>}
                </div>
                <button onClick={() => nav("/messages")} style={{ fontSize: 11, color: C.goldDim, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "color 0.15s" }}
                  onMouseOver={e => e.currentTarget.style.color = C.gold}
                  onMouseOut={e => e.currentTarget.style.color = C.goldDim}
                >See all →</button>
              </div>
              {msgsLoading ? (
                <div style={{ padding: "20px", color: C.textMuted, fontSize: 13 }}>Loading…</div>
              ) : messages.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", color: C.textMuted, fontSize: 13 }}>No messages yet.</div>
              ) : messages.slice(0, 3).map((m, i) => {
                const isUnread = !m.read && m.recipient_id === user?.id;
                return (
                  <div key={m.id} className="t-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 20px", borderBottom: i < Math.min(messages.length, 3) - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", transition: "background 0.12s" }}
                    onClick={() => nav("/messages")}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${C.gold}18`, border: `1px solid ${C.goldDim}`, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>M</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 1 }}>Modus Property Management</div>
                      <div style={{ fontSize: 11, color: C.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.body}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: C.textMuted }}>{new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      {isUnread && <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.blue }} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </TenantLayout>
  );
}