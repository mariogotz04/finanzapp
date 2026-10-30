import { today, addDays, toISO } from './util.js';

export const TX_LABEL = {
  buy: 'Kauf',
  sell: 'Verkauf',
  dividend: 'Dividende',
  correction: 'Bestandskorrektur',
  deposit: 'Einzahlung',
  withdrawal: 'Auszahlung',
  fee: 'Gebühr',
  tax: 'Steuer',
  interest: 'Zinsen',
};

export function sortedTx(p) {
  const order = { buy: 0, correction: 1, sell: 2 };
  return [...p.transactions].sort((a, b) => a.date.localeCompare(b.date) || (order[a.type] ?? 3) - (order[b.type] ?? 3));
}

function applyTx(pos, t, realized) {
  if (t.type === 'buy') {
    pos.shares += t.shares;
    pos.cost += t.amount;
  } else if (t.type === 'sell') {
    const s = Math.min(t.shares, pos.shares);
    const removed = pos.shares > 0 ? (pos.cost * s) / pos.shares : 0;
    pos.cost -= removed;
    pos.shares -= s;
    pos.realized += t.amount - removed;
    if (realized) realized.v += t.amount - removed;
    if (pos.shares < 1e-6) {
      pos.shares = 0;
      pos.cost = 0;
    }
  } else if (t.type === 'correction') {
    pos.shares = Math.max(0, pos.shares + t.shares);
  }
}

export function historyArr(prices, isin) {
  return prices?.history?.[isin] || [];
}

export function priceAt(prices, isin, date) {
  const h = historyArr(prices, isin);
  let lo = 0;
  let hi = h.length - 1;
  let ans = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (h[mid][0] <= date) {
      ans = h[mid][1];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function currentPrice(p, prices, isin, fallbackAvg) {
  const q = prices?.quotes?.[isin];
  if (q && q.price) return { price: q.price, prev: q.prevClose ?? q.price, source: 'live', time: q.time };
  const sec = p.securities[isin];
  if (sec?.lastPrice) return { price: sec.lastPrice, prev: sec.lastPrice, source: 'pdf', time: sec.lastPriceDate };
  return { price: fallbackAvg || 0, prev: fallbackAvg || 0, source: 'einstand', time: null };
}

export function computeHoldings(p, prices) {
  const map = {};
  const realized = { v: 0 };
  let dividendsGross = 0;
  let dividendsNet = 0;
  let taxes = 0;
  let fees = 0;
  const divByIsin = {};
  for (const t of sortedTx(p)) {
    if (t.isin && !map[t.isin]) map[t.isin] = { isin: t.isin, shares: 0, cost: 0, realized: 0 };
    if (['buy', 'sell', 'correction'].includes(t.type)) applyTx(map[t.isin], t, realized);
    if (t.type === 'buy' || t.type === 'sell') fees += t.fee || 0;
    if (t.type === 'dividend') {
      const net = t.amount - (t.tax || 0);
      dividendsGross += t.amount;
      dividendsNet += net;
      taxes += t.tax || 0;
      divByIsin[t.isin] = (divByIsin[t.isin] || 0) + net;
    }
    if (t.type === 'tax') taxes += t.amount;
    if (t.type === 'fee') fees += t.amount;
  }
  const positions = [];
  for (const pos of Object.values(map)) {
    if (pos.shares <= 1e-6) continue;
    const sec = p.securities[pos.isin] || { name: pos.isin, type: 'Aktie' };
    const avg = pos.cost / pos.shares;
    const cp = currentPrice(p, prices, pos.isin, avg);
    const value = pos.shares * cp.price;
    positions.push({
      ...pos,
      name: sec.name,
      type: sec.type || 'Aktie',
      sec,
      avg,
      price: cp.price,
      prev: cp.prev,
      priceSource: cp.source,
      priceTime: cp.time,
      value,
      gain: value - pos.cost,
      gainPct: pos.cost ? ((value - pos.cost) / pos.cost) * 100 : 0,
      dayChange: pos.shares * (cp.price - cp.prev),
      dividends: divByIsin[pos.isin] || 0,
    });
  }
  const total = positions.reduce((s, x) => s + x.value, 0);
  const invested = positions.reduce((s, x) => s + x.cost, 0);
  positions.forEach((x) => (x.weight = total ? (x.value / total) * 100 : 0));
  positions.sort((a, b) => b.value - a.value);
  const dayChange = positions.reduce((s, x) => s + x.dayChange, 0);
  const prevTotal = total - dayChange;
  return {
    positions,
    total,
    invested,
    unrealized: total - invested,
    unrealizedPct: invested ? ((total - invested) / invested) * 100 : 0,
    realized: realized.v,
    dividendsGross,
    dividendsNet,
    taxes,
    fees,
    dayChange,
    dayChangePct: prevTotal ? (dayChange / prevTotal) * 100 : 0,
    totalReturn: total - invested + realized.v + dividendsNet,
    xirr: computeXirr(p, total),
  };
}

export function computeXirr(p, finalValue) {
  const flows = [];
  for (const t of p.transactions) {
    if (t.type === 'buy') flows.push([t.date, -t.amount]);
    if (t.type === 'sell') flows.push([t.date, t.amount]);
    if (t.type === 'dividend') flows.push([t.date, t.amount - (t.tax || 0)]);
  }
  if (!flows.length || !finalValue) return null;
  flows.push([today(), finalValue]);
  const t0 = new Date(flows.reduce((m, f) => (f[0] < m ? f[0] : m), flows[0][0]));
  const yrs = flows.map((f) => (new Date(f[0]) - t0) / (365.25 * 864e5));
  if (Math.max(...yrs) < 30 / 365) return null;
  const npv = (r) => flows.reduce((s, f, i) => s + f[1] / Math.pow(1 + r, yrs[i]), 0);
  let lo = -0.99;
  let hi = 10;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return ((lo + hi) / 2) * 100;
}

export function computeSeries(p, prices, filterIsin = null) {
  const txs = sortedTx(p).filter((t) => ['buy', 'sell', 'correction'].includes(t.type) && (!filterIsin || t.isin === filterIsin));
  if (!txs.length) return [];
  const start = txs[0].date;
  const end = today();
  const dateSet = new Set([start, end]);
  const isins = [...new Set(txs.map((t) => t.isin))];
  for (const i of isins) for (const [d] of historyArr(prices, i)) if (d >= start && d <= end) dateSet.add(d);
  txs.forEach((t) => dateSet.add(t.date));
  const dates = [...dateSet].sort();
  const pos = {};
  const lastPrice = {};
  let ti = 0;
  const out = [];
  for (const d of dates) {
    while (ti < txs.length && txs[ti].date <= d) {
      const t = txs[ti];
      pos[t.isin] = pos[t.isin] || { shares: 0, cost: 0, realized: 0 };
      applyTx(pos[t.isin], t);
      if (t.type === 'buy' && t.shares) lastPrice[t.isin] = lastPrice[t.isin] ?? t.amount / t.shares;
      ti++;
    }
    let value = 0;
    let invested = 0;
    for (const [isin, ps] of Object.entries(pos)) {
      if (ps.shares <= 0) continue;
      let px = priceAt(prices, isin, d);
      if (d === end) {
        const cp = currentPrice(p, prices, isin, ps.cost / ps.shares);
        px = cp.price;
      }
      if (px == null) px = lastPrice[isin] ?? ps.cost / ps.shares;
      lastPrice[isin] = px;
      value += ps.shares * px;
      invested += ps.cost;
    }
    out.push({ d, value, invested });
  }
  return out;
}

export function rangeStart(range) {
  const t = new Date();
  const map = { '1W': 7, '1M': 30, '6M': 182, '1J': 365, '3J': 1095 };
  if (range === 'YTD') return `${t.getFullYear()}-01-01`;
  if (map[range]) return addDays(toISO(t), -map[range]);
  return '0000-00-00';
}

export function dividendsByMonth(p, months = 12) {
  const res = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    res.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, net: 0 });
  }
  for (const t of p.transactions) {
    if (t.type !== 'dividend') continue;
    const r = res.find((x) => x.key === t.date.slice(0, 7));
    if (r) r.net += t.amount - (t.tax || 0);
  }
  return res;
}

export function holdingSharesAt(p, isin, date) {
  const pos = { shares: 0, cost: 0, realized: 0 };
  for (const t of sortedTx(p)) {
    if (t.isin !== isin || t.date > date) continue;
    if (['buy', 'sell', 'correction'].includes(t.type)) applyTx(pos, t);
  }
  return pos;
}
