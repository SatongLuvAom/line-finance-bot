/**
 * Firestore_Repository.gs
 * Firestore persistence and query helpers.
 */

var EXPENSE_DOCUMENTS_EXECUTION_CACHE_ = {
  fetchedAt: 0,
  documents: null
};


function firestoreRequest(method, path, payload) {
  try {
    const config = getConfig();
    const url = `https://firestore.googleapis.com/v1/projects/${config.firebaseProjectId}/databases/(default)/documents/${path}`;
    const options = {
      method: method,
      contentType: "application/json",
      muteHttpExceptions: true,
      headers: {
        Authorization: `Bearer ${ScriptApp.getOAuthToken()}`
      }
    };

    if (payload) {
      options.payload = JSON.stringify(payload);
    }

    const res = safeUrlFetch(url, options, {
      service: "firestore",
      method: method,
      action: path
    });
    const statusCode = res.getResponseCode();
    const bodyText = res.getContentText();

    let json = {};
    try {
      json = bodyText ? JSON.parse(bodyText) : {};
    } catch (err) {
      throw new Error(`Firestore ตอบกลับไม่เป็น JSON: ${bodyText}`);
    }

    if (statusCode < 200 || statusCode >= 300) {
      const errMsg = json.error && json.error.message ? json.error.message : bodyText;
      throw new Error(`Firestore HTTP ${statusCode}: ${errMsg}`);
    }

    return json;
  } catch (err) {
    throw new Error("Firestore request ไม่สำเร็จ: " + err.message);
  }
}


function saveToFirestore(record) {
  const nowIso = new Date().toISOString();
  const safeRecord = Object.assign({}, record || {}, {
    createdAt: record && record.createdAt || nowIso,
    updatedAt: record && record.updatedAt || nowIso
  });
  const queryKeys = buildExpenseQueryKeys_(safeRecord);
  const payload = {
    fields: {
      type: { stringValue: queryKeys.type },
      date: { stringValue: String(safeRecord.date || "") },
      dateKey: { stringValue: queryKeys.dateKey },
      monthKey: { stringValue: queryKeys.monthKey },
      weekKey: { stringValue: queryKeys.weekKey },
      isActive: { booleanValue: queryKeys.isActive },
      merchant: { stringValue: String(safeRecord.merchant || "") },
      amount: { doubleValue: Number(safeRecord.amount || 0) },
      category: { stringValue: String(safeRecord.category || "") },
      categoryId: { stringValue: queryKeys.categoryId },
      items: { stringValue: String(safeRecord.items || "") },
      note: { stringValue: String(safeRecord.note || "") },
      job: { stringValue: String(safeRecord.job || "") },
      jobId: { stringValue: queryKeys.jobId },
      jobNameNormalized: { stringValue: queryKeys.jobNameNormalized },
      projectId: { stringValue: queryKeys.projectId },
      projectNameNormalized: { stringValue: queryKeys.projectNameNormalized },
      projectSearchKeys: buildFirestoreStringArrayField_(queryKeys.projectSearchKeys),
      costCenter: { stringValue: queryKeys.costCenter },
      scope: { stringValue: queryKeys.scope },
      scopeType: { stringValue: queryKeys.scopeType },
      scopeKey: { stringValue: queryKeys.scopeKey },
      reviewNeeded: { booleanValue: queryKeys.reviewNeeded },
      isFactoryExpense: { booleanValue: queryKeys.isFactoryExpense },
      factoryReviewNeeded: { booleanValue: queryKeys.factoryReviewNeeded },
      vendorId: { stringValue: queryKeys.vendorId },
      workerId: { stringValue: queryKeys.workerId },
      laborWeek: buildFirestoreLaborWeekField_(safeRecord.laborWeek),
      laborMonth: { stringValue: String(safeRecord.laborMonth || "") },
      sourceKey: { stringValue: String(safeRecord.sourceKey || "") },
      sourceMessageId: { stringValue: String(safeRecord.sourceMessageId || "") },
      sourceMimeType: { stringValue: String(safeRecord.sourceMimeType || "") },
      attachmentUrl: { stringValue: String(safeRecord.attachmentUrl || "") },
      attachmentPath: { stringValue: String(safeRecord.attachmentPath || "") },
      attachmentMimeType: { stringValue: String(safeRecord.attachmentMimeType || "") },
      source: { stringValue: String(safeRecord.source || RECORD_SOURCE_LINE_BOT) },
      status: { stringValue: queryKeys.status },
      createdByLineUserId: { stringValue: queryKeys.createdByLineUserId },
      createdByDisplayName: { stringValue: String(safeRecord.createdByDisplayName || "") },
      createdFromLineMessageId: { stringValue: String(safeRecord.createdFromLineMessageId || safeRecord.sourceMessageId || "") },
      storageUrl: { stringValue: String(safeRecord.storageUrl || safeRecord.attachmentUrl || "") },
      storagePath: { stringValue: String(safeRecord.storagePath || safeRecord.attachmentPath || "") },
      fileHash: { stringValue: String(safeRecord.fileHash || "") },
      ocrRawText: { stringValue: truncateText_(String(safeRecord.ocrRawText || ""), 20000) },
      ocrConfidence: { doubleValue: normalizeOcrConfidenceValue_(safeRecord.ocrConfidence) },
      duplicateStatus: { stringValue: queryKeys.duplicateStatus },
      possibleDuplicateIds: buildFirestoreStringArrayField_(safeRecord.possibleDuplicateIds),
      fingerprint: { stringValue: queryKeys.fingerprint },
      sheetSyncStatus: { stringValue: queryKeys.sheetSyncStatus },
      sheetSyncError: { stringValue: String(safeRecord.sheetSyncError || "") },
      sheetSyncedAt: { stringValue: "" },
      parseMethod: { stringValue: String(safeRecord.parseMethod || "") },
      aiUsed: { booleanValue: safeRecord.aiUsed === true },
      parserConfidence: { doubleValue: normalizeParserConfidence_(safeRecord.parserConfidence || 0) },
      missingFields: buildFirestoreStringArrayField_(safeRecord.missingFields),
      warnings: buildFirestoreStringArrayField_(safeRecord.warnings),
      rawParserName: { stringValue: String(safeRecord.rawParserName || "") },
      parsedAt: { stringValue: String(safeRecord.parsedAt || "") },
      normalizedAt: { stringValue: String(safeRecord.normalizedAt || "") },
      occurredAt: { stringValue: queryKeys.occurredAt },
      createdAt: { stringValue: queryKeys.createdAt },
      updatedAt: { stringValue: queryKeys.updatedAt }
    }
  };

  const savedDoc = firestoreRequest("post", "expenses", payload);
  invalidateExpenseDocumentsCache_();
  return savedDoc;
}


function getAllExpenses() {
  // Deprecated for normal bot commands. Use queryExpenses() or a specialized
  // indexed query helper instead; keep this only for dev/legacy maintenance.
  const now = Date.now();
  if (
    EXPENSE_DOCUMENTS_EXECUTION_CACHE_.documents &&
    now - EXPENSE_DOCUMENTS_EXECUTION_CACHE_.fetchedAt < FIRESTORE_EXPENSE_CACHE_TTL_MS
  ) {
    logInfo("getAllExpenses.cacheHit", {
      count: EXPENSE_DOCUMENTS_EXECUTION_CACHE_.documents.length
    });
    return EXPENSE_DOCUMENTS_EXECUTION_CACHE_.documents.slice();
  }

  const startedAt = Date.now();
  let pageToken = "";
  const documents = [];

  do {
    const path = buildExpensesListPath_(pageToken);
    const data = firestoreRequest("get", path);

    Array.prototype.push.apply(documents, data.documents || []);
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  EXPENSE_DOCUMENTS_EXECUTION_CACHE_ = {
    fetchedAt: now,
    documents: documents
  };
  logInfo("getAllExpenses.fetch", {
    count: documents.length,
    ms: Date.now() - startedAt
  });

  return documents.slice();
}


function buildExpensesListPath_(pageToken) {
  const params = ["pageSize=1000"];
  if (pageToken) {
    params.push(`pageToken=${encodeURIComponent(pageToken)}`);
  }

  FIRESTORE_EXPENSE_LIST_FIELD_MASKS.forEach(function(fieldPath) {
    params.push(`mask.fieldPaths=${encodeURIComponent(fieldPath)}`);
  });

  return `expenses?${params.join("&")}`;
}


function invalidateExpenseDocumentsCache_() {
  EXPENSE_DOCUMENTS_EXECUTION_CACHE_ = {
    fetchedAt: 0,
    documents: null
  };
}


function findExpenseBySourceMessageId_(messageId) {
  const target = String(messageId || "").trim();
  if (!target) return null;

  const queryResult = runExpenseSourceMessageIdQuery_(target);
  return queryResult.document;
}


function runExpenseSourceMessageIdQuery_(messageId) {
  try {
    const docs = queryExpenses({
      queryName: "source_message_id",
      filters: [
        { field: "sourceMessageId", value: String(messageId || "") }
      ],
      orderBy: [
        { field: "createdAt", direction: "DESCENDING" }
      ],
      limit: 1,
      selectFields: getExpenseLightSelectFields_()
    });

    return {
      ok: true,
      document: docs.length ? docs[0] : null
    };
  } catch (err) {
    logError("runExpenseSourceMessageIdQuery_.error", err);
    return {
      ok: false,
      document: null
    };
  }
}


function getFirestoreNumber(field) {
  if (!field) return 0;
  return Number(field.doubleValue || field.integerValue || 0);
}


function getFirestoreString_(field) {
  if (!field) return "";
  if (field.integerValue !== undefined) return String(field.integerValue);
  return String(field.stringValue || "");
}


function getFirestoreBoolean_(field) {
  if (!field) return false;
  return field.booleanValue === true || String(field.booleanValue).toLowerCase() === "true";
}


function getFirestoreRecordFromDocument_(doc) {
  const fields = doc && doc.fields ? doc.fields : {};
  return {
    documentName: String(doc && doc.name || ""),
    type: getFirestoreString_(fields.type) || "expense",
    date: getFirestoreString_(fields.date),
    dateKey: getFirestoreString_(fields.dateKey),
    monthKey: getFirestoreString_(fields.monthKey),
    weekKey: getFirestoreString_(fields.weekKey),
    isActive: getFirestoreBoolean_(fields.isActive),
    merchant: getFirestoreString_(fields.merchant),
    amount: getFirestoreNumber(fields.amount),
    category: getFirestoreString_(fields.category),
    categoryId: getFirestoreString_(fields.categoryId),
    items: getFirestoreString_(fields.items),
    note: getFirestoreString_(fields.note),
    job: getFirestoreString_(fields.job),
    jobId: getFirestoreString_(fields.jobId),
    jobNameNormalized: getFirestoreString_(fields.jobNameNormalized),
    projectId: getFirestoreString_(fields.projectId),
    projectNameNormalized: getFirestoreString_(fields.projectNameNormalized),
    projectSearchKeys: getFirestoreStringArray_(fields.projectSearchKeys),
    costCenter: getFirestoreString_(fields.costCenter),
    scope: getFirestoreString_(fields.scope),
    scopeType: getFirestoreString_(fields.scopeType),
    scopeKey: getFirestoreString_(fields.scopeKey),
    reviewNeeded: getFirestoreBoolean_(fields.reviewNeeded),
    isFactoryExpense: getFirestoreBoolean_(fields.isFactoryExpense),
    factoryReviewNeeded: getFirestoreBoolean_(fields.factoryReviewNeeded),
    vendorId: getFirestoreString_(fields.vendorId),
    workerId: getFirestoreString_(fields.workerId),
    laborWeek: getFirestoreString_(fields.laborWeek),
    laborMonth: getFirestoreString_(fields.laborMonth),
    sourceKey: getFirestoreString_(fields.sourceKey),
    sourceMessageId: getFirestoreString_(fields.sourceMessageId),
    sourceMimeType: getFirestoreString_(fields.sourceMimeType),
    attachmentUrl: getFirestoreString_(fields.attachmentUrl),
    attachmentPath: getFirestoreString_(fields.attachmentPath),
    attachmentMimeType: getFirestoreString_(fields.attachmentMimeType),
    source: getFirestoreString_(fields.source),
    status: getFirestoreString_(fields.status),
    createdByLineUserId: getFirestoreString_(fields.createdByLineUserId),
    createdByDisplayName: getFirestoreString_(fields.createdByDisplayName),
    createdFromLineMessageId: getFirestoreString_(fields.createdFromLineMessageId),
    storageUrl: getFirestoreString_(fields.storageUrl),
    storagePath: getFirestoreString_(fields.storagePath),
    fileHash: getFirestoreString_(fields.fileHash),
    ocrRawText: getFirestoreString_(fields.ocrRawText),
    ocrConfidence: getFirestoreNumber(fields.ocrConfidence),
    duplicateStatus: getFirestoreString_(fields.duplicateStatus),
    possibleDuplicateIds: getFirestoreStringArray_(fields.possibleDuplicateIds),
    fingerprint: getFirestoreString_(fields.fingerprint),
    sheetSyncStatus: getFirestoreString_(fields.sheetSyncStatus),
    sheetSyncError: getFirestoreString_(fields.sheetSyncError),
    sheetSyncedAt: getFirestoreString_(fields.sheetSyncedAt),
    parseMethod: getFirestoreString_(fields.parseMethod),
    aiUsed: getFirestoreBoolean_(fields.aiUsed),
    parserConfidence: getFirestoreNumber(fields.parserConfidence),
    missingFields: getFirestoreStringArray_(fields.missingFields),
    warnings: getFirestoreStringArray_(fields.warnings),
    rawParserName: getFirestoreString_(fields.rawParserName),
    parsedAt: getFirestoreString_(fields.parsedAt),
    normalizedAt: getFirestoreString_(fields.normalizedAt),
    occurredAt: getFirestoreString_(fields.occurredAt),
    createdAt: getFirestoreString_(fields.createdAt),
    updatedAt: getFirestoreString_(fields.updatedAt)
  };
}


function deleteLatestExpenseRecord_(sourceKey, actor) {
  const latestDoc = getLatestExpenseDocument_(sourceKey);
  if (!latestDoc) {
    return null;
  }

  return deleteExpenseDocument_(latestDoc, actor || {});
}


function deleteExpenseRecordByDocumentName_(documentName, actor) {
  const doc = getExpenseDocumentByIdOrName_(documentName);
  if (!doc || !doc.name) {
    return null;
  }

  return deleteExpenseDocument_(doc, actor || {});
}


function getExpenseDocumentByIdOrName_(transactionId) {
  const input = String(transactionId || "").trim();
  if (!input) {
    return null;
  }

  const relativePath = getFirestoreRelativePath_(
    input.indexOf("/") === -1 ? `expenses/${input}` : input
  );
  if (!relativePath) {
    return null;
  }

  try {
    const doc = firestoreRequest("get", relativePath);
    return doc && doc.name ? doc : null;
  } catch (err) {
    logError("getExpenseDocumentByIdOrName_.error", err);
    return null;
  }
}


function deleteExpenseDocument_(doc, actor) {
  const record = getFirestoreRecordFromDocument_(doc);
  deleteFirestoreDocument_(doc);
  invalidateExpenseDocumentsCache_();
  const sheetDeleted = deleteExpenseFromSheet_(record);
  const attachmentDeleted = deleteReceiptAttachmentFromFirebase_(record.attachmentPath);
  logDeleteExpense_(record, {
    recordId: doc && doc.name || "",
    lineUserId: actor && actor.lineUserId || ""
  });

  return {
    record: record,
    firestoreDeleted: true,
    sheetDeleted: sheetDeleted,
    attachmentDeleted: attachmentDeleted
  };
}


function getLatestExpenseDocument_(sourceKey) {
  const docs = getRecentExpenseDocuments_(sourceKey, 1);
  return docs.length ? docs[0] : null;
}


function getRecentExpenseRecords_(sourceKey, limit) {
  return getRecentExpenseDocuments_(sourceKey, limit).map(function(doc) {
    return getFirestoreRecordFromDocument_(doc);
  });
}


function getRecentExpenseDocuments_(sourceKey, limit) {
  return getLatestTransactionDocumentsBySourceKey_(sourceKey, Math.max(1, Number(limit || 1)));
}


function deleteFirestoreDocument_(doc) {
  const relativePath = getFirestoreRelativePath_(doc && doc.name);

  if (!relativePath) {
    throw new Error("ไม่พบ path ของเอกสาร Firestore สำหรับลบ");
  }

  firestoreRequest("delete", relativePath);
}


function getFirestoreRelativePath_(documentName) {
  const fullName = String(documentName || "");
  const marker = "/documents/";
  const markerIndex = fullName.indexOf(marker);
  return markerIndex === -1
    ? fullName
    : fullName.slice(markerIndex + marker.length);
}


function updateFirestoreDocument_(record) {
  const relativePath = getFirestoreRelativePath_(record && record.documentName);
  if (!relativePath) {
    throw new Error("ไม่พบ path ของเอกสาร Firestore สำหรับแก้ไข");
  }

  const nowIso = new Date().toISOString();
  const safeRecord = Object.assign({}, record || {}, {
    createdAt: record && record.createdAt || nowIso,
    updatedAt: nowIso
  });
  const queryKeys = buildExpenseQueryKeys_(safeRecord);
  const fields = {
    type: { stringValue: queryKeys.type },
    date: { stringValue: String(safeRecord.date || "") },
    dateKey: { stringValue: queryKeys.dateKey },
    monthKey: { stringValue: queryKeys.monthKey },
    weekKey: { stringValue: queryKeys.weekKey },
    isActive: { booleanValue: queryKeys.isActive },
    merchant: { stringValue: String(safeRecord.merchant || "") },
    amount: { doubleValue: Number(safeRecord.amount || 0) },
    category: { stringValue: String(safeRecord.category || "") },
    categoryId: { stringValue: queryKeys.categoryId },
    items: { stringValue: String(safeRecord.items || "") },
    note: { stringValue: String(safeRecord.note || "") },
    job: { stringValue: String(safeRecord.job || "") },
    jobId: { stringValue: queryKeys.jobId },
    jobNameNormalized: { stringValue: queryKeys.jobNameNormalized },
    projectId: { stringValue: queryKeys.projectId },
    projectNameNormalized: { stringValue: queryKeys.projectNameNormalized },
    projectSearchKeys: buildFirestoreStringArrayField_(queryKeys.projectSearchKeys),
    costCenter: { stringValue: queryKeys.costCenter },
    scope: { stringValue: queryKeys.scope },
    scopeType: { stringValue: queryKeys.scopeType },
    scopeKey: { stringValue: queryKeys.scopeKey },
    reviewNeeded: { booleanValue: queryKeys.reviewNeeded },
    isFactoryExpense: { booleanValue: queryKeys.isFactoryExpense },
    factoryReviewNeeded: { booleanValue: queryKeys.factoryReviewNeeded },
    vendorId: { stringValue: queryKeys.vendorId },
    workerId: { stringValue: queryKeys.workerId },
    laborWeek: buildFirestoreLaborWeekField_(safeRecord.laborWeek),
    laborMonth: { stringValue: String(safeRecord.laborMonth || "") },
    sourceKey: { stringValue: String(safeRecord.sourceKey || "") },
    sourceMessageId: { stringValue: String(safeRecord.sourceMessageId || "") },
    sourceMimeType: { stringValue: String(safeRecord.sourceMimeType || "") },
    attachmentUrl: { stringValue: String(safeRecord.attachmentUrl || "") },
    attachmentPath: { stringValue: String(safeRecord.attachmentPath || "") },
    attachmentMimeType: { stringValue: String(safeRecord.attachmentMimeType || "") },
    storageUrl: { stringValue: String(safeRecord.storageUrl || safeRecord.attachmentUrl || "") },
    storagePath: { stringValue: String(safeRecord.storagePath || safeRecord.attachmentPath || "") },
    fileHash: { stringValue: String(safeRecord.fileHash || "") },
    status: { stringValue: queryKeys.status },
    createdByLineUserId: { stringValue: queryKeys.createdByLineUserId },
    duplicateStatus: { stringValue: queryKeys.duplicateStatus },
    fingerprint: { stringValue: queryKeys.fingerprint },
    sheetSyncStatus: { stringValue: queryKeys.sheetSyncStatus },
    sheetSyncError: { stringValue: String(safeRecord.sheetSyncError || "") },
    parseMethod: { stringValue: String(safeRecord.parseMethod || "") },
    aiUsed: { booleanValue: safeRecord.aiUsed === true },
    parserConfidence: { doubleValue: normalizeParserConfidence_(safeRecord.parserConfidence || 0) },
    missingFields: buildFirestoreStringArrayField_(safeRecord.missingFields),
    warnings: buildFirestoreStringArrayField_(safeRecord.warnings),
    rawParserName: { stringValue: String(safeRecord.rawParserName || "") },
    occurredAt: { stringValue: queryKeys.occurredAt },
    createdAt: { stringValue: queryKeys.createdAt },
    updatedAt: { stringValue: queryKeys.updatedAt }
  };
  const fieldPaths = Object.keys(fields)
    .map(function(fieldName) {
      return `updateMask.fieldPaths=${encodeURIComponent(fieldName)}`;
    })
    .join("&");

  const updatedDoc = firestoreRequest("patch", `${relativePath}?${fieldPaths}`, { fields: fields });
  invalidateExpenseDocumentsCache_();
  return updatedDoc;
}


function buildFirestoreLaborWeekField_(laborWeek) {
  const value = String(laborWeek || "").trim();
  return /^[1-5]$/.test(value)
    ? { integerValue: parseInt(value, 10) }
    : { stringValue: "" };
}


function buildFirestoreStringArrayField_(values) {
  const safeValues = normalizePossibleDuplicateIds_(values);
  if (!safeValues.length) {
    return { arrayValue: {} };
  }

  return {
    arrayValue: {
      values: safeValues.map(function(value) {
        return { stringValue: value };
      })
    }
  };
}


function getFirestoreStringArray_(field) {
  if (!field || !field.arrayValue || !field.arrayValue.values) {
    return [];
  }

  return field.arrayValue.values.map(function(value) {
    return getFirestoreString_(value);
  }).filter(Boolean);
}


function markExpenseSheetSyncStatus_(documentName, status, errorMessage) {
  const relativePath = getFirestoreRelativePath_(documentName);
  if (!relativePath) {
    return null;
  }

  const safeErrorMessage = errorMessage
    ? truncateText_(buildUserFriendlyErrorMessage_(errorMessage), 500)
    : "";
  const nowIso = new Date().toISOString();
  const fields = {
    sheetSyncStatus: { stringValue: String(status || "") },
    sheetSyncError: { stringValue: safeErrorMessage },
    sheetSyncedAt: { stringValue: nowIso },
    updatedAt: { stringValue: nowIso }
  };
  const fieldPaths = Object.keys(fields)
    .map(function(fieldName) {
      return `updateMask.fieldPaths=${encodeURIComponent(fieldName)}`;
    })
    .join("&");

  const updatedDoc = firestoreRequest("patch", `${relativePath}?${fieldPaths}`, { fields: fields });
  invalidateExpenseDocumentsCache_();
  return updatedDoc;
}


function updateLatestExpenseRecord_(sourceKey, fieldText, rawValue, actor) {
  const latestDoc = getLatestExpenseDocument_(sourceKey);
  if (!latestDoc) {
    return {
      ok: false,
      reason: "not_found"
    };
  }

  return updateExpenseDocumentField_(latestDoc, fieldText, rawValue, actor, "update_latest");
}


function updateExpenseRecordById_(transactionId, fieldText, rawValue, actor) {
  const doc = getExpenseDocumentByIdOrName_(transactionId);
  if (!doc) {
    return {
      ok: false,
      reason: "not_found"
    };
  }

  return updateExpenseDocumentField_(doc, fieldText, rawValue, actor, "update_by_id");
}


function updateExpenseDocumentField_(doc, fieldText, rawValue, actor, target) {
  const oldRecord = getFirestoreRecordFromDocument_(doc);
  const newRecord = Object.assign({}, oldRecord);
  const field = normalizeEditableFieldName_(fieldText);
  const value = String(rawValue || "").trim();

  if (!field || !value) {
    return {
      ok: false,
      reason: "invalid_field",
      oldRecord: oldRecord
    };
  }

  if (field === "amount") {
    const amount = parseFloat(value.replace(/,/g, ""));
    if (!amount || amount <= 0) {
      return {
        ok: false,
        reason: "invalid_amount",
        oldRecord: oldRecord
      };
    }
    newRecord.amount = amount;
  } else if (field === "category") {
    newRecord.category = newRecord.type === "income"
      ? normalizeIncomeCategory_(value)
      : normalizeCategory(value);
    if (newRecord.category === LABOR_CATEGORY_NAME) {
      newRecord.laborMonth = newRecord.laborMonth || getMonthThai(newRecord.date);
      if (newRecord.laborWeek) {
        newRecord.job = buildLaborJobName_(newRecord.laborWeek, newRecord.laborMonth);
      }
    }
  } else if (field === "job") {
    newRecord.job = normalizeJobAlias_(value);
  } else if (field === "items") {
    newRecord.items = normalizeItemAlias_(value);
  } else if (field === "merchant") {
    newRecord.merchant = normalizeMerchantAlias_(value);
  } else if (field === "note") {
    newRecord.note = value;
  } else if (field === "date") {
    newRecord.date = normalizeDateString(value);
    if (newRecord.category === LABOR_CATEGORY_NAME) {
      newRecord.laborMonth = getMonthThai(newRecord.date);
      if (newRecord.laborWeek) {
        newRecord.job = buildLaborJobName_(newRecord.laborWeek, newRecord.laborMonth);
      }
    }
  } else if (field === "laborWeek") {
    const week = String(parseInt(value, 10) || "");
    if (!/^[1-5]$/.test(week)) {
      return {
        ok: false,
        reason: "invalid_week",
        oldRecord: oldRecord
      };
    }
    newRecord.laborWeek = week;
    newRecord.laborMonth = newRecord.laborMonth || getMonthThai(newRecord.date);
    if (newRecord.category === LABOR_CATEGORY_NAME) {
      newRecord.job = buildLaborJobName_(week, newRecord.laborMonth);
    }
  }

  const manualEvaluation = evaluateParsedTransaction(buildManualParsedResultFromRecord_(newRecord));
  if (isReviewStatus_(newRecord.status) && manualEvaluation.status === RECORD_STATUS_IMPORTED) {
    newRecord.status = RECORD_STATUS_IMPORTED;
    newRecord.parseMethod = PARSE_METHOD_MANUAL;
    newRecord.parserConfidence = manualEvaluation.confidence;
    newRecord.missingFields = [];
    newRecord.warnings = [];
    newRecord.rawParserName = "manual_edit_validation";
  } else if (isReviewStatus_(newRecord.status)) {
    newRecord.missingFields = manualEvaluation.missingFields;
    newRecord.warnings = manualEvaluation.warnings;
  }

  const sheetSyncMode = getSheetSyncMode();
  newRecord.sheetSyncStatus = getInitialSheetSyncStatusForMode_(sheetSyncMode);
  newRecord.sheetSyncError = "";

  updateFirestoreDocument_(newRecord);
  const sheetSync = handleSheetSyncAfterFirestoreSave_(newRecord.documentName, {
    target: target || "update",
    actorLineUserId: actor && actor.lineUserId || "",
    recordStatus: newRecord.status
  });
  const sheetUpdated = !!(sheetSync && sheetSync.ok && !sheetSync.skipped);
  logUpdateExpense_(oldRecord, newRecord, {
    recordId: doc && doc.name || "",
    lineUserId: actor && actor.lineUserId || ""
  });

  return {
    ok: true,
    oldRecord: oldRecord,
    record: newRecord,
    field: field,
    sheetUpdated: sheetUpdated,
    sheetSync: sheetSync
  };
}


function normalizeEditableFieldName_(fieldText) {
  const input = normalizeComparableText_(fieldText);
  const map = {
    "หมวด": "category",
    "category": "category",
    "งาน": "job",
    "โปรเจกต์": "job",
    "project": "job",
    "job": "job",
    "รายการ": "items",
    "item": "items",
    "items": "items",
    "ผู้รับ": "merchant",
    "ร้าน": "merchant",
    "ร้านค้า": "merchant",
    "merchant": "merchant",
    "note": "note",
    "หมายเหตุ": "note",
    "ยอด": "amount",
    "ยอดเงิน": "amount",
    "amount": "amount",
    "วันที่": "date",
    "date": "date",
    "สัปดาห์": "laborWeek",
    "สัปดาห์ที่": "laborWeek",
    "week": "laborWeek"
  };

  return map[input] || "";
}



