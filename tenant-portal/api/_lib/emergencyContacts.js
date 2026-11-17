// api/_lib/emergencyContacts.js
// Property-specific emergency numbers shown to a tenant in an emergency (emergency plumber, gas utility, …). Server
// only: the list is chosen by the tenant's OWN property, so a tenant never sees another building's contractors.
// Pure, no I/O.
//
// Configuration: Vercel env EMERGENCY_CONTACTS (JSON), keyed by property id. Empty / unset = nothing is shown.
//   { "<property uuid>": [
//       { "service": "plumbing", "name": "…", "phone": "…", "hours": "24/7",
//         "verified_on": "YYYY-MM-DD", "tenant_may_call": true } ] }
// A contact is published ONLY when it has a valid phone, a verified_on date (the day management confirmed the
// number) and tenant_may_call: true (the contractor or utility agreed to take calls directly from tenants).
// Nothing here implies dispatch or billing terms; the tenant is told management has been alerted either way.

const SERVICES = {
  plumbing: "Emergency plumber",
  gas_utility: "Gas utility emergency line",
  electrical: "Emergency electrician",
  heating: "Emergency heating repair",
  water_damage: "Water damage / restoration",
  locksmith: "Locksmith",
  other: "Emergency contact",
};

// Which services are relevant to which emergency kind (api/_lib/emergencyRules.js). Fire, security, medical and
// structural collapse are 911 only.
const BY_KIND = {
  water: ["plumbing", "water_damage"],
  gas: ["gas_utility"],
  carbon_monoxide: ["gas_utility"],
  electrical: ["electrical"],
  no_heat: ["heating"],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_RE = /^(?:\+?[0-9]|\()[0-9 ().-]{6,20}[0-9]$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v, max) => String(v ?? "").replace(/[<>\r\n]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

function valid(c) {
  if (!c || typeof c !== "object" || !SERVICES[c.service]) return null;
  const phone = clean(c.phone, 24);
  if (!PHONE_RE.test(phone) || phone.replace(/\D/g, "").length < 7) return null;
  if (!DATE_RE.test(String(c.verified_on || "")) || Number.isNaN(Date.parse(c.verified_on))) return null;
  if (c.tenant_may_call !== true) return null;
  return { service: c.service, label: SERVICES[c.service], name: clean(c.name, 60), phone, hours: clean(c.hours, 40) };
}

// Parses the env value. Never throws; malformed JSON = no contacts.
export function parseEmergencyContacts(raw) {
  if (!raw) return {};
  let data;
  try { data = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return {}; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out = {};
  for (const [propertyId, list] of Object.entries(data)) {
    if (!UUID_RE.test(propertyId) || !Array.isArray(list)) continue;
    const ok = list.map(valid).filter(Boolean);
    if (ok.length) out[propertyId.toLowerCase()] = ok;
  }
  return out;
}

// The verified contacts for this property that fit this emergency kind.
export function contactsFor({ propertyId, kind }, config) {
  const services = BY_KIND[kind];
  if (!services || !propertyId) return [];
  const list = config?.[String(propertyId).toLowerCase()] || [];
  return list.filter((c) => services.includes(c.service));
}

export function contactsFromEnv({ propertyId, kind }, env = {}) {
  return contactsFor({ propertyId, kind }, parseEmergencyContacts(env.EMERGENCY_CONTACTS));
}

// One line for the tenant, after the safety guidance. Empty when nothing is configured.
export function formatContacts(contacts) {
  if (!contacts?.length) return "";
  const lines = contacts.map((c) => `${c.label}${c.name ? ` (${c.name})` : ""}: ${c.phone}${c.hours ? `, ${c.hours}` : ""}`);
  return `Once you're safe, you can also call — ${lines.join("; ")}.`;
}
