// app/ui/export.js
export function setupExports(getData, getMetrics, getAggs){
  const btnJson = document.getElementById('exportJson');
  const btnCsv = document.getElementById('exportCsv');
  btnJson?.addEventListener('click', ()=>{
    const payload = { data: getData(), metrics: getMetrics(), aggregations: getAggs() };
    downloadText('etoro-analyzer.json', JSON.stringify(payload, null, 2));
  });
  btnCsv?.addEventListener('click', ()=>{
    const d = getData();
    const rows = [['position_id','name','symbol','side','amount','units','isin','pnl']];
    for (const t of d.trades){
      rows.push([t.position_id, t.name, t.symbol, t.side, t.amount, t.units, t.isin, t.pnl]);
    }
    const csv = rows.map(r => r.map(c => {
      const s = c==null?'':String(c);
      return /[",;\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
    }).join(';')).join('\n');
    downloadText('etoro-trades.csv', csv);
  });
}
function downloadText(name, text){
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}
