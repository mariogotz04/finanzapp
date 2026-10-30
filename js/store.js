import { CONFIG } from './config.js';

const LS = {
  portfolio: 'fa.portfolio',
  prices: 'fa.prices',
  dividends: 'fa.dividends',
  reports: 'fa.reports',
  gh: 'fa.gh',
  sha: 'fa.sha',
  dirty: 'fa.dirty',
};

const emptyPortfolio = () => ({
  version: 1,
  updated: null,
  securities: {},
  transactions: [],
  watchlist: [],
  portfolios: [],
  views: [],
  settings: { targetEtf: 50, posMin: 2, posMax: 3 },
});

// Ältere Stände kennen nur ein Depot: alles landet im ersten Portfolio
export function normalize(p) {
  p.portfolios ||= [];
  if (!p.portfolios.length) p.portfolios.push({ id: 'p1', name: 'Scalable Capital' });
  p.views ||= [];
  const def = p.portfolios[0].id;
  p.transactions.forEach((t) => (t.pf ||= def));
  return p;
}

const read = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : d;
  } catch {
    return d;
  }
};
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

export const state = {
  portfolio: normalize({ ...emptyPortfolio(), ...(read(LS.portfolio, null) || {}) }),
  prices: read(LS.prices, { quotes: {}, history: {}, updated: null }),
  dividends: read(LS.dividends, { byIsin: {}, updated: null }),
  reports: read(LS.reports, []),
  sync: { status: 'lokal', error: null },
  listeners: new Set(),
};

export function onChange(fn) {
  state.listeners.add(fn);
}
function emit() {
  state.listeners.forEach((fn) => fn());
}

export function ghConfig() {
  const c = read(LS.gh, {});
  return {
    owner: c.owner || CONFIG.dataOwner,
    repo: c.repo || CONFIG.dataRepo,
    branch: c.branch || CONFIG.branch,
    token: c.token || '',
  };
}
export function setGhConfig(c) {
  write(LS.gh, c);
}
export const ghEnabled = () => {
  const c = ghConfig();
  return !!(c.owner && c.repo && c.token);
};

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function gh(path, opts = {}) {
  const c = ghConfig();
  const res = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}${path}`, {
    ...opts,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${c.token}`,
      Accept: opts.accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  return res;
}

export async function ghGetJson(path, { withSha = false } = {}) {
  const c = ghConfig();
  if (withSha) {
    const r = await gh(`/contents/${path}?ref=${c.branch}`);
    if (r.status === 404) return { data: null, sha: null };
    if (!r.ok) throw new Error(`GitHub ${r.status} beim Laden von ${path}`);
    const j = await r.json();
    const text = j.content ? b64decode(j.content) : await (await gh(`/contents/${path}?ref=${c.branch}`, { accept: 'application/vnd.github.raw+json' })).text();
    return { data: JSON.parse(text), sha: j.sha };
  }
  const r = await gh(`/contents/${path}?ref=${c.branch}`, { accept: 'application/vnd.github.raw+json' });
  if (r.status === 404) return { data: null };
  if (!r.ok) throw new Error(`GitHub ${r.status} beim Laden von ${path}`);
  return { data: await r.json() };
}

export async function ghPutJson(path, data, sha, message) {
  const c = ghConfig();
  const body = { message, content: b64encode(JSON.stringify(data, null, 1)), branch: c.branch };
  if (sha) body.sha = sha;
  const r = await gh(`/contents/${path}`, { method: 'PUT', body: JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text();
    const err = new Error(`GitHub ${r.status}: ${t.slice(0, 200)}`);
    err.status = r.status;
    throw err;
  }
  return (await r.json()).content.sha;
}

export async function triggerWorkflow(file, inputs) {
  const c = ghConfig();
  const r = await gh(`/actions/workflows/${file}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: c.branch, ...(inputs ? { inputs } : {}) }),
  });
  if (!r.ok) throw new Error(`Workflow-Start fehlgeschlagen (${r.status}). Hat der Token die Berechtigung „Actions: Read and write“?`);
}

export async function testConnection() {
  const r = await gh('');
  if (!r.ok) throw new Error(`Verbindung fehlgeschlagen (${r.status})`);
  const j = await r.json();
  return j.full_name;
}

function setSync(status, error = null) {
  state.sync = { status, error };
  emit();
}

export async function savePortfolio(message = 'Portfolio aktualisiert') {
  state.portfolio.updated = new Date().toISOString();
  write(LS.portfolio, state.portfolio);
  write(LS.dirty, true);
  emit();
  if (!ghEnabled()) return;
  await pushPortfolio(message);
}

async function pushPortfolio(message) {
  setSync('speichert…');
  try {
    let sha = read(LS.sha, null);
    try {
      sha = await ghPutJson('data/portfolio.json', state.portfolio, sha, message);
    } catch (e) {
      if (e.status !== 409 && e.status !== 422) throw e;
      const cur = await ghGetJson('data/portfolio.json', { withSha: true });
      sha = await ghPutJson('data/portfolio.json', state.portfolio, cur.sha, message);
    }
    write(LS.sha, sha);
    write(LS.dirty, false);
    setSync('synchronisiert');
  } catch (e) {
    setSync('Fehler', e.message);
  }
}

export async function syncAll() {
  if (!ghEnabled()) {
    setSync('lokal');
    return;
  }
  setSync('lädt…');
  try {
    const remote = await ghGetJson('data/portfolio.json', { withSha: true });
    const dirty = read(LS.dirty, false);
    if (remote.data && !dirty) {
      state.portfolio = normalize({ ...emptyPortfolio(), ...remote.data });
      write(LS.portfolio, state.portfolio);
      write(LS.sha, remote.sha);
    } else {
      write(LS.sha, remote.sha);
      if (dirty || !remote.data) await pushPortfolio('Portfolio aus App übernommen');
    }
    const [prices, reports, dividends] = await Promise.all([
      ghGetJson('data/prices.json').catch(() => ({ data: null })),
      ghGetJson('reports/index.json').catch(() => ({ data: null })),
      ghGetJson('data/dividends.json').catch(() => ({ data: null })),
    ]);
    if (prices.data) {
      state.prices = prices.data;
      write(LS.prices, state.prices);
    }
    if (dividends.data) {
      state.dividends = dividends.data;
      write(LS.dividends, state.dividends);
    }
    if (reports.data) {
      state.reports = reports.data;
      write(LS.reports, state.reports);
    }
    if (state.sync.status !== 'Fehler') setSync('synchronisiert');
  } catch (e) {
    setSync('Fehler', e.message);
  }
  emit();
}

export async function loadReport(id) {
  const cacheKey = `fa.report.${id}`;
  if (ghEnabled()) {
    try {
      const { data } = await ghGetJson(`reports/${id}.json`);
      if (data) {
        write(cacheKey, data);
        return data;
      }
    } catch {}
  }
  return read(cacheKey, null);
}

export async function savePushSubscription(sub) {
  const cur = await ghGetJson('push/subscriptions.json', { withSha: true });
  const list = (cur.data || []).filter((s) => s.endpoint !== sub.endpoint);
  list.push({ ...sub, added: new Date().toISOString(), ua: navigator.userAgent });
  await ghPutJson('push/subscriptions.json', list, cur.sha, 'Push-Abo gespeichert');
}

export function exportBackup() {
  return JSON.stringify(state.portfolio, null, 1);
}
export function importBackup(text) {
  const p = JSON.parse(text);
  if (!p || !Array.isArray(p.transactions)) throw new Error('Keine gültige Sicherung');
  state.portfolio = normalize({ ...emptyPortfolio(), ...p });
}
export function resetLocal() {
  Object.values(LS).forEach((k) => localStorage.removeItem(k));
}
