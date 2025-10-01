// app/analytics/aggregations.js
export function aggregateAll(data){
  const fees = {
    overnight: data.account.overnight||0,
    commission: data.account.commission||0,
    stamp_duty: data.account.stamp_duty||0,
    withdrawal_fees: data.account.withdrawal_fees||0,
    fx_fees: data.account.fx_fees||0
  };

  const typeCounts = new Map();
  for (const t of data.trades){
    const typ = inferType(t);
    typeCounts.set(typ, (typeCounts.get(typ)||0)+Math.abs(t.amount||0));
  }
  const type = [...typeCounts.entries()].map(([k,v])=>({ label: k, value: v }));

  return { fees, type };
}

function inferType(t){
  if (t.symbol === 'BTC' || /BTC|ETH|XRP|Krypto|Crypto/i.test(t.name)) return 'Krypto';
  if (/\.PA|\.MC|\.DE|ADR|PLC|SA|Bank|AG|NV|PLC|ST\)/.test(t.name)) return 'Aktien';
  return 'CFD/Andere';
}
