/**
 * Receipt_Notification_Service.gs
 * Silent receipt receive notifications. Sends exactly one done/duplicate/error
 * message per receipt job when possible.
 */

function notifyReceiptSaved(job, transaction) {
  const safeTransaction = normalizeReceiptNotificationTransaction_(transaction || {});
  const message = buildReceiptSavedFlexCard(safeTransaction);
  return sendReceiptDoneNotification_(job, message, {
    transactionId: safeTransaction.documentName || safeTransaction.transactionId || "",
    reason: getReceiptSavedNotificationReason_(safeTransaction),
    messageType: message && message.type || "text"
  });
}


function chooseLineNotifyMethod(job) {
  const safeJob = job || {};

  if (String(safeJob.notificationStatus || "") === RECEIPT_NOTIFICATION_STATUS_SENT) {
    return {
      method: RECEIPT_NOTIFICATION_METHOD_SKIPPED,
      reason: "already_sent"
    };
  }

  const config = getConfig();

  if (config.receiptDoneNotifyEnabled !== true) {
    return {
      method: RECEIPT_NOTIFICATION_METHOD_SKIPPED,
      reason: "receipt_done_notify_disabled"
    };
  }

  const mode = config.receiptDoneNotifyMode || DEFAULT_RECEIPT_DONE_NOTIFY_MODE;
  if (mode !== RECEIPT_DONE_NOTIFY_MODE_PUSH_ONLY && canUseReplyToken(safeJob)) {
    return {
      method: RECEIPT_NOTIFICATION_METHOD_REPLY,
      reason: "reply_token_available"
    };
  }

  if (
    mode !== RECEIPT_DONE_NOTIFY_MODE_REPLY_ONLY &&
    config.enableProcessDonePush === true &&
    safeJob.pushAllowed !== false &&
    getProcessDonePushUsageToday_().pushCount < Number(config.maxProcessDonePushPerDay || DEFAULT_MAX_PROCESS_DONE_PUSH_PER_DAY)
  ) {
    return {
      method: RECEIPT_NOTIFICATION_METHOD_PUSH,
      reason: "reply_token_expired_or_unavailable"
    };
  }

  return {
    method: RECEIPT_NOTIFICATION_METHOD_SKIPPED,
    reason: "no_available_delivery_method"
  };
}


function canUseReplyToken(job) {
  const safeJob = job || {};
  const replyToken = String(safeJob.replyToken || "").trim();
  if (!replyToken || safeJob.canUseReplyToken === false) {
    return false;
  }

  const createdAt = Date.parse(
    String(safeJob.replyTokenCreatedAt || safeJob.receivedAt || safeJob.createdAt || "")
  );
  if (!createdAt || isNaN(createdAt)) {
    return false;
  }

  return Date.now() - createdAt <= 55 * 1000;
}


function sendDoneFlexCardWithReply(replyToken, card) {
  return sendLineMessages(replyToken, normalizeReceiptNotificationMessages_(card));
}


function sendDoneFlexCardWithPush(lineUserId, card) {
  return sendLinePushMessages_(lineUserId, normalizeReceiptNotificationMessages_(card));
}


function markJobNotificationSent(jobId, method) {
  const job = getReceiptJobById_(jobId);
  if (!job || !job.jobId) return null;

  return patchReceiptJob_(job.jobId, {
    notificationStatus: RECEIPT_NOTIFICATION_STATUS_SENT,
    notificationMethod: String(method || ""),
    doneNotifiedAt: new Date().toISOString(),
    doneNotificationCount: Number(job.doneNotificationCount || 0) + 1,
    lastNotifyError: "",
    updatedAt: new Date().toISOString()
  });
}


function markJobNotificationFailed(jobId, safeError) {
  const job = getReceiptJobById_(jobId);
  if (!job || !job.jobId) return null;

  return patchReceiptJob_(job.jobId, {
    notificationStatus: RECEIPT_NOTIFICATION_STATUS_FAILED,
    lastNotifyError: buildUserFriendlyErrorMessage_(safeError),
    updatedAt: new Date().toISOString()
  });
}


function notifyReceiptDuplicate_(job, duplicateInfo) {
  const info = duplicateInfo || {};
  const record = getDuplicateReceiptRecordFromInfo_(info);
  const message = buildDuplicateReceiptFlexCard_(record, info);
  return sendReceiptDoneNotification_(job, message, {
    transactionId: record && record.documentName || info.documentName || "",
    reason: "duplicate_" + String(info.reason || info.state || "receipt"),
    messageType: message && message.type || "text"
  });
}


function notifyReceiptProcessingError_(job, err) {
  const errorId = job && job.errorId || createOperationalErrorId_();
  const message = buildReceiptProcessingErrorMessage_(errorId, err);
  return sendReceiptDoneNotification_(job, message, {
    transactionId: "",
    reason: "processing_error",
    messageType: message && message.type || "text",
    errorId: errorId
  });
}


function buildReceiptNotificationJobFromEvent_(event, context) {
  const safeEvent = event || {};
  const message = safeEvent.message || {};
  const source = safeEvent.source || {};
  const lineUserId = String(source.userId || "").trim();
  const nowIso = new Date().toISOString();
  return {
    jobId: buildReceiptJobId_(message.id || Utilities.getUuid()),
    persisted: false,
    lineMessageId: String(message.id || ""),
    lineUserId: lineUserId,
    lineSourceJson: JSON.stringify(source || {}),
    replyToken: String(safeEvent.replyToken || ""),
    replyTokenCreatedAt: nowIso,
    receivedAt: nowIso,
    createdAt: nowIso,
    notificationStatus: RECEIPT_NOTIFICATION_STATUS_PENDING,
    doneNotificationCount: 0,
    canUseReplyToken: true,
    pushAllowed: isReceiptDonePushAllowedForUser_(lineUserId),
    traceId: context && context.traceId || ""
  };
}


function isReceiptDonePushAllowedForUser_(lineUserId) {
  const config = getConfig();
  if (config.enableProcessDonePush !== true) return false;
  if (config.processDonePushAdminOnly !== true) return true;
  return isAdminLineUserId_(lineUserId);
}


function isAdminLineUserId_(lineUserId) {
  const target = String(lineUserId || "").trim();
  if (!target) return false;

  const adminRaw = getOptionalProperty_("ADMIN_LINE_USER_IDS", "");
  const admins = adminRaw.split(/[\s,]+/).map(function(item) {
    return String(item || "").trim();
  }).filter(Boolean);

  if (!admins.length) {
    return true;
  }

  return admins.indexOf(target) !== -1;
}


function getReceiptNotificationUsageTodaySummary_() {
  const today = formatDateToYMD(new Date());
  const logs = queryReceiptNotificationLogs_(today, 500);
  const summary = {
    date: today,
    totalCount: logs.length,
    replyCount: 0,
    pushCount: 0,
    skippedCount: 0,
    failedCount: 0,
    flexCount: 0,
    textCount: 0
  };

  logs.forEach(function(log) {
    const method = String(log.method || "");
    const status = String(log.status || "");
    const messageType = String(log.messageType || "");
    if (method === RECEIPT_NOTIFICATION_METHOD_REPLY) summary.replyCount += 1;
    if (method === RECEIPT_NOTIFICATION_METHOD_PUSH) summary.pushCount += 1;
    if (method === RECEIPT_NOTIFICATION_METHOD_SKIPPED || status === "skipped") summary.skippedCount += 1;
    if (status === "failed") summary.failedCount += 1;
    if (messageType === "flex") summary.flexCount += 1;
    if (messageType === "text") summary.textCount += 1;
  });

  return summary;
}


function getProcessDonePushUsageToday_() {
  const summary = getReceiptNotificationUsageTodaySummary_();
  return {
    date: summary.date,
    pushCount: summary.pushCount,
    maxPerDay: getConfig().maxProcessDonePushPerDay
  };
}


function getReceiptNotificationJobsByStatus_(status, limit) {
  return queryReceiptJobs_({
    queryName: "receipt_jobs_by_notification_status",
    filters: [
      { field: "notificationStatus", value: String(status || "") }
    ],
    limit: Math.max(1, Number(limit || 10))
  });
}


function sendReceiptDoneNotification_(job, message, meta) {
  const safeJob = refreshReceiptNotificationJob_(job || {});
  const safeMeta = meta || {};
  const decision = chooseLineNotifyMethod(safeJob);

  if (decision.method === RECEIPT_NOTIFICATION_METHOD_SKIPPED) {
    if (isPersistedReceiptJobForNotification_(safeJob)) {
      markJobNotificationSkipped_(safeJob.jobId, decision.reason);
    }
    logReceiptNotificationUsage_(safeJob, safeMeta, {
      method: RECEIPT_NOTIFICATION_METHOD_SKIPPED,
      status: "skipped",
      reason: decision.reason,
      messageType: safeMeta.messageType || getLineMessageType_(message)
    });
    return {
      ok: true,
      skipped: true,
      reason: decision.reason
    };
  }

  if (decision.method === RECEIPT_NOTIFICATION_METHOD_REPLY) {
    try {
      sendDoneFlexCardWithReply(safeJob.replyToken, message);
      if (isPersistedReceiptJobForNotification_(safeJob)) {
        markJobNotificationSent(safeJob.jobId, RECEIPT_NOTIFICATION_METHOD_REPLY);
      }
      logReceiptNotificationUsage_(safeJob, safeMeta, {
        method: RECEIPT_NOTIFICATION_METHOD_REPLY,
        status: "sent",
        reason: decision.reason,
        messageType: getLineMessageType_(message)
      });
      return { ok: true, method: RECEIPT_NOTIFICATION_METHOD_REPLY };
    } catch (replyErr) {
      if (isPersistedReceiptJobForNotification_(safeJob)) {
        markReplyTokenUnusable_(safeJob.jobId, replyErr);
      }
      logError_("receiptNotification.reply.error", replyErr);
      if (getConfig().receiptDoneNotifyMode === RECEIPT_DONE_NOTIFY_MODE_REPLY_ONLY) {
        if (isPersistedReceiptJobForNotification_(safeJob)) {
          markJobNotificationFailed(safeJob.jobId, replyErr);
        }
        logReceiptNotificationUsage_(safeJob, safeMeta, {
          method: RECEIPT_NOTIFICATION_METHOD_REPLY,
          status: "failed",
          reason: "reply_failed",
          messageType: getLineMessageType_(message),
          errorMessage: buildUserFriendlyErrorMessage_(replyErr)
        });
        return { ok: false, method: RECEIPT_NOTIFICATION_METHOD_REPLY, errorMessage: buildUserFriendlyErrorMessage_(replyErr) };
      }
    }
  }

  const target = getReceiptNotificationPushTarget_(safeJob);
  if (target && sendDoneFlexCardWithPush(target, message)) {
    if (isPersistedReceiptJobForNotification_(safeJob)) {
      markJobNotificationSent(safeJob.jobId, RECEIPT_NOTIFICATION_METHOD_PUSH);
    }
    logReceiptNotificationUsage_(safeJob, safeMeta, {
      method: RECEIPT_NOTIFICATION_METHOD_PUSH,
      status: "sent",
      reason: "push_fallback",
      messageType: getLineMessageType_(message)
    });
    return { ok: true, method: RECEIPT_NOTIFICATION_METHOD_PUSH };
  }

  const errorMessage = target ? "LINE push failed" : "LINE push target not found";
  if (isPersistedReceiptJobForNotification_(safeJob)) {
    markJobNotificationFailed(safeJob.jobId, errorMessage);
  }
  logReceiptNotificationUsage_(safeJob, safeMeta, {
    method: RECEIPT_NOTIFICATION_METHOD_PUSH,
    status: "failed",
    reason: errorMessage,
    messageType: getLineMessageType_(message),
    errorMessage: errorMessage
  });
  return { ok: false, method: RECEIPT_NOTIFICATION_METHOD_PUSH, errorMessage: errorMessage };
}


function refreshReceiptNotificationJob_(job) {
  const safeJob = job || {};
  if (!isPersistedReceiptJobForNotification_(safeJob)) return safeJob;
  const current = getReceiptJobById_(safeJob.jobId);
  return current && current.jobId ? current : safeJob;
}


function isPersistedReceiptJobForNotification_(job) {
  const safeJob = job || {};
  return safeJob.persisted === true || !!safeJob.documentName;
}


function markJobNotificationSkipped_(jobId, reason) {
  if (!jobId) return null;
  const job = getReceiptJobById_(jobId);
  if (!job || !job.jobId || job.notificationStatus === RECEIPT_NOTIFICATION_STATUS_SENT) return null;

  return patchReceiptJob_(job.jobId, {
    notificationStatus: RECEIPT_NOTIFICATION_STATUS_SKIPPED,
    notificationMethod: RECEIPT_NOTIFICATION_METHOD_SKIPPED,
    lastNotifyError: String(reason || ""),
    updatedAt: new Date().toISOString()
  });
}


function markReplyTokenUnusable_(jobId, err) {
  if (!jobId) return null;
  const job = getReceiptJobById_(jobId);
  if (!job || !job.jobId) return null;

  return patchReceiptJob_(job.jobId, {
    canUseReplyToken: false,
    lastNotifyError: buildUserFriendlyErrorMessage_(err),
    updatedAt: new Date().toISOString()
  });
}


function getReceiptNotificationPushTarget_(job) {
  try {
    return getLinePushTargetFromSource_(JSON.parse(String(job && job.lineSourceJson || "{}")));
  } catch (err) {
    logError_("receiptNotification.pushTarget.error", err);
    return "";
  }
}


function normalizeReceiptNotificationMessages_(card) {
  if (Array.isArray(card)) {
    return card.slice(0, 5);
  }
  return [card || {
    type: "text",
    text: "บันทึกสลิปเรียบร้อยแล้ว"
  }];
}


function getLineMessageType_(message) {
  const safeMessage = Array.isArray(message) ? message[0] : message;
  return String(safeMessage && safeMessage.type || "text");
}


function normalizeReceiptNotificationTransaction_(input) {
  const safeInput = input || {};
  if (safeInput.record) {
    return normalizeReceiptNotificationTransaction_(safeInput.record);
  }
  return Object.assign({}, safeInput, {
    type: String(safeInput.type || "expense"),
    date: String(safeInput.date || safeInput.occurredAt || ""),
    merchant: String(safeInput.merchant || safeInput.vendorName || ""),
    amount: Number(safeInput.amount || 0),
    category: String(safeInput.category || safeInput.categoryName || ""),
    job: String(safeInput.job || safeInput.jobName || ""),
    items: String(safeInput.items || safeInput.note || ""),
    status: String(safeInput.status || RECORD_STATUS_IMPORTED),
    missingFields: normalizeStringList_(safeInput.missingFields || []),
    warnings: normalizeStringList_(safeInput.warnings || [])
  });
}


function getReceiptSavedNotificationReason_(record) {
  const status = String(record && record.status || "");
  if (status === RECORD_STATUS_PARSE_INCOMPLETE) return "parse_incomplete";
  if (status === RECORD_STATUS_NEEDS_REVIEW || status === RECORD_STATUS_PENDING_REVIEW) return "needs_review";
  return "saved";
}


function getDuplicateReceiptRecordFromInfo_(info) {
  const documentName = String(info && info.documentName || "").trim();
  if (!documentName) return null;

  const doc = getExpenseDocumentByIdOrName_(documentName);
  return doc ? getFirestoreRecordFromDocument_(doc) : null;
}


function buildDuplicateReceiptFlexCard_(record, info) {
  return buildFlexOrPlainText_("receipt_duplicate", {
    record: record || {},
    info: info || {}
  }, function() {
    const safeRecord = normalizeLineCardTransaction_(record || {});
    return {
      type: "flex",
      altText: "สลิปนี้เคยบันทึกแล้ว",
      contents: {
        type: "bubble",
        size: "mega",
        header: buildCardHeader_("YUPPIE FINANCE", "สลิปนี้เคยบันทึกแล้ว", "#92400E"),
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "20px",
          contents: [
            buildCardMetricRow_("สถานะ", "ไม่บันทึกซ้ำ", true),
            buildCardMetricRow_("ยอดเงิน", safeRecord.amountText || "-"),
            buildCardMetricRow_("งาน", safeRecord.job || "-"),
            buildCardMetricRow_("ร้าน/ผู้รับ", safeRecord.merchant || "-"),
            buildCardMetricRow_("วันที่", safeRecord.date || "-")
          ]
        },
        footer: buildCardFooter_("ระบบพบว่าสลิปนี้เคยถูกบันทึกแล้ว จึงไม่สร้างรายการใหม่")
      }
    };
  });
}


function buildReceiptProcessingErrorMessage_(errorId, err) {
  return buildErrorCard({
    commandName: "receipt_job",
    errorId: errorId,
    safeErrorMessage: buildUserFriendlyErrorMessage_(err)
  });
}


function logReceiptNotificationUsage_(job, meta, result) {
  try {
    const safeJob = job || {};
    const safeMeta = meta || {};
    const safeResult = result || {};
    const payload = {
      fields: {
        timestamp: { stringValue: new Date().toISOString() },
        processName: { stringValue: "receipt_notification" },
        jobId: { stringValue: String(safeJob.jobId || "") },
        transactionId: { stringValue: String(safeMeta.transactionId || "") },
        method: { stringValue: String(safeResult.method || "") },
        reason: { stringValue: truncateText_(String(safeResult.reason || ""), 300) },
        messageType: { stringValue: String(safeResult.messageType || "") },
        lineUserId: { stringValue: String(safeJob.lineUserId || "") },
        status: { stringValue: String(safeResult.status || "") },
        errorId: { stringValue: String(safeMeta.errorId || "") },
        errorMessage: { stringValue: truncateText_(String(safeResult.errorMessage || ""), 900) },
        createdAt: { stringValue: new Date().toISOString() }
      }
    };
    firestoreRequest("post", "processLogs", payload);
  } catch (err) {
    logError_("receiptNotification.log.error", err);
  }
}


function queryReceiptNotificationLogs_(dateKey, limit) {
  const docs = firestoreRunQuery({
    from: [
      { collectionId: "processLogs" }
    ],
    where: buildCompositeFilter([
      { field: "processName", value: "receipt_notification" }
    ]),
    limit: Math.max(1, Math.min(Number(limit || 500), 1000))
  });

  return docs.map(function(doc) {
    const fields = doc.fields || {};
    return {
      timestamp: getFirestoreString_(fields.timestamp),
      jobId: getFirestoreString_(fields.jobId),
      transactionId: getFirestoreString_(fields.transactionId),
      method: getFirestoreString_(fields.method),
      reason: getFirestoreString_(fields.reason),
      messageType: getFirestoreString_(fields.messageType),
      lineUserId: getFirestoreString_(fields.lineUserId),
      status: getFirestoreString_(fields.status)
    };
  }).filter(function(log) {
    return String(log.timestamp || "").indexOf(String(dateKey || "")) === 0;
  });
}


function normalizeStringList_(value) {
  if (Array.isArray(value)) {
    return value.map(function(item) {
      return String(item || "").trim();
    }).filter(Boolean);
  }

  const text = String(value || "").trim();
  if (!text) return [];
  return text.split(/[,|]/).map(function(item) {
    return String(item || "").trim();
  }).filter(Boolean);
}
