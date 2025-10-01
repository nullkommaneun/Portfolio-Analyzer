// app/util/currency.js
export function parseNumber(s){
  if (!s) return null;
  s = String(s).trim();
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g,'');
  if (/\d+\.\d{3}(,\d+)?/.test(s)) s = s.replace(/\./g,'').replace(',', '.');
  else if (/\d+,\d{2,}/.test(s)) s = s.replace(',', '.');
  s = s.replace(/[^\-\d.]/g,'');
  if (s === '' || s === '-' ) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}
