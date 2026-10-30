import { state } from '../store.js';
import { computeHoldings, computeSeries, sortedTx } from '../calc.js';
import { scoped, pfName } from '../scope.js';
import { mount, $, $$, logo, segButtons } from '../ui.js';
import { gaugeChart, stackedBarChart } from '../charts.js';
import { CLASS_LABEL } from './overview.js';
import { eur, pct, signedPct, cls, esc, deDate, today, addDays, PALETTE } from '../util.js';

const COUNTRY = { US: 'USA', DE: 'Deutschland', IE: 'Irland', LU: 'Luxemburg', FR: 'Frankreich', NL: 'Niederlande', GB: 'Großbritannien', CH: 'Schweiz', AT: 'Österreich', DK: 'Dänemark', SE: 'Schweden', NO: 'Norwegen', FI: 'Finnland', ES: 'Spanien', IT: 'Italien', BE: 'Belgien', CA: 'Kanada', JP: 'Japan', AU: 'Australien', CN: 'China', KY: 'Kaimaninseln', JE: 'Jersey' };
const REGION = { US: 'Nordamerika', CA: 'Nordamerika', JP: 'Asien-Pazifik', AU: 'Asien-Pazifik', CN: 'Asien-Pazifik' };
const EU = ['DE', 'IE', 'LU', 'FR', 'NL', 'GB', 'CH', 'AT', 'DK', 'SE', 'NO', 'FI', 'ES', 'IT', 'BE', 'JE'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

// Herkunft der Merkmale: Datenanbieter (sec.sector/country/currency) oder ISIN-Land; sonst „Unbekannt“
function country(x) {
  if (x.type === 'Krypto') return 'Krypto';
  if (x.sec.country) return x.sec.country;
  if (x.type === 'ETF' || x.type === 'Fonds') return 'ETF/Fonds (gestreut)';
  return COUNTRY[x.isin.slice(0, 2)] || x.isin.slice(0, 2);
}
function region(x) {
  if (x.type === 'Krypto') return 'Krypto';
  if (x.type === 'ETF' || x.type === 'Fonds') return 'ETF/Fonds (gestreut)';
  const c = x.isin.slice(0, 2);
  return REGION[c] || (EU.includes(c) ? 'Europa' : 'Sonstige');
}
const GROUPS = {
  pos: ['Alle Positionen', (x) => x.name],
  klasse: ['Assetklasse', (x) => CLASS_LABEL[x.type] || x.type],
  sektor: ['Sektor', (x) => x.sec.sector || (x.type === 'ETF' ? 'ETF (breit gestreut)' : x.type === 'Krypto' ? 'Krypto' : 'Unbekannt')],
  region: ['Region', region],
  land: ['Land', country],
  waehrung: ['Währung', (x) => x.sec.currency || state.prices.quotes?.[x.isin]?.currency || 'Unbekannt'],
  portfolio: ['Portfolio', null],
};

function card(href, title, inner) {
  return `<a class="card acard" href="${href}"><div class="card-head"><h3>${title}</h3><span class="muted">›</span></div>${inner}</a>`;
}

export function renderAnalysis() {
  const p = scoped();
  const h = computeHoldings(p, state.prices);
  const yr = today().slice(0, 4);
  const txY = p.transactions.filter((t) => t.date.startsWith(yr));
  const taxY = txY.reduce((s, t) => s + (t.type === 'dividend' || t.type === 'sell' ? t.tax || 0 : t.type === 'tax' ? t.amount : 0), 0);
  const fees12 = p.transactions.filter((t) => t.date > addDays(today(), -365)).reduce((s, t) => s + (t.type === 'fee' ? t.amount : t.fee || 0), 0);
  const classes = new Set(h.positions.map((x) => x.type)).size;
  const heat = monthReturns(p).slice(-9);
  mount(
    `${card('#/gewichtung', 'Gewichtung', `<div class="gauge sm"><canvas id="gauge"></canvas><div class="gauge-center"><b>${eur(h.total)}</b><small class="muted">${h.positions.length} Assets | ${classes} Assetklasse${classes === 1 ? '' : 'n'}</small></div></div>`)}
    <div class="grid2">
      ${card('#/rendite', 'Renditedetails', `<div class="heat mini">${heat.map((m) => `<span class="${m.r == null ? '' : m.r >= 0 ? 'up' : 'dn'}" style="opacity:${m.r == null ? 0.25 : Math.min(1, 0.35 + Math.abs(m.r) / 6)}"></span>`).join('')}</div>`)}
      ${card('#/kapitalfluss', 'Kapitalfluss', `<div class="row-kv"><span class="muted small">Einzahlungen ${yr}</span><b>${eur(txY.filter((t) => t.type === 'deposit').reduce((s, t) => s + t.amount, 0))}</b></div>`)}
      ${card('#/gebuehren', 'Gebühren (12 Monate)', `<small class="muted">Gesamt</small><b>${eur(fees12)}</b>`)}
    </div>
    ${card(`#/steuern?y=${yr}`, 'Steuerdashboard', `<div class="kv"><span>Steuern auf Dividenden</span><b>${eur(txY.filter((t) => t.type === 'dividend').reduce((s, t) => s + (t.tax || 0), 0))}</b></div>
      <div class="kv"><span>Steuern auf Verkäufe</span><b>${eur(txY.filter((t) => t.type === 'sell').reduce((s, t) => s + (t.tax || 0), 0))}</b></div>
      <div class="kv"><span>Sonstige</span><b>${eur(txY.filter((t) => t.type === 'tax').reduce((s, t) => s + t.amount, 0))}</b></div>
      <div class="kv"><span><b>Gesamt ${yr}</b></span><b>${eur(taxY)}</b></div>`)}`,
    'Analyse',
  );
  gaugeChart($('#gauge'), h.positions);
}

let groupBy = 'pos';
export function renderWeighting() {
  const full = state.portfolio;
  const p = scoped();
  const h = computeHoldings(p, state.prices);
  const groups = {};
  if (groupBy === 'portfolio') {
    for (const pf of full.portfolios) {
      const hp = computeHoldings({ ...p, transactions: p.transactions.filter((t) => t.pf === pf.id) }, state.prices);
      if (hp.total) groups[pf.name] = { value: hp.total, items: hp.positions };
    }
  } else {
    for (const x of h.positions) {
      const k = GROUPS[groupBy][1](x);
      (groups[k] ||= { value: 0, items: [] }).value += x.value;
      groups[k].items.push(x);
    }
  }
  const items = Object.entries(groups)
    .map(([name, g], i) => ({ name, value: g.value, weight: h.total ? (g.value / h.total) * 100 : 0, items: g.items }))
    .sort((a, b) => b.value - a.value)
    .map((x, i) => ({ ...x, color: PALETTE[i % PALETTE.length] }));
  mount(
    `<div class="seg scroll">${Object.entries(GROUPS)
      .map(([k, [l]]) => `<button data-g="${k}" class="${k === groupBy ? 'on' : ''}">${l}</button>`)
      .join('')}</div>
    <section class="card"><div class="gauge"><canvas id="gauge"></canvas><div class="gauge-center"><div class="big">${eur(h.total)}</div><small class="muted">${items.length} ${GROUPS[groupBy][0] === 'Alle Positionen' ? 'Positionen' : 'Gruppen'}</small></div></div></section>
    <section class="card"><ul class="list flat">${items
      .map(
        (g) => `<li>${groupBy === 'pos' ? `<a href="#/position/${esc(g.items[0].isin)}">${logo(g.items[0].isin, g.name)}` : `<a class="noop"><span class="sw lg" style="background:${g.color}"></span>`}
        <div class="l"><b>${esc(g.name)}</b><small>${eur(g.value)}${groupBy !== 'pos' ? ` · ${g.items.length} Position${g.items.length === 1 ? '' : 'en'}` : ''}</small></div>
        <div class="r"><b>${pct(g.weight)}</b></div></a></li>`,
      )
      .join('')}</ul></section>
    ${['sektor', 'waehrung', 'land'].includes(groupBy) ? '<p class="foot muted">Sektor, Land und Währung kommen vom Kursdaten-Anbieter. Solange keine Daten vorliegen, wird bei Aktien das ISIN-Land verwendet bzw. „Unbekannt“ angezeigt.</p>' : ''}`,
    'Gewichtung',
    { back: '#/analyse' },
  );
  gaugeChart($('#gauge'), items);
  $$('[data-g]').forEach((b) => b.addEventListener('click', () => ((groupBy = b.dataset.g), renderWeighting())));
}

// Monatsrendite: Wertänderung ohne Zu-/Abflüsse, bezogen auf den Wert zu Monatsbeginn
function monthReturns(p) {
  const s = computeSeries(p, state.prices);
  if (!s.length) return [];
  const byMonth = {};
  for (const x of s) byMonth[x.d.slice(0, 7)] = x;
  const keys = Object.keys(byMonth).sort();
  const out = [];
  let prev = s[0];
  for (const k of keys) {
    const e = byMonth[k];
    const base = prev.value;
    const r = base ? ((e.value - prev.value - (e.invested - prev.invested)) / base) * 100 : null;
    out.push({ k, r: prev === e ? null : r });
    prev = e;
  }
  return out;
}

export function renderReturns() {
  const p = scoped();
  const m = monthReturns(p);
  const years = [...new Set(m.map((x) => x.k.slice(0, 4)))].sort().reverse();
  mount(
    `<p class="muted small pad">Monatliche Rendite des Depots (Kursentwicklung ohne Ein- und Auszahlungen). Grundlage sind die Tageskurse – solange keine Kursquelle läuft, sind nur Werte zu Kauf- und PDF-Stichtagen bekannt.</p>
    ${years
      .map((y) => {
        const ms = MONTHS.map((_, i) => m.find((x) => x.k === `${y}-${String(i + 1).padStart(2, '0')}`));
        const yr = ms.reduce((acc, x) => (x?.r != null ? acc * (1 + x.r / 100) : acc), 1);
        return `<section class="card"><div class="card-head"><h3>${y}</h3><b class="${cls(yr - 1)}">${signedPct((yr - 1) * 100)}</b></div>
        <div class="heat">${ms
          .map((x, i) => `<div class="hcell ${x?.r == null ? 'na' : x.r >= 0 ? 'up' : 'dn'}" style="--a:${x?.r == null ? 0 : Math.min(1, 0.3 + Math.abs(x.r) / 6)}"><small>${MONTHS[i]}</small><b>${x?.r == null ? '–' : signedPct(x.r)}</b></div>`)
          .join('')}</div></section>`;
      })
      .join('')}`,
    'Renditedetails',
    { back: '#/analyse' },
  );
}

export function renderCashflow() {
  const p = scoped();
  const flows = {};
  for (const t of p.transactions) {
    const k = t.date.slice(0, 7);
    const f = (flows[k] ||= { dep: 0, wd: 0, buy: 0, sell: 0, div: 0 });
    if (t.type === 'deposit') f.dep += t.amount;
    if (t.type === 'withdrawal') f.wd += t.amount;
    if (t.type === 'buy' && !['depot', 'transfer'].includes(t.source)) f.buy += t.amount;
    if (t.type === 'sell' && t.source !== 'transfer') f.sell += t.amount;
    if (t.type === 'dividend') f.div += t.amount - (t.tax || 0);
  }
  const keys = Object.keys(flows)
    .filter((k) => Object.values(flows[k]).some((v) => v))
    .sort()
    .slice(-18);
  const label = (k) => new Date(k + '-15').toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
  mount(
    `<section class="card"><h3>Ein- und Auszahlungen</h3><div class="chart-box"><canvas id="cf"></canvas></div>
      <div class="legend-row small"><span><i class="lg" style="background:#5b8def"></i>Einzahlungen</span><span><i class="lg" style="background:#f5a524"></i>Auszahlungen</span><span><i class="lg" style="background:#3dd68c"></i>Dividenden</span></div></section>
    <section class="card"><ul class="list flat">${keys
      .slice()
      .reverse()
      .map((k) => {
        const f = flows[k];
        return `<li><div class="li-row"><div class="l"><b>${new Date(k + '-15').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</b><small>Einz. ${eur(f.dep)} · Ausz. ${eur(f.wd)} · Käufe ${eur(f.buy)} · Verk. ${eur(f.sell)}</small></div><div class="r"><b class="${cls(f.dep - f.wd)}">${eur(f.dep - f.wd)}</b><small class="pos">Div. ${eur(f.div)}</small></div></div></li>`;
      })
      .join('')}</ul></section>
    <p class="foot muted">Einzahlungen und Auszahlungen stammen aus den importierten Kontoauszügen. Abgleich-Buchungen aus Depotauszügen zählen nicht als Käufe.</p>`,
    'Kapitalfluss',
    { back: '#/analyse' },
  );
  stackedBarChart($('#cf'), keys.map(label), [
    { label: 'Einzahlungen', data: keys.map((k) => flows[k].dep), color: '#5b8def' },
    { label: 'Auszahlungen', data: keys.map((k) => -flows[k].wd), color: '#f5a524' },
    { label: 'Dividenden', data: keys.map((k) => flows[k].div), color: '#3dd68c' },
  ]);
}

export function renderTaxes(q) {
  const p = scoped();
  const years = [...new Set(p.transactions.map((t) => t.date.slice(0, 4)))].sort().reverse();
  const y = q.get('y') || years[0] || today().slice(0, 4);
  const tx = p.transactions.filter((t) => t.date.startsWith(y));
  const per = {};
  for (const t of tx) {
    const v = t.type === 'dividend' || t.type === 'sell' ? t.tax || 0 : t.type === 'tax' ? t.amount : 0;
    if (!v) continue;
    const k = t.isin || 'Sonstige';
    per[k] = (per[k] || 0) + v;
  }
  const sum = (f) => tx.filter(f).reduce((s, t) => s + (t.type === 'tax' ? t.amount : t.tax || 0), 0);
  mount(
    `${segButtons(years.map((x) => [x, x]), y, 'y', 'small')}
    <section class="card"><h3>Steuern ${y}</h3>
      <div class="kv"><span>Auf Dividenden (v. a. US-Quellensteuer)</span><b>${eur(sum((t) => t.type === 'dividend'))}</b></div>
      <div class="kv"><span>Auf Verkäufe</span><b>${eur(sum((t) => t.type === 'sell'))}</b></div>
      <div class="kv"><span>Sonstige Steuerbuchungen</span><b>${eur(sum((t) => t.type === 'tax'))}</b></div>
      <div class="kv"><span><b>Gesamt</b></span><b>${eur(sum((t) => ['dividend', 'sell', 'tax'].includes(t.type)))}</b></div></section>
    <section class="card"><h3>Nach Wertpapier</h3><ul class="list flat">${Object.entries(per)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<li><div class="li-row">${k === 'Sonstige' ? '' : logo(k, p.securities[k]?.name, 30)}<div class="l"><b>${esc(p.securities[k]?.name || k)}</b></div><div class="r"><b>${eur(v)}</b></div></div></li>`)
      .join('') || '<li class="muted small pad">Keine Steuern erfasst.</li>'}</ul></section>`,
    'Steuerdashboard',
    { back: '#/analyse' },
  );
  $$('[data-y]').forEach((b) => b.addEventListener('click', () => (location.hash = `#/steuern?y=${b.dataset.y}`)));
}

export function renderFees() {
  const full = state.portfolio;
  const p = scoped();
  const from = addDays(today(), -365);
  const list = sortedTx(p)
    .filter((t) => t.date > from && (t.type === 'fee' || t.fee))
    .reverse();
  const total = list.reduce((s, t) => s + (t.type === 'fee' ? t.amount : t.fee), 0);
  const invested = computeHoldings(p, state.prices).invested;
  mount(
    `<section class="tiles"><div class="tile"><span>Gebühren (12 Monate)</span><b>${eur(total)}</b></div><div class="tile"><span>Ø Kosten</span><b>${pct(invested ? (total / invested) * 100 : 0)}</b><small class="muted">vom investierten Kapital</small></div></section>
    <section class="card"><ul class="list flat">${list
      .map((t) => `<li><a href="#/tx/${t.id}">${t.isin ? logo(t.isin, p.securities[t.isin]?.name, 30) : ''}<div class="l"><b>${esc(t.isin ? p.securities[t.isin]?.name : 'Gebühr')}</b><small>${deDate(t.date)} · ${esc(pfName(full, t.pf))}</small></div><div class="r"><b>${eur(t.type === 'fee' ? t.amount : t.fee)}</b></div></a></li>`)
      .join('') || '<li class="muted small pad">Keine Gebühren in den letzten 12 Monaten.</li>'}</ul></section>`,
    'Gebühren',
    { back: '#/analyse' },
  );
}
