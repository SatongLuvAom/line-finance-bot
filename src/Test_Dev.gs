/**
 * Test_Dev.gs
 * Safe developer helpers. Functions avoid LINE replies unless a caller explicitly sends a real event.
 */

function reauthorizeProject() {
  logInfo_("reauthorize", { ok: true });
}

function testTextCommand_() {
  return buildHelpMessage_();
}

function testReceiptJsonParse_() {
  const sample = {
    type: "expense",
    date: "2026-04-09",
    merchant: "นาย ตัวอย่าง",
    amount: 6208,
    category: "ค่าแรง",
    job: "งานทั่วไป",
    items: "ค่าแรง_W1_เม.ย._งานบูธA",
    note: "ค่าแรง_W1_เม.ย._งานบูธA"
  };
  return normalizeReceiptData(sample);
}

function testManualLabor_() {
  const formattedDate = parseThaiDateToYMD("09/04/2026");
  return {
    date: formattedDate,
    week: getWeekOfMonth(formattedDate),
    month: getMonthThai(formattedDate),
    job: buildLaborJobName_("1", "เมษายน")
  };
}

function testFactoryExpenseNote_() {
  const sample = {
    type: "expense",
    date: "2026-04-09",
    merchant: "ปั๊มน้ำมันตัวอย่าง",
    amount: 1200,
    category: "อื่นๆ",
    job: "งานทั่วไป",
    items: "ค่าขนส่ง_โรงงาน_ค่าน้ำมันมาโรงงาน",
    note: "ค่าขนส่ง_โรงงาน_ค่าน้ำมันมาโรงงาน"
  };
  return normalizeReceiptData(sample);
}

function testNonLaborLaborFields_() {
  const record = normalizeReceiptData({
    type: "expense",
    date: "2026-05-06",
    merchant: "ร้านสีตัวอย่าง",
    amount: 2500,
    category: "อื่นๆ",
    job: "งานทั่วไป",
    items: "วัสดุ_สีเทา_งานแมว",
    note: "วัสดุ_สีเทา_งานแมว"
  });

  return {
    ok: record.category !== LABOR_CATEGORY_NAME && !record.laborWeek && !record.laborMonth,
    record: record
  };
}

function testReceiptMetadata_() {
  const record = finalizeRecordMetadata_({
    type: "expense",
    date: "2026-05-06",
    merchant: "ร้านตัวอย่าง",
    amount: 100,
    category: "อื่นๆ",
    job: "งานทั่วไป",
    items: "ทดสอบ",
    note: "",
    ocrRawText: "raw text",
    ocrConfidence: 0.95,
    parsedAt: "2026-05-06T01:00:00.000Z",
    normalizedAt: "2026-05-06T01:00:01.000Z"
  }, {
    sourceMessageId: "line_msg_1",
    lineUserId: "U_TEST",
    displayName: "Tester",
    attachmentUrl: "https://example.com/file.jpg",
    attachmentPath: "receipts/2026/05/line_msg_1.jpg"
  });

  return {
    ok:
      record.source === RECORD_SOURCE_LINE_BOT &&
      record.status === RECORD_STATUS_IMPORTED &&
      record.createdByLineUserId === "U_TEST" &&
      record.createdFromLineMessageId === "line_msg_1" &&
      record.storageUrl === "https://example.com/file.jpg" &&
      record.storagePath === "receipts/2026/05/line_msg_1.jpg" &&
      record.duplicateStatus === DUPLICATE_STATUS_UNIQUE,
    record: record
  };
}

function testMasterDataAliases_() {
  return {
    job: normalizeJobAlias_("Factory"),
    category: normalizeCategory("ค่าเดินทาง"),
    item: normalizeItemAlias_("fuel"),
    merchant: normalizeMerchantAlias_("ร้านตัวอย่าง")
  };
}

function testStructuredNoteJobParsing_() {
  return {
    categoryFirst: normalizeReceiptData({
      type: "expense",
      date: "2026-05-04",
      merchant: "ร้านตัวอย่าง",
      amount: 100,
      category: "อื่นๆ",
      job: "งานทั่วไป",
      items: "วัสดุ_งานแมว",
      note: "วัสดุ_งานแมว"
    }),
    jobFirst: normalizeReceiptData({
      type: "expense",
      date: "2026-05-04",
      merchant: "ร้านตัวอย่าง",
      amount: 100,
      category: "อื่นๆ",
      job: "งานทั่วไป",
      items: "งานแมว_วัสดุ",
      note: "งานแมว_วัสดุ"
    }),
    itemFirst: normalizeReceiptData({
      type: "expense",
      date: "2026-05-04",
      merchant: "ร้านตัวอย่าง",
      amount: 100,
      category: "อื่นๆ",
      job: "งานทั่วไป",
      items: "เหล็ก_งานแมว",
      note: "เหล็ก_งานแมว"
    }),
    categoryItemJob: normalizeReceiptData({
      type: "expense",
      date: "2026-05-04",
      merchant: "ร้านตัวอย่าง",
      amount: 100,
      category: "อื่นๆ",
      job: "งานทั่วไป",
      items: "วัสดุ_สีเทา_งานแมว",
      note: "วัสดุ_สีเทา_งานแมว"
    })
  };
}

function testOutgoingSlipTypeGuard_() {
  return {
    outgoingWithWrongAiType: normalizeReceiptData({
      type: "income",
      date: "2026-05-06",
      merchant: "YUPPIE",
      amount: 2500,
      category: "อื่นๆ",
      job: "งานทั่วไป",
      items: "วัสดุ_สีเทา_งานแมว",
      note: "วัสดุ_สีเทา_งานแมว",
      bank: {
        is_transfer_slip: true,
        sender_account_name: "YUPPIE",
        receiver_account_name: "ร้านสีตัวอย่าง",
        remarks: "วัสดุ_สีเทา_งานแมว"
      }
    }),
    incomingCustomerPayment: normalizeReceiptData({
      type: "income",
      date: "2026-05-06",
      merchant: "ลูกค้าตัวอย่าง",
      amount: 100000,
      category: "ค่างวดงาน",
      job: "งานแมว",
      items: "รับค่างวด",
      note: "รับค่างวด",
      bank: {
        is_transfer_slip: true,
        sender_account_name: "ลูกค้าตัวอย่าง",
        receiver_account_name: "YUPPIE",
        remarks: "รับค่างวดงานแมว"
      }
    })
  };
}

function testFirestoreSave_() {
  if (getOptionalProperty_("ENABLE_DEV_WRITES", "") !== "true") {
    return "Skipped. Set ENABLE_DEV_WRITES=true to allow test writes.";
  }
  return saveToFirestore({
    type: "expense",
    date: formatDateToYMD(new Date()),
    merchant: "DEV_TEST",
    amount: 1,
    category: "อื่นๆ",
    items: "dev test",
    note: "",
    job: "งานทดสอบ",
    laborWeek: "",
    laborMonth: "",
    sourceKey: "dev",
    sourceMessageId: "dev_" + Date.now(),
    sourceMimeType: "manual",
    attachmentUrl: "",
    attachmentPath: "",
    attachmentMimeType: ""
  });
}

function testSheetSave_() {
  if (getOptionalProperty_("ENABLE_DEV_WRITES", "") !== "true") {
    return "Skipped. Set ENABLE_DEV_WRITES=true to allow test writes.";
  }
  saveToSheet({
    type: "expense",
    date: formatDateToYMD(new Date()),
    merchant: "DEV_TEST",
    category: "อื่นๆ",
    job: "งานทดสอบ",
    amount: 1,
    items: "dev test",
    note: "",
    laborWeek: "",
    laborMonth: "",
    attachmentUrl: "",
    attachmentPath: "",
    attachmentMimeType: ""
  });
  return "OK";
}

function mockLineEvent_(text) {
  return {
    type: "message",
    replyToken: "mock_reply_token",
    source: { type: "user", userId: "mock_user" },
    message: { type: "text", text: String(text || "help") }
  };
}


function testExpenseQueryKeys_() {
  return buildExpenseQueryKeys_({
    type: "expense",
    date: "2026-04-09",
    merchant: "นาย สมชาย",
    amount: 6208,
    category: LABOR_CATEGORY_NAME,
    job: buildLaborJobName_("1", "เมษายน"),
    items: "[สัปดาห์ที่ 1 เดือน เมษายน] ค่าแรง",
    laborWeek: "1",
    laborMonth: "เมษายน",
    status: RECORD_STATUS_IMPORTED,
    createdByLineUserId: "U_TEST"
  });
}


function testExpenseQueryBuilder_() {
  return {
    where: buildCompositeFilter([
      { field: "isActive", value: true },
      { field: "monthKey", value: "2026-04" }
    ]),
    orderBy: buildOrderBy([
      { field: "occurredAt", direction: "DESCENDING" }
    ])
  };
}

