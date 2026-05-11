/**
 * Receipt_Service.gs
 * Receipt file workflow, duplicate guard, confirmation, and persistence orchestration.
 */

function handleReceiptMessage_(event, context) {
  return handleReceiptMessage(event, context || {});
}


function handleReceiptMessage(event, context) {
  const replyToken = event.replyToken;
  const msgType = event.message.type;
  const fileName = String(event.message.fileName || "").toLowerCase();

  if (msgType === "file" && !fileName.endsWith(".pdf")) {
    replyText(replyToken, "ระบบรองรับเฉพาะรูปภาพ และไฟล์ PDF เท่านั้น");
    return;
  }

  processReceipt(event, context || {});
}


function processReceipt(event, context) {
  if (!event || !event.message || !event.message.id) return;

  const safeContext = context || {};
  const replyToken = event.replyToken || "";
  const suppressLineReply = safeContext.suppressLineReply === true;
  const runtimeGuard = safeContext.runtimeGuard || createRuntimeGuard();
  const sourceMessageId = String(event.message.id);
  const sourceKey = getConversationKey_(event.source);
  const perfLogger = createProcessLogger_("receipt", {
    traceId: safeContext.traceId || "",
    sourceMessageId: sourceMessageId,
    lineUserId: event.source && event.source.userId || "",
    sourceKey: sourceKey
  });

  try {
    markProcessStage_(perfLogger, "webhook_received", "ok", {
      messageType: event.message.type,
      sourceType: event.source && event.source.type || ""
    });

    markProcessStage_(perfLogger, "duplicate_check_start", "ok", {
      check: "line_message_id_cache"
    });
    assertCanContinue("duplicate_check_message_cache", runtimeGuard);
    const duplicateStateByMessage = getProcessedReceiptStateByMessageId_(sourceMessageId);
    if (duplicateStateByMessage && !(safeContext.asyncJob === true && duplicateStateByMessage === "queued")) {
      markProcessStage_(perfLogger, "duplicate_check_end", "duplicate", {
        match: "message_cache",
        state: duplicateStateByMessage
      });
      if (!suppressLineReply) {
        replyText(replyToken, buildDuplicateReceiptMessage_(duplicateStateByMessage));
      }
      markProcessStage_(perfLogger, "line_reply", "ok", { reply: "duplicate_cache" });
      finishProcessLogger_(perfLogger, "duplicate", "");
      return { ok: true, duplicate: true, reason: "message_cache", state: duplicateStateByMessage };
    }

    assertCanContinue("duplicate_check_source_message_id", runtimeGuard);
    const existingMessageDoc = findExpenseBySourceMessageId_(sourceMessageId);
    if (existingMessageDoc) {
      markProcessStage_(perfLogger, "duplicate_check_end", "duplicate", {
        match: "sourceMessageId",
        documentName: existingMessageDoc.name || ""
      });
      rememberProcessedReceiptMessageId_(sourceMessageId, "saved");
      if (!suppressLineReply) {
        replyText(replyToken, buildDuplicateReceiptMessage_("saved"));
      }
      markProcessStage_(perfLogger, "line_reply", "ok", { reply: "duplicate_source_message_id" });
      finishProcessLogger_(perfLogger, "duplicate", "");
      return { ok: true, duplicate: true, reason: "sourceMessageId", documentName: existingMessageDoc.name || "" };
    }
    markProcessStage_(perfLogger, "duplicate_check_end", "ok", {
      match: "none"
    });

    markProcessStage_(perfLogger, "line_file_download_start", "ok", {});
    assertCanContinue("line_file_download", runtimeGuard);
    const lineFile = fetchLineFileAsBase64(event);
    markProcessStage_(perfLogger, "line_file_download_end", "ok", {
      mimeType: lineFile.mimeType,
      bytes: lineFile.bytes && lineFile.bytes.length || 0,
      fileHash: lineFile.fileHash || ""
    });

    markProcessStage_(perfLogger, "duplicate_check_start", "ok", {
      check: "file_hash"
    });
    assertCanContinue("duplicate_check_file_hash", runtimeGuard);
    const existingFileRecord = getTransactionByFileHash_(lineFile.fileHash);
    if (existingFileRecord) {
      markProcessStage_(perfLogger, "duplicate_check_end", "duplicate", {
        match: "fileHash",
        documentName: existingFileRecord.documentName || ""
      });
      rememberProcessedReceiptMessageId_(sourceMessageId, "saved");
      if (!suppressLineReply) {
        replyText(replyToken, buildDuplicateReceiptMessage_("saved"));
      }
      markProcessStage_(perfLogger, "line_reply", "ok", { reply: "duplicate_file_hash" });
      finishProcessLogger_(perfLogger, "duplicate", "");
      return { ok: true, duplicate: true, reason: "fileHash", documentName: existingFileRecord.documentName || "" };
    }
    markProcessStage_(perfLogger, "duplicate_check_end", "ok", {
      match: "none"
    });

    markProcessStage_(perfLogger, "gemini_ocr_start", "ok", {
      mimeType: lineFile.mimeType
    });
    assertCanContinue("gemini_ocr", runtimeGuard);
    const geminiResult = analyzeReceiptWithGemini(lineFile.base64Data, lineFile.mimeType);
    markProcessStage_(perfLogger, "gemini_ocr_end", "ok", {
      model: geminiResult.model || ""
    });

    markProcessStage_(perfLogger, "parsing_start", "ok", {});
    assertCanContinue("receipt_parse", runtimeGuard);
    const cleanJson = geminiResult.parsedData || parseGeminiReceiptJson(geminiResult.data);
    logAiParsingResult_("", cleanJson, "ok", "");
    let normalized = normalizeReceiptData(cleanJson);
    const actor = getLineActorInfo_(event.source);
    markProcessStage_(perfLogger, "parsing_end", "ok", {
      type: normalized.type,
      category: normalized.category,
      amount: normalized.amount
    });

    markProcessStage_(perfLogger, "duplicate_check_start", "ok", {
      check: "fingerprint"
    });
    assertCanContinue("duplicate_check_fingerprint", runtimeGuard);
    const existingFingerprintRecord = getTransactionByFingerprint(buildRecordFingerprintForDuplicate_(normalized));
    if (existingFingerprintRecord) {
      markProcessStage_(perfLogger, "duplicate_check_end", "duplicate", {
        match: "fingerprint",
        documentName: existingFingerprintRecord.documentName || ""
      });
      rememberRecentReceiptState_(normalized, "saved");
      rememberProcessedReceiptMessageId_(sourceMessageId, "saved");
      if (!suppressLineReply) {
        replyText(replyToken, buildDuplicateReceiptMessage_("saved"));
      }
      markProcessStage_(perfLogger, "line_reply", "ok", { reply: "duplicate_fingerprint" });
      finishProcessLogger_(perfLogger, "duplicate", "");
      return { ok: true, duplicate: true, reason: "fingerprint", documentName: existingFingerprintRecord.documentName || "" };
    }

    markProcessStage_(perfLogger, "duplicate_check_start", "ok", {
      check: "possible_duplicate"
    });
    assertCanContinue("duplicate_check_possible", runtimeGuard);
    const duplicateInfo = inspectPossibleDuplicateReceipts_(sourceMessageId, normalized);
    markProcessStage_(perfLogger, "duplicate_check_end", duplicateInfo.possibleDuplicateIds.length ? "possible_duplicate" : "ok", {
      possibleDuplicateCount: duplicateInfo.possibleDuplicateIds.length
    });

    normalized = applyReceiptMetadata_(normalized, {
      actor: actor,
      sourceMessageId: sourceMessageId,
      sourceMimeType: lineFile.mimeType,
      fileHash: lineFile.fileHash,
      duplicateStatus: duplicateInfo.duplicateStatus,
      possibleDuplicateIds: duplicateInfo.possibleDuplicateIds,
      status: duplicateInfo.duplicateStatus === DUPLICATE_STATUS_POSSIBLE_DUPLICATE
        ? RECORD_STATUS_PENDING_REVIEW
        : RECORD_STATUS_IMPORTED
    });

    const duplicateStateByFingerprint = getRecentReceiptStateByRecord_(normalized);
    if (duplicateStateByFingerprint) {
      rememberProcessedReceiptMessageId_(sourceMessageId, duplicateStateByFingerprint);
      if (!suppressLineReply) {
        replyText(replyToken, buildDuplicateReceiptMessage_(duplicateStateByFingerprint));
      }
      markProcessStage_(perfLogger, "line_reply", "ok", { reply: "duplicate_runtime_fingerprint" });
      finishProcessLogger_(perfLogger, "duplicate", "");
      return { ok: true, duplicate: true, reason: "runtime_fingerprint", state: duplicateStateByFingerprint };
    }

    let attachment = null;
    try {
      markProcessStage_(perfLogger, "firebase_storage_upload_start", "ok", {});
      assertCanContinue("firebase_storage_upload", runtimeGuard);
      attachment = uploadReceiptAttachmentToFirebase_(lineFile, {
        sourceMessageId: sourceMessageId,
        date: normalized.date
      });
      markProcessStage_(perfLogger, "firebase_storage_upload_end", attachment ? "ok" : "skipped", {
        storagePath: attachment && attachment.path || ""
      });
    } catch (uploadErr) {
      markProcessStage_(perfLogger, "firebase_storage_upload_end", "error", {
        errorMessage: buildUserFriendlyErrorMessage_(uploadErr)
      });
      logError("processReceipt.attachmentUpload.error", uploadErr);
    }

    const laborResolution = resolveLaborWeekForRecord_(normalized, {
      forceConfirmationWhenMissingWeek: normalized.category === LABOR_CATEGORY_NAME && !normalized.laborWeek
    });
    if (laborResolution.requiresConfirmation || normalized.merchantNeedsConfirmation) {
      normalized.status = RECORD_STATUS_NEEDS_REVIEW;
      normalized.note = [
        normalized.note || "",
        laborResolution.requiresConfirmation ? "NEEDS_REVIEW: missing labor week" : "",
        normalized.merchantNeedsConfirmation ? "NEEDS_REVIEW: missing merchant" : ""
      ].filter(Boolean).join(" | ");
    }

    normalized = applyLaborPeriodToRecord_(normalized, laborResolution.week, laborResolution.month);
    const saveResult = saveReceiptRecord_(replyToken, normalized, {
      sourceMessageId: sourceMessageId,
      sourceKey: sourceKey,
      sourceMimeType: lineFile.mimeType,
      attachmentUrl: attachment && attachment.url || "",
      attachmentPath: attachment && attachment.path || "",
      attachmentMimeType: attachment && attachment.mimeType || "",
      fileHash: lineFile.fileHash,
      lineUserId: actor.lineUserId,
      displayName: actor.displayName,
      duplicateStatus: normalized.duplicateStatus,
      possibleDuplicateIds: normalized.possibleDuplicateIds || [],
      perfLogger: perfLogger,
      suppressLineReply: suppressLineReply
    });
    rememberRecentReceiptState_(normalized, "saved");
    rememberProcessedReceiptMessageId_(sourceMessageId, "saved");
    finishProcessLogger_(perfLogger, "ok", "");
    return saveResult;
  } catch (err) {
    markProcessStage_(perfLogger, "process_error", "error", {
      errorMessage: buildUserFriendlyErrorMessage_(err)
    });
    finishProcessLogger_(perfLogger, "error", err && err.message ? err.message : err);
    logError("processReceipt.error", err);
    if (!suppressLineReply) {
      safeReplyError(replyToken, err.message);
    }
    throw err;
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


function buildRecordFingerprintForDuplicate_(record) {
  return buildExpenseQueryKeys_(Object.assign({}, record || {}, {
    sheetSyncStatus: SHEET_SYNC_STATUS_PENDING,
    duplicateStatus: record && record.duplicateStatus || DUPLICATE_STATUS_UNIQUE
  })).fingerprint;
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
  const perfLogger = safeMeta.perfLogger || null;
  const sheetSyncMode = getSheetSyncMode();
  const initialSheetSyncStatus = getInitialSheetSyncStatusForMode_(sheetSyncMode);
  record = finalizeRecordMetadata_(record, safeMeta);

  markProcessStage_(perfLogger, "firestore_write_start", "ok", {});
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
    fileHash: record.fileHash,
    ocrRawText: record.ocrRawText,
    ocrConfidence: record.ocrConfidence,
    duplicateStatus: record.duplicateStatus,
    possibleDuplicateIds: record.possibleDuplicateIds,
    sheetSyncStatus: initialSheetSyncStatus,
    sheetSyncError: "",
    parsedAt: record.parsedAt,
    normalizedAt: record.normalizedAt
  });
  markProcessStage_(perfLogger, "firestore_write_end", "ok", {
    documentName: savedDoc && savedDoc.name || ""
  });
  logCreateExpense_(record, {
    recordId: savedDoc && savedDoc.name || "",
    sourceKey: String(safeMeta.sourceKey || ""),
    lineUserId: String(record.createdByLineUserId || "")
  });

  markProcessStage_(perfLogger, "google_sheets_sync_start", "ok", {
    documentName: savedDoc && savedDoc.name || "",
    sheetSyncMode: sheetSyncMode
  });
  const sheetSync = handleSheetSyncAfterFirestoreSave_(savedDoc && savedDoc.name || "", {
    target: "receipt",
    actorLineUserId: String(record.createdByLineUserId || ""),
    recordStatus: record.status,
    perfLogger: perfLogger
  });
  markProcessStage_(perfLogger, "google_sheets_sync_end", sheetSync.ok ? "ok" : "error", {
    sheetSyncMode: sheetSyncMode,
    skipped: sheetSync.skipped === true,
    errorMessage: sheetSync.errorMessage || ""
  });

  const messages = [
    isReviewStatus_(record.status)
      ? buildPendingReviewCard(record)
      : createReceiptFlex(record)
  ];
  if (!sheetSync.ok) {
    messages.push(buildSheetSyncWarningMessage_(sheetSync.errorMessage));
  }
  const alertMessage = checkBudgetAlert(record.job, record);
  if (alertMessage) {
    messages.push(alertMessage);
  }

  markProcessStage_(perfLogger, "line_reply_start", "ok", {
    messageCount: messages.length
  });
  if (!safeMeta.suppressLineReply && replyToken) {
    sendLineMessages(replyToken, messages);
  }
  markProcessStage_(perfLogger, "line_reply_end", "ok", {
    messageCount: safeMeta.suppressLineReply ? 0 : messages.length
  });

  return {
    ok: true,
    documentName: savedDoc && savedDoc.name || "",
    transactionId: savedDoc && savedDoc.name || "",
    record: record,
    sheetSync: sheetSync
  };
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
    fileHash: String(safeOptions.fileHash || record && record.fileHash || "").trim(),
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
  let status = String(record && record.status || "").trim();
  if (!status || status === RECORD_STATUS_PENDING_REVIEW) {
    if (isParseIncompleteRecord_(record)) {
      status = RECORD_STATUS_PARSE_INCOMPLETE;
    } else if (duplicateStatus === DUPLICATE_STATUS_POSSIBLE_DUPLICATE) {
      status = RECORD_STATUS_PENDING_REVIEW;
    } else if ((confidence > 0 && confidence < 0.7) || isReceiptNeedsReview_(record)) {
      status = RECORD_STATUS_NEEDS_REVIEW;
    } else {
      status = RECORD_STATUS_IMPORTED;
    }
  }

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

function isReviewStatus_(status) {
  const value = String(status || "").trim().toUpperCase();
  return value === RECORD_STATUS_PENDING_REVIEW ||
    value === RECORD_STATUS_NEEDS_REVIEW ||
    value === RECORD_STATUS_PARSE_INCOMPLETE;
}

function isReceiptNeedsReview_(record) {
  const merchant = normalizeComparableText_(record && record.merchant);
  return !merchant ||
    merchant === normalizeComparableText_("ไม่ระบุ") ||
    merchant === normalizeComparableText_("ไม่ระบุร้านค้า") ||
    record && record.merchantNeedsConfirmation === true;
}

function isParseIncompleteRecord_(record) {
  const safeRecord = record || {};
  return !safeRecord.date ||
    !safeRecord.category ||
    !safeRecord.job ||
    !safeRecord.items ||
    Number(safeRecord.amount || 0) <= 0;
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



