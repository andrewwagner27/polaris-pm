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

// ── Notify landlord: new maintenance ticket submitted ──
export async function notifyNewMaintenanceTicket({ tenantName, title, unit, property, ticketId }) {
  return sendEmail({
    to: LANDLORD_EMAIL,
    subject: `🔧 New maintenance request: ${title}`,
    html: `
      <div style="font-family: 'Inter', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <div style="background: #0C447C; border-radius: 12px 12px 0 0; padding: 24px;">
          <h2 style="color: #fff; margin: 0; font-size: 20px;">New Maintenance Request</h2>
        </div>
        <div style="background: #fff; border: 1px solid #e8eaed; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
          <p style="color: #444; font-size: 15px; margin: 0 0 16px;">A new maintenance request has been submitted.</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #888; font-size: 13px; border-bottom: 1px solid #f0f0f0;">Tenant</td><td style="padding: 8px 0; font-weight: 600; font-size: 13px; border-bottom: 1px solid #f0f0f0;">${tenantName}</td></tr>
            <tr><td style="padding: 8px 0; color: #888; font-size: 13px; border-bottom: 1px solid #f0f0f0;">Issue</td><td style="padding: 8px 0; font-weight: 600; font-size: 13px; border-bottom: 1px solid #f0f0f0;">${title}</td></tr>
            <tr><td style="padding: 8px 0; color: #888; font-size: 13px; border-bottom: 1px solid #f0f0f0;">Property</td><td style="padding: 8px 0; font-weight: 600; font-size: 13px; border-bottom: 1px solid #f0f0f0;">${property}</td></tr>
            <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Unit</td><td style="padding: 8px 0; font-weight: 600; font-size: 13px;">Unit ${unit}</td></tr>
          </table>
          <a href="${APP_URL}/landlord/maintenance" style="display: inline-block; margin-top: 20px; padding: 11px 22px; background: #0C447C; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">View ticket →</a>
        </div>
        <p style="color: #aaa; font-size: 11px; margin-top: 16px; text-align: center;">Polaris PM · Property Management</p>
      </div>
    `,
  });
}

// ── Notify tenant: ticket status updated ──
export async function notifyTicketStatusUpdate({ tenantEmail, tenantName, title, newStatus, ticketId }) {
  if (!tenantEmail) return;
  const statusLabels = { in_progress: "In Progress", resolved: "Resolved ✓", open: "Open" };
  const statusColors = { in_progress: "#185FA5", resolved: "#3B6D11", open: "#854F0B" };
  const label = statusLabels[newStatus] || newStatus;
  const color = statusColors[newStatus] || "#185FA5";

  return sendEmail({
    to: tenantEmail,
    subject: `Update on your maintenance request: ${title}`,
    html: `
      <div style="font-family: 'Inter', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <div style="background: #0C447C; border-radius: 12px 12px 0 0; padding: 24px;">
          <h2 style="color: #fff; margin: 0; font-size: 20px;">Maintenance Update</h2>
        </div>
        <div style="background: #fff; border: 1px solid #e8eaed; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
          <p style="color: #444; font-size: 15px; margin: 0 0 16px;">Hi ${tenantName}, your maintenance request has been updated.</p>
          <div style="background: #f8f9fa; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
            <div style="font-size: 13px; color: #888; margin-bottom: 4px;">Request</div>
            <div style="font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 12px;">${title}</div>
            <div style="font-size: 13px; color: #888; margin-bottom: 4px;">New Status</div>
            <span style="display: inline-block; padding: 4px 12px; background: ${color}20; color: ${color}; border-radius: 20px; font-size: 13px; font-weight: 600;">${label}</span>
          </div>
          <a href="${APP_URL}/maintenance/${ticketId}" style="display: inline-block; padding: 11px 22px; background: #0C447C; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">View request →</a>
        </div>
        <p style="color: #aaa; font-size: 11px; margin-top: 16px; text-align: center;">Polaris PM · Property Management</p>
      </div>
    `,
  });
}

// ── Notify tenant: landlord posted a visible comment ──
export async function notifyTenantNewComment({ tenantEmail, tenantName, title, commentBody, ticketId }) {
  if (!tenantEmail) return;
  return sendEmail({
    to: tenantEmail,
    subject: `New message on your maintenance request: ${title}`,
    html: `
      <div style="font-family: 'Inter', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <div style="background: #0C447C; border-radius: 12px 12px 0 0; padding: 24px;">
          <h2 style="color: #fff; margin: 0; font-size: 20px;">New Message from Property Manager</h2>
        </div>
        <div style="background: #fff; border: 1px solid #e8eaed; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
          <p style="color: #444; font-size: 15px; margin: 0 0 16px;">Hi ${tenantName}, your property manager left a message on your request <strong>${title}</strong>.</p>
          <div style="background: #f8f9fa; border-left: 3px solid #0C447C; border-radius: 0 8px 8px 0; padding: 14px 16px; margin-bottom: 20px;">
            <p style="font-size: 14px; color: #1a1a1a; margin: 0; line-height: 1.6;">${commentBody}</p>
          </div>
          <a href="${APP_URL}/maintenance/${ticketId}" style="display: inline-block; padding: 11px 22px; background: #0C447C; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Reply →</a>
        </div>
        <p style="color: #aaa; font-size: 11px; margin-top: 16px; text-align: center;">Polaris PM · Property Management</p>
      </div>
    `,
  });
}

// ── Notify landlord: tenant posted a comment ──
export async function notifyLandlordTenantComment({ tenantName, title, commentBody, ticketId }) {
  return sendEmail({
    to: LANDLORD_EMAIL,
    subject: `💬 ${tenantName} replied on: ${title}`,
    html: `
      <div style="font-family: 'Inter', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <div style="background: #0C447C; border-radius: 12px 12px 0 0; padding: 24px;">
          <h2 style="color: #fff; margin: 0; font-size: 20px;">Tenant Reply</h2>
        </div>
        <div style="background: #fff; border: 1px solid #e8eaed; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
          <p style="color: #444; font-size: 15px; margin: 0 0 16px;"><strong>${tenantName}</strong> replied on maintenance request <strong>${title}</strong>.</p>
          <div style="background: #f8f9fa; border-left: 3px solid #378ADD; border-radius: 0 8px 8px 0; padding: 14px 16px; margin-bottom: 20px;">
            <p style="font-size: 14px; color: #1a1a1a; margin: 0; line-height: 1.6;">${commentBody}</p>
          </div>
          <a href="${APP_URL}/landlord/maintenance" style="display: inline-block; padding: 11px 22px; background: #0C447C; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">View ticket →</a>
        </div>
        <p style="color: #aaa; font-size: 11px; margin-top: 16px; text-align: center;">Polaris PM · Property Management</p>
      </div>
    `,
  });
}