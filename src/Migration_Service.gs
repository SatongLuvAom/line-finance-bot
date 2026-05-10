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

