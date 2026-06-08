import { useState } from "react";
import { useNavigate } from "react-router-dom";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";

const CATEGORIES = [
  { id: "all",        label: "All",          icon: "🏠" },
  { id: "forsale",    label: "For Sale",     icon: "🏷️" },
  { id: "free",       label: "Free",         icon: "🎁" },
  { id: "lost_found", label: "Lost & Found", icon: "🔍" },
  { id: "community",  label: "Community",    icon: "👋" },
  { id: "services",   label: "Services",     icon: "🔧" },
];

const INITIAL_POSTS = [
  {
    id: 1,
    author: "Maria R.", initials: "MR", unit: "4B", color: "#185FA5", bg: "#E6F1FB",
    category: "forsale",
    title: "Moving out — selling my couch",
    body: "Beautiful grey sectional, barely used. $200 OBO. Perfect condition, just don't want to move it. DM me to see photos!",
    time: "2h ago", likes: 4, liked: false,
    comments: [
      { id: 1, author: "Jordan K.", initials: "JK", unit: "2A", text: "Is it still available? I'll take it!", time: "1h ago" },
      { id: 2, author: "Sam P.",    initials: "SP", unit: "3C", text: "Can you do $175?",                   time: "45m ago" },
    ],
  },
  {
    id: 2,
    author: "Alex T.", initials: "AT", unit: "1D", color: "#3B6D11", bg: "#EAF3DE",
    category: "lost_found",
    title: "Anyone missing a black cat?",
    body: "Found a black cat near the parking lot last night. Very friendly, no collar. Currently at my unit. Please reach out if this is yours!",
    time: "5h ago", likes: 12, liked: true,
    comments: [
      { id: 1, author: "Priya M.", initials: "PM", unit: "5A", text: "Oh no! Putting up flyers now 🙏", time: "4h ago" },
    ],
  },
  {
    id: 3,
    author: "Jordan K.", initials: "JK", unit: "2A", color: "#854F0B", bg: "#FAEEDA",
    category: "community",
    title: "Building BBQ — Saturday June 7th!",
    body: "Hey neighbors! I'm organizing a rooftop BBQ this Saturday at 4pm. BYOB, I'll bring the grill. Just reply here so I know how many people to expect 🎉",
    time: "1d ago", likes: 18, liked: false,
    comments: [
      { id: 1, author: "Maria R.", initials: "MR", unit: "4B", text: "I'm in! Bringing potato salad 🥗",  time: "23h ago" },
      { id: 2, author: "Sam P.",   initials: "SP", unit: "3C", text: "Count me in, bringing drinks!",     time: "20h ago" },
      { id: 3, author: "Alex T.",  initials: "AT", unit: "1D", text: "Love this idea, see you there!",    time: "18h ago" },
    ],
  },
  {
    id: 4,
    author: "Sam P.", initials: "SP", unit: "3C", color: "#6B3FA0", bg: "#F3EEFB",
    category: "free",
    title: "Free — misc kitchen stuff",
    body: "Leaving next week and giving away: toaster, blender, dish rack, and a set of pots. Everything works great. First come first served!",
    time: "2d ago", likes: 7, liked: false,
    comments: [],
  },
];

const CAT_COLORS = {
  forsale:    { bg: "#E6F1FB", color: "#185FA5" },
  free:       { bg: "#EAF3DE", color: "#3B6D11" },
  lost_found: { bg: "#FAEEDA", color: "#854F0B" },
  community:  { bg: "#F3EEFB", color: "#6B3FA0" },
  services:   { bg: "#FDECEA", color: "#A32D2D" },
};

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
};

let nextId = INITIAL_POSTS.length + 1;
let nextCommentId = 100;

export default function BulletinBoard() {
  const { tenant } = useTenant();
  const [posts, setPosts]                       = useState(INITIAL_POSTS);
  const [filter, setFilter]                     = useState("all");
  const [showModal, setShowModal]               = useState(false);
  const [expandedComments, setExpandedComments] = useState({});
  const [commentInputs, setCommentInputs]       = useState({});
  const [newPost, setNewPost]                   = useState({ title: "", body: "", category: "community" });

  const filtered = filter === "all" ? posts : posts.filter(p => p.category === filter);

  function toggleLike(id) {
    setPosts(prev => prev.map(p =>
      p.id === id ? { ...p, liked: !p.liked, likes: p.liked ? p.likes - 1 : p.likes + 1 } : p
    ));
  }

  function toggleComments(id) {
    setExpandedComments(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function addComment(postId) {
    const text = commentInputs[postId]?.trim();
    if (!text) return;
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, comments: [...p.comments, { id: nextCommentId++, author: "You", initials: "ME", unit: tenant?.unit || "—", text, time: "Just now" }] }
        : p
    ));
    setCommentInputs(prev => ({ ...prev, [postId]: "" }));
  }

  function submitPost() {
    if (!newPost.title.trim() || !newPost.body.trim()) return;
    setPosts(prev => [{
      id: nextId++,
      author: tenant?.name || "You",
      initials: (tenant?.name || "Me").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
      unit: tenant?.unit || "—",
      color: "#185FA5", bg: "#E6F1FB",
      category: newPost.category,
      title: newPost.title,
      body: newPost.body,
      time: "Just now", likes: 0, liked: false, comments: [],
    }, ...prev]);
    setNewPost({ title: "", body: "", category: "community" });
    setShowModal(false);
  }

  return (
    <TenantLayout tenantName={tenant?.name}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        ::-webkit-scrollbar:horizontal { height: 0; }
      `}</style>

      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif", paddingBottom: 48 }}>

        {/* Header */}
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "20px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: C.text }}>Bulletin Board</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{posts.length} posts · Clifton Manor</div>
            </div>
            <button onClick={() => setShowModal(true)}
              style={{ background: C.goldDim, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 500, color: C.text, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              + New post
            </button>
          </div>

          {/* Filter pills */}
          <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 14 }}>
            {CATEGORIES.map(cat => {
              const active = filter === cat.id;
              return (
                <button key={cat.id} onClick={() => setFilter(cat.id)}
                  style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, background: active ? C.goldDim : "transparent", color: active ? C.text : C.textSub, border: `1px solid ${active ? C.goldDim : C.border}`, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, fontFamily: "'DM Sans', sans-serif", transition: "all 0.12s" }}>
                  {cat.icon} {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Feed */}
        <div style={{ padding: "16px 20px 0" }}>
          {filtered.map(post => {
            const showComments = expandedComments[post.id];
            const catLabel = CATEGORIES.find(c => c.id === post.category)?.label || post.category;
            const catStyle = CAT_COLORS[post.category] || { bg: "#f4f5f7", color: "#555" };
            return (
              <div key={post.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>

                {/* Post header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: post.bg, color: post.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{post.initials}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{post.author}</div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>Unit {post.unit} · {post.time}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: catStyle.bg, color: catStyle.color }}>{catLabel}</span>
                </div>

                {/* Post body */}
                <div style={{ padding: "0 16px 12px" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>{post.title}</div>
                  <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6 }}>{post.body}</div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 16px", borderTop: `1px solid ${C.border}` }}>
                  <button onClick={() => toggleLike(post.id)}
                    style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", fontSize: 13, fontWeight: post.liked ? 600 : 400, color: post.liked ? "#E05555" : C.textSub, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", padding: 0 }}>
                    {post.liked ? "❤️" : "🤍"} {post.likes}
                  </button>
                  <button onClick={() => toggleComments(post.id)}
                    style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", fontSize: 13, color: showComments ? C.gold : C.textSub, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", padding: 0 }}>
                    💬 {post.comments.length} {post.comments.length === 1 ? "reply" : "replies"}
                  </button>
                </div>

                {/* Comments */}
                {showComments && (
                  <div style={{ background: C.raised, borderTop: `1px solid ${C.border}`, padding: "12px 16px" }}>
                    {post.comments.map(c => (
                      <div key={c.id} style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "flex-start" }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#E6F1FB", color: "#185FA5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{c.initials}</div>
                        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "4px 10px 10px 10px", padding: "8px 10px", flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 2 }}>{c.author} · Unit {c.unit}</div>
                          <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>{c.text}</div>
                          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3 }}>{c.time}</div>
                        </div>
                      </div>
                    ))}

                    {/* Comment input */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                      <input
                        value={commentInputs[post.id] || ""}
                        onChange={e => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter") addComment(post.id); }}
                        placeholder="Add a reply…"
                        style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 20, background: C.surface, color: C.text, outline: "none", fontFamily: "'DM Sans', sans-serif" }}
                      />
                      <button onClick={() => addComment(post.id)}
                        style={{ width: 32, height: 32, borderRadius: "50%", background: commentInputs[post.id]?.trim() ? C.goldDim : C.border, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: C.text, flexShrink: 0, transition: "background 0.15s" }}>
                        ➤
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* New post modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "14px 14px 0 0", width: "100%", maxWidth: 480, padding: "20px 24px 36px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: "0 auto 20px" }} />
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 20 }}>New post</div>

            {/* Category */}
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Category</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
              {CATEGORIES.filter(c => c.id !== "all").map(cat => {
                const active = newPost.category === cat.id;
                const cs = CAT_COLORS[cat.id] || { bg: "#f4f5f7", color: "#555" };
                return (
                  <button key={cat.id} onClick={() => setNewPost(p => ({ ...p, category: cat.id }))}
                    style={{ padding: "8px 6px", border: active ? `2px solid ${cs.color}` : `1px solid ${C.border}`, borderRadius: 8, background: active ? cs.bg : C.raised, cursor: "pointer", textAlign: "center", fontSize: 12, fontWeight: active ? 600 : 400, color: active ? cs.color : C.textSub, fontFamily: "'DM Sans', sans-serif" }}>
                    {cat.icon} {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Title */}
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Title</div>
            <input value={newPost.title} onChange={e => setNewPost(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Selling my couch before move-out" maxLength={80}
              style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 8, background: C.raised, color: C.text, outline: "none", fontFamily: "'DM Sans', sans-serif", marginBottom: 14 }} />

            {/* Body */}
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Details</div>
            <textarea value={newPost.body} onChange={e => setNewPost(p => ({ ...p, body: e.target.value }))} placeholder="Add more details, price, pickup info, etc." maxLength={400}
              style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 8, background: C.raised, color: C.text, outline: "none", fontFamily: "'DM Sans', sans-serif", resize: "vertical", minHeight: 80, marginBottom: 16 }} />

            <button onClick={submitPost}
              style={{ width: "100%", padding: "13px", background: C.goldDim, color: C.text, border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              Post to Bulletin Board
            </button>
          </div>
        </div>
      )}
    </TenantLayout>
  );
}