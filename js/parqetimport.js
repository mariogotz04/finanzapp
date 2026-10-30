// Parqet-Export „Aktivitäten“ (CSV, Semikolon, deutsche Zahlen) → Buchungen der App.
// Gegenbuchungen auf dem Verrechnungskonto werden übersprungen; Ein-/Ausbuchungen (Depotüberträge)
// werden wie bei Parqet als Kauf/Verkauf zum Übertragungskurs geführt (source 'transfer').

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ';') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

const num = (s) => (s && s !== 'FEHLT' ? parseFloat(s.replace(',', '.')) : 0);
const r2 = (v) => Math.round(v * 100) / 100;
const deToIso = (d) => d.split('.').reverse().join('-');

export function isParqetCsv(text) {
  return /"?Aktivitäts-ID"?;/.test(text.slice(0, 2000)) && /Originaltyp/.test(text.slice(0, 2000));
}

export function parseParqet(text, fileName = '') {
  const [head, ...data] = parseCsv(text.replace(/^﻿/, ''));
  const col = Object.fromEntries(head.map((h, i) => [h, i]));
  const get = (r, k) => r[col[k]] ?? '';
  const portfolios = {};
  const securities = {};
  const skipped = [];
  for (const r of data) {
    if (get(r, 'Automatische Gegenbuchung') === 'Ja') continue;
    const type = get(r, 'Originaltyp');
    const pfName = get(r, 'Portfolio');
    const cls = get(r, 'Assetklasse');
    let json = {};
    try {
      json = JSON.parse(get(r, 'Originaldatensatz (JSON)') || '{}');
    } catch {}
    const id = get(r, 'Aktivitäts-ID');
    const date = deToIso(get(r, 'Datum'));
    const shares = num(get(r, 'Stück'));
    const amount = num(get(r, 'Betrag (amount)'));
    const fee = num(get(r, 'Gebühren'));
    const tax = num(get(r, 'Steuern'));
    const isin = cls === 'crypto' ? json.asset?.symbol || get(r, 'Symbol') : get(r, 'ISIN');
    const name = get(r, 'Name');
    let tx = null;
    const base = { id: `pq_${id}`, pqId: id, date, source: 'parqet' };
    if (['buy', 'sell', 'transfer_in', 'transfer_out', 'dividend'].includes(type) && (!isin || isin === 'FEHLT')) {
      skipped.push(`${date} ${type} ${name}: keine ISIN`);
      continue;
    }
    if (type === 'buy' || type === 'transfer_in') tx = { ...base, type: 'buy', isin, shares, amount: r2(amount + fee + tax), fee: r2(fee) };
    else if (type === 'sell' || type === 'transfer_out') tx = { ...base, type: 'sell', isin, shares, amount: r2(amount - fee), fee: r2(fee), tax: r2(tax) };
    else if (type === 'dividend') tx = { ...base, type: 'dividend', isin, amount: r2(amount), tax: r2(tax) };
    else if (type === 'deposit') tx = { ...base, type: 'deposit', amount: r2(amount) };
    else if (type === 'withdrawal') tx = { ...base, type: 'withdrawal', amount: r2(amount) };
    else if (type === 'interest') tx = { ...base, type: 'interest', amount: r2(amount), ...(tax ? { tax: r2(tax) } : {}) };
    else if (type === 'fees_taxes') {
      if (tax) tx = { ...base, type: 'tax', amount: r2(tax) };
      else if (fee) tx = { ...base, type: 'fee', amount: r2(fee) };
    } else skipped.push(`${date} ${type} ${name}: unbekannter Typ`);
    if (!tx) continue;
    if (type === 'transfer_in' || type === 'transfer_out') tx.source = 'transfer';
    // Gleicher Schlüssel wie beim Kontoauszug-Import, damit spätere PDF-Importe Doppelte erkennen
    tx.key = `${tx.date}|${tx.type}|${tx.isin || ''}|${Number(tx.amount).toFixed(2)}`;
    (portfolios[pfName] ||= { name: pfName, txs: [] }).txs.push(tx);
    if (tx.isin && !securities[tx.isin]) securities[tx.isin] = { name, type: cls === 'crypto' ? 'Krypto' : /ETF|UCITS|Fonds|Index/i.test(name) ? 'ETF' : 'Aktie' };
  }
  for (const p of Object.values(portfolios)) {
    p.txs.sort((a, b) => a.date.localeCompare(b.date));
    p.from = p.txs[0]?.date;
    p.to = p.txs[p.txs.length - 1]?.date;
  }
  return { kind: 'parqet', fileName, portfolios: Object.values(portfolios), securities, skipped };
}
