# Reads STRIPE_SECRET_KEY from supabase/functions/.env and starts stripe listen.
# Never paste the key in the terminal — this avoids copy-paste encoding corruption.
$envFile = "$PSScriptRoot\supabase\functions\.env"
$key = (Get-Content $envFile | Where-Object { $_ -match '^STRIPE_SECRET_KEY=' }).Split('=', 2)[1].Trim()
if (-not $key) { Write-Error "STRIPE_SECRET_KEY not found in $envFile"; exit 1 }
Write-Host "Starting stripe listen with key from .env (length $($key.Length))..."
stripe listen --api-key $key --forward-to http://localhost:54321/functions/v1/stripe-webhook
