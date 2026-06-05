import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import { notifyVendorComplete } from "./notifications";

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
  green:     "#72B02A",
  red:       "#E05555",
  amber:     "#F0A430",
  blue:      "#4A9AE8",
};

const STATUS_COLORS = {
  open:           { color: C.amber, bg: "rgba(240,164,48,0.13)" },
  in_progress:    { color: C.blue,  bg: "rgba(74,154,232,0.13)" },
  pending_review: { color: C.gold,  bg: "rgba(201,169,110,0.13)" },
  resolved:       { color: C.green, bg: "rgba(114,176,42,0.13)" },
};

function Spinner() {
  return <span style={{ width:16, height:16, border:"2px solid rgba(201,169,110,0.3)", borderTopColor:C.gold, borderRadius:"50%", display:"inline-block", animation:"spin 0.7s linear infinite" }}/>;
}

function ModusMark({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M6 33V10L20 27L34 10V33" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 10L20 27L34 10" stroke={C.goldDim} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function VendorTicket() {
  const { token }  = useParams();
  const navigate   = useNavigate();
  const fileRef    = useRef(null);
  const invoiceRef = useRef(null);

  const [ticket, setTicket]           = useState(null);
  const [comments, setComments]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [comment, setComment]         = useState("");
  const [sending, setSending]         = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [completing, setCompleting]   = useState(false);
  const [photos, setPhotos]           = useState([]);
  const [lightbox, setLightbox]       = useState(null);
  const [vendorName, setVendorName]   = useState("");
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [showCompleteForm, setShowCompleteForm] = useState(false);

  useEffect(() => {
    const savedToken = localStorage.getItem("vendor_token");
    if (savedToken !== token) { navigate(`/vendor/${token}`); return; }
    fetchTicket();
  }, [token]);

  async function fetchTicket() {
    setLoading(true);
    const { data: ticketData } = await supabase
      .from("maintenance_requests")
      .select("*")
      .eq("vendor_token", token)
      .single();

    if (!ticketData) { navigate(`/vendor/${token}`); return; }
    setTicket(ticketData);
    setVendorName(ticketData.vendor_name || "Vendor");

    const { data: commentsData } = await supabase
      .from("maintenance_comments")
      .select("*")
      .eq("request_id", ticketData.id)
      .order("created_at", { ascending: true });
    setComments(commentsData || []);

    const { data: files } = await supabase.storage
      .from("maintenance-photos")
      .list(ticketData.id);
    if (files) {
      const urls = await Promise.all(files.map(async f => {
        const { data } = supabase.storage.from("maintenance-photos").getPublicUrl(`${ticketData.id}/${f.name}`);
        return { name: f.name, url: data.publicUrl };
      }));
      setPhotos(urls);
    }
    setLoading(false);
  }

  async function sendComment() {
    if (!comment.trim() || !ticket) return;
    setSending(true);
    await supabase.from("maintenance_comments").insert({
      request_id:  ticket.id,
      body:        comment.trim(),
      author_type: "vendor",
      author_name: vendorName,
      visible_to_tenant: false,
    });
    setComment("");
    await fetchTicket();
    setSending(false);
  }

  async function uploadPhoto(e) {
    const file = e.target.files?.[0];
    if (!file || !ticket) return;
    setUploading(true);
    const ext  = file.name.split(".").pop();
    const path = `${ticket.id}/vendor-${Date.now()}.${ext}`;
    await supabase.storage.from("maintenance-photos").upload(path, file);
    await fetchTicket();
    setUploading(false);
  }

  async function markComplete() {
    if (!ticket) return;
    setCompleting(true);

    // Upload invoice if provided
    let invoiceUrl = null;
    if (invoiceFile) {
      setUploadingInvoice(true);
      const ext  = invoiceFile.name.split(".").pop();
      const path = `${ticket.id}/invoice-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("maintenance-photos")
        .upload(path, invoiceFile, { contentType: invoiceFile.type });
      if (!uploadError) {
        const { data } = supabase.storage.from("maintenance-photos").getPublicUrl(path);
        invoiceUrl = data.publicUrl;
      }
      setUploadingInvoice(false);
    }

    // Move to pending_review instead of resolved
    await supabase.from("maintenance_requests").update({
      status:        "pending_review",
      invoice_url:   invoiceUrl,
      invoice_notes: invoiceNotes || null,
    }).eq("id", ticket.id);

    await supabase.from("maintenance_comments").insert({
      request_id:        ticket.id,
      body:              `${vendorName} marked work as complete and submitted for review.${invoiceNotes ? ` Notes: ${invoiceNotes}` : ""}`,
      author_type:       "vendor",
      author_name:       vendorName,
      visible_to_tenant: false,
    });

    notifyVendorComplete({
      vendorName,
      ticketTitle: ticket.title,
      ticketId:    ticket.id,
      hasInvoice:  !!invoiceUrl,
      invoiceNotes,
    });

    await fetchTicket();
    setCompleting(false);
    setShowCompleteForm(false);
  }

  if (loading) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <Spinner/>
    </div>
  );

  if (!ticket) return null;

  const statusCfg  = STATUS_COLORS[ticket.status] || STATUS_COLORS.open;
  const isResolved = ticket.status === "resolved" || ticket.status === "pending_review";
  const isPending  = ticket.status === "pending_review";

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"14px 20px", display:"flex", alignItems:"center", gap:12 }}>
        <ModusMark size={26}/>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:15, fontWeight:600, color:C.text, letterSpacing:"0.08em" }}>MODUS</div>
          <div style={{ fontSize:10, color:C.textMuted, letterSpacing:"0.12em" }}>VENDOR PORTAL</div>
        </div>
        <div style={{ fontSize:12, color:C.textSub }}>Welcome, {vendorName}</div>
      </div>

      <div style={{ maxWidth:680, margin:"0 auto", padding:"24px 20px 80px" }}>

        {/* Ticket header */}
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"20px", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:600, color:C.text }}>{ticket.title}</div>
            <span style={{ fontSize:10, fontWeight:600, padding:"4px 10px", borderRadius:5, background:statusCfg.bg, color:statusCfg.color, whiteSpace:"nowrap", marginLeft:12 }}>
              {ticket.status === "pending_review" ? "Pending Review" : ticket.status?.replace("_"," ").replace(/\b\w/g, l => l.toUpperCase())}
            </span>
          </div>
          {ticket.description && <div style={{ fontSize:13, color:C.textSub, lineHeight:1.6, marginBottom:12 }}>{ticket.description}</div>}
          <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
            {ticket.category && <span style={{ fontSize:11, color:C.textSub }}>Category: <strong style={{ color:C.text }}>{ticket.category}</strong></span>}
            {ticket.priority && <span style={{ fontSize:11, color:C.textSub }}>Priority: <strong style={{ color:C.text }}>{ticket.priority}</strong></span>}
            <span style={{ fontSize:11, color:C.textSub }}>Submitted: <strong style={{ color:C.text }}>{new Date(ticket.created_at).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" })}</strong></span>
          </div>
          {(ticket.scheduled_date || ticket.scheduled_time) && (
            <div style={{ marginTop:12, padding:"10px 14px", background:`${C.gold}0A`, border:`1px solid ${C.goldDim}`, borderRadius:8, display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:14 }}>📅</span>
              <span style={{ fontSize:13, fontWeight:500, color:C.gold }}>
                Scheduled: {ticket.scheduled_date}{ticket.scheduled_time ? ` · ${ticket.scheduled_time}` : ""}
              </span>
            </div>
          )}
          {ticket.entry_instructions && (
            <div style={{ marginTop:8, padding:"10px 14px", background:`${C.blue}0A`, border:`1px solid ${C.blue}33`, borderRadius:8 }}>
              <div style={{ fontSize:10, fontWeight:600, color:C.blue, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>Entry instructions</div>
              <div style={{ fontSize:13, color:C.text, lineHeight:1.5 }}>{ticket.entry_instructions}</div>
            </div>
          )}
        </div>

        {/* Photos */}
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontSize:13, fontWeight:600, color:C.text }}>Photos</div>
            {!isResolved && (
              <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ fontSize:12, fontWeight:500, padding:"6px 12px", background:"transparent", border:`1px solid ${C.goldDim}`, borderRadius:6, color:C.gold, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", gap:6 }}>
                {uploading ? <><Spinner/> Uploading…</> : "+ Upload photo"}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={uploadPhoto} style={{ display:"none" }}/>
          </div>
          {photos.length === 0 ? (
            <div style={{ padding:"20px", textAlign:"center", color:C.textMuted, fontSize:13 }}>No photos yet. Please upload photos of your completed work.</div>
          ) : (
            <div style={{ padding:"12px 16px", display:"flex", gap:8, flexWrap:"wrap" }}>
              {photos.map((p, i) => (
                <img key={i} src={p.url} alt={p.name} onClick={() => setLightbox(p.url)}
                  style={{ width:80, height:80, objectFit:"cover", borderRadius:7, cursor:"pointer", border:`1px solid ${C.border}` }}/>
              ))}
            </div>
          )}
        </div>

        {/* Comments */}
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden", marginBottom:16 }}>
          <div style={{ padding:"14px 16px", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontSize:13, fontWeight:600, color:C.text }}>Comments</div>
            <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>Visible to property manager only</div>
          </div>
          <div style={{ padding:"12px 16px", display:"flex", flexDirection:"column", gap:10 }}>
            {comments.length === 0 && <div style={{ fontSize:13, color:C.textMuted, textAlign:"center", padding:"8px 0" }}>No comments yet.</div>}
            {comments.map((c, i) => {
              const isVendor = c.author_type === "vendor";
              return (
                <div key={i} style={{ display:"flex", justifyContent:isVendor ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth:"80%", background:isVendor ? C.goldDim : C.raised, border:`1px solid ${isVendor ? C.goldDim : C.border}`, borderRadius:isVendor ? "12px 4px 12px 12px" : "4px 12px 12px 12px", padding:"10px 13px" }}>
                    <div style={{ fontSize:10, color:isVendor ? C.gold : C.textSub, fontWeight:600, marginBottom:4 }}>{c.author_name || (isVendor ? "You" : "Property Manager")}</div>
                    <div style={{ fontSize:13, color:C.text, lineHeight:1.5 }}>{c.body}</div>
                    <div style={{ fontSize:10, color:C.textMuted, marginTop:4 }}>{new Date(c.created_at).toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" })}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {!isResolved && (
            <div style={{ padding:"12px 16px", borderTop:`1px solid ${C.border}`, display:"flex", gap:8 }}>
              <textarea value={comment} onChange={e => setComment(e.target.value)}
                onKeyDown={e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendComment();} }}
                placeholder="Add a comment or update…" rows={2}
                style={{ flex:1, padding:"10px 12px", fontSize:13, border:`1px solid ${C.border}`, borderRadius:8, background:C.raised, color:C.text, outline:"none", resize:"none", fontFamily:"'DM Sans',sans-serif", lineHeight:1.4 }}
              />
              <button onClick={sendComment} disabled={!comment.trim() || sending} style={{ padding:"0 16px", background:comment.trim() ? C.goldDim : C.raised, border:`1px solid ${comment.trim() ? C.goldDim : C.border}`, borderRadius:8, color:comment.trim() ? C.text : C.textMuted, cursor:comment.trim() ? "pointer" : "not-allowed", fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight:500, whiteSpace:"nowrap" }}>
                {sending ? <Spinner/> : "Send"}
              </button>
            </div>
          )}
        </div>

        {/* Mark complete */}
        {!isResolved && !showCompleteForm && (
          <button onClick={() => setShowCompleteForm(true)} style={{ width:"100%", padding:"13px", background:"rgba(114,176,42,0.08)", border:`1px solid rgba(114,176,42,0.25)`, borderRadius:8, fontSize:14, fontWeight:500, color:C.green, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            ✓ Mark work as complete
          </button>
        )}

        {/* Complete form */}
        {showCompleteForm && !isResolved && (
          <div style={{ background:C.surface, border:`1px solid ${C.green}33`, borderRadius:10, padding:"20px", marginBottom:16 }}>
            <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:4 }}>Submit completed work</div>
            <div style={{ fontSize:12, color:C.textSub, marginBottom:20 }}>Please upload your invoice and any final notes before submitting. The property manager will review and approve.</div>

            {/* Invoice upload */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:600, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Invoice</div>
              {invoiceFile ? (
                <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:C.raised, border:`1px solid ${C.green}44`, borderRadius:8 }}>
                  <span style={{ fontSize:13, color:C.green }}>📄</span>
                  <span style={{ fontSize:13, color:C.text, flex:1 }}>{invoiceFile.name}</span>
                  <button onClick={() => setInvoiceFile(null)} style={{ fontSize:11, color:C.red, background:"none", border:"none", cursor:"pointer" }}>Remove</button>
                </div>
              ) : (
                <button onClick={() => invoiceRef.current?.click()} style={{ width:"100%", padding:"14px", background:"transparent", border:`2px dashed ${C.border}`, borderRadius:8, fontSize:13, color:C.textSub, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                  📎 Upload invoice (PDF or photo)
                </button>
              )}
              <input ref={invoiceRef} type="file" accept="image/*,.pdf" onChange={e => setInvoiceFile(e.target.files?.[0] || null)} style={{ display:"none" }}/>
            </div>

            {/* Invoice notes */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:600, color:C.textSub, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Notes / invoice amount</div>
              <textarea value={invoiceNotes} onChange={e => setInvoiceNotes(e.target.value)}
                placeholder="e.g. Replaced faucet cartridge. Parts: $45, Labor: $120. Total: $165."
                rows={3}
                style={{ width:"100%", padding:"10px 12px", fontSize:13, border:`1px solid ${C.border}`, borderRadius:8, background:C.raised, color:C.text, outline:"none", resize:"none", fontFamily:"'DM Sans',sans-serif", lineHeight:1.5, boxSizing:"border-box" }}
              />
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setShowCompleteForm(false)} style={{ padding:"10px 18px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:8, fontSize:13, color:C.textSub, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                Cancel
              </button>
              <button onClick={markComplete} disabled={completing} style={{ flex:1, padding:"12px", background:"rgba(114,176,42,0.1)", border:`1px solid rgba(114,176,42,0.3)`, borderRadius:8, fontSize:14, fontWeight:500, color:C.green, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                {completing ? <><Spinner/> Submitting…</> : "✓ Submit for review"}
              </button>
            </div>
          </div>
        )}

        {/* Pending review state */}
        {isPending && (
          <div style={{ textAlign:"center", padding:"20px", background:`${C.gold}08`, border:`1px solid ${C.goldDim}`, borderRadius:8 }}>
            <div style={{ fontSize:14, fontWeight:600, color:C.gold, marginBottom:4 }}>⏳ Awaiting PM review</div>
            <div style={{ fontSize:12, color:C.textSub }}>Your work has been submitted. The property manager will review and approve shortly.</div>
          </div>
        )}

        {ticket.status === "resolved" && (
          <div style={{ textAlign:"center", padding:"16px", background:"rgba(114,176,42,0.08)", border:`1px solid rgba(114,176,42,0.2)`, borderRadius:8, fontSize:13, color:C.green }}>
            ✓ This ticket has been approved and resolved. Thank you!
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.9)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:20 }}>
          <img src={lightbox} style={{ maxWidth:"100%", maxHeight:"90vh", borderRadius:8, objectFit:"contain" }}/>
        </div>
      )}
    </div>
  );
}