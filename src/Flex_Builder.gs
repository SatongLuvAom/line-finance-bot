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
              {
                type: "separator",
                margin: "md",
                color: "#E5E7EB"
              },
              flexRow("หมายเหตุ", data.note || "-")
            ]
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


function getReceiptItemPreview_(items) {
  const text = String(items || "-");
  const match = text.match(/\[(.*?)\]/);
  return match ? match[0] : text;
}


function flexRow(label, value, isHighlight) {
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
        color: highlight ? "#B42318" : "#111827",
        weight: highlight ? "bold" : "regular",
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


