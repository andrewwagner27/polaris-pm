// api/_lib/recipients.js
// The single source of management notification recipients for every Vercel email.
//
//   management  (maintenance tickets, urgent tickets, tenant replies, vendor quotes and completions,
//                inspections, emergency dispatch, the daily recap)
//               → LANDLORD_EMAIL (comma-separated list allowed)
//   escalation  (tenant AI escalations and emergencies)
//               → ESCALATION_NOTIFY_EMAILS when set, otherwise the management list
//
// No address is hard-coded. When nothing valid is configured the result is
//   { ok: false, code: "MANAGEMENT_RECIPIENT_NOT_CONFIGURED", error }
// and callers send nothing, record the failure where they can, and log the error. They never fall back
// to a guessed address.
//
// LANDLORD_NOTIFY_EMAILS is no longer read by the Vercel API: it was a tenant send allow-list whose
// default included an old test address. Tenants and vendors no longer choose recipients at all.

import { parseEmailList } from "../../src/lib/emailSafety.js";

export const RECIPIENT_NOT_CONFIGURED = "MANAGEMENT_RECIPIENT_NOT_CONFIGURED";

export function managementRecipients(env = globalThis.process?.env ?? {}, { purpose = "management" } = {}) {
  const sources = purpose === "escalation" ? ["ESCALATION_NOTIFY_EMAILS", "LANDLORD_EMAIL"] : ["LANDLORD_EMAIL"];
  const ignored = [];
  for (const name of sources) {
    const { valid, invalid } = parseEmailList(env[name]);
    if (invalid.length) ignored.push(`${name} has ${invalid.length} invalid address(es)`);
    if (valid.length) return { ok: true, recipients: valid, source: name, ...(ignored.length ? { warnings: ignored } : {}) };
  }
  return {
    ok: false,
    code: RECIPIENT_NOT_CONFIGURED,
    recipients: [],
    source: null,
    error: `No management email is configured: set ${sources.join(" or ")} in the Vercel environment.${ignored.length ? " " + ignored.join("; ") + "." : ""}`,
  };
}
