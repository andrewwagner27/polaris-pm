import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from "react";

const DOCUMENTS = [
  {
    id: 1,
    category: "lease",
    title: "Lease Agreement",
    subtitle: "Jan 1, 2026 – Dec 31, 2026",
    date: "Jan 1, 2026",
    size: "1.2 MB",
    type: "PDF",
    icon: "📋",
    new: false,
  },
  {
    id: 2,
    category: "lease",
    title: "Lease Renewal Offer",
    subtitle: "2027 terms — action required",
    date: "May 15, 2026",
    size: "980 KB",
    type: "PDF",
    icon: "📋",
    new: true,
  },
  {
    id: 3,
    category: "payments",
    title: "May 2026 Receipt",
    subtitle: "Payment of $1,150.00",
    date: "May 1, 2026",
    size: "120 KB",
    type: "PDF",
    icon: "🧾",
    new: false,
  },
  {
    id: 4,
    category: "payments",
    title: "Apr 2026 Receipt",
    subtitle: "Payment of $1,150.00",
    date: "Apr 1, 2026",
    size: "120 KB",
    type: "PDF",
    icon: "🧾",
    new: false,
  },
  {
    id: 5,
    category: "payments",
    title: "Mar 2026 Receipt",
    subtitle: "Payment of $1,150.00 + $75 late fee",
    date: "Mar 6, 2026",
    size: "135 KB",
    type: "PDF",
    icon: "🧾",
    new: false,
  },
  {
    id: 6,
    category: "move_in",
    title: "Move-In Inspection Report",
    subtitle: "Signed by both parties",
    date: "Jan 1, 2026",
    size: "3.4 MB",
    type: "PDF",
    icon: "🏠",
    new: false,
  },
  {
    id: 7,
    category: "move_in",
    title: "Welcome & Building Guide",
    subtitle: "Parking, trash, amenities",
    date: "Jan 1, 2026",
    size: "2.1 MB",
    type: "PDF",
    icon: "📖",
    new: false,
  },
  {
    id: 8,
    category: "notices",
    title: "Plumbing Access Notice",
    subtitle: "Jun 2 maintenance visit",
    date: "May 20, 2026",
    size: "88 KB",
    type: "PDF",
    icon: "📢",
    new: true,
  },
];

const CATEGORIES = [
  { id: "all",      label: "All" },
  { id: "lease",    label: "Lease" },
  { id: "payments", label: "Receipts" },
  { id: "move_in",  label: "Move-in" },
  { id: "notices",  label: "Notices" },
];

const TYPE_COLORS = {
  PDF:  { bg: "#FDECEA", color: "#A32D2D" },
  DOC:  { bg: "#E6F1FB", color: "#185FA5" },
  IMG:  { bg: "#EAF3DE", color: "#3B6D11" },
};

const s = {
  app: {
    width: "100%",
    maxWidth: "100%",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontSize: 14,
    color: "#1a1a1a",
    background: "#f4f5f7",
    minHeight: "100vh",
    paddingBottom: 40,
  },
  header: {
    background: "#0C447C",
    borderRadius: "0 0 0 0",
    padding: "18px 20px 20px",
  },
  headerTop: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  backBtn: {
    background: "rgba(255,255,255,0.15)",
    border: "none",
    borderRadius: 8,
    width: 32,
    height: 32,
    cursor: "pointer",
    color: "#E6F1FB",
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerTitle: { fontSize: 15, fontWeight: 600, color: "#E6F1FB" },
  searchBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 10,
    padding: "9px 12px",
  },
  searchInput: {
    flex: 1,
    background: "none",
    border: "none",
    outline: "none",
    color: "#fff",
    fontSize: 13,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  filterBar: {
    display: "flex",
    gap: 8,
    padding: "14px 20px 0",
    overflowX: "auto",
    scrollbarWidth: "none",
  },
  filterPill: (active) => ({
    padding: "6px 14px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    background: active ? "#0C447C" : "#fff",
    color: active ? "#fff" : "#555",
    border: active ? "none" : "1px solid #e8eaed",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    flexShrink: 0,
  }),
  section: { padding: "20px 20px 0" },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: "#555",
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    marginBottom: 12,
  },
  docItem: (highlighted) => ({
    background: highlighted ? "#FFFBF0" : "#fff",
    border: highlighted ? "1px solid #F5D78E" : "1px solid #e8eaed",
    borderRadius: 12,
    padding: "14px",
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    gap: 12,
    cursor: "pointer",
    transition: "border-color 0.15s",
  }),
  docIconWrap: (bg) => ({
    width: 44,
    height: 44,
    borderRadius: 10,
    background: bg || "#f4f5f7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    flexShrink: 0,
  }),
  docInfo: { flex: 1, minWidth: 0 },
  docTitle: { fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 2 },
  docSubtitle: { fontSize: 11, color: "#888", marginBottom: 3 },
  docMeta: { display: "flex", alignItems: "center", gap: 6 },
  docDate: { fontSize: 11, color: "#aaa" },
  typeBadge: (type) => ({
    fontSize: 9,
    fontWeight: 700,
    padding: "1px 5px",
    borderRadius: 4,
    background: TYPE_COLORS[type]?.bg || "#f4f5f7",
    color: TYPE_COLORS[type]?.color || "#555",
    letterSpacing: "0.04em",
  }),
  newBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 7px",
    borderRadius: 10,
    background: "#185FA5",
    color: "#fff",
    marginLeft: "auto",
    flexShrink: 0,
  },
  docActions: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    flexShrink: 0,
  },
  actionBtn: (primary) => ({
    width: 32,
    height: 32,
    borderRadius: 8,
    background: primary ? "#E6F1FB" : "#f4f5f7",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
  }),
  emptyState: {
    textAlign: "center",
    padding: "40px 20px",
    color: "#aaa",
  },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 14, fontWeight: 500, marginBottom: 6 },
  emptySub: { fontSize: 12 },
  storageBar: {
    margin: "20px 20px 0",
    background: "#fff",
    border: "1px solid #e8eaed",
    borderRadius: 12,
    padding: "14px 16px",
  },
  storageHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  storageTitle: { fontSize: 12, fontWeight: 600, color: "#555" },
  storageUsed: { fontSize: 12, color: "#aaa" },
  storageTrack: {
    height: 6,
    background: "#f0f0f0",
    borderRadius: 3,
    overflow: "hidden",
  },
  storageFill: {
    height: "100%",
    width: "23%",
    background: "#185FA5",
    borderRadius: 3,
  },
  // Preview modal
  modal: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 200,
  },
  modalCard: {
    background: "#fff",
    borderRadius: "20px 20px 0 0",
    width: "100%",
    maxWidth: 460,
    padding: "20px 20px 36px",
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    background: "#e8eaed", margin: "0 auto 18px",
  },
  modalIcon: { fontSize: 40, textAlign: "center", marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: 700, textAlign: "center", marginBottom: 4 },
  modalSub: { fontSize: 13, color: "#888", textAlign: "center", marginBottom: 20 },
  modalBtns: { display: "flex", gap: 10 },
  modalBtn: (primary) => ({
    flex: 1, padding: "12px 0",
    background: primary ? "#0C447C" : "#f4f5f7",
    color: primary ? "#fff" : "#1a1a1a",
    border: "none", borderRadius: 10,
    fontSize: 14, fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  }),
};

const ICON_BACKGROUNDS = {
  lease:    "#E6F1FB",
  payments: "#EAF3DE",
  move_in:  "#F3EEFB",
  notices:  "#FAEEDA",
};

export default function DocumentsScreen() {
  const navigate = useNavigate();
  const [filter, setFilter]     = useState("all");
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState(null);

  const filtered = DOCUMENTS.filter(doc => {
    const matchCat = filter === "all" || doc.category === filter;
    const matchSearch = doc.title.toLowerCase().includes(search.toLowerCase()) ||
                        doc.subtitle.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const newCount = DOCUMENTS.filter(d => d.new).length;

  return (
    <div style={s.app}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; } ::-webkit-scrollbar { width: 0; }`}</style>

      {/* ── Header ── */}
      <div style={s.header}>
        <div style={s.headerTop}>
          <button style={s.backBtn} onClick={() => navigate('/home')}>←</button>
          <div>
            <div style={s.headerTitle}>Documents</div>
          </div>
          {newCount > 0 && (
            <span style={{ marginLeft: "auto", fontSize: 11, padding: "3px 10px", background: "#FAEEDA", color: "#854F0B", borderRadius: 20, fontWeight: 600 }}>
              {newCount} new
            </span>
          )}
        </div>

        {/* Search */}
        <div style={s.searchBar}>
          <span style={{ fontSize: 14 }}>🔍</span>
          <input
            style={s.searchInput}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search documents…"
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: "#85B7EB", cursor: "pointer", fontSize: 14 }}>✕</button>
          )}
        </div>
      </div>

      {/* ── Filter pills ── */}
      <div style={s.filterBar}>
        {CATEGORIES.map(cat => (
          <button key={cat.id} style={s.filterPill(filter === cat.id)} onClick={() => setFilter(cat.id)}>
            {cat.label}
            {cat.id === "all" && ` (${DOCUMENTS.length})`}
          </button>
        ))}
      </div>

      {/* ── Document list ── */}
      <div style={s.section}>
        {filtered.length === 0 ? (
          <div style={s.emptyState}>
            <div style={s.emptyIcon}>📂</div>
            <div style={s.emptyText}>No documents found</div>
            <div style={s.emptySub}>Try a different search or filter</div>
          </div>
        ) : (
          filtered.map(doc => (
            <div key={doc.id} style={s.docItem(doc.new)} onClick={() => setSelected(doc)}>
              <div style={s.docIconWrap(ICON_BACKGROUNDS[doc.category])}>
                {doc.icon}
              </div>
              <div style={s.docInfo}>
                <div style={s.docTitle}>{doc.title}</div>
                <div style={s.docSubtitle}>{doc.subtitle}</div>
                <div style={s.docMeta}>
                  <span style={s.typeBadge(doc.type)}>{doc.type}</span>
                  <span style={s.docDate}>{doc.date} · {doc.size}</span>
                </div>
              </div>
              {doc.new && <span style={s.newBadge}>New</span>}
              <div style={s.docActions}>
                <button style={s.actionBtn(true)} onClick={e => { e.stopPropagation(); alert("Opening " + doc.title); }}>👁️</button>
                <button style={s.actionBtn(false)} onClick={e => { e.stopPropagation(); alert("Downloading " + doc.title); }}>⬇️</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Storage indicator ── */}
      <div style={s.storageBar}>
        <div style={s.storageHeader}>
          <span style={s.storageTitle}>Storage used</span>
          <span style={s.storageUsed}>8.1 MB of 50 MB</span>
        </div>
        <div style={s.storageTrack}>
          <div style={s.storageFill} />
        </div>
      </div>

      {/* ── Preview modal ── */}
      {selected && (
        <div style={s.modal} onClick={() => setSelected(null)}>
          <div style={s.modalCard} onClick={e => e.stopPropagation()}>
            <div style={s.modalHandle} />
            <div style={s.modalIcon}>{selected.icon}</div>
            <div style={s.modalTitle}>{selected.title}</div>
            <div style={s.modalSub}>{selected.subtitle} · {selected.size}</div>
            <div style={s.modalBtns}>
              <button style={s.modalBtn(false)} onClick={() => setSelected(null)}>Close</button>
              <button style={s.modalBtn(true)}>⬇️ Download</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
