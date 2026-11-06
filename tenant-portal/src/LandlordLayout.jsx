import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./supabase";

const C = {
  bg:       "#0C0E12",
  surface:  "#14181F",
  raised:   "#1A1F29",
  border:   "rgba(255,255,255,0.08)",
  text:     "#F0EDE6",
  textSub:  "#7A7F8A",
  textMuted:"#4A4F5A",
  gold:     "#B99A5B",
  goldDim:  "rgba(185,154,91,0.18)",
  goldText: "#C9A96E",
  blue:     "#4A9AE8",
  green:    "#4CAF50",
  red:      "#E05555",
  amber:    "#D4871A",
};

function ModusMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M6 33V10L20 27L34 10V33" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 10L20 27L34 10" stroke={C.goldDim} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

const NAV = [
  { section: "PORTFOLIO", items: [
    { label: "Dashboard",    path: "/landlord"              },
    { label: "Financial Overview", path: "/landlord/snapshot" },
    { label: "Budget vs Actual",   path: "/landlord/budgets"  },
    { label: "Properties",   path: "/landlord/properties"   },
    { label: "Tenants",      path: "/landlord/tenants"      },
    { label: "Applications", path: "/landlord/applications" },
    { label: "Reports",      path: "/landlord/reports"      },
  ]},
  { section: "OPERATIONS", items: [
    { label: "Maintenance",  path: "/landlord/maintenance"  },
    { label: "Financials",   path: "/landlord/financials"   },
    { label: "Messages",     path: "/landlord/messages"     },
    { label: "Agent",        path: "/landlord/agent"        },
    { label: "Inspections",  path: "/landlord/inspections"  },
  ]},
  { section: "ACCOUNT", items: [
    { label: "Settings",     path: "/landlord/settings"     },
  ]},
];

// Click-and-keyboard props for the existing div-based controls: focusable, announced with a role, Enter/Space activate.
// Mouse appearance is unchanged; a focus ring shows only for keyboard focus (:focus-visible).
const pressable = (role, fn) => ({
  role, tabIndex: 0, onClick: fn,
  onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } },
});

// Logo, navigation and account footer: the same contents in the desktop sidebar and the mobile drawer.
function SidebarContents({ isActive, onNavigate, openMaintenance, unreadMessages, landlordName, initials, showPopover, setShowPopover }) {
  return (
    <>
      {/* Logo */}
      <div style={{ padding:"22px 18px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10,marginBottom:4 }}>
        <ModusMark size={28}/>
        <div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:16,fontWeight:600,color:C.text,letterSpacing:"0.1em" }}>MODUS</div>
          <div style={{ fontSize:9,color:C.textMuted,letterSpacing:"0.16em",marginTop:1 }}>PROPERTY MGMT</div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ padding:"8px 10px",flex:1 }}>
        {NAV.map(section=>(
          <div key={section.section} style={{ marginBottom:16 }}>
            <div style={{ fontSize:9,fontWeight:700,color:C.textMuted,letterSpacing:"0.16em",padding:"6px 10px 4px",opacity:0.7 }}>{section.section}</div>
            {section.items.map(item=>{
              const active = isActive(item.path);
              const badge = item.label==="Maintenance"&&openMaintenance>0 ? openMaintenance
                          : item.label==="Messages"&&unreadMessages>0    ? unreadMessages
                          : 0;
              return (
                <div key={item.path} className="l-nav" {...pressable("link", ()=>onNavigate(item.path))} aria-current={active ? "page" : undefined}
                  style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 10px",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:active?500:400,color:active?C.gold:C.textSub,background:active?"rgba(201,169,110,0.07)":"transparent",borderLeft:`2px solid ${active?C.gold:"transparent"}`,transition:"all 0.12s",marginBottom:1 }}>
                  <span>{item.label}</span>
                  {badge>0&&<span style={{ fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:8,background:item.label==="Messages"?"#2563EB":C.amber,color:"#fff",minWidth:18,textAlign:"center" }}>{badge}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ borderTop:`1px solid ${C.border}`,position:"relative" }}>
        {showPopover&&(
          <div style={{ position:"absolute",bottom:"100%",left:8,right:8,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",marginBottom:6,boxShadow:"0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)" }}>
            <div className="l-pop-item" {...pressable("button", ()=>{ onNavigate("/landlord/settings"); setShowPopover(false); })}
              style={{ padding:"10px 14px",fontSize:13,color:C.text,cursor:"pointer",display:"flex",alignItems:"center",gap:8,borderBottom:`1px solid ${C.border}` }}>
              <div style={{ width:6,height:6,borderRadius:"50%",background:C.gold }}/> Settings
            </div>
            <div className="l-pop-item" {...pressable("button", async()=>{ await supabase.auth.signOut(); onNavigate("/landlord/login"); })}
              style={{ padding:"10px 14px",fontSize:13,color:C.red,cursor:"pointer",display:"flex",alignItems:"center",gap:8 }}>
              <div style={{ width:6,height:6,borderRadius:"50%",background:C.red }}/> Sign out
            </div>
          </div>
        )}
        <div className="l-account" {...pressable("button", ()=>setShowPopover(p=>!p))} aria-haspopup="menu" aria-expanded={showPopover} aria-label={`Account${landlordName ? `: ${landlordName}` : ""}`}
          style={{ padding:"16px 20px",display:"flex",alignItems:"center",gap:10,cursor:"pointer" }}>
          <div style={{ width:32,height:32,borderRadius:"50%",background:"rgba(185,154,91,0.12)",border:`1px solid rgba(185,154,91,0.22)`,color:C.goldText,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:600,flexShrink:0,letterSpacing:"0.02em" }}>{initials}</div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:13,fontWeight:500,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{landlordName}</div>
            <div style={{ fontSize:11,color:C.textMuted }}>Portfolio Owner</div>
          </div>
          <div style={{ fontSize:12,color:C.textMuted,transform:showPopover?"rotate(180deg)":"none",transition:"transform 0.15s" }}>⌃</div>
        </div>
      </div>
    </>
  );
}

export default function LandlordLayout({ children, openMaintenance = 0, unreadMessages = 0 }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [landlordName, setLandlordName] = useState("");
  const [showPopover,  setShowPopover]  = useState(false);
  const [drawerOpen,   setDrawerOpen]   = useState(false);   // mobile only (≤720px)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.full_name) setLandlordName(user.user_metadata.full_name);
    });
  }, []);

  const menuBtnRef = useRef(null), drawerRef = useRef(null);

  // The drawer closes when a link is chosen (go), on Escape, on the scrim, and if the window grows past the mobile
  // breakpoint. Each landlord page renders its own LandlordLayout, so a route change also starts with it closed.
  // While open: focus moves into it, Tab and Shift+Tab stay inside it, and the page behind doesn't scroll.
  // On close: focus returns to the menu button (when it's still on screen; after a navigation the page has changed).
  useEffect(() => {
    if (!drawerOpen) return;
    const focusables = () => [...(drawerRef.current?.querySelectorAll('button, [tabindex="0"]') || [])];
    focusables()[0]?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); setDrawerOpen(false); return; }
      if (e.key !== "Tab") return;
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (!drawerRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    const mq = window.matchMedia("(min-width: 721px)");
    const onMq = (e) => { if (e.matches) setDrawerOpen(false); };
    const prev = document.body.style.overflow;
    const btn = menuBtnRef.current;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); mq.removeEventListener("change", onMq);
      if (btn?.isConnected && btn.offsetParent !== null) btn.focus();
    };
  }, [drawerOpen]);

  function isActive(path) {
    if (path === "/landlord") return location.pathname === "/landlord";
    return location.pathname.startsWith(path);
  }
  const go = (path) => { setDrawerOpen(false); navigate(path); };

  const initials = landlordName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const current = NAV.flatMap(s => s.items).filter(i => isActive(i.path)).sort((a, b) => b.path.length - a.path.length)[0];
  const badges = (openMaintenance > 0 ? openMaintenance : 0) + (unreadMessages > 0 ? unreadMessages : 0);
  const contents = { isActive, openMaintenance, unreadMessages, landlordName, initials, showPopover, setShowPopover };

  return (
    <div className="l-shell" style={{ display:"flex",fontFamily:"'DM Sans',sans-serif",fontSize:14,color:C.text,background:C.bg,minHeight:"100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        .l-nav:hover{background:rgba(255,255,255,0.03)!important;color:#F0EDE6!important;}
        .l-pop-item:hover{background:#1A1F29!important;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
        .l-nav:focus-visible,.l-pop-item:focus-visible,.l-account:focus-visible,.l-menu-btn:focus-visible,.l-drawer button:focus-visible{outline:2px solid ${C.goldText};outline-offset:-2px;}
        .l-nav:focus:not(:focus-visible),.l-pop-item:focus:not(:focus-visible),.l-account:focus:not(:focus-visible){outline:none;}
        .l-top{display:none;}
        @media (max-width:720px){
          html,body{overflow-x:hidden;}
          .l-shell{flex-direction:column;}
          .l-side{display:none!important;}
          .l-top{display:flex;}
          .l-content{width:100%;max-width:100vw;overflow-x:auto;}
        }
        @keyframes l-drawer-in{from{transform:translateX(-100%);}to{transform:none;}}
        @keyframes l-fade-in{from{opacity:0;}to{opacity:1;}}
        @media (prefers-reduced-motion:reduce){.l-drawer,.l-scrim{animation:none!important;}}
      `}</style>

      {/* Sidebar (desktop, >720px): unchanged */}
      <div className="l-side" style={{ width:220,background:C.bg,borderRight:`1px solid ${C.border}`,minHeight:"100vh",display:"flex",flexDirection:"column",flexShrink:0,position:"sticky",top:0,height:"100vh",overflowY:"auto" }}>
        <SidebarContents {...contents} onNavigate={navigate}/>
      </div>

      {/* Top bar (mobile, ≤720px) */}
      <div className="l-top" style={{ position:"sticky",top:0,zIndex:150,height:56,alignItems:"center",gap:12,padding:"0 12px 0 6px",background:C.bg,borderBottom:`1px solid ${C.border}` }}>
        <button ref={menuBtnRef} type="button" className="l-menu-btn" aria-label="Open navigation" aria-expanded={drawerOpen} aria-controls="landlord-nav-drawer" onClick={()=>setDrawerOpen(true)}
          style={{ width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",background:"transparent",border:"none",borderRadius:8,cursor:"pointer",position:"relative",flexShrink:0 }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 5.5h14M3 10h14M3 14.5h14" stroke={C.text} strokeWidth="1.6" strokeLinecap="round"/></svg>
          {badges>0&&<span aria-hidden="true" style={{ position:"absolute",top:10,right:9,width:7,height:7,borderRadius:4,background:C.amber }}/>}
        </button>
        <ModusMark size={22}/>
        <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:15,fontWeight:600,letterSpacing:"0.1em",color:C.text }}>MODUS</div>
        {current&&<div style={{ marginLeft:"auto",fontSize:12,color:C.textSub,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",minWidth:0 }}>{current.label}</div>}
      </div>

      {/* Drawer (mobile) */}
      {drawerOpen&&(
        <>
          <div className="l-scrim" onClick={()=>setDrawerOpen(false)} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:240,animation:"l-fade-in .15s ease-out" }}/>
          <nav ref={drawerRef} id="landlord-nav-drawer" className="l-drawer" aria-label="Landlord navigation" role="dialog" aria-modal="true"
            style={{ position:"fixed",top:0,bottom:0,left:0,width:"min(280px, 85vw)",zIndex:250,background:C.bg,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",overflowY:"auto",animation:"l-drawer-in .2s ease-out",boxShadow:"8px 0 32px rgba(0,0,0,0.5)" }}>
            <button type="button" aria-label="Close navigation" onClick={()=>setDrawerOpen(false)}
              style={{ position:"absolute",top:14,right:10,width:36,height:36,background:"transparent",border:"none",color:C.textSub,fontSize:18,cursor:"pointer",borderRadius:8 }}>✕</button>
            <SidebarContents {...contents} onNavigate={go}/>
          </nav>
        </>
      )}

      {/* Content */}
      <div className="l-content" style={{ flex:1,overflowY:"auto",minWidth:0 }}>{children}</div>
    </div>
  );
}
