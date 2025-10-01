// app/analytics/metrics.js
export function computeMetrics(data){
  const pnl = data.trades.map(t => t.pnl).filter(v => typeof v === 'number');
  const pos = pnl.filter(v=>v>0).reduce((a,b)=>a+b,0);
  const neg = pnl.filter(v=>v<0).reduce((a,b)=>a+b,0);
  const winrate = pnl.length ? (pnl.filter(v=>v>0).length / pnl.length) : null;
  const profitFactor = neg ? (pos / Math.abs(neg)) : (pos>0 ? Infinity : null);

  const eq = []; let acc = 0;
  for (const v of pnl){ acc += (v||0); eq.push(acc); }
  let peak = -Infinity, maxDD = 0;
  for (const v of eq){ peak = Math.max(peak, v); maxDD = Math.min(maxDD, v - peak); }
  const maxDrawdown = Math.abs(maxDD);

  const dividends = data.account.dividends || 0;
  const realizedEnd = data.account.realized_end || 0;

  const xirr = computeXirr(data.cashflows);

  return { winrate, profitFactor, maxDrawdown, dividends, realizedEnd, xirr };
}

function computeXirr(cashflows){
  if (!cashflows || cashflows.length < 2) return null;
  const flows = cashflows.map(cf => ({ t: new Date(cf.date).getTime(), a: cf.amount }));
  flows.sort((a,b)=>a.t-b.t);
  const t0 = flows[0].t;
  const yearMs = 365.2425*24*3600*1000;

  const f = r => flows.reduce((acc,cf)=> acc + cf.a / Math.pow(1+r, (cf.t - t0)/yearMs ), 0);
  const df = r => flows.reduce((acc,cf)=> acc + (-((cf.t - t0)/yearMs)) * cf.a / Math.pow(1+r, 1+ (cf.t - t0)/yearMs ), 0);

  let r = 0.1;
  for (let i=0;i<100;i++){
    const fr = f(r);
    const dfr = df(r);
    if (!Number.isFinite(fr) || !Number.isFinite(dfr)) return null;
    const nr = r - fr/dfr;
    if (Math.abs(nr - r) < 1e-7) return r;
    r = nr;
    if (r <= -0.999999) return null;
  }
  return r;
}
