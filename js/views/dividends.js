import { state } from '../store.js';
import { computeHoldings, rangeStart, RANGES } from '../calc.js';
import { scoped } from '../scope.js';
import { paidDividends, announced, projected, monthKey, frequency, ttmPerShare } from '../divs.js';
import { mount, $, $$, logo, segButtons } from '../ui.js';
import { stackedBarChart, lineChart } from '../charts.js';
import { eur, pct, num, esc, deDate, today, addDays, PALETTE, signedPct, cls } from '../util.js';

let range = 'Max';
let mode = 'fortl';
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const monthLong = (key) => new Date(key + '-15').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
const shortDate = (iso) => new Date(iso + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });

function colorMap(list) {
  const isins = [...new Set(list.map((d) => d.isin))];
  return Object.fromEntries(isins.map((i, k) => [i, PALETTE[k % PALETTE.length]]));
}

function eventRow(e, names, opts = {}) {
  const name = e.name || names[e.isin] || e.isin;
  const tag = e.projected ? '<span class="tag">erwartet</span>' : e.announced ? '<span class="tag blue">angekündigt</span>' : '';
  const detail = e.shares && e.perShare != null ? `${num(Math.round(e.shares * 100) / 100)} × ${eur(e.perShare)}` : e.tax ? `Steuer ${eur(e.tax)}` : '';
  return `<li><a href="#/position/${esc(e.isin)}">${logo(e.isin, name, 34)}
    <div class="l"><b>${esc(name)}</b><small>${opts.ex && e.ex ? `Ex-Tag: ${deDate(e.ex)}` : deDate(e.date)} ${tag}</small></div>
    <div class="r"><b class="pos">${eur(e.net)}</b><small class="muted">${detail}</small></div></a></li>`;
}

function groupByMonth(list, desc) {
  const m = {};
  list.forEach((e) => (m[monthKey(e.date)] ||= []).push(e));
  return Object.entries(m).sort((a, b) => (desc ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])));
}

function monthBlock([key, arr], names, colors) {
  const total = arr.reduce((s, e) => s + e.net, 0);
  const bar = arr.map((e) => `<span style="flex:${e.net};background:${colors[e.isin] || '#5b8def'}"></span>`).join('');
  return `<div class="mblock"><div class="card-head"><b>${monthLong(key)}</b><b class="pos">${eur(total)}</b></div><div class="mbar">${bar}</div>
    <ul class="list flat">${arr.map((e) => eventRow(e, names)).join('')}</ul></div>`;
}

export function renderDividends() {
  const p = scoped();
  const h = computeHoldings(p, state.prices);
  const names = Object.fromEntries(Object.entries(p.securities).map(([k, v]) => [k, v.name]));
  const paid = paidDividends(p);
  const start = rangeStart(range);
  const inRange = paid.filter((d) => d.date >= start);
  const ttm = paid.filter((d) => d.date > addDays(today(), -365)).reduce((s, d) => s + d.net, 0);
  const ann = announced(h, state.dividends);
  const colors = colorMap([...paid, ...ann]);
  const hasProvider = !!state.dividends?.updated;

  mount(
    `${segButtons(RANGES.map((r) => [r, r]), range, 'range')}
    <p class="muted small pad">Nettowerte · Persönliche Dividenden-Rendite</p>
    <section class="tiles">
      <div class="tile"><span>Erhaltene Dividende im Zeitraum</span><b class="pos">${eur(inRange.reduce((s, d) => s + d.net, 0))}</b></div>
      <div class="tile"><span>Persönliche Dividendenrendite</span><b>${pct(h.invested ? (ttm / h.invested) * 100 : 0)}</b><small class="muted">12 Monate auf Einstand</small></div>
      <div class="tile"><span>Jahreseinkommen (letzte 12 Monate)</span><b>${eur(ttm)}</b></div>
      <div class="tile"><span>Ø monatliches Einkommen</span><b>${eur(ttm / 12)}</b></div>
    </section>
    <section class="card">
      ${segButtons([['fortl', 'Monatlich (fortl.)'], ['jahr', 'Monatlich (pro Jahr)'], ['akk', 'Akkumuliert']], mode, 'mode', 'tabs')}
      <div class="chart-head"><div><span class="muted small">Seit ${deDate(inRange[0]?.date || today())}</span></div><b class="pos">${eur(inRange.reduce((s, d) => s + d.net, 0))}</b></div>
      <div class="chart-box"><canvas id="divChart"></canvas></div>
      ${inRange.length ? '' : '<p class="muted small center">Im gewählten Zeitraum wurden keine Dividenden erfasst. Dividenden kommen aus dem Kontoauszug-Import.</p>'}
    </section>
    <a class="btn" href="#/dividendenkalender">Dividendenkalender öffnen</a>
    <section class="card">
      <h3>Angekündigte Dividenden</h3>
      ${
        ann.length
          ? groupByMonth(ann.slice(0, 30), false).map((g) => monthBlock(g, names, colors)).join('')
          : `<p class="muted small">${hasProvider ? 'Aktuell keine angekündigten Dividenden.' : 'Angekündigte Dividenden erscheinen, sobald die Kursquelle Dividendentermine liefert.'}</p>`
      }
    </section>
    <section class="card">
      <h3>Letzte Auszahlungen</h3>
      ${paid.length ? groupByMonth(paid, true).slice(0, 4).map((g) => monthBlock(g, names, colors)).join('') : '<p class="muted small">Noch keine Dividenden erfasst.</p>'}
      ${paid.length ? '<a class="more-link" href="#/aktivitaeten?f=dividend">Alle anzeigen</a>' : ''}
    </section>
    <section class="card">
      <h3>Nach Wertpapier</h3>
      <ul class="list flat">${Object.entries(paid.reduce((m, d) => ((m[d.isin] = (m[d.isin] || 0) + d.net), m), {}))
        .sort((a, b) => b[1] - a[1])
        .map(([isin, v]) => `<li><a href="#/position/${esc(isin)}">${logo(isin, names[isin])}<div class="l"><b>${esc(names[isin] || isin)}</b><small>${frequency(state.dividends, isin) || 'Erhalten gesamt'}</small></div><div class="r"><b class="pos">${eur(v)}</b></div></a></li>`)
        .join('')}</ul>
    </section>`,
    'Dividenden',
  );
  drawDivChart(inRange, names, colors);
  $$('[data-range]').forEach((b) => b.addEventListener('click', () => ((range = b.dataset.range), renderDividends())));
  $$('[data-mode]').forEach((b) => b.addEventListener('click', () => ((mode = b.dataset.mode), renderDividends())));
}

function drawDivChart(list, names, colors) {
  if (!list.length) return;
  if (mode === 'akk') {
    let sum = 0;
    const pts = list.map((d) => ((sum += d.net), [d.date, sum]));
    lineChart($('#divChart'), pts.map((x) => x[0]), pts.map((x) => x[1]), { fill: true, stepped: true });
    return;
  }
  if (mode === 'jahr') {
    const years = [...new Set(list.map((d) => d.date.slice(0, 4)))].sort();
    const ds = years.map((y, i) => ({ label: y, data: MONTHS.map((_, m) => list.filter((d) => d.date.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`)).reduce((s, d) => s + d.net, 0)), color: PALETTE[(i * 3) % PALETTE.length] }));
    stackedBarChart($('#divChart'), MONTHS, ds, { stacked: false });
    return;
  }
  const first = list[0].date.slice(0, 7);
  const months = [];
  for (let d = new Date(first + '-15'); d.toISOString().slice(0, 7) <= today().slice(0, 7); d.setMonth(d.getMonth() + 1)) months.push(d.toISOString().slice(0, 7));
  const isins = [...new Set(list.map((d) => d.isin))];
  const ds = isins.map((isin) => ({ label: names[isin] || isin, data: months.map((m) => list.filter((d) => d.isin === isin && monthKey(d.date) === m).reduce((s, d) => s + d.net, 0)), color: colors[isin] }));
  stackedBarChart($('#divChart'), months.map((m) => new Date(m + '-15').toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })), ds);
}

// ---------- Dividendenkalender ----------
let calMode = 'monat';
let calMonth = today().slice(0, 7);
let calDay = today();

export function renderCalendar() {
  const p = scoped();
  const h = computeHoldings(p, state.prices);
  const names = Object.fromEntries(Object.entries(p.securities).map(([k, v]) => [k, v.name]));
  const paid = paidDividends(p).map((d) => ({ ...d, name: names[d.isin] }));
  const ann = announced(h, state.dividends);
  const proj = projected(h, state.dividends);
  const all = [...paid, ...ann, ...proj].sort((a, b) => a.date.localeCompare(b.date));

  const head = `<div class="cal-top">${segButtons([['monat', 'Monat'], ['jahr', 'Jahr']], calMode, 'cm', 'tabs mini')}</div>`;
  if (calMode === 'jahr') {
    const years = [...new Set([today().slice(0, 4), String(+today().slice(0, 4) + 1), ...all.map((e) => e.date.slice(0, 4))])].sort().reverse();
    const yearSum = (y) => all.filter((e) => e.date.startsWith(y)).reduce((s, e) => s + e.net, 0);
    mount(
      `${head}
      ${years
        .map((y) => {
          const tot = yearSum(y);
          const prev = yearSum(String(+y - 1));
          const rows = MONTHS.map((mn, i) => {
            const key = `${y}-${String(i + 1).padStart(2, '0')}`;
            const ev = all.filter((e) => monthKey(e.date) === key);
            if (!ev.length) return '';
            const isins = [...new Set(ev.map((e) => e.isin))];
            const exp = ev.some((e) => e.projected);
            return `<li class="yrow" data-m="${key}"><span class="ym">${mn}</span><span class="ylogos">${isins.slice(0, 4).map((i) => logo(i, names[i], 26)).join('')}${isins.length > 4 ? '<span class="muted">…</span>' : ''}</span><b class="${exp ? 'muted' : 'pos'}">${eur(ev.reduce((s, e) => s + e.net, 0))}</b></li>`;
          }).join('');
          const partial = y > today().slice(0, 4);
          return `<section class="card"><div class="card-head"><h3>${y}${partial ? ' <small class="muted">erwartet</small>' : ''}</h3><b class="${partial ? 'muted' : 'pos'}">${eur(tot)}</b></div>
            ${prev && y <= today().slice(0, 4) ? `<div class="small">${chipPct(((tot - prev) / prev) * 100)} <span class="muted">im Vergleich zu ${eur(prev)} von ${+y - 1}</span></div>` : ''}
            <ul class="list flat">${rows || '<li class="muted small pad">Keine Dividenden</li>'}</ul></section>`;
        })
        .join('')}
      <p class="foot muted">Grün = erhalten bzw. angekündigt. Grau = erwartet (Hochrechnung aus den Zahlungen der letzten 12 Monate × aktueller Bestand).</p>`,
      'Dividendenkalender',
      { back: '#/dividenden' },
    );
  } else {
    const [Y, M] = calMonth.split('-').map(Number);
    const first = new Date(Y, M - 1, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(Y, M - 1, 1 - startOffset + i, 12);
      cells.push(d.toISOString().slice(0, 10));
    }
    const monthEv = all.filter((e) => monthKey(e.date) === calMonth);
    const dayEv = all.filter((e) => e.date === calDay);
    const upcoming = all.filter((e) => e.date > calDay).slice(0, 12);
    mount(
      `${head}
      <section class="card cal">
        <div class="card-head"><div><h3>${new Date(Y, M - 1, 15).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</h3><small class="muted">Gesamt: <b class="pos">${eur(monthEv.reduce((s, e) => s + e.net, 0))}</b></small></div>
        <div class="navbtns"><button id="prev">‹</button><button id="next">›</button></div></div>
        <div class="cal-grid">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => `<span class="dow">${d}</span>`).join('')}
        ${cells
          .map((c) => {
            const ev = all.filter((e) => e.date === c);
            const k = ev.some((e) => e.paid) ? 'paid' : ev.some((e) => e.announced) ? 'ann' : ev.length ? 'proj' : '';
            return `<button data-d="${c}" class="day ${monthKey(c) !== calMonth ? 'out' : ''} ${k} ${c === today() ? 'today' : ''} ${c === calDay ? 'sel' : ''}">${+c.slice(8)}</button>`;
          })
          .join('')}</div>
        <div class="legend-row small"><span><i class="lg paid"></i>erhalten</span><span><i class="lg ann"></i>angekündigt</span><span><i class="lg proj"></i>erwartet</span></div>
      </section>
      <section class="card">
        <div class="card-head"><b>${shortDate(calDay)}</b><b class="pos">${eur(dayEv.reduce((s, e) => s + e.net, 0))}</b></div>
        ${dayEv.length ? `<ul class="list flat">${dayEv.map((e) => eventRow(e, names, { ex: true })).join('')}</ul>` : `<p class="muted small center">Für ${calDay === today() ? 'heute' : 'diesen Tag'} ist keine Dividende ${calDay < today() ? 'erfasst' : 'angekündigt'}.</p>`}
      </section>
      ${upcoming
        .reduce((acc, e) => {
          const last = acc[acc.length - 1];
          if (last && last.date === e.date) last.items.push(e);
          else acc.push({ date: e.date, items: [e] });
          return acc;
        }, [])
        .map(
          (g) => `<section class="card"><div class="card-head"><b>${shortDate(g.date)}</b><b class="pos">${eur(g.items.reduce((s, e) => s + e.net, 0))}</b></div>
          <ul class="list flat">${g.items
            .map((e) => {
              const y = ttmPerShare(state.dividends, e.isin);
              const px = h.positions.find((x) => x.isin === e.isin)?.price;
              const freq = frequency(state.dividends, e.isin);
              return eventRow({ ...e }, names, { ex: !!e.ex }).replace('</small></div></a></li>', `${freq ? ` · ${freq}` : ''}${y && px ? ` · Rendite ${pct((y / px) * 100)}` : ''}</small></div></a></li>`);
            })
            .join('')}</ul></section>`,
        )
        .join('')}
      ${all.length ? '' : '<p class="muted center">Noch keine Dividenden erfasst oder angekündigt.</p>'}`,
      'Dividendenkalender',
      { back: '#/dividenden' },
    );
    const shift = (n) => {
      const d = new Date(Y, M - 1 + n, 15);
      calMonth = d.toISOString().slice(0, 7);
      calDay = monthKey(today()) === calMonth ? today() : `${calMonth}-01`;
      renderCalendar();
    };
    $('#prev').onclick = () => shift(-1);
    $('#next').onclick = () => shift(1);
    $$('.day').forEach((b) =>
      b.addEventListener('click', () => {
        calDay = b.dataset.d;
        if (monthKey(calDay) !== calMonth) calMonth = monthKey(calDay);
        renderCalendar();
      }),
    );
  }
  $$('[data-cm]').forEach((b) => b.addEventListener('click', () => ((calMode = b.dataset.cm), renderCalendar())));
  $$('.yrow').forEach((r) =>
    r.addEventListener('click', () => {
      calMode = 'monat';
      calMonth = r.dataset.m;
      calDay = monthKey(today()) === calMonth ? today() : `${calMonth}-01`;
      renderCalendar();
    }),
  );
}

function chipPct(v) {
  return `<span class="chip ${cls(v)}">${v > 0 ? '↑' : v < 0 ? '↓' : ''} ${signedPct(v).replace(/^[+-]/, '')}</span>`;
}
