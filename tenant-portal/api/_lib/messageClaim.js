// api/_lib/messageClaim.js
// One AI run per tenant message (migration 20261114120000_ai_message_claims.sql).
//
// claimMessage → "claimed"      this request owns the message: process it
//                "busy"         another request is processing it right now: do nothing (no second reply or alert)
//                "unavailable"  the claims table isn't there yet, or the claim couldn't be checked: process as before
//                               (the existing "already answered?" check still applies)
// A claim older than STALE_MS (a run that crashed or timed out) is taken over atomically, so a failure never blocks
// a message permanently; the later "already answered?" check still prevents a second reply after a completed run.

export const STALE_MS = 90 * 1000; // longer than one route run (OpenAI timeout + inserts + email)

const MISSING = new Set(["42P01", "PGRST205"]);

export async function claimMessage(db, messageId, { now = Date.now() } = {}) {
  if (!messageId) return "unavailable";
  try {
    const { error } = await db.from("ai_message_claims").insert({ message_id: messageId, claimed_at: new Date(now).toISOString() });
    if (!error) return "claimed";
    if (MISSING.has(error.code)) return "unavailable";
    if (error.code !== "23505") {
      console.error("[message-claim] claim failed:", error.message || error);
      return "unavailable";
    }
    // Someone holds it. Take it over only if that claim is stale; the condition makes the takeover atomic.
    const cutoff = new Date(now - STALE_MS).toISOString();
    const { data: taken, error: takeErr } = await db.from("ai_message_claims")
      .update({ claimed_at: new Date(now).toISOString() })
      .eq("message_id", messageId)
      .lt("claimed_at", cutoff)
      .select("message_id");
    if (takeErr) {
      console.error("[message-claim] takeover failed:", takeErr.message || takeErr);
      return "busy";
    }
    return Array.isArray(taken) && taken.length ? "claimed" : "busy";
  } catch (e) {
    console.error("[message-claim] claim failed:", e?.message || e);
    return "unavailable";
  }
}
