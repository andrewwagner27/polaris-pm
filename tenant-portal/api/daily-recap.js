// api/daily-recap.js
// Sends the landlord a morning summary of everything needing attention.
// Call this from a Vercel cron job (vercel.json) at 8am ET daily.
// ENV vars: RESEND_API_KEY, LANDLORD_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
// Auth: Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; a signed-in landlord may also trigger it manually.

import { hasCronSecret, getCaller, isLandlord } from "./_lib/auth.js";

export default async function handler(req, res) {
  // Allow GET (cron) or POST (manual trigger)
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).end();

  if (!hasCronSecret(req) && !isLandlord(await getCaller(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const SUPABASE_URL  = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const LANDLORD_EMAIL = process.env.LANDLORD_EMAIL || "moduspropmgmt@gmail.com";

  async function sbFetch(path) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
    });
    return r.json();
  }

  // ── Pull data ──────────────────────────────────────────
  const [tickets, inspections, tenants] = await Promise.all([
    sbFetch("maintenance_requests?select=id,title,priority,status,created_at,tenants(name,units(unit_number))&status=neq.resolved&order=created_at.desc"),
    sbFetch("inspections?select=id,status,inspection_date,tenants(name,units(unit_number))&status=neq.closed&order=created_at.desc"),
    sbFetch("tenants?select=id,name,lease_end,units(unit_number)&archived=eq.false&lease_end=not.is.null"),
  ]);

  // ── Categorise ────────────────────────────────────────
  const openTickets    = (tickets||[]).filter(t => t.status === "open");
  const urgentTickets  = openTickets.filter(t => t.priority === "urgent" || t.priority === "high");
  const inProgress     = (tickets||[]).filter(t => t.status === "in_progress");

  // Tickets open > 4 hours without acknowledgment
  const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
  const stalledTickets = openTickets.filter(t => new Date(t.created_at).getTime() < fourHoursAgo);

  // Inspections awaiting tenant
  const awaitingTenant = (inspections||[]).filter(i => i.status === "awaiting_tenant");
  const tenantComplete = (inspections||[]).filter(i => i.status === "tenant_complete");

  // Leases expiring within 60 days
  const now = new Date();
  const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const expiringLeases = (tenants||[]).filter(t => {
    const exp = new Date(t.lease_end);
    return exp >= now && exp <= in60;
  }).sort((a,b) => new Date(a.lease_end) - new Date(b.lease_end));

  const today = now.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" });

  // ── Build HTML sections ───────────────────────────────
  function row(label, value, color = "#EDEAE2") {
    return `<tr><td style="padding:6px 12px;color:#9095A0;font-size:12px;border-bottom:1px solid #252930;white-space:nowrap">${label}</td><td style="padding:6px 12px;color:${color};font-size:13px;border-bottom:1px solid #252930">${value}</td></tr>`;
  }

  function section(title, color, content) {
    return `
      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:600;letter-spacing:1px;color:${color};margin-bottom:8px">${title}</div>
        ${content}
      </div>`;
  }

  function ticketTable(list) {
    if (!list.length) return `<p style="color:#5C6270;font-size:12px;margin:0">None</p>`;
    const PCOL = { urgent:"#E05555", high:"#F0A430", normal:"#4A9AE8", low:"#72B02A" };
    return `<table style="width:100%;border-collapse:collapse;background:#111316;border-radius:6px;overflow:hidden">
      ${list.map(t=>`<tr>
        <td style="padding:7px 12px;font-size:13px;color:#EDEAE2;border-bottom:1px solid #252930">${t.title}</td>
        <td style="padding:7px 12px;font-size:12px;color:#9095A0;border-bottom:1px solid #252930">${t.tenants?.name||""} · Unit ${t.tenants?.units?.unit_number||"?"}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #252930"><span style="font-size:10px;font-weight:700;color:${PCOL[t.priority]||"#4A9AE8"};background:${PCOL[t.priority]||"#4A9AE8"}18;padding:2px 7px;border-radius:8px">${t.priority||"normal"}</span></td>
        <td style="padding:7px 12px;font-size:11px;color:#5C6270;border-bottom:1px solid #252930">${new Date(t.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</td>
      </tr>`).join("")}
    </table>`;
  }

  // Sections
  const sectionsHtml = [
    urgentTickets.length > 0
      ? section("🚨 URGENT / HIGH PRIORITY", "#E05555", ticketTable(urgentTickets))
      : "",
    stalledTickets.length > 0
      ? section("⏰ OPEN > 4 HOURS (needs acknowledgment)", "#F0A430", ticketTable(stalledTickets))
      : "",
    section("🔧 ALL OPEN TICKETS", "#4A9AE8",
      openTickets.length
        ? ticketTable(openTickets)
        : `<p style="color:#5C6270;font-size:12px;margin:0">No open tickets ✓</p>`
    ),
    inProgress.length > 0
      ? section("⚙️ IN PROGRESS", "#9095A0", ticketTable(inProgress))
      : "",
    awaitingTenant.length > 0
      ? section("📋 INSPECTIONS AWAITING TENANT SIGN-OFF", "#C9A96E",
          `<table style="width:100%;border-collapse:collapse;background:#111316;border-radius:6px;overflow:hidden">
          ${awaitingTenant.map(i=>`<tr>
            <td style="padding:7px 12px;font-size:13px;color:#EDEAE2;border-bottom:1px solid #252930">${i.tenants?.name||"Tenant"}</td>
            <td style="padding:7px 12px;font-size:12px;color:#9095A0;border-bottom:1px solid #252930">Unit ${i.tenants?.units?.unit_number||"?"}</td>
            <td style="padding:7px 12px;font-size:11px;color:#5C6270;border-bottom:1px solid #252930">Since ${new Date(i.inspection_date||i.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</td>
          </tr>`).join("")}
          </table>`)
      : "",
    tenantComplete.length > 0
      ? section("✍️ INSPECTIONS READY FOR MOVE-OUT", "#72B02A",
          `<table style="width:100%;border-collapse:collapse;background:#111316;border-radius:6px;overflow:hidden">
          ${tenantComplete.map(i=>`<tr>
            <td style="padding:7px 12px;font-size:13px;color:#EDEAE2;border-bottom:1px solid #252930">${i.tenants?.name||"Tenant"}</td>
            <td style="padding:7px 12px;font-size:12px;color:#9095A0;border-bottom:1px solid #252930">Unit ${i.tenants?.units?.unit_number||"?"}</td>
          </tr>`).join("")}
          </table>`)
      : "",
    expiringLeases.length > 0
      ? section("📅 LEASES EXPIRING IN 60 DAYS", "#F0A430",
          `<table style="width:100%;border-collapse:collapse;background:#111316;border-radius:6px;overflow:hidden">
          ${expiringLeases.map(t=>{
            const daysLeft = Math.ceil((new Date(t.lease_end)-now)/(1000*60*60*24));
            return `<tr>
              <td style="padding:7px 12px;font-size:13px;color:#EDEAE2;border-bottom:1px solid #252930">${t.name}</td>
              <td style="padding:7px 12px;font-size:12px;color:#9095A0;border-bottom:1px solid #252930">Unit ${t.units?.unit_number||"?"}</td>
              <td style="padding:7px 12px;font-size:12px;border-bottom:1px solid #252930"><span style="color:${daysLeft<=30?"#E05555":"#F0A430"};font-weight:600">${daysLeft} days · ${new Date(t.lease_end).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span></td>
            </tr>`;
          }).join("")}
          </table>`)
      : "",
  ].filter(Boolean).join("");

  const allClear = !urgentTickets.length && !stalledTickets.length && !openTickets.length && !awaitingTenant.length && !expiringLeases.length;

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A0B0D;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0B0D;padding:32px 20px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#111316;border:1px solid #252930;border-radius:12px;overflow:hidden;max-width:600px;width:100%">
      <tr><td style="padding:24px 28px 20px;border-bottom:1px solid #252930">
        <p style="margin:0;font-size:11px;font-weight:600;color:#5C6270;letter-spacing:0.16em">MODUS PROPERTY MANAGEMENT</p>
        <h2 style="margin:6px 0 4px;font-size:24px;font-weight:400;color:#EDEAE2;font-family:Georgia,serif">Daily Recap</h2>
        <p style="margin:0;font-size:13px;color:#5C6270">${today}</p>
      </tr></td>
      <tr><td style="padding:24px 28px">
        ${allClear
          ? `<div style="text-align:center;padding:32px 0">
               <div style="font-size:32px;margin-bottom:12px">✅</div>
               <p style="font-size:15px;color:#72B02A;font-weight:600;margin:0">All clear — no items need attention today.</p>
             </div>`
          : sectionsHtml
        }
        <div style="margin-top:24px;text-align:center">
          <a href="https://www.getmodusam.com/landlord/maintenance" style="display:inline-block;padding:11px 22px;background:#7A5C2E;color:#C9A96E;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;margin-right:8px">
            Open Tickets →
          </a>
          <a href="https://www.getmodusam.com/landlord/inspections" style="display:inline-block;padding:11px 22px;background:#181C21;color:#9095A0;border:1px solid #252930;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px">
            Inspections →
          </a>
        </div>
      </td></tr>
      <tr><td style="padding:14px 28px;border-top:1px solid #252930">
        <p style="margin:0;font-size:11px;color:#5C6270">Modus Property Management · Daily recap · <a href="https://www.getmodusam.com" style="color:#5C6270">getmodusam.com</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  // ── Send via Resend ───────────────────────────────────
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Modus Property Management <noreply@getmodusam.com>",
      to: LANDLORD_EMAIL,
      subject: allClear
        ? `✅ Daily Recap — All clear · ${today}`
        : `📋 Daily Recap — ${[urgentTickets.length&&`${urgentTickets.length} urgent`,stalledTickets.length&&`${stalledTickets.length} stalled`,expiringLeases.length&&`${expiringLeases.length} leases expiring`].filter(Boolean).join(", ")} · ${today}`,
      html,
    }),
  });

  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data });
  return res.status(200).json({ success: true, id: data.id });
}
