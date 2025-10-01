import { parseNumber } from '../util/currency.js';
import { parseDate } from '../util/date.js';

export function parseEtoroPdf(pages) {
  const text = pages.join('\n');
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);

  // ---------- Kontoübersicht ----------
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

  // ---------- Geschlossene Positionen / Closed Positions ----------
  const startIdx = lines.findIndex(l => /Geschlossene Positionen|Closed Positions/i.test(l));
  let endIdx = lines.length;
  if (startIdx !== -1) {
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (/(Dividendenübersicht|Dividends Overview|Transaktionen|Transactions|Kontoübersicht|Account Statement|Offene Positionen|Open Positions)/i.test(lines[i])) {
        endIdx = i; break;
      }
    }
  }
  const closed = startIdx !== -1 ? lines.slice(startIdx, endIdx) : [];

  // Heuristik: Positions-IDs stehen als reine Ziffern-Zeilen (9–12 Stellen)
  const trades = [];
  function back(i, n) { return closed.slice(Math.max(0, i - n), i); }
  function fwd(i, n)  { return closed.slice(i + 1, Math.min(closed.length, i + 1 + n)); }

  for (let i = 0; i < closed.length; i++) {
    const ln = closed[i];
    if (/^\d{9,12}$/.test(ln)) {
      const t = { position_id: ln, fees: 0 };

      // Rückwärts: ISIN + Name (mit Symbol in Klammern)
      for (const z of back(i, 6)) {
        if (!t.isin && /^[A-Z0-9]{12}$/.test(z)) t.isin = z;
        if (!t.symbol) {
          const m = z.match(/^(.*?)\s*\(([A-Z0-9.\-:/]+)\)$/);
          if (m) { t.name = m[1].trim(); t.symbol = m[2].trim(); }
        }
      }
      // Vorwärts: Long/Short in den nächsten Zeilen
      for (const z of fwd(i, 6)) {
        if (!t.side && /\bShort\b/i.test(z)) { t.side = 'Short'; break; }
        if (!t.side && /\bLong\b/i.test(z))  { t.side = 'Long';  break; }
      }
      // Optional: rudimentäre Felder (werden häufig fragmentiert gerendert)
      // Versuche Einheiten/Preise/Zeiten in den nächsten Zeilen zu greifen:
      for (const z of fwd(i, 8)) {
        // Datumsangaben
        const dts = z.match(/\d{2}-\d{2}-\d{4} .*?\d{2}:\d{2}:\d{2}/g);
        if (dts?.length) {
          if (!t.opened_at) t.opened_at = parseDate(dts[0]);
          if (dts[1]) t.closed_at = parseDate(dts[1]);
        }
        // Einheiten
        const mUnits = z.match(/Einheiten\s*([0-9.,]+)/i);
        if (mUnits && !t.units) t.units = parseNumber(mUnits[1]);
        // Kurse
        const mOpen = z.match(/Eröffnungskurs\s*([0-9.,]+)/i);
        if (mOpen && !t.open_px) t.open_px = parseNumber(mOpen[1]);
        const mClose = z.match(/Schlusskurs\s*([0-9.,]+)/i);
        if (mClose && !t.close_px) t.close_px = parseNumber(mClose[1]);
        // Gebühren auf Trade-Ebene
        const mFeeON = z.match(/Übernachtgebüh\w*.*?([-()0-9.,]+)/i);
        if (mFeeON) t.fees += negAware(mFeeON[1]);
        const mFeeCom = z.match(/Kommission.*?([-()0-9.,]+)/i);
        if (mFeeCom) t.fees += negAware(mFeeCom[1]);
        // Dividenden im Trade
        const mDiv = z.match(/Dividenden.*?([-()0-9.,]+)/i);
        if (mDiv && t.dividends == null) t.dividends = negAware(mDiv[1]);
        // Versuch, PnL zu greifen (wenn Zeile mit „Gewinn/Verlust“-Werten endet)
        if (/Gewinn|Verlust|P&L/i.test(z)) {
          const m = z.match(/([-()0-9.,]+)\s*$/);
          if (m) t.pnl = negAware(m[1]);
        }
      }

      trades.push(t);
    }
  }

  // ---------- Transaktionen / Transactions -> Cashflows für XIRR ----------
  const txStart = lines.findIndex(l => /Transaktionen|Transactions/i.test(l));
  let txEnd = lines.length;
  if (txStart !== -1) {
    for (let i = txStart + 1; i < lines.length; i++) {
      if (/(Dividendenübersicht|Closed Positions|Geschlossene Positionen|Account|Kontoübersicht)/i.test(lines[i])) { txEnd = i; break; }
    }
  }
  let cashflows = [];
  if (txStart !== -1) {
    const tx = lines.slice(txStart, txEnd);
    for (const z of tx) {
      const dm = z.match(/(\d{2}-\d{2}-\d{4}).*?([(-]?[0-9.,)+-]+)/);
      if (!dm) continue;
      const d = parseDate(dm[1]);
      let amt = parseNumber(dm[2]);
      if (/Auszahlung|Withdrawal/i.test(z)) amt = -Math.abs(amt);
      if (/Einzahlung|Deposit/i.test(z))   amt = +Math.abs(amt);
      if (!Number.isNaN(amt) && d) cashflows.push({ date: d.toISOString(), amount: amt, currency: 'USD' });
    }
  }

  return { account: acct, trades, cashflows };

  // ---------- Helper ----------
  function negAware(s) {
    const v = parseNumber(s);
    return /^\(.*\)$/.test(String(s).trim()) ? -Math.abs(v) : v;
  }
    } 
