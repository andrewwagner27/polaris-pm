import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { icon: "🏠", label: "Home",      route: "/home" },
  { icon: "💳", label: "Pay",       route: "/pay" },
  { icon: "🔧", label: "Requests",  route: "/maintenance" },
  { icon: "💬", label: "Messages",  route: "/messages" },
  { icon: "👤", label: "Account",   route: "/account" },
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

export default function TenantLayout({ children, tenantName = "Tenant", unreadMessages = 0 }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const width     = useWindowWidth();
  const isMobile  = width < 768;
  const pathname  = location.pathname;

  function isActive(route) {
    if (route === "/home") return pathname === "/home";
    return pathname.startsWith(route);
  }

  const initials = tenantName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#f4f5f7", fontFamily: "'Inter','Segoe UI',sans-serif" }}>
        {/* Mobile top bar */}
        <div style={{ background: "#0C447C", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#E6F1FB" }}>🏢 Polaris Tenant</div>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#185FA5", border: "2px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer" }}
            onClick={() => navigate("/account")}>
            {initials}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 70 }}>
          {children}
        </div>

        {/* Bottom nav */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e8eaed", display: "flex", zIndex: 50 }}>
          {NAV_ITEMS.map(item => {
            const active = isActive(item.route);
            const badge = item.label === "Messages" && unreadMessages > 0 ? unreadMessages : 0;
            return (
              <button key={item.route} onClick={() => navigate(item.route)}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8px 4px 10px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Inter',sans-serif", position: "relative" }}>
                <div style={{ position: "relative" }}>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                  {badge > 0 && (
                    <span style={{ position: "absolute", top: -4, right: -6, background: "#E24B4A", color: "#fff", borderRadius: 10, fontSize: 9, fontWeight: 700, padding: "1px 4px", minWidth: 14, textAlign: "center" }}>{badge}</span>
                  )}
                </div>
                <span style={{ fontSize: 10, color: active ? "#0C447C" : "#aaa", marginTop: 3, fontWeight: active ? 600 : 400 }}>{item.label}</span>
                {active && <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 24, height: 2, background: "#0C447C", borderRadius: 1 }} />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Desktop layout
  return (
    <div style={{ display: "flex", fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: 14, color: "#1a1a1a", background: "#f4f5f7", minHeight: "100vh" }}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }`}</style>

      {/* Sidebar */}
      <div style={{ width: 220, background: "#0C447C", minHeight: "100vh", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.15)", marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>🏢 Polaris Tenant</div>
          <div style={{ fontSize: 10, color: "#85B7EB", marginTop: 2 }}>Tenant Portal</div>
        </div>

        {NAV_ITEMS.map(item => {
          const active = isActive(item.route);
          const badge  = item.label === "Messages" && unreadMessages > 0 ? unreadMessages : 0;
          return (
            <div key={item.route}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: active ? "rgba(255,255,255,0.15)" : "transparent", borderLeft: active ? "3px solid #fff" : "3px solid transparent", cursor: "pointer", color: active ? "#fff" : "#B5D4F4", fontSize: 13, fontWeight: active ? 600 : 400 }}
              onClick={() => navigate(item.route)}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
              {badge > 0 && (
                <span style={{ marginLeft: "auto", background: "#E24B4A", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>{badge}</span>
              )}
            </div>
          );
        })}

        <div style={{ marginTop: "auto", padding: "16px", borderTop: "1px solid rgba(255,255,255,0.15)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => navigate("/account")}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.2)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{tenantName}</div>
              <div style={{ fontSize: 10, color: "#85B7EB" }}>Tenant</div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}