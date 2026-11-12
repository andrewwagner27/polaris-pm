// api/_lib/notificationTemplates.js
// Every maintenance, vendor and inspection email, built on the server from database values.
// Pure: (data) => { subject, html, text }. Every data value is escaped with escapeHtml/textToHtml;
// links are portal paths (appLink) or checked with safeUrl. Callers never pass HTML in.

import { escapeHtml, textToHtml, appLink, safeUrl, cleanSubject, oneLine, formatDollars, APP_URL } from "../../src/lib/emailSafety.js";

const COLORS = { urgent: "#E05555", high: "#F0A430", normal: "#4A9AE8", low: "#72B02A" };
const STATUS_LABELS = { open: "Open", in_progress: "In Progress", resolved: "Resolved ✓", pending_review: "Pending review", quote_submitted: "Quote submitted" };
const STATUS_COLORS = { open: "#F0A430", in_progress: "#4A9AE8", resolved: "#72B02A" };

function shell({ heading, body, accent = "#252930" }) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A0B0D;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0B0D;padding:32px 20px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#111316;border:1px solid ${accent};border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
<tr><td style="padding:24px 32px 20px;border-bottom:1px solid #252930;">
<p style="margin:0;font-size:11px;font-weight:600;color:#5C6270;letter-spacing:0.16em;text-transform:uppercase;">MODUS PROPERTY MANAGEMENT</p>
<h2 style="margin:8px 0 0;font-size:22px;font-weight:400;color:#EDEAE2;font-family:Georgia,serif;">${escapeHtml(heading)}</h2>
</td></tr>
<tr><td style="padding:24px 32px;">${body}</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #252930;"><p style="margin:0;font-size:11px;color:#5C6270;">Modus Property Management · Columbus, OH · This mailbox is not monitored; please use the portal.</p></td></tr>
</table></td></tr></table></body></html>`;
}

const p = (html) => `<p style="color:#9095A0;font-size:14px;margin:0 0 20px;line-height:1.6;">${html}</p>`;
const strong = (v) => `<strong style="color:#EDEAE2;">${escapeHtml(v)}</strong>`;
const button = (href, label, bg = "#7A5C2E", fg = "#C9A96E") =>
  `<a href="${href}" style="display:inline-block;margin-top:8px;padding:12px 24px;background:${bg};color:${fg};border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;">${escapeHtml(label)}</a>`;
const quoteBlock = (text, color = "#C9A96E", label = "") => `<div style="background:#181C21;border-left:3px solid ${color};border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:20px;">
${label ? `<div style="font-size:11px;color:${color};font-weight:600;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">${escapeHtml(label)}</div>` : ""}
<p style="font-size:14px;color:#EDEAE2;margin:0;line-height:1.6;">${textToHtml(text)}</p></div>`;
const details = (rows) => `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">${rows.filter(([, v]) => v != null && v !== "").map(([k, v]) => `
<tr><td style="padding:8px 0;color:#9095A0;font-size:13px;border-bottom:1px solid #252930;width:110px;vertical-align:top;">${escapeHtml(k)}</td>
<td style="padding:8px 0;font-weight:500;font-size:13px;color:#EDEAE2;border-bottom:1px solid #252930;">${textToHtml(v)}</td></tr>`).join("")}</table>`;
const textLines = (...lines) => lines.filter((l) => l != null && l !== false).join("\n");

const capitalize = (s) => { const v = String(s || "normal"); return v.charAt(0).toUpperCase() + v.slice(1); };
const where = (t) => [t?.propertyName, t?.unitNumber ? `Unit ${t.unitNumber}` : null].filter(Boolean).join(" · ");

// ── To management ────────────────────────────────────────────

// ticket: { title, description, category, priority, propertyName, unitNumber, tenantName }
// emergency: null | { kind, lifeSafety }
export function maintenanceCreatedEmail({ ticket, emergency = null }) {
  const pr = String(ticket?.priority || "normal").toLowerCase();
  const color = emergency ? "#E05555" : (COLORS[pr] || COLORS.normal);
  const icon = emergency ? "🚨" : pr === "urgent" ? "🚨" : pr === "high" ? "⚠️" : "🔧";
  const label = emergency ? "EMERGENCY maintenance request" : pr === "urgent" ? "URGENT maintenance request" : "New maintenance request";
  const subject = cleanSubject(`${icon} ${label}: ${oneLine(ticket?.title, 80)} — ${where(ticket) || "Unknown unit"}`);
  const body = `${emergency ? quoteBlock(`Possible ${String(emergency.kind).replace(/_/g, " ")} emergency.${emergency.lifeSafety ? " The tenant is being told to call 911." : ""} Contact the tenant now.`, "#E05555", "Emergency") : ""}
${details([["Tenant", ticket?.tenantName || "Unknown"], ["Property", ticket?.propertyName || "Unknown"], ["Unit", ticket?.unitNumber || "—"], ["Issue", ticket?.title || "(no title)"], ["Category", ticket?.category || ""], ["Priority", capitalize(pr)]])}
${ticket?.description ? quoteBlock(ticket.description, color, "Tenant's description") : ""}
${button(appLink("/landlord/maintenance"), "View ticket →")}`;
  return {
    subject,
    html: shell({ heading: label, body, accent: emergency || pr === "urgent" ? "#E05555" : "#252930" }),
    text: textLines(subject, "", `Tenant: ${ticket?.tenantName || "Unknown"}`, `Where: ${where(ticket) || "Unknown"}`, `Issue: ${ticket?.title || ""}`,
      `Priority: ${capitalize(pr)}`, ticket?.description ? `\n${ticket.description}` : null, "", `${APP_URL}/landlord/maintenance`),
  };
}

export function tenantReplyEmail({ ticket, tenantName, commentBody }) {
  const subject = cleanSubject(`💬 ${oneLine(tenantName, 60) || "Tenant"} replied on: ${oneLine(ticket?.title, 80)}`);
  const body = `${p(`${strong(tenantName || "The tenant")} replied on ${strong(ticket?.title || "a maintenance request")}${where(ticket) ? ` (${escapeHtml(where(ticket))})` : ""}.`)}
${quoteBlock(commentBody, "#4A9AE8")}
${button(appLink("/landlord/maintenance"), "View ticket →")}`;
  return { subject, html: shell({ heading: "Tenant Reply", body }),
    text: textLines(subject, "", String(commentBody ?? ""), "", `${APP_URL}/landlord/maintenance`) };
}

export function vendorQuoteEmail({ ticket, vendorName, quoteAmount, quoteNotes }) {
  const subject = cleanSubject(`💰 Quote received from ${oneLine(vendorName, 60) || "vendor"}: ${oneLine(ticket?.title, 80)}`);
  const body = `${p(`${strong(vendorName || "A vendor")} has submitted a quote for your review.`)}
${details([["Job", ticket?.title || ""], ["Where", where(ticket)], ["Quote", formatDollars(quoteAmount)]])}
${quoteNotes ? quoteBlock(quoteNotes, "#C9A96E", "Vendor notes") : ""}
${button(appLink("/landlord/maintenance"), "Review & approve →")}`;
  return { subject, html: shell({ heading: "Quote Received", body }),
    text: textLines(subject, "", `Quote: ${formatDollars(quoteAmount)}`, quoteNotes ? `Notes: ${quoteNotes}` : null, "", `${APP_URL}/landlord/maintenance`) };
}

export function vendorCompleteEmail({ ticket, vendorName, hasInvoice, invoiceNotes }) {
  const subject = cleanSubject(`✅ ${oneLine(vendorName, 60) || "Vendor"} completed: ${oneLine(ticket?.title, 80)}`);
  const body = `${p(`${strong(vendorName || "The vendor")} has submitted work for review.`)}
${details([["Job", ticket?.title || ""], ["Where", where(ticket)], ["Invoice", hasInvoice ? "Attached — review in Modus" : "None attached"]])}
${invoiceNotes ? quoteBlock(invoiceNotes, "#4A9AE8", "Vendor notes") : ""}
${button(appLink("/landlord/maintenance"), "✓ Review & approve →", "#72B02A", "#FFFFFF")}`;
  return { subject, html: shell({ heading: "Work Complete", body }),
    text: textLines(subject, "", `Invoice: ${hasInvoice ? "attached" : "none"}`, invoiceNotes ? `Notes: ${invoiceNotes}` : null, "", `${APP_URL}/landlord/maintenance`) };
}

export function inspectionCompleteEmail({ tenantName, signature, signedAt, photoCount, propertyName, unitNumber }) {
  const subject = cleanSubject(`Tenant walkthrough complete — ${oneLine(tenantName, 60) || "Tenant"} has signed off`);
  const body = `${p("A tenant has completed their move-in walkthrough.")}
${details([["Tenant", tenantName || "Unknown"], ["Where", where({ propertyName, unitNumber })], ["Signed as", signature || ""], ["Signed at", signedAt || ""], ["Photos", `${Number(photoCount) || 0} uploaded`]])}
${p("Sign in to review the tenant's notes and photos.")}
${button(appLink("/landlord/inspections"), "Open inspections →")}`;
  return { subject, html: shell({ heading: "Walkthrough Complete", body }),
    text: textLines(subject, "", `Tenant: ${tenantName || "Unknown"}`, `Signed as: ${signature || ""}`, `Photos: ${Number(photoCount) || 0}`, "", `${APP_URL}/landlord/inspections`) };
}

// ticket: { title, description, propertyName, unitNumber }; vendor: null | { name, phone }; vendorLink is server-built.
export function emergencyDispatchEmail({ ticket, vendor, vendorLink, pin }) {
  const subject = cleanSubject(`🚨 Emergency dispatch: ${oneLine(ticket?.title || ticket?.description, 90)}`);
  const body = `${details([["Where", where(ticket) || "Unknown"], ["Issue", ticket?.title || ""], ["Vendor", vendor ? [vendor.name, vendor.phone].filter(Boolean).join(" · ") : "None on file — dispatch manually"]])}
${ticket?.description ? quoteBlock(ticket.description, "#E05555", "Tenant's message") : ""}
${p(`Vendor access link: <a href="${safeUrl(vendorLink)}" style="color:#C9A96E;">${escapeHtml(vendorLink)}</a><br>PIN: ${strong(pin)} — share both with the vendor by phone; don't forward this email.`)}
${button(appLink("/landlord/maintenance"), "Review ticket →")}`;
  return { subject, html: shell({ heading: "🚨 Emergency Dispatch", body, accent: "#E05555" }),
    text: textLines(subject, "", `Where: ${where(ticket) || "Unknown"}`, vendor ? `Vendor: ${vendor.name}` : "No vendor on file — dispatch manually", `Vendor link: ${vendorLink}`, `PIN: ${pin}`) };
}

// ── To the tenant ────────────────────────────────────────────

export function ticketStatusEmail({ tenantName, ticketTitle, status, ticketId }) {
  const s = String(status || "");
  const label = STATUS_LABELS[s] || s || "Updated";
  const color = STATUS_COLORS[s] || "#4A9AE8";
  const subject = cleanSubject(`Update on your maintenance request: ${oneLine(ticketTitle, 100)}`);
  const body = `${p(`Hi ${escapeHtml(oneLine(tenantName, 60) || "there")}, your maintenance request has been updated.`)}
<div style="background:#181C21;border-radius:8px;padding:16px;margin-bottom:20px;">
<div style="font-size:12px;color:#5C6270;margin-bottom:4px;">Request</div>
<div style="font-size:15px;font-weight:500;color:#EDEAE2;margin-bottom:12px;">${escapeHtml(ticketTitle)}</div>
<div style="font-size:12px;color:#5C6270;margin-bottom:6px;">New status</div>
<span style="display:inline-block;padding:4px 12px;background:${color}22;color:${color};border-radius:5px;font-size:12px;font-weight:600;">${escapeHtml(label)}</span></div>
${button(appLink(`/maintenance/${encodeURIComponent(String(ticketId || ""))}`), "View request →")}`;
  return { subject, html: shell({ heading: "Maintenance Update", body }),
    text: textLines(subject, "", `New status: ${label}`, "", `${APP_URL}/maintenance/${encodeURIComponent(String(ticketId || ""))}`) };
}

export function landlordCommentEmail({ tenantName, ticketTitle, commentBody, ticketId }) {
  const subject = cleanSubject(`New message on your maintenance request: ${oneLine(ticketTitle, 100)}`);
  const body = `${p(`Hi ${escapeHtml(oneLine(tenantName, 60) || "there")}, your property manager left a message on ${strong(ticketTitle)}.`)}
${quoteBlock(commentBody)}
${button(appLink(`/maintenance/${encodeURIComponent(String(ticketId || ""))}`), "Reply →")}`;
  return { subject, html: shell({ heading: "New Message", body }),
    text: textLines(subject, "", String(commentBody ?? ""), "", `${APP_URL}/maintenance/${encodeURIComponent(String(ticketId || ""))}`) };
}

// ── To the vendor ────────────────────────────────────────────

export function vendorApprovedEmail({ vendorName, ticketTitle, propertyName, stage = "work" }) {
  const quote = stage === "quote";
  const subject = cleanSubject(`✅ ${quote ? "Quote approved" : "Work approved"}: ${oneLine(ticketTitle, 100)}`);
  const body = `${p(`Hi ${escapeHtml(oneLine(vendorName, 60) || "there")}, ${quote ? "your quote has been approved. You can schedule and begin the work." : "your work has been reviewed and approved."}`)}
${details([["Job", ticketTitle || ""], ["Property", propertyName || ""]])}
${quote ? "" : p("Payment will be processed per your work order terms.")}`;
  return { subject, html: shell({ heading: quote ? "Quote Approved" : "Work Approved", body }),
    text: textLines(subject, "", `Job: ${ticketTitle || ""}`, propertyName ? `Property: ${propertyName}` : null) };
}

export function vendorMoreWorkEmail({ vendorName, ticketTitle, pmNotes, vendorLink }) {
  const subject = cleanSubject(`↩ Additional work needed: ${oneLine(ticketTitle, 100)}`);
  const body = `${p(`Hi ${escapeHtml(oneLine(vendorName, 60) || "there")}, the property manager reviewed your submission on ${strong(ticketTitle)} and is requesting additional work.`)}
${pmNotes ? quoteBlock(pmNotes, "#F0A430", "PM notes") : ""}
${button(safeUrl(vendorLink), "Return to ticket →")}`;
  return { subject, html: shell({ heading: "Additional Work Needed", body }),
    text: textLines(subject, "", pmNotes ? `PM notes: ${pmNotes}` : null, "", String(vendorLink || "")) };
}
