import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from "react";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";
import { supabase } from "./supabase";

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

const CATEGORIES = [
  { id: "all",      label: "All" },
  { id: "lease",    label: "Lease" },
  { id: "payments", label: "Receipts" },
  { id: "move_in",  label: "Move-in" },
  { id: "notices",  label: "Notices" },
];

export default function DocumentsScreen() {
  const { tenant } = useTenant();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenant?.id) fetchDocuments();
    else setLoading(false);
  }, [tenant?.id]);

  async function fetchDocuments() {
    setLoading(true);
    // When you add a documents table, query it here.
    // For now return empty — no fake data.
    setDocuments([]);
    setLoading(false);
  }

  const filtered = documents.filter(doc => {
    const matchCat    = filter === "all" || doc.category === filter;
    const matchSearch = doc.title.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <TenantLayout tenantName={tenant?.name}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        .t-doc:hover{border-color:#353A44!important;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
        ::-webkit-scrollbar:horizontal{height:0;}
      `}</style>

      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif", paddingBottom: 48 }}>

        {/* Header */}
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "20px 20px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: C.text }}>Documents</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.raised, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px" }}>
            <span style={{ color: C.textMuted, fontSize: 13 }}>⌕</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents…"
              style={{ flex: 1, background: "none", border: "none", outline: "none", color: C.text, fontSize: 13, fontFamily: "'DM Sans', sans-serif" }} />
            {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 13 }}>✕</button>}
          </div>
        </div>

        {/* Filter pills */}
        <div style={{ display: "flex", gap: 8, padding: "14px 20px", overflowX: "auto", scrollbarWidth: "none", borderBottom: `1px solid ${C.border}` }}>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setFilter(cat.id)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, background: filter === cat.id ? C.goldDim : "transparent", color: filter === cat.id ? C.text : C.textSub, border: `1px solid ${filter === cat.id ? C.goldDim : C.border}`, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif", flexShrink: 0, transition: "all 0.12s" }}>
              {cat.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: "16px 20px 0" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: C.textMuted, fontSize: 13 }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: `${C.gold}12`, border: `1px solid ${C.goldDim}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24 }}>📂</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: C.text, marginBottom: 6 }}>No documents yet</div>
              <div style={{ fontSize: 13, color: C.textMuted, maxWidth: 260, margin: "0 auto" }}>
                Your lease, receipts, and notices from your property manager will appear here.
              </div>
            </div>
          ) : (
            filtered.map(doc => (
              <div key={doc.id} className="t-doc"
                style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "border-color 0.15s" }}>
                <div style={{ width: 42, height: 42, borderRadius: 9, background: `${doc.color}18`, border: `1px solid ${doc.color}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: doc.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 2 }}>{doc.title}</div>
                  <div style={{ fontSize: 11, color: C.textSub, marginBottom: 4 }}>{doc.subtitle}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 3, background: `${C.red}18`, color: C.red, letterSpacing: "0.04em" }}>PDF</span>
                    <span style={{ fontSize: 11, color: C.textMuted }}>{doc.date} · {doc.size}</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                  <button onClick={e => e.stopPropagation()} style={{ width: 30, height: 30, borderRadius: 7, background: `${C.blue}18`, border: `1px solid ${C.blue}33`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: C.blue }}>👁</button>
                  <button onClick={e => e.stopPropagation()} style={{ width: 30, height: 30, borderRadius: 7, background: C.raised, border: `1px solid ${C.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: C.textSub }}>⬇</button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Coming soon notice */}
        <div style={{ margin: "20px 20px 0", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.blue, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 2 }}>Document uploads coming soon</div>
            <div style={{ fontSize: 11, color: C.textSub }}>You'll be able to upload renters insurance, IDs, and other files directly here.</div>
          </div>
        </div>

      </div>
    </TenantLayout>
  );
}