import { useState } from "react";
import { useNavigate } from "react-router-dom";

const CATEGORIES = [
  { id: "all",        label: "All",        icon: "🏠" },
  { id: "forsale",    label: "For Sale",   icon: "🏷️" },
  { id: "free",       label: "Free",       icon: "🎁" },
  { id: "lost_found", label: "Lost & Found", icon: "🔍" },
  { id: "community",  label: "Community",  icon: "👋" },
  { id: "services",   label: "Services",   icon: "🔧" },
];

const INITIAL_POSTS = [
  {
    id: 1,
    author: "Maria R.",
    initials: "MR",
    unit: "4B",
    color: "#185FA5",
    bg: "#E6F1FB",
    category: "forsale",
    title: "Moving out — selling my couch",
    body: "Beautiful grey sectional, barely used. $200 OBO. Perfect condition, just don't want to move it. DM me to see photos!",
    image: null,
    time: "2h ago",
    likes: 4,
    comments: [
      { id: 1, author: "Jordan K.", initials: "JK", unit: "2A", text: "Is it still available? I'll take it!", time: "1h ago" },
      { id: 2, author: "Sam P.",    initials: "SP", unit: "3C", text: "Can you do $175?", time: "45m ago" },
    ],
    liked: false,
  },
  {
    id: 2,
    author: "Alex T.",
    initials: "AT",
    unit: "1D",
    color: "#3B6D11",
    bg: "#EAF3DE",
    category: "lost_found",
    title: "Anyone missing a black cat?",
    body: "Found a black cat near the parking lot last night. Very friendly, no collar. Currently at my unit. Please reach out if this is yours!",
    image: null,
    time: "5h ago",
    likes: 12,
    comments: [
      { id: 1, author: "Priya M.", initials: "PM", unit: "5A", text: "Oh no! Putting up flyers now 🙏", time: "4h ago" },
    ],
    liked: true,
  },
  {
    id: 3,
    author: "Jordan K.",
    initials: "JK",
    unit: "2A",
    color: "#854F0B",
    bg: "#FAEEDA",
    category: "community",
    title: "Building BBQ — Saturday June 7th!",
    body: "Hey neighbors! I'm organizing a rooftop BBQ this Saturday at 4pm. BYOB, I'll bring the grill. Just reply here so I know how many people to expect. The more the merrier 🎉",
    image: null,
    time: "1d ago",
    likes: 18,
    comments: [
      { id: 1, author: "Maria R.",  initials: "MR", unit: "4B", text: "I'm in! Bringing potato salad 🥗", time: "23h ago" },
      { id: 2, author: "Sam P.",    initials: "SP", unit: "3C", text: "Count me in, bringing drinks!", time: "20h ago" },
      { id: 3, author: "Alex T.",   initials: "AT", unit: "1D", text: "Love this idea, see you there!", time: "18h ago" },
    ],
    liked: false,
  },
  {
    id: 4,
    author: "Sam P.",
    initials: "SP",
    unit: "3C",
    color: "#6B3FA0",
    bg: "#F3EEFB",
    category: "free",
    title: "Free — misc kitchen stuff",
    body: "Leaving next week and giving away: toaster, blender, dish rack, and a set of pots. Everything works great. First come first served, leave a comment and come grab it.",
    image: null,
    time: "2d ago",
    likes: 7,
    comments: [],
    liked: false,
  },
];

const CAT_COLORS = {
  forsale:    { bg: "#E6F1FB", color: "#185FA5" },
  free:       { bg: "#EAF3DE", color: "#3B6D11" },
  lost_found: { bg: "#FAEEDA", color: "#854F0B" },
  community:  { bg: "#F3EEFB", color: "#6B3FA0" },
  services:   { bg: "#FDECEA", color: "#A32D2D" },
};

const s = {
  app: {
    width: "100%",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontSize: 14,
    color: "#1a1a1a",
    background: "#f4f5f7",
    minHeight: "100vh",
    paddingBottom: 80,
  },
  header: {
    background: "#0C447C",
    padding: "16px 20px 0",
  },
  headerTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  backBtn: {
    background: "rgba(255,255,255,0.15)",
    border: "none", borderRadius: 8,
    width: 32, height: 32, cursor: "pointer",
    color: "#E6F1FB", fontSize: 16,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 15, fontWeight: 600, color: "#E6F1FB" },
  headerSub: { fontSize: 11, color: "#85B7EB" },
  newPostBtn: {
    background: "#fff", border: "none",
    borderRadius: 20, padding: "7px 14px",
    fontSize: 12, fontWeight: 600, color: "#0C447C",
    cursor: "pointer", display: "flex",
    alignItems: "center", gap: 5,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  filterBar: {
    display: "flex", gap: 8,
    padding: "12px 0 0",
    overflowX: "auto",
    scrollbarWidth: "none",
  },
  filterPill: (active) => ({
    padding: "6px 12px", borderRadius: 20,
    fontSize: 12, fontWeight: active ? 600 : 400,
    background: active ? "#fff" : "rgba(255,255,255,0.15)",
    color: active ? "#0C447C" : "#B5D4F4",
    border: "none", cursor: "pointer",
    whiteSpace: "nowrap", flexShrink: 0,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  }),
  feed: { padding: "16px 16px 0" },
  postCard: {
    background: "#fff",
    border: "1px solid #e8eaed",
    borderRadius: 14,
    marginBottom: 14,
    overflow: "hidden",
  },
  postHeader: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 14px 10px",
  },
  postAuthorRow: { display: "flex", alignItems: "center", gap: 10 },
  avatar: (color, bg) => ({
    width: 38, height: 38, borderRadius: "50%",
    background: bg, color,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 13, fontWeight: 700, flexShrink: 0,
  }),
  postAuthor: { fontSize: 13, fontWeight: 600, color: "#1a1a1a" },
  postMeta: { fontSize: 11, color: "#aaa", marginTop: 1 },
  catBadge: (cat) => ({
    fontSize: 10, fontWeight: 600,
    padding: "3px 8px", borderRadius: 10,
    background: CAT_COLORS[cat]?.bg || "#f4f5f7",
    color: CAT_COLORS[cat]?.color || "#555",
    flexShrink: 0,
  }),
  postBody: { padding: "0 14px 12px" },
  postTitle: { fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 },
  postText: { fontSize: 13, color: "#444", lineHeight: 1.6 },
  postActions: {
    display: "flex", alignItems: "center",
    padding: "10px 14px",
    borderTop: "1px solid #f4f5f7",
    gap: 16,
  },
  actionBtn: (active) => ({
    display: "flex", alignItems: "center", gap: 5,
    background: "none", border: "none",
    fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? "#0C447C" : "#888",
    cursor: "pointer",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    padding: 0,
  }),
  commentsSection: {
    background: "#f8f9fa",
    borderTop: "1px solid #f0f0f0",
    padding: "10px 14px",
  },
  comment: {
    display: "flex", gap: 8,
    marginBottom: 10,
    alignItems: "flex-start",
  },
  commentAvatar: (color, bg) => ({
    width: 26, height: 26, borderRadius: "50%",
    background: bg, color,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 9, fontWeight: 700, flexShrink: 0, marginTop: 1,
  }),
  commentBubble: {
    background: "#fff", border: "1px solid #e8eaed",
    borderRadius: "4px 12px 12px 12px",
    padding: "8px 10px", flex: 1,
  },
  commentAuthor: { fontSize: 11, fontWeight: 600, color: "#1a1a1a", marginBottom: 2 },
  commentText: { fontSize: 12, color: "#444", lineHeight: 1.5 },
  commentTime: { fontSize: 10, color: "#bbb", marginTop: 3 },
  commentInput: {
    display: "flex", gap: 8, alignItems: "center",
    marginTop: 8,
  },
  commentField: {
    flex: 1, padding: "8px 12px",
    fontSize: 13, border: "1px solid #e8eaed",
    borderRadius: 20, background: "#fff",
    outline: "none", fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  sendBtn: (hasText) => ({
    width: 32, height: 32, borderRadius: "50%",
    background: hasText ? "#0C447C" : "#e8eaed",
    border: "none", cursor: hasText ? "pointer" : "default",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 14, flexShrink: 0, transition: "background 0.15s",
    color: "#fff",
  }),
  // New post modal
  modal: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "flex-end",
    justifyContent: "center", zIndex: 200,
  },
  modalCard: {
    background: "#fff",
    borderRadius: "20px 20px 0 0",
    width: "100%", maxWidth: 460,
    padding: "20px 20px 36px",
    maxHeight: "90vh", overflowY: "auto",
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    background: "#e8eaed", margin: "0 auto 18px",
  },
  modalTitle: { fontSize: 16, fontWeight: 700, marginBottom: 16 },
  modalField: { marginBottom: 14 },
  modalLabel: {
    fontSize: 11, fontWeight: 600, color: "#555",
    letterSpacing: "0.06em", textTransform: "uppercase",
    display: "block", marginBottom: 5,
  },
  modalInput: {
    width: "100%", padding: "10px 12px", fontSize: 14,
    border: "1px solid #d1d5db", borderRadius: 8,
    background: "#fff", color: "#1a1a1a", outline: "none",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    boxSizing: "border-box",
  },
  modalTextarea: {
    width: "100%", padding: "10px 12px", fontSize: 14,
    border: "1px solid #d1d5db", borderRadius: 8,
    background: "#fff", color: "#1a1a1a", outline: "none",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    boxSizing: "border-box", resize: "vertical", minHeight: 80,
  },
  catGrid: {
    display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
  },
  catBtn: (active, cat) => ({
    padding: "8px 6px",
    border: active ? `2px solid ${CAT_COLORS[cat]?.color || "#185FA5"}` : "1px solid #e8eaed",
    borderRadius: 8, background: active ? CAT_COLORS[cat]?.bg || "#E6F1FB" : "#f8f9fa",
    cursor: "pointer", textAlign: "center", fontSize: 12,
    fontWeight: active ? 600 : 400,
    color: active ? CAT_COLORS[cat]?.color || "#185FA5" : "#555",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  }),
  postSubmitBtn: {
    width: "100%", padding: 13,
    background: "#0C447C", color: "#fff",
    border: "none", borderRadius: 8,
    fontSize: 15, fontWeight: 600, cursor: "pointer",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    marginTop: 4,
  },
};

const AUTHOR_COLORS = [
  { color: "#185FA5", bg: "#E6F1FB" },
  { color: "#3B6D11", bg: "#EAF3DE" },
  { color: "#854F0B", bg: "#FAEEDA" },
  { color: "#6B3FA0", bg: "#F3EEFB" },
];

let nextId = INITIAL_POSTS.length + 1;
let nextCommentId = 100;

export default function BulletinBoard() {
  const navigate = useNavigate();
  const [posts, setPosts]           = useState(INITIAL_POSTS);
  const [filter, setFilter]         = useState("all");
  const [showModal, setShowModal]   = useState(false);
  const [expandedComments, setExpandedComments] = useState({});
  const [commentInputs, setCommentInputs]       = useState({});
  const [newPost, setNewPost]       = useState({ title: "", body: "", category: "community" });

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
    const colorIdx = Math.floor(Math.random() * AUTHOR_COLORS.length);
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, comments: [...p.comments, { id: nextCommentId++, author: "Maria R.", initials: "MR", unit: "4B", text, time: "Just now" }] }
        : p
    ));
    setCommentInputs(prev => ({ ...prev, [postId]: "" }));
  }

  function submitPost() {
    if (!newPost.title.trim() || !newPost.body.trim()) return;
    const colorIdx = nextId % AUTHOR_COLORS.length;
    const post = {
      id: nextId++,
      author: "Maria R.",
      initials: "MR",
      unit: "4B",
      ...AUTHOR_COLORS[0],
      category: newPost.category,
      title: newPost.title,
      body: newPost.body,
      image: null,
      time: "Just now",
      likes: 0,
      comments: [],
      liked: false,
    };
    setPosts(prev => [post, ...prev]);
    setNewPost({ title: "", body: "", category: "community" });
    setShowModal(false);
  }

  return (
    <div style={s.app}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; } ::-webkit-scrollbar { width: 0; }`}</style>

      {/* ── Header ── */}
      <div style={s.header}>
        <div style={s.headerTop}>
          <div style={s.headerLeft}>
            <button style={s.backBtn} onClick={() => navigate("/home")}>←</button>
            <div>
              <div style={s.headerTitle}>Bulletin Board</div>
              <div style={s.headerSub}>Clifton Manor · {posts.length} posts</div>
            </div>
          </div>
          <button style={s.newPostBtn} onClick={() => setShowModal(true)}>
            ✏️ New post
          </button>
        </div>

        {/* Filter pills */}
        <div style={s.filterBar}>
          {CATEGORIES.map(cat => (
            <button key={cat.id} style={s.filterPill(filter === cat.id)} onClick={() => setFilter(cat.id)}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Feed ── */}
      <div style={s.feed}>
        {filtered.map(post => {
          const showComments = expandedComments[post.id];
          const catLabel = CATEGORIES.find(c => c.id === post.category)?.label || post.category;
          return (
            <div key={post.id} style={s.postCard}>
              {/* Post header */}
              <div style={s.postHeader}>
                <div style={s.postAuthorRow}>
                  <div style={s.avatar(post.color, post.bg)}>{post.initials}</div>
                  <div>
                    <div style={s.postAuthor}>{post.author}</div>
                    <div style={s.postMeta}>Unit {post.unit} · {post.time}</div>
                  </div>
                </div>
                <span style={s.catBadge(post.category)}>{catLabel}</span>
              </div>

              {/* Post body */}
              <div style={s.postBody}>
                <div style={s.postTitle}>{post.title}</div>
                <div style={s.postText}>{post.body}</div>
              </div>

              {/* Actions */}
              <div style={s.postActions}>
                <button style={s.actionBtn(post.liked)} onClick={() => toggleLike(post.id)}>
                  {post.liked ? "❤️" : "🤍"} {post.likes}
                </button>
                <button style={s.actionBtn(showComments)} onClick={() => toggleComments(post.id)}>
                  💬 {post.comments.length} {post.comments.length === 1 ? "reply" : "replies"}
                </button>
                <button style={s.actionBtn(false)}>
                  🔗 Share
                </button>
              </div>

              {/* Comments */}
              {showComments && (
                <div style={s.commentsSection}>
                  {post.comments.map(c => (
                    <div key={c.id} style={s.comment}>
                      <div style={s.commentAvatar(
                        c.initials === "MR" ? "#185FA5" : "#854F0B",
                        c.initials === "MR" ? "#E6F1FB" : "#FAEEDA"
                      )}>
                        {c.initials}
                      </div>
                      <div style={s.commentBubble}>
                        <div style={s.commentAuthor}>{c.author} · Unit {c.unit}</div>
                        <div style={s.commentText}>{c.text}</div>
                        <div style={s.commentTime}>{c.time}</div>
                      </div>
                    </div>
                  ))}

                  {/* Comment input */}
                  <div style={s.commentInput}>
                    <div style={s.avatar("#185FA5", "#E6F1FB")}>MR</div>
                    <input
                      style={s.commentField}
                      value={commentInputs[post.id] || ""}
                      onChange={e => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === "Enter") addComment(post.id); }}
                      placeholder="Add a reply…"
                    />
                    <button
                      style={s.sendBtn(!!(commentInputs[post.id]?.trim()))}
                      onClick={() => addComment(post.id)}
                    >➤</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── New post modal ── */}
      {showModal && (
        <div style={s.modal} onClick={() => setShowModal(false)}>
          <div style={s.modalCard} onClick={e => e.stopPropagation()}>
            <div style={s.modalHandle} />
            <div style={s.modalTitle}>✏️ New post</div>

            <div style={s.modalField}>
              <label style={s.modalLabel}>Category</label>
              <div style={s.catGrid}>
                {CATEGORIES.filter(c => c.id !== "all").map(cat => (
                  <button
                    key={cat.id}
                    style={s.catBtn(newPost.category === cat.id, cat.id)}
                    onClick={() => setNewPost(p => ({ ...p, category: cat.id }))}
                  >
                    {cat.icon} {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={s.modalField}>
              <label style={s.modalLabel}>Title</label>
              <input
                style={s.modalInput}
                value={newPost.title}
                onChange={e => setNewPost(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Selling my couch before move-out"
                maxLength={80}
              />
            </div>

            <div style={s.modalField}>
              <label style={s.modalLabel}>Details</label>
              <textarea
                style={s.modalTextarea}
                value={newPost.body}
                onChange={e => setNewPost(p => ({ ...p, body: e.target.value }))}
                placeholder="Add more details, price, pickup info, etc."
                maxLength={400}
              />
            </div>

            <button style={s.postSubmitBtn} onClick={submitPost}>
              Post to Bulletin Board
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
