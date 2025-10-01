// app/ui/debug.js
import { assert } from '../util/assert.js';

export function setupDebug({ getState, perfMark, log }){
  const S = ()=>getState();
  const q = id => document.getElementById(id);

  q('btnMarkSections').addEventListener('click', ()=>{
    const pages = S().pages || [];
    const text = pages.join('\n');
    const idxClosed = text.indexOf('Geschlossene Positionen');
    const idxTx = text.search(/(Transaktionen|Transactions)/i);
    q('dbgSections').textContent = [
      `Closed Positions Index: ${idxClosed}`,
      `Transactions Index: ${idxTx}`,
      ctx(text, idxClosed),
      ctx(text, idxTx)
    ].join('\n\n');
  });

  q('btnShowContext').addEventListener('click', ()=>{
    const lines = (S().pages||[]).join('\n').split(/\n+/);
    const pats = [/\b\d{9,12}\b/, /\b[A-Z]{2}[A-Z0-9]{9}\d\b/, /\b(Long|Short)\b/i, /Gewinn \(USD\)|Betrag|Einheiten/];
    const hits = [];
    for (let i=0;i<lines.length;i++){
      for (const re of pats){
        if (re.test(lines[i])){
          const from = Math.max(0, i-3);
          const to = Math.min(lines.length, i+4);
          hits.push(lines.slice(from,to).map((s,j)=>`${from+j}: ${s}`).join('\n'));
          break;
        }
      }
    }
    q('dbgContext').textContent = hits.slice(0,50).join('\n\n---\n\n');
  });

  q('btnShowRaw').addEventListener('click', ()=>{
    q('dbgOut').textContent = (S().pages||[]).join('\n\n=== PAGE ===\n\n');
  });

  q('btnShowItems').addEventListener('click', ()=>{
    const items = S().items||[];
    q('dbgOut').textContent = JSON.stringify(items.slice(0,500), null, 2);
  });

  q('btnDownloadRaw').addEventListener('click', ()=>{
    const blob = new Blob([ (S().pages||[]).join('\n') ], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'raw-text.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  });

  q('btnCopyLog').addEventListener('click', async ()=>{
    const ndjson = (S().logs||[]).map(o=>JSON.stringify(o)).join('\n');
    await navigator.clipboard.writeText(ndjson);
    alert('Log kopiert.');
  });

  q('btnSelfCheck').addEventListener('click', ()=>{
    const issues = [];
    const pass = (name, hint='') => ({ name, status: 'PASS', hint });
    const warn = (name, hint='') => ({ name, status: 'WARN', hint });
    const fail = (name, hint='') => ({ name, status: 'FAIL', hint });

    const checks = [];
    try{
      assert(!!window.pdfjsLib, 'pdfjsLib nicht geladen');
      checks.push(pass('pdf.js geladen'));
    } catch(e){ checks.push(fail('pdf.js geladen', e.message)); }

    try{
      assert(!!window.pdfjsLib?.GlobalWorkerOptions?.workerSrc, 'Worker nicht gesetzt');
      checks.push(pass('pdf.js Worker gesetzt'));
    } catch(e){ checks.push(fail('pdf.js Worker gesetzt', e.message)); }

    for (const id of ['file','analyzeBtn','tradesTable','feesChart','sectorChart']){
      try{ assert(document.getElementById(id), `DOM-ID fehlt: ${id}`); checks.push(pass(`DOM: ${id}`)); }
      catch(e){ checks.push(fail(`DOM: ${id}`, e.message)); }
    }

    try{
      const d = S().data;
      if (d?.trades?.length) {
        const missing = d.trades.filter(t=>!t.position_id).length;
        const q = 1 - (missing / d.trades.length);
        checks.push(q > 0.99 ? pass('Parser: position_id Quote > 99%') : warn('Parser: position_id Quote', `${(q*100).toFixed(2)}%`));
        const anyNaN = d.trades.some(t => Number.isNaN(t.amount) || Number.isNaN(t.units));
        checks.push(!anyNaN ? pass('Parser: amount/units keine NaN') : warn('Parser: amount/units', 'NaN gefunden'));
      } else {
        checks.push(warn('Parser Basis', 'Noch keine Trades geladen'));
      }
    } catch(e){
      checks.push(fail('Parser Checks', e.message));
    }

    try{
      // cashflow Plausibilität simpel
      const a = S().data?.account || {};
      const deposits = a.deposits||0;
      const withdrawals = a.withdrawals||0;
      if (deposits !== 0 || withdrawals !== 0){
        checks.push(pass('Cashflows vorhanden', `Deposits: ${deposits}, Withdrawals: ${withdrawals}`));
      } else {
        checks.push(warn('Cashflows', 'Keine Summen erkennbar'));
      }
    } catch(e){
      checks.push(fail('Cashflow Check', e.message));
    }

    // Modulstatus
    const modules = [
      {name:'Chart.js', present: !!window.Chart },
      {name:'ES Modules', present: true },
    ];

    renderSelfCheck(checks);
    renderModuleStatus(modules);
  });

  q('btnMeasure').addEventListener('click', ()=>{
    const p = S().perf;
    const pairs = Object.entries(p).map(([k,v])=>[k, v]).sort((a,b)=>a[1]-b[1]);
    const lines = [];
    for (let i=1;i<pairs.length;i++){
      const [k, t] = pairs[i];
      const dt = (pairs[i][1] - pairs[i-1][1]).toFixed(1);
      lines.push(`${k}: +${dt} ms`);
    }
    document.getElementById('perf').textContent = lines.join('\n');
  });
}

function ctx(text, idx){
  if (idx < 0) return '–';
  const start = Math.max(0, idx - 200);
  const end = Math.min(text.length, idx + 200);
  return text.slice(start, end);
}

function renderSelfCheck(checks){
  const host = document.getElementById('selfCheck');
  host.innerHTML = '<table><thead><tr><th>Check</th><th>Status</th><th>Hinweis</th></tr></thead><tbody>' +
    checks.map(c=>`<tr><td>${esc(c.name)}</td><td>${badge(c.status)}</td><td>${esc(c.hint||'')}</td></tr>`).join('') +
    '</tbody></table>';
}
function renderModuleStatus(mods){
  const host = document.getElementById('moduleStatus');
  host.innerHTML = '<table><thead><tr><th>Modul</th><th>Vorhanden</th></tr></thead><tbody>' +
    mods.map(m=>`<tr><td>${esc(m.name)}</td><td>${m.present?'✔️':'❌'}</td></tr>`).join('') +
    '</tbody></table>';
}
function esc(s){ return String(s??'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function badge(s){ const c = s==='PASS'?'#2e7d32':(s==='WARN'?'#ed6c02':'#b00020'); return `<span style="padding:2px 6px;border-radius:6px;background:${c}20;color:${c};border:1px solid ${c}55">${s}</span>`; }
