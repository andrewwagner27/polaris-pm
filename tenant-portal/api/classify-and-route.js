// /api/classify-and-route.js
// Modus PM — Autonomous Property Manager Reasoning Engine v2
// 4-Tier Escalation: EMERGENCY | TENANT_DAMAGE | MAINTENANCE | DISPUTE

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { Resend } from "resend";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

const LANDLORD_EMAIL = "moduspropmgmt@gmail.com";
const FROM_EMAIL = "noreply@getmodusam.com";

const CLASSIFICATION_SCHEMA = {
  name: "property_triage",
  strict: true,
  schema: {
    type: "object",
    properties: {
      tier: {
        type: "string",
        enum: ["TIER1_EMERGENCY", "TIER2_TENANT_DAMAGE", "TIER3_MAINTENANCE", "TIER4_DISPUTE"],
      },
      category: {
        type: "string",
        enum: ["EMERGENCY", "HABITABILITY", "TENANT_DAMAGE", "APPLIANCE", "PLUMBING", "HVAC", "ELECTRICAL", "PEST", "LOCK", "NOISE_COMPLAINT", "PARKING_DISPUTE", "LEASE_VIOLATION", "TRASH", "GENERAL_INQUIRY", "PAYMENT", "LEASE_LEGAL"],
      },
      confidence: { type: "number" },
      urgency: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "EMERGENCY"] },
      intent_summary: { type: "string" },
      tenant_reply: { type: "string", description: "Your professional reply TO the tenant FROM management. This must be a complete, helpful response written by you — NOT the tenant's own message repeated back. Write in first person plural as Modus Property Management." },
      missing_info: { type: "array", items: { type: "string" } },
      billable_to_tenant: { type: "boolean" },
      create_maintenance_ticket: { type: "boolean" },
      create_incident_log: { type: "boolean" },
      send_violation_notice: { type: "boolean" },
      offending_unit_hint: { type: "string" },
      dispatch_vendor: { type: "boolean" },
      escalate_to_landlord: { type: "boolean" },
    },
    required: [
      "tier", "category", "confidence", "urgency", "intent_summary",
      "tenant_reply", "missing_info", "billable_to_tenant",
      "create_maintenance_ticket", "create_incident_log",
      "send_violation_notice", "offending_unit_hint",
      "dispatch_vendor", "escalate_to_landlord",
    ],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `You are the Autonomous Property Manager AI for Modus Property Management — a premium residential property management company. You handle all tenant communications with authority, professionalism, and efficiency on behalf of management.

Your mission: resolve 95%+ of tenant issues without landlord involvement while protecting habitability, cash flow, and tenancy safety.

NEVER mention a specific landlord name. Always speak as "Management" or "Modus Property Management" or "We."

TIER CLASSIFICATION RULES:

TIER 1 — EMERGENCY & HABITABILITY RISK:
Triggers: no heat in winter, active water leak/flooding, gas smell, fire risk, no hot water (extended), structural damage, security breach, broken exterior locks
→ escalate_to_landlord: true, urgency: EMERGENCY
→ Reply must include immediate safety instructions (turn off main water, evacuate if gas, etc.)
→ create_maintenance_ticket: true

TIER 2 — TENANT-CAUSED DAMAGE:
Triggers: pet damage (urine, scratching), tenant broke window/door, clogged drain (hair, grease), self-caused appliance damage
→ billable_to_tenant: true
→ Remind tenant of lease responsibility clause firmly but professionally
→ Request photos and details
→ create_incident_log: true

TIER 3 — STANDARD PROPERTY MAINTENANCE:
Triggers: appliance failure (not tenant-caused), leaking faucet, HVAC issues, pest intrusion, lock malfunction
→ Ask 1-2 targeted troubleshooting questions first (check breaker? clean lint trap? tried reset?)
→ create_maintenance_ticket: true, dispatch_vendor: true

TIER 4 — NEIGHBOR DISPUTES & LEASE VIOLATIONS:
Triggers: noise complaints, parking disputes, trash violations, smoking violations
→ Open with: "Management has opened an official incident record..."
→ If offending unit unknown: ask for unit number, time, nature of disturbance, any evidence
→ create_incident_log: true
→ send_violation_notice: true ONLY if offending unit is clearly identified in the message

PAYMENT & LEGAL:
→ Always escalate_to_landlord: true, never negotiate or make legal statements

GENERAL INQUIRY:
→ Answer helpfully, no ticket needed`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, tenant_id, message_id } = req.body || {};

  if (!message || !tenant_id) {
    return res.status(400).json({ error: "message and tenant_id are required" });
  }

  // ── Build base URL from request headers for internal calls ──
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "getmodusam.com";
  const BASE_URL = `${protocol}://${host}`;

  try {
    // ── 1. Load tenant info ──────────────────────────────────
    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .select("id, name, unit_id, user_id, units(unit_number, property_id, properties(id, name))")
      .eq("id", tenant_id)
      .single();

    if (tenantErr) console.error("Tenant load error:", tenantErr);

    // ── 2. Load last 10 messages for thread context ──────────
    const { data: threadMessages } = await supabase
      .from("messages")
      .select("sender_id, body, created_at")
      .eq("tenant_id", tenant_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const threadContext = (threadMessages || [])
      .reverse()
      .map((m) => `[${m.sender_id === null ? "Management" : "Tenant"}]: ${m.body}`)
      .join("\n");

    // ── 3. Call OpenAI with structured output ────────────────
    let classification = null;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.1,
        max_tokens: 800,
        response_format: {
          type: "json_schema",
          json_schema: CLASSIFICATION_SCHEMA,
        },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Property: ${tenant?.units?.properties?.name || "Unknown Property"}
Unit: ${tenant?.units?.unit_number || "Unknown Unit"}
Tenant: ${tenant?.name || "Unknown Tenant"}

Recent conversation thread:
${threadContext || "(no prior messages)"}

New tenant message:
"${message}"

Classify and determine the correct autonomous action. In tenant_reply, write YOUR response to the tenant — a professional reply FROM management. Do not repeat the tenant's message.`,
          },
        ],
      });

      const rawContent = completion.choices[0]?.message?.content?.trim();
      console.log("OpenAI raw output:", rawContent);
      console.log("OpenAI usage:", JSON.stringify(completion.usage));
      classification = JSON.parse(rawContent);
      console.log("Parsed tenant_reply:", classification?.tenant_reply);
    } catch (aiErr) {
      console.error("OpenAI error:", aiErr);
      classification = {
        tier: "TIER4_DISPUTE",
        category: "GENERAL_INQUIRY",
        confidence: 0.2,
        urgency: "MEDIUM",
        intent_summary: "AI classification unavailable — escalated for human review",
        tenant_reply: "Thank you for your message. A member of our management team will follow up with you shortly.",
        missing_info: [],
        billable_to_tenant: false,
        create_maintenance_ticket: false,
        create_incident_log: false,
        send_violation_notice: false,
        offending_unit_hint: "",
        dispatch_vendor: false,
        escalate_to_landlord: true,
      };
    }

    // ── 4. Send tenant reply ─────────────────────────────────
    // Safe fallback — never echo the tenant's own message back
    const finalReply =
      classification?.tenant_reply &&
      classification.tenant_reply.trim().length > 0 &&
      classification.tenant_reply.trim() !== message.trim()
        ? classification.tenant_reply.trim()
        : "Thank you for your message. Property Management has received this and will review it shortly.";

    console.log("Final reply being inserted:", finalReply);

    const { error: replyErr } = await supabase.from("messages").insert({
      sender_id: null,
      recipient_id: tenant?.user_id || null,
      tenant_id: tenant_id,
      body: finalReply,
      read: false,
    });

    if (replyErr) console.error("Tenant reply insert error:", replyErr);

    // ── 5. Create maintenance ticket + dispatch ──────────────
    let ticketId = null;

    if (classification.create_maintenance_ticket) {
      const { data: ticket, error: ticketErr } = await supabase
        .from("maintenance_requests")
        .insert({
          tenant_id: tenant_id,
          unit_id: tenant?.unit_id || null,
          description: message,
          status: "open",
          priority: classification.urgency === "EMERGENCY" || classification.urgency === "HIGH" ? "urgent" : "normal",
          billable_to_tenant: classification.billable_to_tenant,
          is_emergency: classification.tier === "TIER1_EMERGENCY",
        })
        .select()
        .single();

      if (ticketErr) console.error("Maintenance ticket error:", ticketErr);
      else ticketId = ticket?.id;

      // Dispatch vendor — use dynamic base URL, fire-and-forget with timeout guard
      if (classification.dispatch_vendor && ticketId) {
        try {
          const controller = new AbortController();
          const dispatchTimeout = setTimeout(() => controller.abort(), 5000);
          await fetch(`${BASE_URL}/api/dispatch-vendor`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ticket_id: ticketId,
              tenant_id: tenant_id,
              description: message,
              priority: classification.urgency,
              unit: tenant?.units?.unit_number,
              property: tenant?.units?.properties?.name,
            }),
            signal: controller.signal,
          });
          clearTimeout(dispatchTimeout);
        } catch (dispatchErr) {
          console.warn("Vendor dispatch failed (non-fatal):", dispatchErr.message);
        }
      }
    }

    // ── 6. Create incident log + violation notice ────────────
    let incidentId = null;

    if (classification.create_incident_log) {
      let offendingUnitId = null;
      if (classification.offending_unit_hint) {
        const { data: offendingUnit } = await supabase
          .from("units")
          .select("id")
          .eq("property_id", tenant?.units?.property_id)
          .ilike("unit_number", `%${classification.offending_unit_hint}%`)
          .maybeSingle();
        offendingUnitId = offendingUnit?.id || null;
      }

      const incidentCategory = ["NOISE_COMPLAINT", "PARKING_DISPUTE", "LEASE_VIOLATION", "TENANT_DAMAGE", "TRASH"].includes(classification.category)
        ? classification.category
        : "OTHER";

      const { data: incident, error: incidentErr } = await supabase
        .from("incident_logs")
        .insert({
          tenant_id: tenant_id,
          property_id: tenant?.units?.properties?.id || null,
          offending_unit_id: offendingUnitId,
          category: incidentCategory,
          status: classification.send_violation_notice ? "notice_sent" : "open",
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

      if (incidentErr) console.error("Incident log error:", incidentErr);
      else incidentId = incident?.id;

      // Send violation notice to offending unit if identified
      if (classification.send_violation_notice && offendingUnitId) {
        const { data: offendingTenant } = await supabase
          .from("tenants")
          .select("id, user_id, name")
          .eq("unit_id", offendingUnitId)
          .maybeSingle();

        // Bug fix #3: insert notice even if user_id is null, using tenant_id as fallback
        const violationBody = `NOTICE OF LEASE VIOLATION

Management has received a formal complaint regarding a disturbance originating from your unit. This notice is being issued in accordance with your lease agreement.

Nature of Complaint: ${classification.category.replace(/_/g, " ")}
Date of Notice: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

You are required to remedy this situation immediately. Continued violations may result in formal lease enforcement action, including written warnings, fines, or lease termination proceedings as permitted under your rental agreement.

If you believe this notice was issued in error, please respond to this message within 48 hours.

Modus Property Management`;

        const { error: noticeErr } = await supabase.from("messages").insert({
          sender_id: null,
          recipient_id: offendingTenant?.user_id || null,
          tenant_id: offendingTenant?.id || null,
          body: violationBody,
          read: false,
        });

        if (noticeErr) console.error("Violation notice error:", noticeErr);
      }
    }

    // ── 7. Emergency email + landlord alert ──────────────────
    if (classification.tier === "TIER1_EMERGENCY" || classification.escalate_to_landlord) {
      const { error: alertErr } = await supabase.from("landlord_alerts").insert({
        type: classification.tier === "TIER1_EMERGENCY" ? "emergency" : "ai_escalation",
        category: classification.category,
        tenant_id: tenant_id,
        message_id: message_id || null,
        urgency: classification.urgency,
        summary: classification.intent_summary,
        raw_message: message,
        is_read: false,
      });

      if (alertErr) console.error("Landlord alert error:", alertErr);

      if (classification.tier === "TIER1_EMERGENCY") {
        try {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: LANDLORD_EMAIL,
            subject: `🚨 EMERGENCY — ${tenant?.units?.properties?.name || "Property"} Unit ${tenant?.units?.unit_number || "Unknown"}`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:#c0392b;color:white;padding:20px;border-radius:8px 8px 0 0;">
                  <h1 style="margin:0;font-size:22px;">🚨 Emergency Alert — Modus PM</h1>
                </div>
                <div style="background:#f8f8f8;padding:24px;border:1px solid #ddd;border-radius:0 0 8px 8px;">
                  <p><strong>Property:</strong> ${tenant?.units?.properties?.name || "Unknown"}</p>
                  <p><strong>Unit:</strong> ${tenant?.units?.unit_number || "Unknown"}</p>
                  <p><strong>Tenant:</strong> ${tenant?.name || "Unknown"}</p>
                  <p><strong>Urgency:</strong> ${classification.urgency}</p>
                  <p><strong>Category:</strong> ${classification.category}</p>
                  <hr style="border:none;border-top:1px solid #ddd;margin:16px 0;" />
                  <p><strong>Tenant Message:</strong></p>
                  <blockquote style="border-left:4px solid #c0392b;margin:0;padding:12px 16px;background:#fff;">
                    ${message}
                  </blockquote>
                  <hr style="border:none;border-top:1px solid #ddd;margin:16px 0;" />
                  <p><strong>AI Summary:</strong> ${classification.intent_summary}</p>
                  <p><strong>Reply Sent to Tenant:</strong></p>
                  <blockquote style="border-left:4px solid #888;margin:0;padding:12px 16px;background:#fff;color:#555;">
                    ${finalReply}
                  </blockquote>
                  <p style="margin-top:24px;color:#888;font-size:12px;">Modus Property Management · Automated Emergency Alert</p>
                </div>
              </div>`,
          });
        } catch (emailErr) {
          console.error("Emergency email error:", emailErr);
        }
      }
    }

    // ── 8. Log routing decision ──────────────────────────────
    const { data: logEntry, error: logErr } = await supabase
      .from("ai_routing_logs")
      .insert({
        message_id: message_id || null,
        tenant_id: tenant_id,
        detected_intent: classification.intent_summary,
        detected_category: classification.category,
        confidence_score: classification.confidence,
        action_taken: classification.escalate_to_landlord
          ? "ESCALATE_LANDLORD"
          : classification.create_maintenance_ticket
          ? "CREATE_TICKET"
          : "AUTO_REPLY",
        auto_reply_sent: true,
        ticket_created_id: ticketId,
        raw_openai_response: { tier: classification.tier, category: classification.category },
      })
      .select()
      .single();

    if (logErr) console.error("Routing log error:", logErr);

    // ── 9. Return result ─────────────────────────────────────
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
    });

  } catch (err) {
    console.error("Reasoning engine error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}