// app/ui/debug.js

const MARKERS = {
  closedStart: /Geschlossene Positionen|Closed Positions/i,
  closedEnd: /(Dividendenübersicht|Dividends Overview|Transaktionen|Transactions|Kontoübersicht|Account Statement|Offene Positionen|Open Positions)/i,
  txStart: /Transaktionen|Transactions/i,
  txEnd: /(Dividendenübersicht|Dividends Overview|Closed Positions|Geschlossene Positionen|Kontoübersicht|Account Statement)/i
};

export function deriveLines(textPages) {
  const text = (textPages || []).join('\n');
  return text.split('\n').map(s => s.trim()).filter(Boolean);
}

export function findSections(lines) {
  const idx = {
    closedStart: lines.findIndex(l => MARKERS.closedStart.test(l)),
    txStart:     lines.findIndex(l => MARKERS.txStart.test(l)),
  };
  idx.closedEnd = (() => {
    if (idx.closedStart < 0) return -1;
    for (let i = idx.closedStart + 1; i < lines.length; i++) {
      if (MARKERS.closedEnd.test(lines[i])) return i;
    }
    return lines.length;
  })();
  idx.txEnd = (() => {
    if (idx.txStart < 0) return -1;
    for (let i = idx.txStart + 1; i < lines.length; i++) {
      if (MARKERS.txEnd.test(lines[i])) return i;
    }
    return lines.length;
  })();
  return idx;
}

export function contextAround(lines, needleRegex, radius = 3, limit = 10) {
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (needleRegex.test(lines[i])) {
      const from = Math.max(0, i - radius), to = Math.min(lines.length, i + radius + 1);
      hits.push({ i, block: lines.slice(from, to), from, to });
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

export function dumpSectionsTo(preEl, lines, idx) {
  if (!preEl) return;
  const out = [];
  out.push(`[Abschnitte]`);
  out.push(`Closed Positions: start=${idx.closedStart}, end=${idx.closedEnd}`);
  out.push(`Transactions:     start=${idx.txStart}, end=${idx.txEnd}`);

  function snippet(start, end, title) {
    if (start < 0) { out.push(`-- ${title}: nicht gefunden --`); return; }
    const s = Math.max(0, start - 3), e = Math.min(lines.length, end + 3);
    out.push(`--- ${title} (${start}..${end}) ---`);
    for (let i = s; i < e; i++) out.push(`${String(i).padStart(5)}: ${lines[i]}`);
  }

  snippet(idx.closedStart, idx.closedEnd, 'ClosedBlock');
  snippet(idx.txStart, idx.txEnd, 'TransactionsBlock');
  preEl.textContent = out.join('\n');
}

export function dumpMatchesTo(preEl, lines) {
  if (!preEl) return;
  const pats = [
    { name: 'Positions-ID', rx: /Positions-ID|Position ID/i },
    { name: 'ISIN', rx: /\b[A-Z0-9]{12}\b/ },
    { name: 'Lang/Short', rx: /\bLong\b|\bShort\b/i },
    { name: 'Gewinn/Verlust', rx: /Gewinn|Verlust|P&L/i },
    { name: 'Einheiten', rx: /Einheiten\s*[0-9.,]+/i },
    { name: 'Eröffnungskurs', rx: /Eröffnungskurs\s*[0-9.,]+/i },
    { name: 'Schlusskurs', rx: /Schlusskurs\s*[0-9.,]+/i }
  ];
  const out = [];
  for (const p of pats) {
    const hits = contextAround(lines, p.rx, 2, 5);
    out.push(`== Treffer: ${p.name} (${hits.length}) ==`);
    if (!hits.length) { out.push('  —'); continue; }
    for (const h of hits) {
      out.push(`-- @${h.i} --`);
      out.push(...h.block.map((l, j) => `  ${String(h.from + j).padStart(5)}: ${l}`));
    }
  }
  preEl.textContent = out.join('\n');
}

export function showRaw(preEl, textPages) {
  if (!preEl) return;
  preEl.textContent = (textPages || []).map((t, i) => `--- PAGE ${i+1} ---\n${t}`).join('\n');
}

export function downloadRaw(textPages) {
  const blob = new Blob([(textPages || []).join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'etoro-rawtext.txt';
  a.click();
}
