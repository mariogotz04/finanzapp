import { state, onChange, syncAll, ghEnabled } from './store.js';
import { setActiveTab } from './ui.js';
import { renderOverview } from './views/overview.js';
import { renderPositions, renderPosition, renderEinstand } from './views/positions.js';
import { renderActivities, renderTxForm } from './views/activities.js';
import { renderImport } from './views/importview.js';
import { renderReports, renderReport, renderWatchlist } from './views/reports.js';
import { renderSettings } from './views/settings.js';

const routes = [
  [/^\/?$/, 'home', () => renderOverview()],
  [/^\/positionen$/, 'positionen', () => renderPositions()],
  [/^\/position\/([A-Z0-9]{12})$/, 'positionen', (m) => renderPosition(m[1])],
  [/^\/einstand$/, 'home', () => renderEinstand()],
  [/^\/aktivitaeten$/, 'aktivitaeten', () => renderActivities()],
  [/^\/neu$/, 'aktivitaeten', (m, q) => renderTxForm(null, q)],
  [/^\/tx\/([\w-]+)$/, 'aktivitaeten', (m, q) => renderTxForm(m[1], q)],
  [/^\/import$/, 'import', () => renderImport()],
  [/^\/berichte$/, 'berichte', () => renderReports()],
  [/^\/bericht\/([\w.-]+)$/, 'berichte', (m) => renderReport(m[1])],
  [/^\/watchlist$/, 'berichte', () => renderWatchlist()],
  [/^\/einstellungen$/, 'einstellungen', () => renderSettings()],
];

const REDRAW_ON_SYNC = new Set(['home', 'positionen', 'berichte', 'aktivitaeten']);
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
