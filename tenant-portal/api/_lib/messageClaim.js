// api/_lib/messageClaim.js
// One AI run per tenant message (migration 20261114120000_ai_message_claims.sql).
//
// claimMessage → "claimed"      this request owns the message: process it, then call completeClaim
//                "busy"         another request is processing it right now: do nothing (no second reply or alert)
//                "done"         a run already finished for this message: never process it again
//                "unavailable"  the claims table isn't there, or the claim couldn't be checked: the route still answers
//                               (the "already answered?" check still applies) but logs [message-claim] loudly and records
//                               claim:"unavailable" on the routing row, so a missing migration is visible, not silent.
//
// A claim is taken over only when it is NOT completed and older than STALE_MS. STALE_MS is longer than the route's
// hard limit (vercel.json maxDuration for api/classify-and-route.js), so a run that is still legitimately executing
// can never lose its claim: by the time a claim is stale, its run has been stopped by the platform.

export const STALE_MS = 90 * 1000;
export const ROUTE_MAX_DURATION_S = 60; // must match vercel.json functions["api/classify-and-route.js"].maxDuration

const MISSING = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

function unavailable(reason) {
  console.error(`[message-claim] UNAVAILABLE (${reason}) — duplicate-reply protection is OFF for this request; check migration 20261114120000`);
  return "unavailable";
}

export async function claimMessage(db, messageId, { now = Date.now() } = {}) {
  if (!messageId) return "unavailable";
  try {
    const { error } = await db.from("ai_message_claims").insert({ message_id: messageId, claimed_at: new Date(now).toISOString() });
    if (!error) return "claimed";
    if (MISSING.has(error.code)) return unavailable(`table missing: ${error.code}`);
    if (error.code !== "23505") return unavailable(`insert failed: ${error.message || error.code}`);
    // Someone holds it. Take it over only if that claim is unfinished AND stale; the conditions make it atomic.
    const cutoff = new Date(now - STALE_MS).toISOString();
    const { data: taken, error: takeErr } = await db.from("ai_message_claims")
      .update({ claimed_at: new Date(now).toISOString() })
      .eq("message_id", messageId)
      .is("completed_at", null)
      .lt("claimed_at", cutoff)
      .select("message_id");
    if (takeErr) {
      console.error("[message-claim] takeover failed:", takeErr.message || takeErr);
      return "busy";
    }
    if (Array.isArray(taken) && taken.length) return "claimed";
    const { data: held } = await db.from("ai_message_claims").select("completed_at").eq("message_id", messageId).maybeSingle();
    return held?.completed_at ? "done" : "busy";
  } catch (e) {
    return unavailable(`error: ${e?.message || e}`);
  }
}

// Marks the run finished (reply and routing row written, or the fail-safe ran). A completed claim is never taken
// over, so the message is never answered twice — even if its routing row could not be written. Never throws.
export async function completeClaim(db, messageId, { now = Date.now() } = {}) {
  if (!messageId) return false;
  try {
    const { error } = await db.from("ai_message_claims").update({ completed_at: new Date(now).toISOString() }).eq("message_id", messageId);
    if (error) { console.error("[message-claim] complete failed:", error.message || error); return false; }
    return true;
  } catch (e) {
    console.error("[message-claim] complete failed:", e?.message || e);
    return false;
  }
}
