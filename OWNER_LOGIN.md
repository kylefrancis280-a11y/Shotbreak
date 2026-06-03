**Important:** After the env vars (OWNER_PW_*) are set in Netlify + Clear cache + deploy, the **UI login form password field now accepts the OWNER_PW values directly** when you type the short in email (kylef + your OWNER_PW_KYLEF value etc). This is the fix for "the fucking password doesnt fucking work".

The ps1 script and token path still work for shells.

## 1. UI Login (easiest for browser)

In the Login tab of the sign-in screen, just type the **short** (kylef / stevec / scottd / stevek / kyle / scott / steve) in the email field and paste the matching **OWNER_PW_*** value (from the env / my-owner-pws.txt) into the Password field. Hit Sign In.

- The form now calls /verify-owner under the hood for owner shorts/fulls.
- On success you get the real 4-part `owner:...` token stored, owner tier, unlimited, special UI.

Supported owner shorts right now:
- kylef (→ kylef@shotbreak.io)
- stevec (→ stevec@shotbreak.io)
- scottd (→ scottd@shotbreak.io)
- stevek (→ stevek@shotbreak.io)
- plus the originals kyle / scott / steve

If the real emails end up on different domains, the SHORT_TO_FULL_EMAIL map + server OWNER_NAME_TO_EMAIL will need the update (tell me the exact addresses).

## 2. Token-based Owner Access (for scripts, shells, or quick browser testing without Firebase sign-in)

Use the get-owner-token.ps1 (or the RUN_ME_FOR_* .bat files) after putting the OWNER_PW_* into Netlify.

Supported:
- kyleF   (for the kylef@... identity)
- steveC
- scottD
- steveK (new for stevek@)

See the local file my-owner-pws.txt (in C:\Users\kylefrancis) for the exact long random strings to use.

It contains:

```
OWNER_PW_KYLEF=6V&3{j7D[Lmy8Md(bscV@D.R
OWNER_PW_STEVEC=SB}LKs,=.(d(MMXi=Z4^JKfJ
OWNER_PW_SCOTTD=sbLx(,yBbHC:Pvw!i=?QCS4W
OWNER_PW_STEVEK=LHu&-;$Bj8$yzG!pIX^u&0Gt$w*-
```

Then, in PowerShell (your prompt showed `PS C:\Users\kylefrancis>` so use this):

```powershell
# Exact command from C:\Users\kylefrancis>
.\Shotbreak\get-owner-token.ps1
```

**Even easier (new launcher added for your exact situation):** 
Double-click `run-get-owner-token.bat` (in C:\Users\kylefrancis) or run:
```powershell
.\run-get-owner-token.bat
```

Or for a specific one:
- Double click RUN_ME_FOR_STEVEK_TOKEN.bat (new!)

This will:
- Auto load the pw from my-owner-pws.txt
- Call the verify-owner endpoint
- Give you a fresh `owner:stevek:1234567890:longhmac...` token
- Copy the token to your clipboard
- Print exact commands for using it

## Firebase email+pw for the full emails (kylef@ , stevek@ etc)

Create the users in Firebase Auth console with password Shotbreak2026! (for the two requested).
Then in app login use full email stevek@shotbreak.io + Shotbreak2026!  (falls back to Firebase if verify pw not matching the OWNER_PW one).

After any change to these files or env, always: Clear cache and deploy site in Netlify.