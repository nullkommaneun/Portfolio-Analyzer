export function renderKpis(m) {
  const kpis = document.getElementById('kpis');
  const fmt = (x)=> (x==null || Number.isNaN(x)) ? '—' : (typeof x==='number' ? x.toFixed(2) : x);
  kpis.innerHTML = `
    <div class="card"><h3>Trades</h3><div>${m.trades}</div></div>
    <div class="card"><h3>Winrate</h3><div>${m.winrate.toFixed(1)}%</div></div>
    <div class="card"><h3>Profit-Faktor</h3><div>${fmt(m.profitFactor)}</div></div>
    <div class="card"><h3>Max Drawdown</h3><div>${(m.maxDrawdown*100).toFixed(2)}%</div></div>
    <div class="card"><h3>Dividenden</h3><div>${fmt(m.dividends)}</div></div>
    <div class="card"><h3>Real. EK (Ende)</h3><div>${fmt(m.realizedEquityEnd)}</div></div>
    <div class="card"><h3>XIRR</h3><div>${m.irr!=null ? (m.irr*100).toFixed(2)+'%' : '—'}</div></div>
  `;
}

export function renderTrades(trades) {
  const wrap = document.getElementById('tradesTable');
  const rows = trades.slice(0, 2000).map(t => `<tr>
    <td>${t.name ?? ''}</td><td>${t.symbol ?? ''}</td><td>${t.isin ?? ''}</td>
    <td>${t.side ?? ''}</td><td>${t.units ?? ''}</td>
    <td>${t.open_px ?? ''}</td><td>${t.close_px ?? ''}</td>
    <td>${t.pnl ?? ''}</td>
  </tr>`).join('');
  wrap.innerHTML = `<div class="table"><table>
    <thead><tr><th>Name</th><th>Symbol</th><th>ISIN</th><th>Richtung</th><th>Stück</th><th>Open</th><th>Close</th><th>PnL</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

export function renderCharts({ metrics, aggr }) {
  const feesCtx = document.getElementById('feesChart');
  // eslint-disable-next-line no-undef
  new Chart(feesCtx, {
    type: 'bar',
    data: { labels: ['Kommission','Overnight','FX'], datasets: [{ data: [metrics.fees.commission, metrics.fees.overnight, metrics.fees.fx] }] },
    options: { responsive:true }
  });

  const sectorCtx = document.getElementById('sectorChart');
  const labels = Object.keys(aggr.sector || {});
  const data = labels.map(k => aggr.sector[k]);
  // eslint-disable-next-line no-undef
  new Chart(sectorCtx, {
    type: 'doughnut',
    data: { labels, datasets:[{ data }] },
    options: { responsive:true }
  });
}
