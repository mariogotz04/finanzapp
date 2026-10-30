import { state, savePortfolio } from '../store.js';
import { TX_LABEL, sortedTx } from '../calc.js';
import { mount, $, $$, toast, confirmDialog } from '../ui.js';
import { eur, num, esc, deDate, today, parseDeNum, uid, isValidIsin } from '../util.js';

let filter = 'alle';

export function renderActivities() {
  const p = state.portfolio;
  const txs = sortedTx(p)
    .reverse()
    .filter((t) => filter === 'alle' || (filter === 'trade' ? ['buy', 'sell', 'correction'].includes(t.type) : t.type === filter));
  const byMonth = {};
  txs.forEach((t) => (byMonth[t.date.slice(0, 7)] ||= []).push(t));
  const monthName = (k) => new Date(k + '-15').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  mount(
    `<div class="seg small">${[
      ['alle', 'Alle'],
      ['trade', 'Käufe/Verk.'],
      ['dividend', 'Dividenden'],
      ['deposit', 'Einzahl.'],
    ]
      .map(([k, l]) => `<button data-f="${k}" class="${k === filter ? 'on' : ''}">${l}</button>`)
      .join('')}</div>
    <a class="btn primary" href="#/neu">+ Aktivität eintragen</a>
    ${Object.entries(byMonth)
      .map(
        ([m, arr]) => `<h3 class="sec">${monthName(m)}</h3><ul class="list">${arr
          .map((t) => {
            const name = t.isin ? p.securities[t.isin]?.name || t.isin : TX_LABEL[t.type];
            return `<li><a href="#/tx/${t.id}"><div class="l"><b>${esc(name)}</b><small>${TX_LABEL[t.type]} · ${deDate(t.date)}${t.shares ? ` · ${num(t.shares)} Stk.` : ''}</small></div>
            <div class="r"><b class="${['dividend', 'sell', 'deposit', 'interest'].includes(t.type) ? 'pos' : ''}">${t.type === 'correction' ? '–' : eur(t.amount)}</b>${t.tax ? `<small class="muted">−${eur(t.tax)} Steuer</small>` : ''}</div></a></li>`;
          })
          .join('')}</ul>`,
      )
      .join('')}
    ${txs.length ? '' : '<p class="muted center">Keine Aktivitäten.</p>'}`,
    'Aktivitäten',
  );
  $$('.seg button').forEach((b) => b.addEventListener('click', () => ((filter = b.dataset.f), renderActivities())));
}

export function renderTxForm(id, query) {
  const p = state.portfolio;
  const existing = id ? p.transactions.find((t) => t.id === id) : null;
  const t = existing || { type: 'buy', date: today(), isin: query.get('isin') || '', shares: '', amount: '', fee: '', tax: '' };
  const sec = p.securities[t.isin] || {};
  const secOptions = Object.entries(p.securities)
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([i, s]) => `<option value="${i}">${esc(s.name)}</option>`)
    .join('');
  const baseAmt = t.amount === '' ? '' : t.type === 'buy' ? t.amount - (t.fee || 0) : t.type === 'sell' ? t.amount + (t.fee || 0) : t.amount;
  const fmt = (v) => (v === '' || v == null ? '' : String(Math.round(v * 10000) / 10000).replace('.', ','));
  mount(
    `<section class="card form">
      <label>Art<select id="f-type">${Object.entries(TX_LABEL)
        .map(([k, l]) => `<option value="${k}" ${k === t.type ? 'selected' : ''}>${l}</option>`)
        .join('')}</select></label>
      <label>Datum<input type="date" id="f-date" value="${t.date}"></label>
      <div class="sec-fields">
        <label>ISIN<input id="f-isin" list="secs" autocapitalize="characters" value="${esc(t.isin || '')}" placeholder="z. B. US1912161007"></label>
        <datalist id="secs">${secOptions}</datalist>
        <label>Name<input id="f-name" value="${esc(sec.name || '')}" placeholder="z. B. Coca-Cola"></label>
        <label>Typ<select id="f-sectype">${['Aktie', 'ETF', 'Fonds', 'Krypto', 'Anleihe'].map((x) => `<option ${x === (sec.type || 'Aktie') ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="f-shares">Stückzahl<input id="f-shares" inputmode="decimal" value="${fmt(t.shares)}"></label>
        <label class="f-price">Kurs pro Stück (€)<input id="f-price" inputmode="decimal" value="${t.shares && baseAmt ? fmt(baseAmt / t.shares) : ''}"></label>
      </div>
      <label class="f-amount">Betrag gesamt (€)<input id="f-amount" inputmode="decimal" value="${fmt(baseAmt)}"></label>
      <label class="f-fee">Gebühren (€)<input id="f-fee" inputmode="decimal" value="${fmt(t.fee)}"></label>
      <label class="f-tax">Steuern (€)<input id="f-tax" inputmode="decimal" value="${fmt(t.tax)}"></label>
      <label>Notiz<input id="f-note" value="${esc(t.note || '')}"></label>
      <button class="btn primary" id="f-save">${existing ? 'Speichern' : 'Hinzufügen'}</button>
      ${existing ? '<button class="btn danger" id="f-del">Löschen</button>' : ''}
    </section>`,
    existing ? 'Aktivität bearbeiten' : 'Neue Aktivität',
    { back: true },
  );
  const upd = () => {
    const ty = $('#f-type').value;
    const withSec = ['buy', 'sell', 'dividend', 'correction'].includes(ty);
    $('.sec-fields').hidden = !withSec;
    $$('.f-shares,.f-price').forEach((e) => (e.hidden = !['buy', 'sell', 'correction'].includes(ty)));
    $('.f-price').hidden = !['buy', 'sell'].includes(ty);
    $('.f-amount').hidden = ty === 'correction';
    $('.f-fee').hidden = !['buy', 'sell'].includes(ty);
    $('.f-tax').hidden = !['dividend', 'sell'].includes(ty);
  };
  upd();
  $('#f-type').onchange = upd;
  $('#f-isin').onchange = () => {
    const s = p.securities[$('#f-isin').value.trim().toUpperCase()];
    if (s) {
      $('#f-name').value = s.name;
      $('#f-sectype').value = s.type || 'Aktie';
    }
  };
  const recalc = () => {
    const sh = parseDeNum($('#f-shares').value);
    const pr = parseDeNum($('#f-price').value);
    if (sh > 0 && pr > 0) $('#f-amount').value = String(Math.round(sh * pr * 100) / 100).replace('.', ',');
  };
  $('#f-shares').oninput = recalc;
  $('#f-price').oninput = recalc;

  $('#f-save').onclick = async () => {
    const type = $('#f-type').value;
    const withSec = ['buy', 'sell', 'dividend', 'correction'].includes(type);
    const isin = $('#f-isin').value.trim().toUpperCase();
    const n = (sel) => {
      const v = parseDeNum($(sel).value);
      return Number.isFinite(v) ? v : 0;
    };
    const tx = {
      id: existing?.id || uid(),
      type,
      date: $('#f-date').value,
      amount: type === 'correction' ? 0 : n('#f-amount'),
      source: existing?.source || 'manuell',
    };
    if (withSec) {
      if (!isValidIsin(isin)) return toast('Bitte gültige ISIN eingeben');
      tx.isin = isin;
      const name = $('#f-name').value.trim();
      p.securities[isin] = { ...(p.securities[isin] || {}), name: name || p.securities[isin]?.name || isin, type: $('#f-sectype').value };
    }
    if (['buy', 'sell', 'correction'].includes(type)) {
      tx.shares = n('#f-shares');
      if (!tx.shares && type !== 'correction') return toast('Bitte Stückzahl eingeben');
    }
    if (['buy', 'sell'].includes(type)) tx.fee = n('#f-fee');
    if (['dividend', 'sell'].includes(type)) tx.tax = n('#f-tax');
    if (!tx.date) return toast('Bitte Datum wählen');
    if (type !== 'correction' && !(tx.amount > 0)) return toast('Bitte Betrag eingeben');
    if (type === 'buy' && tx.fee) tx.amount += tx.fee;
    if (type === 'sell' && tx.fee) tx.amount -= tx.fee;
    const note = $('#f-note').value.trim();
    if (note) tx.note = note;
    if (existing) Object.assign(existing, tx, { needsCost: false });
    else p.transactions.push(tx);
    await savePortfolio(`${TX_LABEL[type]} ${tx.isin || ''} gespeichert`);
    toast('Gespeichert');
    history.back();
  };
  if (existing)
    $('#f-del').onclick = async () => {
      if (!confirmDialog('Aktivität wirklich löschen?')) return;
      p.transactions = p.transactions.filter((x) => x.id !== existing.id);
      await savePortfolio('Aktivität gelöscht');
      history.back();
    };
}
