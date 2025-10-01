// Main orchestrator
import { extractTextFromPdf, extractItemsFromPdf } from './parse/pdf.js';
import { parseEtoroPdf } from './parse/etoro-pdf-parser.js';
import { normalizeAll } from './parse/normalize.js';
import { computeMetrics } from './analytics/metrics.js';
import { aggregateAll } from './analytics/aggregations.js';
import { renderKpis, renderTrades, renderCharts } from './ui/render.js';
import { setupExports } from './ui/export.js';
import { setupDebug } from './ui/debug.js';

const state = {
  raw: null,
  data: null,
  pages: null,
  items: null,
  metrics: null,
  aggs: null,
  logs: [],
  perf: {},
  options: {
    assumeAmountAsPnl: false,
    geomEnabled: false,
    dbgEnabled: false,
  }
};

const el = (id) => document.getElementById(id);
const log = (level, msg, extra) => {
  const entry = { t: new Date().toISOString(), level, msg, ...extra };
  state.logs.push(entry);
  const c = el('logTable');
  if (c) {
    if (!c.dataset.inited) {
      c.dataset.inited = '1';
      c.innerHTML = `<table><thead><tr><th>Zeit</th><th>Level</th><th>Nachricht</th></tr></thead><tbody></tbody></table>`;
    }
    const tbody = c.querySelector('tbody');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${entry.t}</td><td>${entry.level}</td><td>${entry.msg}</td>`;
    tbody.appendChild(tr);
  }
  console[level === 'error' ? 'error' : (level === 'warn' ? 'warn' : 'log')](msg, extra || '');
};

function setStatus(s){ el('status').textContent = s; }
function setError(e){ el('errorConsole').textContent = e || ''; if (e) log('error', e); }

function perfMark(key, v){
  if (v === undefined) state.perf[key] = performance.now();
  else state.perf[key] = v;
}

async function run(file){
  setError('');
  if (!file) { setError('Keine Datei gewählt.'); return; }
  setStatus('Lese PDF …');
  log('info', 'Start Analyse');

  perfMark('t0');
  try {
    const [pages, items] = await Promise.all([
      extractTextFromPdf(file),
      extractItemsFromPdf(file)
    ]);
    state.pages = pages;
    state.items = items;
  } catch (e) {
    setError('PDF konnte nicht gelesen werden: ' + (e?.message || e));
    return;
  }
  perfMark('pdfLoaded');

  setStatus('Parse …');
  let raw;
  try {
    raw = parseEtoroPdf(state.pages, state.items, { geomEnabled: state.options.geomEnabled, logs: (m)=>log('info', m) });
  } catch(e){
    setError('Parser-Fehler: ' + (e?.message || e));
    return;
  }
  state.raw = raw;
  perfMark('parsed');

  setStatus('Normalisieren …');
  const data = normalizeAll(raw);
  if (state.options.assumeAmountAsPnl) {
    for (const t of data.trades) {
      if (t.pnl == null || Number.isNaN(t.pnl)) t.pnl = t.amount;
    }
  }
  state.data = data;
  perfMark('normalized');

  setStatus('Metriken …');
  state.metrics = computeMetrics(data);
  state.aggs = aggregateAll(data);
  perfMark('metrics');

  setStatus('Render …');
  renderKpis(state.metrics, data.account);
  renderTrades(state.data.trades, { pageSize: 200 });
  await renderCharts(state.aggs, data.account);
  perfMark('rendered');

  setStatus('Fertig.');
  log('info', 'Analyse fertig', { counts: { trades: data.trades.length, cashflows: data.cashflows?.length || 0 } });
}

function bindUI(){
  const file = el('file');
  const btn = el('analyzeBtn');
  const uploader = el('uploader');

  btn.addEventListener('click', async ()=>{
    const f = file.files?.[0];
    await run(f);
  });

  // UX: sofortige Analyse beim Auswählen
  file.addEventListener('change', async ()=>{
    const f = file.files?.[0];
    if (f) await run(f);
  });

  uploader.addEventListener('dragover', (e)=>{ e.preventDefault(); uploader.classList.add('drag'); });
  uploader.addEventListener('dragleave', ()=> uploader.classList.remove('drag'));
  uploader.addEventListener('drop', async (e)=>{
    e.preventDefault();
    uploader.classList.remove('drag');
    const f = e.dataTransfer.files?.[0];
    if (f) {
      el('file').files = e.dataTransfer.files;
      await run(f);
    }
  });
  uploader.addEventListener('keydown', async (e)=>{
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      el('file').click();
    }
  });

  el('assumeAmountAsPnl').addEventListener('change', async (e)=>{
    state.options.assumeAmountAsPnl = e.target.checked;
    if (state.raw) {
      setStatus('Rechne neu …');
      const data = normalizeAll(state.raw);
      if (state.options.assumeAmountAsPnl) {
        for (const t of data.trades) if (t.pnl == null || Number.isNaN(t.pnl)) t.pnl = t.amount;
      }
      state.data = data;
      state.metrics = computeMetrics(data);
      state.aggs = aggregateAll(data);
      renderKpis(state.metrics, data.account);
      renderTrades(state.data.trades, { pageSize: 200 });
      await renderCharts(state.aggs, data.account);
      setStatus('Fertig.');
    }
  });
  el('geomEnabled').addEventListener('change', (e)=>{
    state.options.geomEnabled = e.target.checked;
  });
  el('dbgEnabled').addEventListener('change', (e)=>{
    state.options.dbgEnabled = e.target.checked;
  });

  setupExports(()=>state.data, ()=>state.metrics, ()=>state.aggs);
  setupDebug({
    getState: ()=>state,
    perfMark,
    log
  });

  // Auto-Trigger: Self-Check einmalig anzeigen, damit Diagnose sichtbar ist
  setTimeout(()=>{
    const btn = document.getElementById('btnSelfCheck');
    if (btn) btn.click();
  }, 80);
}

document.addEventListener('DOMContentLoaded', bindUI);
