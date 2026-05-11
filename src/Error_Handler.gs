/**
 * Error_Handler.gs
 * Centralized logging and safe user-facing error replies.
 */

function safeReplyError(replyToken, message) {
  try {
    if (!replyToken) return;
    const errorId = createErrorId_();
    sendLineMessages(replyToken, [
      buildErrorCard({
        commandName: "processing",
        errorId: errorId,
        safeErrorMessage: buildUserFriendlyErrorMessage_(message)
      })
    ]);
  } catch (err) {
    logError("safeReplyError.error", err);
  }
}


function logInfo(title, content) {
  try {
    console.log(`${title}: ${JSON.stringify(content)}`);
  } catch (err) {
    console.log(title);
  }
}


function logError(title, err) {
  try {
    console.error(`${title}: ${err && err.stack ? err.stack : err}`);
  } catch (e) {
    console.error(title);
  }
}


function safeReplyError_(replyToken, message) {
  return safeReplyError(replyToken, buildUserFriendlyErrorMessage_(message));
}

function handleWebhookError_(err, replyToken, traceId) {
  logError_("webhook.error", err);
  logWebhookError_(traceId || "", err);
  if (replyToken) {
    safeReplyError_(replyToken, err && err.message ? err.message : err);
  }
}

function buildUserFriendlyErrorMessage_(message) {
  const text = String(message || "เกิดข้อผิดพลาด");
  return text
    .replace(/Bearer\s+[A-Za-z0-9._+\/=:-]+/g, "Bearer ****")
    .replace(/AIza[0-9A-Za-z_-]{8,}/g, "AIza****")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "ya29.****")
    .replace(/key=([^\s&]+)/g, "key=****")
    .replace(/(token|secret|api[_-]?key|private[_-]?key|authorization)(["'\s:=]+)([^"'\s,}]+)/gi, "$1$2****")
    .replace(
      new RegExp("-----BEGIN [^-]*PRIVATE" + " KEY-----[\\s\\S]*?-----END [^-]*PRIVATE" + " KEY-----", "g"),
      "-----BEGIN PRIVATE" + " KEY-----****-----END PRIVATE" + " KEY-----"
    )
    .slice(0, 900);
}

function createErrorId_() {
  return createOperationalErrorId_();
}

function buildProcessingErrorText_(errorId) {
  return [
    "เกิดข้อผิดพลาดระหว่างประมวลผล",
    "รหัสอ้างอิง: " + String(errorId || createErrorId_())
  ].join("\n");
}

function handleLineEventError_(err, event, context, meta) {
  const errorId = logCommandError_(err, event || null, context || {}, meta || {});
  logError_("routeLineEvent.error." + errorId, err);
  if (event && event.replyToken) {
    try {
      sendLineMessages(event.replyToken, [
        buildErrorCard({
          commandName: inferCommandNameFromText_(event.message && event.message.text || ""),
          errorId: errorId,
          safeErrorMessage: buildUserFriendlyErrorMessage_(err && err.message ? err.message : err)
        })
      ]);
    } catch (replyErr) {
      logError_("routeLineEvent.errorReply." + errorId, replyErr);
    }
  }
  return errorId;
}

function logCommandError_(err, event, context, meta) {
  const errorId = String(meta && meta.errorId || createErrorId_());
  const entry = buildCommandErrorLogEntry_(err, event || null, context || {}, Object.assign({}, meta || {}, {
    errorId: errorId
  }));

  logError_("command.error." + errorId, err);
  try {
    writeAuditLog_({
      traceId: entry.traceId,
      action: "command_error",
      lineUserId: entry.lineUserId,
      status: "error",
      errorId: entry.errorId,
      commandName: entry.commandName,
      inputText: entry.inputText,
      functionName: entry.functionName,
      queryName: entry.queryName,
      safeErrorMessage: entry.safeErrorMessage,
      stackTrace: entry.stackTrace,
      createdAt: entry.createdAt,
      errorMessage: entry.safeErrorMessage,
      newValue: {
        errorId: entry.errorId,
        commandName: entry.commandName,
        inputText: entry.inputText,
        functionName: entry.functionName,
        queryName: entry.queryName
      }
    });
  } catch (auditErr) {
    logError_("command.error.auditLog." + errorId, auditErr);
  }

  try {
    writeCommandErrorProcessLog_(entry);
  } catch (processErr) {
    logError_("command.error.processLog." + errorId, processErr);
  }

  return errorId;
}

function buildCommandErrorLogEntry_(err, event, context, meta) {
  const safeContext = context || {};
  const safeMeta = meta || {};
  const text = event && event.message && event.message.type === "text"
    ? String(event.message.text || "")
    : "";
  const commandName = String(safeMeta.commandName || inferCommandNameFromText_(text) || "unknown_command");
  const functionName = String(safeMeta.functionName || inferFunctionNameFromCommand_(commandName) || "");
  const queryName = String(safeMeta.queryName || err && err.queryName || "");
  const safeErrorMessage = buildUserFriendlyErrorMessage_(err && err.message ? err.message : err);
  const stackTrace = buildUserFriendlyErrorMessage_(err && err.stack ? err.stack : safeErrorMessage);

  return {
    errorId: String(safeMeta.errorId || createErrorId_()),
    traceId: String(safeContext.traceId || safeMeta.traceId || ""),
    commandName: commandName,
    inputText: truncateText_(text, 500),
    lineUserId: String(safeMeta.lineUserId || getLineUserIdFromEvent_(event) || safeContext.lineUserId || ""),
    functionName: functionName,
    queryName: queryName,
    safeErrorMessage: safeErrorMessage,
    stackTrace: stackTrace,
    createdAt: new Date().toISOString()
  };
}

function inferCommandNameFromText_(text) {
  const input = String(text || "").trim();
  if (/^สรุปงบ\s+โรงงาน$/i.test(input)) return "FACTORY_MONTHLY_SUMMARY";
  if (/^สรุปงบ\s+/i.test(input)) return "JOB_TOTAL_SUMMARY";
  if (/^(สรุปงบ|งานเดือนนี้|รายการงานเดือนนี้|งานที่ใช้งบเดือนนี้)$/i.test(input)) return "active_jobs_this_month";
  if (/^ค่าแรง\s+/i.test(input)) return "labor_summary";
  if (/^(รายการล่าสุด|ล่าสุด)$/i.test(input)) return "latest";
  if (/^ล่าสุด\s+\d+/i.test(input)) return "latest_list";
  if (/^(รายการรอยืนยัน|pending review)$/i.test(input)) return "pending_review";
  if (/^แก้ล่าสุด\s+/i.test(input)) return "edit_latest";
  if (/^ลบล่าสุด/i.test(input)) return "delete_latest";
  if (/^sync\s|^sheet sync|^retry sync/i.test(input)) return "sheet_sync";
  if (/^(help|menu|เมนู)$/i.test(input)) return "help";
  return input ? "text_command" : "unknown_command";
}

function inferFunctionNameFromCommand_(commandName) {
  const map = {
    FACTORY_MONTHLY_SUMMARY: "handleFactorySummaryCommand",
    JOB_TOTAL_SUMMARY: "handleJobSummaryCommand",
    factory_summary: "getFactorySummary_",
    project_summary: "getProjectSummary",
    active_jobs_this_month: "getActiveJobsThisMonthText_",
    labor_summary: "getLaborSummaryByWeekAndMonth",
    latest: "getRecentExpenseRecords_",
    latest_list: "getRecentExpenseRecords_",
    pending_review: "getPendingReviewTransactions_",
    edit_latest: "updateLatestExpenseRecord_",
    delete_latest: "deleteExpenseRecordByDocumentName_",
    sheet_sync: "Sheet_Repository",
    help: "buildHelpMessage_"
  };
  return map[String(commandName || "")] || "handleTextMessage";
}

function getLineUserIdFromEvent_(event) {
  return String(event && event.source && event.source.userId || "");
}

function logInfo_(title, content) {
  return logInfo(title, content);
}

function logError_(title, err) {
  return logError(title, err);
}


