import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { clearTenantCache } from "./useTenant";
import { runSafetySweep } from "./notifications";

// ── Tenant light palette ──────────────────────────────────────
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
  red:      "#B91C1C",
  sidebar:  "#FFFFFF",
  sidebarBorder: "#E4E1DA",
};

const NAV_ITEMS = [
  { label: "Home",         route: "/home",        icon: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10" },
  { label: "Make Payment", route: "/pay",          icon: "M3 10h18M7 15h.01M11 15h2M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" },
  { label: "Activity",     route: "/activity",     icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
  { label: "Maintenance",  route: "/maintenance",  icon: "M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3-3a1 1 0 000-1.4l-1.6-1.6a1 1 0 00-1.4 0l-3 3z M11 13l-9 9" },
  { label: "Messages",     route: "/messages",     icon: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" },
  { label: "Bulletin",     route: "/bulletin",     icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
];

function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

function NavIcon({ d, active }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke={active ? C.gold : C.textMuted}
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {d.split(" M").map((seg, i) => (
        <path key={i} d={i === 0 ? seg : "M" + seg} />
      ))}
    </svg>
  );
}

function ModusMark({ size = 32, dark = false }) {
  const stroke = dark ? C.gold : C.gold;
  const strokeDim = dark ? "#C9A96E" : C.goldDim;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M6 33V10L20 27L34 10V33" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 10L20 27L34 10" stroke={strokeDim} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

async function doSignOut(navigate) {
  clearTenantCache();
  const { supabase } = await import("./supabase");
  await supabase.auth.signOut();
  navigate("/login");
}

export default function TenantLayout({ children, tenantName = "Tenant", unreadMessages = 0 }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const width     = useWindowWidth();
  const isMobile  = width < 768;
  const pathname  = location.pathname;
  // Messages fits the viewport: the shell never scrolls, only the message history does.
  const fit       = pathname.startsWith("/messages");
  const [showPopover, setShowPopover] = useState(false);

  // Safety net (server decides scope: this tenant's own tickets and messages): a missed new-ticket alert or a message
  // the assistant never finished is passed to management. Throttled per tab; never blocks the page.
  useEffect(() => { runSafetySweep(); }, []);

  useEffect(() => {
    if (!showPopover) return;
    const close = (e) => {
      if (!e.target.closest("[data-popover]")) setShowPopover(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showPopover]);

  function isActive(route) {
    if (route === "/home") return pathname === "/home";
    return pathname.startsWith(route);
  }

  const initials = tenantName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const globalStyles = `
    
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: ${C.bg}; }
    .t-shell { min-height: 100vh; min-height: 100dvh; }
    .t-nav-item { display:flex; align-items:center; gap:10px; width:100%; min-height:44px; padding:10px 14px; border:none; text-align:left; font:inherit; cursor:pointer; border-radius:8px; }
    .t-popover-item { width:100%; border:none; background:transparent; text-align:left; font:inherit; min-height:44px; }
    .t-nav-item { transition: background 0.12s; }
    .t-nav-item:hover { background: ${C.raised} !important; }
    .t-popover-item:hover { background: ${C.raised} !important; }
  `;

  // ── Mobile ────────────────────────────────────────────────────
  if (isMobile) {
    const mobileNav = NAV_ITEMS.filter(n => n.route !== "/bulletin");

    return (
      <div className={`t-light t-shell${fit ? " m-fit" : ""}`} style={{ display:"flex", flexDirection:"column", background:C.bg, fontFamily:"var(--m-font)" }}>
        <style>{globalStyles}</style>

        {/* Top bar */}
        <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"11px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, position:"sticky", top:0, zIndex:40, boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <ModusMark size={24} />
            <div style={{ fontFamily:"var(--m-font-brand)", fontSize:16, fontWeight:600, color:C.text, letterSpacing:"0.08em" }}>MODUS</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button onClick={() => navigate("/bulletin")}
              style={{ minHeight:44, background:"none", border:`1px solid ${C.border}`, borderRadius:10, cursor:"pointer", padding:"0 14px", fontSize:13, color:C.textSub, fontFamily:"var(--m-font)" }}>
              Board
            </button>
            <button type="button" onClick={() => navigate("/account")} aria-label="Account"
              style={{ width:44, height:44, borderRadius:"50%", background:C.goldBg, border:`1px solid ${C.goldDim}`, color:C.gold, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:600, cursor:"pointer", padding:0 }}>
              {initials}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="m-fit-col" style={{ flex:1, minWidth:0, overflowX:"clip", paddingBottom: fit ? 0 : "calc(80px + env(safe-area-inset-bottom))" }}>{children}</div>

        {/* Bottom nav */}
        <nav aria-label="Main navigation" style={{ position: fit ? "relative" : "fixed", flexShrink:0, bottom:0, left:0, right:0, background:C.surface, borderTop:`1px solid ${C.border}`, display:"flex", zIndex:50, paddingBottom:"env(safe-area-inset-bottom)", boxShadow:"0 -1px 8px rgba(0,0,0,0.06)" }}>
          {mobileNav.map(item => {
            const active = isActive(item.route);
            const badge  = item.label === "Messages" && unreadMessages > 0 ? unreadMessages : 0;
            const shortLabel = item.label === "Make Payment" ? "Pay" : item.label === "Maintenance" ? "Maint." : item.label;
            return (
              <button key={item.route} type="button" aria-current={active ? "page" : undefined} onClick={() => navigate(item.route)}
                style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"10px 2px 12px", background:"none", border:"none", cursor:"pointer", fontFamily:"var(--m-font)", position:"relative", minWidth:0, WebkitTapHighlightColor:"transparent" }}>
                {active && <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:28, height:2, background:C.gold, borderRadius:"0 0 2px 2px" }} />}
                <div style={{ position:"relative", marginBottom:4 }}>
                  {badge > 0 && <span style={{ position:"absolute", top:-4, right:-6, background:C.red, color:"#fff", borderRadius:10, fontSize:9, fontWeight:600, padding:"1px 4px", minWidth:14, textAlign:"center", zIndex:1 }}>{badge}</span>}
                  <NavIcon d={item.icon} active={active} />
                </div>
                <span style={{ fontSize:10, color:active ? C.gold : C.textMuted, fontWeight:active ? 600 : 400, whiteSpace:"nowrap" }}>{shortLabel}</span>
              </button>
            );
          })}
        </nav>
      </div>
    );
  }

  // ── Desktop ───────────────────────────────────────────────────
  return (
    <div className={`t-light t-shell${fit ? " m-fit" : ""}`} style={{ display:"flex", fontFamily:"var(--m-font)", fontSize:14, color:C.text, background:C.bg }}>
      <style>{globalStyles}</style>

      {/* Sidebar */}
      <div style={{ width:240, background:C.sidebar, borderRight:`1px solid ${C.sidebarBorder}`, minHeight:"100vh", display:"flex", flexDirection:"column", flexShrink:0, position:"sticky", top:0, height:"100vh", overflowY:"auto", boxShadow:"1px 0 0 ${C.border}" }}>

        {/* Logo */}
        <div style={{ padding:"22px 20px 16px", borderBottom:`1px solid ${C.border}`, marginBottom:8, display:"flex", alignItems:"center", gap:10 }}>
          <ModusMark size={28} />
          <div>
            <div style={{ fontFamily:"var(--m-font-brand)", fontSize:17, fontWeight:600, color:C.text, letterSpacing:"0.1em" }}>MODUS</div>
            <div style={{ fontSize:12, color:C.textMuted, marginTop:1 }}>Tenant Portal</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding:"4px 10px", display:"flex", flexDirection:"column", gap:1 }}>
          {NAV_ITEMS.map(item => {
            const active = isActive(item.route);
            const badge  = item.label === "Messages" && unreadMessages > 0 ? unreadMessages : 0;
            return (
              <button key={item.route} type="button" className="t-nav-item" aria-current={active ? "page" : undefined}
                onClick={() => navigate(item.route)}
                style={{
                  background: active ? C.goldBg : "transparent",
                  borderLeft: `2px solid ${active ? C.gold : "transparent"}`,
                  marginLeft: -2,
                }}>
                <NavIcon d={item.icon} active={active} />
                <span style={{ fontSize:13, fontWeight:active ? 600 : 400, color:active ? C.gold : C.textSub, flex:1 }}>{item.label}</span>
                {badge > 0 && (
                  <span style={{ background:C.red, color:"#fff", fontSize:10, fontWeight:600, padding:"2px 6px", borderRadius:8, minWidth:18, textAlign:"center" }}>{badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer / user */}
        <div style={{ marginTop:"auto", borderTop:`1px solid ${C.border}`, position:"relative" }} data-popover>
          {showPopover && (
            <div style={{ position:"absolute", bottom:"calc(100% + 6px)", left:10, right:10, background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden", boxShadow:"0 8px 24px rgba(0,0,0,0.12)" }}>
              <button type="button" className="t-popover-item"
                onClick={() => { navigate("/account"); setShowPopover(false); }}
                style={{ padding:"11px 16px", fontSize:13, color:C.text, cursor:"pointer", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:10, transition:"background 0.1s" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSub} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                <span>Settings &amp; Profile</span>
              </button>
              <button type="button" className="t-popover-item"
                onClick={() => doSignOut(navigate)}
                style={{ padding:"11px 16px", fontSize:13, color:C.red, cursor:"pointer", display:"flex", alignItems:"center", gap:10, transition:"background 0.1s" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="1.8" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                <span>Sign out</span>
              </button>
            </div>
          )}
          <button type="button" aria-haspopup="menu" aria-expanded={showPopover} aria-label={`Account menu for ${tenantName}`}
            style={{ width:"100%", padding:"14px 18px", display:"flex", alignItems:"center", gap:10, cursor:"pointer", background:"transparent", border:"none", font:"inherit", textAlign:"left" }}
            onClick={() => setShowPopover(p => !p)}>
            <div style={{ width:34, height:34, borderRadius:"50%", background:C.goldBg, border:`1px solid ${C.goldDim}`, color:C.gold, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:600, flexShrink:0 }}>{initials}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:500, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tenantName}</div>
              <div style={{ fontSize:11, color:C.textMuted }}>Tenant</div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round"
              style={{ transform:showPopover ? "rotate(180deg)" : "none", transition:"transform 0.15s", flexShrink:0 }}>
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="m-fit-col" style={{ flex:1, minWidth:0, overflowX:"clip" }}>{children}</div>
    </div>
  );
}
