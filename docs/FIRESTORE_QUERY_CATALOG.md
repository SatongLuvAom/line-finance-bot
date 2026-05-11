# Firestore Query Catalog

Firestore is the source of truth. Google Sheets is a report/export layer only.

This catalog documents the allowed query shapes for normal bot commands. Do not add dynamic filters from command handlers and do not add indexes from Firestore errors without checking this file first.

## Text Commands

| Command | Function Flow | Filter Fields | Order By | Limit | Required Index | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `รายการล่าสุด` | `handleTextMessage()` -> `getRecentExpenseRecords_()` -> `getLatestTransactionDocumentsBySourceKey_()` | `isActive`, `sourceKey` | `createdAt DESC` | `1` | `isActive ASC`, `sourceKey ASC`, `createdAt DESC`, `__name__ DESC` | Text command only. No duplicate/file query. |
| `ล่าสุด 5` | `handleTextMessage()` -> `getRecentExpenseRecords_()` -> `getLatestTransactionDocumentsBySourceKey_()` | `isActive`, `sourceKey` | `createdAt DESC` | `1..10` | `isActive ASC`, `sourceKey ASC`, `createdAt DESC`, `__name__ DESC` | Text command only. |
| `งานเดือนนี้` | `handleTextMessage()` -> `getActiveJobsThisMonthText_()` -> `getMonthlySummary()` -> `getSummaryTransactionsByMonth()` | `isActive`, `status`, `monthKey` | none | `1000` | `isActive ASC`, `status ASC`, `monthKey ASC` | Groups by `scopeType/scopeKey` in memory after bounded query. |
| `สรุปงบ โรงงาน` | `handleTextMessage()` -> `handleFactorySummaryCommand()` -> `getFactoryMonthlySummary()` -> `getSummaryTransactionsByScope_()` | `isActive`, `status`, `monthKey`, `scopeType`, `scopeKey` | none | `500` | `isActive ASC`, `status ASC`, `monthKey ASC`, `scopeType ASC`, `scopeKey ASC` | Monthly factory/central expense summary only. |
| `สรุปงบ งาน...` | `handleTextMessage()` -> `handleJobSummaryCommand()` -> `getJobTotalSummary()` -> `getSummaryTransactionsByScopeTotal_()` | `isActive`, `status`, `scopeType`, `scopeKey` | none | `1000` | `isActive ASC`, `status ASC`, `scopeType ASC`, `scopeKey ASC` | Total project summary across all months. |
| `สรุปงบ งาน...` fallback | `handleJobSummaryCommand()` -> `getJobTotalSummaryByJobId()` | `isActive`, `status`, `jobId` | none | `1000` | `isActive ASC`, `status ASC`, `jobId ASC` | Used only when old records do not have `scopeType/scopeKey` yet. |
| `ค่าแรง สัปดาห์ที่ X เดือน Y` | `handleTextMessage()` -> `getLaborSummaryByWeekAndMonth()` -> `getLaborTransactionsByWeek()` | `isActive`, `status`, `categoryId`, `weekKey` | none | `500` | `isActive ASC`, `status ASC`, `categoryId ASC`, `weekKey ASC` | Excludes pending/rejected/deleted rows. |
| `sync error` | `handleTextMessage()` -> `getSheetSyncErrors()` | `isActive`, `sheetSyncStatus` | `updatedAt DESC` | `10` | `isActive ASC`, `sheetSyncStatus ASC`, `updatedAt DESC`, `__name__ DESC` | Admin command. |
| `รายการ duplicate` | `handleTextMessage()` -> `getPossibleDuplicates()` | `isActive`, `duplicateStatus` | `createdAt DESC` | `10` | `isActive ASC`, `duplicateStatus ASC`, `createdAt DESC`, `__name__ DESC` | Admin command. |

## File Events

| Event | Function Flow | Filter Fields | Order By | Limit | Required Index | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Image/PDF duplicate by LINE message | `routeImageMessage_()` / `routeFileMessage_()` -> `processReceipt()` -> `findExpenseBySourceMessageId_()` | `sourceMessageId` | `createdAt DESC` | `1` | `sourceMessageId ASC`, `createdAt DESC`, `__name__ DESC` | Runs before file download/OCR. |
| Image/PDF duplicate by file hash | `processReceipt()` -> `fetchLineFileAsBase64()` -> `getTransactionByFileHash_()` | `fileHash`, `isActive` | `createdAt DESC` | `1` | `fileHash ASC`, `isActive ASC`, `createdAt DESC`, `__name__ DESC` | File event only. Never used by text summaries. |
| Image/PDF duplicate by fingerprint | `processReceipt()` -> `getTransactionByFingerprint()` | `fingerprint` | `createdAt DESC` | `1` | `fingerprint ASC`, `createdAt DESC`, `__name__ DESC` | File event only after parsing. |
| Possible duplicate scan | `processReceipt()` -> `inspectPossibleDuplicateReceipts_()` -> `getDocumentsForDuplicateCheck_()` | `isActive`, `dateKey`, `amount` | `createdAt DESC` | `50` | `isActive ASC`, `dateKey ASC`, `amount ASC`, `createdAt DESC`, `__name__ DESC` | File event only after normalization. |

## Rules

- `สรุปงบ โรงงาน` is monthly only and must include current `monthKey`.
- `สรุปงบ งาน...` is total across all months and must not include `monthKey`.
- If `สรุปงบ งาน...` finds no rows by `scopeType/scopeKey`, it may fallback to indexed `jobId` without `monthKey`.
- Summary commands must not query `fileHash`, `fingerprint`, or `duplicateStatus`.
- Summary commands that only total amounts must not use `orderBy`.
- Text commands must not download LINE files, call Gemini, or run duplicate checks.
- File/image/PDF events are the only flow allowed to run duplicate checks and OCR.
- If a new command needs a new query shape, add it here before adding indexes.
# Receipt Queue Queries

These queries are for worker/admin operations, not budget summary commands.

| Use | Function | Filters | Order By | Limit | Notes |
| --- | --- | --- | --- | --- | --- |
| Queue status | `getReceiptJobsByStatus_()` | `status` | none | 50 | Runs once per queue status |
| Pending worker jobs | `getPendingReceiptJobs_()` | `status=QUEUED`, `RETRY_PENDING`, `PROCESSING_PAUSED` | none | 3 default | Worker intentionally avoids orderBy to reduce composite index needs |
| Existing queued job | `getReceiptJobByLineMessageId_()` | `lineMessageId` | none | 1 | Used before creating duplicate queue jobs |

Summary commands remain unchanged:

- `สรุปงบ โรงงาน` uses `scopeType=FACTORY`, `scopeKey=FACTORY`, and current `monthKey`.
- `สรุปงบ งาน...` uses `scopeType=JOB`, `scopeKey=jobId`, no `monthKey`.
- Summary queries must not use `fileHash`, `fingerprint`, or receipt queue fields.
