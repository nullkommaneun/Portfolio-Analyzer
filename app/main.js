import { extractTextFromPdf } from './parse/pdf.js';
import { parseEtoroPdf } from './parse/etoro-pdf-parser.js';
import { normalizeAll } from './parse/normalize.js';
import { computeMetrics } from './analytics/metrics.js';
import { aggregate } from './analytics/aggregations.js';
import { renderKpis, renderTrades, renderCharts } from './ui/render.js';
import { exportJson, exportCsv } from './ui/export.js';

const fileInput  = document.getElementById('file');
const analyzeBtn = document.getElementById('analyzeBtn');
const statusEl   = document.getElementById('status');
const errorConsole = document.getElementById('errorConsole');

function logError(err) {
  const msg = (err && err.stack) ? err.stack : (err?.message || String(err));
  if (errorConsole) {
    errorConsole.textContent += (errorConsole.textContent ? '\n' : '') + msg;
  }
  console.error(err);
}

async function run(file) {
  try {
    if (errorConsole) errorConsole.textContent = '';
    statusEl.textContent = 'Lese PDF …';

    const textPages = await extractTextFromPdf(file);

    statusEl.textContent = 'Parse eToro-Struktur …';
    const raw = parseEtoroPdf(textPages);

    if (!raw.trades || raw.trades.length === 0) {
      statusEl.textContent = 'Hinweis: „Geschlossene Positionen“ evtl. stark fragmentiert – keine Positions-IDs sicher erkannt.';
      console.warn('Parser-Diagnose: trades=0. Prüfe Block-Labels/Zeilen:', textPages.slice(0, 3).join('\n---PAGE---\n'));
    }

    statusEl.textContent = 'Normalisiere …';
    const data = normalizeAll(raw); // { account, trades[], cashflows[] … }

    statusEl.textContent = 'Berechne Kennzahlen …';
    const metrics = computeMetrics(data);
    const aggr = await aggregate(data);

    renderKpis(metrics);
    renderTrades(data.trades);
    renderCharts({ metrics, aggr, data });

    const btnJson = document.getElementById('exportJson');
    const btnCsv  = document.getElementById('exportCsv');
    if (btnJson) btnJson.onclick = () => exportJson({ data, metrics, aggr });
    if (btnCsv)  btnCsv.onclick  = () => exportCsv(data);

    statusEl.textContent = 'Fertig.';
  } catch (err) {
    statusEl.textContent = 'Fehler – Details unten.';
    logError(err);
  }
}

// Drag & Drop
const drop = document.getElementById('uploader');
if (drop) {
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', async (e) => {
    e.preventDefault();
    drop.classList.remove('drag');
    const file = e.dataTransfer.files?.[0];
    if (file) await run(file);
  });
}

// File input -> Auto-Analyse
if (fileInput) {
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await run(file);
  });
}

// Manuelle Analyse via Button
if (analyzeBtn) {
  analyzeBtn.addEventListener('click', async () => {
    const file = fileInput?.files?.[0];
    if (!file) {
      statusEl.textContent = 'Bitte zuerst eine PDF auswählen.';
      return;
    }
    await run(file);
  });
}
