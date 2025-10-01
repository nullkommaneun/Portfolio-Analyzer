import { parseNumber, isNegParen } from '../util/currency.js';
import { parseDate } from '../util/date.js';

/**
 * Parser tailormade für das bereitgestellte eToro-Muster:
 * - Deutsche Labels ("Kontoübersicht", "Einzahlungen", "Übernachtgebühren", ...)
 * - Negative Werte in Klammern
 * - "Geschlossene Positionen" Abschnitt heuristisch mit State-Machine
 */
export function parseEtoroPdf(pages) {
  const text = pages.join('\n');

  // ---------- Kontoübersicht (Header-Block) ----------
  const acct = {};
  function grab(label) {
    const safe = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe + '\\s*\\(?-?([\\d.,]+)\\)?');
    const m = text.match(rx);
    if (!m) return null;
    const raw = m[1];
    const neg = new RegExp(safe + '\\s*\\(([\\d.,]+)\\)').test(text);
    const val = parseNumber(raw);
    return neg ? -Math.abs(val) : val;
  }
  acct.deposits        = grab('Einzahlungen');
  acct.refunds         = grab('Rückerstattungen');
  acct.credits         = grab('Gutschriften');
  acct.adjustments     = grab('Anpassungen');
  acct.realized_pnl    = grab('Gewinn oder Verlust (nur geschlossene Positionen)');
  acct.dividends       = grab('Dividenden');
  acct.overnight       = grab('Übernachtgebühren');
  acct.commission      = grab('Kommission');
  acct.stamp_duty      = grab('Stempelsteuer-Gebühr');
  acct.withdrawals     = grab('Auszahlungen');
  acct.withdrawal_fees = grab('Auszahlungsgebühren');
  acct.fx_fees         = grab('Umrechnungsgebühr für Ein-/Auszahlungen');
  acct.realized_end    = grab('Realisiertes Eigenkapital - Ende');

  // ---------- Geschlossene Positionen ----------
  const trades = [];
  const lines = text.split('\n');
  let inClosed = false, buf = [];
  for (const ln of lines) {
    if (/Geschlossene Positionen/i.test(ln)) { inClosed = true; continue; }
    if (inClosed && /(ISIN|Positions-ID|Long|Short)/i.test(ln)) { buf.push(ln); continue; }
    if (inClosed && /(Dividendenübersicht|Kontoüberblick|Kontoübersicht)/i.test(ln)) {
      // Abschnitt endet – einfache Heuristik
      break;
    }
    if (inClosed) buf.push(ln);
  }

  // State Machine
  let current = null;
  function pushCurrent() { if (current && (current.symbol || current.name || current.pnl !== undefined)) trades.push(current); }
  for (const ln of buf) {
    const line = ln.trim();

    // Start eines neuen Trades bei Positions-ID
    if (/Positions-ID\s*[:#]?\s*[A-Za-z0-9-]+/.test(line)) {
      pushCurrent();
      current = { fees: 0 };
      const idm = line.match(/Positions-ID\s*[:#]?\s*([A-Za-z0-9-]+)/);
      if (idm) current.position_id = idm[1];
      continue;
    }
    if (!current) continue;

    // Side
    if (/\bShort\b/i.test(line)) current.side = 'Short';
    if (/\bLong\b/i.test(line))  current.side = current.side || 'Long';

    // ISIN
    if (/ISIN/i.test(line)) {
      const m = line.match(/ISIN\s*([A-Z0-9]{12})/i);
      if (m) current.isin = m[1].toUpperCase();
      continue;
    }

    // Datumsangaben
    if (/\d{2}-\d{2}-\d{4} .*?\d{2}:\d{2}:\d{2}/.test(line)) {
      const parts = line.match(/\d{2}-\d{2}-\d{4} .*?\d{2}:\d{2}:\d{2}/g);
      if (parts?.length>=1 && !current.opened_at) current.opened_at = parseDate(parts[0]);
      if (parts?.length>=2) current.closed_at = parseDate(parts[1]);
    }

    // Name (Heuristik: "Name (TICKER)")
    if (/\([A-Z0-9.\-:/]+\)\s*$/.test(line) && !current.name) {
      const m = line.match(/^(.*?)\s*\(([A-Z0-9.\-:/]+)\)\s*$/);
      if (m) { current.name = m[1].trim(); current.symbol = m[2].trim(); }
      continue;
    }

    // Einheiten
    if (/Einheiten\s*[0-9.,]+/i.test(line)) {
      const m = line.match(/Einheiten\s*([0-9.,]+)/i);
      if (m) current.units = parseNumber(m[1]);
    }

    // Kurse
    if (/Eröffnungskurs\s*[0-9.,]+/i.test(line)) {
      const m = line.match(/Eröffnungskurs\s*([0-9.,]+)/i);
      if (m) current.open_px = parseNumber(m[1]);
    }
    if (/Schlusskurs\s*[0-9.,]+/i.test(line)) {
      const m = line.match(/Schlusskurs\s*([0-9.,]+)/i);
      if (m) current.close_px = parseNumber(m[1]);
    }

    // PnL
    if (/Gewinn/i.test(line)) {
      const m = line.match(/Gewinn.*?([-()0-9.,]+)/i);
      if (m) {
        const raw = m[1].trim();
        current.pnl = isNegParen(raw) ? -Math.abs(parseNumber(raw)) : parseNumber(raw);
      }
    }

    // Gebühren im Trade
    if (/Übernachtgebüh/i.test(line)) {
      const m = line.match(/Übernachtgebüh.*?([-()0-9.,]+)/i);
      if (m) {
        const raw = m[1].trim();
        current.fees += isNegParen(raw) ? -Math.abs(parseNumber(raw)) : parseNumber(raw);
      }
    }
    if (/Kommission/i.test(line)) {
      const m = line.match(/Kommission.*?([-()0-9.,]+)/i);
      if (m) {
        const raw = m[1].trim();
        current.fees += isNegParen(raw) ? -Math.abs(parseNumber(raw)) : parseNumber(raw);
      }
    }
    if (/Dividenden/i.test(line)) {
      const m = line.match(/Dividenden.*?([-()0-9.,]+)/i);
      if (m) current.dividends = parseNumber(m[1]);
    }
  }
  pushCurrent();

  return { account: acct, trades };
}
