# Store OpenAI Sora API key on production (Firebase server_secrets fallback).
# Usage:
#   $env:OPENAI_API_KEY = 'sk-...'
#   .\fix-openai-sora.ps1
# Or:
#   .\fix-openai-sora.ps1 -OpenAIKey 'sk-...' -OwnerPassword '...'

param(
  [string]$OpenAIKey,
  [string]$OwnerName = 'kyleF',
  [string]$OwnerPassword
)

$ErrorActionPreference = 'Stop'
$Base = 'https://shotbreak.io/.netlify/functions'

if (-not $OpenAIKey) { $OpenAIKey = $env:OPENAI_API_KEY }
if (-not $OpenAIKey -or -not $OpenAIKey.Trim().StartsWith('sk-')) {
  Write-Host 'Set OPENAI_API_KEY env var or pass -OpenAIKey sk-...' -ForegroundColor Red
  exit 1
}

if (-not $OwnerPassword) {
  $secure = Read-Host 'Owner password (OWNER_PW_KYLEF)' -AsSecureString
  $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $OwnerPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) }
  finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

Write-Host 'Getting owner token...' -ForegroundColor Cyan
$ownerBody = @{ name = $OwnerName; password = $OwnerPassword } | ConvertTo-Json
$owner = Invoke-RestMethod -Uri "$Base/verify-owner" -Method Post -Body $ownerBody -ContentType 'application/json'
if (-not $owner.token) { throw 'verify-owner failed' }

$headers = @{
  Authorization = 'Bearer ' + $owner.token
  'Content-Type' = 'application/json'
}

Write-Host 'Storing OpenAI key (Firebase server_secrets)...' -ForegroundColor Cyan
$setBody = @{ action = 'set_openai_key'; api_key = $OpenAIKey.Trim() } | ConvertTo-Json
$set = Invoke-RestMethod -Uri "$Base/generate-video" -Method Post -Headers $headers -Body $setBody

Write-Host 'Verifying providers...' -ForegroundColor Cyan
$provBody = @{ action = 'providers' } | ConvertTo-Json
$prov = Invoke-RestMethod -Uri "$Base/generate-video" -Method Post -Headers $headers -Body $provBody

$prov | ConvertTo-Json -Depth 4
if ($prov.openai) {
  Write-Host "`nDone — Sora 2 should work on timeline now." -ForegroundColor Green
} else {
  Write-Host "`nKey still not visible to functions. Check FIREBASE_DB_SECRET on Netlify." -ForegroundColor Yellow
  exit 2
}