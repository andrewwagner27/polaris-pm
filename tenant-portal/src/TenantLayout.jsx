import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

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
  red:       "#E05555",
};

const NAV_ITEMS = [
  { label: "Home",        route: "/home" },
  { label: "Make Payment",route: "/pay" },
  { label: "Activity",    route: "/activity" },
  { label: "Maintenance", route: "/maintenance" },
  { label: "Messages",    route: "/messages" },
  { label: "Bulletin",    route: "/bulletin" },
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

function ModusMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M6 33V10L20 27L34 10V33" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 10L20 27L34 10" stroke={C.goldDim} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function TenantLayout({ children, tenantName = "Tenant", unreadMessages = 0 }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const width     = useWindowWidth();
  const isMobile  = width < 768;
  const pathname  = location.pathname;
  const [showPopover, setShowPopover] = useState(false);

  function isActive(route) {
    if (route === "/home") return pathname === "/home";
    return pathname.startsWith(route);
  }

  const initials = tenantName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const globalStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400;500;600&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: ${C.bg}; overflow-x: hidden; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
  `;

  // ── Mobile ──────────────────────────────────────────────────
  if (isMobile) {
    // Mobile shows 5 most important items in bottom bar; Activity collapses under Home tap
    const mobileNav = [
      { label: "Home",     route: "/home" },
      { label: "Payment",  route: "/pay" },
      { label: "Activity", route: "/activity" },
      { label: "Maint.",   route: "/maintenance" },
      { label: "Messages", route: "/messages" },
    ];

    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", minHeight: "-webkit-fill-available", background: C.bg, fontFamily: "'DM Sans', sans-serif" }}>
        <style>{globalStyles}</style>

        {/* Mobile top bar */}
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, position: "sticky", top: 0, zIndex: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ModusMark size={24} />
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 15, fontWeight: 600, color: C.text, letterSpacing: "0.08em" }}>MODUS</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => navigate("/bulletin")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: 4 }}>📋</button>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: `${C.gold}22`, border: `1px solid ${C.goldDim}`, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              onClick={() => navigate("/account")}>{initials}</div>
          </div>
        </div>

        {/* Scrollable content — padding bottom for nav bar */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingBottom: 80, WebkitOverflowScrolling: "touch" }}>{children}</div>

        {/* Bottom nav */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 50, paddingBottom: "env(safe-area-inset-bottom)" }}>
          {mobileNav.map(item => {
            const active = isActive(item.route);
            const badge  = item.label === "Messages" && unreadMessages > 0 ? unreadMessages : 0;
            const icons  = {
              "Home":    [["M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"], ["M9 22V12h6v10"]],
              "Payment": [["M3 10h18M7 15h.01M11 15h2M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"]],
              "Activity":[["M22 12h-4l-3 9L9 3l-3 9H2"]],
              "Maint.":  [["M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3-3a1 1 0 000-1.4l-1.6-1.6a1 1 0 00-1.4 0l-3 3z","M11 13l-9 9"]],
              "Messages":[["M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"]],
            };
            const paths = icons[item.label] || [["M12 12m-4 0a4 4 0 108 0"]];
            return (
              <button key={item.route} onClick={() => navigate(item.route)}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 2px 12px", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", position: "relative", minWidth: 0, WebkitTapHighlightColor: "transparent" }}>
                {active && <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 24, height: 2, background: C.gold, borderRadius: 1 }} />}
                <div style={{ position: "relative", marginBottom: 4 }}>
                  {badge > 0 && <span style={{ position: "absolute", top: -4, right: -6, background: C.red, color: "#fff", borderRadius: 10, fontSize: 9, fontWeight: 700, padding: "1px 4px", minWidth: 14, textAlign: "center", zIndex: 1 }}>{badge}</span>}
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? C.gold : C.textMuted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {paths[0].map((d, i) => <path key={i} d={d}/>)}
                  </svg>
                </div>
                <span style={{ fontSize: 10, color: active ? C.gold : C.textMuted, fontWeight: active ? 600 : 400, whiteSpace: "nowrap" }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Desktop ──────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: C.text, background: C.bg, minHeight: "100vh" }}>
      <style>{`
        ${globalStyles}
        .t-nav-item:hover { background: ${C.raised} !important; color: ${C.text} !important; }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: 260, background: C.bg, borderRight: `1px solid ${C.border}`, minHeight: "100vh", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>

        {/* Logo */}
        <div style={{ padding: "26px 24px 20px", borderBottom: `1px solid ${C.border}`, marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
          <ModusMark size={32} />
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 19, fontWeight: 600, color: C.text, letterSpacing: "0.1em" }}>MODUS</div>
            <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.14em", marginTop: 1 }}>TENANT PORTAL</div>
          </div>
        </div>

        {/* Nav */}
        <div style={{ padding: "6px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map(item => {
            const active = isActive(item.route);
            const badge  = item.label === "Messages" && unreadMessages > 0 ? unreadMessages : 0;
            return (
              <div key={item.route} className="t-nav-item"
                onClick={() => navigate(item.route)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", fontSize: 14, fontWeight: active ? 500 : 400, color: active ? C.gold : C.textSub, background: active ? `rgba(201,169,110,0.07)` : "transparent", borderLeft: `2px solid ${active ? C.gold : "transparent"}`, borderRadius: "0 8px 8px 0", transition: "all 0.12s" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: active ? C.gold : C.textMuted, flexShrink: 0 }} />
                <span>{item.label}</span>
                {badge > 0 && <span style={{ marginLeft: "auto", background: C.red, color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 8, minWidth: 20, textAlign: "center" }}>{badge}</span>}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ marginTop: "auto", borderTop: `1px solid ${C.border}`, position: "relative" }}>
          {showPopover && (
            <div style={{ position: "absolute", bottom: "100%", left: 12, right: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
              <div onClick={() => { navigate("/account"); setShowPopover(false); }}
                style={{ padding: "12px 16px", fontSize: 13, color: C.text, cursor: "pointer", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}
                onMouseOver={e => e.currentTarget.style.background = C.raised}
                onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.gold }} />Settings & Profile
              </div>
              <div onClick={async () => { const { supabase } = await import("./supabase"); await supabase.auth.signOut(); navigate("/login"); }}
                style={{ padding: "12px 16px", fontSize: 13, color: C.red, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                onMouseOver={e => e.currentTarget.style.background = C.raised}
                onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.red }} />Sign out
              </div>
            </div>
          )}
          <div style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => setShowPopover(p => !p)}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: `${C.gold}22`, border: `1px solid ${C.goldDim}`, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tenantName}</div>
              <div style={{ fontSize: 11, color: C.textMuted }}>Tenant</div>
            </div>
            <div style={{ fontSize: 13, color: C.textMuted, transform: showPopover ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>⌃</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minWidth: 0 }}>{children}</div>
    </div>
  );
}