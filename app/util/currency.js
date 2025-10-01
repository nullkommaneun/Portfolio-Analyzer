// app/util/currency.js
export function parseNumber(s){
  if (!s) return null;
  s = String(s).trim();
  // Bracket negative logic: (123.45) -> -123.45
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g,'');
  // remove thousands separators and normalize decimal
  // handle either 1,234.56 or 1.234,56 and plain 1234,56/1234.56
  if (/\d+\.\d{3}(,\d+)?/.test(s)) s = s.replace(/\./g,'').replace(',', '.');
  else if (/\d+,\d{2,}/.test(s)) s = s.replace(',', '.');
  s = s.replace(/[^\-\d.]/g,'');
  if (s === '' || s === '-' ) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}
