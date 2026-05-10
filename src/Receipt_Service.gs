/**
 * Receipt_Service.gs
 * Receipt file workflow, duplicate guard, confirmation, and persistence orchestration.
 */

function handleReceiptMessage_(event, context) {
  return handleReceiptMessage(event);
}


function handleReceiptMessage(event) {
  const replyToken = event.replyToken;
  const msgType = event.message.type;
  const fileName = String(event.message.fileName || "").toLowerCase();

  if (msgType === "file" && !fileName.endsWith(".pdf")) {
    replyText(replyToken, "ระบบรองรับเฉพาะรูปภาพ และไฟล์ PDF เท่านั้น");
    return;
  }

  processReceipt(event);
}


function processReceipt(event) {
  if (!event || !event.replyToken || !event.message || !event.message.id) return;

  const replyToken = event.replyToken;
  const sourceMessageId = String(event.message.id);
  const startedAt = Date.now();

  try {
    const duplicateStateByMessage = getProcessedReceiptStateByMessageId_(sourceMessageId);
    if (duplicateStateByMessage) {
      replyText(replyToken, buildDuplicateReceiptMessage_(duplicateStateByMessage));
      return;
    }

    if (findExpenseBySourceMessageId_(sourceMessageId)) {
      rememberProcessedReceiptMessageId_(sourceMessageId, "saved");
      replyText(replyToken, buildDuplicateReceiptMessage_("saved"));
      return;
    }

    const lineFile = fetchLineFileAsBase64(event);
    const geminiResult = analyzeReceiptWithGemini(lineFile.base64Data, lineFile.mimeType);
    const cleanJson = geminiResult.parsedData || parseGeminiReceiptJson(geminiResult.data);
    logAiParsingResult_("", cleanJson, "ok", "");
    let normalized = normalizeReceiptData(cleanJson);
    const actor = getLineActorInfo_(event.source);
    const duplicateInfo = inspectPossibleDuplicateReceipts_(sourceMessageId, normalized);
    normalized = applyReceiptMetadata_(normalized, {
      actor: actor,
      sourceMessageId: sourceMessageId,
      sourceMimeType: lineFile.mimeType,
      duplicateStatus: duplicateInfo.duplicateStatus,
      possibleDuplicateIds: duplicateInfo.possibleDuplicateIds,
      status: duplicateInfo.duplicateStatus === DUPLICATE_STATUS_POSSIBLE_DUPLICATE
        ? RECORD_STATUS_PENDING_REVIEW
        : RECORD_STATUS_IMPORTED
    });

    const duplicateStateByFingerprint = getRecentReceiptStateByRecord_(normalized);
    if (duplicateStateByFingerprint) {
      rememberProcessedReceiptMessageId_(sourceMessageId, duplicateStateByFingerprint);
      replyText(replyToken, buildDuplicateReceiptMessage_(duplicateStateByFingerprint));
      return;
    }

    let attachment = null;
    try {
      attachment = uploadReceiptAttachmentToFirebase_(lineFile, {
        sourceMessageId: sourceMessageId,
        date: normalized.date
      });
    } catch (uploadErr) {
      logError("processReceipt.attachmentUpload.error", uploadErr);
    }

    const laborResolution = resolveLaborWeekForRecord_(normalized, {
      forceConfirmationWhenMissingWeek: normalized.category === LABOR_CATEGORY_NAME && !normalized.laborWeek
    });
    if (laborResolution.requiresConfirmation || normalized.merchantNeedsConfirmation) {
      rememberRecentReceiptState_(normalized, "pending");
      rememberProcessedReceiptMessageId_(sourceMessageId, "pending");
      savePendingLaborConfirmation_(event.source, {
        type: "receipt",
        record: normalized,
        confirmation: {
          needsMerchant: !!normalized.merchantNeedsConfirmation,
          needsWeek: !!laborResolution.requiresConfirmation,
          month: laborResolution.month,
          weekOptions: laborResolution.options || []
        },
        meta: {
          sourceMessageId: sourceMessageId,
          sourceKey: getConversationKey_(event.source),
          sourceMimeType: lineFile.mimeType,
          attachmentUrl: attachment && attachment.url || "",
          attachmentPath: attachment && attachment.path || "",
          attachmentMimeType: attachment && attachment.mimeType || "",
          lineUserId: actor.lineUserId,
          displayName: actor.displayName,
          duplicateStatus: normalized.duplicateStatus,
          possibleDuplicateIds: normalized.possibleDuplicateIds || []
        }
      });
      replyText(
        replyToken,
        buildLaborConfirmationMessage_(normalized, laborResolution, {
          needsMerchant: !!normalized.merchantNeedsConfirmation,
          needsWeek: !!laborResolution.requiresConfirmation
        }),
        buildLaborConfirmationQuickReplyTexts_(laborResolution, {
          needsMerchant: !!normalized.merchantNeedsConfirmation,
          needsWeek: !!laborResolution.requiresConfirmation
        })
      );
      return;
    }

    normalized = applyLaborPeriodToRecord_(normalized, laborResolution.week, laborResolution.month);
    saveReceiptRecord_(replyToken, normalized, {
      sourceMessageId: sourceMessageId,
      sourceKey: getConversationKey_(event.source),
      sourceMimeType: lineFile.mimeType,
      attachmentUrl: attachment && attachment.url || "",
      attachmentPath: attachment && attachment.path || "",
      attachmentMimeType: attachment && attachment.mimeType || "",
      lineUserId: actor.lineUserId,
      displayName: actor.displayName,
      duplicateStatus: normalized.duplicateStatus,
      possibleDuplicateIds: normalized.possibleDuplicateIds || []
    });
    rememberRecentReceiptState_(normalized, "saved");
    rememberProcessedReceiptMessageId_(sourceMessageId, "saved");
    logInfo("processReceipt.performance", {
      sourceMessageId: sourceMessageId,
      ms: Date.now() - startedAt
    });
  } catch (err) {
    logInfo("processReceipt.performance", {
      sourceMessageId: sourceMessageId,
      status: "error",
      ms: Date.now() - startedAt
    });
    logError("processReceipt.error", err);
    safeReplyError(replyToken, err.message);
  }
}


function getReceiptProcessCache_() {
  return CacheService.getScriptCache();
}


function buildReceiptFingerprint_(record) {
  const amount = Number(record && record.amount || 0).toFixed(2);
  return [
    "receipt",
    normalizeComparableText_(record && record.date),
    amount,
    normalizeComparableText_(record && record.merchant),
    normalizeComparableText_(record && record.category),
    normalizeComparableText_(record && record.job),
    normalizeComparableText_(record && record.items)
  ].join("|");
}


function getProcessedReceiptStateByMessageId_(messageId) {
  const target = String(messageId || "").trim();
  if (!target) return "";
  return String(getReceiptProcessCache_().get(`receipt_msg:${target}`) || "").trim();
}


function rememberProcessedReceiptMessageId_(messageId, state) {
  const target = String(messageId || "").trim();
  if (!target) return;
  getReceiptProcessCache_().put(
    `receipt_msg:${target}`,
    String(state || "saved"),
    RECENT_RECEIPT_DUP_TTL_SEC
  );
}


function getRecentReceiptStateByRecord_(record) {
  const fingerprint = buildReceiptFingerprint_(record);
  return String(getReceiptProcessCache_().get(`receipt_fp:${fingerprint}`) || "").trim();
}


function rememberRecentReceiptState_(record, state) {
  const fingerprint = buildReceiptFingerprint_(record);
  getReceiptProcessCache_().put(
    `receipt_fp:${fingerprint}`,
    String(state || "saved"),
    RECENT_RECEIPT_DUP_TTL_SEC
  );
}


function forgetReceiptProcessCacheForRecord_(record) {
  const cache = getReceiptProcessCache_();
  const sourceMessageId = String(record && record.sourceMessageId || "").trim();
  if (sourceMessageId) {
    cache.remove(`receipt_msg:${sourceMessageId}`);
  }
  cache.remove(`receipt_fp:${buildReceiptFingerprint_(record || {})}`);
}


function buildDuplicateReceiptMessage_(state) {
  if (String(state || "") === "pending") {
    return [
      "รายการนี้อยู่ระหว่างรอยืนยัน",
      "────────────",
      "สลิปนี้ถูกส่งเข้ามาแล้ว",
      "ให้ตอบข้อมูลยืนยันในแชตเดิมเพื่อบันทึกต่อ"
    ].join("\n");
  }

  return [
    "ไม่บันทึกซ้ำ",
    "────────────",
    "สลิปนี้ถูกบันทึกไปแล้ว",
    "ระบบจะไม่บันทึกซ้ำให้อีกครั้ง"
  ].join("\n");
}


function saveReceiptRecord_(replyToken, record, meta) {
  validateReceiptBeforeSave_(record);
  const safeMeta = meta || {};
  record = finalizeRecordMetadata_(record, safeMeta);

  const savedDoc = saveToFirestore({
    type: record.type || "expense",
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
    sourceMimeType: String(safeMeta.sourceMimeType || ""),
    attachmentUrl: String(safeMeta.attachmentUrl || ""),
    attachmentPath: String(safeMeta.attachmentPath || ""),
    attachmentMimeType: String(safeMeta.attachmentMimeType || ""),
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
    parsedAt: record.parsedAt,
    normalizedAt: record.normalizedAt
  });
  logCreateExpense_(record, {
    recordId: savedDoc && savedDoc.name || "",
    sourceKey: String(safeMeta.sourceKey || ""),
    lineUserId: String(record.createdByLineUserId || "")
  });

  const sheetSync = saveExpenseToSheetSafely_({
    type: record.type || "expense",
    date: record.date,
    merchant: record.merchant,
    category: record.category,
    job: record.job,
    amount: record.amount,
    items: record.items,
    note: record.note,
    laborWeek: record.laborWeek,
    laborMonth: record.laborMonth,
    attachmentUrl: String(safeMeta.attachmentUrl || ""),
    attachmentPath: String(safeMeta.attachmentPath || ""),
    attachmentMimeType: String(safeMeta.attachmentMimeType || ""),
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
    parsedAt: record.parsedAt,
    normalizedAt: record.normalizedAt
  }, savedDoc && savedDoc.name || "");

  const messages = [createReceiptFlex(record)];
  if (!sheetSync.ok) {
    messages.push(buildSheetSyncWarningMessage_(sheetSync.errorMessage));
  }
  const alertMessage = checkBudgetAlert(record.job, record);
  if (alertMessage) {
    messages.push(alertMessage);
  }

  sendLineMessages(replyToken, messages);
}

function buildSheetSyncWarningMessage_(errorMessage) {
  return {
    type: "text",
    text: [
      "บันทึกข้อมูลหลักลง Firestore แล้ว",
      "แต่ Google Sheet ยัง sync ไม่สำเร็จ",
      `สาเหตุ: ${buildUserFriendlyErrorMessage_(errorMessage)}`,
      "ให้ตรวจสิทธิ์ Sheet แล้วรันซ่อม/บันทึกใหม่ภายหลัง"
    ].join("\n")
  };
}

function applyReceiptMetadata_(record, options) {
  const safeOptions = options || {};
  const safeActor = safeOptions.actor || {};
  const storageUrl = String(safeOptions.attachmentUrl || record && record.storageUrl || record && record.attachmentUrl || "").trim();
  const storagePath = String(safeOptions.attachmentPath || record && record.storagePath || record && record.attachmentPath || "").trim();

  return Object.assign({}, record || {}, {
    source: RECORD_SOURCE_LINE_BOT,
    status: String(safeOptions.status || record && record.status || RECORD_STATUS_IMPORTED),
    createdByLineUserId: String(safeActor.lineUserId || safeOptions.lineUserId || record && record.createdByLineUserId || "").trim(),
    createdByDisplayName: String(safeActor.displayName || safeOptions.displayName || record && record.createdByDisplayName || "").trim(),
    createdFromLineMessageId: String(safeOptions.sourceMessageId || record && record.createdFromLineMessageId || record && record.sourceMessageId || "").trim(),
    storageUrl: storageUrl,
    storagePath: storagePath,
    ocrRawText: String(record && record.ocrRawText || "").trim(),
    ocrConfidence: normalizeOcrConfidenceValue_(record && record.ocrConfidence),
    duplicateStatus: String(safeOptions.duplicateStatus || record && record.duplicateStatus || DUPLICATE_STATUS_UNIQUE),
    possibleDuplicateIds: normalizePossibleDuplicateIds_(safeOptions.possibleDuplicateIds || record && record.possibleDuplicateIds || []),
    parsedAt: String(record && record.parsedAt || "").trim(),
    normalizedAt: String(record && record.normalizedAt || new Date().toISOString()).trim()
  });
}


function finalizeRecordMetadata_(record, meta) {
  const safeMeta = meta || {};
  const possibleDuplicateIds = normalizePossibleDuplicateIds_(
    safeMeta.possibleDuplicateIds || record && record.possibleDuplicateIds || []
  );
  const duplicateStatus = String(
    safeMeta.duplicateStatus ||
    record && record.duplicateStatus ||
    (possibleDuplicateIds.length ? DUPLICATE_STATUS_POSSIBLE_DUPLICATE : DUPLICATE_STATUS_UNIQUE)
  );
  const confidence = normalizeOcrConfidenceValue_(record && record.ocrConfidence);
  const status = duplicateStatus === DUPLICATE_STATUS_POSSIBLE_DUPLICATE || (confidence > 0 && confidence < 0.7)
    ? RECORD_STATUS_PENDING_REVIEW
    : RECORD_STATUS_IMPORTED;

  return applyReceiptMetadata_(record, {
    actor: {
      lineUserId: String(safeMeta.lineUserId || record && record.createdByLineUserId || ""),
      displayName: String(safeMeta.displayName || record && record.createdByDisplayName || "")
    },
    sourceMessageId: String(safeMeta.sourceMessageId || record && record.createdFromLineMessageId || ""),
    attachmentUrl: String(safeMeta.attachmentUrl || record && record.storageUrl || ""),
    attachmentPath: String(safeMeta.attachmentPath || record && record.storagePath || ""),
    duplicateStatus: duplicateStatus,
    possibleDuplicateIds: possibleDuplicateIds,
    status: status
  });
}


function inspectPossibleDuplicateReceipts_(sourceMessageId, record) {
  const ids = findPossibleDuplicateExpenseIds_(record, sourceMessageId);
  return {
    duplicateStatus: ids.length ? DUPLICATE_STATUS_POSSIBLE_DUPLICATE : DUPLICATE_STATUS_UNIQUE,
    possibleDuplicateIds: ids
  };
}


function findPossibleDuplicateExpenseIds_(record, sourceMessageId) {
  try {
    const candidateDocs = getDocumentsForDuplicateCheck_(record, sourceMessageId);
    const targetSourceMessageId = String(sourceMessageId || "").trim();
    const targetDate = String(record && record.date || "");
    const targetAmount = Number(record && record.amount || 0);
    const targetMerchant = normalizeComparableText_(record && record.merchant);
    const targetJob = normalizeComparableText_(record && record.job);
    const ids = [];

    candidateDocs.forEach(function(doc) {
      const f = doc.fields || {};
      if (targetSourceMessageId && getFirestoreString_(f.sourceMessageId) === targetSourceMessageId) {
        return;
      }

      const sameDate = getFirestoreString_(f.date) === targetDate;
      const sameAmount = Math.abs(getFirestoreNumber(f.amount) - targetAmount) < 0.01;
      const sameMerchant = normalizeComparableText_(getFirestoreString_(f.merchant)) === targetMerchant;
      const sameJob = normalizeComparableText_(getFirestoreString_(f.job)) === targetJob;

      if (sameDate && sameAmount && (sameMerchant || sameJob)) {
        ids.push(String(doc.name || ""));
      }
    });

    return ids.filter(Boolean).slice(0, 10);
  } catch (err) {
    logError("findPossibleDuplicateExpenseIds_.error", err);
    return [];
  }
}


function normalizePossibleDuplicateIds_(ids) {
  if (Array.isArray(ids)) {
    return ids.map(function(id) {
      return String(id || "").trim();
    }).filter(Boolean);
  }

  return String(ids || "")
    .split(/[\n,]+/)
    .map(function(id) {
      return String(id || "").trim();
    })
    .filter(Boolean);
}

function buildReceiptRecord_(cleanJson) {
  return normalizeReceiptData(cleanJson);
}

function validateReceiptBeforeSave_(record) {
  if (!record) {
    throw new Error("ไม่พบข้อมูลสลิปสำหรับบันทึก");
  }
  if (!record.date) {
    throw new Error("ไม่พบวันที่ในข้อมูลสลิป");
  }
  if (!record.amount || Number(record.amount) <= 0) {
    throw new Error("ไม่พบยอดเงินที่ใช้งานได้");
  }
  if (!record.category) {
    throw new Error("ไม่พบหมวดหมู่ค่าใช้จ่าย");
  }
  return true;
}

function checkDuplicateReceipt_(sourceMessageId, record) {
  if (sourceMessageId && getProcessedReceiptStateByMessageId_(sourceMessageId)) {
    return true;
  }
  if (sourceMessageId && findExpenseBySourceMessageId_(sourceMessageId)) {
    return true;
  }
  return !!getRecentReceiptStateByRecord_(record);
}

function saveReceiptWithAttachment_(replyToken, record, meta) {
  validateReceiptBeforeSave_(record);
  saveReceiptRecord_(replyToken, record, meta || {});
}

function buildReceiptResult_(record) {
  return createReceiptFlex(record);
}



