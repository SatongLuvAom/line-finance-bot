# Database Schema

Firestore is accessed through the REST API.

## Collection: `expenses`

| Field | Type | Description |
| --- | --- | --- |
| `type` | string | `expense` or `income` |
| `date` | string | Transaction date in `YYYY-MM-DD` |
| `merchant` | string | Shop, receiver, payer, or account name |
| `amount` | double | Final amount |
| `category` | string | Expense or income category |
| `items` | string | Short item/service summary |
| `note` | string | Important remark text |
| `job` | string | Project/job name |
| `laborWeek` | integer/string | Labor week number for labor records, blank when not labor |
| `laborMonth` | string | Thai month name for labor, blank when not labor |
| `sourceKey` | string | LINE source scope, e.g. `group:...` or `user:...` |
| `sourceMessageId` | string | LINE message ID for duplicate guard |
| `sourceMimeType` | string | `image/jpeg`, `application/pdf`, or `manual` |
| `attachmentUrl` | string | Firebase Storage download URL |
| `attachmentPath` | string | Firebase Storage object path |
| `attachmentMimeType` | string | Stored attachment MIME type |
| `source` | string | Data source, currently `LINE_BOT` |
| `status` | string | `IMPORTED` or `PENDING_REVIEW` |
| `createdByLineUserId` | string | LINE user ID that created the record |
| `createdByDisplayName` | string | LINE display name when profile lookup succeeds |
| `createdFromLineMessageId` | string | Original LINE message ID |
| `storageUrl` | string | Canonical Firebase Storage download URL |
| `storagePath` | string | Canonical Firebase Storage object path |
| `ocrRawText` | string | Raw/summarized OCR text for debugging |
| `ocrConfidence` | double | OCR confidence from `0` to `1`, `0` when unknown |
| `duplicateStatus` | string | `UNIQUE` or `POSSIBLE_DUPLICATE` |
| `possibleDuplicateIds` | array | Firestore document names that may duplicate this record |
| `sheetSyncStatus` | string | `pending`, `ok`, or `error` for Google Sheet sync |
| `sheetSyncError` | string | Safe error message when Sheet sync fails |
| `sheetSyncedAt` | string | ISO timestamp when Sheet sync was attempted |
| `parsedAt` | string | ISO timestamp after Gemini JSON parse |
| `normalizedAt` | string | ISO timestamp after normalizer finished |
| `createdAt` | string | ISO timestamp |

## Indexed Query Keys

Every new transaction must include these lightweight query keys. They are required so normal bot commands do not full-scan `expenses`.

| Field | Type | Source | Used By |
| --- | --- | --- | --- |
| `isActive` | boolean | `true` unless `status` is `DELETED` or `REJECTED` | All normal list/summary queries |
| `dateKey` | string | `occurredAt`/`date` as `YYYY-MM-DD` | Duplicate guard, date filters |
| `monthKey` | string | first 7 chars of `dateKey`, e.g. `2026-05` | `งานเดือนนี้`, monthly summaries |
| `weekKey` | string | `YYYY-MM-WN`; labor uses `laborWeek` when present | Labor summaries |
| `jobId` | string | stable normalized ID from `jobNameNormalized` | `สรุปงบ ...`, budget alert |
| `jobNameNormalized` | string | canonical job name after `JOB_ALIASES` | Display/grouping |
| `categoryId` | string | stable normalized ID from category | Labor/category queries |
| `vendorId` | string | stable normalized ID from merchant for non-labor | Vendor reporting |
| `workerId` | string | stable normalized ID from merchant for labor | Worker reporting |
| `occurredAt` | string | transaction occurrence date/time, usually `date` | ordering/date analytics |
| `updatedAt` | string | last Firestore update ISO timestamp | sync error sorting |
| `fingerprint` | string | stable comparable transaction fingerprint | exact duplicate lookup |

Heavy fields must not be selected by normal list/summary queries:

```text
ocrRawText
geminiRawResponse
rawFileData
storageMetadata
```

Backfill old records with:

```text
backfillExpenseQueryKeys(100)
```

Run repeatedly until `hasNextPage=false`.

## Required Firestore Indexes

Create these composite indexes in Firebase Console for production traffic:

| Query | Fields |
| --- | --- |
| Latest by chat | `isActive ASC`, `sourceKey ASC`, `createdAt DESC` |
| Latest global/dev | `isActive ASC`, `createdAt DESC` |
| Active jobs this month | `isActive ASC`, `monthKey ASC`, `occurredAt DESC` |
| Project summary | `isActive ASC`, `jobId ASC`, `occurredAt DESC` |
| Labor summary | `isActive ASC`, `categoryId ASC`, `weekKey ASC`, `occurredAt ASC`, `createdAt ASC` |
| Sheet sync errors | `isActive ASC`, `sheetSyncStatus ASC`, `updatedAt DESC` |
| Possible duplicates | `isActive ASC`, `duplicateStatus ASC`, `createdAt DESC` |
| Duplicate guard | `isActive ASC`, `dateKey ASC`, `amount ASC`, `createdAt DESC` |
| Source message duplicate guard | `sourceMessageId ASC` |
| Fingerprint lookup | `fingerprint ASC` |

## Example `expenses` Document

```json
{
  "type": "expense",
  "date": "2026-04-09",
  "merchant": "นาย สุกันธ์ ถึงแสง",
  "amount": 6208,
  "category": "ค่าแรง",
  "items": "ค่าแรง",
  "note": "ค่าแรง_W1_เม.ย._งานบูธA",
  "job": "ค่าแรงประจำสัปดาห์ที่ 1 เดือน เมษายน",
  "laborWeek": 1,
  "laborMonth": "เมษายน",
  "sourceKey": "group:xxxxxxxx",
  "sourceMessageId": "xxxxxxxx",
  "sourceMimeType": "application/pdf",
  "attachmentUrl": "https://firebasestorage.googleapis.com/...",
  "attachmentPath": "receipts/2026-04-09/xxxxxxxx.pdf",
  "attachmentMimeType": "application/pdf",
  "source": "LINE_BOT",
  "status": "IMPORTED",
  "createdByLineUserId": "Uxxxxxxxx",
  "createdByDisplayName": "Boss",
  "createdFromLineMessageId": "xxxxxxxx",
  "storageUrl": "https://firebasestorage.googleapis.com/...",
  "storagePath": "receipts/2026/04/xxxxxxxx.pdf",
  "ocrRawText": "{...}",
  "ocrConfidence": 0,
  "duplicateStatus": "UNIQUE",
  "possibleDuplicateIds": [],
  "sheetSyncStatus": "ok",
  "sheetSyncError": "",
  "sheetSyncedAt": "2026-05-01T05:00:01.000Z",
  "parsedAt": "2026-05-01T05:00:00.500Z",
  "normalizedAt": "2026-05-01T05:00:00.700Z",
  "createdAt": "2026-05-01T05:00:00.000Z"
}
```

## Collection: `auditLogs`

| Field | Type | Description |
| --- | --- | --- |
| `timestamp` | string | ISO timestamp |
| `traceId` | string | Request trace ID when available |
| `action` | string | `create_expense`, `update_expense`, `delete_expense`, `webhook_error`, `ai_parse` |
| `lineUserId` | string | LINE user ID when available |
| `recordId` | string | Firestore document name/path when available |
| `oldValue` | string | JSON snapshot before change |
| `newValue` | string | JSON snapshot after change |
| `status` | string | `ok` or `error` |
| `errorMessage` | string | Error message for failed actions |
