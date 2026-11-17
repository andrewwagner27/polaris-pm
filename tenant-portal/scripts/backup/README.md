# Modus nightly backup (source copy)

Reference copy of the scripts that run from `C:\Modus-dev\db-backups\` (Task Scheduler `\Modus\Modus PM nightly backup`,
daily 02:00). The live copy is the one that runs; this folder exists so the scripts are versioned and can be
reinstalled on another PC. Procedure, recovery runbooks and verification results: `docs/launch/backup-and-recovery.md`.

Contains no credentials. The database password and the off-device passphrase live only in DPAPI files under
`C:\Modus-dev\db-backups\secrets\` (created by `set-backup-secrets.ps1`). Never commit dumps, archives, `secrets\`,
`state\` or `logs\`.

Reinstall: copy these files to `C:\Modus-dev\db-backups\` (tools\restore-verify.mjs into `tools\`), run
`set-backup-secrets.ps1`, link the Supabase CLI in `db-backups\cli`, `initdb` the restore cluster in
`restore-test\pgdata` (port 55432, 127.0.0.1 only), then recreate the scheduled task as described in the doc.
