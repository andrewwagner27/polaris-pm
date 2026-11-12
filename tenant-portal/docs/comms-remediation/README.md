# Communications remediation (Batch 1)

Branch `fix/comms-remediation`, based on production `e47147e`. **Nothing here is deployed.**

## How email works after this change

| Workflow | Built where | Recipient | Duplicate protection | Failure visible to management |
|---|---|---|---|---|
| New / urgent maintenance request | `/api/notify` → `maintenance_created` | `LANDLORD_EMAIL` | key `maintenance-created:<ticket>` + ticket note | Internal ticket note "Email FAILED …"; tenant told it couldn't be confirmed |
| Tenant reply on a ticket | `/api/notify` → `tenant_comment` | `LANDLORD_EMAIL` | key `tenant-comment:<comment>` | Internal ticket note |
| Vendor quote / work complete | `/api/vendor-ticket` (server, after saving) | `LANDLORD_EMAIL` | per quote / per completion key | Internal ticket note |
| Move-in walkthrough complete | `/api/notify` → `inspection_completed` | `LANDLORD_EMAIL` | key `inspection-complete:<id>` | Server log |
| Status update / PM message to tenant | `/api/notify` (landlord only) | tenant email on record | per status / per comment | Internal ticket note |
| Quote/work approved, rework request to vendor | `/api/notify` (landlord only) | vendor email on record | per stage / per comment | Internal ticket note |
| AI escalation / emergency | `/api/classify-and-route` | `ESCALATION_NOTIFY_EMAILS`, else `LANDLORD_EMAIL` | key `escalation:<message>` | Agent Center badge, daily recap |
| Emergency vendor dispatch | `api/_lib/dispatchVendor.js` | `LANDLORD_EMAIL` | per dispatch | Internal ticket note |
| Daily recap | `/api/daily-recap` (cron) | `LANDLORD_EMAIL` | key `daily-recap:<date>` | Vercel cron log (500 with reason) |
| Application decline, inspection emails | landlord page → `/api/send-email` (landlord only) | applicant / tenant | — | Landlord sees toast |
| Rent reminders | Supabase `rent-reminders` (cron **paused**) | tenant | `rent-due-today/<month>/<tenant>` | Function response/log |

Rules every path follows:

- **No caller chooses a recipient, subject or HTML** except a landlord using `/api/send-email`.
- **Every untrusted value is escaped** with `src/lib/emailSafety.js` (`escapeHtml`, `textToHtml`); links use `appLink`/`safeUrl` (https on getmodusam.com only); subjects use `cleanSubject` (no CR/LF).
- **No hard-coded recipient.** Missing configuration ⇒ nothing sent, failure recorded, clear error (`MANAGEMENT_RECIPIENT_NOT_CONFIGURED`).
- **"Sent" means Resend returned an email id.** Nothing claims delivery beyond that. See *Email outcomes and idempotency* below.

Documented exception: `src/LandlordLogin.jsx` keeps `moduspropmgmt@gmail.com` as the browser-side landlord sign-in allow-list. It is a UX gate, not a recipient; authorization is `profiles.role` on the server.

Not changed (documented): `src/supabase/functions/send-email` and `src/supabase/late-fee-cron` are stray, undeployed copies (the first sends from `onboarding@resend.dev`). Delete them in a cleanup change.

## Senders

| Sender | Used by |
|---|---|
| `Modus Property Management <noreply@getmodusam.com>` | All Vercel API email |
| `Modus Property Management <notifications@getmodusam.com>` | Supabase Edge Functions (`send-email`, `invite-tenant`, `rent-reminders`) after this change |

The deployed `invite-tenant` sends from `noreply@moduspm.com`, which is not a verified Resend domain — fixed here (not deployed).

**Reply-to:** no email sets `reply_to`, and getmodusam.com has no MX, so replies are lost. The tenant- and vendor-facing templates now say "This mailbox is not monitored; please use the portal." `sendEmail` supports `replyTo`; choose a **monitored** address before enabling it (no mailbox was invented).

## Emergency communications

- **Deterministic detection** (`api/_lib/emergencyRules.js`) runs on every tenant chat message and maintenance request, *in addition to* the model. It is a floor, not the whole net: a message it misses still gets the model's own emergency handling. The phrase corpus is `tests/emergency-detection.test.mjs` (≈130 positive phrases across 9 categories, ≈65 negative phrases that must not trigger 911 instructions); add every real misclassified message there.
  - *Life safety* (fire/smoke, gas, carbon monoxide, sparking/burning/shock electrical, intruders and threats, medical) → Tier 1, and the reply **starts with fixed 911 instructions** (gas: leave, call from outside).
  - *Property emergency* (flooding/active leaks/sewage, dangerous loss of heat, lockouts/unsecurable doors and windows) → Tier 1 with safety steps; 911 only "if anyone is at risk".
  - Replies say "flagged to Modus management as an emergency" and that there is **no 24/7 line yet** — never that someone was reached.
- **Maintenance form** shows a permanent "call 911 first" banner; a new ticket that reads as an emergency gets the same guidance back and alerts management as an emergency.
- **SMS** (`api/_lib/emergencySms.js`) is **off** unless `EMERGENCY_SMS_ENABLED="true"` *and* `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `LANDLORD_PHONE` (E.164) are set. Destination is only `LANDLORD_PHONE`. Outcome recorded as `accepted` (Twilio accepted — *not* delivered), `failed`, or `sending` left behind by an interrupted run (shown as "SMS status unknown").
- **At most one SMS attempt per alert, durably:**
  - *Escalations:* the claim `notify.sms = {status:"sending"}` is written **before** Twilio is called, by one conditional `UPDATE … WHERE raw_openai_response->'notify'->>'sms' IS NULL` on a **canonical** routing row (earliest row for that message), so overlapping requests holding different rows compete for the same claim. Any recorded SMS (sending, accepted, failed, disabled) blocks further attempts; retries of a failed email never re-send the SMS. The claim SQL was run against local Postgres (PGlite) with production's column types.
  - *Maintenance requests:* a trusted ticket note "Emergency SMS: sending." is written before Twilio is called; any earlier trusted SMS note blocks further attempts. Residual race: two requests within milliseconds for the same ticket could both pass (no unique constraint without a migration); the form calls once and tenants can only raise the alert within 30 minutes of creating the ticket.
- `/api/sms-escalate` is now **landlord-only** and sends one fixed test text to `LANDLORD_PHONE` (used to verify the number before enabling). Previously any tenant could text arbitrary content to that number.

**Launch blocker:** there is no confirmed, monitored emergency phone number. Do not set `EMERGENCY_SMS_ENABLED` until one exists and a test SMS has been received on it.

## Escalation reliability

| Failure | Before | After |
|---|---|---|
| OpenAI error | Fallback escalation | Same; plus a 20 s timeout and no SDK retries so a slow model can't outlive the function (SDK default was 10 min × 3) |
| Anything else throws | 500, no routing row, no email | `failSafeEscalation`: routing row `ESCALATE_LANDLORD`, management email, one honest reply to the tenant (911 guidance if an emergency) |
| Routing-log insert fails | Email sent, recap blind | One retry; if still failing the email says "could not be saved to the Agent Center" |
| Email provider errors / unreachable | Recorded `failed` | Up to 3 attempts with the same key **and the same payload**; result `sent`, `failed`, `unconfirmed` or `duplicate` (below) ⇒ Agent Center badge + recap |
| Browser request lost/timed out | Silent | **No automatic retry** (it could race a request still running on the server). The tenant is told the assistant didn't respond; the recap lists **tenant messages the AI never answered** |
| Repeated request after processing finished | Second AI reply + second routing row (email deduped) | Idempotent per message: no second reply/row; a `failed` or `unconfirmed` email is replayed from the stored payload |
| Overlapping requests while processing | Two replies, two rows, email deduped | Still two AI replies and two rows (**documented limitation**, below); still one management email and at most one SMS; the recap counts the message once |
| No recipient configured | Fell back to a hard-coded address | Nothing sent; recorded `failed: MANAGEMENT_RECIPIENT_NOT_CONFIGURED` |

The Agent Center shows each escalation's email outcome ("emailed", "EMAIL FAILED" or "EMAIL NOT CONFIRMED" with the reason on hover, "email not confirmed" while pending, "not emailed") and any SMS outcome.

### Email outcomes and idempotency

Resend documents ([idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)): keys are kept 24 h; same key + same payload returns the original response without sending again; same key + different payload is `409 invalid_idempotent_request`; same key while the first is running is `409 concurrent_idempotent_requests`. Whether a *failed* request keeps its key is not documented — tests cover both cases.

| Provider response | Attempt outcome | Retried? |
|---|---|---|
| 2xx with an email id | `sent` | — |
| 429 / 5xx | retryable | yes, same key + payload |
| network error / timeout | ambiguous (may have been accepted) | yes — if it was accepted, Resend returns the original response, which is the evidence |
| 409 `concurrent_idempotent_requests` | in progress | yes, after a delay |
| 409 `invalid_idempotent_request` | key owned by another request | no → recorded `duplicate` |
| other 4xx, missing key, bad recipient | rejected | no |

Final result: `sent` only with an email id; `unconfirmed` whenever any attempt was ambiguous or still in progress and none produced an id; otherwise `failed`. **One key ⇔ one payload:** escalations store their payload on the routing row before the first attempt and replay it unchanged; every other email puts a payload hash in its key (`email.payloadKey`).

### Documented limitation: overlapping AI processing (B3)

There is no atomic "claim this message" step: production has no unique constraint on `ai_routing_logs.message_id` (and one message already has two rows), and adding one is a migration. So two requests for the same message that overlap *while the first is still running* both produce an AI reply and a routing row. Mitigations in place: the browser sends once and never retries; a repeat after processing finished is a no-op; management still gets one email (sibling check + Resend key) and at most one SMS (canonical-row claim); the recap counts the message once. **Proposed fix (not applied; needs approval and a de-duplication of existing rows first):** a partial unique index on `ai_routing_logs(message_id) WHERE message_id IS NOT NULL`, and inserting a `processing` routing row with `ON CONFLICT DO NOTHING` before calling the model.

### N4 and N5 assessment

- **N4 — vendor-supplied email.** `maintenance_requests.vendor_email` is set by whoever accepts the work order through the vendor link + PIN, and later vendor emails (approval, rework with the vendor link) go there. Risk: someone holding a vendor's link *and* PIN can redirect those emails; the link alone still requires the PIN. Not a tenant-facing risk and unchanged by this work. **Launch risk: low.** Recommended follow-up: prefer the `vendors` table address and only fall back to `vendor_email` for ad-hoc vendors.
- **N5 — the new-ticket alert depends on the tenant's browser.** Now mitigated: the form raises the alert immediately after the ticket is saved, *before* photo uploads (which were the slow step). Residual: if the page dies in the moment between saving and the alert request, management sees the ticket in the portal and the next daily recap (up to 24 h). For emergencies the tenant is already told to call 911 first. **Launch risk: low–medium**; a database trigger/webhook would remove it (migration).

## Configuration plan (least privilege) — do not change until approved

### Vercel

| Variable | Production | Preview | Notes |
|---|---|---|---|
| `SUPABASE_URL` / `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | ✓ | ✓ | Public values |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | **remove** | Full database access. Preview should not hold production's service role. If previews must exercise API routes, use a separate Supabase project. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | ✓ | **remove** (or a `sk_test_` key) | Live key in Preview today |
| `RESEND_API_KEY` | ✓ (new restricted key) | **remove** | Previews must not send real email |
| `OPENAI_API_KEY` | ✓ | remove or separate low-limit key | |
| `TWILIO_*`, `LANDLORD_PHONE` | ✓ | **remove** | |
| `CRON_SECRET`, `VENDOR_SESSION_SECRET` | ✓ | — | Already Production-only |
| `LANDLORD_EMAIL` | ✓ (`moduspropmgmt@gmail.com`, verified earlier) | optional test inbox | **Required** after this change: no fallback |
| `ESCALATION_NOTIFY_EMAILS` | optional | — | Overrides escalations only |
| `EMERGENCY_SMS_ENABLED` | **leave unset** until the emergency number is verified | — | New, not a secret |
| `LANDLORD_NOTIFY_EMAILS` | — | — | No longer read by Vercel; don't add |

### Supabase Edge Function secrets

| Secret | Keep | Notes |
|---|---|---|
| `RESEND_API_KEY` | ✓ | Must be rotated together with Vercel's |
| `CRON_SECRET`, `SUPABASE_*`, `STRIPE_*`, `ALLOWED_ORIGINS`, `GOOGLE_PLACES_API_KEY` | ✓ | |
| `LANDLORD_NOTIFY_EMAILS` | remove if present | No longer read by the prepared `send-email` |
| `RENT_REMINDERS_ENABLED` | **leave unset** | New gate; see RENT_REMINDERS.md |

## Resend key rotation (Andrew performs; never paste keys into chat)

The current key ("Modus PM", **Full access**) matches the obsolete `VITE_RESEND_API_KEY` that June frontend builds used: treat it as exposed.

1. Resend → API Keys → **Create API key**: name `Modus PM 2026-11`, permission **Sending access**, domain **getmodusam.com**. Copy it once.
2. Vercel → polaris-pm → Settings → Environment Variables → `RESEND_API_KEY` → Edit → paste → scope **Production only** (remove Preview) → Save.
3. Supabase → Project ynbxdbwxdydbpkzaffte → Edge Functions → Secrets → `RESEND_API_KEY` → paste → Save.
4. Vercel → Deployments → current Production (`e47147e`, or the new release) → **Redeploy** (env changes need a redeploy). Supabase functions read secrets at runtime; no redeploy needed.
5. Verify both stores before revoking:
   - Vercel: as landlord, trigger the daily recap manually (POST `/api/daily-recap` from the landlord session) or submit the Unit 2 test maintenance request → Resend shows *Delivered* to `moduspropmgmt@gmail.com`.
   - Supabase: invoke `send-email` as landlord to `moduspropmgmt@gmail.com` (once the prepared version is deployed), or resend the Unit 2 test tenant invite → Resend shows the new key's send.
   - Resend → API Keys: the new key shows "last used"; the old key's "last used" stops advancing.
6. Only then: Resend → API Keys → old "Modus PM" → **Revoke**.
7. Remove `RESEND_API_KEY` from Vercel Preview if not already done.

## DMARC (Andrew performs in DNS)

Current: SPF on `send.getmodusam.com` (`include:amazonses.com ~all`), DKIM `resend._domainkey` ✓, **no DMARC**.

| Stage | Record (TXT `_dmarc.getmodusam.com`) | When |
|---|---|---|
| 1. Monitor | `v=DMARC1; p=none; rua=mailto:moduspropmgmt@gmail.com; adkim=r; aspf=r; pct=100` | Now |
| 2. Quarantine | `v=DMARC1; p=quarantine; rua=mailto:moduspropmgmt@gmail.com; adkim=r; aspf=r; pct=100` | After 2–4 weeks of reports showing only Resend/SES passing |
| 3. Reject (optional) | `p=reject` | After a further clean month |

`rua` must be a mailbox someone reads; `moduspropmgmt@gmail.com` is the existing management inbox (no address invented). Gmail will receive aggregate XML reports.
