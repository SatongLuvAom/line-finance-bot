/**
 * Command_Handler.gs
 * Text command handlers and command response builders.
 */

function handleTextMessage(event, context) {
  const safeContext = context || {};
  const replyToken = event.replyToken;
  const userText = String(event.message.text || "").trim();

  logInfo("handleTextMessage.input", { text: userText });

  if (handlePendingLaborConfirmationReply_(event, userText)) {
    return;
  }

  if (
    userText === "เมนู" ||
    userText.toLowerCase() === "menu" ||
    userText.toLowerCase() === "help"
  ) {
    replyText(replyToken, buildHelpMessage_());
    return;
  }

  if (
    userText === "หมายเหตุค่าแรง" ||
    userText === "หมายเหตุค่าใช้จ่าย" ||
    userText.toLowerCase() === "labor note"
  ) {
    replyText(replyToken, buildExpenseNoteGuidanceText_());
    return;
  }

  if (
    userText === "วิธีส่งสลิป" ||
    userText === "คู่มือส่งสลิป" ||
    userText === "วิธีบันทึกสลิป" ||
    userText.toLowerCase() === "slip guide"
  ) {
    replyText(replyToken, buildSlipGuidanceText_());
    return;
  }

  if (userText === "เทส" || userText.toLowerCase() === "test") {
    const source = event.source || {};
    const idInfo = source.groupId
      ? `Group ID: ${source.groupId}`
      : `User ID: ${source.userId || "unknown"}`;

    replyText(replyToken, `บอทออนไลน์แล้ว\n${idInfo}`);
    return;
  }

  if (userText === "jobs ค้าง" || userText.toLowerCase() === "queue status") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง queue ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildReceiptJobQueueStatusMessage_(getReceiptJobQueueStatus_()));
    return;
  }

  if (userText === "process jobs" || userText === "ประมวลผล jobs") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง queue ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildReceiptJobProcessResultMessage_(processPendingReceiptJobs(RECEIPT_JOB_DEFAULT_BATCH_SIZE)));
    return;
  }

  if (userText === "kick jobs" || userText === "ปลุก jobs") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง queue ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildReceiptWorkerKickMessage_(scheduleReceiptWorkerKick_("admin_command", { force: true })));
    return;
  }

  if (userText === "cleanup job triggers" || userText === "ล้าง job triggers") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง queue ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    cleanupReceiptWorkerKickTriggers_();
    replyText(replyToken, [
      "Cleanup job triggers finished",
      "────────────",
      `worker triggers: ${getReceiptWorkerTriggerCount_()}`
    ].join("\n"));
    return;
  }

  if (userText === "install worker" || userText === "ติดตั้ง worker") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง queue ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildReceiptWorkerInstallMessage_(installReceiptWorkerTrigger()));
    return;
  }

  if (userText === "uninstall worker" || userText === "ปิด worker") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง queue ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildReceiptWorkerUninstallMessage_(uninstallReceiptWorkerTrigger()));
    return;
  }

  if (userText === "retry jobs" || userText === "ลอง jobs ใหม่") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง queue ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildReceiptJobRetryMessage_(retryReceiptJobs(5)));
    return;
  }

  if (userText === "failed jobs" || userText === "jobs fail") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง queue ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildFailedReceiptJobsMessage_(getReceiptJobsByStatus_(RECEIPT_JOB_STATUS_FAILED, 10)));
    return;
  }

  if (userText === "gas usage วันนี้" || userText.toLowerCase() === "gas usage today") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง usage ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildGasUsageTodayMessage_(getGasUsageTodaySummary_()));
    return;
  }

  if (userText === "line usage วันนี้" || userText.toLowerCase() === "line usage today") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง usage ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildLineNotificationUsageTodayMessage_(getReceiptNotificationUsageTodaySummary_()));
    return;
  }

  if (userText === "process done push วันนี้" || userText.toLowerCase() === "process done push today") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง usage ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildProcessDonePushTodayMessage_(getProcessDonePushUsageToday_()));
    return;
  }

  if (userText === "notification failed") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง notification ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildReceiptNotificationJobsMessage_(
      "Notification failed",
      getReceiptNotificationJobsByStatus_(RECEIPT_NOTIFICATION_STATUS_FAILED, 10)
    ));
    return;
  }

  if (userText === "notification skipped") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง notification ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildReceiptNotificationJobsMessage_(
      "Notification skipped",
      getReceiptNotificationJobsByStatus_(RECEIPT_NOTIFICATION_STATUS_SKIPPED, 10)
    ));
    return;
  }

  if (userText === "ลบล่าสุด ยืนยัน" || userText.toLowerCase() === "delete latest confirm") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่งลบข้อมูลใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }

    const pendingDelete = getPendingDeleteLatest_(event.source);
    if (!pendingDelete || !pendingDelete.documentName) {
      replyText(replyToken, "ไม่มีรายการรอยืนยันลบ\nพิมพ์ `ลบล่าสุด` เพื่อดูรายการก่อน");
      return;
    }
    const result = deleteExpenseRecordByDocumentName_(pendingDelete.documentName, {
      lineUserId: event.source && event.source.userId || ""
    });
    if (result && result.record) {
      forgetReceiptProcessCacheForRecord_(result.record);
    }
    clearPendingDeleteLatest_(event.source);
    replyText(replyToken, buildDeleteLatestMessage_(result));
    return;
  }

  if (userText === "ลบล่าสุด" || userText.toLowerCase() === "delete latest") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่งลบข้อมูลใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }

    const records = getRecentExpenseRecords_(getConversationKey_(event.source), 1);
    if (!records.length) {
      replyText(replyToken, buildDeleteLatestMessage_(null));
      return;
    }
    savePendingDeleteLatest_(event.source, records[0]);
    replyText(replyToken, buildDeleteLatestConfirmMessage_(records[0]), [
      "ลบล่าสุด ยืนยัน",
      "รายการล่าสุด",
      "help"
    ]);
    return;
  }

  if (userText === "รายการรอยืนยัน" || userText.toLowerCase() === "pending review") {
    handlePendingReviewCommand_(event);
    return;
  }

  if (userText === "รายการล่าสุด" || userText === "ล่าสุด" || userText.toLowerCase() === "latest") {
    const records = getRecentExpenseRecords_(getConversationKey_(event.source), 1);
    if (!records.length) {
      replyText(replyToken, buildRecentRecordsMessage_(records, "รายการล่าสุด"));
      return;
    }
    sendLineMessages(replyToken, [buildLatestTransactionCard(records[0])]);
    return;
  }

  const recentMatch = userText.match(/^ล่าสุด\s+(\d{1,2})$/i);
  if (recentMatch) {
    const limit = Math.min(Math.max(parseInt(recentMatch[1], 10) || 5, 1), 10);
    const records = getRecentExpenseRecords_(getConversationKey_(event.source), limit);
    if (!records.length) {
      replyText(replyToken, buildRecentRecordsMessage_(records, `ล่าสุด ${limit} รายการ`));
      return;
    }
    sendLineMessages(replyToken, [buildLatestTransactionsCarousel(records)]);
    return;
  }

  if (userText.toLowerCase() === "sheet sync mode" || userText === "โหมด sync sheet") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง Sheet sync ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildSheetSyncModeMessage_());
    return;
  }

  if (userText.toLowerCase() === "sync sheet latest" || userText === "sync sheet ล่าสุด") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง Sheet sync ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    const latestDoc = getLatestExpenseDocument_(getConversationKey_(event.source));
    const result = latestDoc
      ? syncTransactionToSheet(latestDoc.name, {
        syncType: SHEET_SYNC_MODE_MANUAL,
        target: "latest",
        actorLineUserId: event.source && event.source.userId || "",
        force: true
      })
      : { ok: false, reason: "not_found" };
    replyText(replyToken, buildSheetSyncSingleMessage_(result));
    return;
  }

  if (userText.toLowerCase() === "sync sheet today" || userText === "sync sheet วันนี้") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง Sheet sync ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildSheetSyncBatchMessage_(syncSheetToday_(event.source && event.source.userId || "")));
    return;
  }

  if (userText.toLowerCase() === "sync sheet this month" || userText === "sync sheet เดือนนี้") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง Sheet sync ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildSheetSyncBatchMessage_(syncSheetCurrentMonth_(event.source && event.source.userId || "")));
    return;
  }

  const syncSheetJobMatch = userText.match(/^sync sheet\s+งาน\s*(.+)$/i);
  if (syncSheetJobMatch) {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง Sheet sync ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildSheetSyncBatchMessage_(syncSheetJob_(syncSheetJobMatch[1], event.source && event.source.userId || "")));
    return;
  }

  if (userText.toLowerCase() === "sync error retry" || userText === "sync error retry") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง Sheet sync ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildSheetSyncBatchMessage_(retrySheetSyncErrors(10)));
    return;
  }

  if (userText.toLowerCase() === "sync pending retry" || userText === "sync pending retry") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง Sheet sync ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildSheetSyncBatchMessage_(syncPendingSheetRows(50)));
    return;
  }

  if (userText.toLowerCase() === "sync pending" || userText === "รายการรอ sync") {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่ง Sheet sync ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildSheetSyncPendingMessage_(getSheetSyncPendingSummary_()));
    return;
  }

  if (
    userText.toLowerCase() === "sync error" ||
    userText.toLowerCase() === "sheet sync error" ||
    userText === "รายการ sync error"
  ) {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่งตรวจ sync error ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildSyncErrorRecordsMessage_(getSheetSyncErrors(10)));
    return;
  }

  const retrySheetSyncMatch = userText.match(/^(?:retry sync|retry sheet|ซ่อม sync|ซ่อมชีต)\s+(.+)$/i);
  if (retrySheetSyncMatch) {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่งซ่อม Sheet sync ใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildRetrySheetSyncMessage_(retrySheetSync(retrySheetSyncMatch[1])));
    return;
  }

  if (
    userText.toLowerCase() === "duplicate" ||
    userText.toLowerCase() === "duplicates" ||
    userText === "รายการ duplicate" ||
    userText === "รายการซ้ำ"
  ) {
    if (!checkAdminUser_(event)) {
      replyText(replyToken, "คำสั่งตรวจรายการซ้ำใช้ได้เฉพาะผู้ดูแลระบบครับ");
      return;
    }
    replyText(replyToken, buildDuplicateRecordsMessage_(getPossibleDuplicates(10)));
    return;
  }

  const editLatestMatch = userText.match(/^แก้ล่าสุด\s+(\S+)\s+(.+)$/i);
  if (editLatestMatch) {
    const result = updateLatestExpenseRecord_(
      getConversationKey_(event.source),
      editLatestMatch[1],
      editLatestMatch[2],
      { lineUserId: event.source && event.source.userId || "" }
    );
    if (result && result.oldRecord) {
      forgetReceiptProcessCacheForRecord_(result.oldRecord);
    }
    if (result && result.record) {
      forgetReceiptProcessCacheForRecord_(result.record);
    }
    replyText(replyToken, buildEditLatestMessage_(result));
    return;
  }

  if (
    userText === "สรุปงบ" ||
    userText === "งานเดือนนี้" ||
    userText === "รายการงานเดือนนี้" ||
    userText === "งานที่ใช้งบเดือนนี้"
  ) {
    replyText(replyToken, getActiveJobsThisMonthText_());
    return;
  }

  const laborMatch = userText.match(/^ค่าแรง\s+(?:สัปดาห์ที่|สัปดาห์|week)?\s*(\d+)\s+(.+)$/i);
  if (laborMatch) {
    const week = laborMatch[1];
    const monthText = laborMatch[2].trim();
    const result = getLaborSummaryByWeekAndMonth(week, monthText);
    sendLineMessages(replyToken, [result]);
    return;
  }

  const summaryMatch = userText.match(/^สรุปงบ\s+(.+)$/i);
  if (summaryMatch) {
    const jobQuery = summaryMatch[1].trim();
    const result = isFactorySummaryQuery_(jobQuery)
      ? handleFactorySummaryCommand({
        event: event,
        inputText: userText,
        traceId: safeContext.traceId || "",
        lineUserId: event.source && event.source.userId || ""
      })
      : handleJobSummaryCommand(jobQuery, {
        event: event,
        inputText: userText,
        traceId: safeContext.traceId || "",
        lineUserId: event.source && event.source.userId || ""
      });
    sendLineMessages(replyToken, [result]);
    return;
  }

  const manualMatch = userText.match(/^บันทึกค่าแรง\s+(\d+(?:\.\d+)?)\s+(.+)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s*(.*)$/i);
  if (manualMatch) {
    processManualLabor(
      event,
      manualMatch[1],
      manualMatch[2],
      manualMatch[3],
      manualMatch[4]
    );
    return;
  }

  logInfo("handleTextMessage.noKeywordMatched", { text: userText });
  replyText(
    replyToken,
    [
      "ไม่พบคำสั่งที่ตรงกัน",
      "พิมพ์ `help` เพื่อดูคำสั่งทั้งหมด"
    ].join("\n")
  );
}


function buildExpenseNoteGuidanceText_() {
  return [
    "YUPPIE Note Format",
    "────────────",
    "ให้พิมพ์หมายเหตุสั้นและคงรูปแบบ",
    "ใช้ `_` คั่นข้อมูลทุกช่อง",
    "",
    "ค่าแรง",
    "รูปแบบ: ค่าแรง_W1_เม.ย._ชื่องาน",
    "ตัวอย่าง:",
    LABOR_NOTE_FORMAT_EXAMPLE,
    "",
    "หมวดอื่น",
    "รูปแบบ: หมวด_ชื่องาน_รายการ",
    "ตัวอย่าง:",
    "วัสดุโครงสร้าง_งานบูธA_เหล็กกล่อง",
    "ค่าเช่าอุปกรณ์_งานบูธA_เช่าเครน",
    "ค่าขนส่ง_งานบูธA_ค่าน้ำมัน",
    "อื่นๆ_งานทั่วไป_ค่าทำความสะอาด",
    "",
    "ค่าใช้จ่ายกลาง / โรงงาน",
    "ถ้าไม่ผูกกับงานลูกค้า ให้ใช้ `โรงงาน`",
    "ตัวอย่าง:",
    "ค่าขนส่ง_โรงงาน_ค่าน้ำมันมาโรงงาน",
    "ค่าขนส่ง_โรงงาน_ค่าทางด่วนมาโรงงาน",
    "ค่าใช้จ่ายสำนักงาน_โรงงาน_กระดาษเอกสาร",
    "ค่าสาธารณูปโภค_โรงงาน_ค่าไฟ",
    "",
    "หลักสำคัญ",
    "ใส่หมวดไว้หน้าสุดเสมอ",
    "ถ้าเป็นค่าใช้จ่ายโรงงาน ให้ใช้ `โรงงาน`",
    "ใช้ `งานทั่วไป` เฉพาะกรณีไม่รู้จริงๆ",
    "อย่ารวมหลายค่าใช้จ่ายในสลิปเดียว",
    "อย่าใช้ข้อความลอยๆ เช่น โอนเงิน / เบิก / ค่าของ"
  ].join("\n");
}


function buildSlipGuidanceText_() {
  return [
    "วิธีส่งสลิปให้อ่านแม่น",
    "────────────",
    "1. ใส่หมายเหตุทุกครั้ง",
    "ให้ใช้รูปแบบนี้:",
    "หมวด_ชื่องาน_รายการ",
    "",
    "2. ค่าแรงต้องมีสัปดาห์",
    "ตัวอย่าง:",
    "ค่าแรง_W1_เม.ย._งานบูธA",
    "ค่าแรง_W2_พ.ค._งานติดตั้ง",
    "",
    "3. หมวดอื่นใช้ 3 ช่อง",
    "วัสดุโครงสร้าง_งานบูธA_เหล็กกล่อง",
    "วัสดุตกแต่ง_งานบูธA_อะคริลิก",
    "งานพิมพ์/กราฟิก_งานบูธA_สติกเกอร์",
    "ค่าเช่าอุปกรณ์_งานบูธA_เช่าเครน",
    "ค่าขนส่ง_งานบูธA_ค่าน้ำมัน",
    "",
    "4. ค่าใช้จ่ายกลาง / โรงงาน",
    "ถ้าไม่ได้ผูกกับงานลูกค้า ให้ใช้ `โรงงาน`",
    "ตัวอย่าง:",
    "ค่าขนส่ง_โรงงาน_ค่าน้ำมันมาโรงงาน",
    "ค่าขนส่ง_โรงงาน_ค่าทางด่วนมาโรงงาน",
    "ค่าใช้จ่ายสำนักงาน_โรงงาน_กระดาษเอกสาร",
    "ค่าสาธารณูปโภค_โรงงาน_ค่าไฟ",
    "",
    "5. หลีกเลี่ยง",
    "โอนเงิน",
    "เบิก",
    "ค่าของ",
    "จ่ายให้ช่าง",
    "ค่าแรง+ค่าน้ำมัน",
    "",
    "สรุปสั้นที่สุด:",
    "ค่าแรง: ค่าแรง_W1_เม.ย._งาน...",
    "งานลูกค้า: หมวด_งาน..._รายการ...",
    "โรงงาน: หมวด_โรงงาน_รายการ..."
  ].join("\n");
}


function buildDeleteLatestMessage_(result) {
  if (!result || !result.record) {
    return [
      "ไม่พบรายการสำหรับลบ",
      "────────────",
      "ยังไม่มีรายการในระบบ"
    ].join("\n");
  }

  const record = result.record;
  return [
    "ลบรายการเรียบร้อย",
    "────────────",
    `วันที่: ${record.date || "-"}`,
    `ผู้รับ/ร้านค้า: ${record.merchant || "-"}`,
    `หมวด: ${record.category || "-"}`,
    `งาน: ${record.job || "-"}`,
    `ยอด: ฿${Number(record.amount || 0).toLocaleString()}`,
    "",
    "สถานะ",
    `Firestore: ${result.firestoreDeleted ? "ลบแล้ว" : "ไม่สำเร็จ"}`,
    `Google Sheet: ${result.sheetDeleted ? "ลบแล้ว" : "ไม่พบแถวที่ตรงกัน"}`,
    `ไฟล์แนบ: ${result.attachmentDeleted ? "ลบแล้ว" : "ไม่มีไฟล์แนบ"}`
  ].join("\n");
}


function buildDeleteLatestConfirmMessage_(record) {
  return [
    "ยืนยันก่อนลบ",
    "────────────",
    formatRecordOneLine_(record),
    `งาน: ${record.job || "-"}`,
    `รายการ: ${record.items || "-"}`,
    "",
    "ถ้าถูกต้อง ให้กดหรือพิมพ์:",
    "`ลบล่าสุด ยืนยัน`",
    "",
    "รายการนี้จะรอยืนยัน 10 นาที"
  ].join("\n");
}


function buildRecentRecordsMessage_(records, title) {
  if (!records || !records.length) {
    return [
      title || "รายการล่าสุด",
      "────────────",
      "ไม่พบรายการในแชตนี้"
    ].join("\n");
  }

  const lines = [title || "รายการล่าสุด", "────────────"];
  records.forEach(function(record, index) {
    lines.push(`${index + 1}. ${formatRecordOneLine_(record)}`);
    lines.push(`งาน: ${record.job || "-"}`);
    lines.push(`รายการ: ${record.items || "-"}`);
    lines.push("");
  });

  lines.push("แก้ได้ เช่น:");
  lines.push("`แก้ล่าสุด หมวด ค่าแรง`");
  lines.push("`แก้ล่าสุด งาน งานบูธA`");
  return lines.join("\n");
}


function buildSyncErrorRecordsMessage_(records) {
  if (!records || !records.length) {
    return [
      "รายการ sync error",
      "────────────",
      "ไม่พบรายการที่ Google Sheet sync ไม่สำเร็จ"
    ].join("\n");
  }

  const lines = ["รายการ sync error", "────────────"];
  records.forEach(function(record, index) {
    lines.push(`${index + 1}. ${formatRecordOneLine_(record)}`);
    lines.push(`ID: ${getShortFirestoreDocumentId_(record.documentName)}`);
    lines.push(`งาน: ${record.job || "-"}`);
    lines.push(`สาเหตุ: ${truncateText_(record.sheetSyncError || "-", 120)}`);
    lines.push("");
  });

  return lines.join("\n");
}


function buildRetrySheetSyncMessage_(result) {
  if (!result || !result.ok) {
    return [
      "ซ่อม Google Sheet sync ไม่สำเร็จ",
      "────────────",
      `สาเหตุ: ${result && result.reason || result && result.errorMessage || "unknown"}`,
      "",
      "ใช้ ID จากคำสั่ง `sync error` เช่น:",
      "`retry sync DOCUMENT_ID`"
    ].join("\n");
  }

  if (result.skipped) {
    if (result.reason !== "already_synced") {
      return [
        "Google Sheet sync ถูกข้าม",
        "────────────",
        `เหตุผล: ${result.reason || "-"}`,
        `Mode: ${result.sheetSyncMode || getSheetSyncMode()}`
      ].join("\n");
    }

    return [
      "Google Sheet sync อยู่ในสถานะ SYNCED แล้ว",
      "────────────",
      `ID: ${getShortFirestoreDocumentId_(result.documentName)}`
    ].join("\n");
  }

  return [
    "ซ่อม Google Sheet sync สำเร็จ",
    "────────────",
    `ID: ${getShortFirestoreDocumentId_(result.documentName)}`
  ].join("\n");
}


function buildSheetSyncModeMessage_() {
  const summary = getSheetSyncPendingSummary_();
  return [
    "Sheet Sync Mode",
    "────────────",
    `โหมดปัจจุบัน: ${summary.mode}`,
    "",
    "ความหมาย:",
    "OFF = ไม่ sync Google Sheets",
    "MANUAL = รอ admin สั่ง sync",
    "BATCH = รอ sync เป็นรอบ",
    "REALTIME = sync ทันทีหลังบันทึก",
    "",
    "สถานะค้าง:",
    `PENDING: ${summary.pendingCount}`,
    `PENDING_MANUAL: ${summary.pendingManualCount}`,
    `ERROR: ${summary.errorCount}`
  ].join("\n");
}


function buildSheetSyncSingleMessage_(result) {
  if (!result || !result.ok) {
    return [
      "Sheet sync ไม่สำเร็จ",
      "────────────",
      `สาเหตุ: ${result && (result.reason || result.errorMessage) || "unknown"}`
    ].join("\n");
  }

  if (result.skipped) {
    return [
      "Sheet sync ถูกข้าม",
      "────────────",
      `เหตุผล: ${result.reason || "-"}`,
      `Mode: ${result.sheetSyncMode || getSheetSyncMode()}`
    ].join("\n");
  }

  return [
    "Sheet sync สำเร็จ",
    "────────────",
    `ID: ${getShortFirestoreDocumentId_(result.documentName)}`,
    `Mode: ${result.sheetSyncMode || getSheetSyncMode()}`,
    `เขียน Sheet: ${result.sheetWriteCount || 0} row`,
    `เวลา: ${result.elapsedMs || 0} ms`
  ].join("\n");
}


function buildSheetSyncBatchMessage_(result) {
  if (!result) {
    return "Sheet sync ไม่สำเร็จ\n────────────\nไม่พบผลลัพธ์";
  }

  return [
    result.ok ? "Sheet sync batch เสร็จแล้ว" : "Sheet sync batch มีบางรายการผิดพลาด",
    "────────────",
    `Mode: ${result.sheetSyncMode || getSheetSyncMode()}`,
    `Target: ${result.target || "-"}`,
    `ทั้งหมด: ${result.totalCount || 0}`,
    `สำเร็จ: ${result.successCount || 0}`,
    `ผิดพลาด: ${result.errorCount || 0}`,
    `เขียน Sheet: ${result.sheetWriteCount || 0} row`,
    `เวลา: ${result.elapsedMs || 0} ms`
  ].join("\n");
}


function buildSheetSyncPendingMessage_(summary) {
  const safeSummary = summary || {};
  return [
    "Sheet sync pending",
    "────────────",
    `Mode: ${safeSummary.mode || getSheetSyncMode()}`,
    `PENDING: ${safeSummary.pendingCount || 0}`,
    `PENDING_MANUAL: ${safeSummary.pendingManualCount || 0}`,
    `ERROR: ${safeSummary.errorCount || 0}`,
    "",
    "คำสั่งที่ใช้ต่อ:",
    "`sync pending retry`",
    "`sync error`",
    "`sync error retry`"
  ].join("\n");
}


function buildReceiptJobQueueStatusMessage_(summary) {
  const safeSummary = summary || {};
  return [
    "Receipt Queue Status",
    "────────────",
    `QUEUED: ${safeSummary[RECEIPT_JOB_STATUS_QUEUED] || 0}`,
    `RETRY_PENDING: ${safeSummary[RECEIPT_JOB_STATUS_RETRY_PENDING] || 0}`,
    `PROCESSING_PAUSED: ${safeSummary[RECEIPT_JOB_STATUS_PROCESSING_PAUSED] || 0}`,
    `PROCESSING: ${safeSummary[RECEIPT_JOB_STATUS_PROCESSING] || 0}`,
    `FAILED: ${safeSummary[RECEIPT_JOB_STATUS_FAILED] || 0}`,
    `worker triggers: ${safeSummary.workerTriggerCount}`,
    `watchdog triggers: ${safeSummary.workerWatchdogTriggerCount || 0}`,
    "",
    "คำสั่งต่อ:",
    "`process jobs`",
    "`kick jobs`",
    "`install worker`",
    "`uninstall worker`",
    "`retry jobs`",
    "`failed jobs`"
  ].join("\n");
}


function buildReceiptWorkerKickMessage_(result) {
  const safeResult = result || {};
  if (safeResult.scheduled) {
    return [
      "Receipt worker kick scheduled",
      "────────────",
      `delay: ${safeResult.delayMs || RECEIPT_WORKER_KICK_DELAY_MS} ms`
    ].join("\n");
  }

  return [
    "Receipt worker kick not scheduled",
    "────────────",
    `ok: ${safeResult.ok === true ? "yes" : "no"}`,
    `reason: ${safeResult.reason || safeResult.errorMessage || "-"}`
  ].join("\n");
}


function buildReceiptWorkerInstallMessage_(result) {
  const safeResult = result || {};
  return [
    "Receipt worker watchdog",
    "────────────",
    `ok: ${safeResult.ok === true ? "yes" : "no"}`,
    `installed: ${safeResult.installed === true ? "yes" : "no"}`,
    `reason: ${safeResult.reason || "-"}`,
    `watchdog triggers: ${safeResult.watchdogTriggerCount || 0}`,
    "",
    "หลังจากนี้ไม่ต้องพิมพ์ `process jobs` เอง ระบบจะเช็กคิวทุก 1 นาที"
  ].join("\n");
}


function buildReceiptWorkerUninstallMessage_(result) {
  const safeResult = result || {};
  return [
    "Receipt worker watchdog removed",
    "────────────",
    `ok: ${safeResult.ok === true ? "yes" : "no"}`,
    `deleted: ${safeResult.deletedCount || 0}`,
    `watchdog triggers: ${safeResult.watchdogTriggerCount || 0}`
  ].join("\n");
}


function buildReceiptJobProcessResultMessage_(result) {
  const safeResult = result || {};
  if (safeResult.skipped) {
    return [
      "Receipt worker skipped",
      "────────────",
      `สาเหตุ: ${safeResult.reason || "-"}`
    ].join("\n");
  }

  return [
    "Receipt worker finished",
    "────────────",
    `ประมวลผล: ${safeResult.processedCount || 0}`,
    `สำเร็จ: ${safeResult.completedCount || 0}`,
    `ซ้ำ: ${safeResult.duplicateSkippedCount || 0}`,
    `รอ retry: ${safeResult.retryPendingCount || 0}`,
    `ล้มเหลว: ${safeResult.failedCount || 0}`,
    `paused: ${safeResult.paused === true ? "yes" : "no"}`
  ].join("\n");
}


function buildReceiptJobRetryMessage_(result) {
  return [
    "Retry receipt jobs",
    "────────────",
    `นำกลับเข้าคิว: ${result && result.retriedCount || 0}`
  ].join("\n");
}


function buildFailedReceiptJobsMessage_(jobs) {
  const safeJobs = jobs || [];
  if (!safeJobs.length) {
    return [
      "Failed jobs",
      "────────────",
      "ไม่พบ failed job"
    ].join("\n");
  }

  const lines = ["Failed jobs", "────────────"];
  safeJobs.slice(0, 10).forEach(function(job, index) {
    lines.push(`${index + 1}. ${getShortReceiptJobId_(job.jobId || job.documentName)}`);
    lines.push(`retry: ${job.retryCount || 0}/${job.maxRetry || RECEIPT_JOB_DEFAULT_MAX_RETRY}`);
    lines.push(`error: ${truncateText_(job.safeError || job.lastSafeError || "-", 120)}`);
    lines.push("");
  });
  lines.push("ใช้ `retry jobs` เพื่อนำกลับเข้าคิว");
  return lines.join("\n");
}


function buildGasUsageTodayMessage_(summary) {
  const safeSummary = summary || {};
  return [
    `GAS usage วันนี้ ${safeSummary.date || formatDateToYMD(new Date())}`,
    "────────────",
    `executions: ${safeSummary.executionCount || 0}`,
    `executionMs: ${Number(safeSummary.executionMs || 0).toLocaleString()}`,
    `UrlFetch: ${safeSummary.urlFetchCount || 0}`,
    `Gemini: ${safeSummary.geminiCallCount || 0}`,
    `errors: ${safeSummary.errorCount || 0}`
  ].join("\n");
}


function buildLineNotificationUsageTodayMessage_(summary) {
  const safeSummary = summary || {};
  return [
    `LINE usage วันนี้ ${safeSummary.date || formatDateToYMD(new Date())}`,
    "────────────",
    `notification ทั้งหมด: ${safeSummary.totalCount || 0}`,
    `reply: ${safeSummary.replyCount || 0}`,
    `push: ${safeSummary.pushCount || 0}`,
    `skipped: ${safeSummary.skippedCount || 0}`,
    `failed: ${safeSummary.failedCount || 0}`,
    `flex: ${safeSummary.flexCount || 0}`,
    `text: ${safeSummary.textCount || 0}`
  ].join("\n");
}


function buildProcessDonePushTodayMessage_(summary) {
  const safeSummary = summary || {};
  return [
    `Process done push วันนี้ ${safeSummary.date || formatDateToYMD(new Date())}`,
    "────────────",
    `push ที่ใช้: ${safeSummary.pushCount || 0}`,
    `limit: ${safeSummary.maxPerDay || getConfig().maxProcessDonePushPerDay}`,
    `คงเหลือโดยประมาณ: ${Math.max(0, Number(safeSummary.maxPerDay || 0) - Number(safeSummary.pushCount || 0))}`
  ].join("\n");
}


function buildReceiptNotificationJobsMessage_(title, jobs) {
  const safeJobs = jobs || [];
  if (!safeJobs.length) {
    return [
      title || "Notification jobs",
      "────────────",
      "ไม่พบรายการ"
    ].join("\n");
  }

  const lines = [title || "Notification jobs", "────────────"];
  safeJobs.slice(0, 10).forEach(function(job, index) {
    lines.push(`${index + 1}. ${getShortReceiptJobId_(job.jobId || job.documentName)}`);
    lines.push(`status: ${job.notificationStatus || "-"}`);
    lines.push(`method: ${job.notificationMethod || "-"}`);
    lines.push(`error: ${truncateText_(job.lastNotifyError || "-", 120)}`);
    lines.push("");
  });
  return lines.join("\n");
}


function getShortFirestoreDocumentId_(documentName) {
  const value = String(documentName || "").trim();
  if (!value) return "-";
  const parts = value.split("/");
  return parts[parts.length - 1] || value;
}


function buildDuplicateRecordsMessage_(records) {
  if (!records || !records.length) {
    return [
      "รายการ duplicate",
      "────────────",
      "ไม่พบรายการที่ถูก mark เป็น possible duplicate"
    ].join("\n");
  }

  const lines = ["รายการ duplicate", "────────────"];
  records.forEach(function(record, index) {
    lines.push(`${index + 1}. ${formatRecordOneLine_(record)}`);
    lines.push(`งาน: ${record.job || "-"}`);
    lines.push(`รายการ: ${record.items || "-"}`);
    lines.push(`คู่ที่เป็นไปได้: ${normalizePossibleDuplicateIds_(record.possibleDuplicateIds).length} รายการ`);
    lines.push("");
  });

  return lines.join("\n");
}


function buildEditLatestMessage_(result) {
  if (!result || !result.ok) {
    const reason = result && result.reason ? result.reason : "unknown";
    const help = [
      "แก้รายการล่าสุดไม่สำเร็จ",
      "────────────",
      `สาเหตุ: ${reason}`,
      "",
      "ตัวอย่าง:",
      "`แก้ล่าสุด หมวด ค่าแรง`",
      "`แก้ล่าสุด งาน งานบูธA`",
      "`แก้ล่าสุด รายการ เหล็กกล่อง`",
      "`แก้ล่าสุด ผู้รับ นายสมชาย`",
      "`แก้ล่าสุด ยอด 6208`",
      "`แก้ล่าสุด สัปดาห์ 1`"
    ];
    return help.join("\n");
  }

  const sheetLine = result.sheetSync
    ? `Sheet sync: ${result.sheetSync.skipped ? "รอ sync ภายหลัง" : (result.sheetUpdated ? "อัปเดตแล้ว" : "ไม่สำเร็จ")} (${result.sheetSync.sheetSyncMode || getSheetSyncMode()})`
    : `Google Sheet: ${result.sheetUpdated ? "อัปเดตแล้ว" : "ไม่พบแถวเดิมที่ตรงกัน"}`;

  return [
    "แก้รายการล่าสุดเรียบร้อย",
    "────────────",
    formatRecordOneLine_(result.record),
    `งาน: ${result.record.job || "-"}`,
    `รายการ: ${result.record.items || "-"}`,
    "",
    sheetLine
  ].join("\n");
}


function formatRecordOneLine_(record) {
  const typeLabel = String(record && record.type || "expense") === "income" ? "รายรับ" : "รายจ่าย";
  return [
    `[${typeLabel}]`,
    record && record.date || "-",
    record && record.merchant || "-",
    record && record.category || "-",
    `฿${Number(record && record.amount || 0).toLocaleString()}`
  ].join(" | ");
}


function buildHelpMessage_() {
  return [
    "YUPPIE Financial Bot",
    "────────────",
    "คำสั่งที่ใช้บ่อย",
    "",
    "ส่งสลิป",
    "ส่งรูปภาพหรือ PDF เข้าแชตได้เลย",
    "หมายเหตุที่แนะนำ:",
    LABOR_NOTE_FORMAT_EXAMPLE,
    "ค่าขนส่ง_โรงงาน_ค่าน้ำมันมาโรงงาน",
    "ดูวิธีละเอียด: วิธีส่งสลิป",
    "",
    "ดูข้อมูล",
    "งานเดือนนี้",
    "สรุปงบ งานบูธA",
    "สรุปงบ โรงงาน",
    "ค่าแรง สัปดาห์ที่ 1 เมษายน",
    "รายการล่าสุด",
    "ล่าสุด 5",
    "รายการรอยืนยัน",
    "sync error",
    "sheet sync mode",
    "sync pending",
    "sync pending retry",
    "sync error retry",
    "sync sheet ล่าสุด",
    "sync sheet วันนี้",
    "sync sheet เดือนนี้",
    "sync sheet งานบูธA",
    "retry sync DOCUMENT_ID",
    "รายการ duplicate",
    "jobs ค้าง",
    "process jobs",
    "kick jobs",
    "install worker",
    "uninstall worker",
    "cleanup job triggers",
    "retry jobs",
    "failed jobs",
    "gas usage วันนี้",
    "line usage วันนี้",
    "process done push วันนี้",
    "notification failed",
    "notification skipped",
    "",
    "แก้เมื่อ AI อ่านผิด",
    "แก้ล่าสุด หมวด ค่าแรง",
    "แก้ล่าสุด งาน งานบูธA",
    "แก้ล่าสุด รายการ เหล็กกล่อง",
    "แก้ล่าสุด ผู้รับ นายสมชาย",
    "แก้ล่าสุด ยอด 6208",
    "",
    "ลบรายการ",
    "ลบล่าสุด",
    "ลบล่าสุด ยืนยัน",
    "",
    "บันทึกมือ",
    "บันทึกค่าแรง 500 งานเชื่อม 01/04/2026 เบิกสด",
    "",
    "ตัวอย่างหมายเหตุทั้งหมด:",
    "หมายเหตุค่าใช้จ่าย",
    "วิธีส่งสลิป",
    "",
    "เช็กระบบ:",
    "เทส"
  ].join("\n");
}


function getConversationKey_(source) {
  const safeSource = source || {};
  if (safeSource.groupId) return `group:${safeSource.groupId}`;
  if (safeSource.roomId) return `room:${safeSource.roomId}`;
  return `user:${safeSource.userId || "unknown"}`;
}


function savePendingDeleteLatest_(source, record) {
  const cache = CacheService.getScriptCache();
  cache.put(
    `pending_delete_latest:${getConversationKey_(source)}`,
    JSON.stringify({
      documentName: record && record.documentName || ""
    }),
    PENDING_DELETE_CONFIRM_TTL_SEC
  );
}


function getPendingDeleteLatest_(source) {
  const cache = CacheService.getScriptCache();
  const raw = cache.get(`pending_delete_latest:${getConversationKey_(source)}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}


function clearPendingDeleteLatest_(source) {
  const cache = CacheService.getScriptCache();
  cache.remove(`pending_delete_latest:${getConversationKey_(source)}`);
}

function handleHelpCommand_(event) {
  replyText(event.replyToken, buildHelpMessage_());
}

function handleSlipGuideCommand_(event) {
  replyText(event.replyToken, buildSlipGuidanceText_());
}

function handleNoteGuideCommand_(event) {
  replyText(event.replyToken, buildExpenseNoteGuidanceText_());
}

function handleTestCommand_(event) {
  const source = event.source || {};
  const idInfo = source.groupId
    ? `Group ID: ${source.groupId}`
    : `User ID: ${source.userId || "unknown"}`;
  replyText(event.replyToken, `บอทออนไลน์แล้ว\n${idInfo}`);
}

function handleActiveJobsCommand_(event) {
  replyText(event.replyToken, getActiveJobsThisMonthText_());
}

function handleBudgetSummaryCommand_(event) {
  replyText(event.replyToken, getActiveJobsThisMonthText_());
}

function handleLaborSummaryCommand_(event, week, monthText) {
  sendLineMessages(event.replyToken, [getLaborSummaryByWeekAndMonth(week, monthText)]);
}

function handleLatestCommand_(event, limit) {
  const safeLimit = Math.min(Math.max(parseInt(limit || 1, 10) || 1, 1), 10);
  const records = getRecentExpenseRecords_(getConversationKey_(event.source), safeLimit);
  const title = safeLimit === 1 ? "รายการล่าสุด" : `ล่าสุด ${safeLimit} รายการ`;
  if (!records.length) {
    replyText(event.replyToken, buildRecentRecordsMessage_(records, title));
    return;
  }
  sendLineMessages(event.replyToken, [
    safeLimit === 1
      ? buildLatestTransactionCard(records[0])
      : buildLatestTransactionsCarousel(records)
  ]);
}

function handlePendingReviewCommand_(event) {
  const records = getPendingReviewTransactions_(5);
  if (!records.length) {
    replyText(event.replyToken, [
      "รายการรอยืนยัน",
      "────────────",
      "ไม่พบรายการที่รอตรวจสอบ"
    ].join("\n"));
    return;
  }

  sendLineMessages(event.replyToken, records.slice(0, 5).map(buildPendingReviewCard));
}

function handleEditLatestCommand_(event, field, value) {
  const result = updateLatestExpenseRecord_(getConversationKey_(event.source), field, value, {
    lineUserId: event.source && event.source.userId || ""
  });
  if (result && result.oldRecord) {
    forgetReceiptProcessCacheForRecord_(result.oldRecord);
  }
  if (result && result.record) {
    forgetReceiptProcessCacheForRecord_(result.record);
  }
  replyText(event.replyToken, buildEditLatestMessage_(result));
}

function handleDeleteLatestCommand_(event) {
  if (!checkAdminUser_(event)) {
    replyText(event.replyToken, "คำสั่งลบข้อมูลใช้ได้เฉพาะผู้ดูแลระบบครับ");
    return;
  }

  const records = getRecentExpenseRecords_(getConversationKey_(event.source), 1);
  if (!records.length) {
    replyText(event.replyToken, buildDeleteLatestMessage_(null));
    return;
  }
  savePendingDeleteLatest_(event.source, records[0]);
  replyText(event.replyToken, buildDeleteLatestConfirmMessage_(records[0]), [
    "ลบล่าสุด ยืนยัน",
    "รายการล่าสุด",
    "help"
  ]);
}

function handleDeleteLatestConfirmCommand_(event) {
  if (!checkAdminUser_(event)) {
    replyText(event.replyToken, "คำสั่งลบข้อมูลใช้ได้เฉพาะผู้ดูแลระบบครับ");
    return;
  }

  const pendingDelete = getPendingDeleteLatest_(event.source);
  if (!pendingDelete || !pendingDelete.documentName) {
    replyText(event.replyToken, "ไม่มีรายการรอยืนยันลบ\nพิมพ์ `ลบล่าสุด` เพื่อดูรายการก่อน");
    return;
  }
  const result = deleteExpenseRecordByDocumentName_(pendingDelete.documentName, {
    lineUserId: event.source && event.source.userId || ""
  });
  if (result && result.record) {
    forgetReceiptProcessCacheForRecord_(result.record);
  }
  clearPendingDeleteLatest_(event.source);
  replyText(event.replyToken, buildDeleteLatestMessage_(result));
}

function handleManualLaborCommand_(event, amount, job, rawDate, note) {
  processManualLabor(event, amount, job, rawDate, note);
}


