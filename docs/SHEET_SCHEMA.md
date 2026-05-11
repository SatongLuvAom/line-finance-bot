# Google Sheets Schema

Google Sheets is a report/export layer only. Firestore is the source of truth for all bot commands, summaries, edits, deletes, duplicate checks, and sync status.

The bot writes to spreadsheet ID from Script Property `SHEET_ID`.

## Sheet: `Expenses`

The header is created or repaired automatically by `ensureExpenseSheetHeader_()`.

| Column | Header | Description |
| --- | --- | --- |
| A | `transactionId` | Firestore document ID |
| B | `date` | Transaction date in `YYYY-MM-DD` |
| C | `type` | `expense` or `income` |
| D | `job` | Normalized project/job name |
| E | `category` | Normalized category |
| F | `merchant` | Shop, receiver, payer, or account name |
| G | `payer` | Sender/payer when available |
| H | `amount` | Final amount |
| I | `status` | Firestore transaction status |
| J | `items` | Short item/service summary |
| K | `note` | Important note/remark |
| L | `laborWeek` | Labor week number |
| M | `laborMonth` | Thai labor month |
| N | `storageUrl` | Firebase Storage download URL |
| O | `createdByDisplayName` | LINE display name when available |
| P | `sheetSyncStatus` | `PENDING`, `PENDING_MANUAL`, `DISABLED`, `NOT_REQUIRED`, `SYNCED`, or `ERROR` |
| Q | `sheetSyncError` | Safe Sheet sync error JSON/string |
| R | `createdAt` | Firestore create timestamp |
| S | `updatedAt` | Firestore update timestamp |

## Excluded Heavy Fields

These fields must not be written to Google Sheets:

```text
ocrRawText
geminiRawResponse
rawFileData
storageMetadata
auditDetails
internal debug log
```

## Notes

- Sheet rows are upserted by `transactionId`, not used as primary storage.
- If Sheet sync fails, Firestore remains saved and `sheetSyncStatus=ERROR`.
- Commands must read from Firestore only.
