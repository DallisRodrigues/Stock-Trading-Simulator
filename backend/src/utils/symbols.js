const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

function normalizeSymbol(value) {
  if (typeof value !== "string") return null;
  const s = value.trim().toUpperCase();
  return SYMBOL_RE.test(s) ? s : null;
}

module.exports = { SYMBOL_RE, normalizeSymbol };
