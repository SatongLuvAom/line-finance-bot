/**
 * Storage_Repository.gs
 * Firebase Storage upload, download URL, and deletion helpers.
 */

function uploadReceiptAttachmentToFirebase_(fileData, meta) {
  if (!fileData || !fileData.bytes || !fileData.bytes.length) {
    return null;
  }

  const config = getConfig();
  const bucketCandidates = getFirebaseStorageBucketCandidates_(config);
  if (!bucketCandidates.length) {
    logInfo("uploadReceiptAttachmentToFirebase.skip.noBucket", {});
    return null;
  }

  const objectName = buildReceiptAttachmentPath_(fileData, meta);
  let lastError = null;

  for (const bucket of bucketCandidates) {
    try {
      uploadReceiptAttachmentToBucket_(bucket, objectName, fileData);
      const downloadToken = Utilities.getUuid();
      setFirebaseDownloadToken_(bucket, objectName, downloadToken);

      return {
        bucket: bucket,
        path: objectName,
        mimeType: String(fileData.mimeType || ""),
        url: buildFirebaseDownloadUrl_(bucket, objectName, downloadToken)
      };
    } catch (err) {
      lastError = err;
      logError("uploadReceiptAttachmentToFirebase.bucketError", `${bucket}: ${err.message}`);
    }
  }

  throw new Error(
    "อัปโหลดไฟล์ต้นฉบับไป Firebase ไม่สำเร็จ: " +
    (lastError ? lastError.message : "ไม่ทราบสาเหตุ")
  );
}


function buildReceiptAttachmentPath_(fileData, meta) {
  const sourceMessageId = String(meta && meta.sourceMessageId || Utilities.getUuid()).trim();
  const dateText = String(meta && meta.date || formatDateToYMD(new Date())).trim();
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? dateText : formatDateToYMD(new Date());
  const year = safeDate.slice(0, 4);
  const month = safeDate.slice(5, 7);
  const extension = String(fileData && fileData.fileExtension || "jpg").trim().toLowerCase();
  return `receipts/${year}/${month}/${sourceMessageId}.${extension}`;
}


function uploadReceiptAttachmentToBucket_(bucket, objectName, fileData) {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    muteHttpExceptions: true,
    contentType: String(fileData.mimeType || "application/octet-stream"),
    headers: {
      Authorization: `Bearer ${ScriptApp.getOAuthToken()}`
    },
    payload: fileData.bytes
  });

  const statusCode = res.getResponseCode();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Storage upload HTTP ${statusCode}: ${res.getContentText()}`);
  }
}


function setFirebaseDownloadToken_(bucket, objectName, token) {
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`;
  const res = UrlFetchApp.fetch(url, {
    method: "patch",
    contentType: "application/json",
    muteHttpExceptions: true,
    headers: {
      Authorization: `Bearer ${ScriptApp.getOAuthToken()}`
    },
    payload: JSON.stringify({
      metadata: {
        firebaseStorageDownloadTokens: token
      }
    })
  });

  const statusCode = res.getResponseCode();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Storage metadata HTTP ${statusCode}: ${res.getContentText()}`);
  }
}


function buildFirebaseDownloadUrl_(bucket, objectName, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}?alt=media&token=${encodeURIComponent(token)}`;
}


function deleteReceiptAttachmentFromFirebase_(attachmentPath) {
  const objectName = String(attachmentPath || "").trim();
  if (!objectName) {
    return false;
  }

  const config = getConfig();
  const bucketCandidates = getFirebaseStorageBucketCandidates_(config);
  let deleted = false;

  bucketCandidates.forEach(function(bucket) {
    try {
      const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`;
      const res = UrlFetchApp.fetch(url, {
        method: "delete",
        muteHttpExceptions: true,
        headers: {
          Authorization: `Bearer ${ScriptApp.getOAuthToken()}`
        }
      });
      const statusCode = res.getResponseCode();
      if (statusCode >= 200 && statusCode < 300) {
        deleted = true;
      }
    } catch (err) {
      logError("deleteReceiptAttachmentFromFirebase_.error", `${bucket}: ${err.message}`);
    }
  });

  return deleted;
}



