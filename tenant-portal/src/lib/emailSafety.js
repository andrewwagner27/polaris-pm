// src/lib/emailSafety.js
// The one HTML-escaping and email-field utility for every email Modus builds, used by the Vercel API
// (api/_lib/*) and, for the few landlord-authored emails still composed in the browser, by src/.
// Pure: no I/O, no Node or browser APIs, so both sides import the same code.
//
// Rules:
//   - Every value that did not come from a template literal written in this repo is untrusted (tenant,
//     vendor, applicant and AI text, names, titles, notes, amounts read from the database) and goes
//     through escapeHtml() before it is placed in HTML, whether in element text or an attribute value.
//   - Links built from data go through safeUrl(), which only allows https URLs on hosts we own.
//   - Subjects go through cleanSubject(): no CR/LF (header injection), no control characters, bounded.
//   - Recipients go through parseEmailList()/isValidEmail(): one plain address each, no display names.

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;", "=": "&#61;" };

// Safe for element text AND quoted attribute values. null/undefined become "".
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"'`=]/g, (ch) => HTML_ESCAPES[ch]);
}

// Escapes, then keeps the author's line breaks (for multi-line tenant/vendor text).
export function textToHtml(value) {
  return escapeHtml(String(value ?? "").replace(/\r\n?/g, "\n")).replace(/\n/g, "<br>");
}

export const APP_URL = "https://www.getmodusam.com";
export const APP_HOSTS = Object.freeze(["www.getmodusam.com", "getmodusam.com"]);

// Returns an escaped, attribute-safe URL when it is https on an allowed host; otherwise the fallback
// (default: the portal home). javascript:, data:, http:, protocol-relative and foreign hosts are refused.
export function safeUrl(url, { allowedHosts = APP_HOSTS, fallback = APP_URL } = {}) {
  let parsed;
  try { parsed = new URL(String(url ?? "")); } catch { return escapeHtml(fallback); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return escapeHtml(fallback);
  if (!allowedHosts.includes(parsed.hostname.toLowerCase())) return escapeHtml(fallback);
  return escapeHtml(parsed.toString());
}

// A path inside the portal ("/landlord/maintenance"), never a full URL from data.
export function appLink(path = "/") {
  const p = String(path || "/");
  if (!p.startsWith("/") || p.startsWith("//")) return escapeHtml(APP_URL);
  return safeUrl(APP_URL + p);
}

// Control characters plus the Unicode line/paragraph separators, built from escapes so this file never
// contains a raw separator character.
// eslint-disable-next-line no-control-regex -- removing control characters is the purpose
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F\\u2028\\u2029]+", "g");

// Subject lines: one line, no control characters, collapsed whitespace, at most `max` characters.
export function cleanSubject(value, max = 160) {
  const s = String(value ?? "")
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

// Short single-line text for subjects and table cells (names, titles). Not HTML-escaped: callers
// escape with escapeHtml() when placing it in HTML.
export function oneLine(value, max = 120) {
  return cleanSubject(value, max);
}

const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

// One plain address (no display name, no CR/LF, no commas), at most 254 characters.
export function isValidEmail(value) {
  const s = String(value ?? "");
  return s.length > 0 && s.length <= 254 && !/[\s,<>"]/.test(s) && EMAIL_RE.test(s);
}

// "a@x.com, B@x.com" → ["a@x.com", "b@x.com"] (lower-cased, de-duplicated). Invalid entries are reported,
// never silently used.
export function parseEmailList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  const valid = [], invalid = [];
  for (const item of raw) {
    const s = String(item ?? "").trim();
    if (!s) continue;
    if (isValidEmail(s)) { const low = s.toLowerCase(); if (!valid.includes(low)) valid.push(low); }
    else invalid.push(s);
  }
  return { valid, invalid };
}

// "$1,234.50" from a dollar amount; "—" when it isn't a finite number (never "NaN" or raw input).
export function formatDollars(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
