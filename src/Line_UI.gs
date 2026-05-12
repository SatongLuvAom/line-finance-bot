/**
 * Line_UI.gs
 * LINE Messaging API send helpers and quick reply builders.
 */

function replyText(replyToken, text, quickReplyTexts) {
  const safeQuickReplyTexts = quickReplyTexts || buildDefaultQuickReplyTexts_();
  const quickReply = buildQuickReplyFromTexts_(safeQuickReplyTexts);
  const message = {
    type: "text",
    text: String(text).slice(0, 4500)
  };

  if (quickReply) {
    message.quickReply = quickReply;
  }

  return sendLineMessages(replyToken, [
    message
  ]);
}


function sendLineMessages(replyToken, messages) {
  try {
    const config = getConfig();
    const url = "https://api.line.me/v2/bot/message/reply";
    const payload = {
      replyToken: replyToken,
      messages: messages
    };

    const res = safeUrlFetch(url, {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: `Bearer ${config.lineToken}`
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }, {
      service: "line",
      action: "reply",
      method: "post"
    });

    const statusCode = res.getResponseCode();
    const bodyText = res.getContentText();

    logInfo("sendLineMessages.response", {
      statusCode: statusCode,
      body: bodyText
    });

    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`LINE Reply HTTP ${statusCode}: ${bodyText}`);
    }

    return true;
  } catch (err) {
    throw new Error("ส่งข้อความ LINE ไม่สำเร็จ: " + err.message);
  }
}

function sendLinePushMessages_(to, messages) {
  const target = String(to || "").trim();
  if (!target) {
    return false;
  }

  try {
    const config = getConfig();
    const url = "https://api.line.me/v2/bot/message/push";
    const payload = {
      to: target,
      messages: messages || []
    };

    const res = safeUrlFetch(url, {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: `Bearer ${config.lineToken}`
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }, {
      service: "line",
      action: "push",
      method: "post"
    });

    const statusCode = res.getResponseCode();
    const bodyText = res.getContentText();
    logInfo("sendLinePushMessages_.response", {
      statusCode: statusCode,
      body: truncateText_(bodyText, 500)
    });

    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`LINE Push HTTP ${statusCode}: ${bodyText}`);
    }

    return true;
  } catch (err) {
    logError("sendLinePushMessages_.error", err);
    return false;
  }
}

function getLinePushTargetFromSource_(source) {
  const safeSource = source || {};
  return String(safeSource.groupId || safeSource.roomId || safeSource.userId || "").trim();
}


function buildQuickReplyFromTexts_(texts) {
  const safeTexts = (texts || [])
    .map(function(text) {
      return String(text || "").trim();
    })
    .filter(Boolean)
    .slice(0, 13);

  if (!safeTexts.length) {
    return null;
  }

  return {
    items: safeTexts.map(function(text) {
      return {
        type: "action",
        action: {
          type: "message",
          label: String(text).slice(0, 20),
          text: text
        }
      };
    })
  };
}


function buildDefaultQuickReplyTexts_() {
  return [
    "help",
    "วิธีส่งสลิป",
    "รายการล่าสุด",
    "งานเดือนนี้",
    "หมายเหตุค่าใช้จ่าย",
    "เทส",
    "ค่าแรง สัปดาห์ที่ 1 เมษายน"
  ];
}


function buildQuickReply_(texts) {
  return buildQuickReplyFromTexts_(texts);
}


function getLineActorInfo_(source) {
  const safeSource = source || {};
  const lineUserId = String(safeSource.userId || "").trim();
  return {
    lineUserId: lineUserId,
    displayName: getLineDisplayName_(safeSource)
  };
}


function getLineDisplayName_(source) {
  const safeSource = source || {};
  const lineUserId = String(safeSource.userId || "").trim();
  if (!lineUserId) {
    return "";
  }

  if (safeSource.displayName) {
    return String(safeSource.displayName || "").trim();
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = buildLineDisplayNameCacheKey_(safeSource);
  const cachedName = String(cache.get(cacheKey) || "").trim();
  if (cachedName) {
    return cachedName;
  }

  try {
    const config = getConfig();
    let url = `https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`;
    if (safeSource.groupId) {
      url = `https://api.line.me/v2/bot/group/${encodeURIComponent(safeSource.groupId)}/member/${encodeURIComponent(lineUserId)}`;
    } else if (safeSource.roomId) {
      url = `https://api.line.me/v2/bot/room/${encodeURIComponent(safeSource.roomId)}/member/${encodeURIComponent(lineUserId)}`;
    }

    const res = safeUrlFetch(url, {
      method: "get",
      headers: {
        Authorization: `Bearer ${config.lineToken}`
      },
      muteHttpExceptions: true
    }, {
      service: "line",
      action: "profile",
      method: "get"
    });

    const statusCode = res.getResponseCode();
    if (statusCode < 200 || statusCode >= 300) {
      logInfo("getLineDisplayName_.skip", {
        statusCode: statusCode,
        body: truncateText_(res.getContentText(), 300)
      });
      return "";
    }

    const profile = JSON.parse(res.getContentText() || "{}");
    const displayName = String(profile.displayName || "").trim();
    if (displayName) {
      cache.put(cacheKey, displayName, LINE_PROFILE_CACHE_TTL_SEC);
    }
    return displayName;
  } catch (err) {
    logError("getLineDisplayName_.error", err);
    return "";
  }
}


function buildLineDisplayNameCacheKey_(source) {
  const safeSource = source || {};
  return [
    "line_profile",
    safeSource.groupId || safeSource.roomId || "direct",
    safeSource.userId || "unknown"
  ].join(":");
}
