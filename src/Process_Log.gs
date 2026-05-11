/**
 * Process_Log.gs
 * Lightweight performance/process logging for webhook flows.
 */

function createProcessLogger_(processName, meta) {
  const safeMeta = meta || {};
  const now = Date.now();
  return {
    processName: String(processName || "process"),
    traceId: String(safeMeta.traceId || ""),
    sourceMessageId: String(safeMeta.sourceMessageId || ""),
    lineUserId: String(safeMeta.lineUserId || ""),
    sourceKey: String(safeMeta.sourceKey || ""),
    startedAtIso: new Date(now).toISOString(),
    startedAtMs: now,
    lastStageAtMs: now,
    stages: []
  };
}


function markProcessStage_(logger, stageName, status, details) {
  if (!logger) return null;

  const now = Date.now();
  const stage = {
    stage: String(stageName || "stage"),
    status: String(status || "ok"),
    elapsedMs: now - Number(logger.startedAtMs || now),
    deltaMs: now - Number(logger.lastStageAtMs || now),
    at: new Date(now).toISOString(),
    details: sanitizeProcessLogDetails_(details || {})
  };

  logger.lastStageAtMs = now;
  logger.stages.push(stage);
  logInfo("process.stage", {
    traceId: logger.traceId,
    processName: logger.processName,
    sourceMessageId: logger.sourceMessageId,
    stage: stage.stage,
    status: stage.status,
    elapsedMs: stage.elapsedMs,
    deltaMs: stage.deltaMs,
    details: stage.details
  });
  return stage;
}


function finishProcessLogger_(logger, status, errorMessage) {
  if (!logger) return null;

  const now = Date.now();
  const result = {
    traceId: logger.traceId,
    processName: logger.processName,
    sourceMessageId: logger.sourceMessageId,
    lineUserId: logger.lineUserId,
    sourceKey: logger.sourceKey,
    startedAt: logger.startedAtIso,
    finishedAt: new Date(now).toISOString(),
    status: String(status || "ok"),
    totalMs: now - Number(logger.startedAtMs || now),
    stages: logger.stages || [],
    errorMessage: errorMessage ? buildUserFriendlyErrorMessage_(errorMessage) : ""
  };

  writeProcessLog_(result);
  logInfo("process.total", {
    traceId: result.traceId,
    processName: result.processName,
    sourceMessageId: result.sourceMessageId,
    status: result.status,
    totalMs: result.totalMs,
    errorMessage: result.errorMessage
  });
  return result;
}


function writeProcessLog_(entry) {
  try {
    const safeEntry = entry || {};
    const payload = {
      fields: {
        timestamp: { stringValue: new Date().toISOString() },
        traceId: { stringValue: String(safeEntry.traceId || "") },
        processName: { stringValue: String(safeEntry.processName || "") },
        sourceMessageId: { stringValue: String(safeEntry.sourceMessageId || "") },
        lineUserId: { stringValue: String(safeEntry.lineUserId || "") },
        sourceKey: { stringValue: String(safeEntry.sourceKey || "") },
        status: { stringValue: String(safeEntry.status || "ok") },
        totalMs: { integerValue: String(Math.max(0, Math.round(Number(safeEntry.totalMs || 0)))) },
        stagesJson: { stringValue: truncateText_(JSON.stringify(safeEntry.stages || []), 30000) },
        errorMessage: { stringValue: truncateText_(String(safeEntry.errorMessage || ""), 900) }
      }
    };
    firestoreRequest("post", "processLogs", payload);
  } catch (err) {
    logError_("processLog.write.error", err);
  }
}


function sanitizeProcessLogDetails_(details) {
  const result = {};
  Object.keys(details || {}).forEach(function(key) {
    if (/token|secret|authorization|key/i.test(key)) {
      result[key] = "****";
      return;
    }

    const value = details[key];
    if (typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
      return;
    }

    result[key] = truncateText_(String(value || ""), 180);
  });
  return result;
}


function writeSheetSyncProcessLog_(entry) {
  try {
    const safeEntry = entry || {};
    const payload = {
      fields: {
        timestamp: { stringValue: new Date().toISOString() },
        processName: { stringValue: "sheet_sync" },
        syncType: { stringValue: String(safeEntry.syncType || "") },
        target: { stringValue: String(safeEntry.target || "") },
        totalCount: { integerValue: String(Math.max(0, Math.round(Number(safeEntry.totalCount || 0)))) },
        successCount: { integerValue: String(Math.max(0, Math.round(Number(safeEntry.successCount || 0)))) },
        errorCount: { integerValue: String(Math.max(0, Math.round(Number(safeEntry.errorCount || 0)))) },
        elapsedMs: { integerValue: String(Math.max(0, Math.round(Number(safeEntry.elapsedMs || 0)))) },
        sheetWriteCount: { integerValue: String(Math.max(0, Math.round(Number(safeEntry.sheetWriteCount || 0)))) },
        startedAt: { stringValue: String(safeEntry.startedAt || "") },
        finishedAt: { stringValue: String(safeEntry.finishedAt || "") },
        status: { stringValue: String(safeEntry.status || "ok") },
        errorMessage: { stringValue: truncateText_(String(safeEntry.errorMessage || ""), 900) }
      }
    };
    firestoreRequest("post", "processLogs", payload);
  } catch (err) {
    logError_("sheetSyncProcessLog.write.error", err);
  }
}


function writeCommandErrorProcessLog_(entry) {
  try {
    const safeEntry = entry || {};
    const payload = {
      fields: {
        timestamp: { stringValue: new Date().toISOString() },
        processName: { stringValue: "command_error" },
        errorId: { stringValue: String(safeEntry.errorId || "") },
        traceId: { stringValue: String(safeEntry.traceId || "") },
        commandName: { stringValue: String(safeEntry.commandName || "") },
        inputText: { stringValue: truncateText_(String(safeEntry.inputText || ""), 500) },
        lineUserId: { stringValue: String(safeEntry.lineUserId || "") },
        functionName: { stringValue: String(safeEntry.functionName || "") },
        queryName: { stringValue: String(safeEntry.queryName || "") },
        safeErrorMessage: { stringValue: truncateText_(String(safeEntry.safeErrorMessage || ""), 900) },
        stackTrace: { stringValue: truncateText_(String(safeEntry.stackTrace || ""), 5000) },
        createdAt: { stringValue: String(safeEntry.createdAt || new Date().toISOString()) },
        status: { stringValue: "error" }
      }
    };
    firestoreRequest("post", "processLogs", payload);
  } catch (err) {
    logError_("commandErrorProcessLog.write.error", err);
  }
}
