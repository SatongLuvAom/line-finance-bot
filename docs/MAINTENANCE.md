# Maintenance

Firestore is the source of truth. Google Sheets is a report/export layer only.

## Add a New Command

1. Add the text match in `src/Command_Handler.gs`.
2. Keep existing user-facing commands backward compatible.
3. Put business logic in a service file, not directly in the router.
4. Use Firestore query helpers from `src/Firestore_Query.gs`.
5. Update `docs/COMMANDS.md` and `buildHelpMessage_()`.

## Add a New Category

1. Add the category to `EXPENSE_CATEGORY_OPTIONS` or `INCOME_CATEGORY_OPTIONS` in `src/Config.gs`.
2. Update `RECEIPT_PROMPT`.
3. Update `normalizeStructuredCategory_()` and `refineCategoryByRules()` if keyword detection is needed.
4. Update user note examples in `docs/COMMANDS.md`.

## Master Data / Alias

Aliases live in Apps Script Script Properties. Use one line per canonical value:

```text
Canonical Name=Alias1,Alias2,Alias3
```

Supported properties:

```text
JOB_ALIASES
MERCHANT_ALIASES
CATEGORY_ALIASES
ITEM_ALIASES
OWN_COMPANY_ALIASES
```

Recommended baseline:

```text
โรงงาน=Factory,โรงงานยัพพี,ส่วนกลางโรงงาน,ค่าใช้จ่ายโรงงาน
```

Rules:

- Put the clean reporting name on the left side.
- Keep aliases exact and specific.
- Do not use broad aliases that may collide with real project names.
- After changing aliases, run `testMasterDataAliases_()` and test one real slip.

## Factory / Overhead Standard

Use `โรงงาน` as the standard job name for expenses that are not tied to a customer project.

Examples:

```text
ค่าขนส่ง_โรงงาน_ค่าน้ำมันมาโรงงาน
ค่าขนส่ง_โรงงาน_ค่าทางด่วนมาโรงงาน
ค่าใช้จ่ายสำนักงาน_โรงงาน_กระดาษเอกสาร
ค่าสาธารณูปโภค_โรงงาน_ค่าไฟ
```

Do not use `งานทั่วไป` for known factory expenses. `งานทั่วไป` is only the fallback when the job is genuinely unknown.

## Summary Query Policy

Summary commands must use fixed Firestore query helpers:

```text
getFactorySummaryByMonth(monthKey)
getFactoryMonthlySummary(monthKey)
getJobTotalSummary(jobId)
getMonthlySummary(monthKey)
getLaborTransactionsByWeek(weekKey)
```

Rules:

- Do not call `getAllExpenses()` from normal LINE commands.
- Do not read Google Sheets to calculate command replies.
- Do not use `fileHash`, `fingerprint`, or duplicate-check queries in text commands.
- Do not add `orderBy` to total-only summary queries.
- If a summary needs recent rows, create a separate list query.
- Update `docs/FIRESTORE_QUERY_CATALOG.md` before adding a new query/index shape.

## Backfill Query Keys

After deploying query-key changes, run these Apps Script functions manually:

```text
backfillExpenseQueryKeys(100)
backfillFactoryExpenseKeys(100)
backfillSummaryScopeKeys(100)
```

Rules:

- Batch size is capped at `200`.
- Run repeatedly until `hasNextPage=false`.
- `BACKFILL_EXPENSE_QUERY_KEYS_PAGE_TOKEN`, `BACKFILL_FACTORY_EXPENSE_KEYS_PAGE_TOKEN`, and `BACKFILL_SUMMARY_SCOPE_KEYS_PAGE_TOKEN` store cursors in Script Properties.
- Restart cursors with `resetExpenseQueryKeyBackfillCursor_()`, `resetFactoryExpenseKeyBackfillCursor_()`, or `resetSummaryScopeKeyBackfillCursor_()`.

`backfillSummaryScopeKeys(100)` fills:

```text
scopeType
scopeKey
monthKey
isActive
status
jobId
jobNameNormalized
reviewNeeded
```

Unknown rows become `scopeType=UNKNOWN`, `scopeKey=""`, and `reviewNeeded=true`.

## Query Logging

Every `queryExpenses()` call logs:

```text
queryName
filters
limit
resultCount
elapsedMs
status
```

Never log tokens, API keys, raw files, full OCR text, private keys, or credentials.

## Command Error Logging

Users should see only a safe error:

```text
เกิดข้อผิดพลาดระหว่างประมวลผล
รหัสอ้างอิง: ERR-xxxx
```

`auditLogs` and `processLogs` store redacted debugging fields:

```text
errorId
commandName
inputText
lineUserId
functionName
queryName
safeErrorMessage
stackTrace
createdAt
```

## Debug Gemini Parsing

1. Check Apps Script logs for `analyzeReceiptWithGemini.success` and `ai_parse`.
2. Inspect `logAiParsingResult_()` output.
3. Confirm the user wrote structured notes with `_`.
4. For bank transfer forms, inspect `AI_BankParser.gs`.
5. If bank service text is used as an item, update `isBankServiceNoise_()` and the prompt.

## Sheet Sync

`SHEET_SYNC_MODE` supports:

| Mode | Behavior |
| --- | --- |
| `OFF` | Do not sync Google Sheets; new rows use `DISABLED` |
| `MANUAL` | Save Firestore first, set `PENDING_MANUAL`, sync by admin command |
| `BATCH` | Save Firestore first, set `PENDING`, sync later; recommended default |
| `REALTIME` | Save Firestore first, then try Sheet upsert immediately |

Sheet sync failures must not delete or rollback Firestore records.

Admin helpers:

```text
retrySheetSync("DOCUMENT_ID_OR_FULL_DOCUMENT_NAME")
retrySheetSyncErrors(10)
syncPendingSheetRows(50)
exportTransactionsToSheetByMonth("2026-05")
exportTransactionsToSheetByJob("job_normalized")
```

LINE admin commands:

```text
sheet sync mode
sync error
sync error retry
sync pending
sync pending retry
sync sheet ล่าสุด
sync sheet วันนี้
sync sheet เดือนนี้
sync sheet งานบูธA
retry sync DOCUMENT_ID
```

## Firestore Index Maintenance

Use `firestore.indexes.json` as the source of truth for expected composite indexes. Do not add indexes blindly from error messages. First confirm the query belongs to the intended flow.

Current core indexes:

```text
isActive + sourceKey + createdAt
isActive + createdAt
isActive + status + monthKey + scopeType + scopeKey
isActive + status + scopeType + scopeKey
isActive + status + jobId
isActive + status + categoryId + weekKey
isActive + sheetSyncStatus + updatedAt
isActive + duplicateStatus + createdAt
sourceMessageId + createdAt
fileHash + isActive + createdAt
fingerprint + createdAt
isActive + dateKey + amount + createdAt
```

`fileHash` and `fingerprint` indexes are only for receipt/image/PDF duplicate guard. They must not be used by summary commands.

## Test Checklist

Run the safe Apps Script helper functions:

```text
testFactorySummaryNoRecords_()
testFactorySummaryExpenseRecords_()
testFactorySummaryMissingFields_()
testProjectSummaryStillUsesJobQuery_()
testJobSummaryRecords_()
testSummaryQueriesDoNotUseDuplicateKeys_()
testTextCommandRouteSeparation_()
testImageFileRouteUsesReceiptFlow_()
testSummaryScopeBackfillCases_()
testUserSeesSafeErrorOnly_()
testBotCommandsReadFirestore_()
testSheetSnapshotExcludesHeavyFields_()
```

Manual LINE checks:

```text
งานเดือนนี้
สรุปงบ โรงงาน
สรุปงบ งานบูธA
ค่าแรง สัปดาห์ที่ 1 เมษายน
รายการล่าสุด
ล่าสุด 5
```
# Receipt Queue Maintenance

## Manual Processing

Run this function in Apps Script when you want to process queued receipt files manually:

```javascript
processPendingReceiptJobs(3)
```

Use `1` for large PDF-heavy queues. The default batch size is `3` to stay under Apps Script runtime limits.

## Recommended Trigger

Create a time-driven trigger for:

```text
processPendingReceiptJobs
```

Recommended interval: every 1 or 5 minutes depending on traffic.

## Retry Policy

Receipt jobs use:

- `maxRetry = 3`
- retryable failures become `RETRY_PENDING`
- near-timeout jobs become `PROCESSING_PAUSED`
- exceeded retry jobs become `FAILED`
- duplicates become `DUPLICATE_SKIPPED`

Use LINE admin commands:

```text
queue status
process jobs
retry jobs
failed jobs
gas usage วันนี้
```

## Debugging Error IDs

When a job fails, inspect:

- `receipt_jobs.errorId`
- `receipt_jobs.safeError`
- `receipt_jobs.lastSafeError`
- `processLogs.executionId`
- `processLogs.urlFetchCount`
- `processLogs.geminiCallCount`

Never paste raw tokens/API keys into logs. Error messages are sanitized through `buildUserFriendlyErrorMessage_()`.

## Sheet Sync

`syncPendingSheetRows()` and `retrySheetSyncErrors()` use `LockService` now. If another sync is running, the function exits safely with `sheet_sync_lock_busy`.
