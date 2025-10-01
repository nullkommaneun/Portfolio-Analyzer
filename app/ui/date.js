// app/util/date.js
export function parseDate(s){
  if (!s) return null;
  const m = String(s).match(/(\d{2})[\-\/.](\d{2})[\-\/.](\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [_, d, mo, y, hh='00', mm='00', ss='00'] = m;
  return new Date(`${y}-${mo}-${d}T${hh}:${mm}:${ss}Z`).toISOString();
}
