/**
 * Rule_Parser_Service.gs
 * Rule-first transaction parsing and confidence gate before Gemini fallback.
 */

const PARSE_METHOD_TEXT_RULE = "TEXT_RULE";
const PARSE_METHOD_CAPTION_RULE = "CAPTION_RULE";
const PARSE_METHOD_OCR_RULE = "OCR_RULE";
const PARSE_METHOD_QR_RULE = "QR_RULE";
const PARSE_METHOD_GEMINI = "GEMINI";
const PARSE_METHOD_MANUAL = "MANUAL";

function parseExpenseTextRule(text) {
  return parseExpenseTextRuleInternal_(text, PARSE_METHOD_TEXT_RULE);
}

function parseLaborTextRule(text) {
  return parseLaborTextRuleInternal_(text, PARSE_METHOD_TEXT_RULE);
}

function parseIncomeTextRule(text) {
  return parseIncomeTextRuleInternal_(text, PARSE_METHOD_TEXT_RULE);
}

function parseReceiptCaptionRule(text) {
  const input = cleanText_(text);
  if (!input) {
    return buildRuleParseFailure_(PARSE_METHOD_CAPTION_RULE, "parseReceiptCaptionRule", ["empty_text"]);
  }

  return chooseBestRuleParsedResult_([
    parseLaborTextRuleInternal_(input, PARSE_METHOD_CAPTION_RULE),
    parseIncomeTextRuleInternal_(input, PARSE_METHOD_CAPTION_RULE),
    parseExpenseTextRuleInternal_(input, PARSE_METHOD_CAPTION_RULE)
  ], PARSE_METHOD_CAPTION_RULE, "parseReceiptCaptionRule");
}

function parseExpenseTextRuleInternal_(text, parseMethod) {
  const input = cleanText_(text);
  if (!input) {
    return buildRuleParseFailure_(parseMethod, "parseExpenseTextRule", ["empty_text"]);
  }

  const amountInfo = extractRuleAmount_(input);
  const dateInfo = extractRuleDate_(input);
  const parseInput = stripRuleAmountDateTokens_(input);
  const structured = parseStructuredExpenseNote_(parseInput);
  let parsedData = null;
  let rawParserName = "expense_text_rule";
  const warnings = [];

  if (structured) {
    parsedData = buildRuleDataFromStructuredExpense_(input, structured, amountInfo, dateInfo);
    rawParserName = "structured_expense_note";
  } else {
    parsedData = buildRuleDataFromPlainExpense_(parseInput, amountInfo, dateInfo, input);
    rawParserName = "plain_expense_text";
  }

  if (!parsedData) {
    return buildRuleParseFailure_(parseMethod, "parseExpenseTextRule", ["unmatched_pattern"]);
  }

  parsedData.type = "expense";
  const confidence = scoreRuleConfidence_(parsedData, {
    structured: !!structured || input.indexOf("_") !== -1,
    hasAmount: amountInfo.found,
    hasDate: dateInfo.found,
    hasLaborPeriod: !!(parsedData.laborWeek && parsedData.laborMonth)
  });

  return buildRuleParsedResult_(parsedData, confidence, {
    parseMethod: parseMethod,
    rawParserName: rawParserName,
    warnings: warnings
  });
}

function parseLaborTextRuleInternal_(text, parseMethod) {
  const input = cleanText_(text);
  if (!input || !hasLaborSignal_(input)) {
    return buildRuleParseFailure_(parseMethod, "parseLaborTextRule", ["no_labor_signal"]);
  }

  const amountInfo = extractRuleAmount_(input);
  const dateInfo = extractRuleDate_(input);
  const parseInput = stripRuleAmountDateTokens_(input);
  const structured = parseStructuredExpenseNote_(parseInput);
  const laborPeriod = extractLaborPeriodFromText(parseInput);
  let parsedData = null;

  if (structured && structured.category === LABOR_CATEGORY_NAME) {
    parsedData = buildRuleDataFromStructuredExpense_(input, structured, amountInfo, dateInfo);
  } else {
    const job = extractRuleJobLabel_(parseInput) || "งานทั่วไป";
    parsedData = {
      type: "expense",
      date: dateInfo.value,
      _dateProvided: dateInfo.found,
      merchant: extractRuleMerchant_(input),
      amount: amountInfo.value,
      category: LABOR_CATEGORY_NAME,
      job: job,
      items: "ค่าแรง " + job,
      note: input,
      laborWeek: laborPeriod.week || "",
      laborMonth: laborPeriod.month || (dateInfo.value ? getMonthThai(dateInfo.value) : "")
    };
  }

  const confidence = scoreRuleConfidence_(parsedData, {
    structured: !!structured,
    hasAmount: amountInfo.found,
    hasDate: dateInfo.found,
    hasLaborPeriod: !!(parsedData.laborWeek && parsedData.laborMonth)
  });

  return buildRuleParsedResult_(parsedData, confidence, {
    parseMethod: parseMethod,
    rawParserName: structured ? "structured_labor_note" : "plain_labor_text"
  });
}

function parseIncomeTextRuleInternal_(text, parseMethod) {
  const input = cleanText_(text);
  const parseInput = stripRuleAmountDateTokens_(input);
  const parts = splitRuleParts_(parseInput);
  const first = normalizeComparableText_(parts[0] || input);
  const hasIncomeSignal = /รายรับ|รับเงิน|เงินเข้า|income|deposit/i.test(input) ||
    first === normalizeComparableText_("รายรับ");

  if (!hasIncomeSignal) {
    return buildRuleParseFailure_(parseMethod, "parseIncomeTextRule", ["no_income_signal"]);
  }

  const amountInfo = extractRuleAmount_(input);
  const dateInfo = extractRuleDate_(input);
  const job = normalizeJobAlias_(String(parts[1] || extractRuleJobLabel_(input) || "งานทั่วไป").trim());
  const itemText = parts.length >= 3
    ? parts.slice(2).join("_").trim()
    : removeRuleKnownWords_(parseInput, [parts[0], job]).trim() || "รายรับ";
  const parsedData = {
    type: "income",
    date: dateInfo.value,
    _dateProvided: dateInfo.found,
    merchant: extractRuleMerchant_(input) || "ไม่ระบุผู้จ่าย",
    amount: amountInfo.value,
    category: inferIncomeCategoryFromRuleText_(itemText || input),
    job: job,
    items: normalizeItemAlias_(itemText || "รายรับ"),
    note: input,
    laborWeek: "",
    laborMonth: ""
  };

  const confidence = scoreRuleConfidence_(parsedData, {
    structured: parts.length >= 3,
    hasAmount: amountInfo.found,
    hasDate: dateInfo.found
  });

  return buildRuleParsedResult_(parsedData, confidence, {
    parseMethod: parseMethod,
    rawParserName: "income_text_rule"
  });
}

function buildRuleDataFromStructuredExpense_(input, structured, amountInfo, dateInfo) {
  if (!structured) return null;

  return {
    type: "expense",
    date: dateInfo.value,
    _dateProvided: dateInfo.found,
    merchant: extractRuleMerchant_(input),
    amount: amountInfo.value,
    category: structured.category,
    job: normalizeJobAlias_(structured.jobLabel || "งานทั่วไป"),
    items: normalizeItemAlias_(structured.itemLabel || "-"),
    note: structured.raw || input,
    laborWeek: structured.week || "",
    laborMonth: structured.month || ""
  };
}

function buildRuleDataFromPlainExpense_(input, amountInfo, dateInfo, originalText) {
  const parts = splitRuleParts_(input);
  const job = extractRuleJobLabel_(input);
  const category = inferStructuredCategoryFromText_(input) || normalizeCategory(parts[0] || "");

  if (parts.length >= 2 && normalizeComparableText_(parts[0]) === normalizeComparableText_(FACTORY_JOB_NAME)) {
    const itemText = parts.slice(1).join("_").trim();
    return {
      type: "expense",
      date: dateInfo.value,
      _dateProvided: dateInfo.found,
      merchant: extractRuleMerchant_(input),
      amount: amountInfo.value,
      category: inferStructuredCategoryFromText_(itemText) || "อื่นๆ",
      job: FACTORY_JOB_NAME,
      items: normalizeItemAlias_(itemText || "-"),
      note: originalText || input,
      laborWeek: "",
      laborMonth: ""
    };
  }

  if (job) {
    const itemText = removeRuleKnownWords_(input, [job, category]).trim() || parts.slice(1).join("_").trim() || "-";
    return {
      type: "expense",
      date: dateInfo.value,
      _dateProvided: dateInfo.found,
      merchant: extractRuleMerchant_(input),
      amount: amountInfo.value,
      category: category && category !== "อื่นๆ" ? category : inferStructuredCategoryFromText_(itemText) || "อื่นๆ",
      job: normalizeJobAlias_(job),
      items: normalizeItemAlias_(itemText),
      note: originalText || input,
      laborWeek: "",
      laborMonth: ""
    };
  }

  if (category && category !== "อื่นๆ") {
    return {
      type: "expense",
      date: dateInfo.value,
      _dateProvided: dateInfo.found,
      merchant: extractRuleMerchant_(input),
      amount: amountInfo.value,
      category: category,
      job: "งานทั่วไป",
      items: normalizeItemAlias_(parts.slice(1).join("_").trim() || input),
      note: originalText || input,
      laborWeek: "",
      laborMonth: ""
    };
  }

  return null;
}

function evaluateParsedTransaction(parsedResult) {
  const result = normalizeParsedResultShape_(parsedResult);
  const parsedData = result.parsedData || {};
  const missingFields = uniqueStrings_(
    (result.missingFields || []).concat(buildConfidenceGateMissingFields_(parsedData))
  );
  const conflicts = result.conflicts || [];
  const warnings = uniqueStrings_((result.warnings || []).concat(conflicts));
  const confidence = normalizeParserConfidence_(result.confidence);
  let status = RECORD_STATUS_IMPORTED;

  if (
    confidence < 0.60 ||
    missingFields.indexOf("amount") !== -1 ||
    missingFields.indexOf("date") !== -1 ||
    missingFields.indexOf("type") !== -1
  ) {
    status = RECORD_STATUS_PARSE_INCOMPLETE;
  } else if (
    confidence < 0.85 ||
    missingFields.indexOf("scope") !== -1 ||
    warnings.length > 0
  ) {
    status = RECORD_STATUS_NEEDS_REVIEW;
  }

  return Object.assign({}, result, {
    confidence: confidence,
    missingFields: missingFields,
    warnings: warnings,
    status: status
  });
}

function shouldAutoConfirm(parsedResult) {
  return evaluateParsedTransaction(parsedResult).status === RECORD_STATUS_IMPORTED;
}

function shouldNeedReview(parsedResult) {
  return evaluateParsedTransaction(parsedResult).status === RECORD_STATUS_NEEDS_REVIEW;
}

function shouldMarkParseIncomplete(parsedResult) {
  return evaluateParsedTransaction(parsedResult).status === RECORD_STATUS_PARSE_INCOMPLETE;
}

function shouldUseGeminiForParsedResult_(parsedResult) {
  return shouldUseGeminiForParsedResultInMode_(parsedResult, getAiReadMode_());
}

function shouldUseGeminiForParsedResultInMode_(parsedResult, mode) {
  const safeMode = normalizeAiReadMode_(mode);
  if (safeMode === AI_READ_MODE_OFF) return false;
  if (safeMode === AI_READ_MODE_ALWAYS) return true;
  return !shouldAutoConfirm(parsedResult);
}

function getAiReadMode_() {
  return normalizeAiReadMode_(getConfig().aiReadMode);
}

function applyParserMetadataToRecord_(record, parsedResult, options) {
  const safeOptions = options || {};
  const evaluation = evaluateParsedTransaction(parsedResult);
  const warnings = uniqueStrings_((evaluation.warnings || []).concat(safeOptions.warnings || []));
  return Object.assign({}, record || {}, {
    status: safeOptions.status || evaluation.status,
    parseMethod: evaluation.parseMethod || "",
    aiUsed: safeOptions.aiUsed === true,
    parserConfidence: evaluation.confidence,
    missingFields: evaluation.missingFields || [],
    warnings: warnings,
    rawParserName: evaluation.rawParserName || ""
  });
}

function buildReceiptRecordFromParsedResult_(parsedResult, options) {
  const safeOptions = options || {};
  const evaluation = evaluateParsedTransaction(parsedResult);
  const parsedData = Object.assign({}, evaluation.parsedData || {});
  let record = null;

  if (Number(parsedData.amount || 0) > 0) {
    try {
      record = normalizeReceiptData(parsedData);
    } catch (err) {
      evaluation.warnings = uniqueStrings_((evaluation.warnings || []).concat([
        "normalize_failed: " + buildUserFriendlyErrorMessage_(err)
      ]));
    }
  }

  if (!record) {
    const fallbackDate = parsedData.date || safeOptions.fallbackDate || formatDateToYMD(new Date());
    const type = normalizeRuleTransactionType_(parsedData.type);
    const category = type === "income"
      ? normalizeIncomeCategory_(parsedData.category)
      : normalizeCategory(parsedData.category);
    record = {
      type: type,
      date: normalizeDateString(fallbackDate),
      merchant: String(parsedData.merchant || (type === "income" ? "ไม่ระบุผู้จ่าย" : "ไม่ระบุร้านค้า")).trim(),
      amount: Number(parsedData.amount || 0),
      category: category,
      job: normalizeJobAlias_(parsedData.job || "งานทั่วไป"),
      items: normalizeItemAlias_(parsedData.items || parsedData.note || "-"),
      note: String(parsedData.note || "").trim(),
      ocrRawText: "",
      ocrConfidence: 0,
      laborWeek: String(parsedData.laborWeek || "").trim(),
      laborMonth: String(parsedData.laborMonth || "").trim(),
      parsedAt: "",
      normalizedAt: new Date().toISOString(),
      merchantNeedsConfirmation: false
    };
  }

  return applyParserMetadataToRecord_(record, evaluation, {
    aiUsed: safeOptions.aiUsed === true,
    status: safeOptions.status || evaluation.status,
    warnings: safeOptions.warnings || []
  });
}

function buildGeminiParsedResult_(cleanJson, normalizedRecord) {
  const safeCleanJson = cleanJson || {};
  const safeRecord = normalizedRecord || {};
  const parsedData = {
    type: safeRecord.type || safeCleanJson.type || "expense",
    date: safeRecord.date || safeCleanJson.date || "",
    _dateProvided: !!(safeCleanJson.date || safeRecord.date),
    merchant: safeRecord.merchant || safeCleanJson.merchant || "",
    amount: Number(safeRecord.amount || safeCleanJson.amount || 0),
    category: safeRecord.category || safeCleanJson.category || "",
    job: safeRecord.job || safeCleanJson.job || "",
    items: safeRecord.items || safeCleanJson.items || "",
    note: safeRecord.note || safeCleanJson.note || "",
    laborWeek: safeRecord.laborWeek || "",
    laborMonth: safeRecord.laborMonth || ""
  };

  return buildRuleParsedResult_(parsedData, normalizeOcrConfidenceValue_(safeRecord.ocrConfidence || 0.90) || 0.90, {
    parseMethod: PARSE_METHOD_GEMINI,
    rawParserName: "gemini_receipt_parser"
  });
}

function buildManualParsedResultFromRecord_(record) {
  const safeRecord = record || {};
  return buildRuleParsedResult_({
    type: safeRecord.type || "expense",
    date: safeRecord.date || safeRecord.occurredAt || "",
    _dateProvided: !!(safeRecord.date || safeRecord.occurredAt),
    merchant: safeRecord.merchant || "",
    amount: Number(safeRecord.amount || 0),
    category: safeRecord.category || "",
    job: safeRecord.job || safeRecord.jobNameNormalized || "",
    items: safeRecord.items || "",
    note: safeRecord.note || "",
    laborWeek: safeRecord.laborWeek || "",
    laborMonth: safeRecord.laborMonth || ""
  }, 0.90, {
    parseMethod: PARSE_METHOD_MANUAL,
    rawParserName: "manual_edit_validation"
  });
}

function detectParsedTransactionConflicts_(primaryResult, secondaryResult) {
  const primary = normalizeParsedResultShape_(primaryResult).parsedData || {};
  const secondary = normalizeParsedResultShape_(secondaryResult).parsedData || {};
  const conflicts = [];

  if (primary.type && secondary.type && normalizeRuleTransactionType_(primary.type) !== normalizeRuleTransactionType_(secondary.type)) {
    conflicts.push("type_conflict");
  }

  const primaryAmount = Number(primary.amount || 0);
  const secondaryAmount = Number(secondary.amount || 0);
  if (primaryAmount > 0 && secondaryAmount > 0 && Math.abs(primaryAmount - secondaryAmount) > 0.01) {
    conflicts.push("amount_conflict");
  }

  const primaryJob = normalizeComparableText_(normalizeJobAlias_(primary.job || ""));
  const secondaryJob = normalizeComparableText_(normalizeJobAlias_(secondary.job || ""));
  const genericJob = normalizeComparableText_("งานทั่วไป");
  if (primaryJob && secondaryJob && primaryJob !== genericJob && secondaryJob !== genericJob && primaryJob !== secondaryJob) {
    conflicts.push("job_conflict");
  }

  return conflicts;
}

function buildRuleParsedResult_(parsedData, confidence, options) {
  const safeOptions = options || {};
  const result = {
    parsedData: parsedData || {},
    confidence: normalizeParserConfidence_(confidence),
    missingFields: [],
    warnings: uniqueStrings_(safeOptions.warnings || []),
    parseMethod: String(safeOptions.parseMethod || PARSE_METHOD_TEXT_RULE),
    rawParserName: String(safeOptions.rawParserName || "rule_parser"),
    conflicts: uniqueStrings_(safeOptions.conflicts || [])
  };
  result.missingFields = buildConfidenceGateMissingFields_(result.parsedData);
  return result;
}

function buildRuleParseFailure_(parseMethod, rawParserName, warnings) {
  return {
    parsedData: {},
    confidence: 0,
    missingFields: ["amount", "date", "type", "scope"],
    warnings: uniqueStrings_(warnings || []),
    parseMethod: String(parseMethod || PARSE_METHOD_TEXT_RULE),
    rawParserName: String(rawParserName || "rule_parser"),
    conflicts: []
  };
}

function chooseBestRuleParsedResult_(results, parseMethod, rawParserName) {
  const validResults = (results || []).filter(function(result) {
    return result && result.parsedData && Object.keys(result.parsedData).length;
  });
  if (!validResults.length) {
    return buildRuleParseFailure_(parseMethod, rawParserName, ["unmatched_pattern"]);
  }

  validResults.sort(function(a, b) {
    return Number(b.confidence || 0) - Number(a.confidence || 0);
  });
  return validResults[0];
}

function buildConfidenceGateMissingFields_(parsedData) {
  const data = parsedData || {};
  const missing = [];
  if (Number(data.amount || 0) <= 0) missing.push("amount");
  if (!data.date || data._dateProvided === false) missing.push("date");
  if (!normalizeRuleTransactionType_(data.type)) missing.push("type");
  if (!hasValidTransactionScope_(data)) missing.push("scope");
  return uniqueStrings_(missing);
}

function hasValidTransactionScope_(parsedData) {
  const data = parsedData || {};
  try {
    const keys = buildExpenseQueryKeys_(Object.assign({}, data, {
      date: data.date || formatDateToYMD(new Date()),
      status: RECORD_STATUS_IMPORTED
    }));
    return keys.scopeType !== SUMMARY_SCOPE_TYPE_UNKNOWN && !!keys.scopeKey;
  } catch (err) {
    logError_("hasValidTransactionScope_.error", err);
    return false;
  }
}

function scoreRuleConfidence_(parsedData, facts) {
  const data = parsedData || {};
  const safeFacts = facts || {};
  let score = safeFacts.structured ? 0.55 : 0.42;
  if (normalizeRuleTransactionType_(data.type)) score += 0.05;
  if (data.category) score += 0.08;
  if (data.job && normalizeComparableText_(data.job) !== normalizeComparableText_("งานทั่วไป")) score += 0.12;
  if (data.items && data.items !== "-") score += 0.05;
  if (safeFacts.hasAmount) score += 0.14;
  if (safeFacts.hasDate) score += 0.10;
  if (safeFacts.hasLaborPeriod) score += 0.06;
  if (hasValidTransactionScope_(data)) score += 0.08;
  return Math.min(score, 0.97);
}

function normalizeParsedResultShape_(parsedResult) {
  const result = parsedResult || {};
  return {
    parsedData: result.parsedData || {},
    confidence: normalizeParserConfidence_(result.confidence),
    missingFields: uniqueStrings_(result.missingFields || []),
    warnings: uniqueStrings_(result.warnings || []),
    parseMethod: String(result.parseMethod || ""),
    rawParserName: String(result.rawParserName || ""),
    conflicts: uniqueStrings_(result.conflicts || [])
  };
}

function normalizeParserConfidence_(value) {
  const confidence = Number(value || 0);
  if (!isFinite(confidence) || confidence < 0) return 0;
  if (confidence > 1) return Math.min(confidence / 100, 1);
  return confidence;
}

function normalizeRuleTransactionType_(type) {
  const value = String(type || "").trim().toLowerCase();
  if (value === "income") return "income";
  if (value === "expense") return "expense";
  return "";
}

function splitRuleParts_(text) {
  return String(text || "")
    .split("_")
    .map(function(part) {
      return cleanText_(part);
    })
    .filter(Boolean);
}

function extractRuleAmount_(text) {
  const input = String(text || "")
    .replace(/\b(20\d{2}|25\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/g, " ")
    .replace(/\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\/(20\d{2}|25\d{2})\b/g, " ")
    .replace(/\bW(?:EEK|K)?\s*[1-5]\b/gi, " ");
  const currencyMatch = input.match(/(?:฿|บาท|ยอด|จำนวน|amount)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/i);
  if (currencyMatch) {
    return { found: true, value: parseAmount_(currencyMatch[1]) };
  }

  const matches = input.match(/(?:^|[^\w])([0-9]{2,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]{3,}(?:\.[0-9]+)?)(?:[^\w]|$)/g) || [];
  if (!matches.length) {
    return { found: false, value: 0 };
  }

  const value = parseAmount_(matches[matches.length - 1].replace(/[^\d.,]/g, ""));
  return {
    found: value > 0,
    value: value
  };
}

function stripRuleAmountDateTokens_(text) {
  return cleanText_(String(text || "")
    .replace(/\b(20\d{2}|25\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/g, " ")
    .replace(/\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\/(20\d{2}|25\d{2})\b/g, " ")
    .replace(/(?:฿|บาท|ยอด|จำนวน|amount)\s*[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?/gi, " ")
    .replace(/(?:^|[^\w])([0-9]{2,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]{3,}(?:\.[0-9]+)?)(?:[^\w]|$)/g, " "));
}

function extractRuleDate_(text) {
  const input = String(text || "");
  const ymd = input.match(/\b(20\d{2}|25\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/);
  if (ymd) {
    const year = normalizeRuleYear_(ymd[1]);
    return {
      found: true,
      value: `${year}-${String(ymd[2]).padStart(2, "0")}-${String(ymd[3]).padStart(2, "0")}`
    };
  }

  const slash = input.match(/\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\/(20\d{2}|25\d{2})\b/);
  if (slash) {
    const year = normalizeRuleYear_(slash[3]);
    return {
      found: true,
      value: `${year}-${String(slash[2]).padStart(2, "0")}-${String(slash[1]).padStart(2, "0")}`
    };
  }

  return { found: false, value: "" };
}

function normalizeRuleYear_(yearText) {
  const year = parseInt(yearText, 10);
  return String(year > 2400 ? year - 543 : year);
}

function extractRuleJobLabel_(text) {
  const input = cleanText_(text);
  const parts = splitRuleParts_(input);
  for (const part of parts) {
    if (part.indexOf(" ") !== -1 && input.indexOf("_") === -1) continue;
    if (isLikelyJobLabel_(part)) {
      return normalizeJobAlias_(part);
    }
  }

  const tokens = input.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (isLikelyJobLabel_(token)) {
      return normalizeJobAlias_(token);
    }
  }

  return "";
}

function extractRuleMerchant_(text) {
  const input = cleanText_(text);
  const match = input.match(/(?:ผู้รับ|ร้าน|merchant|vendor)\s*[:=]\s*([^_|\n]+)/i);
  return match ? normalizeMerchantAlias_(match[1]) : "";
}

function inferIncomeCategoryFromRuleText_(text) {
  const input = normalizeComparableText_(text);
  if (input.indexOf(normalizeComparableText_("มัดจำ")) !== -1 || input.indexOf("deposit") !== -1) {
    return normalizeIncomeCategory_("เงินมัดจำ");
  }
  if (input.indexOf(normalizeComparableText_("งวด")) !== -1 || input.indexOf(normalizeComparableText_("ค่างวด")) !== -1) {
    return normalizeIncomeCategory_("ค่างวดงาน");
  }
  if (input.indexOf(normalizeComparableText_("ออกแบบ")) !== -1) {
    return normalizeIncomeCategory_("ค่าออกแบบ");
  }
  if (input.indexOf(normalizeComparableText_("ติดตั้ง")) !== -1) {
    return normalizeIncomeCategory_("ค่าติดตั้ง");
  }
  return normalizeIncomeCategory_("อื่นๆ");
}

function removeRuleKnownWords_(text, words) {
  let result = String(text || "");
  (words || []).forEach(function(word) {
    const value = String(word || "").trim();
    if (!value) return;
    result = result.replace(value, " ");
  });
  return cleanText_(result.replace(/_/g, " "));
}

function uniqueStrings_(values) {
  const seen = {};
  const result = [];
  (values || []).forEach(function(value) {
    const text = String(value || "").trim();
    if (!text || seen[text]) return;
    seen[text] = true;
    result.push(text);
  });
  return result;
}

function logParserAudit_(action, parsedResult, meta) {
  const safeMeta = meta || {};
  const evaluated = evaluateParsedTransaction(parsedResult);
  writeAuditLog_({
    action: action,
    traceId: safeMeta.traceId || "",
    lineUserId: safeMeta.lineUserId || "",
    recordId: safeMeta.recordId || "",
    status: safeMeta.status || "ok",
    newValue: {
      parseMethod: evaluated.parseMethod,
      confidence: evaluated.confidence,
      status: evaluated.status,
      missingFields: evaluated.missingFields,
      warnings: evaluated.warnings,
      rawParserName: evaluated.rawParserName
    },
    errorMessage: safeMeta.errorMessage || ""
  });
}
