# First real tenant — PASS / FAIL checklist

Production: `main` = `e74b16d` (RC1 + RC1.1), deployed 2026-11-14, Vercel READY. Migrations A and B applied.
Legend: **PASS** verified in production · **FAIL** verified broken/missing · **OPEN** needs a human step (who/how given).
Invite the first tenant only when every row is PASS.

## 1. Authentication and account isolation
| Check | Status | Evidence / next step |
|---|---|---|
| Tenant can't read or act on another tenant (AI route, notify, RLS) | PASS | 403 cross-tenant AI; RLS probe: own data only; landlord RPCs refuse/0 rows |
| Management-only actions refused for tenants; anonymous refused | PASS | 403 landlord events / maintenance_sweep; 401 recap and anonymous |
| No tenant linked to a management login; one active tenant per login (DB rules) | PASS | migration B trigger + unique index; 0 violations |
| Invite / reset links land on the right page; foreign redirects refused | PASS | verify-endpoint probe 2026-11-14 |
| Expired link → "This link has expired" with next steps | PASS | /link-error; copy says "about an hour" = current setting (3600 s) |
| Email link lifetime long enough for real tenants | **FAIL** | Supabase *Authentication → Sign In / Providers → Email → Email OTP expiration* = **3600 s (1 h)**. Set **86400** (24 h, the maximum) → Save. Then ask Claude to change the expired-link copy to "24 hours" |
| Onboarding end to end (invite → register → log in → forgot password → reset → log in) | OPEN | you, §A below |
| Management login, Agent Center resolve/reopen, ticket status change | OPEN | you, §B below (no management session available to automation) |
| Password policy | OPEN (recommended) | minimum length is 6; raise to 8+. Leaked-password protection needs the Supabase Pro plan |

## 2. AI accuracy
| Check | Status | Evidence / next step |
|---|---|---|
| Retired answer not repeated (TEST-2 parking) | PASS | reply "no confirmed information… flagged for management"; `withdrawn_ids` recorded |
| Approved knowledge supplied (Amenities) | PASS | `knowledge_ids` on routing row |
| One reply per message; re-sends ignored | PASS | 3 concurrent re-sends → duplicate; 1 claim, completed |
| Human escalation reaches management | PASS | notify = sent (accepted by Resend; inbox not verified by automation) |
| Knowledge for the pilot tenant's building is correct | OPEN | you: add the facts tenants will ask first (parking, trash, laundry, quiet hours, contacts) via Teach Agent |

## 3. Maintenance and messaging
| Check | Status | Evidence / next step |
|---|---|---|
| Tenant creates a request; saved correctly; one management alert; no vendor | PASS | MR-39160: open/low, 1 "Management emailed" note, no vendor |
| Missed alerts / unfinished messages recovered | PASS | safety sweep runs (tenant scope 200; repeat alert = duplicate) |
| Status change visible to tenant + tenant email | OPEN | you, §B |
| Management reply in Messages reaches the tenant | OPEN | you, §B |

## 4. Mobile
| Check | Status | Evidence / next step |
|---|---|---|
| Chat composer visible above the bottom nav at 360/375/390/430 px | PASS | measured in production after RC1.1 |
| No horizontal scroll; no sub-16px inputs on 9 tenant screens | PASS | 390 px audit |
| Real phone: keyboard over composer, camera upload, mail-app links, VoiceOver | OPEN | you, december-6-launch-plan.md §11 |

## 5. Email delivery
| Check | Status | Evidence / next step |
|---|---|---|
| Sends accepted by Resend (escalation, ticket alert, reset request) | PASS | provider ids / Supabase accepted |
| Arrival in inbox (not spam) for management and the dummy tenant | OPEN | you: confirm today's test emails arrived and where |
| DMARC | **FAIL** | add TXT `_dmarc.getmodusam.com` = `v=DMARC1; p=none; rua=mailto:<monitored address>` |
| Tenant replies to emails reach someone | **FAIL** | `notifications@`/`noreply@getmodusam.com` have no mailbox (no MX). Decide: a monitored Reply-To (Claude can add) or keep "not monitored — use the portal" |
| Daily recap: open/resolved, older unresolved, failures; no duplicate sends | PASS (preview) | built from production data without sending; scheduled run is keyed per day + content. First real run 2026-11-15 12:00 UTC — confirm one email |

## 6. Emergency-contact instructions
| Check | Status | Evidence / next step |
|---|---|---|
| Portal shows 911-first guidance; AI escalates emergencies by email; no SMS | PASS | form banner; SMS disabled |
| After-911 number and hours decided and in the welcome message | **FAIL** | you: pilot-readiness.md §3–4 |

## 7. Recovery and rollback
| Check | Status | Evidence / next step |
|---|---|---|
| App rollback path (revert + fast-forward, or promote previous Vercel deployment) | PASS | documented; previous deployments: 68b7688, ff4ebd0 |
| Migration rollback SQL + pre-change snapshot | PASS | `C:\Modus-dev\release-backups\2026-11-14-rc1` |
| Database backups | **FAIL (risk accepted?)** | Free plan: no backups/PITR. Upgrade to Pro before real tenant data, or accept the risk explicitly |

## 8. Rent payments stay on the existing system
| Check | Status | Evidence |
|---|---|---|
| Pay screen: "Online rent payment isn't available yet" | PASS | production |
| Wallet: no bank linking while payments are off | PASS | RC1.1 in production |
| Rent reminders cron off; receivables inactive; 0 charges; 0 saved bank accounts | PASS | cron job 2 inactive, cutover NULL |
| Tenant told rent doesn't change | OPEN | welcome message §3 |

## 9. Data hygiene before the first invite
| Check | Status | Next step |
|---|---|---|
| Release-test tickets resolved (8), test escalations resolved (35), onboarding dummy archived after the test | OPEN | you, landlord UI, pilot-readiness.md §7 (automation has no management session) |
| Pilot tenant record created with their own email and unit | OPEN | you |

---

## §A. Onboarding test — exact human steps (≈10 minutes, do it in one sitting)

Link lifetime is **1 hour** until the setting above is changed — change it first, then:
1. Phone or private window, signed out of Modus. On your computer, sign in as management.
2. Landlord → Tenants → **Onboarding Test (dummy)** (unit "Test") → **Resend invite**. (The record has an
   unconfirmed login from the 2026-11-14 invite; the resend sends a fresh sign-in link to the dummy inbox.)
3. Open the **newest** Modus email in the dummy inbox on the phone → tap the link → onboarding page shows the
   unit → choose a password (you type it; never share it) → land on the tenant home.
4. Log out → Forgot password → enter the dummy address → open the reset email → set a new password → log in.
5. Tell Claude "onboarding done" — Claude verifies the link, confirmation and sign-in in the database (read-only).
6. Archive the dummy (Tenants → Onboarding Test → Archive). Expected occupancy afterwards: 3 of 15.

## §B. Management-side test — exact human steps (≈15 minutes)

1. Sign in as management on www.getmodusam.com.
2. Agent Center: the "[Release test 3] Which parking spot…" escalation is listed with the tenant's exact words and
   the AI reply; **Resolve** (note "RC1 smoke test") → it shows Resolved; **Reopen** → open; Resolve again.
3. Maintenance: open **MR-39160** → add internal note "RC1 production smoke test" → status **In progress** → as Test
   User the ticket shows In progress and a status email goes to the dummy address → set **Resolved**.
4. Messages → Test User → reply "Release test reply from management" → as Test User the reply appears labelled
   as management (not AI).
5. Dashboard: Occupancy "4 of 15" (3 of 15 after archiving the dummy); rent roll shows "Not tracked", no "-$1".
6. Then cleanup (pilot-readiness.md §7) through the same screens.
