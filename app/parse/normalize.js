// app/parse/normalize.js
export function normalizeAll(raw){
  const account = { ...raw.account };
  for (const k of Object.keys(account)){
    const v = account[k];
    if (typeof v !== 'number' || Number.isNaN(v)) account[k] = 0;
  }
  const trades = (raw.trades||[]).map(t=>({
    position_id: String(t.position_id||'').trim(),
    name: (t.name||'').trim(),
    symbol: (t.symbol||'').trim(),
    side: t.side==='Long' ? 'Long' : (t.side==='Short' ? 'Short' : ''),
    amount: num(t.amount),
    units: num(t.units),
    isin: (t.isin||'').trim(),
    pnl: num(t.pnl)
  }));
  const cashflows = (raw.cashflows||[]).map(c=>({
    date: toISO(c.date),
    amount: num(c.amount),
    currency: c.currency || 'USD'
  })).filter(c=>c.date && Number.isFinite(c.amount));
  return { account, trades, cashflows };
}
function num(x){ const n = Number(x); return Number.isFinite(n) ? n : null; }
function toISO(s){ if (!s) return null; return String(s); }
