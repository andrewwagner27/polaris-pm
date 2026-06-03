import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";

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
  green:     "#72B02A",
  red:       "#E05555",
  amber:     "#F0A430",
};

const MENU_ITEMS = [
  { section: "Payments", items: [
    { label: "Payment Ledger",  sub: "Download official PDF",        action: "ledger",   color: C.green },
    { label: "Pay Rent",        sub: "June · $1,150 due Jun 1",      route: "/pay",      color: C.gold,  badge: { label: "Due", color: C.amber } },
    { label: "Autopay",         sub: "Currently off",                action: "autopay",  color: C.blue },
  ]},
  { section: "Compliance", items: [
    { label: "Renters Insurance", sub: "Verified · Expires Dec 31, 2026", route: "/insurance", color: C.green, badge: { label: "Verified", color: C.green } },
    { label: "Documents",         sub: "8 files · 2 new",               route: "/documents", color: C.blue,  badge: { label: "2 new",   color: C.blue  } },
  ]},
  { section: "Community", items: [
    { label: "Bulletin Board", sub: "4 posts from neighbors", route: "/bulletin",  color: C.amber },
    { label: "Messages",       sub: "1 unread message",       route: "/messages",  color: C.blue, badge: { label: "1", color: C.blue } },
  ]},
  { section: "Settings", items: [
    { label: "Profile",       sub: "Name, email, phone",     action: "profile",   color: C.textSub },
    { label: "Notifications", sub: "Rent reminders, alerts", action: "notifs",    color: C.textSub },
    { label: "Password",      sub: "Change your password",   action: "password",  color: C.textSub },
  ]},
];

function leaseProgress() {
  const start=new Date("2026-01-01"), end=new Date("2026-12-31"), today=new Date();
  return Math.min(100,Math.max(0,Math.round(((today-start)/(end-start))*100)));
}

export default function AccountScreen() {
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const [downloading, setDownloading] = useState(false);
  const progress = leaseProgress();

  const name    = tenant?.name || "Tenant";
  const initials = name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();

  async function handleLedger() {
    setDownloading(true);
    await new Promise(r=>setTimeout(r,800));
    setDownloading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  function handleItem(item) {
    if (item.route) { navigate(item.route); return; }
    if (item.action==="ledger") { handleLedger(); return; }
  }

  return (
    <TenantLayout tenantName={name}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        .t-menu-item:hover{background:${C.raised}!important;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
      `}</style>

      <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',sans-serif",paddingBottom:80}}>

        {/* Header */}
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"28px 20px 24px",textAlign:"center"}}>
          <div style={{width:68,height:68,borderRadius:"50%",background:`${C.gold}22`,border:`2px solid ${C.goldDim}`,color:C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,margin:"0 auto 14px"}}>{initials}</div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.text,marginBottom:4}}>{name}</div>
          <div style={{fontSize:12,color:C.textSub,marginBottom:12}}>{tenant?.email || "—"}</div>
          <span style={{display:"inline-flex",alignItems:"center",gap:6,background:`${C.green}15`,border:`1px solid ${C.green}33`,borderRadius:20,padding:"5px 14px",fontSize:12,color:C.green}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:C.green}}/> Active tenant · Unit {tenant?.unit || "—"}
          </span>
        </div>

        <div style={{padding:"16px 20px 0"}}>

          {/* Lease summary */}
          <div style={{fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,marginTop:8}}>Lease summary</div>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",marginBottom:20}}>
            {[
              ["Property",    tenant?.property || "Clifton Manor"],
              ["Lease start", "January 1, 2026"],
              ["Lease end",   "December 31, 2026"],
              ["Monthly rent",`$${(tenant?.rent||1150).toLocaleString()}`],
            ].map(([k,v],i,arr)=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none"}}>
                <span style={{fontSize:13,color:C.textSub}}>{k}</span>
                <span style={{fontSize:13,fontWeight:500,color:C.text}}>{v}</span>
              </div>
            ))}
            <div style={{marginTop:14}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.textSub,marginBottom:6}}>
                <span>Lease progress</span><span>{progress}% complete</span>
              </div>
              <div style={{height:4,background:C.raised,borderRadius:2,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${progress}%`,background:C.gold,borderRadius:2,transition:"width 0.3s"}}/>
              </div>
            </div>
          </div>

          {/* Menu sections */}
          {MENU_ITEMS.map(section=>(
            <div key={section.section} style={{marginBottom:20}}>
              <div style={{fontSize:10,fontWeight:600,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>{section.section}</div>
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                {section.items.map((item,i)=>(
                  <div key={item.label} className="t-menu-item"
                    onClick={()=>handleItem(item)}
                    style={{display:"flex",alignItems:"center",padding:"13px 16px",borderBottom:i<section.items.length-1?`1px solid ${C.border}`:"none",cursor:"pointer",gap:14,transition:"background 0.12s"}}>
                    <div style={{width:36,height:36,borderRadius:8,background:`${item.color}18`,border:`1px solid ${item.color}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:item.color}}/>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:500,color:C.text,marginBottom:2}}>{item.action==="ledger"&&downloading?"Generating PDF…":item.label}</div>
                      <div style={{fontSize:11,color:C.textSub}}>{item.sub}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                      {item.badge&&<span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:5,background:`${item.badge.color}18`,color:item.badge.color}}>{item.badge.label}</span>}
                      <span style={{fontSize:16,color:C.textMuted}}>›</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Sign out */}
          <button onClick={handleSignOut} style={{width:"100%",padding:"12px",background:"rgba(224,85,85,0.08)",border:`1px solid rgba(224,85,85,0.2)`,borderRadius:8,fontSize:14,fontWeight:500,color:C.red,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",marginBottom:12}}>
            Sign out
          </button>
          <div style={{fontSize:11,color:C.textMuted,textAlign:"center",paddingBottom:8}}>Modus PM · Built in Columbus, OH</div>
        </div>
      </div>
    </TenantLayout>
  );
}