export function parseDate(s) {
  // Formate wie "25-02-2025 08:20:48"
  const m = String(s).match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!m) return null;
  const [_,d,mo,y] = m;
  return new Date(`${y}-${mo}-${d}T00:00:00Z`);
}
