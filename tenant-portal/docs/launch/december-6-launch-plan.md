# December 6, 2026 tenant launch plan

Scope of the first launch: **tenant portal for communication and maintenance.** Not in scope: rent collection,
receivables, online payments, automated emergency SMS. Internal operational go-live: January 1, 2027.

## 1. Launch blockers (must be done before the first real invitation)

| # | Blocker | Owner | How |
|---|---|---|---|
| 1 | Deploy RC1 + migrations A, B | approval → Claude | `docs/launch/release-candidate-rc1.md` |
| 2 | **Invitation links last ~1 hour** (Supabase default; observed expired after 3.5 h). Real tenants open email later. | you (dashboard) | Supabase → Authentication → Email → *Email OTP expiration* → 86400 s (24 h). Re-test one invite. |
| 3 | Complete the onboarding test end to end (open fresh invite → set password → first login → reset password → login) | you (inbox + password) | §4 |
| 4 | Emergency contact decision: what number tenants call for emergencies (no 24/7 line exists; the app says so) | you | Put the number in the tenant welcome text (§6) and, if desired, the portal's emergency guidance |
| 5 | Real tenant records for the units being invited (only 4 tenant records exist for 15 units) | you (data) / approval | Landlord → Tenants → Add, per unit, with each tenant's own email |
| 6 | Vercel Preview has production secrets | you (dashboard) | `docs/launch/preview-isolation.md` (RC1's guard makes Preview fail closed meanwhile) |
| 7 | DMARC record missing for getmodusam.com (DKIM/SPF for Resend are present) | you (DNS) | TXT `_dmarc.getmodusam.com` = `v=DMARC1; p=none; rua=mailto:<monitored address>`; tighten to `quarantine` after 2 clean weeks |

Recommended but not blocking: leaked-password protection on (Supabase Auth); Resend webhooks for delivered/bounced
(today "sent" means accepted by Resend, not delivered); emergency-SMS decision stays **off**.

## 2. Invitation readiness check (run the day before each wave; read-only SQL)

```sql
select t.name, u.unit_number, p.name property, t.email,
       t.user_id is not null as registered, t.invite_sent_at,
       au.email_confirmed_at is not null as email_confirmed, au.last_sign_in_at
from tenants t join units u on u.id = t.unit_id join properties p on p.id = u.property_id
left join auth.users au on au.id = t.user_id
where not coalesce(t.archived,false) order by p.name, u.unit_number;
```
Ready to invite = active record, correct unit, a real email the tenant reads, not already registered, no other active
tenant on the same login (enforced by migration B).

## 3. Onboarding status tracking

| Status | Meaning | Action |
|---|---|---|
| Not invited | no `invite_sent_at` | invite in the wave |
| Invited | `invite_sent_at` set, `user_id` null | after 48 h: re-send (Tenants → tenant → Resend invite) |
| Registered | `user_id` set | none |
| Active | `last_sign_in_at` within 14 days | none |

Re-sending is safe: `invite-tenant` re-sends a sign-in link to the same tenant record (no duplicate tenants;
`tenants.email` is unique). A tenant whose link expired sees "This invitation link has expired" with Sign in /
Forgot password; the fix is a re-send.

## 4. Failed-invitation handling

| Symptom | Cause | Fix |
|---|---|---|
| Tenant says no email | spam folder; typo | check the address on the record; re-send; ask them to search for "Modus" |
| "This invitation link has expired" | > link lifetime, or an older email after a re-send | re-send; tell them to use the **newest** email |
| "This invitation doesn't match the email you signed in with" | signed into another account on that device | sign out, open the link again (or private window) |
| "You are signed in as Modus management" | opened on a management device | private window / tenant's own phone |
| Lands on "This link has expired" from the home page | old link | Forgot password or re-send |

## 5. Production smoke tests (after each deploy; dummy accounts only)

See RC1 §Smoke tests. Plus daily during the first launch week: open Agent Center (unresolved count), open
Maintenance (sweep runs), read the daily recap.

## 6. Tenant-facing instructions (draft, for the welcome note sent with/after the invitation)

> Welcome to the Modus tenant portal. Open the invitation email on your phone and tap **Set up your account** within
> 24 hours, then choose a password. In the portal you can message us (our assistant answers common questions right
> away and passes anything else to our team), submit maintenance requests with photos, and see bulletin notices.
> **Emergencies:** for fire, smoke, gas smell, sparking electrical or anyone in danger, call 911 first; for gas,
> leave the building and call from outside. Then call us at **[emergency number — decision pending]** and submit a
> request. Online rent payment isn't available yet — keep paying rent the way you do today.

## 7. Management escalation instructions

- **Every morning:** read the daily recap. "Needs management action" lists open escalations; "Still unresolved from
  earlier" keeps them visible until resolved; "Ticket emails that failed" means someone wasn't told — follow up.
- **Agent Center:** read the tenant's exact words, reply in Messages, then **Resolve** with a note. If the AI lacked
  an answer, use **Teach Agent** (property or unit scope); retire wrong answers — they're then marked withdrawn to the AI.
- **Maintenance:** open the queue at least twice a day during launch week; opening it also sends any alert a tenant's
  browser missed. Status changes email the tenant.
- **Emergencies:** the AI gives fixed safety guidance and escalates; there is no automatic SMS. Management email is
  the alert channel — keep email notifications on your phone.

## 8. Rollout plan

| When | Wave | Who | Exit criteria |
|---|---|---|---|
| Dec 1–3 | 0 | RC1 deployed, blockers 2–7 done, onboarding test passes | all smoke tests green |
| Dec 6 | 1 | 2–3 friendly tenants (one building) | all registered within 48 h; first message answered; one maintenance request round-trip |
| Dec 9 | 2 | rest of Clifton Manor | < 10 % need a re-send; no unresolved escalation older than 24 h |
| Dec 13+ | 3 | remaining properties | recap clean for 3 consecutive days |

Pause criteria: any cross-tenant data exposure, an AI answer stating a property fact not in the knowledge base, a
maintenance ticket management didn't hear about within 1 hour, or > 20 % of invitations failing.

## 9. Monitoring

Daily recap (management email); Agent Center unresolved count; Vercel function logs for `[notify-sweep]`,
`[preview-isolation]`, `[daily-recap]`, `[notify]` errors; Resend dashboard bounces; Supabase Auth logs for
`otp_expired` spikes.

## 10. Rollback

App: revert commits on a branch and fast-forward `main` (never force-push). Migrations: statements in each file
header. Tenant access: a tenant can be archived (keeps history) — never delete auth accounts without approval.

## 11. Checks that need a physical phone (cannot be automated here)

1. iPhone Safari: tap the chat box — the keyboard must not cover the composer; the page must not zoom.
2. iPhone: bottom navigation clears the home indicator (safe area).
3. Camera upload from the maintenance form (iOS + Android), including a 10 MB photo and two photos at once.
4. Opening the invitation link from the Gmail app and from Apple Mail (in-app browser vs Safari).
5. Password reset link opened on the phone; password manager offers to save the new password.
6. Landlord on a phone: Agent Center → Resolve; Maintenance → change status.
7. VoiceOver / TalkBack: send button and message box are announced ("Send message", "Message to Modus…").

## 12. Dummy-record cleanup (prepared, not executed)

- **MR-C8945** (`c8945663-bbbb-4c22-bdac-14a5adf5e828`, Test User, Unit 2): landlord → Maintenance → open → internal
  note "Release test ticket (2026-11-14 mobile check). No work required." → status Resolved. History is kept; a
  status email goes to the dummy tenant's address only.
- **Onboarding dummy** (`74037ce6-3723-4eaa-8c76-ca875b5e70df`, unit "Test"): after the onboarding test, archive from
  the tenant page (keeps the auth account and audit history). Expected afterwards: occupancy 3 of 15.
- **Test parking entry** `e1b9b79a…`: already retired (2026-11-14 04:21 UTC). The Amenities entry stays.
