import { state, savePortfolio } from '../store.js';
import { computeHoldings, computeSeries, rangeStart, TX_LABEL, sortedTx } from '../calc.js';
import { mount, $, $$, toast } from '../ui.js';
import { valueChart } from '../charts.js';
import { rangeButtons } from './overview.js';
import { eur, num, pct, signedEur, signedPct, cls, esc, deDate, parseDeNum, traderfoxUrl, aktienfinderUrl, newsUrl } from '../util.js';

let sortKey = 'value';

export function renderPositions() {
  const h = computeHoldings(state.portfolio, state.prices);
  const sorters = {
    value: (a, b) => b.value - a.value,
    gain: (a, b) => b.gainPct - a.gainPct,
    day: (a, b) => b.dayChange / (b.value || 1) - a.dayChange / (a.value || 1),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  const list = [...h.positions].sort(sorters[sortKey]);
  const group = (type) => list.filter((x) => (type === 'ETF' ? x.type === 'ETF' : x.type !== 'ETF'));
  const block = (title, arr) =>
    arr.length
      ? `<h3 class="sec">${title} <span class="muted">${eur(arr.reduce((s, x) => s + x.value, 0))}</span></h3>
      <ul class="list">${arr
        .map(
          (x) => `<li><a href="#/position/${x.isin}">
          <div class="l"><b>${esc(x.name)}</b><small>${num(x.shares)} Stk. · Ø ${eur(x.avg)} · ${pct(x.weight)}</small></div>
          <div class="r"><b>${eur(x.value)}</b><small class="${cls(x.gain)}">${signedPct(x.gainPct)}</small></div></a></li>`,
        )
        .join('')}</ul>`
      : '';
  mount(
    `<div class="seg small">${[
      ['value', 'Wert'],
      ['gain', 'Rendite'],
      ['day', 'Heute'],
      ['name', 'A–Z'],
    ]
      .map(([k, l]) => `<button data-k="${k}" class="${k === sortKey ? 'on' : ''}">${l}</button>`)
      .join('')}</div>
    ${block('ETFs', group('ETF'))}${block('Aktien', group('Aktie'))}
    ${h.positions.length ? '' : '<p class="muted center">Keine Positionen.</p>'}`,
    'Positionen',
  );
  $$('.seg button').forEach((b) => b.addEventListener('click', () => ((sortKey = b.dataset.k), renderPositions())));
}

export function renderPosition(isin) {
  const p = state.portfolio;
  const h = computeHoldings(p, state.prices);
  const x = h.positions.find((y) => y.isin === isin);
  const sec = p.securities[isin] || { name: isin };
  const txs = sortedTx(p).filter((t) => t.isin === isin).reverse();
  const q = state.prices.quotes?.[isin];
  mount(
    `<section class="hero">
      <div class="muted">${esc(sec.type || 'Aktie')} · ${esc(isin)}${q?.symbol ? ` · ${esc(q.symbol)}` : ''}</div>
      <div class="big">${eur(x?.value || 0)}</div>
      ${x ? `<div class="${cls(x.gain)}">${signedEur(x.gain)} (${signedPct(x.gainPct)}) gesamt</div>` : '<div class="muted">nicht mehr im Bestand</div>'}
    </section>
    ${x ? `<section class="card"><div class="chart-box"><canvas id="posChart"></canvas></div>${rangeButtons('Max')}</section>` : ''}
    ${
      x
        ? `<section class="grid2">
      <div class="kpi"><span>Stückzahl</span><b>${num(x.shares)}</b></div>
      <div class="kpi"><span>Gewichtung</span><b>${pct(x.weight)}</b></div>
      <div class="kpi"><span>Einstandskurs</span><b>${eur(x.avg)}</b></div>
      <div class="kpi"><span>Aktueller Kurs</span><b>${eur(x.price)}</b><small class="muted">${x.priceSource === 'live' ? 'Live' : x.priceSource === 'pdf' ? 'aus PDF' : 'Einstand'}</small></div>
      <div class="kpi"><span>Investiert</span><b>${eur(x.cost)}</b></div>
      <div class="kpi"><span>Dividenden netto</span><b>${eur(x.dividends)}</b></div>
    </section>`
        : ''
    }
    <section class="card links">
      <a target="_blank" rel="noopener" href="${traderfoxUrl(isin)}">TraderFox Aktienterminal ›</a>
      ${sec.type !== 'ETF' ? `<a target="_blank" rel="noopener" href="${aktienfinderUrl(sec)}">Aktienfinder Dividendenprofil ›</a>` : ''}
      <a target="_blank" rel="noopener" href="${newsUrl(sec)}">Aktuelle Nachrichten ›</a>
    </section>
    <section class="card">
      <h3>Wertpapier bearbeiten</h3>
      <label>Name<input id="s-name" value="${esc(sec.name)}"></label>
      <label>Typ<select id="s-type">${['Aktie', 'ETF', 'Fonds', 'Krypto', 'Anleihe'].map((t) => `<option ${t === (sec.type || 'Aktie') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Kurs-Symbol (Yahoo, optional)<input id="s-sym" placeholder="automatisch per ISIN" value="${esc(sec.symbol || '')}"></label>
      <label>Aktienfinder-Link (optional)<input id="s-af" placeholder="automatisch" value="${esc(sec.aktienfinder || '')}"></label>
      <button class="btn primary" id="s-save">Speichern</button>
    </section>
    <h3 class="sec">Aktivitäten</h3>
    <ul class="list">${txs
      .map(
        (t) => `<li><a href="#/tx/${t.id}"><div class="l"><b>${TX_LABEL[t.type]}</b><small>${deDate(t.date)}${t.shares ? ` · ${num(t.shares)} Stk.` : ''}${t.needsCost ? ' · <span class="neg">Einstand fehlt</span>' : ''}</small></div>
        <div class="r"><b>${eur(t.amount)}</b>${t.tax ? `<small class="muted">Steuer ${eur(t.tax)}</small>` : ''}</div></a></li>`,
      )
      .join('')}</ul>
    <a class="btn" href="#/neu?isin=${isin}">Aktivität hinzufügen</a>`,
    sec.name,
    { back: true },
  );
  $('#s-save').onclick = async () => {
    p.securities[isin] = { ...sec, name: $('#s-name').value.trim() || sec.name, type: $('#s-type').value, symbol: $('#s-sym').value.trim() || undefined, aktienfinder: $('#s-af').value.trim() || undefined };
    await savePortfolio(`Wertpapier ${isin} bearbeitet`);
    toast('Gespeichert');
  };
  if (x) {
    let ch;
    const draw = (r) => {
      const all = computeSeries(p, state.prices, isin);
      let s = all.filter((d) => d.d >= rangeStart(r));
      if (s.length < 2) s = all.slice(-2);
      if (ch) ch.destroy();
      ch = valueChart($('#posChart'), s);
    };
    draw('Max');
    $$('.seg button').forEach((b) =>
      b.addEventListener('click', () => {
        $$('.seg button').forEach((y) => y.classList.toggle('on', y === b));
        draw(b.dataset.range);
      }),
    );
  }
}

export function renderEinstand() {
  const p = state.portfolio;
  const h = computeHoldings(p, state.prices);
  const rows = h.positions.map((x) => {
    const pending = p.transactions.filter((t) => t.isin === x.isin && t.needsCost);
    return { ...x, pending };
  });
  mount(
    `<p class="muted pad">Trage je Position den <b>Einstandskurs pro Stück</b> ein (Scalable-App → Position → „Kaufkurs“ bzw. „Ø Kaufkurs“). Optional das Datum des ersten Kaufs, damit der Chart die Historie besser abbildet.</p>
    <ul class="list form">${rows
      .map(
        (x) => `<li data-isin="${x.isin}" class="${x.pending.length ? 'todo' : ''}">
        <div class="l"><b>${esc(x.name)}</b><small>${num(x.shares)} Stk. · aktuell Ø ${eur(x.avg)}${x.pending.length ? ' · <span class="neg">fehlt</span>' : ''}</small></div>
        <div class="row2"><input inputmode="decimal" class="avg" placeholder="Ø Kurs €" value="${x.pending.length ? '' : x.avg.toFixed(2).replace('.', ',')}">
        <input type="date" class="dt" value="${firstBuyDate(p, x.isin)}"></div></li>`,
      )
      .join('')}</ul>
    <button class="btn primary" id="e-save">Alle speichern</button>`,
    'Einstandskurse',
    { back: '#/' },
  );
  $('#e-save').onclick = async () => {
    let n = 0;
    for (const li of $$('li[data-isin]')) {
      const isin = li.dataset.isin;
      const avg = parseDeNum($('.avg', li).value);
      const dt = $('.dt', li).value;
      if (!(avg > 0)) continue;
      const x = h.positions.find((y) => y.isin === isin);
      if (Math.abs(avg - x.avg) < 0.005 && !rows.find((r) => r.isin === isin).pending.length && dt === firstBuyDate(p, isin)) continue;
      applyAverageCost(p, isin, avg, x.shares, dt);
      n++;
    }
    await savePortfolio('Einstandskurse eingetragen');
    toast(`${n} Position(en) aktualisiert`);
    location.hash = '#/';
  };
}

function firstBuyDate(p, isin) {
  return sortedTx(p).find((t) => t.isin === isin && t.type === 'buy')?.date || '';
}

export function applyAverageCost(p, isin, avg, shares, date) {
  const buys = p.transactions.filter((t) => t.isin === isin && t.type === 'buy');
  const targetCost = avg * shares;
  const adj = buys.filter((t) => t.needsCost || t.source === 'einstand');
  if (!adj.length) {
    const f = targetCost / (buys.reduce((s, t) => s + t.amount, 0) || 1);
    buys.forEach((t) => (t.amount = Math.round(t.amount * f * 100) / 100));
  } else {
    const otherCost = buys.filter((t) => !adj.includes(t)).reduce((s, t) => s + t.amount, 0);
    const adjShares = adj.reduce((s, t) => s + t.shares, 0) || 1;
    const rest = Math.max(0, targetCost - otherCost);
    adj.forEach((t) => {
      t.amount = Math.round(((rest * t.shares) / adjShares) * 100) / 100;
      t.needsCost = false;
      t.source = 'einstand';
    });
  }
  if (date) {
    const first = sortedTx(p).find((t) => t.isin === isin && t.type === 'buy');
    if (first && date < first.date) first.date = date;
  }
}
