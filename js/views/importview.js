import { state, savePortfolio } from '../store.js';
import { defaultPf } from '../scope.js';
import { TX_LABEL, holdingSharesAt, computeHoldings } from '../calc.js';
import { mount, $, $$, toast } from '../ui.js';
import { parsePdfFile } from '../pdfimport.js';
import { eur, num, esc, deDate, uid } from '../util.js';

let queue = [];
let targetPf = null;
// Abgleich und Doppelte nur innerhalb des Zielportfolios
const inPf = (p) => ({ ...p, transactions: p.transactions.filter((t) => t.pf === targetPf) });

export function renderImport() {
  mount(
    `<section class="card">
      <h3>PDF-Import (Scalable Capital)</h3>
      <p class="muted">Unterstützt: <b>Depotauszug</b> und <b>Finanzstatus</b> (Bestände, ISIN, exakte Stückzahl, Kurswert) sowie <b>Kontoauszug</b> (Käufe, Verkäufe, Dividenden, Quellensteuer, Einzahlungen). Mehrere Dateien gleichzeitig möglich – Kontoauszüge werden vor Depotauszügen verarbeitet.</p>
      <label>Portfolio<select id="imp-pf">${state.portfolio.portfolios.map((x) => `<option value="${x.id}" ${x.id === defaultPf() ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <label class="file"><input type="file" id="pdf" accept="application/pdf" multiple><span>PDF auswählen</span></label>
      <div id="status" class="muted"></div>
    </section>
    <section class="card">
      <h3>Kein PDF?</h3>
      <a class="btn" href="#/neu">Aktivität manuell eintragen</a>
      <a class="btn" href="#/einstand">Einstandskurse eintragen</a>
    </section>
    <div id="preview"></div>`,
    'Import',
  );
  $('#pdf').onchange = async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    targetPf = $('#imp-pf').value;
    $('#status').textContent = 'Lese PDF…';
    const parsed = [];
    for (const f of files) {
      try {
        parsed.push(await parsePdfFile(f));
      } catch (err) {
        toast(`${f.name}: ${err.message}`);
      }
    }
    const rank = (x) => (x.kind === 'konto' ? 0 : 1);
    const dt = (x) => x.date || x.to || '';
    queue = parsed.sort((a, b) => rank(a) - rank(b) || dt(a).localeCompare(dt(b)));
    $('#status').textContent = '';
    next();
  };
}

function next() {
  const doc = queue.shift();
  const box = $('#preview');
  if (!doc) {
    box.innerHTML = '';
    return;
  }
  if (doc.kind === 'depot') return previewDepot(doc, box);
  if (doc.kind === 'konto') return previewKonto(doc, box);
  box.innerHTML = `<section class="card"><h3>${esc(doc.fileName)}</h3><p class="neg">Dokumenttyp nicht erkannt. Bitte Depotauszug, Finanzstatus oder Kontoauszug von Scalable verwenden.</p><button class="btn" id="skip">Weiter</button></section>`;
  $('#skip').onclick = next;
}

const txKey = (t) => `${t.date}|${t.type}|${t.isin || ''}|${Number(t.amount).toFixed(2)}`;

function previewKonto(doc, box) {
  const p = state.portfolio;
  const keys = new Set(inPf(p).transactions.map((t) => t.key || txKey(t)));
  const items = doc.items.map((it) => ({ ...it, key: txKey(it), dup: keys.has(txKey(it)) }));
  const usable = items;
  box.innerHTML = `<section class="card">
    <h3>Kontoauszug ${deDate(doc.from)} – ${deDate(doc.to)}</h3>
    <p class="muted">${usable.length} Buchungen erkannt. Bereits importierte sind abgewählt. Hinweis: Stückzahlen im Kontoauszug sind gerundet – die exakten Stückzahlen gleicht anschließend der Depotauszug/Finanzstatus ab.</p>
    <ul class="list check">${usable
      .map(
        (it, i) => `<li><label><input type="checkbox" data-i="${i}" ${it.dup || it.type === 'unknown' ? '' : 'checked'}>
        <div class="l"><b>${esc(it.name || TX_LABEL[it.type] || it.desc)}</b><small>${TX_LABEL[it.type] || 'Unbekannt'} · ${deDate(it.date)}${it.shares ? ` · ≈${num(it.shares)} Stk.` : ''}${it.dup ? ' · bereits vorhanden' : ''}</small></div>
        <div class="r"><b>${eur(it.amount)}</b>${it.tax ? `<small class="muted">Steuer ${eur(it.tax)}</small>` : ''}</div></label></li>`,
      )
      .join('')}</ul>
    <button class="btn primary" id="apply">Übernehmen</button><button class="btn" id="skip">Überspringen</button>
  </section>`;
  $('#skip').onclick = next;
  $('#apply').onclick = async () => {
    // syncAll (z. B. nach dem iOS-Dateiauswahl-Dialog) kann state.portfolio inzwischen ersetzt haben
    const p = state.portfolio;
    let n = 0;
    for (const cb of $$('input[data-i]', box)) {
      if (!cb.checked) continue;
      const it = usable[+cb.dataset.i];
      if (it.type === 'unknown') continue;
      if (it.isin && !p.securities[it.isin]) p.securities[it.isin] = { name: it.name || it.isin, type: /^IE|^LU/.test(it.isin) ? 'ETF' : 'Aktie' };
      const tx = { id: uid(), key: it.key, type: it.type, date: it.date, amount: Math.round(it.amount * 100) / 100, source: 'konto', pf: targetPf };
      if (it.isin) tx.isin = it.isin;
      if (it.shares != null) tx.shares = it.shares;
      if (it.type === 'dividend') tx.tax = it.tax || 0;
      p.transactions.push(tx);
      n++;
    }
    await savePortfolio(`Kontoauszug ${doc.from} – ${doc.to} importiert`);
    toast(`${n} Buchungen übernommen`);
    next();
  };
}

function previewDepot(doc, box) {
  const p = inPf(state.portfolio);
  const date = doc.date;
  const inPdf = new Set(doc.positions.map((x) => x.isin));
  const held = computeHoldings(p, state.prices).positions.filter((x) => !inPdf.has(x.isin));
  const rows = doc.positions.map((x) => {
    const cur = holdingSharesAt(p, x.isin, date);
    const diff = Math.round((x.shares - cur.shares) * 1e6) / 1e6;
    const lastDepot = p.securities[x.isin]?.lastDepotDate || '0000';
    const kontoTrades = p.transactions.some((t) => t.isin === x.isin && t.source === 'konto' && ['buy', 'sell'].includes(t.type) && t.date > lastDepot && t.date <= date);
    let action = 'none';
    // Erster Abgleich der Position: Altbestand vor dem Kontoauszug hat noch keinen Einstand
    if (diff > 1e-6 && (cur.shares <= 1e-6 || !p.securities[x.isin]?.lastDepotDate)) action = 'new';
    else if (Math.abs(diff) > 1e-6) action = kontoTrades ? 'correction' : diff > 0 ? 'buy' : 'sell';
    return { ...x, cur: cur.shares, diff, action };
  });
  const gone = held.map((x) => ({ isin: x.isin, name: x.name, shares: 0, cur: x.shares, diff: -x.shares, price: x.price, action: 'correction', gone: true }));
  const all = [...rows, ...gone];
  const label = { new: 'Neu (Einstand fehlt)', buy: 'Zukauf zum Stichtagskurs', sell: 'Verkauf zum Stichtagskurs', correction: 'Nur Stückzahl korrigieren', none: 'Unverändert' };
  box.innerHTML = `<section class="card">
    <h3>Depotbestand per ${deDate(date)}</h3>
    <p class="muted">${doc.positions.length} Positionen · ${eur(doc.positions.reduce((s, x) => s + x.value, 0))}</p>
    <ul class="list check">${all
      .map(
        (x, i) => `<li><label><input type="checkbox" data-i="${i}" ${x.action === 'none' || x.gone ? '' : 'checked'} ${x.action === 'none' ? 'disabled' : ''}>
        <div class="l"><b>${esc(x.name)}</b><small>${esc(x.isin)} · ${num(x.shares)} Stk.${x.diff ? ` · <span class="${x.diff > 0 ? 'pos' : 'neg'}">${x.diff > 0 ? '+' : ''}${num(x.diff)}</span>` : ''}</small>
        ${x.action !== 'none' && !x.gone && x.action !== 'new' ? `<select data-a="${i}">${['buy', 'sell', 'correction'].filter((a) => (x.diff > 0 ? a !== 'sell' : a !== 'buy')).map((a) => `<option value="${a}" ${a === x.action ? 'selected' : ''}>${label[a]}</option>`).join('')}</select>` : `<small>${x.gone ? 'Nicht mehr im Depot → Bestand auf 0' : label[x.action]}</small>`}</div>
        <div class="r"><b>${x.value != null ? eur(x.value) : ''}</b></div></label></li>`,
      )
      .join('')}</ul>
    <button class="btn primary" id="apply">Übernehmen</button><button class="btn" id="skip">Überspringen</button>
  </section>`;
  $('#skip').onclick = next;
  $('#apply').onclick = async () => {
    const p = state.portfolio;
    for (const x of doc.positions) {
      const s = p.securities[x.isin] || {};
      // Ein älterer Auszug darf neuere Stichtagskurse nicht überschreiben
      const newer = !s.lastDepotDate || date >= s.lastDepotDate;
      p.securities[x.isin] = { ...s, name: s.name && s.name !== x.isin ? s.name : x.name, type: s.type || x.type, ...(newer ? { lastPrice: x.price, lastPriceDate: date, lastDepotDate: date } : {}) };
    }
    let n = 0;
    for (const cb of $$('input[data-i]', box)) {
      if (!cb.checked || cb.disabled) continue;
      const i = +cb.dataset.i;
      const x = all[i];
      const action = $(`select[data-a="${i}"]`, box)?.value || x.action;
      const base = { id: uid(), isin: x.isin, date, source: 'depot', pf: targetPf };
      const amt = Math.round(Math.abs(x.diff) * x.price * 100) / 100;
      if (action === 'new') p.transactions.push({ ...base, type: 'buy', shares: x.diff, amount: amt, needsCost: true });
      else if (action === 'buy') p.transactions.push({ ...base, type: 'buy', shares: x.diff, amount: amt });
      else if (action === 'sell') p.transactions.push({ ...base, type: 'sell', shares: -x.diff, amount: amt, tax: 0 });
      else if (action === 'correction') p.transactions.push({ ...base, type: 'correction', shares: x.diff, amount: 0 });
      n++;
    }
    await savePortfolio(`Depotauszug per ${date} abgeglichen`);
    toast(`${n} Änderungen übernommen`);
    const missing = p.transactions.some((t) => t.needsCost);
    if (!queue.length && missing) location.hash = '#/einstand';
    else next();
  };
}
