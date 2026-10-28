import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import { useTenant } from "./useTenant";
import TenantLayout from "./TenantLayout";

const C = {
  bg:"#0A0B0D",surface:"#111316",raised:"#181C21",border:"#252930",
  text:"#EDEAE2",textSub:"#9095A0",textMuted:"#5C6270",
  gold:"#C9A96E",goldDim:"#7A5C2E",blue:"#4A9AE8",green:"#72B02A",red:"#E05555",amber:"#F0A430",
};

const CATEGORY_COLORS = {
  maintenance: { c: C.amber,   bg: "rgba(240,164,48,0.12)" },
  announcement:{ c: C.blue,    bg: "rgba(74,154,232,0.12)" },
  general:     { c: C.textSub, bg: "rgba(144,149,160,0.12)" },
  question:    { c: C.blue,    bg: "rgba(74,154,232,0.12)" },
};
function catStyle(cat) { return CATEGORY_COLORS[cat?.toLowerCase()] || CATEGORY_COLORS.general; }

function fmtDate(d) {
  if (!d) return "";
  const date = new Date(d), now = new Date();
  const days = Math.floor((now - date) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7)  return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month:"short", day:"numeric" });
}

const inputStyle = (extra={}) => ({
  width:"100%", padding:"10px 14px", background:C.raised,
  border:`1px solid ${C.border}`, borderRadius:8, color:C.text,
  fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none", ...extra,
});

const BLANK = { title:"", body:"", category:"general" };

// ── Comment thread for one post ──────────────────────────────────────────────
function CommentThread({ post, tenant }) {
  const [comments, setComments]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [text, setText]           = useState("");
  const [submitting, setSubmit]   = useState(false);
  const [editId, setEditId]       = useState(null);
  const [editText, setEditText]   = useState("");

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from("bulletin_comments")
      .select("*")
      .eq("bulletin_id", post.id)
      .order("created_at", { ascending: true });
    setComments(data || []);
    setLoading(false);
  }, [post.id]);

  useEffect(() => { fetch(); }, [fetch]);

  async function submit() {
    if (!text.trim()) return;
    setSubmit(true);
    await supabase.from("bulletin_comments").insert({
      bulletin_id: post.id,
      tenant_id:   tenant?.id || null,
      author:      tenant?.name || "Resident",
      body:        text.trim(),
    });
    setText("");
    setSubmit(false);
    fetch();
  }

  async function saveEdit(id) {
    if (!editText.trim()) return;
    await supabase.from("bulletin_comments").update({ body: editText.trim() }).eq("id", id);
    setEditId(null);
    fetch();
  }

  return (
    <div style={{ marginTop:16, borderTop:`1px solid ${C.border}`, paddingTop:14 }}>
      {loading ? (
        <div style={{ fontSize:12, color:C.textMuted }}>Loading comments…</div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {comments.map(c => (
            <div key={c.id} style={{ display:"flex", gap:10 }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:C.raised, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:600, color:C.gold, flexShrink:0 }}>
                {(c.author||"?")[0].toUpperCase()}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:C.text }}>{c.author}</span>
                  <span style={{ fontSize:11, color:C.textMuted }}>{fmtDate(c.created_at)}</span>
                  {c.tenant_id === tenant?.id && editId !== c.id && (
                    <button onClick={()=>{ setEditId(c.id); setEditText(c.body); }}
                      style={{ fontSize:11, color:C.textMuted, background:"none", border:"none", cursor:"pointer", padding:0, fontFamily:"'DM Sans',sans-serif" }}>Edit</button>
                  )}
                </div>
                {editId === c.id ? (
                  <div style={{ display:"flex", gap:6 }}>
                    <input value={editText} onChange={e=>setEditText(e.target.value)}
                      style={inputStyle({ padding:"6px 10px", fontSize:12, flex:1 })}/>
                    <button onClick={()=>saveEdit(c.id)}
                      style={{ padding:"6px 12px", background:C.gold, color:"#0A0B0D", border:"none", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Save</button>
                    <button onClick={()=>setEditId(null)}
                      style={{ padding:"6px 10px", background:"transparent", color:C.textMuted, border:`1px solid ${C.border}`, borderRadius:6, fontSize:12, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ fontSize:13, color:C.textSub, lineHeight:1.5 }}>{c.body}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* New comment input */}
      <div style={{ display:"flex", gap:8, marginTop:12 }}>
        <input value={text} onChange={e=>setText(e.target.value)}
          onKeyDown={e=>{ if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Write a comment…"
          style={inputStyle({ flex:1, padding:"8px 12px", fontSize:12 })}/>
        <button onClick={submit} disabled={submitting || !text.trim()}
          style={{ padding:"8px 14px", background:C.gold, color:"#0A0B0D", border:"none", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", opacity:(!text.trim()||submitting)?0.5:1 }}>
          {submitting ? "…" : "Post"}
        </button>
      </div>
    </div>
  );
}

// ── Main bulletin board ───────────────────────────────────────────────────────
export default function BulletinBoard() {
  const { tenant, loading } = useTenant();
  const [posts,      setPosts]      = useState([]);
  const [fetching,   setFetching]   = useState(true);
  const [filter,     setFilter]     = useState("all");
  const [likes,      setLikes]      = useState({});   // postId → bool
  const [likeCounts, setLikeCounts] = useState({});   // postId → number
  const [expanded,   setExpanded]   = useState({});   // postId → bool (comments open)
  const [editPost,   setEditPost]   = useState(null); // post being edited
  const [editForm,   setEditForm]   = useState(BLANK);
  const [saving,     setSaving]     = useState(false);

  // Compose
  const [showCompose, setShowCompose] = useState(false);
  const [form,        setForm]        = useState(BLANK);
  const [posting,     setPosting]     = useState(false);
  const [postErr,     setPostErr]     = useState("");

  const fetchPosts = useCallback(async () => {
    setFetching(true);
    const { data } = await supabase
      .from("bulletins")
      .select("*")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    setPosts(data || []);
    setFetching(false);
  }, []);

  const fetchLikes = useCallback(async (postList) => {
    if (!tenant?.id || !postList.length) return;
    // Counts
    const { data: counts } = await supabase
      .from("bulletin_likes")
      .select("bulletin_id")
      .in("bulletin_id", postList.map(p=>p.id));
    const countMap = {};
    (counts||[]).forEach(r => { countMap[r.bulletin_id] = (countMap[r.bulletin_id]||0)+1; });
    setLikeCounts(countMap);
    // Own likes
    const { data: mine } = await supabase
      .from("bulletin_likes")
      .select("bulletin_id")
      .eq("tenant_id", tenant.id)
      .in("bulletin_id", postList.map(p=>p.id));
    const likeMap = {};
    (mine||[]).forEach(r => { likeMap[r.bulletin_id] = true; });
    setLikes(likeMap);
  }, [tenant?.id]);

  useEffect(() => {
    if (tenant?.id) fetchPosts();
  }, [tenant?.id, fetchPosts]);

  useEffect(() => {
    if (posts.length) fetchLikes(posts);
  }, [posts, fetchLikes]);

  async function toggleLike(postId) {
    if (!tenant?.id) return;
    const liked = likes[postId];
    // Optimistic update
    setLikes(l => ({ ...l, [postId]: !liked }));
    setLikeCounts(c => ({ ...c, [postId]: (c[postId]||0) + (liked ? -1 : 1) }));
    if (liked) {
      await supabase.from("bulletin_likes").delete()
        .eq("bulletin_id", postId).eq("tenant_id", tenant.id);
    } else {
      await supabase.from("bulletin_likes").insert({ bulletin_id: postId, tenant_id: tenant.id });
    }
  }

  async function submitPost() {
    if (!form.title.trim()) { setPostErr("Title is required."); return; }
    if (!form.body.trim())  { setPostErr("Message is required."); return; }
    setPosting(true); setPostErr("");
    const { error } = await supabase.from("bulletins").insert({
      title:       form.title.trim(),
      body:        form.body.trim(),
      category:    form.category,
      author:      tenant?.name || "Resident",
      pinned:      false,
      tenant_id:   tenant?.id || null,
      property_id: tenant?.raw?.property_id || null,
    });
    setPosting(false);
    if (error) { setPostErr(error.message); return; }
    setForm(BLANK); setShowCompose(false);
    fetchPosts();
  }

  async function saveEdit() {
    if (!editForm.title.trim() || !editForm.body.trim()) return;
    setSaving(true);
    await supabase.from("bulletins").update({
      title:    editForm.title.trim(),
      body:     editForm.body.trim(),
      category: editForm.category,
    }).eq("id", editPost.id);
    setSaving(false);
    setEditPost(null);
    fetchPosts();
  }

  const categories = ["all", ...Array.from(new Set(posts.map(p=>p.category).filter(Boolean)))];
  const filtered   = filter === "all" ? posts : posts.filter(p => p.category === filter);

  if (loading) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:C.bg,color:C.textSub,fontFamily:"'DM Sans',sans-serif",fontSize:14 }}>Loading…</div>;

  return (
    <TenantLayout tenantName={tenant?.name||"Tenant"}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;}
        .b-card{transition:border-color 0.15s;}
        .b-card:hover{border-color:${C.goldDim}!important;}
        .like-btn:hover{color:${C.red}!important;}
        .comment-btn:hover{color:${C.gold}!important;}
        textarea:focus,input:focus,select:focus{border-color:${C.gold}!important;outline:none;}
        @media(max-width:767px){.bpad{padding:16px 14px!important;}}
      `}</style>

      <div className="bpad" style={{ background:C.bg, minHeight:"100vh", color:C.text, fontFamily:"'DM Sans',sans-serif", padding:"36px 40px 80px", maxWidth:800, margin:"0 auto" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24, gap:12 }}>
          <div>
            <div style={{ fontSize:12, color:C.textMuted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6 }}>Community</div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:34, fontWeight:600, color:C.text, lineHeight:1 }}>Bulletin Board</div>
          </div>
          <button onClick={()=>{ setShowCompose(v=>!v); setPostErr(""); }}
            style={{ marginTop:8, padding:"9px 18px", borderRadius:8, border:`1px solid ${C.gold}`, background:showCompose?`rgba(201,169,110,0.15)`:"transparent", color:C.gold, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}>
            {showCompose ? "Cancel" : "+ New Post"}
          </button>
        </div>

        {/* Compose */}
        {showCompose && (
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"22px 24px", marginBottom:20 }}>
            <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:16 }}>New Post</div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div>
                <div style={{ fontSize:11, color:C.textMuted, marginBottom:5, fontWeight:500 }}>TITLE</div>
                <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="What's this about?" style={inputStyle()}/>
              </div>
              <div>
                <div style={{ fontSize:11, color:C.textMuted, marginBottom:5, fontWeight:500 }}>CATEGORY</div>
                <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={inputStyle({cursor:"pointer"})}>
                  <option value="general">General</option>
                  <option value="question">Question</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize:11, color:C.textMuted, marginBottom:5, fontWeight:500 }}>MESSAGE</div>
                <textarea value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} placeholder="Write your message…" rows={4} style={inputStyle({resize:"vertical",lineHeight:1.6})}/>
              </div>
              {postErr && <div style={{ fontSize:12, color:C.red, background:"rgba(224,85,85,0.1)", border:`1px solid ${C.red}`, borderRadius:6, padding:"8px 12px" }}>{postErr}</div>}
              <button onClick={submitPost} disabled={posting}
                style={{ alignSelf:"flex-end", padding:"9px 22px", borderRadius:8, border:"none", background:C.gold, color:"#0A0B0D", fontSize:13, fontWeight:600, cursor:posting?"not-allowed":"pointer", fontFamily:"'DM Sans',sans-serif", opacity:posting?0.7:1 }}>
                {posting ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        {categories.length > 1 && (
          <div style={{ display:"flex", gap:8, marginBottom:22, flexWrap:"wrap" }}>
            {categories.map(cat => (
              <button key={cat} onClick={()=>setFilter(cat)}
                style={{ padding:"6px 14px", borderRadius:20, border:`1px solid ${filter===cat?C.gold:C.border}`, background:filter===cat?`rgba(201,169,110,0.1)`:"transparent", color:filter===cat?C.gold:C.textSub, fontSize:12, fontWeight:filter===cat?600:400, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", textTransform:"capitalize" }}>
                {cat === "all" ? "All" : cat}
              </button>
            ))}
          </div>
        )}

        {/* Posts */}
        {fetching ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:C.textMuted, fontSize:13 }}>Loading posts…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 0" }}>
            <div style={{ fontSize:32, marginBottom:12 }}>📋</div>
            <div style={{ fontSize:15, fontWeight:500, color:C.text, marginBottom:6 }}>No posts yet</div>
            <div style={{ fontSize:13, color:C.textMuted }}>Be the first to post something for the community.</div>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {filtered.map(post => {
              const cs       = catStyle(post.category);
              const isOwner  = post.tenant_id === tenant?.id;
              const liked    = likes[post.id] || false;
              const likeCount= likeCounts[post.id] || 0;
              const open     = expanded[post.id] || false;
              const isEditing= editPost?.id === post.id;

              return (
                <div key={post.id} className="b-card"
                  style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"22px 24px" }}>

                  {/* Post header */}
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:12 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                      {post.category && (
                        <span style={{ fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:20, background:cs.bg, color:cs.c, letterSpacing:"0.06em", textTransform:"uppercase" }}>{post.category}</span>
                      )}
                      {post.pinned && (
                        <span style={{ fontSize:10, fontWeight:600, padding:"3px 10px", borderRadius:20, background:`${C.gold}15`, color:C.gold, letterSpacing:"0.06em", textTransform:"uppercase" }}>📌 Pinned</span>
                      )}
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                      <span style={{ fontSize:11, color:C.textMuted }}>{fmtDate(post.created_at)}</span>
                      {isOwner && !isEditing && (
                        <button onClick={()=>{ setEditPost(post); setEditForm({ title:post.title, body:post.body||"", category:post.category||"general" }); }}
                          style={{ fontSize:11, color:C.textMuted, background:"none", border:"none", cursor:"pointer", padding:0, fontFamily:"'DM Sans',sans-serif" }}>Edit</button>
                      )}
                    </div>
                  </div>

                  {/* Post body — view or edit */}
                  {isEditing ? (
                    <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14 }}>
                      <input value={editForm.title} onChange={e=>setEditForm(f=>({...f,title:e.target.value}))} style={inputStyle()}/>
                      <select value={editForm.category} onChange={e=>setEditForm(f=>({...f,category:e.target.value}))} style={inputStyle({cursor:"pointer"})}>
                        <option value="general">General</option>
                        <option value="question">Question</option>
                        <option value="maintenance">Maintenance</option>
                      </select>
                      <textarea value={editForm.body} onChange={e=>setEditForm(f=>({...f,body:e.target.value}))} rows={4} style={inputStyle({resize:"vertical",lineHeight:1.6})}/>
                      <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                        <button onClick={()=>setEditPost(null)}
                          style={{ padding:"7px 14px", background:"transparent", color:C.textMuted, border:`1px solid ${C.border}`, borderRadius:7, fontSize:12, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
                        <button onClick={saveEdit} disabled={saving}
                          style={{ padding:"7px 16px", background:C.gold, color:"#0A0B0D", border:"none", borderRadius:7, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", opacity:saving?0.7:1 }}>{saving?"Saving…":"Save"}</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, fontWeight:600, color:C.text, marginBottom:8, lineHeight:1.3 }}>{post.title}</div>
                      <div style={{ fontSize:13, color:C.textSub, lineHeight:1.6, whiteSpace:"pre-wrap", marginBottom:10 }}>{post.body || post.content}</div>
                      {post.author && <div style={{ fontSize:11, color:C.textMuted }}>— {post.author}</div>}
                    </>
                  )}

                  {/* Like + Comment bar */}
                  {!isEditing && (
                    <div style={{ display:"flex", gap:18, marginTop:14, paddingTop:12, borderTop:`1px solid ${C.border}` }}>
                      <button className="like-btn" onClick={()=>toggleLike(post.id)}
                        style={{ display:"flex", alignItems:"center", gap:5, background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:13, color:liked?C.red:C.textMuted, fontWeight:liked?600:400, padding:0 }}>
                        {liked ? "❤️" : "🤍"} {likeCount > 0 && likeCount}
                      </button>
                      <button className="comment-btn" onClick={()=>setExpanded(e=>({...e,[post.id]:!e[post.id]}))}
                        style={{ display:"flex", alignItems:"center", gap:5, background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:13, color:open?C.gold:C.textMuted, padding:0 }}>
                        💬 {open ? "Hide comments" : "Comment"}
                      </button>
                    </div>
                  )}

                  {/* Comment thread */}
                  {open && !isEditing && (
                    <CommentThread post={post} tenant={tenant}/>
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