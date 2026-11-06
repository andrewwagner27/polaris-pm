// rent-reminders/index.ts
// Invoked by Supabase cron (job 2) on the 1st of each month at 9 AM America/New_York.
// Sends each active tenant with rent to pay one "rent is due today" email; any other date sends nothing.
// The amount comes from the receivables ledger through a3_pay_rent_internal, the same figure as Pay Rent.
// Each run first generates any scheduled charges due (idempotent), so charges always exist before the ledger is read.
// Deploying this therefore makes the existing cron job generate rent charges monthly: the owner must approve that knowingly.
// Requires A1, A2, A3 and a receivables cutover: do not deploy this before them (see releases/rent-reminder-ledger-fix/).
// Auth: caller must send "Authorization: Bearer <service_role key>" or "x-cron-secret: <CRON_SECRET>".
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
    generateCharges: async (asOf) => {
      const { data, error } = await supabase.rpc("a2_generate_charges", { p_as_of: asOf });
      if (error) throw new Error("Charge generation failed: " + error.message);
      return data || [];
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
      const { data, error } = await supabase.rpc("a3_pay_rent_internal", { p_tenant: tenantId });
      if (error) throw new Error("DB error: " + error.message);
      return data;
    },
    sendEmail,
  });
});
