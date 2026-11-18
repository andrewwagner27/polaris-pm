import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "./supabase";
import { TICKET_COLUMNS } from "./lib/maintenanceColumns";
import LandlordLayout from "./LandlordLayout";
import AssignVendorModal from "./AssignVendorModal";
import { notifyTicketStatusUpdate, notifyTenantNewComment, notifyVendorApproved, notifyVendorMoreWork } from "./notifications";
import { getSignedStorageUrl } from "./storageUtils";
import { PrimaryBtn } from "./ui/Button";
import { usePropertyScope, useScopedLoad, ALL } from "./lib/propertyScope";
import { ticketTimeline, nextAction, ageLabel, telHref } from "./lib/maintenanceView";

// All tickets for one scope (ALL or a property id), newest first. The property id is passed explicitly; RLS decides
// what the landlord may read. Contractor phone numbers come from the landlord-only vendor directory (the ticket's own
// contractor contact columns are server-only since migration 20261117000000).
async function loadTickets(propertyId) {
  const scoped = propertyId !== ALL;
  let q = supabase.from("maintenance_requests")
    .select(`${TICKET_COLUMNS}, units${scoped ? "!inner" : ""}(unit_number, property_id, properties(name, address, city, state)), tenants(name, phone)`)
    .order("created_at", { ascending: false });
  if (scoped) q = q.eq("units.property_id", propertyId);
  const [{ data, error }, { data: vendors }] = await Promise.all([q, supabase.from("vendors").select("name, phone, property_id, active")]);
  if (error) throw new Error(error.message);
  return { tickets: data || [], vendors: vendors || [] };
}

const C = {
  bg:       "#0B0D10",
  surface:  "#15191F",
  raised:   "#1C2129",
  border:   "#303640",
  text:     "#F5F2EB",
  textSub:  "#B7BBC4",
  textMuted:"#9298A3",
  gold:     "#C9A968",
  goldDim:  "#6B4F24",
  blue:     "#6AAEF0",
  green:    "#72B02A",
  red:      "#F07070",
  amber:    "#F0A430",
};

const PRIORITY = {
  low:    { label: "Low",    color: "#72B02A", bg: "rgba(114,176,42,0.13)" },
  normal: { label: "Normal", color: "#6AAEF0", bg: "rgba(74,154,232,0.13)" },
  high:   { label: "High",   color: "#F0A430", bg: "rgba(240,164,48,0.13)" },
  urgent: { label: "Urgent", color: "#F07070", bg: "rgba(224,85,85,0.15)" },
};

const STATUS = {
  open:           { label: "Open",           color: "#F0A430", bg: "rgba(240,164,48,0.13)" },
  quote_submitted: { label: "Quote In",       color: "#F0A430", bg: "rgba(240,164,48,0.13)" },
  in_progress:    { label: "In Progress",    color: "#6AAEF0", bg: "rgba(74,154,232,0.13)" },
  pending_review: { label: "Pending Review", color: "#C9A968", bg: "rgba(201,169,110,0.13)" },
  resolved:       { label: "Resolved",       color: "#72B02A", bg: "rgba(114,176,42,0.13)" },
};


// ─── LightboxView — navigable full-screen photo viewer with signed URLs ──────
function LightboxView({ lightbox, setLightbox }) {
  const { paths, index } = lightbox;
  const [src, setSrc] = useState(lightbox.src || null);
  const [curIndex, setCurIndex] = useState(index);

  useEffect(() => {
    const p = paths[curIndex];
    if (!p) return;
    if (p.startsWith("http") && !p.includes("supabase")) { setSrc(p); return; }
    setSrc(null);
    getSignedStorageUrl("maintenance-photos", p).then(s => setSrc(s));
  }, [curIndex, paths]);

  const prev = e => { e.stopPropagation(); setCurIndex(i => (i - 1 + paths.length) % paths.length); };
  const next = e => { e.stopPropagation(); setCurIndex(i => (i + 1) % paths.length); };

  return (
    <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <button onClick={prev} style={{ position: "absolute", left: 24, background: C.raised, border: `1px solid ${C.border}`, color: C.text, fontSize: 22, borderRadius: "50%", width: 44, height: 44, cursor: "pointer" }}>‹</button>
      {src
        ? <img src={src} alt="" style={{ maxHeight: "85vh", maxWidth: "85vw", borderRadius: 10 }} onClick={e => e.stopPropagation()} />
        : <div style={{ width: 120, height: 120, background: C.raised, borderRadius: 10, display:"flex", alignItems:"center", justifyContent:"center", color: C.textMuted, fontSize: 12 }}>Loading…</div>
      }
      <button onClick={next} style={{ position: "absolute", right: 24, background: C.raised, border: `1px solid ${C.border}`, color: C.text, fontSize: 22, borderRadius: "50%", width: 44, height: 44, cursor: "pointer" }}>›</button>
      <button onClick={() => setLightbox(null)} style={{ position: "absolute", top: 20, right: 20, background: C.raised, border: `1px solid ${C.border}`, color: C.textSub, fontSize: 13, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>✕</button>
      <div style={{ position: "absolute", bottom: 20, color: C.textSub, fontSize: 13 }}>{curIndex + 1} / {paths.length}</div>
    </div>
  );
}

// ─── SignedMaintenancePhoto — renders a photo stored as a path or legacy URL ─
function SignedMaintenancePhoto({ urlOrPath, onClick, style }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!urlOrPath) return;
    if (urlOrPath.startsWith("http") && !urlOrPath.includes("supabase")) { setSrc(urlOrPath); return; }
    getSignedStorageUrl("maintenance-photos", urlOrPath).then(s => setSrc(s));
  }, [urlOrPath]);
  if (!src) return <div style={{ ...style, background:"rgba(255,255,255,0.04)", display:"flex", alignItems:"center", justifyContent:"center" }}>
    <span style={{ fontSize:10, color:"#9298A3" }}>…</span></div>;
  return <img src={src} alt="" style={style} onClick={() => onClick?.(src)} />;
}

// ─── SignedInvoiceLink — opens an invoice stored as a path or legacy URL ─────
// Signs on click (not on render) so the link never serves an expired signed URL.
function SignedInvoiceLink({ urlOrPath, style, children }) {
  const [state, setState] = useState("idle"); // idle | loading | error

  async function open(e) {
    e.preventDefault();
    if (state === "loading") return;
    // Open the tab synchronously so popup blockers allow it, then point it at the signed URL
    const win = window.open("", "_blank");
    if (win) win.opener = null;
    setState("loading");
    let url;
    if (urlOrPath.startsWith("http") && !urlOrPath.includes("supabase")) {
      url = urlOrPath;
    } else {
      try { url = await getSignedStorageUrl("maintenance-photos", urlOrPath); } catch { url = null; }
    }
    // Legacy public URLs keep working while the bucket is still public
    if (!url && urlOrPath.startsWith("http")) url = urlOrPath;
    if (!url) { win?.close(); setState("error"); return; }
    if (win) win.location.href = url; else window.location.href = url;
    setState("idle");
  }

  return (
    <>
      <a href="#" onClick={open} style={style}>{state === "loading" ? "Opening invoice…" : children}</a>
      {state === "error" && <div style={{ fontSize: 11, color: C.red, marginTop: 4, marginBottom: 8 }}>Could not open the invoice. Please try again.</div>}
    </>
  );
}

function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

function Badge({ type, value }) {
  const cfg = type === "priority" ? PRIORITY[value] : STATUS[value];
  if (!cfg) return null;
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: cfg.bg, color: cfg.color, whiteSpace: "nowrap" }}>{cfg.label}</span>;
}


function GhostBtn({ children, onClick, small }) {
  return (
    <button type="button" onClick={onClick} className={`m-btn m-btn-ghost${small ? " m-btn-small" : ""}`}
      style={{ borderColor: C.border, color: C.textSub, fontWeight: 500, fontFamily: "'DM Sans', sans-serif" }}>{children}</button>
  );
}

// Reported → Assigned → Quoted → Approved → Resolved, from the ticket's recorded fields only (lib/maintenanceView).
// Skipped stages are drawn hollow and labelled "skipped"; nothing is shown as done that the ticket doesn't record.
function StageTimeline({ ticket, compact }) {
  const stages = ticketTimeline(ticket);
  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  return (
    <ol aria-label="Ticket progress" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: `repeat(${stages.length}, minmax(0,1fr))`, gap: 4 }}>
      {stages.map((s, i) => {
        const color = s.state === "done" ? C.green : s.state === "current" ? C.gold : C.textMuted;
        return (
          <li key={s.key} aria-label={`${s.label}: ${s.state === "done" ? `done${s.at ? ` ${fmt(s.at)}` : ""}` : s.state}`} style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, background: s.state === "done" ? color : "transparent", border: `2px ${s.state === "skipped" ? "dashed" : "solid"} ${color}` }}/>
              {i < stages.length - 1 && <span aria-hidden="true" style={{ flex: 1, height: 2, background: s.state === "done" ? C.green : C.border, borderRadius: 1 }}/>}
            </div>
            <div style={{ fontSize: 11, fontWeight: s.state === "current" ? 700 : 500, color: s.state === "upcoming" || s.state === "skipped" ? C.textMuted : C.text, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</div>
            {!compact && <div style={{ fontSize: 11, color: C.textMuted, whiteSpace: "nowrap" }}>{s.state === "skipped" ? "skipped" : s.state === "done" ? (fmt(s.at) || "done") : s.state === "current" ? "next" : ""}</div>}
          </li>
        );
      })}
    </ol>
  );
}

// One ticket in the list: collapsed = title, place, priority, status, age; expanded = progress, next action, call chips,
// the stage's primary action and Open details. The same card serves phone, tablet and desktop.
function TicketCard({ ticket, expanded, showProperty, vendorPhone, onToggle, onOpen, onAssign, onResolve, onApprove, onMoreWork }) {
  const priority = field(ticket, "priority"), status = field(ticket, "status");
  const next = nextAction(ticket);
  const tenantTel = telHref(ticket.tenants?.phone);
  const vendorTel = telHref(vendorPhone);
  const panelId = `ticket-panel-${ticket.id}`;
  const place = [showProperty ? field(ticket, "property") : null, `Unit ${field(ticket, "unit")}`, field(ticket, "tenant")].filter(Boolean).join(" · ");
  return (
    <div className="m-ticket">
      <button type="button" className="m-ticket-head" aria-expanded={expanded} aria-controls={panelId} onClick={onToggle}>
        <span aria-hidden="true" style={{ alignSelf: "stretch", background: PRIORITY[priority]?.color || C.border, borderRadius: "0 3px 3px 0" }}/>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: C.text, overflowWrap: "anywhere" }}>{field(ticket, "title")}</span>
          <span style={{ display: "block", fontSize: 12, color: C.textSub, marginTop: 3, overflowWrap: "anywhere" }}>{place}</span>
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
            <Badge type="priority" value={priority} />
            <Badge type="status" value={status} />
            {ticket.is_emergency && <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: "rgba(240,112,112,0.15)", color: C.red }}>Emergency</span>}
            <span style={{ fontSize: 12, color: C.textMuted }}>· {ageLabel(ticket.created_at)} ago</span>
          </span>
        </span>
        <span aria-hidden="true" style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: C.textSub, transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }}>⌄</span>
      </button>
      {expanded && (
        <div id={panelId} style={{ padding: "4px 16px 16px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ padding: "14px 0 12px" }}><StageTimeline ticket={ticket} compact /></div>
          {next && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, background: C.raised, border: `1px solid ${next.tone === "urgent" ? "rgba(240,112,112,0.45)" : C.border}`, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: next.owner === "you" ? C.gold : C.textSub, whiteSpace: "nowrap", paddingTop: 2 }}>{next.owner === "you" ? "Next · you" : `Waiting · ${next.owner}`}</span>
              <span style={{ fontSize: 13, color: C.text, lineHeight: 1.45 }}>{next.label}</span>
            </div>
          )}
          {(tenantTel || vendorTel) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {tenantTel && <a className="m-chip" href={tenantTel} aria-label={`Call tenant ${field(ticket, "tenant")}`}>📞 Tenant</a>}
              {vendorTel && <a className="m-chip" href={vendorTel} aria-label={`Call contractor ${ticket.vendor_name}`}>📞 {ticket.vendor_name}</a>}
            </div>
          )}
          <div className="m-ticket-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {status === "open" && !ticket.vendor_name && <PrimaryBtn onClick={onAssign}>Assign contractor</PrimaryBtn>}
            {status === "quote_submitted" && <PrimaryBtn onClick={onOpen}>Review quote</PrimaryBtn>}
            {status === "in_progress" && <PrimaryBtn color={C.green} onClick={onResolve}>Mark resolved</PrimaryBtn>}
            {status === "pending_review" && (<><PrimaryBtn color={C.green} onClick={onApprove}>Approve & close</PrimaryBtn><GhostBtn onClick={onMoreWork}>More work</GhostBtn></>)}
            <GhostBtn onClick={onOpen}>Open details</GhostBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function field(ticket, key) {
  const map = {
    submittedAt: ticket.created_at ? new Date(ticket.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—",
    updatedAt:   ticket.updated_at ? new Date(ticket.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—",
    property:    ticket.units?.properties?.name || "—",
    unit:        ticket.units?.unit_number || "—",
    tenant:      ticket.tenants?.name || "Unknown",
    category:    ticket.category || "other",
    title:       ticket.title || "Untitled",
    description: ticket.description || "",
    priority:    ticket.priority || "normal",
    status:      ticket.status || "open",
    vendor:      ticket.vendor_name || null,
    scheduled:   ticket.scheduled_date || null,
    cost:        ticket.cost || null,
    notes:       ticket.notes || "",
  };
  return map[key];
}

export default function LandlordMaintenance() {
  const width    = useWindowWidth();
  const isMobile = width < 768;
  const navigate = useNavigate();
  const { id: routeTicketId } = useParams();
  const { selectedPropertyId, selectedName, isAll } = usePropertyScope();
  const scopedLoad = useScopedLoad("maintenance", loadTickets);

  const [activeTab, setActiveTab]       = useState("Requests");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch]             = useState("");
  const [selected, setSelected]         = useState(null);
  const [expandedId, setExpandedId]     = useState(null);
  // Local optimistic edits sit on top of the loaded list and are dropped when a fresh load (or another scope) arrives.
  const [override, setOverride]         = useState(null);   // { base, list }
  const tickets = override && override.base === scopedLoad.data ? override.list : (scopedLoad.data?.tickets || []);
  const setTickets = (fn) => setOverride((o) => {
    const current = o && o.base === scopedLoad.data ? o.list : (scopedLoad.data?.tickets || []);
    return { base: scopedLoad.data, list: typeof fn === "function" ? fn(current) : fn };
  });
  const loading    = scopedLoad.loading && !scopedLoad.data;
  const fetchError = scopedLoad.error;
  const fetchTickets = scopedLoad.reload;
  const vendorsByName = new Map((scopedLoad.data?.vendors || []).map((v) => [String(v.name || "").trim().toLowerCase(), v]));
  const [notes, setNotes]               = useState("");
  const [saving, setSaving]             = useState(false);
  const [lightbox, setLightbox]         = useState(null);
  const [comments, setComments]         = useState([]);
  const [newComment, setNewComment]     = useState("");
  const [visibility, setVisibility]     = useState("hidden");
  const [posting, setPosting]           = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [vendorTicket, setVendorTicket]   = useState(null);
  const [rejectTicket, setRejectTicket]   = useState(null);
  const [rejectNotes, setRejectNotes]     = useState("");
  const [rejecting, setRejecting]         = useState(false);
  // Escape closes the top-most layer only: the confirm/rejection dialogs sit above the drawer.
  const showConfirmRef = useRef(false), rejectOpenRef = useRef(false);
  useEffect(() => { showConfirmRef.current = showConfirm; rejectOpenRef.current = !!rejectTicket; }, [showConfirm, rejectTicket]);

  // Missed-alert safety net: LandlordLayout runs the safety sweep on every management page.
  // The scoped loader fetches on mount and on every scope change; local edits update `tickets` optimistically.

  // Scope change: close the drawer and collapse cards (a ticket from the old scope must not stay open); keep the status
  // filter and search, which mean the same thing in every scope.
  const firstScope = useRef(true);
  useEffect(() => {
    if (firstScope.current) { firstScope.current = false; return; }
    setSelected(null); setExpandedId(null);
    if (routeTicketId) navigate("/landlord/maintenance", { replace: true });
  }, [selectedPropertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep link /landlord/maintenance/:id (from the dashboard) opens that ticket's drawer once it is loaded.
  useEffect(() => {
    if (!routeTicketId || !tickets.length) return;
    const t = tickets.find((x) => x.id === routeTicketId);
    if (t && selected?.id !== t.id) openDetail(t, { fromRoute: true });
  }, [routeTicketId, tickets]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (selected) fetchComments(selected.id); }, [selected?.id]);

  // Drawer: Escape closes; focus moves into it and back to the card that opened it; list position is untouched
  // because the list stays mounted underneath.
  const drawerRef = useRef(null), openerRef = useRef(null);
  function openDetail(ticket, { fromRoute } = {}) {
    if (!fromRoute) openerRef.current = document.activeElement;
    setSelected(ticket); setNotes(field(ticket, "notes")); setNewComment(""); setVisibility("hidden");
  }
  function closeDetail() {
    setSelected(null);
    if (routeTicketId) navigate("/landlord/maintenance", { replace: true });
    const el = openerRef.current; openerRef.current = null;
    if (el?.isConnected) setTimeout(() => el.focus(), 0);
  }
  useEffect(() => {
    if (!selected) return;
    drawerRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape" && !showConfirmRef.current && !rejectOpenRef.current) closeDetail(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vendor link + PIN are not readable from the ticket row (tenants share the database role): landlord-only RPC.
  const [vendorAccess, setVendorAccess] = useState(null);
  useEffect(() => {
    let live = true;
    if (!selected?.id || !(selected.vendor_token_expires_at || selected.vendor_name)) return;
    supabase.rpc("landlord_vendor_access", { p_request: selected.id }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      if (live && row?.vendor_token) setVendorAccess({ ticketId: selected.id, ...row });
    });
    return () => { live = false; };
  }, [selected?.id, selected?.vendor_token_expires_at, selected?.vendor_name]);

  async function fetchComments(requestId) {
    const { data } = await supabase.from("maintenance_comments").select("*").eq("request_id", requestId).order("created_at", { ascending: true });
    setComments(data || []);
  }

  async function approveQuote(ticket) {
    await supabase.from("maintenance_requests").update({
      status: "in_progress",
      quote_approved_at: new Date().toISOString(),
      quote_approved_by: "Property Manager",
      nte_amount: ticket.quote_amount,
    }).eq("id", ticket.id);
    setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, status: "in_progress", quote_approved_at: new Date().toISOString(), nte_amount: ticket.quote_amount } : t));
    if (selected?.id === ticket.id) setSelected(prev => ({ ...prev, status: "in_progress", quote_approved_at: new Date().toISOString() }));
    // The server emails the vendor on record (or skips if there is none).
    notifyVendorApproved({ ticketId: ticket.id, stage: "quote" });
  }

  async function approveTicket(ticket) {
    await updateStatus(ticket.id, "resolved");
    if (selected?.id === ticket.id) setSelected(prev => ({ ...prev, status: "resolved" }));

    // Re-fetch ticket fresh to get latest vendor_email and invoice data
    const { data: freshTicket } = await supabase
      .from("maintenance_requests")
      .select(`${TICKET_COLUMNS}, units(property_id, properties(name))`)
      .eq("id", ticket.id)
      .single();

    // Auto-log expense
    const invoiceAmount = freshTicket?.invoice_notes ? parseFloat(freshTicket.invoice_notes) : (freshTicket?.invoice_amount || freshTicket?.quote_amount || null);
    if (invoiceAmount && freshTicket?.units?.property_id) {
      await supabase.from("expenses").insert({
        property_id:            freshTicket.units.property_id,
        unit_id:                freshTicket.unit_id,
        maintenance_request_id: freshTicket.id,
        category:               "maintenance",
        description:            freshTicket.title,
        amount:                 invoiceAmount,
        vendor_name:            freshTicket.vendor_name,
        date:                   new Date().toISOString().split("T")[0],
      });
    }

    // The server emails the vendor on record (ticket vendor_email, else the vendors table), or skips.
    if (freshTicket?.vendor_name || freshTicket?.vendor_token_expires_at) notifyVendorApproved({ ticketId: ticket.id, stage: "work" });
  }

  async function submitRejection() {
    if (!rejectTicket) return;
    setRejecting(true);
    await supabase.from("maintenance_requests").update({ status: "in_progress" }).eq("id", rejectTicket.id);
    const { data: rework } = await supabase.from("maintenance_comments").insert({
      request_id:        rejectTicket.id,
      body:              `PM requested more work: ${rejectNotes}`,
      author_name:       "Property Manager",
      author_type:       "pm_to_vendor", // hidden from the tenant, shown to the vendor (api/vendor-ticket.js)
      visible_to_tenant: false,
    }).select("id").single();
    setTickets(prev => prev.map(t => t.id === rejectTicket.id ? { ...t, status: "in_progress" } : t));
    // The server emails the vendor the saved request with the vendor link it builds itself.
    if (rework?.id) notifyVendorMoreWork({ ticketId: rejectTicket.id, commentId: rework.id });
    setRejecting(false);
    setRejectTicket(null);
    setRejectNotes("");
    if (selected?.id === rejectTicket.id) setSelected(prev => ({ ...prev, status: "in_progress" }));
  }

  async function updateStatus(id, newStatus) {
    const { error } = await supabase.from("maintenance_requests").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", id);
    if (!error) {
      setTickets(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
      if (selected?.id === id) setSelected(prev => ({ ...prev, status: newStatus }));
      const ticket = tickets.find(t => t.id === id);
      if (ticket?.tenant_id) notifyTicketStatusUpdate({ ticketId: id });
    }
  }

  function handlePostComment() {
    if (!newComment.trim()) return;
    if (visibility === "visible") setShowConfirm(true);
    else postComment();
  }

  async function postComment() {
    setShowConfirm(false); setPosting(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: saved } = await supabase.from("maintenance_comments").insert({
      request_id: selected.id, author_id: user.id,
      author_name: "Property Manager", body: newComment.trim(),
      visible_to_tenant: visibility === "visible",
    }).select("id").single();
    if (visibility === "visible" && saved?.id && selected.tenant_id) notifyTenantNewComment({ ticketId: selected.id, commentId: saved.id });
    setNewComment("");
    await fetchComments(selected.id);
    setPosting(false);
  }

  const now             = new Date();
  const openCount       = tickets.filter(t => t.status === "open").length;
  const pendingReviewCount = tickets.filter(t => t.status === "pending_review").length;
  const quoteCount      = tickets.filter(t => t.status === "quote_submitted").length;
  const inProgressCount = tickets.filter(t => t.status === "in_progress").length;
  // Resolved this calendar month (by resolved_at; tickets without a resolved date are not counted).
  const resolvedMonth   = tickets.filter(t => t.status === "resolved" && t.resolved_at && new Date(t.resolved_at).getMonth() === now.getMonth() && new Date(t.resolved_at).getFullYear() === now.getFullYear()).length;
  const costRows        = tickets.filter(t => Number(t.cost) > 0);
  const totalCost       = costRows.reduce((sum, t) => sum + Number(t.cost || 0), 0);
  const yearCost        = costRows.filter(t => new Date(t.updated_at || t.created_at).getFullYear() === now.getFullYear()).reduce((sum, t) => sum + Number(t.cost || 0), 0);
  const activeCount     = openCount + inProgressCount + quoteCount + pendingReviewCount;

  const q = search.trim().toLowerCase();
  const filtered = tickets.filter(t => {
    const matchStatus = statusFilter === "all" || (statusFilter === "active" ? t.status !== "resolved" : t.status === statusFilter);
    const matchSearch = !q || [field(t, "title"), field(t, "tenant"), field(t, "unit"), field(t, "property"), t.vendor_name || ""].some(v => String(v).toLowerCase().includes(q));
    return matchStatus && matchSearch;
  });

  const stats = [
    { label: "Needs you",       value: loading ? "—" : openCount + quoteCount + pendingReviewCount, sub: "to assign, approve or review", accent: C.amber, filter: "active" },
    { label: "In progress",     value: loading ? "—" : inProgressCount, sub: "contractor working", accent: C.blue, filter: "in_progress" },
    { label: "Resolved",        value: loading ? "—" : resolvedMonth,   sub: `in ${now.toLocaleDateString("en-US", { month: "long" })}`, accent: C.green, filter: "resolved" },
    { label: "Recorded cost",   value: loading ? "—" : `$${yearCost.toLocaleString("en-US")}`, sub: `on tickets updated in ${now.getFullYear()}`, accent: C.gold, tab: "Cost Tracker" },
  ];

  function exportCostsCsv() {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Property", "Unit", "Issue", "Contractor", "Cost (USD)", "Status", "Updated"]]
      .concat(costRows.map(t => [field(t, "property"), field(t, "unit"), field(t, "title"), t.vendor_name || "", Number(t.cost).toFixed(2), t.status, (t.updated_at || t.created_at || "").slice(0, 10)]));
    const blob = new Blob([rows.map(r => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `maintenance-costs-${isAll ? "all-properties" : selectedName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${now.toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <LandlordLayout openMaintenance={activeCount} unreadMessages={0}>
      <style>{`
        .m-ticket{background:${C.surface};border:1px solid ${C.border};border-radius:12px;margin-bottom:10px;overflow:hidden;}
        .m-ticket:hover{border-color:#3C4350;}
        .m-ticket-head{display:grid;grid-template-columns:4px minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;padding:12px 14px 12px 0;background:transparent;border:none;text-align:left;font:inherit;color:inherit;cursor:pointer;min-height:64px;}
        .m-chip{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid ${C.border};background:${C.raised};color:${C.text};font-size:13px;font-weight:500;text-decoration:none;}
        .m-chip:hover{border-color:${C.gold};}
        .m-filters{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;}
        .m-filters::-webkit-scrollbar{display:none;}
        .m-filter{flex-shrink:0;min-height:36px;padding:0 12px;border-radius:999px;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;white-space:nowrap;}
        .m-row:hover td{background:${C.raised}!important;}
        .m-stat{background:${C.surface};border:1px solid ${C.border};border-radius:12px;padding:14px 16px;text-align:left;font:inherit;color:inherit;cursor:pointer;width:100%;}
        .m-stat:hover{border-color:#3C4350;}
        @media (max-width:720px){ .m-filter{min-height:44px;} .m-chip{min-height:44px;} .m-ticket-actions .m-btn{flex:1;} }
      `}</style>

      <div className="m-page" style={{ color: C.text, fontFamily: "'DM Sans', sans-serif" }}>

        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(22px, 4vw, 28px)", fontWeight: 600, margin: 0 }}>Maintenance</h1>
          <div style={{ fontSize: 13, color: C.textSub, marginTop: 3 }}>
            {loading ? "Loading…" : `${activeCount} active ticket${activeCount === 1 ? "" : "s"} · ${selectedName}`}
          </div>
        </div>

        {fetchError && (
          <div role="alert" style={{ background: "rgba(240,112,112,0.1)", border: "1px solid rgba(240,112,112,0.35)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: C.red, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            Tickets couldn't load: {fetchError}
            <button type="button" onClick={fetchTickets} className="m-btn m-btn-ghost m-btn-small" style={{ color: C.red, borderColor: "rgba(240,112,112,0.4)" }}>Retry</button>
          </div>
        )}

        {/* Stats: each one filters the list */}
        <div className="m-grid" style={{ marginBottom: 20, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))" }}>
          {stats.map((s) => (
            <button key={s.label} type="button" className="m-stat" onClick={() => { if (s.tab) setActiveTab(s.tab); else { setActiveTab("Requests"); setStatusFilter(s.filter); } }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: s.accent }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</span>
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: C.text, lineHeight: 1.1 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{s.sub}</div>
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div role="tablist" aria-label="Maintenance views" style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
          {["Requests", "Cost Tracker"].map(tab => (
            <button key={tab} role="tab" aria-selected={activeTab === tab} type="button" onClick={() => setActiveTab(tab)} style={{
              minHeight: 44, padding: "0 18px", fontSize: 14, fontWeight: activeTab === tab ? 600 : 500,
              color: activeTab === tab ? C.gold : C.textSub, background: "none", border: "none",
              borderBottom: activeTab === tab ? `2px solid ${C.gold}` : "2px solid transparent",
              marginBottom: -1, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}>{tab}</button>
          ))}
        </div>

        {/* ── Requests tab ── */}
        {activeTab === "Requests" && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "0 12px", minHeight: 44, maxWidth: 420 }}>
                <span aria-hidden="true" style={{ color: C.textMuted, fontSize: 15 }}>⌕</span>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search issue, tenant, unit or contractor" aria-label="Search tickets"
                  style={{ flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 14, fontFamily: "'DM Sans', sans-serif", background: "transparent", color: C.text }} />
              </label>
              <div className="m-filters" role="group" aria-label="Filter by status">
                {[["all", `All (${tickets.length})`], ["active", `Active (${activeCount})`], ["open", `Open (${openCount})`], ["quote_submitted", `Quote in (${quoteCount})`], ["in_progress", `In progress (${inProgressCount})`], ["pending_review", `Review (${pendingReviewCount})`], ["resolved", `Resolved (${tickets.length - activeCount})`]].map(([f, label]) => (
                  <button key={f} type="button" className="m-filter" aria-pressed={statusFilter === f} onClick={() => setStatusFilter(f)} style={{
                    background: statusFilter === f ? "rgba(201,169,104,0.14)" : "transparent",
                    color: statusFilter === f ? C.text : C.textSub,
                    border: `1px solid ${statusFilter === f ? C.gold : C.border}`,
                  }}>{label}</button>
                ))}
              </div>
            </div>

            {loading && <div style={{ textAlign: "center", padding: 40, color: C.textSub, fontSize: 13 }}>Loading tickets…</div>}
            {!loading && filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: 32, color: C.textSub, fontSize: 14, border: `1px dashed ${C.border}`, borderRadius: 12 }}>
                {tickets.length === 0 ? `No maintenance requests${isAll ? "" : " for this property"} yet.` : "No tickets match these filters."}
              </div>
            )}

            {!loading && filtered.map(ticket => (
              <TicketCard key={ticket.id} ticket={ticket} expanded={expandedId === ticket.id} showProperty={isAll}
                vendorPhone={vendorsByName.get(String(ticket.vendor_name || "").trim().toLowerCase())?.phone}
                onToggle={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}
                onOpen={() => openDetail(ticket)}
                onAssign={() => setVendorTicket(ticket)}
                onResolve={() => updateStatus(ticket.id, "resolved")}
                onApprove={() => approveTicket(ticket)}
                onMoreWork={() => { setRejectTicket(ticket); setRejectNotes(""); }} />
            ))}
          </>
        )}

        {/* ── Cost Tracker tab ── */}
        {activeTab === "Cost Tracker" && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Recorded cost by ticket</div>
                <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{selectedName} · costs entered on tickets, not a ledger</div>
              </div>
              <GhostBtn small onClick={exportCostsCsv}>⬇ Export CSV</GhostBtn>
            </div>
            {costRows.length === 0 && <div style={{ padding: 24, fontSize: 13, color: C.textSub, textAlign: "center" }}>No costs recorded{isAll ? "" : " for this property"} yet.</div>}
            {costRows.length > 0 && (isMobile ? (
              <div>
                {costRows.map(t => (
                  <div key={t.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflowWrap: "anywhere" }}>{field(t, "title")}</div>
                      <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{[isAll ? field(t, "property") : null, `Unit ${field(t, "unit")}`, t.vendor_name, field(t, "updatedAt")].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>${Number(t.cost).toLocaleString("en-US")}</div>
                  </div>
                ))}
                <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", background: C.raised, fontWeight: 700 }}>
                  <span>Total</span><span style={{ color: C.gold }}>${totalCost.toLocaleString("en-US")}</span>
                </div>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Property", "Unit", "Issue", "Contractor", "Cost", "Updated"].map(h => (
                        <th key={h} scope="col" style={{ fontSize: 11, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em", padding: "10px 16px", textAlign: h === "Cost" ? "right" : "left", borderBottom: `1px solid ${C.border}`, background: C.raised, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {costRows.map(t => (
                      <tr key={t.id} className="m-row">
                        <td style={{ padding: "11px 16px", fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}` }}>{field(t, "property")}</td>
                        <td style={{ padding: "11px 16px", fontSize: 13, color: C.textSub, borderBottom: `1px solid ${C.border}` }}>Unit {field(t, "unit")}</td>
                        <td style={{ padding: "11px 16px", fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}` }}>{field(t, "title")}</td>
                        <td style={{ padding: "11px 16px", fontSize: 13, color: C.textSub, borderBottom: `1px solid ${C.border}` }}>{field(t, "vendor") || "—"}</td>
                        <td style={{ padding: "11px 16px", fontSize: 13, color: C.text, fontWeight: 600, borderBottom: `1px solid ${C.border}`, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>${Number(t.cost).toLocaleString("en-US")}</td>
                        <td style={{ padding: "11px 16px", fontSize: 13, color: C.textSub, borderBottom: `1px solid ${C.border}` }}>{field(t, "updatedAt")}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ padding: "11px 16px", fontSize: 13, fontWeight: 700, color: C.text, background: C.raised }}>Total</td>
                      <td style={{ padding: "11px 16px", fontSize: 14, fontWeight: 700, color: C.gold, background: C.raised, textAlign: "right" }}>${totalCost.toLocaleString("en-US")}</td>
                      <td style={{ background: C.raised }} />
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Detail drawer: slide-over on desktop, full-height sheet on phones ── */}
      {selected && (
        <>
        <div className="m-scrim" onClick={closeDetail} />
        <div ref={drawerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ticket-drawer-title" className="m-drawer"
          style={{ background: C.surface, borderLeft: `1px solid ${C.border}`, outline: "none" }}>
          <div style={{ position: "relative" }}>

            <div style={{ background: C.raised, borderBottom: `1px solid ${C.border}`, padding: "16px 20px", position: "sticky", top: 0, zIndex: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <h2 id="ticket-drawer-title" style={{ fontSize: 17, fontWeight: 600, color: C.text, margin: "0 0 4px", overflowWrap: "anywhere" }}>{field(selected, "title")}</h2>
                  <div style={{ fontSize: 12, color: C.textSub }}>{field(selected, "property")} · Unit {field(selected, "unit")} · {field(selected, "tenant")}</div>
                </div>
                <button type="button" onClick={closeDetail} aria-label="Close ticket details" style={{ flexShrink: 0, width: 44, height: 44, background: C.surface, border: `1px solid ${C.border}`, color: C.textSub, borderRadius: 10, cursor: "pointer", fontSize: 15 }}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <Badge type="priority" value={field(selected, "priority")} />
                <Badge type="status" value={field(selected, "status")} />
                {field(selected, "vendor") && <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: `${C.blue}18`, color: C.blue }}>🔧 {field(selected, "vendor")}</span>}
              </div>
              {vendorAccess?.ticketId === selected.id && vendorAccess.vendor_token && (
                <div style={{ marginTop: 12, padding: "10px 14px", background: C.raised, border: `1px solid ${C.border}`, borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, fontSize: 11, color: C.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    🔗 {window.location.origin}/vendor/{vendorAccess.vendor_token} · PIN: <strong style={{ color: C.gold }}>{vendorAccess.vendor_pin}</strong>
                  </div>
                  <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/vendor/${vendorAccess.vendor_token}`)} style={{ fontSize: 11, padding: "4px 10px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 5, color: C.textSub, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" }}>Copy link</button>
                </div>
              )}
            </div>

            <div style={{ padding: "20px" }}>
              <div style={{ marginBottom: 18 }}><StageTimeline ticket={selected} /></div>
              {nextAction(selected) && (
                <div style={{ padding: "10px 12px", borderRadius: 10, background: C.raised, border: `1px solid ${C.border}`, marginBottom: 18, fontSize: 13, color: C.text, lineHeight: 1.45 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: nextAction(selected).owner === "you" ? C.gold : C.textSub, marginRight: 8 }}>{nextAction(selected).owner === "you" ? "Next · you" : `Waiting · ${nextAction(selected).owner}`}</span>
                  {nextAction(selected).label}
                </div>
              )}
              {(telHref(selected.tenants?.phone) || telHref(vendorsByName.get(String(selected.vendor_name || "").trim().toLowerCase())?.phone)) && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
                  {telHref(selected.tenants?.phone) && <a className="m-chip" href={telHref(selected.tenants?.phone)} aria-label={`Call tenant ${field(selected, "tenant")}`}>📞 Call tenant</a>}
                  {telHref(vendorsByName.get(String(selected.vendor_name || "").trim().toLowerCase())?.phone) && <a className="m-chip" href={telHref(vendorsByName.get(String(selected.vendor_name || "").trim().toLowerCase())?.phone)} aria-label={`Call contractor ${selected.vendor_name}`}>📞 Call {selected.vendor_name}</a>}
                </div>
              )}

              {field(selected, "description") && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Description</div>
                  <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, margin: 0 }}>{field(selected, "description")}</p>
                </div>
              )}

              {selected.availability && (selected.availability.days?.length > 0 || selected.availability.times?.length > 0) && (
                <div style={{ marginBottom: 20, background: `${C.blue}08`, border: `1px solid ${C.blue}22`, borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.blue, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Tenant availability</div>
                  {selected.availability.days?.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: C.textSub, marginBottom: 5 }}>Available days</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {selected.availability.days.map(d => (
                          <span key={d} style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: `${C.blue}18`, color: C.blue }}>{d}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selected.availability.times?.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: C.textSub, marginBottom: 5 }}>Available times</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {selected.availability.times.map(t => (
                          <span key={t} style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: `${C.blue}18`, color: C.blue }}>{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selected.availability.entry_allowed && (
                    <div style={{ fontSize: 11, color: C.green, marginTop: 4 }}>✓ Vendor may enter when tenant is not home</div>
                  )}
                  {selected.availability.has_pets && (
                    <div style={{ fontSize: 11, color: C.amber, marginTop: 4 }}>🐾 Pets on premises{selected.availability.pet_details ? `: ${selected.availability.pet_details}` : ""}</div>
                  )}
                  {selected.availability.access_notes && (
                    <div style={{ fontSize: 11, color: C.textSub, marginTop: 4 }}>📝 {selected.availability.access_notes}</div>
                  )}
                </div>
              )}

              {selected.photos?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Photos ({selected.photos.length})</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {selected.photos.map((urlOrPath, i) => (
                      <SignedMaintenancePhoto key={i} urlOrPath={urlOrPath}
                        onClick={src => setLightbox({ paths: selected.photos, src, index: i })}
                        style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 7, border: `1px solid ${C.border}`, cursor: "pointer" }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Invoice */}
              {(selected.invoice_url || selected.invoice_notes) && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Invoice</div>
                  {selected.invoice_notes && (
                    <div style={{ padding: "10px 14px", background: C.raised, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: C.textSub, marginBottom: 2 }}>Amount</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 600, color: C.gold }}>${parseFloat(selected.invoice_notes).toLocaleString()}</div>
                    </div>
                  )}
                  {selected.invoice_url && (
                    <SignedInvoiceLink urlOrPath={selected.invoice_url} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: `${C.blue}08`, border: `1px solid ${C.blue}22`, borderRadius: 8, fontSize: 13, color: C.blue, textDecoration: "none" }}>
                      📄 View invoice photo →
                    </SignedInvoiceLink>
                  )}
                </div>
              )}

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Details</div>
                {[
                  ["Submitted",    field(selected, "submittedAt")],
                  ["Last updated", field(selected, "updatedAt")],
                  ["Category",     field(selected, "category")],
                  ["Vendor",       field(selected, "vendor") || "—"],
                  ["Scheduled",    field(selected, "scheduled") || "—"],
                  ["Cost",         field(selected, "cost") ? `$${field(selected, "cost")}` : "—"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 13, color: C.textSub }}>{k}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{v}</span>
                  </div>
                ))}
              </div>

              {field(selected, "status") !== "resolved" && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Actions</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {field(selected, "status") === "open" && (
                      <PrimaryBtn onClick={() => setVendorTicket(selected)}>Assign vendor</PrimaryBtn>
                    )}
                    {field(selected, "status") === "open" && (
                      <GhostBtn onClick={() => updateStatus(selected.id, "in_progress")}>→ In Progress</GhostBtn>
                    )}
                    {selected.status === "quote_submitted" && (
                      <div style={{ width:"100%" }}>
                        <div style={{ padding:"12px 14px", background:`${C.amber}0A`, border:`1px solid ${C.amber}33`, borderRadius:8, marginBottom:10 }}>
                          <div style={{ fontSize:11, fontWeight:600, color:C.amber, marginBottom:4 }}>Quote received</div>
                          <div style={{ fontSize:20, fontWeight:600, color:C.text, fontFamily:"'Cormorant Garamond',serif" }}>${selected.quote_amount?.toLocaleString()}</div>
                          {selected.quote_notes && <div style={{ fontSize:12, color:C.textSub, marginTop:4 }}>{selected.quote_notes}</div>}
                        </div>
                        <div style={{ display:"flex", gap:8 }}>
                          <PrimaryBtn color={C.green} onClick={() => approveQuote(selected)}>✓ Approve quote</PrimaryBtn>
                          <GhostBtn onClick={() => updateStatus(selected.id, "in_progress")}>✗ Decline</GhostBtn>
                        </div>
                      </div>
                    )}
                    {field(selected, "status") === "in_progress" && (
                      <PrimaryBtn color={C.green} onClick={() => updateStatus(selected.id, "resolved")}>✓ Mark Resolved</PrimaryBtn>
                    )}
                    {field(selected, "status") === "pending_review" && (
                      <div style={{ width:"100%" }}>
                        {selected.invoice_url && (
                          <SignedInvoiceLink urlOrPath={selected.invoice_url} style={{ display:"block", marginBottom:8, padding:"8px 14px", background:`${C.blue}0F`, border:`1px solid ${C.blue}33`, borderRadius:7, fontSize:12, color:C.blue, textDecoration:"none" }}>
                            📄 View invoice →
                          </SignedInvoiceLink>
                        )}
                        {selected.invoice_notes && (
                          <div style={{ marginBottom:8, padding:"8px 14px", background:C.raised, border:`1px solid ${C.border}`, borderRadius:7, fontSize:12, color:C.textSub }}>
                            {selected.invoice_notes}
                          </div>
                        )}
                        <div style={{ display:"flex", gap:8, marginTop:8 }}>
                          <PrimaryBtn color={C.green} onClick={() => approveTicket(selected)}>✓ Approve & close</PrimaryBtn>
                          <GhostBtn onClick={() => { setRejectTicket(selected); setRejectNotes(""); }}>↩ Request more work</GhostBtn>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Comments</div>
                <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 12 }}>
                  {comments.length === 0 && <div style={{ textAlign: "center", padding: "16px 0", color: C.textMuted, fontSize: 13 }}>No comments yet.</div>}
                  {comments.map(c => {
                    const isMe = c.author_name === "Property Manager";
                    const displayName = isMe ? "Property Manager" : (c.author_name || "Tenant");
                    const initials = displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                    const date = new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    return (
                      <div key={c.id} style={{ marginBottom: 14, display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexDirection: isMe ? "row-reverse" : "row" }}>
                          <div style={{ width: 26, height: 26, borderRadius: "50%", background: isMe ? "rgba(201,169,110,0.18)" : C.raised, border: `1px solid ${isMe ? C.gold : C.border}`, color: isMe ? C.gold : C.textSub, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.textSub }}>{displayName}</span>
                          {!c.visible_to_tenant && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 5, background: "rgba(240,164,48,0.13)", color: C.amber, fontWeight: 600 }}>🔒 Internal</span>}
                          {c.visible_to_tenant  && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 5, background: "rgba(114,176,42,0.13)", color: C.green, fontWeight: 600 }}>👁 Visible</span>}
                          <span style={{ fontSize: 10, color: C.textMuted }}>{date}</span>
                        </div>
                        <div style={{ maxWidth: "82%", background: isMe ? "rgba(201,169,110,0.15)" : C.raised, border: `1px solid ${isMe ? C.gold : C.border}`, borderRadius: isMe ? "14px 4px 14px 14px" : "4px 14px 14px 14px", padding: "10px 14px" }}>
                          <p style={{ fontSize: 13, color: isMe ? C.text : C.textSub, lineHeight: 1.5, margin: 0 }}>{c.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <textarea value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Add a comment…" rows={3}
                  style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, resize: "none", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", color: C.text, background: C.raised, lineHeight: 1.5, marginBottom: 8 }} />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select value={visibility} onChange={e => setVisibility(e.target.value)} style={{ flex: 1, padding: "8px 10px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 7, background: C.raised, fontFamily: "'DM Sans', sans-serif", outline: "none", color: C.textSub }}>
                    <option value="hidden">🔒 Internal only</option>
                    <option value="visible">👁 Visible to tenant</option>
                  </select>
                  <button onClick={handlePostComment} disabled={posting || !newComment.trim()} style={{ padding: "8px 16px", background: newComment.trim() ? "rgba(201,169,110,0.12)" : C.raised, color: newComment.trim() ? C.gold : C.textMuted, border: `1px solid ${newComment.trim() ? C.gold : C.border}`, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: newComment.trim() ? "pointer" : "default", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap" }}>
                    {posting ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Activity</div>
                {[
                  { color: C.amber, text: `Submitted by ${field(selected, "tenant")}`, time: field(selected, "submittedAt") },
                  field(selected, "vendor")    && { color: C.blue,  text: `Assigned to ${field(selected, "vendor")}`, time: field(selected, "updatedAt") },
                  field(selected, "scheduled") && { color: C.blue,  text: `Scheduled for ${field(selected, "scheduled")}`, time: field(selected, "updatedAt") },
                  field(selected, "status") === "resolved" && { color: C.green, text: "Ticket resolved", time: field(selected, "updatedAt") },
                ].filter(Boolean).map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0, marginTop: 5 }} />
                    <div>
                      <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>{item.text}</div>
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{item.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        </>
      )}

      {/* Lightbox */}
      {lightbox && (
        <LightboxView lightbox={lightbox} setLightbox={setLightbox} />
      )}

      {/* Confirm comment */}
      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: "100%", maxWidth: 400, padding: "32px 28px", textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 10 }}>Your tenant will see this message.</div>
            <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 24, textAlign: "left" }}>
              <p style={{ fontSize: 13, color: C.text, margin: 0, lineHeight: 1.5 }}>{newComment}</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <GhostBtn onClick={() => setShowConfirm(false)}>Cancel</GhostBtn>
              <PrimaryBtn onClick={postComment}>Send message</PrimaryBtn>
            </div>
          </div>
        </div>
      )}

      {/* Assign vendor modal */}
      {/* Rejection modal */}
      {rejectTicket && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, width:"100%", maxWidth:440, padding:"28px 24px" }}>
            <div style={{ fontSize:15, fontWeight:600, color:"#F5F2EB", marginBottom:6 }}>Request more work</div>
            <div style={{ fontSize:13, color:"#B7BBC4", marginBottom:16 }}>Tell the vendor what still needs to be done. They'll be notified via email.</div>
            <textarea value={rejectNotes} onChange={e => setRejectNotes(e.target.value)}
              placeholder="e.g. The leak is still present under the sink. Please return to complete the repair."
              rows={4} style={{ width:"100%", padding:"11px 14px", fontSize:13, border:`1px solid ${C.border}`, borderRadius:8, background:C.raised, color:C.text, outline:"none", resize:"none", fontFamily:"'DM Sans',sans-serif", lineHeight:1.5, boxSizing:"border-box", marginBottom:16 }}/>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => { setRejectTicket(null); setRejectNotes(""); }} style={{ padding:"9px 18px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:7, fontSize:13, color:C.textSub, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
              <button onClick={submitRejection} disabled={rejecting || !rejectNotes.trim()} style={{ flex:1, padding:"9px 18px", background:"transparent", border:"1px solid #7A5C2E", borderRadius:7, fontSize:13, fontWeight:500, color:"#C9A968", cursor:rejectNotes.trim()?"pointer":"not-allowed", fontFamily:"'DM Sans',sans-serif", opacity:rejectNotes.trim()?1:0.5 }}>
                {rejecting ? "Sending…" : "↩ Send to vendor"}
              </button>
            </div>
          </div>
        </div>
      )}

      {vendorTicket && (
        <AssignVendorModal
          requestId={vendorTicket.id}
          requestTitle={field(vendorTicket, "title")}
          requestCategory={field(vendorTicket, "category")}
          propertyId={vendorTicket.units?.property_id || null}
          propertyAddress={vendorTicket.units?.properties?.address ? `${vendorTicket.units.properties.address}, ${vendorTicket.units.properties.city} ${vendorTicket.units.properties.state}` : ""}
          unitId={vendorTicket.unit_id || null}
          availability={vendorTicket.availability || null}
          onClose={() => setVendorTicket(null)}
          onAssigned={() => { fetchTickets(); }}
        />
      )}
    </LandlordLayout>
  );
}