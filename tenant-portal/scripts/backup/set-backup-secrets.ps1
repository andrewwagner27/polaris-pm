# One-time setup: store the Modus database password and the off-device encryption passphrase for the nightly backup.
# Both are encrypted with Windows DPAPI (CurrentUser): only this Windows account on this computer can decrypt them.
# Nothing is printed, logged or sent anywhere. Re-run any time to change either value.
$ErrorActionPreference = 'Stop'
$root    = $PSScriptRoot
$secrets = Join-Path $root 'secrets'
$psql    = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
New-Item -ItemType Directory -Force $secrets | Out-Null

function Plain([Security.SecureString]$s) {
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

Write-Host "`nModus backup setup" -ForegroundColor Cyan
Write-Host "1) Database password: Supabase Dashboard > Project Settings > Database (the password for user postgres)."
Write-Host "   If you don't have it, you can reset it there; the app doesn't use it, so nothing else breaks.`n"
for ($try = 1; $try -le 3; $try++) {
  $pw = Read-Host -AsSecureString "Database password (typing is hidden)"
  $env:PGHOST = 'aws-1-us-east-2.pooler.supabase.com'; $env:PGPORT = '5432'; $env:PGDATABASE = 'postgres'
  $env:PGUSER = 'postgres.ynbxdbwxdydbpkzaffte'; $env:PGSSLMODE = 'require'; $env:PGCONNECT_TIMEOUT = '20'
  $env:PGPASSWORD = Plain $pw
  $null = & $psql -X -At -c "select 1" 2>$null
  $code = $LASTEXITCODE
  Remove-Item Env:PGPASSWORD
  if ($code -eq 0) {
    $pw | ConvertFrom-SecureString | Set-Content (Join-Path $secrets 'db-password.dpapi') -Encoding ascii
    Write-Host "   Connected (read-only test). Password saved, encrypted for this Windows account." -ForegroundColor Green
    break
  }
  Write-Host "   Could not connect with that password (attempt $try of 3)." -ForegroundColor Yellow
  if ($try -eq 3) { Write-Host "   Not saved. Re-run this script when you have the password." -ForegroundColor Red; Read-Host "Press Enter to close"; exit 1 }
}

Write-Host "`n2) Off-device encryption passphrase (protects the encrypted copy in OneDrive)."
Write-Host "   Choose a NEW passphrase of 16+ characters and save it in your password manager NOW:"
Write-Host "   if this laptop is lost, that passphrase is the only way to open the OneDrive copies.`n"
while ($true) {
  $p1 = Read-Host -AsSecureString "Passphrase (hidden)"
  $p2 = Read-Host -AsSecureString "Repeat passphrase"
  $a = Plain $p1; $b = Plain $p2
  if ($a.Length -lt 16) { Write-Host "   Too short (16+ characters)." -ForegroundColor Yellow; continue }
  if ($a -cne $b) { Write-Host "   The two entries differ." -ForegroundColor Yellow; continue }
  $a = $null; $b = $null
  $p1 | ConvertFrom-SecureString | Set-Content (Join-Path $secrets 'offsite-passphrase.dpapi') -Encoding ascii
  Write-Host "   Passphrase saved, encrypted for this Windows account." -ForegroundColor Green
  break
}
Set-Content (Join-Path $root 'state\secrets-configured.txt') (Get-Date -Format o)
Write-Host "`nDone. You can close this window and tell Claude 'backup secrets set'." -ForegroundColor Cyan
Read-Host "Press Enter to close"
