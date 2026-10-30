# SEC-002 — Vendor Portal Security Remediation

**Date:** 2026-10-30  **Implements:** `docs/security-deployment-review.md` §1.3
**Status:** Code complete and tested locally. **Not deployed, not committed, no SQL executed.**

> **Database security is NOT yet fixed.** This change moves the vendor portal off direct
> anonymous database access, which is the prerequisite. The anonymous access itself is
> removed only when `docs/migrations/sec002_vendor_anon_lockdown.sql` is separately
> reviewed and applied. Until then, the exposure described in the review's §1.2 remains.

Paths are relative to the repo root.

---

## 1. Files changed

**Created**

| File | Purpose |
|---|---|
| `tenant-portal/api/_lib/vendorSession.js` | Issues and verifies HMAC-SHA256-signed vendor sessions bound to one ticket and the current vendor token. Fails closed without `VENDOR_SESSION_SECRET`. |
| `tenant-portal/api/vendor-ticket.js` | Vendor portal API: the `preview`, `get`, `accept_work_order`, `comment`, `submit_quote`, `complete` and `upload_url` actions, using the service-role client scoped to the session's ticket. |
| `tenant-portal/src/vendorApi.js` | Browser client: session storage (`sessionStorage`), API calls, and signed-URL uploads via plain `fetch`. |
| `tenant-portal/tests/vendor-portal.test.mjs` | 48 automated tests (Node built-in test runner, no new dependencies). |
| `docs/migrations/sec002_vendor_anon_lockdown.sql` | Prepared migration. **Not executed.** |
| `docs/vendor-security-remediation.md` | This report. |

**Modified**

| File | Change |
|---|---|
| `tenant-portal/api/vendor-verify-pin.js` | On a correct PIN, also returns `session` and `session_expires_at`. Returns 500 before doing anything if `VENDOR_SESSION_SECRET` is missing. Now selects `vendor_token` so the session can be bound to it. |
| `tenant-portal/src/VendorAccess.jsx` | Removed the direct Supabase `select` (link check), `update` (e-signature) and `insert` (audit comment). It now uses `vendorPreview`, `vendorVerifyPin` and `vendorCall("get" / "accept_work_order")`. The session is kept in `sessionStorage`, and the old `localStorage` keys are cleared. Adds a signature error message and a session-expired path. |
| `tenant-portal/src/VendorTicket.jsx` | Removed every direct Supabase table and storage call (3 selects, 1 storage list, 2 updates, 4 comment inserts, 3 uploads) and the import of `getSignedStorageUrl`. The `localStorage` token gate is replaced by a session presence check; the server re-verifies the session on every call, and a 401 returns the vendor to the PIN screen. |
| `tenant-portal/package.json` | Added `"test": "node --test \"tests/**/*.test.mjs\""`. |
| `docs/security-deployment-review.md` | Added `VENDOR_SESSION_SECRET` to the Vercel environment table (§4.1). |

**Not changed:** payment, accounting, tenant and landlord screens, Edge Functions, `src/storageUtils.js` (SEC-001), and the duplicate function copies. Nothing was deleted.

**SEC-001 preserved:** the earlier SEC-001 edit to `VendorTicket.jsx` (sign photo URLs, store the invoice as a bare object path rather than a public URL) is kept. Photos are now signed by the server (`createSignedUrls`, 600 s, the same TTL as `storageUtils.js`), and `invoice_url` still stores the bare path. All other SEC-001 files are untouched.

---

## 2. API contract and session behavior

### 2.1 Session

- **Issued by:** `POST /api/vendor-verify-pin` after a correct PIN.
- **Format:** `base64url(payload).base64url(HMAC-SHA256(payload, VENDOR_SESSION_SECRET))`
  - payload: `{ v: 1, tid: <ticket id>, th: <first 32 hex of sha256(vendor_token)>, iat, exp }`
- **Lifetime:** 8 hours, capped at the link's `vendor_token_expires_at`.
- **Bound to one ticket.** `tid` is the only ticket the session can act on. Ticket ids in the request body are ignored.
- **Revoked on reassignment.** Every call re-reads the ticket and requires `sha256(current vendor_token)` to match `th`. When the landlord reassigns or regenerates the vendor link, which creates a new token, existing sessions stop working immediately.
- **Link expiry is enforced on every call,** not only at login.
- **Comparisons are constant-time,** for both the signature and the token hash.
- **Browser storage:** `sessionStorage["vendor_session:<token>"]`, per tab and cleared when the tab closes. Holding it is not authorization; the server checks it on every request.
- **Transport:** request header `X-Vendor-Session: <session>`. Same-origin only; no CORS headers are sent.
- **Fail closed:** if `VENDOR_SESSION_SECRET` is missing or shorter than 32 characters, both endpoints return 500 and no session is issued or accepted.

### 2.2 `POST /api/vendor-verify-pin`

| Request | Response |
|---|---|
| `{ token, pin }` (PIN must be 4 digits) | `200 { ok, ticket_id, work_order_accepted_at, session, session_expires_at }` |
| | `400` malformed · `404` unknown link · `410` expired link · `401` wrong PIN (all failures delayed 750 ms) · `500` not configured |

The PIN and the vendor token are never returned.

### 2.3 `POST /api/vendor-ticket` — body `{ action, ...fields }`

Unknown actions, including prototype-key names such as `constructor`, return **400**. Session failures return **401** with `code` set to `expired`, `bad_signature`, `malformed`, `revoked` or `link_expired`.

| Action | Auth | Allowed input | Preconditions | Writes (allow-listed) | Returns |
|---|---|---|---|---|---|
| `preview` | link `token` only | `token` | link exists and not expired (404 / 410) | — | `{ valid, title }` only |
| `get` | session | — | — | — | `{ ticket, comments, photos }` (see below) |
| `accept_work_order` | session | `signature_name` (1–120 chars, required), `vendor_email` (optional, ≤254, format checked) | if already accepted, does nothing and returns `already_accepted: true` | `maintenance_requests`: `work_order_accepted_at` (server time), `work_order_accepted_by`, `vendor_email`. Plus an audit comment. | `{ ok }` |
| `comment` | session | `body` (1–2000) | accepted; status not `resolved` / `pending_review` (409) | `maintenance_comments` row; author fields set by the server | `{ ok }` |
| `submit_quote` | session | `amount` (>0, ≤1,000,000, rounded to cents), `notes` (≤2000) | accepted; not closed; status not `quote_submitted`; `quote_approved_at` empty | `quote_amount`, `quote_notes`, `quote_submitted_at`, `status = 'quote_submitted'` (fixed value). Plus an audit comment. | `{ ok }` |
| `complete` | session | `invoice_notes` (≤2000), `invoice_path` (optional; must be `<session ticket>/invoice-<digits>-<hex>.<ext>`) | accepted; `quote_approved_at` set; not closed | `status = 'pending_review'` (fixed value), `invoice_url`, `invoice_notes`. Plus an audit comment. | `{ ok, invoice_path }` |
| `upload_url` | session | `kind` ∈ `photo`/`quote`/`invoice`; `ext` ∈ `jpg jpeg png gif webp heic heif pdf` | accepted; photo: not closed; quote: quote allowed; invoice: complete allowed | — (server picks the path `<ticket>/<vendor\|quote\|invoice>-<ms>-<hex>.<ext>`) | `{ path, signed_url }` |

**What `get` returns**
- **`ticket`** is restricted to these fields: `id, title, description, category, priority, status, created_at, scheduled_date, scheduled_time, vendor_name, property_address, work_order_accepted_at, quote_amount, quote_notes, quote_submitted_at, quote_approved_at, invoice_notes`.
  - **`entry_instructions` is added only once `work_order_accepted_at` is set.**
  - `vendor_pin`, `vendor_token`, `tenant_id`, `unit_id` and every other column are never returned.
  - The server reads `select("*")` and filters in code, so columns that may not exist in the live schema (e.g. `property_address`) cannot break the call.
- **`comments`** are this ticket's comments only, with fields `id, body, author_type, author_name, created_at`. `author_id` and `visible_to_tenant` are dropped.
- **`photos`** are 10-minute signed URLs for objects under `maintenance-photos/<ticket id>/`, skipping `.`-prefixed placeholder files.

**Fields the vendor can never write:** any landlord-controlled column, including `status` to any value other than the two fixed transitions above, `quote_approved_at`, `priority`, `scheduled_*`, `entry_instructions`, `vendor_*` credentials and tenant or unit links. No action reads arbitrary keys from the body into an update.

**Uploads:** the browser `PUT`s FormData (`cacheControl` plus the file) to `signed_url`, the same wire format `supabase-js` `uploadToSignedUrl` uses. Signed upload URLs are valid for about 2 hours (Supabase default) and only for the exact path the server chose.

### 2.4 Notifications (preserved)

`notifyQuoteReceived` and `notifyVendorComplete` in `src/notifications.js` are still called from `VendorTicket.jsx` with `vendorToken: token`, through the hardened edge `send-email`, which authorizes vendors by token and limits them to landlord addresses. They now fire only after the server confirms the write succeeded.

### 2.5 Intentional behavior differences

| Before | Now | Why |
|---|---|---|
| Vendor session persisted in `localStorage` across tabs and days | Per-tab `sessionStorage`, 8 h maximum | Required by the spec; limits stolen-session lifetime. **A vendor opening the link in a new tab re-enters the PIN.** |
| Comment, quote and upload were technically possible before signing | Server requires an accepted work order (403) | The UI already enforced this order; now the server does too. |
| Quote stored exactly as typed | Rounded to cents, capped at $1,000,000 | Input validation. |
| Photo filename `vendor-<ms>.<ext>` | `vendor-<ms>-<hex>.<ext>` | Uniqueness; the prefix is unchanged, so landlord views are unaffected. |
| E-signature comment date from the vendor's browser locale | Server date (UTC) | Authoritative timestamp. |
| Comment author name from page state | `maintenance_requests.vendor_name` read on the server | Prevents spoofing. |
| Signature save failures were silent | Shown under the button | UX. |

---

## 3. Database migration prepared

**File:** `docs/migrations/sec002_vendor_anon_lockdown.sql` (revision 3). It is **not executed**. It lives outside `tenant-portal/supabase/migrations/` so `supabase db push` cannot apply it.

### 3.1 What the repository shows

- **VERIFIED:** the repo contains no policies, grants, role memberships or bucket settings for `maintenance_requests`, `maintenance_comments` or `maintenance-photos`.
- **INFERRED:** permissive anonymous access must exist in the live database, because the previous anonymous vendor portal worked (review §1.2).
- **VERIFIED:** no code generates public storage URLs. `getPublicUrl` and `/object/public/` appear nowhere in `tenant-portal/src`, `api` or `supabase/functions`, except where `src/storageUtils.js` *parses* legacy URLs in order to sign them.

### 3.2 Structure

Run one part at a time and save every read-only output.

| Part | Kind | Purpose |
|---|---|---|
| 0 | read-only | Pre-flight checks 0.1–0.9, listed below. |
| 0R | read-only | Generates the **exact** `GRANT` statements that recreate anon's current direct grants. The only valid Part A rollback. |
| A | 1 transaction | Precondition asserts → snapshot other roles' effective privileges → `REVOKE ALL … FROM anon` on both tables → restrictive deny policies (create if absent; STOP if a different definition exists) → assert anon's effective privileges are all false, other roles' privileges are unchanged, and both policies match exactly. Any failure rolls back the whole part. |
| B | 1 transaction | Precondition asserts → derive the exact expected policy expression on the same server (session-local temp table) → restrictive anon policy on `storage.objects` for `maintenance-photos` only (create if absent; STOP unless the stored `USING`/`WITH CHECK` match exactly) → exact-match postcondition. |
| C | 1 transaction (commented; gated) | Make the bucket private, with pre/post asserts. **Required for complete photo privacy.** |
| S | read-only | Status and diagnosis: which parts are applied, anon's remaining effective privileges, bucket visibility, RLS state. Used after every part and for diagnosing partial runs. |
| R | manual | Reverse-order rollback using the saved Part 0R output. |

**Pre-flight checks (Part 0):**
- 0.1 table existence, owner and RLS state
- 0.2 table-level ACL (from `pg_class.relacl`, including PUBLIC and grantor)
- 0.3 column-level ACL
- 0.4 role memberships: (a) roles anon belongs to; (b) every direct or indirect member of anon, classified exactly as Parts A/B enforce it (S2 / expected `authenticator` / superuser / BYPASSRLS / **STOP S10**)
- 0.5 effective privileges of `anon` and `authenticated` via `has_table_privilege()` and `has_any_column_privilege()`, plus an `authenticated` privilege fingerprint
- 0.6 all policies, plus a fingerprint of the non-sec002 ones
- 0.7 indirect anon paths: views without `security_invoker`, and `SECURITY DEFINER` functions anon can run
- 0.8 bucket state; 0.8b `storage.objects.bucket_id` type and collation
- 0.9 every `sec002_*` policy in any schema, flagged expected or unexpected

**Why no existing policy is altered or dropped:** restrictive policies are AND-ed with permissive ones, so blocking `anon` changes nothing for `authenticated` or `service_role`. I rejected narrowing existing anon policies to `authenticated`. An anon-only policy like "rows with a vendor token are readable" would then hand that access to every signed-in tenant.

**Corrections in revision 2:** revision 1 trusted a direct `REVOKE`. That is insufficient because:
- privileges can also come from PUBLIC or inherited roles;
- `REVOKE` only removes grants made by the executing role, so grants by another grantor survive;
- `has_table_privilege` ignores column grants.

Revision 2 instead *asserts* the effective result inside the transaction. It also adds STOP conditions for RLS being disabled, PUBLIC grants, `authenticated` or `service_role` membership in `anon` (which would make `TO anon` policies apply to them), and indirect access paths. Its rollback no longer suggests `GRANT ALL`.

**Corrections in revision 3** (owner review):
1. **Exact storage-policy check.** Revision 2 accepted an existing Part B policy if its expressions merely *contained* `bucket_id <> …maintenance-photos…`. So `(bucket_id <> 'maintenance-photos' OR true)`, which grants anon the bucket, would have passed. Part B now derives the exact expression text PostgreSQL stores (from a session-local temp table whose `bucket_id` has the same type and collation, on the same server) and requires exact equality for both `USING` and `WITH CHECK`, at both the idempotency check and the postcondition. Anything else is a STOP.
2. **Unexpected members of `anon` (S10).** Every direct or indirect member of `anon` must be the expected Supabase login role `authenticator`, a superuser, or a `BYPASSRLS` role. Otherwise Parts A and B STOP. The allowlist is explicit (`ARRAY['authenticator']`), no membership is changed, and extending the list is a reviewed change. Related addition (S11): Part A snapshots the effective privileges of `authenticated`, `service_role` and every role that inherits from `anon` before the revoke, and STOPs if any changed. This covers privilege loss as well as policy reach.
3. **Complete Part S.** `part_a_applied` now requires both exact policy definitions *and* no effective `anon` privilege at table or column level. It is computed from the same data as the `anon_effective_privs` diagnostic, which now lists column-only privileges separately.
4. **S6 enforced as documented.** Parts A and B now STOP on *any* `sec002_*` policy, in any schema, that isn't one of the three this file creates, in addition to exact-definition checks on those three. Part 0.9 and Part S report unexpected ones.

### 3.3 Migration guarantees, limits and procedure

**1. What the migration guarantees** (only if Parts A and B commit)

| # | Guarantee | How it is enforced |
|---|---|---|
| G1 | `anon` has **no effective privilege** on `maintenance_requests` or `maintenance_comments`: table- or column-level, direct, via PUBLIC, or via membership. | Asserted with `has_table_privilege()` (7 privilege types) and `has_any_column_privilege()` (4 types) after the revoke. If anything remains, Part A raises STOP and rolls back entirely. |
| G2 | Restrictive `USING (false) WITH CHECK (false)` policies for `anon` exist on both tables, with exactly that definition. | Created if absent; exact definition verified after. This is a backstop that is effective only while RLS is enabled. |
| G3 | `anon` is denied every **RLS-governed** operation on `storage.objects` rows in `maintenance-photos`. | Restrictive policy scoped to that `bucket_id`. Stored `USING` and `WITH CHECK` must exactly equal a reference expression derived on the same server; any other definition is a STOP. |
| G4 | No other role's privileges, no existing policy and no RLS setting is changed. | Privileges: asserted inside Part A by a before/after comparison for `authenticated`, `service_role` and every role inheriting from `anon` (S11). Policies and RLS: no statement targets them; verified by comparing the Part 0 and Part S fingerprints. |
| G5 | With Part C, `/object/public/maintenance-photos/...` URLs stop serving. | Pre/post-asserted bucket flag. |

**2. What it does not guarantee**
- **Authenticated isolation.** Whether one tenant can read another tenant's tickets depends on the existing `authenticated` policies, which this migration does not evaluate or change. *Do not cite this migration as evidence of tenant isolation.*
- **Public-URL reads before Part C.** RLS does not govern public-bucket URLs, so anyone who knows or guesses a path can still read it until Part C runs.
- **Undetectable indirect paths.** `SECURITY DEFINER` functions that use dynamic SQL, or triggers on other anon-writable tables that write these tables. Check 0.7 catches the common cases only.
- **Other tables, other buckets, and the vendor PIN brute-force limit.**
- **Past exposure.** Existing tokens and PINs must be rotated afterwards.

**3. Exact preconditions for execution**
- P1: production Vercel runs this SEC-002 code (`api/vendor-ticket.js`, the session-issuing `api/vendor-verify-pin.js`, and the API-only vendor screens).
- P2: `VENDOR_SESSION_SECRET` is set, and §7 steps 1–16 pass on production.
- P3: Part 0 and Part 0R have been run and saved, and **none of the STOP conditions S1–S11** in the SQL header are present:

  | Stop | Condition |
  |---|---|
  | S1 | RLS disabled on either table. Requires a separate review of landlord/tenant policies. RLS is **not** enabled by this migration. |
  | S2 | `authenticated` or `service_role` is a member of `anon`. |
  | S3 | PUBLIC holds any privilege on either table. PUBLIC is **not** revoked automatically. |
  | S4 | `anon` would retain an effective privilege after the revoke (inherited, or granted by another grantor). |
  | S5 | Indirect anon paths exist. |
  | S6 | Any `sec002_*` policy, in any schema, other than the three this file creates; or one of those three with a definition that isn't exactly this file's. |
  | S7 | RLS disabled on `storage.objects`. |
  | S8 | A table, `storage.objects` or its `bucket_id` column is missing. |
  | S9 | Part 0R output not saved. |
  | S10 | A direct or indirect member of `anon` other than `authenticator` that is neither superuser nor `BYPASSRLS`. No membership is changed. |
  | S11 | The revoke changed the effective privileges of `authenticated`, `service_role`, or any role inheriting from `anon`. |

  S1–S8, S10 and S11 are also asserted inside Parts A and B, so a missed review still cannot apply a partial change. S9 is procedural.
- P4 (Part C only): the SEC-001 signed-URL frontend is in production, and landlord, tenant and vendor photo and invoice viewing is verified.

**4. Exact postconditions to verify** (Part S, plus re-running the fingerprints)

| Check | Expected |
|---|---|
| `part_a_policies_exact`, `part_a_applied` | `true` (`part_a_applied` covers both exact policies and no table- or column-level `anon` privilege) |
| `anon_effective_privs` | empty string |
| `part_b_applied` | `true`. `NULL` means `bucket_id` isn't type `text` (0.8b); then `part_b_qual` / `part_b_with_check` must equal the reference expression Part B printed in its NOTICE. |
| `unexpected_sec002` | empty string |
| `bucket_public` | `false` after Part C; otherwise as in 0.8 |
| `rls_enabled_all` | `true` (unchanged) |
| `authenticated_priv_fingerprint` | identical to Part 0 |
| `policy_fingerprint` (non-sec002 policies) | identical to Part 0 |
| `curl` with the anon key on `/rest/v1/maintenance_requests` and `/rest/v1/maintenance_comments` | error `42501` |
| anon storage list on `maintenance-photos` | `[]` or an error, never object names |
| public object URL (after Part C) | not 200 |
| §7 steps 17–19 | pass (vendor flow, especially signed uploads; landlord and tenant regressions) |

**5. Safe rollback procedure**
- **Use only when necessary,** for example a production outage traced to this migration. **Rollback restores the original anonymous exposure.**
- Run Part S first to see which parts were applied. Roll back in reverse order, C → B → A, and only the applied parts:
  - **C:** only if Part C ran *and* 0.8 showed `public = true`. Set the bucket back to public.
  - **B:** drop `sec002_deny_anon_maintenance_photos`.
  - **A:** in one transaction, drop the two `sec002_deny_anon_*` policies, then paste the **saved Part 0R output verbatim**. Re-grant nothing else.
- If Part 0R wasn't saved, reconstruct only from the saved 0.2/0.3 rows where `grantee = 'anon'`, or fix forward. Never use a generic `GRANT ALL`.
- Re-granting records `postgres` as grantor, but anon's effective privileges match the original.
- Afterwards, run Part S and compare with the saved Part 0 output.

**Partially completed runs:** Parts A, B and C are each one self-asserting transaction, so a failure leaves that part completely unapplied (`COMMIT` reports `ROLLBACK`). Part S shows exactly which parts are in effect. Re-running a committed part is a verified no-op. A pre-existing `sec002_*` policy is never replaced; a mismatch is a STOP for investigation. If the fingerprints differ from Part 0, something outside this migration changed — investigate before any further step.

**6. Remaining storage and authenticated-access risks**
- **Storage:**
  - Until Part C runs, public-bucket URLs serve any known path regardless of Part B.
  - Bucket-wide `file_size_limit` and `allowed_mime_types` are not set by this migration.
  - Signed upload URLs stay valid for about 2 hours for their exact path.
  - **To verify in production after Part B:** service-role-signed uploads still succeed under the restrictive anon policy (§7 step 17). If they don't, roll back Part B only and report.
  - If `CREATE POLICY` on `storage.objects` fails with "must be owner", stop. Do not change ownership or existing policies to force it.
- **Authenticated access:**
  - Unknown until check 0.6 is reviewed. This migration preserves whatever landlord and tenant access exists today, including any over-broad access.
  - If 0.1 shows RLS disabled (S1), every signed-in user can read and write every ticket. Fixing that needs its own reviewed migration with explicit landlord and tenant policies.
  - Members of `anon` other than `authenticator`, superusers and `BYPASSRLS` roles now cause a STOP (S10) rather than being restricted. `authenticator` is allowlisted because PostgREST uses it only to `SET ROLE` to `anon`, `authenticated` or `service_role`; it never queries these tables as itself.

**Why landlord and tenant access is preserved (VERIFIED in code):**
- Every other reader or writer of these resources runs behind a signed-in route (`authenticated`): `AssignVendorModal`, `LandlordDashboard`, `LandlordMaintenance`, `LandlordProperties`, `LandlordTenantDetail`, `MaintenanceRequestForm`, `TenantMaintenanceDetail`, `TenantMaintenanceList`, `useTenant`, `storageUtils`.
- The only public routes that touched them were `/vendor/:token` and `/vendor/ticket/:token`, which no longer do.
- The live-database side of this claim is what checks 0.4–0.6 and G4 verify.

---

## 4. Tests executed and results

| Check | Result |
|---|---|
| `npm test`: `tenant-portal/tests/vendor-portal.test.mjs` | **48 / 48 pass**, 7 suites, 0 failures |
| Mutation check: each security property deliberately broken in a throwaway copy, then the suite run against it | **All 4 caught.** Leaking `vendor_pin` in `get` → 1 failure. Skipping reassignment revocation → 1. Honoring a body `ticket_id` → 2. Skipping signature verification → 2. The copy was deleted afterwards. |
| `npm run build` (Vite production build) | **Pass**, same chunk-size warnings as before. |
| `npx eslint .` | **174 problems**, up from the 168 baseline. The +6 are all `'process'`/`'Buffer' is not defined` in the new server and test files, the same lint-config issue as every existing `api/` file (browser globals applied to Node code). The two VendorTicket findings (`uploadingInvoice` unused, a `useEffect` dependency warning) exist at `HEAD` and are not new. No new logic lint errors. |

**Coverage by requirement**

| Requirement | Tests |
|---|---|
| Invalid signatures | Tampered payload retargeted to another ticket; foreign secret; forged / garbage / malformed strings; `abc.def` against the API → 401 |
| Expired sessions | Session older than 8 h → 401 `expired`; link expired after the session was issued → 401; session expiry capped at link expiry |
| Ticket isolation | `ticket_id` / `id` / `request_id` in the body ignored; comments, photo listing and signing scoped to the session ticket; upload path forced into the session folder; another ticket's invoice path rejected; `../` traversal rejected; session revoked on token change |
| Unauthorized fields | `accept_work_order`, `submit_quote` and `complete` each sent `status`, `quote_approved_at`, `vendor_pin`, `vendor_token`, `vendor_token_expires_at`, `tenant_id`, `priority`, `landlord_notes`; only allow-listed keys written; comment author fields forced on the server |
| Data exposure | `get` never contains `vendor_pin`, `vendor_token`, `tenant_id`, `unit_id`, or the PIN/token values; `entry_instructions` hidden before acceptance and shown after; comment field allow-list; `preview` returns only `valid` and `title` |
| Each action | `preview`, `get`, `accept_work_order` (success, idempotent, validation), `comment` (requires acceptance, validation, closed ticket), `submit_quote` (validation, rounding, state), `complete` (requires an approved quote, invoice path), `upload_url` (all kinds, extension allow-list, state) |
| Fail closed | Missing `VENDOR_SESSION_SECRET` → `verify-pin` 500 with no session even for a correct PIN; `vendor-ticket` 500; `verifyVendorSession` throws |

**Not covered by automated tests:** the React components (no browser test harness exists in the repo), real Supabase storage signed-upload behavior, and real database policy behavior. These are covered by the manual tests in §7.

---

## 5. Remaining risks and assumptions

1. **Database exposure remains until the migration runs.** Anonymous REST access to the two tables and the bucket (review §1.2) is unchanged by this code deploy.
2. **Existing tokens and PINs should be treated as compromised.** After the migration, reassign vendors on open tickets so each gets a new 24-character token and PIN. Rotation was deliberately not done (out of scope).
3. **No PIN lockout.** There is still only a 750 ms delay per failure; 9,000 PIN values. A lockout needs attempt-tracking columns (review §1.3 step 7), which is a separate migration.
4. **Assumption to verify after migration:** that signed-URL uploads still work under the new restrictive anon storage policy. The upload URL is created by the service role and the upload is authorized by its token, so it should, but it must be confirmed by manual test §7 step 17 after Part B. If it fails, roll back Part B only and report. Migration-specific risks are in §3.3 item 6.
5. **Comment visibility is unchanged.** Vendors see every comment on their own ticket, including landlord internal notes and tenant comments, as before. There is no vendor-visibility flag in the schema. Tightening this needs a product decision and probably a column.
6. **Upload content isn't inspected.** Only the extension is allow-listed, and the signed URL fixes the path. The upload's size and MIME type are not enforced server-side. Recommend setting `file_size_limit` and `allowed_mime_types` on the bucket (pre-flight 0.5 shows current values).
7. **Session revocation is coarse.** Sessions end at expiry, on token reassignment, or when `VENDOR_SESSION_SECRET` is rotated (which ends all vendor sessions). There is no per-session revocation list.
8. **Session theft through XSS:** the session in `sessionStorage` is readable by script on the origin, the same exposure as the tenant and landlord Supabase sessions in `localStorage`.
9. **Schema assumptions:** the columns `vendor_email`, `work_order_accepted_by`, `quote_*` and `invoice_*` exist, because the previous vendor code wrote them. `property_address` may not exist; that is harmless because the server filters a `select("*")`.
10. **`preview` reveals the job title** to anyone holding a valid link token. That's by design and the same as before; tokens are 24 random characters for new links and 12 for old ones.
11. **Legacy 12-character tokens keep working** until rotated (item 2).
12. **Lint config:** server and test files are linted with browser globals. That is pre-existing and not changed here.

---

## 6. Required environment variables

| Platform | Variable | Required | Notes |
|---|---|---|---|
| **Vercel** (Production, and Preview if vendor links are tested there) | `VENDOR_SESSION_SECRET` | **Yes — new** | Random, at least 32 characters, e.g. `openssl rand -base64 48`. **If missing, the vendor portal returns 500 (fails closed).** Rotating it signs out all vendors; they re-enter the PIN. Never prefix it with `VITE_`. |
| Vercel | `SUPABASE_URL` or `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Yes (existing) | Used by `api/_lib/auth.js`. |
| Supabase | — | No change | The vendor API runs on Vercel only. Edge `send-email` (vendor notifications) is unchanged. |

All earlier sprint requirements (`CRON_SECRET`, `STRIPE_WEBHOOK_SECRET`, `ALLOWED_ORIGINS`, and the rest) still apply; see `docs/security-deployment-review.md` §4.

**Deployment order:**
1. Set `VENDOR_SESSION_SECRET`.
2. Deploy Vercel. Frontend and API ship together, and the database still allows the old path, so there is no outage window.
3. Run the manual tests in §7, steps 1–12.
4. Run migration Parts 0 and 0R and save the output. Confirm no STOP condition (§3.3), then run Part A, Part S, Part B, Part S.
5. Run §7 steps 17–19 and the §3.3 postconditions.
6. Rotate vendor links on open tickets.
7. After SEC-001 runtime verification (P4): run Part C, then Part S. **This is required for complete photo privacy.**

---

## 7. Manual test steps for the vendor workflow

**Setup.** As landlord, open a maintenance ticket and choose Assign vendor, picking a vendor and a scheduled date. Copy the link (it should contain a 24-character token) and the PIN. Then use a **private window** with no landlord or tenant session.

| # | Step | Expected |
|---|---|---|
| 1 | Open `/vendor/<token>` | PIN screen shows the job title. DevTools → Network: only `POST /api/vendor-ticket` (`preview`), with no request to `*.supabase.co/rest/v1/…`. |
| 2 | Open `/vendor/<token>` with one character changed | "Link expired or invalid". |
| 3 | Enter a wrong PIN | "Incorrect PIN" after about 0.75 s. |
| 4 | Enter the correct PIN | Work-order screen shows title, description, category, priority and schedule. **No entry instructions.** The `get` response contains no `vendor_pin` or `vendor_token` (check the response body in DevTools). |
| 5 | DevTools → Application | `sessionStorage` has `vendor_session:<token>`. `localStorage` has no `vendor_token` key. |
| 6 | Tick the checkbox, type a name and email, click Accept | Ticket page loads. **Entry instructions are now visible.** Landlord's ticket shows the comment "Work order accepted and signed by …". |
| 7 | Upload a photo | It appears in Photos. Network: `upload_url` call, then a `PUT` to `…/object/upload/sign/maintenance-photos/<ticket>/vendor-…`. |
| 8 | Post a comment | Shown as from the vendor; landlord sees it. |
| 9 | Submit a quote with a photo | "Quote submitted for $X — awaiting approval". Landlord receives the "Quote received" email; ticket status is `quote_submitted`. |
| 10 | Landlord approves the quote; vendor reloads the page | "Quote approved" banner and "Mark work as complete" appear. |
| 11 | Mark complete with an invoice amount and invoice photo | "Awaiting PM review". Landlord receives the "completed" email; status is `pending_review`; landlord can open the invoice image (signed URL). |
| 12 | Close the tab, reopen the link in a new tab | Asked for the PIN again (expected with `sessionStorage`). After entering it, goes straight to the ticket because it's already signed. |
| 13 | **Isolation:** in DevTools console on the ticket page, run `fetch("/api/vendor-ticket",{method:"POST",headers:{"Content-Type":"application/json","X-Vendor-Session":sessionStorage.getItem("vendor_session:<token>")},body:JSON.stringify({action:"submit_quote",amount:1,ticket_id:"<another ticket id>",status:"resolved"})}).then(r=>r.json())` | Acts only on the vendor's own ticket, or returns 409 if quoting isn't allowed. The other ticket is unchanged and status is never `resolved`. |
| 14 | **Tamper:** edit the session in `sessionStorage` (change one character), then reload | Redirected to the PIN screen. |
| 15 | **Revocation:** landlord reassigns the vendor on the same ticket; the vendor reloads the old tab | Redirected to the PIN screen. The old link reports invalid. |
| 16 | **Old link:** open a vendor link issued before this deploy (12-character token) | Works through the new flow. |
| 17 | **After migration Parts A and B:** repeat steps 1–12 | All still work. Step 7 confirms signed uploads under the restrictive policy (§3.3 item 6). |
| 18 | **After migration:** run Part S and the `curl` checks in the migration file with the anon key | Postconditions in §3.3 item 4: `anon_effective_privs` empty; `42501` for both tables; empty or error for the bucket listing; fingerprints unchanged. |
| 19 | **Regression, landlord and tenant:** landlord views tickets, comments, photos and the invoice; tenant creates a request with photos and comments | Unchanged (they run as `authenticated`). |

---

## 8. Confirmation

- **No database changes:** no SQL or migration was executed and no live configuration was modified. The migration exists only as a file under `docs/migrations/`.
- **Migration revisions 2 and 3:** only `docs/migrations/sec002_vendor_anon_lockdown.sql` and this report changed. I found no defect in the vendor API or frontend, so no application code changed and tests and build were not re-run; they remain as reported in §4 (48/48 pass, build passes).
- **Revision 3 syntax validation:** the file was parsed with `@libpg-query/parser` 17.6.10, which is the PostgreSQL 17 parser source compiled to WebAssembly. It ran locally in a scratch folder outside the repo, with no database connection and nothing executed.
  - All 34 top-level statements parse.
  - The commented-out Part C and Part R statements parse.
  - All 9 `DO` bodies (7 active, 2 in Part C) parse as PL/pgSQL.
  - Negative controls were rejected, and three deliberate mutations were caught: a broken embedded `SELECT … INTO`, a missing `END LOOP`, and an unbalanced parenthesis.
- **This is syntax-only validation.** It does not resolve object names, column types, function signatures or permissions. That includes whether `postgres` may create policies on `storage.objects`, whether the temp-table reference policy can be created, and the exact deparse format. Those are only exercised against the live database, where the self-asserting transactions STOP and roll back on any mismatch.
- **No deployment** to Vercel or Supabase.
- **No git commit and no push.** All changes are uncommitted working-tree changes.
- **No vendor tokens rotated.**
- **No files deleted** and no unrelated cleanup. Payment, accounting and other application code is untouched.
- During verification I briefly created and then removed two throwaway copies inside `tenant-portal/`: `.mutation-tmp/` for the mutation check, and a single-file copy used to compare lint output with `HEAD`. Neither remains.
