// supabase/functions/late-fee-cron/index.ts
// NOT SCHEDULED. Scheduling is a production change that needs separate owner approval.
// If approved, use cron "1 5 6-31 * *": cron runs in UTC, and that is 12:01 am EST / 1:01 am EDT in New York.
// The month's first run is the full assessment; later runs only re-check charges deferred for a pending payment.
// ("1 0 6 * *" would fire on the evening of the 5th in New York, and the database would refuse the run.)
//
// With receivables installed, this job only calls a2_assess_late_fees(), which uses today's New York date and
// does all the work: one $50 fee per eligible rent charge, idempotent, exemptions respected, every decision audited.
// The original logic below runs only against a database without receivables:
// What it does:
//  1. Finds all Rent rows in `payments` that are still unpaid/overdue
//  2. Inserts a $50 Late Fee row for each tenant
//  3. Marks the rent row as 'Overdue'
//  4. Sets eviction_watch = true and eviction_flagged_at = now() on tenants

import { adminClient, getCaller, isCronRequest, isLandlord } from "../_shared/security.ts";

const LATE_FEE_AMOUNT = 50;

Deno.serve(async (req: Request) => {
  try {
    const supabase = adminClient();

    // Authorization, before anything else: the scheduler (service-role key or CRON_SECRET) or a landlord.
    // The landlord check reads profiles.role on the server. A valid JWT alone is never enough: the public
    // anon key is a valid JWT, and so is every tenant's session.
    if (!isCronRequest(req) && !isLandlord(await getCaller(req, supabase))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const now = new Date();

    const { data: a2, error: a2Error } = await supabase.rpc("a2_status");
    const a2Installed = !a2Error;
    if (a2Error && a2Error.code !== "PGRST202") {   // PGRST202: the function doesn't exist (receivables not installed)
      console.error("[late-fee-cron] a2_status:", a2Error.message);
      return new Response(JSON.stringify({ error: a2Error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
    if (a2Installed && !a2?.active) {
      // Installed but no cutover date yet: there is nothing to assess, and no charge rows are ever written to payments.
      console.log("[late-fee-cron] receivables not active; nothing to do");
      return new Response(JSON.stringify({ mode: "inactive", processed: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (a2Installed) {
      const { data, error } = await supabase.rpc("a2_assess_late_fees");
      if (error) {
        console.error("[late-fee-cron] a2_assess_late_fees:", error.message);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
      const charged = (data ?? []).filter((r: { outcome: string }) => r.outcome === "late fee charged").length;
      console.log(`[late-fee-cron] receivables: ${charged} late fee(s) charged`);
      return new Response(JSON.stringify({ mode: "receivables", results: data }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // First of the current month — rent was due on this date (or earlier)
    const currentMonthFirst = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0]; // e.g. "2025-06-01"

    console.log(`[late-fee-cron] Running for cycle ending ${currentMonthFirst}`);

    // 1. Find all unpaid Rent rows
    const { data: unpaidRent, error: fetchError } = await supabase
      .from("payments")
      .select("id, tenant_id, lease_id, amount, balance_due, due_date")
      .eq("category", "Rent")
      .lte("due_date", currentMonthFirst)
      .gt("balance_due", 0)
      .in("status", ["Unpaid", "Overdue"]);

    if (fetchError) {
      console.error("[late-fee-cron] Error fetching unpaid rent:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!unpaidRent || unpaidRent.length === 0) {
      console.log("[late-fee-cron] No unpaid rent found. Nothing to do.");
      return new Response(JSON.stringify({ processed: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[late-fee-cron] Found ${unpaidRent.length} unpaid rent row(s)`);

    // Deduplicate by tenant_id — one late fee per tenant even if multiple months behind
    const seenTenants = new Set<string>();
    const uniqueRentRows = unpaidRent.filter((row) => {
      if (seenTenants.has(row.tenant_id)) return false;
      seenTenants.add(row.tenant_id);
      return true;
    });

    const results = {
      processed: 0,
      lateFeeInserted: 0,
      evictionFlagged: 0,
      errors: [] as string[],
    };

    for (const row of uniqueRentRows) {
      try {
        // 2. Skip if late fee was already charged this cycle (idempotent)
        const { data: existingFee } = await supabase
          .from("payments")
          .select("id")
          .eq("tenant_id", row.tenant_id)
          .eq("category", "Late Fee")
          .gte("due_date", currentMonthFirst)
          .maybeSingle();

        if (existingFee) {
          console.log(
            `[late-fee-cron] Late fee already exists for tenant ${row.tenant_id} — skipping`
          );
          results.processed++;
          continue;
        }

        // 3. Insert $50 Late Fee row
        const { error: feeError } = await supabase.from("payments").insert({
          tenant_id: row.tenant_id,
          lease_id: row.lease_id ?? null,
          category: "Late Fee",
          amount: LATE_FEE_AMOUNT,
          amount_cents: LATE_FEE_AMOUNT * 100,   // as in the deployed version
          balance_due: LATE_FEE_AMOUNT,
          due_date: now.toISOString().split("T")[0],
          status: "Unpaid",
          is_recurring: false,
          created_at: now.toISOString(),
        });

        if (feeError) {
          console.error(
            `[late-fee-cron] Failed to insert late fee for tenant ${row.tenant_id}:`,
            feeError
          );
          results.errors.push(`late_fee:${row.tenant_id}:${feeError.message}`);
          continue;
        }

        results.lateFeeInserted++;

        // 4. Mark rent row as Overdue
        await supabase
          .from("payments")
          .update({ status: "Overdue" })
          .eq("id", row.id);

        // 5. Flag tenant for Eviction Watch
        const { error: evictionError } = await supabase
          .from("tenants")
          .update({
            eviction_watch: true,
            eviction_flagged_at: now.toISOString(),
          })
          .eq("id", row.tenant_id);

        if (evictionError) {
          console.error(
            `[late-fee-cron] Failed to flag eviction watch for tenant ${row.tenant_id}:`,
            evictionError
          );
          results.errors.push(
            `eviction_flag:${row.tenant_id}:${evictionError.message}`
          );
        } else {
          results.evictionFlagged++;
          console.log(
            `[late-fee-cron] Eviction watch flagged for tenant ${row.tenant_id}`
          );
        }

        results.processed++;
      } catch (rowError) {
        console.error(
          `[late-fee-cron] Unexpected error for tenant ${row.tenant_id}:`,
          rowError
        );
        results.errors.push(`unexpected:${row.tenant_id}:${String(rowError)}`);
      }
    }

    console.log("[late-fee-cron] Done.", results);

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[late-fee-cron] Fatal error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});