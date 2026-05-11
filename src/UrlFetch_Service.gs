/**
 * UrlFetch_Service.gs
 * Central UrlFetch wrapper and lightweight execution counters.
 */

var EXECUTION_METRICS_ = null;

function startExecutionMetrics_(processName, meta) {
  const safeMeta = meta || {};
  EXECUTION_METRICS_ = {
    executionId: String(safeMeta.executionId || createRequestTraceId_()),
    traceId: String(safeMeta.traceId || ""),
    processName: String(processName || "execution"),
    commandName: String(safeMeta.commandName || ""),
    eventType: String(safeMeta.eventType || ""),
    jobId: String(safeMeta.jobId || ""),
    lineUserId: String(safeMeta.lineUserId || ""),
    startedAtMs: Date.now(),
    startedAt: new Date().toISOString(),
    urlFetchCount: 0,
    geminiCallCount: 0,
    firestoreReadCount: 0,
    firestoreWriteCount: 0,
    sheetWriteCount: 0,
    lineReplyCount: 0,
    linePushCount: 0,
    jobProcessedCount: 0,
    errorCount: 0
  };
  return EXECUTION_METRICS_;
}

function getExecutionMetrics_() {
  if (!EXECUTION_METRICS_) {
    return startExecutionMetrics_("execution", {});
  }
  return EXECUTION_METRICS_;
}

function incrementUrlFetchCount() {
  return incrementExecutionMetric_("urlFetchCount", 1);
}

function incrementExecutionMetric_(fieldName, count) {
  const metrics = getExecutionMetrics_();
  const field = String(fieldName || "");
  metrics[field] = Number(metrics[field] || 0) + Number(count || 1);
  return metrics[field];
}

function safeUrlFetch(url, options, context) {
  const safeContext = context || {};
  incrementUrlFetchCount();

  if (safeContext.service === "gemini") {
    incrementExecutionMetric_("geminiCallCount", 1);
  } else if (safeContext.service === "line" && safeContext.action === "reply") {
    incrementExecutionMetric_("lineReplyCount", 1);
  } else if (safeContext.service === "line" && safeContext.action === "push") {
    incrementExecutionMetric_("linePushCount", 1);
  } else if (safeContext.service === "firestore") {
    const method = String(safeContext.method || options && options.method || "get").toLowerCase();
    if (method === "get") {
      incrementExecutionMetric_("firestoreReadCount", 1);
    } else {
      incrementExecutionMetric_("firestoreWriteCount", 1);
    }
  } else if (safeContext.service === "sheet") {
    incrementExecutionMetric_("sheetWriteCount", 1);
  }

  logUrlFetchUsage_(safeContext);
  return UrlFetchApp.fetch(url, options || {});
}

function logUrlFetchUsage_(context) {
  const safeContext = context || {};
  logInfo_("urlfetch.usage", {
    executionId: getExecutionMetrics_().executionId,
    service: String(safeContext.service || "unknown"),
    action: String(safeContext.action || ""),
    method: String(safeContext.method || ""),
    count: Number(getExecutionMetrics_().urlFetchCount || 0)
  });
}

function finishExecutionMetrics_(status, meta) {
  const metrics = getExecutionMetrics_();
  const safeMeta = meta || {};
  const finishedAtMs = Date.now();
  const result = {
    executionId: metrics.executionId,
    traceId: metrics.traceId || safeMeta.traceId || "",
    processName: metrics.processName,
    commandName: metrics.commandName || safeMeta.commandName || "",
    eventType: metrics.eventType || safeMeta.eventType || "",
    jobId: metrics.jobId || safeMeta.jobId || "",
    lineUserId: metrics.lineUserId || safeMeta.lineUserId || "",
    executionMs: finishedAtMs - Number(metrics.startedAtMs || finishedAtMs),
    urlFetchCount: Number(metrics.urlFetchCount || 0),
    geminiCallCount: Number(metrics.geminiCallCount || 0),
    firestoreReadCount: Number(metrics.firestoreReadCount || 0),
    firestoreWriteCount: Number(metrics.firestoreWriteCount || 0),
    sheetWriteCount: Number(metrics.sheetWriteCount || 0),
    lineReplyCount: Number(metrics.lineReplyCount || 0),
    linePushCount: Number(metrics.linePushCount || 0),
    jobProcessedCount: Number(metrics.jobProcessedCount || 0),
    errorCount: Number(metrics.errorCount || 0),
    startedAt: metrics.startedAt,
    finishedAt: new Date(finishedAtMs).toISOString(),
    status: String(status || "ok")
  };

  writeExecutionMetricsProcessLog_(result);
  EXECUTION_METRICS_ = null;
  return result;
}

function writeExecutionMetricsProcessLog_(entry) {
  try {
    const safeEntry = entry || {};
    const payload = {
      fields: {
        timestamp: { stringValue: new Date().toISOString() },
        processName: { stringValue: "execution_metrics" },
        executionId: { stringValue: String(safeEntry.executionId || "") },
        traceId: { stringValue: String(safeEntry.traceId || "") },
        commandName: { stringValue: String(safeEntry.commandName || "") },
        eventType: { stringValue: String(safeEntry.eventType || "") },
        jobId: { stringValue: String(safeEntry.jobId || "") },
        lineUserId: { stringValue: String(safeEntry.lineUserId || "") },
        executionMs: { integerValue: String(Math.max(0, Math.round(Number(safeEntry.executionMs || 0)))) },
        urlFetchCount: { integerValue: String(Math.max(0, Math.round(Number(safeEntry.urlFetchCount || 0)))) },
        geminiCallCount: { integerValue: String(Math.max(0, Math.round(Number(safeEntry.geminiCallCount || 0)))) },
        firestoreReadCount: { integerValue: String(Math.max(0, Math.round(Number(safeEntry.firestoreReadCount || 0)))) },
        firestoreWriteCount: { integerValue: String(Math.max(0, Math.round(Number(safeEntry.firestoreWriteCount || 0)))) },
        sheetWriteCount: { integerValue: String(Math.max(0, Math.round(Number(safeEntry.sheetWriteCount || 0)))) },
        lineReplyCount: { integerValue: String(Math.max(0, Math.round(Number(safeEntry.lineReplyCount || 0)))) },
        linePushCount: { integerValue: String(Math.max(0, Math.round(Number(safeEntry.linePushCount || 0)))) },
        jobProcessedCount: { integerValue: String(Math.max(0, Math.round(Number(safeEntry.jobProcessedCount || 0)))) },
        errorCount: { integerValue: String(Math.max(0, Math.round(Number(safeEntry.errorCount || 0)))) },
        startedAt: { stringValue: String(safeEntry.startedAt || "") },
        finishedAt: { stringValue: String(safeEntry.finishedAt || "") },
        status: { stringValue: String(safeEntry.status || "ok") }
      }
    };
    firestoreRequest("post", "processLogs", payload);
  } catch (err) {
    logError_("executionMetrics.write.error", err);
  }
}
