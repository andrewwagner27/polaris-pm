// tests/maintenance-e2e.test.mjs
// One routine repair from submission to tenant-confirmed completion, through the real modules and the real vendor
// portal API handlers (api/vendor-verify-pin.js, api/vendor-ticket.js) on an in-memory database. No network.
// Also: overlapping sweeps, failed email delivery, and who is (not) notified.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
process.env.VENDOR_SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";
process.env.LANDLORD_EMAIL = "manager@test.invalid";

const { fakeSupabase } = await import("./helpers/fakeSupabase.mjs");
const { supabaseAdmin } = await import("../api/_lib/auth.js");
const verifyPin = (await import("../api/vendor-verify-pin.js")).default;
const vendorTicketMod = await import("../api/vendor-ticket.js");
const vendorTicket = vendorTicketMod.default;
const { maintenanceCreated } = await import("../api/_lib/maintenanceNotify.js");
const { sweepCompletionFollowups, handleCompletionReply } = await import("../api/_lib/maintenanceFollowup.js");
const { applySafetyOverrides } = await import("../api/_lib/aiSafety.js");
const { needsNotification } = await import("../api/_lib/escalationNotify.js");
const { defaultVendorFor } = await import("../src/lib/vendorRouting.js");
const { failedTicketEmails } = await import("../api/_lib/dailyRecap.js");

const CLIFTON = "8376ebcd-9e68-4895-aeda-b7b8402868e8";
const TID = "55555555-5555-4555-8555-555555555555";
const ENV = { LANDLORD_EMAIL: "manager@test.invalid" };
const TENANT = { id: "t1", name: "Pilot Tenant", email: "tenant@test.invalid", user_id: "u1", archived: false };
const HANDYMAN = { id: "v1", name: "Handyman Contractor Services", phone: "+1 (216) 555-0181", email: null, category: "general", property_id: CLIFTON, active: true, notes: "#preferred\nBackup: +1 (813) 555-0182" };

let db, sent, failNext;
const send = async (args) => {
  if (failNext > 0) { failNext--; return { ok: false, outcome: "rejected", status: 422, error: "validation_error" }; }
  if (sent.keys.has(args.idempotencyKey)) return { ok: true, data: { id: sent.keys.get(args.idempotencyKey) } };
  const id = `re_${sent.list.length + 1}`; sent.keys.set(args.idempotencyKey, id); sent.list.push(args); return { ok: true, data: { id } };
};
const call = (handler, body, headers = {}) => new Promise((resolve) => {
  const res = { statusCode: 200, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; resolve(this); return this; }, end() { resolve(this); return this; } };
  Promise.resolve(handler({ method: "POST", body, headers }, res)).then(() => resolve(res));
});
const toManagement = () => sent.list.filter((e) => e.to.includes("manager@test.invalid"));
const toTenant = () => sent.list.filter((e) => e.to.includes("tenant@test.invalid"));
const tenantMsgs = () => db.tables.messages.filter((m) => m.tenant_id === "t1" && m.agent_name);
const T = () => db.tables.maintenance_requests[0];

beforeEach(() => {
  sent = { list: [], keys: new Map() }; failNext = 0; fakeSupabase.now = () => Date.now();
  db = fakeSupabase({ maintenance_requests: [], maintenance_comments: [], messages: [], vendors: [HANDYMAN], tenants: [TENANT] });
  supabaseAdmin.from = db.from;
  vendorTicketMod.notifyDeps.send = send;
});

describe("routine repair, end to end", () => {
  test("submit → classify → Handyman → accept → complete → tenant asked → not fixed → contractor + management → complete again → confirmed", async () => {
    // 1–2. Tenant submits a routine request; the AI layer treats it as routine (no escalation, no alert).
    db.tables.maintenance_requests.push({ id: TID, tenant_id: "t1", unit_id: "un1", title: "Toilet keeps running", description: "Runs all night", category: "plumbing",
      priority: "normal", status: "open", is_emergency: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      tenants: TENANT, units: { unit_number: "2", property_id: CLIFTON, properties: { name: "Clifton Manor" } } });
    const ai = applySafetyOverrides({ tier: "TIER3_MAINTENANCE", urgency: "LOW", tenant_reply: "Thanks — please submit it in Maintenance.", escalate_to_landlord: false }, T().title);
    assert.equal(ai.severity, "ROUTINE"); assert.equal(needsNotification(ai), false);
    // 3. Management gets the ordinary new-request email (not emergency, not priority).
    const created = await maintenanceCreated({ db, send, env: ENV, caller: { role: "tenant", user: { id: "u1" } }, body: { ticket_id: TID }, retryDelayMs: 0 });
    assert.equal(created.status, "sent"); assert.equal(created.emergency, null);
    assert.match(toManagement()[0].subject, /^\[Action required\] 🔧 New maintenance request/);
    // 4. Handyman is the default; management assigns (link + PIN made by the landlord-only Edge Function; phone not copied).
    assert.equal(defaultVendorFor(db.tables.vendors, T())?.name, HANDYMAN.name);
    Object.assign(T(), { vendor_name: HANDYMAN.name, vendor_phone: null, vendor_token: "tok-e2e", vendor_pin: "2468",
      vendor_token_expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), status: "in_progress", scheduled_date: "2099-01-01", scheduled_time: "Morning (8am–12pm)" });
    // 5. Contractor signs in with link + PIN and accepts; 6. proposes a time in a comment (the visit date is management's field).
    const v = await call(verifyPin, { token: "tok-e2e", pin: "2468" });
    assert.equal(v.statusCode, 200, JSON.stringify(v.body));
    const H = { "x-vendor-session": v.body.session };
    assert.equal((await call(vendorTicket, { action: "accept_work_order", signature_name: "Handyman", vendor_email: "handyman@test.invalid" }, H)).statusCode, 200);
    assert.equal((await call(vendorTicket, { action: "comment", body: "Can come Friday 9am." }, H)).statusCode, 200);
    assert.equal(toTenant().length, 0, "nothing to the tenant before the work is reported done");
    // Spending stays a management decision: the contractor quotes, management approves (as LandlordMaintenance does).
    assert.equal((await call(vendorTicket, { action: "complete" }, H)).statusCode, 409, "can't complete before an approved quote");
    assert.equal((await call(vendorTicket, { action: "submit_quote", amount: 85, notes: "Flapper + labor" }, H)).statusCode, 200);
    assert.match(toManagement().at(-1).subject, /Quote/i);
    Object.assign(T(), { quote_approved_at: new Date().toISOString(), quote_approved_by: "Property Manager", status: "in_progress", nte_amount: 85 });
    // 7. Contractor marks the repair complete → 8. tenant asked right away (portal + email); management told work is done.
    assert.equal((await call(vendorTicket, { action: "complete", invoice_notes: "Replaced flapper" }, H)).statusCode, 200);
    assert.equal(T().status, "pending_review");
    assert.equal(tenantMsgs().length, 1); assert.match(tenantMsgs()[0].body, /marked your repair as complete/);
    assert.equal(toTenant().length, 1); assert.match(toTenant()[0].subject, /Is it fixed\?/);
    const mgmtAfterComplete = toManagement().length;
    // 9–11. Tenant: still not fixed → reopened, contractor emailed via the vendor portal, management told with a draft.
    const r1 = await handleCompletionReply({ db, send, env: ENV, tenantId: "t1", message: "The plumber came, but it's still running.", retryDelayMs: 0 });
    assert.equal(r1.outcome, "not_fixed"); assert.equal(T().status, "in_progress");
    assert.ok(sent.list.some((e) => e.to.includes("handyman@test.invalid") && /No additional work is approved/.test(e.text)));
    assert.equal(toManagement().length, mgmtAfterComplete + 1); assert.match(toManagement().at(-1).subject, /Repair not fixed/);
    // Contractor returns and completes again → a NEW check (new cycle) → tenant confirms.
    assert.equal((await call(vendorTicket, { action: "complete", invoice_notes: "Replaced fill valve" }, H)).statusCode, 200);
    assert.equal(tenantMsgs().length, 2, "asked again for the new completion");
    const r2 = await handleCompletionReply({ db, send, env: ENV, tenantId: "t1", message: "Yes, he fixed it.", retryDelayMs: 0 });
    // 10. Contractor ticket: confirmation recorded, management approves as usual (no auto-approval, no expense).
    assert.equal(r2.outcome, "fixed"); assert.equal(T().status, "pending_review");
    assert.match(toManagement().at(-1).subject, /Tenant confirmed the repair/);
    assert.equal(db.tables.expenses, undefined);
    // 12. Management was emailed only for: new request, quote, 2× work complete, not fixed, confirmed.
    const kinds = toManagement().map((e) => /New maintenance request/.test(e.subject) ? "new" : /quote/i.test(e.subject) ? "quote"
      : /Repair not fixed/.test(e.subject) ? "not_fixed" : /Tenant confirmed/.test(e.subject) ? "confirmed" : /complete/i.test(e.subject) ? "complete" : e.subject);
    assert.deepEqual(kinds, ["new", "quote", "complete", "not_fixed", "complete", "confirmed"]);
    // A late duplicate "fixed" changes nothing (the check is answered).
    assert.equal(await handleCompletionReply({ db, send, env: ENV, tenantId: "t1", message: "fixed!", retryDelayMs: 0 }), null);
  });
});

describe("reliability", () => {
  const ticket = (over = {}) => ({ id: TID, tenant_id: "t1", title: "Bathroom fan noisy", status: "in_progress", is_emergency: false,
    scheduled_date: "2026-11-01", scheduled_time: "Morning (8am–12pm)", created_at: "2026-10-30T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
    tenants: TENANT, units: { unit_number: "2", property_id: CLIFTON, properties: { name: "Clifton Manor" } }, ...over });
  const now = () => Date.parse("2026-11-02T15:00:00Z");
  test("overlapping sweeps (page load + cron at the same moment) ask the tenant exactly once", async () => {
    db.tables.maintenance_requests.push(ticket());
    await Promise.all([1, 2, 3].map(() => sweepCompletionFollowups({ db, send, env: ENV, now, retryDelayMs: 0 })));
    assert.equal(tenantMsgs().length, 1); assert.equal(toTenant().length, 1);
  });
  test("overlapping tenant replies: only one is applied", async () => {
    db.tables.maintenance_requests.push(ticket()); await sweepCompletionFollowups({ db, send, env: ENV, now, retryDelayMs: 0 });
    const rs = await Promise.all(["Nobody showed up", "still broken"].map((m) => handleCompletionReply({ db, send, env: ENV, tenantId: "t1", message: m, now, retryDelayMs: 0 })));
    assert.equal(rs.filter(Boolean).length, 1);
    assert.equal(toManagement().length, 1);
  });
  test("a failed email is recorded on the ticket and surfaces in the recap; the portal message still goes out; nothing is resent blindly", async () => {
    db.tables.maintenance_requests.push(ticket()); failNext = 1;
    await sweepCompletionFollowups({ db, send, env: ENV, now, retryDelayMs: 0 });
    assert.equal(tenantMsgs().length, 1, "portal message delivered");
    const failures = failedTicketEmails(db.tables.maintenance_comments.map((c) => ({ ...c })));
    assert.equal(failures.length, 1); assert.match(failures[0].body, /Email FAILED — completion check to tenant/);
    await sweepCompletionFollowups({ db, send, env: ENV, now, retryDelayMs: 0 });
    assert.equal(tenantMsgs().length, 1, "no duplicate on the next sweep");
  });
  test("transient provider errors are retried inside one send (same idempotency key)", async () => {
    db.tables.maintenance_requests.push(ticket());
    let calls = 0;
    const flaky = async (args) => { calls++; if (calls === 1) return { ok: false, outcome: "retryable", status: 500, error: "server" }; return send(args); };
    await sweepCompletionFollowups({ db, send: flaky, env: ENV, now, retryDelayMs: 0 });
    assert.equal(calls, 2); assert.equal(toTenant().length, 1);
  });
});
