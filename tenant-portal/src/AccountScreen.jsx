import { useState } from "react";
import { useNavigate } from "react-router-dom";

const s = {
  app: {
    width: "100%",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontSize: 14,
    color: "#1a1a1a",
    background: "#f4f5f7",
    minHeight: "100vh",
    paddingBottom: 80,
  },
  header: {
    background: "linear-gradient(160deg, #0C447C 0%, #185FA5 100%)",
    padding: "28px 20px 32px",
    textAlign: "center",
  },
  avatarWrap: {
    position: "relative",
    width: 72, height: 72,
    margin: "0 auto 12px",
  },
  avatar: {
    width: 72, height: 72, borderRadius: "50%",
    background: "rgba(255,255,255,0.2)",
    border: "3px solid rgba(255,255,255,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 24, fontWeight: 700, color: "#fff",
  },
  avatarEdit: {
    position: "absolute", bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: "50%",
    background: "#fff", border: "2px solid #185FA5",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 10, cursor: "pointer",
  },
  tenantName: { fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 3 },
  tenantSub: { fontSize: 12, color: "#85B7EB", marginBottom: 14 },
  leaseBadge: {
    display: "inline-flex", alignItems: "center", gap: 6,
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: 20, padding: "5px 14px",
    fontSize: 12, color: "#E6F1FB",
  },
  body: { padding: "16px 16px 0" },
  sectionTitle: {
    fontSize: 11, fontWeight: 600, color: "#555",
    letterSpacing: "0.07em", textTransform: "uppercase",
    marginBottom: 10, marginTop: 20,
  },
  menuCard: {
    background: "#fff",
    border: "1px solid #e8eaed",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 16,
  },
  menuItem: (last) => ({
    display: "flex", alignItems: "center",
    padding: "14px 16px",
    borderBottom: last ? "none" : "1px solid #f4f5f7",
    cursor: "pointer",
    gap: 14,
    transition: "background 0.1s",
  }),
  menuIconWrap: (bg) => ({
    width: 38, height: 38, borderRadius: 10,
    background: bg,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 18, flexShrink: 0,
  }),
  menuLabel: { fontSize: 13, fontWeight: 600, color: "#1a1a1a" },
  menuSub: { fontSize: 11, color: "#888", marginTop: 2 },
  menuRight: {
    marginLeft: "auto", display: "flex",
    alignItems: "center", gap: 8,
  },
  menuBadge: (color, bg) => ({
    fontSize: 10, fontWeight: 600,
    padding: "2px 8px", borderRadius: 10,
    background: bg, color,
  }),
  menuArrow: { fontSize: 16, color: "#ccc" },
  leaseCard: {
    background: "#fff",
    border: "1px solid #e8eaed",
    borderRadius: 14,
    padding: "16px",
    marginBottom: 16,
  },
  leaseRow: {
    display: "flex", justifyContent: "space-between",
    alignItems: "center", padding: "7px 0",
    borderBottom: "1px solid #f4f5f7",
  },
  leaseRowLast: {
    display: "flex", justifyContent: "space-between",
    alignItems: "center", padding: "7px 0",
  },
  leaseKey: { fontSize: 13, color: "#888" },
  leaseVal: { fontSize: 13, fontWeight: 600, color: "#1a1a1a" },
  progressWrap: { marginTop: 14 },
  progressLabel: {
    display: "flex", justifyContent: "space-between",
    fontSize: 11, color: "#888", marginBottom: 6,
  },
  progressTrack: {
    height: 6, background: "#f0f0f0",
    borderRadius: 3, overflow: "hidden",
  },
  progressFill: (pct) => ({
    height: "100%", width: `${pct}%`,
    background: "linear-gradient(90deg, #185FA5, #0C447C)",
    borderRadius: 3, transition: "width 0.3s",
  }),
  signOutBtn: {
    width: "100%", padding: "13px",
    background: "#fff",
    border: "1px solid #e8eaed",
    borderRadius: 12, fontSize: 14,
    fontWeight: 600, color: "#A32D2D",
    cursor: "pointer",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    marginBottom: 12,
  },
  versionText: {
    fontSize: 11, color: "#ccc",
    textAlign: "center", paddingBottom: 8,
  },
};

const MENU_ITEMS = [
  {
    section: "Payments",
    items: [
      { icon: "📄", bg: "#EAF3DE", label: "Payment Ledger", sub: "Download official PDF", route: null, action: "ledger", badge: null },
      { icon: "💳", bg: "#E6F1FB", label: "Pay Rent",       sub: "June · $1,150 due Jun 1", route: "/pay", badge: { label: "Due", color: "#854F0B", bg: "#FAEEDA" } },
      { icon: "🔄", bg: "#F3EEFB", label: "Autopay",        sub: "Currently off",           route: null, action: "autopay", badge: null },
    ]
  },
  {
    section: "Compliance",
    items: [
      { icon: "🛡️", bg: "#EAF3DE", label: "Renters Insurance", sub: "Verified · Expires Dec 31, 2026", route: "/insurance", badge: { label: "Verified", color: "#3B6D11", bg: "#EAF3DE" } },
      { icon: "📋", bg: "#E6F1FB", label: "Documents",          sub: "8 files · 2 new",               route: "/documents", badge: { label: "2 new", color: "#185FA5", bg: "#E6F1FB" } },
    ]
  },
  {
    section: "Community",
    items: [
      { icon: "📌", bg: "#FAEEDA", label: "Bulletin Board", sub: "4 posts from neighbors", route: "/bulletin", badge: null },
      { icon: "💬", bg: "#F3EEFB", label: "Messages",       sub: "1 unread message",       route: "/messages", badge: { label: "1", color: "#fff", bg: "#185FA5" } },
    ]
  },
  {
    section: "Settings",
    items: [
      { icon: "👤", bg: "#f4f5f7", label: "Profile",       sub: "Name, email, phone",      route: null, action: "profile", badge: null },
      { icon: "🔔", bg: "#f4f5f7", label: "Notifications", sub: "Rent reminders, alerts",  route: null, action: "notifs",  badge: null },
      { icon: "🔒", bg: "#f4f5f7", label: "Password",      sub: "Change your password",    route: null, action: "password", badge: null },
    ]
  },
];

// Lease progress calculation
function leaseProgress() {
  const start = new Date("2026-01-01");
  const end   = new Date("2026-12-31");
  const today = new Date();
  const total = end - start;
  const elapsed = today - start;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

export default function AccountScreen() {
  const navigate = useNavigate();
  const [downloading, setDownloading] = useState(false);

  async function handleLedger() {
    setDownloading(true);
    // TODO: trigger TenantLedgerPDF generate function
    await new Promise(r => setTimeout(r, 800));
    setDownloading(false);
    navigate("/home"); // replace with actual PDF trigger
  }

  function handleItem(item) {
    if (item.route) { navigate(item.route); return; }
    if (item.action === "ledger") { handleLedger(); return; }
    // other actions handled later
  }

  const progress = leaseProgress();

  return (
    <div style={s.app}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; }`}</style>

      {/* ── Header ── */}
      <div style={s.header}>
        <div style={s.avatarWrap}>
          <div style={s.avatar}>MR</div>
          <div style={s.avatarEdit}>✏️</div>
        </div>
        <div style={s.tenantName}>Maria Rodriguez</div>
        <div style={s.tenantSub}>maria@email.com · (614) 555-0192</div>
        <div style={s.leaseBadge}>
          <span style={{ color: "#4CAF50" }}>●</span> Active tenant · Unit 4B
        </div>
      </div>

      <div style={s.body}>

        {/* ── Lease progress card ── */}
        <div style={{ ...s.sectionTitle, marginTop: 16 }}>Lease summary</div>
        <div style={s.leaseCard}>
          {[
            ["Property",    "Clifton Manor"],
            ["Address",     "12009 Clifton Blvd, Lakewood OH"],
            ["Lease start", "January 1, 2026"],
            ["Lease end",   "December 31, 2026"],
            ["Monthly rent","$1,150.00"],
          ].map(([k, v], i, arr) => (
            <div key={k} style={i === arr.length - 1 ? s.leaseRowLast : s.leaseRow}>
              <span style={s.leaseKey}>{k}</span>
              <span style={s.leaseVal}>{v}</span>
            </div>
          ))}
          <div style={s.progressWrap}>
            <div style={s.progressLabel}>
              <span>Lease progress</span>
              <span>{progress}% complete</span>
            </div>
            <div style={s.progressTrack}>
              <div style={s.progressFill(progress)} />
            </div>
          </div>
        </div>

        {/* ── Menu sections ── */}
        {MENU_ITEMS.map(section => (
          <div key={section.section}>
            <div style={s.sectionTitle}>{section.section}</div>
            <div style={s.menuCard}>
              {section.items.map((item, i) => (
                <div
                  key={item.label}
                  style={s.menuItem(i === section.items.length - 1)}
                  onClick={() => handleItem(item)}
                >
                  <div style={s.menuIconWrap(item.bg)}>{item.icon}</div>
                  <div>
                    <div style={s.menuLabel}>{item.label}</div>
                    <div style={s.menuSub}>{item.action === "ledger" && downloading ? "Generating PDF…" : item.sub}</div>
                  </div>
                  <div style={s.menuRight}>
                    {item.badge && (
                      <span style={s.menuBadge(item.badge.color, item.badge.bg)}>
                        {item.badge.label}
                      </span>
                    )}
                    <span style={s.menuArrow}>›</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* ── Sign out ── */}
        <button style={s.signOutBtn} onClick={() => navigate("/login")}>
          Sign out
        </button>
        <div style={s.versionText}>Polaris Tenant v1.0 · Built with ♥ in Columbus, OH</div>

      </div>
    </div>
  );
}
