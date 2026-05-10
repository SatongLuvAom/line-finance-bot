/**
 * Security.gs
 * Webhook, configuration, and user permission checks.
 */

function validateWebhookRequest_(e, traceId) {
  const secret = getOptionalProperty_("WEBHOOK_SECRET", "");
  if (!secret) {
    return true;
  }

  const receivedSecret = e && e.parameter ? String(e.parameter.key || "") : "";
  const isValid = receivedSecret === secret;
  if (!isValid) {
    logInfo_("security.webhookSecret.invalid", {
      traceId: traceId || "",
      received: maskSecret_(receivedSecret)
    });
  }
  return isValid;
}

function validateRequiredProperties_() {
  const required = [
    "LINE_TOKEN",
    "GEMINI_KEY",
    "FIREBASE_PROJECT_ID",
    "SHEET_ID"
  ];

  const missing = required.filter(function(key) {
    return !getOptionalProperty_(key, "");
  });

  if (missing.length) {
    throw new Error("Missing required Script Properties: " + missing.join(", "));
  }

  if (!getOptionalProperty_("FIREBASE_STORAGE_BUCKET", "")) {
    logInfo_("security.config.warning", {
      message: "FIREBASE_STORAGE_BUCKET is empty; fallback bucket candidates will be used"
    });
  }

  if (!getOptionalProperty_("ADMIN_LINE_USER_IDS", "")) {
    logInfo_("security.config.warning", {
      message: "ADMIN_LINE_USER_IDS is empty; admin commands are not restricted"
    });
  }
}

function getRequiredProperty_(key) {
  const value = getOptionalProperty_(key, "");
  if (!value) {
    throw new Error("Missing Script Property: " + key);
  }
  return value;
}

function getOptionalProperty_(key, defaultValue) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (value === null || value === undefined || value === "") {
    return defaultValue === undefined ? "" : defaultValue;
  }
  return value;
}

function checkAllowedUser_(event) {
  const allowedRaw = getOptionalProperty_("ALLOWED_LINE_USER_IDS", "");
  const allowed = allowedRaw.split(/[\s,]+/).map(function(item) {
    return item.trim();
  }).filter(Boolean);

  if (!allowed.length) {
    return true;
  }

  const userId = event && event.source ? String(event.source.userId || "") : "";
  return allowed.indexOf(userId) !== -1;
}

function checkAdminUser_(event) {
  const adminRaw = getOptionalProperty_("ADMIN_LINE_USER_IDS", "");
  const admins = adminRaw.split(/[\s,]+/).map(function(item) {
    return item.trim();
  }).filter(Boolean);

  if (!admins.length) {
    logInfo_("security.admin.warning", {
      message: "ADMIN_LINE_USER_IDS is empty; allowing admin command for compatibility"
    });
    return true;
  }

  const userId = event && event.source ? String(event.source.userId || "") : "";
  return admins.indexOf(userId) !== -1;
}

function maskSecret_(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return "****";
  return text.slice(0, 4) + "..." + text.slice(-4);
}

function createRequestTraceId_() {
  return "tr_" + Utilities.getUuid().slice(0, 8) + "_" + Date.now();
}

