// app/parse/etoro-pdf-parser.js
import { parseNumber } from '../util/currency.js';

const FIELD_MAP = [
  { keys: [/Einzahlungen/i, /Deposits/i], prop: 'deposits' },
  { keys: [/Rückerstattungen/i, /Refunds/i], prop: 'refunds' },
  { keys: [/Gutschriften/i, /Credits/i], prop: 'credits' },
  { keys: [/Anpassungen/i, /Adjustments/i], prop: 'adjustments' },
  { keys: [/Gewinn oder Verlust \(nur geschlossene Positionen\)/i, /Gain or Loss \(closed positions only\)/i], prop: 'realized_pnl' },
  { keys: [/Dividenden/i, /Dividends/i], prop: 'dividends' },
  { keys: [/Übernachtgebühren/i, /Overnight fees/i], prop: 'overnight' },
  { keys: [/Kommission/i, /Commission/i], prop: 'commission' },
  { keys: [/Stempelsteuer/i, /Stamp duty/i], prop: 'stamp_duty' },
  { keys: [/Auszahlungen/i, /Withdrawals/i], prop: 'withdrawals' },
  { keys: [/Auszahlungsgebühren/i, /Withdrawal fees/i], prop: 'withdrawal_fees' },
  { keys: [/Umrechnungsgebühr/i, /Conversion fee/i], prop: 'fx_fees' },
  { keys: [/Realisiertes Eigenkapital - Ende/i, /Realized equity - End/i], prop: 'realized_end' }
];

const RE_POS_ID = /^\d{9,12}$/;
const RE_ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const RE_SIDE = /^(Long|Short)$/i;

export function parseEtoroPdf(pages, items, { geomEnabled=false, logs=()=>{} } = {}){
  const text = pages.join('\n');
  const lines = text.split(/\n+/).map(s=>s.trim()).filter(Boolean);

  // Konto-Felder
  const account = {};
  for (const fm of FIELD_MAP){
    const idx = lines.findIndex(l => fm.keys.some(k => k.test(l)));
    if (idx !== -1){
      // Zahl steht meist in derselben oder nächsten Zeile
      const bucket = lines.slice(idx, idx+5).join(' ');
      const m = bucket.match(/([\(\)\-\d\.,]+)\s*(USD|EUR)?/);
      if (m) account[fm.prop] = parseNumber(m[1]);
    }
  }

  // Trades als 5-Zeilen-Blöcke mit optionaler vorangestellter ISIN
  const trades = [];
  let pendingISIN = null;
  for (let i=0;i<lines.length;i++){
    const l = lines[i];

    if (RE_ISIN.test(l)) { pendingISIN = l; continue; }

    if (RE_POS_ID.test(l)){
      const posId = l;
      const name = lines[i-1] && !RE_ISIN.test(lines[i-1]) ? lines[i-1] : null;
      const side = (lines[i+1]||'').match(RE_SIDE)?.[0];
      const amount = parseNumber(lines[i+2]||'');
      const units = parseNumber(lines[i+3]||'');
      const t = {
        position_id: posId,
        name: name || '',
        symbol: extractSymbolFromName(name || ''),
        side: side ? capitalize(side) : '',
        amount: Number.isFinite(amount) ? amount : null,
        units: Number.isFinite(units) ? units : null,
        isin: pendingISIN || null
      };
      trades.push(t);
      pendingISIN = null;
      i += 3; // skip consumed lines
    }
  }

  // Cashflows (einfach): suche "Transaktionen/Transactions" Abschnitt, dann Datum + Zahl mit Klammerlogik
  const cashflows = [];
  const txStart = lines.findIndex(l => /(Transaktionen|Transactions)/i.test(l));
  if (txStart !== -1){
    for (let j = txStart; j < Math.min(lines.length, txStart+2000); j++){
      const s = lines[j];
      // Datum dd-mm-yyyy oder dd/mm/yyyy, optional Uhrzeit
      if (/\d{2}[\-\/.]\d{2}[\-\/.]\d{4}/.test(s) && /[\(\)\-\d\.,]+/.test(s)){
        const amt = parseNumber(s);
        if (amt !== null){
          const dateStr = (s.match(/\d{2}[\-\/.]\d{2}[\-\/.]\d{4}(?:\s+\d{2}:\d{2}:\d{2})?/)||[])[0];
          const iso = toISO(dateStr);
          cashflows.push({ date: iso, amount: amt, currency: 'USD' });
        }
      }
    }
  }

  // Geometrie-PnL (optional)
  if (geomEnabled && Array.isArray(items) && items.length){
    const pnlByPos = mapPnlByGeometry(items, { logs });
    for (const t of trades){
      const p = pnlByPos.get(t.position_id);
      if (typeof p === 'number') t.pnl = p;
    }
  }

  return { account, trades, cashflows };
}

function extractSymbolFromName(name){
  // eToro Format: "Elis SA (ELIS.PA)" -> ELIS.PA
  const m = name?.match(/\(([A-Z0-9\.\-]+)\)$/);
  return m ? m[1] : '';
}
function capitalize(s){ return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s; }

function toISO(s){
  const m = s.match(/(\d{2})[\-\/.](\d{2})[\-\/.](\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [_, d, mo, y, hh='00', mm='00', ss='00'] = m;
  return `${y}-${mo}-${d}T${hh}:${mm}:${ss}Z`;
}

function mapPnlByGeometry(items, { logs }){
  // Heuristik: Spaltenkopf "Gewinn (USD)" / "Profit (USD)" finden, dessen x = pnlX; dann Zahlen in dieser x-Spalte je Zeile der Position-ID zuordnen
  const heads = items.filter(it => /Gewinn \(USD\)|Profit \(USD\)|Gewinn \(EUR\)|Profit \(EUR\)/i.test(it.str));
  if (!heads.length) { logs('Keine Gewinn-Spaltenköpfe gefunden'); return new Map(); }
  // Nimm häufigsten x-Bereich (gerundete 5px)
  const bucket = new Map();
  for (const h of heads){
    const key = Math.round(h.x/5)*5;
    bucket.set(key, (bucket.get(key)||0)+1);
  }
  const pnlKey = [...bucket.entries()].sort((a,b)=>b[1]-a[1])[0][0];
  const pnlX = pnlKey;
  logs(`Pnl-Spalte ~x=${pnlX}`);

  // Sammle Position-IDs mit y
  const posItems = items.filter(it => /^\d{9,12}$/.test(it.str));
  // Map y->posId (nimm nahe y)
  const posByY = new Map();
  for (const it of posItems){ posByY.set(Math.round(it.y), it.str); }

  const pnlMap = new Map();
  for (const it of items){
    if (!/[\d\(\)\.,-]/.test(it.str)) continue;
    const kx = Math.round(it.x/5)*5;
    if (Math.abs(kx - pnlX) <= 10){
      const y = Math.round(it.y);
      // finde naheliegende pos y (gleiche Zeile oder 1-2 px darüber)
      let best = null, bestDy = 999;
      for (const [py,pos] of posByY){
        const dy = Math.abs(py - y);
        if (dy < bestDy && dy <= 6){ best = pos; bestDy = dy; }
      }
      if (best){
        const v = parseNumber(it.str);
        if (v !== null) pnlMap.set(best, v);
      }
    }
  }
  return pnlMap;
}
