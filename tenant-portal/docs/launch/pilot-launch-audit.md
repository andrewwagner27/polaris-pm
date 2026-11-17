# First live tenant: launch-readiness audit and 7-day plan

## 0. Final preparation status: 2026-11-16 (evening). Target launch: Saturday 2026-11-21

Branch `pilot/first-tenant` (local, not pushed, **not deployed**; production is still `main` = `e74b16d`).
Legend: **PASS** = done and verified · **BLOCKED** = cannot proceed without your decision · **NEEDS MY ACTION** = a step only you can do.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1a | SPF + DKIM for `getmodusam.com` (Resend) | **PASS** | DNS: `send.getmodusam.com` TXT `v=spf1 include:amazonses.com ~all` + MX feedback-smtp.us-east-1.amazonses.com; `resend._domainkey` TXT present. Gmail "Show original" of a Modus email (2026-11-09): SPF PASS, DKIM PASS with domain getmodusam.com (aligned) |
| 1b | DMARC | **NEEDS MY ACTION** | `_dmarc.getmodusam.com`: NXDOMAIN (checked tonight via 8.8.8.8). DNS is at Namecheap; no Namecheap session is available to automation. Record to add below (§0.2) |
| 1c | Controlled test emails | **PASS** (to a Gmail inbox) | Sent through the production `send-email` function with the landlord session, 2026-11-17 01:51 UTC. Resend accepted both (ids `01a1e733-dd4f-…`, `01a1e733-dea8-…`). The copy to andrewwagner27@gmail.com landed in the **Inbox** (not spam) |
| 1d | Arrival in the management inbox (moduspropmgmt@gmail.com) + daily recap | **NEEDS MY ACTION** | That inbox isn't signed in on this PC. Look for "[Modus test] Delivery check 2026-11-17T01:51" and a "Modus daily recap" |
| 1e | Failures logged, not silent | **PASS** | Every management email outcome is stored on the routing row (`notify.status`) or as a system note on the ticket ("Management emailed … (1 recipient)"); the daily recap lists failed/unconfirmed emails and unanswered messages; covered by escalation-notify, comms-remediation, daily-recap-status tests |
| 2a | Emergency classification, 911-first guidance, escalation | **PASS** | Fixed rules run regardless of the model (gas/CO/fire/electrical/security/medical → "call 911" first; water/no heat/lock-out → safety steps + 911 if anyone is at risk); Tier 1 always emails management; fallback reply works with OpenAI down. 22 pilot scenario tests + the emergency phrase corpus pass |
| 2b | After-911 contact number + hours | **BLOCKED** (your decision) | Nothing configured anywhere today; the app says "There is no 24/7 emergency phone line yet." New setting (not deployed): `MANAGEMENT_URGENT_PHONE` + `MANAGEMENT_URGENT_HOURS` (Vercel, AI replies) and `VITE_MANAGEMENT_URGENT_PHONE` + `VITE_MANAGEMENT_URGENT_HOURS` (maintenance form). Shown only when **both** are set; unset = today's wording, word for word |
| 3a | AI knowledge isolation | **PASS** | Bittersweet prompt contains no Clifton facts; approved answers filtered by property/unit (tests); production RLS: a tenant reads 0 knowledge rows |
| 3b | Clifton Manor facts | **PASS** (existing) | Built into the AI prompt: address, layout, basement laundry rules, parking (7 rear spots, guests on street), utilities, electric heat per unit (check breaker first), rent due 1st / $50 late fee on the 6th, quiet hours (Sun–Thu 10 PM–8 AM, Fri–Sat 11 PM–9 AM). Approved entry: "no gym or pool, on-site laundry" |
| 3c | Missing facts | **NEEDS MY ACTION** | Trash & recycling day/location, laundry hours/payment, the pilot unit's parking spot (if any), urgent contact (2b). Until taught, the AI says it has no confirmed information and escalates. Teach via Agent Center → Teach Agent (§0.3) |
| 3d | Live AI answers | **NEEDS MY ACTION** | No tenant session is available to automation; covered by the phone test (§0.4 step B) |
| 4 | Test data segregated | **PASS** | 35 open Test User escalations → resolved with note (history kept); 8 Test User tickets → resolved with an internal note; 64 unread Test User dashboard alerts → read. Nothing deleted, no email sent. Real records (Andrew Wagner, Dylan Tober, ticket 583a2bdf) untouched. Before-state CSVs + script: `C:\Modus-dev\db-backups\pre-change\` |
| 5a | Tenant data isolation (leases, documents, maintenance, rent) | **PASS** | Production RLS simulated as Test User (read-only, rolled back): own tenant row 1/1, own unit 1 (rent shown is own unit only), own tickets 11/11, hidden staff notes 0, own messages only, routing logs 0, alerts 0, storage: only the photo on their own ticket |
| 5b | Invite link lifetime (1 h) | **NEEDS MY ACTION** (approval) | Supabase *Email OTP expiration* 3600 s (last read 2026-11-14; automation can't read Auth settings). Either approve 86400 (Supabase → Authentication → Sign In / Providers → Email) **or** send the invite while the tenant is with you. Expired-link copy is now duration-neutral ("expire after a short time") so either is correct |
| 5c | Automated tests | **PASS** | see §0.5 |
| 5d / 6 | Phone onboarding + full maintenance loop | **NEEDS MY ACTION** | 15-minute script §0.4 (dummy account only) |
| 7 | Backup system preserved | **PASS** | Scripts committed as a source copy in `scripts/backup/` (no secrets); docs committed; live system unchanged; last run OK (2026-11-16 10:22, 0x0); next run 02:00 |
| 8 | Deploy of the two small changes | **NEEDS MY ACTION** (approval) | Optional for launch. Needed only if you want the urgent number shown in AI replies/the form |

### 0.1 GO / NO-GO for Saturday 2026-11-21 (all must be ✔ before the invitation)

- [ ] **Emergency number decided** (or explicitly "no phone line; 911 + portal only"), written in the welcome message, told in person. If a number: set the 4 variables and deploy `pilot/first-tenant`
- [ ] **Phone alerts** on for moduspropmgmt@gmail.com (Gmail app, sound on)
- [ ] **Management inbox** received the 01:51 UTC test email and at least one daily recap (not spam)
- [ ] **DMARC** record live (`nslookup -type=TXT _dmarc.getmodusam.com`)
- [ ] **Phone test §0.4** passed end to end
- [ ] **Missing facts taught** (trash/recycling, laundry hours) or accepted as "AI escalates"
- [ ] **Link lifetime**: 24 h approved and set, **or** invite sent with the tenant present
- [ ] **Tenant record**: own email, correct unit, correct rent amount
- [x] Backups: nightly run + verified restore (PASS)
- [x] Test data out of the Agent Center and recap (PASS)
- [x] Tenant isolation verified in production (PASS)
- [ ] **Rollback known**: Vercel → Deployments → previous → Promote; Tenants → Archive

**NO-GO** if any box is unchecked. **Pause the pilot** if the tenant sees anyone else's data, the AI states a fact not in the
knowledge base, a maintenance request is unseen for > 1 h, or a backup run fails twice in a row.

### 0.2 DMARC record (Namecheap → Domain List → getmodusam.com → Advanced DNS → Add new record)

| Type | Host | Value | TTL |
|---|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:moduspropmgmt@gmail.com; fo=1` | Automatic |

Monitoring only (`p=none`): nothing is rejected. SPF+DKIM already align, so `p=quarantine` is a safe step after ~2 weeks of clean reports.

### 0.3 Facts to teach (Agent Center → Teach Agent, scope: Clifton Manor). Fill the blanks; don't guess

| Topic | What the AI needs | Status |
|---|---|---|
| Trash & recycling | Pickup day(s), where the bins are, bulk items | **missing** |
| Laundry | Hours, payment (coins/card/app), who to tell if a machine breaks | location + rules known; hours/payment **missing** |
| Parking | Is the pilot unit assigned a rear-lot spot? | general rule known; unit-specific **missing** |
| Maintenance contact | "Submit in the portal (Maintenance tab); for anything urgent message here and it's flagged" (+ number if 2b) | known (portal); number pending 2b |
| Emergency procedure | Already fixed in code (911 first, then flagged) — no entry needed | known |
| Quiet hours | Sun–Thu 10 PM–8 AM, Fri–Sat 11 PM–9 AM | known |

### 0.4 Shortest real-phone acceptance test (~15 min; laptop = landlord, phone = onboarding dummy; no real tenant involved)

A. Laptop: Tenants → **Onboarding Test (dummy)** → Resend invite. Phone: open it in the moduspropmgmt Gmail (it's the
   `+onboarding-test` address) within the hour → set a password → Home shows unit "Test" and nobody else's data.
B. Phone: Messages → "Where can my guests park?" → AI answers "street" (from facts). Then "When is trash pickup?" → AI says it
   has no confirmed info and flags it. Then "I smell gas in the kitchen" → reply **starts** with leave the building / call 911.
C. Phone: Maintenance → new request "Pilot test: bathroom fan noisy" → submit → confirmation shown.
D. Laptop: the new-request email and the emergency email arrive (note the minutes); Agent Center shows the gas escalation.
E. Laptop: open the ticket → comment "Pilot test reply" **visible to tenant** → status **In progress**.
F. Phone: ticket shows In progress + the reply; a status email reaches the dummy address.
G. Laptop: status **Resolved** → phone shows Resolved. Resolve the Agent Center items with note "Pilot acceptance test".
H. Phone: Log out → Forgot password → reset → log in. Then laptop: Tenants → Onboarding Test → **Archive**.
Tell Claude "phone test done" for a read-only verification of the records.

### 0.4b Maintenance triage (ROUTINE / PRIORITY / EMERGENCY): branch `pilot/first-tenant`, not deployed

| Level | Examples | What happens |
|---|---|---|
| ROUTINE (default) | slow drip, running toilet, small contained leak, ceiling stain without a drip, minor surface mold, cosmetic, slow drain | Normal reply + "submit it in Maintenance"; ordinary new-request email; no alert, no SMS, no numbers |
| PRIORITY | no heat, no (hot) water, worsening leak, overflow that stopped, spreading mold / moisture, fridge/stove/only toilet unusable, broken/jammed lock, door/window won't secure, sewer smell | Management notified (escalation, `urgency HIGH`); ticket email labelled **⚠️ PRIORITY** with the reason; no emergency alert, no SMS |
| EMERGENCY | gas, CO, fire/smoke, sparking/exposed wiring, water on electrics, structural collapse, water pouring / bulging ceiling, uncontrolled flooding, burst pipe, sewage backup, no heat with frozen pipes / < 50°F inside / a baby, older or ill person | Fixed safety steps first (evacuate + 911 / gas utility from outside for life-safety), verified property contacts, the flagged line, an emergency work order, management alert |
| UNCLEAR | "my ceiling is leaking", water on the floor, a clogged toilet, unspecified mold or leak | One or two short questions first; the answer ("it's pouring", "it's bulging") escalates immediately |

- **Lost keys / locked out (nothing broken)** = the tenant's to arrange: no work order, no escalation (unless they ask
  for a person), reply says they can call a licensed locksmith directly, subject to their lease. No fee, charge or lock
  change is ever stated. A broken/jammed lock = PRIORITY. An unsecurable door with someone outside or the tenant
  afraid = EMERGENCY (security). Someone locked/trapped inside = EMERGENCY (911 first).
- Mixed messages: any immediate hazard (gas, sparks, water everywhere, sagging ceiling, smoke, collapse, can't breathe)
  overrides routine wording in the same message, and is never downgraded.
- The fixed rules decide emergencies; the model can still call an emergency the rules don't recognise. A model emergency
  is **downgraded** only when the message matches a known non-emergency pattern and nothing in the tenant's recent
  messages was an emergency.
- AI-initiated vendor dispatch is now **off** unless `AI_VENDOR_DISPATCH_ENABLED=true` (no contractor has agreed to
  tenant-initiated dispatch). Management can still dispatch from the landlord app.
- **Emergency contacts per property** (Vercel env `EMERGENCY_CONTACTS`, JSON; empty = nothing shown, today's wording):
  `{"8376ebcd-9e68-4895-aeda-b7b8402868e8":[{"service":"plumbing","name":"…","phone":"…","hours":"24/7","verified_on":"YYYY-MM-DD","tenant_may_call":true}]}`.
  Services: `plumbing`, `gas_utility`, `electrical`, `heating`, `water_damage`, `locksmith`, `other`. A contact is shown
  only with a valid phone, a `verified_on` date **and** `tenant_may_call: true`, and only to tenants of that property.
  Nothing in it implies dispatch or billing terms. The management urgent line (`MANAGEMENT_URGENT_PHONE/HOURS`) is unchanged.
- Tests: `tests/maintenance-triage.test.mjs` (56), plus routine / priority / contacts cases in comms-remediation.

### 0.4c Deployment checklist for `pilot/first-tenant` (do not run until authorized)

Scope: Vercel only (`api/` routes + the Vite app). **No database migrations, no Edge Function, Stripe/payment or
Supabase Auth changes** in this branch (`git diff --name-only main..pilot/first-tenant` has nothing under `supabase/`).

Before:
1. `npm test` → all pass except the known `a3-financial` CRLF artifact; `npm run build` OK.
2. Vercel env (Production): **leave unset** `AI_VENDOR_DISPATCH_ENABLED` (AI dispatch stays off), `EMERGENCY_CONTACTS`
   (until contacts are verified), `MANAGEMENT_URGENT_PHONE/HOURS` and `VITE_MANAGEMENT_URGENT_PHONE/HOURS` (until the
   number is decided). Unset = today's wording. No existing variable changes.
3. Note the current production deployment (main = `e74b16d`) for rollback.

Deploy: fast-forward `main` to the approved commit (`git update-ref refs/heads/main <sha> e74b16d…`), push `main` only;
watch the Vercel deployment to READY.

After (smoke, dummy accounts only):
4. Site loads; tenant login works; Maintenance form shows "Call 911 first … There is no 24/7 emergency phone line yet."
5. As Test User: "my toilet keeps running" → calm reply, no escalation; "my ceiling is leaking" → the two questions;
   "I lost my keys" → locksmith reply, no escalation; "I smell gas" → leave/911 first + management email.
6. Agent Center shows only the gas test as an emergency; resolve the test items with a note.

Rollback: Vercel → Deployments → the `e74b16d` deployment → Promote (or fast-forward-revert `main`). No data to undo.

### 0.5 Automated checks run tonight

`npm test` on `pilot/first-tenant`: **606 / 607 pass**. The only failure is the pre-existing
`a3-financial` "earlier migrations are untouched" CRLF artifact (core.autocrlf; committed blobs match). New:
`tests/emergency-contact.test.mjs` (6), `tests/pilot-ai-scenarios.test.mjs` (22). `vite build`: OK.
`eslint` on the changed files: no new findings (the remaining `process` no-undef in classify-and-route.js and two unused
variables in MaintenanceRequestForm.jsx are already on `main`).

---
*Original audit (2026-11-16 morning) follows; §0 supersedes it where they differ (backups are now done: B2 closed).*

Audited 2026-11-16 against **production `main` = `e74b16d`** (Vercel), the launch docs (pilot-readiness.md,
first-tenant-checklist.md) and public DNS. Read-only: no code, configuration, database or deployment was changed.
Scope: **one landlord (you), one test tenant, 90 days.** Rent, payments, SMS and multi-landlord work stay off.
The landlord-isolation work (`feature/staging-isolation`, `a4d4a9a`) and `research/` are preserved and untouched.

**Bottom line: no code change is required to launch.** Four items block the first invitation, and all of them are
your decisions or settings: emergency number, backups, cleaning the test data, and two human end-to-end tests.

## 1. Readiness by area

| # | Area | Status | Basis |
|---|---|---|---|
| 1 | Tenant login and onboarding | **NEEDS FIX** | Invite → claim → password flow is live and its DB rules are verified. The email link lives only **1 h** (Supabase OTP 3600 s). The full flow has not been run on a phone |
| 2 | Tenant portal | READY · phone NOT VERIFIED | Composer above the nav and no horizontal scroll at 360–430 px (measured after RC1.1). Real-device checks (keyboard, camera, VoiceOver) still open |
| 3 | Maintenance submit and track | **NOT VERIFIED** (half) | Submit verified (MR-39160: one alert, no vendor). Status change → tenant view + email, and the tenant comment → management email, not yet run |
| 4 | AI assistant and knowledge isolation | READY (isolation) · **NEEDS FIX** (content) | Knowledge is filtered to organization / the tenant's property / the tenant's unit (`agentKnowledge.js:14-16`). Cross-tenant 403. One reply per message. Rent context is empty while the ledger is inactive (`aiSafety.js:15`). **No facts loaded for the pilot building yet** |
| 5 | Emergency escalation | **BLOCKED** | The portal shows 911-first guidance, and the AI escalates by email even when OpenAI fails (`classify-and-route.js:490`). SMS is off by design. **No after-911 number or hours decided** |
| 6 | Landlord email / SMS | **NEEDS FIX** | Management mail goes to `LANDLORD_EMAIL` (moduspropmgmt@gmail.com per the comms docs). Sends are accepted by Resend; **arrival in the inbox is not confirmed**. **DMARC is missing** (`_dmarc.getmodusam.com`: no record, checked today). The root domain has **no MX**, so tenant replies to emails go nowhere. SMS off (intended) |
| 7 | Lease and document access | READY | Lease PDFs open via signed URL. The storage policy lets a tenant read only their own folder (WP1, confirmed against production policies 2026-11-15). The Documents tab says "coming soon"; the lease link is on Home |
| 8 | Rent tracking and payments | READY (off, as intended) | Pay screen: "not available yet". Balance shows "unavailable" (receivables inactive). No bank linking. Reminder cron off. 0 charges. The 5% fee can't fire because payments are off |
| 9 | Tenant data security | READY for 1 landlord · 1 Medium open | RLS + claim trigger + unique index verified; storage path policies applied; landlord RPCs refuse tenants. Open: **Preview deployments share production secrets** (the guard fails closed); minimum password length 6 |
| 10 | Backups, recovery, monitoring | **BLOCKED** | Free plan: **no backups, no PITR.** `backup-modus.ps1` exists but `.db-url` does not, so it has never run. No error or uptime monitoring; the daily recap + safety sweep are the only monitors, and the first recap (2026-11-15) **hasn't been confirmed received** |

## 2. Issues (only those that affect safe use by the test tenant)

| ID | Severity | Workflow | Issue | Smallest safe fix | Who |
|---|---|---|---|---|---|
| B1 | **Critical** | Emergency | No number or hours for "call me after 911" | Decide the number + answered hours. Put them in the welcome message and tell the tenant in person. Turn on Gmail phone notifications with sound for moduspropmgmt@gmail.com | You |
| B2 | **Critical** | Recovery | No database backup of any kind | Free option: create `C:\Modus-dev\db-backups\.db-url` (Session pooler URI), run `backup-modus.ps1` once, restore it into a scratch DB once, schedule it nightly in Task Scheduler. Or upgrade to Supabase Pro ($25/mo, daily backups). Neither backs up uploaded files: keep originals of the lease PDF | You (Claude can help test the restore) |
| B3 | High | Onboarding | The end-to-end invite/reset flow is untested on a phone | Run first-tenant-checklist.md §A with the dummy (10 min) | You; Claude verifies read-only |
| B4 | High | Maintenance, messaging | The management side is untested in production: status change, reply, Agent Center | Run first-tenant-checklist.md §B (15 min) | You |
| B5 | High | AI, monitoring | 35 test escalations + 8 test tickets clutter the Agent Center and recap, so the real tenant's items would be easy to miss | pilot-readiness.md §7 cleanup in the landlord UI (resolve with notes; nothing deleted) | You |
| F1 | High | Onboarding | The link expires after 1 h | **Either** set Supabase *Email OTP expiration* = 86400 (then Claude changes the "about an hour" copy: a one-line change, deployed with your approval), **or** send the invite while the tenant is with you. For one tenant the second is enough | You |
| F2 | High | AI | No building facts → the AI escalates every question (safe but noisy) | Teach Agent: parking, trash and recycling days, laundry, quiet hours, how to report maintenance, your contact hours | You |
| F3 | Medium | Email | No DMARC; inbox arrival unverified | Add TXT `_dmarc.getmodusam.com` = `v=DMARC1; p=none; rua=mailto:moduspropmgmt@gmail.com`. Confirm the test emails land in the inbox (not spam) for both the gmail and the tenant's provider | You (DNS) |
| F4 | Medium | Email | Tenant replies to notification emails are lost (no MX) | No change: keep the "not monitored, use the portal" wording, and say it in the welcome message | — |
| F5 | Medium | Security | Preview env holds the production service-role key | Remove the Preview scope from `SUPABASE_SERVICE_ROLE_KEY` (no rotation needed), per preview-isolation.md. Can be done in week 1 rather than before the invite: the RC1 guard already fails closed | You |
| F6 | Low | Monitoring | Recap delivery unconfirmed | Check the inbox for the 2026-11-15/16 07:00 ET recaps; Vercel cron log if missing | You |
| F7 | Low | Portal | Home shows the unit's rent amount and a "next due" countdown | Confirm the pilot unit's rent amount is correct before inviting | You |
| L1 | Low | Security | Minimum password length 6; leaked-password protection off (Pro only) | Raise the minimum to 8 in Supabase Auth settings (optional) | You |

**Not issues for this pilot (deliberately left alone):** landlord isolation, self-signup, accounting, subscriptions,
the 5% fee, SMS, vendor auto-dispatch, the management@getmodusam.com forwarding test (stays pending).

## 3. Seven-day launch plan

| Day | Date | Work | Acceptance criteria |
|---|---|---|---|
| 1 | Mon 11-16 | B1 emergency decision. F6 check the recap. F1 decide link lifetime (setting, or invite in person) | Number + hours written into the welcome message; a recap email found in the inbox |
| 2 | Tue 11-17 | B2 backups: `.db-url`, first dump, **test restore**, schedule nightly. Restore into a throwaway database, never prod; with no local Postgres server, `pg_restore -f check.sql` to plain SQL is the minimum check | A dump file > 10 KB; the archive reads cleanly and contains data for `tenants`, `maintenance_requests`, `messages`, `auth.users`; the scheduled task ran once |
| 3 | Wed 11-18 | B3 onboarding test §A. B4 management test §B | Every §A/§B step passes on your phone; Claude's read-only check confirms the claim and sign-in |
| 4 | Thu 11-19 | B5 cleanup. F2 Teach Agent (6+ facts). F3 DMARC. F7 rent amount. Archive the dummy | Agent Center unresolved = 0; DMARC resolves; 5 sample questions get correct AI answers or a clean escalation |
| 5 | Fri 11-20 | Create the pilot tenant record (their own email, correct unit). Optional: upload the lease PDF. Rehearse an emergency message with Test User | Readiness SQL: one active record, right unit, `registered = false`; the test emergency email arrives within 2 min with sound on your phone |
| 6 | Sat 11-21 | GO/NO-GO review (below). If GO: invite with the tenant present; first login together; they send "hello" | `registered = true`; an AI reply and your reply both reach them |
| 7 | Sun 11-22 | Day-1 follow-up: tenant submits one real (or practice) maintenance request; you move it to In progress | The tenant sees the status and gets the email; nothing appears in the recap's failure section |

## 4. GO / NO-GO checklist (every box must be checked before the invitation)

- [ ] **Emergency:** after-911 number + hours decided, in the welcome message, told in person; phone alerts on for the management inbox
- [ ] **Backups:** at least one successful dump **and one successful test restore**; nightly schedule running (or Pro enabled)
- [ ] **Onboarding:** §A passed end to end on a phone (invite → password → login → forgot → reset → login)
- [ ] **Management loop:** §B passed (Agent Center resolve/reopen, ticket status → tenant sees it + email, reply labelled management)
- [ ] **Clean slate:** Agent Center unresolved = 0; test tickets resolved; dummy archived
- [ ] **AI knowledge:** pilot building facts taught; 5 sample questions answered correctly or escalated
- [ ] **Email:** test emails found in the inbox (not spam) for management and the tenant's email provider; DMARC record live
- [ ] **Recap:** at least one daily recap received and readable
- [ ] **Link lifetime:** set to 24 h, **or** the invite will be sent while the tenant is present
- [ ] **Tenant record:** own email, correct unit, correct rent amount; told rent doesn't change
- [ ] **Rollback known:** previous Vercel deployment can be promoted; archive-tenant path understood

**NO-GO triggers:** any failed box above. **Pause the pilot** if the tenant sees anyone else's data, the AI states a
fact not in the knowledge base, a maintenance request goes unseen for more than 1 h, or a backup run fails twice in a row.
