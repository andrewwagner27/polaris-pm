import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const NAV_ITEMS = [
  { icon: "📊", label: "Dashboard",   route: "/landlord" },
  { icon: "🏢", label: "Properties",  route: "/landlord/properties" },
  { icon: "👥", label: "Tenants",     route: "/landlord/tenants" },
  { icon: "📋", label: "Reports",     route: "/landlord/rentroll" },
  { icon: "🔧", label: "Maintenance", route: "/landlord/maintenance" },
  { icon: "📈", label: "Financials",  route: "/landlord/financials" },
  { icon: "💬", label: "Messages",    route: "/landlord/messages" },
  { icon: "⚙️", label: "Settings",   route: "/landlord/settings" },
];

// Bottom nav shows a subset of the most important items
const BOTTOM_NAV_ITEMS = [
  { icon: "📊", label: "Dashboard",   route: "/landlord" },
  { icon: "🏢", label: "Properties",  route: "/landlord/properties" },
  { icon: "👥", label: "Tenants",     route: "/landlord/tenants" },
  { icon: "🔧", label: "Maintenance", route: "/landlord/maintenance" },
  { icon: "💬", label: "Messages",    route: "/landlord/messages" },
];

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

export default function LandlordLayout({ children, openMaintenance = 0, unreadMessages = 0 }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const width     = useWindowWidth();
  const isMobile  = width < 768;
  const pathname  = location.pathname;

  function isActive(route) {
    if (route === "/landlord") return pathname === "/landlord";
    return pathname.startsWith(route);
  }

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#f4f5f7", fontFamily: "'Inter','Segoe UI',sans-serif" }}>
        {/* Mobile top bar */}
        <div style={{ background: "#0C1F3F", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>🏢 Polaris PM</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#185FA5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>AW</div>
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 70 }}>
          {children}
        </div>

        {/* Mobile bottom nav */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0C1F3F", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", zIndex: 50 }}>
          {BOTTOM_NAV_ITEMS.map(item => {
            const active = isActive(item.route);
            const badge = item.label === "Maintenance" && openMaintenance > 0 ? openMaintenance
                        : item.label === "Messages"    && unreadMessages > 0  ? unreadMessages
                        : 0;
            return (
              <button key={item.route} onClick={() => navigate(item.route)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8px 4px 10px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Inter',sans-serif", position: "relative" }}>
                <div style={{ position: "relative" }}>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                  {badge > 0 && (
                    <span style={{ position: "absolute", top: -4, right: -6, background: "#E24B4A", color: "#fff", borderRadius: 10, fontSize: 9, fontWeight: 700, padding: "1px 4px", minWidth: 14, textAlign: "center" }}>{badge}</span>
                  )}
                </div>
                <span style={{ fontSize: 10, color: active ? "#378ADD" : "#5B7FA6", marginTop: 3, fontWeight: active ? 600 : 400 }}>{item.label}</span>
                {active && <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 24, height: 2, background: "#378ADD", borderRadius: 1 }} />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Desktop layout
  return (
    <div style={{ display: "flex", fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: 14, color: "#1a1a1a", background: "#f4f5f7", minHeight: "100vh", width: "100%", overflowX: "hidden" }}>
      <style>{`* { box-sizing: border-box; } html, body { margin: 0; padding: 0; width: 100%; overflow-x: hidden; background: #f4f5f7; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }`}</style>

      {/* Sidebar */}
      <div style={{ width: 220, background: "#0C1F3F", minHeight: "100vh", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>🏢 Polaris PM</div>
          <div style={{ fontSize: 10, color: "#5B7FA6", marginTop: 2 }}>Property Management</div>
        </div>

        {NAV_ITEMS.map(item => {
          const active = isActive(item.route);
          const badge  = item.label === "Maintenance" && openMaintenance > 0 ? openMaintenance
                       : item.label === "Messages"    && unreadMessages > 0  ? unreadMessages
                       : 0;
          return (
            <div key={item.route}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: active ? "rgba(255,255,255,0.1)" : "transparent", borderLeft: active ? "3px solid #378ADD" : "3px solid transparent", cursor: "pointer", color: active ? "#fff" : "#7A9CC4", fontSize: 13, fontWeight: active ? 600 : 400 }}
              onClick={() => navigate(item.route)}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
              {badge > 0 && (
                <span style={{ marginLeft: "auto", background: "#E24B4A", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>{badge}</span>
              )}
            </div>
          );
        })}

        <div style={{ marginTop: "auto", padding: "16px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#185FA5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>AW</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>Andrew Wagner</div>
              <div style={{ fontSize: 10, color: "#5B7FA6" }}>Portfolio Owner</div>
            </div>
          </div>
        </div>
      </div>

      {/* Page content */}
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0, width: "100%" }}>
        {children}
      </div>
    </div>
  );
}