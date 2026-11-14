// api/_lib/messageSweep.js
// Safety net for tenant messages the assistant never finished: the browser's request never reached the server, or the
// run was stopped (timeout, crash) before it wrote a reply and routing row. Without this the tenant would see no reply
// and management would only hear about it in the next daily recap.
//
// For each tenant-authored message older than MESSAGE_SWEEP_GRACE_MS with no routing row, the sweep takes the message's
// claim (messageClaim.js — the same atomic claim the route uses, so it can never race a live run or a finished one) and
// runs the route's fail-safe: an ESCALATE_LANDLORD routing row, one management email (same per-message idempotency key
// as the route), and — only if no AI reply was stored after the message — a short "passed to management" reply (with the
// fixed 911 guidance if the message describes an emergency). It never asks the AI again and never sends SMS.
// Only messages sent after MESSAGE_SWEEP_SINCE (this release) are considered, so older history is never replayed.

import { claimMessage, completeClaim } from "./messageClaim.js";

export const MESSAGE_SWEEP_SINCE = "2026-11-14T14:00:00Z";
export const MESSAGE_SWEEP_WINDOW_MS = 48 * 60 * 60 * 1000;
export const MESSAGE_SWEEP_GRACE_MS = 5 * 60 * 1000;   // well past the route's 60 s limit and the 90 s stale window
export const MESSAGE_SWEEP_MAX = 10;

export async function sweepUnansweredMessages({ db, escalate, now = () => Date.now(), tenantId = null } = {}) {
  const out = { status: "ok", checked: 0, escalated: 0, skipped: 0, failed: 0 };
  const since = new Date(Math.max(Date.parse(MESSAGE_SWEEP_SINCE), now() - MESSAGE_SWEEP_WINDOW_MS)).toISOString();
  const until = new Date(now() - MESSAGE_SWEEP_GRACE_MS).toISOString();
  try {
    let q = db.from("messages").select("id, tenant_id, sender_id, body, created_at, tenants(user_id)")
      .gte("created_at", since).lte("created_at", until).not("sender_id", "is", null);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data: msgs, error } = await q.order("created_at", { ascending: true }).limit(200);
    if (error) throw new Error(error.message || "messages load failed");
    // Tenant-authored only (management's own messages are never "unanswered").
    const mine = (msgs || []).filter((m) => m.sender_id && m.sender_id === m.tenants?.user_id);
    out.checked = mine.length;
    if (!mine.length) return out;
    const { data: logs, error: logErr } = await db.from("ai_routing_logs").select("message_id").in("message_id", mine.map((m) => m.id));
    if (logErr) throw new Error(logErr.message || "routing rows load failed");
    const answered = new Set((logs || []).map((r) => r.message_id));
    for (const m of mine) {
      if (answered.has(m.id)) continue;
      if (out.escalated + out.failed >= MESSAGE_SWEEP_MAX) { out.skipped++; continue; }
      const claim = await claimMessage(db, m.id, { now: now() });
      if (claim !== "claimed") { out.skipped++; continue; }   // busy (live run), done (finished), unavailable (no protection: don't risk a duplicate)
      try {
        const { data: after } = await db.from("messages").select("id").eq("tenant_id", m.tenant_id).is("sender_id", null)
          .gte("created_at", m.created_at).limit(1);
        const r = await escalate({ tenantId: m.tenant_id, messageId: m.id, message: m.body, replyAttempted: Array.isArray(after) && after.length > 0 });
        if (r?.logId) out.escalated++; else out.failed++;
      } catch (e) {
        console.error("[message-sweep] escalation failed:", e?.message || e);
        out.failed++;
      } finally {
        await completeClaim(db, m.id, { now: now() });
      }
    }
  } catch (e) {
    console.error("[message-sweep] failed:", e?.message || e);
    return { ...out, status: "failed" };
  }
  if (out.escalated || out.failed) console.log("[message-sweep]", JSON.stringify(out));
  return out;
}
