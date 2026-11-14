// api/_lib/dailyRecap.js
// Builds the daily recap email. Pure: (data) => { subject, html, text, allClear }.
// Each input is an array, or null when its query failed — a failed section says "could not be loaded"
// and the recap is never reported as all clear. Every database value is escaped.

import { escapeHtml, appLink, cleanSubject } from "../../src/lib/emailSafety.js";
import { escalationRecapSection, olderUnresolvedSection, OLDER_UNRESOLVED_DAYS } from "./escalationNotify.js";

const PCOL = { urgent: "#E05555", high: "#F0A430", normal: "#4A9AE8", low: "#72B02A" };
const td = (v, style = "font-size:13px;color:#EDEAE2") => `<td style="padding:7px 12px;${style};border-bottom:1px solid #252930">${v}</td>`;
const table = (rows) => `<table style="width:100%;border-collapse:collapse;background:#111316;border-radius:6px;overflow:hidden">${rows}</table>`;
const section = (title, color, content) => `<div style="margin-bottom:20px"><div style="font-size:11px;font-weight:600;letter-spacing:1px;color:${color};margin-bottom:8px">${escapeHtml(title)}</div>${content}</div>`;
const note = (text) => `<p style="color:#EDEAE2;font-size:13px;margin:0">${escapeHtml(text)}</p>`;
const none = `<p style="color:#5C6270;font-size:12px;margin:0">None</p>`;
const unit = (u) => `Unit ${escapeHtml(u || "?")}`;
const shortDate = (d) => escapeHtml(new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }));

function ticketTable(list) {
  if (!list.length) return none;
  return table(list.map((t) => {
    const pr = PCOL[t.priority] ? t.priority : "normal";
    return `<tr>${td(escapeHtml(t.title || "(no title)"))}${td(`${escapeHtml(t.tenants?.name || "")} · ${unit(t.tenants?.units?.unit_number)}`, "font-size:12px;color:#9095A0")}
${td(`<span style="font-size:10px;font-weight:700;color:${PCOL[pr]};background:${PCOL[pr]}18;padding:2px 7px;border-radius:8px">${escapeHtml(pr)}</span>`, "")}${td(shortDate(t.created_at), "font-size:11px;color:#5C6270")}</tr>`;
  }).join(""));
}

// Tenant messages from the window that the AI never processed (no routing-log row for that message):
// the request failed, timed out, or the function was stopped. Listed so none is silently lost.
export function unprocessedMessages(messages, routingRows) {
  if (!Array.isArray(messages) || !Array.isArray(routingRows)) return null;
  const processed = new Set(routingRows.map((r) => r.message_id).filter(Boolean));
  return messages.filter((m) => m.sender_id && m.tenants?.user_id && m.sender_id === m.tenants.user_id && !processed.has(m.id));
}

// Trusted "Modus notifications" ticket notes from the window that report a failed or unconfirmed email
// (maintenance alerts, status emails). Only the latest per ticket+label is listed; a later success clears it.
export function failedTicketEmails(notes) {
  if (!Array.isArray(notes)) return null;
  const trusted = notes.filter((n) => n?.author_type === "system" && n?.author_name === "Modus notifications" && !n?.author_id);
  const latest = new Map();
  for (const n of trusted.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) latest.set(n.request_id, n);
  return [...latest.values()].filter((n) => /^Email (FAILED|NOT CONFIRMED)/.test(String(n.body || "")));
}

// escalationEvents: agent_escalation_events rows (resolve/reopen history), or null if unavailable.
// olderEscalationRows: routing rows from before the 24-hour window (up to OLDER_UNRESOLVED_DAYS), or null.
// ticketNotes: maintenance_comments system notes from the window, or null.
export function buildDailyRecap({ tickets, inspections, tenants, escalationRows, messages, escalationEvents, olderEscalationRows, ticketNotes, since, now = new Date() }) {
  const failed = [];
  const ok = (name, v) => { if (!Array.isArray(v)) { failed.push(name); return []; } return v; };
  const tk = ok("maintenance tickets", tickets), ins = ok("inspections", inspections), tn = ok("leases", tenants);
  const escalations = escalationRecapSection(Array.isArray(escalationRows) ? escalationRows : null, { events: escalationEvents });
  const older = olderEscalationRows === undefined ? { count: 0, html: "" } : olderUnresolvedSection(olderEscalationRows, escalationEvents, { since });
  const mailFailures = ticketNotes === undefined ? [] : failedTicketEmails(ticketNotes);
  if (mailFailures === null) failed.push("ticket email outcomes");
  const unprocessed = unprocessedMessages(messages, escalationRows);
  if (unprocessed === null) failed.push("unanswered tenant messages");

  const openTickets = tk.filter((t) => t.status === "open");
  const urgentTickets = openTickets.filter((t) => t.priority === "urgent" || t.priority === "high");
  const inProgress = tk.filter((t) => t.status === "in_progress");
  const stalledTickets = openTickets.filter((t) => new Date(t.created_at).getTime() < now.getTime() - 4 * 3600e3);
  const awaitingTenant = ins.filter((i) => i.status === "awaiting_tenant");
  const tenantComplete = ins.filter((i) => i.status === "tenant_complete");
  const in60 = now.getTime() + 60 * 24 * 3600e3;
  const expiringLeases = tn.filter((t) => { const e = new Date(t.lease_end).getTime(); return e >= now.getTime() && e <= in60; })
    .sort((a, b) => new Date(a.lease_end) - new Date(b.lease_end));
  const today = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

  const sections = [
    failed.length ? section(`⚠️ COULD NOT BE LOADED: ${failed.join(", ").toUpperCase()}`, "#E05555",
      note("Part of this recap could not be read from the database, so it is incomplete. Check the portal directly.")) : "",
    (escalations.open || older.count) && Array.isArray(escalationEvents) ? section("📌 NEEDS MANAGEMENT ACTION", "#E05555",
      note(`${escalations.open} open escalation${escalations.open === 1 ? "" : "s"} from the last 24 hours${older.count ? ` and ${older.count} still open from earlier` : ""}. Resolve them in the Agent Center once handled; resolved items stop appearing here.`)) : "",
    escalations.unavailable ? section("🙋 TENANT ESCALATIONS — COULD NOT BE LOADED", "#E05555", note("The escalation list could not be read. Check the Agent Center for the last 24 hours."))
      : escalations.count ? section(`🙋 TENANT ESCALATIONS & EMERGENCIES — LAST 24 HOURS${escalations.needsAttention ? ` (${escalations.needsAttention} NOT CONFIRMED EMAILED)` : ""}`, "#E05555", escalations.html) : "",
    older.count ? section(`🔁 STILL UNRESOLVED FROM EARLIER (${older.count}, LAST ${OLDER_UNRESOLVED_DAYS} DAYS)`, "#F0A430", older.html) : "",
    older.unknown ? section("🔁 EARLIER ESCALATIONS — RESOLUTION STATUS UNAVAILABLE", "#F0A430", note("The Agent Center history could not be read, so earlier open escalations can't be listed. Check the Agent Center.")) : "",
    older.unavailable ? section("🔁 EARLIER ESCALATIONS — COULD NOT BE LOADED", "#E05555", note("Earlier escalations could not be read. Check the Agent Center.")) : "",
    mailFailures?.length ? section(`📧 TICKET EMAILS THAT FAILED OR WEREN'T CONFIRMED (${mailFailures.length})`, "#E05555",
      table(mailFailures.map((n) => `<tr>${td(escapeHtml(String(n.body || "").slice(0, 220)))}${td(escapeHtml(n.maintenance_requests?.title || "Ticket"), "font-size:12px;color:#9095A0")}${td(shortDate(n.created_at), "font-size:11px;color:#5C6270")}</tr>`).join(""))) : "",
    unprocessed?.length ? section(`💬 TENANT MESSAGES THE ASSISTANT NEVER ANSWERED (${unprocessed.length})`, "#E05555",
      table(unprocessed.map((m) => `<tr>${td(escapeHtml(String(m.body || "").slice(0, 200)))}${td(`${escapeHtml(m.tenants?.name || "Tenant")}`, "font-size:12px;color:#9095A0")}${td(shortDate(m.created_at), "font-size:11px;color:#5C6270")}</tr>`).join(""))) : "",
    urgentTickets.length ? section("🚨 URGENT / HIGH PRIORITY", "#E05555", ticketTable(urgentTickets)) : "",
    stalledTickets.length ? section("⏰ OPEN > 4 HOURS (needs acknowledgment)", "#F0A430", ticketTable(stalledTickets)) : "",
    section("🔧 ALL OPEN TICKETS", "#4A9AE8", openTickets.length ? ticketTable(openTickets) : `<p style="color:#5C6270;font-size:12px;margin:0">No open tickets ✓</p>`),
    inProgress.length ? section("⚙️ IN PROGRESS", "#9095A0", ticketTable(inProgress)) : "",
    awaitingTenant.length ? section("📋 INSPECTIONS AWAITING TENANT SIGN-OFF", "#C9A96E", table(awaitingTenant.map((i) =>
      `<tr>${td(escapeHtml(i.tenants?.name || "Tenant"))}${td(unit(i.tenants?.units?.unit_number), "font-size:12px;color:#9095A0")}${td(`Since ${shortDate(i.inspection_date || i.created_at)}`, "font-size:11px;color:#5C6270")}</tr>`).join(""))) : "",
    tenantComplete.length ? section("✍️ INSPECTIONS READY FOR MOVE-OUT", "#72B02A", table(tenantComplete.map((i) =>
      `<tr>${td(escapeHtml(i.tenants?.name || "Tenant"))}${td(unit(i.tenants?.units?.unit_number), "font-size:12px;color:#9095A0")}</tr>`).join(""))) : "",
    expiringLeases.length ? section("📅 LEASES EXPIRING IN 60 DAYS", "#F0A430", table(expiringLeases.map((t) => {
      const days = Math.ceil((new Date(t.lease_end) - now) / 86400e3);
      return `<tr>${td(escapeHtml(t.name || "Tenant"))}${td(unit(t.units?.unit_number), "font-size:12px;color:#9095A0")}${td(`<span style="color:${days <= 30 ? "#E05555" : "#F0A430"};font-weight:600">${days} days · ${escapeHtml(new Date(t.lease_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))}</span>`, "font-size:12px")}</tr>`;
    }).join(""))) : "",
  ].filter(Boolean).join("");

  const allClear = !failed.length && !escalations.unavailable && !escalations.count && !older.count && !older.unknown && !older.unavailable && !mailFailures?.length && !unprocessed?.length && !urgentTickets.length
    && !stalledTickets.length && !openTickets.length && !awaitingTenant.length && !expiringLeases.length;

  const summary = [failed.length && "INCOMPLETE", escalations.count && `${escalations.count} escalation${escalations.count === 1 ? "" : "s"}${Array.isArray(escalationEvents) && escalations.resolved ? ` (${escalations.open} open)` : ""}`,
    older.count && `${older.count} older unresolved`, mailFailures?.length && `${mailFailures.length} ticket email${mailFailures.length === 1 ? "" : "s"} failed`,
    escalations.needsAttention && `${escalations.needsAttention} not emailed`, unprocessed?.length && `${unprocessed.length} unanswered`,
    urgentTickets.length && `${urgentTickets.length} urgent`, stalledTickets.length && `${stalledTickets.length} stalled`,
    expiringLeases.length && `${expiringLeases.length} leases expiring`].filter(Boolean).join(", ");
  const subject = cleanSubject(allClear ? `✅ Daily Recap — All clear · ${today}` : `📋 Daily Recap — ${summary || "open items"} · ${today}`, 200);

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A0B0D;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0B0D;padding:32px 20px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#111316;border:1px solid #252930;border-radius:12px;overflow:hidden;max-width:600px;width:100%">
<tr><td style="padding:24px 28px 20px;border-bottom:1px solid #252930">
<p style="margin:0;font-size:11px;font-weight:600;color:#5C6270;letter-spacing:0.16em">MODUS PROPERTY MANAGEMENT</p>
<h2 style="margin:6px 0 4px;font-size:24px;font-weight:400;color:#EDEAE2;font-family:Georgia,serif">Daily Recap</h2>
<p style="margin:0;font-size:13px;color:#5C6270">${escapeHtml(today)}</p></td></tr>
<tr><td style="padding:24px 28px">
${allClear ? `<div style="text-align:center;padding:32px 0"><div style="font-size:32px;margin-bottom:12px">✅</div><p style="font-size:15px;color:#72B02A;font-weight:600;margin:0">All clear — no items need attention today.</p></div>` : sections}
<div style="margin-top:24px;text-align:center">
<a href="${appLink("/landlord/maintenance")}" style="display:inline-block;padding:11px 22px;background:#7A5C2E;color:#C9A96E;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;margin-right:8px">Open Tickets →</a>
<a href="${appLink("/landlord/agent")}" style="display:inline-block;padding:11px 22px;background:#181C21;color:#9095A0;border:1px solid #252930;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px">Agent Center →</a>
</div></td></tr>
<tr><td style="padding:14px 28px;border-top:1px solid #252930"><p style="margin:0;font-size:11px;color:#5C6270">Modus Property Management · Daily recap</p></td></tr>
</table></td></tr></table></body></html>`;

  const text = [subject, "", failed.length ? `INCOMPLETE — could not load: ${failed.join(", ")}` : null,
    `Escalations (24h): ${escalations.unavailable ? "could not be loaded" : escalations.count}${Array.isArray(escalationEvents) ? ` (open ${escalations.open}, resolved ${escalations.resolved})` : ""}`,
    `Still unresolved from earlier: ${older.unknown || older.unavailable ? "unavailable" : older.count}`, `Ticket emails failed/unconfirmed: ${mailFailures ? mailFailures.length : "could not be loaded"}`, `Unanswered tenant messages: ${unprocessed ? unprocessed.length : "could not be loaded"}`,
    `Open tickets: ${openTickets.length} (urgent ${urgentTickets.length}, stalled ${stalledTickets.length})`, `Leases expiring in 60 days: ${expiringLeases.length}`].filter((l) => l !== null).join("\n");
  return { subject, html, text, allClear, incomplete: failed.length > 0 };
}
