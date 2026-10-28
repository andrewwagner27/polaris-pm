import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useTenant } from "./useTenant";
import TenantLayout from "./TenantLayout";

const C = {
  bg:"#0A0B0D",surface:"#111316",raised:"#181C21",border:"#252930",
  text:"#EDEAE2",textSub:"#9095A0",textMuted:"#5C6270",
  gold:"#C9A96E",goldDim:"#7A5C2E",blue:"#4A9AE8",green:"#72B02A",red:"#E05555",amber:"#F0A430",
};

const CATEGORY_COLORS = {
  maintenance: { c: C.amber, bg: "rgba(240,164,48,0.12)" },
  announcement:{ c: C.blue,  bg: "rgba(74,154,232,0.12)" },
  reminder:    { c: C.gold,  bg: "rgba(201,169,110,0.12)" },
  policy:      { c: C.textSub, bg: "rgba(144,149,160,0.12)" },
  emergency:   { c: C.red,   bg: "rgba(224,85,85,0.12)" },
  general:     { c: C.textSub, bg: "rgba(144,149,160,0.12)" },
  question:    { c: C.blue,  bg: "rgba(74,154,232,0.12)" },
};

function categoryStyle(cat) {
  return CATEGORY_COLORS[cat?.toLowerCase()] || CATEGORY_COLORS.general;
}

function fmtDate(d) {
  if (!d) return "";
  const date = new Date(d);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000*60*60*24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-US",{month:"short",day:"numeric",year:date.getFullYear()!==now.getFullYear()?"numeric":undefined});
}

const BLANK_FORM = { title:"", body:"", category:"general" };

export default function BulletinBoard() {
  const { tenant, loading } = useTenant();
  const [posts, setPosts] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [filter, setFilter] = useState("all");

  // Compose state
  const [showCompose, setShowCompose] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [posting, setPosting] = useState(false);
  const [postErr, setPostErr] = useState("");

  useEffect(() => {
    if (tenant?.id) fetchPosts();
  }, [tenant?.id]);

  async function fetchPosts() {
    setFetching(true);
    const { data, error } = await supabase
      .from("bulletins")
      .select("*")
      .or(`property_id.eq.${tenant?.raw?.unit_id || "00000000-0000-0000-0000-000000000000"},property_id.is.null`)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });

    if (!error && data) {
      setPosts(data);
    } else {
      const { data: all } = await supabase
        .from("bulletins")
        .select("*")
        .order("created_at", { ascending: false });
      setPosts(all || []);
    }
    setFetching(false);
  }

  async function submitPost() {
    if (!form.title.trim()) { setPostErr("Title is required."); return; }
    if (!form.body.trim())  { setPostErr("Message is required."); return; }
    setPosting(true); setPostErr("");
    const payload = {
      title:       form.title.trim(),
      body:        form.body.trim(),
      category:    form.category,
      author:      tenant?.name || "Resident",
      pinned:      false,
      tenant_id:   tenant?.id || null,
      property_id: tenant?.raw?.property_id || null,
    };
    console.log("Bulletin insert payload:", payload);
    const { error } = await supabase.from("bulletins").insert(payload);
    console.log("Bulletin insert error:", error);
    setPosting(false);
    if (error) { setPostErr(error.message); return; }
    setForm(BLANK_FORM);
    setShowCompose(false);
    fetchPosts();
  }

  const categories = ["all", ...Array.from(new Set(posts.map(p=>p.category).filter(Boolean)))];
  const filtered = filter === "all" ? posts : posts.filter(p => p.category === filter);

  if (loading) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:C.bg,color:C.textSub,fontFamily:"'DM Sans',sans-serif",fontSize:14 }}>Loading…</div>;

  const inputStyle = { width:"100%",padding:"10px 14px",background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,fontFamily:"'DM Sans',sans-serif",outline:"none" };

  return (
    <TenantLayout tenantName={tenant?.name||"Tenant"}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;}
        .bulletin-card:hover{border-color:${C.goldDim}!important;}
        @media(max-width:767px){.bulletin-pad{padding:16px 14px!important;}}
        textarea:focus,input:focus,select:focus{border-color:${C.gold}!important;outline:none;}
      `}</style>

      <div className="bulletin-pad" style={{ background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',sans-serif",padding:"36px 40px 80px",maxWidth:800,margin:"0 auto" }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,gap:12 }}>
          <div>
            <div style={{ fontSize:12,color:C.textMuted,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6 }}>Community</div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:34,fontWeight:600,color:C.text,lineHeight:1 }}>Bulletin Board</div>
          </div>
          <button onClick={()=>{ setShowCompose(v=>!v); setPostErr(""); }}
            style={{ marginTop:8,padding:"9px 18px",borderRadius:8,border:`1px solid ${C.gold}`,background:showCompose?`rgba(201,169,110,0.15)`:"transparent",color:C.gold,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",flexShrink:0,transition:"background 0.12s" }}>
            {showCompose ? "Cancel" : "+ New Post"}
          </button>
        </div>

        {/* Compose form */}
        {showCompose && (
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"22px 24px",marginBottom:20 }}>
            <div style={{ fontSize:13,fontWeight:600,color:C.text,marginBottom:16 }}>New Post</div>
            <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
              <div>
                <div style={{ fontSize:11,color:C.textMuted,marginBottom:5,fontWeight:500 }}>TITLE</div>
                <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}
                  placeholder="What's this about?" style={inputStyle}/>
              </div>
              <div>
                <div style={{ fontSize:11,color:C.textMuted,marginBottom:5,fontWeight:500 }}>CATEGORY</div>
                <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}
                  style={{...inputStyle,cursor:"pointer"}}>
                  <option value="general">General</option>
                  <option value="question">Question</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize:11,color:C.textMuted,marginBottom:5,fontWeight:500 }}>MESSAGE</div>
                <textarea value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))}
                  placeholder="Write your message…" rows={4}
                  style={{...inputStyle,resize:"vertical",lineHeight:1.6}}/>
              </div>
              {postErr && (
                <div style={{ fontSize:12,color:C.red,background:"rgba(224,85,85,0.1)",border:`1px solid ${C.red}`,borderRadius:6,padding:"8px 12px" }}>{postErr}</div>
              )}
              <button onClick={submitPost} disabled={posting}
                style={{ alignSelf:"flex-end",padding:"9px 22px",borderRadius:8,border:"none",background:C.gold,color:"#0A0B0D",fontSize:13,fontWeight:600,cursor:posting?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",opacity:posting?0.7:1 }}>
                {posting ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        )}

        {/* Category filter */}
        {categories.length > 1 && (
          <div style={{ display:"flex",gap:8,marginBottom:22,flexWrap:"wrap" }}>
            {categories.map(cat => (
              <button key={cat} onClick={()=>setFilter(cat)}
                style={{ padding:"6px 14px",borderRadius:20,border:`1px solid ${filter===cat?C.gold:C.border}`,background:filter===cat?`rgba(201,169,110,0.1)`:"transparent",color:filter===cat?C.gold:C.textSub,fontSize:12,fontWeight:filter===cat?600:400,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",textTransform:"capitalize",transition:"all 0.12s" }}>
                {cat === "all" ? "All" : cat}
              </button>
            ))}
          </div>
        )}

        {/* Posts */}
        {fetching ? (
          <div style={{ textAlign:"center",padding:"60px 0",color:C.textMuted,fontSize:13 }}>Loading posts…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:"center",padding:"60px 0" }}>
            <div style={{ fontSize:32,marginBottom:12 }}>📋</div>
            <div style={{ fontSize:15,fontWeight:500,color:C.text,marginBottom:6 }}>No bulletin posts yet</div>
            <div style={{ fontSize:13,color:C.textMuted }}>Be the first to post, or check back for updates from your property manager.</div>
          </div>
        ) : (
          <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
            {filtered.map(post => {
              const cs = categoryStyle(post.category);
              return (
                <div key={post.id} className="bulletin-card"
                  style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"22px 24px",transition:"border-color 0.15s",cursor:"default" }}>
                  <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:12 }}>
                    <div style={{ display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" }}>
                      {post.category && (
                        <span style={{ fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,background:cs.bg,color:cs.c,letterSpacing:"0.06em",textTransform:"uppercase" }}>{post.category}</span>
                      )}
                      {post.pinned && (
                        <span style={{ fontSize:10,fontWeight:600,padding:"3px 10px",borderRadius:20,background:`${C.gold}15`,color:C.gold,letterSpacing:"0.06em",textTransform:"uppercase" }}>📌 Pinned</span>
                      )}
                    </div>
                    <span style={{ fontSize:11,color:C.textMuted,flexShrink:0 }}>{fmtDate(post.created_at)}</span>
                  </div>
                  <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.text,marginBottom:10,lineHeight:1.3 }}>{post.title}</div>
                  <div style={{ fontSize:13,color:C.textSub,lineHeight:1.6,whiteSpace:"pre-wrap" }}>{post.body || post.content}</div>
                  {post.author && (
                    <div style={{ marginTop:14,fontSize:11,color:C.textMuted }}>— {post.author}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </TenantLayout>
  );
}
