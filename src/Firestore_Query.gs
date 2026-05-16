/**
 * Firestore_Query.gs
 * Indexed Firestore query wrapper and transaction query-key helpers.
 */

function queryExpenses(options) {
  const safeOptions = options || {};
  const queryName = String(safeOptions.queryName || "expenses.query").trim();
  const filters = normalizeQueryFilters_(safeOptions.filters || []);
  const limit = Math.max(1, Math.min(Number(safeOptions.limit || 100), 1000));
  const startedAt = Date.now();

  const structuredQuery = {
    from: [
      { collectionId: "expenses" }
    ],
    limit: limit
  };

  const where = buildCompositeFilter(filters);
  if (where) {
    structuredQuery.where = where;
  }

  const orderBy = buildOrderBy(safeOptions.orderBy || []);
  if (orderBy.length) {
    structuredQuery.orderBy = orderBy;
  }

  const selectFields = normalizeSelectFields_(safeOptions.selectFields || getExpenseLightSelectFields_());
  if (selectFields.length) {
    structuredQuery.select = {
      fields: selectFields.map(function(fieldPath) {
        return { fieldPath: fieldPath };
      })
    };
  }

  let documents = [];
  try {
    documents = firestoreRunQuery(structuredQuery);
    logFirestoreQuery_(queryName, filters, limit, documents.length, Date.now() - startedAt);
    return documents;
  } catch (err) {
    annotateFirestoreQueryError_(err, queryName, filters, limit);
    logFirestoreQuery_(queryName, filters, limit, documents.length, Date.now() - startedAt, err);
    throw err;
  }
}


function buildCompositeFilter(filters) {
  const safeFilters = normalizeQueryFilters_(filters || []);
  if (!safeFilters.length) {
    return null;
  }

  if (safeFilters.length === 1) {
    return {
      fieldFilter: buildFieldFilter_(safeFilters[0])
    };
  }

  return {
    compositeFilter: {
      op: "AND",
      filters: safeFilters.map(function(filter) {
        return {
          fieldFilter: buildFieldFilter_(filter)
        };
      })
    }
  };
}


function buildOrderBy(orderBy) {
  const safeOrder = Array.isArray(orderBy)
    ? orderBy
    : (orderBy ? [orderBy] : []);

  return safeOrder.map(function(item) {
    if (typeof item === "string") {
      return {
        field: { fieldPath: item },
        direction: "ASCENDING"
      };
    }

    return {
      field: { fieldPath: String(item && item.field || item && item.fieldPath || "").trim() },
      direction: String(item && item.direction || "ASCENDING").toUpperCase() === "DESCENDING"
        ? "DESCENDING"
        : "ASCENDING"
    };
  }).filter(function(item) {
    return !!(item.field && item.field.fieldPath);
  });
}


function firestoreRunQuery(structuredQuery) {
  const result = firestoreRequest("post", ":runQuery", {
    structuredQuery: structuredQuery
  });

  return (result || []).map(function(row) {
    return row && row.document;
  }).filter(function(doc) {
    return !!(doc && doc.name);
  });
}


function buildFieldFilter_(filter) {
  return {
    field: { fieldPath: String(filter.field || filter.fieldPath || "").trim() },
    op: normalizeFirestoreOperator_(filter.op || filter.operator || "EQUAL"),
    value: buildFirestoreValue_(filter.value)
  };
}


function normalizeFirestoreOperator_(op) {
  const input = String(op || "EQUAL").trim().toUpperCase();
  const aliases = {
    "==": "EQUAL",
    "=": "EQUAL",
    "!=": "NOT_EQUAL",
    ">": "GREATER_THAN",
    ">=": "GREATER_THAN_OR_EQUAL",
    "<": "LESS_THAN",
    "<=": "LESS_THAN_OR_EQUAL"
  };
  return aliases[input] || input;
}


function buildFirestoreValue_(value) {
  if (value && typeof value === "object" && (
    value.stringValue !== undefined ||
    value.integerValue !== undefined ||
    value.doubleValue !== undefined ||
    value.booleanValue !== undefined ||
    value.arrayValue !== undefined ||
    value.nullValue !== undefined
  )) {
    return value;
  }

  if (value === null) {
    return { nullValue: "NULL_VALUE" };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(function(item) {
          return buildFirestoreValue_(item);
        })
      }
    };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: Number(value) };
  }

  return { stringValue: String(value || "") };
}


function normalizeQueryFilters_(filters) {
  const safeFilters = Array.isArray(filters)
    ? filters
    : (filters ? [filters] : []);

  return safeFilters.map(function(filter) {
    return {
      field: String(filter && (filter.field || filter.fieldPath) || "").trim(),
      op: normalizeFirestoreOperator_(filter && (filter.op || filter.operator) || "EQUAL"),
      value: filter ? filter.value : undefined
    };
  }).filter(function(filter) {
    return filter.field && filter.value !== undefined;
  });
}


function normalizeSelectFields_(selectFields) {
  const heavyFields = {
    ocrRawText: true,
    geminiRawResponse: true,
    rawFileData: true,
    storageMetadata: true,
    auditDetails: true
  };
  const map = {};
  const result = [];

  (selectFields || []).forEach(function(fieldPath) {
    const value = String(fieldPath || "").trim();
    if (!value || heavyFields[value] || map[value]) return;
    map[value] = true;
    result.push(value);
  });

  return result;
}


function getExpenseLightSelectFields_() {
  return normalizeSelectFields_(FIRESTORE_EXPENSE_LIST_FIELD_MASKS || []);
}


function logFirestoreQuery_(queryName, filters, limit, resultCount, elapsedMs, err) {
  const payload = {
    queryName: String(queryName || "expenses.query"),
    filters: sanitizeQueryFiltersForLog_(filters),
    limit: Number(limit || 0),
    resultCount: Number(resultCount || 0),
    elapsedMs: Number(elapsedMs || 0)
  };

  if (err) {
    payload.status = "error";
    payload.errorMessage = buildUserFriendlyErrorMessage_(err);
    logInfo("firestore.query.error", payload);
    return;
  }

  payload.status = "ok";
  logInfo("firestore.query", payload);
}


function annotateFirestoreQueryError_(err, queryName, filters, limit) {
  if (!err || typeof err !== "object") return;

  try {
    err.queryName = String(queryName || "expenses.query");
    err.queryFilters = sanitizeQueryFiltersForLog_(filters || []);
    err.queryLimit = Number(limit || 0);
  } catch (annotateErr) {
    logError_("firestore.query.annotate.error", annotateErr);
  }
}


function sanitizeQueryFiltersForLog_(filters) {
  return (filters || []).map(function(filter) {
    return {
      field: String(filter.field || ""),
      op: String(filter.op || "EQUAL"),
      value: truncateText_(String(filter.value), 80)
    };
  });
}


function buildExpenseQueryKeys_(record) {
  const safeRecord = record || {};
  const nowIso = new Date().toISOString();
  const type = String(safeRecord.type || "expense").trim().toLowerCase() === "income"
    ? "income"
    : "expense";
  const status = String(safeRecord.status || RECORD_STATUS_IMPORTED).trim() || RECORD_STATUS_IMPORTED;
  const occurredAt = String(safeRecord.occurredAt || safeRecord.date || safeRecord.createdAt || nowIso).trim();
  const dateKey = normalizeDateKey_(occurredAt) || formatDateToYMD(new Date());
  const monthKey = dateKey.slice(0, 7);
  const weekNumber = normalizeTransactionWeekNumber_(safeRecord, dateKey);
  const category = type === "income"
    ? normalizeIncomeCategory_(safeRecord.category)
    : normalizeCategory(safeRecord.category);
  const merchant = normalizeMerchantAlias_(safeRecord.merchant || "");
  const jobNameNormalized = normalizeJobAlias_(safeRecord.job || "งานทั่วไป") || "งานทั่วไป";
  const isFactoryExpense = isFactoryExpenseRecord_(safeRecord, jobNameNormalized);
  const jobId = buildStableEntityId_("job", jobNameNormalized);
  const projectNameNormalized = normalizeProjectAlias_(extractProjectNameFromJobName_(jobNameNormalized));
  const projectId = buildStableEntityId_("project", projectNameNormalized || jobNameNormalized);
  const projectSearchKeys = buildProjectSearchKeysFromJobName_(jobNameNormalized);
  const summaryScope = buildSummaryScopeKeys_(safeRecord, {
    jobNameNormalized: jobNameNormalized,
    jobId: jobId,
    isFactoryExpense: isFactoryExpense
  });

  return {
    isActive: isTransactionActiveStatus_(status),
    dateKey: dateKey,
    monthKey: monthKey,
    weekKey: `${monthKey}-W${weekNumber}`,
    jobId: jobId,
    jobNameNormalized: jobNameNormalized,
    projectId: projectId,
    projectNameNormalized: projectNameNormalized || jobNameNormalized,
    projectSearchKeys: projectSearchKeys,
    costCenter: isFactoryExpense ? FACTORY_COST_CENTER : "",
    scope: isFactoryExpense ? FACTORY_SCOPE : PROJECT_SCOPE,
    scopeType: summaryScope.scopeType,
    scopeKey: summaryScope.scopeKey,
    reviewNeeded: summaryScope.reviewNeeded || safeRecord.reviewNeeded === true,
    isFactoryExpense: isFactoryExpense,
    factoryReviewNeeded: safeRecord.factoryReviewNeeded === true,
    categoryId: buildStableEntityId_("category", category),
    vendorId: category === LABOR_CATEGORY_NAME ? "" : buildStableEntityId_("vendor", merchant),
    workerId: category === LABOR_CATEGORY_NAME ? buildStableEntityId_("worker", merchant) : "",
    createdAt: String(safeRecord.createdAt || nowIso),
    occurredAt: occurredAt.length === 10 ? dateKey : occurredAt,
    updatedAt: String(safeRecord.updatedAt || nowIso),
    type: type,
    status: status,
    createdByLineUserId: String(safeRecord.createdByLineUserId || "").trim(),
    fingerprint: String(safeRecord.fingerprint || buildTransactionFingerprint_(safeRecord, {
      type: type,
      dateKey: dateKey,
      category: category,
      merchant: merchant,
      jobNameNormalized: jobNameNormalized
    })).trim(),
    duplicateStatus: String(safeRecord.duplicateStatus || DUPLICATE_STATUS_UNIQUE).trim() || DUPLICATE_STATUS_UNIQUE,
    sheetSyncStatus: String(safeRecord.sheetSyncStatus || SHEET_SYNC_STATUS_PENDING).trim() || SHEET_SYNC_STATUS_PENDING
  };
}


function buildSummaryScopeKeys_(record, keys) {
  const safeRecord = record || {};
  const safeKeys = keys || {};
  const explicitType = String(safeRecord.scopeType || "").trim().toUpperCase();
  const explicitKey = String(safeRecord.scopeKey || "").trim();
  const jobNameNormalized = String(safeKeys.jobNameNormalized || normalizeJobAlias_(safeRecord.jobNameNormalized || safeRecord.job || "") || "").trim();
  const jobId = String(safeKeys.jobId || safeRecord.jobId || buildStableEntityId_("job", jobNameNormalized)).trim();

  if (
    explicitType === SUMMARY_SCOPE_TYPE_FACTORY ||
    safeKeys.isFactoryExpense === true ||
    isFactoryExpenseRecord_(safeRecord, jobNameNormalized)
  ) {
    return {
      scopeType: SUMMARY_SCOPE_TYPE_FACTORY,
      scopeKey: SUMMARY_SCOPE_KEY_FACTORY,
      reviewNeeded: false
    };
  }

  if (explicitType === SUMMARY_SCOPE_TYPE_JOB && explicitKey) {
    return {
      scopeType: SUMMARY_SCOPE_TYPE_JOB,
      scopeKey: explicitKey,
      reviewNeeded: false
    };
  }

  if (jobNameNormalized && !isKnownJobScopeName_(jobNameNormalized)) {
    return {
      scopeType: SUMMARY_SCOPE_TYPE_UNKNOWN,
      scopeKey: "",
      reviewNeeded: true
    };
  }

  if (jobId && jobId !== "job_unknown") {
    return {
      scopeType: SUMMARY_SCOPE_TYPE_JOB,
      scopeKey: jobId,
      reviewNeeded: false
    };
  }

  if (isKnownJobScopeName_(jobNameNormalized)) {
    return {
      scopeType: SUMMARY_SCOPE_TYPE_JOB,
      scopeKey: jobId,
      reviewNeeded: false
    };
  }

  return {
    scopeType: SUMMARY_SCOPE_TYPE_UNKNOWN,
    scopeKey: "",
    reviewNeeded: true
  };
}


function isKnownJobScopeName_(jobName) {
  const normalized = normalizeComparableText_(jobName || "");
  if (!normalized) return false;

  const unknownNames = [
    normalizeComparableText_("งานทั่วไป"),
    normalizeComparableText_("ทั่วไป"),
    "unknown",
    "general"
  ];
  return unknownNames.indexOf(normalized) === -1;
}


function normalizeDateKey_(value) {
  const input = String(value || "").trim();
  if (!input) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }

  const normalized = normalizeDateString(input);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}


function normalizeTransactionWeekNumber_(record, dateKey) {
  const explicitWeek = String(record && record.laborWeek || "").trim();
  if (/^[1-5]$/.test(explicitWeek)) {
    return explicitWeek;
  }

  return String(getWeekOfMonth(dateKey));
}


function isTransactionActiveStatus_(status) {
  const value = String(status || "").trim().toUpperCase();
  return value !== RECORD_STATUS_DELETED && value !== RECORD_STATUS_REJECTED;
}


function isFactoryExpenseRecord_(record, normalizedJobName) {
  const safeRecord = record || {};
  const costCenter = String(safeRecord.costCenter || "").trim().toUpperCase();
  const scope = String(safeRecord.scope || "").trim().toUpperCase();
  if (costCenter === FACTORY_COST_CENTER || scope === FACTORY_SCOPE || safeRecord.isFactoryExpense === true) {
    return true;
  }

  const jobName = normalizeJobAlias_(normalizedJobName || safeRecord.job || "");
  return normalizeComparableText_(jobName) === normalizeComparableText_(FACTORY_JOB_NAME);
}


function extractProjectNameFromJobName_(jobName) {
  const input = String(jobName || "").trim();
  if (!input) return "";

  const delimiterParts = input.split(/[_|/\\:]+/).map(function(part) {
    return String(part || "").trim();
  }).filter(Boolean);
  if (delimiterParts.length > 1) {
    return delimiterParts[delimiterParts.length - 1];
  }

  return stripProjectPrefix_(input) || input;
}


function buildProjectSearchKeysFromJobName_(jobName) {
  const input = String(jobName || "").trim();
  if (!input) return [];

  const candidates = [
    input,
    extractProjectNameFromJobName_(input),
    stripProjectPrefix_(input)
  ];

  input.split(/[_|/\\:\-]+/).forEach(function(part) {
    candidates.push(String(part || "").trim());
  });

  input.split(/\s+/).forEach(function(part) {
    const token = String(part || "").trim();
    if (/^[a-z0-9][a-z0-9._-]*$/i.test(token)) {
      candidates.push(token);
    }
  });

  return uniqueStrings_(candidates.map(function(candidate) {
    const normalized = normalizeProjectAlias_(normalizeJobAlias_(candidate || ""));
    return normalized ? buildStableEntityId_("project", normalized) : "";
  })).filter(function(key) {
    return key && key !== "project_unknown";
  });
}


function stripProjectPrefix_(text) {
  return String(text || "")
    .trim()
    .replace(/^(?:งาน|โปรเจกต์|โปรเจค|project)[\s:_\-\/\\]*/i, "")
    .trim();
}


function buildStableEntityId_(prefix, value) {
  const normalized = normalizeComparableText_(value)
    .replace(/[^a-z0-9ก-๙]/gi, "")
    .trim();
  return `${String(prefix || "id").toLowerCase()}_${normalized || "unknown"}`;
}


function buildTransactionFingerprint_(record, keys) {
  const safeRecord = record || {};
  const safeKeys = keys || {};
  const amount = Number(safeRecord.amount || 0).toFixed(2);
  return [
    safeKeys.type || safeRecord.type || "expense",
    safeKeys.dateKey || normalizeDateKey_(safeRecord.date),
    amount,
    normalizeComparableText_(safeKeys.category || safeRecord.category),
    normalizeComparableText_(safeKeys.merchant || safeRecord.merchant),
    normalizeComparableText_(safeKeys.jobNameNormalized || safeRecord.job),
    normalizeComparableText_(safeRecord.items)
  ].join("|");
}


function getLatestTransactionByUser(userId) {
  const records = getLatestTransactionsByUser(userId, 1);
  return records.length ? records[0] : null;
}


function getLatestTransactionsByUser(userId, limit) {
  const targetUserId = String(userId || "").trim();
  if (!targetUserId) return [];

  return queryExpenses({
    queryName: "latest_by_user",
    filters: [
      { field: "isActive", value: true },
      { field: "createdByLineUserId", value: targetUserId }
    ],
    orderBy: [
      { field: "createdAt", direction: "DESCENDING" }
    ],
    limit: Math.max(1, Number(limit || 1)),
    selectFields: getExpenseLightSelectFields_()
  }).map(getFirestoreRecordFromDocument_);
}


function getLatestTransactionDocumentBySourceKey_(sourceKey) {
  const docs = getLatestTransactionDocumentsBySourceKey_(sourceKey, 1);
  return docs.length ? docs[0] : null;
}


function getLatestTransactionDocumentsBySourceKey_(sourceKey, limit) {
  const targetSourceKey = String(sourceKey || "").trim();
  const filters = [
    { field: "isActive", value: true }
  ];

  if (targetSourceKey) {
    filters.push({ field: "sourceKey", value: targetSourceKey });
  }

  return queryExpenses({
    queryName: targetSourceKey ? "latest_by_source" : "latest_global",
    filters: filters,
    orderBy: [
      { field: "createdAt", direction: "DESCENDING" }
    ],
    limit: Math.max(1, Number(limit || 1)),
    selectFields: getExpenseLightSelectFields_()
  });
}


function getTransactionsByMonth(monthKey, options) {
  const safeOptions = options || {};
  const filters = [
    { field: "isActive", value: true },
    { field: "monthKey", value: String(monthKey || "").trim() }
  ];

  (safeOptions.filters || []).forEach(function(filter) {
    filters.push(filter);
  });

  return queryExpenses({
    queryName: safeOptions.queryName || "transactions_by_month",
    filters: filters,
    orderBy: safeOptions.orderBy || [
      { field: "occurredAt", direction: "DESCENDING" }
    ],
    limit: Math.max(1, Number(safeOptions.limit || 1000)),
    selectFields: safeOptions.selectFields || getExpenseLightSelectFields_()
  }).map(getFirestoreRecordFromDocument_);
}


function getSummaryTransactionsByMonth(monthKey, options) {
  const safeOptions = options || {};
  const filters = [
    { field: "isActive", value: true },
    { field: "status", value: RECORD_STATUS_IMPORTED },
    { field: "monthKey", value: String(monthKey || "").trim() }
  ];

  return queryExpenses({
    queryName: safeOptions.queryName || "summary_month",
    filters: filters,
    limit: Math.max(1, Number(safeOptions.limit || 1000)),
    selectFields: safeOptions.selectFields || getExpenseLightSelectFields_()
  }).map(getFirestoreRecordFromDocument_);
}


function getSummaryTransactionsByScope_(scopeType, scopeKey, monthKey, options) {
  const safeOptions = options || {};
  const filters = [
    { field: "isActive", value: true },
    { field: "status", value: RECORD_STATUS_IMPORTED },
    { field: "monthKey", value: String(monthKey || "").trim() },
    { field: "scopeType", value: String(scopeType || "").trim().toUpperCase() },
    { field: "scopeKey", value: String(scopeKey || "").trim() }
  ];

  return queryExpenses({
    queryName: safeOptions.queryName || "summary_by_scope_month",
    filters: filters,
    limit: Math.max(1, Number(safeOptions.limit || 500)),
    selectFields: safeOptions.selectFields || getExpenseLightSelectFields_()
  }).map(getFirestoreRecordFromDocument_);
}


function getSummaryTransactionsByScopeTotal_(scopeType, scopeKey, options) {
  const safeOptions = options || {};
  const filters = [
    { field: "isActive", value: true },
    { field: "status", value: RECORD_STATUS_IMPORTED },
    { field: "scopeType", value: String(scopeType || "").trim().toUpperCase() },
    { field: "scopeKey", value: String(scopeKey || "").trim() }
  ];

  return queryExpenses({
    queryName: safeOptions.queryName || "summary_by_scope_total",
    filters: filters,
    limit: Math.max(1, Number(safeOptions.limit || 1000)),
    selectFields: safeOptions.selectFields || getExpenseLightSelectFields_()
  }).map(getFirestoreRecordFromDocument_);
}


function getFactorySummaryByMonth(monthKey) {
  return getSummaryTransactionsByScope_(
    SUMMARY_SCOPE_TYPE_FACTORY,
    SUMMARY_SCOPE_KEY_FACTORY,
    monthKey,
    {
      queryName: "summary_factory_month",
      limit: 500
    }
  );
}


function getFactoryMonthlySummary(monthKey) {
  return getFactorySummaryByMonth(monthKey);
}


function getJobSummaryByMonth(jobId, monthKey) {
  return getSummaryTransactionsByScope_(
    SUMMARY_SCOPE_TYPE_JOB,
    jobId,
    monthKey,
    {
      queryName: "summary_job_month",
      limit: 500
    }
  );
}


function getJobTotalSummary(jobId) {
  return getSummaryTransactionsByScopeTotal_(
    SUMMARY_SCOPE_TYPE_JOB,
    jobId,
    {
      queryName: "summary_job_total",
      limit: 1000
    }
  );
}


function getJobTotalSummaryByJobId(jobId) {
  return queryExpenses({
    queryName: "summary_job_total_by_job_id",
    filters: [
      { field: "isActive", value: true },
      { field: "status", value: RECORD_STATUS_IMPORTED },
      { field: "jobId", value: String(jobId || "").trim() }
    ],
    limit: 1000,
    selectFields: getExpenseLightSelectFields_()
  }).map(getFirestoreRecordFromDocument_);
}


function getJobTotalSummaryByProjectId(projectId) {
  return queryExpenses({
    queryName: "summary_job_total_by_project_id",
    filters: [
      { field: "isActive", value: true },
      { field: "status", value: RECORD_STATUS_IMPORTED },
      { field: "projectId", value: String(projectId || "").trim() }
    ],
    limit: 1000,
    selectFields: getExpenseLightSelectFields_()
  }).map(getFirestoreRecordFromDocument_);
}


function getJobTotalSummaryByProjectSearchKey(projectKey) {
  return queryExpenses({
    queryName: "summary_job_total_by_project_search_key",
    filters: [
      { field: "isActive", value: true },
      { field: "status", value: RECORD_STATUS_IMPORTED },
      { field: "projectSearchKeys", op: "ARRAY_CONTAINS", value: String(projectKey || "").trim() }
    ],
    limit: 1000,
    selectFields: getExpenseLightSelectFields_()
  }).map(getFirestoreRecordFromDocument_);
}


function getTransactionsByJob(jobId, options) {
  const safeOptions = options || {};
  const filters = [
    { field: "isActive", value: true },
    { field: "jobId", value: String(jobId || "").trim() }
  ];

  if (safeOptions.monthKey) {
    filters.push({ field: "monthKey", value: String(safeOptions.monthKey) });
  }
  (safeOptions.filters || []).forEach(function(filter) {
    filters.push(filter);
  });

  return queryExpenses({
    queryName: safeOptions.queryName || "transactions_by_job",
    filters: filters,
    orderBy: safeOptions.orderBy || [
      { field: "occurredAt", direction: "DESCENDING" }
    ],
    limit: Math.max(1, Number(safeOptions.limit || 1000)),
    selectFields: safeOptions.selectFields || getExpenseLightSelectFields_()
  }).map(getFirestoreRecordFromDocument_);
}


function getFactoryTransactions(options) {
  const safeOptions = options || {};
  const filters = [
    { field: "isActive", value: true },
    { field: "costCenter", value: FACTORY_COST_CENTER },
    { field: "status", value: RECORD_STATUS_IMPORTED }
  ];

  if (safeOptions.monthKey) {
    filters.push({ field: "monthKey", value: String(safeOptions.monthKey) });
  }
  (safeOptions.filters || []).forEach(function(filter) {
    filters.push(filter);
  });

  try {
    return queryExpenses({
      queryName: safeOptions.queryName || "factory_summary",
      filters: filters,
      orderBy: safeOptions.orderBy || [
        { field: "occurredAt", direction: "DESCENDING" }
      ],
      limit: Math.max(1, Number(safeOptions.limit || 1000)),
      selectFields: safeOptions.selectFields || getExpenseLightSelectFields_()
    }).map(getFirestoreRecordFromDocument_);
  } catch (err) {
    if (!/index|requires an index|FAILED_PRECONDITION/i.test(String(err && err.message || err))) {
      throw err;
    }

    logInfo("getFactoryTransactions.indexFallback", {
      queryName: safeOptions.queryName || "factory_summary",
      errorMessage: buildUserFriendlyErrorMessage_(err)
    });

    let fallbackRecords = [];
    try {
      fallbackRecords = queryExpenses({
        queryName: (safeOptions.queryName || "factory_summary") + "_fallback_no_order",
        filters: filters,
        limit: Math.max(1, Number(safeOptions.limit || 1000)),
        selectFields: safeOptions.selectFields || getExpenseLightSelectFields_()
      }).map(getFirestoreRecordFromDocument_);
    } catch (fallbackErr) {
      if (!/index|requires an index|FAILED_PRECONDITION/i.test(String(fallbackErr && fallbackErr.message || fallbackErr))) {
        throw fallbackErr;
      }

      logInfo("getFactoryTransactions.costCenterOnlyFallback", {
        queryName: safeOptions.queryName || "factory_summary",
        errorMessage: buildUserFriendlyErrorMessage_(fallbackErr)
      });
      fallbackRecords = queryExpenses({
        queryName: (safeOptions.queryName || "factory_summary") + "_fallback_cost_center_only",
        filters: [
          { field: "costCenter", value: FACTORY_COST_CENTER }
        ],
        limit: Math.max(1, Number(safeOptions.limit || 1000)),
        selectFields: safeOptions.selectFields || getExpenseLightSelectFields_()
      }).map(getFirestoreRecordFromDocument_);
    }

    return fallbackRecords.sort(function(a, b) {
      const aDate = String(a.occurredAt || a.date || a.createdAt || "");
      const bDate = String(b.occurredAt || b.date || b.createdAt || "");
      return bDate.localeCompare(aDate);
    });
  }
}


function getLaborTransactionsByWeek(weekKey, options) {
  const safeOptions = options || {};
  const filters = [
    { field: "isActive", value: true },
    { field: "status", value: RECORD_STATUS_IMPORTED },
    { field: "categoryId", value: buildStableEntityId_("category", LABOR_CATEGORY_NAME) },
    { field: "weekKey", value: String(weekKey || "").trim() }
  ];

  (safeOptions.filters || []).forEach(function(filter) {
    filters.push(filter);
  });

  return queryExpenses({
    queryName: safeOptions.queryName || "labor_by_week",
    filters: filters,
    orderBy: safeOptions.orderBy || [],
    limit: Math.max(1, Number(safeOptions.limit || 500)),
    selectFields: safeOptions.selectFields || getExpenseLightSelectFields_()
  }).map(getFirestoreRecordFromDocument_);
}


function getSheetSyncErrors(limit) {
  return queryExpenses({
    queryName: "sheet_sync_errors",
    filters: [
      { field: "isActive", value: true },
      { field: "sheetSyncStatus", op: "IN", value: [SHEET_SYNC_STATUS_ERROR, "error"] }
    ],
    orderBy: [
      { field: "updatedAt", direction: "DESCENDING" }
    ],
    limit: Math.max(1, Number(limit || 10)),
    selectFields: getExpenseLightSelectFields_()
  }).map(getFirestoreRecordFromDocument_);
}


function getPossibleDuplicates(limit) {
  return queryExpenses({
    queryName: "possible_duplicates",
    filters: [
      { field: "isActive", value: true },
      { field: "duplicateStatus", value: DUPLICATE_STATUS_POSSIBLE_DUPLICATE }
    ],
    orderBy: [
      { field: "createdAt", direction: "DESCENDING" }
    ],
    limit: Math.max(1, Number(limit || 10)),
    selectFields: getExpenseLightSelectFields_()
  }).map(getFirestoreRecordFromDocument_);
}


function getPendingReviewTransactions_(limit) {
  return queryExpenses({
    queryName: "pending_review_transactions",
    filters: [
      { field: "status", value: RECORD_STATUS_PENDING_REVIEW }
    ],
    orderBy: [],
    limit: Math.max(1, Number(limit || 5)),
    selectFields: getExpenseLightSelectFields_()
  }).map(getFirestoreRecordFromDocument_).filter(function(record) {
    return record.isActive !== false && isTransactionActiveStatus_(record.status);
  });
}


function getTransactionByFileHash_(fileHash) {
  const target = String(fileHash || "").trim();
  if (!target) return null;

  let records = [];
  try {
    records = queryExpenses({
      queryName: "transaction_by_file_hash",
      filters: [
        { field: "fileHash", value: target },
        { field: "isActive", value: true }
      ],
      orderBy: [
        { field: "createdAt", direction: "DESCENDING" }
      ],
      limit: 1,
      selectFields: getExpenseLightSelectFields_()
    }).map(getFirestoreRecordFromDocument_);
  } catch (err) {
    if (!/index|requires an index|FAILED_PRECONDITION/i.test(String(err && err.message || err))) {
      throw err;
    }

    logInfo("getTransactionByFileHash_.indexFallback", {
      errorMessage: buildUserFriendlyErrorMessage_(err)
    });
    records = queryExpenses({
      queryName: "transaction_by_file_hash_fallback_no_order",
      filters: [
        { field: "fileHash", value: target },
        { field: "isActive", value: true }
      ],
      limit: 1,
      selectFields: getExpenseLightSelectFields_()
    }).map(getFirestoreRecordFromDocument_);
  }

  return records.length ? records[0] : null;
}


function getTransactionByFingerprint(fingerprint) {
  const target = String(fingerprint || "").trim();
  if (!target) return null;

  const records = queryExpenses({
    queryName: "transaction_by_fingerprint",
    filters: [
      { field: "fingerprint", value: target }
    ],
    orderBy: [
      { field: "createdAt", direction: "DESCENDING" }
    ],
    limit: 1,
    selectFields: getExpenseLightSelectFields_()
  }).map(getFirestoreRecordFromDocument_);

  return records.length ? records[0] : null;
}


function getDocumentsForDuplicateCheck_(record, sourceMessageId) {
  const safeRecord = record || {};
  const targetDate = normalizeDateKey_(safeRecord.date);
  const targetAmount = Number(safeRecord.amount || 0);
  if (!targetDate || targetAmount <= 0) {
    return [];
  }

  return queryExpenses({
    queryName: "duplicate_check",
    filters: [
      { field: "isActive", value: true },
      { field: "dateKey", value: targetDate },
      { field: "amount", value: { doubleValue: targetAmount } }
    ],
    orderBy: [
      { field: "createdAt", direction: "DESCENDING" }
    ],
    limit: 50,
    selectFields: getExpenseLightSelectFields_()
  });
}


function resolveMonthKeyFromThaiText_(monthText) {
  const input = String(monthText || "").trim();
  const yearMatch = input.match(/(25\d{2}|20\d{2})/);
  let year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
  if (year > 2400) {
    year -= 543;
  }

  const monthName = normalizeThaiMonth_(input.replace(/(25\d{2}|20\d{2})/g, ""));
  const months = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม"
  ];
  const monthIndex = months.indexOf(monthName);
  if (monthIndex === -1) {
    return "";
  }

  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}


function buildWeekKey_(monthKey, week) {
  const safeMonthKey = String(monthKey || "").trim();
  const safeWeek = String(week || "").trim();
  if (!/^\d{4}-\d{2}$/.test(safeMonthKey) || !/^[1-5]$/.test(safeWeek)) {
    return "";
  }

  return `${safeMonthKey}-W${safeWeek}`;
}
