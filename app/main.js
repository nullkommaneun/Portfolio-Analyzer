import { extractTextFromPdf } from './parse/pdf.js';
import { parseEtoroPdf } from './parse/etoro-pdf-parser.js';
import { normalizeAll } from './parse/normalize.js';
import { computeMetrics } from './analytics/metrics.js';
import { aggregate } from './analytics/aggregations.js';
import { renderKpis, renderTrades, renderCharts } from './ui/render.js';
import { exportJson, exportCsv } from './ui/export.js';
import { deriveLines, findSections, dumpSectionsTo, dumpMatchesTo, showRaw, downloadRaw } from './ui/debug.js';

let LAST_TEXT_PAGES = null;
let LAST_LINES = null;

function logError(err) {
  const ec = document.getElementById('errorConsole');
  const msg = (err && err.stack) ? err.stack : (err?.message || String(err));
  if (ec) ec.textContent += (ec.textContent ? '\n' : '') + msg;
  console.error(err);
}

async function run(file) {
  const statusEl = document.getElementById('status');
  try {
    const ec = document.getElementById('errorConsole');
    if (ec) ec.textContent = '';
    statusEl.textContent = 'Lese PDF …';

    if (!window.pdfjsLib) {
      throw new Error('pdfjsLib ist nicht verfügbar – prüfe index.html (ESM-Import + workerSrc).');
    }

    LAST_TEXT_PAGES = await extractTextFromPdf(file);
    LAST_LINES = deriveLines(LAST_TEXT_PAGES);

    statusEl.textContent = 'Parse eToro-Struktur …';
    const raw = parseEtoroPdf(LAST_TEXT_PAGES);

    // Optionaler Hinweis
    if (!raw.trades || raw.trades.length === 0) {
      statusEl.textContent = 'Hinweis: Keine Trades erkannt – siehe Diagnose-Panel.';
      // Automatisch Abschnitte in Diagnose-Panel zeigen, falls aktiv
      if (document.getElementById('dbgEnabled')?.checked) {
        const idx = findSections(LAST_LINES);
        dumpSectionsTo(document.getElementById('dbgOut'), LAST_LINES, idx);
      }
    } else {
      statusEl.textContent = 'Normalisiere …';
    }

    const data = normalizeAll(raw);
    statusEl.textContent = 'Berechne Kennzahlen …';
    const metrics = computeMetrics(data);
    const aggr = await aggregate(data);

    renderKpis(metrics);
    renderTrades(data.trades);
    renderCharts({ metrics, aggr, data });

    // Export-Buttons
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

function wireUi() {
  const fileInput  = document.getElementById('file');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const drop       = document.getElementById('uploader');

  if (!fileInput || !analyzeBtn || !drop) {
    console.error('UI-Elemente nicht gefunden (IDs: file, analyzeBtn, uploader).');
    return;
  }

  // Drag & Drop
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', async (e) => {
    e.preventDefault();
    drop.classList.remove('drag');
    const file = e.dataTransfer.files?.[0];
    if (file) await run(file);
  });

  // Direktanalyse bei Auswahl
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await run(file);
  });

  // Manueller Klick
  analyzeBtn.addEventListener('click', async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      const statusEl = document.getElementById('status');
      statusEl.textContent = 'Bitte zuerst eine PDF auswählen.';
      return;
    }
    await run(file);
  });

  // Diagnose-Buttons
  const dbgOut = document.getElementById('dbgOut');
  const dbgShowSections = document.getElementById('dbgShowSections');
  const dbgShowMatches  = document.getElementById('dbgShowMatches');
  const dbgShowRaw      = document.getElementById('dbgShowRaw');
  const dbgDlRaw        = document.getElementById('dbgDlRaw');

  if (dbgShowSections) {
    dbgShowSections.onclick = () => {
      if (!LAST_LINES) { dbgOut.textContent = 'Noch keine Datei geladen.'; return; }
      const idx = findSections(LAST_LINES);
      dumpSectionsTo(dbgOut, LAST_LINES, idx);
    };
  }
  if (dbgShowMatches) {
    dbgShowMatches.onclick = () => {
      if (!LAST_LINES) { dbgOut.textContent = 'Noch keine Datei geladen.'; return; }
      dumpMatchesTo(dbgOut, LAST_LINES);
    };
  }
  if (dbgShowRaw) {
    dbgShowRaw.onclick = () => {
      if (!LAST_TEXT_PAGES) { dbgOut.textContent = 'Noch keine Datei geladen.'; return; }
      showRaw(dbgOut, LAST_TEXT_PAGES);
    };
  }
  if (dbgDlRaw) {
    dbgDlRaw.onclick = () => {
      if (!LAST_TEXT_PAGES) { dbgOut.textContent = 'Noch keine Datei geladen.'; return; }
      downloadRaw(LAST_TEXT_PAGES);
    };
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', wireUi);
} else {
  wireUi();
}
