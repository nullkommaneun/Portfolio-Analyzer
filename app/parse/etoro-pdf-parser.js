import { parseNumber } from '../util/currency.js';
import { parseDate } from '../util/date.js';

export function parseEtoroPdf(pages) {
  const text = pages.join('\n');
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);

  // ---------- Kontoübersicht (Summen) ----------
  const acct = {};
  function grab(label) {
    const s = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(s + '\\s*\\(?-?([\\d.,]+)\\)?');
    const m = text.match(rx);
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

  // ---------- Abschnittsgrenzen ----------
  const closedStart = findIndex(lines, /(Geschlossene Positionen|Closed Positions)/i);
  const closedEnd   = (closedStart === -1) ? -1 : findEnd(lines, closedStart, /(Dividendenübersicht|Dividends Overview|Transaktionen|Transactions|Kontoübersicht|Account Statement|Offene Positionen|Open Positions)/i);

  // Wenn kein Closed-Block: sofort zurück (wir zeigen wenigstens Summen/Dividenden an)
  if (closedStart === -1) {
    return { account: acct, trades: [], cashflows: [] };
  }

  const closedBlock = lines.slice(closedStart, closedEnd === -1 ? lines.length : closedEnd);

  // ---------- Tabellenkopf für die Zeilen finden ----------
  // Wir suchen einen kleinen Fensterbereich, der die Spaltenüberschriften enthält.
  const headIdx = findHeaderIndex(closedBlock);
  const trades = [];

  // Falls kein Kopf gefunden: keine Trades (wir geben Summen zurück)
  if (headIdx === -1) {
    return { account: acct, trades, cashflows: parseCashflows(lines) };
  }

  // ---------- ISIN-„Puffer“ (ISIN steht oft vor einer Zeile separat) ----------
  // Wir merken uns die letzte gesehene ISIN; sie wird der nächsten Datenzeile zugeordnet.
  let pendingISIN = null;

  // ---------- Zeilenblöcke parsen ----------
  // Ab Kopfzeile + 1 beginnen die Zeilen. Jede Zeile hat das Muster:
  // Name(Symbol), Positions-ID, Long/Short, Betrag, Einheiten
  for (let i = headIdx + 1; i < closedBlock.length; ) {
    const nameLine = closedBlock[i];
    // Leere/Trenner überspringen
    if (!nameLine || isSeparator(nameLine)) { i++; continue; }

    // Ein nackter 12-stelliger Code an dieser Stelle? -> wahrscheinlich ISIN-Puffer
    if (isISIN(nameLine)) {
      pendingISIN = nameLine;
      i++;
      continue;
    }

    // Erwartet: "Name (SYMBOL)"
    const nameSym = parseNameSymbol(nameLine);
    const idLine  = closedBlock[i+1];
    const sideLine= closedBlock[i+2];
    const amtLine = closedBlock[i+3];
    const unitsLn = closedBlock[i+4];

    // Wenn eins davon fehlt, abbrechen.
    if ([idLine, sideLine, amtLine, unitsLn].some(v => v == null)) break;

    // Positions-ID ist reine Ziffernfolge (9–12)
    if (!/^\d{9,12}$/.test(idLine)) {
      // Kein regulärer Zeilensatz – ggf. verschobene Struktur: eins weiter
      i++;
      continue;
    }

    // Long/Short
    const side = /\bShort\b/i.test(sideLine) ? 'Short' : (/\bLong\b/i.test(sideLine) ? 'Long' : null);

    // Betrag & Einheiten (Zahlen)
    const amount = safeNum(amtLine);
    const units  = safeNum(unitsLn);

    const t = {
      position_id: idLine,
      name: nameSym?.name || null,
      symbol: nameSym?.symbol || null,
      side,
      units: isFinite(units) ? units : null,
      amount: isFinite(amount) ? amount : null,
      isin: pendingISIN || null,
      // PnL ist in diesem Layout nicht direkt als "Gewinn" je Zeile vorhanden (Header gesehen, Werte fragmentiert);
      // wir lassen pnl vorerst leer. Optional: später heuristisch über Spalten "Gewinn (USD)" rekonstruiert.
    };
    trades.push(t);

    // ISIN-Verbrauch
    pendingISIN = null;
    // 5er Block konsumieren
    i += 5;
  }

  return { account: acct, trades, cashflows: parseCashflows(lines) };
}

/* --------------------- Hilfsfunktionen ---------------------- */

function findIndex(arr, rx) {
  for (let i=0;i<arr.length;i++) if (rx.test(arr[i])) return i;
  return -1;
}
function findEnd(arr, start, endRx) {
  for (let i = start + 1; i < arr.length; i++) if (endRx.test(arr[i])) return i;
  return -1;
}
function isSeparator(s) {
  return /^[-—–\s]*$/.test(s) || /^Gesamtsumme|^Summe$/i.test(s);
}
function isISIN(s) {
  return /^[A-Z0-9]{12}$/.test(s);
}
function safeNum(s) {
  const v = parseNumber(String(s).replace(/[^\d,.\-()]/g,'').trim());
  if (Number.isFinite(v)) return /^\(.*\)$/.test(String(s)) ? -Math.abs(v) : v;
  return NaN;
}
function parseNameSymbol(line) {
  // "Elis SA (ELIS.PA)" -> {name, symbol}
  const m = line.match(/^(.*?)\s*\(([A-Z0-9.\-:/]+)\)$/);
  if (m) return { name: m[1].trim(), symbol: m[2].trim() };
  // Fallback: nur Name
  if (/^[A-Za-z].{3,}$/.test(line)) return { name: line.trim(), symbol: null };
  return null;
}

function findHeaderIndex(block) {
  // Wir suchen ein kleines Cluster, das so aussieht:
  //  ... "Aktion" / "Positions-ID" / "Long / Short" / "Betrag" / "Einheiten"
  // durch Fragmentierung können diese Begriffe auf benachbarten Zeilen liegen.
  for (let i = 0; i < block.length; i++) {
    const win = block.slice(i, i + 8).join(' ').toLowerCase();
    if (
      /aktion/.test(win) &&
      /positions-id|position id/.test(win) &&
      /long\s*\/\s*short|long\s+short/.test(win) &&
      /betrag/.test(win) &&
      /einheiten/.test(win)
    ) {
      // Kopfzeile ist nahe bei i (der genau Zeilenindex ist die Zeile mit "Positions-ID")
      // Suche eine einzelne Zeile in [i, i+8], die "Positions-ID" enthält:
      for (let j=i; j<i+8 && j<block.length; j++) {
        if (/positions-id|position id/i.test(block[j])) return j;
      }
      return i;
    }
  }
  // Alternativ: Wenn wir unmittelbar nach "Gewinn (USD)" Kopf haben, nutze den
  for (let i = 0; i < block.length; i++) {
    const win = block.slice(i, i + 6).join(' ').toLowerCase();
    if (/gewinn/.test(win) && /devisenkurs|eröffnung|usd|eur/.test(win)) return i;
  }
  return -1;
}

function parseCashflows(lines) {
  // Transaktionen / Transactions -> grobe Ein-/Auszahlungen als Cashflows (für XIRR)
  const txStart = findIndex(lines, /(Transaktionen|Transactions)/i);
  if (txStart === -1) return [];
  const txEnd = findEnd(lines, txStart, /(Dividendenübersicht|Dividends Overview|Closed Positions|Geschlossene Positionen|Kontoübersicht|Account Statement)/i);
  const seg = lines.slice(txStart, txEnd === -1 ? lines.length : txEnd);

  const flows = [];
  for (const z of seg) {
    const dm = z.match(/(\d{2}-\d{2}-\d{4}).*?([(-]?[0-9.,)+-]+)/);
    if (!dm) continue;
    const d = parseDate(dm[1]);
    let amt = parseNumber(dm[2]);
    if (/Auszahlung|Withdrawal/i.test(z)) amt = -Math.abs(amt);
    if (/Einzahlung|Deposit/i.test(z))   amt = +Math.abs(amt);
    if (d && Number.isFinite(amt)) flows.push({ date: d.toISOString(), amount: amt, currency: 'USD' });
  }
  return flows;
}
