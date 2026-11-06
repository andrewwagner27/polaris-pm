// Stripe payment events → payments / payment_refunds / stripe_fee_events rows (A2.4, A2.5, D8, D10).
// Plain JS with injected dependencies so the Supabase Edge Function (Deno), the Vercel route (Node)
// and the node tests all run the same code.
//
//   db         supabase-js client (service role)
//   stripeGet  async (path) => parsed JSON from GET https://api.stripe.com/v1/<path>
//   log        console-like
//
// Charges are destination charges created on the platform account (create-payment-intent), so the
// charge and its balance transaction — Stripe's fee — are read from the platform account. That fee is
// Modus's cost, not the owner's: it is stored and shown in reconciliation, and never posted to owner books (D8).
// A3: each event is captured separately. The database posts a transfer reversal and a Modus fee refund when they arrive,
// and never posts Stripe's own fees, fee reversals, or return and dispute fees to owner books.
// This module only records what Stripe did. Nothing in Modus issues a refund or reverses a transfer.
//
// Stripe may deliver any event more than once and in any order, so every write here is idempotent.

export const STRIPE_PAYMENT_EVENTS = [
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "refund.created",
  "refund.updated",
  "refund.failed",
  "charge.refund.updated",
  "application_fee.refunded",
  "application_fee.refund.updated",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.closed",
  "transfer.reversed",
];

// Stripe's dispute reasons for an ACH failure after success. Anything else is a customer dispute. Both come back the same way.
const ACH_RETURN_REASONS = new Set(["insufficient_funds", "incorrect_account_details", "bank_cannot_process"]);

const A2_COLUMNS = ["stripe_charge_id", "stripe_fee_cents", "stripe_net_cents", "stripe_balance_transaction_id", "stripe_application_fee_id", "stripe_application_fee_cents", "stripe_transfer_id", "stripe_transfer_cents", "stripe_transfer_destination"];
const iso = (unixSeconds) => new Date(unixSeconds * 1000).toISOString();
const idOf = (x) => (typeof x === "string" ? x : x?.id) || null;

async function markSucceeded(event, { db, stripeGet, log }) {
  const pi = event.data.object;
  // A late or repeated success must not undo a refund status set since (it would post the income again).
  const { data: current } = await db.from("payments").select("status").eq("stripe_payment_intent_id", pi.id).maybeSingle();
  if (/refund|returned/i.test(current?.status || "")) return { action: "ignored", reason: `payment already ${current.status}`, paymentIntentId: pi.id };

  // Stripe's own success timestamp (the event's creation time), not the time this handler runs.
  const update = { status: "paid", paid_at: iso(event.created) };
  const chargeId = idOf(pi.latest_charge);
  if (chargeId) {
    update.stripe_charge_id = chargeId;
    try {
      const charge = await stripeGet(`charges/${encodeURIComponent(chargeId)}?expand[]=balance_transaction&expand[]=application_fee&expand[]=transfer`);
      const bt = charge?.balance_transaction;
      if (bt && typeof bt === "object") {
        update.stripe_fee_cents = bt.fee;
        update.stripe_net_cents = bt.net;
        update.stripe_balance_transaction_id = bt.id;
      }
      const fee = charge?.application_fee;
      if (fee && typeof fee === "object") {
        update.stripe_application_fee_id = fee.id;
        update.stripe_application_fee_cents = fee.amount;
      }
      // The arrangement a later refund is judged against: did this charge actually send funds to a connected account?
      const transfer = charge?.transfer;
      const destination = charge?.transfer_data?.destination || (transfer && typeof transfer === "object" ? idOf(transfer.destination) : null);
      if (destination) update.stripe_transfer_destination = idOf(destination);
      if (transfer) update.stripe_transfer_id = idOf(transfer);
      if (transfer && typeof transfer === "object") update.stripe_transfer_cents = transfer.amount;
    } catch (err) {
      log.error(`[stripe-events] fee lookup failed for ${chargeId}: ${err.message}`);   // payment is still marked paid
    }
  }
  let { error } = await db.from("payments").update(update).eq("stripe_payment_intent_id", pi.id);
  if (error && A2_COLUMNS.some((c) => String(error.message).includes(c))) {
    // Database without the A2 columns yet: never let fee capture block marking the payment paid.
    log.error(`[stripe-events] A2 columns missing, recording status only: ${error.message}`);
    ({ error } = await db.from("payments").update({ status: "paid", paid_at: update.paid_at }).eq("stripe_payment_intent_id", pi.id));
  }
  if (error) throw new Error(`payments update failed: ${error.message}`);
  const { data: payment } = await db.from("payments").select("id, tenant_id, amount_cents")
    .eq("stripe_payment_intent_id", pi.id).maybeSingle();
  return { action: "paid", paymentIntentId: pi.id, paidAt: update.paid_at, feeCents: update.stripe_fee_cents ?? null, payment };
}

async function markFailed(event, { db, log }) {
  const pi = event.data.object;
  // Only a payment still in progress can fail. A failed attempt delivered after a later success must not undo it.
  const { data: current } = await db.from("payments").select("status").eq("stripe_payment_intent_id", pi.id).maybeSingle();
  if (current && String(current.status).toLowerCase() !== "pending") {
    log.error(`[stripe-events] ignored payment_failed for ${pi.id}: payment is ${current.status}`);
    return { action: "ignored", reason: `payment is ${current.status}`, paymentIntentId: pi.id };
  }
  const { error } = await db.from("payments").update({ status: "failed" }).eq("stripe_payment_intent_id", pi.id);
  if (error) throw new Error(`payments update failed: ${error.message}`);
  return { action: "failed", paymentIntentId: pi.id };
}

const addFeeEvents = async (db, rows) => {
  if (!rows.length) return;
  const { error } = await db.from("stripe_fee_events").upsert(rows, { onConflict: "kind,stripe_object_id", ignoreDuplicates: true });
  if (error) throw new Error(`fee event insert failed: ${error.message}`);   // Stripe retries; the write is idempotent
};

// D8/D10: the refund's balance transaction and any transfer reversal. A failed lookup is flagged by
// a2_stripe_fees (refund_details_missing), and any later event for this refund fills it in.
async function captureRefundDetails(refund, refundRowId, paymentId, { db, stripeGet, log }) {
  let full;
  try {
    full = await stripeGet(`refunds/${encodeURIComponent(refund.id)}?expand[]=balance_transaction&expand[]=transfer_reversal`);
  } catch (err) {
    log.error(`[stripe-events] refund detail lookup failed for ${refund.id}: ${err.message}`);
    return;
  }
  const rows = [];
  const bt = full?.balance_transaction;
  if (bt && typeof bt === "object") {
    rows.push({ payment_id: paymentId, refund_id: refundRowId, kind: "refund_balance_transaction", stripe_object_id: bt.id,
      balance_transaction_id: bt.id, amount_cents: bt.amount, fee_cents: bt.fee, occurred_at: iso(refund.created) });
  }
  const tr = full?.transfer_reversal;
  if (tr && typeof tr === "object") {
    rows.push({ payment_id: paymentId, refund_id: refundRowId, kind: "transfer_reversal", stripe_object_id: tr.id,
      balance_transaction_id: idOf(tr.balance_transaction), amount_cents: tr.amount, occurred_at: iso(refund.created) });
  }
  await addFeeEvents(db, rows);
}

async function recordRefunds(event, ctx) {
  const { db, stripeGet, log } = ctx;
  const obj = event.data.object;
  let refunds, paymentIntentId;
  if (event.type === "charge.refunded") {
    paymentIntentId = idOf(obj.payment_intent);
    try {
      refunds = (await stripeGet(`refunds?charge=${encodeURIComponent(obj.id)}&limit=100`))?.data;
    } catch (err) {
      log.error(`[stripe-events] refund list failed for ${obj.id}: ${err.message}`);
    }
    refunds ||= obj.refunds?.data || [];
  } else {
    paymentIntentId = idOf(obj.payment_intent);
    refunds = [obj];
  }
  if (!paymentIntentId) return { action: "ignored", reason: "no payment intent" };
  const { data: payment } = await db.from("payments").select("id").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle();
  if (!payment) return { action: "ignored", reason: "unknown payment intent", paymentIntentId };

  const recorded = [], rejected = [], reversed = [];
  for (const r of refunds) {
    if (!r?.id) continue;

    // Money that came back: a refund recorded earlier that failed or was canceled no longer counts.
    if (r.status === "failed" || r.status === "canceled") {
      const { error } = await db.from("payment_refunds")
        .update({ reversed_at: iso(event.created), reversed_reason: `Stripe refund ${r.status}${r.failure_reason ? `: ${r.failure_reason}` : ""}` })
        .eq("stripe_refund_id", r.id);
      if (error) throw new Error(`refund reversal failed: ${error.message}`);
      await addFeeEvents(db, [{ payment_id: payment.id, kind: "refund_failed", stripe_object_id: r.id,
        balance_transaction_id: idOf(r.failure_balance_transaction), amount_cents: r.amount, occurred_at: iso(event.created), detail: r.failure_reason || r.status }]);
      reversed.push(r.id);
      continue;
    }

    // Only money that has actually gone back (status succeeded); pending refunds are not recorded.
    if (r.status !== "succeeded" || !(r.amount > 0)) continue;
    const { error } = await db.from("payment_refunds").upsert([{
      payment_id: payment.id,
      amount_cents: r.amount,
      refunded_at: iso(r.created),
      stripe_refund_id: r.id,
      reason: r.reason ? `Stripe: ${r.reason}` : "Stripe refund",
    }], { onConflict: "stripe_refund_id", ignoreDuplicates: true });
    if (error) {
      // More than the payment we recorded. Retrying can't fix it, so flag it instead of failing forever.
      if (/exceed/.test(error.message)) {
        log.error(`[stripe-events] refund ${r.id} rejected: ${error.message}`);
        await addFeeEvents(db, [{ payment_id: payment.id, kind: "refund_rejected", stripe_object_id: r.id,
          amount_cents: r.amount, occurred_at: iso(r.created), detail: error.message }]);
        rejected.push(r.id);
        continue;
      }
      throw new Error(`refund insert failed: ${error.message}`);
    }
    const { data: row } = await db.from("payment_refunds").select("id").eq("stripe_refund_id", r.id).maybeSingle();
    await captureRefundDetails(r, row?.id ?? null, payment.id, ctx);
    recorded.push(r.id);
  }
  if (!recorded.length && !rejected.length && !reversed.length) return { action: "no succeeded refunds", paymentIntentId };
  return { action: "refunds recorded", paymentIntentId, refunds: recorded, rejected, reversed };
}

// D10: a refund of the Modus fee, recorded only when it actually happened. A database trigger posts it.
async function recordApplicationFeeRefund(event, { db, stripeGet, log }) {
  const obj = event.data.object;
  const isRefundObject = obj.object === "fee_refund";
  const feeId = isRefundObject ? idOf(obj.fee) : obj.id;
  if (!feeId) return { action: "ignored", reason: "no application fee" };
  let { data: payment } = await db.from("payments").select("id").eq("stripe_application_fee_id", feeId).maybeSingle();
  if (!payment && !isRefundObject && idOf(obj.charge)) {
    ({ data: payment } = await db.from("payments").select("id").eq("stripe_charge_id", idOf(obj.charge)).maybeSingle());
  }
  if (!payment) {
    log.error(`[stripe-events] application fee ${feeId} matches no payment`);
    return { action: "ignored", reason: "unknown application fee" };
  }
  let list = isRefundObject ? [obj] : null;
  if (!list) {
    try {
      list = (await stripeGet(`application_fees/${encodeURIComponent(feeId)}/refunds?limit=100`))?.data;
    } catch (err) {
      log.error(`[stripe-events] application fee refund list failed for ${feeId}: ${err.message}`);
    }
    list ||= obj.refunds?.data || [];
  }
  const rows = list.filter((f) => f?.id && f.amount > 0).map((f) => ({
    payment_id: payment.id, kind: "application_fee_refund", stripe_object_id: f.id,
    balance_transaction_id: idOf(f.balance_transaction), amount_cents: f.amount, occurred_at: iso(f.created),
  }));
  await addFeeEvents(db, rows);
  return { action: "application fee refund recorded", refunds: rows.map((r) => r.stripe_object_id) };
}

// An ACH payment that failed after it succeeded arrives as a dispute. Stripe debits Modus's balance and doesn't reverse the transfer.
// This only records what happened: a person reverses the transfer in the Dashboard, and the database tracks what's outstanding.
async function recordDispute(event, { db, log }) {
  const dp = event.data.object;
  if (/^warning/.test(dp.status || "") || dp.status === "won") return { action: "ignored", reason: `dispute ${dp.status}`, disputeId: dp.id };
  const paymentIntentId = idOf(dp.payment_intent);
  let payment = null;
  if (paymentIntentId) ({ data: payment } = await db.from("payments").select("id").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle());
  if (!payment && idOf(dp.charge)) ({ data: payment } = await db.from("payments").select("id").eq("stripe_charge_id", idOf(dp.charge)).maybeSingle());
  if (!payment) return { action: "ignored", reason: "unknown payment", disputeId: dp.id };

  const { error } = await db.from("payment_returns").upsert([{
    payment_id: payment.id,
    kind: ACH_RETURN_REASONS.has(dp.reason) ? "ach_return" : "dispute",
    amount_cents: dp.amount,
    returned_on: new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(event.created * 1000)),
    reason: dp.reason || "dispute",
    stripe_dispute_id: dp.id,
  }], { onConflict: "stripe_dispute_id", ignoreDuplicates: true });
  if (error) {
    // A partial amount, or a payment not collected. Retrying can't fix it, so flag it for a person instead of failing forever.
    if (/must equal|only a collected/.test(error.message)) {
      log.error(`[stripe-events] dispute ${dp.id} rejected: ${error.message}`);
      await addFeeEvents(db, [{ payment_id: payment.id, kind: "return_rejected", stripe_object_id: dp.id, amount_cents: dp.amount, occurred_at: iso(event.created), detail: error.message }]);
      return { action: "return rejected", disputeId: dp.id };
    }
    throw new Error(`payment return insert failed: ${error.message}`);
  }
  // Stripe's fee for the return: Modus's expense, never the owner's.
  const fee = (dp.balance_transactions || []).reduce((s, b) => s + (b?.fee || 0), 0);
  if (fee > 0) {
    await addFeeEvents(db, [{ payment_id: payment.id, kind: "dispute_fee", stripe_object_id: dp.id, amount_cents: dp.amount, fee_cents: fee,
      balance_transaction_id: idOf(dp.balance_transactions[0]), occurred_at: iso(event.created), detail: dp.reason || null }]);
  }
  return { action: "payment returned", disputeId: dp.id, paymentId: payment.id };
}

// A transfer reversal made in the Dashboard. The database posts it and updates the recovery status.
async function recordTransferReversal(event, { db, stripeGet, log }) {
  const transfer = event.data.object;
  const { data: payment } = await db.from("payments").select("id").eq("stripe_transfer_id", transfer.id).maybeSingle();
  if (!payment) return { action: "ignored", reason: "unknown transfer", transferId: transfer.id };
  let list = transfer.reversals?.data;
  if (!list?.length) {
    try {
      list = (await stripeGet(`transfers/${encodeURIComponent(transfer.id)}/reversals?limit=100`))?.data;
    } catch (err) {
      log.error(`[stripe-events] reversal list failed for ${transfer.id}: ${err.message}`);
      throw err;   // Stripe retries
    }
  }
  const rows = (list || []).filter((t) => t?.id && t.amount > 0).map((t) => ({
    payment_id: payment.id, kind: "transfer_reversal", stripe_object_id: t.id,
    balance_transaction_id: idOf(t.balance_transaction), amount_cents: t.amount, occurred_at: iso(t.created || event.created),
  }));
  await addFeeEvents(db, rows);
  return { action: "transfer reversal recorded", transferId: transfer.id, reversals: rows.map((x) => x.stripe_object_id) };
}

export async function applyStripePaymentEvent(event, deps) {
  const ctx = { log: console, ...deps };
  switch (event?.type) {
    case "payment_intent.succeeded":      return markSucceeded(event, ctx);
    case "payment_intent.payment_failed": return markFailed(event, ctx);
    case "charge.refunded":
    case "refund.created":
    case "refund.updated":
    case "refund.failed":
    case "charge.refund.updated":         return recordRefunds(event, ctx);
    case "application_fee.refunded":
    case "application_fee.refund.updated": return recordApplicationFeeRefund(event, ctx);
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.funds_withdrawn":
    case "charge.dispute.closed":         return recordDispute(event, ctx);
    case "transfer.reversed":             return recordTransferReversal(event, ctx);
    default:                              return { action: "ignored", reason: "not a payment event" };
  }
}

// Stripe REST GET for either runtime (no SDK dependency).
export function stripeGetter(secretKey, fetchImpl = fetch) {
  return async (path) => {
    const res = await fetchImpl(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${secretKey}` } });
    const json = await res.json();
    if (!res.ok || json?.error) throw new Error(json?.error?.message || `Stripe ${res.status}`);
    return json;
  };
}
