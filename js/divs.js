import { sortedTx, holdingSharesAt } from './calc.js';
import { today, addDays } from './util.js';

// Erhaltene Dividenden (aus Kontoauszügen/manuell), netto = brutto − Steuer
export function paidDividends(p) {
  return sortedTx(p)
    .filter((t) => t.type === 'dividend')
    .map((t) => {
      const shares = holdingSharesAt(p, t.isin, t.date).shares;
      return { date: t.date, isin: t.isin, gross: t.amount, tax: t.tax || 0, net: t.amount - (t.tax || 0), shares, perShare: shares ? t.amount / shares : null, paid: true };
    });
}

export const monthKey = (d) => d.slice(0, 7);

// Termine des Datenanbieters (data/dividends.json): { byIsin: { ISIN: [{ ex, pay, amount, cur, eur }] } }
export function providerEvents(dividends, isin) {
  return dividends?.byIsin?.[isin] || [];
}

export function ttmPerShare(dividends, isin) {
  const from = addDays(today(), -365);
  return providerEvents(dividends, isin)
    .filter((e) => e.ex > from && e.ex <= today() && e.eur != null)
    .reduce((s, e) => s + e.eur, 0);
}

export function frequency(dividends, isin) {
  const from = addDays(today(), -400);
  const n = providerEvents(dividends, isin).filter((e) => e.ex > from && e.ex <= today()).length;
  if (n >= 10) return 'Monatlich';
  if (n >= 3) return 'Quartalsweise';
  if (n === 2) return 'Halbjährlich';
  if (n === 1) return 'Jährlich';
  return '';
}

// Angekündigte Zahlungen (Zahltag in der Zukunft) für den aktuellen Bestand
export function announced(holdings, dividends) {
  const t = today();
  const out = [];
  for (const x of holdings.positions) {
    for (const e of providerEvents(dividends, x.isin)) {
      const day = e.pay || e.ex;
      if (!day || day < t || e.eur == null) continue;
      out.push({ date: day, ex: e.ex, isin: x.isin, name: x.name, shares: x.shares, perShare: e.eur, net: x.shares * e.eur, announced: true });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Hochrechnung: Zahlungen der letzten 12 Monate um ein Jahr verschoben × aktueller Bestand,
// nur wo noch nichts angekündigt ist. Wird in der App immer als „erwartet“ gekennzeichnet.
export function projected(holdings, dividends) {
  const t = today();
  const from = addDays(t, -365);
  const ann = announced(holdings, dividends);
  const out = [];
  for (const x of holdings.positions) {
    for (const e of providerEvents(dividends, x.isin)) {
      const base = e.pay || e.ex;
      if (!base || e.eur == null || base <= from || base > t) continue;
      const day = `${+base.slice(0, 4) + 1}${base.slice(4)}`;
      const dupe = ann.some((a) => a.isin === x.isin && Math.abs(new Date(a.date) - new Date(day)) < 45 * 864e5);
      if (dupe) continue;
      out.push({ date: day, isin: x.isin, name: x.name, shares: x.shares, perShare: e.eur, net: x.shares * e.eur, projected: true });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function sumBy(list, keyFn) {
  const m = {};
  for (const x of list) m[keyFn(x)] = (m[keyFn(x)] || 0) + x.net;
  return m;
}
