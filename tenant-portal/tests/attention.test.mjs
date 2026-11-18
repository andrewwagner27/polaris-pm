// Dashboard "Needs Attention" (src/lib/attention.js): ordered by urgency, built only from recorded facts, and never
// claims a balance or unpaid rent unless the receivables ledger is active.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAttention } from "../src/lib/attention.js";

const NOW = new Date("2026-11-18T12:00:00Z");
const unit = { unit_number: "3", properties: { name: "Clifton Manor" } };

test("urgent and emergency tickets come first; quotes and completed work need a decision (oldest first)", () => {
  const items = buildAttention({ now: NOW, tickets: [
    { id: "a", status: "quote_submitted", quote_amount: 140, vendor_name: "Handyman", units: unit, created_at: "2026-11-17T10:00:00Z" },
    { id: "b", status: "open", is_emergency: true, title: "Water leak", units: unit, created_at: "2026-11-18T10:00:00Z" },
    { id: "c", status: "pending_review", title: "Faucet", units: unit, created_at: "2026-11-10T10:00:00Z" },
    { id: "d", status: "resolved", priority: "urgent", units: unit, created_at: "2026-11-01T10:00:00Z" },
  ] });
  assert.deepEqual(items.map((i) => i.id), ["t-urgent-b", "t-review-c", "t-quote-a"]);
  assert.equal(items[0].severity, 0);
  assert.equal(items[0].action.to, "/landlord/maintenance/b");
  assert.match(items[2].detail, /\$140/);
});

test("unassigned tickets older than a day are a follow-up; fresh ones are not yet", () => {
  const items = buildAttention({ now: NOW, tickets: [
    { id: "old", status: "open", title: "Door", units: unit, created_at: "2026-11-15T10:00:00Z" },
    { id: "new", status: "open", title: "Fan", units: unit, created_at: "2026-11-18T09:00:00Z" },
  ] });
  assert.deepEqual(items.map((i) => i.id), ["t-unassigned-old"]);
});

test("open owner-action incidents (parking, dumpster) are listed and resolved ones are not", () => {
  const items = buildAttention({ now: NOW, incidents: [
    { id: 1, category: "PARKING_DISPUTE", status: "open", created_at: "2026-11-17", properties: { name: "Clifton Manor" }, details_json: { intent_summary: "Car in my spot" } },
    { id: 2, category: "TRASH", status: "resolved", created_at: "2026-11-10" },
  ] });
  assert.equal(items.length, 1);
  assert.match(items[0].title, /Parking/);
  assert.match(items[0].detail, /Car in my spot/);
});

test("lease deadlines, expiring insurance and stale invitations are follow-ups", () => {
  const items = buildAttention({ now: NOW, tenants: [
    { id: "t1", name: "Ana", lease_end: "2026-12-20", units: { unit_number: "2" } },
    { id: "t2", name: "Ben", lease_end: "2026-12-20", lease_end_action: "renew" },
    { id: "t3", name: "Cy", insurance_expires: "2026-11-25" },
    { id: "t4", name: "Di", invite_sent_at: "2026-11-10T00:00:00Z", user_id: null },
    { id: "t5", name: "Ed", invite_sent_at: "2026-11-10T00:00:00Z", user_id: "u5" },
    { id: "t6", name: "Old", lease_end: "2026-12-01", archived: true },
  ] });
  assert.deepEqual(items.map((i) => i.id).sort(), ["ins-t3", "inv-t4", "l-t1"]);
});

test("no balance claims without the receivables ledger; ledger balances appear only when the ledger says so", () => {
  const tenants = [{ id: "t1", name: "Ana" }, { id: "t2", name: "Ben" }];
  for (const mode of ["inactive", "error", "loading", undefined]) {
    const items = buildAttention({ now: NOW, tenants, balances: { mode, byTenant: new Map([["t1", 50000]]) } });
    assert.equal(items.filter((i) => i.kind === "finance").length, 0, String(mode));
  }
  const items = buildAttention({ now: NOW, tenants, balances: { mode: "ledger", byTenant: new Map([["t1", 50000], ["t2", 0]]) } });
  const fin = items.filter((i) => i.kind === "finance");
  assert.equal(fin.length, 1);
  assert.match(fin[0].detail, /\$500\.00 due/);
});
