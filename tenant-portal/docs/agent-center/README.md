# Agent Center intelligence and Teach Agent

Branch `feature/agent-center-intel` (from `7b51fd1`, the production release of 2026-11-13).

## What management sees

For every escalation (routing rows that are `ESCALATE_LANDLORD`, Tier 1 emergencies, or rows with a recorded
notification):

| Field | Source |
|---|---|
| Tenant message (exact) | `ai_routing_logs.raw_message`, else the `messages` row by `message_id`. The AI summary (`detected_intent`) is never shown in its place; if neither exists, the card says "original message not available" and labels the summary as "AI summary". |
| Tenant, unit, property, time | `tenants → units → properties`; time of the tenant's message (else the routing row), Eastern time. |
| AI response | `raw_openai_response.reply` (stored from this release on); for older rows, the AI message (`sender_id` null) in the same tenant's thread between the tenant's message and the routing row. |
| Why escalated | `src/lib/escalationReason.js` (below). |
| Email status | `raw_openai_response.notify` (unchanged; "emailed" only with a Resend id). |
| Resolved / unresolved | latest `resolved`/`reopened` row in `agent_escalation_events`. |
| Conversation | on demand: up to 10 earlier and 4 later messages of **that tenant's** thread, the escalated one highlighted, plus the management history. |

### Escalation reasons

Primary reason, in order: safety emergency → AI unavailable → maintenance → **asked for a person** →
missing property information / missing policy or procedure → needs a management decision (lease, payment,
noise, parking disputes) → AI uncertain (confidence < 60%) → other.

A knowledge gap is reported **only** when the AI's reply says it had no confirmed information. A tenant who
just asks for a person is "Asked for a person", not a gap. If they also asked something the AI couldn't
answer, the gap is shown as a secondary reason. Topics (parking, laundry, amenities, utilities, trash, mail, keys,
pets, guests, smoking, subletting, move-out, renewal, rent, alterations, quiet hours) name the missing information.
"Which spot belongs to my unit" is recognised as unit-specific.

## Teach Agent

1. **Suggest.** The modal pre-fills the topic and scope (unit for unit-specific questions, otherwise the property)
   and an answer: management's own first reply in the thread after the escalation if there is one, otherwise
   `Unit 2: [management answer]`. The tenant's words are shown as the question but never copied in as fact.
2. **Edit and approve.** Management edits the scope (this unit / whole property / all properties), topic and
   answer. The placeholder, empty or over-long answers, and anything that looks like an access code (door,
   lockbox, gate, alarm codes or passwords) are refused in the UI **and** by a database CHECK.
3. **Save.** `agent_knowledge` row (approved by the signed-in landlord, set by the database) plus a
   `knowledge_added` event on the escalation. "Also mark resolved" is unticked by default: creating knowledge
   never closes the escalation by itself.
4. **Use.** `/api/classify-and-route` loads approved entries for the tenant's own unit, own property and all
   properties (service role; UUID-validated filter and a second filter in code) and adds them to the prompt as
   "MANAGEMENT-APPROVED ANSWERS". Another unit's or property's entries are never included. The routing row
   records which entries the AI was given (`knowledge_ids`).
5. **Retire.** Entries are never edited in place: retire and approve a new one (the database enforces this).
   Retired entries for the tenant's scope are listed in the prompt as **WITHDRAWN ANSWERS** (never repeat; an
   approved replacement wins) and recorded on the routing row as `withdrawn_ids`, so an answer the AI gave earlier in
   the conversation can't come back after retirement.

## Conversation history given to the AI

The last 10 messages, labelled: the AI's own replies (null sender or `agent_name`) as *"Modus AI (earlier automated
reply, not a source of facts)"*; **Management** only for senders verified as landlord profiles; everything else
**Tenant**. The prompt forbids repeating a fact from an earlier AI reply unless it is in the knowledge base. History
is never edited.

## One AI run per message

`ai_message_claims` (migration `20261114120000`, service role only): the route claims the message before any work;
an overlapping request gets 202 and writes nothing (the tenant page keeps polling and shows the one reply). A finished
run sets `completed_at` and is never repeated. An unfinished claim older than 90 s can be taken over; the route is
hard-limited to 60 s (vercel.json), so a live run never loses its claim. A tenant message still unanswered after 5
minutes (request never arrived, run stopped) is escalated to management by the safety sweep (`api/_lib/messageSweep.js`).
Without the table the route still answers but logs `[message-claim] UNAVAILABLE` and records `claim:"unavailable"`.

The Agent Center transcript and Teach Agent label only the signed-in management account as **Management**; any other
non-tenant sender shows as "Message" and is never suggested as an answer.

Only landlords can read or write either table (RLS `is_landlord()`); tenants and anonymous callers have no
access. Tenant messages can't become knowledge: only a landlord's explicit Approve writes `agent_knowledge`.

## Resolution and audit

`agent_escalation_events` is insert-only (no UPDATE/DELETE grant or policy): `resolved` (note required),
`reopened`, `knowledge_added`, `note`. The actor and time are set by the database. Resolving also marks the
dashboard's `landlord_alerts` row for that message as read. Conversations and routing rows are never changed.

## Migration `20261114000000_agent_knowledge.sql` (not applied)

Additive: two tables, two trigger functions, indexes, policies, grants. Nothing existing is altered. Verified on
a local Postgres (PGlite) with production-equivalent roles, `auth.uid()` and `is_landlord()`: 27/27 checks
(landlord approve/retire, approved_by spoofing ignored, cross-property unit rejected, access codes rejected,
no edits/deletes, tenant and anonymous have no access, history insert-only, service role reads).

**The application works before the migration is applied:** the API treats a missing table as "no approved
knowledge", and the Agent Center shows the new exact-message view with Resolve/Teach Agent marked unavailable.

Rollback:
```sql
DROP TABLE IF EXISTS public.agent_escalation_events;
DROP TABLE IF EXISTS public.agent_knowledge;
DROP FUNCTION IF EXISTS public.agent_knowledge_guard();
DROP FUNCTION IF EXISTS public.agent_escalation_event_guard();
```

## Limitations

- Older routing rows have no stored reply; the reply is matched from the thread by time (labelled "from the
  thread"). Rows without a `message_id` match nothing.
- Reasons are rule-based and can only be as specific as the topic list and the AI's wording.
- A knowledge entry changes what the AI is told, not what it says: the model can still decline or escalate.
  Check the next answer in the Agent Center.
- The Agent Center loads the latest 100 routing rows (unchanged).
