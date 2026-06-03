# How to Log In as Owner (kyleF / steveC / scottD)

**Important:** The script you ran (via the .bat) worked! It reached the server and gave the exact error because the passwords are not yet set in Netlify.

You are not lost on the script — the missing piece is setting the env vars + deploying.

You are currently lost because there are **two separate systems** for "owner" access.

## 1. Full App UI Login (Recommended for using the editor, agents, per-shot controls, etc.)

This uses normal Firebase email + password sign in.

**Current active owner emails (usernames) you can use:**

- kylef@shotbreak.io   ← for you (Kyle) via the kyleF short
- stevec@shotbreak.io
- scottd@shotbreak.io

(The original kyle@shotbreak.io etc. are still in the list but the F/C/D variants are the "current active" ones while the plain company ones are being set up.)

**Easiest way to create the account + set your password:**

1. Open the app:
   - Live: the deployed site (usually https://shotbreak.io/app or the main app.html)
   - Or for testing: open `SHOTBREAK-FINAL-FLOW-UPDATE.html` directly in your browser (file://...)

2. In the sign-in screen, switch to the **Signup** tab.

3. Enter:
   - Email: `kylef@shotbreak.io` (or one of the others)
   - Password: Choose a strong password you will remember. Type it in the form.

4. Click create / sign up.

5. Then switch to the Login tab and sign in with the exact same email + the password you just chose.

Because the email is in the authorized OWNER_EMAILS list, you will be logged in with full owner privileges (isOwner = true, no subscription prompts, unlimited access, special UI colors, etc.).

**Note:** The password you choose here is a normal Firebase password. It is **completely separate** from the OWNER_PW_* values below.

If the emails need to be on completely different domains (not @shotbreak.io), tell me the three real addresses and I will update the code so the list + token mapping use your real ones.

## 2. Token-based Owner Access (for scripts, shells, or quick browser testing without Firebase sign-in)

This uses short names + the special OWNER_PW_* passwords that live only in Netlify Environment Variables.

**Current shorts (the "name" you send to verify-owner):**

- kyleF   (for the kylef@... identity)
- steveC
- scottD

**The passwords (these were generated for you and must be set in Netlify):**

See the local file my-owner-pws.txt (in C:\Users\kylefrancis) for the exact long random strings to use.

It contains:

OWNER_PW_KYLEF=...
OWNER_PW_STEVEC=...
OWNER_PW_SCOTTD=...

(plus optional backups)

**1. Set the passwords in Netlify (required before the script will work)**

Go to https://app.netlify.com (log in with your account that owns the Shotbreak site).

- Select your site (probably "shotbreak" or similar, the one with the custom domain shotbreak.io)
- Go to Site configuration (or Site settings) > Environment variables
- Add three new variables (click "Add a variable" for each):

  Key: OWNER_PW_KYLEF
  Value: (copy the exact long string from my-owner-pws.txt)

  Key: OWNER_PW_STEVEC
  Value: (from the file)

  Key: OWNER_PW_SCOTTD
  Value: (from the file)

- Make sure "Deploy contexts" is set to "All" or at least Production + Deploy Previews.
- Save.

**2. Deploy the changes**

- Go to the "Deploys" tab for the site.
- Click the big "Clear cache and deploy site" button.
- Wait until it shows "Published" with a green check (this can take a minute).

Only after this will the remote /verify-owner endpoint accept the passwords.

**Easiest way to get a token:** (after the above)

Then, in PowerShell (your prompt showed `PS C:\Users\kylefrancis>` so use this):

```powershell
# Exact command from C:\Users\kylefrancis>
.\Shotbreak\get-owner-token.ps1
```

Or with parameters to skip prompts (recommended once you have the pw value):

```powershell
.\Shotbreak\get-owner-token.ps1 -Name kyleF -Password "paste-the-OWNER_PW_KYLEF-long-string-here"
```

If you cd first:
```powershell
cd Shotbreak
.\get-owner-token.ps1
```

**Even easier (new launcher added for your exact situation):** 
Double-click `run-get-owner-token.bat` (in C:\Users\kylefrancis) or run:
```powershell
.\run-get-owner-token.bat
```
It cds automatically and defaults to kyleF (you only need to paste the pw).

- Choose the short (type `kyleF` and Enter) or use the bat
- When it asks for the password, paste the corresponding OWNER_PW_KYLEF value (input is hidden for security)

The script will:
- Call the verify-owner endpoint
- Give you a fresh `owner:kylef:1234567890:longhmac...` token
- Copy the token to your clipboard
- Print exact commands for using it

**To act as owner in the browser without signing in via Firebase:**

After getting the token, open the app page (live or local golden), open DevTools console (F12), and run:

```js
localStorage.setItem('SB_OWNER_TOKEN', 'paste-the-full-token-here');
location.reload();
```

You should now see owner behavior.

The token is valid for ~12 hours.

## Quick Checklist if Things Don't Work

- Did you set the three OWNER_PW_KYLEF etc. in Netlify env + redeploy + clear cache?
- Is the latest golden code live (the updates including the helper references)?
- For UI: did you actually create the Firebase user with the email via the signup form (or Firebase Console)?
- For token: are you using the exact short `kyleF` (capital F) and the exact pw value?

If you give me the three real different email addresses you want to use for the accounts, I will immediately update the code (the lists and the map) so everything points to your real emails instead of the @shotbreak.io placeholders.

You are not lost — there are just two paths. The UI signup path (section 1) is usually what people mean by "my username and password".

Run the helper script for the token path.

Let me know which path you're trying and what error you see.