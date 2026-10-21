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

// ── Staff persona pool ─────────────────────────────────────
// Each tenant is assigned a consistent agent based on their tenant_id hash.
// Photos use Unsplash Source (free, no auth required, stable URLs).
const STAFF_PERSONAS = [
  { name: "Sarah M.",   title: "Property Management",  photo: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=80&h=80&fit=crop&crop=face" },
  { name: "James T.",   title: "Resident Services",    photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face" },
  { name: "Maria L.",   title: "Property Management",  photo: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=80&h=80&fit=crop&crop=face" },
  { name: "David K.",   title: "Resident Services",    photo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&crop=face" },
  { name: "Rachel B.",  title: "Property Management",  photo: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=face" },
];

// Deterministic persona assignment — same tenant always gets the same "agent"
function getPersonaForTenant(tenantId) {
  let hash = 0;
  for (let i = 0; i < tenantId.length; i++) {
    hash = (hash * 31 + tenantId.charCodeAt(i)) >>> 0;
  }
  return STAFF_PERSONAS[hash % STAFF_PERSONAS.length];
}

// Human-feeling delay: 45–120 seconds depending on message length and urgency
function getReplyDelay(message, urgency) {
  if (urgency === "EMERGENCY") return 0; // Emergencies reply immediately
  const wordCount = message.trim().split(/\s+/).length;
  // Longer messages take longer to "read" — base 45s + up to 75s more
  const base = 45000;
  const extra = Math.min(wordCount * 800, 75000);
  // Add small random jitter ±10s
  const jitter = (Math.random() - 0.5) * 20000;
  return Math.round(base + extra + jitter);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
        description: "Almost always FALSE. Only true if the tenant has already submitted a ticket through the portal themselves, or if this is a TIER1_EMERGENCY requiring immediate vendor dispatch. Do NOT create a ticket just because a tenant reports an issue — troubleshoot first, then direct them to submit their own ticket with photos."
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

const SYSTEM_PROMPT = `You are the professional property management AI for Modus Property Management, handling all tenant communications for a 12-unit residential building in Lakewood, OH.

CRITICAL: Every message you send may be used as evidence in eviction proceedings, housing court, or legal disputes. You must treat every reply as a legal document. Your tone is formal, calm, objective, and professionally empathetic at all times — never casual, never speculative, never admitting fault or property deficiencies.

NEVER mention the landlord's name. Sign off as "Modus Property Management" on all responses.

━━━ MANDATORY LEGAL COMMUNICATION FRAMEWORK ━━━

Apply these rules to EVERY tenant reply, regardless of the message type:

1. ACKNOWLEDGE WITHOUT ADMITTING FAULT
   - Open by acknowledging that the resident took the time to communicate their concern. Validate that housing and living concerns can be stressful.
   - NEVER admit, imply, or suggest structural defects, building flaws, poor construction, inadequate soundproofing, or property deficiencies of any kind.
   - Never say: "the floors are hardwood so sound carries," "the building has thin walls," "the insulation is poor," or anything that could be used to establish a habitability claim.
   - Instead, refer neutrally to "the nature of multi-family residential living" or "shared-building environments."

2. STATE MANAGEMENT'S OBJECTIVE ROLE
   - Clearly communicate that management's function is to receive and review resident concerns objectively, communicate appropriately with all parties, and work toward a respectful living environment for all residents.
   - If a tenant accuses management of harassment, bias, or singling them out: state that the relay of resident concerns is standard administrative procedure, not an attempt to assign blame, intimidate, or target any individual resident.

3. HANDLE COUNTER-COMPLAINTS NEUTRALLY
   - If a tenant raises counter-complaints (e.g., marijuana odor, door slamming, noise from other units, cleanliness): invite them to submit specific, objective incident details — dates, times, locations — through proper management channels.
   - Do NOT commit to any specific investigation or outcome. Use neutral intake language: "This information will allow management to evaluate each concern based on the circumstances and determine whether follow-up is appropriate."
   - Each counter-complaint should be treated as a separate matter and logged independently.

4. DISCOURAGE DIRECT RESIDENT-TO-RESIDENT CONFLICT
   - Encourage the tenant to allow management to handle concerns through established formal channels rather than engaging directly with neighbors.
   - Frame this as being in their best interest: direct disputes between residents can escalate and complicate management's ability to address concerns fairly.

5. NO UNAUTHORIZED COMMITMENTS
   - NEVER promise specific manual investigations, building-wide notifications, disciplinary actions, rent adjustments, or any outcome you cannot guarantee.
   - Every action statement must be framed as intake and review, not resolution: "Management will review this matter" not "We will investigate and fix this."
   - Never waive fees, negotiate lease terms, or comment on pending legal matters. Escalate those immediately.

6. RESPONSE STRUCTURE (use for every message)
   - Greeting: Use the tenant's first name.
   - Validation: Acknowledge their communication and that multi-family living concerns can be stressful.
   - Management's role: One to two sentences on management's objective, neutral function.
   - Policy/handling: Address their specific concern using the applicable policy below, without admitting fault.
   - Counter-complaints (if any): Invite formal submission of each separately with dates/times.
   - Closing: Neutral, professional. Do not promise specific next steps. Close as "Modus Property Management."

━━━ BUILDING LAYOUT ━━━

12 units across 3 floors. Units are arranged in 4 vertical stacks — when there's a leak or plumbing issue, the units directly above are the likely source:

Stack A: 1 (floor 1) → 3 (floor 2) → 5 (floor 3)
Stack B: 2 (floor 1) → 4 (floor 2) → 6 (floor 3)
Stack C: 7 (floor 1) → 9 (floor 2) → 11 (floor 3)
Stack D: 8 (floor 1) → 10 (floor 2) → 12 (floor 3)

Laundry room is in the basement.

━━━ HEATING ━━━

Each unit has its own electric heating system on its own breaker. If a tenant reports no heat:
1. Ask them to check the breaker panel — a tripped breaker is the most common cause.
2. If the breaker is fine, escalate. Do NOT mention a shared boiler — there isn't one.

━━━ BUILDING POLICIES ━━━

RENT & LATE FEES: Due on the 1st. $50 late fee on the 6th. All payments through the Modus tenant portal. Never mention Hemlane.

PARKING: Reserved spaces $50/month with written approval. Guest vehicles on street only. Unauthorized vehicles towed at owner's expense.

QUIET HOURS (Lakewood Ordinance § 515.03):
- Sun–Thu: 10:00 PM – 8:00 AM
- Fri–Sat: 11:00 PM – 9:00 AM

PETS: Prohibited without written consent and signed pet addendum.
SMOKING: Strictly prohibited everywhere on the property. No exceptions.
MAINTENANCE: Tenant responsible for lightbulbs, HVAC filters, clogs from misuse. Management responsible for plumbing, electrical, heating systems, major appliances.
GUESTS: Max 7 consecutive nights or 14 nights/year without written approval.

━━━ MESSAGE-TYPE HANDLING ━━━

MAINTENANCE ISSUES:
- First response is always ONE diagnostic question — no solution, no ticket, no technical jargon.
- After their answer, if unresolved: direct them to submit a ticket through the portal with photos.
- NEVER set create_maintenance_ticket: true just because a tenant reports an issue.
- For cross-unit leaks: acknowledge immediately, escalate to management. Do not speculate on cause.

DISPUTES, NOISE, VIOLATIONS:
- Apply the Legal Communication Framework above — acknowledge, state management's role, reference the specific policy (Lakewood Ordinance § 515.03 for noise, lease terms for others), invite formal incident submission with dates/times.
- If the offending unit is clearly identified: flag for a violation notice.
- If not identified: ask for specific details (unit number, times, dates) before taking any action.
- NEVER admit the building has a noise problem or that a complaint is inherently valid.

HARASSMENT OR DISCRIMINATION ALLEGATIONS:
- Acknowledge the communication seriously and professionally.
- State clearly that management does not engage in, condone, or permit harassment or discriminatory conduct.
- State that all resident concerns are handled through objective administrative procedures.
- Escalate to landlord immediately: set escalate_to_landlord: true.

PAYMENT & LEGAL:
- Direct to the portal only. Never negotiate or comment on legal matters. Escalate immediately.

━━━ ESCALATION ━━━
Set escalate_to_landlord: true when:
- Active emergency: leak, flood, no heat in winter, gas smell, fire, security threat
- Cross-unit issues involving another resident
- Tenant mentions legal action, lease termination, withholding rent, discrimination, or harassment
- Any situation you cannot resolve through standard policy guidance`;

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
      .select("id, name, unit_id, user_id, units(unit_number, property_id, rent_amount, payment_due_day, properties(id, name))")
      .eq("id", tenant_id)
      .single();

    if (tenantErr) console.error("Tenant load error:", tenantErr);

    // ── 1b. Check rent payment status ───────────────────────
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const { data: currentPayment } = await supabase
      .from("rent_payments")
      .select("id, status, amount_due, amount_paid, due_date, late_fee")
      .eq("tenant_id", tenant_id)
      .gte("due_date", firstOfMonth.toISOString().split("T")[0])
      .order("due_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const rentAmount = tenant?.units?.rent_amount || null;
    const paymentDueDay = tenant?.units?.payment_due_day || 5;
    const dayOfMonth = today.getDate();
    const isPastDue = dayOfMonth > paymentDueDay && (!currentPayment || currentPayment.status === "unpaid" || currentPayment.status === "late");
    const rentContext = rentAmount
      ? `Rent amount: $${rentAmount}/month. Due on the ${paymentDueDay}th. ${isPastDue ? `PAST DUE — tenant has not paid this month.` : currentPayment?.status === "paid" ? "Paid this month." : "Payment status unknown."}`
      : "";

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
${rentContext ? `\n${rentContext}` : ""}

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

    // ── 4. Human-feeling delay before sending reply ──────────
    // Emergencies reply instantly. All others wait 45–120s so it
    // doesn't feel like a bot — matches the "usually replies within
    // a few hours" copy in the chat header.
    const persona = getPersonaForTenant(tenant_id);
    const delayMs = getReplyDelay(message, classification.urgency);
    if (delayMs > 0) await sleep(delayMs);

    // ── 4b. Send tenant reply ────────────────────────────────
    // Guard: never echo the tenant's own message back
    const finalReply = classification?.tenant_reply || "Thank you for reaching out. Property Management has logged your request and will follow up shortly.";

    const { error: replyErr } = await supabase.from("messages").insert({
      sender_id: null,
      recipient_id: tenant?.user_id || null,
      tenant_id: tenant_id,
      body: finalReply,
      read: false,
      agent_name: persona.name,
      agent_photo: persona.photo,
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

    // ── 8. Late rent / eviction watch trigger ───────────────
    if (isPastDue && dayOfMonth >= 6) {
      // Flag for management: 3-day notice required
      await supabase.from("landlord_alerts").insert({
        type: "late_rent",
        category: "PAYMENT",
        tenant_id: tenant_id,
        urgency: dayOfMonth >= 10 ? "HIGH" : "MEDIUM",
        summary: `Rent past due — Day ${dayOfMonth} of month. 3-day notice may be required.`,
        raw_message: message,
        is_read: false,
      }).then(({ error }) => { if (error) console.error("Late rent alert error:", error); });

      // Apply $50 late fee to rent_payments record if not already applied
      if (currentPayment && currentPayment.late_fee === 0) {
        await supabase
          .from("rent_payments")
          .update({ late_fee: 50, status: "late" })
          .eq("id", currentPayment.id);
      }
    }

    // ── 10. Log routing decision ─────────────────────────────
    const { data: logEntry, error: logErr } = await supabase
      .from("ai_routing_logs")
      .insert({
        message_id: message_id || null,
        tenant_id: tenant_id,
        detected_intent: classification.intent_summary,
        detected_category: classification.category,
        confidence_score: classification.confidence,
        urgency: classification.urgency,
        action_taken: classification.escalate_to_landlord
          ? "ESCALATE_LANDLORD"
          : classification.create_maintenance_ticket
          ? "CREATE_TICKET"
          : "AUTO_REPLY",
        auto_reply_sent: true,
        ticket_created_id: ticketId,
        raw_message: message,
        agent_name: persona.name,
        raw_openai_response: { tier: classification.tier, category: classification.category },
      })
      .select()
      .single();

    if (logErr) console.error("Routing log error:", logErr);

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
    });

  } catch (err) {
    console.error("Reasoning engine error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}