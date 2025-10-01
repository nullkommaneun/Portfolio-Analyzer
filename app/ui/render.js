// app/ui/render.js
import { Chart } from 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.esm.js';

export function renderKpis(m, account){
  set('#kpiWinrate .kpi-value', fmtPct(m.winrate));
  set('#kpiPF .kpi-value', fmtNum(m.profitFactor));
  set('#kpiMDD .kpi-value', fmtCurrency(m.maxDrawdown));
  set('#kpiDiv .kpi-value', fmtCurrency(account.dividends||0));
  set('#kpiRealizedEnd .kpi-value', fmtCurrency(account.realized_end||0));
  set('#kpiXirr .kpi-value', fmtPct(m.xirr));
}

export function renderTrades(trades, { pageSize=200 }={}){
  const root = document.getElementById('tradesTable');
  if (!trades || !trades.length){
    root.innerHTML = '<p>Keine Trades erkannt.</p>';
    return;
  }
  let page = 1;
  const pages = Math.ceil(trades.length / pageSize);
  const pag = document.getElementById('pagination');

  function draw(){
    const start = (page-1)*pageSize;
    const slice = trades.slice(start, start+pageSize);
    root.innerHTML = '<table role="grid" aria-rowcount="'+trades.length+'"><thead><tr>' +
      ['Pos-ID','Name','Side','Betrag','Einheiten','ISIN','PnL'].map(h=>'<th scope="col">'+h+'</th>').join('') +
      '</tr></thead><tbody>' +
      slice.map(t=>'<tr>'+
        `<td>${esc(t.position_id)}</td>`+
        `<td>${esc(t.name)}</td>`+
        `<td>${esc(t.side)}</td>`+
        `<td>${fmtCurrency(t.amount)}</td>`+
        `<td>${fmtNum(t.units)}</td>`+
        `<td>${esc(t.isin||'')}</td>`+
        `<td>${t.pnl!=null?fmtCurrency(t.pnl):'–'}</td>`+
      '</tr>').join('') +
      '</tbody></table>';
    pag.innerHTML = '';
    const mk = (label, target) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = label;
      b.disabled = target<1 || target>pages;
      b.addEventListener('click', ()=>{ page = target; draw(); });
      return b;
    };
    pag.appendChild(mk('⟨', page-1));
    pag.appendChild(document.createTextNode(` Seite ${page}/${pages} `));
    pag.appendChild(mk('⟩', page+1));
  }
  draw();
}

let feesChart, sectorChart;
export async function renderCharts(aggs, account){
  const fc = document.getElementById('feesChart').getContext('2d');
  const sc = document.getElementById('sectorChart').getContext('2d');
  if (feesChart) feesChart.destroy();
  if (sectorChart) sectorChart.destroy();

  feesChart = new Chart(fc, {
    type: 'bar',
    data: {
      labels: ['Overnight','Kommission','Stempelsteuer','Auszahlungsgebühren','FX-Gebühren'],
      datasets: [{ label: 'USD', data: [
        Math.abs(account.overnight||0),
        Math.abs(account.commission||0),
        Math.abs(account.stamp_duty||0),
        Math.abs(account.withdrawal_fees||0),
        Math.abs(account.fx_fees||0),
      ] }]
    },
    options: { responsive: true, animation: false, plugins: { legend: { display: false } } }
  });

  sectorChart = new Chart(sc, {
    type: 'doughnut',
    data: {
      labels: aggs.type.map(d=>d.label),
      datasets: [{ data: aggs.type.map(d=>d.value) }]
    },
    options: { responsive: true, animation: false }
  });
}

function set(sel, val){ const n = document.querySelector(sel); if (n) n.textContent = val; }
function esc(s){ return String(s??'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function fmtCurrency(n){ if (!Number.isFinite(n)) return '–'; return new Intl.NumberFormat('de-DE',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n); }
function fmtNum(n){ if (n==null || Number.isNaN(n)) return '–'; return new Intl.NumberFormat('de-DE',{maximumFractionDigits:6}).format(n); }
function fmtPct(x){ if (!Number.isFinite(x)) return '–'; return new Intl.NumberFormat('de-DE',{style:'percent',maximumFractionDigits:2}).format(x); }
