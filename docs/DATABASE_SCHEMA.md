# Database Schema

Firestore is the source of truth. Google Sheets is only a report/export layer.

## Collection: `expenses`

Core transaction fields:

| Field | Type | Description |
| --- | --- | --- |
| `type` | string | `expense` or `income` |
| `date` | string | Transaction date in `YYYY-MM-DD` |
| `occurredAt` | string | Transaction occurrence date/time, usually the same as `date` |
| `merchant` | string | Shop, receiver, payer, or account name |
| `amount` | double | Final amount |
| `category` | string | Expense or income category |
| `items` | string | Short item/service summary |
| `note` | string | Important remark text |
| `job` | string | Project/job display name |
| `status` | string | `IMPORTED`, `PENDING_REVIEW`, `REJECTED`, or `DELETED` |
| `isActive` | boolean | `true` unless status is `REJECTED` or `DELETED` |
| `createdAt` | string | ISO timestamp |
| `updatedAt` | string | ISO timestamp |

Indexed query keys:

| Field | Type | Description |
| --- | --- | --- |
| `dateKey` | string | `YYYY-MM-DD` date key from `occurredAt`/`date` |
| `monthKey` | string | `YYYY-MM` month key from `occurredAt`/`date` |
| `weekKey` | string | `YYYY-MM-WN`, used by labor summaries |
| `jobId` | string | Stable normalized ID from `jobNameNormalized` |
| `jobNameNormalized` | string | Canonical job name after `JOB_ALIASES` |
| `scopeType` | string | `FACTORY`, `JOB`, or `UNKNOWN` |
| `scopeKey` | string | `FACTORY`, `jobId`, or blank for unknown scope |
| `reviewNeeded` | boolean | `true` when scope cannot be inferred safely |
| `costCenter` | string | Legacy/compatibility value, `FACTORY` for central expenses |
| `scope` | string | Legacy/compatibility value, `FACTORY` or `PROJECT` |
| `isFactoryExpense` | boolean | Compatibility flag for factory records |
| `factoryReviewNeeded` | boolean | Compatibility review flag for factory migration |
| `categoryId` | string | Stable normalized ID from category |
| `vendorId` | string | Stable normalized ID from merchant for non-labor |
| `workerId` | string | Stable normalized ID from merchant for labor |
| `createdByLineUserId` | string | LINE user ID that created the record |
| `fingerprint` | string | Stable comparable transaction fingerprint |
| `duplicateStatus` | string | `UNIQUE` or `POSSIBLE_DUPLICATE` |
| `sheetSyncStatus` | string | `PENDING`, `PENDING_MANUAL`, `DISABLED`, `NOT_REQUIRED`, `SYNCED`, or `ERROR` |

Receipt/source fields:

| Field | Type | Description |
| --- | --- | --- |
| `source` | string | Usually `LINE_BOT` |
| `sourceKey` | string | LINE scope, e.g. `group:...`, `room:...`, or `user:...` |
| `sourceMessageId` | string | LINE message ID for duplicate guard |
| `sourceMimeType` | string | `image/jpeg`, `application/pdf`, or `manual` |
| `createdByDisplayName` | string | LINE display name when available |
| `createdFromLineMessageId` | string | Original LINE message ID |
| `storageUrl` | string | Firebase Storage download URL |
| `storagePath` | string | Firebase Storage object path |
| `fileHash` | string | SHA-256 hash of the original LINE file |
| `ocrRawText` | string | Raw/summarized OCR text for debugging |
| `ocrConfidence` | double | OCR confidence from `0` to `1`; `0` when unknown |
| `possibleDuplicateIds` | array | Possible duplicate Firestore document names |
| `sheetSyncError` | string | Safe Sheet sync error message |
| `sheetSyncedAt` | string | ISO timestamp when Sheet sync was attempted |
| `parsedAt` | string | ISO timestamp after Gemini JSON parse |
| `normalizedAt` | string | ISO timestamp after normalization |

Heavy fields must not be selected by list/summary commands or synced to Google Sheets:

```text
ocrRawText
geminiRawResponse
rawFileData
storageMetadata
auditDetails
internal debug log
```

## Stable Summary Scope Model

Budget and active-job summaries use one fixed model:

| Scope | Required Values |
| --- | --- |
| Factory / central expense | `status=IMPORTED`, `isActive=true`, `monthKey=YYYY-MM`, `scopeType=FACTORY`, `scopeKey=FACTORY` |
| Customer project/job | `status=IMPORTED`, `isActive=true`, `scopeType=JOB`, `scopeKey=jobId`; project summaries intentionally do not filter by month |
| Unknown | `scopeType=UNKNOWN`, `scopeKey=""`, `reviewNeeded=true`; excluded from normal summaries |

Summary queries must not use `fileHash`, `fingerprint`, `duplicateStatus`, dynamic category filters, or `orderBy`.

## Required Firestore Indexes

These indexes are the stable production set for current command/query flows:

| Query | Fields |
| --- | --- |
| Latest by chat/source | `isActive ASC`, `sourceKey ASC`, `createdAt DESC`, `__name__ DESC` |
| Latest global/dev fallback | `isActive ASC`, `createdAt DESC`, `__name__ DESC` |
| Summary by scope/month | `isActive ASC`, `status ASC`, `monthKey ASC`, `scopeType ASC`, `scopeKey ASC` |
| Summary by job total | `isActive ASC`, `status ASC`, `scopeType ASC`, `scopeKey ASC` |
| Summary by jobId fallback | `isActive ASC`, `status ASC`, `jobId ASC` |
| Labor summary by week | `isActive ASC`, `status ASC`, `categoryId ASC`, `weekKey ASC` |
| Sheet sync errors | `isActive ASC`, `sheetSyncStatus ASC`, `updatedAt DESC`, `__name__ DESC` |
| Possible duplicates | `isActive ASC`, `duplicateStatus ASC`, `createdAt DESC`, `__name__ DESC` |
| LINE message duplicate guard | `sourceMessageId ASC`, `createdAt DESC`, `__name__ DESC` |
| File hash duplicate guard | `fileHash ASC`, `isActive ASC`, `createdAt DESC`, `__name__ DESC` |
| Fingerprint lookup | `fingerprint ASC`, `createdAt DESC`, `__name__ DESC` |
| Possible duplicate scan | `isActive ASC`, `dateKey ASC`, `amount ASC`, `createdAt DESC`, `__name__ DESC` |

`docs/FIRESTORE_QUERY_CATALOG.md` maps each command/event to the exact query shape.

## Backfill

Run these Apps Script functions after deploying query-key changes:

```text
backfillExpenseQueryKeys(100)
backfillFactoryExpenseKeys(100)
backfillSummaryScopeKeys(100)
```

Run each repeatedly until `hasNextPage=false`. Batch size is capped at `200`.

`backfillSummaryScopeKeys(batchSize)` fills `scopeType`, `scopeKey`, `monthKey`, `isActive`, `status`, `jobId`, and `jobNameNormalized`. If the scope is uncertain, it sets `scopeType=UNKNOWN`, clears `scopeKey`, and marks `reviewNeeded=true`.

## Collections: `auditLogs` and `processLogs`

`auditLogs` stores financial safety events such as create/update/delete, AI parse, webhook error, command error, and Sheet sync status changes.

Command errors must include:

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

`processLogs` stores safe performance/process summaries such as receipt stage timings and Sheet sync batches. Logs must not contain tokens, API keys, raw file data, private keys, or full OCR payloads.
# Queue Collections

## `receipt_jobs`

`receipt_jobs` is the Firestore queue for LINE image/PDF receipt processing. Firestore remains the source of truth for transactions; this collection tracks asynchronous processing work.

| Field | Type | Notes |
| --- | --- | --- |
| `jobId` | string | Deterministic ID generated from LINE message ID |
| `lineMessageId` | string | LINE message ID used for first duplicate guard |
| `lineUserId` | string | User who submitted the file |
| `lineSourceJson` | string | Serialized LINE source object |
| `eventJson` | string | Serialized LINE event for worker reconstruction |
| `eventType` | string | Usually `message` |
| `fileType` | string | `image` or `file` |
| `fileName` | string | Original file name for PDF events when available |
| `captionText` | string | Reserved for future caption/manual note |
| `status` | string | `QUEUED`, `PROCESSING`, `PROCESSING_PAUSED`, `RETRY_PENDING`, `COMPLETED`, `FAILED`, `DUPLICATE_SKIPPED` |
| `priority` | number | Lower-level ordering hint; current default is `100` |
| `retryCount` | number | Incremented on retryable failure |
| `maxRetry` | number | Default `3` |
| `lockedBy` | string | Worker execution ID |
| `lockedAt` | string | ISO timestamp |
| `createdAt` | string | ISO timestamp |
| `updatedAt` | string | ISO timestamp |
| `startedAt` | string | ISO timestamp |
| `finishedAt` | string | ISO timestamp |
| `errorId` | string | Safe support reference |
| `safeError` | string | Sanitized error message |
| `lastErrorAt` | string | ISO timestamp |
| `lastSafeError` | string | Sanitized last error |
| `source` | string | `LINE_BOT` |
| `traceId` | string | Request trace ID |
| `sourceKey` | string | User/group/room scoped key |
| `transactionId` | string | Firestore transaction document name after completion |

## Transaction review statuses

Transactions can be auto-saved without user confirmation. If data is not reliable enough, the transaction should be saved with a review-oriented status:

| Status | Meaning |
| --- | --- |
| `IMPORTED` | Confirmed/usable transaction |
| `NEEDS_REVIEW` | Saved but important details need human review |
| `PARSE_INCOMPLETE` | File could not be parsed enough for a complete transaction |
| `PENDING_REVIEW` | Possible duplicate or low confidence legacy review state |
| `DELETED` | Deleted record |
| `REJECTED` | Rejected record |
