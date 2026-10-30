// tests/vendor-portal.test.mjs
// Run: npm test   (node --test tests/)
// Exercises api/vendor-verify-pin.js, api/vendor-ticket.js and api/_lib/vendorSession.js
// against an in-memory fake of the Supabase service-role client. No network, no database.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
process.env.VENDOR_SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

const { supabaseAdmin } = await import("../api/_lib/auth.js");
const session = await import("../api/_lib/vendorSession.js");
const verifyPin = (await import("../api/vendor-verify-pin.js")).default;
const vendorTicket = (await import("../api/vendor-ticket.js")).default;

// ── in-memory fake database + storage ─────────────────────────────────────
const HOUR = 3600e3;
let db, writes, storageCalls;

function seed() {
  const future = new Date(Date.now() + 30 * 24 * HOUR).toISOString();
  db = {
    maintenance_requests: [
      { id: "11111111-aaaa-4aaa-8aaa-111111111111", title: "Leaky sink", description: "Kitchen sink drips",
        status: "in_progress", vendor_token: "tok-one", vendor_pin: "4321", vendor_token_expires_at: future,
        vendor_name: "Acme Plumbing", entry_instructions: "Lockbox 1234", tenant_id: "tenant-1", unit_id: "unit-1",
        work_order_accepted_at: null, quote_approved_at: null, created_at: "2026-10-01T00:00:00Z" },
      { id: "22222222-bbbb-4bbb-8bbb-222222222222", title: "Broken heater", status: "in_progress",
        vendor_token: "tok-two", vendor_pin: "9999", vendor_token_expires_at: future, vendor_name: "Heat Co",
        entry_instructions: "Code 5555", work_order_accepted_at: "2026-10-02T00:00:00Z", quote_approved_at: null },
      { id: "33333333-cccc-4ccc-8ccc-333333333333", title: "Old job", status: "in_progress",
        vendor_token: "tok-old", vendor_pin: "1111", vendor_token_expires_at: new Date(Date.now() - HOUR).toISOString() },
    ],
    maintenance_comments: [
      { id: "c1", request_id: "11111111-aaaa-4aaa-8aaa-111111111111", body: "PM note", author_type: null,
        author_name: "Property Manager", author_id: "landlord-uid", visible_to_tenant: false, created_at: "2026-10-01T01:00:00Z" },
      { id: "c2", request_id: "22222222-bbbb-4bbb-8bbb-222222222222", body: "Other ticket secret", author_type: null,
        author_name: "Property Manager", created_at: "2026-10-01T01:00:00Z" },
    ],
  };
  writes = [];
  storageCalls = [];
}

function query(table) {
  let rows = db[table] || [];
  let pending = null;
  const b = {
    select: () => b,
    order: () => b,
    eq: (k, v) => {
      rows = rows.filter(r => r[k] === v);
      if (pending) { for (const r of rows) Object.assign(r, pending); writes.push([table, "update", v, pending]); pending = null; }
      return b;
    },
    maybeSingle: async () => ({ data: rows[0] ? { ...rows[0] } : null, error: null }),
    update: (fields) => { pending = fields; return b; },
    insert: async (row) => { (db[table] ||= []).push(row); writes.push([table, "insert", row]); return { error: null }; },
    then: (resolve) => resolve({ data: rows.map(r => ({ ...r })), error: null }),
  };
  return b;
}
supabaseAdmin.from = query;
Object.defineProperty(supabaseAdmin, "storage", {
  configurable: true,
  value: {
    from: (bucket) => ({
      list: async (folder) => { storageCalls.push(["list", bucket, folder]); return { data: [{ name: "vendor-1-a.jpg" }, { name: ".emptyFolderPlaceholder" }] }; },
      createSignedUrls: async (paths) => { storageCalls.push(["sign", bucket, paths]); return { data: paths.map(p => ({ path: p, signedUrl: `https://signed/${p}` })) }; },
      createSignedUploadUrl: async (path) => { storageCalls.push(["upload", bucket, path]); return { data: { signedUrl: `https://upload/${path}?token=t`, path, token: "t" } }; },
    }),
  },
});

// ── request helpers ──────────────────────────────────────────────────────
function call(handler, body, headers = {}) {
  return new Promise((resolve) => {
    const res = {
      code: 200, body: undefined,
      status(c) { this.code = c; return this; },
      json(b) { this.body = b; resolve(this); return this; },
      end() { resolve(this); return this; },
    };
    Promise.resolve(handler({ method: "POST", body, headers }, res)).then(() => resolve(res));
  });
}
const T1 = "11111111-aaaa-4aaa-8aaa-111111111111";
const T2 = "22222222-bbbb-4bbb-8bbb-222222222222";
const ticket = (id) => db.maintenance_requests.find(t => t.id === id);
const sessionFor = (id) => session.createVendorSession({ ticketId: id, vendorToken: ticket(id).vendor_token, tokenExpiresAt: ticket(id).vendor_token_expires_at }).session;
const act = (sess, action, fields = {}) => call(vendorTicket, { action, ...fields }, sess ? { "x-vendor-session": sess } : {});
const accept = (id) => { ticket(id).work_order_accepted_at = "2026-10-03T00:00:00Z"; };

beforeEach(seed);

// ── session signing ──────────────────────────────────────────────────────
describe("vendor session tokens", () => {
  test("valid session verifies and carries the ticket id", () => {
    const r = session.verifyVendorSession(sessionFor(T1));
    assert.equal(r.ok, true);
    assert.equal(r.claims.tid, T1);
  });

  test("tampered payload is rejected (bad signature)", () => {
    const [p, s] = sessionFor(T1).split(".");
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    claims.tid = T2; // try to retarget to another ticket
    const forged = Buffer.from(JSON.stringify(claims)).toString("base64url") + "." + s;
    assert.equal(session.verifyVendorSession(forged).reason, "bad_signature");
  });

  test("session signed with a different secret is rejected", () => {
    const payload = Buffer.from(JSON.stringify({ v: 1, tid: T1, th: "x", iat: 1, exp: 9999999999 })).toString("base64url");
    const sig = crypto.createHmac("sha256", "some-other-secret-value-xxxxxxxxxxxxxx").update(payload).digest("base64url");
    assert.equal(session.verifyVendorSession(`${payload}.${sig}`).reason, "bad_signature");
  });

  test("expired session is rejected", () => {
    const { session: s } = session.createVendorSession({ ticketId: T1, vendorToken: "tok-one", now: Date.now() - 9 * HOUR });
    assert.equal(session.verifyVendorSession(s).reason, "expired");
  });

  test("session expiry is capped at the vendor link's expiry", () => {
    const linkExp = new Date(Date.now() + HOUR).toISOString();
    const { expiresAt } = session.createVendorSession({ ticketId: T1, vendorToken: "tok-one", tokenExpiresAt: linkExp });
    assert.ok(new Date(expiresAt) <= new Date(linkExp));
  });

  test("garbage input is rejected without throwing", () => {
    for (const s of [null, "", "abc", "a.b.c", "!!!.???", 42]) {
      assert.equal(session.verifyVendorSession(s).ok, false);
    }
  });

  test("missing secret fails closed", () => {
    const saved = process.env.VENDOR_SESSION_SECRET;
    process.env.VENDOR_SESSION_SECRET = "";
    try {
      assert.throws(() => session.verifyVendorSession("a.b"), session.VendorSessionConfigError);
      assert.equal(session.isVendorSessionConfigured(), false);
    } finally { process.env.VENDOR_SESSION_SECRET = saved; }
  });
});

// ── PIN verification ─────────────────────────────────────────────────────
describe("POST /api/vendor-verify-pin", () => {
  test("correct PIN returns a session bound to that ticket, never the PIN", async () => {
    const r = await call(verifyPin, { token: "tok-one", pin: "4321" });
    assert.equal(r.code, 200);
    assert.equal(r.body.ticket_id, T1);
    assert.ok(r.body.session);
    assert.equal(session.verifyVendorSession(r.body.session).claims.tid, T1);
    assert.ok(!("vendor_pin" in r.body) && !JSON.stringify(r.body).includes("4321"));
  });
  test("wrong PIN → 401, no session", async () => {
    const r = await call(verifyPin, { token: "tok-one", pin: "0000" });
    assert.equal(r.code, 401);
    assert.ok(!r.body.session);
  });
  test("expired link → 410", async () => assert.equal((await call(verifyPin, { token: "tok-old", pin: "1111" })).code, 410));
  test("unknown token → 404", async () => assert.equal((await call(verifyPin, { token: "nope", pin: "1234" })).code, 404));
  test("malformed PIN → 400", async () => assert.equal((await call(verifyPin, { token: "tok-one", pin: "12a4" })).code, 400));
  test("missing VENDOR_SESSION_SECRET → 500 even with the correct PIN", async () => {
    const saved = process.env.VENDOR_SESSION_SECRET;
    process.env.VENDOR_SESSION_SECRET = "";
    try {
      const r = await call(verifyPin, { token: "tok-one", pin: "4321" });
      assert.equal(r.code, 500);
      assert.ok(!r.body.session);
    } finally { process.env.VENDOR_SESSION_SECRET = saved; }
  });
});

// ── authorization on /api/vendor-ticket ─────────────────────────────────
describe("POST /api/vendor-ticket — authorization", () => {
  test("no session → 401", async () => assert.equal((await act(null, "get")).code, 401));
  test("forged session → 401", async () => assert.equal((await act("abc.def", "get")).code, 401));
  test("expired session → 401 with code 'expired'", async () => {
    const { session: s } = session.createVendorSession({ ticketId: T1, vendorToken: "tok-one", now: Date.now() - 9 * HOUR });
    const r = await act(s, "get");
    assert.equal(r.code, 401);
    assert.equal(r.body.code, "expired");
  });
  test("session revoked when the vendor is reassigned (token changed) → 401", async () => {
    const s = sessionFor(T1);
    ticket(T1).vendor_token = "new-token-after-reassignment";
    const r = await act(s, "get");
    assert.equal(r.code, 401);
    assert.equal(r.body.code, "revoked");
  });
  test("vendor link expired after session issued → 401", async () => {
    const s = sessionFor(T1);
    ticket(T1).vendor_token_expires_at = new Date(Date.now() - 1000).toISOString();
    assert.equal((await act(s, "get")).code, 401);
  });
  test("unknown action → 400", async () => assert.equal((await act(sessionFor(T1), "delete_ticket")).code, 400));
  test("prototype-key action names are rejected → 400", async () => {
    for (const a of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      assert.equal((await act(sessionFor(T1), a)).code, 400, a);
    }
  });
  test("missing VENDOR_SESSION_SECRET → 500", async () => {
    const s = sessionFor(T1);
    const saved = process.env.VENDOR_SESSION_SECRET;
    process.env.VENDOR_SESSION_SECRET = "";
    try { assert.equal((await act(s, "get")).code, 500); } finally { process.env.VENDOR_SESSION_SECRET = saved; }
  });
});

// ── ticket isolation ─────────────────────────────────────────────────────
describe("ticket isolation", () => {
  test("body ticket_id / id / request_id are ignored — session ticket is always used", async () => {
    accept(T1);
    const r = await act(sessionFor(T1), "comment", { body: "hello", ticket_id: T2, id: T2, request_id: T2 });
    assert.equal(r.code, 200);
    const inserted = writes.find(w => w[1] === "insert" && w[0] === "maintenance_comments");
    assert.equal(inserted[2].request_id, T1);
  });
  test("get returns only the session ticket's comments", async () => {
    const r = await act(sessionFor(T1), "get", { ticket_id: T2 });
    assert.equal(r.body.ticket.id, T1);
    assert.ok(r.body.comments.every(c => c.body !== "Other ticket secret"));
  });
  test("storage listing and signing are scoped to the session ticket folder", async () => {
    await act(sessionFor(T1), "get");
    assert.deepEqual(storageCalls.find(c => c[0] === "list"), ["list", "maintenance-photos", T1]);
    assert.ok(storageCalls.find(c => c[0] === "sign")[2].every(p => p.startsWith(`${T1}/`)));
  });
  test("upload URLs are always inside the session ticket folder", async () => {
    accept(T1);
    const r = await act(sessionFor(T1), "upload_url", { kind: "photo", ext: "jpg", path: `${T2}/evil.jpg` });
    assert.equal(r.code, 200);
    assert.ok(r.body.path.startsWith(`${T1}/vendor-`));
  });
  test("complete rejects an invoice path from another ticket", async () => {
    accept(T1); ticket(T1).quote_approved_at = "2026-10-04T00:00:00Z";
    const r = await act(sessionFor(T1), "complete", { invoice_path: `${T2}/invoice-1-abc.pdf` });
    assert.equal(r.code, 400);
    assert.equal(ticket(T2).status, "in_progress");
  });
  test("complete rejects path traversal in invoice path", async () => {
    accept(T1); ticket(T1).quote_approved_at = "2026-10-04T00:00:00Z";
    const r = await act(sessionFor(T1), "complete", { invoice_path: `${T1}/../${T2}/invoice-1-abc.pdf` });
    assert.equal(r.code, 400);
  });
});

// ── data exposure ────────────────────────────────────────────────────────
describe("data exposure", () => {
  test("get never returns vendor_pin, vendor_token, tenant_id or unit_id", async () => {
    const r = await act(sessionFor(T1), "get");
    const json = JSON.stringify(r.body);
    for (const k of ["vendor_pin", "vendor_token", "tenant_id", "unit_id", "4321", "tok-one"]) {
      assert.ok(!json.includes(k), `leaked ${k}`);
    }
  });
  test("entry_instructions hidden before work order is accepted", async () => {
    const r = await act(sessionFor(T1), "get");
    assert.ok(!("entry_instructions" in r.body.ticket));
  });
  test("entry_instructions shown after work order is accepted", async () => {
    const r = await act(sessionFor(T2), "get");
    assert.equal(r.body.ticket.entry_instructions, "Code 5555");
  });
  test("comments expose only id/body/author_type/author_name/created_at", async () => {
    const r = await act(sessionFor(T1), "get");
    for (const c of r.body.comments) {
      assert.deepEqual(Object.keys(c).sort(), ["author_name", "author_type", "body", "created_at", "id"].filter(k => k in c).sort());
      assert.ok(!("author_id" in c) && !("visible_to_tenant" in c));
    }
  });
  test("photos are returned as signed URLs, placeholder files skipped", async () => {
    const r = await act(sessionFor(T1), "get");
    assert.deepEqual(r.body.photos, [{ name: "vendor-1-a.jpg", url: `https://signed/${T1}/vendor-1-a.jpg` }]);
  });
  test("preview returns only validity + title", async () => {
    const r = await act(null, "preview", { token: "tok-one" });
    assert.equal(r.code, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ["title", "valid"]);
  });
  test("preview of expired / unknown link → 410 / 404", async () => {
    assert.equal((await act(null, "preview", { token: "tok-old" })).code, 410);
    assert.equal((await act(null, "preview", { token: "nope" })).code, 404);
  });
});

// ── unauthorized fields ──────────────────────────────────────────────────
describe("unauthorized fields are never written", () => {
  const FORBIDDEN = {
    status: "resolved", quote_approved_at: "2026-01-01", vendor_pin: "0000", vendor_token: "x",
    vendor_token_expires_at: "2099-01-01", tenant_id: "evil", landlord_notes: "x", priority: "low",
  };
  const updatedKeys = () => writes.filter(w => w[1] === "update").flatMap(w => Object.keys(w[3]));

  test("accept_work_order writes only its allow-listed fields", async () => {
    await act(sessionFor(T1), "accept_work_order", { signature_name: "Jane Vendor", ...FORBIDDEN });
    assert.deepEqual(updatedKeys().sort(), ["vendor_email", "work_order_accepted_at", "work_order_accepted_by"]);
  });
  test("submit_quote writes only its allow-listed fields (status forced to quote_submitted)", async () => {
    accept(T1);
    await act(sessionFor(T1), "submit_quote", { amount: 350, notes: "parts", ...FORBIDDEN });
    assert.deepEqual(updatedKeys().sort(), ["quote_amount", "quote_notes", "quote_submitted_at", "status"]);
    assert.equal(ticket(T1).status, "quote_submitted");
    assert.equal(ticket(T1).quote_approved_at, null);
  });
  test("complete writes only its allow-listed fields (status forced to pending_review)", async () => {
    accept(T1); ticket(T1).quote_approved_at = "2026-10-04T00:00:00Z";
    await act(sessionFor(T1), "complete", { invoice_notes: "165", ...FORBIDDEN });
    assert.deepEqual(updatedKeys().sort(), ["invoice_notes", "invoice_url", "status"]);
    assert.equal(ticket(T1).status, "pending_review");
  });
  test("comment author fields are set server-side, not from the request", async () => {
    accept(T1);
    await act(sessionFor(T1), "comment", { body: "hi", author_type: "landlord", author_name: "Property Manager", visible_to_tenant: true });
    const row = writes.find(w => w[1] === "insert")[2];
    assert.equal(row.author_type, "vendor");
    assert.equal(row.author_name, "Acme Plumbing");
    assert.equal(row.visible_to_tenant, false);
  });
});

// ── each supported action ────────────────────────────────────────────────
describe("supported actions", () => {
  test("accept_work_order records signature + audit comment", async () => {
    const r = await act(sessionFor(T1), "accept_work_order", { signature_name: "Jane Vendor", vendor_email: "jane@acme.test" });
    assert.equal(r.code, 200);
    assert.equal(ticket(T1).work_order_accepted_by, "Jane Vendor");
    assert.equal(ticket(T1).vendor_email, "jane@acme.test");
    assert.match(writes.find(w => w[1] === "insert")[2].body, /^Work order accepted and signed by Jane Vendor/);
  });
  test("accept_work_order is idempotent (second call does not overwrite)", async () => {
    accept(T1);
    const r = await act(sessionFor(T1), "accept_work_order", { signature_name: "Someone Else" });
    assert.equal(r.body.already_accepted, true);
    assert.equal(writes.length, 0);
  });
  test("accept_work_order validation: name required, email format", async () => {
    assert.equal((await act(sessionFor(T1), "accept_work_order", { signature_name: "  " })).code, 400);
    assert.equal((await act(sessionFor(T1), "accept_work_order", { signature_name: "J", vendor_email: "not-an-email" })).code, 400);
  });
  test("comment requires accepted work order; then succeeds", async () => {
    assert.equal((await act(sessionFor(T1), "comment", { body: "x" })).code, 403);
    accept(T1);
    assert.equal((await act(sessionFor(T1), "comment", { body: "On my way" })).code, 200);
  });
  test("comment validation: empty and over-long bodies rejected", async () => {
    accept(T1);
    assert.equal((await act(sessionFor(T1), "comment", { body: "" })).code, 400);
    assert.equal((await act(sessionFor(T1), "comment", { body: "x".repeat(2001) })).code, 400);
  });
  test("comment blocked on closed tickets", async () => {
    accept(T1); ticket(T1).status = "pending_review";
    assert.equal((await act(sessionFor(T1), "comment", { body: "x" })).code, 409);
  });
  test("submit_quote happy path + validation + state rules", async () => {
    accept(T1);
    assert.equal((await act(sessionFor(T1), "submit_quote", { amount: -5 })).code, 400);
    assert.equal((await act(sessionFor(T1), "submit_quote", { amount: "abc" })).code, 400);
    assert.equal((await act(sessionFor(T1), "submit_quote", { amount: 2_000_000 })).code, 400);
    const r = await act(sessionFor(T1), "submit_quote", { amount: 350.555, notes: "parts + labor" });
    assert.equal(r.code, 200);
    assert.equal(ticket(T1).quote_amount, 350.56);
    assert.equal((await act(sessionFor(T1), "submit_quote", { amount: 400 })).code, 409); // already quoted
  });
  test("complete requires an approved quote", async () => {
    accept(T1);
    assert.equal((await act(sessionFor(T1), "complete", {})).code, 409);
    ticket(T1).quote_approved_at = "2026-10-04T00:00:00Z";
    const path = (await act(sessionFor(T1), "upload_url", { kind: "invoice", ext: "pdf" })).body.path;
    const r = await act(sessionFor(T1), "complete", { invoice_path: path, invoice_notes: "165" });
    assert.equal(r.code, 200);
    assert.equal(ticket(T1).invoice_url, path);
    assert.equal(ticket(T1).invoice_notes, "165");
  });
  test("upload_url: kinds, extension allow-list, state rules", async () => {
    assert.equal((await act(sessionFor(T1), "upload_url", { kind: "photo", ext: "jpg" })).code, 403); // not accepted
    accept(T1);
    const photo = await act(sessionFor(T1), "upload_url", { kind: "photo", ext: "JPG" });
    assert.equal(photo.code, 200);
    assert.match(photo.body.path, new RegExp(`^${T1}/vendor-\\d+-[a-f0-9]+\\.jpg$`));
    assert.ok(photo.body.signed_url.startsWith("https://upload/"));
    assert.match((await act(sessionFor(T1), "upload_url", { kind: "quote", ext: "png" })).body.path, /\/quote-/);
    assert.equal((await act(sessionFor(T1), "upload_url", { kind: "invoice", ext: "pdf" })).code, 409); // no approved quote
    assert.equal((await act(sessionFor(T1), "upload_url", { kind: "photo", ext: "exe" })).code, 400);
    assert.equal((await act(sessionFor(T1), "upload_url", { kind: "photo", ext: "html" })).code, 400);
    assert.equal((await act(sessionFor(T1), "upload_url", { kind: "avatar", ext: "jpg" })).code, 400);
  });
  test("get returns the vendor view of the ticket", async () => {
    const r = await act(sessionFor(T1), "get");
    assert.equal(r.code, 200);
    assert.equal(r.body.ticket.title, "Leaky sink");
    assert.equal(r.body.ticket.vendor_name, "Acme Plumbing");
    assert.equal(r.body.comments.length, 1);
  });
});
