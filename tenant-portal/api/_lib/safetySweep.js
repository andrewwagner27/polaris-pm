// api/_lib/safetySweep.js
// One entry point for the two safety nets, so they run from many places instead of only when management opens a page:
//   - new-ticket alerts a tenant's browser never delivered (maintenanceNotify.sweepMissedTicketAlerts; email only)
//   - tenant messages the assistant never finished (messageSweep.sweepUnansweredMessages; escalates to management)
// Triggered by: the daily recap cron, any landlord page load (LandlordLayout), and any tenant page load (TenantLayout,
// scoped to that tenant's own tickets and messages). Both nets are idempotent and claim-protected, so overlapping runs
// never send twice. Never sends SMS, never asks the AI, never dispatches a vendor.

import { sweepMissedTicketAlerts } from "./maintenanceNotify.js";
import { sweepUnansweredMessages } from "./messageSweep.js";

async function escalator(db, send) {
  // Loaded on demand: the route module creates the OpenAI client at import time.
  const { failSafeEscalation } = await import("../classify-and-route.js");
  return (args) => failSafeEscalation({ ...args, db, send });
}

export async function runSafetySweeps({ db, send, env, tenantId = null, now, retryDelayMs, escalate = null }) {
  const out = { tickets: null, messages: null };
  try {
    out.tickets = await sweepMissedTicketAlerts({ db, send, env, tenantId, now, retryDelayMs });
  } catch (e) {
    console.error("[safety-sweep] tickets failed:", e?.message || e);
    out.tickets = { status: "failed" };
  }
  try {
    out.messages = await sweepUnansweredMessages({ db, escalate: escalate || await escalator(db, send), tenantId, now });
  } catch (e) {
    console.error("[safety-sweep] messages failed:", e?.message || e);
    out.messages = { status: "failed" };
  }
  return out;
}

// /api/notify event "safety_sweep": management sweeps everything; a tenant only their own active tenant record.
export async function safetySweep({ db, send, env, caller, retryDelayMs, escalate, now }) {
  let tenantId = null;
  if (caller?.role !== "landlord") {
    const { data, error } = await db.from("tenants").select("id").eq("user_id", caller?.user?.id || "").not("archived", "is", true).limit(1);
    if (error) return { status: "failed" };
    tenantId = data?.[0]?.id || null;
    if (!tenantId) return { status: "ok", scope: "none" };
  }
  const r = await runSafetySweeps({ db, send, env, tenantId, retryDelayMs, escalate, now });
  return {
    status: "ok", scope: tenantId ? "tenant" : "all",
    tickets: { sent: r.tickets?.sent || 0, failed: r.tickets?.failed || 0 },
    messages: { escalated: r.messages?.escalated || 0, failed: r.messages?.failed || 0 },
  };
}
