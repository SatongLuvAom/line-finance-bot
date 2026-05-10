/**
 * Audit_Log.gs
 * Financial safety audit log helpers.
 */

function writeAuditLog_(entry) {
  try {
    const payload = {
      fields: {
        timestamp: { stringValue: new Date().toISOString() },
        traceId: { stringValue: String(entry && entry.traceId || "") },
        action: { stringValue: String(entry && entry.action || "") },
        lineUserId: { stringValue: String(entry && entry.lineUserId || "") },
        recordId: { stringValue: String(entry && entry.recordId || "") },
        oldValue: { stringValue: JSON.stringify(entry && entry.oldValue || {}) },
        newValue: { stringValue: JSON.stringify(entry && entry.newValue || {}) },
        status: { stringValue: String(entry && entry.status || "ok") },
        errorMessage: { stringValue: String(entry && entry.errorMessage || "") }
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

