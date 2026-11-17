# Modus PM backup and recovery (Supabase Free plan)

Supabase Free has no platform backups or point-in-time recovery, so Modus is backed up from the operator's laptop.
Everything below is **read-only against production**. No secrets are stored in this document or in Git.

Source copy of the scripts (no secrets): `tenant-portal/scripts/backup/`. The live copy in `C:\Modus-dev\db-backups\` is the one that runs.

## What is backed up, where, and when

| Item | How | Local location (outside every repo) |
|---|---|---|
| Database: all schemas incl. `public`, `auth` (logins), `storage` (file index), cron job definitions | `pg_dump` 17 custom format, read-only | `C:\Modus-dev\db-backups\daily\<YYYY-MM-DD_HHMMSS>\modus-db.dump` |
| Storage files: `lease-documents`, `insurance-docs`, `screening-reports`, `inspection-photos`, `maintenance-photos` (all private) | Supabase CLI download (`storage cp -r`, linked project in `db-backups\cli`), paths preserved as `storage\<bucket>\<path>` | same set folder, `storage\` |
| File metadata for recovery | `storage-objects.csv` (bucket, path, size, eTag, MIME type, timestamps, read in a read-only transaction) + `storage-manifest.csv` (size, MD5, SHA-256 of each downloaded file) | same set folder |
| Proof | `restore-report.json`, `restore-verify.txt`, `SHA256SUMS.txt`, `BACKUP-OK.json` | same set folder |
| Encrypted off-device copy | `tar` + `gpg --symmetric AES256`, test-decrypted before copying | OneDrive: `<OneDrive>\Modus-Backups-Encrypted\db\` and `\storage\` |

- **Schedule:** Task Scheduler `\Modus\Modus PM nightly backup`, daily 02:00. It runs as the operator's Windows account, only while
  that account is signed in (no stored Windows password). It wakes the PC if allowed, and runs at the next opportunity if 02:00 was
  missed (asleep, off, offline). Restarts up to 3× (30 min apart). Max 2 h. A second copy never runs at the same time
  (`Global\ModusPMNightlyBackup` lock; exit 3).
- **Retention:** 14 newest valid daily sets + 4 weekly sets (one every 7 days). Off-device: 14 newest DB archives + one
  per week for 4 weeks. Storage archives are uploaded only when files changed; the 3 newest are kept.
  **Only sets containing `BACKUP-OK.json` count.** Old sets are deleted only after a new set has been sealed and enough
  newer valid sets remain, so a failed or partial run can never cause the last good backup to be removed. Failed runs
  are renamed `failed-<id>`; the 5 newest are kept for diagnosis.
- **Access:** `C:\Modus-dev\db-backups` is restricted to the operator account, SYSTEM and Administrators (inheritance removed).
  The DB password and the off-device passphrase are stored with Windows DPAPI (`secrets\*.dpapi`): only that Windows user on this PC can
  decrypt them. **The off-device passphrase must also be in your password manager.** Without it the OneDrive copies can't be opened.

## Each nightly run, in order (any failure stops the run; nothing is promoted)
1. Preconditions: tools present, secrets present, 2 GB+ free.
2. `pg_dump` → size ≥ 200 KB, `pg_restore -l` readable, 80+ table-data entries, includes tenants, maintenance requests, auth users, storage objects.
3. Storage metadata (read-only transaction) → download every bucket → **every object present, same size, MD5 = Supabase eTag, no extra files**.
4. **Restore test**: the dump is restored into an isolated local PostgreSQL (`127.0.0.1:55432`, data dir
   `db-backups\restore-test\pgdata`, started only for the test) by `tools\restore-verify.mjs`, which refuses any other target.
   Checks: no unexpected restore errors; every table; every foreign key; every RLS policy; every function; **every row
   identical to the archive** (sorted SHA-256 per table); no orphaned rows in properties → units → tenants → auth users,
   maintenance → tenants, objects → buckets. The test database is dropped afterwards.
5. Seal: `SHA256SUMS.txt`, `BACKUP-OK.json`, rename to the final folder. Weekly copy. Retention.
6. Encrypt + test-decrypt + copy to OneDrive.

Expected restore errors (classified automatically): `pg_cron`, `pg_net`, `supabase_vault` objects. These are
Supabase-only extensions that don't exist in plain PostgreSQL. In a real Supabase project they already exist.

## How to recognize a failure
- `C:\Modus-dev\db-backups\state\BACKUP-ALERT.txt` exists → the last run failed or had warnings (reason inside). It is removed by the next fully OK run.
- A Windows notification "Modus backup FAILED" / "Modus backup: warning".
- `state\last-run.json`: `status` = `OK` / `OK_WITH_WARNINGS` / `FAILED`, plus `newestValidSet`.
- `logs\backup-YYYY-MM.log`: one line per step; `ERROR` / `WARN` lines say why.
- Task Scheduler → `\Modus\` → Last Run Result: `0x0` OK, `0x1` failed, `0x2` OK locally but the off-device copy failed, `0x3` overlap.
- A run also warns when the newest valid set is more than 36 h old.
- **Weekly habit (Sunday):** open `state\last-run.json`; confirm `newestValidSet` is from last night.

## Recovery: database
Never restore over production. Recovery means a **new** Supabase project (or a local database) built from a set.
1. Pick the newest folder in `daily\` (or `weekly\`) that contains `BACKUP-OK.json`. Off-device: decrypt with
   `gpg --decrypt modus-<id>-db.tar.gpg > db.tar` (passphrase from your password manager), then `tar -xf db.tar`.
2. Check integrity: compare `SHA256SUMS.txt` with `Get-FileHash`.
3. Inspect locally first (optional): `node C:\Modus-dev\db-backups\tools\restore-verify.mjs <set>\modus-db.dump report.json --keep`
   gives a restored copy in `modus_restore_check` on `127.0.0.1:55432`.
4. Into a new Supabase project (decision for the operator): `pg_restore --no-owner --no-acl -d "<new project session-pooler URI>" modus-db.dump`.
   The roles and extensions already exist there. Then re-point the app (`VITE_SUPABASE_URL`/keys in Vercel, Edge
   Function secrets, Auth URL settings) and redeploy the Edge Functions.
5. Partial recovery (one table or row): restore to the local check database with `--keep`, export the needed rows, and re-insert them deliberately.

## Recovery: Storage files
1. Take `storage\<bucket>\<path>` from the set, or decrypt the newest `storage\modus-*-storage-*.tar.gpg` from OneDrive.
2. Check the file against `storage-manifest.csv` (SHA-256).
3. Upload to the same bucket and path (Dashboard → Storage, or `supabase storage cp <file> ss:///<bucket>/<path> --linked --experimental`).
   Buckets stay **private**; paths must match `storage.objects.name`, because the app stores those paths (e.g. `tenants.lease_document_url`).
4. Use `storage-objects.csv` for the original MIME type when uploading.

## Remaining risks
- The backup runs on one laptop: if it is off or asleep for days, no backups happen (the 36 h warning and alert file
  make that visible). The OneDrive copy covers loss of the laptop.
- The CLI login (Storage download) can expire; the run then fails at the storage step with a clear message → `supabase login`.
- The DB password: if it is reset in Supabase, re-run `set-backup-secrets.ps1`.
- Older ad-hoc dumps from 2026-11-03 to 11-09 exist **unencrypted** in `C:\Modus-backups\` (outside this system, not managed by it).
- Supabase-managed internals (Vault secrets, `pg_net` queue, Realtime, Edge Function code/secrets, Auth settings) are not in
  a database dump. Edge Function code is in Git; secrets live in Vercel/Supabase and your password manager.

### Decrypting an off-device copy by hand
Use Git's gpg: `"C:\Program Files\Git\usr\bin\gpg.exe" --output db.tar --decrypt modus-<id>-db.tar.gpg` and type the
passphrase from your password manager exactly. Then extract with `tar -xf db.tar`. The script passes the passphrase as exact UTF-8 bytes,
so the key is exactly what you type (verified 2026-11-16, see below).

## Verification results (2026-11-16)
| Check | Result |
|---|---|
| Credentials | DB password + off-device passphrase entered by the operator in a local prompt, stored with DPAPI; never shown to Claude, logs or Git |
| Database backup (run via Task Scheduler) | PASS: 0.82 MB, 98 table-data entries, 1,420 archive entries, ≈15 s |
| Restore test of that backup (isolated 127.0.0.1:55432) | PASS 8/8: 88 tables, 108/108 foreign keys, 99/99 RLS policies, 102/102 functions, **814 rows in 86 tables identical to the archive**, 0 orphans; 11 restore errors, all Supabase-only extensions (expected). Restored: 4 tenants, 14 maintenance requests, 5 auth users |
| Storage backup | PASS: 50 objects, 106.5 MB, every file's size and MD5 matched Supabase's metadata; all 50 opened (images decoded, PDFs have valid headers). `lease-documents`, `screening-reports`, `inspection-photos` are currently empty |
| Scheduled task | PASS: started from Task Scheduler, ran hidden, result 0x0 (≈75 s); started and stopped the local test cluster itself; next run 02:00 |
| Failure handling | PASS: no password → FAILED + alert; simulated `pg_dump` failure (invalid host, prod not contacted), simulated storage failure, and a truncated dump in the restore test all → exit 1, alert file, notification, set kept as `failed-*`, **newest valid set unchanged** |
| Overlap | PASS: a second run while the lock was held exited 3 without doing anything |
| Retention | PASS (with fake old sets, then removed): 18 valid daily → 14 newest kept; 6 weekly → 4 kept; off-device 18 → 14 newest + 1 weekly keeper; an unsealed folder and failed sets untouched |
| Off-device copy | PASS after a fix: the first copies were encrypted with stray line-ending bytes in the passphrase, so a human couldn't decrypt them. The script now passes exact bytes. The new copies were decrypted independently with the plain passphrase: 50/50 storage files and 12/12 DB-set files match SHA-256; the dump is readable. The unreliable copies were deleted after the replacements were verified |
| Access control | PASS: dumps and secrets readable only by the operator account, SYSTEM, Administrators |

Size: ≈108 MB per local set (≈2 GB at full retention); off-device ≈1 MB per night, plus ≈107 MB only when Storage files change.

## Operating notes
- **Sleep/battery:** Windows wake timers are enabled on AC power only. On battery, a sleeping laptop isn't woken; the task runs
  as soon as it wakes ("run when available"). If you are **signed out** (not just locked), the task waits until you sign in.
- Keep the laptop plugged in overnight during the pilot for on-time backups.
