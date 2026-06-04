import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "./supabase";
import LandlordLayout from "./LandlordLayout";

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
  current:     { label: "Current",     color: "#72B02A", bg: "rgba(114,176,42,0.13)" },
  pending:     { label: "Pending",     color: "#F0A430", bg: "rgba(240,164,48,0.13)" },
  late:        { label: "Late",        color: "#E05555", bg: "rgba(224,85,85,0.13)" },
  paid:        { label: "Paid",        color: "#72B02A", bg: "rgba(114,176,42,0.13)" },
  upcoming:    { label: "Upcoming",    color: "#4A9AE8", bg: "rgba(74,154,232,0.13)" },
  failed:      { label: "Failed",      color: "#E05555", bg: "rgba(224,85,85,0.13)" },
  in_progress: { label: "In Progress", color: "#4A9AE8", bg: "rgba(74,154,232,0.13)" },
  resolved:    { label: "Resolved",    color: "#72B02A", bg: "rgba(114,176,42,0.13)" },
  open:        { label: "Open",        color: "#F0A430", bg: "rgba(240,164,48,0.13)" },
};

const TABS = ["Overview", "Payments", "Maintenance", "Notes"];
const AVATAR_COLORS = [C.gold, C.blue, C.green, C.amber, C.red];

function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

function Badge({ status }) {
  const cfg = STATUS[status];
  if (!cfg) return null;
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: cfg.bg, color: cfg.color, whiteSpace: "nowrap" }}>{cfg.label}</span>;
}

function PrimaryBtn({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: "transparent", border: `1px solid ${C.goldDim}`, color: C.gold, fontSize: 12, fontWeight: 500, padding: "7px 14px", borderRadius: 7, cursor: disabled ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif", transition: "background 0.15s", opacity: disabled ? 0.6 : 1, whiteSpace: "nowrap" }}
      onMouseOver={e => !disabled && (e.currentTarget.style.background = "rgba(201,169,110,0.07)")}
      onMouseOut={e => e.currentTarget.style.background = "transparent"}
    >{children}</button>
  );
}

function GhostBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.textSub, fontSize: 12, fontWeight: 500, padding: "7px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s", whiteSpace: "nowrap" }}
      onMouseOver={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = "#353A44"; }}
      onMouseOut={e => { e.currentTarget.style.color = C.textSub; e.currentTarget.style.borderColor = C.border; }}
    >{children}</button>
  );
}

function DangerBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ background: "rgba(224,85,85,0.1)", border: `1px solid rgba(224,85,85,0.25)`, color: C.red, fontSize: 12, fontWeight: 500, padding: "7px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap" }}>{children}</button>
  );
}

function InfoCard({ title, children }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.1em", padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>{title}</div>
      <div style={{ padding: "14px 16px" }}>{children}</div>
    </div>
  );
}

function InfoRow({ label, value, last, valueColor }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: last ? "none" : `1px solid ${C.border}` }}>
      <span style={{ fontSize: 13, color: C.textSub }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: valueColor || C.text }}>{value}</span>
    </div>
  );
}

const TH = ({ children, right }) => (
  <th style={{ fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.08em", padding: "10px 14px", textAlign: right ? "right" : "left", borderBottom: `1px solid ${C.border}`, background: C.raised, whiteSpace: "nowrap" }}>{children}</th>
);
const TD = ({ children, right, bold, color }) => (
  <td style={{ fontSize: 13, color: color || (bold ? C.text : C.textSub), fontWeight: bold ? 600 : 400, padding: "11px 14px", borderBottom: `1px solid ${C.border}`, textAlign: right ? "right" : "left", verticalAlign: "middle" }}>{children}</td>
);

// ─── Archive Confirm Modal ─────────────────────────────────────────────────
function ArchiveModal({ tenantName, onConfirm, onCancel, archiving }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: 400, padding: "28px 28px 24px" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 10 }}>Archive tenant?</div>
        <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, marginBottom: 24 }}>
          <strong style={{ color: C.text }}>{tenantName}</strong> will be removed from your active tenant list. Their payment history and maintenance records will be preserved. You can view archived tenants from the Tenants page.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
          <DangerBtn onClick={onConfirm}>{archiving ? "Archiving…" : "Archive tenant"}</DangerBtn>
        </div>
      </div>
    </div>
  );
}

export default function LandlordTenantDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const width    = useWindowWidth();
  const isMobile = width < 768;

  const [tenant, setTenant]           = useState(null);
  const [unit, setUnit]               = useState(null);
  const [property, setProperty]       = useState(null);
  const [payments, setPayments]       = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState("Overview");
  const [notes, setNotes]             = useState("");
  const [noteSaved, setNoteSaved]     = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [inviting, setInviting]       = useState(false);
  const [inviteSent, setInviteSent]   = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [archiving, setArchiving]     = useState(false);

  useEffect(() => { fetchAll(); }, [id]);

  async function fetchAll() {
    setLoading(true);
    const { data: tenantData } = await supabase.from("tenants").select("*").eq("id", id).single();
    if (!tenantData) { setLoading(false); return; }
    setTenant(tenantData);
    setNotes(tenantData.notes || "");
    const [{ data: unitData }, { data: paymentsData }, { data: maintData }] = await Promise.all([
      supabase.from("units").select("*, properties(*)").eq("id", tenantData.unit_id).single(),
      supabase.from("payments").select("*").eq("tenant_id", id).order("created_at", { ascending: false }),
      supabase.from("maintenance_requests").select("*").eq("tenant_id", id).order("created_at", { ascending: false }),
    ]);
    setUnit(unitData || null);
    setProperty(unitData?.properties || null);
    setPayments(paymentsData || []);
    setMaintenance(maintData || []);
    setLoading(false);
  }

  async function sendInvite() {
    if (!tenant.email) { setInviteError("No email on tenant record."); return; }
    setInviting(true); setInviteError("");
    const { error } = await supabase.functions.invoke("invite-tenant", {
      body: { tenant_id: tenant.id, tenant_name: tenant.name, tenant_email: tenant.email, unit_number: unit?.unit_number || "—", property_name: property?.name || "—", landlord_name: "Andrew Wagner" }
    });
    setInviting(false);
    if (error) { setInviteError(error.message); return; }
    setInviteSent(true);
  }

  async function archiveTenant() {
    setArchiving(true);
    await supabase.from("tenants").update({ archived: true }).eq("id", id);
    setArchiving(false);
    navigate("/landlord/tenants");
  }

  async function saveNotes() {
    setSavingNotes(true);
    await supabase.from("tenants").update({ notes }).eq("id", id);
    setSavingNotes(false);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  }

  if (loading) return <LandlordLayout><div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg, color: C.textSub, fontSize: 14 }}>Loading tenant…</div></LandlordLayout>;
  if (!tenant) return <LandlordLayout><div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg, color: C.textSub, fontSize: 14 }}>Tenant not found.</div></LandlordLayout>;

  const initials      = tenant.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const accentColor   = AVATAR_COLORS[0];
  const latestPayment = payments[0];
  let status = "current";
  if (latestPayment?.status === "failed") status = "late";
  else if (!latestPayment || latestPayment.status === "pending") status = "pending";
  const balance    = status !== "paid" && latestPayment?.status !== "paid" ? (unit?.rent_amount || 0) : 0;
  const leaseStart = tenant.lease_start ? new Date(tenant.lease_start) : null;
  const leaseEnd   = tenant.lease_end   ? new Date(tenant.lease_end)   : null;
  const daysLeft   = leaseEnd ? Math.ceil((leaseEnd - new Date()) / (1000 * 60 * 60 * 24)) : null;
  const progress   = leaseStart && leaseEnd ? Math.min(100, Math.max(0, Math.round(((new Date() - leaseStart) / (leaseEnd - leaseStart)) * 100))) : 0;

  return (
    <LandlordLayout openMaintenance={0} unreadMessages={0}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        .m-row:hover td { background: ${C.raised} !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "20px 16px" : "28px 32px 48px" }}>

        {/* Back */}
        <button onClick={() => navigate("/landlord/tenants")} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.goldDim, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginBottom: 20, padding: 0, transition: "color 0.15s" }}
          onMouseOver={e => e.currentTarget.style.color = C.gold}
          onMouseOut={e => e.currentTarget.style.color = C.goldDim}
        >← Back to Tenants</button>

        {/* Archived banner */}
        {tenant.archived && (
          <div style={{ background: "rgba(240,164,48,0.1)", border: `1px solid rgba(240,164,48,0.25)`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: C.amber, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>⚠ This tenant is archived and not in your active list.</span>
            <button onClick={async () => { await supabase.from("tenants").update({ archived: false }).eq("id", id); fetchAll(); }} style={{ background: "none", border: "none", color: C.amber, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif", textDecoration: "underline" }}>Unarchive</button>
          </div>
        )}

        {/* Header card */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 24px", marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${accentColor}22`, border: `1px solid ${accentColor}44`, color: accentColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: C.text, marginBottom: 4 }}>{tenant.name}</div>
              <div style={{ fontSize: 13, color: C.textSub, marginBottom: 8 }}>
                {property?.name || "—"} · Unit {unit?.unit_number || "—"}
                {property?.address && ` · ${property.address}, ${property.city} ${property.state}`}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Badge status={status} />
                {daysLeft !== null && daysLeft < 60 && daysLeft > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: "rgba(240,164,48,0.13)", color: C.amber }}>⚠ Lease expiring in {daysLeft}d</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
                {tenant.email && <span style={{ fontSize: 12, color: C.textSub }}>✉ {tenant.email}</span>}
                {tenant.phone && <span style={{ fontSize: 12, color: C.textSub }}>☎ {tenant.phone}</span>}
                {tenant.lease_start && <span style={{ fontSize: 12, color: C.textSub }}>Move-in: {new Date(tenant.lease_start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "flex-start" }}>
            <PrimaryBtn onClick={() => navigate("/landlord/messages")}>Message</PrimaryBtn>
            {!tenant.user_id && (
              inviteSent
                ? <span style={{ fontSize: 12, color: C.green, fontWeight: 500, padding: "7px 0" }}>✓ Invite sent</span>
                : <GhostBtn onClick={sendInvite} disabled={inviting}>{inviting ? "Sending…" : "Send invite"}</GhostBtn>
            )}
            <GhostBtn>Record payment</GhostBtn>
            {status === "late" && <DangerBtn>Send notice</DangerBtn>}
            {!tenant.archived && <DangerBtn onClick={() => setShowArchive(true)}>Archive</DangerBtn>}
            {inviteError && <div style={{ fontSize: 11, color: C.red, width: "100%", marginTop: 2 }}>{inviteError}</div>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: "10px 16px", fontSize: 13, fontWeight: activeTab === tab ? 600 : 400, color: activeTab === tab ? C.gold : C.textSub, background: "none", border: "none", borderBottom: activeTab === tab ? `2px solid ${C.gold}` : "2px solid transparent", marginBottom: -1, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "color 0.15s" }}>{tab}</button>
          ))}
        </div>

        {/* ── Overview ── */}
        {activeTab === "Overview" && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <InfoCard title="Balance">
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 600, color: balance > 0 ? C.red : C.green, marginBottom: 4 }}>
                {balance > 0 ? `-$${balance.toLocaleString()}` : "$0.00"}
              </div>
              <div style={{ fontSize: 12, color: balance > 0 ? C.red : C.green, marginBottom: balance > 0 ? 14 : 0 }}>{balance > 0 ? "Amount overdue" : "Fully paid ✓"}</div>
              {balance > 0 && <PrimaryBtn onClick={() => {}}>Send payment reminder</PrimaryBtn>}
            </InfoCard>

            <InfoCard title="Lease Details">
              <InfoRow label="Monthly rent"   value={unit?.rent_amount ? `$${unit.rent_amount.toLocaleString()}` : "—"} />
              <InfoRow label="Lease start"    value={tenant.lease_start ? new Date(tenant.lease_start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"} />
              <InfoRow label="Lease end"      value={tenant.lease_end   ? new Date(tenant.lease_end).toLocaleDateString("en-US",   { month: "short", day: "numeric", year: "numeric" }) : "—"} />
              <InfoRow label="Days remaining" value={daysLeft !== null ? (daysLeft > 0 ? `${daysLeft} days` : "Expired") : "—"} last />
              {leaseStart && leaseEnd && (
                <>
                  <div style={{ height: 4, background: C.raised, borderRadius: 2, overflow: "hidden", marginTop: 12 }}>
                    <div style={{ height: "100%", width: `${progress}%`, background: C.gold, borderRadius: 2 }} />
                  </div>
                  <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>{progress}% through lease</div>
                </>
              )}
            </InfoCard>

            <InfoCard title="Unit Info">
              <InfoRow label="Property"  value={property?.name || "—"} />
              <InfoRow label="Unit"      value={unit?.unit_number || "—"} />
              <InfoRow label="Bedrooms"  value={unit?.bedrooms ?? "—"} />
              <InfoRow label="Bathrooms" value={unit?.bathrooms ?? "—"} />
              <InfoRow label="Rent"      value={unit?.rent_amount ? `$${unit.rent_amount.toLocaleString()}/mo` : "—"} last />
            </InfoCard>

            <InfoCard title="Payment Summary">
              <InfoRow label="Total payments" value={payments.filter(p => p.status === "paid").length} />
              <InfoRow label="Last payment"   value={latestPayment?.paid_at ? new Date(latestPayment.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"} />
              <InfoRow label="Last amount"    value={latestPayment?.amount_cents ? `$${(latestPayment.amount_cents / 100).toLocaleString()}` : "—"} />
              <InfoRow label="Payment status" value={latestPayment?.status || "No payments"} last />
            </InfoCard>
          </div>
        )}

        {/* ── Payments ── */}
        {activeTab === "Payments" && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Payment history</div>
              <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{payments.length} payments recorded</div>
            </div>
            {payments.length === 0 ? (
              <div style={{ textAlign: "center", padding: 32, color: C.textSub, fontSize: 13 }}>No payment history yet.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><TH>Date</TH><TH right>Amount</TH><TH>Status</TH><TH>Source</TH></tr></thead>
                <tbody>
                  {payments.map((p, i) => (
                    <tr key={i} className="m-row">
                      <TD>{new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</TD>
                      <TD right bold>${((p.amount_cents || 0) / 100).toLocaleString()}</TD>
                      <TD><Badge status={p.status} /></TD>
                      <TD>{p.source || "—"}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Maintenance ── */}
        {activeTab === "Maintenance" && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Maintenance history</div>
              <GhostBtn onClick={() => navigate("/landlord/maintenance")}>View all</GhostBtn>
            </div>
            {maintenance.length === 0 ? (
              <div style={{ textAlign: "center", padding: 32, color: C.green, fontSize: 13 }}>No maintenance requests for this tenant.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><TH>Date</TH><TH>Issue</TH><TH>Category</TH><TH>Priority</TH><TH>Status</TH></tr></thead>
                <tbody>
                  {maintenance.map((m, i) => (
                    <tr key={i} className="m-row">
                      <TD>{new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</TD>
                      <TD bold>{m.title}</TD>
                      <TD>{m.category || "—"}</TD>
                      <TD><Badge status={m.priority === "high" || m.priority === "urgent" ? "late" : "upcoming"} /></TD>
                      <TD><Badge status={m.status} /></TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Notes ── */}
        {activeTab === "Notes" && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Private notes</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>Only visible to you — never shown to the tenant</div>
            </div>
            <div style={{ padding: "16px" }}>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Add private notes about this tenant — payment behavior, communications, maintenance patterns, renewal intent…"
                style={{ width: "100%", minHeight: 140, padding: "10px 12px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, resize: "vertical", fontFamily: "'DM Sans', sans-serif", color: C.text, background: C.raised, outline: "none", lineHeight: 1.6, boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                <PrimaryBtn onClick={saveNotes} disabled={savingNotes}>{noteSaved ? "✓ Saved!" : savingNotes ? "Saving…" : "Save notes"}</PrimaryBtn>
                <span style={{ fontSize: 11, color: C.textMuted }}>{notes.length} characters</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Archive confirm modal */}
      {showArchive && (
        <ArchiveModal
          tenantName={tenant.name}
          onConfirm={archiveTenant}
          onCancel={() => setShowArchive(false)}
          archiving={archiving}
        />
      )}
    </LandlordLayout>
  );
}