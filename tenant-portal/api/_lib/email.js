// api/_lib/email.js
// Server-side Resend helper so API routes can send mail directly instead of
// calling /api/send-email over HTTP.
//
// ENV: RESEND_API_KEY, LANDLORD_NOTIFY_EMAILS (optional, comma-separated), LANDLORD_EMAIL (optional)

const FROM = "Modus Property Management <noreply@getmodusam.com>";

// Addresses that non-landlord callers (tenants) are allowed to email.
// Defaults match the addresses currently hardcoded in the frontend.
export function landlordNotifyEmails() {
  const list = [
    ...(process.env.LANDLORD_NOTIFY_EMAILS || "moduspropmgmt@gmail.com,capitalpathwaysapw@gmail.com").split(","),
    process.env.LANDLORD_EMAIL || "",
  ];
  return [...new Set(list.map(e => e.trim().toLowerCase()).filter(Boolean))];
}

export function normalizeRecipients(to) {
  const list = Array.isArray(to) ? to : [to];
  return list.map(e => String(e || "").trim()).filter(Boolean);
}

const DEFAULT_TIMEOUT_MS = 10000;

// Returns { ok, status, data, error? }. Never throws: network errors, timeouts and non-JSON
// responses come back as ok:false. idempotencyKey is forwarded to Resend as Idempotency-Key,
// so a repeated call with the same key cannot deliver twice.
export async function sendEmail({ to, subject, html, text, idempotencyKey, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": String(idempotencyKey).slice(0, 256) } : {}),
      },
      body: JSON.stringify({ from: FROM, to, subject, html, ...(text ? { text } : {}) }),
      signal: controller.signal,
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    return { ok: response.ok, status: response.status, data, ...(response.ok ? {} : { error: data?.message || data?.error || `HTTP ${response.status}` }) };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err?.name === "AbortError" ? `timed out after ${timeoutMs} ms` : String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}
