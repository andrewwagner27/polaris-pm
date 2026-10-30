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

export async function sendEmail({ to, subject, html }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}
