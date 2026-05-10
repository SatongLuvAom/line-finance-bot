# Safe clasp Workflow

Use `clasp` to push the local `src/` folder to Google Apps Script without copying files manually.

## Local Files

Tracked in GitHub:

```text
src/
docs/
scripts/
tests/
migrations/
.clasp.json.example
.claspignore
README.md
CLASP.md
```

Never commit:

```text
.clasp.json
.clasprc.json
.env
service-account*.json
*firebase-adminsdk*.json
*.pem
*.key
*.p12
```

## One-Time Setup

Enable the Apps Script API:

```text
https://script.google.com/home/usersettings
```

Login:

```powershell
clasp login
```

Create local `.clasp.json` from the example:

```powershell
Copy-Item .clasp.json.example .clasp.json
notepad .clasp.json
```

Put your Apps Script `scriptId` into `.clasp.json`. This file is intentionally ignored by Git.

## Push Code Safely

Before pushing to Apps Script:

```powershell
.\scripts\scan-secrets.ps1
clasp status
clasp push
```

`clasp push` uploads code only. It does not upload Script Properties.

## Pull Code Safely

Pull only when you intentionally want local files overwritten by the Apps Script editor version:

```powershell
.\scripts\scan-secrets.ps1
clasp pull
.\scripts\scan-secrets.ps1
```

After `clasp pull`, inspect changes before committing:

```powershell
git status
git diff
```

## Deploy Web App

Create a new version:

```powershell
clasp version "short description"
```

Deploy to an existing deployment:

```powershell
clasp deployments
clasp deploy -i DEPLOYMENT_ID -V VERSION_NUMBER -d "short description"
```

If LINE still uses old behavior, confirm the webhook URL is pointing to the expected deployment ID.

## Safety Rules

- Store `LINE_TOKEN`, `GEMINI_KEY`, Firebase config, Sheet ID, and webhook secret in Apps Script Script Properties.
- Do not add `.clasp.json` or `.clasprc.json` with `git add -f`.
- Do not put service account JSON files in this repo.
- Run `.\scripts\scan-secrets.ps1` before every `git push`.
