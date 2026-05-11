/**
 * Audit_Log.gs
 * Financial safety audit log helpers.
 */

function writeAuditLog_(entry) {
  try {
    const safeEntry = entry || {};
    const safeErrorMessage = safeEntry.errorMessage
      ? buildUserFriendlyErrorMessage_(safeEntry.errorMessage)
      : "";
    const payload = {
      fields: {
        timestamp: { stringValue: new Date().toISOString() },
        traceId: { stringValue: String(safeEntry.traceId || "") },
        action: { stringValue: String(safeEntry.action || "") },
        errorId: { stringValue: String(safeEntry.errorId || "") },
        commandName: { stringValue: String(safeEntry.commandName || "") },
        inputText: { stringValue: truncateText_(String(safeEntry.inputText || ""), 500) },
        functionName: { stringValue: String(safeEntry.functionName || "") },
        queryName: { stringValue: String(safeEntry.queryName || "") },
        transactionId: { stringValue: String(safeEntry.transactionId || "") },
        actorLineUserId: { stringValue: String(safeEntry.actorLineUserId || safeEntry.lineUserId || "") },
        sheetSyncMode: { stringValue: String(safeEntry.sheetSyncMode || "") },
        beforeStatus: { stringValue: String(safeEntry.beforeStatus || "") },
        afterStatus: { stringValue: String(safeEntry.afterStatus || "") },
        safeError: { stringValue: String(safeEntry.safeError || "") },
        safeErrorMessage: { stringValue: truncateText_(String(safeEntry.safeErrorMessage || safeEntry.safeError || ""), 900) },
        stackTrace: { stringValue: truncateText_(String(safeEntry.stackTrace || ""), 5000) },
        createdAt: { stringValue: String(safeEntry.createdAt || new Date().toISOString()) },
        lineUserId: { stringValue: String(safeEntry.lineUserId || "") },
        recordId: { stringValue: String(safeEntry.recordId || "") },
        oldValue: { stringValue: truncateText_(JSON.stringify(safeEntry.oldValue || {}), 30000) },
        newValue: { stringValue: truncateText_(JSON.stringify(safeEntry.newValue || {}), 30000) },
        status: { stringValue: String(safeEntry.status || "ok") },
        errorMessage: { stringValue: truncateText_(safeErrorMessage, 900) }
      }
    };
    firestoreRequest("post", "auditLogs", payload);
  } catch (err) {
    logError_("audit.write.error", err);
  }
}

function logCreateExpense_(record, meta) {
  writeAuditLog_({
    traceId: meta && meta.traceId || "",
    action: "create_expense",
    lineUserId: meta && meta.lineUserId || "",
    recordId: meta && meta.recordId || "",
    oldValue: {},
    newValue: record || {},
    status: "ok"
  });
}

function logUpdateExpense_(oldValue, newValue, meta) {
  writeAuditLog_({
    traceId: meta && meta.traceId || "",
    action: "update_expense",
    lineUserId: meta && meta.lineUserId || "",
    recordId: meta && meta.recordId || "",
    oldValue: oldValue || {},
    newValue: newValue || {},
    status: "ok"
  });
}

function logDeleteExpense_(record, meta) {
  writeAuditLog_({
    traceId: meta && meta.traceId || "",
    action: "delete_expense",
    lineUserId: meta && meta.lineUserId || "",
    recordId: meta && meta.recordId || "",
    oldValue: record || {},
    newValue: {},
    status: "ok"
  });
}

function logWebhookError_(traceId, err) {
  writeAuditLog_({
    traceId: traceId || "",
    action: "webhook_error",
    status: "error",
    errorMessage: err && err.message ? err.message : String(err || "")
  });
}

function logAiParsingResult_(traceId, result, status, errorMessage) {
  writeAuditLog_({
    traceId: traceId || "",
    action: "ai_parse",
    newValue: result || {},
    status: status || "ok",
    errorMessage: errorMessage || ""
  });
}

function logSheetSyncAudit_(action, meta) {
  const safeMeta = meta || {};
  writeAuditLog_({
    action: String(action || ""),
    transactionId: String(safeMeta.transactionId || ""),
    actorLineUserId: String(safeMeta.actorLineUserId || safeMeta.lineUserId || ""),
    lineUserId: String(safeMeta.actorLineUserId || safeMeta.lineUserId || ""),
    recordId: String(safeMeta.transactionId || safeMeta.recordId || ""),
    sheetSyncMode: String(safeMeta.sheetSyncMode || ""),
    beforeStatus: String(safeMeta.beforeStatus || ""),
    afterStatus: String(safeMeta.afterStatus || ""),
    safeError: String(safeMeta.safeError || ""),
    createdAt: new Date().toISOString(),
    status: String(safeMeta.status || "ok"),
    errorMessage: String(safeMeta.safeError || "")
  });
}

