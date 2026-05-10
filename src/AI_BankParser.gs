/**
 * AI_BankParser.gs
 * Direct bank transfer document parsing and service-noise filtering.
 */

function extractBankFieldByLabels_(text, labels) {
  const input = String(text || "").replace(/\s+/g, " ").trim();
  if (!input) return "";

  for (const label of labels || []) {
    const escaped = escapeRegex_(label);
    const pattern = new RegExp(`${escaped}\\s*[:：-]?\\s*([^\n|,;]{2,120})`, "i");
    const match = input.match(pattern);
    if (match) {
      const candidate = cleanupPayeeCandidate_(match[1]);
      if (candidate) {
        return candidate;
      }
    }
  }

  return "";
}


function escapeRegex_(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


function extractBankFieldAfterSection_(text, sectionLabels, fieldLabels) {
  const input = String(text || "").replace(/\s+/g, " ").trim();
  if (!input) return "";

  for (const sectionLabel of sectionLabels || []) {
    const search = String(sectionLabel || "").toLowerCase();
    const startIndex = input.toLowerCase().indexOf(search);
    if (startIndex === -1) continue;

    const sectionText = input.slice(startIndex, Math.min(input.length, startIndex + 500));
    const candidate = extractBankFieldByLabels_(sectionText, fieldLabels);
    if (candidate) {
      return candidate;
    }
  }

  return "";
}


function extractReceiverAccountName_(text) {
  const input = String(text || "").replace(/\s+/g, " ").trim();
  if (!input) return "";

  const fieldLabels = [
    "ชื่อบัญชีผู้รับ",
    "ชื่อบัญชี",
    "account name",
    "receiver account name",
    "beneficiary",
    "ชื่อผู้รับ"
  ];

  const sectionCandidate = extractBankFieldAfterSection_(
    input,
    [
      "to the following accounts",
      "payment details",
      "รายละเอียดการชำระ",
      "รายละเอียดผู้รับเงิน",
      "ข้อมูลผู้รับ",
      "beneficiary details",
      "receiver details",
      "ผู้รับเงิน"
    ],
    fieldLabels
  );
  if (sectionCandidate && !isLikelyOwnCompanyName_(sectionCandidate)) {
    return sectionCandidate;
  }

  const receiverPatterns = [
    /to the following accounts[^|]{0,220}?account name\s*[:：-]?\s*([^|,;]{2,120})/i,
    /payment details[^|]{0,220}?account name\s*[:：-]?\s*([^|,;]{2,120})/i,
    /รายละเอียดการชำระ[^|]{0,220}?ชื่อบัญชี\s*[:：-]?\s*([^|,;]{2,120})/i,
    /รายละเอียดผู้รับเงิน[^|]{0,220}?ชื่อบัญชี\s*[:：-]?\s*([^|,;]{2,120})/i,
    /ชื่อบัญชีผู้รับ\s*[:：-]?\s*([^|,;]{2,120})/i,
    /receiver account name\s*[:：-]?\s*([^|,;]{2,120})/i,
    /beneficiary\s*[:：-]?\s*([^|,;]{2,120})/i
  ];

  for (const pattern of receiverPatterns) {
    const match = input.match(pattern);
    if (!match) continue;

    const candidate = cleanupPayeeCandidate_(match[1]);
    if (candidate && !isLikelyOwnCompanyName_(candidate)) {
      return candidate;
    }
  }

  const genericCandidate = extractBankFieldByLabels_(input, fieldLabels);
  if (genericCandidate && !isLikelyOwnCompanyName_(genericCandidate)) {
    return genericCandidate;
  }

  return "";
}


function extractSenderAccountName_(text) {
  const input = String(text || "").replace(/\s+/g, " ").trim();
  if (!input) return "";

  const sectionCandidate = extractBankFieldAfterSection_(
    input,
    [
      "sender details",
      "รายละเอียดผู้จ่ายเงิน",
      "ข้อมูลผู้โอน",
      "ผู้โอน",
      "from account",
      "payer details"
    ],
    ["ชื่อบัญชี", "account name", "sender account name", "payer"]
  );
  if (sectionCandidate) {
    return sectionCandidate;
  }

  const patterns = [
    /sender details[^|]{0,220}?account name\s*[:：-]?\s*([^|,;]{2,120})/i,
    /รายละเอียดผู้จ่ายเงิน[^|]{0,220}?ชื่อบัญชี\s*[:：-]?\s*([^|,;]{2,120})/i,
    /from account[^|]{0,220}?account name\s*[:：-]?\s*([^|,;]{2,120})/i,
    /sender account name\s*[:：-]?\s*([^|,;]{2,120})/i
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      return cleanupPayeeCandidate_(match[1]);
    }
  }

  return "";
}


function detectBankDocumentType_(text) {
  const input = String(text || "").toLowerCase();
  if (/promptpay|พร้อมเพย์/.test(input)) return "promptpay_slip";
  if (/payment advice/.test(input)) return "payment_advice";
  if (/transfer|โอนเงิน/.test(input)) return "transfer_slip";
  if (/receipt|ใบเสร็จ/.test(input)) return "receipt";
  return "other";
}


function detectBankName_(text) {
  const input = String(text || "").toLowerCase();
  const banks = [
    { name: "SCB", patterns: [/scb/, /siam commercial bank/, /ไทยพาณิชย์/] },
    { name: "KBank", patterns: [/kbank/, /kasikorn/, /กสิกร/] },
    { name: "Krungthai", patterns: [/krungthai/, /กรุงไทย/] },
    { name: "BBL", patterns: [/bangkok bank/, /bbl/, /กรุงเทพ/] },
    { name: "Krungsri", patterns: [/krungsri/, /bay/, /กรุงศรี/] },
    { name: "TTB", patterns: [/ttb/, /ทหารไทยธนชาต/] },
    { name: "UOB", patterns: [/uob/] },
    { name: "GSB", patterns: [/government savings bank/, /gsb/, /ออมสิน/] },
    { name: "BAAC", patterns: [/baac/, /ธ\.ก\.ส/, /เกษตร/] },
    { name: "CIMB Thai", patterns: [/cimb/] },
    { name: "LH Bank", patterns: [/lh bank/, /แลนด์ แอนด์ เฮ้าส์/] }
  ];

  for (const bank of banks) {
    if (bank.patterns.some(function(pattern) { return pattern.test(input); })) {
      return bank.name;
    }
  }

  return "";
}


function extractBankRemarks_(text) {
  return extractBankFieldByLabels_(text, [
    "หมายเหตุ",
    "remarks",
    "remark",
    "note",
    "memo",
    "description"
  ]);
}


function normalizeBankContext_(cleanJson) {
  const bank = cleanJson && cleanJson.bank ? cleanJson.bank : {};
  const combinedText = buildReceiptCombinedText_(cleanJson);
  const receiverAccountName = firstNonEmpty_([
    bank.receiver_account_name,
    cleanJson.receiver_account_name,
    cleanJson.receiverName,
    cleanJson.payeeName,
    extractReceiverAccountName_(combinedText),
    extractLikelyPayeeName_(combinedText)
  ]);
  const senderAccountName = firstNonEmpty_([
    bank.sender_account_name,
    cleanJson.sender_account_name,
    cleanJson.senderName,
    extractSenderAccountName_(combinedText)
  ]);
  const remarks = firstNonEmpty_([
    bank.remarks,
    cleanJson.remarks,
    extractBankRemarks_(combinedText)
  ]);
  const productName = firstNonEmpty_([
    bank.product_name,
    cleanJson.product_name,
    extractBankFieldByLabels_(combinedText, ["product name"])
  ]);
  const bankName = firstNonEmpty_([
    bank.bank_name,
    cleanJson.bank_name,
    detectBankName_(combinedText)
  ]);
  const documentType = firstNonEmpty_([
    bank.document_type,
    cleanJson.document_type,
    detectBankDocumentType_(combinedText)
  ]) || "other";
  const isTransferSlip =
    toBoolean_(bank.is_transfer_slip) ||
    documentType !== "other" ||
    /payment advice|โอนเงิน|account name|sender details|พร้อมเพย์|promptpay|beneficiary/i.test(combinedText);

  return {
    isTransferSlip: isTransferSlip,
    bankName: bankName,
    documentType: documentType,
    receiverAccountName: receiverAccountName,
    senderAccountName: senderAccountName,
    remarks: remarks,
    productName: productName,
    rawText: combinedText
  };
}


function filterBankServiceNoise_(text) {
  return isBankServiceNoise_(text) ? "" : String(text || "").trim();
}


