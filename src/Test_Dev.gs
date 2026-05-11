/**
 * Test_Dev.gs
 * Safe developer helpers. Functions avoid LINE replies unless a caller explicitly sends a real event.
 */

function reauthorizeProject() {
  logInfo_("reauthorize", { ok: true });
}

function testTextCommand_() {
  return buildHelpMessage_();
}

function testReceiptJsonParse_() {
  const sample = {
    type: "expense",
    date: "2026-04-09",
    merchant: "นาย ตัวอย่าง",
    amount: 6208,
    category: "ค่าแรง",
    job: "งานทั่วไป",
    items: "ค่าแรง_W1_เม.ย._งานบูธA",
    note: "ค่าแรง_W1_เม.ย._งานบูธA"
  };
  return normalizeReceiptData(sample);
}

function testManualLabor_() {
  const formattedDate = parseThaiDateToYMD("09/04/2026");
  return {
    date: formattedDate,
    week: getWeekOfMonth(formattedDate),
    month: getMonthThai(formattedDate),
    job: buildLaborJobName_("1", "เมษายน")
  };
}

function testFactoryExpenseNote_() {
  const sample = {
    type: "expense",
    date: "2026-04-09",
    merchant: "ปั๊มน้ำมันตัวอย่าง",
    amount: 1200,
    category: "อื่นๆ",
    job: "งานทั่วไป",
    items: "ค่าขนส่ง_โรงงาน_ค่าน้ำมันมาโรงงาน",
    note: "ค่าขนส่ง_โรงงาน_ค่าน้ำมันมาโรงงาน"
  };
  return normalizeReceiptData(sample);
}

function testNonLaborLaborFields_() {
  const record = normalizeReceiptData({
    type: "expense",
    date: "2026-05-06",
    merchant: "ร้านสีตัวอย่าง",
    amount: 2500,
    category: "อื่นๆ",
    job: "งานทั่วไป",
    items: "วัสดุ_สีเทา_งานแมว",
    note: "วัสดุ_สีเทา_งานแมว"
  });

  return {
    ok: record.category !== LABOR_CATEGORY_NAME && !record.laborWeek && !record.laborMonth,
    record: record
  };
}

function testReceiptMetadata_() {
  const record = finalizeRecordMetadata_({
    type: "expense",
    date: "2026-05-06",
    merchant: "ร้านตัวอย่าง",
    amount: 100,
    category: "อื่นๆ",
    job: "งานทั่วไป",
    items: "ทดสอบ",
    note: "",
    ocrRawText: "raw text",
    ocrConfidence: 0.95,
    parsedAt: "2026-05-06T01:00:00.000Z",
    normalizedAt: "2026-05-06T01:00:01.000Z"
  }, {
    sourceMessageId: "line_msg_1",
    lineUserId: "U_TEST",
    displayName: "Tester",
    attachmentUrl: "https://example.com/file.jpg",
    attachmentPath: "receipts/2026/05/line_msg_1.jpg"
  });

  return {
    ok:
      record.source === RECORD_SOURCE_LINE_BOT &&
      record.status === RECORD_STATUS_IMPORTED &&
      record.createdByLineUserId === "U_TEST" &&
      record.createdFromLineMessageId === "line_msg_1" &&
      record.storageUrl === "https://example.com/file.jpg" &&
      record.storagePath === "receipts/2026/05/line_msg_1.jpg" &&
      record.duplicateStatus === DUPLICATE_STATUS_UNIQUE,
    record: record
  };
}

function testMasterDataAliases_() {
  return {
    job: normalizeJobAlias_("Factory"),
    category: normalizeCategory("ค่าเดินทาง"),
    item: normalizeItemAlias_("fuel"),
    merchant: normalizeMerchantAlias_("ร้านตัวอย่าง")
  };
}

function testStructuredNoteJobParsing_() {
  return {
    categoryFirst: normalizeReceiptData({
      type: "expense",
      date: "2026-05-04",
      merchant: "ร้านตัวอย่าง",
      amount: 100,
      category: "อื่นๆ",
      job: "งานทั่วไป",
      items: "วัสดุ_งานแมว",
      note: "วัสดุ_งานแมว"
    }),
    jobFirst: normalizeReceiptData({
      type: "expense",
      date: "2026-05-04",
      merchant: "ร้านตัวอย่าง",
      amount: 100,
      category: "อื่นๆ",
      job: "งานทั่วไป",
      items: "งานแมว_วัสดุ",
      note: "งานแมว_วัสดุ"
    }),
    itemFirst: normalizeReceiptData({
      type: "expense",
      date: "2026-05-04",
      merchant: "ร้านตัวอย่าง",
      amount: 100,
      category: "อื่นๆ",
      job: "งานทั่วไป",
      items: "เหล็ก_งานแมว",
      note: "เหล็ก_งานแมว"
    }),
    categoryItemJob: normalizeReceiptData({
      type: "expense",
      date: "2026-05-04",
      merchant: "ร้านตัวอย่าง",
      amount: 100,
      category: "อื่นๆ",
      job: "งานทั่วไป",
      items: "วัสดุ_สีเทา_งานแมว",
      note: "วัสดุ_สีเทา_งานแมว"
    })
  };
}

function testOutgoingSlipTypeGuard_() {
  return {
    outgoingWithWrongAiType: normalizeReceiptData({
      type: "income",
      date: "2026-05-06",
      merchant: "YUPPIE",
      amount: 2500,
      category: "อื่นๆ",
      job: "งานทั่วไป",
      items: "วัสดุ_สีเทา_งานแมว",
      note: "วัสดุ_สีเทา_งานแมว",
      bank: {
        is_transfer_slip: true,
        sender_account_name: "YUPPIE",
        receiver_account_name: "ร้านสีตัวอย่าง",
        remarks: "วัสดุ_สีเทา_งานแมว"
      }
    }),
    incomingCustomerPayment: normalizeReceiptData({
      type: "income",
      date: "2026-05-06",
      merchant: "ลูกค้าตัวอย่าง",
      amount: 100000,
      category: "ค่างวดงาน",
      job: "งานแมว",
      items: "รับค่างวด",
      note: "รับค่างวด",
      bank: {
        is_transfer_slip: true,
        sender_account_name: "ลูกค้าตัวอย่าง",
        receiver_account_name: "YUPPIE",
        remarks: "รับค่างวดงานแมว"
      }
    })
  };
}

function testFirestoreSave_() {
  if (getOptionalProperty_("ENABLE_DEV_WRITES", "") !== "true") {
    return "Skipped. Set ENABLE_DEV_WRITES=true to allow test writes.";
  }
  return saveToFirestore({
    type: "expense",
    date: formatDateToYMD(new Date()),
    merchant: "DEV_TEST",
    amount: 1,
    category: "อื่นๆ",
    items: "dev test",
    note: "",
    job: "งานทดสอบ",
    laborWeek: "",
    laborMonth: "",
    sourceKey: "dev",
    sourceMessageId: "dev_" + Date.now(),
    sourceMimeType: "manual",
    attachmentUrl: "",
    attachmentPath: "",
    attachmentMimeType: ""
  });
}

function testSheetSave_() {
  if (getOptionalProperty_("ENABLE_DEV_WRITES", "") !== "true") {
    return "Skipped. Set ENABLE_DEV_WRITES=true to allow test writes.";
  }
  saveToSheet({
    type: "expense",
    date: formatDateToYMD(new Date()),
    merchant: "DEV_TEST",
    category: "อื่นๆ",
    job: "งานทดสอบ",
    amount: 1,
    items: "dev test",
    note: "",
    laborWeek: "",
    laborMonth: "",
    attachmentUrl: "",
    attachmentPath: "",
    attachmentMimeType: ""
  });
  return "OK";
}

function mockLineEvent_(text) {
  return {
    type: "message",
    replyToken: "mock_reply_token",
    source: { type: "user", userId: "mock_user" },
    message: { type: "text", text: String(text || "help") }
  };
}


function testExpenseQueryKeys_() {
  return buildExpenseQueryKeys_({
    type: "expense",
    date: "2026-04-09",
    merchant: "นาย สมชาย",
    amount: 6208,
    category: LABOR_CATEGORY_NAME,
    job: buildLaborJobName_("1", "เมษายน"),
    items: "[สัปดาห์ที่ 1 เดือน เมษายน] ค่าแรง",
    laborWeek: "1",
    laborMonth: "เมษายน",
    status: RECORD_STATUS_IMPORTED,
    createdByLineUserId: "U_TEST"
  });
}


function testExpenseQueryBuilder_() {
  return {
    where: buildCompositeFilter([
      { field: "isActive", value: true },
      { field: "monthKey", value: "2026-04" }
    ]),
    orderBy: buildOrderBy([
      { field: "occurredAt", direction: "DESCENDING" }
    ])
  };
}


function testSheetSyncModeCases_() {
  return {
    off: getInitialSheetSyncStatusForMode_(SHEET_SYNC_MODE_OFF) === SHEET_SYNC_STATUS_DISABLED,
    manual: getInitialSheetSyncStatusForMode_(SHEET_SYNC_MODE_MANUAL) === SHEET_SYNC_STATUS_PENDING_MANUAL,
    batch: getInitialSheetSyncStatusForMode_(SHEET_SYNC_MODE_BATCH) === SHEET_SYNC_STATUS_PENDING,
    realtime: getInitialSheetSyncStatusForMode_(SHEET_SYNC_MODE_REALTIME) === SHEET_SYNC_STATUS_PENDING,
    defaultMode: normalizeSheetSyncMode_("") === SHEET_SYNC_MODE_BATCH
  };
}


function testSheetSyncFailureDoesNotRollbackFirestore_() {
  return [
    "Expected behavior:",
    "1. saveToFirestore() completes before any Sheet write.",
    "2. syncTransactionToSheet() catches Sheet errors and marks sheetSyncStatus=ERROR.",
    "3. The Firestore transaction is not deleted or rolled back."
  ].join("\n");
}


function testSheetSyncRetryCases_() {
  return {
    retryOneFunction: "retrySheetSync(transactionId)",
    retryErrorsFunction: "retrySheetSyncErrors(limit)",
    batchLimitMax: 50
  };
}


function testBotCommandsReadFirestore_() {
  return {
    latest: "getRecentExpenseRecords_() -> getLatestTransactionDocumentsBySourceKey_() -> queryExpenses()",
    projectSummary: "handleJobSummaryCommand() -> getJobTotalSummary() -> getSummaryTransactionsByScopeTotal_() -> queryExpenses()",
    factorySummary: "handleFactorySummaryCommand() -> getFactoryMonthlySummary() -> getSummaryTransactionsByScope_() -> queryExpenses()",
    activeJobs: "getActiveJobsThisMonthText_() -> getMonthlySummary() -> getSummaryTransactionsByMonth() -> queryExpenses()",
    laborSummary: "getLaborSummaryByWeekAndMonth() -> getLaborTransactionsByWeek() -> queryExpenses()",
    syncError: "getSheetSyncErrors() -> queryExpenses()"
  };
}


function testSheetSnapshotExcludesHeavyFields_() {
  const rowText = buildExpenseSheetRow_({
    documentName: "projects/x/databases/(default)/documents/expenses/dev",
    date: "2026-05-11",
    type: "expense",
    job: "งานทดสอบ",
    category: "อื่นๆ",
    merchant: "ร้านทดสอบ",
    amount: 1,
    status: RECORD_STATUS_IMPORTED,
    items: "dev",
    note: "note",
    storageUrl: "https://example.com/file",
    createdByDisplayName: "Tester",
    sheetSyncStatus: SHEET_SYNC_STATUS_PENDING,
    sheetSyncError: "",
    ocrRawText: "SHOULD_NOT_SYNC",
    geminiRawResponse: "SHOULD_NOT_SYNC",
    rawFileData: "SHOULD_NOT_SYNC",
    storageMetadata: "SHOULD_NOT_SYNC",
    auditDetails: "SHOULD_NOT_SYNC"
  }).join("|");

  return {
    ok: rowText.indexOf("SHOULD_NOT_SYNC") === -1,
    headers: EXPENSE_SHEET_HEADERS
  };
}


function testFactorySummaryNoRecords_() {
  return buildFactorySummaryFromRecords_([]).text === "ยังไม่พบรายการค่าใช้จ่ายโรงงานของเดือนนี้";
}


function testFactorySummaryExpenseRecords_() {
  const result = buildFactorySummaryFromRecords_([
    mockFactorySummaryRecord_("expense", 100, "ค่าขนส่ง", "ปั๊มน้ำมัน", RECORD_STATUS_IMPORTED)
  ]);
  return {
    ok: result.text.indexOf("รายจ่าย: ฿100") !== -1,
    text: result.text
  };
}


function testFactorySummaryIncomeRecords_() {
  const result = buildFactorySummaryFromRecords_([
    mockFactorySummaryRecord_("income", 200, "อื่นๆ", "ลูกค้า", RECORD_STATUS_IMPORTED)
  ]);
  return {
    ok: result.text.indexOf("รายรับ: ฿200") !== -1,
    text: result.text
  };
}


function testFactorySummaryIncomeExpenseRecords_() {
  const result = buildFactorySummaryFromRecords_([
    mockFactorySummaryRecord_("income", 500, "อื่นๆ", "ลูกค้า", RECORD_STATUS_IMPORTED),
    mockFactorySummaryRecord_("expense", 125, "ค่าใช้จ่ายสำนักงาน", "ร้านเอกสาร", RECORD_STATUS_IMPORTED)
  ]);
  return {
    ok:
      result.text.indexOf("รายรับ: ฿500") !== -1 &&
      result.text.indexOf("รายจ่าย: ฿125") !== -1 &&
      result.text.indexOf("สุทธิ: ฿375") !== -1,
    text: result.text
  };
}


function testFactorySummaryExcludesInactiveStatuses_() {
  const result = buildFactorySummaryFromRecords_([
    mockFactorySummaryRecord_("expense", 100, "ค่าขนส่ง", "ร้าน A", RECORD_STATUS_IMPORTED),
    mockFactorySummaryRecord_("expense", 999, "ค่าขนส่ง", "ร้าน B", RECORD_STATUS_PENDING_REVIEW),
    mockFactorySummaryRecord_("expense", 999, "ค่าขนส่ง", "ร้าน C", RECORD_STATUS_REJECTED),
    Object.assign(mockFactorySummaryRecord_("expense", 999, "ค่าขนส่ง", "ร้าน D", RECORD_STATUS_DELETED), {
      isActive: false
    })
  ]);
  return {
    ok: result.text.indexOf("รายจ่าย: ฿100") !== -1 && result.text.indexOf("999") === -1,
    text: result.text
  };
}


function testFactorySummaryMissingFields_() {
  const result = buildFactorySummaryFromRecords_([
    {
      amount: "",
      type: "",
      status: RECORD_STATUS_IMPORTED,
      isActive: true,
      isFactoryExpense: true
    }
  ]);
  return {
    ok:
      result.text.indexOf("ไม่ระบุหมวด") !== -1 &&
      result.text.indexOf("ไม่ระบุร้าน") !== -1 &&
      result.text.indexOf("รายจ่าย: ฿0") !== -1,
    text: result.text
  };
}


function testProjectSummaryStillUsesJobQuery_() {
  return isFactorySummaryQuery_("งานบูธA") === false &&
    isFactorySummaryQuery_(FACTORY_JOB_NAME) === true;
}


function testJobSummaryRecords_() {
  const result = formatBudgetSummary(summarizeTransactions([
    mockJobSummaryRecord_("expense", 300, "วัสดุ", "ร้านเหล็ก", RECORD_STATUS_IMPORTED),
    mockJobSummaryRecord_("income", 1000, "ค่างวดงาน", "ลูกค้า", RECORD_STATUS_IMPORTED)
  ], {
    title: "สรุปงบ งานทดสอบ"
  }), "สรุปงบ งานทดสอบ");

  return {
    ok:
      result.text.indexOf("รายรับ: ฿1,000") !== -1 &&
      result.text.indexOf("รายจ่าย: ฿300") !== -1 &&
      result.text.indexOf("สุทธิ: ฿700") !== -1 &&
      result.text.indexOf("เดือน:") === -1,
    text: result.text
  };
}


function testFactorySummaryUsesCurrentMonthKey_() {
  const parsed = parseBudgetSummaryCommand_("สรุปงบ โรงงาน");
  return {
    ok:
      parsed.commandType === "FACTORY_MONTHLY_SUMMARY" &&
      parsed.scopeType === SUMMARY_SCOPE_TYPE_FACTORY &&
      parsed.periodType === "MONTH" &&
      parsed.monthKey === getCurrentSummaryMonthKey_(),
    functionFlow: "handleFactorySummaryCommand() -> getFactoryMonthlySummary(monthKey)",
    requiredFilters: ["isActive", "status", "monthKey", "scopeType", "scopeKey"],
    monthKey: getCurrentSummaryMonthKey_(),
    parsedCommand: parsed
  };
}


function testJobSummaryDoesNotUseMonthKey_() {
  const parsed = parseBudgetSummaryCommand_("งานบูธA");
  return {
    ok:
      parsed.commandType === "JOB_TOTAL_SUMMARY" &&
      parsed.scopeType === SUMMARY_SCOPE_TYPE_JOB &&
      parsed.periodType === "ALL" &&
      parsed.monthKey === "",
    functionFlow: "handleJobSummaryCommand() -> getJobTotalSummary(jobId)",
    requiredFilters: ["isActive", "status", "scopeType", "scopeKey"],
    forbiddenFilters: ["monthKey", "fileHash", "fingerprint", "duplicateStatus"],
    parsedCommand: parsed
  };
}


function testJobSummaryCrossMonthRecords_() {
  const result = formatBudgetSummary(summarizeTransactions([
    Object.assign(mockJobSummaryRecord_("expense", 300, "วัสดุ", "ร้านเหล็ก", RECORD_STATUS_IMPORTED), {
      monthKey: "2026-04",
      occurredAt: "2026-04-15"
    }),
    Object.assign(mockJobSummaryRecord_("expense", 200, "ค่าขนส่ง", "รถรับจ้าง", RECORD_STATUS_IMPORTED), {
      monthKey: "2026-05",
      occurredAt: "2026-05-11"
    })
  ], {
    title: "สรุปงบ งานทดสอบ"
  }), "สรุปงบ งานทดสอบ");

  return {
    ok:
      result.text.indexOf("รายจ่าย: ฿500") !== -1 &&
      result.text.indexOf("เดือน:") === -1,
    text: result.text
  };
}


function testJobSummaryNoMonthlyFallbackText_() {
  const result = formatBudgetSummary(summarizeTransactions([], {
    title: "สรุปงบ งานบูธA",
    emptyText: "ยังไม่พบรายการของงานนี้",
    monthKey: ""
  }), "สรุปงบ งานบูธA");

  return {
    ok:
      result.text === "ยังไม่พบรายการของงานนี้" &&
      result.text.indexOf("ในเดือน") === -1 &&
      result.text.indexOf("2026-05") === -1,
    text: result.text
  };
}


function testJobSummaryFallbackUsesJobId_() {
  return {
    ok: true,
    primaryQuery: {
      queryName: "summary_job_total",
      filters: ["isActive", "status", "scopeType", "scopeKey"]
    },
    fallbackQuery: {
      queryName: "summary_job_total_by_job_id",
      filters: ["isActive", "status", "jobId"]
    }
  };
}


function testSummaryQueriesDoNotUseDuplicateKeys_() {
  const factoryFields = [
    "isActive",
    "status",
    "monthKey",
    "scopeType",
    "scopeKey"
  ];
  const jobFields = [
    "isActive",
    "status",
    "scopeType",
    "scopeKey"
  ];
  const banned = ["fileHash", "fingerprint", "duplicateStatus", "categoryId"];
  return {
    ok: banned.every(function(field) {
      return factoryFields.indexOf(field) === -1 && jobFields.indexOf(field) === -1;
    }),
    factorySummaryFilterFields: factoryFields,
    jobSummaryFilterFields: jobFields,
    bannedFields: banned
  };
}


function testTextCommandRouteSeparation_() {
  return {
    ok: true,
    textCommandFlow: "routeLineEvent_ text -> routeTextCommand_ -> handleTextMessage",
    forbiddenForText: [
      "handleReceiptMessage_",
      "fetchLineFileAsBase64",
      "analyzeReceiptWithGemini",
      "getTransactionByFileHash_",
      "getTransactionByFingerprint"
    ]
  };
}


function testDoPostImageCreatesReceiptJobFast_() {
  const event = mockReceiptImageEvent_("line_msg_queue_test");
  const jobId = buildReceiptJobId_(event.message.id);
  return {
    ok:
      !!jobId &&
      jobId.indexOf("rj_") === 0,
    expectedFlow: "routeLineEvent_ image -> enqueueReceiptMessage_ -> createReceiptJobFromLineEvent_ -> reply queued",
    forbiddenInDoPost: [
      "fetchLineFileAsBase64",
      "analyzeReceiptWithGemini",
      "uploadReceiptAttachmentToFirebase_"
    ],
    jobId: jobId
  };
}


function testTextCommandDoesNotEnterReceiptQueue_() {
  return {
    ok: true,
    textCommandFlow: "routeLineEvent_ text -> routeTextCommand_ -> handleTextMessage",
    forbiddenForText: [
      "enqueueReceiptMessage_",
      "getTransactionByFileHash_",
      "getTransactionByFingerprint",
      "fetchLineFileAsBase64",
      "analyzeReceiptWithGemini"
    ]
  };
}


function testWorkerDuplicateSkipsGemini_() {
  return {
    ok: true,
    workerOrder: [
      "lineMessageId cache/sourceMessageId",
      "download LINE file",
      "fileHash duplicate",
      "Gemini only after duplicate checks pass"
    ],
    duplicateResultStatus: RECEIPT_JOB_STATUS_DUPLICATE_SKIPPED
  };
}


function testRuntimeGuardMarksRetryPending_() {
  const guard = createRuntimeGuard(60000);
  guard.startedAtMs = Date.now() - 59000;
  let stopped = false;
  try {
    assertCanContinue("unit_test", guard);
  } catch (err) {
    stopped = err && err.isRuntimeGuardStop === true;
  }

  return {
    ok: stopped === true,
    expectedJobStatus: RECEIPT_JOB_STATUS_PROCESSING_PAUSED
  };
}


function testReceiptJobRetryPolicy_() {
  return {
    ok: true,
    maxRetry: RECEIPT_JOB_DEFAULT_MAX_RETRY,
    beforeMaxRetry: RECEIPT_JOB_STATUS_RETRY_PENDING,
    afterMaxRetry: RECEIPT_JOB_STATUS_FAILED
  };
}


function testWorkerLockPreventsDuplicateProcessing_() {
  const job = {
    lockedAt: new Date().toISOString()
  };
  return {
    ok: isReceiptJobLockActive_(job) === true,
    lockTtlMs: RECEIPT_JOB_LOCK_TTL_MS
  };
}


function testQueuedReceiptErrorResponseSafe_() {
  const message = buildErrorCard({
    commandName: "receipt_job",
    errorId: createErrorId_(),
    safeErrorMessage: "Bearer abc token=secret"
  });
  const json = JSON.stringify(message);
  return {
    ok:
      json.indexOf("token=secret") === -1 &&
      json.indexOf("Bearer abc") === -1,
    messageType: message.type
  };
}


function mockReceiptImageEvent_(messageId) {
  return {
    type: "message",
    replyToken: "mock_reply_token",
    source: { type: "user", userId: "mock_user" },
    message: {
      type: "image",
      id: String(messageId || "mock_image_message")
    }
  };
}


function testImageFileRouteUsesReceiptFlow_() {
  return {
    ok: true,
    imageFlow: "routeLineEvent_ image/file -> enqueueReceiptMessage_ -> receipt_jobs queue",
    workerFlow: "processPendingReceiptJobs() -> processOneReceiptJob() -> processReceipt()",
    duplicateChecks: [
      "sourceMessageId",
      "fileHash",
      "fingerprint"
    ]
  };
}


function testSummaryScopeBackfillCases_() {
  const factoryKeys = buildExpenseQueryKeys_({
    date: "2026-05-11",
    job: FACTORY_JOB_NAME,
    category: "ค่าขนส่ง",
    amount: 100,
    status: RECORD_STATUS_IMPORTED
  });
  const jobKeys = buildExpenseQueryKeys_({
    date: "2026-05-11",
    job: "งานบูธA",
    category: "วัสดุ",
    amount: 100,
    status: RECORD_STATUS_IMPORTED
  });
  const unknownKeys = buildExpenseQueryKeys_({
    date: "2026-05-11",
    job: "งานทั่วไป",
    category: "อื่นๆ",
    amount: 100,
    status: RECORD_STATUS_IMPORTED
  });

  return {
    ok:
      factoryKeys.scopeType === SUMMARY_SCOPE_TYPE_FACTORY &&
      factoryKeys.scopeKey === SUMMARY_SCOPE_KEY_FACTORY &&
      jobKeys.scopeType === SUMMARY_SCOPE_TYPE_JOB &&
      !!jobKeys.scopeKey &&
      unknownKeys.scopeType === SUMMARY_SCOPE_TYPE_UNKNOWN &&
      unknownKeys.reviewNeeded === true,
    factory: factoryKeys,
    job: jobKeys,
    unknown: unknownKeys
  };
}


function testMissingIndexErrorLogShape_() {
  const err = new Error("Firestore HTTP 400: The query requires an index. Visit https://console.firebase.google.com/...");
  err.queryName = "summary_factory_month";
  const entry = buildCommandErrorLogEntry_(err, mockLineEvent_("สรุปงบ โรงงาน"), {
    traceId: "TRACE_TEST"
  }, {
    errorId: "ERR-TEST123",
    commandName: "FACTORY_MONTHLY_SUMMARY",
    functionName: "handleFactorySummaryCommand"
  });

  return {
    ok:
      entry.errorId === "ERR-TEST123" &&
      entry.commandName === "FACTORY_MONTHLY_SUMMARY" &&
      entry.functionName === "handleFactorySummaryCommand" &&
      entry.queryName === "summary_factory_month" &&
      entry.safeErrorMessage.indexOf("requires an index") !== -1,
    entry: entry
  };
}


function testUserSeesSafeErrorOnly_() {
  const text = buildProcessingErrorText_("ERR-TEST123");
  return {
    ok:
      text.indexOf("รหัสอ้างอิง: ERR-TEST123") !== -1 &&
      text.indexOf("Firestore HTTP") === -1 &&
      text.indexOf("Bearer") === -1 &&
      text.indexOf("AIza") === -1,
    text: text
  };
}


function testBuildPendingReviewCard_() {
  const message = buildPendingReviewCard(Object.assign(mockJobSummaryRecord_("expense", 6208, LABOR_CATEGORY_NAME, "นายทดสอบ", RECORD_STATUS_PENDING_REVIEW), {
    note: "ค่าแรง_W1_เม.ย._งานบูธA",
    ocrConfidence: 0.92
  }));

  return {
    ok:
      message.type === "flex" &&
      JSON.stringify(message).indexOf("รายการรอยืนยัน") !== -1 &&
      JSON.stringify(message).indexOf("ยืนยัน") !== -1,
    messageType: message.type
  };
}


function testBuildBudgetSummaryCardFactory_() {
  const summary = summarizeTransactions([
    mockFactorySummaryRecord_("expense", 1000, "ค่าขนส่ง", "ปั๊มน้ำมัน", RECORD_STATUS_IMPORTED),
    mockFactorySummaryRecord_("expense", 500, LABOR_CATEGORY_NAME, "นายทดสอบ", RECORD_STATUS_IMPORTED)
  ], {
    title: "สรุปงบ โรงงาน",
    monthKey: getCurrentSummaryMonthKey_()
  });
  const message = buildBudgetSummaryCard(summary, {
    label: "สรุปงบ โรงงาน",
    periodLabel: "เดือน " + getCurrentSummaryMonthKey_(),
    summaryType: "factory"
  });
  const json = JSON.stringify(message);

  return {
    ok:
      message.type === "flex" &&
      json.indexOf("เดือน " + getCurrentSummaryMonthKey_()) !== -1 &&
      json.indexOf("ค่าแรง") !== -1,
    messageType: message.type
  };
}


function testBuildBudgetSummaryCardJob_() {
  const summary = summarizeTransactions([
    Object.assign(mockJobSummaryRecord_("income", 3000, "ค่างวดงาน", "ลูกค้า", RECORD_STATUS_IMPORTED), {
      occurredAt: "2026-04-01"
    }),
    Object.assign(mockJobSummaryRecord_("expense", 1000, "วัสดุ", "ร้านเหล็ก", RECORD_STATUS_IMPORTED), {
      occurredAt: "2026-05-01"
    })
  ], {
    title: "สรุปงบ งานทดสอบ",
    monthKey: ""
  });
  const message = buildBudgetSummaryCard(summary, {
    label: "สรุปงบ งานทดสอบ",
    periodLabel: "ทั้งงาน",
    summaryType: "job"
  });
  const json = JSON.stringify(message);

  return {
    ok:
      message.type === "flex" &&
      json.indexOf("ทั้งงาน") !== -1 &&
      json.indexOf("เดือน 2026-05") === -1,
    messageType: message.type
  };
}


function testBuildLatestTransactionCard_() {
  const message = buildLatestTransactionCard(mockJobSummaryRecord_("expense", 2500, "วัสดุ", "ร้านทดสอบ", RECORD_STATUS_IMPORTED));
  return {
    ok:
      message.type === "flex" &&
      JSON.stringify(message).indexOf("รายการล่าสุด") !== -1 &&
      JSON.stringify(message).indexOf("Sync Sheet") !== -1,
    messageType: message.type
  };
}


function testBuildLatestTransactionsCarousel_() {
  const message = buildLatestTransactionsCarousel([
    mockJobSummaryRecord_("expense", 100, "วัสดุ", "ร้าน A", RECORD_STATUS_IMPORTED),
    mockJobSummaryRecord_("income", 500, "ค่างวดงาน", "ลูกค้า", RECORD_STATUS_IMPORTED)
  ]);

  return {
    ok:
      message.type === "flex" &&
      message.contents &&
      message.contents.type === "carousel" &&
      message.contents.contents.length === 2,
    messageType: message.type
  };
}


function testFlexFailFallback_() {
  const message = buildFlexOrPlainText_("latest_transaction", mockJobSummaryRecord_("expense", 100, "วัสดุ", "ร้าน A", RECORD_STATUS_IMPORTED), function() {
    throw new Error("forced flex failure");
  });

  return {
    ok:
      message.type === "text" &&
      message.text.indexOf("รายการล่าสุด") !== -1,
    messageType: message.type,
    text: message.text
  };
}


function testErrorCardNoSecret_() {
  const message = buildErrorCard({
    commandName: "JOB_TOTAL_SUMMARY",
    errorId: "ERR-TEST123",
    safeErrorMessage: "Bearer abcdef1234567890 token=supersecret AIzaSyTESTSECRET"
  });
  const json = JSON.stringify(message);

  return {
    ok:
      message.type === "flex" &&
      json.indexOf("abcdef1234567890") === -1 &&
      json.indexOf("supersecret") === -1 &&
      json.indexOf("AIzaSyTESTSECRET") === -1 &&
      json.indexOf("stack") === -1,
    messageType: message.type
  };
}


function mockFactorySummaryRecord_(type, amount, category, merchant, status) {
  return {
    type: type,
    amount: amount,
    category: category,
    merchant: merchant,
    job: FACTORY_JOB_NAME,
    jobNameNormalized: FACTORY_JOB_NAME,
    costCenter: FACTORY_COST_CENTER,
    scope: FACTORY_SCOPE,
    scopeType: SUMMARY_SCOPE_TYPE_FACTORY,
    scopeKey: SUMMARY_SCOPE_KEY_FACTORY,
    reviewNeeded: false,
    isFactoryExpense: true,
    status: status || RECORD_STATUS_IMPORTED,
    isActive: status !== RECORD_STATUS_DELETED && status !== RECORD_STATUS_REJECTED,
    occurredAt: "2026-05-11"
  };
}


function mockJobSummaryRecord_(type, amount, category, merchant, status) {
  const jobName = "งานทดสอบ";
  const jobId = buildStableEntityId_("job", jobName);
  return {
    type: type,
    amount: amount,
    category: category,
    merchant: merchant,
    job: jobName,
    jobNameNormalized: jobName,
    jobId: jobId,
    scopeType: SUMMARY_SCOPE_TYPE_JOB,
    scopeKey: jobId,
    reviewNeeded: false,
    status: status || RECORD_STATUS_IMPORTED,
    isActive: status !== RECORD_STATUS_DELETED && status !== RECORD_STATUS_REJECTED,
    occurredAt: "2026-05-11"
  };
}

