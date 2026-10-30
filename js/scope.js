import { state } from './store.js';

// Gewählte Ansicht gilt nur auf diesem Gerät: 'all' | 'pf:<id>' | 'view:<id>'
const KEY = 'fa.view';

export function getView() {
  try {
    return localStorage.getItem(KEY) || 'all';
  } catch {
    return 'all';
  }
}

export function setView(v) {
  try {
    localStorage.setItem(KEY, v);
  } catch {}
}

export function viewPfIds(p = state.portfolio) {
  const v = getView();
  if (v.startsWith('pf:') && p.portfolios.some((x) => x.id === v.slice(3))) return new Set([v.slice(3)]);
  if (v.startsWith('view:')) {
    const vw = p.views.find((x) => x.id === v.slice(5));
    if (vw) return new Set(vw.portfolios);
  }
  return null;
}

export function viewName(p = state.portfolio) {
  const v = getView();
  if (v.startsWith('pf:')) return p.portfolios.find((x) => x.id === v.slice(3))?.name || 'Gesamtansicht';
  if (v.startsWith('view:')) return p.views.find((x) => x.id === v.slice(5))?.name || 'Gesamtansicht';
  return 'Gesamtansicht';
}

// Portfolio-Ausschnitt für Berechnungen; Änderungen immer an state.portfolio vornehmen
export function scoped(p = state.portfolio) {
  const ids = viewPfIds(p);
  if (!ids) return p;
  return { ...p, transactions: p.transactions.filter((t) => ids.has(t.pf)) };
}

export function defaultPf(p = state.portfolio) {
  const ids = viewPfIds(p);
  return ids && ids.size === 1 ? [...ids][0] : p.portfolios[0].id;
}

export function pfName(p, id) {
  return p.portfolios.find((x) => x.id === id)?.name || '–';
}
