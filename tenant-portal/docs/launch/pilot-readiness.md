# Modus tenant pilot (1–2 real tenants) — readiness pack

Status 2026-11-14. Pilot scope: tenant portal access, AI messaging, human management communication, maintenance
requests and updates, notifications. **Not in scope:** rent collection, receivables, online payments, autopay,
emergency SMS. Existing rent arrangements stay exactly as they are.

## 0. Where production stands

| Item | State |
|---|---|
| App | `main` = `e74b16d` (RC1 + review fixes + RC1.1), Vercel Production READY 2026-11-14 |
| Migrations | A `20261114120000_ai_message_claims` and B `20261114130000_security_hardening` applied 2026-11-14, verified |
| Pre-change snapshot | `C:\Modus-dev\release-backups\2026-11-14-rc1\` (function defs + ACLs, tenants links, exact migration files) |
| Database backups | **Supabase Free plan: no platform backups, no point-in-time recovery** |
| Rent / receivables / payments / SMS | off (cron job 2 inactive, cutover NULL, 0 charges, 0 saved bank accounts, SMS disabled) |
| RC1.1 | `e74b16d` deployed 2026-11-14: phone chat composer above the bottom nav; Wallet hides bank linking while online payment is off |

## 1. Go / no-go checklist (all must be ✅ before the first invitation)

| # | Check | Owner | How to verify |
|---|---|---|---|
| 1 | RC1.1 deployed (phone composer, no bank linking) | done 2026-11-14 | verified in production |
| 2 | Supabase Auth email link lifetime 24 h (currently **3600 s**; *Authentication → Sign In / Providers → Email → Email OTP expiration* = 86400, the maximum) | you | invite a dummy, open it after > 1 h |
| 3 | Onboarding test end to end with a fresh invite (open → set password → log in → forgot password → reset → log in) | you | each step works on a phone |
| 4 | Emergency procedure decided (§4) and the number written into the welcome message | you | — |
| 5 | Pilot tenant record(s) created with the tenant's own email and the right unit | you (landlord → Tenants → Add) | readiness SQL (december-6-launch-plan.md §2) |
| 6 | Test data cleaned (§7) so the recap and Agent Center start clean | you (landlord UI) | Agent Center unresolved = 0; recap "still unresolved" empty |
| 7 | Tenant reply path decided: emails come from `notifications@`/`noreply@getmodusam.com`, which have **no mailbox (no MX)** | you | either add a monitored Reply-To (code change, Claude) or keep the "not monitored — use the portal" wording |
| 8 | DMARC TXT `_dmarc.getmodusam.com` = `v=DMARC1; p=none; rua=mailto:<monitored address>` | you (DNS) | `nslookup -type=TXT _dmarc.getmodusam.com` |
| 9 | Daily recap received at 07:00 ET (12:00 UTC) the morning after deploy, showing OPEN/RESOLVED and no failures | you (inbox) | first run of the new recap is 2026-11-15 |
| 10 | Physical-phone checks (december-6-launch-plan.md §11) pass on the tenant's phone type | you | — |

Strongly recommended before the pilot (not a hard gate for 1–2 tenants): Supabase **Pro** plan for daily backups,
leaked-password protection on, Preview credentials split (§8).

## 2. Repeatable tenant onboarding checklist (per tenant)

1. Confirm the tenant's email with them (spoken or in person) and that they agree to try the portal.
2. Landlord → Tenants → Add tenant: name, email, the correct unit. Do not reuse the Test unit.
3. Run the readiness SQL: one active record, correct unit, `registered = false`.
4. Send the invitation (Tenants → tenant → Send invite). Send the welcome message (§3) separately by your normal channel.
5. Within 24 h: `registered = true`. If not, re-send once and ask them to use the **newest** email.
6. First login together if possible: they send "hello" in Messages, submit nothing else.
7. Day 1–3: confirm they received an AI reply, and that a management reply from you reached them.
8. Record the date invited / registered / first message in your pilot log.

## 3. Tenant invitation message (send with or right after the Modus email)

> Hi [name] — you're one of the first residents to try the Modus tenant portal. You'll get an email from Modus
> Property Management; open it on your phone and tap **Set up your account** within [1 hour — or 24 hours once the link setting is changed], then choose a password.
> In the portal you can message us (an AI assistant answers common questions right away and passes anything else to
> me), report maintenance with photos, and follow updates. **Rent doesn't change** — keep paying the way you do today;
> online payment isn't part of this trial. **Emergencies:** fire, smoke, gas smell, sparking electrical or anyone in
> danger — call 911 first (for gas, leave and call from outside), then call me at [number]. Please tell me anything
> that's confusing. Thank you!

## 4. Emergency-contact procedure

- The portal shows fixed guidance: call 911 first; for gas leave the building; then contact management; "there is no
  24/7 emergency phone line yet". The AI escalates any emergency message and management is **emailed** (no SMS).
- Decision needed (you): the number tenants call after 911 and the hours it is answered. Put it in §3 and tell each
  pilot tenant in person. Until an after-hours line exists, say so honestly.
- Management: keep email notifications on your phone with sound for the pilot weeks; an "EMERGENCY" subject means
  call the tenant immediately.
- Emergency SMS stays **disabled**. Vendors are never dispatched automatically (the AI never creates vendor
  dispatches; verified in RC1 smoke tests: ticket created with no vendor).

## 5. Management monitoring checklist (pilot weeks)

Daily: read the recap (Needs management action / Still unresolved / Ticket emails that failed / Unanswered
messages). Twice a day: open the portal (any landlord page also runs the safety sweep), Agent Center unresolved count,
Maintenance queue. Reply to every escalation in Messages, then Resolve with a note; Teach Agent for missing facts.
Weekly: Resend dashboard bounces; Supabase Auth logs for `otp_expired`.
Pause the pilot if: a tenant sees another tenant's data; the AI states a property fact not in the knowledge base;
a maintenance request isn't seen by management within 1 hour; an invitation can't be completed after one re-send.

## 6. Rollback plan

- App: create a branch, `git revert --no-edit ff4ebd0..68b7688` (or the specific commit), review, fast-forward `main`
  to the revert commit, push `main` (never force-push). Vercel redeploys. Previous Production deployment can also be
  promoted from the Vercel dashboard (instant).
- Migration A: `DROP TABLE IF EXISTS public.ai_message_claims;` — the app keeps answering (logs `[message-claim]
  UNAVAILABLE`).
- Migration B: rollback statements in the file header (restore EXECUTE grants, reset search_path, drop the trigger,
  function and index). Pre-change definitions are in the snapshot folder.
- Tenant access: archive the tenant record (keeps history). Never delete auth accounts without approval.

## 7. Dummy data — what remains and how to clean it (landlord UI; nothing deleted)

| Item | Id | Action |
|---|---|---|
| Onboarding Test (dummy) tenant, unit "Test" | `74037ce6-…` | after the onboarding test: Tenants → Archive. Then occupancy shows 3 of 15 (the Test unit stays; it has no tenant) |
| Test User (Unit 2) | `6a12a0b4-…` | **keep** as the standing smoke-test account |
| MR-C8945 | `c8945663-…` | internal note "Release test ticket (2026-11-14 mobile check). No work required." → Resolved |
| MR-39160 | `39160218-…` | same, note "RC1 production smoke test" → Resolved |
| 6 older Test User tickets (2026-09-28/29 faucet/door handle, AI-generated) | `70561850`, `be27e856`, `9a3a2b8d`, `78d48fae`, `1b3e1746`, `b7a6147b` | note "Test data" → Resolved |
| 35 open Test User escalations (2026-09-26 → 2026-11-14) | Agent Center | Resolve each with note "Test data" (history kept) |
| Retired TEST-2 parking knowledge | `e1b9b79a…` | already retired; keep (it is what tells the AI the answer is withdrawn) |
| Amenities knowledge | `025097de…` | legitimate — untouched |

Resolving a ticket emails the dummy tenant's address only. Dylan Tober's ticket (`583a2bdf`, in progress) and the
Andrew Wagner / Dylan Tober records are treated as real and were not touched.

## 8. Security configuration still open

- Preview shares production values for `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `VITE_SUPABASE_*`,
  `TWILIO_ACCOUNT_SID`, `TWILIO_FROM`, `LANDLORD_EMAIL`, `LANDLORD_PHONE` (the dashboard hides the scope of the most
  sensitive keys from automation; check Stripe, OpenAI, Resend, Twilio token yourself). RC1's guard makes Preview API
  routes fail closed (503 against the production database, live Stripe refused, email allow-listed, no SMS).
  Steps: preview-isolation.md. Prioritise: service role → Stripe → Twilio → OpenAI. Remove Preview scope first (no
  rotation needed for that); rotate only after confirming nothing else uses the key.
- Supabase Security Advisor after migration B: 0 errors, 44 warnings — 40 signed-in-callable SECURITY DEFINER RPCs
  (the app's accounting and RLS helper functions; none anon-callable; production probes show each refuses or returns
  nothing for a tenant: accepted), 2 mutable search paths (`a1_payment_account`, `a1_expense_account`: fix in the next
  migration), `pg_net` in `public` (accepted, low), leaked-password protection off (turn on).
