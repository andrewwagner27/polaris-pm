// /api/classify-and-route.js
// Modus PM — AI Message Routing & Classification
// Accepts: POST { message: string, tenant_id: string, message_id?: string }
// Returns: { action, category, confidence, reply?, ticket_id?, log_id }

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── System prompt for GPT-4o classification ────────────────
const SYSTEM_PROMPT = `You are an AI triage assistant for a residential property management company called Modus PM.

Your job is to classify incoming tenant messages and recommend the correct routing action.

You must respond with a JSON object ONLY — no prose, no markdown. Use this exact shape:
{
  "category": "MAINTENANCE" | "NOISE_COMPLAINT" | "PARKING_DISPUTE" | "LEASE_LEGAL" | "PAYMENT" | "GENERAL_INQUIRY" | "EMERGENCY",
  "escalation_level": "AUTO_REPLY" | "CREATE_TICKET" | "ESCALATE_LANDLORD",
  "confidence": 0.0-1.0,
  "intent_summary": "one sentence description of what the tenant needs",
  "urgency": "LOW" | "MEDIUM" | "HIGH" | "EMERGENCY",
  "suggested_reply": "optional short reply to send tenant if AUTO_REPLY (null otherwise)"
}

Routing rules:
- EMERGENCY (fire, gas leak, flood, no heat in winter, security breach) → ESCALATE_LANDLORD, urgency=EMERGENCY
- PARKING_DISPUTE, PAYMENT issues, LEASE_LEGAL concerns → ESCALATE_LANDLORD
- NOISE_COMPLAINT → AUTO_REPLY with a templated response, do NOT notify landlord unless escalation requested
- MAINTENANCE (broken fixtures, appliances, leaks, pest, HVAC, locks) → CREATE_TICKET
- GENERAL_INQUIRY → AUTO_REPLY
- When unsure, prefer ESCALATE_LANDLORD over AUTO_REPLY`;

// ── Main handler ───────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, tenant_id, message_id } = req.body || {};

  if (!message || !tenant_id) {
    return res.status(400).json({ error: "message and tenant_id are required" });
  }

  try {
    // ── 1. Load active routing rules from DB (for keyword pre-check) ──
    const { data: rules } = await supabase
      .from("ai_routing_rules")
      .select("*")
      .eq("is_active", true)
      .order("priority", { ascending: true });

    // ── 2. Quick keyword pre-check (cheap, no API call) ─────────────
    const lowerMsg = message.toLowerCase();
    let keywordMatch = null;
    for (const rule of rules || []) {
      const matched = rule.trigger_keywords.some((kw) =>
        lowerMsg.includes(kw.toLowerCase())
      );
      if (matched) { keywordMatch = rule; break; }
    }

    // ── 3. Call OpenAI for classification ───────────────────────────
    let classification = null;
    let rawResponse = null;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.1,
        max_tokens: 400,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Tenant message:\n"${message}"\n\nClassify this message and return the JSON object.`,
          },
        ],
      });

      rawResponse = completion;
      const raw = completion.choices[0]?.message?.content?.trim();
      // Strip markdown code fences if present
      const jsonStr = raw?.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
      classification = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("OpenAI parse error:", parseErr);
      // Fall back to keyword match if AI fails
      if (keywordMatch) {
        classification = {
          category: keywordMatch.category,
          escalation_level: keywordMatch.escalation_level,
          confidence: 0.6,
          intent_summary: "Keyword-matched classification (AI unavailable)",
          urgency: "MEDIUM",
          suggested_reply: keywordMatch.auto_reply_template || null,
        };
      } else {
        classification = {
          category: "GENERAL_INQUIRY",
          escalation_level: "ESCALATE_LANDLORD",
          confidence: 0.3,
          intent_summary: "Unclassified — escalated for human review",
          urgency: "LOW",
          suggested_reply: null,
        };
      }
    }

    // Merge keyword match data if confidence is low
    const finalRule = rules?.find((r) => r.category === classification.category);
    const effectiveAction =
      classification.confidence >= (finalRule?.confidence_threshold || 0.6)
        ? classification.escalation_level
        : "ESCALATE_LANDLORD"; // if unsure, always escalate

    // ── 4. Execute the routing action ────────────────────────────────
    let autoReplySent = false;
    let ticketCreatedId = null;

    // Load tenant info for context
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name, unit_id, user_id, units(unit_number, properties(name))")
      .eq("id", tenant_id)
      .single();

    // ─────────────────────────────────────────────────────────────────
    // A) AUTO_REPLY — send template message back to tenant, no landlord alert
    // ─────────────────────────────────────────────────────────────────
    if (effectiveAction === "AUTO_REPLY") {
      const replyText =
        classification.suggested_reply ||
        finalRule?.auto_reply_template ||
        "Thank you for reaching out. Your property manager will follow up within 1 business day.";

      if (message_id) {
        await supabase.from("messages").insert({
          sender_id: null,
          recipient_id: tenant?.user_id || null,
          tenant_id: tenant_id,
          body: replyText,
          parent_message_id: message_id,
        });
      }
      autoReplySent = true;
    }

    // ─────────────────────────────────────────────────────────────────
    // B) CREATE_TICKET — create maintenance request + dispatch vendor
    // ─────────────────────────────────────────────────────────────────
    if (effectiveAction === "CREATE_TICKET") {
      const { data: ticket } = await supabase
        .from("maintenance_requests")
        .insert({
          tenant_id: tenant_id,
          unit_id: tenant?.unit_id || null,
          description: message,
          status: "open",
          priority:
            classification.urgency === "EMERGENCY" || classification.urgency === "HIGH"
              ? "urgent"
              : "normal",
          ai_generated: true,
          ai_intent_summary: classification.intent_summary,
        })
        .select()
        .single();

      if (ticket) {
        ticketCreatedId = ticket.id;

        if (message_id && tenant?.user_id) {
          await supabase.from("messages").insert({
            sender_id: null,
            recipient_id: tenant.user_id,
            tenant_id: tenant_id,
            body: `We've opened a maintenance ticket for your request (#${ticket.id.slice(0, 8).toUpperCase()}). A team member or vendor will reach out to schedule access. You can track the status in the Maintenance section of your portal.`,
            parent_message_id: message_id,
          });
        }

        try {
          await fetch(`${process.env.VERCEL_URL || "https://getmodusam.com"}/api/dispatch-vendor`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ticket_id: ticket.id,
              tenant_id: tenant_id,
              description: message,
              priority: classification.urgency,
              unit: tenant?.units?.unit_number,
              property: tenant?.units?.properties?.name,
            }),
          });
        } catch (dispatchErr) {
          console.warn("Vendor dispatch failed (non-fatal):", dispatchErr.message);
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // C) ESCALATE_LANDLORD — create urgent alert + notify landlord
    // ─────────────────────────────────────────────────────────────────
    if (effectiveAction === "ESCALATE_LANDLORD") {
      await supabase.from("landlord_alerts").insert({
        type: "ai_escalation",
        category: classification.category,
        tenant_id: tenant_id,
        message_id: message_id || null,
        urgency: classification.urgency,
        summary: classification.intent_summary,
        raw_message: message,
        is_read: false,
      });
    }

    // ── 5. Log the routing decision ──────────────────────────────────
    const { data: logEntry } = await supabase
      .from("ai_routing_logs")
      .insert({
        message_id: message_id || null,
        tenant_id: tenant_id,
        detected_intent: classification.intent_summary,
        detected_category: classification.category,
        confidence_score: classification.confidence,
        action_taken: effectiveAction,
        matched_rule_id: finalRule?.id || null,
        auto_reply_sent: autoReplySent,
        ticket_created_id: ticketCreatedId,
        raw_openai_response: rawResponse
          ? {
              model: rawResponse.model,
              usage: rawResponse.usage,
              choice: rawResponse.choices?.[0]?.message?.content,
            }
          : null,
      })
      .select()
      .single();

    // ── 6. Return result ─────────────────────────────────────────────
    return res.status(200).json({
      action: effectiveAction,
      category: classification.category,
      confidence: classification.confidence,
      urgency: classification.urgency,
      intent_summary: classification.intent_summary,
      auto_reply_sent: autoReplySent,
      ticket_id: ticketCreatedId,
      log_id: logEntry?.id || null,
    });
  } catch (err) {
    console.error("classify-and-route error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}