/**
 * Main.gs
 * Public Apps Script entry points only.
 */

function doPost(e) {
  const traceId = createRequestTraceId_();

  try {
    logInfo_("doPost.start", {
      traceId: traceId,
      hasEvent: !!e,
      hasPostData: !!(e && e.postData),
      hasContents: !!(e && e.postData && e.postData.contents)
    });

    if (!validateWebhookRequest_(e, traceId)) {
      logInfo_("doPost.invalidWebhookRequest", { traceId: traceId });
      return ContentService.createTextOutput("Forbidden");
    }

    if (!e || !e.postData || !e.postData.contents) {
      logInfo_("doPost.noPostData", { traceId: traceId });
      return ContentService.createTextOutput("OK");
    }

    validateRequiredProperties_();

    const body = JSON.parse(e.postData.contents);
    const events = body.events || [];

    logInfo_("doPost.events", {
      traceId: traceId,
      count: events.length
    });

    for (const event of events) {
      routeLineEvent_(event, { traceId: traceId });
    }
  } catch (err) {
    handleWebhookError_(err, null, traceId);
  }

  return ContentService.createTextOutput("OK");
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: "LINE Finance Bot" }))
    .setMimeType(ContentService.MimeType.JSON);
}

