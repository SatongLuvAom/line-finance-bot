/**
 * Receipt_Job_Service.gs
 * Firestore-backed queue for receipt/image/PDF processing.
 */

function enqueueReceiptMessage_(event, context) {
  const safeContext = context || {};
  const replyToken = event && event.replyToken || "";
  const message = event && event.message || {};
  const msgType = String(message.type || "");
  const fileName = String(message.fileName || "").toLowerCase();
  const config = getConfig();
  const ackEnabled = config.receiptAckEnabled === true;

  if (msgType === "file" && !fileName.endsWith(".pdf")) {
    replyText(replyToken, "ระบบรองรับเฉพาะรูปภาพ และไฟล์ PDF เท่านั้น");
    return { ok: false, reason: "unsupported_file" };
  }

  const lineMessageId = String(message.id || "").trim();
  if (!lineMessageId) {
    replyText(replyToken, "ไม่พบรหัสไฟล์จาก LINE กรุณาส่งใหม่อีกครั้ง");
    return { ok: false, reason: "missing_line_message_id" };
  }

  try {
    const cachedState = getProcessedReceiptStateByMessageId_(lineMessageId);
    if (cachedState) {
      if (cachedState === "queued") {
        if (ackEnabled) {
          replyText(replyToken, buildReceiptQueuedMessage_({ jobId: buildReceiptJobId_(lineMessageId) }));
        }
        return { ok: true, duplicate: true, state: cachedState };
      }
      if (ackEnabled) {
        replyText(replyToken, buildDuplicateReceiptMessage_(cachedState));
      } else {
        notifyReceiptDuplicate_(buildReceiptNotificationJobFromEvent_(event, safeContext), {
          state: cachedState,
          reason: "message_cache"
        });
      }
      return { ok: true, duplicate: true, state: cachedState };
    }

    const existingTransaction = findExpenseBySourceMessageId_(lineMessageId);
    if (existingTransaction) {
      rememberProcessedReceiptMessageId_(lineMessageId, "saved");
      if (ackEnabled) {
        replyText(replyToken, buildDuplicateReceiptMessage_("saved"));
      } else {
        notifyReceiptDuplicate_(buildReceiptNotificationJobFromEvent_(event, safeContext), {
          state: "saved",
          reason: "sourceMessageId",
          documentName: existingTransaction.name || ""
        });
      }
      return { ok: true, duplicate: true, state: "saved" };
    }

    const existingJob = getReceiptJobByLineMessageId_(lineMessageId);
    if (existingJob && existingJob.status !== RECEIPT_JOB_STATUS_FAILED) {
      if (ackEnabled) {
        replyText(replyToken, buildReceiptQueuedMessage_(existingJob));
      }
      scheduleReceiptWorkerKick_("existing_queued_job");
      return { ok: true, duplicate: true, state: "queued", job: existingJob };
    }
    if (existingJob && existingJob.status === RECEIPT_JOB_STATUS_FAILED) {
      const retriedJob = patchReceiptJob_(existingJob.jobId, {
        status: RECEIPT_JOB_STATUS_QUEUED,
        retryCount: 0,
        lockedBy: "",
        lockedAt: "",
        safeError: "",
        notificationStatus: RECEIPT_NOTIFICATION_STATUS_PENDING,
        notificationMethod: "",
        doneNotifiedAt: "",
        lastNotifyError: "",
        updatedAt: new Date().toISOString()
      });
      rememberProcessedReceiptMessageId_(lineMessageId, "queued");
      if (ackEnabled) {
        replyText(replyToken, buildReceiptQueuedMessage_(retriedJob));
      }
      scheduleReceiptWorkerKick_("failed_job_requeued");
      return { ok: true, queued: true, job: retriedJob };
    }

    const job = createReceiptJobFromLineEvent_(event, safeContext);
    rememberProcessedReceiptMessageId_(lineMessageId, "queued");
    if (ackEnabled) {
      replyText(replyToken, buildReceiptQueuedMessage_(job));
    }
    scheduleReceiptWorkerKick_("new_receipt_job");
    return { ok: true, queued: true, job: job };
  } catch (err) {
    logError_("enqueueReceiptMessage_.fallbackInline", err);
    if (!ackEnabled) {
      return processReceipt(event, Object.assign({}, safeContext, {
        queueFallback: true
      }));
    }
    replyText(replyToken, [
      "ระบบคิวมีปัญหา จะประมวลผลสลิปแบบทันทีแทน",
      "อาจใช้เวลานานกว่าปกติ"
    ].join("\n"));
    return processReceipt(event, Object.assign({}, safeContext, {
      queueFallback: true
    }));
  }
}


function buildReceiptQueuedMessage_(job) {
  const safeJob = job || {};
  return [
    "รับไฟล์แล้ว กำลังประมวลผล",
    "────────────",
    "ระบบจะอ่านสลิปและบันทึกลง Firestore ให้อัตโนมัติ",
    "ถ้าข้อมูลไม่ครบ จะตั้งสถานะ NEEDS_REVIEW หรือ PARSE_INCOMPLETE",
    "",
    "Job: " + getShortReceiptJobId_(safeJob.jobId || safeJob.documentName),
    "ดูสถานะได้ด้วยคำสั่ง `queue status`"
  ].join("\n");
}


function scheduleReceiptWorkerKick_(reason, options) {
  const safeOptions = options || {};
  if (RECEIPT_WORKER_AUTO_KICK_ENABLED !== true) {
    return { ok: true, skipped: true, reason: "auto_kick_disabled" };
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = "receipt_worker_kick_scheduled";
  if (safeOptions.force) {
    cleanupReceiptWorkerKickTriggers_();
    cache.remove(cacheKey);
  }
  if (!safeOptions.force && cache.get(cacheKey)) {
    return { ok: true, skipped: true, reason: "kick_recently_scheduled" };
  }

  try {
    ScriptApp.newTrigger(RECEIPT_WORKER_TRIGGER_HANDLER)
      .timeBased()
      .after(RECEIPT_WORKER_KICK_DELAY_MS)
      .create();
    cache.put(cacheKey, "1", RECEIPT_WORKER_KICK_CACHE_TTL_SEC);
    logInfo_("receiptJobs.workerKick.scheduled", {
      reason: String(reason || ""),
      delayMs: RECEIPT_WORKER_KICK_DELAY_MS
    });
    return {
      ok: true,
      scheduled: true,
      delayMs: RECEIPT_WORKER_KICK_DELAY_MS
    };
  } catch (err) {
    logError_("receiptJobs.workerKick.error", err);
    return {
      ok: false,
      errorMessage: buildUserFriendlyErrorMessage_(err)
    };
  }
}


function processPendingReceiptJobsFromTrigger() {
  cleanupReceiptWorkerKickTriggers_();
  return processPendingReceiptJobs(RECEIPT_JOB_DEFAULT_BATCH_SIZE);
}


function processPendingReceiptJobsWatchdog() {
  if (!hasPendingReceiptJobs_()) {
    return {
      ok: true,
      skipped: true,
      reason: "no_pending_receipt_jobs",
      processedCount: 0
    };
  }
  return processPendingReceiptJobs(RECEIPT_JOB_DEFAULT_BATCH_SIZE);
}


function installReceiptWorkerTrigger() {
  const existingCount = getReceiptWorkerWatchdogTriggerCount_();
  if (existingCount > 0) {
    return {
      ok: true,
      installed: false,
      reason: "already_installed",
      watchdogTriggerCount: existingCount
    };
  }

  ScriptApp.newTrigger(RECEIPT_WORKER_WATCHDOG_HANDLER)
    .timeBased()
    .everyMinutes(1)
    .create();

  return {
    ok: true,
    installed: true,
    watchdogTriggerCount: getReceiptWorkerWatchdogTriggerCount_()
  };
}


function uninstallReceiptWorkerTrigger() {
  let deletedCount = 0;
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    const handler = trigger.getHandlerFunction && trigger.getHandlerFunction();
    if (handler === RECEIPT_WORKER_WATCHDOG_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
      deletedCount += 1;
    }
  });

  return {
    ok: true,
    deletedCount: deletedCount,
    watchdogTriggerCount: getReceiptWorkerWatchdogTriggerCount_()
  };
}


function cleanupReceiptWorkerKickTriggers_() {
  try {
    ScriptApp.getProjectTriggers().forEach(function(trigger) {
      const handler = trigger.getHandlerFunction && trigger.getHandlerFunction();
      if (handler === RECEIPT_WORKER_TRIGGER_HANDLER || handler === "processPendingReceiptJobs") {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    CacheService.getScriptCache().remove("receipt_worker_kick_scheduled");
  } catch (err) {
    logError_("receiptJobs.workerKick.cleanup.error", err);
  }
}


function cleanupReceiptWorkerKickTriggers() {
  cleanupReceiptWorkerKickTriggers_();
  return "OK";
}


function hasPendingReceiptJobs_() {
  return getPendingReceiptJobs_(1).length > 0;
}


function createReceiptJobFromLineEvent_(event, context) {
  const safeEvent = event || {};
  const message = safeEvent.message || {};
  const source = safeEvent.source || {};
  const lineMessageId = String(message.id || "").trim();
  const nowIso = new Date().toISOString();
  const jobId = buildReceiptJobId_(lineMessageId);
  const lineUserId = String(source.userId || "").trim();
  const job = {
    jobId: jobId,
    lineMessageId: lineMessageId,
    lineUserId: lineUserId,
    lineSourceJson: JSON.stringify(source || {}),
    eventJson: JSON.stringify(safeEvent),
    replyToken: String(safeEvent.replyToken || ""),
    replyTokenCreatedAt: nowIso,
    receivedAt: nowIso,
    eventType: String(safeEvent.type || "message"),
    fileType: String(message.type || ""),
    fileName: String(message.fileName || ""),
    captionText: String(message.text || ""),
    status: RECEIPT_JOB_STATUS_QUEUED,
    priority: 100,
    retryCount: 0,
    maxRetry: RECEIPT_JOB_DEFAULT_MAX_RETRY,
    lockedBy: "",
    lockedAt: "",
    createdAt: nowIso,
    updatedAt: nowIso,
    startedAt: "",
    finishedAt: "",
    errorId: "",
    safeError: "",
    source: RECORD_SOURCE_LINE_BOT,
    traceId: context && context.traceId || "",
    sourceKey: getConversationKey_(source),
    transactionId: "",
    notificationStatus: RECEIPT_NOTIFICATION_STATUS_PENDING,
    notificationMethod: "",
    doneNotifiedAt: "",
    doneNotificationCount: 0,
    canUseReplyToken: true,
    pushAllowed: isReceiptDonePushAllowedForUser_(lineUserId),
    processDoneMessageId: "",
    lastNotifyError: ""
  };

  const payload = { fields: buildReceiptJobFirestoreFields_(job) };
  try {
    const doc = firestoreRequest("post", "receipt_jobs?documentId=" + encodeURIComponent(jobId), payload);
    return getReceiptJobFromDocument_(doc);
  } catch (err) {
    if (!/ALREADY_EXISTS|409/i.test(String(err && err.message || err))) {
      throw err;
    }
    const existing = getReceiptJobById_(jobId);
    if (existing) return existing;
    throw err;
  }
}


function processPendingReceiptJobs(batchSize) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    return {
      ok: true,
      skipped: true,
      reason: "worker_lock_busy",
      processedCount: 0
    };
  }

  const guard = createRuntimeGuard();
  startExecutionMetrics_("receipt_job_worker", {
    eventType: "worker"
  });

  const result = {
    ok: true,
    processedCount: 0,
    completedCount: 0,
    duplicateSkippedCount: 0,
    retryPendingCount: 0,
    failedCount: 0,
    paused: false,
    errors: []
  };

  try {
    const limit = Math.min(Math.max(parseInt(batchSize || RECEIPT_JOB_DEFAULT_BATCH_SIZE, 10) || RECEIPT_JOB_DEFAULT_BATCH_SIZE, 1), 10);
    const pendingJobs = getPendingReceiptJobs_(limit);
    const jobs = pendingJobs.length && isLargeReceiptJob_(pendingJobs[0])
      ? pendingJobs.slice(0, 1)
      : pendingJobs;

    for (const job of jobs) {
      if (shouldStopSoon(guard)) {
        result.paused = true;
        break;
      }

      try {
        const jobResult = processOneReceiptJob(job, guard);
        result.processedCount += 1;
        incrementExecutionMetric_("jobProcessedCount", 1);
        if (jobResult.status === RECEIPT_JOB_STATUS_COMPLETED) result.completedCount += 1;
        if (jobResult.status === RECEIPT_JOB_STATUS_DUPLICATE_SKIPPED) result.duplicateSkippedCount += 1;
        if (jobResult.status === RECEIPT_JOB_STATUS_RETRY_PENDING) result.retryPendingCount += 1;
        if (jobResult.status === RECEIPT_JOB_STATUS_FAILED) result.failedCount += 1;
      } catch (err) {
        result.failedCount += 1;
        result.errors.push(buildUserFriendlyErrorMessage_(err));
        incrementExecutionMetric_("errorCount", 1);
        logError_("processPendingReceiptJobs.item.error", err);
      }
    }

    logInfo_("receiptJobs.worker.done", result);
    if (hasPendingReceiptJobs_()) {
      scheduleReceiptWorkerKick_("pending_jobs_after_worker");
    }
    return result;
  } finally {
    try {
      finishExecutionMetrics_("ok", {
        eventType: "worker"
      });
    } catch (metricsErr) {
      logError_("receiptJobs.worker.metrics.error", metricsErr);
    }
    lock.releaseLock();
  }
}


function processOneReceiptJob(job, guard) {
  const safeJob = job || {};
  assertCanContinue("lock_receipt_job", guard);
  const lockedJob = lockReceiptJob(safeJob.jobId || safeJob.documentName);
  if (!lockedJob || lockedJob.skipped) {
    return {
      ok: true,
      status: safeJob.status || "",
      skipped: true,
      reason: lockedJob && lockedJob.reason || "lock_failed"
    };
  }

  try {
    assertCanContinue("process_receipt_job", guard);
    const event = JSON.parse(lockedJob.eventJson || "{}");
    const processResult = processReceipt(event, {
      traceId: lockedJob.traceId || "",
      asyncJob: true,
      suppressLineReply: true,
      runtimeGuard: guard,
      receiptJobId: lockedJob.jobId
    }) || {};

    if (processResult.duplicate) {
      markJobDuplicateSkipped(lockedJob.jobId, processResult.reason || "duplicate");
      notifyReceiptDuplicate_(lockedJob, processResult);
      return { ok: true, status: RECEIPT_JOB_STATUS_DUPLICATE_SKIPPED };
    }

    markJobCompleted(lockedJob.jobId, processResult.documentName || processResult.transactionId || "");
    notifyReceiptSaved(lockedJob, Object.assign({}, processResult.record || {}, {
      documentName: processResult.documentName || processResult.transactionId || ""
    }));
    return { ok: true, status: RECEIPT_JOB_STATUS_COMPLETED };
  } catch (err) {
    if (err && err.isRuntimeGuardStop) {
      markJobRetryPending(lockedJob.jobId, err.message, RECEIPT_JOB_STATUS_PROCESSING_PAUSED);
      return { ok: false, status: RECEIPT_JOB_STATUS_PROCESSING_PAUSED, errorMessage: err.message };
    }

    const retryCount = Number(lockedJob.retryCount || 0) + 1;
    if (retryCount >= Number(lockedJob.maxRetry || RECEIPT_JOB_DEFAULT_MAX_RETRY)) {
      const failedJob = markJobFailed(lockedJob.jobId, err);
      notifyReceiptProcessingError_(failedJob || lockedJob, err);
      return { ok: false, status: RECEIPT_JOB_STATUS_FAILED, errorMessage: buildUserFriendlyErrorMessage_(err) };
    }

    markJobRetryPending(lockedJob.jobId, err);
    return { ok: false, status: RECEIPT_JOB_STATUS_RETRY_PENDING, errorMessage: buildUserFriendlyErrorMessage_(err) };
  } finally {
    unlockReceiptJob(lockedJob.jobId);
  }
}


function lockReceiptJob(jobId) {
  const job = getReceiptJobById_(jobId);
  if (!job) {
    return { skipped: true, reason: "not_found" };
  }

  if (isReceiptJobLockActive_(job)) {
    return { skipped: true, reason: "locked" };
  }

  const nowIso = new Date().toISOString();
  patchReceiptJob_(job.jobId, {
    status: RECEIPT_JOB_STATUS_PROCESSING,
    lockedBy: getExecutionMetrics_().executionId,
    lockedAt: nowIso,
    startedAt: job.startedAt || nowIso,
    updatedAt: nowIso
  });
  return Object.assign({}, job, {
    status: RECEIPT_JOB_STATUS_PROCESSING,
    lockedBy: getExecutionMetrics_().executionId,
    lockedAt: nowIso,
    startedAt: job.startedAt || nowIso,
    updatedAt: nowIso
  });
}


function unlockReceiptJob(jobId) {
  const job = getReceiptJobById_(jobId);
  if (!job || !job.jobId) return null;
  if (job.status === RECEIPT_JOB_STATUS_PROCESSING) {
    return patchReceiptJob_(job.jobId, {
      lockedBy: "",
      lockedAt: "",
      updatedAt: new Date().toISOString()
    });
  }
  return null;
}


function markJobRetryPending(jobId, reason, statusOverride) {
  const job = getReceiptJobById_(jobId);
  if (!job) return null;
  const nowIso = new Date().toISOString();
  const errorId = createOperationalErrorId_();
  return patchReceiptJob_(job.jobId, {
    status: statusOverride || RECEIPT_JOB_STATUS_RETRY_PENDING,
    retryCount: Number(job.retryCount || 0) + 1,
    lastErrorAt: nowIso,
    lastSafeError: buildUserFriendlyErrorMessage_(reason),
    safeError: buildUserFriendlyErrorMessage_(reason),
    errorId: errorId,
    lockedBy: "",
    lockedAt: "",
    updatedAt: nowIso
  });
}


function markJobFailed(jobId, safeError) {
  const job = getReceiptJobById_(jobId);
  if (!job) return null;
  const nowIso = new Date().toISOString();
  return patchReceiptJob_(job.jobId, {
    status: RECEIPT_JOB_STATUS_FAILED,
    retryCount: Number(job.retryCount || 0) + 1,
    lastErrorAt: nowIso,
    lastSafeError: buildUserFriendlyErrorMessage_(safeError),
    safeError: buildUserFriendlyErrorMessage_(safeError),
    errorId: createOperationalErrorId_(),
    lockedBy: "",
    lockedAt: "",
    finishedAt: nowIso,
    updatedAt: nowIso
  });
}


function markJobCompleted(jobId, transactionId) {
  const nowIso = new Date().toISOString();
  return patchReceiptJob_(jobId, {
    status: RECEIPT_JOB_STATUS_COMPLETED,
    transactionId: String(transactionId || ""),
    lockedBy: "",
    lockedAt: "",
    finishedAt: nowIso,
    updatedAt: nowIso,
    safeError: "",
    errorId: ""
  });
}


function markJobDuplicateSkipped(jobId, reason) {
  const nowIso = new Date().toISOString();
  return patchReceiptJob_(jobId, {
    status: RECEIPT_JOB_STATUS_DUPLICATE_SKIPPED,
    lockedBy: "",
    lockedAt: "",
    finishedAt: nowIso,
    updatedAt: nowIso,
    safeError: String(reason || "duplicate")
  });
}

function sendReceiptJobCompletionPush_(job, processResult) {
  const safeResult = processResult || {};
  const record = safeResult.record || null;
  if (!record) return false;
  return notifyReceiptSaved(job, record);
}


function retryReceiptJobs(limit) {
  const jobs = getReceiptJobsForRetry_(limit || 5);
  jobs.forEach(function(job) {
    patchReceiptJob_(job.jobId, {
      status: RECEIPT_JOB_STATUS_QUEUED,
      lockedBy: "",
      lockedAt: "",
      safeError: "",
      updatedAt: new Date().toISOString()
    });
  });
  return {
    ok: true,
    retriedCount: jobs.length
  };
}


function getReceiptJobQueueStatus_() {
  const statuses = [
    RECEIPT_JOB_STATUS_QUEUED,
    RECEIPT_JOB_STATUS_RETRY_PENDING,
    RECEIPT_JOB_STATUS_PROCESSING_PAUSED,
    RECEIPT_JOB_STATUS_FAILED,
    RECEIPT_JOB_STATUS_PROCESSING
  ];
  const result = {};
  statuses.forEach(function(status) {
    result[status] = getReceiptJobsByStatus_(status, 50).length;
  });
  result.workerTriggerCount = getReceiptWorkerTriggerCount_();
  result.workerWatchdogTriggerCount = getReceiptWorkerWatchdogTriggerCount_();
  return result;
}


function getReceiptWorkerTriggerCount_() {
  try {
    return ScriptApp.getProjectTriggers().filter(function(trigger) {
      if (!trigger.getHandlerFunction) return false;
      const handler = trigger.getHandlerFunction();
      return handler === "processPendingReceiptJobs" ||
        handler === RECEIPT_WORKER_TRIGGER_HANDLER ||
        handler === RECEIPT_WORKER_WATCHDOG_HANDLER;
    }).length;
  } catch (err) {
    logError_("receiptJobs.workerTriggerCount.error", err);
    return -1;
  }
}


function getReceiptWorkerWatchdogTriggerCount_() {
  try {
    return ScriptApp.getProjectTriggers().filter(function(trigger) {
      if (!trigger.getHandlerFunction) return false;
      return trigger.getHandlerFunction() === RECEIPT_WORKER_WATCHDOG_HANDLER;
    }).length;
  } catch (err) {
    logError_("receiptJobs.workerWatchdogTriggerCount.error", err);
    return -1;
  }
}


function getGasUsageTodaySummary_() {
  const today = formatDateToYMD(new Date());
  const docs = queryProcessLogsByDatePrefix_(today, 100);
  const summary = {
    date: today,
    executionCount: docs.length,
    executionMs: 0,
    urlFetchCount: 0,
    geminiCallCount: 0,
    errorCount: 0
  };

  docs.forEach(function(doc) {
    const fields = doc.fields || {};
    summary.executionMs += getFirestoreNumber(fields.executionMs);
    summary.urlFetchCount += getFirestoreNumber(fields.urlFetchCount);
    summary.geminiCallCount += getFirestoreNumber(fields.geminiCallCount);
    summary.errorCount += getFirestoreNumber(fields.errorCount);
  });
  return summary;
}


function getPendingReceiptJobs_(limit) {
  const max = Math.max(1, Number(limit || RECEIPT_JOB_DEFAULT_BATCH_SIZE));
  const statuses = [
    RECEIPT_JOB_STATUS_QUEUED,
    RECEIPT_JOB_STATUS_RETRY_PENDING,
    RECEIPT_JOB_STATUS_PROCESSING_PAUSED
  ];
  let jobs = [];
  statuses.forEach(function(status) {
    if (jobs.length >= max) return;
    jobs = jobs.concat(getReceiptJobsByStatus_(status, max - jobs.length));
  });
  return jobs.slice(0, max);
}


function getReceiptJobsForRetry_(limit) {
  const max = Math.max(1, Number(limit || 5));
  return getReceiptJobsByStatus_(RECEIPT_JOB_STATUS_RETRY_PENDING, max)
    .concat(getReceiptJobsByStatus_(RECEIPT_JOB_STATUS_FAILED, max))
    .slice(0, max);
}


function isLargeReceiptJob_(job) {
  const safeJob = job || {};
  return String(safeJob.fileType || "").toLowerCase() === "file" ||
    /\.pdf$/i.test(String(safeJob.fileName || ""));
}


function getReceiptJobsByStatus_(status, limit) {
  return queryReceiptJobs_({
    queryName: "receipt_jobs_by_status",
    filters: [
      { field: "status", value: String(status || "") }
    ],
    limit: Math.max(1, Number(limit || 10))
  });
}


function getReceiptJobByLineMessageId_(lineMessageId) {
  const jobs = queryReceiptJobs_({
    queryName: "receipt_job_by_line_message_id",
    filters: [
      { field: "lineMessageId", value: String(lineMessageId || "") }
    ],
    limit: 1
  });
  return jobs.length ? jobs[0] : null;
}


function getReceiptJobById_(jobId) {
  const relativePath = getFirestoreRelativePath_(
    String(jobId || "").indexOf("/") === -1 ? "receipt_jobs/" + String(jobId || "") : String(jobId || "")
  );
  if (!relativePath) return null;
  try {
    const doc = firestoreRequest("get", relativePath);
    return getReceiptJobFromDocument_(doc);
  } catch (err) {
    logError_("getReceiptJobById_.error", err);
    return null;
  }
}


function patchReceiptJob_(jobId, values) {
  const relativePath = getFirestoreRelativePath_(
    String(jobId || "").indexOf("/") === -1 ? "receipt_jobs/" + String(jobId || "") : String(jobId || "")
  );
  const fields = buildReceiptJobFirestoreFields_(values || {});
  const updateMask = Object.keys(fields).map(function(fieldName) {
    return "updateMask.fieldPaths=" + encodeURIComponent(fieldName);
  }).join("&");

  const doc = firestoreRequest("patch", relativePath + "?" + updateMask, {
    fields: fields
  });
  return getReceiptJobFromDocument_(doc);
}


function queryReceiptJobs_(options) {
  const safeOptions = options || {};
  const filters = normalizeQueryFilters_(safeOptions.filters || []);
  const structuredQuery = {
    from: [
      { collectionId: "receipt_jobs" }
    ],
    limit: Math.max(1, Math.min(Number(safeOptions.limit || 10), 100))
  };

  const where = buildCompositeFilter(filters);
  if (where) {
    structuredQuery.where = where;
  }

  const docs = firestoreRunQuery(structuredQuery);
  logFirestoreQuery_(safeOptions.queryName || "receipt_jobs.query", filters, structuredQuery.limit, docs.length, 0);
  return docs.map(getReceiptJobFromDocument_);
}


function queryProcessLogsByDatePrefix_(dateKey, limit) {
  const docs = firestoreRunQuery({
    from: [
      { collectionId: "processLogs" }
    ],
    where: buildCompositeFilter([
      { field: "processName", value: "execution_metrics" }
    ]),
    limit: Math.max(1, Number(limit || 100))
  });
  return docs.filter(function(doc) {
    const timestamp = getFirestoreString_(doc.fields && doc.fields.timestamp);
    return timestamp.indexOf(String(dateKey || "")) === 0;
  });
}


function buildReceiptJobFirestoreFields_(job) {
  const safeJob = job || {};
  const fields = {};
  Object.keys(safeJob).forEach(function(key) {
    fields[key] = buildReceiptJobFirestoreValue_(safeJob[key]);
  });
  return fields;
}


function buildReceiptJobFirestoreValue_(value) {
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: Number(value) };
  return { stringValue: String(value === undefined || value === null ? "" : value) };
}


function getReceiptJobFromDocument_(doc) {
  const fields = doc && doc.fields || {};
  return {
    documentName: String(doc && doc.name || ""),
    persisted: true,
    jobId: getFirestoreString_(fields.jobId) || getShortReceiptJobId_(doc && doc.name || ""),
    lineMessageId: getFirestoreString_(fields.lineMessageId),
    lineUserId: getFirestoreString_(fields.lineUserId),
    lineSourceJson: getFirestoreString_(fields.lineSourceJson),
    eventJson: getFirestoreString_(fields.eventJson),
    replyToken: getFirestoreString_(fields.replyToken),
    replyTokenCreatedAt: getFirestoreString_(fields.replyTokenCreatedAt),
    receivedAt: getFirestoreString_(fields.receivedAt),
    eventType: getFirestoreString_(fields.eventType),
    fileType: getFirestoreString_(fields.fileType),
    fileName: getFirestoreString_(fields.fileName),
    captionText: getFirestoreString_(fields.captionText),
    status: getFirestoreString_(fields.status),
    priority: getFirestoreNumber(fields.priority),
    retryCount: getFirestoreNumber(fields.retryCount),
    maxRetry: getFirestoreNumber(fields.maxRetry) || RECEIPT_JOB_DEFAULT_MAX_RETRY,
    lockedBy: getFirestoreString_(fields.lockedBy),
    lockedAt: getFirestoreString_(fields.lockedAt),
    createdAt: getFirestoreString_(fields.createdAt),
    updatedAt: getFirestoreString_(fields.updatedAt),
    startedAt: getFirestoreString_(fields.startedAt),
    finishedAt: getFirestoreString_(fields.finishedAt),
    errorId: getFirestoreString_(fields.errorId),
    safeError: getFirestoreString_(fields.safeError),
    lastErrorAt: getFirestoreString_(fields.lastErrorAt),
    lastSafeError: getFirestoreString_(fields.lastSafeError),
    source: getFirestoreString_(fields.source),
    traceId: getFirestoreString_(fields.traceId),
    sourceKey: getFirestoreString_(fields.sourceKey),
    transactionId: getFirestoreString_(fields.transactionId),
    notificationStatus: getFirestoreString_(fields.notificationStatus),
    notificationMethod: getFirestoreString_(fields.notificationMethod),
    doneNotifiedAt: getFirestoreString_(fields.doneNotifiedAt),
    doneNotificationCount: getFirestoreNumber(fields.doneNotificationCount),
    canUseReplyToken: fields.canUseReplyToken ? getFirestoreBoolean_(fields.canUseReplyToken) : true,
    pushAllowed: fields.pushAllowed ? getFirestoreBoolean_(fields.pushAllowed) : true,
    processDoneMessageId: getFirestoreString_(fields.processDoneMessageId),
    lastNotifyError: getFirestoreString_(fields.lastNotifyError)
  };
}


function isReceiptJobLockActive_(job) {
  const lockedAt = String(job && job.lockedAt || "");
  if (!lockedAt) return false;
  const lockedMs = new Date(lockedAt).getTime();
  if (!lockedMs) return false;
  return Date.now() - lockedMs < RECEIPT_JOB_LOCK_TTL_MS;
}


function buildReceiptJobId_(lineMessageId) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(lineMessageId || Utilities.getUuid())
  );
  const hex = digest.map(function(byteValue) {
    const normalized = byteValue < 0 ? byteValue + 256 : byteValue;
    return ("0" + normalized.toString(16)).slice(-2);
  }).join("");
  return "rj_" + hex.slice(0, 24);
}


function getShortReceiptJobId_(value) {
  const text = String(value || "");
  const parts = text.split("/");
  return parts[parts.length - 1] || text || "-";
}


function createOperationalErrorId_() {
  return "ERR-" + formatDateToYMD(new Date()).replace(/-/g, "") + "-" + Utilities.getUuid().replace(/-/g, "").slice(0, 6).toUpperCase();
}
