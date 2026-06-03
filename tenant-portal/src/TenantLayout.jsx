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
  { label: "Home",      route: "/home" },
  { label: "Pay",       route: "/pay" },
  { label: "Requests",  route: "/maintenance" },
  { label: "Messages",  route: "/messages" },
  { label: "Account",   route: "/account" },
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

function ModusMark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M6 33V10L20 27L34 10V33" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 10L20 27L34 10" stroke={C.goldDim} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function TenantLayout({ children, tenantName = "Tenant", unreadMessages = 0 }) {
  const navigate = useNavigate();
  const location = useLocation();
  const width    = useWindowWidth();
  const isMobile = width < 768;
  const pathname = location.pathname;

  function isActive(route) {
    if (route === "/home") return pathname === "/home";
    return pathname.startsWith(route);
  }

  const initials = tenantName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  // ── Mobile ──
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400;500;600&display=swap');
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: ${C.bg}; }
        `}</style>

        {/* Mobile top bar */}
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ModusMark size={22} />
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 15, fontWeight: 600, color: C.text, letterSpacing: "0.08em" }}>MODUS</div>
          </div>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${C.gold}22`, border: `1px solid ${C.goldDim}`, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            onClick={() => navigate("/account")}>{initials}</div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 70 }}>{children}</div>

        {/* Bottom nav */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 50 }}>
          {NAV_ITEMS.map(item => {
            const active = isActive(item.route);
            const badge  = item.label === "Messages" && unreadMessages > 0 ? unreadMessages : 0;
            return (
              <button key={item.route} onClick={() => navigate(item.route)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8px 4px 10px", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", position: "relative" }}>
                {active && <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 20, height: 2, background: C.gold, borderRadius: 1 }} />}
                <div style={{ position: "relative" }}>
                  {badge > 0 && <span style={{ position: "absolute", top: -4, right: -6, background: C.red, color: "#fff", borderRadius: 10, fontSize: 9, fontWeight: 700, padding: "1px 4px", minWidth: 14, textAlign: "center" }}>{badge}</span>}
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: active ? `${C.gold}22` : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: active ? C.gold : C.textMuted }} />
                  </div>
                </div>
                <span style={{ fontSize: 10, color: active ? C.gold : C.textMuted, marginTop: 4, fontWeight: active ? 600 : 400 }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Desktop ──
  return (
    <div style={{ display: "flex", fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: C.text, background: C.bg, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        .t-nav-item:hover { background: ${C.raised} !important; color: ${C.text} !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: 220, background: C.bg, borderRight: `1px solid ${C.border}`, minHeight: "100vh", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>

        {/* Logo */}
        <div style={{ padding: "22px 20px 18px", borderBottom: `1px solid ${C.border}`, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <ModusMark size={26} />
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, fontWeight: 600, color: C.text, letterSpacing: "0.1em" }}>MODUS</div>
            <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.14em", marginTop: 1 }}>TENANT PORTAL</div>
          </div>
        </div>

        {/* Nav items */}
        <div style={{ padding: "8px 0" }}>
          {NAV_ITEMS.map(item => {
            const active = isActive(item.route);
            const badge  = item.label === "Messages" && unreadMessages > 0 ? unreadMessages : 0;
            return (
              <div key={item.route} className="t-nav-item"
                onClick={() => navigate(item.route)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 18px", cursor: "pointer", fontSize: 13, fontWeight: active ? 500 : 400, color: active ? C.gold : C.textSub, background: active ? `rgba(201,169,110,0.07)` : "transparent", borderLeft: `2px solid ${active ? C.gold : "transparent"}`, transition: "all 0.12s" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: active ? C.gold : C.textMuted, flexShrink: 0 }} />
                <span>{item.label}</span>
                {badge > 0 && <span style={{ marginLeft: "auto", background: C.red, color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 8, minWidth: 18, textAlign: "center" }}>{badge}</span>}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ marginTop: "auto", padding: "16px 18px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => navigate("/account")}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${C.gold}22`, border: `1px solid ${C.goldDim}`, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{tenantName}</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>Tenant</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>{children}</div>
    </div>
  );
}