import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "./supabase";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";

const STATUS_CONFIG = {
  open:        { label: "Open",        color: "#854F0B", bg: "#FAEEDA" },
  in_progress: { label: "In Progress", color: "#185FA5", bg: "#E6F1FB" },
  resolved:    { label: "Resolved",    color: "#3B6D11", bg: "#EAF3DE" },
};

const PRIORITY_CONFIG = {
  low:    { label: "Low",    color: "#3B6D11", bg: "#EAF3DE" },
  normal: { label: "Normal", color: "#185FA5", bg: "#E6F1FB" },
  high:   { label: "High",   color: "#854F0B", bg: "#FAEEDA" },
  urgent: { label: "Urgent", color: "#A32D2D", bg: "#FDECEA" },
};

const CATEGORY_ICONS = {
  plumbing: "🚿", electrical: "⚡", hvac: "🌡️",
  appliance: "🍳", pest: "🐛", other: "🔧",
};

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

export default function TenantMaintenanceDetail() {
  const navigate         = useNavigate();
  const { id }           = useParams();
  const { tenant, user } = useTenant();
  const width            = useWindowWidth();
  const isDesktop        = width >= 768;

  const [ticket, setTicket]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [comments, setComments]     = useState([]);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting]       = useState(false);
  const [lightbox, setLightbox]     = useState(null);

  useEffect(() => { fetchTicket(); }, [id]);
  useEffect(() => { if (ticket) fetchComments(); }, [ticket?.id]);

  async function fetchTicket() {
    setLoading(true);
    const { data } = await supabase
      .from("maintenance_requests")
      .select("*")
      .eq("id", id)
      .single();
    setTicket(data || null);
    setLoading(false);
  }

  async function fetchComments() {
    const { data } = await supabase
      .from("maintenance_comments")
      .select("*")
      .eq("request_id", id)
      .eq("visible_to_tenant", true)
      .order("created_at", { ascending: true });
    setComments(data || []);
  }

  async function postComment() {
    if (!newComment.trim() || !user) return;
    setPosting(true);
    await supabase.from("maintenance_comments").insert({
      request_id:        id,
      author_id:         user.id,
      author_name:       tenant?.name || user.email,
      body:              newComment.trim(),
      visible_to_tenant: true,
    });
    setNewComment("");
    await fetchComments();
    setPosting(false);
  }

  if (loading) return (
    <TenantLayout tenantName={tenant?.name}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "#888", fontSize: 14 }}>Loading…</div>
    </TenantLayout>
  );

  if (!ticket) return (
    <TenantLayout tenantName={tenant?.name}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "#888", fontSize: 14 }}>Ticket not found.</div>
    </TenantLayout>
  );

  const sc   = STATUS_CONFIG[ticket.status]     || STATUS_CONFIG.open;
  const pc   = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal;
  const icon = CATEGORY_ICONS[ticket.category]  || "🔧";
  const submittedDate = new Date(ticket.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const updatedDate   = ticket.updated_at ? new Date(ticket.updated_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null;

  return (
    <TenantLayout tenantName={tenant?.name}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; background: #f4f5f7; }`}</style>
      <div style={{ padding: isDesktop ? "28px" : "20px" }}>

        {/* Back */}
        <button onClick={() => navigate("/maintenance")}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#185FA5", background: "none", border: "none", cursor: "pointer", fontFamily: "'Inter',sans-serif", padding: 0, marginBottom: 20 }}>
          ← Back to requests
        </button>

        {/* Two-column layout */}
        <div style={{ display: "flex", gap: 20, flexDirection: isDesktop ? "row" : "column", alignItems: "flex-start" }}>

          {/* LEFT COLUMN */}
          <div style={{ flex: isDesktop ? "0 0 55%" : "1", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Header card */}
            <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ background: "#0C447C", padding: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{icon}</div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 3 }}>{ticket.title}</div>
                    <div style={{ fontSize: 12, color: "#85B7EB" }}>Submitted {submittedDate}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 10, background: sc.bg, color: sc.color }}>{sc.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 10, background: pc.bg, color: pc.color }}>{pc.label} priority</span>
                </div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                {ticket.description && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Description</div>
                    <p style={{ fontSize: 13, color: "#444", lineHeight: 1.6, margin: 0 }}>{ticket.description}</p>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    ["Category",     ticket.category || "—"],
                    ["Status",       sc.label],
                    ["Submitted",    submittedDate],
                    ["Last updated", updatedDate || submittedDate],
                    ["Vendor",       ticket.vendor_name || "Not assigned yet"],
                    ["Scheduled",    ticket.scheduled_date || "Not scheduled yet"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ background: "#f8f9fa", borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 11, color: "#888", marginBottom: 3 }}>{k}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Photos */}
            {ticket.photos?.length > 0 && (
              <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 14, padding: "16px 20px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Photos ({ticket.photos.length})</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {ticket.photos.map((url, i) => (
                    <img key={i} src={url} alt={`photo-${i}`}
                      onClick={() => setLightbox({ urls: ticket.photos, index: i })}
                      style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #e8eaed", cursor: "pointer" }} />
                  ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 14, padding: "16px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Timeline</div>
              {[
                { color: "#854F0B", text: "Request submitted", time: submittedDate },
                ticket.vendor_name   && { color: "#185FA5", text: `Assigned to ${ticket.vendor_name}`, time: updatedDate },
                ticket.scheduled_date && { color: "#185FA5", text: `Scheduled for ${ticket.scheduled_date}`, time: updatedDate },
                ticket.status === "resolved" && { color: "#3B6D11", text: "Issue resolved ✓", time: updatedDate },
              ].filter(Boolean).map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: item.color, flexShrink: 0, marginTop: 4 }} />
                  <div>
                    <div style={{ fontSize: 13, color: "#1a1a1a" }}>{item.text}</div>
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{item.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ flex: isDesktop ? "0 0 42%" : "1", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Property manager notes */}
            {ticket.notes && (
              <div style={{ background: "#E6F1FB", border: "1px solid #B5D4F4", borderRadius: 14, padding: "16px 20px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#185FA5", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>📋 Note from property manager</div>
                <p style={{ fontSize: 13, color: "#1a1a1a", lineHeight: 1.6, margin: 0 }}>{ticket.notes}</p>
              </div>
            )}

            {/* Comments */}
            <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #f0f0f0" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>Comments</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Messages between you and your property manager</div>
              </div>

              {/* Comment list */}
              <div style={{ padding: "12px 16px", maxHeight: isDesktop ? 360 : 200, overflowY: "auto" }}>
                {comments.length === 0 && (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "#aaa", fontSize: 13 }}>No comments yet. Add one below.</div>
                )}
                {comments.map(c => {
                  const isMe = c.author_name !== "Property Manager";
                  const displayName = isMe ? (tenant?.name || "You") : "Property Manager";
                  const initials = displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                  const date = new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  return (
                    <div key={c.id} style={{ marginBottom: 16, display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                      {/* Name + avatar row */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexDirection: isMe ? "row-reverse" : "row" }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: isMe ? "#0C447C" : "#e8eaed", color: isMe ? "#fff" : "#555", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                          {initials}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#555" }}>{displayName}</span>
                        <span style={{ fontSize: 10, color: "#aaa" }}>{date}</span>
                      </div>
                      {/* Bubble */}
                      <div style={{ maxWidth: "80%", background: isMe ? "#0C447C" : "#f0f0f0", borderRadius: isMe ? "16px 4px 16px 16px" : "4px 16px 16px 16px", padding: "10px 14px" }}>
                        <p style={{ fontSize: 13, color: isMe ? "#fff" : "#1a1a1a", lineHeight: 1.5, margin: 0 }}>{c.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Input */}
              <div style={{ padding: "12px 16px", borderTop: "1px solid #f0f0f0" }}>
                <textarea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postComment(); } }}
                  placeholder="Add a comment or question…"
                  rows={3}
                  style={{
                    width: "100%", padding: "10px 12px", fontSize: 13,
                    border: "1px solid #d1d5db", borderRadius: 8,
                    resize: "none", fontFamily: "'Inter',sans-serif",
                    outline: "none", boxSizing: "border-box",
                    color: "#1a1a1a", background: "#fff", lineHeight: 1.5,
                  }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                  <button
                    onClick={postComment}
                    disabled={posting || !newComment.trim()}
                    style={{
                      padding: "8px 18px",
                      background: newComment.trim() ? "#0C447C" : "#e8eaed",
                      color: newComment.trim() ? "#fff" : "#aaa",
                      border: "none", borderRadius: 8, fontSize: 13,
                      fontWeight: 600, cursor: newComment.trim() ? "pointer" : "default",
                      fontFamily: "'Inter',sans-serif",
                    }}>
                    {posting ? "Posting…" : "Post comment"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom action */}
        <div style={{ marginTop: 20 }}>
          <button onClick={() => navigate("/maintenance/new")}
            style={{ width: "100%", padding: 13, background: "#f4f5f7", border: "1px solid #e8eaed", borderRadius: 8, fontSize: 14, fontWeight: 600, color: "#555", cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
            + Submit another request
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <button onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: (l.index - 1 + l.urls.length) % l.urls.length })); }}
            style={{ position: "absolute", left: 24, background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 24, borderRadius: "50%", width: 44, height: 44, cursor: "pointer" }}>‹</button>
          <img src={lightbox.urls[lightbox.index]} alt="" style={{ maxHeight: "85vh", maxWidth: "85vw", borderRadius: 10 }} onClick={e => e.stopPropagation()} />
          <button onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: (l.index + 1) % l.urls.length })); }}
            style={{ position: "absolute", right: 24, background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 24, borderRadius: "50%", width: 44, height: 44, cursor: "pointer" }}>›</button>
          <button onClick={() => setLightbox(null)}
            style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 16, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>✕</button>
          <div style={{ position: "absolute", bottom: 20, color: "#fff", fontSize: 13 }}>{lightbox.index + 1} / {lightbox.urls.length}</div>
        </div>
      )}
    </TenantLayout>
  );
}