/**
 * Date_Utils.gs
 * Date parsing and Thai month utilities.
 */

function getWeekOfMonth(dateString) {
  const date = new Date(dateString);
  return Math.ceil(date.getDate() / 7);
}


function getMonthThai(dateString) {
  const date = new Date(dateString);
  const months = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม"
  ];
  return months[date.getMonth()];
}


function parseThaiDateToYMD(rawDate) {
  const parts = String(rawDate).split("/");
  if (parts.length !== 3) {
    throw new Error("รูปแบบวันที่ต้องเป็น ว/ด/ป");
  }

  const day = parts[0].padStart(2, "0");
  const month = parts[1].padStart(2, "0");
  const year = parts[2];

  return `${year}-${month}-${day}`;
}


function formatDateToYMD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}


function normalizeThaiMonth_(monthText) {
  const input = String(monthText || "").toLowerCase().replace(/\s+/g, "").trim();
  const map = {
    "มกราคม": "มกราคม", "ม.ค.": "มกราคม", "มค": "มกราคม", "jan": "มกราคม", "january": "มกราคม",
    "กุมภาพันธ์": "กุมภาพันธ์", "ก.พ.": "กุมภาพันธ์", "กพ": "กุมภาพันธ์", "feb": "กุมภาพันธ์", "february": "กุมภาพันธ์",
    "มีนาคม": "มีนาคม", "มี.ค.": "มีนาคม", "มีค": "มีนาคม", "mar": "มีนาคม", "march": "มีนาคม",
    "เมษายน": "เมษายน", "เม.ย.": "เมษายน", "เมย": "เมษายน", "apr": "เมษายน", "april": "เมษายน",
    "พฤษภาคม": "พฤษภาคม", "พ.ค.": "พฤษภาคม", "พค": "พฤษภาคม", "may": "พฤษภาคม",
    "มิถุนายน": "มิถุนายน", "มิ.ย.": "มิถุนายน", "มิย": "มิถุนายน", "jun": "มิถุนายน", "june": "มิถุนายน",
    "กรกฎาคม": "กรกฎาคม", "ก.ค.": "กรกฎาคม", "กค": "กรกฎาคม", "jul": "กรกฎาคม", "july": "กรกฎาคม",
    "สิงหาคม": "สิงหาคม", "ส.ค.": "สิงหาคม", "สค": "สิงหาคม", "aug": "สิงหาคม", "august": "สิงหาคม",
    "กันยายน": "กันยายน", "ก.ย.": "กันยายน", "กย": "กันยายน", "sep": "กันยายน", "september": "กันยายน",
    "ตุลาคม": "ตุลาคม", "ต.ค.": "ตุลาคม", "ตค": "ตุลาคม", "oct": "ตุลาคม", "october": "ตุลาคม",
    "พฤศจิกายน": "พฤศจิกายน", "พ.ย.": "พฤศจิกายน", "พย": "พฤศจิกายน", "nov": "พฤศจิกายน", "november": "พฤศจิกายน",
    "ธันวาคม": "ธันวาคม", "ธ.ค.": "ธันวาคม", "ธค": "ธันวาคม", "dec": "ธันวาคม", "december": "ธันวาคม"
  };
  return map[input] || String(monthText || "").trim();
}


