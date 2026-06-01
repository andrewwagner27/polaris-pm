import { useNavigate } from "react-router-dom";
import { useTenant } from "./useTenant";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const s = {
  app: {
    width: "100%", maxWidth: "100%",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontSize: 14, color: "#1a1a1a",
    background: "#f4f5f7", minHeight: "100vh", paddingBottom: 80,
  },
  nav: {
    background: "#0C447C", padding: "16px 20px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  navLogo: { fontSize: 15, fontWeight: 600, color: "#E6F1FB" },
  navAvatar: {
    width: 34, height: 34, borderRadius: "50%",
    background: "#185FA5", border: "2px solid rgba(255,255,255,0.3)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer",
  },
  hero: {
    background: "linear-gradient(160deg, #0C447C 0%, #185FA5 100%)",
    padding: "20px 20px 32px",
  },
  greeting: { fontSize: 13, color: "#85B7EB", marginBottom: 3 },
  greetingName: { fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 18 },
  rentCard: {
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 14, padding: "16px 18px",
  },
  rentCardTop: {
    display: "flex", justifyContent: "space-between",
    alignItems: "flex-start", marginBottom: 14,
  },
  rentLabel: { fontSize: 11, color: "#85B7EB", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 },
  rentAmount: { fontSize: 34, fontWeight: 700, color: "#fff", lineHeight: 1 },
  rentSub: { fontSize: 12, color: "#85B7EB", marginTop: 3 },
  duePill: (overdue) => ({
    fontSize: 11, padding: "4px 10px",
    background: overdue ? "#FDECEA" : "#FAEEDA",
    color: overdue ? "#A32D2D" : "#854F0B",
    borderRadius: 20, fontWeight: 600, flexShrink: 0,
  }),
  payBtn: {
    width: "100%", padding: "11px", background: "#fff", border: "none",
    borderRadius: 8, fontSize: 14, fontWeight: 600, color: "#0C447C",
    cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", gap: 6,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  autoPay: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between", marginTop: 10, padding: "4px 2px",
  },
  autoPayText: { fontSize: 11, color: "#85B7EB" },
  autoPayBadge: {
    fontSize: 10, padding: "2px 8px",
    background: "rgba(255,255,255,0.15)",
    color: "#B5D4F4", borderRadius: 10, fontWeight: 500,
  },
  section: { padding: "20px 20px 0" },
  sectionHeader: {
    display: "flex", justifyContent: "space-between",
    alignItems: "center", marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: 600, color: "#555",
    letterSpacing: "0.07em", textTransform: "uppercase",
  },
  seeAll: {
    fontSize: 12, color: "#185FA5", cursor: "pointer",
    background: "none", border: "none",
    fontFamily: "'Inter', 'Segoe UI', sans-serif", padding: 0,
  },
  actionGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 },
  actionBtn: {
    background: "#fff", border: "1px solid #e8eaed", borderRadius: 12,
    padding: "14px 6px 12px", cursor: "pointer", textAlign: "center",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
  },
  actionIcon: (bg) => ({
    width: 40, height: 40, borderRadius: 10, background: bg,
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
  }),
  actionLabel: { fontSize: 11, fontWeight: 500, color: "#333", lineHeight: 1.2 },
  card: { background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, overflow: "hidden" },
  cardInner: { padding: "0 14px" },
  paymentItem: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "11px 0",
  },
  paymentLeft: { display: "flex", alignItems: "center", gap: 12 },
  paymentDot: (color) => ({ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }),
  paymentDesc: { fontSize: 13, fontWeight: 500, color: "#1a1a1a" },
  paymentDate: { fontSize: 11, color: "#aaa", marginTop: 2 },
  paymentAmount: (color) => ({ fontSize: 13, fontWeight: 600, color }),
  maintItem: {
    background: "#fff", border: "1px solid #e8eaed", borderRadius: 10,
    padding: "12px 14px", marginBottom: 8,
    display: "flex", justifyContent: "space-between",
    alignItems: "flex-start", gap: 10,
  },
  maintTitle: { fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 3 },
  maintSub: { fontSize: 11, color: "#888" },
  badge: (bg, color) => ({
    fontSize: 10, padding: "3px 8px", background: bg, color,
    borderRadius: 10, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap",
  }),
  msgItem: {
    background: "#fff", border: "1px solid #e8eaed", borderRadius: 10,
    padding: "12px 14px", marginBottom: 8,
    display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer",
  },
  msgAvatar: {
    width: 38, height: 38, borderRadius: "50%", background: "#E6F1FB",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 13, fontWeight: 600, color: "#185FA5", flexShrink: 0,
  },
  msgBody: { flex: 1, minWidth: 0 },
  msgName: { fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 2 },
  msgPreview: { fontSize: 12, color: "#888", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  msgTime: { fontSize: 11, color: "#aaa", flexShrink: 0 },
  unreadDot: { width: 8, height: 8, borderRadius: "50%", background: "#185FA5", marginTop: 4, flexShrink: 0 },
  emptyState: { textAlign: "center", padding: "20px 0 10px", color: "#aaa", fontSize: 13 },
};

const STATUS_COLORS = {
  in_progress: { bg: "#E6F1FB", color: "#185FA5", label: "In progress" },
  resolved:    { bg: "#EAF3DE", color: "#3B6D11", label: "Resolved" },
  open:        { bg: "#FAEEDA", color: "#854F0B", label: "Open" },
};

const ACTIONS = [
  { icon: "💳", label: "Pay rent",  bg: "#E6F1FB", route: "/pay" },
  { icon: "🔧", label: "Request",   bg: "#EAF3DE", route: "/maintenance" },
  { icon: "💬", label: "Messages",  bg: "#F3EEFB", route: "/messages" },
  { icon: "📄", label: "Documents", bg: "#FAEEDA", route: "/documents" },
];

export default function HomeDashboard({ onNavigate }) {
  const navigate = useNavigate();
  const { tenant, user, loading } = useTenant();
  const [messages, setMessages]   = useState([]);
  const [msgsLoading, setMsgsLoading] = useState(true);

  const nav = onNavigate || navigate;

  useEffect(() => {
    if (user) fetchMessages();
  }, [user]);

  async function fetchMessages() {
    setMsgsLoading(true);
    // Find tenant record for this user
    const { data: tenantData } = await supabase
      .from("tenants")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!tenantData) { setMsgsLoading(false); return; }

    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("tenant_id", tenantData.id)
      .order("created_at", { ascending: false })
      .limit(3);

    setMessages(data || []);
    setMsgsLoading(false);
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "'Inter',sans-serif", color: "#888" }}>
      Loading your portal…
    </div>
  );

  const firstName    = (tenant?.name || "Tenant").split(" ")[0];
  const unitNum      = tenant?.unit || "—";
  const propName     = tenant?.property || "Your Property";
  const rentAmount   = tenant?.rent || 0;
  const payments     = tenant?.payments || [];
  const maintenance  = tenant?.maintenance || [];
  const initials     = (tenant?.name || "T").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const unreadCount  = messages.filter(m => !m.read && m.recipient_id === user?.id).length;

  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  return (
    <div style={s.app}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; }`}</style>

      {/* Top nav */}
      <div style={s.nav}>
        <span style={s.navLogo}>🏢 Polaris Tenant</span>
        <div style={s.navAvatar} onClick={() => nav("/account")}>{initials}</div>
      </div>

      {/* Hero */}
      <div style={s.hero}>
        <div style={s.greeting}>Good {timeOfDay},</div>
        <div style={s.greetingName}>{firstName} 👋</div>
        <div style={s.rentCard}>
          <div style={s.rentCardTop}>
            <div>
              <div style={s.rentLabel}>Rent due</div>
              <div style={s.rentAmount}>{rentAmount > 0 ? `$${rentAmount.toLocaleString()}` : "—"}</div>
              <div style={s.rentSub}>Unit {unitNum} · {propName}</div>
            </div>
            <span style={s.duePill(false)}>Due 1st</span>
          </div>
          <button style={s.payBtn} onClick={() => nav("/pay")}>💳 Pay now</button>
          <div style={s.autoPay}>
            <span style={s.autoPayText}>Autopay is off</span>
            <span style={s.autoPayBadge}>Turn on</span>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>Quick actions</span>
        </div>
        <div style={s.actionGrid}>
          {ACTIONS.map((a, i) => (
            <button key={i} style={s.actionBtn} onClick={() => nav(a.route)}>
              <div style={s.actionIcon(a.bg)}>{a.icon}</div>
              <span style={s.actionLabel}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Payment history */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>Payment history</span>
          <button style={s.seeAll} onClick={() => nav("/pay")}>See all</button>
        </div>
        <div style={s.card}>
          <div style={s.cardInner}>
            {payments.length === 0 && (
              <div style={s.emptyState}>No payment history yet.</div>
            )}
            {payments.slice(0, 4).map((p, i) => {
              const amount = (p.amount_cents || 0) / 100;
              const date   = p.paid_at
                ? new Date(p.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              const isPaid = p.status === "paid";
              return (
                <div key={p.id} style={{ ...s.paymentItem, borderBottom: i === Math.min(payments.length, 4) - 1 ? "none" : "1px solid #f0f0f0" }}>
                  <div style={s.paymentLeft}>
                    <div style={s.paymentDot(isPaid ? "#639922" : "#E24B4A")} />
                    <div>
                      <div style={s.paymentDesc}>{isPaid ? "Rent payment" : "Payment failed"}</div>
                      <div style={s.paymentDate}>{date}</div>
                    </div>
                  </div>
                  <span style={s.paymentAmount(isPaid ? "#3B6D11" : "#A32D2D")}>
                    ${amount.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Maintenance */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>Maintenance</span>
          <button style={s.seeAll} onClick={() => nav("/maintenance")}>See all</button>
        </div>
        {maintenance.length === 0 && (
          <div style={{ ...s.emptyState, background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: 20 }}>
            No maintenance requests yet.
          </div>
        )}
        {maintenance.slice(0, 3).map((m, i) => {
          const sc = STATUS_COLORS[m.status] || STATUS_COLORS.open;
          const date = new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return (
            <div key={m.id} style={{ ...s.maintItem, cursor: "pointer" }} onClick={() => nav(`/maintenance/${m.id}`)}>
              <div>
                <div style={s.maintTitle}>{m.title}</div>
                <div style={s.maintSub}>Submitted {date}</div>
              </div>
              <span style={s.badge(sc.bg, sc.color)}>{sc.label}</span>
            </div>
          );
        })}
      </div>

      {/* Messages */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>
            Messages {unreadCount > 0 && (
              <span style={{ background: "#185FA5", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 6px", marginLeft: 4 }}>
                {unreadCount}
              </span>
            )}
          </span>
          <button style={s.seeAll} onClick={() => nav("/messages")}>See all</button>
        </div>
        {msgsLoading && <div style={s.emptyState}>Loading messages…</div>}
        {!msgsLoading && messages.length === 0 && (
          <div style={{ ...s.emptyState, background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: 20 }}>
            No messages yet.
          </div>
        )}
        {!msgsLoading && messages.map((m, i) => {
          const isUnread = !m.read && m.recipient_id === user?.id;
          const date = new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return (
            <div key={m.id} style={s.msgItem} onClick={() => nav("/messages")}>
              <div style={s.msgAvatar}>PP</div>
              <div style={s.msgBody}>
                <div style={s.msgName}>Polaris Properties</div>
                <div style={s.msgPreview}>{m.body}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                <span style={s.msgTime}>{date}</span>
                {isUnread && <div style={s.unreadDot} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}