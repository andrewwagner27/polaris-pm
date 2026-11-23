# Stripe ACH lifecycle integration test (local stack only, Stripe sandbox).
# Tests: succeeded, payment_failed, ACH return/dispute, duplicate webhook delivery.
# Also verifies the real fee/transfer on pi_3UdeD5HoFqm9Llqh0YfpI1Q6.
# Requires PowerShell 5.1+ (Windows built-in).

$ErrorActionPreference = 'Continue'

# ── Config ────────────────────────────────────────────────────────────────────
# Credentials are read from supabase/functions/.env (gitignored).
# Required vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
# STRIPE_WEBHOOK_SECRET is printed by `stripe listen` at startup; update .env each session.
# Supabase local anon key is the well-known demo value (not a secret).
$API       = 'http://localhost:54321'
$PGPASS    = 'postgres'
$PGCMD     = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$TENANT_ID = '00000000-0000-0000-0000-000000000060'
$PREV_PI   = 'pi_3UdeD5HoFqm9Llqh0YfpI1Q6'
$ANON_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7kyqd7PkESD6GaUeNRwONsqmBsLqoqUs5y0'

$envFile = "$PSScriptRoot\..\supabase\functions\.env"
if (-not (Test-Path $envFile)) { Write-Error "Missing $envFile - copy .env.example and fill in values"; exit 1 }
$envVars = Get-Content $envFile | Where-Object { $_ -match '^\s*[^#].*=' } |
  ForEach-Object { $p = $_.Split('=',2); @{ Key=$p[0].Trim(); Value=$p[1].Trim() } }
$SK    = ($envVars | Where-Object { $_.Key -eq 'STRIPE_SECRET_KEY' }  | Select-Object -First 1).Value
$WHSEC = ($envVars | Where-Object { $_.Key -eq 'STRIPE_WEBHOOK_SECRET' } | Select-Object -First 1).Value
if (-not $SK)    { Write-Error "STRIPE_SECRET_KEY not set in $envFile"; exit 1 }
if (-not $WHSEC) { Write-Error "STRIPE_WEBHOOK_SECRET not set in $envFile"; exit 1 }

$pass = 0; $fail = 0
function ok([string]$name) { Write-Host "  PASS  $name" -ForegroundColor Green; $script:pass++ }
function fail_check([string]$name, [string]$detail = '') { Write-Host "  FAIL  $name  $detail" -ForegroundColor Red; $script:fail++ }
function check([bool]$cond, [string]$name, [string]$detail = '') { if ($cond) { ok $name } else { fail_check $name $detail } }

# PS5.1-compatible REST call; returns parsed JSON or $null on error
function rest([string]$method, [string]$url, [hashtable]$headers = @{}, [string]$body = '', [string]$ct = 'application/json') {
  $global:LastWebError = $null
  try {
    $params = @{ Uri = $url; Method = $method; Headers = $headers; UseBasicParsing = $true }
    if ($body) { $params['Body'] = $body; $params['ContentType'] = $ct }
    $resp = Invoke-WebRequest @params -ErrorAction Stop
    if ($resp.Content) { return $resp.Content | ConvertFrom-Json } else { return @{} }
  } catch {
    $global:LastWebError = $_.Exception.Message
    try {
      $stream = $_.Exception.Response.GetResponseStream()
      $reader = [System.IO.StreamReader]::new($stream)
      $errBody = $reader.ReadToEnd()
      if ($errBody) {
        $global:LastWebError = $errBody
        return $errBody | ConvertFrom-Json
      }
    } catch { }
    return $null
  }
}
function stripe_get([string]$path) {
  return rest 'GET' "https://api.stripe.com/v1$path" @{ Authorization = "Bearer $SK" }
}
function sign_webhook([string]$payload, [int]$ts) {
  # Edge function uses enc.encode(full_whsec_string) as HMAC key — not base64-decoded
  $keyBytes = [System.Text.Encoding]::UTF8.GetBytes($WHSEC)
  $hmac     = [System.Security.Cryptography.HMACSHA256]::new($keyBytes)
  $sig      = [BitConverter]::ToString($hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes("${ts}.${payload}"))).Replace('-','').ToLower()
  return "t=${ts},v1=${sig}"
}
function send_webhook([string]$payload) {
  $ts  = [int][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $sig = sign_webhook $payload $ts
  return rest 'POST' "$API/functions/v1/stripe-webhook" @{ 'stripe-signature' = $sig } $payload
}
function pg([string]$sql) {
  $env:PGPASSWORD = $PGPASS
  $out = & $PGCMD -h localhost -p 54322 -U postgres -d postgres -t -c $sql 2>&1
  return ($out | Out-String).Trim()
}

Write-Host ""
Write-Host "=== Stripe ACH Lifecycle Integration Test ===" -ForegroundColor Cyan
Write-Host "  Local stack: $API"
Write-Host ""

# ═══════════════════════════════════════════════════════════════════════════════
# Part A: Verify real Stripe fee/transfer for the live test payment intent
# ═══════════════════════════════════════════════════════════════════════════════
Write-Host "Part A: Stripe sandbox fee/transfer verification ($PREV_PI)" -ForegroundColor Yellow

$pi = stripe_get "/payment_intents/${PREV_PI}?expand[]=charges"
check ([bool]($pi -and $pi.id -eq $PREV_PI)) "A1: PI retrieved from Stripe" $global:LastWebError
if ($pi) {
  check ([bool]($pi.amount -eq 150000)) "A2: Amount = 150000 cents ($1,500)"
  check ([bool]($pi.application_fee_amount -eq 7500)) "A3: application_fee_amount = 7500 (5%)" "got: $($pi.application_fee_amount)"
  check ([bool]($pi.transfer_data.destination -eq 'acct_1UVhe1HWTjHm1swg')) "A4: transfer_data.destination = acct_1UVhe1HWTjHm1swg" "got: $($pi.transfer_data.destination)"
  check ([bool]($pi.currency -eq 'usd')) "A5: Currency USD"
  Write-Host "    PI status in Stripe: $($pi.status)"
  if ($pi.charges -and $pi.charges.data.Count -gt 0) {
    $charge = $pi.charges.data[0]
    Write-Host "    Charge: $($charge.id)"
    if ($charge.application_fee) {
      $fee = stripe_get "/application_fees/$($charge.application_fee)"
      if ($fee) { check ([bool]($fee.amount -eq 7500)) "A6: Application fee object amount = 7500" "got: $($fee.amount)" }
    }
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Part B: Sign-in
# ═══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "Part B: GoTrue sign-in for test tenant" -ForegroundColor Yellow

$authBody = ConvertTo-Json @{ email = 'tenant-test@localhost.invalid'; password = 'LocTest-1234!' }
$auth = rest 'POST' "$API/auth/v1/token?grant_type=password" @{ apikey = $ANON_KEY } $authBody

if ($auth -and $auth.access_token) {
  ok "B1: GoTrue sign-in returned access_token"
  $JWT = $auth.access_token
} else {
  fail_check "B1: GoTrue sign-in" "Response: $($auth | ConvertTo-Json -Depth 2 2>$null) | Error: $($global:LastWebError)"
  $JWT = $null
}

# ═══════════════════════════════════════════════════════════════════════════════
# Part C: DB idempotency tokens in correct state
# ═══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "Part C: DB idempotency token state" -ForegroundColor Yellow

# Tokens from previous payments should be committed (not stuck pending).
# A stuck pending token would prevent any new payment for that tenant.
$stuckTokens = pg "SELECT count(*) FROM public.payment_idempotency_tokens WHERE tenant_id = '$TENANT_ID' AND status = 'pending' AND expires_at > now();"
check ([bool]($stuckTokens -match '^\s*0\s*$')) "C1: No stuck pending idempotency tokens for test tenant" "count: $stuckTokens"

$committedTokens = pg "SELECT count(*) FROM public.payment_idempotency_tokens WHERE tenant_id = '$TENANT_ID' AND status = 'committed';"
Write-Host "    Committed tokens: $($committedTokens.Trim())"

# ═══════════════════════════════════════════════════════════════════════════════
# Part D: Webhook lifecycle events (signed, using the live PI from 2026-11-19)
# ═══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "Part D: Webhook lifecycle events (PI: $PREV_PI)" -ForegroundColor Yellow

# Reset the payment row to 'pending' so we can test the succeeded event
pg "UPDATE public.payments SET status='pending' WHERE stripe_payment_intent_id='$PREV_PI';" | Out-Null
$startStatus = pg "SELECT status FROM public.payments WHERE stripe_payment_intent_id='$PREV_PI';"
check ([bool]($startStatus -match 'pending')) "D0: DB reset to pending for lifecycle test"

# D1: payment_intent.succeeded
$succTs = [int][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$succeededPayload = ConvertTo-Json -Depth 10 @{
  id      = "evt_lifecycle_succeeded_$succTs"
  type    = 'payment_intent.succeeded'
  created = $succTs
  data    = @{
    object = @{
      id       = $PREV_PI
      amount   = 150000
      currency = 'usd'
      status   = 'succeeded'
      charges  = @{ data = @(@{ id = "ch_lifecycle_$PREV_PI"; balance_transaction = 'txn_test_lifecycle' }) }
      transfer_data = @{ destination = 'acct_1UVhe1HWTjHm1swg' }
    }
  }
}

$r1 = send_webhook $succeededPayload
check ([bool]($null -ne $r1)) "D1: payment_intent.succeeded webhook accepted" $global:LastWebError
Start-Sleep -Milliseconds 500
$afterSucceeded = pg "SELECT status FROM public.payments WHERE stripe_payment_intent_id='$PREV_PI';"
check ([bool]($afterSucceeded -match 'paid')) "D1b: DB status=paid after succeeded event" "got: $afterSucceeded"

# D2: Duplicate delivery of same succeeded event
$r2 = send_webhook $succeededPayload
check ([bool]($null -ne $r2)) "D2: Duplicate payment_intent.succeeded accepted (idempotent)" $global:LastWebError
Start-Sleep -Milliseconds 300
$afterDupe = pg "SELECT count(*) FROM public.payments WHERE stripe_payment_intent_id='$PREV_PI';"
check ([bool]($afterDupe -match '1')) "D2b: No duplicate payment row after duplicate webhook" "count: $afterDupe"

# D3: payment_intent.payment_failed — must not undo paid status
$failTs = [int][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$failedPayload = ConvertTo-Json -Depth 10 @{
  id      = "evt_lifecycle_failed_$failTs"
  type    = 'payment_intent.payment_failed'
  created = $failTs
  data    = @{ object = @{ id = $PREV_PI; last_payment_error = @{ message = 'Insufficient funds' } } }
}
$r3 = send_webhook $failedPayload
check ([bool]($null -ne $r3)) "D3: payment_intent.payment_failed webhook accepted" $global:LastWebError
Start-Sleep -Milliseconds 300
$afterFailed = pg "SELECT status FROM public.payments WHERE stripe_payment_intent_id='$PREV_PI';"
check ([bool]($afterFailed -match 'paid')) "D3b: Status still=paid (late failed event doesn't undo success)" "got: $afterFailed"

# D4: ACH return as charge.dispute.created (reason=insufficient_funds → kind=ach_return)
# payment_returns.payment_id is UNIQUE and append-only: use a payment without a return row.
# When all existing payments already have returns (after repeated test runs), insert a fresh
# disposable payment row just for the dispute test.
$dispTs = [int][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$DISPUTE_ID = "dp_lifecycle_$dispTs"
$noReturnRow = pg "SELECT p.id, p.stripe_payment_intent_id FROM public.payments p WHERE p.tenant_id='$TENANT_ID' AND NOT EXISTS (SELECT 1 FROM public.payment_returns pr WHERE pr.payment_id = p.id) AND EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.source_type='payment' AND je.source_id=p.id AND je.kind='post') LIMIT 1;"
$DISP_PMT_ID  = ($noReturnRow | Select-String -Pattern '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}').Matches | Select-Object -First 1 -ExpandProperty Value
$DISP_PI      = ($noReturnRow | Select-String -Pattern 'pi_[A-Za-z0-9_]+').Matches | Select-Object -First 1 -ExpandProperty Value
if ($DISP_PMT_ID -and $DISP_PI) {
  Write-Host "    Dispute PI: $DISP_PI (payment_id: $DISP_PMT_ID)"
} else {
  # Seed a fresh disposable payment for this test (pi_dispute_test_<ts> so it never conflicts).
  # Include unit_id from the tenant so a1_classify_payment qualifies it.
  $dispPi  = "pi_dispute_test_$dispTs"
  $unitRow = pg "SELECT unit_id FROM public.tenants WHERE id='$TENANT_ID' LIMIT 1;"
  $dispUnit = ($unitRow | Select-String '[0-9a-f-]{36}').Matches.Value
  if ($dispUnit) {
    pg "INSERT INTO public.payments(tenant_id, unit_id, amount_cents, status, stripe_payment_intent_id, source, category, paid_at) VALUES('$TENANT_ID','$dispUnit',150000,'paid','$dispPi','ach','Rent',now());" | Out-Null
  } else {
    pg "INSERT INTO public.payments(tenant_id, amount_cents, status, stripe_payment_intent_id, source, category, paid_at) VALUES('$TENANT_ID',150000,'paid','$dispPi','ach','Rent',now());" | Out-Null
  }
  Start-Sleep -Milliseconds 400
  $freshRow = pg "SELECT id FROM public.payments WHERE stripe_payment_intent_id='$dispPi' LIMIT 1;"
  $DISP_PMT_ID = ($freshRow | Select-String '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}').Matches.Value
  $DISP_PI     = $dispPi  # use full string, not regex-extracted (underscores would truncate)
  if ($DISP_PMT_ID) {
    Write-Host "    Dispute PI: $DISP_PI (payment_id: $DISP_PMT_ID) [disposable seed]"
  } else {
    Write-Host "    WARN: Could not seed disposable payment; D4/D5 will be skipped" -ForegroundColor DarkYellow
  }
}

$disputePayload = ConvertTo-Json -Depth 10 @{
  id      = "evt_lifecycle_dispute_$dispTs"
  type    = 'charge.dispute.created'
  created = $dispTs
  data    = @{
    object = @{
      id             = $DISPUTE_ID
      charge         = "ch_lifecycle_$DISP_PI"
      reason         = 'insufficient_funds'
      status         = 'needs_response'
      amount         = 150000
      currency       = 'usd'
      payment_intent = $DISP_PI
    }
  }
}
$r4 = send_webhook $disputePayload
check ([bool]($null -ne $r4)) "D4: charge.dispute.created (ACH return) webhook accepted" $global:LastWebError
Start-Sleep -Milliseconds 500
$disputeRow = pg "SELECT kind FROM public.payment_returns WHERE stripe_dispute_id='$DISPUTE_ID';"
check ([bool]($disputeRow -match 'ach_return')) "D4b: payment_returns row kind=ach_return" "row: $disputeRow"

# D5: Duplicate ACH return — must not create second row
$r5 = send_webhook $disputePayload
check ([bool]($null -ne $r5)) "D5: Duplicate charge.dispute.created accepted (idempotent)" $global:LastWebError
Start-Sleep -Milliseconds 300
$dupeDispute = pg "SELECT count(*) FROM public.payment_returns WHERE stripe_dispute_id='$DISPUTE_ID';"
check ([bool]($dupeDispute -match '1')) "D5b: No duplicate payment_return row after duplicate dispute webhook" "count: $dupeDispute"

# D6: account.updated — must 200 OK
$acctTs = [int][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$connectPayload = ConvertTo-Json -Depth 10 @{
  id      = "evt_lifecycle_account_$acctTs"
  type    = 'account.updated'
  created = $acctTs
  data    = @{ object = @{ id = 'acct_1UVhe1HWTjHm1swg'; charges_enabled = $true; payouts_enabled = $true } }
}
$r6 = send_webhook $connectPayload
check ([bool]($null -ne $r6)) "D6: account.updated (Stripe Connect) webhook accepted" $global:LastWebError

# ═══════════════════════════════════════════════════════════════════════════════
# Part E: Invalid signature rejected
# ═══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "Part E: Webhook signature validation" -ForegroundColor Yellow

$badSigResult = rest 'POST' "$API/functions/v1/stripe-webhook" @{ 'stripe-signature' = 't=1,v1=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbad' } $succeededPayload
if ($null -eq $badSigResult -or $badSigResult.error -or $global:LastWebError) {
  ok "E1: Bad signature rejected"
} else {
  fail_check "E1: Bad signature should have been rejected" "got: $($badSigResult | ConvertTo-Json)"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ("  PASS: {0}   FAIL: {1}" -f $pass, $fail) -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
Write-Host "===========================================" -ForegroundColor Cyan
if ($fail -gt 0) { exit 1 }
