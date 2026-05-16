/**
 * AI_Normalizer.gs
 * Receipt normalization, category refinement, structured notes, and payee cleanup.
 */

function normalizeReceiptData(cleanJson) {
  const bankContext = normalizeBankContext_(cleanJson);
  const date = normalizeDateString(cleanJson.date);
  const amount = parseFloat(String(cleanJson.amount || 0).replace(/,/g, "")) || 0;
  const parsedAt = String(cleanJson._parsedAt || cleanJson.parsedAt || "").trim();
  const normalizedAt = new Date().toISOString();
  const ocrRawText = String(cleanJson.ocrRawText || cleanJson._ocrRawText || "").trim();
  const ocrConfidence = normalizeOcrConfidenceValue_(
    cleanJson.ocrConfidence || cleanJson._ocrConfidence || cleanJson.confidence
  );

  if (amount <= 0) {
    throw new Error("AI อ่านสลิปสำเร็จ แต่ไม่พบยอดเงินที่ใช้งานได้");
  }

  const structuredExpenseNote = extractStructuredExpenseNote_(cleanJson, bankContext);
  const rawType = String(cleanJson.type || "expense").trim().toLowerCase();
  const type = normalizeTransactionType_(cleanJson, bankContext, structuredExpenseNote, rawType);

  if (type === "income") {
    const merchant = sanitizeMerchant_(cleanJson, null, bankContext);
    const category = normalizeIncomeCategory_(cleanJson.category);
    const job = normalizeJobAlias_(String(cleanJson.job || "งานทั่วไป").trim() || "งานทั่วไป");
    const items = normalizeItemAlias_(String(cleanJson.items || "-").trim() || "-");
    const note = getNormalizedReceiptNote_(cleanJson, bankContext, null);
    return {
      type: "income",
      date: date,
      merchant: merchant,
      amount: amount,
      category: category,
      job: job,
      items: items,
      note: note,
      ocrRawText: ocrRawText,
      ocrConfidence: ocrConfidence,
      laborWeek: "",
      laborMonth: "",
      parsedAt: parsedAt,
      normalizedAt: normalizedAt,
      merchantNeedsConfirmation: false,
      bankContext: bankContext
    };
  }

  let category = refineCategoryByRules(cleanJson, bankContext);
  if (structuredExpenseNote) {
    category = structuredExpenseNote.category;
  }
  const merchant = sanitizeMerchant_(cleanJson, category, bankContext);
  let job = String(cleanJson.job || "งานทั่วไป").trim() || "งานทั่วไป";
  let items = String(cleanJson.items || "-").trim() || "-";
  if (structuredExpenseNote && structuredExpenseNote.jobLabel) {
    job = structuredExpenseNote.jobLabel;
  }
  if (structuredExpenseNote && structuredExpenseNote.itemLabel) {
    items = structuredExpenseNote.itemLabel;
  }
  const note = getNormalizedReceiptNote_(cleanJson, bankContext, structuredExpenseNote);
  category = forceLaborCategoryIfNeeded_(cleanJson, merchant, job, items, note, category, bankContext);

  const laborInfo = category === LABOR_CATEGORY_NAME
    ? (
      structuredExpenseNote && structuredExpenseNote.category === LABOR_CATEGORY_NAME
        ? structuredExpenseNote
        : extractLaborPeriodFromText(`${job} ${items} ${note} ${bankContext.remarks}`)
    )
    : { week: "", month: "" };
  const laborWeek = category === LABOR_CATEGORY_NAME ? (laborInfo.week || "") : "";
  const laborMonth = category === LABOR_CATEGORY_NAME ? (laborInfo.month || getMonthThai(date)) : "";

  if (category === LABOR_CATEGORY_NAME) {
    items = sanitizeLaborItems_(items, note, bankContext, structuredExpenseNote);
    job = buildLaborJobName_(laborWeek || "?", laborMonth);
    if (laborWeek) {
      items = `[สัปดาห์ที่ ${laborWeek} เดือน ${laborMonth}] ${items}`;
    }
  } else {
    job = normalizeJobAlias_(job);
    items = normalizeItemAlias_(items);
  }

  return {
    type: "expense",
    date: date,
    merchant: merchant,
    amount: amount,
    category: category,
    job: job,
    items: items,
    note: note,
    ocrRawText: ocrRawText,
    ocrConfidence: ocrConfidence,
    laborWeek: laborWeek,
    laborMonth: laborMonth,
    parsedAt: parsedAt,
    normalizedAt: normalizedAt,
    merchantNeedsConfirmation: shouldConfirmMerchant_(cleanJson, category, merchant, bankContext),
    bankContext: bankContext
  };
}

function normalizeTransactionType_(cleanJson, bankContext, structuredExpenseNote, rawType) {
  const inputType = String(rawType || cleanJson && cleanJson.type || "expense").trim().toLowerCase();
  const safeBankContext = bankContext || {};

  if (structuredExpenseNote) {
    return "expense";
  }

  const senderIsOwnCompany = isLikelyOwnCompanyName_(safeBankContext.senderAccountName);
  const receiverIsOwnCompany = isLikelyOwnCompanyName_(safeBankContext.receiverAccountName);

  if (safeBankContext.isTransferSlip) {
    if (senderIsOwnCompany && !receiverIsOwnCompany) {
      return "expense";
    }
    if (receiverIsOwnCompany && !senderIsOwnCompany) {
      return "income";
    }
  }

  if (inputType === "income" && hasExplicitExpenseTypeSignal_(cleanJson, safeBankContext)) {
    return "expense";
  }

  return inputType === "income" ? "income" : "expense";
}

function hasExplicitExpenseTypeSignal_(cleanJson, bankContext) {
  const rawCategory = String(cleanJson && cleanJson.category || "").trim();
  const expenseCategory = normalizeCategoryAlias_(rawCategory, EXPENSE_CATEGORY_OPTIONS);
  const incomeCategory = normalizeCategoryAlias_(rawCategory, INCOME_CATEGORY_OPTIONS);

  if (expenseCategory && expenseCategory !== incomeCategory) {
    return true;
  }

  const combinedText = [
    rawCategory,
    cleanJson && cleanJson.items,
    cleanJson && cleanJson.note,
    cleanJson && cleanJson.remarks,
    bankContext && bankContext.remarks
  ].map(function(value) {
    return String(value || "").trim();
  }).filter(Boolean).join(" ").toLowerCase();

  if (hasLaborSignal_(combinedText)) {
    return true;
  }

  return /วัสดุ|อุปกรณ์|เครื่องมือ|เหล็ก|ไม้|ค่าน้ำมัน|น้ำมัน|ค่าทางด่วน|ค่าเช่า|เช่า|ค่าส่ง|ค่ารถ|grab|bolt|taxi|delivery|shipping|ภาษี|vat/i.test(combinedText);
}


function normalizeJobAlias_(jobName) {
  const original = String(jobName || "").trim() || "งานทั่วไป";
  if (!original || original === "งานทั่วไป") {
    return original || "งานทั่วไป";
  }

  const config = getConfig();
  return normalizeAliasFromMaps_(original, config.jobAliases || []);
}

function normalizeProjectAlias_(projectName) {
  const original = String(projectName || "").trim();
  if (!original) {
    return "";
  }

  const config = getConfig();
  return normalizeAliasFromMaps_(original, config.projectAliases || []);
}

function normalizeMerchantAlias_(merchantName) {
  const original = String(merchantName || "").trim();
  if (!original || original === "ไม่ระบุผู้รับ" || original === "ไม่ระบุร้านค้า") {
    return original;
  }

  const config = getConfig();
  return normalizeAliasFromMaps_(original, config.merchantAliases || []);
}

function normalizeItemAlias_(itemText) {
  const original = String(itemText || "").trim();
  if (!original || original === "-") {
    return original || "-";
  }

  const config = getConfig();
  return normalizeAliasFromMaps_(original, config.itemAliases || []);
}

function normalizeCategoryAlias_(category, options) {
  const input = String(category || "").trim();
  if (!input) return "";

  const safeOptions = options || EXPENSE_CATEGORY_OPTIONS;
  if (safeOptions.indexOf(input) !== -1) {
    return input;
  }

  const config = getConfig();
  const normalized = normalizeAliasFromMaps_(input, config.categoryAliases || []);
  return safeOptions.indexOf(normalized) !== -1 ? normalized : "";
}


function buildReceiptCombinedText_(cleanJson) {
  const bank = cleanJson && cleanJson.bank ? cleanJson.bank : {};
  return [
    cleanJson && cleanJson.merchant,
    cleanJson && cleanJson.job,
    cleanJson && cleanJson.items,
    cleanJson && cleanJson.note,
    cleanJson && cleanJson.remarks,
    cleanJson && cleanJson.receiver_account_name,
    cleanJson && cleanJson.sender_account_name,
    bank.bank_name,
    bank.document_type,
    bank.receiver_account_name,
    bank.receiver_account_no,
    bank.sender_account_name,
    bank.sender_account_no,
    bank.remarks,
    bank.product_name
  ].map(function(value) {
    return String(value || "").trim();
  }).filter(Boolean).join(" | ");
}


function firstNonEmpty_(values) {
  for (const value of values || []) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}


function toBoolean_(value) {
  if (typeof value === "boolean") return value;
  const text = String(value || "").trim().toLowerCase();
  return text === "true" || text === "yes" || text === "1";
}


function getNormalizedReceiptNote_(cleanJson, bankContext, structuredExpenseNote) {
  const note = String(cleanJson.note || "").trim();

  if (structuredExpenseNote) {
    const structuredNote = parseStructuredExpenseNote_(note);
    return structuredNote ? structuredNote.raw : structuredExpenseNote.raw;
  }

  if (note) {
    return note;
  }

  return String(bankContext && bankContext.remarks || "").trim();
}


function extractStructuredExpenseNote_(cleanJson, bankContext) {
  const candidates = [
    cleanJson && cleanJson.note,
    bankContext && bankContext.remarks,
    cleanJson && cleanJson.items
  ];

  for (const candidate of candidates) {
    const parsed = parseStructuredExpenseNote_(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}


function parseStructuredExpenseNote_(text) {
  const input = String(text || "").replace(/\s+/g, " ").trim();
  if (!input || input.indexOf("_") === -1) {
    return null;
  }

  const parts = input
    .split("_")
    .map(function(part) {
      return String(part || "").trim();
    })
    .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  const category = normalizeStructuredCategory_(parts[0]);
  if (category === LABOR_CATEGORY_NAME) {
    const week = extractStructuredWeek_(parts[1]);
    const month = normalizeStructuredMonth_(parts[2]);
    const jobLabel = parts.slice(3).join("_").trim() || "งานทั่วไป";

    if (!week || !month) {
      return null;
    }

    return {
      raw: input,
      category: category,
      week: week,
      month: month,
      jobLabel: jobLabel,
      itemLabel: `ค่าแรง ${jobLabel}`.trim()
    };
  }

  if (category) {
    const tailLooksJob = parts.length >= 3 && isLikelyJobLabel_(parts[parts.length - 1]);
    const jobLabel = tailLooksJob
      ? String(parts[parts.length - 1] || "").trim()
      : String(parts[1] || "").trim() || "งานทั่วไป";
    const itemLabel = tailLooksJob
      ? parts.slice(1, -1).join("_").trim() || String(parts[0] || "").trim() || "-"
      : parts.slice(2).join("_").trim() || String(parts[0] || "").trim() || "-";

    return {
      raw: input,
      category: category,
      week: "",
      month: "",
      jobLabel: jobLabel,
      itemLabel: itemLabel
    };
  }

  const jobFirst = isLikelyJobLabel_(parts[0]);
  const secondLooksJob = isLikelyJobLabel_(parts[1]);
  let jobLabel = "";
  let itemLabel = "";

  if (jobFirst) {
    jobLabel = parts[0];
    itemLabel = parts.slice(1).join("_").trim() || "-";
  } else if (secondLooksJob) {
    jobLabel = parts[1];
    itemLabel = [parts[0]].concat(parts.slice(2)).join("_").trim() || "-";
  } else {
    return null;
  }

  const inferredCategory = inferStructuredCategoryFromText_(itemLabel);
  if (!inferredCategory) {
    return null;
  }

  return {
    raw: input,
    category: inferredCategory,
    week: "",
    month: "",
    jobLabel: jobLabel,
    itemLabel: itemLabel
  };
}

function isLikelyJobLabel_(text) {
  const input = String(text || "").trim();
  if (!input) return false;

  const comparable = normalizeComparableText_(input);
  if (!comparable) return false;
  if (comparable.indexOf("งาน") === 0 || comparable === normalizeComparableText_("โรงงาน")) {
    return true;
  }

  return normalizeComparableText_(normalizeJobAlias_(input)) !== comparable;
}

function inferStructuredCategoryFromText_(text) {
  const directCategory = normalizeStructuredCategory_(text);
  if (directCategory) {
    return directCategory;
  }

  const inferred = refineCategoryByRules({
    category: "",
    merchant: "",
    job: "",
    items: text,
    note: text
  }, {});

  return inferred && inferred !== "อื่นๆ" ? inferred : "";
}


function normalizeStructuredCategory_(text) {
  const aliasCategory = normalizeCategoryAlias_(text, EXPENSE_CATEGORY_OPTIONS);
  if (aliasCategory) {
    return aliasCategory;
  }

  const value = normalizeComparableText_(text);
  const categoryMap = [
    { aliases: ["ค่าแรง", "คาแรง"], category: "ค่าแรง" },
    { aliases: ["ค่าเช่าอุปกรณ์", "ค่าเช่า", "คาเชา", "เช่า", "เชาอุปกรณ์"], category: "ค่าเช่าอุปกรณ์" },
    { aliases: ["วัสดุโครงสร้าง", "โครงสร้าง"], category: "วัสดุโครงสร้าง" },
    { aliases: ["วัสดุตกแต่ง", "ตกแต่ง"], category: "วัสดุตกแต่ง" },
    { aliases: ["วัสดุ/อุปกรณ์", "วัสดุอุปกรณ์", "วัสดุ", "อุปกรณ์"], category: "วัสดุโครงสร้าง" },
    { aliases: ["งานพิมพ์/กราฟิก", "งานพิมพ์", "กราฟิก", "พิมพ์"], category: "งานพิมพ์/กราฟิก" },
    { aliases: ["ค่าขนส่ง", "ขนส่ง/เดินทาง", "ขนส่งเดินทาง", "ขนส่ง", "เดินทาง", "ค่าเดินทาง"], category: "ค่าขนส่ง" },
    { aliases: ["ค่าสาธารณูปโภค", "สาธารณูปโภค"], category: "ค่าสาธารณูปโภค" },
    { aliases: ["ค่าใช้จ่ายสำนักงาน", "สำนักงาน"], category: "ค่าใช้จ่ายสำนักงาน" },
    { aliases: ["ภาษี/vat", "ภาษีvat", "ภาษี", "vat"], category: "ภาษี/VAT" },
    { aliases: ["อื่นๆ", "อื่น"], category: "อื่นๆ" }
  ];

  for (const entry of categoryMap) {
    if (entry.aliases.some(function(alias) { return value === normalizeComparableText_(alias); })) {
      return entry.category;
    }
  }

  return "";
}


function extractStructuredWeek_(text) {
  const input = String(text || "").trim().toLowerCase();
  if (!input) return "";

  const match = input.match(/(?:w(?:eek|k)?|สัปดาห์(?:ที่)?)\s*([1-5])|^([1-5])$/i);
  return match ? String(match[1] || match[2] || "") : "";
}


function normalizeStructuredMonth_(text) {
  const input = String(text || "").trim();
  if (!input) return "";

  const monthInfo = extractLaborPeriodFromText(input);
  if (monthInfo.month) {
    return monthInfo.month;
  }

  const monthNumberMatch = input.match(/^(0?[1-9]|1[0-2])$/);
  if (!monthNumberMatch) {
    return "";
  }

  const monthIndex = Number(monthNumberMatch[1]) - 1;
  const months = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม"
  ];

  return months[monthIndex] || "";
}


function sanitizeLaborItems_(items, note, bankContext, structuredExpenseNote) {
  if (structuredExpenseNote && structuredExpenseNote.category === LABOR_CATEGORY_NAME) {
    return String(structuredExpenseNote.itemLabel || `ค่าแรง ${structuredExpenseNote.jobLabel || ""}`).trim();
  }

  const rawItems = String(items || "").trim();
  const rawNote = String(note || "").trim();
  const bankRemarks = String(bankContext && bankContext.remarks || "").trim();
  const productName = String(bankContext && bankContext.productName || "").trim();

  if (hasLaborSignal_(bankRemarks)) {
    return bankRemarks;
  }

  if (hasLaborSignal_(rawNote)) {
    return rawNote;
  }

  if (hasLaborSignal_(rawItems)) {
    return rawItems;
  }

  if (isBankServiceNoise_(rawItems) || isBankServiceNoise_(productName)) {
    return "ค่าแรง";
  }

  return rawItems || bankRemarks || "ค่าแรง";
}


function forceLaborCategoryIfNeeded_(cleanJson, merchant, job, items, note, currentCategory, bankContext) {
  const combined = [
    merchant,
    job,
    items,
    note,
    cleanJson && cleanJson.category,
    bankContext && bankContext.remarks,
    bankContext && bankContext.productName
  ].map(function(value) {
    return String(value || "").trim();
  }).join(" ").toLowerCase();

  if (hasLaborSignal_(combined)) {
    return LABOR_CATEGORY_NAME;
  }

  if (
    bankContext && bankContext.isTransferSlip &&
    isLikelyPersonName(merchant) &&
    (hasLaborSignal_(bankContext.remarks) || hasLaborSignal_(note) || hasLaborSignal_(job) || hasLaborSignal_(items))
  ) {
    return LABOR_CATEGORY_NAME;
  }

  return currentCategory;
}


function sanitizeMerchant_(cleanJson, category, bankContext) {
  const rawMerchant = String(cleanJson.merchant || "").trim();
  const fallbackText = buildReceiptCombinedText_(cleanJson);
  const bankReceiver = String(bankContext && bankContext.receiverAccountName || "").trim();

  if (bankContext && bankContext.isTransferSlip && bankReceiver && !isLikelyOwnCompanyName_(bankReceiver)) {
    return normalizeMerchantAlias_(bankReceiver);
  }

  if (!rawMerchant) {
    const fallbackPayee = bankReceiver || extractLikelyPayeeName_(fallbackText);
    return normalizeMerchantAlias_(fallbackPayee) || "ไม่ระบุผู้รับ";
  }

  if (category === LABOR_CATEGORY_NAME && isLikelyOwnCompanyName_(rawMerchant)) {
    const extractedPayee = bankReceiver || extractLikelyPayeeName_(fallbackText);
    if (extractedPayee && !isLikelyOwnCompanyName_(extractedPayee)) {
      return normalizeMerchantAlias_(extractedPayee);
    }
    return "ไม่ระบุผู้รับ";
  }

  if (bankContext && bankContext.isTransferSlip && isLikelyOwnCompanyName_(rawMerchant)) {
    const transferPayee = bankReceiver || extractLikelyPayeeName_(fallbackText);
    if (transferPayee && !isLikelyOwnCompanyName_(transferPayee)) {
      return normalizeMerchantAlias_(transferPayee);
    }
  }

  return normalizeMerchantAlias_(rawMerchant);
}


function shouldConfirmMerchant_(cleanJson, category, merchant, bankContext) {
  if (category !== LABOR_CATEGORY_NAME) {
    return false;
  }

  if (!merchant || merchant === "ไม่ระบุผู้รับ") {
    return true;
  }

  if (isLikelyOwnCompanyName_(merchant)) {
    return true;
  }

  if (bankContext && bankContext.isTransferSlip) {
    if (!bankContext.receiverAccountName) {
      return true;
    }

    if (!isLikelyPersonName(bankContext.receiverAccountName)) {
      return true;
    }
  }

  if (isLikelyBankTransferDocument_(cleanJson, bankContext) && !isLikelyPersonName(merchant)) {
    return true;
  }

  return false;
}


function normalizeCategory(category) {
  return normalizeCategoryAlias_(category, EXPENSE_CATEGORY_OPTIONS) || "อื่นๆ";
}


function normalizeIncomeCategory_(category) {
  return normalizeCategoryAlias_(category, INCOME_CATEGORY_OPTIONS) || "อื่นๆ";
}


function refineCategoryByRules(cleanJson, bankContext) {
  const aiCategory = normalizeCategory(cleanJson.category);
  const merchant = String(cleanJson.merchant || "").trim();
  const job = String(cleanJson.job || "").trim();
  const items = String(cleanJson.items || "").trim();
  const note = String(cleanJson.note || "").trim();
  const combinedText = `${merchant} ${job} ${items} ${note} ${bankContext && bankContext.remarks || ""}`.toLowerCase();

  const materialKeywords = [
    "วัสดุ", "อุปกรณ์", "เครื่องมือ", "เหล็ก", "ไม้", "น็อต", "สกรู",
    "hardware", "tool", "material"
  ];
  const decorKeywords = [
    "ตกแต่ง", "อะคริลิก", "ผ้า", "ประดับ", "decor"
  ];
  const printKeywords = [
    "พิมพ์", "สติกเกอร์", "แบนเนอร์", "กราฟิก", "print", "banner", "sticker", "graphic"
  ];
  const rentKeywords = [
    "ค่าเช่า", "เช่า", "เช่าเครน", "เช่านั่งร้าน", "เช่าเครื่องมือ", "เช่ารถ", "เช่าพื้นที่",
    "rental", "rent", "lease"
  ];
  const transportKeywords = [
    "น้ำมัน", "ค่าน้ำมัน", "เดินทาง", "ขนส่ง", "ค่าส่ง", "ค่ารถ", "ค่าทางด่วน", "grab",
    "bolt", "taxi", "delivery", "transport", "shipping", "truck"
  ];

  const hasLabor = hasLaborSignal_(combinedText);
  const hasRent = rentKeywords.some(function(word) { return combinedText.indexOf(word) !== -1; });
  const hasMaterial = materialKeywords.some(function(word) { return combinedText.indexOf(word) !== -1; });
  const hasDecor = decorKeywords.some(function(word) { return combinedText.indexOf(word) !== -1; });
  const hasPrint = printKeywords.some(function(word) { return combinedText.indexOf(word) !== -1; });
  const hasTransport = transportKeywords.some(function(word) { return combinedText.indexOf(word) !== -1; });
  const isPersonName = isLikelyPersonName(merchant);

  if (bankContext && bankContext.isTransferSlip && hasLaborSignal_(bankContext.remarks)) {
    return LABOR_CATEGORY_NAME;
  }

  if (isPersonName) {
    if (hasLabor) return "ค่าแรง";
    if (hasRent) return "ค่าเช่าอุปกรณ์";
    if (hasTransport) return "ค่าขนส่ง";
    if (hasPrint) return "งานพิมพ์/กราฟิก";
    if (hasDecor) return "วัสดุตกแต่ง";
    if (hasMaterial) return "วัสดุโครงสร้าง";
    return aiCategory === "ค่าแรง" ? "อื่นๆ" : aiCategory;
  }

  if (hasLabor) return "ค่าแรง";
  if (hasRent) return "ค่าเช่าอุปกรณ์";
  if (hasTransport) return "ค่าขนส่ง";
  if (hasPrint) return "งานพิมพ์/กราฟิก";
  if (hasDecor) return "วัสดุตกแต่ง";
  if (hasMaterial) return "วัสดุโครงสร้าง";

  return aiCategory;
}


function hasLaborSignal_(text) {
  const value = String(text || "").toLowerCase();
  const laborKeywords = [
    "ค่าแรง", "ค่าจ้าง", "แรงงาน", "คนงาน", "ช่าง", "รายวัน", "รายสัปดาห์", "เบิกค่าแรง",
    "labor", "wage", "worker"
  ];

  return laborKeywords.some(function(word) {
    return value.indexOf(word) !== -1;
  });
}


function isBankServiceNoise_(text) {
  const value = String(text || "").toLowerCase();
  const noiseKeywords = [
    "บริการโอนเงิน",
    "payment advice",
    "product name",
    "customer transaction reference",
    "customer batch reference",
    "invoice details",
    "รายละเอียดการชำระ",
    "รายละเอียดใบแจ้งหนี้"
  ];

  return noiseKeywords.some(function(word) {
    return value.indexOf(word) !== -1;
  });
}


function isLikelyBankTransferDocument_(cleanJson, bankContext) {
  if (bankContext && bankContext.isTransferSlip) {
    return true;
  }

  const combined = buildReceiptCombinedText_(cleanJson).toLowerCase();
  const bankKeywords = [
    "payment advice",
    "โอนเงิน",
    "ธนาคาร",
    "account name",
    "sender details",
    "bank",
    "scb",
    "พร้อมเพย์",
    "promptpay",
    "kbank",
    "krungthai",
    "bangkok bank",
    "krungsri",
    "ttb",
    "uob"
  ];

  return bankKeywords.some(function(word) {
    return combined.indexOf(word) !== -1;
  });
}


function isLikelyPersonName(text) {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return false;

  const businessHints = [
    "บริษัท", "หจก", "จำกัด", "ร้าน", "สาขา", "จก", "บจก",
    "company", "co.", "ltd", "store", "shop", "service"
  ];

  const looksLikeBusiness = businessHints.some(function(word) {
    return value.indexOf(word) !== -1;
  });

  if (looksLikeBusiness) return false;

  const thaiPersonPrefix = /^(นาย|นาง|นางสาว|คุณ)\s?/i;
  const englishPersonPrefix = /^(mr\.?|mrs\.?|ms\.?|miss)\s?/i;

  if (thaiPersonPrefix.test(value) || englishPersonPrefix.test(value)) {
    return true;
  }

  const parts = value.split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.length <= 4;
}


function isLikelyOwnCompanyName_(text) {
  const value = normalizeComparableText_(text);
  if (!value) return false;

  const config = getConfig();
  return (config.ownCompanyAliases || []).some(function(alias) {
    const normalizedAlias = normalizeComparableText_(alias);
    return normalizedAlias && value.indexOf(normalizedAlias) !== -1;
  });
}


function extractLikelyPayeeName_(text) {
  const input = String(text || "").replace(/\s+/g, " ").trim();
  if (!input) return "";

  const labelPatterns = [
    /ผู้รับเงิน[:\s-]+([^\n|,;]+)/i,
    /ชื่อผู้รับ[:\s-]+([^\n|,;]+)/i,
    /รับโดย[:\s-]+([^\n|,;]+)/i,
    /ผู้รับ[:\s-]+([^\n|,;]+)/i,
    /พนักงาน[:\s-]+([^\n|,;]+)/i,
    /ช่าง[:\s-]+([^\n|,;]+)/i,
    /คนงาน[:\s-]+([^\n|,;]+)/i
  ];

  for (const pattern of labelPatterns) {
    const match = input.match(pattern);
    if (!match) continue;

    const candidate = cleanupPayeeCandidate_(match[1]);
    if (candidate && !isLikelyOwnCompanyName_(candidate)) {
      return candidate;
    }
  }

  const prefixedNameMatch = input.match(/(?:นาย|นาง|นางสาว|คุณ|mr\.?|mrs\.?|ms\.?|miss)\s*[^\d\n|,;]{2,60}/i);
  if (prefixedNameMatch) {
    const candidate = cleanupPayeeCandidate_(prefixedNameMatch[0]);
    if (candidate && !isLikelyOwnCompanyName_(candidate)) {
      return candidate;
    }
  }

  return "";
}


function cleanupPayeeCandidate_(text) {
  let value = String(text || "").trim();
  if (!value) return "";

  value = value
    .replace(/\s+(จำนวน|ยอด|บาท|วันที่|สัปดาห์|เดือน|หมายเหตุ|งาน).*$/i, "")
    .replace(/[|,;]+.*$/, "")
    .trim();

  if (!value || value.length < 2) return "";
  if (/\d{3,}/.test(value)) return "";

  return value;
}


function normalizeDateString(dateText) {
  try {
    const input = String(dateText || "").trim();

    if (!input) {
      return formatDateToYMD(new Date());
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      return input;
    }

    const slashMatch = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const day = slashMatch[1].padStart(2, "0");
      const month = slashMatch[2].padStart(2, "0");
      return `${slashMatch[3]}-${month}-${day}`;
    }

    const parsed = new Date(input);
    if (isNaN(parsed.getTime())) {
      return formatDateToYMD(new Date());
    }

    return formatDateToYMD(parsed);
  } catch (err) {
    return formatDateToYMD(new Date());
  }
}


function extractLaborPeriodFromText(text) {
  const input = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  const result = {
    week: "",
    month: ""
  };

  const weekPatterns = [
    /สัปดาห์ที่\s*([1-5])/i,
    /สัปดาห์\s*([1-5])/i,
    /week\s*[_-]?\s*([1-5])/i,
    /wk\s*[_-]?\s*([1-5])/i
  ];

  for (const pattern of weekPatterns) {
    const match = input.match(pattern);
    if (match) {
      result.week = match[1];
      break;
    }
  }

  const monthMap = {
    "มกราคม": "มกราคม",
    "ม.ค.": "มกราคม",
    "มค": "มกราคม",
    "january": "มกราคม",
    "jan": "มกราคม",
    "กุมภาพันธ์": "กุมภาพันธ์",
    "ก.พ.": "กุมภาพันธ์",
    "กพ": "กุมภาพันธ์",
    "february": "กุมภาพันธ์",
    "feb": "กุมภาพันธ์",
    "มีนาคม": "มีนาคม",
    "มี.ค.": "มีนาคม",
    "มีค": "มีนาคม",
    "march": "มีนาคม",
    "mar": "มีนาคม",
    "เมษายน": "เมษายน",
    "เม.ย.": "เมษายน",
    "เมย": "เมษายน",
    "april": "เมษายน",
    "apr": "เมษายน",
    "พฤษภาคม": "พฤษภาคม",
    "พ.ค.": "พฤษภาคม",
    "พค": "พฤษภาคม",
    "may": "พฤษภาคม",
    "มิถุนายน": "มิถุนายน",
    "มิ.ย.": "มิถุนายน",
    "มิย": "มิถุนายน",
    "june": "มิถุนายน",
    "jun": "มิถุนายน",
    "กรกฎาคม": "กรกฎาคม",
    "ก.ค.": "กรกฎาคม",
    "กค": "กรกฎาคม",
    "july": "กรกฎาคม",
    "jul": "กรกฎาคม",
    "สิงหาคม": "สิงหาคม",
    "ส.ค.": "สิงหาคม",
    "สค": "สิงหาคม",
    "august": "สิงหาคม",
    "aug": "สิงหาคม",
    "กันยายน": "กันยายน",
    "ก.ย.": "กันยายน",
    "กย": "กันยายน",
    "september": "กันยายน",
    "sep": "กันยายน",
    "ตุลาคม": "ตุลาคม",
    "ต.ค.": "ตุลาคม",
    "ตค": "ตุลาคม",
    "october": "ตุลาคม",
    "oct": "ตุลาคม",
    "พฤศจิกายน": "พฤศจิกายน",
    "พ.ย.": "พฤศจิกายน",
    "พย": "พฤศจิกายน",
    "november": "พฤศจิกายน",
    "nov": "พฤศจิกายน",
    "ธันวาคม": "ธันวาคม",
    "ธ.ค.": "ธันวาคม",
    "ธค": "ธันวาคม",
    "december": "ธันวาคม",
    "dec": "ธันวาคม"
  };

  for (const key in monthMap) {
    if (input.indexOf(key.toLowerCase()) !== -1) {
      result.month = monthMap[key];
      break;
    }
  }

  return result;
}

function normalizeDate_(dateText) {
  return normalizeDateString(dateText);
}

function normalizeMerchant_(merchantText, context) {
  return normalizeMerchantAlias_(merchantText);
}





