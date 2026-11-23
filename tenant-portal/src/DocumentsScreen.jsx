import { useSearchParams } from 'react-router-dom';
import { useState } from "react";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";
import { getSignedStorageUrl } from "./storageUtils";

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

const CATEGORIES = [
  { id: "all",      label: "All" },
  { id: "lease",    label: "Lease" },
  { id: "payments", label: "Receipts" },
  { id: "move_in",  label: "Move-in" },
  { id: "notices",  label: "Notices" },
];

export default function DocumentsScreen() {
  const { tenant, loading } = useTenant();
  const [params, setParams] = useSearchParams();
  const filter = CATEGORIES.find(item => item.id === params.get("view"))?.id || "all";
  const [search, setSearch] = useState("");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  const hasLease = Boolean(tenant?.lease_document_url) && ["lease", "all"].includes(filter);
  const showLease = hasLease && "lease agreement".includes(search.trim().toLowerCase());

  async function openLease() {
    setOpening(true); setError("");
    try {
      const signed = await getSignedStorageUrl("lease-documents", tenant.lease_document_url);
      if (!signed) throw new Error("Lease unavailable");
      window.location.assign(signed);
    } catch {
      setError("We couldn’t open your lease. Try again or contact your property manager for a copy.");
    } finally { setOpening(false); }
  }

  return (
    <TenantLayout tenantName={tenant?.name}>
      <style>{`
        
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        .t-doc:hover{border-color:#353A44!important;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
        ::-webkit-scrollbar:horizontal{height:0;}
      `}</style>

      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "var(--m-font)", paddingBottom: 48 }}>

        {/* Header */}
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "20px 20px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--m-font)", fontSize:"var(--m-fs-title)", fontWeight: 600, color: C.text }}>Documents</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.raised, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px" }}>
            <span style={{ color: C.textMuted, fontSize: 13 }}>⌕</span>
            <input aria-label="Search documents" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents…"
              style={{ flex: 1, background: "none", border: "none", outline: "none", color: C.text, fontSize: 13, fontFamily: "var(--m-font)" }} />
            {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 13 }}>✕</button>}
          </div>
        </div>

        {/* Filter pills */}
        <div style={{ display: "flex", gap: 8, padding: "14px 20px", overflowX: "auto", scrollbarWidth: "none", borderBottom: `1px solid ${C.border}` }}>
          {CATEGORIES.map(cat => (
            <button key={cat.id} aria-pressed={filter === cat.id} onClick={() => { setError(""); setParams({ view: cat.id }); }} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, background: filter === cat.id ? C.goldDim : "transparent", color: filter === cat.id ? C.text : C.textSub, border: `1px solid ${filter === cat.id ? C.goldDim : C.border}`, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "var(--m-font)", flexShrink: 0, transition: "all 0.12s" }}>
              {cat.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: "16px 20px 0" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: C.textMuted, fontSize: 13 }}>Loading…</div>
          ) : showLease ? (
            <div style={{ background:C.surface, border:"1px solid " + C.border, borderRadius:12, padding:18 }}>
              <h2 style={{ fontSize:16 }}>Lease agreement</h2>
              <button type="button" onClick={openLease} disabled={opening} style={{ minHeight:44, padding:"0 12px", marginTop:10 }}>
                {opening ? "Opening…" : "Open lease"}
              </button>
              {error && <p role="alert" style={{ color:C.red, marginTop:8 }}>{error}</p>}
            </div>
          ) : (
            <div style={{ textAlign:"center", padding:"60px 20px" }}>
              <h2 style={{ fontSize:16, marginBottom:8 }}>{hasLease ? "No matching documents" : filter === "lease" ? "No lease available online" : "No documents yet"}</h2>
              {!hasLease && <p style={{ fontSize:13, color:C.textSub }}>Contact your property manager for a copy.</p>}
            </div>
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