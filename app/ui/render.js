export function renderKpis(m){
  const k=document.getElementById('kpis');
  const f=x=>x==null?'—':(typeof x==='number'?x.toFixed(2):x);
  k.innerHTML=`
  <div class="card"><h3>Trades</h3><div>${m.trades}</div></div>
  <div class="card"><h3>Winrate</h3><div>${m.winrate.toFixed(1)}%</div></div>
  <div class="card"><h3>Profit-Faktor</h3><div>${f(m.profitFactor)}</div></div>
  <div class="card"><h3>Max Drawdown</h3><div>${(m.maxDrawdown*100).toFixed(2)}%</div></div>
  <div class="card"><h3>Dividenden</h3><div>${f(m.dividends)}</div></div>
  <div class="card"><h3>Real. EK (Ende)</h3><div>${f(m.realizedEquityEnd)}</div></div>
  <div class="card"><h3>XIRR</h3><div>${m.xirr!=null?(m.xirr*100).toFixed(2)+'%':'—'}</div></div>`;
}
