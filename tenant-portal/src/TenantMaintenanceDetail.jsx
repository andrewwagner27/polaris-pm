import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "./supabase";
import TenantLayout from "./TenantLayout";
import { useTenant } from "./useTenant";
import { notifyLandlordTenantComment } from "./notifications";

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

const STATUS = {
  open:        { label: "Open",        color: "#F0A430", bg: "rgba(240,164,48,0.13)" },
  in_progress: { label: "In Progress", color: "#4A9AE8", bg: "rgba(74,154,232,0.13)" },
  resolved:    { label: "Resolved",    color: "#72B02A", bg: "rgba(114,176,42,0.13)" },
};

const PRIORITY = {
  low:    { label: "Low",    color: "#72B02A", bg: "rgba(114,176,42,0.13)" },
  normal: { label: "Normal", color: "#4A9AE8", bg: "rgba(74,154,232,0.13)" },
  high:   { label: "High",   color: "#F0A430", bg: "rgba(240,164,48,0.13)" },
  urgent: { label: "Urgent", color: "#E05555", bg: "rgba(224,85,85,0.13)" },
};

const CATEGORY_ICONS = {
  plumbing: "🚿", electrical: "⚡", hvac: "🌡️",
  appliance: "🍳", pest: "🐛", other: "🔧",
};

function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

function Badge({ config }) {
  if (!config) return null;
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: config.bg, color: config.color, whiteSpace: "nowrap" }}>{config.label}</span>;
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
    const { data } = await supabase.from("maintenance_requests").select("*").eq("id", id).single();
    setTicket(data || null);
    setLoading(false);
  }

  async function fetchComments() {
    const { data } = await supabase.from("maintenance_comments").select("*").eq("request_id", id).eq("visible_to_tenant", true).order("created_at", { ascending: true });
    setComments(data || []);
  }

  async function postComment() {
    if (!newComment.trim() || !user) return;
    setPosting(true);
    await supabase.from("maintenance_comments").insert({
      request_id: id, author_id: user.id,
      author_name: tenant?.name || user.email,
      body: newComment.trim(), visible_to_tenant: true,
    });
    notifyLandlordTenantComment({
      tenantName: tenant?.name || user.email,
      title: ticket?.title || "Maintenance request",
      commentBody: newComment.trim(), ticketId: id,
    });
    setNewComment("");
    await fetchComments();
    setPosting(false);
  }

  if (loading) return (
    <TenantLayout tenantName={tenant?.name}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", background: C.bg, color: C.textSub, fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>Loading…</div>
    </TenantLayout>
  );

  if (!ticket) return (
    <TenantLayout tenantName={tenant?.name}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", background: C.bg, color: C.textSub, fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>Ticket not found.</div>
    </TenantLayout>
  );

  const sc            = STATUS[ticket.status]   || STATUS.open;
  const pc            = PRIORITY[ticket.priority] || PRIORITY.normal;
  const icon          = CATEGORY_ICONS[ticket.category] || "🔧";
  const submittedDate = new Date(ticket.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const updatedDate   = ticket.updated_at ? new Date(ticket.updated_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null;

  return (
    <TenantLayout tenantName={tenant?.name}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif", padding: isDesktop ? "28px 32px" : "20px" }}>

        {/* Back */}
        <button onClick={() => navigate("/maintenance")} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.goldDim, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", padding: 0, marginBottom: 20, transition: "color 0.15s" }}
          onMouseOver={e => e.currentTarget.style.color = C.gold}
          onMouseOut={e => e.currentTarget.style.color = C.goldDim}
        >← Back to requests</button>

        <div style={{ display: "flex", gap: 16, flexDirection: isDesktop ? "row" : "column", alignItems: "flex-start" }}>

          {/* ── LEFT COLUMN ── */}
          <div style={{ flex: isDesktop ? "0 0 55%" : "1", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Header card */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ background: C.raised, borderBottom: `1px solid ${C.border}`, padding: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: sc.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{icon}</div>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 3 }}>{ticket.title}</div>
                    <div style={{ fontSize: 12, color: C.textSub }}>Submitted {submittedDate}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge config={sc} />
                  <Badge config={{ ...pc, label: `${pc.label} priority` }} />
                </div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                {ticket.description && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Description</div>
                    <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, margin: 0 }}>{ticket.description}</p>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    ["Category",     ticket.category || "—"],
                    ["Status",       sc.label],
                    ["Submitted",    submittedDate],
                    ["Last updated", updatedDate || submittedDate],
                    ["Vendor",       ticket.vendor_name || "Not assigned yet"],
                    ["Scheduled",    ticket.scheduled_date || "Not scheduled yet"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ background: C.raised, borderRadius: 7, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{k}</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Photos */}
            {ticket.photos?.length > 0 && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Photos ({ticket.photos.length})</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {ticket.photos.map((url, i) => (
                    <img key={i} src={url} alt={`photo-${i}`}
                      onClick={() => setLightbox({ urls: ticket.photos, index: i })}
                      style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 7, border: `1px solid ${C.border}`, cursor: "pointer" }} />
                  ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>Timeline</div>
              {[
                { color: C.amber, text: "Request submitted",                              time: submittedDate },
                ticket.vendor_name    && { color: C.blue,  text: `Assigned to ${ticket.vendor_name}`, time: updatedDate },
                ticket.scheduled_date && { color: C.blue,  text: `Scheduled for ${ticket.scheduled_date}`, time: updatedDate },
                ticket.status === "resolved" && { color: C.green, text: "Issue resolved ✓",   time: updatedDate },
              ].filter(Boolean).map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0, marginTop: 5 }} />
                  <div>
                    <div style={{ fontSize: 13, color: C.text }}>{item.text}</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{item.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div style={{ flex: isDesktop ? "0 0 42%" : "1", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>

            {/* PM notes */}
            {ticket.notes && (
              <div style={{ background: `rgba(74,154,232,0.08)`, border: `1px solid rgba(74,154,232,0.2)`, borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.blue, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Note from property manager</div>
                <p style={{ fontSize: 13, color: C.text, lineHeight: 1.6, margin: 0 }}>{ticket.notes}</p>
              </div>
            )}

            {/* Comments */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Comments</div>
                <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>Messages between you and your property manager</div>
              </div>

              <div style={{ padding: "12px 16px", maxHeight: isDesktop ? 360 : 200, overflowY: "auto" }}>
                {comments.length === 0 && (
                  <div style={{ textAlign: "center", padding: "20px 0", color: C.textMuted, fontSize: 13 }}>No comments yet. Add one below.</div>
                )}
                {comments.map(c => {
                  const isMe = c.author_name !== "Property Manager";
                  const displayName = isMe ? (tenant?.name || "You") : "Property Manager";
                  const initials = displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                  const date = new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  return (
                    <div key={c.id} style={{ marginBottom: 16, display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexDirection: isMe ? "row-reverse" : "row" }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: isMe ? C.goldDim : C.raised, border: `1px solid ${isMe ? C.goldDim : C.border}`, color: isMe ? C.gold : C.textSub, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.textSub }}>{displayName}</span>
                        <span style={{ fontSize: 10, color: C.textMuted }}>{date}</span>
                      </div>
                      <div style={{ maxWidth: "82%", background: isMe ? C.goldDim : C.raised, border: `1px solid ${isMe ? C.goldDim : C.border}`, borderRadius: isMe ? "14px 4px 14px 14px" : "4px 14px 14px 14px", padding: "10px 14px" }}>
                        <p style={{ fontSize: 13, color: C.text, lineHeight: 1.5, margin: 0 }}>{c.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
                <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postComment(); } }}
                  placeholder="Add a comment or question…" rows={3}
                  style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, resize: "none", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", color: C.text, background: C.raised, lineHeight: 1.5 }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                  <button onClick={postComment} disabled={posting || !newComment.trim()} style={{
                    padding: "8px 16px",
                    background: newComment.trim() ? C.goldDim : "transparent",
                    color: newComment.trim() ? C.text : C.textMuted,
                    border: `1px solid ${newComment.trim() ? C.goldDim : C.border}`,
                    borderRadius: 7, fontSize: 12, fontWeight: 500,
                    cursor: newComment.trim() ? "pointer" : "default",
                    fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
                  }}>{posting ? "Posting…" : "Post comment"}</button>
                </div>
              </div>
            </div>

            {/* Submit another */}
            <button onClick={() => navigate("/maintenance/new")} style={{
              width: "100%", padding: "12px", background: "transparent",
              border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13,
              fontWeight: 500, color: C.textSub, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
            }}
              onMouseOver={e => { e.currentTarget.style.borderColor = "#353A44"; e.currentTarget.style.color = C.text; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSub; }}
            >+ Submit another request</button>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <button onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: (l.index - 1 + l.urls.length) % l.urls.length })); }} style={{ position: "absolute", left: 24, background: C.raised, border: `1px solid ${C.border}`, color: C.text, fontSize: 22, borderRadius: "50%", width: 44, height: 44, cursor: "pointer" }}>‹</button>
          <img src={lightbox.urls[lightbox.index]} alt="" style={{ maxHeight: "85vh", maxWidth: "85vw", borderRadius: 10 }} onClick={e => e.stopPropagation()} />
          <button onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: (l.index + 1) % l.urls.length })); }} style={{ position: "absolute", right: 24, background: C.raised, border: `1px solid ${C.border}`, color: C.text, fontSize: 22, borderRadius: "50%", width: 44, height: 44, cursor: "pointer" }}>›</button>
          <button onClick={() => setLightbox(null)} style={{ position: "absolute", top: 20, right: 20, background: C.raised, border: `1px solid ${C.border}`, color: C.textSub, fontSize: 13, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>✕</button>
          <div style={{ position: "absolute", bottom: 20, color: C.textSub, fontSize: 13 }}>{lightbox.index + 1} / {lightbox.urls.length}</div>
        </div>
      )}
    </TenantLayout>
  );
}