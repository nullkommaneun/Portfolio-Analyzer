export function parseNumber(str) {
  const s = String(str).trim();
  // "1.234,56" oder "123,45"
  if (/\d,\d{2}$/.test(s) && !s.includes('.')) {
    return parseFloat(s.replace(/\./g,'').replace(',','.'));
  }
  // "1,234.56" oder "1234.56"
  return parseFloat(s.replace(/,/g,''));
}
export function isNegParen(str) { return /^\(.*\)$/.test(String(str).trim()); }
