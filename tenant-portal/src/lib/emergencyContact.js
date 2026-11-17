// src/lib/emergencyContact.js
// The management phone number a tenant may call AFTER 911 for an urgent property problem, and the hours it is
// answered. Shared by the tenant UI (Vite: VITE_MANAGEMENT_URGENT_PHONE / VITE_MANAGEMENT_URGENT_HOURS) and the AI
// route (Vercel: MANAGEMENT_URGENT_PHONE / MANAGEMENT_URGENT_HOURS). Pure, no I/O.
//
// Unset (the default) → nothing changes: every message keeps saying there is no 24/7 phone line, and the AI is told
// never to give a number. A number is shown only when BOTH the number and its answered hours are configured, so a
// tenant is never given a line without knowing when someone picks up. 911 always comes first.

const PHONE_RE = /^(?:\+?[0-9]|\()[0-9 ().-]{6,20}[0-9]$/;

// Returns { phone, hours } when both values are present and valid, otherwise null.
export function managementContact(phone, hours) {
  const p = String(phone ?? "").trim();
  const h = String(hours ?? "").replace(/\s+/g, " ").trim();
  if (!p || !h || !PHONE_RE.test(p) || p.replace(/\D/g, "").length < 7 || h.length > 80 || /[<>]/.test(h)) return null;
  return { phone: p, hours: h };
}

export function managementContactFromEnv(env = {}) {
  return managementContact(env.MANAGEMENT_URGENT_PHONE, env.MANAGEMENT_URGENT_HOURS);
}

export const NO_PHONE_LINE = "There is no 24/7 emergency phone line yet.";

// The sentence that follows "call 911 first" in tenant-facing emergency copy.
export function urgentPhoneSentence(contact) {
  return contact
    ? `For an urgent property problem (after 911 if anyone is in danger), call Modus management at ${contact.phone} (${contact.hours}).`
    : NO_PHONE_LINE;
}

// The line the AI adds after the fixed safety guidance. It never claims anyone was reached.
export function flaggedLine(contact) {
  return contact
    ? `I've flagged this to Modus management as an emergency. This chat isn't watched around the clock: if anyone is in danger, call 911. For an urgent property problem you can also call Modus management at ${contact.phone} (${contact.hours}).`
    : "I've flagged this to Modus management as an emergency. There's no 24/7 emergency phone line yet, so please don't wait on a reply from this chat if anyone is in danger.";
}

// The phone rule given to the AI model.
export function phoneRuleForPrompt(contact) {
  return contact
    ? `→ The only phone number you may give is Modus management's urgent line, ${contact.phone}, answered ${contact.hours}. Give it only for an urgent or emergency problem, always after "call 911" when anyone may be in danger. Never say management has been reached, called or will arrive by a certain time — say it has been flagged to management as an emergency`
    : "→ There is no 24/7 emergency phone line yet. Never give a phone number, and never say management has been reached, called or will arrive by a certain time — say it has been flagged to management as an emergency";
}
