import { useState } from "react";

const s = {
  app: {
    width: "100%",
    maxWidth: "100%",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontSize: 14,
    color: "#1a1a1a",
    background: "#f4f5f7",
    minHeight: "100vh",
    paddingBottom: 80,
  },
  // ── Top nav ──
  nav: {
    background: "#0C447C",
    padding: "16px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navLogo: { fontSize: 15, fontWeight: 600, color: "#E6F1FB" },
  navAvatar: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    background: "#185FA5",
    border: "2px solid rgba(255,255,255,0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    cursor: "pointer",
  },
  // ── Hero ──
  hero: {
    background: "linear-gradient(160deg, #0C447C 0%, #185FA5 100%)",
    padding: "20px 20px 32px",
  },
  greeting: { fontSize: 13, color: "#85B7EB", marginBottom: 3 },
  greetingName: { fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 18 },
  rentCard: {
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 14,
    padding: "16px 18px",
  },
  rentCardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
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
    width: "100%",
    padding: "11px",
    background: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    color: "#0C447C",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  autoPay: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    padding: "4px 2px",
  },
  autoPayText: { fontSize: 11, color: "#85B7EB" },
  autoPayBadge: {
    fontSize: 10, padding: "2px 8px",
    background: "rgba(255,255,255,0.15)",
    color: "#B5D4F4", borderRadius: 10, fontWeight: 500,
  },
  // ── Sections ──
  section: { padding: "20px 20px 0" },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
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
  // ── Quick actions ──
  actionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 10,
  },
  actionBtn: (color) => ({
    background: "#fff",
    border: "1px solid #e8eaed",
    borderRadius: 12,
    padding: "14px 6px 12px",
    cursor: "pointer",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    transition: "border-color 0.15s",
  }),
  actionIcon: (color) => ({
    width: 40,
    height: 40,
    borderRadius: 10,
    background: color,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
  }),
  actionLabel: {
    fontSize: 11, fontWeight: 500, color: "#333", lineHeight: 1.2,
  },
  // ── Payment history ──
  paymentItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "11px 0",
    borderBottom: "1px solid #f0f0f0",
  },
  paymentLeft: { display: "flex", alignItems: "center", gap: 12 },
  paymentDot: (color) => ({
    width: 9, height: 9, borderRadius: "50%",
    background: color, flexShrink: 0,
  }),
  paymentDesc: { fontSize: 13, fontWeight: 500, color: "#1a1a1a" },
  paymentDate: { fontSize: 11, color: "#aaa", marginTop: 2 },
  paymentAmount: (color) => ({ fontSize: 13, fontWeight: 600, color }),
  // ── Maintenance ──
  maintItem: {
    background: "#fff",
    border: "1px solid #e8eaed",
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 8,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  maintTitle: { fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 3 },
  maintSub: { fontSize: 11, color: "#888" },
  badge: (bg, color) => ({
    fontSize: 10, padding: "3px 8px",
    background: bg, color, borderRadius: 10,
    fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap",
  }),
  // ── Messages ──
  msgItem: {
    background: "#fff",
    border: "1px solid #e8eaed",
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 8,
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    cursor: "pointer",
  },
  msgAvatar: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    background: "#E6F1FB",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 600,
    color: "#185FA5",
    flexShrink: 0,
  },
  msgBody: { flex: 1, minWidth: 0 },
  msgName: { fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 2 },
  msgPreview: {
    fontSize: 12, color: "#888",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  msgTime: { fontSize: 11, color: "#aaa", flexShrink: 0 },
  unreadDot: {
    width: 8, height: 8, borderRadius: "50%",
    background: "#185FA5", marginTop: 4, flexShrink: 0,
  },
  // ── Bottom nav ──
  bottomNav: {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: 460,
    background: "#fff",
    borderTop: "1px solid #e8eaed",
    display: "flex",
    zIndex: 100,
  },
  bnItem: (active) => ({
    flex: 1,
    padding: "10px 0 8px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    cursor: "pointer",
    background: "none",
    border: "none",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  }),
  bnIcon: { fontSize: 20 },
  bnLabel: (active) => ({
    fontSize: 10,
    fontWeight: active ? 600 : 400,
    color: active ? "#0C447C" : "#aaa",
  }),
  emptyState: {
    textAlign: "center",
    padding: "20px 0 10px",
    color: "#aaa",
    fontSize: 13,
  },
  card: {
    background: "#fff",
    border: "1px solid #e8eaed",
    borderRadius: 12,
    overflow: "hidden",
  },
  cardInner: { padding: "0 14px" },
};

const PAYMENTS = [
  { desc: "May rent",  date: "May 1, 2026",  amount: -1150, status: "paid" },
  { desc: "Apr rent",  date: "Apr 1, 2026",  amount: -1150, status: "paid" },
  { desc: "Late fee",  date: "Mar 6, 2026",  amount: -75,   status: "fee" },
  { desc: "Mar rent",  date: "Mar 1, 2026",  amount: -1150, status: "paid" },
];

const MAINTENANCE = [
  { title: "Kitchen faucet dripping", date: "Submitted May 18", status: "in_progress", statusLabel: "In progress" },
  { title: "Bathroom exhaust fan",    date: "Resolved Apr 22",  status: "resolved",    statusLabel: "Resolved" },
];

const MESSAGES = [
  { from: "Polaris Properties", preview: "Hi Maria — confirming the plumber visit on Jun 2 between 10am–12pm. Please make sure someone is home.", time: "Today", unread: true },
  { from: "Polaris Properties", preview: "Your May rent payment of $1,150 was received. Thank you!", time: "May 1", unread: false },
];

const STATUS_COLORS = {
  in_progress: { bg: "#E6F1FB", color: "#185FA5" },
  resolved:    { bg: "#EAF3DE", color: "#3B6D11" },
  open:        { bg: "#FAEEDA", color: "#854F0B" },
};

const ACTIONS = [
  { icon: "💳", label: "Pay rent",   bg: "#E6F1FB", route: "/pay" },
  { icon: "🔧", label: "Request",    bg: "#EAF3DE", route: "/maintenance" },
  { icon: "💬", label: "Messages",   bg: "#F3EEFB", route: "/messages" },
  { icon: "📄", label: "Documents",  bg: "#FAEEDA", route: "/documents" },
];

const NAV_ITEMS = [
  { icon: "🏠", label: "Home" },
  { icon: "💳", label: "Pay" },
  { icon: "🔧", label: "Requests" },
  { icon: "💬", label: "Messages" },
];

export default function HomeDashboard({ onNavigate }) {
  const [activeNav, setActiveNav] = useState(0);
  const unreadCount = MESSAGES.filter(m => m.unread).length;

  return (
    <div style={s.app}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; }`}</style>

      {/* ── Top nav ── */}
      <div style={s.nav}>
        <span style={s.navLogo}>🏢 Polaris Tenant</span>
        <div style={s.navAvatar}>MR</div>
      </div>

      {/* ── Hero / rent card ── */}
      <div style={s.hero}>
        <div style={s.greeting}>Good evening,</div>
        <div style={s.greetingName}>Maria Rodriguez 👋</div>

        <div style={s.rentCard}>
          <div style={s.rentCardTop}>
            <div>
              <div style={s.rentLabel}>Rent due</div>
              <div style={s.rentAmount}>$1,150</div>
              <div style={s.rentSub}>Unit 4B · Clifton Manor</div>
            </div>
            <span style={s.duePill(false)}>Due Jun 1</span>
          </div>

          <button style={s.payBtn} onClick={() => onNavigate('/pay')}>💳 Pay now</button>

          <div style={s.autoPay}>
            <span style={s.autoPayText}>Autopay is off</span>
            <span style={s.autoPayBadge}>Turn on</span>
          </div>
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>Quick actions</span>
        </div>
        <div style={s.actionGrid}>
          {ACTIONS.map((a, i) => (
            <button key={i} style={s.actionBtn(a.bg)} onClick={() => onNavigate(a.route)}>
              <div style={s.actionIcon(a.bg)}>{a.icon}</div>
              <span style={s.actionLabel}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Payment history ── */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>Payment history</span>
          <button style={s.seeAll}>See all</button>
        </div>
        <div style={s.card}>
          <div style={s.cardInner}>
            {PAYMENTS.map((p, i) => (
              <div key={i} style={{ ...s.paymentItem, borderBottom: i === PAYMENTS.length - 1 ? "none" : "1px solid #f0f0f0" }}>
                <div style={s.paymentLeft}>
                  <div style={s.paymentDot(p.status === "fee" ? "#E24B4A" : "#639922")} />
                  <div>
                    <div style={s.paymentDesc}>{p.desc}</div>
                    <div style={s.paymentDate}>{p.date}</div>
                  </div>
                </div>
                <span style={s.paymentAmount(p.status === "fee" ? "#A32D2D" : "#3B6D11")}>
                  ${Math.abs(p.amount).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

{/* ── Bulletin Board ── */}
<div style={s.section}>
  <div style={s.sectionHeader}>
    <span style={s.sectionTitle}>Community</span>
  </div>
  <div
    style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
    onClick={() => onNavigate("/bulletin")}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 22 }}>📋</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>Bulletin Board</div>
        <div style={{ fontSize: 11, color: "#888" }}>4 posts · For sale, lost & found, events</div>
      </div>
    </div>
    <span style={{ fontSize: 18, color: "#aaa" }}>›</span>
  </div>
</div>

      {/* ── Maintenance requests ── */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>Maintenance</span>
          <button style={s.seeAll} onClick={() => onNavigate("/maintenance")}>+ New request</button>
        </div>
        {MAINTENANCE.map((m, i) => {
          const sc = STATUS_COLORS[m.status] || STATUS_COLORS.open;
          return (
            <div key={i} style={s.maintItem}>
              <div>
                <div style={s.maintTitle}>{m.title}</div>
                <div style={s.maintSub}>{m.date}</div>
              </div>
              <span style={s.badge(sc.bg, sc.color)}>{m.statusLabel}</span>
            </div>
          );
        })}
      </div>

      {/* ── Messages ── */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>
            Messages {unreadCount > 0 && (
              <span style={{ background: "#185FA5", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 6px", marginLeft: 4 }}>
                {unreadCount}
              </span>
            )}
          </span>
          <button style={s.seeAll}>See all</button>
        </div>
        {MESSAGES.map((m, i) => (
          <div key={i} style={s.msgItem}>
            <div style={s.msgAvatar}>PP</div>
            <div style={s.msgBody}>
              <div style={s.msgName}>{m.from}</div>
              <div style={s.msgPreview}>{m.preview}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
              <span style={s.msgTime}>{m.time}</span>
              {m.unread && <div style={s.unreadDot} />}
            </div>
          </div>
        ))}
      </div>

      {/* ── Bottom nav ── */}
      <div style={s.bottomNav}>
        {NAV_ITEMS.map((item, i) => (
          <button key={i} style={s.bnItem(activeNav === i)} onClick={() => setActiveNav(i)}>
            <span style={s.bnIcon}>{item.icon}</span>
            <span style={s.bnLabel(activeNav === i)}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
