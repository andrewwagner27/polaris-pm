// tests/owner-routing.test.mjs
// Owner-operated routing for the first-tenant pilot (api/_lib/ownerRouting.js and its callers): specialists vs the
// preferred handyman, property-operations and incident reports, liability-safe replies, notification classes.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { specialistFor, ownerTopic, approvedProviderFor, noticeTag, LIABILITY_WORDING, INCIDENT_TENANT_NOTE, OPERATIONS_TENANT_NOTE } from "../api/_lib/ownerRouting.js";
import { defaultVendorFor } from "../src/lib/vendorRouting.js";
import { applySafetyOverrides } from "../api/_lib/aiSafety.js";
import { needsNotification, escalationReason, buildEscalationEmail } from "../api/_lib/escalationNotify.js";
import * as T from "../api/_lib/notificationTemplates.js";

const HANDYMAN = { id: "h", name: "Handyman Contractor Services", category: "general", active: true, phone: "+1 (216) 555-0100", notes: "#preferred\nBackup: +1 (813) 555-0101" };
const PLUMBER = { id: "p", name: "Rapid Plumbing", category: "plumbing", active: true };
const ELECTRICIAN = { id: "e", name: "Volt Electric", category: "electrical", active: true };
const t = (title, extra = {}) => ({ title, description: "", ...extra });
const model = (reply = "Thanks, I've passed this on.") => ({ tier: "TIER3_MAINTENANCE", urgency: "LOW", tenant_reply: reply, escalate_to_landlord: false, create_incident_log: false, dispatch_vendor: true });

describe("1. routine / priority landlord work → preferred handyman", () => {
  for (const title of ["My toilet keeps running", "The kitchen faucet drips slowly", "Loose cabinet handle in the kitchen", "The leak under the sink is getting worse"]) {
    test(title, () => assert.equal(defaultVendorFor([HANDYMAN, PLUMBER], t(title, { category: "plumbing" }))?.id, "h"));
  }
});

describe("2/4. emergencies and specialized hazards never default to the handyman", () => {
  const cases = [
    ["A pipe burst under the sink and water is spraying", "plumber", true],
    ["I see sparks coming from the outlet", "electrician", true],
    ["I smell gas in the kitchen", "gas", true],
    ["No heat and I have a newborn", "hvac", true],
    ["The ceiling collapsed in the bedroom", "structural", true],
    ["The heat isn't working", "hvac", false],
    ["No hot water since this morning", "plumber", false],
    ["Power went out in half the apartment", "electrician", false],
  ];
  for (const [title, trade, emergency] of cases) {
    test(title, () => {
      const s = specialistFor(t(title));
      assert.equal(s?.trade, trade);
      assert.equal(s?.emergency, emergency);
      assert.notEqual(defaultVendorFor([HANDYMAN], t(title))?.id, "h");
    });
  }
  test("an approved provider of the right trade is suggested instead (non-emergency)", () => {
    assert.equal(defaultVendorFor([HANDYMAN, PLUMBER], t("No hot water since this morning"))?.id, "p");
    assert.equal(defaultVendorFor([HANDYMAN, ELECTRICIAN], t("Power went out in half the apartment"))?.id, "e");
  });
  test("emergencies keep no default at all (emergency pathway)", () => {
    assert.equal(defaultVendorFor([HANDYMAN, PLUMBER], t("A pipe burst under the sink and water is spraying")), null);
  });
  test("Electrical / Heat-AC requests need a specialist unless explicitly minor", () => {
    assert.equal(specialistFor(t("Outlet in the bedroom stopped working", { category: "electrical" }))?.trade, "electrician");
    assert.equal(specialistFor(t("AC isn't cooling", { category: "hvac" }))?.trade, "hvac");
    assert.equal(specialistFor(t("Light bulb is out in the hall closet", { category: "electrical" })), null);
  });
  test("approvedProviderFor ignores inactive vendors", () => {
    assert.equal(approvedProviderFor([{ ...PLUMBER, active: false }], "plumber"), null);
  });
});

describe("5. tenant responsibility (lock-outs) unchanged", () => {
  test("lost keys → no work order default, no escalation", () => {
    assert.equal(defaultVendorFor([HANDYMAN], t("I lost my keys")), null);
    const c = applySafetyOverrides(model(), "I lost my keys and I'm locked out");
    assert.equal(c.create_maintenance_ticket, false);
    assert.equal(c.escalate_to_landlord, false);
  });
});

describe("6. property operations", () => {
  const ops = [
    ["Someone keeps parking in my spot", "parking"],
    ["Can you tow the car blocking the driveway?", "parking"],
    ["The dumpster is overflowing again", "trash"],
    ["Trash hasn't been picked up in two weeks", "trash"],
    ["The hallway light by the stairwell is out", "common_area"],
    ["Ice on the front walkway hasn't been salted", "common_area"],
  ];
  for (const [msg, kind] of ops) {
    test(msg, () => {
      const o = ownerTopic(msg);
      assert.equal(o?.topic, "operations");
      assert.equal(o?.kind, kind);
      assert.equal(defaultVendorFor([HANDYMAN], t(msg)), null, "handyman is never auto-assigned");
      const c = applySafetyOverrides(model(), msg);
      assert.equal(c.escalate_to_landlord, true);
      assert.equal(c.dispatch_vendor, false);
      assert.equal(needsNotification(c), true);
    });
  }
  test("a reply that offers towing is replaced", () => {
    const c = applySafetyOverrides(model("No problem, I'll have it towed tonight."), "Can you tow the car blocking the driveway?");
    assert.equal(c.tenant_reply, OPERATIONS_TENANT_NOTE);
  });
  test("operations reports are recorded as an owner-action item (incident log), never a work order", () => {
    const c = applySafetyOverrides(model(), "The dumpster is overflowing again");
    assert.equal(c.create_incident_log, true);
    assert.notEqual(c.create_maintenance_ticket, true);
    assert.equal(c.owner_topic_kind, "trash");
  });
  test("the approved parking-policy wording is kept; the old towing promise is gone from the prompt", async () => {
    const policy = "Management will review the issue and determine appropriate action. Unauthorized vehicles may be subject to towing in accordance with posted parking rules and applicable law.";
    assert.equal(applySafetyOverrides(model(policy), "Someone keeps parking in my spot").tenant_reply, policy);
    const { readFileSync } = await import("node:fs");
    const prompt = readFileSync(new URL("../api/_lib/aiPrompt.js", import.meta.url), "utf8");
    assert.ok(!/immediate towing|owner's expense/i.test(prompt));
    assert.ok(prompt.includes("Unauthorized vehicles may be subject to towing in accordance with posted parking rules and applicable law."));
  });
  test("questions about the rules are not complaints (no owner email)", () => {
    for (const q of ["Where is guest parking?", "Do I have an assigned parking spot?", "Can I use the laundry room on Sunday?", "What day is trash pickup?"]) {
      assert.equal(ownerTopic(q), null, q);
    }
  });
  test("not operations: garbage disposal, ordinary repairs", () => {
    assert.equal(ownerTopic("The garbage disposal smells"), null);
    assert.equal(ownerTopic("My toilet keeps running"), null);
    assert.equal(ownerTopic("The kitchen faucet drips slowly"), null);
  });
});

describe("7. incidents and injuries", () => {
  test("injury reports are incidents, escalated and logged", () => {
    for (const msg of ["My son slipped on the stairs yesterday", "A dog bit my daughter in the parking lot", "Someone hit my car in the lot", "My package was stolen from the porch"]) {
      assert.equal(ownerTopic(msg)?.topic, "incident", msg);
      const c = applySafetyOverrides(model(), msg);
      assert.equal(c.create_incident_log, true, msg);
      assert.equal(c.escalate_to_landlord, true, msg);
    }
  });
  test("a current injury still gets 911 guidance first", () => {
    const c = applySafetyOverrides(model(), "I fell on the ice outside and hit my head");
    assert.equal(c.tier, "TIER1_EMERGENCY");
    assert.match(c.tenant_reply, /911/);
    assert.equal(c.owner_topic, "incident");
  });
  test("a reply admitting fault or promising compensation is never sent", () => {
    for (const reply of ["We're so sorry, we will reimburse your medical bills.", "That's our fault and we'll pay for the damage.", "The landlord will compensate you."]) {
      assert.ok(LIABILITY_WORDING.test(reply), reply);
      const c = applySafetyOverrides(model(reply), "My son slipped on the stairs yesterday");
      assert.equal(c.tenant_reply, INCIDENT_TENANT_NOTE);
    }
    assert.ok(!LIABILITY_WORDING.test(INCIDENT_TENANT_NOTE));
  });
  test("escalation reason names the incident", () => {
    const c = applySafetyOverrides(model(), "My son slipped on the stairs yesterday");
    assert.match(escalationReason(c), /Incident or injury report/);
  });
});

describe("notification classes", () => {
  const ticket = { title: "x", propertyName: "Clifton Manor", unitNumber: "1" };
  test("emergency → urgent safety; new work order, ops, incident → action required; tenant reply → FYI", () => {
    assert.ok(T.maintenanceCreatedEmail({ ticket, emergency: { kind: "water", lifeSafety: false } }).subject.startsWith(noticeTag("urgent_safety")));
    assert.ok(T.maintenanceCreatedEmail({ ticket }).subject.startsWith(noticeTag("action_required")));
    const ops = T.maintenanceCreatedEmail({ ticket, topic: { topic: "operations", reason: "Parking or vehicle issue" } });
    assert.ok(ops.subject.startsWith("[Action required]"));
    assert.match(ops.text, /No contractor was assigned and no towing/);
    assert.match(T.maintenanceCreatedEmail({ ticket, topic: { topic: "incident", reason: "Incident" } }).text, /nothing about fault, liability or compensation/);
    assert.ok(T.tenantReplyEmail({ ticket, tenantName: "A", commentBody: "hi" }).subject.startsWith("[FYI]"));
    const esc = { propertyName: "Clifton Manor", unitNumber: "1", tenantName: "A", message: "m", reply: "r", reason: "x", intent: "i" };
    assert.ok(buildEscalationEmail({ ...esc, emergency: true }).subject.startsWith("[Urgent safety]"));
    assert.ok(buildEscalationEmail({ ...esc, emergency: false }).subject.startsWith("[Action required]"));
  });
  test("emergency with no approved provider says so", () => {
    const e = T.maintenanceCreatedEmail({ ticket, emergency: { kind: "water", lifeSafety: false }, specialist: { label: "licensed plumber", emergency: true }, noProvider: true });
    assert.match(e.text, /No approved emergency provider is on file/);
  });
  test("no phone number is invented in tenant-facing notes", () => {
    for (const s of [INCIDENT_TENANT_NOTE, OPERATIONS_TENANT_NOTE]) assert.ok(!/\d{3}[^\d]{0,3}\d{3}[^\d]{0,3}\d{4}/.test(s));
  });
});
