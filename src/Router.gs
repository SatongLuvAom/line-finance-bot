/**
 * Router.gs
 * Routes LINE webhook events to command and message handlers.
 */

function routeLineEvent_(event, context) {
  try {
    if (!event || !event.replyToken) {
      logInfo_("routeLineEvent.skip.noReplyToken", event || {});
      return;
    }

    if (!checkAllowedUser_(event)) {
      logInfo_("routeLineEvent.blockedUser", {
        traceId: context && context.traceId || "",
        source: event.source || {}
      });
      replyText(event.replyToken, "บัญชีนี้ยังไม่ได้รับอนุญาตให้ใช้บอทครับ");
      return;
    }

    if (event.type === "postback") {
      routePostback_(event, context || {});
      return;
    }

    if (event.type !== "message" || !event.message) {
      logInfo_("routeLineEvent.skip.notMessage", { type: event.type });
      return;
    }

    const msgType = event.message.type;
    logInfo_("routeLineEvent.messageType", {
      traceId: context && context.traceId || "",
      msgType: msgType
    });

    if (msgType === "text") {
      routeTextCommand_(event, String(event.message.text || "").trim(), context || {});
      return;
    }

    if (msgType === "image") {
      routeImageMessage_(event, context || {});
      return;
    }

    if (msgType === "file") {
      routeFileMessage_(event, context || {});
      return;
    }

    replyText(event.replyToken, "รองรับเฉพาะข้อความ รูปภาพ และไฟล์ PDF ครับ");
  } catch (err) {
    handleLineEventError_(err, event, context || {}, {});
  }
}

function processLineEvent(event) {
  return routeLineEvent_(event, {});
}

function routeTextCommand_(event, text, context) {
  return handleTextMessage(event, context || {});
}

function routeImageMessage_(event, context) {
  return enqueueReceiptMessage_(event, context || {});
}

function routeFileMessage_(event, context) {
  return enqueueReceiptMessage_(event, context || {});
}

function routePostback_(event, context) {
  logInfo_("routePostback.skip", {
    traceId: context && context.traceId || "",
    postback: event && event.postback || {}
  });
}

function isCommandMatched_(text, pattern) {
  if (pattern instanceof RegExp) {
    return pattern.test(String(text || ""));
  }
  return String(text || "").trim().toLowerCase() === String(pattern || "").trim().toLowerCase();
}

