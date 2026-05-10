# Master Data / Alias

The bot normalizes common names through Apps Script Script Properties.

## Format

Use one canonical value per line:

```text
ชื่อมาตรฐาน=ชื่อเล่น1,ชื่อเล่น2,ชื่อเล่น3
```

## Supported Properties

| Property | Normalizes | Example |
| --- | --- | --- |
| `JOB_ALIASES` | Project/job names | `โรงงาน=Factory,โรงงานยัพพี,ส่วนกลางโรงงาน` |
| `MERCHANT_ALIASES` | Shop, vendor, receiver, worker names | `ไทวัสดุ=Thai Watsadu,ไทวัส,ไทวัสดุ สาขาบางนา` |
| `CATEGORY_ALIASES` | Expense/income categories | `ค่าขนส่ง=ค่าเดินทาง,ค่าน้ำมัน,น้ำมัน,ทางด่วน,grab` |
| `ITEM_ALIASES` | Item/detail names | `ค่าน้ำมัน=น้ำมัน,fuel,gasoline` |

## Recommended Baseline

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
ค่าเช่าอุปกรณ์=ค่าเช่า,เช่า,เช่าเครื่องมือ,เช่าเครน

ITEM_ALIASES
ค่าน้ำมัน=น้ำมัน,fuel,gasoline
ค่าทางด่วน=ทางด่วน,toll,expressway
ค่าส่งของ=ส่งของ,ค่าส่ง,delivery,shipping
```

## Operating Rules

- Keep the left side as the reporting name you want to see in summaries.
- Add OCR variants, English names, short names, and branch names on the right side.
- Avoid overly broad aliases such as `งาน`, `ร้าน`, `ของ`, or `จ่าย`.
- Aliases are exact after whitespace and punctuation normalization, not fuzzy matching.
- Alias changes affect new records and edited records. Existing old records stay unchanged until edited.
