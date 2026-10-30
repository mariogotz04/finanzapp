import { state } from '../store.js';
import { computeHoldings, computeSeries, rangeStart, RANGES } from '../calc.js';
import { scoped, viewPfIds } from '../scope.js';
import { paidDividends, announced, monthKey } from '../divs.js';
import { mount, $, $$, logo, segButtons } from '../ui.js';
import { valueChart, gaugeChart, lineChart, stackedBarChart } from '../charts.js';
import { eur, pct, signedEur, signedPct, cls, esc, deDate, PALETTE, today, addDays } from '../util.js';

let currentRange = 'Max';
let chartTab = 'wert';
let allocTab = 'klassen';

export const CLASS_LABEL = { Aktie: 'Aktien', ETF: 'ETFs', Krypto: 'Kryptowährungen', Fonds: 'Fonds', Anleihe: 'Anleihen' };

export function rangeButtons(active) {
  return segButtons(RANGES.map((r) => [r, r]), active, 'range');
}

export function chip(v, text) {
  return `<span class="chip ${cls(v)}">${v > 0 ? '↑' : v < 0 ? '↓' : ''} ${text}</span>`;
}

export function rangePerf(series) {
  const first = series[0];
  const last = series[series.length - 1];
  if (!first || !last) return { perf: 0, perfPct: 0, from: null };
  const perf = last.value - first.value - (last.invested - first.invested);
  const base = first.value || last.invested;
  return { perf, perfPct: base ? (perf / base) * 100 : 0, from: first.d };
}

export function seriesFor(p, range, isin = null) {
  const all = computeSeries(p, state.prices, isin);
  let s = all.filter((x) => x.d >= rangeStart(range));
  if (s.length < 2) s = all.slice(-2);
  return s;
}

export function renderOverview() {
  const p = scoped();
  const h = computeHoldings(p, state.prices);
  const missingCost = p.transactions.filter((t) => t.needsCost).length;
  const latest = state.reports[0];

  if (!h.positions.length) {
    mount(
      `<section class="card empty">
        <h2>Willkommen</h2>
        <p>${viewPfIds() ? 'In dieser Ansicht gibt es noch keine Positionen.' : 'Noch keine Positionen.'} Importiere deinen Scalable-Depotauszug bzw. Finanzstatus als PDF oder trage Käufe manuell ein.</p>
        <a class="btn primary" href="#/import">PDF importieren</a>
        <a class="btn" href="#/neu">Manuell eintragen</a>
      </section>`,
      'Home',
    );
    return;
  }

  const classes = {};
  h.positions.forEach((x) => (classes[x.type] = (classes[x.type] || 0) + x.value));
  const divs = paidDividends(p);
  const div12 = divs.filter((d) => d.date > addDays(today(), -365)).reduce((s, d) => s + d.net, 0);
  const next = announced(h, state.dividends).slice(0, 3);
  const nonCrypto = h.positions.filter((x) => x.type !== 'Krypto');
  const crypto = h.positions.filter((x) => x.type === 'Krypto');
  const posRow = (x) => `<li><a href="#/position/${esc(x.isin)}">${logo(x.isin, x.name)}
      <div class="l"><b>${esc(x.name)}</b><small>${pct(x.weight)}</small></div>
      <div class="r"><b>${eur(x.value)}</b><small class="${cls(x.gain)}">${signedPct(x.gainPct)}</small></div></a></li>`;

  mount(
    `${missingCost ? `<a class="banner warn" href="#/einstand">Für ${missingCost} Position(en) fehlt der Einstandskurs – jetzt eintragen ›</a>` : ''}
    ${latest ? `<a class="banner report" href="#/bericht/${esc(latest.id)}"><span>Wochenbericht</span><b>${esc(latest.title)}</b><i>›</i></a>` : ''}
    ${rangeButtons(currentRange)}
    <section class="card gauge-card">
      <div class="gauge"><canvas id="gauge"></canvas>
        <div class="gauge-center"><div class="big">${eur(h.total)}</div><div id="range-perf"></div>
        <small class="muted">${h.positions.length} Assets | ${Object.keys(classes).length} Assetklasse${Object.keys(classes).length === 1 ? '' : 'n'}</small></div></div>
    </section>
    <section class="tiles">
      <div class="tile"><span>Investiert</span><b>${eur(h.invested)}</b></div>
      <div class="tile"><span>IZF</span><b class="${cls(h.xirr)}">${h.xirr == null ? '–' : pct(h.xirr)}</b></div>
      <div class="tile"><span>Kursgewinne</span><div>${chip(h.unrealized, pct(Math.abs(h.unrealizedPct)))}<b class="${cls(h.unrealized)}">${eur(h.unrealized)}</b></div></div>
      <div class="tile"><span>Dividenden</span><div>${chip(h.dividendsNet, pct(h.invested ? (h.dividendsNet / h.invested) * 100 : 0))}<b class="pos">${eur(h.dividendsNet)}</b></div></div>
    </section>
    <a class="more-link" href="#/analyse">Alle Details anzeigen</a>
    <section class="card">
      ${segButtons([['wert', 'Wertentwicklung'], ['perf', 'Performance']], chartTab, 'ct', 'tabs')}
      <div class="chart-head"><div id="chart-label"></div><div class="small muted" id="chart-sub"></div></div>
      <div class="chart-box"><canvas id="valueChart"></canvas></div>
    </section>
    <section class="card">
      <h3>Allokation</h3>
      ${segButtons([['portfolios', 'Portfolios'], ['klassen', 'Assetklassen']], allocTab, 'at', 'tabs')}
      <div id="alloc"></div>
    </section>
    <section class="card">
      <div class="card-head"><h3>Wertpapiere</h3><span class="muted">${eur(nonCrypto.reduce((s, x) => s + x.value, 0))}</span></div>
      <ul class="list flat">${nonCrypto.slice(0, 5).map(posRow).join('')}</ul>
      <a class="more-link" href="#/positionen">Alle anzeigen</a>
    </section>
    ${crypto.length ? `<section class="card"><div class="card-head"><h3>Kryptowährungen</h3><span class="muted">${eur(crypto.reduce((s, x) => s + x.value, 0))}</span></div><ul class="list flat">${crypto.slice(0, 5).map(posRow).join('')}</ul><a class="more-link" href="#/positionen">Alle anzeigen</a></section>` : ''}
    <section class="card">
      <div class="card-head"><h3>Dividenden</h3><a class="muted" href="#/dividenden">Alle ›</a></div>
      <div class="row-kv"><span class="muted">Letzte 12 Monate</span><b class="pos">${eur(div12)}</b></div>
      <div class="chart-box sm"><canvas id="divChart"></canvas></div>
    </section>
    <section class="card">
      <div class="card-head"><h3>Dividendenkalender</h3><a class="muted" href="#/dividendenkalender">Alle ›</a></div>
      ${
        next.length
          ? `<ul class="list flat">${next.map((e) => `<li><a href="#/position/${esc(e.isin)}">${logo(e.isin, e.name, 30)}<div class="l"><b>${esc(e.name)}</b><small>${deDate(e.date)}</small></div><div class="r"><b class="pos">${eur(e.net)}</b></div></a></li>`).join('')}</ul>`
          : `<p class="muted small">${state.dividends?.updated ? 'Keine angekündigten Dividenden.' : 'Angekündigte Dividenden erscheinen, sobald die Kursquelle Dividendentermine liefert.'}</p>`
      }
    </section>
    <p class="foot muted">Kurse: ${state.prices.updated ? new Date(state.prices.updated).toLocaleString('de-DE') : 'noch keine Live-Kurse (Wert aus PDF)'}</p>`,
    'Home',
  );

  gaugeChart($('#gauge'), h.positions, (x) => (location.hash = `#/position/${x.isin}`));
  drawChart(p);
  drawAlloc(h);
  drawDivMini(divs);
  $$('[data-range]').forEach((b) =>
    b.addEventListener('click', () => {
      currentRange = b.dataset.range;
      $$('[data-range]').forEach((x) => x.classList.toggle('on', x === b));
      drawChart(p);
    }),
  );
  $$('[data-ct]').forEach((b) =>
    b.addEventListener('click', () => {
      chartTab = b.dataset.ct;
      $$('[data-ct]').forEach((x) => x.classList.toggle('on', x === b));
      drawChart(p);
    }),
  );
  $$('[data-at]').forEach((b) =>
    b.addEventListener('click', () => {
      allocTab = b.dataset.at;
      $$('[data-at]').forEach((x) => x.classList.toggle('on', x === b));
      drawAlloc(h);
    }),
  );
}

let chart;
function drawChart(p) {
  const s = seriesFor(p, currentRange);
  if (chart) chart.destroy();
  const r = rangePerf(s);
  $('#range-perf').innerHTML = `<span class="${cls(r.perf)}">${signedEur(r.perf)} (${signedPct(r.perfPct)})</span>`;
  const last = s[s.length - 1];
  if (chartTab === 'wert') {
    chart = valueChart($('#valueChart'), s);
    $('#chart-label').innerHTML = `<span class="muted small">Wert am ${deDate(last?.d)}</span><div class="kv-big">${eur(last?.value)}</div>`;
    $('#chart-sub').innerHTML = `Investiert<br><b>${eur(last?.invested)}</b>`;
  } else {
    const vals = s.map((x) => (x.invested ? ((x.value - x.invested) / x.invested) * 100 : 0));
    chart = lineChart($('#valueChart'), s.map((x) => x.d), vals, { pct: true });
    $('#chart-label').innerHTML = `<span class="muted small">Rendite auf investiertes Kapital</span><div class="kv-big ${cls(vals[vals.length - 1])}">${signedPct(vals[vals.length - 1])}</div>`;
    $('#chart-sub').textContent = `seit ${deDate(s[0]?.d)}`;
  }
}

function drawAlloc(h) {
  const groups = {};
  if (allocTab === 'klassen') h.positions.forEach((x) => (groups[CLASS_LABEL[x.type] || x.type] = (groups[CLASS_LABEL[x.type] || x.type] || 0) + x.value));
  else {
    const full = state.portfolio;
    for (const pf of full.portfolios) {
      const hp = computeHoldings({ ...full, transactions: full.transactions.filter((t) => t.pf === pf.id) }, state.prices);
      if (hp.total) groups[pf.name] = hp.total;
    }
  }
  const total = Object.values(groups).reduce((s, v) => s + v, 0);
  $('#alloc').innerHTML = Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([k, v], i) => `<div class="abar"><div class="abar-top"><span><i class="sw" style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(k)}</span><span>${pct(total ? (v / total) * 100 : 0)}</span></div>
      <div class="abar-track"><span style="width:${total ? (v / total) * 100 : 0}%;background:${PALETTE[i % PALETTE.length]}"></span></div><small class="muted">${eur(v)}</small></div>`,
    )
    .join('');
}

function drawDivMini(divs) {
  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
    months.push(d.toISOString().slice(0, 7));
  }
  const vals = months.map((m) => divs.filter((d) => monthKey(d.date) === m).reduce((s, d) => s + d.net, 0));
  stackedBarChart(
    $('#divChart'),
    months.map((m) => new Date(m + '-15').toLocaleDateString('de-DE', { month: 'short' })),
    [{ label: 'Netto', data: vals, color: '#3dd68c' }],
    { onClick: () => (location.hash = '#/dividenden') },
  );
}
