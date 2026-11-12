// /api/classify-and-route.js
// Modus PM — Autonomous Property Manager Reasoning Engine v4
// Human-tone rewrite: no hallucinated rent context, match-the-input behavior
// 4-Tier Escalation: EMERGENCY | TENANT_DAMAGE | MAINTENANCE | DISPUTE
// Accepts: POST { message: string, tenant_id: string, message_id?: string }
// Requires: Authorization: Bearer <Supabase session JWT> of the tenant who owns tenant_id (or a landlord)

import OpenAI from "openai";
import { supabaseAdmin as supabase, requireCaller, isLandlord } from "./_lib/auth.js";
import { dispatchVendor } from "./_lib/dispatchVendor.js";
import { buildRoutingLogRow } from "./_lib/routingLog.js";
import { buildSystemPrompt } from "./_lib/aiPrompt.js";
import { AI_ASSISTANT_NAME, buildRentContext, applySafetyOverrides, wantsHuman, detectEmergency, FLAGGED_LINE } from "./_lib/aiSafety.js";
import { sendEmail } from "./_lib/email.js";
import { notifyEscalation } from "./_lib/escalationNotify.js";

// Bounded so a slow model fails into the fallback escalation below instead of outliving the function
// (the SDK default is a 10-minute timeout with 2 retries, longer than any Vercel function may run).
export const OPENAI_TIMEOUT_MS = 20000;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: OPENAI_TIMEOUT_MS, maxRetries: 0 });

// AI replies are attributed to the Modus AI assistant (aiSafety.js): no named staff personas,
// no stock photos and no artificial "human-feeling" delay.

// ── Structured Output Schema ────────────────────────────────
const CLASSIFICATION_SCHEMA = {
  name: "property_triage",
  strict: true,
  schema: {
    type: "object",
    properties: {
      tier: {
        type: "string",
        enum: ["TIER1_EMERGENCY", "TIER2_TENANT_DAMAGE", "TIER3_MAINTENANCE", "TIER4_DISPUTE"],
        description: "Escalation tier based on issue type and severity"
      },
      category: {
        type: "string",
        enum: ["EMERGENCY", "HABITABILITY", "TENANT_DAMAGE", "APPLIANCE", "PLUMBING", "HVAC", "ELECTRICAL", "PEST", "LOCK", "NOISE_COMPLAINT", "PARKING_DISPUTE", "LEASE_VIOLATION", "TRASH", "GENERAL_INQUIRY", "GREETING", "PAYMENT", "LEASE_LEGAL"],
        description: "Specific issue category"
      },
      confidence: {
        type: "number",
        description: "Classification confidence 0.0-1.0"
      },
      urgency: {
        type: "string",
        enum: ["LOW", "MEDIUM", "HIGH", "EMERGENCY"]
      },
      intent_summary: {
        type: "string",
        description: "One sentence summary of what the tenant needs"
      },
      tenant_reply: {
        type: "string",
        description: "Your complete reply TO the tenant. Match the tone to the input — casual greeting gets a casual reply, serious issue gets a professional reply. Write naturally, like a property manager texting a tenant. Never mention the landlord's name. Sign as Modus Property Management only when the message is formal/substantive."
      },
      missing_info: {
        type: "array",
        items: { type: "string" },
        description: "Info still needed before full resolution. Empty array if nothing missing."
      },
      billable_to_tenant: {
        type: "boolean",
        description: "True if damage or issue was caused by tenant (e.g. clogged drain, pet damage, broken window from inside)"
      },
      create_maintenance_ticket: {
        type: "boolean",
        description: "Almost always FALSE. Only true for TIER1_EMERGENCY requiring immediate vendor dispatch. Never auto-create tickets — direct tenants to submit through the Modus portal."
      },
      create_incident_log: {
        type: "boolean",
        description: "True if an incident_logs record should be created (disputes, violations, tenant damage)"
      },
      send_violation_notice: {
        type: "boolean",
        description: "Always false. The assistant never issues violation notices; management reviews every complaint."
      },
      offending_unit_hint: {
        type: "string",
        description: "Unit number of the offending party if mentioned, otherwise empty string"
      },
      dispatch_vendor: {
        type: "boolean",
        description: "True if this maintenance issue should be dispatched to the vendor queue"
      },
      escalate_to_landlord: {
        type: "boolean",
        description: "True if this requires human landlord involvement"
      }
    },
    required: [
      "tier", "category", "confidence", "urgency", "intent_summary",
      "tenant_reply", "missing_info", "billable_to_tenant",
      "create_maintenance_ticket", "create_incident_log",
      "send_violation_notice", "offending_unit_hint",
      "dispatch_vendor", "escalate_to_landlord"
    ],
    additionalProperties: false
  }
};

// System prompt: api/_lib/aiPrompt.js (building facts only for the tenant's own property; no access codes).

// ── Main handler ───────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const caller = await requireCaller(req, res);
  if (!caller) return;

  const { tenant_id, message_id } = req.body || {};
  let message = req.body?.message;

  if (!message || !tenant_id) {
    return res.status(400).json({ error: "message and tenant_id are required" });
  }

  // ── 0. Authorization: caller must own this tenant record ─
  const { data: owner } = await supabase
    .from("tenants")
    .select("id, user_id")
    .eq("id", tenant_id)
    .maybeSingle();

  if (!owner) return res.status(404).json({ error: "Tenant not found" });
  if (!isLandlord(caller) && owner.user_id !== caller.user.id) {
    return res.status(403).json({ error: "Not authorized for this tenant" });
  }

  // If a message_id is supplied it must belong to this tenant thread; use the stored body
  if (message_id) {
    const { data: storedMsg } = await supabase
      .from("messages")
      .select("id, tenant_id, sender_id, body")
      .eq("id", message_id)
      .maybeSingle();
    if (!storedMsg || storedMsg.tenant_id !== tenant_id ||
        (!isLandlord(caller) && storedMsg.sender_id !== caller.user.id)) {
      return res.status(403).json({ error: "Message does not belong to this tenant" });
    }
    message = storedMsg.body;

    // Idempotent per message once processing has COMPLETED: a repeated request (double submit, manual
    // resend) for a message that already has a routing row writes no second AI reply, alert or row.
    // If that message's management email "failed" or is "unconfirmed", the repeat replays the stored
    // payload under the same key: Resend sends it once, or returns the original response if it was
    // already accepted. Requests that overlap an IN-PROGRESS run are not caught here (no atomic claim
    // without a migration); the browser therefore never retries automatically. See docs/comms-remediation.
    const { data: done } = await supabase.from("ai_routing_logs")
      .select("id, message_id, action_taken, detected_intent, detected_category, urgency, raw_openai_response").eq("message_id", message_id);
    if (Array.isArray(done) && done.length) {
      // The row that owns the notification (not one marked as a duplicate of another).
      const prior = done.find((r) => r.raw_openai_response?.notify?.status && r.raw_openai_response.notify.status !== "duplicate") || done[0];
      const status = prior.raw_openai_response?.notify?.status;
      let notification = status ? (status === "sent" || status === "duplicate" ? "duplicate" : status) : "not_required";
      const classification = {
        tier: prior.raw_openai_response?.tier, category: prior.detected_category, urgency: prior.urgency,
        intent_summary: prior.detected_intent, escalate_to_landlord: prior.action_taken === "ESCALATE_LANDLORD",
      };
      // Only a recorded failure or unconfirmed send is retried: rows with no outcome (older than Release B)
      // are never replayed, and the emergency SMS is never re-sent (escalationNotify.claimAndSendSms).
      if (status === "failed" || status === "unconfirmed") {
        const { data: tenant } = await supabase.from("tenants")
          .select("id, name, unit_id, user_id, units(unit_number, property_id, properties(id, name))").eq("id", tenant_id).maybeSingle();
        notification = (await notifyEscalation({
          db: supabase, send: sendEmail, log: prior, tenant, message, classification, messageId: message_id,
          humanRequested: wantsHuman(message), reply: "(Already answered — see the Messages thread for the AI reply.)",
        })).status;
      }
      return res.status(200).json({ duplicate: true, log_id: prior.id, escalated: classification.escalate_to_landlord, notification });
    }
  }

  let replyAttempted = false;
  try {
    // ── 1. Load tenant info ──────────────────────────────────
    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .select("id, name, unit_id, user_id, units(unit_number, property_id, rent_amount, payment_due_day, properties(id, name))")
      .eq("id", tenant_id)
      .single();

    if (tenantErr) console.error("Tenant load error:", tenantErr);

    // ── 1b. Rent status: only from the active A2 receivables ledger ──
    // The legacy rent_payments table is not consulted. Inactive ledger, an error, or nothing
    // past due → no payment-status context, so the AI cannot claim arrears it can't confirm.
    const { data: due, error: dueErr } = await supabase.rpc("a2_pay_rent_internal", { p_tenant: tenant_id });
    if (dueErr) console.error("Rent ledger lookup error:", dueErr.message);
    const rentContext = buildRentContext(dueErr ? null : due);

    // ── 2. Load last 10 messages for thread context ──────────
    const { data: threadMessages } = await supabase
      .from("messages")
      .select("sender_id, body, created_at")
      .eq("tenant_id", tenant_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const threadContext = (threadMessages || [])
      .reverse()
      .map((m) => {
        const role = m.sender_id === null ? "Management" : "Tenant";
        return `[${role}]: ${m.body}`;
      })
      .join("\n");

    // ── 3. Call OpenAI with structured output ────────────────
    let classification = null;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.3,
        max_tokens: 600,
        response_format: {
          type: "json_schema",
          json_schema: CLASSIFICATION_SCHEMA,
        },
        messages: [
          { role: "system", content: buildSystemPrompt(tenant?.units?.properties) },
          {
            role: "user",
            content: `Property: ${tenant?.units?.properties?.name || "Unknown"}
Unit: ${tenant?.units?.unit_number || "Unknown"}
Tenant name: ${tenant?.name || "Resident"}
${rentContext ? `\n${rentContext}` : ""}

Recent conversation:
${threadContext || "(no prior messages)"}

New tenant message: "${message}"

Classify and reply. Match your tone to the message — a greeting gets a greeting, an issue gets a professional response. Do not repeat the tenant's message in your reply.`,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content?.trim();
      classification = JSON.parse(raw);
    } catch (aiErr) {
      console.error("OpenAI error:", aiErr);
      classification = {
        tier: "TIER4_DISPUTE",
        category: "GENERAL_INQUIRY",
        confidence: 0.2,
        urgency: "MEDIUM",
        intent_summary: "AI classification unavailable — escalated for human review",
        tenant_reply: "Thanks for reaching out — I've flagged this for our management team and someone will follow up with you directly.",
        missing_info: [],
        billable_to_tenant: false,
        create_maintenance_ticket: false,
        create_incident_log: false,
        send_violation_notice: false,
        offending_unit_hint: "",
        dispatch_vendor: false,
        escalate_to_landlord: true,
        ai_unavailable: true,
      };
    }

    // ── 4. Safety overrides (no violation notices; complaints and human requests escalate) ──
    classification = applySafetyOverrides(classification, message);

    // ── 4b. Send tenant reply ────────────────────────────────
    const finalReply = classification?.tenant_reply || "Thanks for reaching out — management has been notified and will follow up shortly.";

    replyAttempted = true;
    const { error: replyErr } = await supabase.from("messages").insert({
      sender_id: null,
      recipient_id: tenant?.user_id || null,
      tenant_id: tenant_id,
      body: finalReply,
      read: false,
      agent_name: AI_ASSISTANT_NAME,
      agent_photo: null,
    });

    if (replyErr) console.error("Tenant reply insert error:", replyErr);

    // ── 5. Create maintenance ticket (emergencies only) ──────
    let ticketId = null;

    if (classification.create_maintenance_ticket) {
      const { data: ticket, error: ticketErr } = await supabase
        .from("maintenance_requests")
        .insert({
          title: classification.intent_summary,
          tenant_id: tenant_id,
          unit_id: tenant?.unit_id || null,
          description: message,
          status: "open",
          priority: classification.urgency === "EMERGENCY" || classification.urgency === "HIGH" ? "urgent" : "normal",
          ai_generated: true,
          ai_intent_summary: classification.intent_summary,
          billable_to_tenant: classification.billable_to_tenant,
          is_emergency: classification.tier === "TIER1_EMERGENCY",
        })
        .select()
        .single();

      if (ticketErr) {
        console.error("Maintenance ticket error:", ticketErr);
      } else {
        ticketId = ticket?.id;
      }

      if (classification.dispatch_vendor && ticketId) {
        try {
          await dispatchVendor({
            ticket_id: ticketId,
            description: message,
            unit: tenant?.units?.unit_number,
            property: tenant?.units?.properties?.name,
          });
        } catch (dispatchErr) {
          console.warn("Vendor dispatch failed (non-fatal):", dispatchErr.message);
        }
      }
    }

    // ── 6. Create incident log ───────────────────────────────
    let incidentId = null;

    if (classification.create_incident_log) {
      let offendingUnitId = null;
      if (classification.offending_unit_hint) {
        // Exact match only (a partial match turned "1" into units 10, 11 or 12). Recorded for
        // management's review; nothing is ever sent to the other unit.
        const { data: offendingUnit } = await supabase
          .from("units")
          .select("id")
          .eq("property_id", tenant?.units?.property_id)
          .eq("unit_number", String(classification.offending_unit_hint).trim())
          .maybeSingle();
        offendingUnitId = offendingUnit?.id || null;
      }

      const incidentCategory = [
        "NOISE_COMPLAINT", "PARKING_DISPUTE", "LEASE_VIOLATION", "TENANT_DAMAGE", "TRASH"
      ].includes(classification.category)
        ? classification.category
        : "OTHER";

      const { data: incident, error: incidentErr } = await supabase
        .from("incident_logs")
        .insert({
          tenant_id: tenant_id,
          property_id: tenant?.units?.properties?.id || null,
          offending_unit_id: offendingUnitId,
          category: incidentCategory,
          status: "open",   // management decides on any notice; the AI never sends one
          details_json: {
            original_message: message,
            intent_summary: classification.intent_summary,
            missing_info: classification.missing_info,
            offending_unit_hint: classification.offending_unit_hint || null,
            ai_tier: classification.tier,
            message_id: message_id || null,
          },
        })
        .select()
        .single();

      if (incidentErr) {
        console.error("Incident log error:", incidentErr);
      } else {
        incidentId = incident?.id;
      }
      // No automatic violation notice: the incident is escalated (applySafetyOverrides) and
      // management decides whether any notice is warranted.
    }

    // ── 7. Landlord alert (emergencies and escalations). The email goes out in step 10,
    //       after the escalation is recorded, through the same notifier for both.
    if (classification.tier === "TIER1_EMERGENCY" || classification.escalate_to_landlord) {
      await supabase.from("landlord_alerts").insert({
        type: classification.tier === "TIER1_EMERGENCY" ? "emergency" : "ai_escalation",
        category: classification.category,
        tenant_id: tenant_id,
        message_id: message_id || null,
        urgency: classification.urgency,
        summary: classification.intent_summary,
        raw_message: message,
        is_read: false,
      }).then(({ error }) => { if (error) console.error("Landlord alert error:", error); });
    }

    // (Former step 8 removed: messaging no longer creates late-rent alerts or late fees.
    //  Arrears and fees belong to the A2 receivables ledger and its own jobs.)

    // ── 9. Log routing decision ──────────────────────────────
    // Agent Center reads only this table; the row must match its columns exactly (see routingLog.js).
    // One retry: a failed insert would hide the escalation from the Agent Center and the recap.
    // If both attempts fail the notifier still emails management, and the email says the row is missing.
    const logEntry = await insertRoutingLog(buildRoutingLogRow({ classification, tenantId: tenant_id, messageId: message_id, ticketId, message }));

    // ── 10. Notify management of this escalation (once per tenant message; never throws) ──
    // Runs after the tenant reply, alert and routing log are written, so an email failure
    // cannot lose either. Only this new escalation is notified; older rows are never replayed.
    let notification = { status: "not_required" };
    try {
      notification = await notifyEscalation({
        db: supabase, send: sendEmail, log: logEntry || null, tenant, message, reply: finalReply,
        classification, messageId: message_id || null, humanRequested: wantsHuman(message),
      });
    } catch (notifyErr) {
      console.error("Escalation notification error:", notifyErr);
      notification = { status: "failed" };
    }

    // ── 11. Return result ────────────────────────────────────
    return res.status(200).json({
      tier: classification.tier,
      category: classification.category,
      urgency: classification.urgency,
      confidence: classification.confidence,
      intent_summary: classification.intent_summary,
      tenant_reply: finalReply,
      missing_info: classification.missing_info,
      ticket_id: ticketId,
      incident_id: incidentId,
      escalated: classification.escalate_to_landlord,
      log_id: logEntry?.id || null,
      notification: notification.status,
    });

  } catch (err) {
    console.error("Reasoning engine error:", err);
    // The tenant's message is already stored. Never let it disappear: record it as an escalation,
    // notify management, and (if no reply was written yet) tell the tenant a person will read it.
    const fallback = await failSafeEscalation({ tenantId: tenant_id, messageId: message_id || null, message, replyAttempted });
    return res.status(500).json({ error: "The assistant could not process this message", escalated: true, notification: fallback.status, log_id: fallback.logId });
  }
}

// ── Failure handling ─────────────────────────────────────────

async function insertRoutingLog(row, db = supabase) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { data, error } = await db.from("ai_routing_logs").insert(row).select().single();
      if (!error && data) return data;
      console.error(`Routing log error (attempt ${attempt}):`, error?.message || error);
    } catch (e) {
      console.error(`Routing log error (attempt ${attempt}):`, e?.message || e);
    }
  }
  return null;
}

// Last resort when processing threw after the tenant's message was stored. Never throws.
// Records an ESCALATE_LANDLORD routing row, emails management (same notifier, same per-message key,
// so it cannot duplicate an email the normal path already sent), and gives the tenant a reply that
// claims nothing beyond "passed to management" — with the fixed 911 guidance for an emergency.
export async function failSafeEscalation({ tenantId, messageId, message, replyAttempted, db = supabase, send = sendEmail }) {
  try {
    const emergency = detectEmergency(message);
    const classification = {
      tier: emergency ? "TIER1_EMERGENCY" : "TIER4_DISPUTE", category: "GENERAL_INQUIRY", confidence: 0,
      urgency: emergency ? "EMERGENCY" : "MEDIUM", intent_summary: "AI processing failed — tenant message needs a person",
      escalate_to_landlord: true, create_maintenance_ticket: false, ai_unavailable: true,
      ...(emergency ? { emergency_kind: emergency.kind, life_safety: emergency.lifeSafety } : {}),
    };
    const reply = emergency
      ? [emergency.guidance, FLAGGED_LINE].join("\n\n")
      : "Thanks for your message. I couldn't process it automatically, so I've passed it to Modus management to read.";
    const { data: tenant } = await db.from("tenants")
      .select("id, name, unit_id, user_id, units(unit_number, property_id, properties(id, name))")
      .eq("id", tenantId).maybeSingle();
    if (!replyAttempted) {
      const { error } = await db.from("messages").insert({
        sender_id: null, recipient_id: tenant?.user_id || null, tenant_id: tenantId, body: reply,
        read: false, agent_name: AI_ASSISTANT_NAME, agent_photo: null,
      });
      if (error) console.error("Fallback reply insert error:", error.message || error);
    }
    const log = await insertRoutingLog(buildRoutingLogRow({ classification, tenantId, messageId, ticketId: null, message }), db);
    const notify = await notifyEscalation({
      db, send, log, tenant, message, classification, messageId, humanRequested: wantsHuman(message),
      reply: replyAttempted ? "(The AI reply could not be confirmed — check the Messages thread.)" : reply,
    });
    return { status: notify.status, logId: log?.id || null };
  } catch (e) {
    console.error("Fallback escalation failed:", e?.message || e);
    return { status: "failed", logId: null };
  }
}
