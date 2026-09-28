// /api/classify-and-route.js
// Modus PM — Autonomous Property Manager Reasoning Engine v3
// 4-Tier Escalation: EMERGENCY | TENANT_DAMAGE | MAINTENANCE | DISPUTE
// Accepts: POST { message: string, tenant_id: string, message_id?: string }

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { Resend } from "resend";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

const LANDLORD_EMAIL = "moduspropmgmt@gmail.com";
const FROM_EMAIL = "noreply@getmodusam.com";

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
        enum: ["EMERGENCY", "HABITABILITY", "TENANT_DAMAGE", "APPLIANCE", "PLUMBING", "HVAC", "ELECTRICAL", "PEST", "LOCK", "NOISE_COMPLAINT", "PARKING_DISPUTE", "LEASE_VIOLATION", "TRASH", "GENERAL_INQUIRY", "PAYMENT", "LEASE_LEGAL"],
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
        description: "Your complete, professional reply TO the tenant FROM Modus Property Management. Write in first person plural ('We', 'Management'). Reference the specific policy where relevant. Never mention a landlord's name. Do NOT repeat the tenant's own message back to them."
      },
      missing_info: {
        type: "array",
        items: { type: "string" },
        description: "List of information still needed before full resolution (e.g. 'offending unit number', 'photo of damage', 'approximate time of noise'). Empty array if nothing missing."
      },
      billable_to_tenant: {
        type: "boolean",
        description: "True if damage or issue was caused by tenant (e.g. clogged drain, pet damage, broken window from inside)"
      },
      create_maintenance_ticket: {
        type: "boolean",
        description: "True if a maintenance_requests record should be created"
      },
      create_incident_log: {
        type: "boolean",
        description: "True if an incident_logs record should be created (disputes, violations, tenant damage)"
      },
      send_violation_notice: {
        type: "boolean",
        description: "True only if the offending unit is clearly identified and a formal notice should be sent to them"
      },
      offending_unit_hint: {
        type: "string",
        description: "Unit number or identifier of the offending party if mentioned by tenant, otherwise empty string"
      },
      dispatch_vendor: {
        type: "boolean",
        description: "True if this maintenance issue should be dispatched to the vendor queue"
      },
      escalate_to_landlord: {
        type: "boolean",
        description: "True if this requires human landlord involvement (payment disputes, legal threats, true emergencies)"
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

const SYSTEM_PROMPT = `You are the Autonomous Property Manager AI for Modus Property Management — a premium residential property management company. You handle all tenant communications with authority, professionalism, and efficiency on behalf of management.

Your mission: resolve 95%+ of tenant issues without landlord involvement while protecting habitability, cash flow, and tenancy safety.

NEVER mention a specific landlord name. Always speak as "Management" or "Modus Property Management" or "We."

━━━ BUILDING POLICIES (reference these when relevant) ━━━

RENT & LATE FEES:
- Rent is due on the 1st of each month.
- A $50 late fee is charged on the 6th if rent has not been received.
- All payments are processed through Hemlane.

PARKING:
- Off-street reserved parking spaces are available for $50/month with prior written approval from Management.
- Unreserved vehicles and guests must park on the street.
- Unauthorized vehicles in reserved spaces are subject to immediate towing at the vehicle owner's expense.

QUIET HOURS (Lakewood Ordinance § 515.03):
- Sunday–Thursday: 10:00 PM – 8:00 AM
- Friday–Saturday: 11:00 PM – 9:00 AM

PETS:
- Pets are strictly prohibited without prior written consent from Management and a fully executed pet addendum.

SMOKING & MARIJUANA:
- Smoking and marijuana use are strictly prohibited anywhere on the premises, including all indoor and outdoor areas.

MAINTENANCE RESPONSIBILITIES:
- Tenant responsibility: lightbulbs, HVAC filters, and drain clogs caused by misuse (hair, grease, etc.)
- Management responsibility: heating systems, plumbing, electrical, and major appliance repairs.

GUEST POLICY:
- Guests may not stay more than 7 consecutive nights or 14 total nights per calendar year without written approval from Management.

━━━ TIER CLASSIFICATION RULES ━━━

TIER 1 — EMERGENCY & HABITABILITY RISK:
Triggers: no heat in winter, active water leak/flooding, gas smell, fire risk, no hot water (extended), structural damage, security breach, broken exterior locks
→ escalate_to_landlord: true, urgency: EMERGENCY
→ Reply must include immediate safety instructions (turn off main water, evacuate if gas, etc.)
→ create_maintenance_ticket: true, is_emergency: true

TIER 2 — TENANT-CAUSED DAMAGE:
Triggers: pet damage (urine, scratching), tenant broke window/door, clogged drain (hair, grease), self-caused appliance damage, hoarding issues
→ billable_to_tenant: true
→ Remind tenant of their lease responsibility firmly but professionally
→ Request photos and details
→ create_incident_log: true

TIER 3 — STANDARD PROPERTY MAINTENANCE:
Triggers: appliance failure (not tenant-caused), leaking faucet, HVAC issues, pest intrusion, lock malfunction
→ Ask 1-2 targeted troubleshooting questions first (check breaker? clean lint trap? tried reset?)
→ create_maintenance_ticket: true, dispatch_vendor: true (if troubleshooting insufficient or already tried)
→ Remind tenant of their maintenance responsibilities (filters, lightbulbs) if relevant

TIER 4 — NEIGHBOR DISPUTES & LEASE VIOLATIONS:
Triggers: noise complaints, parking disputes, trash violations, smoking violations, unauthorized pets/guests
→ Open with: "Management has opened an official incident record..."
→ Reference the specific policy that was violated (quiet hours, parking rules, smoking policy, pet policy, guest policy)
→ If offending unit unknown: ask for unit number, time, nature of disturbance, any evidence
→ create_incident_log: true
→ send_violation_notice: true ONLY if offending unit is clearly identified

PAYMENT & LEGAL:
→ Always escalate_to_landlord: true
→ Refer tenant to Hemlane for payment questions; never negotiate terms or make legal statements

GENERAL INQUIRY:
→ Answer helpfully using the building policies above; no ticket needed`;

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
      .map((m) => {
        const role = m.sender_id === null ? "Management" : "Tenant";
        return `[${role}]: ${m.body}`;
      })
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

Classify this message, determine the correct autonomous action, and write your professional reply to the tenant in tenant_reply. Do NOT repeat the tenant's message in tenant_reply — write Management's response.`,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content?.trim();
      classification = JSON.parse(raw);
    } catch (aiErr) {
      console.error("OpenAI error:", aiErr);
      // Safe fallback — escalate to landlord if AI fails
      classification = {
        tier: "TIER4_DISPUTE",
        category: "GENERAL_INQUIRY",
        confidence: 0.2,
        urgency: "MEDIUM",
        intent_summary: "AI classification unavailable — escalated for human review",
        tenant_reply: "Thank you for reaching out. Property Management has logged your request and will follow up shortly.",
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
    // Guard: never echo the tenant's own message back
    const finalReply = classification?.tenant_reply || "Thank you for reaching out. Property Management has logged your request and will follow up shortly.";

    const { error: replyErr } = await supabase.from("messages").insert({
      sender_id: null,
      recipient_id: tenant?.user_id || null,
      tenant_id: tenant_id,
      body: finalReply,
      read: false,
    });

    if (replyErr) console.error("Tenant reply insert error:", replyErr);

    // ── 5. Create maintenance ticket ─────────────────────────
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

      // Trigger vendor dispatch
      if (classification.dispatch_vendor && ticketId) {
        try {
          await fetch(`https://getmodusam.com/api/dispatch-vendor`, {
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
          });
        } catch (dispatchErr) {
          console.warn("Vendor dispatch failed (non-fatal):", dispatchErr.message);
        }
      }
    }

    // ── 6. Create incident log ───────────────────────────────
    let incidentId = null;

    if (classification.create_incident_log) {
      // Resolve offending unit ID if a hint was provided
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

      if (incidentErr) {
        console.error("Incident log error:", incidentErr);
      } else {
        incidentId = incident?.id;
      }

      // Send violation notice to offending unit if identified
      if (classification.send_violation_notice && offendingUnitId) {
        const { data: offendingTenant } = await supabase
          .from("tenants")
          .select("user_id, name")
          .eq("unit_id", offendingUnitId)
          .maybeSingle();

        if (offendingTenant?.user_id) {
          const violationBody = `NOTICE OF LEASE VIOLATION

Management has received a formal complaint regarding a disturbance originating from your unit. This notice is being issued in accordance with your lease agreement.

Nature of Complaint: ${classification.category.replace(/_/g, " ")}
Date of Notice: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

You are required to remedy this situation immediately. Continued violations may result in formal lease enforcement action, including written warnings, fines, or lease termination proceedings as permitted under your rental agreement.

If you believe this notice was issued in error, please respond to this message within 48 hours.

Modus Property Management`;

          const { error: noticeErr } = await supabase.from("messages").insert({
            sender_id: null,
            recipient_id: offendingTenant.user_id,
            tenant_id: null,
            body: violationBody,
            read: false,
          });

          if (noticeErr) console.error("Violation notice error:", noticeErr);
        }
      }
    }

    // ── 7. Emergency email to landlord ───────────────────────
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
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #c0392b; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                  <h1 style="margin: 0; font-size: 22px;">🚨 Emergency Alert — Modus PM</h1>
                </div>
                <div style="background: #f8f8f8; padding: 24px; border: 1px solid #ddd; border-radius: 0 0 8px 8px;">
                  <p><strong>Property:</strong> ${tenant?.units?.properties?.name || "Unknown"}</p>
                  <p><strong>Unit:</strong> ${tenant?.units?.unit_number || "Unknown"}</p>
                  <p><strong>Tenant:</strong> ${tenant?.name || "Unknown"}</p>
                  <p><strong>Urgency:</strong> ${classification.urgency}</p>
                  <p><strong>Category:</strong> ${classification.category}</p>
                  <hr style="border: none; border-top: 1px solid #ddd; margin: 16px 0;" />
                  <p><strong>Tenant Message:</strong></p>
                  <blockquote style="border-left: 4px solid #c0392b; margin: 0; padding: 12px 16px; background: #fff; color: #333;">
                    ${message}
                  </blockquote>
                  <hr style="border: none; border-top: 1px solid #ddd; margin: 16px 0;" />
                  <p><strong>AI Summary:</strong> ${classification.intent_summary}</p>
                  <p><strong>AI Reply Sent to Tenant:</strong></p>
                  <blockquote style="border-left: 4px solid #888; margin: 0; padding: 12px 16px; background: #fff; color: #555;">
                    ${finalReply}
                  </blockquote>
                  <p style="margin-top: 24px; color: #888; font-size: 12px;">Modus Property Management · Automated Emergency Alert</p>
                </div>
              </div>
            `,
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