import { fromDe, parseDeNum } from './util.js';

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

let pdfjsLib = null;
async function lib() {
  if (!pdfjsLib) {
    pdfjsLib = await import(PDFJS);
    pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER;
  }
  return pdfjsLib;
}

export async function extractText(arrayBuffer) {
  const pdfjs = await lib();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const rows = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5];
      const x = it.transform[4];
      let row = rows.find((r) => Math.abs(r.y - y) < 3);
      if (!row) rows.push((row = { y, items: [] }));
      row.items.push({ x, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    pages.push(rows.map((r) => r.items.sort((a, b) => a.x - b.x).map((i) => i.s.trim()).join('  ')).join('\n'));
  }
  return pages.join('\n');
}

export function detectType(text) {
  if (/Depotauszug/.test(text)) return 'depot';
  if (/Finanzstatus/.test(text)) return 'depot';
  if (/Kontoauszug/.test(text) || /Verrechnungskonto/.test(text)) return 'konto';

  return 'unbekannt';
}

export function parseDepot(text) {
  const dateM = /per\s+(\d{2}\.\d{2}\.\d{4})/.exec(text);
  const date = dateM ? fromDe(dateM[1]) : null;
  // Zeile 1: „Stückzahl  Name  [Verwahrart]  Wert EUR“, Zeile 2: „ISIN  [Land]“
  const lines = text.split('\n').map((l) => l.trim());
  const rowRe = /^(\d+(?:\.\d+)?)\s{2,}(.+?)(?:\s{2,}\S*(?:verwahrung|rechnung))?\s{2,}(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR$/i;
  const positions = [];
  let cat = '';
  lines.forEach((line, i) => {
    const hm = /^(Exchange Traded Funds|Aktien|Fonds|Anleihen|Zertifikate|Optionsscheine)$/.exec(line);
    if (hm) cat = hm[1];
    const im = /^([A-Z]{2}[A-Z0-9]{9}\d)\b/.exec(line);
    const rm = im && i > 0 ? rowRe.exec(lines[i - 1]) : null;
    if (!rm) return;
    const shares = parseFloat(rm[1]);
    const value = parseDeNum(rm[3]);
    const name = rm[2].replace(/\s{2,}/g, ' ').trim();
    positions.push({
      isin: im[1],
      name,
      shares,
      value,
      price: shares ? value / shares : 0,
      type: cat === 'Exchange Traded Funds' || cat === 'Fonds' ? 'ETF' : 'Aktie',
    });
  });
  const seen = new Set();
  return { kind: 'depot', date, positions: positions.filter((p) => (seen.has(p.isin) ? false : seen.add(p.isin))) };
}

export function parseKonto(text) {
  // Buchungszeile „DD.MM.YYYY  DD.MM.YYYY  Beschreibung  ±Betrag EUR“, optional gefolgt von
  // einer Detailzeile „0,02 Stk. Name (ISIN)“ bzw. „Name (ISIN)“
  const lines = text.split('\n').map((l) => l.trim());
  const re = /^(\d{2}\.\d{2}\.\d{4})\s+\d{2}\.\d{2}\.\d{4}\s+(.*?)\s*([+-])\s?(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR$/;
  const items = [];
  lines.forEach((line, i) => {
    const m = re.exec(line);
    if (!m) return;
    const nextLine = lines[i + 1] || '';
    const detail = !re.test(nextLine) && /\([A-Z]{2}[A-Z0-9]{9}\d\)|Stk\./.test(nextLine) ? nextLine : '';
    const amount = parseDeNum(m[4]) * (m[3] === '-' ? -1 : 1);
    const desc = `${m[2]} ${detail}`.replace(/\s{2,}/g, ' ').trim();
    const isinM = /\(([A-Z]{2}[A-Z0-9]{9}\d)\)/.exec(detail);
    const sharesM = /([\d.,]+)\s*Stk\./.exec(detail);
    const name = detail.replace(/^[\d.,]+\s*Stk\.\s*/, '').replace(/\s*\([A-Z]{2}[A-Z0-9]{9}\d\)\s*$/, '').replace(/\s{2,}/g, ' ').trim();
    const base = { date: fromDe(m[1]), desc, isin: isinM?.[1] || null, name: name || null };
    if (/Quellensteuer|Kapitalertrags?steuer|Solidarit|Kirchensteuer/i.test(desc) && !/Erstattung/i.test(desc)) {
      items.push({ ...base, type: 'tax', amount: -amount });
    } else if (isinM && sharesM && /Kauf|Sparplan/i.test(desc) && !/Verkauf/i.test(desc) && amount < 0) {
      items.push({ ...base, type: 'buy', amount: -amount, shares: parseDeNum(sharesM[1]), sharesRounded: true });
    } else if (isinM && sharesM && (/Verkauf/i.test(desc) || amount > 0)) {
      items.push({ ...base, type: 'sell', amount, shares: parseDeNum(sharesM[1]), sharesRounded: true });
    } else if (isinM && /Ausschüttung|Dividende|Ertrag|Kapitalmaßnahme/i.test(desc) && amount > 0) {
      items.push({ ...base, type: 'dividend', amount, tax: 0 });
    } else if (/Überweisung|Einzahlung|Lastschrift|Gutschrift/i.test(desc)) {
      items.push({ ...base, type: amount > 0 ? 'deposit' : 'withdrawal', amount: Math.abs(amount) });
    } else if (/Gebühr|Entgelt|Kosten/i.test(desc) && amount < 0) {
      items.push({ ...base, type: 'fee', amount: -amount });
    } else if (/(^|\s)Zins/i.test(desc)) {
      items.push({ ...base, type: 'interest', amount });
    } else {
      items.push({ ...base, type: 'unknown', amount });
    }
  });
  attachTaxes(items);
  const periodM = /Zeitraum\s+(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/.exec(text);
  return {
    kind: 'konto',
    from: periodM ? fromDe(periodM[1]) : null,
    to: periodM ? fromDe(periodM[2]) : null,
    items: items.filter((x) => !x._merged),
  };
}

function attachTaxes(items) {
  const divs = items.filter((x) => x.type === 'dividend');
  const taxes = items.filter((x) => x.type === 'tax' && !x.isin);
  const dayDiff = (a, b) => Math.abs((new Date(a) - new Date(b)) / 864e5);
  for (const tax of taxes) {
    const cands = divs.filter((d) => dayDiff(d.date, tax.date) <= 1);
    if (!cands.length) continue;
    const us = /US/i.test(tax.desc) ? cands.filter((d) => d.isin.startsWith('US')) : cands;
    const pool = us.length ? us : cands;
    pool.sort((a, b) => {
      const sa = Math.abs(tax.amount - 0.15 * a.amount) + (a.tax ? 100 : 0) + dayDiff(a.date, tax.date);
      const sb = Math.abs(tax.amount - 0.15 * b.amount) + (b.tax ? 100 : 0) + dayDiff(b.date, tax.date);
      return sa - sb;
    });
    pool[0].tax = Math.round(((pool[0].tax || 0) + tax.amount) * 100) / 100;
    tax._merged = true;
  }
}

export async function parsePdfFile(file) {
  const text = await extractText(await file.arrayBuffer());
  const type = detectType(text);
  if (type === 'depot') return { ...parseDepot(text), fileName: file.name, text };
  if (type === 'konto') return { ...parseKonto(text), fileName: file.name, text };
  return { kind: 'unbekannt', fileName: file.name, text };
}
