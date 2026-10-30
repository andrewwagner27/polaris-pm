// api/vendor-ticket.js
// Vendor portal API. Every vendor read/write goes through here using the service-role
// client, scoped to the ONE ticket bound into the signed vendor session.
//
// Request:  POST { action: string, ...fields }
// Auth:     header "X-Vendor-Session: <session from /api/vendor-verify-pin>"
//           (except action "preview", which takes { token } and returns only the title)
//
// The ticket id is ALWAYS taken from the verified session — never from the request body.
// ENV: VENDOR_SESSION_SECRET (required — fails closed with 500 if missing).

import crypto from "node:crypto";
import { supabaseAdmin as supabase, timingSafeEqualStr } from "./_lib/auth.js";
import {
  verifyVendorSession, hashVendorToken, isVendorSessionConfigured,
} from "./_lib/vendorSession.js";

const BUCKET = "maintenance-photos";
const SIGNED_URL_TTL = 600; // 10 minutes, matches src/storageUtils.js

// Fields a vendor may see. vendor_pin / vendor_token / tenant_id / unit_id / landlord-only
// fields are never returned. entry_instructions is added only after the work order is signed.
const TICKET_FIELDS = [
  "id", "title", "description", "category", "priority", "status", "created_at",
  "scheduled_date", "scheduled_time", "vendor_name", "property_address",
  "work_order_accepted_at", "quote_amount", "quote_notes", "quote_submitted_at",
  "quote_approved_at", "invoice_notes",
];
const COMMENT_FIELDS = ["id", "body", "author_type", "author_name", "created_at"];

const UPLOAD_KINDS = { photo: "vendor", quote: "quote", invoice: "invoice" };
const UPLOAD_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "pdf"]);

const MAX_COMMENT = 2000;
const MAX_NOTES = 2000;
const MAX_NAME = 120;
const MAX_QUOTE = 1_000_000;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

// ── helpers ──────────────────────────────────────────────────────────────

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function vendorView(ticket) {
  const view = pick(ticket, TICKET_FIELDS);
  if (ticket.work_order_accepted_at && ticket.entry_instructions) {
    view.entry_instructions = ticket.entry_instructions;
  }
  return view;
}

const isClosed   = (t) => t.status === "resolved" || t.status === "pending_review";
const canQuote   = (t) => !isClosed(t) && t.status !== "quote_submitted" && !t.quote_approved_at;
const canComplete = (t) => !!t.quote_approved_at && !isClosed(t);

function requireAccepted(t) {
  if (!t.work_order_accepted_at) throw new HttpError(403, "Work order must be accepted first", "not_accepted");
}

function cleanText(value, max, field, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(400, `${field} is required`);
    return null;
  }
  if (typeof value !== "string") throw new HttpError(400, `${field} must be a string`);
  const v = value.trim();
  if (required && !v) throw new HttpError(400, `${field} is required`);
  if (v.length > max) throw new HttpError(400, `${field} is too long`);
  return v || null;
}

function sessionFromRequest(req) {
  const h = req.headers || {};
  return h["x-vendor-session"] || h["X-Vendor-Session"] || null;
}

// Verifies the signed session and loads the bound ticket. Throws HttpError(401) on any failure.
async function loadSessionTicket(req) {
  const result = verifyVendorSession(sessionFromRequest(req));
  if (!result.ok) throw new HttpError(401, "Vendor session invalid or expired", result.reason);

  const { data: ticket } = await supabase
    .from("maintenance_requests")
    .select("*")
    .eq("id", result.claims.tid)
    .maybeSingle();

  if (!ticket || !ticket.vendor_token) throw new HttpError(401, "Vendor session invalid or expired", "revoked");
  // Session must belong to the vendor token currently on the ticket (reassignment revokes it)
  if (!timingSafeEqualStr(hashVendorToken(ticket.vendor_token), result.claims.th)) {
    throw new HttpError(401, "Vendor session invalid or expired", "revoked");
  }
  if (!ticket.vendor_token_expires_at || new Date(ticket.vendor_token_expires_at) < new Date()) {
    throw new HttpError(401, "Vendor link expired", "link_expired");
  }
  return ticket;
}

async function addVendorComment(ticket, body) {
  const { error } = await supabase.from("maintenance_comments").insert({
    request_id:        ticket.id,
    body,
    author_type:       "vendor",
    author_name:       ticket.vendor_name || "Vendor",
    visible_to_tenant: false,
  });
  if (error) throw new HttpError(500, "Failed to save comment");
}

async function updateTicket(ticket, fields) {
  const { error } = await supabase.from("maintenance_requests").update(fields).eq("id", ticket.id);
  if (error) throw new HttpError(500, "Failed to update ticket");
}

// ── actions ──────────────────────────────────────────────────────────────

async function actionPreview(body) {
  const token = body.token;
  if (typeof token !== "string" || !token || token.length > 200) throw new HttpError(400, "token required");
  const { data: t } = await supabase
    .from("maintenance_requests")
    .select("title, vendor_token_expires_at")
    .eq("vendor_token", token)
    .maybeSingle();
  if (!t) { await sleep(500); throw new HttpError(404, "Invalid link", "invalid_link"); }
  if (!t.vendor_token_expires_at || new Date(t.vendor_token_expires_at) < new Date()) {
    throw new HttpError(410, "Link expired", "link_expired");
  }
  return { valid: true, title: t.title || "" };
}

async function actionGet(ticket) {
  const { data: comments } = await supabase
    .from("maintenance_comments")
    .select("*")
    .eq("request_id", ticket.id)
    .order("created_at", { ascending: true });

  let photos = [];
  const { data: files } = await supabase.storage.from(BUCKET).list(ticket.id);
  const paths = (files || [])
    .filter(f => f?.name && !f.name.startsWith("."))
    .map(f => `${ticket.id}/${f.name}`);
  if (paths.length) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
    photos = (signed || [])
      .filter(s => s?.signedUrl)
      .map(s => ({ name: String(s.path || "").split("/").pop(), url: s.signedUrl }));
  }

  return {
    ticket: vendorView(ticket),
    comments: (comments || []).map(c => pick(c, COMMENT_FIELDS)),
    photos,
  };
}

async function actionAcceptWorkOrder(ticket, body) {
  if (ticket.work_order_accepted_at) return { ok: true, already_accepted: true };
  const name  = cleanText(body.signature_name, MAX_NAME, "signature_name", { required: true });
  const email = cleanText(body.vendor_email, 254, "vendor_email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "vendor_email is invalid");

  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  await updateTicket(ticket, {
    work_order_accepted_at: new Date().toISOString(),
    work_order_accepted_by: name,
    vendor_email:           email,
  });
  await addVendorComment(ticket, `Work order accepted and signed by ${name} on ${today}.`);
  return { ok: true };
}

async function actionComment(ticket, body) {
  requireAccepted(ticket);
  if (isClosed(ticket)) throw new HttpError(409, "Ticket is closed for comments", "closed");
  const text = cleanText(body.body, MAX_COMMENT, "body", { required: true });
  await addVendorComment(ticket, text);
  return { ok: true };
}

async function actionSubmitQuote(ticket, body) {
  requireAccepted(ticket);
  if (!canQuote(ticket)) throw new HttpError(409, "A quote cannot be submitted for this ticket now", "bad_state");
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_QUOTE) throw new HttpError(400, "amount is invalid");
  const rounded = Math.round(amount * 100) / 100;
  const notes = cleanText(body.notes, MAX_NOTES, "notes");

  await updateTicket(ticket, {
    quote_amount:       rounded,
    quote_notes:        notes ?? "",
    quote_submitted_at: new Date().toISOString(),
    status:             "quote_submitted",
  });
  await addVendorComment(ticket, `Quote submitted: $${rounded}${notes ? `. Notes: ${notes}` : ""}`);
  return { ok: true };
}

async function actionComplete(ticket, body) {
  requireAccepted(ticket);
  if (!canComplete(ticket)) throw new HttpError(409, "Work cannot be marked complete for this ticket now", "bad_state");
  const notes = cleanText(body.invoice_notes, MAX_NOTES, "invoice_notes");

  let invoicePath = null;
  if (body.invoice_path !== undefined && body.invoice_path !== null && body.invoice_path !== "") {
    // Only an invoice path issued by upload_url for THIS ticket is accepted
    const prefix = `${ticket.id}/`;
    const p = body.invoice_path;
    if (typeof p !== "string" || !p.startsWith(prefix) ||
        !/^invoice-\d+-[a-z0-9]+\.[a-z0-9]+$/.test(p.slice(prefix.length))) {
      throw new HttpError(400, "invoice_path is invalid");
    }
    invoicePath = body.invoice_path;
  }

  await updateTicket(ticket, {
    status:        "pending_review",
    invoice_url:   invoicePath,
    invoice_notes: notes,
  });
  const name = ticket.vendor_name || "Vendor";
  await addVendorComment(ticket, `${name} marked work as complete and submitted for review.${notes ? ` Notes: ${notes}` : ""}`);
  return { ok: true, invoice_path: invoicePath };
}

async function actionUploadUrl(ticket, body) {
  requireAccepted(ticket);
  const prefix = UPLOAD_KINDS[body.kind];
  if (!prefix) throw new HttpError(400, "kind must be photo, quote or invoice");
  const ext = String(body.ext || "").toLowerCase().replace(/^\./, "");
  if (!UPLOAD_EXTS.has(ext)) throw new HttpError(400, "File type not allowed");

  if (body.kind === "photo"   && isClosed(ticket))     throw new HttpError(409, "Ticket is closed", "closed");
  if (body.kind === "quote"   && !canQuote(ticket))    throw new HttpError(409, "Quote not allowed now", "bad_state");
  if (body.kind === "invoice" && !canComplete(ticket)) throw new HttpError(409, "Invoice not allowed now", "bad_state");

  const rand = crypto.randomBytes(5).toString("hex"); // filename uniqueness only, not a secret
  const path = `${ticket.id}/${prefix}-${Date.now()}-${rand}.${ext}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data?.signedUrl) throw new HttpError(500, "Could not create upload URL");
  return { path, signed_url: data.signedUrl };
}

const SESSION_ACTIONS = {
  get:               (t)    => actionGet(t),
  accept_work_order: (t, b) => actionAcceptWorkOrder(t, b),
  comment:           (t, b) => actionComment(t, b),
  submit_quote:      (t, b) => actionSubmitQuote(t, b),
  complete:          (t, b) => actionComplete(t, b),
  upload_url:        (t, b) => actionUploadUrl(t, b),
};

// ── handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (!isVendorSessionConfigured()) {
    console.error("VENDOR_SESSION_SECRET not configured — vendor portal disabled");
    return res.status(500).json({ error: "Vendor access is not configured" });
  }

  const body = (req.body && typeof req.body === "object") ? req.body : {};
  const action = body.action;

  try {
    if (action === "preview") return res.status(200).json(await actionPreview(body));

    const run = Object.prototype.hasOwnProperty.call(SESSION_ACTIONS, action) ? SESSION_ACTIONS[action] : null;
    if (!run) return res.status(400).json({ error: "Unknown action" });

    const ticket = await loadSessionTicket(req);
    return res.status(200).json(await run(ticket, body));
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    }
    console.error("vendor-ticket error:", err?.message);
    return res.status(500).json({ error: "Internal error" });
  }
}
