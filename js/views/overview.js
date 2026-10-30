import { state } from '../store.js';
import { computeHoldings, computeSeries, rangeStart } from '../calc.js';
import { mount, $, $$ } from '../ui.js';
import { valueChart, donutChart } from '../charts.js';
import { eur, pct, signedEur, signedPct, cls, esc, deDate, PALETTE } from '../util.js';

const RANGES = ['1W', '1M', '6M', 'YTD', '1J', '3J', 'Max'];
let currentRange = 'Max';

export function rangeButtons(active) {
  return `<div class="seg">${RANGES.map((r) => `<button data-range="${r}" class="${r === active ? 'on' : ''}">${r}</button>`).join('')}</div>`;
}

export function renderOverview() {
  const p = state.portfolio;
  const h = computeHoldings(p, state.prices);
  const missingCost = p.transactions.filter((t) => t.needsCost).length;
  const latest = state.reports[0];

  if (!h.positions.length) {
    mount(
      `<section class="card empty">
        <h2>Willkommen</h2>
        <p>Noch keine Positionen. Importiere deinen Scalable-Depotauszug bzw. Finanzstatus als PDF oder trage Käufe manuell ein.</p>
        <a class="btn primary" href="#/import">PDF importieren</a>
        <a class="btn" href="#/neu">Manuell eintragen</a>
      </section>`,
      'Depot',
    );
    return;
  }

  mount(
    `${missingCost ? `<a class="banner warn" href="#/einstand">Für ${missingCost} Position(en) fehlt der Einstandskurs – jetzt eintragen ›</a>` : ''}
    ${latest ? `<a class="banner report" href="#/bericht/${esc(latest.id)}"><span>Wochenbericht</span><b>${esc(latest.title)}</b><i>›</i></a>` : ''}
    <section class="hero">
      <div class="muted">Depotwert</div>
      <div class="big">${eur(h.total)}</div>
      <div class="${cls(h.dayChange)}">${signedEur(h.dayChange)} (${signedPct(h.dayChangePct)}) heute</div>
    </section>
    <section class="card">
      <div class="chart-head">
        <div><span class="dot g"></span>Wert <span class="dot gr"></span>Investiert</div>
        <div id="range-perf" class="small"></div>
      </div>
      <div class="chart-box"><canvas id="valueChart"></canvas></div>
      ${rangeButtons(currentRange)}
    </section>
    <section class="grid2">
      <div class="kpi"><span>Investiert</span><b>${eur(h.invested)}</b></div>
      <div class="kpi"><span>Kursgewinn</span><b class="${cls(h.unrealized)}">${signedEur(h.unrealized)}</b><small class="${cls(h.unrealized)}">${signedPct(h.unrealizedPct)}</small></div>
      <div class="kpi"><span>Dividenden (netto)</span><b>${eur(h.dividendsNet)}</b></div>
      <div class="kpi"><span>IZF p.a.</span><b class="${cls(h.xirr)}">${h.xirr == null ? '–' : signedPct(h.xirr)}</b></div>
      <div class="kpi"><span>Realisiert</span><b class="${cls(h.realized)}">${signedEur(h.realized)}</b></div>
      <div class="kpi"><span>Steuern / Gebühren</span><b>${eur(h.taxes + h.fees)}</b></div>
    </section>
    <section class="card">
      <h3>Gewichtung</h3>
      <div class="donut-wrap"><canvas id="donut"></canvas>
        <div class="donut-center"><b>${h.positions.length}</b><span>Positionen</span></div></div>
      ${allocationBar(h)}
      <ul class="legend">
        ${h.positions
          .map(
            (x, i) => `<li><a href="#/position/${x.isin}">
            <span class="sw" style="background:${PALETTE[i % PALETTE.length]}"></span>
            <span class="nm">${esc(x.name)}</span>
            <span class="wt">${pct(x.weight)}</span>
            <span class="vl">${eur(x.value)}</span></a></li>`,
          )
          .join('')}
      </ul>
    </section>
    <p class="foot muted">Kurse: ${state.prices.updated ? new Date(state.prices.updated).toLocaleString('de-DE') : 'noch keine Live-Kurse (Wert aus PDF)'}</p>`,
    'Depot',
  );

  chart = null;
  drawRange(p);
  donutChart($('#donut'), h.positions, (x) => (location.hash = `#/position/${x.isin}`));
  $$('.seg button').forEach((b) =>
    b.addEventListener('click', () => {
      currentRange = b.dataset.range;
      $$('.seg button').forEach((x) => x.classList.toggle('on', x === b));
      drawRange(p);
    }),
  );
}

function allocationBar(h) {
  const etf = h.positions.filter((x) => x.type === 'ETF').reduce((s, x) => s + x.weight, 0);
  const target = state.portfolio.settings.targetEtf;
  return `<div class="alloc">
    <div class="alloc-bar"><span style="width:${etf}%"></span></div>
    <div class="alloc-lbl"><span>ETFs ${pct(etf)}</span><span class="muted">Ziel ${target} / ${100 - target}</span><span>Aktien ${pct(100 - etf)}</span></div>
  </div>`;
}

let chart;
function drawRange(p) {
  const all = computeSeries(p, state.prices);
  const start = rangeStart(currentRange);
  let s = all.filter((x) => x.d >= start);
  if (s.length < 2) s = all.slice(-2);
  if (chart) chart.destroy();
  chart = valueChart($('#valueChart'), s);
  const first = s[0];
  const last = s[s.length - 1];
  if (first && last) {
    const perf = last.value - first.value - (last.invested - first.invested);
    const base = first.value || last.invested;
    $('#range-perf').innerHTML = `<span class="${cls(perf)}">${signedEur(perf)} (${signedPct(base ? (perf / base) * 100 : 0)})</span> <span class="muted">seit ${deDate(first.d)}</span>`;
  }
}
