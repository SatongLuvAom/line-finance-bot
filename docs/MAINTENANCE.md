# Maintenance

## Add a New Command

1. Add the matching condition in `src/Command_Handler.gs`.
2. Keep user-facing command text backward compatible.
3. Put business logic in a service file when the command does more than route or format text.
4. Add a helper named `handle...Command_()` if the command has reusable behavior.
5. Update `docs/COMMANDS.md` and `buildHelpMessage_()`.

## Add a New Category

1. Add the category to `EXPENSE_CATEGORY_OPTIONS` or `INCOME_CATEGORY_OPTIONS` in `src/Config.gs`.
2. Update the category rules in `RECEIPT_PROMPT`.
3. Update `normalizeStructuredCategory_()` and `refineCategoryByRules()` if keyword detection is needed.
4. Update `docs/COMMANDS.md` note-format examples if users should type the category.

## Manage Master Data / Alias

Aliases live in Apps Script Script Properties and use one line per canonical value.

```text
ชื่อมาตรฐาน=ชื่อเล่น1,ชื่อเล่น2,ชื่อเล่น3
```

Supported properties:

```text
JOB_ALIASES
MERCHANT_ALIASES
CATEGORY_ALIASES
ITEM_ALIASES
```

Rules:

- Put the clean reporting name on the left side.
- Put OCR variants, spelling variants, English names, and branch names on the right side.
- Keep aliases exact and specific. Do not use broad words that may collide with real project names.
- After changing aliases, run `testMasterDataAliases_()` and test one real slip.

Example:

```text
โรงงาน=Factory,โรงงานยัพพี,ส่วนกลางโรงงาน
ไทวัสดุ=Thai Watsadu,ไทวัส,ไทวัสดุ สาขาบางนา
ค่าขนส่ง=ค่าเดินทาง,ค่าน้ำมัน,น้ำมัน,ทางด่วน,grab
ค่าน้ำมัน=น้ำมัน,fuel,gasoline
```

## Factory / Overhead Standard

Use `โรงงาน` as the standard job name for expenses that are not tied to a customer project.

Examples:

```text
ค่าขนส่ง_โรงงาน_ค่าน้ำมันมาโรงงาน
ค่าใช้จ่ายสำนักงาน_โรงงาน_กระดาษเอกสาร
ค่าสาธารณูปโภค_โรงงาน_ค่าไฟ
```

Do not use `งานทั่วไป` for known factory expenses. `งานทั่วไป` should remain the fallback for unknown jobs only.

## Budget Alert Threshold

Budget alerts are sent only when a project expense total crosses each `100,000` baht threshold.

Examples:

```text
90,000 → 110,000  แจ้งเตือนเกิน 100,000
120,000 → 130,000 ไม่แจ้งซ้ำ
190,000 → 210,000 แจ้งเตือนเกิน 200,000
```

Income records are not counted as spending for budget alerts.

## Income / Expense Guard

Gemini may misread outgoing bank transfer documents as `income` when the document header contains the company name. The normalizer now overrides that result:

```text
Structured expense note found          → expense
Company is sender / From Account       → expense
Company is receiver / To Account       → income
Clear expense category/signal detected → expense
```

If this breaks on a new bank format, inspect `normalizeTransactionType_()` and the extracted `bank.sender_account_name` / `bank.receiver_account_name`.

## Debug Gemini Parsing

1. Check Apps Script logs for `analyzeReceiptWithGemini.success` and `ai_parse`.
2. Inspect the raw Gemini JSON before normalization using `logAiParsingResult_()`.
3. Confirm the user wrote structured notes with `_`, especially for labor.
4. For bank transfer forms, inspect `AI_BankParser.gs` functions:
   `detectBankDocumentType_()`, `detectBankName_()`, `extractReceiverAccountName_()`, and `extractBankRemarks_()`.
5. If Gemini returns bank service text as an item, update the prompt and `isBankServiceNoise_()`.

## Recover Edited or Deleted Data

Audit records are stored in Firestore collection `auditLogs`.

- `create_expense` stores the saved record in `newValue`.
- `update_expense` stores before/after snapshots in `oldValue` and `newValue`.
- `delete_expense` stores the deleted record in `oldValue`.

To recover, copy the JSON snapshot from `auditLogs`, recreate the document in `expenses`, and restore the sheet row if needed.

## Safe Test Helpers

Developer helpers live in `src/Test_Dev.gs`.

- `testTextCommand_()` returns the help text.
- `testReceiptJsonParse_()` tests normalization without external calls.
- `testManualLabor_()` tests labor week/month parsing.
- `testFirestoreSave_()` writes only when `ENABLE_DEV_WRITES=true`.
- `testSheetSave_()` writes only when `ENABLE_DEV_WRITES=true`.

Do not run write helpers in production unless you intentionally set `ENABLE_DEV_WRITES=true`.

## Firestore Indexed Query Policy

Normal bot commands must not call `getAllExpenses()`. Use `queryExpenses(options)` or one of these specialized helpers:

```text
getLatestTransactionByUser(userId)
getLatestTransactionsByUser(userId, limit)
getTransactionsByMonth(monthKey)
getTransactionsByJob(jobId, options)
getLaborTransactionsByWeek(weekKey)
getSheetSyncErrors(limit)
getPossibleDuplicates(limit)
getTransactionByFingerprint(fingerprint)
```

Allowed use of `getAllExpenses()` is limited to legacy/dev maintenance only.

## Backfill Query Keys

After deploying the indexed-query refactor, run this Apps Script function manually:

```text
backfillExpenseQueryKeys(100)
```

Rules:

- Max batch size is capped at `200`.
- The cursor is stored in Script Properties as `BACKFILL_EXPENSE_QUERY_KEYS_PAGE_TOKEN`.
- Run repeatedly until the returned result has `hasNextPage=false`.
- If you need to restart from the beginning, run `resetExpenseQueryKeyBackfillCursor_()`.

Backfill writes only lightweight query fields such as `isActive`, `dateKey`, `monthKey`, `weekKey`, `jobId`, `categoryId`, `fingerprint`, and sync/status keys.

## Query Logging

Every `queryExpenses()` call writes a safe log payload:

```text
queryName
filters
limit
resultCount
elapsedMs
status
```

Do not log tokens, API keys, raw files, or full OCR text.

## Firebase Index Maintenance

If Firestore returns an index error, open the Firebase Console link from the Apps Script log and create the suggested index. Expected production indexes are listed in `docs/DATABASE_SCHEMA.md`.

Common indexes:

- `isActive + sourceKey + createdAt`
- `isActive + monthKey + occurredAt`
- `isActive + jobId + occurredAt`
- `isActive + categoryId + weekKey + occurredAt + createdAt`
- `isActive + sheetSyncStatus + updatedAt`
- `isActive + duplicateStatus + createdAt`
- `isActive + dateKey + amount + createdAt`
