# LINE Finance Bot

Google Apps Script V8 LINE bot for finance tracking in booth/exhibition production work. The bot receives LINE webhook events, parses receipt images and PDF files with Gemini, stores transactions in Firebase Firestore, syncs lightweight rows to Google Sheets, uploads attachments to Firebase Storage, and replies through LINE text/Flex messages.

## Features

- LINE webhook entry points with `doPost(e)` and `doGet(e)`.
- Text commands for help, slip guidance, latest records, edit/delete latest record, project summaries, active jobs this month, labor summaries, and manual labor entry.
- Receipt flow for LINE image/PDF download, Gemini parsing, normalization, duplicate guard, Firebase Storage upload, Firestore save, Sheet sync, and LINE reply.
- Labor flow with week/month extraction, confirmation prompts, manual labor save, and labor summaries.
- Firestore indexed query layer for normal commands to avoid full collection scans.
- Audit logging for create, update, delete, webhook error, and AI parsing events.
- Safe clasp workflow for pushing `src/` to Google Apps Script.

## Architecture

```text
LINE Webhook
  -> Main.gs
  -> Security.gs
  -> Router.gs
  -> Command_Handler.gs / Receipt_Service.gs
  -> AI_Engine.gs / AI_Normalizer.gs / AI_BankParser.gs
  -> Firestore_Query.gs / Firestore_Repository.gs
  -> Sheet_Repository.gs / Storage_Repository.gs
  -> Line_UI.gs / Flex_Builder.gs
```

Repository layout:

```text
src/          Apps Script source pushed by clasp
docs/         Operations and schema documentation
scripts/      Local maintenance scripts
tests/        Test documentation; executable GAS helpers are in src/Test_Dev.gs
migrations/   Migration documentation; executable GAS migrations are in src/Migration_Service.gs
```

## Setup

1. Create or open a Google Apps Script project.
2. Enable the Apps Script API at `https://script.google.com/home/usersettings`.
3. Install and login to clasp.
4. Configure `.clasp.json` locally from `.clasp.json.example`.
5. Set all required Script Properties in Apps Script Project Settings.
6. Run `clasp push`.
7. Deploy as a web app and register the web app URL in LINE Developers.

## Required Script Properties

Set these in Apps Script Project Settings. Do not hardcode them in source files.

| Property | Required | Purpose |
| --- | --- | --- |
| `LINE_TOKEN` | Yes | LINE Messaging API channel access token |
| `GEMINI_KEY` | Yes | Gemini API key |
| `FIREBASE_PROJECT_ID` | Yes | Firebase/Google Cloud project ID |
| `FIREBASE_STORAGE_BUCKET` | Recommended | Firebase Storage bucket |
| `SHEET_ID` | Yes | Google Sheets spreadsheet ID |
| `WEBHOOK_SECRET` | Optional | Query-string key guard for webhook URL |
| `OWN_COMPANY_ALIASES` | Optional | Company names used to detect income vs expense |
| `JOB_ALIASES` | Optional | One alias rule per line: `Canonical=Alias1,Alias2` |
| `MERCHANT_ALIASES` | Optional | Vendor/worker alias rules |
| `CATEGORY_ALIASES` | Optional | Category alias rules |
| `ITEM_ALIASES` | Optional | Item/detail alias rules |
| `ALLOWED_LINE_USER_IDS` | Optional | Allowlist; empty means allow all users |
| `ADMIN_LINE_USER_IDS` | Optional | Admins for delete/maintenance commands |
| `ENABLE_DEV_WRITES` | Optional | Set `true` only for write test helpers |

## Deployment With clasp

One-time setup:

```powershell
Copy-Item .clasp.json.example .clasp.json
notepad .clasp.json
clasp login
clasp status
```

Push local source to Apps Script:

```powershell
.\scripts\scan-secrets.ps1
clasp push
```

Deploy:

```powershell
clasp version "release note"
clasp deployments
clasp deploy -i DEPLOYMENT_ID -V VERSION_NUMBER -d "release note"
```

See `CLASP.md` for the safe push/pull workflow.

## Safety Notes

- `.clasp.json`, `.clasprc.json`, `.env`, service account JSON, private keys, and local credentials are ignored by Git.
- Secrets must live in Apps Script Script Properties only.
- Run `.\scripts\scan-secrets.ps1` before every `git push`.
- `clasp push` uploads code only; it does not upload Script Properties.
- Do not commit Firebase service account JSON. This project uses Apps Script OAuth token access to Google APIs.
- If a secret was ever committed, rotate it immediately before making the repository public.

## Documentation

- `CLASP.md` - safe clasp push/pull/deploy workflow
- `docs/COMMANDS.md` - LINE command list
- `docs/DEPLOYMENT.md` - Apps Script, LINE, Firebase, and Sheets setup
- `docs/DATABASE_SCHEMA.md` - Firestore schema and required indexes
- `docs/SHEET_SCHEMA.md` - Google Sheets schema
- `docs/MAINTENANCE.md` - operations, aliases, debugging, and migrations
- `docs/ARCHITECTURE.md` - service flow and indexed query architecture
