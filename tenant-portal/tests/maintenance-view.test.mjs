// Maintenance presentation rules (src/lib/maintenanceView.js): the stage timeline never shows a stage as done that the
// ticket doesn't record, the next action matches the ticket's state, and call chips only get complete phone numbers.
// Plus wiring checks: vendor credentials stay out of the list query, and the drawer behaves like a dialog.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ticketTimeline, nextAction, ageLabel, telHref } from "../src/lib/maintenanceView.js";

const states = (t) => Object.fromEntries(ticketTimeline(t).map((s) => [s.key, s.state]));

test("new ticket: reported done, assigned is next, nothing else claimed", () => {
  assert.deepEqual(states({ status: "open", created_at: "2026-11-01T10:00:00Z" }),
    { reported: "done", assigned: "current", quoted: "upcoming", approved: "upcoming", resolved: "upcoming" });
});

test("full path: reported → assigned → quoted → approved → resolved, with recorded dates", () => {
  const t = { status: "resolved", created_at: "2026-11-01T10:00:00Z", vendor_name: "Handyman", work_order_accepted_at: "2026-11-02T10:00:00Z",
    quote_submitted_at: "2026-11-03T10:00:00Z", quote_amount: 120, quote_approved_at: "2026-11-03T12:00:00Z", resolved_at: "2026-11-05T10:00:00Z" };
  const tl = ticketTimeline(t);
  assert.ok(tl.every((s) => s.state === "done"));
  assert.equal(tl.find((s) => s.key === "resolved").at, "2026-11-05T10:00:00Z");
});

test("resolved without a quote: quoted and approved are 'skipped', never 'done'", () => {
  const st = states({ status: "resolved", created_at: "2026-11-01", vendor_name: "Handyman", resolved_at: "2026-11-02" });
  assert.equal(st.quoted, "skipped"); assert.equal(st.approved, "skipped"); assert.equal(st.resolved, "done");
});

test("resolved without any contractor: assigned is skipped too", () => {
  const st = states({ status: "resolved", created_at: "2026-11-01" });
  assert.deepEqual([st.assigned, st.quoted, st.approved, st.resolved], ["skipped", "skipped", "skipped", "done"]);
});

test("quote in: quoted done, approval is the current step; an unrecorded assignment time is not invented", () => {
  const tl = ticketTimeline({ status: "quote_submitted", created_at: "2026-11-01", vendor_name: "Handyman", quote_submitted_at: "2026-11-02", quote_amount: 90 });
  const by = Object.fromEntries(tl.map((s) => [s.key, s]));
  assert.equal(by.quoted.state, "done"); assert.equal(by.approved.state, "current");
  assert.equal(by.assigned.state, "done"); assert.equal(by.assigned.at, null);
});

test("next action follows the ticket's state and says who it waits on", () => {
  assert.equal(nextAction({ status: "resolved" }), null);
  assert.deepEqual(nextAction({ status: "open" }), { label: "Assign a contractor", owner: "you", tone: "action" });
  assert.equal(nextAction({ status: "open", is_emergency: true }).tone, "urgent");
  assert.equal(nextAction({ status: "open", vendor_name: "Handyman" }).owner, "contractor");
  assert.match(nextAction({ status: "quote_submitted", quote_amount: 125 }).label, /\$125 quote/);
  assert.equal(nextAction({ status: "pending_review" }).owner, "you");
  assert.equal(nextAction({ status: "in_progress", vendor_name: "Handyman" }).owner, "contractor");
  assert.match(nextAction({ status: "in_progress", owner_approval_required: true }).label, /Owner approval/);
});

test("ageLabel is relative and safe on missing dates", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  assert.equal(ageLabel("2026-11-18T11:30:00Z", now), "just now");
  assert.equal(ageLabel("2026-11-18T06:00:00Z", now), "6 h");
  assert.equal(ageLabel("2026-11-14T12:00:00Z", now), "4 d");
  assert.equal(ageLabel(null, now), "—");
});

test("telHref: only complete, plausible North American numbers become call links", () => {
  assert.equal(telHref("+1 (216) 694-8201"), "tel:+12166948201");
  assert.equal(telHref("813-693-1843"), "tel:+18136931843");
  for (const bad of [null, "", "555-1234", "(000) 000-0000", "1111111111", "call me", "+44 20 7946 0958", "216-555-0100", "21669482"]) {
    assert.equal(telHref(bad), null, String(bad));
  }
});

const read = (p) => fs.readFileSync(path.resolve(import.meta.dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

test("maintenance list never selects contractor credentials and reads the vendor phone from the landlord-only directory", () => {
  const s = read("src/LandlordMaintenance.jsx");
  const loader = s.slice(s.indexOf("async function loadTickets"), s.indexOf("\n}\n", s.indexOf("async function loadTickets")));
  assert.match(loader, /\$\{TICKET_COLUMNS\}/);
  assert.doesNotMatch(loader, /vendor_token|vendor_pin|vendor_phone|vendor_email|select\("\*"\)/);
  assert.match(loader, /from\("vendors"\)\.select\("name, phone/);
});

test("ticket drawer is a modal dialog with a labelled title, Escape to close, and focus return", () => {
  const s = read("src/LandlordMaintenance.jsx");
  assert.match(s, /role="dialog" aria-modal="true" aria-labelledby="ticket-drawer-title" className="m-drawer"/);
  assert.match(s, /e\.key === "Escape"/);
  assert.match(s, /openerRef\.current = document\.activeElement/);
  assert.match(s, /aria-expanded=\{expanded\} aria-controls=\{panelId\}/);
});
