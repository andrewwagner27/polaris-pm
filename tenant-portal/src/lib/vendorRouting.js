// src/lib/vendorRouting.js
// Default contractor and responsibility rules for maintenance, shared by the landlord app and the server. Pure.
//
// Preferred contractor: a row in the existing vendor directory (public.vendors, landlord-only by RLS) whose notes
// contain "#preferred". Its `phone` is the primary number; a line "Backup: <number>" in the notes is the backup.
// It is the default suggestion for ROUTINE and PRIORITY landlord-responsibility work. Management can always pick
// another vendor. Never used for emergencies (those keep their own pathway) or for tenant-caused lock-outs.
// Nothing here dispatches, contacts or pays anyone.

import { assessSeverity } from "../../api/_lib/emergencyRules.js";
import { specialistFor, ownerTopic, approvedProviderFor } from "../../api/_lib/ownerRouting.js";

const PHONE = String.raw`(\+?[0-9(][0-9 ().-]{6,20}[0-9])`;

export function isPreferredVendor(v) {
  return Boolean(v && v.active !== false && /(^|\s)#preferred\b/i.test(String(v.notes || "")));
}

// { primary, backup } — numbers for MANAGEMENT only (never shown to tenants). Either may be null.
export function contractorContacts(v) {
  if (!v) return { primary: null, backup: null };
  const m = String(v.notes || "").match(new RegExp(String.raw`\bbackup(?: phone)?\s*[:=-]\s*` + PHONE, "i"));
  return { primary: v.phone ? String(v.phone).trim() : null, backup: m ? m[1].trim() : null };
}

// Who is responsible, at any stage (request, assignment, follow-up). Coordinating the work and paying for it are
// separate: "tenant_possible" means management still coordinates the repair; billing is decided later, by a person.
//   "tenant"           ordinary lost-key / lock-out with nothing broken → tenant arranges a locksmith; no work order
//   "tenant_possible"  the AI or management flagged possible tenant-caused damage → document, decide billing later
//   "landlord"         everything else (including every safety repair, whoever caused it)
export function responsibilityFor(ticket) {
  const text = `${ticket?.title || ""}\n${ticket?.description || ""}`;
  const severity = assessSeverity(text);
  if (severity?.level === "emergency") return "landlord";           // safety first; responsibility is settled later
  if (severity?.level === "tenant_lockout") return "tenant";
  if (ticket?.billable_to_tenant === true) return "tenant_possible";
  return "landlord";
}

export function isEmergencyTicket(ticket) {
  if (ticket?.is_emergency === true) return true;
  return assessSeverity(`${ticket?.title || ""}\n${ticket?.description || ""}`)?.level === "emergency";
}

// The vendor to suggest by default for this ticket, or null (management chooses).
// - Emergencies and tenant lock-outs: none (unchanged).
// - Property operations (parking, trash, common areas) and incident reports: none — the owner decides.
// - Needs a specialist (api/_lib/ownerRouting.js): an approved provider of that trade if one is in the directory,
//   never the general handyman.
// - Otherwise: the #preferred contractor.
export function defaultVendorFor(vendors, ticket) {
  if (isEmergencyTicket(ticket)) return null;
  if (responsibilityFor(ticket) === "tenant") return null;
  if (ownerTopic(`${ticket?.title || ""}\n${ticket?.description || ""}`)) return null;
  const specialist = specialistFor(ticket);
  if (specialist) return approvedProviderFor(vendors, specialist.trade);
  return (Array.isArray(vendors) ? vendors : []).find(isPreferredVendor) || null;
}

export { specialistFor, ownerTopic };
