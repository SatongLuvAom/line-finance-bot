/**
 * Summary_Service.gs
 * Project, budget, category, and active-job summaries.
 */

function getProjectSummary(jobQuery) {
  return handleJobSummaryCommand(jobQuery, {});
}


function isFactorySummaryQuery_(jobQuery) {
  return normalizeComparableText_(normalizeJobAlias_(jobQuery || "")) === normalizeComparableText_(FACTORY_JOB_NAME);
}


function parseBudgetSummaryCommand_(text) {
  const inputText = String(text || "").trim();
  const subjectText = inputText.replace(/^สรุปงบ\s+/i, "").trim();
  const normalizedJobQuery = normalizeJobAlias_(subjectText || inputText);
  if (isFactorySummaryQuery_(normalizedJobQuery)) {
    return {
      commandType: "FACTORY_MONTHLY_SUMMARY",
      inputText: inputText,
      label: FACTORY_JOB_NAME,
      scopeType: SUMMARY_SCOPE_TYPE_FACTORY,
      scopeKey: SUMMARY_SCOPE_KEY_FACTORY,
      jobId: "",
      periodType: "MONTH",
      monthKey: getCurrentSummaryMonthKey_()
    };
  }

  const jobId = buildStableEntityId_("job", normalizedJobQuery);
  return {
    commandType: "JOB_TOTAL_SUMMARY",
    inputText: inputText,
    label: normalizedJobQuery,
    scopeType: SUMMARY_SCOPE_TYPE_JOB,
    scopeKey: jobId,
    jobId: jobId,
    periodType: "ALL",
    monthKey: ""
  };
}


function getFactorySummary_(options) {
  const safeOptions = options || {};
  try {
    const parsedCommand = safeOptions.parsedCommand || parseBudgetSummaryCommand_(FACTORY_JOB_NAME);
    const monthKey = safeOptions.monthKey || parsedCommand.monthKey || getCurrentSummaryMonthKey_();
    const startedAt = Date.now();
    const records = getFactoryMonthlySummary(monthKey);
    logSummaryCommand_(parsedCommand, "summary_factory_month", [
      { field: "isActive", value: true },
      { field: "status", value: RECORD_STATUS_IMPORTED },
      { field: "monthKey", value: monthKey },
      { field: "scopeType", value: SUMMARY_SCOPE_TYPE_FACTORY },
      { field: "scopeKey", value: SUMMARY_SCOPE_KEY_FACTORY }
    ], records.length, Date.now() - startedAt);
    const summary = summarizeTransactions(records, {
      title: safeOptions.title || "สรุปงบ โรงงาน",
      emptyText: "ยังไม่พบรายการค่าใช้จ่ายโรงงานของเดือนนี้",
      monthKey: monthKey
    });

    return buildBudgetSummaryCard(summary, {
      label: safeOptions.title || "สรุปงบ โรงงาน",
      periodLabel: "เดือน " + monthKey,
      summaryType: "factory"
    });
  } catch (err) {
    const errorId = logCommandError_(err, safeOptions.event || null, {
      traceId: safeOptions.traceId || "",
      lineUserId: safeOptions.lineUserId || ""
    }, {
      commandName: "FACTORY_MONTHLY_SUMMARY",
      functionName: "getFactorySummary_",
      queryName: err && err.queryName || "factory_summary"
    });
    return buildErrorCard({
      commandName: "FACTORY_MONTHLY_SUMMARY",
      errorId: errorId,
      safeErrorMessage: "สรุปงบโรงงานไม่สำเร็จ"
    });
  }
}


function handleFactorySummaryCommand(context) {
  const safeContext = context || {};
  const parsedCommand = parseBudgetSummaryCommand_(safeContext.inputText || FACTORY_JOB_NAME);
  return getFactorySummary_({
    event: safeContext.event || null,
    traceId: safeContext.traceId || "",
    lineUserId: safeContext.lineUserId || "",
    monthKey: safeContext.monthKey || parsedCommand.monthKey || getCurrentSummaryMonthKey_(),
    title: "สรุปงบ โรงงาน",
    parsedCommand: parsedCommand
  });
}


function handleJobSummaryCommand(text, context) {
  const safeContext = context || {};
  try {
    const parsedCommand = parseBudgetSummaryCommand_(text);
    if (parsedCommand.commandType === "FACTORY_MONTHLY_SUMMARY") {
      return handleFactorySummaryCommand(Object.assign({}, safeContext, {
        inputText: text,
        parsedCommand: parsedCommand
      }));
    }

    const startedAt = Date.now();
    let queryName = "summary_job_total";
    let records = getJobTotalSummary(parsedCommand.jobId);
    if (!records.length) {
      queryName = "summary_job_total_by_job_id";
      records = getJobTotalSummaryByJobId(parsedCommand.jobId);
    }
    logSummaryCommand_(parsedCommand, queryName, buildJobSummaryLogFilters_(parsedCommand, queryName), records.length, Date.now() - startedAt);
    const summary = summarizeTransactions(records, {
      title: "สรุปงบ " + parsedCommand.label,
      emptyText: "ยังไม่พบรายการของงานนี้",
      monthKey: ""
    });

    return buildBudgetSummaryCard(summary, {
      label: "สรุปงบ " + parsedCommand.label,
      periodLabel: "ทั้งงาน",
      summaryType: "job"
    });
  } catch (err) {
    const errorId = logCommandError_(err, safeContext.event || null, {
      traceId: safeContext.traceId || "",
      lineUserId: safeContext.lineUserId || ""
    }, {
      commandName: "JOB_TOTAL_SUMMARY",
      functionName: "handleJobSummaryCommand",
      queryName: err && err.queryName || "summary_job_total"
    });
    return buildErrorCard({
      commandName: "JOB_TOTAL_SUMMARY",
      errorId: errorId,
      safeErrorMessage: "สรุปงบงานไม่สำเร็จ"
    });
  }
}


function buildJobSummaryLogFilters_(parsedCommand, queryName) {
  const safeParsed = parsedCommand || {};
  if (queryName === "summary_job_total_by_job_id") {
    return [
      { field: "isActive", value: true },
      { field: "status", value: RECORD_STATUS_IMPORTED },
      { field: "jobId", value: safeParsed.jobId || "" }
    ];
  }

  return [
    { field: "isActive", value: true },
    { field: "status", value: RECORD_STATUS_IMPORTED },
    { field: "scopeType", value: SUMMARY_SCOPE_TYPE_JOB },
    { field: "scopeKey", value: safeParsed.scopeKey || "" }
  ];
}


function logSummaryCommand_(parsedCommand, queryName, filters, resultCount, elapsedMs) {
  const safeParsed = parsedCommand || {};
  logInfo("summary.command", {
    commandName: safeParsed.commandType || "",
    inputText: truncateText_(String(safeParsed.inputText || ""), 200),
    parsedCommand: {
      commandType: safeParsed.commandType || "",
      scopeType: safeParsed.scopeType || "",
      scopeKey: safeParsed.scopeKey || "",
      jobId: safeParsed.jobId || "",
      periodType: safeParsed.periodType || "",
      monthKey: safeParsed.monthKey || ""
    },
    queryName: String(queryName || ""),
    filters: sanitizeQueryFiltersForLog_(filters || []),
    resultCount: Number(resultCount || 0),
    elapsedMs: Number(elapsedMs || 0)
  });
}


function buildFactorySummaryFromRecords_(records, options) {
  const safeOptions = options || {};
  return formatBudgetSummary(summarizeTransactions(records, {
    title: safeOptions.title || "สรุปงบ โรงงาน",
    emptyText: "ยังไม่พบรายการค่าใช้จ่ายโรงงานของเดือนนี้",
    monthKey: safeOptions.monthKey || getCurrentSummaryMonthKey_()
  }), safeOptions.title || "สรุปงบ โรงงาน");
}


function summarizeTransactions(transactions, options) {
  const safeOptions = options || {};
  const normalizedRecords = (transactions || [])
    .map(normalizeSummaryTransaction_)
    .filter(function(record) {
      return record.isActive && record.status === RECORD_STATUS_IMPORTED;
    });

  const summary = {
    title: String(safeOptions.title || "สรุปงบ"),
    emptyText: String(safeOptions.emptyText || "ไม่พบรายการในช่วงนี้"),
    monthKey: String(safeOptions.monthKey || ""),
    count: normalizedRecords.length,
    totalIncome: 0,
    totalExpense: 0,
    net: 0,
    categoryMap: {},
    vendorMap: {},
    latestDate: ""
  };

  normalizedRecords.forEach(function(record) {
    const amount = Number(record.amount || 0);
    if (record.type === "income") {
      summary.totalIncome += amount;
    } else {
      summary.totalExpense += amount;
      summary.categoryMap[record.categoryName] = (summary.categoryMap[record.categoryName] || 0) + amount;
    }

    summary.vendorMap[record.vendorName] = (summary.vendorMap[record.vendorName] || 0) + amount;
    if (record.occurredAt > summary.latestDate) {
      summary.latestDate = record.occurredAt;
    }
  });

  summary.net = summary.totalIncome - summary.totalExpense;
  return summary;
}


function formatBudgetSummary(summary, label) {
  const safeSummary = summary || {};
  if (!safeSummary.count) {
    return {
      type: "text",
      text: String(safeSummary.emptyText || "ไม่พบรายการในช่วงนี้")
    };
  }

  const lines = [
    String(label || safeSummary.title || "สรุปงบ"),
    "────────────",
    safeSummary.monthKey ? `เดือน: ${safeSummary.monthKey}` : "",
    `รายการ: ${Number(safeSummary.count || 0)}`,
    `รายรับ: ${formatCurrency_(safeSummary.totalIncome || 0)}`,
    `รายจ่าย: ${formatCurrency_(safeSummary.totalExpense || 0)}`,
    `สุทธิ: ${formatCurrency_(safeSummary.net || 0)}`,
    safeSummary.latestDate ? `รายการล่าสุด: ${safeSummary.latestDate}` : "รายการล่าสุด: ไม่ระบุวันที่",
    "",
    "รายจ่ายแยกหมวด"
  ].filter(function(line) {
    return line !== "";
  });

  const categoryMap = safeSummary.categoryMap || {};
  const categoryKeys = Object.keys(categoryMap).sort(function(a, b) {
    return categoryMap[b] - categoryMap[a];
  });
  if (!categoryKeys.length) {
    lines.push("- ไม่พบรายจ่าย");
  } else {
    categoryKeys.slice(0, 10).forEach(function(category) {
      lines.push(`- ${category}: ${formatCurrency_(categoryMap[category])}`);
    });
  }

  lines.push("");
  lines.push("ร้าน/ผู้รับหลัก");
  const vendorMap = safeSummary.vendorMap || {};
  const vendorKeys = Object.keys(vendorMap).sort(function(a, b) {
    return vendorMap[b] - vendorMap[a];
  });
  if (!vendorKeys.length) {
    lines.push("- ไม่ระบุร้าน");
  }
  vendorKeys.slice(0, 5).forEach(function(vendorName) {
    lines.push(`- ${vendorName}: ${formatCurrency_(vendorMap[vendorName])}`);
  });

  return {
    type: "text",
    text: lines.join("\n")
  };
}


function normalizeSummaryTransaction_(record) {
  const safeRecord = record || {};
  const status = String(safeRecord.status || "").trim() || RECORD_STATUS_PENDING_REVIEW;
  const occurredAt = String(
    safeRecord.occurredAt ||
    safeRecord.date ||
    safeRecord.createdAt ||
    "ไม่ระบุวันที่"
  ).trim() || "ไม่ระบุวันที่";
  const rawType = String(safeRecord.type || "UNKNOWN").trim().toLowerCase();

  return {
    amount: Number(safeRecord.amount || 0),
    type: rawType === "income" ? "income" : (rawType === "expense" ? "expense" : "UNKNOWN"),
    categoryName: String(safeRecord.categoryName || safeRecord.category || "ไม่ระบุหมวด").trim() || "ไม่ระบุหมวด",
    vendorName: String(safeRecord.vendorName || safeRecord.merchant || "ไม่ระบุร้าน").trim() || "ไม่ระบุร้าน",
    jobName: String(safeRecord.jobName || safeRecord.jobNameNormalized || safeRecord.job || "ไม่ระบุงาน").trim() || "ไม่ระบุงาน",
    occurredAt: occurredAt,
    note: String(safeRecord.note || "").trim(),
    status: status,
    isActive: safeRecord.isActive !== false && isTransactionActiveStatus_(status),
    scopeType: String(safeRecord.scopeType || "").trim().toUpperCase(),
    scopeKey: String(safeRecord.scopeKey || "").trim()
  };
}


function normalizeFactorySummaryRecord_(record) {
  const normalized = normalizeSummaryTransaction_(record);
  normalized.isFactoryExpense = record && (record.isFactoryExpense === true ||
    String(record.costCenter || "").toUpperCase() === FACTORY_COST_CENTER ||
    String(record.scope || "").toUpperCase() === FACTORY_SCOPE ||
    normalized.scopeType === SUMMARY_SCOPE_TYPE_FACTORY ||
    normalized.scopeKey === SUMMARY_SCOPE_KEY_FACTORY);
  return normalized;
}


function getActiveJobsThisMonthText_() {
  return formatMonthlySummaryText_(getMonthlySummary(getCurrentSummaryMonthKey_()));
}


function getMonthlySummary(monthKey) {
  const safeMonthKey = String(monthKey || getCurrentSummaryMonthKey_()).trim();
  const records = getSummaryTransactionsByMonth(safeMonthKey, {
    queryName: "summary_active_jobs_month",
    limit: 1000
  });
  const grouped = {};

  records.map(normalizeSummaryTransaction_).forEach(function(record) {
    const scopeType = record.scopeType || SUMMARY_SCOPE_TYPE_UNKNOWN;
    const key = record.scopeKey || scopeType + ":UNKNOWN";
    const groupKey = scopeType + ":" + key;
    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        label: getSummaryGroupLabel_(record),
        count: 0,
        income: 0,
        expense: 0,
        latestDate: ""
      };
    }

    grouped[groupKey].count += 1;
    if (record.type === "income") {
      grouped[groupKey].income += record.amount;
    } else {
      grouped[groupKey].expense += record.amount;
    }
    if (record.occurredAt > grouped[groupKey].latestDate) {
      grouped[groupKey].latestDate = record.occurredAt;
    }
  });

  const items = Object.keys(grouped).map(function(key) {
    return grouped[key];
  }).sort(function(a, b) {
    if (b.latestDate !== a.latestDate) {
      return b.latestDate.localeCompare(a.latestDate);
    }
    return (b.income + b.expense) - (a.income + a.expense);
  });

  return {
    monthKey: safeMonthKey,
    items: items
  };
}


function formatMonthlySummaryText_(summary) {
  const safeSummary = summary || {};
  const monthKey = String(safeSummary.monthKey || getCurrentSummaryMonthKey_());
  const items = safeSummary.items || [];

  if (!items.length) {
    return [
      `งานเดือนนี้ ${monthKey}`,
      "────────────",
      "ยังไม่พบงานที่มีรายการในเดือนนี้"
    ].join("\n");
  }

  const lines = [
    `งานเดือนนี้ ${monthKey}`,
    "────────────",
    ""
  ];

  items.slice(0, 20).forEach(function(item, index) {
    const net = Number(item.income || 0) - Number(item.expense || 0);
    lines.push(`${index + 1}. ${item.label || "ไม่ระบุงาน"}`);
    lines.push(`รายการ: ${item.count || 0}`);
    lines.push(`รับ: ${formatCurrency_(item.income || 0)} | จ่าย: ${formatCurrency_(item.expense || 0)}`);
    lines.push(`คงเหลือ: ${formatCurrency_(net)}`);
    lines.push("");
  });

  lines.push("พิมพ์ต่อได้ เช่น:");
  lines.push("สรุปงบ ชื่องาน");
  lines.push("สรุปงบ โรงงาน");
  return lines.join("\n");
}


function getSummaryGroupLabel_(record) {
  if (record.scopeType === SUMMARY_SCOPE_TYPE_FACTORY || record.scopeKey === SUMMARY_SCOPE_KEY_FACTORY) {
    return FACTORY_JOB_NAME;
  }

  if (record.scopeType === SUMMARY_SCOPE_TYPE_JOB && record.jobName) {
    return record.jobName;
  }

  return "รายการรอตรวจสอบ";
}


function getCurrentSummaryMonthKey_() {
  return formatDateToYMD(new Date()).slice(0, 7);
}


function getActiveJobsThisMonthTextLegacy_() {
  const summary = getMonthlySummary(getCurrentSummaryMonthKey_());
  return formatMonthlySummaryText_(summary);
}


function buildSummaryText_(title, total, categoryMap) {
  const lines = [String(title || "สรุปงบ"), "ยอดรวม " + formatCurrency_(total || 0), ""];
  Object.keys(categoryMap || {}).forEach(function(category) {
    lines.push("- " + category + ": " + formatCurrency_(categoryMap[category]));
  });
  return lines.join("\n");
}

function buildSummaryFlexData_(title, total, categoryMap) {
  return { title: title, total: total, categoryMap: categoryMap || {} };
}


/*
 * Deprecated summary helpers kept below for compatibility with old Apps Script
 * executions that may still call them directly.
 */
function getCategorySummary_(records) {
  const map = {};
  (records || []).forEach(function(record) {
    const normalized = normalizeSummaryTransaction_(record);
    map[normalized.categoryName] = (map[normalized.categoryName] || 0) + normalized.amount;
  });
  return map;
}


function getMonthlySummary_(dateString) {
  return formatMonthlySummaryText_(getMonthlySummary(String(dateString || "").slice(0, 7) || getCurrentSummaryMonthKey_()));
}


function checkBudgetAlert(jobName, latestRecord) {
  try {
    const latestAmount = Number(latestRecord && latestRecord.amount || 0);
    const latestType = String(latestRecord && latestRecord.type || "expense");
    if (!jobName || latestType === "income" || latestAmount <= 0) {
      return null;
    }

    const normalizedJobName = normalizeJobAlias_(jobName);
    const jobId = buildStableEntityId_("job", normalizedJobName);
    const records = getTransactionsByJob(jobId, {
      queryName: "budget_alert_job_total",
      orderBy: [],
      limit: 1000
    });
    let total = 0;

    records.forEach(function(record) {
      const recordType = String(record.type || "expense");
      if (recordType !== "income") {
        total += Number(record.amount || 0);
      }
    });

    const previousTotal = Math.max(0, total - latestAmount);
    const previousThresholdLevel = getBudgetThresholdLevel_(previousTotal);
    const currentThresholdLevel = getBudgetThresholdLevel_(total);

    if (currentThresholdLevel > previousThresholdLevel) {
      const thresholdAmount = currentThresholdLevel * 100000;
      return {
        type: "text",
        text: [
          `แจ้งเตือน: โปรเจกต์ ${normalizedJobName} ใช้งบสะสมเกิน ฿${thresholdAmount.toLocaleString()} แล้ว`,
          `ยอดสะสมล่าสุด ฿${total.toLocaleString()}`
        ].join("\n")
      };
    }

    return null;
  } catch (err) {
    logError("checkBudgetAlert.error", err);
    return null;
  }
}

function getBudgetThresholdLevel_(amount) {
  return Math.floor(Number(amount || 0) / 100000);
}




