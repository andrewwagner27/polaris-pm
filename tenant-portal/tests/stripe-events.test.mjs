// tests/stripe-events.test.mjs
// Exercises supabase/functions/_shared/stripe-events.js (used by both Stripe webhook handlers) with an
// in-memory fake of the payments / payment_refunds tables and a fake Stripe API. No network.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { applyStripePaymentEvent, stripeGetter, STRIPE_PAYMENT_EVENTS } = await import("../supabase/functions/_shared/stripe-events.js");

let tables, stripeCalls, stripeData, missingColumns, logs;

function fakeDb() {
  return {
    from(name) {
      const rows = tables[name];
      const filters = [];
      const matching = () => rows.filter(r => filters.every(([c, v]) => r[c] === v));
      const q = {
        _op: "select",
        select() { return q; },
        update(values) { q._op = "update"; q._values = values; return q; },
        eq(c, v) { filters.push([c, v]); return q; },
        async maybeSingle() { const m = matching(); return { data: m[0] ? { ...m[0] } : null, error: null }; },
        upsert(list, opts) {
          let error = null;
          for (const row of list) {
            const keys = String(opts?.onConflict || "").split(",").filter(Boolean);
            if (keys.length && rows.some(r => keys.every(k => r[k] === row[k]))) {
              if (!opts.ignoreDuplicates) error = { message: "duplicate key" };
              continue;
            }
            rows.push({ id: `rf-${rows.length + 1}`, ...row });
          }
          return Promise.resolve({ error });
        },
        then(resolve) {
          if (q._op === "update") {
            const bad = Object.keys(q._values).find(k => missingColumns.includes(k));
            if (bad) return resolve({ error: { message: `column "${bad}" of relation "payments" does not exist` } });
            for (const r of matching()) Object.assign(r, q._values);
          }
          return resolve({ error: null });
        },
      };
      return q;
    },
  };
}
const CHARGE_PATH = "charges/ch_1?expand[]=balance_transaction&expand[]=application_fee&expand[]=transfer";
const stripeGet = async (path) => {
  stripeCalls.push(path);
  if (stripeData[path] instanceof Error) throw stripeData[path];
  if (!(path in stripeData)) throw new Error(`no fake for ${path}`);
  return stripeData[path];
};
const log = { error: (m) => logs.push(m) };
const deps = () => ({ db: fakeDb(), stripeGet, log });

beforeEach(() => {
  tables = {
    payments: [
      { id: "p1", tenant_id: "t1", amount_cents: 150000, status: "pending", stripe_payment_intent_id: "pi_1", paid_at: null },
      { id: "p2", tenant_id: "t2", amount_cents: 120000, status: "paid", stripe_payment_intent_id: "pi_2", paid_at: "2026-11-02T15:00:00.000Z" },
    ],
    payment_refunds: [],
    stripe_fee_events: [],
  };
  stripeCalls = []; missingColumns = []; logs = [];
  stripeData = {
    [CHARGE_PATH]: { id: "ch_1", balance_transaction: { id: "txn_1", fee: 80, net: 149920 }, application_fee: { id: "fee_1", amount: 7500 }, transfer: { id: "tr_1", amount: 150000, destination: "acct_owner" }, transfer_data: { destination: "acct_owner" } },
    "refunds?charge=ch_2&limit=100": { data: [
      { id: "re_a", amount: 20000, status: "succeeded", created: 1796900000, reason: "requested_by_customer", payment_intent: "pi_2" },
      { id: "re_b", amount: 5000, status: "pending", created: 1796900100, reason: null, payment_intent: "pi_2" },
    ] },
  };
});

const succeeded = { type: "payment_intent.succeeded", created: 1796736000, data: { object: { id: "pi_1", latest_charge: "ch_1" } } };

describe("payment_intent.succeeded", () => {
  test("paid_at is Stripe's timestamp (event.created), not the handler's clock", async () => {
    const r = await applyStripePaymentEvent(succeeded, deps());
    assert.equal(r.action, "paid");
    assert.equal(tables.payments[0].status, "paid");
    assert.equal(tables.payments[0].paid_at, new Date(1796736000 * 1000).toISOString());
  });
  test("Stripe's fee and net are captured from the platform balance transaction (D8)", async () => {
    await applyStripePaymentEvent(succeeded, deps());
    const p = tables.payments[0];
    assert.deepEqual([p.stripe_charge_id, p.stripe_fee_cents, p.stripe_net_cents, p.stripe_balance_transaction_id], ["ch_1", 80, 149920, "txn_1"]);
    assert.deepEqual([p.stripe_application_fee_id, p.stripe_application_fee_cents], ["fee_1", 7500]);
    assert.deepEqual([p.stripe_transfer_id, p.stripe_transfer_cents, p.stripe_transfer_destination], ["tr_1", 150000, "acct_owner"], "the arrangement a later refund is judged against");
    assert.deepEqual(stripeCalls, [CHARGE_PATH]);   // no Stripe-Account: destination charge lives on the platform
  });
  test("fee lookup failure never blocks marking the payment paid", async () => {
    stripeData[CHARGE_PATH] = new Error("Stripe down");
    const r = await applyStripePaymentEvent(succeeded, deps());
    assert.equal(r.action, "paid");
    assert.equal(tables.payments[0].status, "paid");
    assert.equal(tables.payments[0].stripe_fee_cents, undefined);
    assert.match(logs.join(), /fee lookup failed/);
  });
  test("database without the A2 columns: still marked paid with Stripe's timestamp", async () => {
    missingColumns = ["stripe_charge_id", "stripe_fee_cents", "stripe_net_cents", "stripe_balance_transaction_id", "stripe_application_fee_id", "stripe_application_fee_cents", "stripe_transfer_id", "stripe_transfer_cents", "stripe_transfer_destination"];
    await applyStripePaymentEvent(succeeded, deps());
    assert.equal(tables.payments[0].status, "paid");
    assert.equal(tables.payments[0].paid_at, new Date(1796736000 * 1000).toISOString());
  });
  test("re-delivery is harmless (same values)", async () => {
    await applyStripePaymentEvent(succeeded, deps());
    const once = JSON.stringify(tables.payments[0]);
    await applyStripePaymentEvent(succeeded, deps());
    assert.equal(JSON.stringify(tables.payments[0]), once);
  });
  test("returns the payment so the handler can send its receipt email", async () => {
    const r = await applyStripePaymentEvent(succeeded, deps());
    assert.deepEqual([r.payment.id, r.payment.tenant_id, r.payment.amount_cents], ["p1", "t1", 150000]);
  });
});

describe("out-of-order delivery", () => {
  test("a failed attempt delivered after a later success doesn't undo the payment", async () => {
    const r = await applyStripePaymentEvent({ type: "payment_intent.payment_failed", created: 1, data: { object: { id: "pi_2" } } }, deps());
    assert.equal(r.action, "ignored");
    assert.equal(tables.payments[1].status, "paid");
  });
  test("a repeated success doesn't undo a refunded status", async () => {
    tables.payments[1].status = "refunded";
    const r = await applyStripePaymentEvent({ type: "payment_intent.succeeded", created: 5, data: { object: { id: "pi_2", latest_charge: null } } }, deps());
    assert.equal(r.action, "ignored");
    assert.equal(tables.payments[1].status, "refunded");
  });
});

describe("payment_intent.payment_failed", () => {
  test("marks failed (unchanged behaviour)", async () => {
    const r = await applyStripePaymentEvent({ type: "payment_intent.payment_failed", created: 1, data: { object: { id: "pi_1" } } }, deps());
    assert.equal(r.action, "failed");
    assert.equal(tables.payments[0].status, "failed");
  });
});

describe("refunds", () => {
  const refunded = { type: "charge.refunded", created: 1796900200, data: { object: { id: "ch_2", payment_intent: "pi_2" } } };
  test("charge.refunded records each succeeded refund with Stripe's refund timestamp; pending ones are skipped", async () => {
    const r = await applyStripePaymentEvent(refunded, deps());
    assert.equal(r.action, "refunds recorded");
    assert.deepEqual(tables.payment_refunds.map(x => [x.payment_id, x.amount_cents, x.stripe_refund_id, x.refunded_at]),
      [["p2", 20000, "re_a", new Date(1796900000 * 1000).toISOString()]]);
  });
  test("partial refunds are supported (amount is the refund, not the payment)", async () => {
    await applyStripePaymentEvent(refunded, deps());
    assert.equal(tables.payment_refunds[0].amount_cents, 20000);
  });
  test("a retried event adds nothing (stripe_refund_id is unique)", async () => {
    await applyStripePaymentEvent(refunded, deps());
    await applyStripePaymentEvent(refunded, deps());
    await applyStripePaymentEvent({ type: "refund.updated", created: 1, data: { object: { id: "re_a", amount: 20000, status: "succeeded", created: 1796900000, payment_intent: "pi_2" } } }, deps());
    assert.equal(tables.payment_refunds.length, 1);
  });
  test("a pending ACH refund is recorded only once it succeeds (refund.updated)", async () => {
    await applyStripePaymentEvent(refunded, deps());
    await applyStripePaymentEvent({ type: "refund.updated", created: 1, data: { object: { id: "re_b", amount: 5000, status: "succeeded", created: 1796900100, payment_intent: "pi_2" } } }, deps());
    assert.deepEqual(tables.payment_refunds.map(x => x.stripe_refund_id), ["re_a", "re_b"]);
  });
  test("unknown payment intent is ignored, not invented", async () => {
    const r = await applyStripePaymentEvent({ type: "refund.created", created: 1, data: { object: { id: "re_x", amount: 1, status: "succeeded", created: 1, payment_intent: "pi_unknown" } } }, deps());
    assert.equal(r.action, "ignored");
    assert.equal(tables.payment_refunds.length, 0);
  });
  test("falls back to the refunds embedded in the charge if the list call fails", async () => {
    stripeData["refunds?charge=ch_2&limit=100"] = new Error("timeout");
    const ev = { ...refunded, data: { object: { id: "ch_2", payment_intent: "pi_2", refunds: { data: [{ id: "re_c", amount: 100, status: "succeeded", created: 1796900300 }] } } } };
    await applyStripePaymentEvent(ev, deps());
    assert.deepEqual(tables.payment_refunds.map(x => x.stripe_refund_id), ["re_c"]);
  });
});

test("Modus records what Stripe did: nothing here issues a refund or reverses a transfer", () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  for (const f of ["supabase/functions/_shared/stripe-events.js", "supabase/functions/stripe-webhook/index.ts", "api/stripe-webhook.js"]) {
    assert.doesNotMatch(read(f), /reverse_transfer|refund_application_fee|method:\s*"POST"/, f);
  }
});

describe("fee capture (D8, D10)", () => {
  const re = { id: "re_a", amount: 20000, status: "succeeded", created: 1796900000, payment_intent: "pi_2" };
  const detail = "refunds/re_a?expand[]=balance_transaction&expand[]=transfer_reversal";
  const ev = { type: "refund.created", created: 1796900000, data: { object: re } };
  test("a refund's balance transaction, returned fee and transfer reversal are captured and linked", async () => {
    stripeData[detail] = { balance_transaction: { id: "txn_r", amount: -20000, fee: -60 }, transfer_reversal: { id: "trr_1", amount: 19000, balance_transaction: "txn_t" } };
    await applyStripePaymentEvent(ev, deps());
    const rows = tables.stripe_fee_events;
    assert.deepEqual(rows.map(x => [x.kind, x.stripe_object_id, x.amount_cents, x.fee_cents, x.payment_id, x.refund_id]), [
      ["refund_balance_transaction", "txn_r", -20000, -60, "p2", tables.payment_refunds[0].id],
      ["transfer_reversal", "trr_1", 19000, undefined, "p2", tables.payment_refunds[0].id],
    ]);
  });
  test("repeated events capture once, and a later event fills in details a failed lookup missed", async () => {
    stripeData[detail] = new Error("timeout");
    await applyStripePaymentEvent(ev, deps());
    assert.equal(tables.stripe_fee_events.length, 0);
    assert.equal(tables.payment_refunds.length, 1, "the refund itself is still recorded");
    stripeData[detail] = { balance_transaction: { id: "txn_r", amount: -20000, fee: 0 }, transfer_reversal: null };
    await applyStripePaymentEvent(ev, deps());
    await applyStripePaymentEvent(ev, deps());
    assert.equal(tables.stripe_fee_events.length, 1);
    assert.equal(tables.payment_refunds.length, 1);
  });
  test("a Modus fee refund is captured from either event, once", async () => {
    tables.payments[1].stripe_application_fee_id = "fee_2";
    stripeData["application_fees/fee_2/refunds?limit=100"] = { data: [{ id: "fr_1", amount: 1000, created: 1796900000, balance_transaction: "txn_f" }] };
    await applyStripePaymentEvent({ type: "application_fee.refunded", created: 1, data: { object: { object: "application_fee", id: "fee_2" } } }, deps());
    await applyStripePaymentEvent({ type: "application_fee.refund.updated", created: 1, data: { object: { object: "fee_refund", id: "fr_1", fee: "fee_2", amount: 1000, created: 1796900000, balance_transaction: "txn_f" } } }, deps());
    assert.deepEqual(tables.stripe_fee_events.map(x => [x.kind, x.stripe_object_id, x.amount_cents, x.payment_id]), [["application_fee_refund", "fr_1", 1000, "p2"]]);
  });
  test("a fee refund with no matching payment is logged and invents nothing", async () => {
    const r = await applyStripePaymentEvent({ type: "application_fee.refunded", created: 1, data: { object: { object: "application_fee", id: "fee_x" } } }, deps());
    assert.equal(r.action, "ignored");
    assert.equal(tables.stripe_fee_events.length, 0);
    assert.match(logs.join(), /matches no payment/);
  });
});

test("non-payment events are ignored by the shared module (account.updated stays in the handler)", async () => {
  const r = await applyStripePaymentEvent({ type: "account.updated", data: { object: {} } }, deps());
  assert.equal(r.action, "ignored");
  assert.ok(!STRIPE_PAYMENT_EVENTS.includes("account.updated"));
});

test("stripeGetter sends the secret as a bearer token and surfaces Stripe errors", async () => {
  const seen = [];
  const ok = stripeGetter("sk_test_x", async (url, init) => { seen.push([url, init.headers.Authorization]); return { ok: true, json: async () => ({ id: "ch_1" }) }; });
  assert.deepEqual(await ok("charges/ch_1"), { id: "ch_1" });
  assert.deepEqual(seen, [["https://api.stripe.com/v1/charges/ch_1", "Bearer sk_test_x"]]);
  const bad = stripeGetter("sk", async () => ({ ok: false, status: 404, json: async () => ({ error: { message: "No such charge" } }) }));
  await assert.rejects(bad("charges/x"), /No such charge/);
});

describe("wiring (static)", () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  test("both webhook handlers use the shared module (identical behaviour whichever is live)", () => {
    for (const f of ["supabase/functions/stripe-webhook/index.ts", "api/stripe-webhook.js"]) {
      const s = read(f);
      assert.match(s, /applyStripePaymentEvent/, f);
      assert.doesNotMatch(s, /paid_at:\s*new Date\(\)/, `${f} must not stamp paid_at with the server clock`);
    }
  });
  test("Rent is set only by the explicit tenant Pay Rent workflow", () => {
    const fn = read("supabase/functions/create-payment-intent/index.ts");
    assert.match(fn, /const isPayRent = body\.purpose === "rent";/);
    assert.match(fn, /\.\.\.\(isPayRent \? \{ category: "Rent", origin: "tenant_pay_rent" \} : \{\}\)/);
    assert.equal((fn.match(/category:/g) || []).length, 1, "no other category assignment");
    assert.match(read("src/RentPaymentScreen.jsx"), /purpose:\s*"rent"/);
  });
  test("late-fee job keeps the $50 policy and uses the receivables engine once active", () => {
    const s = read("src/supabase/late-fee-cron/index.ts");
    assert.match(s, /const LATE_FEE_AMOUNT = 50;/);
    assert.match(s, /rpc\("a2_status"\)/);
    assert.match(s, /rpc\("a2_assess_late_fees"\)/, "no date argument: the server uses today's New York date");
    assert.match(s, /a2Installed && !a2\?\.active/, "installed but inactive writes nothing");
  });
  test("nothing in the repo schedules the late-fee job", () => {
    assert.doesNotMatch(read("vercel.json"), /late-fee/);
    const m = read("supabase/migrations/20261104000000_a2_receivables.sql");
    assert.doesNotMatch(m, /cron\.schedule/);
  });
});
