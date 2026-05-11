/**
 * Migration_Service.gs
 * Safe one-shot/backfill utilities for production maintenance.
 */

function backfillExpenseQueryKeys(batchSize) {
  const safeBatchSize = Math.min(Math.max(parseInt(batchSize || 100, 10) || 100, 1), 200);
  const props = PropertiesService.getScriptProperties();
  const pageToken = String(props.getProperty("BACKFILL_EXPENSE_QUERY_KEYS_PAGE_TOKEN") || "");
  const startedAt = Date.now();
  const data = firestoreRequest("get", buildBackfillExpenseQueryKeysPath_(safeBatchSize, pageToken));
  const docs = data.documents || [];
  let updated = 0;
  let failed = 0;
  const errors = [];

  docs.forEach(function(doc) {
    try {
      updateExpenseQueryKeys_(doc);
      updated += 1;
    } catch (err) {
      failed += 1;
      errors.push({
        documentName: doc && doc.name || "",
        errorMessage: buildUserFriendlyErrorMessage_(err)
      });
      logError("backfillExpenseQueryKeys.item.error", err);
    }
  });

  if (data.nextPageToken) {
    props.setProperty("BACKFILL_EXPENSE_QUERY_KEYS_PAGE_TOKEN", data.nextPageToken);
  } else {
    props.deleteProperty("BACKFILL_EXPENSE_QUERY_KEYS_PAGE_TOKEN");
  }

  invalidateExpenseDocumentsCache_();
  const result = {
    batchSize: safeBatchSize,
    scanned: docs.length,
    updated: updated,
    failed: failed,
    hasNextPage: !!data.nextPageToken,
    elapsedMs: Date.now() - startedAt,
    errors: errors.slice(0, 10)
  };
  logInfo("backfillExpenseQueryKeys.done", result);
  return result;
}


function buildBackfillExpenseQueryKeysPath_(batchSize, pageToken) {
  const params = [
    `pageSize=${encodeURIComponent(String(batchSize || 100))}`
  ];
  if (pageToken) {
    params.push(`pageToken=${encodeURIComponent(pageToken)}`);
  }

  getExpenseLightSelectFields_().forEach(function(fieldPath) {
    params.push(`mask.fieldPaths=${encodeURIComponent(fieldPath)}`);
  });

  return `expenses?${params.join("&")}`;
}


function updateExpenseQueryKeys_(doc) {
  const relativePath = getFirestoreRelativePath_(doc && doc.name);
  if (!relativePath) {
    throw new Error("ไม่พบ path ของเอกสาร Firestore สำหรับ backfill");
  }

  const record = getFirestoreRecordFromDocument_(doc);
  const nowIso = new Date().toISOString();
  const safeRecord = Object.assign({}, record, {
    createdAt: record.createdAt || nowIso,
    updatedAt: record.updatedAt || nowIso
  });
  const queryKeys = buildExpenseQueryKeys_(safeRecord);
  const fields = {
    isActive: { booleanValue: queryKeys.isActive },
    dateKey: { stringValue: queryKeys.dateKey },
    monthKey: { stringValue: queryKeys.monthKey },
    weekKey: { stringValue: queryKeys.weekKey },
    jobId: { stringValue: queryKeys.jobId },
    jobNameNormalized: { stringValue: queryKeys.jobNameNormalized },
    costCenter: { stringValue: queryKeys.costCenter },
    scope: { stringValue: queryKeys.scope },
    scopeType: { stringValue: queryKeys.scopeType },
    scopeKey: { stringValue: queryKeys.scopeKey },
    reviewNeeded: { booleanValue: queryKeys.reviewNeeded },
    isFactoryExpense: { booleanValue: queryKeys.isFactoryExpense },
    factoryReviewNeeded: { booleanValue: queryKeys.factoryReviewNeeded },
    categoryId: { stringValue: queryKeys.categoryId },
    vendorId: { stringValue: queryKeys.vendorId },
    workerId: { stringValue: queryKeys.workerId },
    occurredAt: { stringValue: queryKeys.occurredAt },
    createdAt: { stringValue: queryKeys.createdAt },
    updatedAt: { stringValue: queryKeys.updatedAt },
    type: { stringValue: queryKeys.type },
    status: { stringValue: queryKeys.status },
    createdByLineUserId: { stringValue: queryKeys.createdByLineUserId },
    fingerprint: { stringValue: queryKeys.fingerprint },
    duplicateStatus: { stringValue: queryKeys.duplicateStatus },
    sheetSyncStatus: { stringValue: queryKeys.sheetSyncStatus }
  };
  const fieldPaths = Object.keys(fields)
    .map(function(fieldName) {
      return `updateMask.fieldPaths=${encodeURIComponent(fieldName)}`;
    })
    .join("&");

  return firestoreRequest("patch", `${relativePath}?${fieldPaths}`, { fields: fields });
}


function resetExpenseQueryKeyBackfillCursor_() {
  PropertiesService.getScriptProperties().deleteProperty("BACKFILL_EXPENSE_QUERY_KEYS_PAGE_TOKEN");
  return "OK";
}


function backfillFactoryExpenseKeys(batchSize) {
  const safeBatchSize = Math.min(Math.max(parseInt(batchSize || 100, 10) || 100, 1), 200);
  const props = PropertiesService.getScriptProperties();
  const pageToken = String(props.getProperty("BACKFILL_FACTORY_EXPENSE_KEYS_PAGE_TOKEN") || "");
  const startedAt = Date.now();
  const data = firestoreRequest("get", buildBackfillExpenseQueryKeysPath_(safeBatchSize, pageToken));
  const docs = data.documents || [];
  let updated = 0;
  let reviewMarked = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  docs.forEach(function(doc) {
    try {
      const result = updateFactoryExpenseKeys_(doc);
      if (result === "updated") updated += 1;
      else if (result === "review") reviewMarked += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      errors.push({
        documentName: doc && doc.name || "",
        errorMessage: buildUserFriendlyErrorMessage_(err)
      });
      logError("backfillFactoryExpenseKeys.item.error", err);
    }
  });

  if (data.nextPageToken) {
    props.setProperty("BACKFILL_FACTORY_EXPENSE_KEYS_PAGE_TOKEN", data.nextPageToken);
  } else {
    props.deleteProperty("BACKFILL_FACTORY_EXPENSE_KEYS_PAGE_TOKEN");
  }

  invalidateExpenseDocumentsCache_();
  const result = {
    batchSize: safeBatchSize,
    scanned: docs.length,
    updated: updated,
    reviewMarked: reviewMarked,
    skipped: skipped,
    failed: failed,
    hasNextPage: !!data.nextPageToken,
    elapsedMs: Date.now() - startedAt,
    errors: errors.slice(0, 10)
  };
  logInfo("backfillFactoryExpenseKeys.done", result);
  return result;
}


function updateFactoryExpenseKeys_(doc) {
  const relativePath = getFirestoreRelativePath_(doc && doc.name);
  if (!relativePath) {
    throw new Error("ไม่พบ path ของเอกสาร Firestore สำหรับ backfill factory");
  }

  const record = getFirestoreRecordFromDocument_(doc);
  const normalizedJob = normalizeJobAlias_(record.jobNameNormalized || record.job || "");
  const exactFactory = normalizeComparableText_(normalizedJob) === normalizeComparableText_(FACTORY_JOB_NAME);
  const alreadyFactory = String(record.costCenter || "").toUpperCase() === FACTORY_COST_CENTER ||
    String(record.scope || "").toUpperCase() === FACTORY_SCOPE ||
    record.isFactoryExpense === true;
  const mentionsFactory = normalizeComparableText_([
    record.job,
    record.jobNameNormalized,
    record.items,
    record.note
  ].join(" ")).indexOf(normalizeComparableText_(FACTORY_JOB_NAME)) !== -1;

  if (!exactFactory && !alreadyFactory && !mentionsFactory) {
    return "skipped";
  }

  const fields = exactFactory || alreadyFactory
    ? {
      costCenter: { stringValue: FACTORY_COST_CENTER },
      scope: { stringValue: FACTORY_SCOPE },
      scopeType: { stringValue: SUMMARY_SCOPE_TYPE_FACTORY },
      scopeKey: { stringValue: SUMMARY_SCOPE_KEY_FACTORY },
      reviewNeeded: { booleanValue: false },
      isFactoryExpense: { booleanValue: true },
      factoryReviewNeeded: { booleanValue: false },
      updatedAt: { stringValue: new Date().toISOString() }
    }
    : {
      scopeType: { stringValue: SUMMARY_SCOPE_TYPE_UNKNOWN },
      scopeKey: { stringValue: "" },
      reviewNeeded: { booleanValue: true },
      factoryReviewNeeded: { booleanValue: true },
      updatedAt: { stringValue: new Date().toISOString() }
    };

  const fieldPaths = Object.keys(fields)
    .map(function(fieldName) {
      return `updateMask.fieldPaths=${encodeURIComponent(fieldName)}`;
    })
    .join("&");

  firestoreRequest("patch", `${relativePath}?${fieldPaths}`, { fields: fields });
  return exactFactory || alreadyFactory ? "updated" : "review";
}


function resetFactoryExpenseKeyBackfillCursor_() {
  PropertiesService.getScriptProperties().deleteProperty("BACKFILL_FACTORY_EXPENSE_KEYS_PAGE_TOKEN");
  return "OK";
}


function backfillSummaryScopeKeys(batchSize) {
  const safeBatchSize = Math.min(Math.max(parseInt(batchSize || 100, 10) || 100, 1), 200);
  const props = PropertiesService.getScriptProperties();
  const pageToken = String(props.getProperty("BACKFILL_SUMMARY_SCOPE_KEYS_PAGE_TOKEN") || "");
  const startedAt = Date.now();
  const data = firestoreRequest("get", buildBackfillExpenseQueryKeysPath_(safeBatchSize, pageToken));
  const docs = data.documents || [];
  let updated = 0;
  let reviewMarked = 0;
  let failed = 0;
  const errors = [];

  docs.forEach(function(doc) {
    try {
      const result = updateSummaryScopeKeys_(doc);
      if (result && result.reviewNeeded) reviewMarked += 1;
      updated += 1;
    } catch (err) {
      failed += 1;
      errors.push({
        documentName: doc && doc.name || "",
        errorMessage: buildUserFriendlyErrorMessage_(err)
      });
      logError("backfillSummaryScopeKeys.item.error", err);
    }
  });

  if (data.nextPageToken) {
    props.setProperty("BACKFILL_SUMMARY_SCOPE_KEYS_PAGE_TOKEN", data.nextPageToken);
  } else {
    props.deleteProperty("BACKFILL_SUMMARY_SCOPE_KEYS_PAGE_TOKEN");
  }

  invalidateExpenseDocumentsCache_();
  const result = {
    batchSize: safeBatchSize,
    scanned: docs.length,
    updated: updated,
    reviewMarked: reviewMarked,
    failed: failed,
    hasNextPage: !!data.nextPageToken,
    elapsedMs: Date.now() - startedAt,
    errors: errors.slice(0, 10)
  };
  logInfo("backfillSummaryScopeKeys.done", result);
  return result;
}


function updateSummaryScopeKeys_(doc) {
  const relativePath = getFirestoreRelativePath_(doc && doc.name);
  if (!relativePath) {
    throw new Error("ไม่พบ path ของเอกสาร Firestore สำหรับ backfill summary scope");
  }

  const record = getFirestoreRecordFromDocument_(doc);
  const queryKeys = buildExpenseQueryKeys_(record);
  const fields = {
    isActive: { booleanValue: queryKeys.isActive },
    status: { stringValue: queryKeys.status },
    monthKey: { stringValue: queryKeys.monthKey },
    scopeType: { stringValue: queryKeys.scopeType },
    scopeKey: { stringValue: queryKeys.scopeKey },
    reviewNeeded: { booleanValue: queryKeys.reviewNeeded },
    jobId: { stringValue: queryKeys.jobId },
    jobNameNormalized: { stringValue: queryKeys.jobNameNormalized },
    costCenter: { stringValue: queryKeys.costCenter },
    updatedAt: { stringValue: new Date().toISOString() }
  };
  const fieldPaths = Object.keys(fields)
    .map(function(fieldName) {
      return `updateMask.fieldPaths=${encodeURIComponent(fieldName)}`;
    })
    .join("&");

  firestoreRequest("patch", `${relativePath}?${fieldPaths}`, { fields: fields });
  return {
    scopeType: queryKeys.scopeType,
    scopeKey: queryKeys.scopeKey,
    reviewNeeded: queryKeys.reviewNeeded
  };
}


function resetSummaryScopeKeyBackfillCursor_() {
  PropertiesService.getScriptProperties().deleteProperty("BACKFILL_SUMMARY_SCOPE_KEYS_PAGE_TOKEN");
  return "OK";
}
