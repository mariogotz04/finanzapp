import { state, savePortfolio } from '../store.js';
import { computeHoldings } from '../calc.js';
import { getView, setView, viewName } from '../scope.js';
import { mount, $, $$, toast, confirmDialog, sheet } from '../ui.js';
import { eur, esc, uid } from '../util.js';

const ICON = { pf: '▦', view: '◎', all: '◉' };

export function openViewPicker(onChange) {
  const p = state.portfolio;
  const v = getView();
  const row = (key, label, icon) => `<button class="srow ${v === key ? 'on' : ''}" data-v="${key}"><span class="sicon">${icon}</span><span>${esc(label)}</span>${v === key ? '<i>✓</i>' : ''}</button>`;
  sheet(
    `<h3>Ansicht auswählen</h3>
    <div class="slabel">Ansichten</div>
    ${row('all', 'Gesamtansicht', ICON.all)}
    ${p.views.map((x) => row(`view:${x.id}`, x.name, ICON.view)).join('')}
    <a class="srow add" href="#/portfolios?neu=ansicht">＋ Neue Ansicht</a>
    <div class="slabel">Portfolios</div>
    ${p.portfolios.map((x) => row(`pf:${x.id}`, x.name, ICON.pf)).join('')}
    <a class="srow add" href="#/portfolios?neu=portfolio">＋ Neues Portfolio</a>`,
    (el, close) => {
      $$('[data-v]', el).forEach((b) =>
        b.addEventListener('click', () => {
          setView(b.dataset.v);
          close();
          onChange();
        }),
      );
      $$('a.srow', el).forEach((a) => a.addEventListener('click', close));
    },
  );
}

export function openAddSheet() {
  sheet(
    `<h3>Aktivitäten hinzufügen</h3>
    <a class="srow" href="#/portfolios?neu=portfolio"><span class="sicon">＋</span><span>Neues Portfolio</span></a>
    <a class="srow" href="#/import"><span class="sicon">⇩</span><span>Datei-Import (PDF)</span></a>
    <a class="srow" href="#/neu"><span class="sicon">✎</span><span>Manuell</span></a>`,
    (el, close) => $$('a', el).forEach((a) => a.addEventListener('click', close)),
  );
}

export function renderMore() {
  const items = [
    ['#/aktivitaeten', 'Aktivitäten', 'Käufe, Verkäufe, Dividenden, Einzahlungen'],
    ['#/portfolios', 'Portfolios & Ansichten', `${state.portfolio.portfolios.length} Portfolio(s) · aktuell: ${viewName()}`],
    ['#/dividendenkalender', 'Dividendenkalender', 'Monats- und Jahresansicht'],
    ['#/berichte', 'Berichte', 'Wochenberichte und Beobachtungsliste'],
    ['#/import', 'Import', 'Scalable-PDFs (Depotauszug, Finanzstatus, Kontoauszug)'],
    ['#/einstand', 'Einstandskurse', 'Ø Kaufkurse je Position'],
    ['#/einstellungen', 'Einstellungen', 'GitHub-Sync, Push, Strategie, Sicherung'],
  ];
  mount(
    `<ul class="list">${items.map(([h, t, s]) => `<li><a href="${h}"><div class="l"><b>${t}</b><small>${esc(s)}</small></div><span class="muted">›</span></a></li>`).join('')}</ul>`,
    'Mehr',
  );
}

export function renderPortfolios(q) {
  const p = state.portfolio;
  const value = (ids) => computeHoldings({ ...p, transactions: p.transactions.filter((t) => ids.includes(t.pf)) }, state.prices).total;
  const neu = q?.get('neu');
  mount(
    `<section class="card"><h3>Portfolios</h3>
      <ul class="list flat">${p.portfolios
        .map((x) => {
          const n = p.transactions.filter((t) => t.pf === x.id).length;
          return `<li data-pf="${x.id}"><div class="li-row"><div class="l"><b>${esc(x.name)}</b><small>${n} Buchungen</small></div><div class="r"><b>${eur(value([x.id]))}</b></div></div>
          <div class="row-btns"><button class="btn sm pf-open">Anzeigen</button><button class="btn sm pf-ren">Umbenennen</button><button class="btn sm danger pf-del">Löschen</button></div></li>`;
        })
        .join('')}</ul>
      <div class="inline-add" id="add-pf" ${neu === 'portfolio' ? '' : 'hidden'}><label>Name des neuen Portfolios<input id="pf-name" placeholder="z. B. Crypto oder Trade Republic"></label><button class="btn primary" id="pf-create">Portfolio anlegen</button></div>
      ${neu === 'portfolio' ? '' : '<button class="btn" id="pf-show">＋ Neues Portfolio</button>'}
    </section>
    <section class="card"><h3>Ansichten</h3>
      <p class="muted small">Eine Ansicht fasst mehrere Portfolios zusammen, z. B. „Aktien & Crypto“. Die Gesamtansicht enthält immer alles.</p>
      <ul class="list flat">${p.views
        .map((v) => `<li data-v="${v.id}"><div class="li-row"><div class="l"><b>${esc(v.name)}</b><small>${v.portfolios.map((id) => esc(p.portfolios.find((x) => x.id === id)?.name || '?')).join(', ')}</small></div><div class="r"><b>${eur(value(v.portfolios))}</b></div></div>
          <div class="row-btns"><button class="btn sm v-open">Anzeigen</button><button class="btn sm danger v-del">Löschen</button></div></li>`)
        .join('')}</ul>
      <div class="inline-add" id="add-v" ${neu === 'ansicht' ? '' : 'hidden'}><label>Name der Ansicht<input id="v-name" placeholder="z. B. Langfristig"></label>
        ${p.portfolios.map((x) => `<label class="cb"><input type="checkbox" value="${x.id}" class="v-pf"> ${esc(x.name)}</label>`).join('')}
        <button class="btn primary" id="v-create">Ansicht anlegen</button></div>
      ${neu === 'ansicht' ? '' : '<button class="btn" id="v-show">＋ Neue Ansicht</button>'}
    </section>`,
    'Portfolios',
    { back: '#/mehr' },
  );
  $('#pf-show')?.addEventListener('click', () => (location.hash = '#/portfolios?neu=portfolio'));
  $('#v-show')?.addEventListener('click', () => (location.hash = '#/portfolios?neu=ansicht'));
  $('#pf-create').onclick = async () => {
    const name = $('#pf-name').value.trim();
    if (!name) return toast('Bitte einen Namen eingeben');
    const id = uid();
    p.portfolios.push({ id, name });
    await savePortfolio(`Portfolio ${name} angelegt`);
    setView(`pf:${id}`);
    toast(`Portfolio „${name}“ angelegt – jetzt Buchungen importieren oder manuell eintragen`, 4000);
    location.hash = '#/portfolios';
  };
  $('#v-create').onclick = async () => {
    const name = $('#v-name').value.trim();
    const ids = $$('.v-pf').filter((c) => c.checked).map((c) => c.value);
    if (!name || !ids.length) return toast('Bitte Namen und mindestens ein Portfolio wählen');
    const id = uid();
    p.views.push({ id, name, portfolios: ids });
    await savePortfolio(`Ansicht ${name} angelegt`);
    setView(`view:${id}`);
    location.hash = '#/portfolios';
  };
  $$('li[data-pf]').forEach((li) => {
    const pf = p.portfolios.find((x) => x.id === li.dataset.pf);
    $('.pf-open', li).onclick = () => (setView(`pf:${pf.id}`), (location.hash = '#/'));
    $('.pf-ren', li).onclick = async () => {
      const name = window.prompt('Neuer Name', pf.name);
      if (!name?.trim()) return;
      pf.name = name.trim();
      await savePortfolio('Portfolio umbenannt');
      renderPortfolios();
    };
    $('.pf-del', li).onclick = async () => {
      const n = p.transactions.filter((t) => t.pf === pf.id).length;
      if (p.portfolios.length === 1) return toast('Das letzte Portfolio kann nicht gelöscht werden');
      if (!confirmDialog(n ? `„${pf.name}“ mit ${n} Buchungen endgültig löschen?` : `„${pf.name}“ löschen?`)) return;
      p.transactions = p.transactions.filter((t) => t.pf !== pf.id);
      p.portfolios = p.portfolios.filter((x) => x.id !== pf.id);
      p.views.forEach((v) => (v.portfolios = v.portfolios.filter((id) => id !== pf.id)));
      p.views = p.views.filter((v) => v.portfolios.length);
      if (getView() === `pf:${pf.id}`) setView('all');
      await savePortfolio('Portfolio gelöscht');
      renderPortfolios();
    };
  });
  $$('li[data-v]').forEach((li) => {
    const v = p.views.find((x) => x.id === li.dataset.v);
    $('.v-open', li).onclick = () => (setView(`view:${v.id}`), (location.hash = '#/'));
    $('.v-del', li).onclick = async () => {
      if (!confirmDialog(`Ansicht „${v.name}“ löschen? (Portfolios bleiben erhalten)`)) return;
      p.views = p.views.filter((x) => x.id !== v.id);
      if (getView() === `view:${v.id}`) setView('all');
      await savePortfolio('Ansicht gelöscht');
      renderPortfolios();
    };
  });
}
