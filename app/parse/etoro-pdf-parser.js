import { parseNumber } from '../util/currency.js';
import { parseDate } from '../util/date.js';

export function parseEtoroPdf(pages) {
  const text  = pages.join('\n');
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);

  // ---------- Kontoübersicht (Summen) ----------
  const acct = {};
  function grab(label) {
    const s  = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(s + '\\s*\\(?-?([\\d.,]+)\\)?');
    const m  = text.match(rx);
    if (!m) return null;
    const raw = m[1];
    const neg = new RegExp(s + '\\s*\\(([\\d.,]+)\\)').test(text);
    const val = parseNumber(raw);
    return neg ? -Math.abs(val) : val;
  }
  acct.deposits         = grab('Einzahlungen');
  acct.refunds          = grab('Rückerstattungen');
  acct.credits          = grab('Gutschriften');
  acct.adjustments      = grab('Anpassungen');
  acct.realized_pnl     = grab('Gewinn oder Verlust \\(nur geschlossene Positionen\\)');
  acct.dividends        = grab('Dividenden');
  acct.overnight        = grab('Übernachtgebühren');
  acct.commission       = grab('Kommission');
  acct.stamp_duty       = grab('Stempelsteuer-Gebühr');
  acct.withdrawals      = grab('Auszahlungen');
  acct.withdrawal_fees  = grab('Auszahlungsgebühren');
  acct.fx_fees          = grab('Umrechnungsgebühr für Ein-/Auszahlungen');
  acct.realized_end     = grab('Realisiertes Eigenkapital - Ende');

  // ---------- Globale Trade-Erkennung (5-Zeilen-Muster) ----------
  // Muster laut Diagnose:
  //  i:   "Name (SYMBOL)"
  //  i+1: Positions-ID  (nur Ziffern, 9–12 Stellen)
  //  i+2: "Long" oder "Short"
  //  i+3: Betrag (Zahl)
  //  i+4: Einheiten (Zahl)
  //
  // Zusätzlich: Eine ISIN (12-stellig) steht häufig kurz vor dem Namen als eigene Zeile.
  const trades = [];
  let pendingISIN = null;

  const isISIN = (s) => /^[A-Z0-9]{12}$/.test(s);
  const isDigitsId = (s) => /^\d{9,12}$/.test(s);
  const isSide = (s) => /\bLong\b|\bShort\b/i.test(s);
  const parseSide = (s) => /\bShort\b/i.test(s) ? 'Short' : (/\bLong\b/i.test(s) ? 'Long' : null);
  const isNumberLike = (s) => /[-()0-9.,]+/.test(s) && Number.isFinite(parseNumber(s.replace(/[^\d,.\-()]/g,'')));

  const parseNameSymbol = (line) => {
    const m = line.match(/^(.*?)\s*\(([A-Z0-9.\-:/]+)\)$/);
    if (m) return { name: m[1].trim(), symbol: m[2].trim() };
    // Fallback: nur Name zulassen (zur Not)
    if (/^[A-Za-z].{3,}$/.test(line)) return { name: line.trim(), symbol: null };
    return null;
  };

  // Header-Fenster: später ignorieren wir Zeilenfenster, die nur Überschriften enthalten
  // (z. B. "Aktion / Positions-ID / Long / Short / Betrag / Einheiten")
  const headerWindowMatches = (win) => {
    const txt = win.join(' ').toLowerCase();
    return /aktion/.test(txt) &&
           /(positions-id|position id)/.test(txt) &&
           /(long\s*\/\s*short|long\s+short)/.test(txt) &&
           /betrag/.test(txt) &&
           /einheiten/.test(txt);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ISIN-Puffer merken (wird der nächsten Datenzeile zugeordnet)
    if (isISIN(line)) { pendingISIN = line; continue; }

    // Kandidat: Name (SYMBOL)
    const ns = parseNameSymbol(line);
    if (!ns) continue;

    // Schutz: Kein Fenster verarbeiten, das nur die Kopfzeilen widerspiegelt
    const probe = lines.slice(i, i + 8);
    if (headerWindowMatches(probe)) continue;

    // Prüfe, ob danach 4 Zeilen das Muster erfüllen
    const idLine   = lines[i + 1];
    const sideLine = lines[i + 2];
    const amtLine  = lines[i + 3];
    const uniLine  = lines[i + 4];

    if ([idLine, sideLine, amtLine, uniLine].some(v => v == null)) continue;
    if (!isDigitsId(idLine)) continue;
    if (!isSide(sideLine)) continue;
    if (!isNumberLike(amtLine) || !isNumberLike(uniLine)) continue;

    const t = {
      position_id: idLine.trim(),
      name: ns.name,
      symbol: ns.symbol,
      side: parseSide(sideLine),
      amount: numberNegAware(amtLine),
      units: numberNegAware(uniLine),
      isin: pendingISIN || null
    };
    trades.push(t);

    // ISIN verbraucht + Fenster konsumieren
    pendingISIN = null;
    i += 4;
  }

  // ---------- Cashflows (Transaktionen) für XIRR (grob) ----------
  const cashflows = parseCashflows(lines);

  return { account: acct, trades, cashflows };
}

/* --------------------- Hilfsfunktionen ---------------------- */

function numberNegAware(s) {
  const v = parseNumber(String(s).replace(/[^\d,.\-()]/g,'').trim());
  return /^\(.*\)$/.test(String(s).trim()) ? -Math.abs(v) : v;
}

function parseCashflows(lines) {
  const findIndex = (rx) => {
    for (let i=0;i<lines.length;i++) if (rx.test(lines[i])) return i;
    return -1;
  };
  const findEnd = (start, rx) => {
    for (let i=start+1;i<lines.length;i++) if (rx.test(lines[i])) return i;
    return -1;
  };

  const txStart = findIndex(/(Transaktionen|Transactions)/i);
  if (txStart === -1) return [];
  const txEnd = findEnd(txStart, /(Dividendenübersicht|Dividends Overview|Closed Positions|Geschlossene Positionen|Kontoübersicht|Account Statement)/i);
  const seg = lines.slice(txStart, txEnd === -1 ? lines.length : txEnd);

  const flows = [];
  for (const z of seg) {
    const dm = z.match(/(\d{2}-\d{2}-\d{4}).*?([(-]?[0-9.,)+-]+)/);
    if (!dm) continue;
    const dIso = toIso(dm[1]);
    let amt = parseNumber(dm[2]);
    if (/Auszahlung|Withdrawal/i.test(z)) amt = -Math.abs(amt);
    if (/Einzahlung|Deposit/i.test(z))   amt = +Math.abs(amt);
    if (dIso && Number.isFinite(amt)) flows.push({ date: dIso, amount: amt, currency: 'USD' });
  }
  return flows;
}

function toIso(dmy) {
  const m = String(dmy).match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!m) return null;
  const [_, d, mo, y] = m;
  return `${y}-${mo}-${d}T00:00:00.000Z`;
}
