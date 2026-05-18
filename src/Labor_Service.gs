/**
 * Labor_Service.gs
 * Manual labor workflow, labor confirmation, and labor summaries.
 */

function handlePendingLaborConfirmationReply_(event, userText) {
  const pending = getPendingLaborConfirmation_(event.source);
  if (!pending) {
    return false;
  }

  const confirmation = pending.confirmation || {};
  const parsed = parsePendingLaborReply_(userText);
  let record = pending.record || {};

  if (confirmation.needsMerchant && parsed.merchant) {
    record.merchant = parsed.merchant;
    record.merchantNeedsConfirmation = false;
    confirmation.needsMerchant = false;
  }

  let selectedWeek = "";
  if (confirmation.needsWeek && parsed.week) {
    selectedWeek = parsed.week;
    confirmation.needsWeek = false;
  }

  if (confirmation.needsMerchant || confirmation.needsWeek) {
    savePendingLaborConfirmation_(event.source, {
      type: pending.type,
      record: record,
      confirmation: confirmation,
      meta: pending.meta || {}
    });
    replyText(
      event.replyToken,
      buildLaborConfirmationFollowupMessage_(record, confirmation),
      buildLaborConfirmationQuickReplyTexts_({
        options: confirmation.weekOptions || []
      }, confirmation)
    );
    return true;
  }

  record = applyLaborPeriodToRecord_(
    record,
    String(selectedWeek || record.laborWeek || ""),
    getMonthThai(record.date)
  );

  clearPendingLaborConfirmation_(event.source);

  if (pending.type === "manual") {
    saveManualLaborRecord_(event.replyToken, record, pending.meta || {});
    return true;
  }

  if (pending.type === "receipt_update" || pending.meta && pending.meta.documentName) {
    confirmPendingReceiptLaborRecord_(event.replyToken, record, pending.meta || {}, event);
    return true;
  }

  saveReceiptRecord_(event.replyToken, record, pending.meta || {});
  rememberRecentReceiptState_(record, "saved");
  rememberProcessedReceiptMessageId_(pending.meta && pending.meta.sourceMessageId, "saved");
  return true;
}


function parseWeekReply_(text) {
  const input = String(text || "").trim();
  const match = input.match(/(?:สัปดาห์ที่|สัปดาห์|week|wk|w)?\s*([1-5])$/i);
  return match ? match[1] : "";
}


function buildLaborConfirmationMessage_(record, resolution, state) {
  const options = (resolution.options || []).map(function(week) {
    return `- สัปดาห์ที่ ${week}`;
  });
  const lines = [
    "พบรายการค่าแรง แต่ยังต้องยืนยันข้อมูลก่อนบันทึก",
    `วันที่โอน: ${record.date}`,
    `ผู้รับ: ${record.merchant || "ไม่ระบุผู้รับ"}`,
    `ยอดเงิน: ฿${Number(record.amount || 0).toLocaleString()}`,
    `เดือน: ${resolution.month}`
  ];

  if (state && state.needsMerchant) {
    lines.push("", "กรุณาตอบชื่อผู้รับเงินจริง");
  }

  if (state && state.needsWeek) {
    lines.push("", "กรุณาตอบสัปดาห์ที่ต้องการบันทึก เช่น");
    lines.push(options.join("\n") || "- สัปดาห์ที่ 1");
  }

  if (state && state.needsMerchant && state.needsWeek) {
    lines.push("", "ตอบรวมได้ เช่น `นาย สมชาย / สัปดาห์ที่ 1`");
  }

  return lines.join("\n");
}


function buildLaborConfirmationFollowupMessage_(record, confirmation) {
  const lines = ["รายการค่าแรงนี้ยังรอยืนยันข้อมูลเพิ่มครับ"];

  if (confirmation.needsMerchant) {
    lines.push("ตอบชื่อผู้รับเงินจริงได้เลย");
  }

  if (confirmation.needsWeek) {
    lines.push("ตอบสัปดาห์ที่ต้องการ เช่น `สัปดาห์ที่ 1`");
  }

  if (confirmation.needsMerchant && confirmation.needsWeek) {
    lines.push("หรือส่งรวมแบบ `นาย สมชาย / สัปดาห์ที่ 1`");
  }

  return lines.join("\n");
}


function buildLaborConfirmationQuickReplyTexts_(resolution, state) {
  const texts = [];
  const safeState = state || {};
  const safeResolution = resolution || {};

  if (safeState.needsWeek) {
    uniqueWeekOptions_((safeResolution.options || []).concat(["1", "2", "3", "4", "5"])).forEach(function(week) {
      texts.push(`สัปดาห์ที่ ${week}`);
    });
  }

  texts.push("help");
  return texts;
}


function confirmPendingReceiptLaborRecord_(replyToken, record, meta, event) {
  const safeMeta = meta || {};
  const documentName = String(safeMeta.documentName || record && record.documentName || "").trim();
  const latestDoc = getExpenseDocumentByIdOrName_(documentName);
  const oldRecord = latestDoc ? getFirestoreRecordFromDocument_(latestDoc) : Object.assign({}, record || {});
  const nextRecord = Object.assign({}, oldRecord, record || {}, {
    documentName: latestDoc && latestDoc.name || documentName
  });

  nextRecord.note = cleanResolvedLaborReviewNote_(nextRecord.note);
  nextRecord.merchantNeedsConfirmation = false;

  const manualEvaluation = evaluateParsedTransaction(buildManualParsedResultFromRecord_(nextRecord));
  if (manualEvaluation.status === RECORD_STATUS_IMPORTED) {
    nextRecord.status = RECORD_STATUS_IMPORTED;
    nextRecord.parseMethod = PARSE_METHOD_MANUAL;
    nextRecord.parserConfidence = manualEvaluation.confidence;
    nextRecord.missingFields = [];
    nextRecord.warnings = [];
    nextRecord.rawParserName = "labor_week_quick_reply";
  } else {
    nextRecord.status = manualEvaluation.status;
    nextRecord.missingFields = manualEvaluation.missingFields;
    nextRecord.warnings = manualEvaluation.warnings;
  }

  const sheetSyncMode = getSheetSyncMode();
  nextRecord.sheetSyncStatus = getInitialSheetSyncStatusForMode_(sheetSyncMode);
  nextRecord.sheetSyncError = "";

  updateFirestoreDocument_(nextRecord);
  const sheetSync = handleSheetSyncAfterFirestoreSave_(nextRecord.documentName, {
    target: "labor_week_quick_reply",
    actorLineUserId: event && event.source && event.source.userId || safeMeta.lineUserId || "",
    recordStatus: nextRecord.status
  });
  logUpdateExpense_(oldRecord, nextRecord, {
    recordId: nextRecord.documentName,
    lineUserId: event && event.source && event.source.userId || safeMeta.lineUserId || ""
  });

  sendLineMessages(replyToken, buildReceiptCompletionMessages_(
    nextRecord,
    sheetSync,
    nextRecord.documentName
  ));
}


function cleanResolvedLaborReviewNote_(note) {
  return String(note || "")
    .split("|")
    .map(function(part) {
      return String(part || "").trim();
    })
    .filter(function(part) {
      return part && !/^NEEDS_REVIEW:/i.test(part);
    })
    .join(" | ");
}


function buildPendingLaborRecordSnapshot_(record, documentName) {
  const safeRecord = record || {};
  return {
    documentName: String(documentName || safeRecord.documentName || ""),
    transactionId: String(documentName || safeRecord.transactionId || ""),
    type: String(safeRecord.type || "expense"),
    date: String(safeRecord.date || ""),
    merchant: String(safeRecord.merchant || ""),
    amount: Number(safeRecord.amount || 0),
    category: String(safeRecord.category || ""),
    items: String(safeRecord.items || ""),
    note: String(safeRecord.note || ""),
    job: String(safeRecord.job || ""),
    laborWeek: String(safeRecord.laborWeek || ""),
    laborMonth: String(safeRecord.laborMonth || ""),
    source: String(safeRecord.source || RECORD_SOURCE_LINE_BOT),
    status: String(safeRecord.status || RECORD_STATUS_NEEDS_REVIEW),
    createdByLineUserId: String(safeRecord.createdByLineUserId || ""),
    createdByDisplayName: String(safeRecord.createdByDisplayName || ""),
    createdFromLineMessageId: String(safeRecord.createdFromLineMessageId || ""),
    storageUrl: String(safeRecord.storageUrl || ""),
    storagePath: String(safeRecord.storagePath || ""),
    fileHash: String(safeRecord.fileHash || ""),
    duplicateStatus: String(safeRecord.duplicateStatus || DUPLICATE_STATUS_UNIQUE),
    parseMethod: String(safeRecord.parseMethod || ""),
    aiUsed: safeRecord.aiUsed === true,
    parserConfidence: Number(safeRecord.parserConfidence || 0),
    missingFields: normalizeStringList_(safeRecord.missingFields || []),
    warnings: normalizeStringList_(safeRecord.warnings || [])
  };
}


function parsePendingLaborReply_(text) {
  const input = String(text || "").trim();
  const parts = input.split("/").map(function(part) {
    return String(part || "").trim();
  }).filter(Boolean);

  let week = parseWeekReply_(input);
  let merchant = "";

  if (parts.length >= 2) {
    merchant = cleanupPendingMerchantReply_(parts[0]);
    week = week || parseWeekReply_(parts[1]);
  } else if (!week) {
    merchant = cleanupPendingMerchantReply_(input);
  }

  return {
    merchant: merchant,
    week: week
  };
}


function cleanupPendingMerchantReply_(text) {
  return String(text || "")
    .replace(/^ชื่อผู้รับ[:\s-]*/i, "")
    .replace(/^ผู้รับ[:\s-]*/i, "")
    .replace(/(?:สัปดาห์ที่|สัปดาห์|week)\s*[1-5].*$/i, "")
    .trim();
}


function savePendingLaborConfirmation_(source, payload) {
  const cache = CacheService.getScriptCache();
  cache.put(
    `pending_labor_week:${getConversationKey_(source)}`,
    JSON.stringify(payload),
    PENDING_LABOR_CONFIRM_TTL_SEC
  );
}


function getPendingLaborConfirmation_(source) {
  const cache = CacheService.getScriptCache();
  const raw = cache.get(`pending_labor_week:${getConversationKey_(source)}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}


function clearPendingLaborConfirmation_(source) {
  const cache = CacheService.getScriptCache();
  cache.remove(`pending_labor_week:${getConversationKey_(source)}`);
}


function buildLaborJobName_(week, month) {
  return `ค่าแรงประจำสัปดาห์ที่ ${week} เดือน ${month}`;
}


function applyLaborPeriodToRecord_(record, week, month) {
  if (!record || record.category !== LABOR_CATEGORY_NAME) {
    return Object.assign({}, record || {}, {
      laborWeek: "",
      laborMonth: ""
    });
  }

  const finalWeek = String(week || "").trim();
  const finalMonth = String(month || getMonthThai(record.date)).trim();
  const nextRecord = Object.assign({}, record, {
    laborWeek: finalWeek,
    laborMonth: finalMonth
  });

  if (nextRecord.category === LABOR_CATEGORY_NAME) {
    nextRecord.job = buildLaborJobName_(finalWeek || "?", finalMonth);

    const currentItems = String(nextRecord.items || "-");
    const cleanedItems = currentItems
      .replace(/^\[สัปดาห์ที่\s*\d+\s*เดือน\s*[^\]]+\]\s*/i, "")
      .trim();
    nextRecord.items = `[สัปดาห์ที่ ${finalWeek} เดือน ${finalMonth}] ${cleanedItems || "-"}`;
  }

  return nextRecord;
}


function resolveLaborWeekForRecord_(record, options) {
  const config = options || {};
  const month = getMonthThai(record.date);
  if (record.category !== LABOR_CATEGORY_NAME) {
    return {
      requiresConfirmation: false,
      week: "",
      month: "",
      options: []
    };
  }

  if (record.laborWeek) {
    return {
      requiresConfirmation: false,
      week: record.laborWeek,
      month: month,
      options: []
    };
  }

  if (config.forceConfirmationWhenMissingWeek) {
    return {
      requiresConfirmation: true,
      week: "",
      month: month,
      options: uniqueWeekOptions_([inferSequenceWeek_(record.date), getWeekOfMonth(record.date)])
    };
  }

  const inferred = inferLaborWeekByTransferOrder_(record.date);
  if (inferred.requiresConfirmation) {
    return inferred;
  }

  return {
    requiresConfirmation: false,
    week: inferred.week,
    month: month,
    options: []
  };
}


function inferLaborWeekByTransferOrder_(dateString) {
  const targetDate = String(dateString || "");
  const calendarWeek = String(getWeekOfMonth(targetDate));
  const month = getMonthThai(targetDate);
  const sameMonthLabor = getTransactionsByMonth(targetDate.slice(0, 7), {
    queryName: "labor_infer_transfer_order",
    filters: [
      { field: "categoryId", value: buildStableEntityId_("category", LABOR_CATEGORY_NAME) }
    ],
    orderBy: [],
    limit: 500
  });

  const sameDateWeeks = {};
  const previousDatesMap = {};

  sameMonthLabor.forEach(function(record) {
    const storedDate = String(record.date || "");
    const storedWeek = String(record.laborWeek || "");

    if (!storedDate) return;

    if (storedDate === targetDate && storedWeek) {
      sameDateWeeks[storedWeek] = true;
    }

    if (storedDate < targetDate) {
      previousDatesMap[storedDate] = true;
    }
  });

  const existingWeeks = Object.keys(sameDateWeeks);
  if (existingWeeks.length === 1) {
    return {
      requiresConfirmation: false,
      week: existingWeeks[0],
      month: month,
      options: []
    };
  }

  const previousDates = Object.keys(previousDatesMap).sort();
  const sequenceWeek = String(Math.min(previousDates.length + 1, 5));

  if (previousDates.length === 0 && Number(calendarWeek) > 1) {
    return {
      requiresConfirmation: true,
      week: sequenceWeek,
      month: month,
      options: uniqueWeekOptions_([sequenceWeek, calendarWeek])
    };
  }

  return {
    requiresConfirmation: false,
    week: sequenceWeek,
    month: month,
    options: []
  };
}


function inferSequenceWeek_(dateString) {
  const targetDate = String(dateString || "");
  const sameMonthLabor = getTransactionsByMonth(targetDate.slice(0, 7), {
    queryName: "labor_infer_sequence_week",
    filters: [
      { field: "categoryId", value: buildStableEntityId_("category", LABOR_CATEGORY_NAME) }
    ],
    orderBy: [],
    limit: 500
  });
  const previousDatesMap = {};

  sameMonthLabor.forEach(function(record) {
    const storedDate = String(record.date || "");
    if (isSameMonth_(storedDate, targetDate) && storedDate < targetDate) {
      previousDatesMap[storedDate] = true;
    }
  });

  return String(Math.min(Object.keys(previousDatesMap).length + 1, 5));
}


function uniqueWeekOptions_(weeks) {
  const map = {};
  weeks.forEach(function(week) {
    const value = String(week || "").trim();
    if (value) {
      map[value] = true;
    }
  });

  return Object.keys(map).sort(function(a, b) {
    return Number(a) - Number(b);
  });
}


function isSameMonth_(dateA, dateB) {
  const a = String(dateA || "");
  const b = String(dateB || "");
  return a.slice(0, 7) === b.slice(0, 7);
}


function getLaborSummaryByWeekAndMonth(week, monthText) {
  try {
    const monthKey = resolveMonthKeyFromThaiText_(monthText);
    const weekKey = buildWeekKey_(monthKey, week);
    const details = [];
    let total = 0;

    if (!weekKey) {
      return { type: "text", text: `อ่านเดือน/สัปดาห์ไม่สำเร็จ: ${monthText}` };
    }

    getLaborTransactionsByWeek(weekKey).forEach(function(record) {
      const receiverName = String(record.merchant || "ไม่ระบุชื่อ");
      const amount = Number(record.amount || 0);
      total += amount;
      details.push({ name: receiverName, amount: amount });
    });

    if (details.length === 0) {
      return { type: "text", text: `ไม่พบข้อมูลค่าแรง สัปดาห์ที่ ${week} ${monthText}` };
    }

    return createLaborSummaryFlex(week, monthText, details, total);
  } catch (err) {
    throw new Error("สรุปค่าแรงไม่สำเร็จ: " + err.message);
  }
}


function processManualLabor(event, amount, job, rawDate, note) {
  try {
    const formattedDate = parseThaiDateToYMD(rawDate);
    const trimmedNote = String(note || "").trim();
    const actor = getLineActorInfo_(event && event.source);
    const sourceMessageId = String(event && event.message && event.message.id || "");
    let record = {
      type: "expense",
      date: formattedDate,
      merchant: "บันทึกมือ",
      amount: parseFloat(amount),
      category: LABOR_CATEGORY_NAME,
      items: `[บันทึกมือ] ${trimmedNote}`.trim(),
      note: trimmedNote,
      job: normalizeJobAlias_(job),
      laborWeek: "",
      laborMonth: getMonthThai(formattedDate),
      ocrRawText: "",
      ocrConfidence: 0,
      parsedAt: "",
      normalizedAt: new Date().toISOString()
    };

    const laborResolution = resolveLaborWeekForRecord_(record, {
      forceConfirmationWhenMissingWeek: false
    });
    if (laborResolution.requiresConfirmation) {
      savePendingLaborConfirmation_(event.source, {
        type: "manual",
        record: record,
        confirmation: {
          needsMerchant: false,
          needsWeek: true,
          month: laborResolution.month,
          weekOptions: laborResolution.options || []
        },
        meta: {
          rawDate: rawDate,
          sourceKey: getConversationKey_(event.source),
          sourceMessageId: sourceMessageId,
          lineUserId: actor.lineUserId,
          displayName: actor.displayName
        }
      });
      replyText(
        event.replyToken,
        buildLaborConfirmationMessage_(record, laborResolution, {
          needsMerchant: false,
          needsWeek: true
        })
      );
      return;
    }

    record = applyLaborPeriodToRecord_(record, laborResolution.week, laborResolution.month);
    record.job = normalizeJobAlias_(record.job);
    saveManualLaborRecord_(event.replyToken, record, {
      rawDate: rawDate,
      sourceKey: getConversationKey_(event.source),
      sourceMessageId: sourceMessageId,
      lineUserId: actor.lineUserId,
      displayName: actor.displayName
    });
  } catch (err) {
    logError("processManualLabor.error", err);
    safeReplyError(event && event.replyToken, err.message);
  }
}


function saveManualLaborRecord_(replyToken, record, meta) {
  const safeMeta = meta || {};
  const sheetSyncMode = getSheetSyncMode();
  const initialSheetSyncStatus = getInitialSheetSyncStatusForMode_(sheetSyncMode);
  record = finalizeRecordMetadata_(record, {
    sourceMessageId: String(safeMeta.sourceMessageId || ""),
    lineUserId: String(safeMeta.lineUserId || ""),
    displayName: String(safeMeta.displayName || ""),
    duplicateStatus: DUPLICATE_STATUS_UNIQUE,
    possibleDuplicateIds: [],
    attachmentUrl: "",
    attachmentPath: ""
  });

  const savedDoc = saveToFirestore({
    type: "expense",
    date: record.date,
    merchant: record.merchant,
    amount: record.amount,
    category: record.category,
    items: record.items,
    note: record.note,
    job: record.job,
    laborWeek: record.laborWeek,
    laborMonth: record.laborMonth,
    sourceKey: String(safeMeta.sourceKey || ""),
    sourceMessageId: String(safeMeta.sourceMessageId || ""),
    sourceMimeType: "manual",
    attachmentUrl: "",
    attachmentPath: "",
    attachmentMimeType: "",
    source: record.source,
    status: record.status,
    createdByLineUserId: record.createdByLineUserId,
    createdByDisplayName: record.createdByDisplayName,
    createdFromLineMessageId: record.createdFromLineMessageId,
    storageUrl: record.storageUrl,
    storagePath: record.storagePath,
    ocrRawText: record.ocrRawText,
    ocrConfidence: record.ocrConfidence,
    duplicateStatus: record.duplicateStatus,
    possibleDuplicateIds: record.possibleDuplicateIds,
    sheetSyncStatus: initialSheetSyncStatus,
    sheetSyncError: "",
    parsedAt: record.parsedAt,
    normalizedAt: record.normalizedAt
  });
  logCreateExpense_(record, {
    recordId: savedDoc && savedDoc.name || "",
    sourceKey: String(safeMeta.sourceKey || ""),
    lineUserId: String(record.createdByLineUserId || "")
  });

  const sheetSync = handleSheetSyncAfterFirestoreSave_(savedDoc && savedDoc.name || "", {
    target: "manual_labor",
    actorLineUserId: String(record.createdByLineUserId || ""),
    recordStatus: record.status
  });

  const rawDate = safeMeta.rawDate ? safeMeta.rawDate : record.date;
  const lines = [
    "บันทึกค่าแรงเรียบร้อย",
    `วันที่: ${rawDate}`,
    `โปรเจกต์: ${record.job}`,
    `ยอด: ฿${parseFloat(record.amount).toLocaleString()}`
  ];

  if (!sheetSync.ok) {
    lines.push(
      "",
      "หมายเหตุ: บันทึกลง Firestore แล้ว แต่ Google Sheet ยัง sync ไม่สำเร็จ",
      `สาเหตุ: ${buildUserFriendlyErrorMessage_(sheetSync.errorMessage)}`
    );
  }

  replyText(replyToken, lines.join("\n"));
}

function extractLaborWeek_(text) {
  return extractLaborPeriodFromText(text).week;
}

function extractLaborMonth_(text) {
  return extractLaborPeriodFromText(text).month;
}

function shouldAskLaborConfirmation_(record, resolution) {
  return !!(
    record &&
    record.category === LABOR_CATEGORY_NAME &&
    resolution &&
    resolution.requiresConfirmation
  );
}

function buildLaborConfirmationText_(record, resolution, options) {
  return buildLaborConfirmationMessage_(record, resolution, options || {});
}


