import { maxDrawdown } from './risk.js';

function computeXirr(cashflows) {
  if (!cashflows || cashflows.length < 2) return null;
  // einfacher Newton-Raphson XIRR
  const flows = cashflows.map(cf => ({
    t: (new Date(cf.date)).getTime(),
    v: cf.amount
  }));
  const t0 = flows[0].t;
  const years = (ms) => (ms - t0) / (365*24*3600*1000);

  function f(rate) {
    return flows.reduce((sum, cf) =>
      sum + cf.v / Math.pow(1+rate, years(cf.t)), 0);
  }
  function fprime(rate) {
    return flows.reduce((sum, cf) =>
      sum - (years(cf.t)*cf.v) / Math.pow(1+rate, years(cf.t)+1), 0);
  }

  let rate = 0.1;
  for (let i=0;i<50;i++) {
    const y = f(rate), yp = fprime(rate);
    if (Math.abs(yp) < 1e-10) break;
    const newRate = rate - y/yp;
    if (Math.abs(newRate-rate) < 1e-7) return newRate;
    rate = newRate;
  }
  return rate;
}

export function computeMetrics(data) {
  const pnlClosed = data.trades.map(t => t.pnl||0);
  const pnlCum = pnlClosed.reduce((a,v)=>{a.push((a.at(-1)||0)+v);return a;},[]);
  const dd = maxDrawdown(pnlCum);
  const wins = data.trades.filter(t=>(t.pnl||0)>0).length;
  const losses = data.trades.filter(t=>(t.pnl||0)<0).length;
  const sumPos = data.trades.reduce((s,t)=>s+Math.max(0,t.pnl||0),0);
  const sumNeg = data.trades.reduce((s,t)=>s+Math.min(0,t.pnl||0),0);

  const xirr = computeXirr(data.cashflows);

  return {
    trades: data.trades.length,
    winrate: (wins/Math.max(1,wins+losses))*100,
    profitFactor: sumPos/Math.max(1,Math.abs(sumNeg)),
    maxDrawdown: dd,
    fees: {
      commission: data.account.commission??0,
      overnight: data.account.overnight??0,
      fx: data.account.fx_fees??0
    },
    dividends: data.account.dividends??0,
    realizedEquityEnd: data.account.realized_end??null,
    xirr
  };
}
