// app/ui/render.js

export function renderKpis(m) {
  const k = document.getElementById('kpis');
  if (!k) return;
  const f = x => (x == null || Number.isNaN(x)) ? '—' : (typeof x === 'number' ? x.toFixed(2) : x);

  k.innerHTML = `
    <div class="card"><h3>Trades</h3><div>${m.trades}</div></div>
    <div class="card"><h3>Winrate</h3><div>${(m.winrate ?? 0).toFixed(1)}%</div></div>
    <div class="card"><h3>Profit-Faktor</h3><div>${f(m.profitFactor)}</div></div>
    <div class="card"><h3>Max Drawdown</h3><div>${((m.maxDrawdown ?? 0) * 100).toFixed(2)}%</div></div>
    <div class="card"><h3>Dividenden</h3><div>${f(m.dividends)}</div></div>
    <div class="card"><h3>Real. EK (Ende)</h3><div>${f(m.realizedEquityEnd)}</div></div>
    <div class="card"><h3>XIRR</h3><div>${m.xirr!=null ? (m.xirr*100).toFixed(2)+'%' : (m.irr!=null ? (m.irr*100).toFixed(2)+'%' : '—')}</div></div>
  `;
}

export function renderTrades(trades) {
  const wrap = document.getElementById('tradesTable');
  if (!wrap) return;
  const rows = (trades || []).map(t => `
    <tr>
      <td>${t.name ?? ''}</td>
      <td>${t.symbol ?? ''}</td>
      <td>${t.isin ?? ''}</td>
      <td>${t.side ?? ''}</td>
      <td>${t.units ?? ''}</td>
      <td>${t.open_px ?? ''}</td>
      <td>${t.close_px ?? ''}</td>
      <td>${t.pnl ?? ''}</td>
    </tr>
  `).join('');
  wrap.innerHTML = `
    <div class="table">
      <table>
        <thead>
          <tr>
            <th>Name</th><th>Symbol</th><th>ISIN</th><th>Richtung</th>
            <th>Stück</th><th>Open</th><th>Close</th><th>PnL</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

export function renderCharts({ metrics, aggr }) {
  if (!window.Chart) return; // Chart.js nicht geladen? still bleiben.

  // Gebühren-Balken
  const feesEl = document.getElementById('feesChart');
  if (feesEl) {
    new Chart(feesEl, {
      type: 'bar',
      data: {
        labels: ['Kommission', 'Overnight', 'FX'],
        datasets: [{ data: [
          metrics?.fees?.commission ?? 0,
          metrics?.fees?.overnight ?? 0,
          metrics?.fees?.fx ?? 0
        ] }]
      },
      options: { responsive: true }
    });
  }

  // Sektor-Donut
  const sectorEl = document.getElementById('sectorChart');
  if (sectorEl) {
    const labels = Object.keys(aggr?.sector || {});
    const data = labels.map(k => aggr.sector[k]);
    new Chart(sectorEl, {
      type: 'doughnut',
      data: { labels, datasets: [{ data }] },
      options: { responsive: true }
    });
  }
}
