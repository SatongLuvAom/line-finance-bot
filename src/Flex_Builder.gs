/**
 * Flex_Builder.gs
 * LINE Flex Message builders.
 */

function createReceiptFlex(data) {
  const isIncome = String(data.type || "expense") === "income";
  const headerColor = isIncome ? "#0F766E" : "#B42318";
  const headerSubColor = isIncome ? "#CCFBF1" : "#FEE4E2";
  const headerTitle = isIncome ? "ยืนยันการบันทึกรายรับ" : "ยืนยันการบันทึกค่าใช้จ่าย";
  const altLabel = isIncome ? "บันทึกรายรับ" : "บันทึกรายจ่าย";
  const typeLabel = isIncome ? "รายรับ" : "รายจ่าย";
  const typeBadgeColor = isIncome ? "#0F766E" : "#B42318";
  const amountText = "฿" + Number(data.amount || 0).toLocaleString();
  return {
    type: "flex",
    altText: `${altLabel} ${data.merchant} ${data.amount} บาท`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: headerColor,
        paddingAll: "20px",
        paddingBottom: "15px",
        contents: [
          {
            type: "text",
            text: "YUPPIE FINANCE",
            color: headerSubColor,
            size: "xs",
            weight: "bold"
          },
          {
            type: "text",
            text: headerTitle,
            weight: "bold",
            size: "xl",
            color: "#FFFFFF",
            margin: "md",
            wrap: true
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        paddingAll: "20px",
        contents: [
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            backgroundColor: "#F8FAFC",
            paddingAll: "16px",
            cornerRadius: "8px",
            borderColor: "#E2E8F0",
            borderWidth: "1px",
            contents: [
              {
                type: "text",
                text: typeLabel,
                size: "xs",
                color: typeBadgeColor,
                weight: "bold"
              },
              {
                type: "text",
                text: amountText,
                size: "xxl",
                color: "#111827",
                weight: "bold",
                margin: "xs"
              },
              { type: "text", text: data.merchant || "-", size: "sm", color: "#475569", wrap: true }
            ]
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              flexRow("วันที่", data.date),
              flexRow("หมวด", data.category),
              flexRow("งาน", data.job),
              flexRow("รายการ", getReceiptItemPreview_(data.items)),
              data.missingFields && data.missingFields.length ? flexRow("ข้อมูลที่ขาด", data.missingFields.join(", ")) : null,
              {
                type: "separator",
                margin: "md",
                color: "#E5E7EB"
              },
              flexRow("หมายเหตุ", data.note || "-")
            ].filter(Boolean)
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        paddingTop: "0px",
        contents: [
          {
            type: "text",
            text: "YUPPIE Financial Management",
            color: "#A0A0A0",
            size: "xs",
            align: "center"
          }
        ]
      }
    }
  };
}

function getReceiptParseMethodLabel_(parseMethod) {
  const method = String(parseMethod || "").trim();
  const labels = {
    TEXT_RULE: "Rule",
    CAPTION_RULE: "Caption Rule",
    OCR_RULE: "OCR Rule",
    QR_RULE: "QR Rule",
    GEMINI: "Gemini",
    MANUAL: "Manual"
  };
  return labels[method] || method || "-";
}


function getReceiptItemPreview_(items) {
  const text = String(items || "-");
  const match = text.match(/\[(.*?)\]/);
  return match ? match[0] : text;
}

function buildReceiptSavedFlexCard(transaction) {
  try {
    const record = transaction || {};
    const typeLabel = getReceiptTransactionTypeLabel_(record);
    const isIncome = String(record.type || "expense") === "income";
    const themeColor = isIncome ? "#0F766E" : "#B42318";
    const themeSoftColor = isIncome ? "#ECFDF5" : "#FEF3F2";
    const themeBorderColor = isIncome ? "#A7F3D0" : "#FECDCA";
    const themeHeaderSubColor = isIncome ? "#CCFBF1" : "#FEE4E2";
    const status = String(record.status || RECORD_STATUS_IMPORTED);
    const isIncomplete = status === RECORD_STATUS_PARSE_INCOMPLETE;
    const needsReview = status === RECORD_STATUS_NEEDS_REVIEW || status === RECORD_STATUS_PENDING_REVIEW;
    const title = isIncomplete
      ? "อ่านสลิปได้ไม่ครบ"
      : (needsReview ? "อ่านสลิปแล้ว รอตรวจสอบ" : "บันทึกสลิปเรียบร้อยแล้ว");
    const headerColor = isIncomplete ? "#B42318" : (needsReview ? "#B45309" : themeColor);
    const footerText = isIncomplete || needsReview
      ? "รายการนี้ยังไม่ถูกนับในสรุปงบจนกว่าจะแก้ไขและยืนยันข้อมูล"
      : "บันทึกข้อมูลเรียบร้อย พร้อมใช้ในรายงานการเงินและการติดตามงบประมาณ";
    const shortReference = buildShortTransactionReference_(record);

    const missingFields = normalizeStringList_(record.missingFields || []);
    const bodyContents = [
      shortReference ? flexRow("เลขอ้างอิง", shortReference, false, themeColor, true) : null,
      flexRow("ประเภท", typeLabel, false, themeColor, true),
      flexRow("ยอดเงิน", "฿" + Number(record.amount || 0).toLocaleString(), true, themeColor),
      flexRow("หมวด", record.category || record.categoryName || "ไม่ระบุหมวด"),
      flexRow("งาน", record.job || record.jobName || "-"),
      flexRow("ร้าน/ผู้รับ", record.merchant || record.vendorName || "ไม่ระบุร้าน"),
      flexRow("วันที่", record.date || record.occurredAt || "ไม่ระบุวันที่")
    ].filter(Boolean);

    if (missingFields.length) {
      bodyContents.push(flexRow("ข้อมูลที่ขาด", missingFields.join(", ")));
    }
    if (record.note) {
      bodyContents.push(flexRow("หมายเหตุ", record.note));
    }

    return {
      type: "flex",
      altText: truncateText_(title + " ฿" + Number(record.amount || 0).toLocaleString(), 300),
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: headerColor,
          paddingAll: "20px",
          paddingBottom: "15px",
          contents: [
            { type: "text", text: "YUPPIE FINANCE", color: themeHeaderSubColor, size: "xs", weight: "bold" },
            { type: "text", text: title, weight: "bold", size: "xl", color: "#FFFFFF", margin: "md", wrap: true }
          ]
        },
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
              backgroundColor: themeSoftColor,
              paddingAll: "16px",
              cornerRadius: "10px",
              borderColor: themeBorderColor,
              borderWidth: "1px",
              contents: bodyContents
            }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          paddingAll: "18px",
          paddingTop: "0px",
          contents: [
            { type: "text", text: footerText, color: "#64748B", size: "xs", align: "center", wrap: true }
          ]
        }
      }
    };
  } catch (err) {
    logError_("buildReceiptSavedFlexCard.error", err);
    return buildReceiptSavedPlainText(transaction);
  }
}


function buildReceiptSavedPlainText(transaction) {
  const record = transaction || {};
  const status = String(record.status || RECORD_STATUS_IMPORTED);
  const title = status === RECORD_STATUS_PARSE_INCOMPLETE
    ? "อ่านสลิปได้ไม่ครบ"
    : ((status === RECORD_STATUS_NEEDS_REVIEW || status === RECORD_STATUS_PENDING_REVIEW)
      ? "อ่านสลิปแล้ว รอตรวจสอบ"
      : "บันทึกสลิปเรียบร้อยแล้ว");

  return {
    type: "text",
    text: [
      title,
      "────────────",
      "ประเภท: " + getReceiptTransactionTypeLabel_(record),
      buildShortTransactionReference_(record) ? "เลขอ้างอิง: " + buildShortTransactionReference_(record) : "",
      "ยอดเงิน: ฿" + Number(record.amount || 0).toLocaleString(),
      "หมวด: " + String(record.category || record.categoryName || "ไม่ระบุหมวด"),
      "งาน: " + String(record.job || record.jobName || "-"),
      "ร้าน/ผู้รับ: " + String(record.merchant || record.vendorName || "ไม่ระบุร้าน"),
      "วันที่: " + String(record.date || record.occurredAt || "ไม่ระบุวันที่"),
      record.missingFields && normalizeStringList_(record.missingFields).length
        ? "ข้อมูลที่ขาด: " + normalizeStringList_(record.missingFields).join(", ")
        : "",
      status === RECORD_STATUS_PARSE_INCOMPLETE || status === RECORD_STATUS_NEEDS_REVIEW || status === RECORD_STATUS_PENDING_REVIEW
        ? "รายการนี้ยังไม่ถูกนับในสรุปงบ"
        : ""
    ].filter(Boolean).join("\n")
  };
}


function getReceiptTransactionTypeLabel_(record) {
  const safeRecord = record || {};
  if (String(safeRecord.category || "") === LABOR_CATEGORY_NAME) return "ค่าแรง";
  return String(safeRecord.type || "expense") === "income" ? "รายรับ" : "รายจ่าย";
}


function buildShortTransactionReference_(record) {
  const safeRecord = record || {};
  const type = getTransactionReferenceType_(safeRecord);
  const dateKey = getTransactionReferenceDateKey_(safeRecord);
  const rawId = String(
    safeRecord.shortReference ||
    safeRecord.transactionId ||
    safeRecord.documentName ||
    safeRecord.recordId ||
    ""
  ).trim();
  if (!rawId) return "";

  const documentId = rawId.split("/").filter(Boolean).pop() || rawId;
  const compactId = documentId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!compactId) return "";

  return [type, dateKey, compactId.slice(-5)].filter(Boolean).join("-");
}


function getTransactionReferenceType_(record) {
  const safeRecord = record || {};
  if (String(safeRecord.category || safeRecord.categoryName || "") === LABOR_CATEGORY_NAME) {
    return "LAB";
  }
  return String(safeRecord.type || "expense") === "income" ? "INC" : "EXP";
}


function getTransactionReferenceDateKey_(record) {
  const safeRecord = record || {};
  const rawDate = String(
    safeRecord.date ||
    safeRecord.occurredAt ||
    safeRecord.dateKey ||
    safeRecord.createdAt ||
    ""
  ).trim();
  if (!rawDate) return "";

  const ymdMatch = rawDate.match(/(\d{4})-?(\d{2})-?(\d{2})/);
  if (ymdMatch) {
    return ymdMatch[1] + ymdMatch[2] + ymdMatch[3];
  }

  const parsed = new Date(rawDate);
  if (isNaN(parsed.getTime())) {
    return "";
  }
  return formatDateToYMD(parsed).replace(/-/g, "");
}


function flexRow(label, value, isHighlight, valueColor, isBold) {
  const highlight = !!isHighlight;
  return {
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      {
        type: "text",
        text: label,
        color: "#64748B",
        size: "sm",
        flex: 3
      },
      {
        type: "text",
        text: String(value || "-"),
        wrap: true,
        size: highlight ? "md" : "sm",
        color: valueColor || (highlight ? "#B42318" : "#111827"),
        weight: highlight || isBold ? "bold" : "regular",
        flex: 7,
        align: "end"
      }
    ]
  };
}


function createLaborSummaryFlex(week, monthText, details, total) {
  const detailRows = details.map(function(item) {
    return flexRow(item.name, "฿" + Number(item.amount).toLocaleString());
  });

  return {
    type: "flex",
    altText: "สรุปค่าแรง สัปดาห์ที่ " + week + " " + monthText,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#4527A0",
        paddingAll: "20px",
        paddingBottom: "15px",
        contents: [
          { type: "text", text: "YUPPIE", color: "#D1C4E9", size: "sm", weight: "bold" },
          { type: "text", text: "สรุปค่าแรง", weight: "bold", size: "xl", color: "#FFFFFF", margin: "md" },
          { type: "text", text: "สัปดาห์ที่ " + week + " " + monthText, color: "#B39DDB", size: "sm", margin: "xs" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "sm",
        contents: detailRows.concat([
          { type: "separator", margin: "md", color: "#EDE7F6" },
          {
            type: "box",
            layout: "baseline",
            margin: "md",
            spacing: "sm",
            contents: [
              { type: "text", text: "รวม " + details.length + " รายการ", color: "#666666", size: "sm", flex: 5 },
              { type: "text", text: "฿" + Number(total).toLocaleString(), color: "#4527A0", size: "lg", weight: "bold", flex: 5, align: "end" }
            ]
          }
        ])
      }
    }
  };
}


function createProjectSummaryFlex(jobName, totalIncome, totalExpense, categoryMap) {
  const profit = totalIncome - totalExpense;
  const profitColor = profit >= 0 ? "#1B8C3E" : "#C62828";
  const profitSign = profit >= 0 ? "+" : "-";
  const profitText = profitSign + "฿" + Math.abs(profit).toLocaleString();

  const bodyContents = [];

  if (totalIncome > 0) {
    bodyContents.push(flexRow("รายรับ", "฿" + Number(totalIncome).toLocaleString()));
  }
  bodyContents.push(flexRow("รายจ่าย", "฿" + Number(totalExpense).toLocaleString()));

  if (totalIncome > 0) {
    bodyContents.push({
      type: "box",
      layout: "baseline",
      margin: "sm",
      spacing: "sm",
      contents: [
        { type: "text", text: "กำไร/ขาดทุน", color: "#888888", size: "sm", flex: 3 },
        { type: "text", text: profitText, color: profitColor, size: "md", weight: "bold", flex: 7, align: "end" }
      ]
    });
  }

  const categoryKeys = Object.keys(categoryMap);
  if (categoryKeys.length > 0) {
    bodyContents.push({ type: "separator", margin: "lg", color: "#EEEEEE" });
    bodyContents.push({ type: "text", text: "รายจ่ายแยกหมวด", color: "#AAAAAA", size: "xs", margin: "md" });
    categoryKeys.forEach(function(cat) {
      bodyContents.push(flexRow(cat, "฿" + Number(categoryMap[cat]).toLocaleString()));
    });
  }

  return {
    type: "flex",
    altText: "สรุปงบ " + jobName,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#01579B",
        paddingAll: "20px",
        paddingBottom: "15px",
        contents: [
          { type: "text", text: "YUPPIE", color: "#B3E5FC", size: "sm", weight: "bold" },
          { type: "text", text: "สรุปงบโปรเจกต์", weight: "bold", size: "xl", color: "#FFFFFF", margin: "md" },
          { type: "text", text: jobName, color: "#81D4FA", size: "sm", margin: "xs" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "sm",
        contents: bodyContents
      }
    }
  };
}


