import { useNavigate } from 'react-router-dom';
import { useState } from "react";
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

const DOCUMENTS = [
  { id:1, category:"lease",    title:"Lease Agreement",         subtitle:"Jan 1, 2026 – Dec 31, 2026",       date:"Jan 1, 2026",  size:"1.2 MB", type:"PDF", color:C.blue,  new:false },
  { id:2, category:"lease",    title:"Lease Renewal Offer",     subtitle:"2027 terms — action required",      date:"May 15, 2026", size:"980 KB", type:"PDF", color:C.gold,  new:true  },
  { id:3, category:"payments", title:"May 2026 Receipt",        subtitle:"Payment of $1,150.00",             date:"May 1, 2026",  size:"120 KB", type:"PDF", color:C.green, new:false },
  { id:4, category:"payments", title:"Apr 2026 Receipt",        subtitle:"Payment of $1,150.00",             date:"Apr 1, 2026",  size:"120 KB", type:"PDF", color:C.green, new:false },
  { id:5, category:"payments", title:"Mar 2026 Receipt",        subtitle:"Payment of $1,150.00 + $75 late fee",date:"Mar 6, 2026",size:"135 KB", type:"PDF", color:C.green, new:false },
  { id:6, category:"move_in",  title:"Move-In Inspection Report",subtitle:"Signed by both parties",          date:"Jan 1, 2026",  size:"3.4 MB", type:"PDF", color:C.amber, new:false },
  { id:7, category:"move_in",  title:"Welcome & Building Guide",subtitle:"Parking, trash, amenities",        date:"Jan 1, 2026",  size:"2.1 MB", type:"PDF", color:C.amber, new:false },
  { id:8, category:"notices",  title:"Plumbing Access Notice",  subtitle:"Jun 2 maintenance visit",          date:"May 20, 2026", size:"88 KB",  type:"PDF", color:C.red,   new:true  },
];

const CATEGORIES = [
  { id:"all",      label:"All" },
  { id:"lease",    label:"Lease" },
  { id:"payments", label:"Receipts" },
  { id:"move_in",  label:"Move-in" },
  { id:"notices",  label:"Notices" },
];

export default function DocumentsScreen() {
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const [filter, setFilter]     = useState("all");
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState(null);

  const filtered = DOCUMENTS.filter(doc => {
    const matchCat = filter==="all"||doc.category===filter;
    const matchSearch = doc.title.toLowerCase().includes(search.toLowerCase())||doc.subtitle.toLowerCase().includes(search.toLowerCase());
    return matchCat&&matchSearch;
  });

  const newCount = DOCUMENTS.filter(d=>d.new).length;

  return (
    <TenantLayout tenantName={tenant?.name}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};}
        .t-doc:hover{border-color:#353A44!important;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
        ::-webkit-scrollbar:horizontal{height:0;}
      `}</style>

      <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',sans-serif",paddingBottom:48}}>

        {/* Header */}
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"20px 20px 16px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:C.text}}>Documents</div>
            {newCount>0&&<span style={{fontSize:10,fontWeight:600,padding:"3px 10px",background:`${C.gold}18`,color:C.gold,borderRadius:20}}>{newCount} new</span>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px"}}>
            <span style={{color:C.textMuted,fontSize:13}}>⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search documents…"
              style={{flex:1,background:"none",border:"none",outline:"none",color:C.text,fontSize:13,fontFamily:"'DM Sans',sans-serif"}}/>
            {search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",color:C.textMuted,cursor:"pointer",fontSize:13}}>✕</button>}
          </div>
        </div>

        {/* Filter pills */}
        <div style={{display:"flex",gap:8,padding:"14px 20px",overflowX:"auto",scrollbarWidth:"none",borderBottom:`1px solid ${C.border}`}}>
          {CATEGORIES.map(cat=>(
            <button key={cat.id} onClick={()=>setFilter(cat.id)} style={{padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:500,background:filter===cat.id?C.goldDim:"transparent",color:filter===cat.id?C.text:C.textSub,border:`1px solid ${filter===cat.id?C.goldDim:C.border}`,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'DM Sans',sans-serif",flexShrink:0,transition:"all 0.12s"}}>
              {cat.label}{cat.id==="all"&&` (${DOCUMENTS.length})`}
            </button>
          ))}
        </div>

        {/* Document list */}
        <div style={{padding:"16px 20px 0"}}>
          {filtered.length===0?(
            <div style={{textAlign:"center",padding:"40px 0",color:C.textSub}}>
              <div style={{fontSize:32,marginBottom:12}}>📂</div>
              <div style={{fontSize:14,fontWeight:500,color:C.text,marginBottom:4}}>No documents found</div>
              <div style={{fontSize:12}}>Try a different search or filter</div>
            </div>
          ):(
            filtered.map(doc=>(
              <div key={doc.id} className="t-doc"
                onClick={()=>setSelected(doc)}
                style={{background:doc.new?`${C.gold}06`:C.surface,border:`1px solid ${doc.new?C.goldDim:C.border}`,borderRadius:10,padding:"14px",marginBottom:8,display:"flex",alignItems:"center",gap:12,cursor:"pointer",transition:"border-color 0.15s"}}>
                <div style={{width:42,height:42,borderRadius:9,background:`${doc.color}18`,border:`1px solid ${doc.color}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:doc.color}}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:500,color:C.text,marginBottom:2}}>{doc.title}</div>
                  <div style={{fontSize:11,color:C.textSub,marginBottom:4}}>{doc.subtitle}</div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:9,fontWeight:700,padding:"2px 5px",borderRadius:3,background:`${C.red}18`,color:C.red,letterSpacing:"0.04em"}}>{doc.type}</span>
                    <span style={{fontSize:11,color:C.textMuted}}>{doc.date} · {doc.size}</span>
                  </div>
                </div>
                {doc.new&&<span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:5,background:`${C.gold}18`,color:C.gold,flexShrink:0}}>New</span>}
                <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
                  <button onClick={e=>{e.stopPropagation();}} style={{width:30,height:30,borderRadius:7,background:`${C.blue}18`,border:`1px solid ${C.blue}33`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:C.blue}}>👁</button>
                  <button onClick={e=>{e.stopPropagation();}} style={{width:30,height:30,borderRadius:7,background:C.raised,border:`1px solid ${C.border}`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:C.textSub}}>⬇</button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Storage bar */}
        <div style={{margin:"16px 20px 0",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:12,fontWeight:500,color:C.textSub}}>Storage used</span>
            <span style={{fontSize:12,color:C.textMuted}}>8.1 MB of 50 MB</span>
          </div>
          <div style={{height:4,background:C.raised,borderRadius:2,overflow:"hidden"}}>
            <div style={{height:"100%",width:"23%",background:C.blue,borderRadius:2}}/>
          </div>
        </div>
      </div>

      {/* Preview modal */}
      {selected&&(
        <div onClick={()=>setSelected(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200}}>
          <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:"14px 14px 0 0",width:"100%",maxWidth:480,padding:"20px 24px 36px"}}>
            <div style={{width:36,height:4,borderRadius:2,background:C.border,margin:"0 auto 20px"}}/>
            <div style={{width:52,height:52,borderRadius:10,background:`${selected.color}18`,border:`1px solid ${selected.color}33`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}>
              <div style={{width:14,height:14,borderRadius:"50%",background:selected.color}}/>
            </div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:600,color:C.text,textAlign:"center",marginBottom:4}}>{selected.title}</div>
            <div style={{fontSize:13,color:C.textSub,textAlign:"center",marginBottom:22}}>{selected.subtitle} · {selected.size}</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setSelected(null)} style={{flex:1,padding:"12px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,fontSize:14,fontWeight:500,color:C.textSub,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Close</button>
              <button style={{flex:1,padding:"12px",background:C.goldDim,border:"none",borderRadius:8,fontSize:14,fontWeight:500,color:C.text,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>⬇ Download</button>
            </div>
          </div>
        </div>
      )}
    </TenantLayout>
  );
}