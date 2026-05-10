# Commands

All commands are sent as LINE text messages.

| Command | Example | Expected Output | Permission |
| --- | --- | --- | --- |
| `help` / `menu` / `เมนู` | `help` | Professional command guide | Allowed user |
| `วิธีส่งสลิป` | `วิธีส่งสลิป` | Slip and note-format guide | Allowed user |
| `หมายเหตุค่าใช้จ่าย` | `หมายเหตุค่าใช้จ่าย` | Recommended structured note formats | Allowed user |
| `เทส` / `test` | `เทส` | Bot status plus Group ID or User ID | Allowed user |
| `งานเดือนนี้` | `งานเดือนนี้` | Active jobs with spending this month | Allowed user |
| `สรุปงบ ...` | `สรุปงบ งานบูธA` | Project budget summary | Allowed user |
| `ค่าแรง สัปดาห์ที่ ...` | `ค่าแรง สัปดาห์ที่ 1 เมษายน` | Labor summary for week/month | Allowed user |
| `รายการล่าสุด` / `ล่าสุด` | `รายการล่าสุด` | Latest record for this chat/user scope | Allowed user |
| `ล่าสุด N` | `ล่าสุด 5` | Up to 10 latest records | Allowed user |
| `แก้ล่าสุด ...` | `แก้ล่าสุด หมวด ค่าแรง` | Updates the latest record field | Allowed user |
| `ลบล่าสุด` | `ลบล่าสุด` | Shows delete confirmation prompt | Admin if configured |
| `ลบล่าสุด ยืนยัน` | `ลบล่าสุด ยืนยัน` | Deletes latest pending record | Admin if configured |
| `บันทึกค่าแรง ...` | `บันทึกค่าแรง 500 งานเชื่อม 01/04/2026 เบิกสด` | Saves manual labor expense | Allowed user |

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
| Structural material | `วัสดุโครงสร้าง_ชื่องาน_รายการ` | `วัสดุโครงสร้าง_งานบูธA_เหล็กกล่อง` |
| Decorative material | `วัสดุตกแต่ง_ชื่องาน_รายการ` | `วัสดุตกแต่ง_งานบูธA_ผ้า` |
| Printing/graphic | `งานพิมพ์/กราฟิก_ชื่องาน_รายการ` | `งานพิมพ์/กราฟิก_งานบูธA_สติกเกอร์` |
| Transport | `ค่าขนส่ง_ชื่องาน_รายการ` | `ค่าขนส่ง_งานบูธA_น้ำมันรถ` |
| Factory transport | `ค่าขนส่ง_โรงงาน_รายการ` | `ค่าขนส่ง_โรงงาน_ค่าน้ำมันมาโรงงาน` |
| Factory office expense | `ค่าใช้จ่ายสำนักงาน_โรงงาน_รายการ` | `ค่าใช้จ่ายสำนักงาน_โรงงาน_กระดาษเอกสาร` |
| Factory utility | `ค่าสาธารณูปโภค_โรงงาน_รายการ` | `ค่าสาธารณูปโภค_โรงงาน_ค่าไฟ` |
| Equipment rental | `ค่าเช่าอุปกรณ์_ชื่องาน_รายการ` | `ค่าเช่าอุปกรณ์_งานบูธA_เช่าเครน` |
| Other | `อื่นๆ_ชื่องาน_รายการ` | `อื่นๆ_งานบูธA_ค่าดำเนินการ` |

Best format is always `หมวด_ชื่องาน_รายการ`. The bot also supports `ชื่องาน_รายการ`, `รายการ_ชื่องาน`, and `หมวด_รายการ_ชื่องาน` when one side clearly looks like a job name, for example `งานแมว_เหล็ก`, `เหล็ก_งานแมว`, or `วัสดุ_สีเทา_งานแมว`.

## Factory / Overhead Expenses

Use `โรงงาน` as the standard job name for expenses that are not tied to a customer project.

Recommended examples:

```text
ค่าขนส่ง_โรงงาน_ค่าน้ำมันมาโรงงาน
ค่าขนส่ง_โรงงาน_ค่าทางด่วนมาโรงงาน
ค่าขนส่ง_โรงงาน_Grab มาโรงงาน
ค่าขนส่ง_โรงงาน_ค่ารถไปซื้อของเข้าโรงงาน
ค่าใช้จ่ายสำนักงาน_โรงงาน_กระดาษเอกสาร
ค่าสาธารณูปโภค_โรงงาน_ค่าไฟ
ค่าเช่าอุปกรณ์_โรงงาน_เช่าเครื่องมือ
วัสดุโครงสร้าง_โรงงาน_เหล็กซื้อเข้าสต็อก
อื่นๆ_โรงงาน_ค่าดำเนินการทั่วไป
```

Use these commands to review factory expenses:

```text
สรุปงบ โรงงาน
งานเดือนนี้
ล่าสุด 5
```

Do not use `งานทั่วไป` when the expense is clearly for the factory. Keep `งานทั่วไป` only as a fallback when the job is genuinely unknown.

## Master Data / Alias

Aliases are managed in Apps Script Script Properties. Use one line per canonical value.

```text
ชื่อมาตรฐาน=ชื่อเล่น1,ชื่อเล่น2,ชื่อเล่น3
```

Recommended baseline:

```text
JOB_ALIASES
โรงงาน=Factory,โรงงานยัพพี,ส่วนกลางโรงงาน,ค่าใช้จ่ายโรงงาน
งานบูธA=บูธA,booth a,งานA

MERCHANT_ALIASES
ไทวัสดุ=Thai Watsadu,ไทวัส,ไทวัสดุ สาขาบางนา
นายสมชาย=สมชาย,ช่างชาย,นาย สมชาย

CATEGORY_ALIASES
ค่าขนส่ง=ค่าเดินทาง,ค่าน้ำมัน,น้ำมัน,ทางด่วน,grab
วัสดุโครงสร้าง=วัสดุ,เหล็ก,ไม้,อุปกรณ์

ITEM_ALIASES
ค่าน้ำมัน=น้ำมัน,fuel,gasoline
ค่าทางด่วน=ทางด่วน,toll,expressway
```

Aliases affect new receipt parsing, summaries, and `แก้ล่าสุด` for `งาน`, `ผู้รับ`, `หมวด`, and `รายการ`.

## Additional Maintenance Commands

| Command | Example | Expected Output | Permission |
| --- | --- | --- | --- |
| `sync error` / `sheet sync error` | `sync error` | Latest records whose Google Sheet sync failed | Admin if configured |
| `รายการ duplicate` / `รายการซ้ำ` / `duplicate` | `duplicate` | Latest possible duplicate records | Admin if configured |

## Indexed Query Notes

The following commands now use indexed Firestore queries instead of scanning all transactions:

```text
รายการล่าสุด
ล่าสุด 5
งานเดือนนี้
สรุปงบ งาน...
สรุปงบ โรงงาน
ค่าแรง สัปดาห์ที่ X เดือน Y
sync error
รายการ duplicate
แก้ล่าสุด ...
ลบล่าสุด
```

For `สรุปงบ ...`, the job name is normalized through `JOB_ALIASES` and matched by `jobId`. Keep job aliases up to date so summaries remain exact and fast.
