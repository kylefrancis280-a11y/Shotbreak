# Run this AFTER logging into Netlify in browser.
# Opens Netlify and prints exact steps for Sora / video keys.

Write-Host "SHOTBREAK NETLIFY ENV SETUP" -ForegroundColor Cyan
Write-Host ""
Write-Host "=== SORA 2 (most common fix) ===" -ForegroundColor Yellow
Write-Host "1. app.netlify.com -> your Shotbreak site -> Site configuration -> Environment variables"
Write-Host "2. Add or edit:"
Write-Host "     Key:   OPENAI_API_KEY"
Write-Host "     Value: sk-... (from platform.openai.com/api-keys)"
Write-Host "     Scope: ALL SCOPES  (or at minimum: Functions + Production + Deploy previews)"
Write-Host "     Important: If scope is Builds-only, functions will NOT see the key!"
Write-Host "3. Deploys -> Trigger deploy -> Deploy site  (required after any env change)"
Write-Host ""
Write-Host "4. Verify on timeline (logged in), browser console:"
Write-Host '     const h=await hdrs(); fetch("/.netlify/functions/generate-video",{method:"POST",headers:h,body:JSON.stringify({action:"providers"})}).then(r=>r.json()).then(console.log)'
Write-Host "     Expect: openai: true, openai_key_len: 50+"
Write-Host ""
Write-Host "=== Other keys ===" -ForegroundColor Cyan
Write-Host "   XAI_API_KEY          (Grok Imagine)"
Write-Host "   WAVESPEED_API_KEY    (Seedance, Wan, Veo, Kling fallback)"
Write-Host "   FIREBASE_API_KEY     = AIzaSyA5-NRXzzkWuGafQ5-EukGF9WMnQ2txFFA"
Write-Host "   OWNER_TOKEN_SECRET"
Write-Host ""

$site = "https://app.netlify.com"
Start-Process $site
Write-Host "Opened Netlify dashboard." -ForegroundColor Green