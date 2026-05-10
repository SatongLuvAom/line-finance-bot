/**
 * Text_Utils.gs
 * Common text normalization and formatting helpers.
 */

function normalizeComparableText_(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.,()\-_/]/g, "");
}

function normalizeAliasFromMaps_(value, maps) {
  const original = String(value || "").trim();
  if (!original) return "";

  const comparable = normalizeComparableText_(original);
  for (const map of maps || []) {
    const canonical = String(map && map.canonical || "").trim();
    if (!canonical) continue;

    const aliases = [canonical].concat(map.aliases || []);
    const matched = aliases.some(function(alias) {
      const normalizedAlias = normalizeComparableText_(alias);
      return normalizedAlias && comparable === normalizedAlias;
    });

    if (matched) {
      return canonical;
    }
  }

  return original;
}


function cleanText_(text) {
  return normalizeWhitespace_(String(text || "").trim());
}

function normalizeWhitespace_(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function includesAny_(text, words) {
  const input = String(text || "").toLowerCase();
  return (words || []).some(function(word) {
    return input.indexOf(String(word || "").toLowerCase()) !== -1;
  });
}

function parseAmount_(value) {
  return parseFloat(String(value || 0).replace(/,/g, "")) || 0;
}

function formatCurrency_(value) {
  return "฿" + Number(value || 0).toLocaleString();
}

function truncateText_(text, maxLength) {
  const input = String(text || "");
  const limit = Number(maxLength || 1000);
  return input.length > limit ? input.slice(0, limit - 1) + "…" : input;
}


