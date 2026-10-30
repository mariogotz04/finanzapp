import { registerChart } from './ui.js';
import { eur, pct, deDate, PALETTE } from './util.js';

const C = () => window.Chart;

export function valueChart(canvas, series) {
  const labels = series.map((s) => s.d);
  return registerChart(
    new (C())(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Aktueller Wert',
            data: series.map((s) => s.value),
            borderColor: '#3dd68c',
            backgroundColor: (ctx) => {
              const { chart } = ctx;
              if (!chart.chartArea) return 'rgba(61,214,140,0.15)';
              const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
              g.addColorStop(0, 'rgba(61,214,140,0.35)');
              g.addColorStop(1, 'rgba(61,214,140,0)');
              return g;
            },
            fill: true,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.2,
          },
          {
            label: 'Investiertes Kapital',
            data: series.map((s) => s.invested),
            borderColor: '#8b93a7',
            borderDash: [5, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            stepped: true,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => deDate(items[0].label),
              label: (it) => `${it.dataset.label}: ${eur(it.parsed.y)}`,
            },
          },
        },
        scales: {
          x: { display: false },
          y: {
            position: 'right',
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#8b93a7', maxTicksLimit: 5, callback: (v) => `${Math.round(v / 1000)}k` },
          },
        },
      },
    }),
  );
}

export function donutChart(canvas, positions, onClick) {
  return registerChart(
    new (C())(canvas, {
      type: 'doughnut',
      data: {
        labels: positions.map((p) => p.name),
        datasets: [
          {
            data: positions.map((p) => p.value),
            backgroundColor: positions.map((_, i) => PALETTE[i % PALETTE.length]),
            borderColor: '#0b0d12',
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '68%',
        animation: { duration: 300 },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (it) => `${it.label}: ${pct(positions[it.dataIndex].weight)}` } },
        },
        onClick: (_, els) => els.length && onClick && onClick(positions[els[0].index]),
      },
    }),
  );
}

export function barChart(canvas, labels, values) {
  return registerChart(
    new (C())(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ data: values, backgroundColor: '#3dd68c', borderRadius: 4 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (it) => eur(it.parsed.y) } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#8b93a7' } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b93a7', maxTicksLimit: 4 } },
        },
      },
    }),
  );
}

// Halbkreis wie Parqet („Gewichtung“)
export function gaugeChart(canvas, items, onClick) {
  return registerChart(
    new (C())(canvas, {
      type: 'doughnut',
      data: {
        labels: items.map((x) => x.name),
        datasets: [{ data: items.map((x) => x.value), backgroundColor: items.map((x, i) => x.color || PALETTE[i % PALETTE.length]), borderColor: '#1a2030', borderWidth: 1.5 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        rotation: -90,
        circumference: 180,
        cutout: '78%',
        animation: { duration: 300 },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (it) => `${it.label}: ${pct(items[it.dataIndex].weight)}` } } },
        onClick: (_, els) => els.length && onClick && onClick(items[els[0].index]),
      },
    }),
  );
}

export function stackedBarChart(canvas, labels, datasets, opts = {}) {
  return registerChart(
    new (C())(canvas, {
      type: 'bar',
      data: { labels, datasets: datasets.map((d, i) => ({ backgroundColor: d.color || PALETTE[i % PALETTE.length], borderRadius: 2, borderSkipped: false, maxBarThickness: 26, ...d })) },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (it) => (it.parsed.y ? `${it.dataset.label}: ${eur(it.parsed.y)}` : null) }, filter: (it) => !!it.parsed.y },
        },
        scales: {
          x: { stacked: opts.stacked !== false, grid: { display: false }, ticks: { color: '#8b93a7', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
          y: { stacked: opts.stacked !== false, position: 'right', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b93a7', maxTicksLimit: 4, callback: (v) => `${v} €` } },
        },
        onClick: opts.onClick ? (_, els) => els.length && opts.onClick(els[0].index) : undefined,
      },
    }),
  );
}

export function lineChart(canvas, labels, values, opts = {}) {
  const color = opts.color || '#3dd68c';
  return registerChart(
    new (C())(canvas, {
      type: 'line',
      data: { labels, datasets: [{ data: values, borderColor: color, backgroundColor: 'rgba(61,214,140,0.12)', fill: !!opts.fill, borderWidth: 2, pointRadius: 0, tension: 0.2, stepped: !!opts.stepped }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => deDate(it[0].label), label: (it) => (opts.pct ? pct(it.parsed.y) : eur(it.parsed.y)) } } },
        scales: {
          x: { display: false },
          y: { position: 'right', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b93a7', maxTicksLimit: 5, callback: (v) => (opts.pct ? `${v} %` : `${v} €`) } },
        },
      },
    }),
  );
}
