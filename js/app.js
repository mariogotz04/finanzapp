import { state, onChange, syncAll, ghEnabled } from './store.js';
import { setActiveTab } from './ui.js';
import { renderOverview } from './views/overview.js';
import { renderPositions, renderPosition, renderEinstand } from './views/positions.js';
import { renderActivities, renderTxForm } from './views/activities.js';
import { renderImport } from './views/importview.js';
import { renderReports, renderReport, renderWatchlist } from './views/reports.js';
import { renderSettings } from './views/settings.js';
import { renderDividends, renderCalendar } from './views/dividends.js';
import { renderAnalysis, renderWeighting, renderReturns, renderCashflow, renderTaxes, renderFees } from './views/analysis.js';
import { renderMore, renderPortfolios, openViewPicker, openAddSheet } from './views/portfolios.js';
import { viewName } from './scope.js';

const routes = [
  [/^\/?$/, 'home', () => renderOverview()],
  [/^\/positionen$/, 'positionen', () => renderPositions()],
  [/^\/position\/([A-Z0-9]{2,12})$/, 'positionen', (m) => renderPosition(m[1])],
  [/^\/einstand$/, 'positionen', () => renderEinstand()],
  [/^\/dividenden$/, 'dividenden', () => renderDividends()],
  [/^\/dividendenkalender$/, 'dividenden', () => renderCalendar()],
  [/^\/analyse$/, 'analyse', () => renderAnalysis()],
  [/^\/gewichtung$/, 'analyse', () => renderWeighting()],
  [/^\/rendite$/, 'analyse', () => renderReturns()],
  [/^\/kapitalfluss$/, 'analyse', () => renderCashflow()],
  [/^\/steuern$/, 'analyse', (m, q) => renderTaxes(q)],
  [/^\/gebuehren$/, 'analyse', () => renderFees()],
  [/^\/mehr$/, 'mehr', () => renderMore()],
  [/^\/portfolios$/, 'mehr', (m, q) => renderPortfolios(q)],
  [/^\/aktivitaeten$/, 'mehr', (m, q) => renderActivities(q)],
  [/^\/neu$/, 'mehr', (m, q) => renderTxForm(null, q)],
  [/^\/tx\/([\w-]+)$/, 'mehr', (m, q) => renderTxForm(m[1], q)],
  [/^\/import$/, 'mehr', () => renderImport()],
  [/^\/berichte$/, 'mehr', () => renderReports()],
  [/^\/bericht\/([\w.-]+)$/, 'mehr', (m) => renderReport(m[1])],
  [/^\/watchlist$/, 'mehr', () => renderWatchlist()],
  [/^\/einstellungen$/, 'mehr', () => renderSettings()],
];

const REDRAW_ON_SYNC = new Set(['home', 'positionen', 'dividenden', 'analyse']);
// Seiten, auf denen die Ansichtsauswahl keine Rolle spielt
const NO_VIEW = /^\/(einstellungen|import|bericht|berichte|watchlist|neu|tx|portfolios|mehr)/;
let currentTab = 'home';
let currentPath = '';

function route() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const q = new URLSearchParams(qs || '');
  for (const [re, tab, fn] of routes) {
    const m = re.exec(path);
    if (m) {
      currentTab = tab;
      currentPath = path;
      setActiveTab(tab);
      document.getElementById('viewname').textContent = viewName();
      document.getElementById('viewbtn').hidden = NO_VIEW.test(path);
      document.getElementById('fab').hidden = !/^\/?(positionen|dividenden|analyse|aktivitaeten)?$/.test(path);
      fn(m, q);
      return;
    }
  }
  location.hash = '#/';
}

function updateSyncDot() {
  const d = document.getElementById('sync');
  d.className = `sync ${state.sync.status === 'Fehler' ? 'err' : state.sync.status === 'synchronisiert' ? 'ok' : ghEnabled() ? 'busy' : 'off'}`;
  d.title = state.sync.error || state.sync.status;
}

let lastSyncStatus = state.sync.status;
onChange(() => {
  updateSyncDot();
  const finished = lastSyncStatus !== 'synchronisiert' && state.sync.status === 'synchronisiert';
  lastSyncStatus = state.sync.status;
  if (finished && REDRAW_ON_SYNC.has(currentTab) && !/^\/(neu|tx|einstand)/.test(currentPath)) route();
});

document.getElementById('viewbtn').addEventListener('click', () => openViewPicker(route));
document.getElementById('fab').addEventListener('click', openAddSheet);

window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncAll();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open' && e.data.url) location.hash = e.data.url.split('#')[1] || '/';
  });
}

const params = new URLSearchParams(location.search);
if (params.get('r')) {
  history.replaceState(null, '', location.pathname + `#/bericht/${params.get('r')}`);
}

// iOS ignoriert user-scalable=no – Pinch-Zoom hier unterbinden (Doppeltipp verhindert touch-action im CSS)
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });

updateSyncDot();
route();
syncAll();
