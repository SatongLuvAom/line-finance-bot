/**
 * Command_Handler.gs
 * Text command handlers and command response builders.
 */

function handleTextMessage(event) {
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

  if (userText === "รายการล่าสุด" || userText === "ล่าสุด" || userText.toLowerCase() === "latest") {
    const records = getRecentExpenseRecords_(getConversationKey_(event.source), 1);
    replyText(replyToken, buildRecentRecordsMessage_(records, "รายการล่าสุด"));
    return;
  }

  const recentMatch = userText.match(/^ล่าสุด\s+(\d{1,2})$/i);
  if (recentMatch) {
    const limit = Math.min(Math.max(parseInt(recentMatch[1], 10) || 5, 1), 10);
    const records = getRecentExpenseRecords_(getConversationKey_(event.source), limit);
    replyText(replyToken, buildRecentRecordsMessage_(records, `ล่าสุด ${limit} รายการ`));
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
    const result = getProjectSummary(jobQuery);
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
    lines.push(`งาน: ${record.job || "-"}`);
    lines.push(`สาเหตุ: ${truncateText_(record.sheetSyncError || "-", 120)}`);
    lines.push("");
  });

  return lines.join("\n");
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

  return [
    "แก้รายการล่าสุดเรียบร้อย",
    "────────────",
    formatRecordOneLine_(result.record),
    `งาน: ${result.record.job || "-"}`,
    `รายการ: ${result.record.items || "-"}`,
    "",
    `Google Sheet: ${result.sheetUpdated ? "อัปเดตแล้ว" : "ไม่พบแถวเดิมที่ตรงกัน"}`
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
    "sync error",
    "รายการ duplicate",
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
  replyText(event.replyToken, buildRecentRecordsMessage_(records, title));
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


