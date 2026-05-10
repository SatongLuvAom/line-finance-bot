# Google Sheets Schema

The bot writes to spreadsheet ID from Script Property `SHEET_ID`.

## Sheet: `Expenses`

The header is created or repaired automatically by `ensureExpenseSheetHeader_()`.

| Column | Header | Description |
| --- | --- | --- |
| A | `type` | `expense` or `income` |
| B | `date` | Transaction date in `YYYY-MM-DD` |
| C | `merchant` | Shop, receiver, payer, or account name |
| D | `category` | Normalized category |
| E | `job` | Project/job name |
| F | `amount` | Final amount |
| G | `items` | Short item/service summary |
| H | `note` | Important note/remark |
| I | `laborWeek` | Labor week number |
| J | `laborMonth` | Thai labor month |
| K | `attachmentUrl` | Firebase Storage download URL |
| L | `attachmentPath` | Firebase Storage object path |
| M | `attachmentMimeType` | Stored attachment MIME type |
| N | `source` | Data source, currently `LINE_BOT` |
| O | `status` | `IMPORTED` or `PENDING_REVIEW` |
| P | `createdByLineUserId` | LINE user ID that created the record |
| Q | `createdByDisplayName` | LINE display name when profile lookup succeeds |
| R | `createdFromLineMessageId` | Original LINE message ID |
| S | `storageUrl` | Canonical Firebase Storage download URL |
| T | `storagePath` | Canonical Firebase Storage object path |
| U | `ocrRawText` | Raw/summarized OCR text for debugging |
| V | `ocrConfidence` | OCR confidence from `0` to `1` |
| W | `duplicateStatus` | `UNIQUE` or `POSSIBLE_DUPLICATE` |
| X | `possibleDuplicateIds` | Comma-separated possible duplicate document IDs |
| Y | `sheetSyncStatus` | `ok` or `error` |
| Z | `sheetSyncError` | Safe Sheet sync error message |
| AA | `parsedAt` | ISO timestamp after Gemini JSON parse |
| AB | `normalizedAt` | ISO timestamp after normalizer finished |

## Notes

- Sheet rows are appended after Firestore save.
- Edit/delete helpers attempt to update/delete the matching row by comparing the stored record fields.
- Firestore is the primary source of truth. Google Sheets is the operational reporting surface.
