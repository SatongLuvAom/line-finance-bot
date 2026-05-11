# Commands

All commands are sent as LINE text messages. Command calculations read from Firestore only.

## User Commands

| Command | Example | Output | Permission |
| --- | --- | --- | --- |
| `help` / `menu` / `เมนู` | `help` | Professional command guide | Allowed user |
| `วิธีส่งสลิป` | `วิธีส่งสลิป` | Slip and note-format guide | Allowed user |
| `หมายเหตุค่าใช้จ่าย` | `หมายเหตุค่าใช้จ่าย` | Recommended structured note formats | Allowed user |
| `เทส` / `test` | `เทส` | Bot status plus Group ID or User ID | Allowed user |
| `งานเดือนนี้` | `งานเดือนนี้` | Current-month active scopes grouped by job/factory | Allowed user |
| `สรุปงบ งาน...` | `สรุปงบ งานบูธA` | Total job budget summary across all months | Allowed user |
| `สรุปงบ โรงงาน` | `สรุปงบ โรงงาน` | Current-month factory/central expense summary | Allowed user |
| `ค่าแรง สัปดาห์ที่ X เดือน Y` | `ค่าแรง สัปดาห์ที่ 1 เมษายน` | Labor summary for the requested week/month | Allowed user |
| `รายการล่าสุด` / `ล่าสุด` | `รายการล่าสุด` | Latest active record for this chat/user scope | Allowed user |
| `ล่าสุด N` | `ล่าสุด 5` | Up to 10 latest active records | Allowed user |
| `แก้ล่าสุด ...` | `แก้ล่าสุด หมวด ค่าแรง` | Updates the latest record field | Allowed user |
| `บันทึกค่าแรง ...` | `บันทึกค่าแรง 500 งานเชื่อม 01/04/2026 เบิกสด` | Saves manual labor expense | Allowed user |

## Admin Commands

| Command | Example | Output | Permission |
| --- | --- | --- | --- |
| `ลบล่าสุด` | `ลบล่าสุด` | Shows delete confirmation prompt | Admin if configured |
| `ลบล่าสุด ยืนยัน` | `ลบล่าสุด ยืนยัน` | Deletes the pending latest record | Admin if configured |
| `sheet sync mode` | `sheet sync mode` | Current `SHEET_SYNC_MODE` and pending/error counts | Admin if configured |
| `sync sheet ล่าสุด` | `sync sheet ล่าสุด` | Sync latest transaction in this chat to Sheet | Admin if configured |
| `sync sheet วันนี้` | `sync sheet วันนี้` | Sync today's pending/error imported transactions | Admin if configured |
| `sync sheet เดือนนี้` | `sync sheet เดือนนี้` | Sync this month's pending/error imported transactions | Admin if configured |
| `sync sheet งาน...` | `sync sheet งานบูธA` | Sync pending/error imported transactions for one job | Admin if configured |
| `sync pending` | `sync pending` | Show pending/manual/error counts | Admin if configured |
| `sync pending retry` | `sync pending retry` | Sync up to 50 pending rows | Admin if configured |
| `sync error` | `sync error` | Show latest Sheet sync errors | Admin if configured |
| `sync error retry` | `sync error retry` | Retry up to 10 rows with `sheetSyncStatus=ERROR` | Admin if configured |
| `retry sync ...` | `retry sync DOCUMENT_ID` | Retry Sheet sync for one transaction | Admin if configured |
| `รายการ duplicate` / `รายการซ้ำ` / `duplicate` | `รายการ duplicate` | Show possible duplicate records | Admin if configured |

## Editable Latest Fields

Use `แก้ล่าสุด field value`.

| Field Input | Stored Field |
| --- | --- |
| `หมวด`, `category` | `category` |
| `งาน`, `โปรเจกต์`, `job` | `job` |
| `รายการ`, `items` | `items` |
| `ผู้รับ`, `ร้าน`, `merchant` | `merchant` |
| `ยอด`, `amount` | `amount` |
| `วันที่`, `date` | `date` |
| `สัปดาห์`, `laborWeek` | `laborWeek` |
| `หมายเหตุ`, `note` | `note` |

## Recommended Slip Notes

Use `_` as the delimiter.

| Use Case | Format | Example |
| --- | --- | --- |
| Labor | `ค่าแรง_W1_เม.ย._ชื่องาน` | `ค่าแรง_W1_เม.ย._งานบูธA` |
| Material | `หมวด_ชื่องาน_รายการ` | `วัสดุโครงสร้าง_งานบูธA_เหล็กกล่อง` |
| Transport | `ค่าขนส่ง_ชื่องาน_รายการ` | `ค่าขนส่ง_งานบูธA_ค่าน้ำมันรถ` |
| Factory/central expense | `หมวด_โรงงาน_รายการ` | `ค่าขนส่ง_โรงงาน_ค่าน้ำมันมาโรงงาน` |

Recommended factory examples:

```text
ค่าขนส่ง_โรงงาน_ค่าน้ำมันมาโรงงาน
ค่าขนส่ง_โรงงาน_ค่าทางด่วนมาโรงงาน
ค่าใช้จ่ายสำนักงาน_โรงงาน_กระดาษเอกสาร
ค่าสาธารณูปโภค_โรงงาน_ค่าไฟ
ค่าเช่าอุปกรณ์_โรงงาน_เช่าเครื่องมือ
วัสดุโครงสร้าง_โรงงาน_เหล็กซื้อเข้าสต็อก
อื่นๆ_โรงงาน_ค่าดำเนินการทั่วไป
```

Do not use `งานทั่วไป` when the expense clearly belongs to the factory. Keep `งานทั่วไป` only as the fallback when the bot/user truly does not know the job.

## Stable Summary Commands

Current query behavior:

| Command | Query Model |
| --- | --- |
| `สรุปงบ โรงงาน` | `isActive=true`, `status=IMPORTED`, current `monthKey`, `scopeType=FACTORY`, `scopeKey=FACTORY` |
| `สรุปงบ งาน...` | `isActive=true`, `status=IMPORTED`, `scopeType=JOB`, `scopeKey=jobId`; no `monthKey`; fallback to indexed `jobId` if old rows are not backfilled |
| `งานเดือนนี้` | `isActive=true`, `status=IMPORTED`, current `monthKey`, grouped by `scopeType/scopeKey` |
| `ค่าแรง สัปดาห์ที่ X เดือน Y` | `isActive=true`, `status=IMPORTED`, `categoryId=ค่าแรง`, `weekKey=YYYY-MM-WN` |

Summary commands never call receipt duplicate checks and never query `fileHash`, `fingerprint`, or Google Sheets.

## Indexed Query Notes

The following commands use indexed Firestore queries instead of collection scans:

```text
รายการล่าสุด
ล่าสุด 5
งานเดือนนี้
สรุปงบ งาน...
สรุปงบ โรงงาน
ค่าแรง สัปดาห์ที่ X เดือน Y
sync error
sync pending
sheet sync mode
sync sheet ล่าสุด
sync sheet วันนี้
sync sheet เดือนนี้
sync sheet งาน...
sync pending retry
sync error retry
retry sync DOCUMENT_ID
รายการ duplicate
แก้ล่าสุด ...
ลบล่าสุด
```
# Receipt Queue Admin Commands

These commands manage the asynchronous receipt queue. They are admin-only when `ADMIN_LINE_USER_IDS` is configured.

| Command | Example | Output |
| --- | --- | --- |
| `jobs ค้าง` / `queue status` | `queue status` | Counts `QUEUED`, `RETRY_PENDING`, `PROCESSING_PAUSED`, `PROCESSING`, and `FAILED` jobs |
| `process jobs` | `process jobs` | Manually runs `processPendingReceiptJobs(3)` |
| `retry jobs` | `retry jobs` | Moves retryable/failed jobs back to `QUEUED` |
| `failed jobs` | `failed jobs` | Lists latest failed jobs with sanitized errors |
| `gas usage วันนี้` | `gas usage วันนี้` | Shows today's process log counters |

Normal slip submission is unchanged for users. Image/PDF events are queued first and processed by the worker.
