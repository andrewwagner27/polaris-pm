// api/generate-charges.js
// Vercel cron: runs at 13:00 UTC (8 AM ET) on the 1st of each month, BEFORE autopay-collect.
// Materialises tenant_charges rows from recurring_charges for every active schedule.
// Idempotent: the SQL function uses UNIQUE(schedule_id, period) — safe to retry.

import { rejectIfIsolated } from "./_lib/deployEnv.js";
import { supabaseAdmin as supabase } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (rejectIfIsolated(res)) return;
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).end();

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers["authorization"] !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { data, error } = await supabase.rpc("a2_generate_charges");

  if (error) {
    console.error("[generate-charges] RPC failed:", error.message);
    return res.status(500).json({ error: error.message });
  }

  const rows = Array.isArray(data) ? data : [];
  const inserted = rows.filter(r => r.outcome === "inserted").length;
  const skipped  = rows.filter(r => r.outcome === "skipped").length;
  const errors   = rows.filter(r => r.outcome === "error").length;

  console.log("[generate-charges]", { inserted, skipped, errors, total: rows.length });
  return res.status(200).json({ ok: true, inserted, skipped, errors, rows });
}
