import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).json({ error: err.message });
  }

  const paymentIntent = event.data.object;

  if (event.type === "payment_intent.succeeded") {
    await supabase.from("payments")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("stripe_payment_intent_id", paymentIntent.id);

    // Get tenant info for receipt email
    const { data: payment } = await supabase.from("payments")
      .select("tenant_id, amount_cents, tenants(name, email)")
      .eq("stripe_payment_intent_id", paymentIntent.id)
      .single();

    if (payment?.tenants?.email) {
      await fetch(`${process.env.VITE_APP_URL || "https://getmodusam.com"}/api/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: payment.tenants.email,
          subject: `✓ Rent payment confirmed — $${((payment.amount_cents || 0) / 100).toLocaleString()}`,
          html: `
            <div style="background:#0A0B0D;padding:32px 20px;font-family:'Helvetica Neue',sans-serif;">
              <div style="background:#111316;border:1px solid #252930;border-radius:12px;max-width:560px;margin:0 auto;overflow:hidden;">
                <div style="padding:24px 32px 20px;border-bottom:1px solid #252930;">
                  <p style="margin:0;font-size:11px;font-weight:600;color:#5C6270;letter-spacing:0.16em;text-transform:uppercase;">MODUS PROPERTY MANAGEMENT</p>
                  <h2 style="margin:8px 0 0;font-size:22px;font-weight:400;color:#EDEAE2;font-family:Georgia,serif;">Payment Confirmed</h2>
                </div>
                <div style="padding:24px 32px;">
                  <p style="color:#9095A0;font-size:14px;margin:0 0 20px;">Hi ${payment.tenants.name}, your rent payment has been received.</p>
                  <div style="background:#181C21;border-radius:8px;padding:16px;margin-bottom:24px;">
                    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #252930;">
                      <span style="font-size:13px;color:#9095A0;">Amount</span>
                      <span style="font-size:13px;font-weight:600;color:#72B02A;">$${((payment.amount_cents || 0) / 100).toLocaleString()}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:8px 0;">
                      <span style="font-size:13px;color:#9095A0;">Date</span>
                      <span style="font-size:13px;color:#EDEAE2;">${new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</span>
                    </div>
                  </div>
                  <a href="https://getmodusam.com/pay" style="display:inline-block;padding:12px 24px;background:#7A5C2E;color:#C9A96E;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;">View payment history →</a>
                </div>
                <div style="padding:16px 32px;border-top:1px solid #252930;">
                  <p style="margin:0;font-size:11px;color:#5C6270;">Modus Property Management · Columbus, OH</p>
                </div>
              </div>
            </div>
          `,
        }),
      });
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    await supabase.from("payments")
      .update({ status: "failed" })
      .eq("stripe_payment_intent_id", paymentIntent.id);
  }

  return res.status(200).json({ received: true });
}