import { state, loadReport, ghEnabled, triggerWorkflow, syncAll, savePortfolio } from '../store.js';
import { mount, $, $$, toast, confirmDialog } from '../ui.js';
import { esc, deDate, parseDeNum, isValidIsin, traderfoxUrl, aktienfinderUrl, today } from '../util.js';

const safeUrl = (u) => (/^https?:\/\//.test(u || '') ? u : '#');

export function renderReports() {
  mount(
    `<a class="btn" href="#/watchlist">Beobachtungsliste & TraderFox-/Aktienfinder-Werte</a>
    ${ghEnabled() ? '<button class="btn" id="run">Bericht jetzt erstellen</button>' : ''}
    <ul class="list">${state.reports
      .map(
        (r) => `<li><a href="#/bericht/${esc(r.id)}"><div class="l"><b>${esc(r.title)}</b><small>${new Date(r.created).toLocaleString('de-DE')}</small></div>
        <div class="r"><small class="${r.weekPct > 0 ? 'pos' : r.weekPct < 0 ? 'neg' : ''}">${r.weekPct != null ? `${r.weekPct > 0 ? '+' : ''}${r.weekPct.toFixed(2).replace('.', ',')} %` : ''}</small></div></a></li>`,
      )
      .join('')}</ul>
    ${state.reports.length ? '' : '<p class="muted center">Noch keine Berichte. Der erste kommt am Sonntag um 18:00 Uhr.</p>'}`,
    'Wochenberichte',
  );
  const run = $('#run');
  if (run)
    run.onclick = async () => {
      try {
        await triggerWorkflow('weekly-report.yml', { force: 'true' });
        toast('Bericht wird erstellt (ca. 2–4 Minuten). Du bekommst eine Push-Nachricht.', 5000);
        setTimeout(syncAll, 180000);
      } catch (e) {
        toast(e.message, 5000);
      }
    };
}

export async function renderReport(id) {
  mount('<p class="muted center">Lade Bericht…</p>', 'Wochenbericht', { back: '#/berichte' });
  const r = await loadReport(id);
  if (!r) {
    mount('<p class="muted center">Bericht nicht gefunden. Bitte in den Einstellungen die GitHub-Verbindung prüfen.</p>', 'Wochenbericht', { back: '#/berichte' });
    return;
  }
  mount(
    `<section class="hero"><div class="muted">${new Date(r.created).toLocaleString('de-DE')}</div><div class="big sm">${esc(r.title)}</div></section>
    ${r.sections.map(renderSection).join('')}
    <p class="foot muted">${esc(r.disclaimer || '')}</p>`,
    'Wochenbericht',
    { back: '#/berichte' },
  );
}

function renderBlock(b) {
  switch (b.type) {
    case 'kpis':
      return `<div class="grid2">${b.items.map((k) => `<div class="kpi"><span>${esc(k.label)}</span><b class="${esc(k.cls || '')}">${esc(k.value)}</b>${k.sub ? `<small class="${esc(k.cls || '')}">${esc(k.sub)}</small>` : ''}</div>`).join('')}</div>`;
    case 'text':
      return `<p>${esc(b.text)}</p>`;
    case 'bullets':
      return `<ul class="bullets">${b.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
    case 'table':
      return `<div class="tbl"><table><thead><tr>${b.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.rows
        .map((r) => `<tr>${r.map((c) => (typeof c === 'object' && c ? `<td class="${esc(c.cls || '')}">${c.url ? `<a target="_blank" rel="noopener" href="${esc(safeUrl(c.url))}">${esc(c.v)}</a>` : esc(c.v)}</td>` : `<td>${esc(c)}</td>`)).join('')}</tr>`)
        .join('')}</tbody></table></div>`;
    case 'items':
      return `<div class="ritems">${b.items
        .map(
          (it) => `<div class="ritem"><div class="rhead"><b>${esc(it.title)}</b><span class="${esc(it.cls || '')}">${esc(it.value || '')}</span></div>
          ${it.sub ? `<small class="muted">${esc(it.sub)}</small>` : ''}
          ${it.lines?.length ? `<ul class="bullets">${it.lines.map((l) => `<li>${l.url ? `<a target="_blank" rel="noopener" href="${esc(safeUrl(l.url))}">${esc(l.text)}</a>` : esc(l.text)}${l.meta ? ` <small class="muted">${esc(l.meta)}</small>` : ''}</li>`).join('')}</ul>` : ''}
          ${it.links?.length ? `<div class="chips">${it.links.map((l) => `<a target="_blank" rel="noopener" href="${esc(safeUrl(l.url))}">${esc(l.label)}</a>`).join('')}</div>` : ''}</div>`,
        )
        .join('')}</div>`;
    default:
      return '';
  }
}

function renderSection(s) {
  return `<section class="card"><h3>${esc(s.title)}</h3>${(s.blocks || []).map(renderBlock).join('')}</section>`;
}

export function renderWatchlist() {
  const p = state.portfolio;
  p.watchlist ||= [];
  const fmt = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','));
  mount(
    `<p class="muted pad">Kandidaten für Nachkäufe oder neue Ideen. Trage die Werte aus dem TraderFox-Aktienterminal (Faktoranalyse) und von Aktienfinder ein – der Wochenbericht prüft dann dein Kriterium „Quality & Value ≥ 80 %“. Bestandsaktien kannst du ebenfalls aufnehmen.</p>
    ${p.watchlist
      .map(
        (w, i) => `<section class="card form" data-i="${i}">
        <div class="rhead"><b>${esc(w.name)}</b><small class="muted">${esc(w.isin)}</small></div>
        <div class="chips"><a target="_blank" rel="noopener" href="${traderfoxUrl(w.isin)}">TraderFox ›</a><a target="_blank" rel="noopener" href="${aktienfinderUrl(w)}">Aktienfinder ›</a></div>
        <div class="row3"><label>Quality %<input inputmode="decimal" class="w-q" value="${fmt(w.quality)}"></label><label>Value %<input inputmode="decimal" class="w-v" value="${fmt(w.value)}"></label><label>Q&amp;V %<input inputmode="decimal" class="w-qv" value="${fmt(w.qv)}"></label></div>
        <div class="row3"><label>Div.-Rendite %<input inputmode="decimal" class="w-dy" value="${fmt(w.divYield)}"></label><label>Ausschüttung/Gewinn %<input inputmode="decimal" class="w-pe" value="${fmt(w.payoutEps)}"></label><label>Ausschüttung/FCF %<input inputmode="decimal" class="w-pf" value="${fmt(w.payoutFcf)}"></label></div>
        <label>Notiz<input class="w-note" value="${esc(w.note || '')}"></label>
        <small class="muted">Stand: ${w.checked ? deDate(w.checked) : '–'}</small>
        <button class="btn danger sm w-del">Entfernen</button>
      </section>`,
      )
      .join('')}
    <section class="card form"><h3>Hinzufügen</h3>
      <label>ISIN<input id="n-isin" autocapitalize="characters" placeholder="z. B. US1912161007"></label>
      <label>Name<input id="n-name" placeholder="z. B. Coca-Cola"></label>
      <label>Aktienfinder-Link (optional)<input id="n-af" placeholder="https://aktienfinder.net/dividenden-profil/…"></label>
      <button class="btn" id="n-add">Hinzufügen</button></section>
    <button class="btn primary" id="w-save">Speichern</button>`,
    'Beobachtungsliste',
    { back: '#/berichte' },
  );
  const num = (el) => {
    const v = parseDeNum(el.value);
    return Number.isFinite(v) ? v : null;
  };
  const collect = () =>
    $$('section[data-i]').forEach((sec) => {
      const w = p.watchlist[+sec.dataset.i];
      const vals = { quality: num($('.w-q', sec)), value: num($('.w-v', sec)), qv: num($('.w-qv', sec)), divYield: num($('.w-dy', sec)), payoutEps: num($('.w-pe', sec)), payoutFcf: num($('.w-pf', sec)) };
      const changed = Object.keys(vals).some((k) => (w[k] ?? null) !== vals[k]);
      Object.assign(w, vals, { note: $('.w-note', sec).value.trim() });
      if (changed) w.checked = today();
    });
  $$('.w-del').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirmDialog('Entfernen?')) return;
      collect();
      p.watchlist.splice(+b.closest('section').dataset.i, 1);
      await savePortfolio('Beobachtungsliste geändert');
      renderWatchlist();
    }),
  );
  $('#n-add').onclick = async () => {
    const isin = $('#n-isin').value.trim().toUpperCase();
    if (!isValidIsin(isin)) return toast('Bitte gültige ISIN eingeben');
    collect();
    p.watchlist.push({ isin, name: $('#n-name').value.trim() || p.securities[isin]?.name || isin, aktienfinder: $('#n-af').value.trim() || undefined });
    await savePortfolio('Beobachtungsliste geändert');
    renderWatchlist();
  };
  $('#w-save').onclick = async () => {
    collect();
    await savePortfolio('Beobachtungsliste aktualisiert');
    toast('Gespeichert');
  };
}
