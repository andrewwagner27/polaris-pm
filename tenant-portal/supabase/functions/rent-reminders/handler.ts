// rent-reminders/handler.ts
// Request logic for rent-reminders, with all I/O injected so it can be unit tested
// (tests/rent-reminders.test.mjs). No Deno or remote imports here; index.ts wires the real deps.

export type Tenant = {
  id: string;
  name: string | null;
  email: string;
  lease_start: string | null;
  lease_end: string | null;
};

// What Pay Rent may collect, from a3_pay_rent_internal. The email quotes this and nothing else.
export type RentDue = {
  ledger_active: boolean;
  payable_cents?: number;
  past_due_cents?: number;
  pending_cents?: number;
  credit_applied_cents?: number;
  other_lines?: { category: string; open_cents: number }[];
};

export type Deps = {
  isAuthorized: (req: Request) => boolean;
  loadTenants: () => Promise<Tenant[]>;
  // Creates any scheduled charges due by this date. Idempotent, so an earlier manual run is harmless.
  // It runs first in every reminder run, so charges always exist before the ledger is read.
  generateCharges: (asOf: string) => Promise<{ outcome: string }[]>;
  // True once this month's scheduled charges exist. Without them the ledger would understate what's due.
  rentChargesGenerated: (firstOfMonth: string) => Promise<boolean>;
  loadRentDue: (tenantId: string) => Promise<RentDue>;
  // idempotencyKey is forwarded to the email provider so a repeated run cannot deliver twice.
  sendEmail: (to: string, subject: string, html: string, idempotencyKey: string) => Promise<boolean>;
  now?: () => Date;
  pause?: () => Promise<void>;
};

export const TIME_ZONE  = "America/New_York";
export const PORTAL_URL = "https://www.getmodusam.com/pay";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Calendar date in New York ("YYYY-MM-DD"), independent of the runtime's timezone.
export function nyDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function reminderHtml(name: string, due: RentDue, dueLabel: string, portalUrl: string) {
  const fmt = (cents: number) =>
    "$" + (Number(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amount = Number(due.payable_cents);
  const others = (due.other_lines || []).filter((l) => Number(l.open_cents) > 0);
  const notes = [
    Number(due.past_due_cents) > 0 ? `Includes ${fmt(Number(due.past_due_cents))} past due.` : "",
    Number(due.credit_applied_cents) > 0 ? `A ${fmt(Number(due.credit_applied_cents))} rental credit has already been applied.` : "",
    Number(due.pending_cents) > 0 ? `A ${fmt(Number(due.pending_cents))} payment still processing has already been taken off.` : "",
    others.length ? `Not included: ${others.map((l) => `${esc(l.category)} ${fmt(Number(l.open_cents))}`).join(", ")}. Please pay these to your property manager.` : "",
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0A0B0D;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#111316;border:1px solid #252930;border-radius:12px;overflow:hidden;">
    <div style="background:#111316;padding:28px 32px 20px;border-bottom:1px solid #252930;">
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#5C6270;margin-bottom:6px;">Modus Property Management</div>
      <div style="font-size:22px;font-weight:600;color:#EDEAE2;">Rent Reminder</div>
    </div>
    <div style="padding:28px 32px;">
      <p style="color:#9095A0;font-size:14px;margin:0 0 20px;">Hi ${esc(name)},</p>
      <p style="color:#EDEAE2;font-size:14px;margin:0 0 24px;line-height:1.6;">
        This is a friendly reminder that your rent balance of <strong style="color:#C9A96E;">${fmt(amount)}</strong>
        is due <strong style="color:#EDEAE2;">${dueLabel}</strong>.
      </p>
      <div style="background:#0A0B0D;border:1px solid #252930;border-radius:10px;padding:20px 24px;margin-bottom:28px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#5C6270;margin-bottom:6px;">Amount Due</div>
        <div style="font-size:32px;font-weight:700;color:#C9A96E;">${fmt(amount)}</div>
        <div style="font-size:12px;color:#5C6270;margin-top:4px;">Due ${dueLabel}</div>
      </div>
      ${notes.map((n) => `<p style="color:#9095A0;font-size:12px;margin:0 0 10px;line-height:1.6;">${n}</p>`).join("")}
      <a href="${portalUrl}" style="display:block;text-align:center;padding:13px 24px;background:#7A5C2E;border-radius:8px;color:#EDEAE2;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.02em;">
        Pay Now &#8594;
      </a>
    </div>
    <div style="padding:20px 32px;border-top:1px solid #252930;">
      <p style="color:#5C6270;font-size:11px;margin:0;line-height:1.6;">
        You are receiving this because you have an active lease managed through Modus Property Management.
        Log in to your tenant portal to make a payment or view your account.
      </p>
    </div>
  </div>
</body>
</html>`;
}

export async function handleRentReminders(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok");

  if (!deps.isAuthorized(req)) return json({ error: "Unauthorized" }, 401);

  try {
    const now   = deps.now ? deps.now() : new Date();
    const today = nyDate(now);                    // e.g. "2026-11-01"
    const month = today.slice(0, 7);              // e.g. "2026-11"

    // Rent is due on the 1st. Any other date (New York time) sends nothing; there is no override.
    if (today.slice(8) !== "01") {
      return json({ sent: 0, message: `No reminder needed (${today} is not the 1st)` });
    }

    // A failure here reaches the catch below: a 500, and no email.
    const generation = await deps.generateCharges(today);
    const charges = { created: 0, exists: 0, skipped: 0 };
    for (const g of generation || []) {
      if (g.outcome === "created") charges.created++;
      else if (g.outcome === "exists") charges.exists++;
      else if (String(g.outcome).startsWith("skipped")) charges.skipped++;
    }

    // Generation ran and still nothing exists for this month, so the ledger would show only arrears. Send nothing.
    if (!(await deps.rentChargesGenerated(`${month}-01`))) {
      console.error(`rent-reminders: no scheduled charges for ${month}; nothing sent`);
      return json({ sent: 0, blocked: "rent_charges_not_generated", date: today, charges, message: `Rent charges for ${month} have not been generated; no reminders sent` });
    }

    const tenants = await deps.loadTenants();
    if (!tenants || tenants.length === 0) return json({ sent: 0, message: "No eligible tenants" });

    const monthName = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
    const subject   = `Rent due today — ${monthName} payment`;
    const dueLabel  = "today (the 1st)";
    const pause     = deps.pause ?? (() => new Promise<void>((r) => setTimeout(r, 120)));

    let sent = 0;
    const results: { name: string | null; email: string; ok: boolean }[] = [];
    const seen = new Set<string>();
    const skipped = { nothing_due: 0, ledger_inactive: 0, ledger_error: 0 };

    for (const tenant of tenants) {
      if (!tenant.email || seen.has(tenant.id)) continue; // one reminder per tenant per run
      seen.add(tenant.id);

      if (tenant.lease_start && String(tenant.lease_start).slice(0, 10) > today) continue;
      if (tenant.lease_end   && String(tenant.lease_end).slice(0, 10)   < today) continue;

      // The same figure Pay Rent shows. If the ledger can't give it, skip the tenant: never quote an estimate.
      let due: RentDue;
      try {
        due = await deps.loadRentDue(tenant.id);
      } catch (err) {
        console.error(`rent-reminders: ledger read failed for ${tenant.id}:`, err);
        skipped.ledger_error++;
        continue;
      }
      if (!due?.ledger_active) { skipped.ledger_inactive++; continue; }
      const payable = Number(due.payable_cents);
      if (!Number.isInteger(payable)) { skipped.ledger_error++; continue; }
      if (payable <= 0) { skipped.nothing_due++; continue; } // paid, covered by credit, settling, or only non-rent open

      const firstName = (tenant.name || "Resident").split(" ")[0];
      const html = reminderHtml(firstName, due, dueLabel, PORTAL_URL);
      const ok   = await deps.sendEmail(tenant.email, subject, html, `rent-due-today/${month}/${tenant.id}`);
      results.push({ name: tenant.name, email: tenant.email, ok });
      if (ok) sent++;

      await pause();
    }

    console.log(`rent-reminders: sent=${sent}`, JSON.stringify(charges), JSON.stringify(skipped), JSON.stringify(results));
    return json({ sent, total: tenants.length, date: today, charges, skipped, results });
  } catch (err) {
    console.error("rent-reminders error:", err);
    return json({ error: String(err) }, 500);
  }
}
