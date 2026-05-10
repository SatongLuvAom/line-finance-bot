/**
 * AI_Engine.gs
 * LINE file loading, Gemini model calls, and Gemini JSON parsing.
 */

function fetchLineFileAsBase64(event) {
  try {
    const config = getConfig();
    const messageId = event.message.id;
    const isImage = event.message.type === "image";
    const mimeType = isImage ? "image/jpeg" : "application/pdf";
    const originalFileName = String(event.message.fileName || "").trim();

    const res = UrlFetchApp.fetch(
      `https://api-data.line.me/v2/bot/message/${messageId}/content`,
      {
        method: "get",
        headers: {
          Authorization: `Bearer ${config.lineToken}`
        },
        muteHttpExceptions: true
      }
    );

    const statusCode = res.getResponseCode();
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`ดึงไฟล์จาก LINE ไม่สำเร็จ HTTP ${statusCode}: ${res.getContentText()}`);
    }

    const blob = res.getBlob();
    const bytes = blob.getBytes();
    const base64Data = Utilities.base64Encode(bytes);

    return {
      mimeType: mimeType,
      base64Data: base64Data,
      bytes: bytes,
      originalFileName: originalFileName,
      fileExtension: getFileExtensionFromMimeType_(mimeType, originalFileName)
    };
  } catch (err) {
    throw new Error("โหลดไฟล์จาก LINE ไม่สำเร็จ: " + err.message);
  }
}


function getFileExtensionFromMimeType_(mimeType, fileName) {
  const name = String(fileName || "").trim();
  const extensionMatch = name.match(/\.([a-z0-9]+)$/i);
  if (extensionMatch) {
    return extensionMatch[1].toLowerCase();
  }

  const value = String(mimeType || "").toLowerCase();
  if (value === "application/pdf") return "pdf";
  if (value === "image/png") return "png";
  return "jpg";
}


function analyzeReceiptWithGemini(base64Data, mimeType) {
  const config = getConfig();
  let lastError = null;

  for (const modelName of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.geminiKey}`;

      const payload = {
        contents: [
          {
            parts: [
              { text: RECEIPT_PROMPT },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              type:     { type: "string", enum: ["expense", "income"] },
              date:     { type: "string" },
              merchant: { type: "string" },
              amount:   { type: "number" },
              category: { type: "string" },
              job:      { type: "string" },
              items:    { type: "string" },
              note:     { type: "string" },
              bank: {
                type: "object",
                properties: {
                  is_transfer_slip:      { type: "boolean" },
                  bank_name:             { type: "string" },
                  document_type:         { type: "string" },
                  receiver_account_name: { type: "string" },
                  receiver_account_no:   { type: "string" },
                  sender_account_name:   { type: "string" },
                  sender_account_no:     { type: "string" },
                  remarks:               { type: "string" },
                  product_name:          { type: "string" }
                },
                required: [
                  "is_transfer_slip", "bank_name", "document_type",
                  "receiver_account_name", "receiver_account_no",
                  "sender_account_name", "sender_account_no",
                  "remarks", "product_name"
                ]
              }
            },
            required: ["type", "date", "merchant", "amount", "category", "job", "items", "note", "bank"]
          }
        }
      };

      const res = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      const statusCode = res.getResponseCode();
      const bodyText = res.getContentText();

      let jsonResponse = {};
      try {
        jsonResponse = JSON.parse(bodyText);
      } catch (parseErr) {
        throw new Error(`Gemini ตอบกลับไม่เป็น JSON: ${bodyText}`);
      }

      if (statusCode >= 200 && statusCode < 300 && !jsonResponse.error) {
        let parsedData = null;
        try {
          parsedData = parseReceiptJsonText_(getGeminiCandidateText_(jsonResponse));
        } catch (parseErr) {
          const reason = parseErr && parseErr.message ? parseErr.message : String(parseErr || "");
          logInfo("analyzeReceiptWithGemini.invalidJsonFallback", {
            model: modelName,
            reason: truncateText_(reason, 300)
          });
          lastError = new Error(`${modelName}: Gemini JSON ไม่สมบูรณ์ (${reason})`);
          continue;
        }

        logInfo("analyzeReceiptWithGemini.success", { model: modelName });
        return {
          model: modelName,
          data: jsonResponse,
          parsedData: parsedData
        };
      }

      const errorMessage = jsonResponse.error && jsonResponse.error.message
        ? jsonResponse.error.message
        : `HTTP ${statusCode}`;

      const isRetryableError =
        statusCode === 429 ||
        statusCode === 500 ||
        statusCode === 503 ||
        /RESOURCE_EXHAUSTED|quota|rate limit|high demand|try again later|temporar/i.test(errorMessage);

      if (isRetryableError) {
        logInfo("analyzeReceiptWithGemini.fallback", {
          model: modelName,
          reason: errorMessage
        });
        lastError = new Error(`${modelName}: ${errorMessage}`);
        continue;
      }

      throw new Error(`Gemini ${modelName} error: ${errorMessage}`);
    } catch (err) {
      const retryMessage = String(err && err.message ? err.message : err);
      const isRetryableError =
        /RESOURCE_EXHAUSTED|quota|rate limit|429|500|503|high demand|try again later|temporar/i.test(retryMessage);

      if (isRetryableError) {
        lastError = new Error(`${modelName}: ${retryMessage}`);
        continue;
      }

      throw new Error(`วิเคราะห์สลิปด้วย AI ไม่สำเร็จ: ${retryMessage}`);
    }
  }

  throw new Error(
    "โมเดล AI ที่ตั้งไว้ใช้งานไม่ได้ทั้งหมด: " +
    (lastError ? lastError.message : "ไม่ทราบสาเหตุ")
  );
}


function parseGeminiReceiptJson(jsonResponse) {
  try {
    return parseReceiptJsonText_(getGeminiCandidateText_(jsonResponse));
  } catch (err) {
    throw new Error("รูปแบบข้อมูลจาก AI ไม่ถูกต้อง: " + err.message);
  }
}


function getGeminiCandidateText_(jsonResponse) {
  if (
    !jsonResponse ||
    !jsonResponse.candidates ||
    !jsonResponse.candidates.length ||
    !jsonResponse.candidates[0].content ||
    !jsonResponse.candidates[0].content.parts ||
    !jsonResponse.candidates[0].content.parts.length ||
    !jsonResponse.candidates[0].content.parts[0].text
  ) {
    throw new Error("Gemini ไม่ส่งข้อความผลลัพธ์กลับมา");
  }

  return String(jsonResponse.candidates[0].content.parts[0].text || "");
}


function parseReceiptJsonText_(rawText) {
  const originalText = String(rawText || "");
  const cleanedText = stripJsonMarkdownFence_(originalText).trim();

  if (!cleanedText) {
    throw new Error("Gemini ส่งข้อความว่างกลับมา");
  }

  try {
    return attachAiParseMetadata_(JSON.parse(cleanedText), originalText);
  } catch (firstErr) {
    const objectText = extractFirstJsonObjectText_(cleanedText);
    if (objectText && objectText !== cleanedText) {
      try {
        return attachAiParseMetadata_(JSON.parse(objectText), originalText);
      } catch (secondErr) {
        throw buildReceiptJsonParseError_(secondErr, originalText);
      }
    }

    throw buildReceiptJsonParseError_(firstErr, originalText);
  }
}


function stripJsonMarkdownFence_(text) {
  return String(text || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}


function extractFirstJsonObjectText_(text) {
  const input = String(text || "");
  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return "";
  }

  return input.slice(start, end + 1).trim();
}


function attachAiParseMetadata_(parsed, rawText) {
  const result = parsed || {};
  result._ocrRawText = buildAiDebugTextSnapshot_(result, rawText);
  result._ocrConfidence = normalizeOcrConfidenceValue_(
    result.ocrConfidence || result.ocr_confidence || result.confidence
  );
  result._parsedAt = new Date().toISOString();
  return result;
}


function buildAiDebugTextSnapshot_(parsed, rawText) {
  const bank = parsed && parsed.bank ? parsed.bank : {};
  const lines = [
    `type=${parsed && parsed.type || ""}`,
    `date=${parsed && parsed.date || ""}`,
    `merchant=${parsed && parsed.merchant || ""}`,
    `amount=${parsed && parsed.amount || ""}`,
    `category=${parsed && parsed.category || ""}`,
    `job=${parsed && parsed.job || ""}`,
    `items=${parsed && parsed.items || ""}`,
    `note=${parsed && parsed.note || ""}`,
    `receiver=${bank.receiver_account_name || ""}`,
    `sender=${bank.sender_account_name || ""}`,
    `remarks=${bank.remarks || ""}`,
    `rawPreview=${truncateText_(String(rawText || "").replace(/\s+/g, " "), 1200)}`
  ];

  return truncateText_(lines.join("\n"), 2500);
}


function buildReceiptJsonParseError_(err, rawText) {
  const message = err && err.message ? err.message : String(err || "");
  const inputLength = String(rawText || "").length;
  return new Error(
    "Gemini ตอบ JSON ไม่สมบูรณ์หรือยาวเกินไป: " +
    message +
    ` (length=${inputLength})`
  );
}


function normalizeOcrConfidenceValue_(value) {
  const numberValue = Number(value || 0);
  if (!isFinite(numberValue) || numberValue < 0) return 0;
  if (numberValue > 1) return Math.min(numberValue / 100, 1);
  return numberValue;
}



