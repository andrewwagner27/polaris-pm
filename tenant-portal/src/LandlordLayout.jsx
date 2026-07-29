import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./supabase";

const C = {
  bg:       "#0A0B0D",
  surface:  "#111316",
  border:   "#252930",
  text:     "#EDEAE2",
  textSub:  "#9095A0",
  textMuted:"#5C6270",
  gold:     "#C9A96E",
  goldDim:  "#7A5C2E",
  red:      "#E05555",
  amber:    "#F0A430",
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
    { label: "Properties",   path: "/landlord/properties"   },
    { label: "Tenants",      path: "/landlord/tenants"      },
    { label: "Applications", path: "/landlord/applications" },
    { label: "Reports",      path: "/landlord/reports"      },
  ]},
  { section: "OPERATIONS", items: [
    { label: "Maintenance",  path: "/landlord/maintenance"  },
    { label: "Financials",   path: "/landlord/financials"   },
    { label: "Messages",     path: "/landlord/messages"     },
  ]},
  { section: "ACCOUNT", items: [
    { label: "Settings",     path: "/landlord/settings"     },
  ]},
];

export default function LandlordLayout({ children, openMaintenance = 0, unreadMessages = 0 }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [landlordName, setLandlordName] = useState("Andrew Wagner");
  const [showPopover,  setShowPopover]  = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.full_name) setLandlordName(user.user_metadata.full_name);
    });
  }, []);

  function isActive(path) {
    if (path === "/landlord") return location.pathname === "/landlord";
    return location.pathname.startsWith(path);
  }

  const initials = landlordName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{ display:"flex",fontFamily:"'DM Sans',sans-serif",fontSize:14,color:C.text,background:C.bg,minHeight:"100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        .l-nav:hover{background:rgba(255,255,255,0.04)!important;color:${C.text}!important;}
        .l-pop-item:hover{background:#181C21!important;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
      `}</style>

      {/* Sidebar */}
      <div style={{ width:220,background:C.bg,borderRight:`1px solid ${C.border}`,minHeight:"100vh",display:"flex",flexDirection:"column",flexShrink:0,position:"sticky",top:0,height:"100vh",overflowY:"auto" }}>

        {/* Logo */}
        <div style={{ padding:"24px 20px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10,marginBottom:8 }}>
          <ModusMark size={30}/>
          <div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:17,fontWeight:600,color:C.text,letterSpacing:"0.08em" }}>MODUS</div>
            <div style={{ fontSize:9,color:C.textMuted,letterSpacing:"0.14em" }}>PROPERTY MANAGEMENT</div>
          </div>
        </div>

        {/* Nav */}
        <div style={{ padding:"8px 10px",flex:1 }}>
          {NAV.map(section=>(
            <div key={section.section} style={{ marginBottom:16 }}>
              <div style={{ fontSize:9,fontWeight:700,color:C.textMuted,letterSpacing:"0.14em",padding:"0 8px",marginBottom:4 }}>{section.section}</div>
              {section.items.map(item=>{
                const active = isActive(item.path);
                const badge = item.label==="Maintenance"&&openMaintenance>0 ? openMaintenance
                            : item.label==="Messages"&&unreadMessages>0    ? unreadMessages
                            : 0;
                return (
                  <div key={item.path} className="l-nav"
                    onClick={()=>navigate(item.path)}
                    style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 10px",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:active?500:400,color:active?C.gold:C.textSub,background:active?"rgba(201,169,110,0.07)":"transparent",borderLeft:`2px solid ${active?C.gold:"transparent"}`,transition:"all 0.12s",marginBottom:1 }}>
                    <span>{item.label}</span>
                    {badge>0&&<span style={{ fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:8,background:item.label==="Messages"?C.blue:C.amber,color:"#fff",minWidth:18,textAlign:"center" }}>{badge}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ borderTop:`1px solid ${C.border}`,position:"relative" }}>
          {showPopover&&(
            <div style={{ position:"absolute",bottom:"100%",left:8,right:8,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",marginBottom:6,boxShadow:"0 8px 24px rgba(0,0,0,0.4)" }}>
              <div className="l-pop-item" onClick={()=>{ navigate("/landlord/settings"); setShowPopover(false); }}
                style={{ padding:"10px 14px",fontSize:13,color:C.text,cursor:"pointer",display:"flex",alignItems:"center",gap:8,borderBottom:`1px solid ${C.border}` }}>
                <div style={{ width:6,height:6,borderRadius:"50%",background:C.gold }}/> Settings
              </div>
              <div className="l-pop-item" onClick={async()=>{ await supabase.auth.signOut(); navigate("/landlord/login"); }}
                style={{ padding:"10px 14px",fontSize:13,color:C.red,cursor:"pointer",display:"flex",alignItems:"center",gap:8 }}>
                <div style={{ width:6,height:6,borderRadius:"50%",background:C.red }}/> Sign out
              </div>
            </div>
          )}
          <div style={{ padding:"16px 20px",display:"flex",alignItems:"center",gap:10,cursor:"pointer" }} onClick={()=>setShowPopover(p=>!p)}>
            <div style={{ width:34,height:34,borderRadius:"50%",background:`${C.gold}22`,border:`1px solid ${C.goldDim}`,color:C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0 }}>{initials}</div>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontSize:13,fontWeight:500,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{landlordName}</div>
              <div style={{ fontSize:11,color:C.textMuted }}>Portfolio Owner</div>
            </div>
            <div style={{ fontSize:12,color:C.textMuted,transform:showPopover?"rotate(180deg)":"none",transition:"transform 0.15s" }}>⌃</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1,overflowY:"auto",minWidth:0 }}>{children}</div>
    </div>
  );
}