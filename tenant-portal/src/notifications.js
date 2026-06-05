import { supabase } from "./supabase";

const LANDLORD_EMAIL = "andrewwagner27@gmail.com";
const APP_URL = "https://polaris-pm.vercel.app";

async function sendEmail({ to, subject, html }) {
  try {
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: { to, subject, html },
    });
    if (error) console.error("Edge Function error:", error);
    return data;
  } catch (err) {
    console.error("Failed to send email:", err);
  }
}

export async function notifyNewMaintenanceTicket({ tenantName, title, unit, property, ticketId, priority }) {
  const priorityColors = { urgent: "#E05555", high: "#F0A430", normal: "#4A9AE8", low: "#72B02A" };
  const priorityColor  = priorityColors[priority] || "#4A9AE8";
  return sendEmail({
    to: LANDLORD_EMAIL,
    subject: `${priority === "urgent" ? "🚨" : priority === "high" ? "⚠️" : "🔧"} New maintenance request: ${title}`,
    html: `
      <!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A0B0D;font-family:'Helvetica Neue',sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0B0D;padding:32px 20px;">
        <tr><td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#111316;border:1px solid #252930;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
            <tr><td style="padding:24px 32px 20px;border-bottom:1px solid #252930;">
              <p style="margin:0;font-size:11px;font-weight:600;color:#5C6270;letter-spacing:0.16em;text-transform:uppercase;">MODUS PROPERTY MANAGEMENT</p>
              <h2 style="margin:8px 0 0;font-size:22px;font-weight:400;color:#EDEAE2;font-family:Georgia,serif;">New Maintenance Request</h2>
            </td></tr>
            <tr><td style="padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${[["Tenant", tenantName], ["Issue", title], ["Property", property], ["Unit", `Unit ${unit}`]].map(([k,v]) => `
                <tr>
                  <td style="padding:8px 0;color:#9095A0;font-size:13px;border-bottom:1px solid #252930;width:100px;">${k}</td>
                  <td style="padding:8px 0;font-weight:500;font-size:13px;color:#EDEAE2;border-bottom:1px solid #252930;">${v}</td>
                </tr>`).join("")}
                <tr>
                  <td style="padding:8px 0;color:#9095A0;font-size:13px;">Priority</td>
                  <td style="padding:8px 0;"><span style="display:inline-block;padding:3px 10px;background:${priorityColor}22;color:${priorityColor};border-radius:5px;font-size:12px;font-weight:600;">${(priority || "normal").charAt(0).toUpperCase() + (priority || "normal").slice(1)}</span></td>
                </tr>
              </table>
              <a href="${APP_URL}/landlord/maintenance" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#7A5C2E;color:#C9A96E;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;">View ticket →</a>
            </td></tr>
            <tr><td style="padding:16px 32px;border-top:1px solid #252930;">
              <p style="margin:0;font-size:11px;color:#5C6270;">Modus Property Management · Columbus, OH</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
      </body></html>
    `,
  });
}

export async function notifyTicketStatusUpdate({ tenantEmail, tenantName, title, newStatus, ticketId }) {
  if (!tenantEmail) return;
  const statusLabels = { in_progress: "In Progress", resolved: "Resolved ✓", open: "Open" };
  const statusColors = { in_progress: "#4A9AE8", resolved: "#72B02A", open: "#F0A430" };
  const label = statusLabels[newStatus] || newStatus;
  const color = statusColors[newStatus] || "#4A9AE8";
  return sendEmail({
    to: tenantEmail,
    subject: `Update on your maintenance request: ${title}`,
    html: `
      <!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A0B0D;font-family:'Helvetica Neue',sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0B0D;padding:32px 20px;">
        <tr><td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#111316;border:1px solid #252930;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
            <tr><td style="padding:24px 32px 20px;border-bottom:1px solid #252930;">
              <p style="margin:0;font-size:11px;font-weight:600;color:#5C6270;letter-spacing:0.16em;text-transform:uppercase;">MODUS PROPERTY MANAGEMENT</p>
              <h2 style="margin:8px 0 0;font-size:22px;font-weight:400;color:#EDEAE2;font-family:Georgia,serif;">Maintenance Update</h2>
            </td></tr>
            <tr><td style="padding:24px 32px;">
              <p style="color:#9095A0;font-size:14px;margin:0 0 20px;">Hi ${tenantName}, your maintenance request has been updated.</p>
              <div style="background:#181C21;border-radius:8px;padding:16px;margin-bottom:20px;">
                <div style="font-size:12px;color:#5C6270;margin-bottom:4px;">Request</div>
                <div style="font-size:15px;font-weight:500;color:#EDEAE2;margin-bottom:12px;">${title}</div>
                <div style="font-size:12px;color:#5C6270;margin-bottom:6px;">New Status</div>
                <span style="display:inline-block;padding:4px 12px;background:${color}22;color:${color};border-radius:5px;font-size:12px;font-weight:600;">${label}</span>
              </div>
              <a href="${APP_URL}/maintenance/${ticketId}" style="display:inline-block;padding:12px 24px;background:#7A5C2E;color:#C9A96E;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;">View request →</a>
            </td></tr>
            <tr><td style="padding:16px 32px;border-top:1px solid #252930;">
              <p style="margin:0;font-size:11px;color:#5C6270;">Modus Property Management · Columbus, OH</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
      </body></html>
    `,
  });
}

export async function notifyTenantNewComment({ tenantEmail, tenantName, title, commentBody, ticketId }) {
  if (!tenantEmail) return;
  return sendEmail({
    to: tenantEmail,
    subject: `New message on your maintenance request: ${title}`,
    html: `
      <!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A0B0D;font-family:'Helvetica Neue',sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0B0D;padding:32px 20px;">
        <tr><td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#111316;border:1px solid #252930;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
            <tr><td style="padding:24px 32px 20px;border-bottom:1px solid #252930;">
              <p style="margin:0;font-size:11px;font-weight:600;color:#5C6270;letter-spacing:0.16em;text-transform:uppercase;">MODUS PROPERTY MANAGEMENT</p>
              <h2 style="margin:8px 0 0;font-size:22px;font-weight:400;color:#EDEAE2;font-family:Georgia,serif;">New Message</h2>
            </td></tr>
            <tr><td style="padding:24px 32px;">
              <p style="color:#9095A0;font-size:14px;margin:0 0 20px;">Hi ${tenantName}, your property manager left a message on <strong style="color:#EDEAE2;">${title}</strong>.</p>
              <div style="background:#181C21;border-left:3px solid #C9A96E;border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:20px;">
                <p style="font-size:14px;color:#EDEAE2;margin:0;line-height:1.6;">${commentBody}</p>
              </div>
              <a href="${APP_URL}/maintenance/${ticketId}" style="display:inline-block;padding:12px 24px;background:#7A5C2E;color:#C9A96E;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;">Reply →</a>
            </td></tr>
            <tr><td style="padding:16px 32px;border-top:1px solid #252930;">
              <p style="margin:0;font-size:11px;color:#5C6270;">Modus Property Management · Columbus, OH</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
      </body></html>
    `,
  });
}

export async function notifyLandlordTenantComment({ tenantName, title, commentBody, ticketId }) {
  return sendEmail({
    to: LANDLORD_EMAIL,
    subject: `💬 ${tenantName} replied on: ${title}`,
    html: `
      <!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A0B0D;font-family:'Helvetica Neue',sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0B0D;padding:32px 20px;">
        <tr><td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#111316;border:1px solid #252930;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
            <tr><td style="padding:24px 32px 20px;border-bottom:1px solid #252930;">
              <p style="margin:0;font-size:11px;font-weight:600;color:#5C6270;letter-spacing:0.16em;text-transform:uppercase;">MODUS PROPERTY MANAGEMENT</p>
              <h2 style="margin:8px 0 0;font-size:22px;font-weight:400;color:#EDEAE2;font-family:Georgia,serif;">Tenant Reply</h2>
            </td></tr>
            <tr><td style="padding:24px 32px;">
              <p style="color:#9095A0;font-size:14px;margin:0 0 20px;"><strong style="color:#EDEAE2;">${tenantName}</strong> replied on <strong style="color:#EDEAE2;">${title}</strong>.</p>
              <div style="background:#181C21;border-left:3px solid #4A9AE8;border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:20px;">
                <p style="font-size:14px;color:#EDEAE2;margin:0;line-height:1.6;">${commentBody}</p>
              </div>
              <a href="${APP_URL}/landlord/maintenance" style="display:inline-block;padding:12px 24px;background:#7A5C2E;color:#C9A96E;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;">View ticket →</a>
            </td></tr>
            <tr><td style="padding:16px 32px;border-top:1px solid #252930;">
              <p style="margin:0;font-size:11px;color:#5C6270;">Modus Property Management · Columbus, OH</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
      </body></html>
    `,
  });
}

// ── Notify PM: vendor marked ticket complete ──
export async function notifyVendorComplete({ vendorName, ticketTitle, ticketId }) {
  return sendEmail({
    to: LANDLORD_EMAIL,
    subject: `✅ ${vendorName} completed: ${ticketTitle}`,
    html: `
      <!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A0B0D;font-family:'Helvetica Neue',sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0B0D;padding:32px 20px;">
        <tr><td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#111316;border:1px solid #252930;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
            <tr><td style="padding:24px 32px 20px;border-bottom:1px solid #252930;">
              <p style="margin:0;font-size:11px;font-weight:600;color:#5C6270;letter-spacing:0.16em;text-transform:uppercase;">MODUS PROPERTY MANAGEMENT</p>
              <h2 style="margin:8px 0 0;font-size:22px;font-weight:400;color:#EDEAE2;font-family:Georgia,serif;">Work Complete</h2>
            </td></tr>
            <tr><td style="padding:24px 32px;">
              <p style="color:#9095A0;font-size:14px;margin:0 0 20px;"><strong style="color:#EDEAE2;">${vendorName}</strong> has marked the following ticket as complete and is awaiting your review.</p>
              <div style="background:#181C21;border-radius:8px;padding:16px;margin-bottom:24px;">
                <div style="font-size:12px;color:#5C6270;margin-bottom:4px;">Ticket</div>
                <div style="font-size:15px;font-weight:500;color:#EDEAE2;">${ticketTitle}</div>
              </div>
              <a href="${APP_URL}/landlord/maintenance" style="display:inline-block;padding:12px 24px;background:#7A5C2E;color:#C9A96E;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;">Review & approve →</a>
            </td></tr>
            <tr><td style="padding:16px 32px;border-top:1px solid #252930;">
              <p style="margin:0;font-size:11px;color:#5C6270;">Modus Property Management · Columbus, OH</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
      </body></html>
    `,
  });
}