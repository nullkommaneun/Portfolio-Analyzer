export function exportJson(payload) {
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'etoro-analysis.json';
  a.click();
}

export function exportCsv(data) {
  const lines = ['name;symbol;isin;side;units;open_px;close_px;pnl'];
  for (const t of data.trades) {
    lines.push([t.name||'',t.symbol||'',t.isin||'',t.side||'',t.units||'',t.open_px||'',t.close_px||'',t.pnl||''].join(';'));
  }
  const blob = new Blob([lines.join('\n')], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'trades.csv';
  a.click();
}
