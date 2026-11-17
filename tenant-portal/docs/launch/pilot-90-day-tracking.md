# 90-day pilot tracking plan (one landlord, one tenant)

Starts on invite day (target 2026-11-21) and ends around 2027-02-19. Keep it light: one log file and three
recurring checks. Log file: `docs/launch/pilot-log.md`, or a spreadsheet with the same columns.

## What to log (one row per event)
| Column | Example |
|---|---|
| Date | 2026-11-24 |
| Type | bug · feedback · maintenance · AI · accounting · reliability |
| What happened | "AI said trash day is Tuesday; it's Monday" |
| Severity | S1 safety/data exposure · S2 broken workflow · S3 annoying · S4 idea |
| Action / status | Taught the agent the correct day · fixed `<sha>` · won't fix |

**Rule:** S1 → pause the pilot the same day. S2 → fix within 7 days. S3/S4 → batch them and review monthly.
No new features during the 90 days unless an S2 needs one.

## The five tracks

| Track | Measure | Target | Source | How often |
|---|---|---|---|---|
| **Bugs** | Open S1 / S2 count | S1 = 0 always; S2 closed within 7 days | Log | Weekly |
| **Tenant feedback** | 3 questions: what was easy, what was confusing, would you rather text me? | Asked at day 7, 30, 60, 90; answers verbatim in the log | Short conversation | Day 7/30/60/90 |
| **Maintenance automation** | Per request: time to management seeing it, time to first response, time to resolved, tenant-visible status updates sent | Seen < 1 h; first response < 4 h in business hours; every status change emailed | Ticket timestamps + notes | Per ticket, weekly roll-up |
| **AI assistant** | Messages answered / escalated / wrong. Wrong = stated something not in the knowledge base, or missed an emergency | Wrong = 0; escalation share falling as you Teach Agent | Agent Center + recap | Weekly |
| **Accounting accuracy** | Your own books only: the pilot unit's actual rent received and expenses entered, reconciled to the bank statement | Ties to the cent each month; zero open posting exceptions | Ledger vs bank statement | Monthly (by the 5th) |
| **Operational reliability** | Recap received daily; nightly backup OK; failed emails (recap "failures"); site down events | 7/7 recaps a week; backup OK ≥ 6/7, never 2 misses in a row; failed emails = 0 | Inbox, `db-backups` log, Resend dashboard | Daily glance, weekly check |

Accounting note: payments and receivables stay off. This track checks only that the books you keep by hand in Modus
match reality. It is how the ledger earns trust before anyone else relies on it.

## Rhythm
- **Daily (2 min):** read the recap; answer anything in "Needs management action".
- **Weekly (15 min, Sunday):** backup log, Agent Center unresolved = 0, Resend bounces, fill in the week's row counts.
  Do one restore spot-check a month (open the latest dump with `pg_restore --list`).
- **Day 30 / 60 / 90 review (30 min):** tenant feedback, the five tracks against targets, and a decision:
  *continue · fix and continue · stop*. At day 90 the decision is whether to invite a second tenant, and only after
  that whether to revisit external landlords (research/ holds that plan).

## Exit criteria at day 90
- No S1 incidents; every S2 fixed within 7 days.
- The tenant used the portal for maintenance and messages without being reminded, and says they'd keep using it.
- Every maintenance request was seen within 1 h.
- The AI made no wrong factual statement in the final 30 days.
- 3 consecutive months of your books reconciled to the cent.
- Backups ran ≥ 95% of nights, with at least 2 successful restore checks.
