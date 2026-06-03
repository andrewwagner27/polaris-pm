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

function SectionLabel({ children }) {
  return <div style={{ fontSize: 13, fontWeight: 600, color: C.textSub, letterSpacing: "0.04em" }}>{children}</div>;
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

  return (
    <TenantLayout tenantName={tenant?.name || "Tenant"} unreadMessages={unreadCount}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        .t-row:hover { background: ${C.raised} !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif", padding: "40px 48px 80px", maxWidth: 1000, margin: "0 auto" }}>

        {/* Greeting */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 13, color: C.textSub, marginBottom: 4 }}>Good {timeOfDay}</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 40, fontWeight: 600, color: C.text, lineHeight: 1 }}>{firstName}</div>
        </div>

        {/* Top row — rent + stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 12 }}>

          {/* Rent card */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "24px 28px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 16 }}>Rent due</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 52, fontWeight: 600, color: C.gold, lineHeight: 1, marginBottom: 10 }}>
                {rentAmount > 0 ? `$${rentAmount.toLocaleString()}` : "—"}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: C.textSub }}>Unit {tenant?.unit || "—"} · {tenant?.property || "—"}</div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", background: "rgba(240,164,48,0.13)", color: C.amber, borderRadius: 20 }}>Due 1st</span>
              </div>
            </div>
            <div>
              <button onClick={() => nav("/pay")} style={{ width: "100%", padding: "11px", background: C.goldDim, border: "none", borderRadius: 7, fontSize: 14, fontWeight: 500, color: C.text, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.02em", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "opacity 0.15s" }}
                onMouseOver={e => e.currentTarget.style.opacity = "0.85"}
                onMouseOut={e => e.currentTarget.style.opacity = "1"}
              >Pay rent →</button>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                <span style={{ fontSize: 11, color: C.textMuted }}>Autopay is off</span>
                <span style={{ fontSize: 11, color: C.goldDim, cursor: "pointer" }}>Turn on →</span>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {/* Payment history */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: `1px solid ${C.border}` }}>
              <SectionLabel>Payment history</SectionLabel>
              <button onClick={() => nav("/pay")} style={{ fontSize: 11, color: C.goldDim, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "color 0.15s" }}
                onMouseOver={e => e.currentTarget.style.color = C.gold}
                onMouseOut={e => e.currentTarget.style.color = C.goldDim}
              >See all →</button>
            </div>
            {payments.length === 0 ? (
              <div style={{ padding: "28px 22px", textAlign: "center", color: C.textMuted, fontSize: 13 }}>No payment history yet.</div>
            ) : payments.slice(0, 4).map((p, i) => {
              const amount = (p.amount_cents || 0) / 100;
              const date   = new Date(p.paid_at || p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
              const isPaid = p.status === "paid";
              return (
                <div key={p.id} className="t-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 22px", borderBottom: i < Math.min(payments.length, 4) - 1 ? `1px solid ${C.border}` : "none", transition: "background 0.12s" }}>
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

          {/* Right col — maintenance + messages */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: `1px solid ${C.border}` }}>
                <SectionLabel>Maintenance</SectionLabel>
                <button onClick={() => nav("/maintenance")} style={{ fontSize: 11, color: C.goldDim, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "color 0.15s" }}
                  onMouseOver={e => e.currentTarget.style.color = C.gold}
                  onMouseOut={e => e.currentTarget.style.color = C.goldDim}
                >See all →</button>
              </div>
              {maintenance.length === 0 ? (
                <div style={{ padding: "20px 22px", textAlign: "center", color: C.textMuted, fontSize: 13 }}>No maintenance requests yet.</div>
              ) : maintenance.slice(0, 3).map((m, i) => (
                <div key={m.id} className="t-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 22px", borderBottom: i < Math.min(maintenance.length, 3) - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", transition: "background 0.12s" }}
                  onClick={() => nav(`/maintenance/${m.id}`)}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{m.title}</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>Submitted {new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                  </div>
                  <Badge status={m.status} />
                </div>
              ))}
            </div>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <SectionLabel>Messages</SectionLabel>
                  {unreadCount > 0 && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 8, background: C.blue, color: "#fff", marginTop: -2 }}>{unreadCount}</span>}
                </div>
                <button onClick={() => nav("/messages")} style={{ fontSize: 11, color: C.goldDim, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "color 0.15s" }}
                  onMouseOver={e => e.currentTarget.style.color = C.gold}
                  onMouseOut={e => e.currentTarget.style.color = C.goldDim}
                >See all →</button>
              </div>
              {msgsLoading ? (
                <div style={{ padding: "20px 22px", color: C.textMuted, fontSize: 13 }}>Loading…</div>
              ) : messages.length === 0 ? (
                <div style={{ padding: "20px 22px", textAlign: "center", color: C.textMuted, fontSize: 13 }}>No messages yet.</div>
              ) : messages.slice(0, 3).map((m, i) => {
                const isUnread = !m.read && m.recipient_id === user?.id;
                return (
                  <div key={m.id} className="t-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 22px", borderBottom: i < Math.min(messages.length, 3) - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", transition: "background 0.12s" }}
                    onClick={() => nav("/messages")}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${C.gold}18`, border: `1px solid ${C.goldDim}`, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>M</div>
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