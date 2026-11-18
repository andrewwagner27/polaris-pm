import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./supabase";
import { runSafetySweep } from "./notifications";
import { DARK as C } from "./lib/tokens";
import { usePropertyScope, ALL, clearScopedCache } from "./lib/propertyScope";

function ModusMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M6 33V10L20 27L34 10V33" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 10L20 27L34 10" stroke={C.goldDim} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// Desktop sidebar. Order puts daily operations first.
const NAV = [
  { section: "OPERATIONS", items: [
    { label: "Home",         path: "/landlord"              },
    { label: "Maintenance",  path: "/landlord/maintenance"  },
    { label: "Messages",     path: "/landlord/messages"     },
    { label: "Agent",        path: "/landlord/agent"        },
    { label: "Inspections",  path: "/landlord/inspections"  },
  ]},
  { section: "PORTFOLIO", items: [
    { label: "Properties",   path: "/landlord/properties"   },
    { label: "Tenants",      path: "/landlord/tenants"      },
    { label: "Applications", path: "/landlord/applications" },
  ]},
  { section: "FINANCE", items: [
    { label: "Financials",         path: "/landlord/financials" },
    { label: "Financial Overview", path: "/landlord/snapshot"   },
    { label: "Budget vs Actual",   path: "/landlord/budgets"    },
    { label: "Reports",            path: "/landlord/reports"    },
  ]},
  { section: "ACCOUNT", items: [
    { label: "Settings",     path: "/landlord/settings"     },
  ]},
];
const ALL_ITEMS = NAV.flatMap((s) => s.items);

// Phone bottom bar: the four destinations used most, plus More for everything else.
const ICON = {
  home:  "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z",
  props: "M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3",
  maint: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z",
  fin:   "M4 20h16M6 16V10M10 16V6M14 16v-4M18 16V8",
  more:  "M5 12h.01M12 12h.01M19 12h.01",
};
const BOTTOM = [
  { label: "Home",        path: "/landlord",             icon: ICON.home  },
  { label: "Properties",  path: "/landlord/properties",  icon: ICON.props },
  { label: "Maintenance", path: "/landlord/maintenance", icon: ICON.maint, badgeKey: "maint" },
  { label: "Financials",  path: "/landlord/financials",  icon: ICON.fin   },
];
const SECONDARY = ["/landlord/tenants", "/landlord/messages", "/landlord/agent", "/landlord/applications", "/landlord/inspections",
  "/landlord/snapshot", "/landlord/budgets", "/landlord/reports", "/landlord/settings"];

function Icon({ d, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth={d === ICON.more ? 3 : 1.7} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// The global property selector. A UI filter only: RLS still decides what each query may return.
export function PropertyScopeSelect() {
  const { selectedPropertyId, setSelectedPropertyId, options, loading } = usePropertyScope();
  if (!loading && options.length <= 1) {
    // One property: nothing to choose. Show its name so the page context is still clear.
    return options[0] ? <span className="l-scope-static" title="Property">{options[0].name}</span> : null;
  }
  return (
    <label className="l-scope">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d={ICON.props} stroke={C.action} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <select value={selectedPropertyId} disabled={loading} onChange={(e) => setSelectedPropertyId(e.target.value)} aria-label="Property scope">
        <option value={ALL}>All Properties</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

function SidebarContents({ isActive, onNavigate, openMaintenance, unreadMessages, landlordName, initials, showPopover, setShowPopover, signOut }) {
  return (
    <>
      <div style={{ padding: "22px 18px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <ModusMark size={28}/>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontWeight: 600, color: C.text, letterSpacing: "0.1em" }}>MODUS</div>
          <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.16em", marginTop: 1 }}>PROPERTY MGMT</div>
        </div>
      </div>
      <nav aria-label="Main navigation" style={{ padding: "8px 10px", flex: 1 }}>
        {NAV.map((section) => (
          <div key={section.section} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: "0.14em", padding: "6px 10px 4px" }}>{section.section}</div>
            {section.items.map((item) => {
              const active = isActive(item.path);
              const badge = item.label === "Maintenance" && openMaintenance > 0 ? openMaintenance
                          : item.label === "Messages" && unreadMessages > 0 ? unreadMessages : 0;
              return (
                <a key={item.path} href={item.path} className="l-nav" aria-current={active ? "page" : undefined}
                  onClick={(e) => { e.preventDefault(); onNavigate(item.path); }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 36, padding: "8px 10px", borderRadius: 6, fontSize: 13, fontWeight: active ? 600 : 400, color: active ? C.action : C.textSub, background: active ? "rgba(201,169,104,0.10)" : "transparent", borderLeft: `2px solid ${active ? C.action : "transparent"}`, textDecoration: "none", marginBottom: 1 }}>
                  <span>{item.label}</span>
                  {badge > 0 && <span aria-label={`${badge} open`} style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 8, background: item.label === "Messages" ? C.blue : C.amber, color: C.onGold, minWidth: 20, textAlign: "center" }}>{badge}</span>}
                </a>
              );
            })}
          </div>
        ))}
      </nav>
      <div style={{ borderTop: `1px solid ${C.border}`, position: "relative" }}>
        {showPopover && (
          <div role="menu" style={{ position: "absolute", bottom: "100%", left: 8, right: 8, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 6, boxShadow: "0 8px 32px rgba(0,0,0,0.55)" }}>
            <button role="menuitem" type="button" className="l-pop-item" onClick={() => { onNavigate("/landlord/settings"); setShowPopover(false); }}>Settings</button>
            <button role="menuitem" type="button" className="l-pop-item" style={{ color: C.red }} onClick={signOut}>Sign out</button>
          </div>
        )}
        <button type="button" className="l-account" onClick={() => setShowPopover((p) => !p)} aria-haspopup="menu" aria-expanded={showPopover} aria-label={`Account${landlordName ? `: ${landlordName}` : ""}`}>
          <span style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(184,148,80,0.14)", border: "1px solid rgba(184,148,80,0.3)", color: C.action, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{initials}</span>
          <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{landlordName}</span>
            <span style={{ display: "block", fontSize: 11, color: C.textMuted }}>Portfolio Owner</span>
          </span>
        </button>
      </div>
    </>
  );
}

export default function LandlordLayout({ children, openMaintenance = 0, unreadMessages = 0 }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [landlordName, setLandlordName] = useState("");
  const [showPopover,  setShowPopover]  = useState(false);
  const [moreOpen,     setMoreOpen]     = useState(false);   // phone "More" sheet

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.full_name) setLandlordName(user.user_metadata.full_name);
    });
  }, []);

  // Safety net on every management page (throttled per tab): missed new-ticket alerts and unfinished tenant messages.
  useEffect(() => { runSafetySweep(); }, []);

  const moreBtnRef = useRef(null), sheetRef = useRef(null);

  // More sheet: focus moves in, Tab stays inside, Escape/scrim/link close it, focus returns to the More button.
  useEffect(() => {
    if (!moreOpen) return;
    const focusables = () => [...(sheetRef.current?.querySelectorAll("button, a[href]") || [])];
    focusables()[0]?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); setMoreOpen(false); return; }
      if (e.key !== "Tab") return;
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (!sheetRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    const mq = window.matchMedia("(min-width: 721px)");
    const onMq = (e) => { if (e.matches) setMoreOpen(false); };
    const prev = document.body.style.overflow;
    const btn = moreBtnRef.current;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); mq.removeEventListener("change", onMq);
      if (btn?.isConnected && btn.offsetParent !== null) btn.focus();
    };
  }, [moreOpen]);

  function isActive(path) {
    if (path === "/landlord") return location.pathname === "/landlord";
    return location.pathname.startsWith(path);
  }
  const go = (path) => { setMoreOpen(false); setShowPopover(false); navigate(path); };
  const signOut = async () => { clearScopedCache(); await supabase.auth.signOut(); navigate("/landlord/login"); };

  const initials = landlordName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const current = ALL_ITEMS.filter((i) => isActive(i.path)).sort((a, b) => b.path.length - a.path.length)[0];
  const secondaryActive = SECONDARY.some((p) => isActive(p));
  const contents = { isActive, openMaintenance, unreadMessages, landlordName, initials, showPopover, setShowPopover, signOut };

  return (
    <div className="l-shell" style={{ display: "flex", fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: C.text, background: C.bg, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600;700&display=swap');
        body{background:${C.bg};}
        .l-nav:hover{background:rgba(255,255,255,0.04)!important;color:${C.text}!important;}
        .l-pop-item{display:block;width:100%;min-height:44px;padding:0 14px;text-align:left;background:transparent;border:none;border-bottom:1px solid ${C.border};color:${C.text};font:inherit;font-size:13px;cursor:pointer;}
        .l-pop-item:hover{background:${C.raised};}
        .l-account{display:flex;align-items:center;gap:10px;width:100%;padding:14px 18px;background:transparent;border:none;cursor:pointer;font:inherit;color:inherit;}
        .l-scope{position:relative;display:inline-flex;align-items:center;gap:8px;min-height:40px;max-width:min(260px,52vw);padding:0 10px 0 12px;border:1px solid ${C.border};border-radius:10px;background:${C.surface};cursor:pointer;}
        .l-scope:focus-within{outline:2px solid ${C.focus};outline-offset:2px;}
        .l-scope select{appearance:none;-webkit-appearance:none;background:transparent;border:none;outline:none;color:${C.text};font:inherit;font-size:13px;font-weight:500;padding-right:16px;min-width:0;max-width:100%;text-overflow:ellipsis;cursor:pointer;color-scheme:dark;}
        .l-scope select:focus-visible{outline:none;}
        .l-scope::after{content:"";position:absolute;right:12px;top:50%;width:6px;height:6px;border-right:1.5px solid ${C.textSub};border-bottom:1.5px solid ${C.textSub};transform:translateY(-70%) rotate(45deg);pointer-events:none;}
        .l-scope-static{font-size:13px;color:${C.textSub};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;}
        .l-header{position:sticky;top:0;z-index:150;display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 32px;background:rgba(11,13,16,0.94);backdrop-filter:blur(8px);border-bottom:1px solid ${C.border};}
        .l-bottom{display:none;}
        .l-content{flex:1;min-width:0;display:flex;flex-direction:column;}
        @media (max-width:1024px){ .l-header{padding:8px 24px;} }
        @media (max-width:720px){
          .l-shell{flex-direction:column;}
          .l-side{display:none!important;}
          .l-header{padding:6px 12px 6px 14px;padding-top:max(6px, env(safe-area-inset-top));}
          .l-scope{min-height:44px;}
          .l-main{padding-bottom:calc(76px + env(safe-area-inset-bottom));}
          .l-bottom{display:grid;grid-template-columns:repeat(5,1fr);position:fixed;left:0;right:0;bottom:0;z-index:300;background:${C.bg};border-top:1px solid ${C.border};padding:4px 4px calc(4px + env(safe-area-inset-bottom));}
          .l-tab{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-height:56px;border:none;background:transparent;color:${C.textSub};font:inherit;font-size:11px;font-weight:500;text-decoration:none;border-radius:10px;cursor:pointer;}
          .l-tab[aria-current="page"],.l-tab.l-tab-on{color:${C.action};font-weight:700;}
          .l-tab[aria-current="page"]::before,.l-tab.l-tab-on::before{content:"";position:absolute;top:0;left:28%;right:28%;height:3px;border-radius:0 0 3px 3px;background:${C.action};}
          .l-tab-badge{position:absolute;top:6px;left:calc(50% + 6px);min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:${C.amber};color:${C.onGold};font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;}
        }
        @keyframes l-sheet-in{from{transform:translateY(100%);}to{transform:none;}}
        @keyframes l-fade-in{from{opacity:0;}to{opacity:1;}}
        @media (prefers-reduced-motion:reduce){.l-sheet,.l-scrim{animation:none!important;}}
      `}</style>

      {/* Sidebar (desktop and tablet, >720px) */}
      <div className="l-side" style={{ width: 220, background: C.bg, borderRight: `1px solid ${C.border}`, minHeight: "100vh", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>
        <SidebarContents {...contents} onNavigate={navigate}/>
      </div>

      <div className="l-content">
        {/* Header: page context + global property scope, on every size */}
        <header className="l-header">
          <span className="m-only-mobile" style={{ lineHeight: 0 }}><ModusMark size={22}/></span>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{current?.label || ""}</div>
          <div style={{ marginLeft: "auto", minWidth: 0, display: "flex" }}><PropertyScopeSelect/></div>
        </header>
        <main className="l-main" style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>

      {/* Bottom navigation (phones) */}
      <nav className="l-bottom" aria-label="Main navigation">
        {BOTTOM.map((t) => {
          const active = isActive(t.path);
          const badge = t.badgeKey === "maint" && openMaintenance > 0 ? openMaintenance : 0;
          return (
            <a key={t.path} href={t.path} className="l-tab" aria-current={active ? "page" : undefined}
              onClick={(e) => { e.preventDefault(); go(t.path); }}>
              <Icon d={t.icon}/>
              <span>{t.label}</span>
              {badge > 0 && <span className="l-tab-badge" aria-label={`${badge} open`}>{badge}</span>}
            </a>
          );
        })}
        <button ref={moreBtnRef} type="button" className={`l-tab${secondaryActive ? " l-tab-on" : ""}`} aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
          <Icon d={ICON.more}/>
          <span>More</span>
          {unreadMessages > 0 && <span className="l-tab-badge" style={{ background: C.blue }} aria-label={`${unreadMessages} unread messages`}>{unreadMessages}</span>}
        </button>
      </nav>

      {/* More sheet (phones): every secondary page plus account actions */}
      {moreOpen && (
        <>
          <div className="l-scrim" onClick={() => setMoreOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 340, animation: "l-fade-in .15s ease-out" }}/>
          <div ref={sheetRef} className="l-sheet" role="dialog" aria-modal="true" aria-label="More pages"
            style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 350, maxHeight: "85dvh", overflowY: "auto", background: C.surface, borderTop: `1px solid ${C.border}`, borderRadius: "16px 16px 0 0", padding: "8px 12px calc(12px + env(safe-area-inset-bottom))", animation: "l-sheet-in .2s ease-out" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 6px 10px" }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>More</div>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close" style={{ width: 44, height: 44, background: "transparent", border: "none", color: C.textSub, fontSize: 18, cursor: "pointer", borderRadius: 10 }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {SECONDARY.map((p) => {
                const item = ALL_ITEMS.find((i) => i.path === p);
                const active = isActive(p);
                const badge = p === "/landlord/messages" && unreadMessages > 0 ? unreadMessages : 0;
                return (
                  <a key={p} href={p} aria-current={active ? "page" : undefined} onClick={(e) => { e.preventDefault(); go(p); }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 48, padding: "0 14px", borderRadius: 10, border: `1px solid ${active ? C.action : C.border}`, background: C.raised, color: active ? C.action : C.text, fontSize: 14, fontWeight: active ? 600 : 500, textDecoration: "none" }}>
                    {item.label}
                    {badge > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 8, background: C.blue, color: C.onGold }}>{badge}</span>}
                  </a>
                );
              })}
            </div>
            <button type="button" onClick={signOut} style={{ marginTop: 12, width: "100%", minHeight: 48, borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.red, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              Sign out{landlordName ? ` (${landlordName})` : ""}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
