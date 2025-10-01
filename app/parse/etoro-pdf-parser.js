import { parseNumber, isNegParen } from '../util/currency.js';
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
  acct.deposits       = grab('Einzahlungen');
  acct.refunds        = grab('Rückerstattungen');
  acct.credits        = grab('Gutschriften');
  acct.adjustments    = grab('Anpassungen');
  acct.realized_pnl   = grab('Gewinn oder Verlust (nur geschlossene Positionen)');
  acct.dividends      = grab('Dividenden');
  acct.overnight      = grab('Übernachtgebühren');
  acct.commission     = grab('Kommission');
  acct.stamp_duty     = grab('Stempelsteuer-Gebühr');
  acct.withdrawals    = grab('Auszahlungen');
  acct.withdrawal_fees= grab('Auszahlungsgebühren');
  acct.fx_fees        = grab('Umrechnungsgebühr für Ein-/Auszahlungen');
  acct.realized_end   = grab('Realisiertes Eigenkapital - Ende');

  // ---------- Geschlossene Positionen ----------
  const startIdx = lines.findIndex(l =>
    /Geschlossene Positionen|Closed Positions/i.test(l)
  );
  let endIdx = lines.length;
  if (startIdx !== -1) {
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (/(Dividendenübersicht|Dividends Overview|Transaktionen|Transactions|Kontoübersicht|Account Statement|Offene Positionen|Open Positions)/i.test(lines[i])) {
        endIdx = i;
        break;
      }
    }
  }
  const closedBlock = startIdx !== -1 ? lines.slice(startIdx, endIdx) : [];

  // Fragmente zusammenfassen
  const compact = s => s.replace(/\s+/g, ' ').trim();
  function joinFragments(arr) {
    const out = [];
    for (let i=0;i<arr.length;i++) {
      const cur = arr[i];
      const next = arr[i+1] || '';
      if ((cur.length < 6 || /\($/.test(cur)) && next) {
        out.push(compact(cur + ' ' + next));
        i++;
      } else {
        out.push(compact(cur));
      }
    }
    return out;
  }
  const blk = joinFragments(closedBlock);

  const trades = [];
  let t = null;
  function push() {
    if (!t) return;
    if (t.symbol || t.name || typeof t.pnl === 'number') trades.push(t);
    t = null;
  }

  for (const ln of blk) {
    // Start eines Trades
    if (/Positions-ID\s*[:#]?\s*[A-Za-z0-9-]+/i.test(ln)) {
      push();
      t = { fees: 0 };
      const idm = ln.match(/Positions-ID\s*[:#]?\s*([A-Za-z0-9-]+)/i);
      if (idm) t.position_id = idm[1];
      continue;
    }
    if (!t) continue;

    if (/\bShort\b/i.test(ln)) t.side = 'Short';
    if (/\bLong\b/i.test(ln))  t.side = t.side || 'Long';

    if (/ISIN/i.test(ln)) {
      const m = ln.match(/ISIN\s*([A-Z0-9]{12})/i);
      if (m) t.isin = m[1].toUpperCase();
    }

    if (!t.name && /\([A-Z0-9.\-:/]+\)/.test(ln)) {
      const m = ln.match(/^(.*?)\s*\(([A-Z0-9.\-:/]+)\)/);
      if (m) { t.name = m[1].trim(); t.symbol = m[2].trim(); }
    }

    const dts = ln.match(/\d{2}-\d{2}-\d{4} .*?\d{2}:\d{2}:\d{2}/g);
    if (dts?.length) {
      if (!t.opened_at) t.opened_at = parseDate(dts[0]);
      if (dts[1]) t.closed_at = parseDate(dts[1]);
    }

    const g = (re) => { const m = ln.match(re); return m ? parseNumber(m[1]) : null; };
    if (/Einheiten/i.test(ln)) { const v=g(/Einheiten\s*([0-9.,]+)/i); if(v!=null) t.units=v; }
    if (/Eröffnungskurs/i.test(ln)) { const v=g(/Eröffnungskurs\s*([0-9.,]+)/i); if(v!=null) t.open_px=v; }
    if (/Schlusskurs/i.test(ln)) { const v=g(/Schlusskurs\s*([0-9.,]+)/i); if(v!=null) t.close_px=v; }

    const num = (s) => { const v=parseNumber(s); return /^\(.*\)$/.test(s.trim())?-Math.abs(v):v; };
    const mFeeON = ln.match(/Übernachtgebüh\w*.*?([-()0-9.,]+)/i);
    if (mFeeON) t.fees += num(mFeeON[1]);
    const mFeeCom = ln.match(/Kommission.*?([-()0-9.,]+)/i);
    if (mFeeCom) t.fees += num(mFeeCom[1]);
    const mDiv = ln.match(/Dividenden.*?([-()0-9.,]+)/i);
    if (mDiv) t.dividends = num(mDiv[1]);

    const mPnl = ln.match(/Gewinn|Verlust|P&L/i) ? ln.match(/([-()0-9.,]+)\s*$/) : null;
    if (mPnl) t.pnl = num(mPnl[1]);
  }
  push();

  // ---------- Transaktionen -> Cashflows ----------
  const txStart = lines.findIndex(l => /Transaktionen|Transactions/i.test(l));
  let txEnd = lines.length;
  if (txStart !== -1) {
    for (let i = txStart+1; i<lines.length; i++) {
      if (/(Dividendenübersicht|Closed Positions|Geschlossene Positionen|Account|Kontoübersicht)/i.test(lines[i])) {
        txEnd = i; break;
      }
    }
  }
  let cashflows = [];
  if (txStart !== -1) {
    const tx = lines.slice(txStart, txEnd);
    for (const ln of tx) {
      const dm = ln.match(/(\d{2}-\d{2}-\d{4}).*?([(-]?[0-9.,)+-]+)/);
      if (!dm) continue;
      const d = parseDate(dm[1]);
      let amt = parseNumber(dm[2]);
      if (/Auszahlung|Withdrawal/i.test(ln)) amt = -Math.abs(amt);
      if (/Einzahlung|Deposit/i.test(ln))   amt = +Math.abs(amt);
      if (!Number.isNaN(amt) && d) cashflows.push({ date: d.toISOString(), amount: amt, currency: 'USD' });
    }
  }

  return { account: acct, trades, cashflows };
}
