import { extractTextFromPdf } from './parse/pdf.js';
import { parseEtoroPdf } from './parse/etoro-pdf-parser.js';
import { normalizeAll } from './parse/normalize.js';
import { computeMetrics } from './analytics/metrics.js';
import { aggregate } from './analytics/aggregations.js';
import { renderKpis, renderTrades, renderCharts } from './ui/render.js';
import { exportJson, exportCsv } from './ui/export.js';

const fileInput = document.getElementById('file');
const statusEl = document.getElementById('status');

// drag & drop
const drop = document.getElementById('uploader');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', e => { drop.classList.remove('drag'); });
drop.addEventListener('drop', async (e) => {
  e.preventDefault();
  drop.classList.remove('drag');
  const file = e.dataTransfer.files?.[0];
  if (file) await run(file);
});

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (file) await run(file);
});

async function run(file) {
  try {
    statusEl.textContent = 'Lese PDF …';
    const textPages = await extractTextFromPdf(file);
    statusEl.textContent = 'Parse eToro-Struktur …';
    const raw = parseEtoroPdf(textPages);

    statusEl.textContent = 'Normalisiere …';
    const data = normalizeAll(raw); // { account, trades[], dividends[], fees[], cashflows[] }

    statusEl.textContent = 'Berechne Kennzahlen …';
    const metrics = computeMetrics(data);
    const aggr = await aggregate(data);

    renderKpis(metrics);
    renderTrades(data.trades);
    renderCharts({ metrics, aggr, data });

    document.getElementById('exportJson').onclick = () => exportJson({ data, metrics, aggr });
    document.getElementById('exportCsv').onclick  = () => exportCsv(data);

    statusEl.textContent = 'Fertig.';
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Fehler: ' + (err?.message || err);
  }
}
