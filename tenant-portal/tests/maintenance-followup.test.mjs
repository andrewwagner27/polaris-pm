// tests/maintenance-followup.test.mjs
// Maintenance coordination: default contractor, responsibility, completion follow-ups, contractor follow-up,
// duplicate and stale-response protection, isolation, and that nothing pays, approves or dispatches by itself.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fakeSupabase } from "./helpers/fakeSupabase.mjs";
import { defaultVendorFor, contractorContacts, responsibilityFor, isPreferredVendor } from "../src/lib/vendorRouting.js";
import { interpretCompletionReply, sweepCompletionFollowups, handleCompletionReply, appointmentEnd } from "../api/_lib/maintenanceFollowup.js";
import { applySafetyOverrides } from "../api/_lib/aiSafety.js";
import { failedTicketEmails } from "../api/_lib/dailyRecap.js";

const H = 60 * 60 * 1000;
const T0 = Date.parse("2026-11-22T15:00:00Z");
const ENV = { LANDLORD_EMAIL: "manager@test.invalid" };
const CLIFTON = "8376ebcd-9e68-4895-aeda-b7b8402868e8";
const TENANT = { id: "t1", name: "Pilot Tenant", email: "tenant@test.invalid", user_id: "u1", archived: false };
const OTHER = { id: "t2", name: "Other Tenant", email: "other@test.invalid", user_id: "u2", archived: false };
// Fictional 555-01xx numbers: real contractor numbers live only in the production vendor record.
const HANDYMAN = { id: "v1", name: "Handyman Contractor Services", phone: "+1 (216) 555-0181", email: null, category: "general", property_id: CLIFTON, active: true,
  notes: "#preferred routine + priority work\nBackup: +1 (813) 555-0182" };
const PLUMBER = { id: "v2", name: "Rob's Plumbing", phone: "(216) 555-0190", email: "rob@test.invalid", category: "plumbing", property_id: CLIFTON, active: true, notes: "" };

let clock, db, sent;
const send = async (args) => {
  if (sent.keys.has(args.idempotencyKey)) return { ok: true, data: { id: sent.keys.get(args.idempotencyKey) } };   // Resend: same key → original response
  const id = `re_${sent.list.length + 1}`; sent.keys.set(args.idempotencyKey, id); sent.list.push(args);
  return { ok: true, data: { id } };
};
const ticket = (over = {}) => ({ id: "11111111-1111-4111-8111-111111111111", tenant_id: "t1", title: "Kitchen faucet drips", description: "Slow drip", status: "in_progress",
  is_emergency: false, scheduled_date: "2026-11-21", scheduled_time: "Morning (8am–12pm)", vendor_name: null, vendor_email: null, vendor_token: null,
  quote_amount: null, quote_approved_at: null, invoice_url: null, invoice_amount: null, created_at: "2026-11-20T12:00:00Z", updated_at: "2026-11-21T12:00:00Z",
  tenants: TENANT, units: { unit_number: "2", property_id: CLIFTON, properties: { name: "Clifton Manor" } }, ...over });
const run = (extra = {}) => sweepCompletionFollowups({ db, send, env: ENV, now: () => clock, retryDelayMs: 0, ...extra });
const reply = (message, tenantId = "t1") => handleCompletionReply({ db, send, env: ENV, tenantId, message, now: () => clock, retryDelayMs: 0 });
const notes = (id = ticket().id) => db.tables.maintenance_comments.filter((c) => c.request_id === id).map((c) => c.body);
const tenantMsgs = () => db.tables.messages.filter((m) => m.agent_name);
const toManagement = () => sent.list.filter((e) => e.to.includes("manager@test.invalid"));

beforeEach(() => {
  clock = T0; sent = { list: [], keys: new Map() };
  fakeSupabase.now = () => clock;
  db = fakeSupabase({ maintenance_requests: [], maintenance_comments: [], messages: [], vendors: [HANDYMAN, PLUMBER] });
});

describe("default contractor and responsibility", () => {
  test("Handyman is the default for routine and priority landlord work; primary first, backup kept for management", () => {
    assert.ok(isPreferredVendor(HANDYMAN)); assert.ok(!isPreferredVendor(PLUMBER));
    assert.equal(defaultVendorFor([PLUMBER, HANDYMAN], { title: "Toilet keeps running" })?.name, HANDYMAN.name);
    assert.equal(defaultVendorFor([PLUMBER, HANDYMAN], { title: "The bathroom door sticks" })?.name, HANDYMAN.name);
    // Owner-operated routing: a heating outage needs a qualified heating specialist, never a pre-selected handyman.
    assert.notEqual(defaultVendorFor([PLUMBER, HANDYMAN], { title: "No heat" })?.name, HANDYMAN.name);
    assert.deepEqual(contractorContacts(HANDYMAN), { primary: "+1 (216) 555-0181", backup: "+1 (813) 555-0182" });
  });
  test("emergencies and tenant lock-outs get no default contractor (separate pathways)", () => {
    for (const t of [{ title: "Burst pipe, water spraying" }, { title: "I smell gas" }, { title: "leak", is_emergency: true }, { title: "I lost my keys" }]) {
      assert.equal(defaultVendorFor([HANDYMAN], t), null, t.title);
    }
  });
  test("responsibility: lock-out = tenant; broken lock and running toilet = landlord; burst pipe = landlord even if tenant-caused; damage flag ≠ charge", () => {
    assert.equal(responsibilityFor({ title: "Locked my keys inside" }), "tenant");
    assert.equal(responsibilityFor({ title: "The deadbolt is jammed" }), "landlord");
    assert.equal(responsibilityFor({ title: "Toilet keeps running" }), "landlord");
    assert.equal(responsibilityFor({ title: "Burst pipe", billable_to_tenant: true }), "landlord", "safety repair is never withheld");
    assert.equal(responsibilityFor({ title: "Hole in the wall from moving furniture", billable_to_tenant: true }), "tenant_possible");
  });
  test("contractor phone numbers are not copied onto the tenant-readable ticket", () => {
    const modal = readFileSync(new URL("../src/AssignVendorModal.jsx", import.meta.url), "utf8");
    assert.match(modal, /vendor_name: name, vendor_phone: null/);
  });
  test("the tenant form explains lock-outs before creating a work order", () => {
    const form = readFileSync(new URL("../src/MaintenanceRequestForm.jsx", import.meta.url), "utf8");
    assert.match(form, /responsibilityFor\(\{ title, description \}\) === "tenant"\) \{ setLockoutNotice\(true\); return; \}/);
  });
});

describe("tenant replies are understood", () => {
  for (const [m, o] of [["Yes, he fixed it.", "fixed"], ["Everything works now.", "fixed"], ["Nobody showed up.", "no_show"],
    ["The plumber came, but it's still leaking.", "not_fixed"], ["He said he'd be back tomorrow.", "return_visit"], ["it works again", "fixed"],
    ["it's leaking again", "not_fixed"], ["no", "not_fixed"], ["ok", "unclear"], ["he came", "unclear"]]) {
    test(`"${m}" → ${o}`, () => assert.equal(interpretCompletionReply(m), o));
  }
});

describe("follow-up schedule", () => {
  test("scheduled visit passed → one check (portal + email); no repeat; reminder after 24 h; flag after another 24 h; never closed", async () => {
    db.tables.maintenance_requests.push(ticket());
    clock = appointmentEnd("2026-11-21", "Morning (8am–12pm)") - H;
    assert.equal((await run()).asked, 0, "not before the window ends");
    clock = T0;
    assert.equal((await run()).asked, 1);
    assert.equal(tenantMsgs().length, 1); assert.match(tenantMsgs()[0].body, /Is it fully fixed\?/);
    assert.equal(sent.list.length, 1); assert.deepEqual(sent.list[0].to, ["tenant@test.invalid"]);
    await run(); await run();                                               // overlapping / repeated runs
    assert.equal(tenantMsgs().length, 1); assert.equal(sent.list.length, 1);
    clock = T0 + 23 * H; assert.equal((await run()).reminded, 0);
    clock = T0 + 25 * H; assert.equal((await run()).reminded, 1); assert.match(tenantMsgs()[1].body, /^Reminder:/);
    await run(); assert.equal(tenantMsgs().length, 2, "exactly one reminder");
    clock = T0 + 50 * H; assert.equal((await run()).flagged, 1);
    assert.equal(toManagement().length, 1); assert.match(toManagement()[0].subject, /No reply to completion check/);
    clock = T0 + 200 * H; await run();
    assert.equal(tenantMsgs().length, 2); assert.equal(toManagement().length, 1, "no further messages");
    assert.equal(db.tables.maintenance_requests[0].status, "in_progress", "never auto-closed");
  });
  test("contractor reports completion → the tenant is asked immediately (the vendor action triggers it)", async () => {
    db.tables.maintenance_requests.push(ticket({ status: "pending_review", vendor_name: HANDYMAN.name, vendor_token: "tok" }));
    db.tables.maintenance_comments.push({ id: "c-done-1", request_id: ticket().id, author_type: "vendor", body: "Handyman marked work as complete and submitted for review.", created_at: new Date(T0 - 5 * 60 * 1000).toISOString() });
    assert.equal((await run({ ticketId: ticket().id })).asked, 1);
    assert.match(tenantMsgs()[0].body, /marked your repair as complete/);
    const vt = readFileSync(new URL("../api/vendor-ticket.js", import.meta.url), "utf8");
    assert.match(vt, /sweepCompletionFollowups\(\{ db: supabase, send: notifyDeps\.send, env: process\.env, ticketId: ticket\.id \}\)/);
  });
  test("archived tenants and tickets without a cycle are skipped; a tenant sweep only touches that tenant", async () => {
    db.tables.maintenance_requests.push(ticket(), ticket({ id: "22222222-2222-4222-8222-222222222222", tenant_id: "t2", tenants: OTHER }),
      ticket({ id: "33333333-3333-4333-8333-333333333333", status: "open" }));
    assert.equal((await run({ tenantId: "t1" })).asked, 1);
    assert.deepEqual(tenantMsgs().map((m) => m.tenant_id), ["t1"]);
  });
});

describe("tenant answers", () => {
  async function asked(over = {}) { db.tables.maintenance_requests.push(ticket(over)); await run(); sent.list.length = 0; sent.keys.clear(); }

  test("confirms fixed (no contractor link, no invoice) → recorded and closed; history kept", async () => {
    await asked();
    const r = await reply("Yes, he fixed it.");
    assert.equal(r.outcome, "fixed"); assert.match(r.reply, /closed/);
    assert.equal(db.tables.maintenance_requests[0].status, "resolved");
    assert.ok(notes().some((n) => n.includes("answered:fixed")) && notes().some((n) => n.includes("asked")));
  });
  test("confirms fixed on a contractor ticket → NOT closed or approved; management reviews (no expense, no invoice approval)", async () => {
    await asked({ vendor_name: HANDYMAN.name, vendor_token: "tok", invoice_url: "x/invoice-1-a.pdf", invoice_amount: 120 });
    const r = await reply("Everything works now.");
    const t = db.tables.maintenance_requests[0];
    assert.equal(t.status, "in_progress"); assert.equal(t.quote_approved_at, null);
    assert.match(r.reply, /let management know/);
    assert.equal(toManagement().length, 1); assert.match(toManagement()[0].html, /did not approve anything/);
    assert.equal(db.tables.expenses, undefined, "no expense is logged");
  });
  test("emergency tickets are never closed by a tenant reply", async () => {
    await asked({ is_emergency: true, title: "Burst pipe" });
    await reply("all good now");
    assert.equal(db.tables.maintenance_requests[0].status, "in_progress");
    assert.match(toManagement()[0].html, /never closed automatically/);
  });
  test("contractor never arrived → reopened, management gets primary then backup and a draft (nothing sent to the phone numbers)", async () => {
    await asked({ status: "in_progress", vendor_name: HANDYMAN.name });
    const r = await reply("Nobody showed up.");
    assert.equal(r.outcome, "no_show");
    const m = toManagement()[0];
    assert.match(m.subject, /Contractor didn't arrive/);
    assert.match(m.text, /primary \+1 \(216\) 555-0181, backup \+1 \(813\) 555-0182 \(backup only if the primary is unavailable\)/);
    assert.match(m.text, /Suggested message \(not sent\)/);
    assert.equal(sent.list.length, 1, "only management is emailed (the contractor has no portal email)");
  });
  test("still not fixed → back in progress; contractor told via the existing vendor-portal email; no new spending approved", async () => {
    await asked({ status: "pending_review", vendor_name: PLUMBER.name, vendor_email: PLUMBER.email, vendor_token: "tok", scheduled_date: null });
    db.tables.maintenance_comments.push({ id: "c-done-2", request_id: ticket().id, author_type: "vendor", body: "Rob marked work as complete.", created_at: new Date(T0 - H).toISOString() });
    await run(); sent.list.length = 0;
    const r = await reply("The plumber came, but it's still leaking.");
    assert.equal(r.outcome, "not_fixed");
    assert.equal(db.tables.maintenance_requests[0].status, "in_progress");
    const toVendor = sent.list.find((e) => e.to.includes(PLUMBER.email));
    assert.ok(toVendor); assert.match(toVendor.text, /No additional work is approved/);
    assert.ok(toManagement().length === 1);
    assert.equal(db.tables.maintenance_requests[0].quote_approved_at, null);
  });
  test("contractor coming back → recorded, management asked to confirm the new date", async () => {
    await asked();
    const r = await reply("He said he'd be back tomorrow.");
    assert.equal(r.outcome, "return_visit"); assert.match(toManagement()[0].subject, /Contractor returning/);
    assert.equal(db.tables.maintenance_requests[0].status, "in_progress");
  });
  test("ambiguous answer → clarifying question, nothing changes", async () => {
    await asked();
    const r = await reply("he came");
    assert.equal(r.outcome, "unclear"); assert.match(r.reply, /is it fully fixed now/);
    assert.equal(db.tables.maintenance_requests[0].status, "in_progress"); assert.equal(sent.list.length, 0);
    assert.equal(await reply("When is rent due?"), null, "unrelated messages go to the normal assistant");
  });
  test("a second failed cycle is flagged as repeatedly unresolved", async () => {
    await asked({ vendor_name: HANDYMAN.name });
    await reply("still leaking");
    db.tables.maintenance_requests[0].scheduled_date = "2026-11-22"; db.tables.maintenance_requests[0].scheduled_time = "Morning (8am–12pm)";
    clock = Date.parse("2026-11-22T18:00:00Z"); await run();
    await reply("still leaking");
    assert.match(toManagement().at(-1).subject, /Repeatedly unresolved/);
  });
});

describe("stale responses, duplicates and isolation", () => {
  test("an old 'fixed' can't close a reopened ticket (no open check for the new cycle)", async () => {
    db.tables.maintenance_requests.push(ticket()); await run();
    await reply("still broken");                                 // reopened; this cycle is answered
    assert.equal(await reply("Yes, it's fixed"), null, "no open check → normal assistant, ticket untouched");
    assert.equal(db.tables.maintenance_requests[0].status, "in_progress");
  });
  test("a reply is applied once: the same cycle can't be answered twice", async () => {
    db.tables.maintenance_requests.push(ticket({ vendor_name: HANDYMAN.name })); await run();
    await reply("Nobody showed up."); const n = sent.list.length;
    assert.equal(await reply("Nobody showed up."), null);
    assert.equal(sent.list.length, n);
  });
  test("a tenant's answer never touches another tenant's ticket", async () => {
    db.tables.maintenance_requests.push(ticket({ id: "22222222-2222-4222-8222-222222222222", tenant_id: "t2", tenants: OTHER })); await run();
    assert.equal(await reply("Yes, fixed", "t1"), null);
    assert.equal(db.tables.maintenance_requests[0].status, "in_progress");
  });
  test("two open checks → the tenant is asked which one; nothing changes", async () => {
    db.tables.maintenance_requests.push(ticket(), ticket({ id: "44444444-4444-4444-8444-444444444444", title: "Bathroom fan noisy" })); await run();
    const r = await reply("Yes, fixed");
    assert.equal(r.outcome, "which"); assert.ok(db.tables.maintenance_requests.every((t) => t.status === "in_progress"));
  });
  test("follow-up markers never hide a failed email in the recap", () => {
    const sys = { author_type: "system", author_name: "Modus notifications", author_id: null, request_id: "r1" };
    const out = failedTicketEmails([{ ...sys, body: "Email FAILED — x", created_at: "2026-11-22T10:00:00Z" }, { ...sys, body: "[followup appt:x asked] Asked…", created_at: "2026-11-22T11:00:00Z" }]);
    assert.equal(out.length, 1);
  });
});

describe("emergencies and dispatch stay separate", () => {
  test("an emergency reply never goes through completion handling (route checks detectEmergency first)", () => {
    const api = readFileSync(new URL("../api/classify-and-route.js", import.meta.url), "utf8");
    assert.match(api, /if \(!detectEmergency\(message\)\) \{\s*try \{\s*completionFollowup = await handleCompletionReply/);
  });
  test("mixed: 'it's still leaking and now water is pouring through the ceiling' is an emergency, not a follow-up", () => {
    const c = applySafetyOverrides({ tier: "TIER3_MAINTENANCE", tenant_reply: "ok" }, "It's still leaking and now water is pouring through the ceiling");
    assert.equal(c.tier, "TIER1_EMERGENCY");
  });
  test("AI vendor dispatch remains off by default; nothing in the follow-up module dispatches or pays", () => {
    const api = readFileSync(new URL("../api/classify-and-route.js", import.meta.url), "utf8");
    assert.match(api, /classification\.dispatch_vendor && ticketId && aiVendorDispatchEnabled\(\)/);
    const fu = readFileSync(new URL("../api/_lib/maintenanceFollowup.js", import.meta.url), "utf8");
    assert.doesNotMatch(fu, /dispatchVendor|expenses|quote_approved_at:|stripe|payment_intent/i);
  });
});
