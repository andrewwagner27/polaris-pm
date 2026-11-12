// rent-reminders/index.ts
// Invoked by Supabase cron (job 2, rent-reminders-daily — PAUSED) on the 1st of each month at 9 AM
// America/New_York. Sends each active tenant with rent due on the ledger one "rent is due today" email.
//
// NOT DEPLOYED. Replaces the deployed version that emailed unit rent / recurring-charge settings as the
// amount due. Before deploying, follow docs/comms-remediation/RENT_REMINDERS.md: it is safe to deploy while
// receivables are inactive (it sends nothing), but the cron job stays paused until the activation steps.
//
// Read-only: it calls only a2_status (via a2_settings), tenant_charges (count), tenants (select) and
// a2_pay_rent_internal (STABLE). It never calls a2_generate_charges or writes any table.
// Auth: caller must send "Authorization: Bearer <service_role key>" or "x-cron-secret: <CRON_SECRET>".
// ENV: RENT_REMINDERS_ENABLED must be "true" or nothing is sent (second gate after the paused cron job).
// Logic lives in handler.ts (unit tested); this file wires the real Supabase / Resend deps.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isCronRequest } from "../_shared/security.ts";
import { handleRentReminders, type Tenant } from "./handler.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL           = "Modus Property Management <notifications@getmodusam.com>";
const RESEND_API_KEY       = Deno.env.get("RESEND_API_KEY")!;

// Resend de-duplicates requests that reuse an Idempotency-Key for 24 hours, so a repeated
// invocation on the 1st cannot deliver a second reminder to the same tenant.
async function sendEmail(to: string, subject: string, html: string, idempotencyKey: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  return res.ok;
}

serve((req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  return handleRentReminders(req, {
    isAuthorized: isCronRequest,
    enabled: Deno.env.get("RENT_REMINDERS_ENABLED") === "true",
    receivablesActive: async () => {
      const { data, error } = await supabase.from("a2_settings").select("cutover_date").limit(1).maybeSingle();
      if (error) throw new Error("DB error: " + error.message);
      return !!data?.cutover_date;
    },
    rentChargesGenerated: async (firstOfMonth) => {
      const { count, error } = await supabase
        .from("tenant_charges")
        .select("id", { count: "exact", head: true })
        .eq("source", "schedule")
        .eq("due_date", firstOfMonth);
      if (error) throw new Error("DB error: " + error.message);
      return (count ?? 0) > 0;
    },
    loadTenants: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, email, lease_start, lease_end")
        .not("email", "is", null);
      if (error) throw new Error("DB error: " + error.message);
      return (data || []) as Tenant[];
    },
    loadRentDue: async (tenantId) => {
      const { data, error } = await supabase.rpc("a2_pay_rent_internal", { p_tenant: tenantId });
      if (error) throw new Error("DB error: " + error.message);
      return data;
    },
    sendEmail,
  });
});
