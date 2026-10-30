# SEC-002 — Deployment Readiness

**Date:** 2026-10-30  **Scope:** application changes for SEC-002 (vendor portal moved to a server-side API with signed sessions), prepared for deployment alongside migration revision 4.
**Done in this review:** code review, `npm test`, `npm run build`, git working-tree classification.
**Not done:** no SQL executed, no connection to production, no deploy, nothing staged, committed or pushed.
**Update (same day):** the two release blockers B1 and B2 (§4) have been fixed in `src/LandlordMaintenance.jsx` and `src/TenantMaintenanceDetail.jsx`. Those are the only application files changed by this review.

Paths are relative to `tenant-portal/` unless they start with `docs/` or are at the repo root.

---

## 1. Recommendation

| Item | Verdict |
|---|---|
| SEC-002 application code (the six files listed in §3) | **GO.** It is correct, tested and isolated per ticket. |
| The release that ships SEC-002, which has to include SEC-001 and the security sprint (see §2.2) | **GO, subject to the pre-deploy checks in §6.2.** The two SEC-001 display blockers (§4) are fixed. Smoke tests V8 and T1 (§7) must pass in production. |

SEC-002 can't be deployed on its own from this working tree. That is why the two SEC-001 defects blocked it: one of them broke the landlord's view of vendor invoices, which is part of the vendor workflow.

---

## 2. Git working tree

Branch `main`, HEAD `fda8dc6`. There are **no deleted files and nothing is staged.** Tracked `.env` files: none.

### 2.1 Classification

**SEC-002: vendor portal (this change)**

| Status | File |
|---|---|
| new | `api/vendor-ticket.js` |
| new | `api/vendor-verify-pin.js`. *Never committed.* `docs/vendor-security-remediation.md` lists it as "modified", but git has no history for it. It must be included in the deployment. |
| new | `api/_lib/vendorSession.js` |
| new | `src/vendorApi.js` |
| new | `tests/vendor-portal.test.mjs` |
| modified | `src/VendorAccess.jsx` (also contains sprint and SEC-001 hunks) |
| modified | `src/VendorTicket.jsx` (also contains sprint and SEC-001 hunks) |
| modified | `package.json` (adds the `test` script only) |
| new | `docs/migrations/sec002_vendor_anon_lockdown.sql` (rev 4, not executed) |
| new | `docs/vendor-security-remediation.md` |
| new | `docs/sec002-deployment-readiness.md` (this file) |

**SEC-001: signed URLs, stores storage paths instead of public URLs**

| Status | File |
|---|---|
| new | `src/storageUtils.js` |
| modified | `src/HomeDashboard.jsx`, `src/LandlordApplications.jsx`, `src/LandlordInspection.jsx`, `src/LandlordMaintenance.jsx` (now includes the B1 fix), `src/LandlordTenantDetail.jsx`, `src/MaintenanceRequestForm.jsx`, `src/MoveInInspection.jsx` |
| modified | `src/TenantMaintenanceDetail.jsx` (B2 fix only; the file was unmodified before) |

**Security sprint: auth on `/api/*`, edge-function hardening (`docs/security-deployment-review.md`)**

| Status | File |
|---|---|
| new | `api/_lib/auth.js` (**SEC-002 depends on it**: service-role client, `timingSafeEqualStr`), `api/_lib/dispatchVendor.js`, `api/_lib/email.js` |
| modified | `api/classify-and-route.js`, `api/daily-recap.js`, `api/dispatch-vendor.js`, `api/send-email.js`, `api/sms-escalate.js`, `api/stripe-webhook.js` |
| modified | `src/MessagingScreen.jsx`, `src/notifications.js` (vendor emails pass `vendor_token`), `src/supabase.js` (`authHeaders`) |
| new | `supabase/functions/_shared/security.ts` |
| modified | `supabase/functions/{create-payment-intent, create-setup-intent, generate-vendor-token, invite-tenant, rent-reminders, search-vendors, send-email, stripe-connect-onboard, stripe-connect-verify, stripe-webhook}/index.ts` |
| new | `docs/security-deployment-review.md` |
| new | `.gitignore` (repo root; ignores `.env*`, `node_modules`, `dist`) |

**Unrelated and pre-existing: do not include in this release**

| Status | File |
|---|---|
| new | `ent001_migration_v4.sql`, `ent001_rls_tests_v4.sql` (ENT-001, a separate project) |

### 2.2 Why SEC-002 can't ship alone

- `api/vendor-ticket.js` and `api/vendor-verify-pin.js` import `api/_lib/auth.js`, which belongs to the sprint.
- `src/VendorTicket.jsx` and `src/VendorAccess.jsx` contain SEC-001, sprint and SEC-002 hunks together, and `VendorTicket.jsx` imports `src/notifications.js` from the sprint.
- Vercel deploys the whole tree (frontend and `api/*` together).

**So the release unit is SEC-001 + the sprint + SEC-002.** Commits can still be separated for history. Commit SEC-001 first, then the sprint, then SEC-002, and put the two vendor screens in the SEC-002 commit.

---

## 3. Verification results

### 3.1 Automated

| Check | Result |
|---|---|
| `npm test` (Node 24.16, `node --test`) | **48 / 48 pass**, 7 suites, 0 failures. Re-run after the B1/B2 fixes with the same result. |
| `npm run build` (Vite 8.0.14) | **Pass**, before and after the B1/B2 fixes. Warnings only: chunk size over 500 kB, and an ineffective dynamic import of `supabase.js`. Both existed before this change. |
| `eslint` on the two B1/B2 files | **No new findings from the fixes.** The 6 errors and 3 warnings ESLint still reports are all in code the fixes did not touch: unused variables, `set-state-in-effect` in the existing SEC-001 `LightboxView`/`SignedMaintenancePhoto`, and `exhaustive-deps`. |
| Secrets in the built bundle (`dist/assets/*.js`: `VENDOR_SESSION_SECRET`, `SERVICE_ROLE`, `sk_live`, `sk_test`, `whsec_`) | None found |
| Vercel function count | 8 in `api/*.js` (`_lib/` isn't routed). Within the Hobby plan's limit of 12. |

### 3.2 Code review of the SEC-002 files

| Area | Finding | Evidence |
|---|---|---|
| Session format and signature | HMAC-SHA256 over a base64url payload; compared in constant time; length checked before `timingSafeEqual`; input capped at 2048 chars; never throws on bad input. | `api/_lib/vendorSession.js:55-75` |
| Missing secret | Fails closed. Both endpoints return 500 before touching the database, and `verifyVendorSession` throws before validating anything. | `vendorSession.js:19-25,56`; `vendor-verify-pin.js:20-23`; `vendor-ticket.js:268-271` |
| Expiration | Sessions last 8 h, **capped at the vendor link's expiry**. Each request also re-checks the link expiry on the ticket. | `vendorSession.js:14,43-51`; `vendor-ticket.js:102-104` |
| Revocation | The session is bound to a hash of the vendor token. Reassigning the vendor (new token) invalidates old sessions. | `vendor-ticket.js:97-101` |
| PIN check | Server-side, constant-time, `^\d{4}$`. A 750 ms delay on failure. The PIN is never returned. The session is issued only after a correct PIN. | `vendor-verify-pin.js:25-62` |
| Ticket isolation | The ticket id **always comes from the verified session**; `ticket_id`, `id` and `request_id` in the body are ignored. Storage list and sign, upload paths and `invoice_path` are all restricted to the `<ticketId>/` folder, and traversal is rejected by a strict regex. | `vendor-ticket.js:9,87-106,214-224,247-251` |
| Authorization of actions | `Object.hasOwnProperty` check on the action map (rejects prototype keys). Every write except `accept_work_order` requires an accepted work order. State rules: quote allowed only before approval, complete only after approval. Statuses are set by the server (`quote_submitted`, `pending_review`), never taken from the client. Field allow-lists apply to every write. | `vendor-ticket.js:61-67,167-261,279-283` |
| Data exposure | The ticket view is an allow-list. `vendor_pin`, `vendor_token`, `tenant_id` and `unit_id` are never returned. `entry_instructions` appears only after the work order is accepted. Comments are limited to 5 fields. `preview` returns only `{valid, title}`. | `vendor-ticket.js:23-29,53-59,126-139` |
| Comments, quotes, acceptance, completion | Implemented server-side with audit comments (`author_type` and `author_name` set by the server). `accept_work_order` is idempotent. Text length limits apply. | `vendor-ticket.js:108-234` |
| Photo uploads | The server issues a signed upload URL for a server-chosen path (extension allow-list; `photo`/`quote`/`invoice` kinds gated by state). The browser PUTs directly to Storage with `x-upsert: false`. Photos are read through 10-minute signed URLs. | `vendor-ticket.js:141-165,236-252`; `src/vendorApi.js:69-78` |
| Client session handling | Stored in `sessionStorage` per tab; legacy `localStorage` keys are cleared. A 401 clears the session and returns the vendor to the PIN screen. | `src/vendorApi.js`; `VendorAccess.jsx:231,287`; `VendorTicket.jsx:76-85` |
| **No direct anonymous DB access** | `VendorAccess.jsx`, `VendorTicket.jsx` and `vendorApi.js` contain **no** `supabase`, `.from()`, `.storage` or `.rpc()` calls. The only remaining Supabase use on vendor routes is `supabase.functions.invoke("send-email")` for the two PM notifications. The edge function checks `vendor_token` with its admin client and limits recipients to the landlord addresses, so this is not table access. | grep of the three files; `src/notifications.js:8-18`; `supabase/functions/send-email/index.ts:31-47` |
| Behavior parity | Comments and photo listing cover the same scope as the old direct queries in HEAD (all comments on the ticket; the `<ticketId>/` folder). | `git show HEAD:tenant-portal/src/VendorTicket.jsx` |

No defects found in the SEC-002 files.

---

## 4. Release blockers (in SEC-001 code, not SEC-002): FIXED

SEC-001 now stores **bare storage paths** (`<ticketId>/…`) instead of public URLs: tenant photos in `MaintenanceRequestForm.jsx:127`, and vendor invoices in `api/vendor-ticket.js:226-230`. Two screens used the stored value directly as a URL. Both are now fixed. A repo-wide grep found no other place that renders `photos` or `invoice_url` without signing it.

| # | Defect | Fix applied |
|---|---|---|
| **B1** | In `src/LandlordMaintenance.jsx`, both invoice links ("View invoice photo →" in the detail panel and "View invoice →" in the review actions) rendered `<a href={selected.invoice_url}>`. A bare path resolved to an app route, so the landlord couldn't open a vendor's invoice. | New `SignedInvoiceLink` component, used for both links (styles and labels unchanged). **It signs on click, not on render**, so a page left open never serves an expired 10-minute URL. It opens a blank tab synchronously so pop-up blockers allow it, then points that tab at the signed URL (`opener` is cleared). The link shows "Opening invoice…" while it works and, on failure, closes the blank tab and shows "Could not open the invoice. Please try again." **Legacy values:** a full public URL is parsed back to a path and signed by `getSignedStorageUrl`; if signing fails, it falls back to the original public URL, which works while the bucket is public. Non-Supabase `http` URLs open as-is, matching the existing `SignedMaintenancePhoto`. |
| **B2** | In `src/TenantMaintenanceDetail.jsx`, the thumbnails and the lightbox rendered `<img src={url}>` straight from `ticket.photos`. Tenants saw broken images on new tickets. | **Each ticket load signs all of its photos once**, in parallel (`Promise.all`). The thumbnails and the lightbox reuse the same signed URLs, so there are no repeat signing requests per render or per lightbox step. Results are tied to the loaded ticket object, so stale results from an earlier ticket are never shown and an unmounted page ignores late results. Thumbnails show "…" while loading and "Unavailable" if signing fails; the lightbox shows "Photo unavailable". Legacy URLs get the same fallback as B1. |

**Caveats**

1. **Tenant signing depends on storage permissions.** `createSignedUrl` runs as the signed-in tenant, so a storage SELECT policy must let tenants read their own tickets' objects in `maintenance-photos`. The repository doesn't define it (`docs/security-deployment-review.md` §0). If it's missing:
   - New tenant photos show "Unavailable". Before the fix they showed as broken images, so this is not a regression.
   - Legacy public-URL photos still display through the fallback, but only until Part C makes the bucket private.

   Smoke test **T1** verifies this, and it must pass before Part C (precondition P4). The landlord side already depends on the equivalent landlord policy (SEC-001).
2. **The tenant page's signed URLs expire after 10 minutes.** If the page stays open longer, the images already loaded stay visible, but opening the lightbox on a photo the browser hasn't cached may fail until the page is reloaded. The landlord's invoice link doesn't have this problem because it signs on every click.
3. **Pop-up blocked.** If the browser blocks even the synchronous `window.open`, the invoice opens in the current tab instead.

---

## 5. Environment variables

### 5.1 New: `VENDOR_SESSION_SECRET` (Vercel)

| Property | Requirement |
|---|---|
| Where | Vercel → Project → Settings → Environment Variables. **Production** is required. Preview is needed only if vendor links are tested on preview deployments; use a different value there. |
| Minimum length | **32 characters.** The code checks `string.length >= 32`, counting characters, not bytes (`api/_lib/vendorSession.js:15,21`). |
| Recommended format | 48 random bytes, base64-encoded, giving **64 characters**. Generate with `openssl rand -base64 48` or `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`. |
| Do not | Do not prefix it with `VITE_`, since that would ship it to the browser. Don't add quotes, leading or trailing spaces, or a trailing newline. Don't reuse another secret such as `CRON_SECRET` or the service-role key. |
| If it's missing or too short | `/api/vendor-verify-pin` and `/api/vendor-ticket` return **500 "Vendor access is not configured"**. The vendor portal is down but nothing is exposed. |
| Rotation | Rotating it signs out every vendor; they re-enter the PIN. Vercel needs a redeploy to pick up a new value. |

### 5.2 Existing variables the vendor flow depends on

| Platform | Variable | Used by |
|---|---|---|
| Vercel (runtime) | `SUPABASE_SERVICE_ROLE_KEY` | `api/_lib/auth.js`: every vendor database and storage call |
| Vercel (runtime) | `SUPABASE_URL` **or** `VITE_SUPABASE_URL` | `api/_lib/auth.js:11` |
| Vercel (build time) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Frontend client. On vendor routes it's used only for the `send-email` edge-function call. |
| Supabase Edge secrets | `RESEND_API_KEY` | Vendor "quote received" and "completed" emails (edge `send-email`) |
| Supabase Edge secrets | `ALLOWED_ORIGINS` (optional) | CORS for edge `send-email`. Defaults to `getmodusam.com` (with and without `www`) and localhost. **Add any other origin the vendor links are served from** (e.g. `*.vercel.app`), or vendor notifications will fail CORS. |
| Supabase Edge secrets | `LANDLORD_NOTIFY_EMAILS` (optional) | The default already includes `capitalpathwaysapw@gmail.com`, the recipient hardcoded in `src/notifications.js:3`. |

The release as a whole also needs the sprint's variables. These are **outside SEC-002 but required for this release**; see `docs/security-deployment-review.md` §4.1 and §4.3:

- `CRON_SECRET` (new)
- `STRIPE_WEBHOOK_SECRET` on whichever platform Stripe actually targets
- `RESEND_API_KEY`
- `OPENAI_API_KEY`
- the rent-reminders cron header

---

## 6. Deployment checklist

### 6.1 Files that must be in the deployment

- **Vercel:**
  - all of `tenant-portal/` except `node_modules`/`dist`, including every SEC-001, sprint and SEC-002 file in §2.1
  - specifically the untracked files: `api/vendor-ticket.js`, `api/vendor-verify-pin.js`, `api/_lib/*.js`, `src/vendorApi.js`, `src/storageUtils.js`
  - `vercel.json` (unchanged)
- **Supabase Edge Functions:** the ten functions in §2.1, plus `_shared/security.ts`, which is bundled automatically. Keep `--no-verify-jwt` on `stripe-webhook`. Deploy nothing from `src/supabase/` or `supabase/generate-vendor-token/` (duplicates).
- **Not deployed:** `docs/**`, `tests/**`, `ent001_*.sql`.

### 6.2 Pre-deploy

- [x] Fix **B1** and **B2** (§4). `npm test` and `npm run build` re-run and pass. The owner should review the diff before committing.
- [ ] Confirm `maintenance_requests.vendor_token` holds **at least 24 characters**. The sprint generates 24-character tokens, and 12-character tokens existed before. This can be read in the Supabase Table Editor's column definition; no SQL is needed. If the column is shorter, new vendor links fail (`docs/security-deployment-review.md` §4.2).
- [ ] Set `VENDOR_SESSION_SECRET` (§5.1) and the sprint variables (§5.2).
- [ ] Set `ALLOWED_ORIGINS` if the app is served from any origin other than the defaults.
- [ ] Owner commits in this order: SEC-001, then the sprint, then SEC-002. Exclude `ent001_*`. (Not done here.)

### 6.3 Order

1. **Set environment variables** (Vercel and Supabase) before any deploy.
2. **Deploy Vercel.** Frontend and `api/*` ship together. The database still allows the old anonymous path, so vendors who already have the page open aren't cut off; they reload into the new flow.
3. **Deploy the Edge Functions** (`docs/security-deployment-review.md` §4.4). Vendor notifications work with the old and the new edge `send-email`.
4. **Smoke test** (§7). Stop here if any vendor test fails. Rollback is code-only: promote the previous Vercel deployment.
5. **Migration rev 4, only once step 4 passes:** run PART 0R (save the output), then PART A, PART S, PART B, PART S. Then repeat smoke tests V1–V8 and run the anon `curl` checks in PART S.
6. **Rotate vendor links on open tickets** (assume old tokens and PINs are exposed).
7. **PART C** (make the bucket private), only after landlord, tenant and vendor photos and invoices all display via signed URLs in production (P4), then PART S.

---

## 7. Production smoke tests

Use a private window for the vendor tests. Watch the Vercel function logs.

| # | Test | Expected |
|---|---|---|
| V1 | Open `/vendor/<token>` | PIN screen shows the title. In DevTools → Network: `POST /api/vendor-ticket` (`preview`) only, **no `*.supabase.co/rest/v1` requests**. |
| V2 | Wrong PIN; then a token with one character changed | "Incorrect PIN" after about 0.75 s; then "Link expired or invalid". |
| V3 | Correct PIN | Work-order screen. The `get` response has no `vendor_pin` or `vendor_token`, and no entry instructions. |
| V4 | Sign the work order | Ticket page; entry instructions now visible; the landlord sees the "Work order accepted…" comment. |
| V5 | Upload a photo; post a comment | The photo appears (signed URL). The comment is visible to the landlord. |
| V6 | Submit a quote with a photo | Status `quote_submitted`. The landlord gets the "Quote received" email. |
| V7 | Landlord approves; vendor marks complete with an invoice | Status `pending_review`. The landlord gets the "completed" email. |
| V8 | Landlord clicks "View invoice" (both the detail panel and the pending-review actions) | A new tab opens the invoice via a `…/object/sign/maintenance-photos/…` URL (B1). Also open the invoice on a ticket completed before deploy (legacy URL). |
| V9 | Edit one character of `vendor_session:<token>` in `sessionStorage`, then reload | Back to the PIN screen. |
| V10 | Landlord reassigns the vendor; the old vendor tab reloads | Back to the PIN screen; the old link is invalid. |
| V11 | `curl -X POST https://<domain>/api/vendor-ticket -H 'Content-Type: application/json' -d '{"action":"get"}'` | **401** |
| T1 | Tenant creates a request with photos and opens it; open the lightbox and step through; also open a ticket created before deploy | Thumbnails and lightbox display via signed URLs (B2), on new and legacy tickets alike. "Unavailable" means the tenant storage SELECT policy is missing (§4, caveat 1). **Must pass before Part C.** |
| L1 | Landlord views ticket photos and comments, and the legacy ticket photos | They display. |

The sprint's own smoke tests (payments, webhook, cron, emails) are in `docs/security-deployment-review.md` §4.5.

---

## 8. Remaining material risks

1. **B1 and B2 are fixed** (§4). What remains is the tenant storage-policy dependency (§4, caveat 1), which is verified by T1 and must pass before Part C.
2. **Mixed release.** SEC-002 ships together with the security sprint, which changes auth on every `/api/*` route and edge function. A sprint regression (e.g. a wrong `STRIPE_WEBHOOK_SECRET`) would roll back SEC-002 with it. Mitigation: run the sprint's smoke tests immediately after deploy.
3. **The database is still exposed until the migration runs.** Deploying the code alone removes nothing. Anonymous table and bucket access remains until Parts A and B are applied, and public-URL reads remain until Part C.
4. **PIN brute force.** There's a 750 ms delay but no per-token lockout or rate limit, so parallel requests are not throttled. The 24-character random token is the main secret, and the PIN is a second factor. This is accepted and documented as out of scope (migration N4).
5. **`vendor_token` column length** isn't known from the repo (§6.2).
6. **Signed uploads after Part B** rely on Supabase Storage applying the service-role permissions behind signed upload URLs. Verify with V5 immediately after Part B.
7. **Existing vendor links and PINs** should be treated as compromised and rotated after the migration (§6.3 step 6).
8. **The SEC-002 doc is inaccurate**: `docs/vendor-security-remediation.md` §1 lists `api/vendor-verify-pin.js` as "modified", but it is untracked. If production deploys from git, it doesn't have this endpoint today. No functional impact, as long as the file is included in the deployment.
