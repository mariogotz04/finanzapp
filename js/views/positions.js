import { state, savePortfolio } from '../store.js';
import { computeHoldings, TX_LABEL, sortedTx } from '../calc.js';
import { scoped, viewPfIds, pfName } from '../scope.js';
import { paidDividends, providerEvents, ttmPerShare, frequency, announced } from '../divs.js';
import { mount, $, $$, toast, logo, segButtons } from '../ui.js';
import { valueChart, stackedBarChart } from '../charts.js';
import { rangeButtons, seriesFor, rangePerf, CLASS_LABEL } from './overview.js';
import { eur, num, pct, signedEur, signedPct, cls, esc, deDate, parseDeNum, traderfoxUrl, aktienfinderUrl, newsUrl } from '../util.js';

let sortKey = 'value';
let query = '';

export function renderPositions() {
  const h = computeHoldings(scoped(), state.prices);
  const sorters = {
    value: (a, b) => b.value - a.value,
    gain: (a, b) => b.gainPct - a.gainPct,
    day: (a, b) => b.dayChange / (b.value || 1) - a.dayChange / (a.value || 1),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  const q = query.toLowerCase();
  const list = [...h.positions].filter((x) => !q || x.name.toLowerCase().includes(q) || x.isin.toLowerCase().includes(q)).sort(sorters[sortKey]);
  const classes = [...new Set(list.map((x) => x.type))].sort((a, b) => (a === 'Krypto') - (b === 'Krypto') || a.localeCompare(b));
  const block = (type) => {
    const arr = list.filter((x) => x.type === type);
    return `<section class="card"><div class="card-head"><h3>${CLASS_LABEL[type] || type}</h3><span class="muted">${eur(arr.reduce((s, x) => s + x.value, 0))}</span></div>
      <ul class="list flat">${arr
        .map(
          (x) => `<li><a href="#/position/${esc(x.isin)}">${logo(x.isin, x.name)}
          <div class="l"><b>${esc(x.name)}</b><small>${num(x.shares)} Stk. · Ø ${eur(x.avg)} · ${pct(x.weight)}</small></div>
          <div class="r"><b>${eur(x.value)}</b><small class="${cls(sortKey === 'day' ? x.dayChange : x.gain)}">${sortKey === 'day' ? signedEur(x.dayChange) : signedPct(x.gainPct)}</small></div></a></li>`,
        )
        .join('')}</ul></section>`;
  };
  mount(
    `<input id="q" class="search" placeholder="Suchen…" value="${esc(query)}" autocomplete="off">
    ${segButtons([['value', 'Wert'], ['gain', 'Rendite'], ['day', 'Heute'], ['name', 'A–Z']], sortKey, 'k', 'small')}
    ${classes.map(block).join('')}
    ${list.length ? '' : '<p class="muted center">Keine Positionen.</p>'}
    <a class="btn" href="#/einstand">Einstandskurse bearbeiten</a>`,
    'Holdings',
  );
  $$('[data-k]').forEach((b) => b.addEventListener('click', () => ((sortKey = b.dataset.k), renderPositions())));
  $('#q').addEventListener('input', (e) => {
    query = e.target.value;
    const pos = e.target.selectionStart;
    renderPositions();
    $('#q').focus();
    $('#q').setSelectionRange(pos, pos);
  });
}

let posTab = 'uebersicht';
let posRange = 'Max';

export function renderPosition(isin) {
  const full = state.portfolio;
  const p = scoped();
  const h = computeHoldings(p, state.prices);
  const x = h.positions.find((y) => y.isin === isin);
  const sec = full.securities[isin] || { name: isin };
  const txs = sortedTx(p).filter((t) => t.isin === isin).reverse();
  const q = state.prices.quotes?.[isin];
  const isCrypto = sec.type === 'Krypto';
  const head = `<section class="pos-head">${logo(isin, sec.name, 44)}<div><small class="muted">${esc(sec.type || 'Aktie')} · ${esc(isin)}${q?.symbol ? ` · ${esc(q.symbol)}` : ''}</small><h2>${esc(sec.name)}</h2></div></section>
    ${segButtons([['uebersicht', 'Übersicht'], ['dividenden', 'Dividenden'], ['aktivitaeten', 'Aktivitäten']], posTab, 'pt', 'tabs')}`;
  let body = '';
  if (posTab === 'uebersicht') {
    body = `${x ? `${rangeButtons(posRange)}<section class="card"><div class="chart-head"><div><div class="kv-big">${eur(x.price)}</div><span id="pos-perf"></span></div><small class="muted">${x.priceSource === 'live' ? 'Live-Kurs' : x.priceSource === 'pdf' ? `Kurs aus PDF (${deDate(x.priceTime)})` : 'Einstandskurs'}</small></div><div class="chart-box"><canvas id="posChart"></canvas></div></section>` : '<p class="muted center">Nicht mehr im Bestand.</p>'}
    ${
      x
        ? `<section class="card"><h3>Position</h3>
      <div class="kv"><span>Wert</span><b>${eur(x.value)}</b></div>
      <div class="kv"><span>Stück</span><b>${num(x.shares)}</b></div>
      <div class="kv"><span>Ø Einstandskurs</span><b>${eur(x.avg)}</b></div>
      <div class="kv"><span>Investiert</span><b>${eur(x.cost)}</b></div>
      <div class="kv"><span>Kursgewinn</span><b class="${cls(x.gain)}">${signedEur(x.gain)} (${signedPct(x.gainPct)})</b></div>
      <div class="kv"><span>Heute</span><b class="${cls(x.dayChange)}">${signedEur(x.dayChange)}</b></div>
      <div class="kv"><span>Gewichtung</span><b>${pct(x.weight)}</b></div>
      <div class="kv"><span>Dividenden netto</span><b class="pos">${eur(x.dividends)}</b></div>
      <div class="kv"><span>Portfolio${viewPfIds() ? '' : 's'}</span><b>${[...new Set(p.transactions.filter((t) => t.isin === isin).map((t) => pfName(full, t.pf)))].map(esc).join(', ')}</b></div></section>`
        : ''
    }
    ${
      isCrypto
        ? ''
        : `<section class="card links">
      <a target="_blank" rel="noopener" href="${traderfoxUrl(isin)}">TraderFox Aktienterminal ›</a>
      ${sec.type !== 'ETF' ? `<a target="_blank" rel="noopener" href="${aktienfinderUrl(sec)}">Aktienfinder Dividendenprofil ›</a>` : ''}
      <a target="_blank" rel="noopener" href="${newsUrl(sec)}">Aktuelle Nachrichten ›</a></section>`
    }
    <section class="card">
      <h3>Wertpapier bearbeiten</h3>
      <label>Name<input id="s-name" value="${esc(sec.name)}"></label>
      <label>Typ<select id="s-type">${['Aktie', 'ETF', 'Fonds', 'Krypto', 'Anleihe'].map((t) => `<option ${t === (sec.type || 'Aktie') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Kurs-Symbol (Alpha Vantage, optional)<input id="s-sym" placeholder="${esc(state.prices.quotes?.[isin]?.symbol || 'z. B. MSFT oder ALV.DEX')}" value="${esc(sec.symbol || '')}"></label>
      <label>Aktienfinder-Link (optional)<input id="s-af" placeholder="automatisch" value="${esc(sec.aktienfinder || '')}"></label>
      <button class="btn primary" id="s-save">Speichern</button>
    </section>`;
  } else if (posTab === 'dividenden') {
    const paid = paidDividends(p).filter((d) => d.isin === isin).reverse();
    const ev = providerEvents(state.dividends, isin);
    const ttm = ttmPerShare(state.dividends, isin);
    const next = announced(h, state.dividends).find((e) => e.isin === isin);
    const years = {};
    ev.forEach((e) => e.eur != null && (years[e.ex.slice(0, 4)] = (years[e.ex.slice(0, 4)] || 0) + e.eur));
    const ys = Object.keys(years).sort();
    const full5 = ys.filter((y) => y < String(new Date().getFullYear()));
    const cagr = (n) => (full5.length > n && years[full5[full5.length - 1 - n]] ? (Math.pow(years[full5[full5.length - 1]] / years[full5[full5.length - 1 - n]], 1 / n) - 1) * 100 : null);
    body = `<section class="tiles">
      <div class="tile"><span>Dividendenrendite TTM</span><b>${ttm && x ? pct((ttm / x.price) * 100) : '–'}</b><small class="muted">${ttm ? `${eur(ttm)} je Stück` : 'keine Anbieterdaten'}</small></div>
      <div class="tile"><span>Persönliche Rendite</span><b>${ttm && x ? pct((ttm / x.avg) * 100) : '–'}</b><small class="muted">auf Einstand</small></div>
      <div class="tile"><span>Nächste Dividende</span><b>${next ? eur(next.net) : '–'}</b><small class="muted">${next ? deDate(next.date) : frequency(state.dividends, isin) || ''}</small></div>
      <div class="tile"><span>Wachstum (CAGR 3J / 5J)</span><b>${cagr(3) == null ? '–' : signedPct(cagr(3))} / ${cagr(5) == null ? '–' : signedPct(cagr(5))}</b></div>
    </section>
    ${ys.length ? `<section class="card"><h3>Historische Dividenden je Stück</h3><div class="chart-box sm"><canvas id="histDiv"></canvas></div></section>` : ''}
    <section class="card"><h3>Erhaltene Dividenden</h3>
      ${paid.length ? `<ul class="list flat">${paid.map((d) => `<li><div class="li-row"><div class="l"><b>${deDate(d.date)}</b><small>Brutto ${eur(d.gross)}${d.tax ? ` · Steuer ${eur(d.tax)}` : ''}</small></div><div class="r"><b class="pos">${eur(d.net)}</b></div></div></li>`).join('')}</ul>` : '<p class="muted small">Noch keine Dividenden erfasst.</p>'}
    </section>
    ${
      ev.length
        ? `<section class="card"><h3>Alle Dividenden-Daten</h3><div class="tbl"><table><thead><tr><th>Ex-Tag</th><th>Zahltag</th><th>je Stück</th></tr></thead><tbody>${[...ev]
            .reverse()
            .slice(0, 40)
            .map((e) => `<tr><td>${deDate(e.ex)}</td><td>${deDate(e.pay) || '–'}</td><td>${e.eur != null ? eur(e.eur) : '–'}${e.cur && e.cur !== 'EUR' ? ` <small class="muted">(${num(e.amount)} ${esc(e.cur)})</small>` : ''}</td></tr>`)
            .join('')}</tbody></table></div></section>`
        : ''
    }`;
    setTimeout(() => {
      if (ys.length) stackedBarChart($('#histDiv'), ys, [{ label: 'je Stück', data: ys.map((y) => years[y]), color: '#5b8def' }]);
    });
  } else {
    body = `<ul class="list">${txs
      .map(
        (t) => `<li><a href="#/tx/${t.id}"><div class="l"><b>${TX_LABEL[t.type]}</b><small>${deDate(t.date)}${t.shares ? ` · ${num(t.shares)} Stk.` : ''} · ${esc(pfName(full, t.pf))}${t.needsCost ? ' · <span class="neg">Einstand fehlt</span>' : ''}</small></div>
        <div class="r"><b>${eur(t.amount)}</b>${t.tax ? `<small class="muted">Steuer ${eur(t.tax)}</small>` : ''}</div></a></li>`,
      )
      .join('')}</ul>
    <a class="btn" href="#/neu?isin=${encodeURIComponent(isin)}">Aktivität hinzufügen</a>`;
  }
  mount(head + body, sec.name, { back: true });
  $$('[data-pt]').forEach((b) => b.addEventListener('click', () => ((posTab = b.dataset.pt), renderPosition(isin))));
  if (posTab === 'uebersicht') {
    $('#s-save').onclick = async () => {
      full.securities[isin] = { ...sec, name: $('#s-name').value.trim() || sec.name, type: $('#s-type').value, symbol: $('#s-sym').value.trim() || undefined, aktienfinder: $('#s-af').value.trim() || undefined };
      await savePortfolio(`Wertpapier ${isin} bearbeitet`);
      toast('Gespeichert');
    };
    if (x) {
      let ch;
      const draw = () => {
        const s = seriesFor(p, posRange, isin);
        if (ch) ch.destroy();
        ch = valueChart($('#posChart'), s);
        const r = rangePerf(s);
        $('#pos-perf').innerHTML = `<span class="${cls(r.perf)}">${signedEur(r.perf)} (${signedPct(r.perfPct)})</span>`;
      };
      draw();
      $$('[data-range]').forEach((b) =>
        b.addEventListener('click', () => {
          posRange = b.dataset.range;
          $$('[data-range]').forEach((y) => y.classList.toggle('on', y === b));
          draw();
        }),
      );
    }
  }
}

export function renderEinstand() {
  const p = state.portfolio;
  const sp = scoped();
  const ids = viewPfIds();
  const h = computeHoldings(sp, state.prices);
  const rows = h.positions.map((x) => {
    const pending = sp.transactions.filter((t) => t.isin === x.isin && t.needsCost);
    return { ...x, pending };
  });
  mount(
    `<p class="muted pad">Trage je Position den <b>Einstandskurs pro Stück</b> ein (Scalable-App → Position → „Kaufkurs“ bzw. „Ø Kaufkurs“). Optional das Datum des ersten Kaufs, damit der Chart die Historie besser abbildet.</p>
    <ul class="list form">${rows
      .map(
        (x) => `<li data-isin="${x.isin}" class="${x.pending.length ? 'todo' : ''}">
        <div class="l"><b>${esc(x.name)}</b><small>${num(x.shares)} Stk. · aktuell Ø ${eur(x.avg)}${x.pending.length ? ' · <span class="neg">fehlt</span>' : ''}</small></div>
        <div class="row2"><input inputmode="decimal" class="avg" placeholder="Ø Kurs €" value="${x.pending.length ? '' : x.avg.toFixed(2).replace('.', ',')}">
        <input type="date" class="dt" value="${firstBuyDate(sp, x.isin)}"></div></li>`,
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
      if (Math.abs(avg - x.avg) < 0.005 && !rows.find((r) => r.isin === isin).pending.length && dt === firstBuyDate(sp, isin)) continue;
      applyAverageCost(p, isin, avg, x.shares, dt, ids);
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

// ids: nur Buchungen dieser Portfolios anpassen (null = alle)
export function applyAverageCost(p, isin, avg, shares, date, ids = null) {
  const inScope = (t) => !ids || ids.has(t.pf);
  const buys = p.transactions.filter((t) => t.isin === isin && t.type === 'buy' && inScope(t));
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
    const first = sortedTx(p).find((t) => t.isin === isin && t.type === 'buy' && inScope(t));
    if (first && date < first.date) first.date = date;
  }
}
