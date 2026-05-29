import { useState } from "react";

const TOTAL_RENT = 1150.00;

const INITIAL_ROOMMATES = [
  { id: 1, name: "Maria Rodriguez", initials: "MR", color: "#185FA5", bg: "#E6F1FB", share: 50, status: "paid",    paidAt: "May 1, 2026" },
  { id: 2, name: "Jordan Kim",      initials: "JK", color: "#3B6D11", bg: "#EAF3DE", share: 50, status: "pending", paidAt: null },
];

const STATUS = {
  paid:    { label: "Paid",    color: "#3B6D11", bg: "#EAF3DE" },
  pending: { label: "Pending", color: "#854F0B", bg: "#FAEEDA" },
  overdue: { label: "Overdue", color: "#A32D2D", bg: "#FDECEA" },
};

const s = {
  wrap: {
    background: "#fff",
    border: "1px solid #e8eaed",
    borderRadius: 12,
    overflow: "hidden",
    margin: "0 0 16px",
  },
  header: {
    background: "#f8f9fa",
    borderBottom: "1px solid #e8eaed",
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 13, fontWeight: 700, color: "#1a1a1a" },
  headerSub: { fontSize: 11, color: "#888", marginTop: 1 },
  totalBadge: {
    fontSize: 13, fontWeight: 700, color: "#0C447C",
    background: "#E6F1FB", padding: "4px 10px",
    borderRadius: 8,
  },
  body: { padding: "16px" },
  roommateCard: (isCurrentUser) => ({
    background: isCurrentUser ? "#f8f9fa" : "#fff",
    border: isCurrentUser ? "2px solid #185FA5" : "1px solid #e8eaed",
    borderRadius: 12,
    padding: "14px",
    marginBottom: 10,
  }),
  roommateTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  roommateLeft: { display: "flex", alignItems: "center", gap: 10 },
  avatar: (color, bg) => ({
    width: 36, height: 36, borderRadius: "50%",
    background: bg, color,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 12, fontWeight: 700, flexShrink: 0,
  }),
  roommateName: { fontSize: 13, fontWeight: 600, color: "#1a1a1a" },
  youBadge: {
    fontSize: 10, fontWeight: 600, color: "#185FA5",
    background: "#E6F1FB", padding: "1px 6px",
    borderRadius: 8, marginLeft: 4,
  },
  roommateAmount: { fontSize: 15, fontWeight: 700, color: "#1a1a1a" },
  statusBadge: (status) => ({
    fontSize: 10, fontWeight: 600,
    padding: "3px 8px", borderRadius: 10,
    background: STATUS[status].bg,
    color: STATUS[status].color,
  }),
  sliderWrap: { marginBottom: 10 },
  sliderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  sliderLabel: { fontSize: 11, color: "#888" },
  sliderPct: { fontSize: 13, fontWeight: 700, color: "#0C447C" },
  slider: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    outline: "none",
    cursor: "pointer",
  },
  shareBar: {
    background: "#f4f5f7",
    borderRadius: 8,
    height: 8,
    overflow: "hidden",
    marginBottom: 14,
    display: "flex",
  },
  shareSegment: (color, pct) => ({
    height: "100%",
    width: `${pct}%`,
    background: color,
    transition: "width 0.2s",
  }),
  splitLabel: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  splitDot: (color) => ({
    display: "flex", alignItems: "center", gap: 4,
    fontSize: 11, color: "#555",
  }),
  splitDotIcon: (color) => ({
    width: 8, height: 8, borderRadius: "50%", background: color,
  }),
  divider: {
    height: 1, background: "#f4f5f7", margin: "14px 0",
  },
  payBtn: {
    width: "100%", padding: "12px",
    background: "#0C447C", color: "#fff",
    border: "none", borderRadius: 8,
    fontSize: 14, fontWeight: 600,
    cursor: "pointer",
    display: "flex", alignItems: "center",
    justifyContent: "center", gap: 6,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    transition: "background 0.15s",
  },
  paidNotice: {
    width: "100%", padding: "11px",
    background: "#EAF3DE",
    border: "1px solid #c3e6a0",
    borderRadius: 8,
    fontSize: 13, fontWeight: 600, color: "#3B6D11",
    display: "flex", alignItems: "center",
    justifyContent: "center", gap: 6,
    textAlign: "center",
  },
  footerNote: {
    fontSize: 11, color: "#aaa",
    textAlign: "center", marginTop: 12,
    lineHeight: 1.5,
  },
  successOverlay: {
    textAlign: "center", padding: "20px 0 10px",
  },
};

export default function RoommateSplitter() {
  const [roommates, setRoommates] = useState(INITIAL_ROOMMATES);
  const [loading, setLoading]     = useState(false);
  const [paid, setPaid]           = useState(false);
  const currentUserId             = 1; // Maria is logged in

  // Keep shares summing to 100 when one slider moves
  function handleSliderChange(id, newShare) {
    const other = roommates.find(r => r.id !== id);
    if (!other) return;
    const clampedShare = Math.min(90, Math.max(10, newShare));
    const otherShare = 100 - clampedShare;
    setRoommates(prev => prev.map(r => {
      if (r.id === id)    return { ...r, share: clampedShare };
      if (r.id === other.id) return { ...r, share: otherShare };
      return r;
    }));
  }

  const currentUser = roommates.find(r => r.id === currentUserId);
  const myAmount    = ((currentUser.share / 100) * TOTAL_RENT).toFixed(2);
  const allPaid     = roommates.every(r => r.status === "paid");

  async function handlePayMyShare() {
    setLoading(true);
    await new Promise(r => setTimeout(r, 1800));
    setRoommates(prev => prev.map(r =>
      r.id === currentUserId
        ? { ...r, status: "paid", paidAt: "Today" }
        : r
    ));
    setLoading(false);
    setPaid(true);
  }

  return (
    <div style={s.wrap}>
      {/* ── Header ── */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={{ fontSize: 18 }}>👥</span>
          <div>
            <div style={s.headerTitle}>Roommate Split</div>
            <div style={s.headerSub}>{roommates.length} occupants · Unit 4B</div>
          </div>
        </div>
        <div style={s.totalBadge}>${TOTAL_RENT.toLocaleString()}</div>
      </div>

      <div style={s.body}>

        {/* ── Visual split bar ── */}
        <div style={s.shareBar}>
          {roommates.map(r => (
            <div key={r.id} style={s.shareSegment(r.color, r.share)} />
          ))}
        </div>
        <div style={s.splitLabel}>
          {roommates.map(r => (
            <div key={r.id} style={s.splitDot(r.color)}>
              <div style={s.splitDotIcon(r.color)} />
              {r.name.split(" ")[0]} · {r.share}%
            </div>
          ))}
        </div>

        <div style={s.divider} />

        {/* ── Roommate cards ── */}
        {roommates.map(r => {
          const isCurrentUser = r.id === currentUserId;
          const amount = ((r.share / 100) * TOTAL_RENT).toFixed(2);
          const st = STATUS[r.status];
          return (
            <div key={r.id} style={s.roommateCard(isCurrentUser)}>
              <div style={s.roommateTop}>
                <div style={s.roommateLeft}>
                  <div style={s.avatar(r.color, r.bg)}>{r.initials}</div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <span style={s.roommateName}>{r.name}</span>
                      {isCurrentUser && <span style={s.youBadge}>You</span>}
                    </div>
                    <span style={s.statusBadge(r.status)}>
                      {r.status === "paid" ? `✓ Paid ${r.paidAt}` : st.label}
                    </span>
                  </div>
                </div>
                <div style={s.roommateAmount}>${amount}</div>
              </div>

              {/* Slider — only for current user and if not paid */}
              {isCurrentUser && r.status !== "paid" && (
                <div style={s.sliderWrap}>
                  <div style={s.sliderRow}>
                    <span style={s.sliderLabel}>My share</span>
                    <span style={s.sliderPct}>{r.share}% · ${amount}</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={90}
                    value={r.share}
                    onChange={e => handleSliderChange(r.id, Number(e.target.value))}
                    style={{
                      ...s.slider,
                      accentColor: "#0C447C",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                    <span style={{ fontSize: 10, color: "#aaa" }}>10%</span>
                    <span style={{ fontSize: 10, color: "#aaa" }}>90%</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* ── Pay / paid state ── */}
        {paid || currentUser.status === "paid" ? (
          <div style={s.paidNotice}>
            ✅ Your share of ${myAmount} is paid
            {allPaid && " · Full rent collected!"}
          </div>
        ) : (
          <button
            style={s.payBtn}
            onClick={handlePayMyShare}
            disabled={loading}
          >
            {loading
              ? <><span style={{ width: 15, height: 15, border: "2px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />Processing…</>
              : <>💳 Pay my share · ${myAmount}</>}
          </button>
        )}

        <p style={s.footerNote}>
          Split adjustments apply to this month only · Changes don't affect future payments
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
