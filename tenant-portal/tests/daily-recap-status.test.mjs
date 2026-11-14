// tests/daily-recap-status.test.mjs
// The daily recap separates new, open, resolved and older-unresolved escalations, lists failed ticket emails,
// and never repeats a resolved issue as outstanding.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

const N = await import("../api/_lib/escalationNotify.js");
const D = await import("../api/_lib/dailyRecap.js");
const NOW = new Date("2026-11-14T12:00:00Z");
const SINCE = new Date(NOW.getTime() - 24 * 3600e3).toISOString();
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600e3).toISOString();
const esc = (id, h, over = {}) => ({ id, message_id: `m-${id}`, action_taken: "ESCALATE_LANDLORD", detected_intent: `Intent ${id}`, raw_message: `Exact words ${id}`,
  created_at: hoursAgo(h), raw_openai_response: { notify: { status: "sent", provider_id: "re_1" } }, tenants: { name: "Test User", units: { unit_number: "2" } }, ...over });
const ev = (log, event, h) => ({ routing_log_id: log, event, created_at: hoursAgo(h) });
const base = { tickets: [], inspections: [], tenants: [], messages: [], now: NOW, since: SINCE };

describe("escalation resolution in the recap", () => {
  test("24-hour rows are marked RESOLVED / OPEN; resolved rows don't count as needing attention", () => {
    const rows = [esc("a", 2), esc("b", 3, { raw_openai_response: { notify: { status: "failed" } } }), esc("c", 4, { raw_openai_response: { notify: { status: "failed" } } })];
    const s = N.escalationRecapSection(rows, { events: [ev("a", "resolved", 1), ev("c", "resolved", 1)] });
    assert.equal(s.count, 3); assert.equal(s.open, 1); assert.equal(s.resolved, 2);
    assert.equal(s.needsAttention, 1, "only the open failed one (b)");
    const rowA = s.html.split("<tr>").find((r) => r.includes("Exact words a"));
    assert.match(rowA, /RESOLVED/); assert.doesNotMatch(rowA, /OPEN — NEEDS ACTION/);
    assert.match(s.html.split("<tr>").find((r) => r.includes("Exact words b")), /OPEN — NEEDS ACTION/);
  });
  test("reopened after resolved → open again (latest event wins)", () => {
    const s = N.escalationRecapSection([esc("a", 2)], { events: [ev("a", "resolved", 1.5), ev("a", "reopened", 1)] });
    assert.equal(s.open, 1);
  });
  test("without the history the section behaves as before (no RESOLVED/OPEN tags)", () => {
    const s = N.escalationRecapSection([esc("a", 2)]);
    assert.doesNotMatch(s.html, /RESOLVED|OPEN — NEEDS ACTION/);
  });
});

describe("older unresolved escalations", () => {
  test("listed until resolved; resolved ones and rows inside the 24-hour window are not", () => {
    const rows = [esc("old1", 30), esc("old2", 50), esc("fresh", 2)];
    const s = N.olderUnresolvedSection(rows, [ev("old2", "resolved", 40)], { since: SINCE });
    assert.equal(s.count, 1);
    assert.ok(s.html.includes("Exact words old1") && !s.html.includes("old2") && !s.html.includes("fresh"));
  });
  test("capped at OLDER_UNRESOLVED_MAX_ROWS with a pointer to the Agent Center", () => {
    const rows = Array.from({ length: N.OLDER_UNRESOLVED_MAX_ROWS + 4 }, (_, i) => esc(`o${i}`, 30 + i));
    const s = N.olderUnresolvedSection(rows, [], { since: SINCE });
    assert.equal(s.count, N.OLDER_UNRESOLVED_MAX_ROWS + 4);
    assert.match(s.html, /…and 4 more/);
  });
  test("unknown history → 'unknown', never a list of every older escalation", () => {
    assert.deepEqual(N.olderUnresolvedSection([esc("old1", 30)], null, { since: SINCE }), { count: 0, html: "", unknown: true });
    assert.equal(N.olderUnresolvedSection(null, [], { since: SINCE }).unavailable, true);
  });
});

describe("buildDailyRecap", () => {
  test("needs-action summary, older-unresolved section, subject counts; a fully resolved day isn't outstanding", () => {
    const r = D.buildDailyRecap({ ...base, escalationRows: [esc("a", 2), esc("b", 3)], olderEscalationRows: [esc("old1", 30)],
      escalationEvents: [ev("a", "resolved", 1)], ticketNotes: [] });
    assert.match(r.html, /NEEDS MANAGEMENT ACTION/);
    assert.match(r.html, /1 open escalation from the last 24 hours and 1 still open from earlier/);
    assert.match(r.html, /STILL UNRESOLVED FROM EARLIER \(1, LAST 14 DAYS\)/);
    assert.match(r.subject, /2 escalations \(1 open\), 1 older unresolved/);
    assert.match(r.text, /Escalations \(24h\): 2 \(open 1, resolved 1\)/);

    const done = D.buildDailyRecap({ ...base, escalationRows: [esc("a", 2)], olderEscalationRows: [], escalationEvents: [ev("a", "resolved", 1)], ticketNotes: [] });
    assert.doesNotMatch(done.html, /NEEDS MANAGEMENT ACTION/);
    assert.match(done.subject, /1 escalation \(0 open\)/);
  });
  test("failed/unconfirmed ticket emails are listed (latest note per ticket; a later success clears it)", () => {
    const note = (req, body, h) => ({ request_id: req, body, created_at: hoursAgo(h), author_type: "system", author_name: "Modus notifications", author_id: null, maintenance_requests: { title: `Ticket ${req}` } });
    const notes = [note("t1", "Email FAILED — new maintenance request: 500. Follow up directly.", 5),
      note("t2", "Email FAILED — status update: 500.", 6), note("t2", "Management emailed about this new request (1 recipient).", 5),
      note("t3", "Email NOT CONFIRMED — status update: timeout.", 4),
      { ...note("t4", "Email FAILED — forged", 3), author_id: "someone" }];
    const list = D.failedTicketEmails(notes);
    assert.deepEqual(list.map((n) => n.request_id).sort(), ["t1", "t3"]);
    const r = D.buildDailyRecap({ ...base, escalationRows: [], olderEscalationRows: [], escalationEvents: [], ticketNotes: notes });
    assert.match(r.html, /TICKET EMAILS THAT FAILED OR WEREN&#39;T CONFIRMED \(2\)|TICKET EMAILS THAT FAILED OR WEREN'T CONFIRMED \(2\)/);
    assert.equal(r.allClear, false);
    assert.equal(D.failedTicketEmails(null), null);
  });
  test("history unavailable → said so, never all clear", () => {
    const r = D.buildDailyRecap({ ...base, escalationRows: [], olderEscalationRows: [esc("old1", 30)], escalationEvents: null, ticketNotes: [] });
    assert.match(r.html, /RESOLUTION STATUS UNAVAILABLE/);
    assert.equal(r.allClear, false);
  });
  test("callers that don't pass the new inputs get the previous recap (backward compatible)", () => {
    const r = D.buildDailyRecap({ ...base, escalationRows: [] });
    assert.equal(r.allClear, true);
  });
});
