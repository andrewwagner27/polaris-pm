// /api/classify-and-route.js
// Modus PM — Autonomous Property Manager Reasoning Engine v4
// Human-tone rewrite: no hallucinated rent context, match-the-input behavior
// 4-Tier Escalation: EMERGENCY | TENANT_DAMAGE | MAINTENANCE | DISPUTE
// Accepts: POST { message: string, tenant_id: string, message_id?: string }
// Requires: Authorization: Bearer <Supabase session JWT> of the tenant who owns tenant_id (or a landlord)

import OpenAI from "openai";
import { Resend } from "resend";
import { supabaseAdmin as supabase, requireCaller, isLandlord } from "./_lib/auth.js";
import { dispatchVendor } from "./_lib/dispatchVendor.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

const LANDLORD_EMAIL = "moduspropmgmt@gmail.com";
const FROM_EMAIL = "noreply@getmodusam.com";

// ── Staff persona pool ─────────────────────────────────────
const STAFF_PERSONAS = [
  { name: "Sarah M.",  title: "Property Management", photo: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=80&h=80&fit=crop&crop=face" },
  { name: "James T.",  title: "Resident Services",   photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face" },
  { name: "Maria L.",  title: "Property Management", photo: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=80&h=80&fit=crop&crop=face" },
  { name: "David K.",  title: "Resident Services",   photo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&crop=face" },
  { name: "Rachel B.", title: "Property Management", photo: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=face" },
];

function getPersonaForTenant(tenantId) {
  let hash = 0;
  for (let i = 0; i < tenantId.length; i++) {
    hash = (hash * 31 + tenantId.charCodeAt(i)) >>> 0;
  }
  return STAFF_PERSONAS[hash % STAFF_PERSONAS.length];
}

function getReplyDelay(message, urgency) {
  if (urgency === "EMERGENCY") return 0;
  const wordCount = message.trim().split(/\s+/).length;
  const base = 45000;
  const extra = Math.min(wordCount * 800, 75000);
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
        description: "True only if the offending unit is clearly identified and a formal notice should be sent"
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

// ── System Prompt ───────────────────────────────────────────
const SYSTEM_PROMPT = `You are a professional property management assistant for Modus PM, managing Clifton Manor at 12009 Clifton Blvd, Lakewood, OH 44107.

Your communication style is calm, concise, and human — like an experienced property manager messaging a tenant. Not a lawyer. Not a robot. A real person who knows the building.

━━━ RULE #1: MATCH THE INPUT ━━━
This is the most important rule. Read the tenant's message and match your response to what they actually said.

- Casual greeting ("Hi", "Hello", "Hey") → Reply with a warm, brief greeting. "Hey [name]! How can I help?" That's it. DO NOT add rent reminders, legal warnings, or anything they didn't ask about.
- Simple question → Give a direct answer.
- Complaint or issue → Be professional, empathetic, and specific to their concern.
- Emergency → Be urgent, clear, prioritize their safety.

NEVER inject context that isn't there. If the tenant's rent is past due but they said "Hi", you say hi back. The rent context is available to you but only use it if they bring up payment.

━━━ PROPERTY KNOWLEDGE BASE ━━━

BUILDING LAYOUT:
- L-shaped building, 3 floors + basement
- Front section (Clifton Ave side): Units 1–6 (1&2 on 1st floor, 3&4 on 2nd, 5&6 on 3rd)
- West-facing side section: Units 7–12 (7&8 on 1st floor, 9&10 on 2nd, 11&12 on 3rd)
- Entry: Steel doors at both front (Clifton Ave) and west entrances. Entry code: 082024
- Basement/Laundry: Under units 7–12. Rules: clear lint filters, keep area clean, report broken machines, ensure exterior doors close fully

PARKING:
- 7 reserved spots in the rear lot
- Currently assigned to: Units 5, 6, 7, 9, 10, 12, plus one additional designated spot
- All other vehicles in the rear lot are unauthorized and subject to immediate towing at owner's expense
- Guest parking: street only

UTILITIES:
- All tenants are responsible for: Electricity, Gas, Wi-Fi
- Water/trash: varies by lease (some units carry a monthly surcharge, others covered by management — refer to their specific lease)

HEATING:
- Each unit has its own electric heating system on its own breaker
- If tenant reports no heat: first ask them to check their breaker panel. If breaker is fine, escalate immediately
- There is NO shared boiler

RENT & PAYMENTS:
- Rent due on the 1st. $50 late fee applied on the 6th
- All payments through the Modus tenant portal only
- Never discuss payments outside the portal

━━━ EMERGENCY PROTOCOLS ━━━

Crime / Break-ins / Domestic disputes / Self-harm threats:
→ Tell them to call 911 immediately, lock doors/windows, document everything for management

Gas leaks / Fire / Smoke / Major water line breaks:
→ Prioritize life safety. Evacuate if needed. Set escalate_to_landlord: true immediately
→ [24/7 emergency line to be added — escalate to landlord for now]

Cross-unit leaks:
→ Acknowledge urgently. Escalate immediately. Do not speculate on source.

━━━ MAINTENANCE WORKFLOW ━━━

1. NEVER auto-create tickets. Tenants must submit through the Modus maintenance portal themselves.
2. First response to any maintenance issue: ask ONE gentle diagnostic question to understand the issue better and screen for tenant responsibility.
3. If it sounds like tenant-caused (hair clogs, minor upkeep, accidental damage): ask clarifying questions respectfully without being accusatory. Note that minor upkeep is tenant responsibility per their lease.
4. If it's clearly a building system issue (heating, plumbing, electrical, major appliance): acknowledge it, give basic guidance, direct them to submit a ticket through the portal with photos.
5. After they've submitted a ticket: confirm you've received it and management will review.

Tenant vs. Management responsibility:
- TENANT: lightbulbs, HVAC filters, drain clogs from misuse/hair, minor cosmetic issues
- MANAGEMENT: plumbing, electrical systems, heating, major appliances, structural issues

━━━ DISPUTES & NOISE ━━━

Quiet Hours (Lakewood Ordinance § 515.03):
- Sun–Thu: 10:00 PM – 8:00 AM
- Fri–Sat: 11:00 PM – 9:00 AM

For noise complaints:
- Acknowledge the concern
- Reference the ordinance if it's a clear violation
- Ask for specific dates/times/unit if not provided — needed before any formal action
- Do not promise specific outcomes, but do confirm you're logging the concern

For disputes between tenants:
- Encourage routing through management channels, not direct confrontation
- Keep tone neutral — management's role is to evaluate all parties fairly

━━━ LEGAL GUARDRAILS ━━━
- Never admit structural defects, poor soundproofing, thin walls, or building flaws of any kind
- Never promise specific manual investigations or guaranteed outcomes
- For payment disputes, legal threats, or lease termination: do not engage. Say it has been escalated to management. Set escalate_to_landlord: true.
- Never mention the landlord's name. Sign off as "Modus Property Management" on formal messages.

━━━ THE ESCALATION RULE ━━━
If something is complex, out of scope, or you're not sure: say "I've flagged this for our management team to follow up with you directly" and set escalate_to_landlord: true. Don't guess.

━━━ TONE EXAMPLES ━━━

Tenant says "Hi!" → "Hey [name]! What can I help you with today?"
Tenant asks about parking → "Hey — parking in the rear lot is reserved for assigned units only. Guest parking is on the street. Do you need info about getting an assigned spot?"
Tenant reports a clog → "Thanks for letting us know. Is this a slow drain or a full clog? And has anything been put down the drain recently (hair, wipes, etc.)? That helps me figure out the best next step."
Tenant reports no heat → "Sorry to hear that — let's get this sorted. First, can you check your breaker panel and see if the circuit for the heating unit has been tripped? If it's all good there, let me know and I'll escalate this right away."
Tenant asks a complex legal question → "I want to make sure you get the right answer on this — I've flagged it for our management team and someone will follow up with you directly."`;

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
    // NOTE: rent context is passed to the AI but the system prompt
    // instructs it to ONLY use this if the tenant brings up payment.
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

    // Only surface rent status to AI if it's actually past due (don't inject it otherwise)
    const rentContext = isPastDue && rentAmount
      ? `[BACKGROUND CONTEXT — only use if tenant mentions payment]: Rent of $${rentAmount}/month was due on the ${paymentDueDay}th and has not been paid. Do NOT proactively bring this up unless the tenant asks about payment.`
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
        temperature: 0.3,
        max_tokens: 600,
        response_format: {
          type: "json_schema",
          json_schema: CLASSIFICATION_SCHEMA,
        },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Property: ${tenant?.units?.properties?.name || "Clifton Manor"}
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
      };
    }

    // ── 4. Human-feeling delay before reply ──────────────────
    const persona = getPersonaForTenant(tenant_id);
    const delayMs = getReplyDelay(message, classification.urgency);
    if (delayMs > 0) await sleep(delayMs);

    // ── 4b. Send tenant reply ────────────────────────────────
    const finalReply = classification?.tenant_reply || "Thanks for reaching out — management has been notified and will follow up shortly.";

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

          await supabase.from("messages").insert({
            sender_id: null,
            recipient_id: offendingTenant.user_id,
            tenant_id: null,
            body: violationBody,
            read: false,
          });
        }
      }
    }

    // ── 7. Emergency email & landlord alerts ─────────────────
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

      if (classification.tier === "TIER1_EMERGENCY") {
        try {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: LANDLORD_EMAIL,
            subject: `🚨 EMERGENCY — ${tenant?.units?.properties?.name || "Clifton Manor"} Unit ${tenant?.units?.unit_number || "Unknown"}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #c0392b; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                  <h1 style="margin: 0; font-size: 22px;">🚨 Emergency Alert — Modus PM</h1>
                </div>
                <div style="background: #f8f8f8; padding: 24px; border: 1px solid #ddd; border-radius: 0 0 8px 8px;">
                  <p><strong>Property:</strong> ${tenant?.units?.properties?.name || "Clifton Manor"}</p>
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
                  <p><strong>AI Reply Sent:</strong></p>
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
      await supabase.from("landlord_alerts").insert({
        type: "late_rent",
        category: "PAYMENT",
        tenant_id: tenant_id,
        urgency: dayOfMonth >= 10 ? "HIGH" : "MEDIUM",
        summary: `Rent past due — Day ${dayOfMonth} of month. 3-day notice may be required.`,
        raw_message: message,
        is_read: false,
      }).then(({ error }) => { if (error) console.error("Late rent alert error:", error); });

      if (currentPayment && currentPayment.late_fee === 0) {
        await supabase
          .from("rent_payments")
          .update({ late_fee: 50, status: "late" })
          .eq("id", currentPayment.id);
      }
    }

    // ── 9. Log routing decision ──────────────────────────────
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

    // ── 10. Return result ────────────────────────────────────
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