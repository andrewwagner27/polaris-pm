import { rejectIfIsolated } from "./_lib/deployEnv.js";
import { supabaseAdmin as supabase } from "./_lib/auth.js";
import { sendEmailReliably } from "./_lib/email.js";
import { escapeHtml } from "../src/lib/emailSafety.js";

export default async function handler(req, res) {
  if (rejectIfIsolated(res)) return;
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).end();

  // Allow Vercel cron (Authorization header) or manual trigger with CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers["authorization"];
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Only run on the 5th (New York time). Cron fires at 14:00 UTC = 9 AM ET.
  // Allow a manual override via ?force=true for testing.
  const nyDate = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", day: "numeric" });
  if (nyDate !== "5" && req.query.force !== "true") {
    return res.status(200).json({ skipped: true, reason: `Not the 5th (today is the ${nyDate})` });
  }

  const month = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit" });

  // Get all active tenants with an email
  const { data: tenants, error: tenantsError } = await supabase
    .from("tenants")
    .select("id, name, email")
    .eq("status", "active")
    .not("email", "is", null);

  if (tenantsError) {
    console.error("[late-rent-reminder] tenants query failed:", tenantsError.message);
    return res.status(500).json({ error: "Failed to load tenants" });
  }

  const results = { sent: 0, skipped: 0, errors: 0 };

  for (const tenant of tenants || []) {
    try {
      const { data: due } = await supabase.rpc("a2_pay_rent_internal", { p_tenant: tenant.id });

      // Only email if there's an unpaid balance and online payments are available
      if (!due?.ledger_active || !due?.online_available || !(Number(due.payable_cents) > 0)) {
        results.skipped++;
        continue;
      }

      const dollars = (Number(due.payable_cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
      const firstName = (tenant.name || "Resident").split(" ")[0];

      await sendEmailReliably({
        to: tenant.email,
        subject: `Rent reminder — $${dollars} still due`,
        idempotencyKey: `late-rent-reminder/${month}/${tenant.id}`,
        html: `
          <div style="background:#0A0B0D;padding:32px 20px;font-family:'Helvetica Neue',sans-serif;">
            <div style="background:#111316;border:1px solid #252930;border-radius:12px;max-width:560px;margin:0 auto;overflow:hidden;">
              <div style="padding:24px 32px 20px;border-bottom:1px solid #252930;">
                <p style="margin:0;font-size:11px;font-weight:600;color:#5C6270;letter-spacing:0.16em;text-transform:uppercase;">MODUS PROPERTY MANAGEMENT</p>
                <h2 style="margin:8px 0 0;font-size:22px;font-weight:400;color:#EDEAE2;font-family:Georgia,serif;">Rent Reminder</h2>
              </div>
              <div style="padding:24px 32px;">
                <p style="color:#9095A0;font-size:14px;margin:0 0 20px;">Hi ${escapeHtml(firstName)}, this is a reminder that your rent payment hasn't been received yet this month.</p>
                <div style="background:#181C21;border-radius:8px;padding:16px;margin-bottom:20px;">
                  <div style="display:flex;justify-content:space-between;padding:8px 0;">
                    <span style="font-size:13px;color:#9095A0;">Balance due</span>
                    <span style="font-size:14px;font-weight:600;color:#E05252;">$${dollars}</span>
                  </div>
                </div>
                <p style="color:#9095A0;font-size:13px;margin:0 0 24px;">Please log in to pay online or contact your property manager if you have questions.</p>
                <a href="https://getmodusam.com/pay" style="display:inline-block;padding:12px 24px;background:#7A5C2E;color:#C9A96E;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;">Pay rent →</a>
              </div>
              <div style="padding:16px 32px;border-top:1px solid #252930;">
                <p style="margin:0;font-size:11px;color:#5C6270;">Modus Property Management · Lakewood, OH</p>
              </div>
            </div>
          </div>
        `,
      });

      results.sent++;
    } catch (err) {
      console.error(`[late-rent-reminder] error for tenant ${tenant.id}:`, err.message);
      results.errors++;
    }
  }

  console.log("[late-rent-reminder]", results);
  return res.status(200).json({ ok: true, ...results });
}
