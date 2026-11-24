const PAYMENT_QUESTION = /\b(?:payments?|paid|pay|autopay|rent|receipts?|charg(?:e|ed)|bounc(?:e|ed)|declin(?:e|ed)|overpa(?:id|y)|refund(?:ed)?|bank transfer|ACH)\b/i;
const STATUSES = new Map([
  ["paid", "succeeded"], ["succeeded", "succeeded"], ["pending", "processing"],
  ["processing", "processing"], ["failed", "failed"], ["declined", "declined"],
  ["denied", "declined"], ["returned", "returned"], ["refunded", "refunded"],
  ["partially_refunded", "partially refunded"], ["void", "voided"], ["voided", "voided"],
]);
const UNAVAILABLE = "Verified recent payment records: unavailable.";

export async function getPaymentContext(db, tenantId, message) {
  if (!PAYMENT_QUESTION.test(message)) return "";
  try {
    const { data, error } = await db.from("payments")
      .select("status,amount_cents,amount,created_at,paid_at,voided_at,payment_returns(kind),payment_refunds(reversed_at)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(6);
    if (error || !Array.isArray(data) || !data.length) return UNAVAILABLE;
    const records = data.flatMap(row => {
      const cents = row.amount_cents ?? (row.amount == null ? NaN : Math.round(Number(row.amount) * 100));
      if (!Number.isSafeInteger(cents) || cents <= 0) return [];
      const status = verifiedStatus(row);
      return [{ status, amount_cents: cents, recorded_at: row.created_at, settled_at: status === "succeeded" ? row.paid_at : null }];
    });
    if (!records.length) return UNAVAILABLE;
    return "Verified recent payment records (USD cents, newest recorded first): " + JSON.stringify(records);
  } catch {
    return UNAVAILABLE;
  }
}

function verifiedStatus(row) {
  if (row.voided_at) return "voided";
  if (row.payment_returns?.some(event => event.kind === "ach_return")) return "returned";
  if (row.payment_returns?.length) return "disputed";
  if (row.payment_refunds?.some(event => !event.reversed_at)) return "refund recorded";
  return STATUSES.get(String(row.status).trim().toLowerCase()) ?? "unconfirmed";
}
