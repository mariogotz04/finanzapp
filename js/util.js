const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const numFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 });
const pctFmt = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const eur = (v) => eurFmt.format(v || 0);
export const num = (v) => numFmt.format(v || 0);
export const pct = (v) => `${pctFmt.format(v || 0)} %`;
export const signedEur = (v) => `${v > 0 ? '+' : ''}${eur(v)}`;
export const signedPct = (v) => `${v > 0 ? '+' : ''}${pct(v)}`;
export const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const today = () => toISO(new Date());
export function toISO(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
export const deDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '');
export const fromDe = (s) => {
  const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
export const addDays = (iso, n) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return toISO(d);
};

export const parseDeNum = (s) => {
  if (s == null) return NaN;
  const t = String(s).trim().replace(/\s/g, '');
  if (/^[+-]?\d{1,3}(\.\d{3})*,\d+$/.test(t) || /^[+-]?\d+,\d+$/.test(t)) return parseFloat(t.replace(/\./g, '').replace(',', '.'));
  return parseFloat(t.replace(',', '.'));
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const ISIN_RE = /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/;

export function isValidIsin(isin) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return false;
  const digits = isin
    .split('')
    .map((c) => (/[A-Z]/.test(c) ? (c.charCodeAt(0) - 55).toString() : c))
    .join('');
  let sum = 0;
  let dbl = true;
  for (let i = digits.length - 2; i >= 0; i--) {
    let n = +digits[i];
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return (10 - (sum % 10)) % 10 === +digits[digits.length - 1];
}

export const EUROPE = ['DE', 'AT', 'CH', 'FR', 'NL', 'BE', 'LU', 'IT', 'ES', 'PT', 'FI', 'SE', 'NO', 'DK', 'GB', 'IE', 'PL', 'CZ', 'GR'];

export function traderfoxUrl(isin) {
  return `https://aktie.traderfox.com/visualizations/${isin}`;
}
export function aktienfinderUrl(sec) {
  if (sec?.aktienfinder) return sec.aktienfinder;
  const slug = (sec?.name || '')
    .replace(/&/g, 'and')
    .replace(/[^A-Za-z0-9ÄÖÜäöüß\- ]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `https://aktienfinder.net/dividenden-profil/${encodeURIComponent(slug)}-Dividende`;
}
export function newsUrl(sec) {
  return `https://news.google.com/search?q=${encodeURIComponent((sec?.name || '') + ' Aktie')}&hl=de&gl=DE&ceid=DE:de`;
}

export const PALETTE = [
  '#3dd68c', '#5b8def', '#f5a524', '#e5484d', '#a78bfa', '#2dd4bf', '#f472b6', '#facc15', '#60a5fa', '#fb923c',
  '#34d399', '#c084fc', '#f87171', '#22d3ee', '#a3e635', '#e879f9', '#fbbf24', '#818cf8', '#4ade80', '#fda4af',
  '#93c5fd', '#fcd34d', '#86efac', '#d8b4fe', '#67e8f9',
];
