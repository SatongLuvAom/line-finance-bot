# Deployment

## Apps Script Setup

1. Create an Apps Script project.
2. Copy all files in `src/` into the Apps Script editor or push with clasp.
3. Confirm the manifest file is named `appsscript.json`.
4. Confirm runtime is V8 and timezone is `Asia/Bangkok`.
5. Add all required Script Properties.

## Manifest

The manifest keeps these scopes:

```json
[
  "https://www.googleapis.com/auth/script.external_request",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/datastore",
  "https://www.googleapis.com/auth/cloud-platform"
]
```

The web app runs as `USER_DEPLOYING` and allows `ANYONE_ANONYMOUS` so LINE can call the webhook.

## Script Properties

Required:

- `LINE_TOKEN`
- `GEMINI_KEY`
- `FIREBASE_PROJECT_ID`
- `SHEET_ID` unless `SHEET_SYNC_MODE=OFF`

Recommended:

- `FIREBASE_STORAGE_BUCKET`
- `SHEET_SYNC_MODE` (`OFF`, `MANUAL`, `BATCH`, `REALTIME`; default `BATCH`)
- `WEBHOOK_SECRET`
- `OWN_COMPANY_ALIASES`
- `JOB_ALIASES`
- `MERCHANT_ALIASES`
- `CATEGORY_ALIASES`
- `ITEM_ALIASES`
- `ALLOWED_LINE_USER_IDS`
- `ADMIN_LINE_USER_IDS`

Alias format:

```text
ชื่อมาตรฐาน=ชื่อเล่น1,ชื่อเล่น2,ชื่อเล่น3
```

Recommended examples:

```text
# JOB_ALIASES
โรงงาน=Factory,โรงงานยัพพี,ส่วนกลางโรงงาน,ค่าใช้จ่ายโรงงาน
งานบูธA=บูธA,booth a,งานA

# MERCHANT_ALIASES
ไทวัสดุ=Thai Watsadu,ไทวัส,ไทวัสดุ สาขาบางนา
นายสมชาย=สมชาย,ช่างชาย,นาย สมชาย

# CATEGORY_ALIASES
ค่าขนส่ง=ค่าเดินทาง,ค่าน้ำมัน,น้ำมัน,ทางด่วน,grab
วัสดุโครงสร้าง=วัสดุ,เหล็ก,ไม้,อุปกรณ์

# ITEM_ALIASES
ค่าน้ำมัน=น้ำมัน,fuel,gasoline
ค่าทางด่วน=ทางด่วน,toll,expressway
```

The bot also includes this factory alias set by default, but keeping it in Script Properties makes the operating standard explicit for the team.

Optional development:

- `ENABLE_DEV_WRITES=true`

## LINE Webhook Setup

1. Deploy Apps Script as web app.
2. Copy the deployment URL.
3. If `WEBHOOK_SECRET` is set, append `?key=YOUR_SECRET` to the webhook URL.
4. Paste the URL into LINE Developers webhook settings.
5. Enable webhook.
6. Send `เทส` in LINE and confirm the bot replies.

## Firebase Setup

1. Use the same Google Cloud project as `FIREBASE_PROJECT_ID`.
2. Enable Firestore Native mode.
3. Enable Firebase Storage.
4. Set `FIREBASE_STORAGE_BUCKET` to the bucket name, for example `project-id.appspot.com`.
5. Apps Script uses `ScriptApp.getOAuthToken()` with Cloud Platform scope.
6. Create the composite indexes listed in `firestore.indexes.json`.
7. After deploying the summary scope refactor, run `backfillSummaryScopeKeys(100)` repeatedly until `hasNextPage=false`.

## Google Sheets Setup

1. Create a spreadsheet.
2. Copy the spreadsheet ID into `SHEET_ID`.
3. Set `SHEET_SYNC_MODE=BATCH` for the recommended production default.
4. The bot will create or repair the `Expenses` sheet header automatically.
5. Remember: Sheets is a report/export layer only. Firestore is the source of truth.

To pause Sheet writes without stopping the bot, set:

```text
SHEET_SYNC_MODE=OFF
```

## clasp Usage

If using clasp, keep `src/appsscript.json` as the manifest and run:

```powershell
clasp push
clasp deploy
```

Do not commit `.clasp.json` if it exposes project information you do not want shared.
# Queue Worker Deployment

After pushing Apps Script source, create or verify a time-driven trigger:

| Function | Trigger | Purpose |
| --- | --- | --- |
| `processPendingReceiptJobs` | Time-driven, every 1-5 minutes | Processes queued LINE image/PDF receipt jobs |
| `processPendingSheetSync` | Optional time-driven trigger | Syncs pending Sheet report rows when using `BATCH` mode |

Manual first-run test:

```javascript
processPendingReceiptJobs(1)
```

Then send a slip in LINE and confirm:

1. LINE replies immediately with queued message.
2. `receipt_jobs` gets a `QUEUED` document.
3. Worker changes the job to `COMPLETED` or `NEEDS_REVIEW`/`FAILED` path.
4. `expenses` receives the transaction.
5. `processLogs` receives execution metrics.

If the queue fails to create, webhook falls back to inline receipt processing for compatibility.
