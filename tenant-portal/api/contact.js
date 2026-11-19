import { deploymentEnv } from "./_lib/deployEnv.js";
import { payloadKey, sendEmail } from "./_lib/email.js";
import { isValidEmail, parseEmailList, textToHtml } from "../src/lib/emailSafety.js";

const WINDOW_MS = 10 * 60 * 1000;
const entries = new Map();

// Best effort per Vercel instance. Keep the map bounded on long-lived instances.
function reserveSubmission(req) {
  const client = req.headers["x-vercel-forwarded-for"] || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  for (const [key, value] of entries) {
    if (value.expiresAt <= now) entries.delete(key);
  }
  const entry = entries.get(client);
  if (entry) {
    if (entry.count >= 4) return false;
    entry.count++;
    return true;
  }
  if (entries.size >= 1024) return false;
  entries.set(client, { count: 1, expiresAt: now + WINDOW_MS });
  return true;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use the contact form to send a message." });
  }
  if (req.headers["sec-fetch-site"] === "cross-site" ||
      req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return res.status(400).json({ error: "Submit the message from the contact page." });
  }

  const { name, email, message, website } = req.body ?? {};
  if (website) return res.status(400).json({ error: "This submission could not be accepted." });
  if (typeof name !== "string" || !name.trim() || name.length > 100 ||
      typeof email !== "string" || !isValidEmail(email.trim()) ||
      typeof message !== "string" || !message.trim() || message.length > 3000) {
    return res.status(400).json({ error: "Enter your name, a valid email address, and a message." });
  }

  const environment = deploymentEnv();
  if (environment === "preview" || environment === "development") {
    return res.status(200).json({ status: "preview" });
  }
  const unavailable = { error: "The contact form is temporarily unavailable. Please try again later." };
  if (environment !== "production") return res.status(503).json(unavailable);
  const { valid, invalid } = parseEmailList(process.env.CONTACT_EMAIL || process.env.LANDLORD_EMAIL);
  if (!valid.length || invalid.length) return res.status(503).json(unavailable);
  if (!reserveSubmission(req)) {
    res.setHeader("Retry-After", String(WINDOW_MS / 1000));
    return res.status(429).json({ error: "Too many submissions. Please try again in a few minutes." });
  }

  const text = ["Name: " + name.trim(), "Email: " + email.trim(), "", message.trim()].join("\n");
  const mail = { to: valid, subject: "Modus website inquiry", replyTo: email.trim(), text, html: textToHtml(text) };
  const outcome = await sendEmail({ ...mail, idempotencyKey: payloadKey("website-contact", mail) });
  if (!outcome.ok) return res.status(502).json({ error: "We couldn’t confirm delivery. Please try again." });
  return res.status(200).json({ status: "sent" });
}
