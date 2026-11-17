# Modus PM nightly backup: database (pg_dump) + Supabase Storage files, restore-verified, rotated, encrypted off-device copy.
# Runs from Task Scheduler ("Modus PM nightly backup", 02:00) via run-backup-hidden.vbs, or by hand:
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\Modus-dev\db-backups\backup-modus.ps1
# READ-ONLY against production: pg_dump, one SELECT on storage.objects (read-only transaction), Storage downloads.
# Never restores anywhere except the local test cluster on 127.0.0.1:55432 (tools\restore-verify.mjs enforces this).
# Secrets: secrets\*.dpapi (Windows DPAPI, this user only), created by set-backup-secrets.ps1. Never printed or logged.
# Exit codes: 0 OK - 1 FAILED (no new valid backup) - 2 OK locally but off-device copy failed/skipped - 3 another run active.
param(
  [ValidateSet('', 'dump', 'storage', 'verify')] [string]$SimulateFailure = '',  # test the failure path without touching prod
  [switch]$SkipOffsite
)
$ErrorActionPreference = 'Stop'
$Root      = $PSScriptRoot
$Bin       = 'C:\Program Files\PostgreSQL\17\bin'
$Gpg       = 'C:\Program Files\Git\usr\bin\gpg.exe'
$Tar       = "$env:WINDIR\System32\tar.exe"
$Node      = (Get-Command node -ErrorAction SilentlyContinue).Source
$Daily     = Join-Path $Root 'daily'
$Weekly    = Join-Path $Root 'weekly'
$Logs      = Join-Path $Root 'logs'
$State     = Join-Path $Root 'state'
$Secrets   = Join-Path $Root 'secrets'
$PgData    = Join-Path $Root 'restore-test\pgdata'
$OneDrive  = (Get-ItemProperty 'HKCU:\Software\Microsoft\OneDrive\Accounts\Personal' -ErrorAction SilentlyContinue).UserFolder
$Offsite   = if ($OneDrive) { Join-Path $OneDrive 'Modus-Backups-Encrypted' } else { $null }
$KeepDaily = 14; $KeepWeekly = 4; $KeepOffsiteStorage = 3; $KeepFailed = 5
$Db = @{ PGHOST = 'aws-1-us-east-2.pooler.supabase.com'; PGPORT = '5432'; PGDATABASE = 'postgres'; PGUSER = 'postgres.ynbxdbwxdydbpkzaffte'; PGSSLMODE = 'require'; PGCONNECT_TIMEOUT = '30' }
$Buckets   = @('lease-documents', 'insurance-docs', 'screening-reports', 'inspection-photos', 'maintenance-photos')
foreach ($d in $Daily, $Weekly, $Logs, $State) { New-Item -ItemType Directory -Force $d | Out-Null }

$RunId   = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$LogFile = Join-Path $Logs ("backup-{0}.log" -f (Get-Date -Format 'yyyy-MM'))
$Stage   = Join-Path $Daily ".incomplete-$RunId"
$warnings = New-Object System.Collections.ArrayList
function Log([string]$m, [string]$lvl = 'INFO') { $line = "{0} [{1}] {2} {3}" -f (Get-Date -Format 's'), $RunId, $lvl, $m; Add-Content $LogFile $line; Write-Host $line }
function Fail([string]$m) { throw [Exception]::new($m) }
function Notify([string]$title, [string]$text) {
  try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    $x = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $t = $x.GetElementsByTagName('text'); $t.Item(0).AppendChild($x.CreateTextNode($title)) | Out-Null; $t.Item(1).AppendChild($x.CreateTextNode($text)) | Out-Null
    $app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($x))
  } catch { Log "toast failed: $($_.Exception.Message)" 'WARN' }
}
function Unprotect([string]$file) {
  $s = Get-Content $file -TotalCount 1 | ConvertTo-SecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
# Run a native tool; stdout/stderr go to files (never the console log, so no data or secrets leak into logs).
function Exec([string]$exe, [string[]]$argv, [string]$outFile, [string]$errFile, [hashtable]$envVars = @{}, [string]$stdin = $null) {
  $psi = New-Object Diagnostics.ProcessStartInfo $exe
  $psi.Arguments = ($argv | ForEach-Object { if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } }) -join ' '
  $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true; $psi.WorkingDirectory = (Get-Location).ProviderPath
  $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true; $psi.RedirectStandardInput = [bool]$stdin
  foreach ($k in @($psi.EnvironmentVariables.Keys)) { if ($k -match '^PG') { $psi.EnvironmentVariables.Remove($k) } }
  foreach ($k in $envVars.Keys) { $psi.EnvironmentVariables[$k] = $envVars[$k] }
  $p = [Diagnostics.Process]::Start($psi)
  # exact bytes: UTF-8 without BOM, LF only (gpg strips the LF) -> the key is exactly the passphrase a person would type
  if ($stdin) { $bytes = [Text.UTF8Encoding]::new($false).GetBytes($stdin + "`n"); $p.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length); $p.StandardInput.BaseStream.Flush(); $p.StandardInput.Close(); $bytes = $null }
  $o = $p.StandardOutput.ReadToEndAsync(); $e = $p.StandardError.ReadToEndAsync(); $p.WaitForExit()
  if ($outFile) { [IO.File]::WriteAllText($outFile, $o.Result) }
  if ($errFile) { [IO.File]::WriteAllText($errFile, $e.Result) }
  return $p.ExitCode
}
function ValidSets([string]$dir) { Get-ChildItem $dir -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike '.*' -and $_.Name -notlike 'failed-*' -and (Test-Path (Join-Path $_.FullName 'BACKUP-OK.json')) } | Sort-Object Name }

# ---- single instance ----
$mutex = New-Object Threading.Mutex($false, 'Global\ModusPMNightlyBackup')
if (-not $mutex.WaitOne(0)) { Log 'another backup run is still active; this run exits without doing anything' 'WARN'; exit 3 }

$status = 'FAILED'; $exitCode = 1; $failure = $null; $sw = [Diagnostics.Stopwatch]::StartNew(); $startedPg = $false
try {
  Log "=== backup start (simulate failure: '$SimulateFailure') ==="
  $newest = ValidSets $Daily | Select-Object -Last 1
  if ($newest) { $age = (Get-Date) - $newest.CreationTime; if ($age.TotalHours -gt 36) { [void]$warnings.Add("newest valid backup was $([int]$age.TotalHours) h old before this run") } }

  # ---- preconditions ----
  foreach ($t in "$Bin\pg_dump.exe", "$Bin\pg_restore.exe", "$Bin\psql.exe", "$Bin\pg_ctl.exe") { if (-not (Test-Path $t)) { Fail "missing tool: $t" } }
  if (-not $Node) { Fail 'node.exe not found (needed for the restore check)' }
  $pwFile = Join-Path $Secrets 'db-password.dpapi'
  if (-not (Test-Path $pwFile)) { Fail 'database password not configured: run set-backup-secrets.ps1 (secrets\db-password.dpapi missing)' }
  $free = (Get-PSDrive ($Root.Substring(0, 1))).Free
  if ($free -lt 2GB) { Fail ("less than 2 GB free on the backup drive ({0:N1} GB)" -f ($free / 1GB)) }
  New-Item -ItemType Directory -Force $Stage | Out-Null
  $dbEnv = $Db.Clone(); $dbEnv['PGPASSWORD'] = Unprotect $pwFile

  # ---- 1. database ----
  $dump = Join-Path $Stage 'modus-db.dump'
  $dumpArgs = @('--format=custom', '--compress=6', '--lock-wait-timeout=60000', '--exclude-table-data=storage.buckets_vectors', '--exclude-table-data=storage.vector_indexes', "--file=$dump")
  if ($SimulateFailure -eq 'dump') { $dbEnv['PGHOST'] = 'invalid.localhost.test' }
  $code = Exec "$Bin\pg_dump.exe" $dumpArgs $null (Join-Path $Stage 'pg_dump.stderr.txt') $dbEnv
  if ($code -ne 0) { $why = (Get-Content (Join-Path $Stage 'pg_dump.stderr.txt') -Raw) -replace '\s+', ' '; Fail "pg_dump exit ${code}: $($why.Substring(0, [Math]::Min(300, $why.Length)))" }
  $size = (Get-Item $dump).Length
  if ($size -lt 200KB) { Fail "database dump suspiciously small ($size bytes)" }
  $code = Exec "$Bin\pg_restore.exe" @('-l', $dump) (Join-Path $Stage 'modus-db.toc.txt') (Join-Path $Stage 'pg_restore-list.stderr.txt')
  if ($code -ne 0) { Fail 'database dump is unreadable (pg_restore -l failed): incomplete or corrupt' }
  $toc = Get-Content (Join-Path $Stage 'modus-db.toc.txt')
  $dataEntries = @($toc | Where-Object { $_ -match ' TABLE DATA ' }).Count
  foreach ($must in ' TABLE DATA public tenants ', ' TABLE DATA public maintenance_requests ', ' TABLE DATA auth users ', ' TABLE DATA storage objects ') {
    if (-not ($toc | Where-Object { $_ -like "*$must*" })) { Fail "dump is missing$must" }
  }
  if ($dataEntries -lt 80) { Fail "dump has only $dataEntries table-data entries (expected 80+)" }
  Log ("database dump OK: {0:N2} MB, {1} table-data entries" -f ($size / 1MB), $dataEntries)

  # ---- 2. storage metadata (read-only transaction) ----
  $metaCsv = Join-Path $Stage 'storage-objects.csv'
  $metaSql = "\copy (select bucket_id, name, (metadata->>'size')::bigint as size, replace(metadata->>'eTag','""','') as etag, metadata->>'mimetype' as mimetype, created_at, updated_at from storage.objects order by bucket_id, name) to '$($metaCsv -replace '\\','/')' with csv header"
  $code = Exec "$Bin\psql.exe" @('-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', 'begin transaction read only', '-c', $metaSql, '-c', 'commit') $null (Join-Path $Stage 'psql-meta.stderr.txt') $dbEnv
  $dbEnv['PGPASSWORD'] = $null; $dbEnv = $null
  if ($code -ne 0) { Fail 'could not read storage.objects metadata (psql failed; see psql-meta.stderr.txt in the failed set)' }
  $objects = @(Import-Csv $metaCsv)
  Log "storage metadata: $($objects.Count) objects"

  # ---- 3. storage files (Supabase CLI, linked project in cli\; uses the CLI login, read-only downloads) ----
  $storeDir = Join-Path $Stage 'storage'; New-Item -ItemType Directory -Force $storeDir | Out-Null
  Push-Location (Join-Path $Root 'cli')
  try {
    foreach ($b in $Buckets) {
      if (-not ($objects | Where-Object bucket_id -eq $b)) { continue }
      $rel = "../daily/.incomplete-$RunId/storage/$b"
      if ($SimulateFailure -eq 'storage') { $rel = "ss:///no-such-bucket-simulated" }
      $code = Exec 'cmd.exe' @('/c', 'supabase', 'storage', 'cp', '-r', "ss:///$b", $rel, '--linked', '--experimental') $null (Join-Path $Stage "storage-$b.stderr.txt")
      if ($code -ne 0) { Fail "storage download failed for bucket $b (exit $code)" }
    }
  } finally { Pop-Location }
  $unknown = @($objects | Where-Object { $Buckets -notcontains $_.bucket_id } | Select-Object -ExpandProperty bucket_id -Unique)
  if ($unknown.Count) { [void]$warnings.Add("new bucket(s) not in the backup list: $($unknown -join ', ')") }
  # verify every object: present, same size, MD5 = eTag (single-part uploads); no extras
  $manifest = New-Object System.Collections.ArrayList; $bad = New-Object System.Collections.ArrayList
  foreach ($o in ($objects | Where-Object { $Buckets -contains $_.bucket_id })) {
    $f = Join-Path $storeDir (Join-Path $o.bucket_id ($o.name -replace '/', '\'))
    if (-not (Test-Path -LiteralPath $f)) { if ($o.name -like '*.emptyFolderPlaceholder') { continue }; [void]$bad.Add("missing $($o.bucket_id)/$($o.name)"); continue }
    $len = (Get-Item -LiteralPath $f).Length
    $md5 = (Get-FileHash -LiteralPath $f -Algorithm MD5).Hash.ToLower()
    $sha = (Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLower()
    if ($o.size -and [int64]$o.size -ne $len) { [void]$bad.Add("size differs $($o.bucket_id)/$($o.name)") }
    elseif ($o.etag -and $o.etag -notmatch '-' -and $o.etag.ToLower() -ne $md5) { [void]$bad.Add("checksum differs $($o.bucket_id)/$($o.name)") }
    [void]$manifest.Add([pscustomobject]@{ bucket = $o.bucket_id; path = $o.name; size = $len; md5 = $md5; sha256 = $sha; mimetype = $o.mimetype; created_at = $o.created_at; updated_at = $o.updated_at })
  }
  $localCount = @(Get-ChildItem $storeDir -Recurse -File).Count
  if ($localCount -ne $manifest.Count) { [void]$bad.Add("downloaded $localCount files but expected $($manifest.Count)") }
  if ($bad.Count) { Fail ("storage verification failed: {0} problem(s), first: {1}" -f $bad.Count, $bad[0]) }
  $manifest | Export-Csv (Join-Path $Stage 'storage-manifest.csv') -NoTypeInformation -Encoding UTF8
  $storeBytes = ($manifest | Measure-Object size -Sum).Sum
  Log ("storage OK: {0} files, {1:N1} MB, every size and checksum matches Supabase" -f $manifest.Count, ($storeBytes / 1MB))

  # ---- 4. restore test into the isolated local cluster ----
  $ready = Exec "$Bin\pg_isready.exe" @('-h', '127.0.0.1', '-p', '55432') $null $null
  if ($ready -ne 0) {
    Start-Process "$Bin\pg_ctl.exe" -ArgumentList @('-D', "`"$PgData`"", '-l', "`"$(Join-Path $Root 'restore-test\postgres.log')`"", 'start') -WindowStyle Hidden
    $startedPg = $true
    for ($i = 0; $i -lt 30 -and (Exec "$Bin\pg_isready.exe" @('-h', '127.0.0.1', '-p', '55432') $null $null) -ne 0; $i++) { Start-Sleep 1 }
  }
  $verifyTarget = $dump
  if ($SimulateFailure -eq 'verify') { $verifyTarget = Join-Path $Stage 'truncated.dump'; $bytes = [IO.File]::ReadAllBytes($dump); [IO.File]::WriteAllBytes($verifyTarget, $bytes[0..([int]($bytes.Length / 2))]) }
  $code = Exec $Node @((Join-Path $Root 'tools\restore-verify.mjs'), $verifyTarget, (Join-Path $Stage 'restore-report.json')) (Join-Path $Stage 'restore-verify.txt') (Join-Path $Stage 'restore-verify.stderr.txt')
  if ($SimulateFailure -eq 'verify') { Remove-Item $verifyTarget -Force }
  if ($code -ne 0) { Fail 'restore test FAILED: the dump did not restore cleanly into the local test database (see restore-verify.txt)' }
  $rep = Get-Content (Join-Path $Stage 'restore-report.json') -Raw | ConvertFrom-Json
  Log ("restore test OK: {0} checks passed; tenants={1} maintenance_requests={2} auth.users={3}" -f $rep.checks.Count, $rep.summary.'public.tenants', $rep.summary.'public.maintenance_requests', $rep.summary.'auth.users')

  # ---- 5. seal the set ----
  $sums = Get-ChildItem $Stage -Recurse -File | ForEach-Object { '{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.FullName.Substring($Stage.Length + 1) }
  Set-Content (Join-Path $Stage 'SHA256SUMS.txt') $sums -Encoding UTF8
  $okInfo = [ordered]@{ id = $RunId; finished = (Get-Date -Format o); dbDumpBytes = $size; tableDataEntries = $dataEntries; storageFiles = $manifest.Count; storageBytes = $storeBytes; restoreChecks = $rep.checks.Count; rowCounts = $rep.summary; pgDump = (& "$Bin\pg_dump.exe" --version) }
  $okInfo | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $Stage 'BACKUP-OK.json') -Encoding UTF8
  $final = Join-Path $Daily $RunId
  Rename-Item $Stage $final
  $Stage = $null
  Log "backup set sealed: $final"
  $status = 'OK'; $exitCode = 0

  # ---- 6. weekly copy (one per 7 days) ----
  $lastWeekly = ValidSets $Weekly | Select-Object -Last 1
  if (-not $lastWeekly -or ((Get-Date) - $lastWeekly.CreationTime).TotalDays -ge 6.5) {
    Copy-Item $final (Join-Path $Weekly $RunId) -Recurse
    Log "weekly copy created: weekly\$RunId"
  }

  # ---- 7. retention (only valid sets count; nothing is removed unless enough newer valid sets remain) ----
  foreach ($pair in @(@($Daily, $KeepDaily), @($Weekly, $KeepWeekly))) {
    $sets = @(ValidSets $pair[0])
    if ($sets.Count -gt $pair[1]) {
      foreach ($old in $sets[0..($sets.Count - $pair[1] - 1)]) { Remove-Item $old.FullName -Recurse -Force; Log "retention: removed $($old.FullName)" }
    }
  }

  # ---- 8. encrypted off-device copy (OneDrive) ----
  if ($SkipOffsite) { [void]$warnings.Add('off-device copy skipped by parameter') }
  elseif (-not $Offsite) { [void]$warnings.Add('off-device copy skipped: OneDrive folder not found') }
  elseif (-not (Test-Path (Join-Path $Secrets 'offsite-passphrase.dpapi'))) { [void]$warnings.Add('off-device copy skipped: passphrase not configured (run set-backup-secrets.ps1)') }
  elseif (-not (Test-Path $Gpg)) { [void]$warnings.Add("off-device copy skipped: $Gpg not found") }
  else {
    try {
      $pass = Unprotect (Join-Path $Secrets 'offsite-passphrase.dpapi')
      $tmp = Join-Path $State 'offsite-tmp'; if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }; New-Item -ItemType Directory $tmp | Out-Null
      foreach ($d in 'db', 'storage') { New-Item -ItemType Directory -Force (Join-Path $Offsite $d) | Out-Null }
      $gpgArgs = { param($in, $out) @('--batch', '--yes', '--quiet', '--no-symkey-cache', '--pinentry-mode', 'loopback', '--passphrase-fd', '0', '--symmetric', '--cipher-algo', 'AES256', '--compress-algo', 'none', '--output', ($out -replace '\\', '/'), ($in -replace '\\', '/')) }
      $jobs = @(@{ kind = 'db'; name = "modus-$RunId-db.tar"; args = @('-cf', '', '-C', $final, '--exclude', 'storage', '.') })
      $storeHash = (Get-FileHash (Join-Path $final 'storage-manifest.csv') -Algorithm SHA256).Hash.Substring(0, 12).ToLower()
      if (-not (Get-ChildItem (Join-Path $Offsite 'storage') -Filter "*-$storeHash.tar.gpg" -ErrorAction SilentlyContinue)) {
        $jobs += @{ kind = 'storage'; name = "modus-$RunId-storage-$storeHash.tar"; args = @('-cf', '', '-C', $final, 'storage', 'storage-manifest.csv', 'storage-objects.csv') }
      } else { Log "off-device: storage unchanged (manifest $storeHash already copied), not re-uploaded" }
      foreach ($j in $jobs) {
        $plain = Join-Path $tmp $j.name; $j.args[1] = $plain
        if ((Exec $Tar $j.args $null (Join-Path $tmp 'tar.err')) -ne 0) { Fail "tar failed ($($j.kind))" }
        $enc = Join-Path $tmp "$($j.name).gpg"
        if ((Exec $Gpg (& $gpgArgs $plain $enc) $null (Join-Path $tmp 'gpg.err') @{} $pass) -ne 0) { Fail "gpg encrypt failed ($($j.kind))" }
        # prove the encrypted file decrypts to the identical archive before publishing it
        $check = Join-Path $tmp "$($j.name).check"
        $dargs = @('--batch', '--yes', '--quiet', '--no-symkey-cache', '--pinentry-mode', 'loopback', '--passphrase-fd', '0', '--decrypt', '--output', ($check -replace '\\', '/'), ($enc -replace '\\', '/'))
        if ((Exec $Gpg $dargs $null (Join-Path $tmp 'gpg.err') @{} $pass) -ne 0) { Fail "gpg test-decrypt failed ($($j.kind))" }
        if ((Get-FileHash $check).Hash -ne (Get-FileHash $plain).Hash) { Fail "off-device archive does not decrypt to the original ($($j.kind))" }
        Copy-Item $enc (Join-Path (Join-Path $Offsite $j.kind) "$($j.name).gpg")
        Log ("off-device: {0} copied ({1:N1} MB, encrypted, test-decrypted)" -f $j.kind, ((Get-Item $enc).Length / 1MB))
      }
      $pass = $null
      Remove-Item $tmp -Recurse -Force
      # off-device retention: 14 newest db archives + the newest from each of the last 4 weeks; 3 newest storage archives
      $dbFiles = @(Get-ChildItem (Join-Path $Offsite 'db') -Filter 'modus-*-db.tar.gpg' | Sort-Object Name -Descending)
      $keep = @($dbFiles | Select-Object -First $KeepDaily)
      $keep += @($dbFiles | Group-Object { $d = [datetime]::ParseExact($_.Name.Substring(6, 10), 'yyyy-MM-dd', $null); $d.AddDays(-[int]$d.DayOfWeek).ToString('yyyy-MM-dd') } | Select-Object -First $KeepWeekly | ForEach-Object { $_.Group[0] })
      foreach ($f in $dbFiles) { if ($keep.FullName -notcontains $f.FullName) { Remove-Item $f.FullName; Log "off-device retention: removed $($f.Name)" } }
      $stFiles = @(Get-ChildItem (Join-Path $Offsite 'storage') -Filter 'modus-*-storage-*.tar.gpg' | Sort-Object Name -Descending)
      if ($stFiles.Count -gt $KeepOffsiteStorage) { $stFiles | Select-Object -Skip $KeepOffsiteStorage | ForEach-Object { Remove-Item $_.FullName; Log "off-device retention: removed $($_.Name)" } }
    } catch {
      [void]$warnings.Add("off-device copy FAILED: $($_.Exception.Message)")
      if (Test-Path (Join-Path $State 'offsite-tmp')) { Remove-Item (Join-Path $State 'offsite-tmp') -Recurse -Force }
    }
  }
  if ($warnings.Count) { $status = 'OK_WITH_WARNINGS'; $exitCode = 2 }
} catch {
  $failure = $_.Exception.Message
  Log "FAILED: $failure" 'ERROR'
} finally {
  if ($dbEnv) { $dbEnv['PGPASSWORD'] = $null }
  if ($Stage -and (Test-Path $Stage)) {
    $failedDir = Join-Path $Daily "failed-$RunId"; Rename-Item $Stage $failedDir -ErrorAction SilentlyContinue
    Log "incomplete set kept for diagnosis as $failedDir (never counted as a backup)" 'ERROR'
  }
  # keep only the newest few failed sets; valid sets are never touched here
  Get-ChildItem $Daily -Directory -Filter 'failed-*' | Sort-Object Name -Descending | Select-Object -Skip $KeepFailed | ForEach-Object { Remove-Item $_.FullName -Recurse -Force }
  if ($startedPg) { $null = Exec "$Bin\pg_ctl.exe" @('-D', $PgData, '-m', 'fast', 'stop') $null $null }
  foreach ($w in $warnings) { Log $w 'WARN' }
  $validNow = @(ValidSets $Daily)
  $last = [ordered]@{ runId = $RunId; status = $status; exitCode = $exitCode; finished = (Get-Date -Format o); seconds = [int]$sw.Elapsed.TotalSeconds; failure = $failure; warnings = @($warnings); validDailySets = $validNow.Count; newestValidSet = ($validNow | Select-Object -Last 1).Name }
  $last | ConvertTo-Json | Set-Content (Join-Path $State 'last-run.json') -Encoding UTF8
  $alert = Join-Path $State 'BACKUP-ALERT.txt'
  if ($status -eq 'OK') { if (Test-Path $alert) { Remove-Item $alert } }
  else {
    $msg = if ($failure) { "Modus backup FAILED at $(Get-Date -Format g): $failure" } else { "Modus backup OK but with warnings at $(Get-Date -Format g): $($warnings -join '; ')" }
    Set-Content $alert "$msg`r`nNewest valid backup: $($last.newestValidSet)`r`nLog: $LogFile"
    Notify ($(if ($failure) { 'Modus backup FAILED' } else { 'Modus backup: warning' })) $msg
  }
  Log "=== backup end: $status (exit $exitCode, $([int]$sw.Elapsed.TotalSeconds) s) ==="
  $mutex.ReleaseMutex(); $mutex.Dispose()
}
exit $exitCode
