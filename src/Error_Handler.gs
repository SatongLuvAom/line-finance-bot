/**
 * Error_Handler.gs
 * Centralized logging and safe user-facing error replies.
 */

function safeReplyError(replyToken, message) {
  try {
    if (!replyToken) return;
    replyText(replyToken, `เกิดข้อผิดพลาด\n${buildUserFriendlyErrorMessage_(message)}`);
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
    .replace(/key=([^\s&]+)/g, "key=****")
    .slice(0, 900);
}

function logInfo_(title, content) {
  return logInfo(title, content);
}

function logError_(title, err) {
  return logError(title, err);
}


