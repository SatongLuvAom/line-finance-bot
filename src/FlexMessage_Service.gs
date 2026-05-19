/**
 * FlexMessage_Service.gs
 * Safe LINE Flex Message builders with plain text fallback.
 */

function buildPendingReviewCard(transaction) {
  return buildFlexOrPlainText_("pending_review", transaction, function() {
    const record = normalizeLineCardTransaction_(transaction);
    const bubble = buildTransactionBubble_(record, {
      title: "รายการรอยืนยัน",
      subtitle: "ตรวจข้อมูลก่อนบันทึกถาวร",
      headerColor: "#92400E",
      includeSheetSync: false,
      includeOcrConfidence: true,
      footerButtons: [
        buildMessageButton_("ยืนยัน", "ยืนยันรายการล่าสุด", "primary"),
        buildMessageButton_("แก้ไข", "แก้ล่าสุด หมวด ค่าแรง", "secondary"),
        buildMessageButton_("ยกเลิก", "ลบล่าสุด", "secondary")
      ]
    });

    return withQuickReply_({
      type: "flex",
      altText: truncateText_("รายการรอยืนยัน " + record.amountText, 300),
      contents: bubble
    }, ["ยืนยันรายการล่าสุด", "แก้ล่าสุด หมวด ค่าแรง", "ลบล่าสุด", "help"]);
  });
}


function buildBudgetSummaryCard(summary, options) {
  return buildFlexOrPlainText_("budget_summary", {
    summary: summary || {},
    options: options || {}
  }, function() {
    const safeSummary = normalizeBudgetSummaryForCard_(summary, options);
    if (!safeSummary.count) {
      return buildPlainTextFallback("budget_summary", {
        summary: summary || {},
        options: options || {}
      });
    }

    const status = getBudgetSummaryStatus_(safeSummary);
    const headerColor = safeSummary.summaryType === "factory" ? "#0F766E" : "#1D4ED8";
    const contents = [
      buildCardMetricRow_("ช่วงเวลา", safeSummary.periodLabel),
      buildCardMetricRow_("รายรับ", formatCurrency_(safeSummary.totalIncome)),
      buildCardMetricRow_("รายจ่าย", formatCurrency_(safeSummary.totalExpense)),
      buildCardMetricRow_("ค่าแรง", formatCurrency_(safeSummary.laborExpense)),
      buildCardMetricRow_("สุทธิ", formatCurrency_(safeSummary.net), true),
      buildCardMetricRow_("จำนวนรายการ", String(safeSummary.count)),
      buildCardMetricRow_("สถานะ", status.label)
    ];

    return {
      type: "flex",
      altText: truncateText_(safeSummary.label + " " + safeSummary.netText, 300),
      contents: {
        type: "bubble",
        size: "mega",
        header: buildCardHeader_("YUPPIE SUMMARY", safeSummary.label, headerColor),
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          paddingAll: "20px",
          contents: [
            {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              backgroundColor: "#F8FAFC",
              paddingAll: "14px",
              cornerRadius: "12px",
              borderColor: "#E2E8F0",
              borderWidth: "1px",
              contents: contents
            },
            buildTopCategoryBox_(safeSummary.categoryMap)
          ].filter(Boolean)
        },
        footer: buildCardFooter_("พิมพ์ `รายการล่าสุด` หรือ `ล่าสุด 5` เพื่อดูรายละเอียด")
      }
    };
  });
}


function buildLatestTransactionCard(transaction) {
  return buildFlexOrPlainText_("latest_transaction", transaction, function() {
    const record = normalizeLineCardTransaction_(transaction);
    return withQuickReply_({
      type: "flex",
      altText: truncateText_("รายการล่าสุด " + record.amountText, 300),
      contents: buildTransactionBubble_(record, {
        title: "รายการล่าสุด",
        subtitle: record.status || "IMPORTED",
        headerColor: "#BE123C",
        includeSheetSync: true,
        includeOcrConfidence: false,
        footerButtons: [
          buildMessageButton_("แก้หมวด", "แก้ล่าสุด หมวด ค่าแรง", "secondary"),
          buildMessageButton_("แก้งาน", "แก้ล่าสุด งาน งานบูธA", "secondary")
        ]
      })
    }, ["แก้ล่าสุด หมวด ค่าแรง", "แก้ล่าสุด งาน งานบูธA", "ล่าสุด 5", "help"]);
  });
}


function buildLatestTransactionsCarousel(transactions) {
  return buildFlexOrPlainText_("latest_transactions", transactions || [], function() {
    const records = (transactions || []).slice(0, 10).map(normalizeLineCardTransaction_);
    if (!records.length) {
      return buildPlainTextFallback("latest_transactions", records);
    }

    if (records.length === 1) {
      return buildLatestTransactionCard(records[0]);
    }

    return withQuickReply_({
      type: "flex",
      altText: "ล่าสุด " + records.length + " รายการ",
      contents: {
        type: "carousel",
        contents: records.map(function(record, index) {
          return buildTransactionBubble_(record, {
            title: "ล่าสุด #" + (index + 1),
            subtitle: record.status || "IMPORTED",
            headerColor: "#BE123C",
            includeSheetSync: true,
            includeOcrConfidence: false,
            compact: true
          });
        })
      }
    }, ["รายการล่าสุด", "แก้ล่าสุด หมวด ค่าแรง", "help"]);
  });
}


function buildErrorCard(errorInfo) {
  return buildFlexOrPlainText_("error", errorInfo || {}, function() {
    const safeInfo = errorInfo || {};
    const errorId = String(safeInfo.errorId || createErrorId_());
    const commandName = String(safeInfo.commandName || "unknown_command");
    const safeMessage = truncateText_(buildUserFriendlyErrorMessage_(safeInfo.safeErrorMessage || safeInfo.message || "เกิดข้อผิดพลาด"), 180);

    return {
      type: "flex",
      altText: "เกิดข้อผิดพลาด " + errorId,
      contents: {
        type: "bubble",
        size: "mega",
        header: buildCardHeader_("YUPPIE ERROR", "เกิดข้อผิดพลาด", "#B91C1C"),
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "20px",
          contents: [
            buildCardMetricRow_("คำสั่ง", commandName),
            buildCardMetricRow_("รหัส", errorId, true),
            buildCardMetricRow_("รายละเอียด", safeMessage)
          ]
        },
        footer: buildCardFooter_("ส่งรหัสนี้ให้ผู้ดูแลระบบเพื่อตรวจ log")
      }
    };
  });
}


function buildPlainTextFallback(type, data) {
  const cardType = String(type || "").trim();

  if (cardType === "budget_summary") {
    const payload = data || {};
    const summary = payload.summary || payload || {};
    const options = payload.options || {};
    const label = options.label || summary.title || "สรุปงบ";
    return formatBudgetSummary(summary, label);
  }

  if (cardType === "latest_transaction") {
    const record = normalizeLineCardTransaction_(data || {});
    return {
      type: "text",
      text: [
        "รายการล่าสุด",
        "────────────",
        formatLineCardTransactionText_(record),
        "แก้ได้ เช่น `แก้ล่าสุด หมวด ค่าแรง`"
      ].join("\n")
    };
  }

  if (cardType === "latest_transactions") {
    const records = (data || []).map(normalizeLineCardTransaction_);
    if (!records.length) {
      return {
        type: "text",
        text: "ล่าสุด 5 รายการ\n────────────\nไม่พบรายการในแชตนี้"
      };
    }

    return {
      type: "text",
      text: ["ล่าสุด " + records.length + " รายการ", "────────────"].concat(records.map(function(record, index) {
        return (index + 1) + ". " + formatLineCardTransactionText_(record);
      })).join("\n")
    };
  }

  if (cardType === "pending_review") {
    const pendingRecord = normalizeLineCardTransaction_(data || {});
    return {
      type: "text",
      text: [
        "รายการรอยืนยัน",
        "────────────",
        formatLineCardTransactionText_(pendingRecord),
        pendingRecord.note ? "หมายเหตุ: " + pendingRecord.note : "",
        pendingRecord.ocrConfidenceText ? "OCR: " + pendingRecord.ocrConfidenceText : "",
        "",
        "คำสั่งที่ใช้ต่อ:",
        "ยืนยันรายการล่าสุด",
        "แก้ล่าสุด หมวด ค่าแรง",
        "ลบล่าสุด"
      ].filter(Boolean).join("\n")
    };
  }

  if (cardType === "error") {
    const safeInfo = data || {};
    return {
      type: "text",
      text: [
        "เกิดข้อผิดพลาดระหว่างประมวลผล",
        "คำสั่ง: " + String(safeInfo.commandName || "unknown_command"),
        "รหัสอ้างอิง: " + String(safeInfo.errorId || createErrorId_()),
        truncateText_(buildUserFriendlyErrorMessage_(safeInfo.safeErrorMessage || safeInfo.message || ""), 180)
      ].filter(Boolean).join("\n")
    };
  }

  return {
    type: "text",
    text: "ไม่สามารถสร้างการ์ดได้"
  };
}


function buildReceiptDuplicatePlainTextFallback_(data) {
  const payload = data || {};
  const record = normalizeLineCardTransaction_(payload.record || {});
  return {
    type: "text",
    text: [
      "สลิปนี้เคยบันทึกแล้ว",
      "────────────",
      "สถานะ: ไม่บันทึกซ้ำ",
      "ยอดเงิน: " + (record.amountText || "-"),
      "งาน: " + (record.job || "-"),
      "ร้าน/ผู้รับ: " + (record.merchant || "-"),
      "วันที่: " + (record.date || "-")
    ].join("\n")
  };
}


function buildFlexOrPlainText_(type, data, builder) {
  try {
    const message = builder();
    if (!message || !message.type) {
      throw new Error("Flex builder returned invalid LINE message");
    }
    return message;
  } catch (err) {
    logError_("flexMessage.buildFallback." + String(type || "unknown"), err);
    if (String(type || "") === "receipt_duplicate") {
      return buildReceiptDuplicatePlainTextFallback_(data);
    }
    return buildPlainTextFallback(type, data);
  }
}


function normalizeLineCardTransaction_(transaction) {
  const safeRecord = transaction || {};
  const type = String(safeRecord.type || "expense").toLowerCase() === "income" ? "income" : "expense";
  const amount = Number(safeRecord.amount || 0);
  const category = String(safeRecord.categoryName || safeRecord.category || "ไม่ระบุหมวด").trim() || "ไม่ระบุหมวด";
  const merchant = String(safeRecord.vendorName || safeRecord.merchant || "ไม่ระบุร้าน").trim() || "ไม่ระบุร้าน";
  const job = String(safeRecord.jobName || safeRecord.jobNameNormalized || safeRecord.job || "ไม่ระบุงาน").trim() || "ไม่ระบุงาน";
  const occurredAt = String(safeRecord.occurredAt || safeRecord.date || safeRecord.createdAt || "ไม่ระบุวันที่").trim() || "ไม่ระบุวันที่";
  const ocrConfidence = Number(safeRecord.ocrConfidence || 0);

  return {
    documentName: String(safeRecord.documentName || ""),
    type: type,
    typeLabel: type === "income" ? "รายรับ" : (category === LABOR_CATEGORY_NAME ? "ค่าแรง" : "รายจ่าย"),
    amount: amount,
    amountText: formatCurrency_(amount),
    category: category,
    merchant: merchant,
    job: job,
    date: occurredAt.length >= 10 ? occurredAt.slice(0, 10) : occurredAt,
    note: String(safeRecord.note || safeRecord.items || "").trim(),
    items: String(safeRecord.items || "").trim(),
    status: String(safeRecord.status || RECORD_STATUS_IMPORTED).trim() || RECORD_STATUS_IMPORTED,
    sheetSyncStatus: String(safeRecord.sheetSyncStatus || "-").trim() || "-",
    ocrConfidence: ocrConfidence,
    ocrConfidenceText: ocrConfidence > 0 ? Math.round(ocrConfidence * 100) + "%" : "",
    parseMethod: String(safeRecord.parseMethod || "").trim(),
    parserConfidence: normalizeParserConfidence_(safeRecord.parserConfidence || 0),
    parserConfidenceText: Number(safeRecord.parserConfidence || 0) > 0
      ? Math.round(normalizeParserConfidence_(safeRecord.parserConfidence) * 100) + "%"
      : "",
    missingFieldsText: Array.isArray(safeRecord.missingFields)
      ? safeRecord.missingFields.join(", ")
      : String(safeRecord.missingFields || "")
  };
}


function normalizeBudgetSummaryForCard_(summary, options) {
  const safeSummary = summary || {};
  const safeOptions = options || {};
  const categoryMap = safeSummary.categoryMap || {};
  const totalIncome = Number(safeSummary.totalIncome || 0);
  const totalExpense = Number(safeSummary.totalExpense || 0);
  const net = Number(safeSummary.net !== undefined ? safeSummary.net : totalIncome - totalExpense);
  const laborExpense = Number(categoryMap[LABOR_CATEGORY_NAME] || categoryMap["ค่าแรง"] || 0);

  return {
    label: String(safeOptions.label || safeSummary.title || "สรุปงบ"),
    periodLabel: String(safeOptions.periodLabel || (safeSummary.monthKey ? "เดือน " + safeSummary.monthKey : "ทั้งงาน")),
    summaryType: String(safeOptions.summaryType || "").toLowerCase(),
    count: Number(safeSummary.count || 0),
    totalIncome: totalIncome,
    totalExpense: totalExpense,
    laborExpense: laborExpense,
    net: net,
    netText: formatCurrency_(net),
    categoryMap: categoryMap
  };
}


function buildTransactionBubble_(record, options) {
  const safeOptions = options || {};
  const rows = [
    buildCardMetricRow_("ประเภท", record.typeLabel),
    buildCardMetricRow_("ยอดเงิน", record.amountText, true),
    buildCardMetricRow_("หมวด", record.category),
    buildCardMetricRow_("งาน", record.job),
    buildCardMetricRow_("ร้าน/ผู้รับ", record.merchant),
    buildCardMetricRow_("วันที่", record.date)
  ];

  if (safeOptions.includeSheetSync) {
    rows.push(buildCardMetricRow_("Sync Sheet", record.sheetSyncStatus));
  }

  if (record.note) {
    rows.push(buildCardMetricRow_("หมายเหตุ", truncateText_(record.note, safeOptions.compact ? 60 : 120)));
  }

  if (record.parseMethod) {
    rows.push(buildCardMetricRow_("วิธีอ่าน", getReceiptParseMethodLabel_(record.parseMethod)));
  }

  if (record.parserConfidenceText) {
    rows.push(buildCardMetricRow_("ความมั่นใจ", record.parserConfidenceText));
  }

  if (record.missingFieldsText) {
    rows.push(buildCardMetricRow_("ข้อมูลที่ขาด", record.missingFieldsText));
  }

  if (safeOptions.includeOcrConfidence && record.ocrConfidenceText) {
    rows.push(buildCardMetricRow_("OCR", record.ocrConfidenceText));
  }

  const bubble = {
    type: "bubble",
    size: safeOptions.compact ? "kilo" : "mega",
    header: buildCardHeader_("YUPPIE", safeOptions.title || "รายการ", safeOptions.headerColor || "#BE123C", safeOptions.subtitle || ""),
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: safeOptions.compact ? "14px" : "20px",
      contents: rows
    }
  };

  if (safeOptions.footerButtons && safeOptions.footerButtons.length) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "14px",
      contents: safeOptions.footerButtons.slice(0, 3)
    };
  }

  return bubble;
}


function buildCardHeader_(eyebrow, title, color, subtitle) {
  const contents = [
    {
      type: "text",
      text: truncateText_(String(eyebrow || "YUPPIE"), 40),
      color: "#E0F2FE",
      size: "xs",
      weight: "bold"
    },
    {
      type: "text",
      text: truncateText_(String(title || "-"), 80),
      color: "#FFFFFF",
      size: "xl",
      weight: "bold",
      margin: "md",
      wrap: true
    }
  ];

  if (subtitle) {
    contents.push({
      type: "text",
      text: truncateText_(String(subtitle), 80),
      color: "#E2E8F0",
      size: "xs",
      margin: "sm",
      wrap: true
    });
  }

  return {
    type: "box",
    layout: "vertical",
    backgroundColor: color || "#1D4ED8",
    paddingAll: "18px",
    contents: contents
  };
}


function buildCardFooter_(text) {
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "16px",
    paddingTop: "0px",
    contents: [
      {
        type: "text",
        text: String(text || "YUPPIE Financial Management System"),
        color: "#94A3B8",
        size: "xs",
        align: "center",
        wrap: true
      }
    ]
  };
}


function buildCardMetricRow_(label, value, isHighlight) {
  return {
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      {
        type: "text",
        text: truncateText_(String(label || "-"), 30),
        color: "#64748B",
        size: "sm",
        flex: 4
      },
      {
        type: "text",
        text: truncateText_(String(value || "-"), 160),
        color: isHighlight ? "#BE123C" : "#0F172A",
        size: isHighlight ? "md" : "sm",
        weight: isHighlight ? "bold" : "regular",
        flex: 7,
        align: "end",
        wrap: true
      }
    ]
  };
}


function buildTopCategoryBox_(categoryMap) {
  const safeMap = categoryMap || {};
  const keys = Object.keys(safeMap).sort(function(a, b) {
    return Number(safeMap[b] || 0) - Number(safeMap[a] || 0);
  }).slice(0, 5);

  if (!keys.length) {
    return null;
  }

  return {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    margin: "md",
    contents: [
      {
        type: "text",
        text: "รายจ่ายแยกหมวด",
        color: "#334155",
        size: "sm",
        weight: "bold"
      }
    ].concat(keys.map(function(category) {
      return buildCardMetricRow_(category, formatCurrency_(safeMap[category]));
    }))
  };
}


function buildMessageButton_(label, text, style) {
  const commandText = ensureCommandPrefix_(String(text || label || "-"));
  return {
    type: "button",
    style: style || "secondary",
    height: "sm",
    action: {
      type: "message",
      label: truncateText_(String(label || "-"), 20),
      text: truncateText_(commandText, 300)
    }
  };
}


function withQuickReply_(message, quickReplyTexts) {
  const safeMessage = message || {};
  const quickReply = buildQuickReplyFromActions_(quickReplyTexts || []);
  if (quickReply) {
    safeMessage.quickReply = quickReply;
  }
  return safeMessage;
}


function buildQuickReplyFromActions_(texts) {
  const items = (texts || []).slice(0, 13).map(function(text) {
    const value = ensureCommandPrefix_(text);
    if (!value) return null;
    return {
      type: "action",
      action: {
        type: "message",
        label: truncateText_(value, 20),
        text: truncateText_(value, 300)
      }
    };
  }).filter(Boolean);

  return items.length ? { items: items } : null;
}


function getBudgetSummaryStatus_(summary) {
  const safeSummary = summary || {};
  if (!safeSummary.count) {
    return { label: "ไม่มีข้อมูล", color: "#64748B" };
  }

  if (safeSummary.summaryType === "job" && safeSummary.totalIncome > 0 && safeSummary.net < 0) {
    return { label: "ขาดทุน", color: "#B91C1C" };
  }

  return { label: "ปกติ", color: "#0F766E" };
}


function formatLineCardTransactionText_(record) {
  const safeRecord = record || {};
  return [
    "[" + (safeRecord.typeLabel || "-") + "]",
    safeRecord.date || "-",
    safeRecord.merchant || "-",
    safeRecord.category || "-",
    safeRecord.amountText || formatCurrency_(safeRecord.amount || 0)
  ].join(" | ");
}
