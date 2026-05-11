/**
 * Sheet_Repository.gs
 * Google Sheets report/export layer. Firestore remains the source of truth.
 */

function getSheetSyncMode() {
  return normalizeSheetSyncMode_(getOptionalProperty_("SHEET_SYNC_MODE", DEFAULT_SHEET_SYNC_MODE));
}


function shouldSyncSheetNow() {
  return getSheetSyncMode() === SHEET_SYNC_MODE_REALTIME;
}


function getInitialSheetSyncStatusForMode_(mode) {
  const safeMode = normalizeSheetSyncMode_(mode || getSheetSyncMode());
  if (safeMode === SHEET_SYNC_MODE_OFF) return SHEET_SYNC_STATUS_DISABLED;
  if (safeMode === SHEET_SYNC_MODE_MANUAL) return SHEET_SYNC_STATUS_PENDING_MANUAL;
  return SHEET_SYNC_STATUS_PENDING;
}


function isSheetSyncedStatus_(status) {
  const value = String(status || "").trim().toUpperCase();
  return value === SHEET_SYNC_STATUS_SYNCED || value === "OK";
}


function getSheetSyncPendingStatuses_() {
  return [
    SHEET_SYNC_STATUS_PENDING,
    SHEET_SYNC_STATUS_PENDING_MANUAL
  ];
}


function getSheetSyncRetryableStatuses_() {
  return [
    SHEET_SYNC_STATUS_PENDING,
    SHEET_SYNC_STATUS_PENDING_MANUAL,
    SHEET_SYNC_STATUS_ERROR,
    "error"
  ];
}


function markSheetSyncPending(transactionId) {
  const doc = getExpenseDocumentByIdOrName_(transactionId);
  if (!doc || !doc.name) {
    return {
      ok: false,
      reason: "not_found",
      transactionId: String(transactionId || "")
    };
  }

  const record = getFirestoreRecordFromDocument_(doc);
  const mode = getSheetSyncMode();
  const nextStatus = getInitialSheetSyncStatusForMode_(mode);
  markExpenseSheetSyncStatus_(doc.name, nextStatus, "");
  const action = mode === SHEET_SYNC_MODE_OFF
    ? "SHEET_SYNC_DISABLED"
    : (mode === SHEET_SYNC_MODE_MANUAL ? "SHEET_SYNC_PENDING_MANUAL" : "SHEET_SYNC_PENDING");
  logSheetSyncAudit_(action, {
    transactionId: doc.name,
    sheetSyncMode: mode,
    beforeStatus: record.sheetSyncStatus || "",
    afterStatus: nextStatus
  });

  return {
    ok: true,
    documentName: doc.name,
    sheetSyncMode: mode,
    beforeStatus: record.sheetSyncStatus || "",
    afterStatus: nextStatus
  };
}


function handleSheetSyncAfterFirestoreSave_(documentName, meta) {
  const safeMeta = meta || {};
  const mode = getSheetSyncMode();
  const initialStatus = getInitialSheetSyncStatusForMode_(mode);

  if (
    mode === SHEET_SYNC_MODE_REALTIME &&
    safeMeta.recordStatus &&
    String(safeMeta.recordStatus) !== RECORD_STATUS_IMPORTED
  ) {
    logSheetSyncAudit_("SHEET_SYNC_PENDING", {
      transactionId: documentName,
      actorLineUserId: safeMeta.actorLineUserId || "",
      sheetSyncMode: mode,
      beforeStatus: "",
      afterStatus: initialStatus
    });
    writeSheetSyncProcessLog_({
      syncType: mode,
      target: safeMeta.target || "transactionId",
      totalCount: 1,
      successCount: 0,
      errorCount: 0,
      sheetWriteCount: 0,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      elapsedMs: 0,
      status: "skipped",
      errorMessage: "record_not_imported"
    });
    return {
      ok: true,
      skipped: true,
      reason: "record_not_imported",
      sheetSyncMode: mode,
      afterStatus: initialStatus,
      errorMessage: ""
    };
  }

  if (mode === SHEET_SYNC_MODE_REALTIME) {
    return syncTransactionToSheet(documentName, {
      syncType: SHEET_SYNC_MODE_REALTIME,
      target: safeMeta.target || "transactionId",
      actorLineUserId: safeMeta.actorLineUserId || "",
      force: true,
      perfLogger: safeMeta.perfLogger || null
    });
  }

  const action = mode === SHEET_SYNC_MODE_OFF
    ? "SHEET_SYNC_DISABLED"
    : (mode === SHEET_SYNC_MODE_MANUAL ? "SHEET_SYNC_PENDING_MANUAL" : "SHEET_SYNC_PENDING");
  logSheetSyncAudit_(action, {
    transactionId: documentName,
    actorLineUserId: safeMeta.actorLineUserId || "",
    sheetSyncMode: mode,
    beforeStatus: "",
    afterStatus: initialStatus
  });

  writeSheetSyncProcessLog_({
    syncType: mode,
    target: safeMeta.target || "transactionId",
    totalCount: 1,
    successCount: 0,
    errorCount: 0,
    sheetWriteCount: 0,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    elapsedMs: 0,
    status: "skipped",
    errorMessage: ""
  });

  return {
    ok: true,
    skipped: true,
    reason: mode.toLowerCase(),
    sheetSyncMode: mode,
    afterStatus: initialStatus,
    errorMessage: ""
  };
}


function saveToSheet(record) {
  try {
    const config = getConfig();
    if (!config.sheetId) {
      throw new Error("Missing SHEET_ID");
    }
    const ss = SpreadsheetApp.openById(config.sheetId);
    let sheet = ss.getSheetByName("Expenses");

    if (!sheet) {
      sheet = ss.insertSheet("Expenses");
    }

    ensureExpenseSheetHeader_(sheet);
    return upsertExpenseSheetRow_(sheet, record || {});
  } catch (err) {
    throw new Error("บันทึก Google Sheet ไม่สำเร็จ: " + err.message);
  }
}


function saveExpenseToSheetSafely_(record, firestoreDocumentName) {
  const documentName = String(firestoreDocumentName || record && record.documentName || "").trim();
  if (documentName) {
    return syncTransactionToSheet(documentName, {
      syncType: SHEET_SYNC_MODE_REALTIME,
      target: "legacy_safe_save",
      force: true
    });
  }

  try {
    saveToSheet(Object.assign({}, record || {}, {
      sheetSyncStatus: SHEET_SYNC_STATUS_SYNCED,
      sheetSyncError: ""
    }));
    return { ok: true, errorMessage: "" };
  } catch (err) {
    const safeError = stringifySafeSheetSyncError_(err);
    logError("saveExpenseToSheetSafely_.error", err);
    return {
      ok: false,
      errorMessage: safeError
    };
  }
}


function syncTransactionToSheet(transactionId, options) {
  const safeOptions = options || {};
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const mode = getSheetSyncMode();
  const syncType = String(safeOptions.syncType || (mode === SHEET_SYNC_MODE_REALTIME ? SHEET_SYNC_MODE_REALTIME : SHEET_SYNC_MODE_MANUAL));
  const target = String(safeOptions.target || "transactionId");
  let totalCount = 1;
  let successCount = 0;
  let errorCount = 0;
  let sheetWriteCount = 0;
  let beforeStatus = "";
  let afterStatus = "";
  let safeError = "";
  let doc = null;

  try {
    doc = getExpenseDocumentByIdOrName_(transactionId);
    if (!doc || !doc.name) {
      const notFoundResult = {
        ok: false,
        reason: "not_found",
        transactionId: String(transactionId || ""),
        sheetSyncMode: mode,
        syncType: syncType,
        target: target,
        totalCount: 1,
        successCount: 0,
        errorCount: 1,
        sheetWriteCount: 0,
        elapsedMs: Date.now() - startedAtMs,
        errorMessage: "not_found"
      };
      logSheetSyncAudit_("SHEET_SYNC_ERROR", {
        transactionId: String(transactionId || ""),
        actorLineUserId: safeOptions.actorLineUserId || "",
        sheetSyncMode: mode,
        safeError: "not_found",
        status: "error"
      });
      if (!safeOptions.suppressProcessLog) {
        writeSheetSyncProcessLog_(Object.assign({}, notFoundResult, {
          startedAt: startedAt,
          finishedAt: new Date().toISOString(),
          status: "error"
        }));
      }
      return notFoundResult;
    }

    const record = getFirestoreRecordFromDocument_(doc);
    beforeStatus = record.sheetSyncStatus || "";

    if (!isTransactionActiveStatus_(record.status)) {
      afterStatus = SHEET_SYNC_STATUS_NOT_REQUIRED;
      markExpenseSheetSyncStatus_(doc.name, afterStatus, "");
      logSheetSyncAudit_("SHEET_SYNC_DISABLED", {
        transactionId: doc.name,
        actorLineUserId: safeOptions.actorLineUserId || "",
        sheetSyncMode: mode,
        beforeStatus: beforeStatus,
        afterStatus: afterStatus
      });
      return buildSheetSyncSkipResult_(doc.name, "not_active", mode, beforeStatus, afterStatus, startedAtMs, startedAt, safeOptions);
    }

    if (mode === SHEET_SYNC_MODE_OFF && safeOptions.allowWhenOff !== true) {
      afterStatus = SHEET_SYNC_STATUS_DISABLED;
      markExpenseSheetSyncStatus_(doc.name, afterStatus, "");
      logSheetSyncAudit_("SHEET_SYNC_DISABLED", {
        transactionId: doc.name,
        actorLineUserId: safeOptions.actorLineUserId || "",
        sheetSyncMode: mode,
        beforeStatus: beforeStatus,
        afterStatus: afterStatus
      });
      return buildSheetSyncSkipResult_(doc.name, "disabled", mode, beforeStatus, afterStatus, startedAtMs, startedAt, safeOptions);
    }

    if (isSheetSyncedStatus_(beforeStatus) && !safeOptions.force) {
      return buildSheetSyncSkipResult_(doc.name, "already_synced", mode, beforeStatus, beforeStatus, startedAtMs, startedAt, safeOptions);
    }

    const sheetResult = saveToSheet(Object.assign({}, record, {
      documentName: doc.name,
      transactionId: getSheetDocumentId_(doc.name),
      sheetSyncStatus: SHEET_SYNC_STATUS_SYNCED,
      sheetSyncError: ""
    }));
    sheetWriteCount = Number(sheetResult && sheetResult.sheetWriteCount || 1);
    afterStatus = SHEET_SYNC_STATUS_SYNCED;
    markExpenseSheetSyncStatus_(doc.name, afterStatus, "");
    successCount = 1;
    logSheetSyncAudit_("SHEET_SYNCED", {
      transactionId: doc.name,
      actorLineUserId: safeOptions.actorLineUserId || "",
      sheetSyncMode: mode,
      beforeStatus: beforeStatus,
      afterStatus: afterStatus
    });

    return buildSheetSyncResult_(true, doc.name, mode, syncType, target, totalCount, successCount, errorCount, sheetWriteCount, startedAtMs, startedAt, safeOptions, "");
  } catch (err) {
    errorCount = 1;
    safeError = stringifySafeSheetSyncError_(err);
    afterStatus = SHEET_SYNC_STATUS_ERROR;
    logError("syncTransactionToSheet.error", err);

    if (doc && doc.name) {
      try {
        markExpenseSheetSyncStatus_(doc.name, afterStatus, safeError);
      } catch (markErr) {
        logError("syncTransactionToSheet.markStatus.error", markErr);
      }
      logSheetSyncAudit_("SHEET_SYNC_ERROR", {
        transactionId: doc.name,
        actorLineUserId: safeOptions.actorLineUserId || "",
        sheetSyncMode: mode,
        beforeStatus: beforeStatus,
        afterStatus: afterStatus,
        safeError: safeError,
        status: "error"
      });
    }

    return buildSheetSyncResult_(false, doc && doc.name || String(transactionId || ""), mode, syncType, target, totalCount, successCount, errorCount, sheetWriteCount, startedAtMs, startedAt, safeOptions, safeError);
  }
}


function syncPendingSheetRows(batchSize) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    return {
      ok: true,
      skipped: true,
      reason: "sheet_sync_lock_busy",
      totalCount: 0,
      successCount: 0,
      errorCount: 0,
      sheetWriteCount: 0,
      elapsedMs: 0
    };
  }

  try {
  const limit = Math.min(Math.max(parseInt(batchSize || 50, 10) || 50, 1), 50);
  const records = getSheetSyncRecordsByStatus_(getSheetSyncPendingStatuses_(), {
    queryName: "sheet_sync_pending_batch",
    status: RECORD_STATUS_IMPORTED,
    limit: limit
  });
  return syncSheetRecordSet_(records, {
    syncType: SHEET_SYNC_MODE_BATCH,
    target: "pending",
    auditStartAction: "SHEET_BATCH_SYNC_STARTED",
    auditFinishAction: "SHEET_BATCH_SYNC_FINISHED"
  });
  } finally {
    lock.releaseLock();
  }
}


function processPendingSheetSync(batchSize) {
  return syncPendingSheetRows(batchSize || 50);
}


function retrySheetSync(transactionId) {
  logSheetSyncAudit_("SHEET_SYNC_RETRY_STARTED", {
    transactionId: String(transactionId || ""),
    sheetSyncMode: getSheetSyncMode()
  });
  const result = syncTransactionToSheet(transactionId, {
    syncType: SHEET_SYNC_MODE_MANUAL,
    target: "transactionId",
    force: true
  });
  logSheetSyncAudit_("SHEET_SYNC_RETRY_FINISHED", {
    transactionId: result && result.documentName || String(transactionId || ""),
    sheetSyncMode: getSheetSyncMode(),
    afterStatus: result && result.ok ? SHEET_SYNC_STATUS_SYNCED : SHEET_SYNC_STATUS_ERROR,
    safeError: result && result.errorMessage || "",
    status: result && result.ok ? "ok" : "error"
  });
  return result;
}


function retrySheetSyncErrors(limit) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    return {
      ok: true,
      skipped: true,
      reason: "sheet_sync_lock_busy",
      totalCount: 0,
      successCount: 0,
      errorCount: 0,
      sheetWriteCount: 0,
      elapsedMs: 0
    };
  }

  try {
  const safeLimit = Math.min(Math.max(parseInt(limit || 10, 10) || 10, 1), 50);
  logSheetSyncAudit_("SHEET_SYNC_RETRY_STARTED", {
    transactionId: "",
    sheetSyncMode: getSheetSyncMode(),
    afterStatus: SHEET_SYNC_STATUS_ERROR
  });
  const records = getSheetSyncRecordsByStatus_([SHEET_SYNC_STATUS_ERROR, "error"], {
    queryName: "sheet_sync_error_retry",
    limit: safeLimit
  });
  const result = syncSheetRecordSet_(records, {
    syncType: SHEET_SYNC_MODE_MANUAL,
    target: "error_retry",
    force: true,
    auditStartAction: "SHEET_SYNC_RETRY_STARTED",
    auditFinishAction: "SHEET_SYNC_RETRY_FINISHED"
  });
  return result;
  } finally {
    lock.releaseLock();
  }
}


function exportTransactionsToSheetByMonth(monthKey) {
  const records = getTransactionsByMonth(monthKey, {
    queryName: "sheet_export_by_month",
    orderBy: [],
    limit: 1000
  });
  return syncSheetRecordSet_(records, {
    syncType: "EXPORT",
    target: "month:" + String(monthKey || ""),
    force: true,
    auditStartAction: "SHEET_EXPORT_STARTED",
    auditFinishAction: "SHEET_EXPORT_FINISHED"
  });
}


function exportTransactionsToSheetByJob(jobId) {
  const records = getTransactionsByJob(jobId, {
    queryName: "sheet_export_by_job",
    orderBy: [],
    limit: 1000
  });
  return syncSheetRecordSet_(records, {
    syncType: "EXPORT",
    target: "job:" + String(jobId || ""),
    force: true,
    auditStartAction: "SHEET_EXPORT_STARTED",
    auditFinishAction: "SHEET_EXPORT_FINISHED"
  });
}


function syncSheetToday_(actorLineUserId) {
  const dateKey = formatDateToYMD(new Date());
  const records = getSheetSyncRecordsByStatus_(getSheetSyncRetryableStatuses_(), {
    queryName: "sheet_sync_today",
    dateKey: dateKey,
    status: RECORD_STATUS_IMPORTED,
    limit: 50
  });
  return syncSheetRecordSet_(records, {
    syncType: SHEET_SYNC_MODE_MANUAL,
    target: "today:" + dateKey,
    actorLineUserId: actorLineUserId || "",
    force: true,
    auditStartAction: "SHEET_BATCH_SYNC_STARTED",
    auditFinishAction: "SHEET_BATCH_SYNC_FINISHED"
  });
}


function syncSheetCurrentMonth_(actorLineUserId) {
  const monthKey = formatDateToYMD(new Date()).slice(0, 7);
  const records = getSheetSyncRecordsByStatus_(getSheetSyncRetryableStatuses_(), {
    queryName: "sheet_sync_current_month",
    monthKey: monthKey,
    status: RECORD_STATUS_IMPORTED,
    limit: 50
  });
  return syncSheetRecordSet_(records, {
    syncType: SHEET_SYNC_MODE_MANUAL,
    target: "month:" + monthKey,
    actorLineUserId: actorLineUserId || "",
    force: true,
    auditStartAction: "SHEET_BATCH_SYNC_STARTED",
    auditFinishAction: "SHEET_BATCH_SYNC_FINISHED"
  });
}


function syncSheetJob_(jobQuery, actorLineUserId) {
  const normalizedJob = normalizeJobAlias_(jobQuery);
  const jobId = buildStableEntityId_("job", normalizedJob);
  const records = getSheetSyncRecordsByStatus_(getSheetSyncRetryableStatuses_(), {
    queryName: "sheet_sync_job",
    jobId: jobId,
    status: RECORD_STATUS_IMPORTED,
    limit: 50
  });
  return syncSheetRecordSet_(records, {
    syncType: SHEET_SYNC_MODE_MANUAL,
    target: "job:" + normalizedJob,
    actorLineUserId: actorLineUserId || "",
    force: true,
    auditStartAction: "SHEET_BATCH_SYNC_STARTED",
    auditFinishAction: "SHEET_BATCH_SYNC_FINISHED"
  });
}


function getSheetSyncPendingSummary_() {
  const pending = getSheetSyncRecordsByStatus_([SHEET_SYNC_STATUS_PENDING], {
    queryName: "sheet_sync_pending_count",
    limit: 1000
  });
  const manual = getSheetSyncRecordsByStatus_([SHEET_SYNC_STATUS_PENDING_MANUAL], {
    queryName: "sheet_sync_pending_manual_count",
    limit: 1000
  });
  const errors = getSheetSyncErrors(1000);

  return {
    mode: getSheetSyncMode(),
    pendingCount: pending.length,
    pendingManualCount: manual.length,
    errorCount: errors.length
  };
}


function getSheetSyncRecordsByStatus_(statuses, options) {
  const safeOptions = options || {};
  const safeStatuses = (statuses || []).map(function(status) {
    return String(status || "").trim();
  }).filter(Boolean).slice(0, 10);

  if (!safeStatuses.length) {
    return [];
  }

  const filters = [
    { field: "isActive", value: true },
    { field: "sheetSyncStatus", op: "IN", value: safeStatuses }
  ];

  if (safeOptions.dateKey) {
    filters.push({ field: "dateKey", value: String(safeOptions.dateKey) });
  }
  if (safeOptions.monthKey) {
    filters.push({ field: "monthKey", value: String(safeOptions.monthKey) });
  }
  if (safeOptions.jobId) {
    filters.push({ field: "jobId", value: String(safeOptions.jobId) });
  }
  if (safeOptions.status) {
    filters.push({ field: "status", value: String(safeOptions.status) });
  }

  return queryExpenses({
    queryName: safeOptions.queryName || "sheet_sync_records_by_status",
    filters: filters,
    orderBy: safeOptions.orderBy || [],
    limit: Math.min(Math.max(Number(safeOptions.limit || 50), 1), 1000),
    selectFields: getExpenseLightSelectFields_()
  }).map(getFirestoreRecordFromDocument_);
}


function syncSheetRecordSet_(records, options) {
  const safeOptions = options || {};
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const mode = getSheetSyncMode();
  const target = String(safeOptions.target || "batch");
  const syncType = String(safeOptions.syncType || SHEET_SYNC_MODE_BATCH);
  const totalCount = (records || []).length;
  let successCount = 0;
  let errorCount = 0;
  let sheetWriteCount = 0;
  const results = [];

  if (mode === SHEET_SYNC_MODE_OFF && safeOptions.allowWhenOff !== true) {
    logSheetSyncAudit_("SHEET_SYNC_DISABLED", {
      transactionId: "",
      actorLineUserId: safeOptions.actorLineUserId || "",
      sheetSyncMode: mode,
      beforeStatus: "",
      afterStatus: SHEET_SYNC_STATUS_DISABLED
    });
    const result = {
      ok: true,
      skipped: true,
      reason: "disabled",
      sheetSyncMode: mode,
      syncType: syncType,
      target: target,
      totalCount: totalCount,
      successCount: 0,
      errorCount: 0,
      sheetWriteCount: 0,
      results: []
    };
    writeSheetSyncProcessLog_(Object.assign({}, result, {
      startedAt: startedAt,
      finishedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAtMs,
      status: "skipped"
    }));
    return result;
  }

  logSheetSyncAudit_(safeOptions.auditStartAction || "SHEET_BATCH_SYNC_STARTED", {
    transactionId: "",
    actorLineUserId: safeOptions.actorLineUserId || "",
    sheetSyncMode: mode,
    beforeStatus: "",
    afterStatus: ""
  });

  (records || []).forEach(function(record) {
    const itemResult = syncTransactionToSheet(record.documentName, {
      syncType: syncType,
      target: target,
      actorLineUserId: safeOptions.actorLineUserId || "",
      force: safeOptions.force === true,
      suppressProcessLog: true
    });
    results.push(itemResult);
    if (itemResult && itemResult.ok && !itemResult.skipped) {
      successCount += 1;
      sheetWriteCount += Number(itemResult.sheetWriteCount || 0);
    } else if (itemResult && itemResult.skipped) {
      // skipped rows are not errors
    } else {
      errorCount += 1;
    }
  });

  const finishedAt = new Date().toISOString();
  const elapsedMs = Date.now() - startedAtMs;
  const summary = {
    ok: errorCount === 0,
    sheetSyncMode: mode,
    syncType: syncType,
    target: target,
    totalCount: totalCount,
    successCount: successCount,
    errorCount: errorCount,
    sheetWriteCount: sheetWriteCount,
    startedAt: startedAt,
    finishedAt: finishedAt,
    elapsedMs: elapsedMs,
    results: results.slice(0, 20)
  };

  logSheetSyncAudit_(safeOptions.auditFinishAction || "SHEET_BATCH_SYNC_FINISHED", {
    transactionId: "",
    actorLineUserId: safeOptions.actorLineUserId || "",
    sheetSyncMode: mode,
    beforeStatus: "",
    afterStatus: errorCount ? SHEET_SYNC_STATUS_ERROR : SHEET_SYNC_STATUS_SYNCED,
    status: errorCount ? "error" : "ok"
  });
  writeSheetSyncProcessLog_(Object.assign({}, summary, {
    status: errorCount ? "error" : "ok",
    errorMessage: ""
  }));

  return summary;
}


function buildSheetSyncSkipResult_(documentName, reason, mode, beforeStatus, afterStatus, startedAtMs, startedAt, options) {
  const safeOptions = options || {};
  const result = {
    ok: true,
    skipped: true,
    reason: reason,
    documentName: documentName,
    sheetSyncMode: mode,
    beforeStatus: beforeStatus,
    afterStatus: afterStatus,
    syncType: safeOptions.syncType || mode,
    target: safeOptions.target || "transactionId",
    totalCount: 1,
    successCount: 0,
    errorCount: 0,
    sheetWriteCount: 0,
    elapsedMs: Date.now() - startedAtMs,
    errorMessage: ""
  };
  if (!safeOptions.suppressProcessLog) {
    writeSheetSyncProcessLog_(Object.assign({}, result, {
      startedAt: startedAt,
      finishedAt: new Date().toISOString(),
      status: "skipped"
    }));
  }
  return result;
}


function buildSheetSyncResult_(ok, documentName, mode, syncType, target, totalCount, successCount, errorCount, sheetWriteCount, startedAtMs, startedAt, options, errorMessage) {
  const safeOptions = options || {};
  const result = {
    ok: ok,
    skipped: false,
    documentName: documentName,
    sheetSyncMode: mode,
    syncType: syncType,
    target: target,
    totalCount: totalCount,
    successCount: successCount,
    errorCount: errorCount,
    sheetWriteCount: sheetWriteCount,
    elapsedMs: Date.now() - startedAtMs,
    errorMessage: errorMessage || ""
  };
  if (!safeOptions.suppressProcessLog) {
    writeSheetSyncProcessLog_(Object.assign({}, result, {
      startedAt: startedAt,
      finishedAt: new Date().toISOString(),
      status: ok ? "ok" : "error"
    }));
  }
  return result;
}


function upsertExpenseSheetRow_(sheet, record) {
  const transactionId = getSheetTransactionId_(record);
  const row = buildExpenseSheetRow_(record);
  const lastRow = sheet.getLastRow();
  const lastColumn = EXPENSE_SHEET_HEADERS.length;

  if (transactionId && lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
    for (let index = values.length - 1; index >= 0; index--) {
      if (String(values[index][0] || "") === transactionId) {
        sheet.getRange(index + 2, 1, 1, lastColumn).setValues([row]);
        incrementExecutionMetric_("sheetWriteCount", 1);
        return {
          action: "updated",
          rowIndex: index + 2,
          sheetWriteCount: 1
        };
      }
    }
  }

  sheet.appendRow(row);
  incrementExecutionMetric_("sheetWriteCount", 1);
  return {
    action: "appended",
    rowIndex: sheet.getLastRow(),
    sheetWriteCount: 1
  };
}


function buildExpenseSheetRow_(record) {
  const safeRecord = record || {};
  return [
    getSheetTransactionId_(safeRecord),
    safeRecord.date || safeRecord.dateKey || "",
    safeRecord.type || "expense",
    safeRecord.jobNameNormalized || safeRecord.job || "",
    safeRecord.category || "",
    safeRecord.merchant || "",
    safeRecord.payer || safeRecord.sender || safeRecord.senderName || "",
    Number(safeRecord.amount || 0),
    safeRecord.status || RECORD_STATUS_IMPORTED,
    safeRecord.items || "",
    safeRecord.note || "",
    safeRecord.laborWeek || "",
    safeRecord.laborMonth || "",
    safeRecord.storageUrl || safeRecord.attachmentUrl || "",
    safeRecord.createdByDisplayName || "",
    safeRecord.sheetSyncStatus || "",
    safeRecord.sheetSyncError || "",
    safeRecord.createdAt || "",
    safeRecord.updatedAt || ""
  ];
}


function ensureExpenseSheetHeader_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), EXPENSE_SHEET_HEADERS.length);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, EXPENSE_SHEET_HEADERS.length).setValues([EXPENSE_SHEET_HEADERS]);
    incrementExecutionMetric_("sheetWriteCount", 1);
    return;
  }

  const currentHeaders = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(function(value) {
      return String(value || "").trim();
    });

  let headerChanged = false;
  EXPENSE_SHEET_HEADERS.forEach(function(header, index) {
    if (currentHeaders[index] !== header) {
      currentHeaders[index] = header;
      headerChanged = true;
    }
  });

  if (headerChanged) {
    sheet.getRange(1, 1, 1, EXPENSE_SHEET_HEADERS.length).setValues([
      currentHeaders.slice(0, EXPENSE_SHEET_HEADERS.length)
    ]);
    incrementExecutionMetric_("sheetWriteCount", 1);
  }
}


function deleteExpenseFromSheet_(record) {
  try {
    if (getSheetSyncMode() === SHEET_SYNC_MODE_OFF) {
      return false;
    }

    const config = getConfig();
    if (!config.sheetId) {
      return false;
    }
    const ss = SpreadsheetApp.openById(config.sheetId);
    const sheet = ss.getSheetByName("Expenses");
    if (!sheet || sheet.getLastRow() < 2) {
      return false;
    }

    ensureExpenseSheetHeader_(sheet);
    const lastRow = sheet.getLastRow();
    const lastColumn = Math.max(sheet.getLastColumn(), EXPENSE_SHEET_HEADERS.length);
    const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();

    for (let index = values.length - 1; index >= 0; index--) {
      if (doesSheetRowMatchRecord_(values[index], record)) {
        sheet.deleteRow(index + 2);
        return true;
      }
    }

    return false;
  } catch (err) {
    logError("deleteExpenseFromSheet_.error", err);
    return false;
  }
}


function updateExpenseInSheet_(oldRecord, newRecord) {
  try {
    if (!shouldSyncSheetNow()) {
      return false;
    }

    const result = syncTransactionToSheet(newRecord && newRecord.documentName || oldRecord && oldRecord.documentName || "", {
      syncType: SHEET_SYNC_MODE_REALTIME,
      target: "update_latest",
      force: true
    });
    return !!(result && result.ok && !result.skipped);
  } catch (err) {
    logError("updateExpenseInSheet_.error", err);
    return false;
  }
}


function doesSheetRowMatchRecord_(row, record) {
  const transactionId = getSheetTransactionId_(record);
  if (transactionId && String(row && row[0] || "") === transactionId) {
    return true;
  }

  const amount = Number(row && row[6] || 0);
  return (
    String(row && row[1] || "") === String(record && record.date || "") &&
    normalizeComparableText_(row && row[3]) === normalizeComparableText_(record && (record.jobNameNormalized || record.job)) &&
    normalizeComparableText_(row && row[4]) === normalizeComparableText_(record && record.category) &&
    normalizeComparableText_(row && row[5]) === normalizeComparableText_(record && record.merchant) &&
    Math.abs(amount - Number(record && record.amount || 0)) < 0.01
  );
}


function getSheetTransactionId_(record) {
  const value = String(record && (record.transactionId || record.documentName || record.recordId) || "").trim();
  return getSheetDocumentId_(value);
}


function getSheetDocumentId_(documentName) {
  const value = String(documentName || "").trim();
  if (!value) return "";
  const parts = value.split("/");
  return parts[parts.length - 1] || value;
}


function buildSafeSheetSyncError_(err) {
  const rawMessage = err && err.message ? err.message : String(err || "");
  return {
    errorType: err && err.name ? String(err.name) : "Error",
    errorCode: "",
    shortMessage: sanitizeSheetSyncErrorMessage_(rawMessage)
  };
}


function stringifySafeSheetSyncError_(err) {
  return truncateText_(JSON.stringify(buildSafeSheetSyncError_(err)), 500);
}


function sanitizeSheetSyncErrorMessage_(message) {
  return truncateText_(
    String(message || "")
      .replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/g, "Bearer ****")
      .replace(/AIza[0-9A-Za-z_\-]{20,}/g, "AIza****")
      .replace(/ya29\.[0-9A-Za-z_\-\.]+/g, "ya29.****"),
    240
  );
}
