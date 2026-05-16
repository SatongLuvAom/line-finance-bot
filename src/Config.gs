/**
 * Config.gs
 * ค่าคงที่ของระบบ และตัวช่วยอ่าน Script Properties
 */

const LABOR_CATEGORY_NAME = "ค่าแรง";

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3-flash-preview"
];

const EXPENSE_CATEGORY_OPTIONS = [
  "ค่าแรง",
  "วัสดุโครงสร้าง",
  "วัสดุตกแต่ง",
  "งานพิมพ์/กราฟิก",
  "ค่าขนส่ง",
  "ค่าเช่าอุปกรณ์",
  "ค่าสาธารณูปโภค",
  "ค่าใช้จ่ายสำนักงาน",
  "ภาษี/VAT",
  "อื่นๆ"
];

const INCOME_CATEGORY_OPTIONS = [
  "ค่าผลิตบูธ",
  "ค่าออกแบบ",
  "ค่าติดตั้ง",
  "ค่าขนส่ง",
  "เงินมัดจำ",
  "ค่างวดงาน",
  "อื่นๆ"
];

const EXPENSE_SHEET_HEADERS = [
  "transactionId",
  "date",
  "type",
  "job",
  "category",
  "merchant",
  "payer",
  "amount",
  "status",
  "items",
  "note",
  "laborWeek",
  "laborMonth",
  "storageUrl",
  "createdByDisplayName",
  "sheetSyncStatus",
  "sheetSyncError",
  "createdAt",
  "updatedAt"
];

const DEFAULT_OWN_COMPANY_HINTS = [
  "yuppie",
  "ยัพพี",
  "บริษัท ยัพพี"
];

const DEFAULT_JOB_ALIASES = [
  {
    canonical: "โรงงาน",
    aliases: [
      "Factory",
      "factory",
      "โรงงานยัพพี",
      "ส่วนกลางโรงงาน",
      "ค่าใช้จ่ายโรงงาน",
      "ค่าใช้จ่ายกลางโรงงาน"
    ]
  }
];

const DEFAULT_CATEGORY_ALIASES = [
  {
    canonical: "ค่าขนส่ง",
    aliases: ["ค่าเดินทาง", "เดินทาง", "ขนส่ง/เดินทาง", "ค่าน้ำมัน", "น้ำมัน", "ทางด่วน", "grab", "bolt", "taxi"]
  },
  {
    canonical: "ค่าเช่าอุปกรณ์",
    aliases: ["ค่าเช่า", "เช่า", "เช่าเครื่องมือ", "เช่าเครน", "เช่านั่งร้าน"]
  },
  {
    canonical: "วัสดุโครงสร้าง",
    aliases: ["วัสดุ", "วัสดุ/อุปกรณ์", "อุปกรณ์", "โครงสร้าง", "เหล็ก", "ไม้"]
  },
  {
    canonical: "วัสดุตกแต่ง",
    aliases: ["ตกแต่ง", "อะคริลิก", "ผ้า", "ของตกแต่ง"]
  },
  {
    canonical: "งานพิมพ์/กราฟิก",
    aliases: ["งานพิมพ์", "พิมพ์", "กราฟิก", "สติกเกอร์", "แบนเนอร์"]
  },
  {
    canonical: "ค่าใช้จ่ายสำนักงาน",
    aliases: ["สำนักงาน", "ออฟฟิศ", "office"]
  },
  {
    canonical: "ค่าสาธารณูปโภค",
    aliases: ["ค่าน้ำ", "ค่าไฟ", "ค่าเน็ต", "ไฟฟ้า", "น้ำประปา", "internet"]
  },
  {
    canonical: "ภาษี/VAT",
    aliases: ["ภาษี", "vat", "ภาษีvat"]
  }
];

const DEFAULT_MERCHANT_ALIASES = [];

const DEFAULT_ITEM_ALIASES = [
  {
    canonical: "ค่าน้ำมัน",
    aliases: ["น้ำมัน", "fuel", "gasoline"]
  },
  {
    canonical: "ค่าทางด่วน",
    aliases: ["ทางด่วน", "toll", "expressway"]
  },
  {
    canonical: "ค่าส่งของ",
    aliases: ["ส่งของ", "ค่าส่ง", "delivery", "shipping"]
  }
];

const PENDING_LABOR_CONFIRM_TTL_SEC = 21600;
const PENDING_DELETE_CONFIRM_TTL_SEC = 600;
const RECENT_RECEIPT_DUP_TTL_SEC = 1800;
const LINE_PROFILE_CACHE_TTL_SEC = 21600;
const FIRESTORE_EXPENSE_CACHE_TTL_MS = 15000;
const MASTER_DATA_CACHE_TTL_MS = 300000;
const RECORD_SOURCE_LINE_BOT = "LINE_BOT";
const RECORD_STATUS_PENDING_REVIEW = "PENDING_REVIEW";
const RECORD_STATUS_IMPORTED = "IMPORTED";
const RECORD_STATUS_CONFIRMED = RECORD_STATUS_IMPORTED;
const RECORD_STATUS_NEEDS_REVIEW = "NEEDS_REVIEW";
const RECORD_STATUS_PARSE_INCOMPLETE = "PARSE_INCOMPLETE";
const RECORD_STATUS_DELETED = "DELETED";
const RECORD_STATUS_REJECTED = "REJECTED";
const RECEIPT_JOB_STATUS_QUEUED = "QUEUED";
const RECEIPT_JOB_STATUS_PROCESSING = "PROCESSING";
const RECEIPT_JOB_STATUS_PROCESSING_PAUSED = "PROCESSING_PAUSED";
const RECEIPT_JOB_STATUS_RETRY_PENDING = "RETRY_PENDING";
const RECEIPT_JOB_STATUS_COMPLETED = "COMPLETED";
const RECEIPT_JOB_STATUS_FAILED = "FAILED";
const RECEIPT_JOB_STATUS_DUPLICATE_SKIPPED = "DUPLICATE_SKIPPED";
const RECEIPT_JOB_DEFAULT_MAX_RETRY = 3;
const RECEIPT_JOB_LOCK_TTL_MS = 10 * 60 * 1000;
const RECEIPT_JOB_DEFAULT_BATCH_SIZE = 3;
const RECEIPT_WORKER_AUTO_KICK_ENABLED = true;
const RECEIPT_WORKER_TRIGGER_HANDLER = "processPendingReceiptJobsFromTrigger";
const RECEIPT_WORKER_WATCHDOG_HANDLER = "processPendingReceiptJobsWatchdog";
const RECEIPT_WORKER_KICK_DELAY_MS = 60 * 1000;
const RECEIPT_WORKER_KICK_CACHE_TTL_SEC = 75;
const RECEIPT_DONE_NOTIFY_MODE_REPLY_THEN_PUSH = "REPLY_THEN_PUSH";
const RECEIPT_DONE_NOTIFY_MODE_REPLY_ONLY = "REPLY_ONLY";
const RECEIPT_DONE_NOTIFY_MODE_PUSH_ONLY = "PUSH_ONLY";
const RECEIPT_NOTIFICATION_STATUS_PENDING = "PENDING";
const RECEIPT_NOTIFICATION_STATUS_SENT = "SENT";
const RECEIPT_NOTIFICATION_STATUS_FAILED = "FAILED";
const RECEIPT_NOTIFICATION_STATUS_SKIPPED = "SKIPPED";
const RECEIPT_NOTIFICATION_METHOD_REPLY = "reply";
const RECEIPT_NOTIFICATION_METHOD_PUSH = "push";
const RECEIPT_NOTIFICATION_METHOD_SKIPPED = "skipped";
const DEFAULT_RECEIPT_ACK_ENABLED = false;
const DEFAULT_RECEIPT_DONE_NOTIFY_ENABLED = true;
const DEFAULT_RECEIPT_DONE_NOTIFY_MODE = RECEIPT_DONE_NOTIFY_MODE_REPLY_THEN_PUSH;
const DEFAULT_ENABLE_PROCESS_DONE_PUSH = true;
const DEFAULT_PROCESS_DONE_PUSH_ADMIN_ONLY = false;
const DEFAULT_MAX_PROCESS_DONE_PUSH_PER_DAY = 300;
const RUNTIME_GUARD_DEFAULT_MAX_MS = 270000;
const RUNTIME_GUARD_STOP_BUFFER_MS = 30000;
const FACTORY_JOB_NAME = "โรงงาน";
const FACTORY_COST_CENTER = "FACTORY";
const PROJECT_SCOPE = "PROJECT";
const FACTORY_SCOPE = "FACTORY";
const SUMMARY_SCOPE_TYPE_FACTORY = "FACTORY";
const SUMMARY_SCOPE_TYPE_JOB = "JOB";
const SUMMARY_SCOPE_TYPE_UNKNOWN = "UNKNOWN";
const SUMMARY_SCOPE_KEY_FACTORY = "FACTORY";
const DUPLICATE_STATUS_UNIQUE = "UNIQUE";
const DUPLICATE_STATUS_POSSIBLE_DUPLICATE = "POSSIBLE_DUPLICATE";
const SHEET_SYNC_MODE_OFF = "OFF";
const SHEET_SYNC_MODE_MANUAL = "MANUAL";
const SHEET_SYNC_MODE_BATCH = "BATCH";
const SHEET_SYNC_MODE_REALTIME = "REALTIME";
const DEFAULT_SHEET_SYNC_MODE = SHEET_SYNC_MODE_BATCH;
const AI_READ_MODE_OFF = "OFF";
const AI_READ_MODE_FALLBACK_ONLY = "FALLBACK_ONLY";
const AI_READ_MODE_ALWAYS = "ALWAYS";
const DEFAULT_AI_READ_MODE = AI_READ_MODE_ALWAYS;
const SHEET_SYNC_STATUS_PENDING = "PENDING";
const SHEET_SYNC_STATUS_PENDING_MANUAL = "PENDING_MANUAL";
const SHEET_SYNC_STATUS_DISABLED = "DISABLED";
const SHEET_SYNC_STATUS_NOT_REQUIRED = "NOT_REQUIRED";
const SHEET_SYNC_STATUS_SYNCED = "SYNCED";
const SHEET_SYNC_STATUS_OK = SHEET_SYNC_STATUS_SYNCED;
const SHEET_SYNC_STATUS_ERROR = "ERROR";
const FIRESTORE_EXPENSE_LIST_FIELD_MASKS = [
  "type",
  "date",
  "dateKey",
  "monthKey",
  "weekKey",
  "isActive",
  "merchant",
  "amount",
  "category",
  "categoryId",
  "items",
  "note",
  "job",
  "jobId",
  "jobNameNormalized",
  "costCenter",
  "scope",
  "scopeType",
  "scopeKey",
  "reviewNeeded",
  "isFactoryExpense",
  "factoryReviewNeeded",
  "vendorId",
  "workerId",
  "laborWeek",
  "laborMonth",
  "sourceKey",
  "sourceMessageId",
  "sourceMimeType",
  "attachmentUrl",
  "attachmentPath",
  "attachmentMimeType",
  "source",
  "status",
  "createdByLineUserId",
  "createdByDisplayName",
  "createdFromLineMessageId",
  "storageUrl",
  "storagePath",
  "fileHash",
  "ocrConfidence",
  "duplicateStatus",
  "possibleDuplicateIds",
  "fingerprint",
  "sheetSyncStatus",
  "sheetSyncError",
  "sheetSyncedAt",
  "parseMethod",
  "aiUsed",
  "parserConfidence",
  "missingFields",
  "warnings",
  "rawParserName",
  "parsedAt",
  "normalizedAt",
  "occurredAt",
  "createdAt",
  "updatedAt"
];
const LABOR_NOTE_FORMAT_EXAMPLE = "ค่าแรง_W1_เม.ย._งานบูธA";
const LABOR_NOTE_FORMAT_HINT = "ค่าแรง_W1_เม.ย._ชื่องาน";

const RECEIPT_PROMPT = `
คุณคือ AI อ่านเอกสารการเงินสำหรับธุรกิจผลิตบูธนิทรรศการ
วิเคราะห์รูปหรือ PDF แล้วตอบเป็น JSON ตาม schema เท่านั้น — ห้าม markdown ห้าม \`\`\`

━━ STEP 1 · type ━━
"expense" = จ่ายเงินออก (ซื้อของ จ่ายค่าแรง โอนให้คนอื่น)
"income"  = รับเงินเข้า (ลูกค้าโอนมา รับมัดจำ รับค่างวด)
→ income เมื่อ: YUPPIE หรือบริษัทเราเป็นฝั่ง "ผู้รับ" หรือเอกสารคือใบรับเงิน/ใบรับมัดจำ
→ expense เมื่อ: YUPPIE หรือบริษัทเราเป็นฝั่ง "ผู้โอน/Sender/From Account" และผู้รับไม่ใช่บริษัทเรา
→ ถ้า structured note เป็นหมวดรายจ่าย เช่น ค่าแรง วัสดุ ค่าขนส่ง ค่าเช่า ให้ถือเป็น expense เสมอ แม้เอกสารมีชื่อ YUPPIE

━━ STEP 2 · date ━━
รูปแบบ YYYY-MM-DD (ค.ศ. เท่านั้น) — ถ้าปี > 2400 ให้ลบ 543 — ไม่มีวันที่ใช้วันนี้

━━ STEP 3 · amount ━━
ใช้ยอดสุทธิสุดท้าย (รวม VAT / ยอดโอนจริง)
ห้ามใช้: subtotal, ราคาก่อน VAT, ยอดย่อย

━━ STEP 4 · merchant (ลำดับ priority สูงสุดไปต่ำสุด) ━━
1. สลิปธนาคาร → "Account Name / ชื่อบัญชี" ฝั่งผู้รับเสมอ
2. เอกสารค่าแรง → ชื่อใน "ผู้รับเงิน / รับโดย / ช่าง / คนงาน"
3. ใบเสร็จ/invoice → ชื่อร้านค้าหรือบริษัทผู้ขาย
4. ไม่มีเลย → "ไม่ระบุ"
ห้ามใช้เด็ดขาด: ชื่อ Sender / ผู้โอน / หัวบิลผู้ออกเอกสาร / YUPPIE (ยกเว้น income)

━━ STEP 5 · category (priority: remarks > รายการสินค้า > ชื่อร้าน) ━━
expense → เลือก 1 จาก:
  "ค่าแรง"             ← ค่าจ้าง ช่าง คนงาน รายวัน รายสัปดาห์ เบิกค่าแรง
  "วัสดุโครงสร้าง"     ← เหล็ก ไม้ HMR โครงสร้างบูธ
  "วัสดุตกแต่ง"        ← อะคริลิก ผ้า สี ของประดับ (ไม่ใช่โครงสร้าง)
  "งานพิมพ์/กราฟิก"    ← พิมพ์ สติกเกอร์ แบนเนอร์ กราฟิก
  "ค่าขนส่ง"           ← น้ำมัน รถ ทางด่วน Grab Taxi ขนส่ง
  "ค่าเช่าอุปกรณ์"     ← เช่าเครน นั่งร้าน เครื่องมือ รถ พื้นที่
  "ค่าสาธารณูปโภค"     ← ไฟฟ้า น้ำ อินเทอร์เน็ต
  "ค่าใช้จ่ายสำนักงาน" ← เครื่องเขียน อุปกรณ์สำนักงาน
  "ภาษี/VAT"           ← ภาษีมูลค่าเพิ่ม ภาษีหัก ณ ที่จ่าย
  "อื่นๆ"              ← ไม่เข้าหมวดใด
income → เลือก 1 จาก: "ค่าผลิตบูธ" | "ค่าออกแบบ" | "ค่าติดตั้ง" | "ค่าขนส่ง" | "เงินมัดจำ" | "ค่างวดงาน" | "อื่นๆ"
⚠ merchant เป็นชื่อบุคคล + ไม่มี context ค่าแรง → ใช้ "อื่นๆ" ห้ามเดาเป็น "ค่าแรง"

━━ STEP 6 · job ━━
ยึดชื่องานจากเอกสารตรงๆ ห้ามแต่งใหม่ — ไม่มี → "งานทั่วไป"
ถ้าเป็นค่าใช้จ่ายกลางที่ไม่ได้ผูกกับงานลูกค้า เช่น เดินทางมาโรงงาน ค่าน้ำมันมาโรงงาน ค่าทางด่วนมาโรงงาน หรือของใช้ในโรงงาน → ใช้ job="โรงงาน"

━━ structured note สำคัญที่สุด ━━
ถ้าหมายเหตุ/Remarks มีรูปแบบคั่นด้วย "_" ให้ใช้เป็นข้อมูลหลักก่อน OCR ส่วนอื่น:
ค่าแรง_W1_เม.ย._งานบูธA → category="ค่าแรง", week=1, month=เมษายน, job="งานบูธA", items="ค่าแรง"
วัสดุโครงสร้าง_งานบูธA_เหล็กกล่อง → category="วัสดุโครงสร้าง", job="งานบูธA", items="เหล็กกล่อง"
งานบูธA_เหล็กกล่อง → job="งานบูธA", category จากรายการ, items="เหล็กกล่อง"
เหล็กกล่อง_งานบูธA → job="งานบูธA", category จากรายการ, items="เหล็กกล่อง"
ค่าเช่าอุปกรณ์_งานบูธA_เช่าเครน → category="ค่าเช่าอุปกรณ์", job="งานบูธA", items="เช่าเครน"
ค่าขนส่ง_โรงงาน_ค่าน้ำมันมาโรงงาน → category="ค่าขนส่ง", job="โรงงาน", items="ค่าน้ำมันมาโรงงาน"
ค่าใช้จ่ายสำนักงาน_โรงงาน_กระดาษเอกสาร → category="ค่าใช้จ่ายสำนักงาน", job="โรงงาน", items="กระดาษเอกสาร"
ห้ามนำข้อความบริการธนาคารมาแทน structured note

━━ items & note ━━
items: สรุปรายการสินค้า/บริการสั้นๆ — ห้ามใส่ชื่อบริการธนาคาร (Product Name, Payment Advice ฯลฯ)
note: ข้อความหมายเหตุสำคัญ verbatim — สลิปธนาคาร: ใส่ชื่อบัญชีผู้รับซ้ำไว้ด้วย
ห้ามสร้าง field raw OCR ยาวๆ ใน JSON เช่น ocrRawText เพราะจะทำให้ JSON ใหญ่และพัง
ถ้าไม่แน่ใจ ให้ใส่ข้อความสั้นใน note เท่านั้น

━━ bank object ━━
is_transfer_slip: true เมื่อเป็นสลิปหรือเอกสารโอนเงิน
receiver_account_name: ชื่อบัญชีฝั่งรับ | sender_account_name: ชื่อบัญชีฝั่งโอน
remarks: ข้อความหมายเหตุ/Remarks ตรงตัว
structured note "ค่าแรง_W1_เม.ย._ชื่องาน" → ส่วน1=หมวด, ส่วน2=week, ส่วน3=เดือน, ส่วน4=job
`.trim();

var CONFIG_RUNTIME_CACHE_ = {
  loadedAt: 0,
  value: null
};

function getConfig() {
  const now = Date.now();
  if (
    CONFIG_RUNTIME_CACHE_.value &&
    now - CONFIG_RUNTIME_CACHE_.loadedAt < MASTER_DATA_CACHE_TTL_MS
  ) {
    return CONFIG_RUNTIME_CACHE_.value;
  }

  const props = PropertiesService.getScriptProperties();
  const aiReadMode = normalizeAiReadMode_(getOptionalScriptProperty_(props, "AI_READ_MODE"));

  const config = {
    lineToken: getRequiredScriptProperty_(props, "LINE_TOKEN"),
    lineChannelSecret: getOptionalScriptProperty_(props, "LINE_CHANNEL_SECRET"),
    geminiKey: aiReadMode === AI_READ_MODE_OFF
      ? getOptionalScriptProperty_(props, "GEMINI_KEY")
      : getRequiredScriptProperty_(props, "GEMINI_KEY"),
    firebaseProjectId: getRequiredScriptProperty_(props, "FIREBASE_PROJECT_ID"),
    firebaseStorageBucket: getOptionalScriptProperty_(props, "FIREBASE_STORAGE_BUCKET"),
    sheetId: getOptionalScriptProperty_(props, "SHEET_ID"),
    sheetSyncMode: normalizeSheetSyncMode_(getOptionalScriptProperty_(props, "SHEET_SYNC_MODE")),
    aiReadMode: aiReadMode,
    receiptAckEnabled: getBooleanScriptProperty_(props, "RECEIPT_ACK_ENABLED", DEFAULT_RECEIPT_ACK_ENABLED),
    receiptDoneNotifyEnabled: getBooleanScriptProperty_(props, "RECEIPT_DONE_NOTIFY_ENABLED", DEFAULT_RECEIPT_DONE_NOTIFY_ENABLED),
    receiptDoneNotifyMode: normalizeReceiptDoneNotifyMode_(getOptionalScriptProperty_(props, "RECEIPT_DONE_NOTIFY_MODE")),
    enableProcessDonePush: getBooleanScriptProperty_(props, "ENABLE_PROCESS_DONE_PUSH", DEFAULT_ENABLE_PROCESS_DONE_PUSH),
    processDonePushAdminOnly: getBooleanScriptProperty_(props, "PROCESS_DONE_PUSH_ADMIN_ONLY", DEFAULT_PROCESS_DONE_PUSH_ADMIN_ONLY),
    maxProcessDonePushPerDay: getPositiveIntScriptProperty_(props, "MAX_PROCESS_DONE_PUSH_PER_DAY", DEFAULT_MAX_PROCESS_DONE_PUSH_PER_DAY),
    webhookSecret: getOptionalScriptProperty_(props, "WEBHOOK_SECRET"),
    ownCompanyAliases: getListScriptProperty_(props, "OWN_COMPANY_ALIASES", DEFAULT_OWN_COMPANY_HINTS),
    jobAliases: getMapListScriptProperty_(props, "JOB_ALIASES").concat(DEFAULT_JOB_ALIASES),
    merchantAliases: getMapListScriptProperty_(props, "MERCHANT_ALIASES").concat(DEFAULT_MERCHANT_ALIASES),
    categoryAliases: getMapListScriptProperty_(props, "CATEGORY_ALIASES").concat(DEFAULT_CATEGORY_ALIASES),
    itemAliases: getMapListScriptProperty_(props, "ITEM_ALIASES").concat(DEFAULT_ITEM_ALIASES)
  };

  CONFIG_RUNTIME_CACHE_ = {
    loadedAt: now,
    value: config
  };

  return config;
}


function clearConfigRuntimeCache_() {
  CONFIG_RUNTIME_CACHE_ = {
    loadedAt: 0,
    value: null
  };
}


function clearConfigRuntimeCache() {
  clearConfigRuntimeCache_();
  return "OK";
}

function normalizeSheetSyncMode_(mode) {
  const value = String(mode || DEFAULT_SHEET_SYNC_MODE).trim().toUpperCase();
  if (
    value === SHEET_SYNC_MODE_OFF ||
    value === SHEET_SYNC_MODE_MANUAL ||
    value === SHEET_SYNC_MODE_BATCH ||
    value === SHEET_SYNC_MODE_REALTIME
  ) {
    return value;
  }
  return DEFAULT_SHEET_SYNC_MODE;
}

function normalizeAiReadMode_(mode) {
  const value = String(mode || DEFAULT_AI_READ_MODE).trim().toUpperCase();
  if (
    value === AI_READ_MODE_OFF ||
    value === AI_READ_MODE_FALLBACK_ONLY ||
    value === AI_READ_MODE_ALWAYS
  ) {
    return value;
  }
  return DEFAULT_AI_READ_MODE;
}

function normalizeReceiptDoneNotifyMode_(mode) {
  const value = String(mode || DEFAULT_RECEIPT_DONE_NOTIFY_MODE).trim().toUpperCase();
  if (
    value === RECEIPT_DONE_NOTIFY_MODE_REPLY_THEN_PUSH ||
    value === RECEIPT_DONE_NOTIFY_MODE_REPLY_ONLY ||
    value === RECEIPT_DONE_NOTIFY_MODE_PUSH_ONLY
  ) {
    return value;
  }
  return DEFAULT_RECEIPT_DONE_NOTIFY_MODE;
}

function getRequiredScriptProperty_(props, key) {
  const value = String(props.getProperty(key) || "").trim();
  if (!value) {
    throw new Error(`ยังไม่ได้ตั้งค่า Script Property: ${key}`);
  }
  return value;
}

function getOptionalScriptProperty_(props, key) {
  return String(props.getProperty(key) || "").trim();
}

function getBooleanScriptProperty_(props, key, defaultValue) {
  const raw = String(props.getProperty(key) || "").trim();
  if (!raw) return defaultValue === true;
  return /^(true|1|yes|y|on)$/i.test(raw);
}

function getPositiveIntScriptProperty_(props, key, defaultValue) {
  const raw = String(props.getProperty(key) || "").trim();
  const parsed = parseInt(raw, 10);
  if (!isFinite(parsed) || parsed <= 0) {
    return Math.max(1, parseInt(defaultValue, 10) || 1);
  }
  return parsed;
}

function getListScriptProperty_(props, key, defaultList) {
  const raw = String(props.getProperty(key) || "").trim();
  if (!raw) {
    return (defaultList || []).slice();
  }

  return raw
    .split(",")
    .map(function(item) {
      return String(item || "").trim();
    })
    .filter(Boolean);
}

function getMapListScriptProperty_(props, key) {
  const raw = String(props.getProperty(key) || "").trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(/\r?\n/)
    .map(function(line) {
      const parts = String(line || "").split("=");
      const canonical = String(parts.shift() || "").trim();
      const aliases = parts.join("=").split(",").map(function(alias) {
        return String(alias || "").trim();
      }).filter(Boolean);

      if (!canonical || !aliases.length) {
        return null;
      }

      return {
        canonical: canonical,
        aliases: aliases
      };
    })
    .filter(Boolean);
}

function getFirebaseStorageBucketCandidates_(config) {
  const candidates = [];
  const bucket = String(config && config.firebaseStorageBucket || "").trim();
  const projectId = String(config && config.firebaseProjectId || "").trim();

  if (bucket) {
    candidates.push(bucket);
  }

  if (projectId) {
    candidates.push(`${projectId}.firebasestorage.app`);
    candidates.push(`${projectId}.appspot.com`);
  }

  const unique = {};
  return candidates.filter(function(candidate) {
    const value = String(candidate || "").trim();
    if (!value || unique[value]) {
      return false;
    }
    unique[value] = true;
    return true;
  });
}
