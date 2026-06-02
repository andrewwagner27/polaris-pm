import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// ─── Design tokens — must match LandlordDashboard ─────────────────────────
const C = {
  bg:       "#0A0B0D",
  surface:  "#111316",
  raised:   "#181C21",
  border:   "#252930",
  text:     "#EDEAE2",
  textSub:  "#9095A0",
  textMuted:"#5C6270",
  gold:     "#C9A96E",
  goldDim:  "#7A5C2E",
  red:      "#E05555",
  blue:     "#4A9AE8",
};

const NAV_ITEMS = [
  { icon: "◈", label: "Dashboard",   route: "/landlord" },
  { icon: "⊟", label: "Properties",  route: "/landlord/properties" },
  { icon: "◻", label: "Tenants",     route: "/landlord/tenants" },
  { icon: "▤", label: "Reports",     route: "/landlord/rentroll" },
  { icon: "⚙", label: "Maintenance", route: "/landlord/maintenance" },
  { icon: "$", label: "Financials",  route: "/landlord/financials" },
  { icon: "✉", label: "Messages",    route: "/landlord/messages" },
  { icon: "◎", label: "Settings",    route: "/landlord/settings" },
];

const BOTTOM_NAV_ITEMS = [
  { icon: "◈", label: "Dashboard",   route: "/landlord" },
  { icon: "⊟", label: "Properties",  route: "/landlord/properties" },
  { icon: "◻", label: "Tenants",     route: "/landlord/tenants" },
  { icon: "⚙", label: "Maintenance", route: "/landlord/maintenance" },
  { icon: "✉", label: "Messages",    route: "/landlord/messages" },
];

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setWidth(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return width;
}

function ModusMark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M6 33V10L20 27L34 10V33" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 10L20 27L34 10" stroke={C.goldDim} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function LandlordLayout({ children, openMaintenance = 0, unreadMessages = 0 }) {
  const navigate = useNavigate();
  const location = useLocation();
  const width    = useWindowWidth();
  const isMobile = width < 768;
  const pathname = location.pathname;

  function isActive(route) {
    if (route === "/landlord") return pathname === "/landlord";
    return pathname.startsWith(route);
  }

  // ── Mobile ──────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400;500;600&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>

        {/* Mobile top bar */}
        <div style={{
          background: C.surface, borderBottom: `1px solid ${C.border}`,
          padding: "12px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ModusMark size={24} />
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, fontWeight: 600, color: C.text, letterSpacing: "0.08em" }}>MODUS</div>
            </div>
          </div>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: C.raised, border: `1px solid ${C.border}`,
            color: C.gold, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 600,
          }}>AW</div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 70 }}>
          {children}
        </div>

        {/* Mobile bottom nav */}
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          background: C.surface, borderTop: `1px solid ${C.border}`,
          display: "flex", zIndex: 50,
        }}>
          {BOTTOM_NAV_ITEMS.map(item => {
            const active = isActive(item.route);
            const badge  = item.label === "Maintenance" && openMaintenance > 0 ? openMaintenance
                         : item.label === "Messages"    && unreadMessages > 0  ? unreadMessages : 0;
            return (
              <button key={item.route} onClick={() => navigate(item.route)} style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", padding: "8px 4px 10px",
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif", position: "relative",
              }}>
                {active && (
                  <div style={{
                    position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
                    width: 24, height: 2, background: C.gold, borderRadius: 1,
                  }} />
                )}
                <div style={{ position: "relative" }}>
                  <span style={{ fontSize: 16, color: active ? C.gold : C.textMuted }}>{item.icon}</span>
                  {badge > 0 && (
                    <span style={{
                      position: "absolute", top: -4, right: -6,
                      background: C.red, color: "#fff", borderRadius: 10,
                      fontSize: 9, fontWeight: 700, padding: "1px 4px",
                      minWidth: 14, textAlign: "center",
                    }}>{badge}</span>
                  )}
                </div>
                <span style={{
                  fontSize: 10, marginTop: 3, fontWeight: active ? 600 : 400,
                  color: active ? C.gold : C.textMuted,
                }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Desktop ──────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: "flex", minHeight: "100vh", width: "100%",
      background: C.bg, fontFamily: "'DM Sans', sans-serif",
      color: C.text, overflowX: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: ${C.bg}; overflow-x: hidden; }
        .m-nav-item:hover { background: ${C.raised} !important; color: ${C.text} !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      {/* ── Sidebar ── */}
      <div style={{
        width: 220, background: C.bg,
        borderRight: `1px solid ${C.border}`,
        minHeight: "100vh", display: "flex", flexDirection: "column",
        flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto",
      }}>

        {/* Logo */}
        <div style={{
          padding: "22px 20px 18px",
          borderBottom: `1px solid ${C.border}`,
          marginBottom: 8,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <ModusMark size={28} />
          <div>
            <div style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 17, fontWeight: 600, color: C.text,
              letterSpacing: "0.1em",
            }}>MODUS</div>
            <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.12em", marginTop: 1 }}>
              PROPERTY MANAGEMENT
            </div>
          </div>
        </div>

        {/* Section: Portfolio */}
        <div style={{ padding: "10px 0 4px" }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: C.textMuted, letterSpacing: "0.18em", textTransform: "uppercase", padding: "0 18px", marginBottom: 4 }}>
            Portfolio
          </div>
          {NAV_ITEMS.slice(0, 4).map(item => {
            const active = isActive(item.route);
            const badge  = item.label === "Maintenance" && openMaintenance > 0 ? openMaintenance
                         : item.label === "Messages"    && unreadMessages > 0  ? unreadMessages : 0;
            return (
              <div key={item.route} className="m-nav-item"
                onClick={() => navigate(item.route)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 18px", cursor: "pointer",
                  fontSize: 13, fontWeight: active ? 500 : 400,
                  color: active ? C.gold : C.textSub,
                  background: active ? `rgba(201,169,110,0.07)` : "transparent",
                  borderLeft: `2px solid ${active ? C.gold : "transparent"}`,
                  transition: "all 0.12s",
                }}>
                <span style={{ fontSize: 13, width: 16, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
                <span>{item.label}</span>
                {badge > 0 && (
                  <span style={{
                    marginLeft: "auto", background: C.red, color: "#fff",
                    fontSize: 9, fontWeight: 700, padding: "2px 6px",
                    borderRadius: 8, minWidth: 18, textAlign: "center",
                  }}>{badge}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Section: Operations */}
        <div style={{ padding: "14px 0 4px" }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: C.textMuted, letterSpacing: "0.18em", textTransform: "uppercase", padding: "0 18px", marginBottom: 4 }}>
            Operations
          </div>
          {NAV_ITEMS.slice(4, 7).map(item => {
            const active = isActive(item.route);
            const badge  = item.label === "Maintenance" && openMaintenance > 0 ? openMaintenance
                         : item.label === "Messages"    && unreadMessages > 0  ? unreadMessages : 0;
            return (
              <div key={item.route} className="m-nav-item"
                onClick={() => navigate(item.route)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 18px", cursor: "pointer",
                  fontSize: 13, fontWeight: active ? 500 : 400,
                  color: active ? C.gold : C.textSub,
                  background: active ? `rgba(201,169,110,0.07)` : "transparent",
                  borderLeft: `2px solid ${active ? C.gold : "transparent"}`,
                  transition: "all 0.12s",
                }}>
                <span style={{ fontSize: 13, width: 16, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
                <span>{item.label}</span>
                {badge > 0 && (
                  <span style={{
                    marginLeft: "auto", background: C.red, color: "#fff",
                    fontSize: 9, fontWeight: 700, padding: "2px 6px",
                    borderRadius: 8, minWidth: 18, textAlign: "center",
                  }}>{badge}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Section: Account */}
        <div style={{ padding: "14px 0 4px" }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: C.textMuted, letterSpacing: "0.18em", textTransform: "uppercase", padding: "0 18px", marginBottom: 4 }}>
            Account
          </div>
          {NAV_ITEMS.slice(7).map(item => {
            const active = isActive(item.route);
            return (
              <div key={item.route} className="m-nav-item"
                onClick={() => navigate(item.route)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 18px", cursor: "pointer",
                  fontSize: 13, fontWeight: active ? 500 : 400,
                  color: active ? C.gold : C.textSub,
                  background: active ? `rgba(201,169,110,0.07)` : "transparent",
                  borderLeft: `2px solid ${active ? C.gold : "transparent"}`,
                  transition: "all 0.12s",
                }}>
                <span style={{ fontSize: 13, width: 16, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>

        {/* User footer */}
        <div style={{
          marginTop: "auto", padding: "16px 18px",
          borderTop: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: C.raised, border: `1px solid ${C.border}`,
            color: C.gold, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0,
          }}>AW</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>Andrew Wagner</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>Portfolio Owner</div>
          </div>
        </div>
      </div>

      {/* ── Page content ── */}
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}