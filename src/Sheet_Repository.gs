/**
 * Sheet_Repository.gs
 * Google Sheets persistence helpers.
 */

function saveToSheet(record) {
  try {
    const config = getConfig();
    const ss = SpreadsheetApp.openById(config.sheetId);
    let sheet = ss.getSheetByName("Expenses");

    if (!sheet) {
      sheet = ss.insertSheet("Expenses");
    }

    ensureExpenseSheetHeader_(sheet);
    sheet.appendRow(buildExpenseSheetRow_(record));
  } catch (err) {
    throw new Error("บันทึก Google Sheet ไม่สำเร็จ: " + err.message);
  }
}


function saveExpenseToSheetSafely_(record, firestoreDocumentName) {
  const sheetRecord = Object.assign({}, record || {}, {
    sheetSyncStatus: "ok",
    sheetSyncError: ""
  });

  try {
    saveToSheet(sheetRecord);
  } catch (err) {
    const message = err && err.message ? err.message : String(err || "");
    logError("saveExpenseToSheetSafely_.error", err);

    try {
      markExpenseSheetSyncStatus_(firestoreDocumentName, "error", message);
    } catch (markErr) {
      logError("saveExpenseToSheetSafely_.markStatus.error", markErr);
    }

    return {
      ok: false,
      errorMessage: message
    };
  }

  try {
    markExpenseSheetSyncStatus_(firestoreDocumentName, "ok", "");
  } catch (markErr) {
    logError("saveExpenseToSheetSafely_.markStatus.error", markErr);
  }

  return {
    ok: true,
    errorMessage: ""
  };
}


function buildExpenseSheetRow_(record) {
  return [
    record.type || "expense",
    record.date,
    record.merchant,
    record.category,
    record.job,
    record.amount,
    record.items,
    record.note,
    record.laborWeek,
    record.laborMonth,
    record.attachmentUrl || "",
    record.attachmentPath || "",
    record.attachmentMimeType || "",
    record.source || RECORD_SOURCE_LINE_BOT,
    record.status || RECORD_STATUS_IMPORTED,
    record.createdByLineUserId || "",
    record.createdByDisplayName || "",
    record.createdFromLineMessageId || record.sourceMessageId || "",
    record.storageUrl || record.attachmentUrl || "",
    record.storagePath || record.attachmentPath || "",
    truncateText_(record.ocrRawText || "", 5000),
    normalizeOcrConfidenceValue_(record.ocrConfidence),
    record.duplicateStatus || DUPLICATE_STATUS_UNIQUE,
    normalizePossibleDuplicateIds_(record.possibleDuplicateIds).join(","),
    record.sheetSyncStatus || "",
    record.sheetSyncError || "",
    record.parsedAt || "",
    record.normalizedAt || ""
  ];
}


function ensureExpenseSheetHeader_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), EXPENSE_SHEET_HEADERS.length);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, EXPENSE_SHEET_HEADERS.length).setValues([EXPENSE_SHEET_HEADERS]);
    return;
  }

  const currentHeaders = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(function(value) {
      return String(value || "").trim();
    });

  let headerChanged = false;
  EXPENSE_SHEET_HEADERS.forEach(function(header, index) {
    if (currentHeaders[index] !== header) {
      currentHeaders[index] = header;
      headerChanged = true;
    }
  });

  if (headerChanged) {
    sheet.getRange(1, 1, 1, EXPENSE_SHEET_HEADERS.length).setValues([
      currentHeaders.slice(0, EXPENSE_SHEET_HEADERS.length)
    ]);
  }
}


function deleteExpenseFromSheet_(record) {
  try {
    const config = getConfig();
    const ss = SpreadsheetApp.openById(config.sheetId);
    const sheet = ss.getSheetByName("Expenses");
    if (!sheet || sheet.getLastRow() < 2) {
      return false;
    }

    ensureExpenseSheetHeader_(sheet);
    const lastRow = sheet.getLastRow();
    const lastColumn = Math.max(sheet.getLastColumn(), EXPENSE_SHEET_HEADERS.length);
    const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();

    for (let index = values.length - 1; index >= 0; index--) {
      if (doesSheetRowMatchRecord_(values[index], record)) {
        sheet.deleteRow(index + 2);
        return true;
      }
    }

    return false;
  } catch (err) {
    logError("deleteExpenseFromSheet_.error", err);
    return false;
  }
}


function updateExpenseInSheet_(oldRecord, newRecord) {
  try {
    const config = getConfig();
    const ss = SpreadsheetApp.openById(config.sheetId);
    const sheet = ss.getSheetByName("Expenses");
    if (!sheet || sheet.getLastRow() < 2) {
      return false;
    }

    ensureExpenseSheetHeader_(sheet);
    const lastRow = sheet.getLastRow();
    const lastColumn = Math.max(sheet.getLastColumn(), EXPENSE_SHEET_HEADERS.length);
    const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();

    for (let index = values.length - 1; index >= 0; index--) {
      if (doesSheetRowMatchRecord_(values[index], oldRecord)) {
        sheet.getRange(index + 2, 1, 1, EXPENSE_SHEET_HEADERS.length)
          .setValues([buildExpenseSheetRow_(newRecord)]);
        return true;
      }
    }

    return false;
  } catch (err) {
    logError("updateExpenseInSheet_.error", err);
    return false;
  }
}


function doesSheetRowMatchRecord_(row, record) {
  const amount = Number(row[5] || 0);
  return (
    normalizeComparableText_(row[0]) === normalizeComparableText_(record.type || "expense") &&
    String(row[1] || "") === String(record.date || "") &&
    normalizeComparableText_(row[2]) === normalizeComparableText_(record.merchant) &&
    normalizeComparableText_(row[3]) === normalizeComparableText_(record.category) &&
    normalizeComparableText_(row[4]) === normalizeComparableText_(record.job) &&
    Math.abs(amount - Number(record.amount || 0)) < 0.01 &&
    normalizeComparableText_(row[6]) === normalizeComparableText_(record.items) &&
    normalizeComparableText_(row[7]) === normalizeComparableText_(record.note)
  );
}



