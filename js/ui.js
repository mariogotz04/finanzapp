const charts = [];

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function mount(html, title = '', opts = {}) {
  charts.splice(0).forEach((c) => c.destroy());
  const main = $('#view');
  main.innerHTML = html;
  $('#title').textContent = title;
  $('#back').hidden = !opts.back;
  $('#back').onclick = () => (opts.back === true ? history.back() : (location.hash = opts.back));
  window.scrollTo(0, 0);
  return main;
}

export function registerChart(c) {
  charts.push(c);
  return c;
}

export function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), ms);
}

export function setActiveTab(name) {
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === name));
}

export function confirmDialog(msg) {
  return window.confirm(msg);
}

const LOGO_COLORS = ['#5b8def', '#e5484d', '#f5a524', '#3dd68c', '#a78bfa', '#2dd4bf', '#f472b6', '#fb923c', '#60a5fa', '#c084fc'];
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Firmenlogo per ISIN (Eulerpool, ohne Key), Initialen als Fallback
export function logo(id, name, size = 34) {
  const ini = (name || id || '?')
    .replace(/[^A-Za-zÄÖÜäöü0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  const color = LOGO_COLORS[[...String(id)].reduce((s, c) => s + c.charCodeAt(0), 0) % LOGO_COLORS.length];
  const img = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(id) ? `<img src="https://api.eulerpool.com/api/logo/isin/${id}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<span class="logo" style="--s:${size}px;background:${color}">${escHtml(ini)}${img}</span>`;
}

// Bottom-Sheet wie in Parqet; onMount(el, close)
export function sheet(html, onMount) {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet"><div class="grab"></div>${html}</div>`;
  const close = () => bg.remove();
  bg.addEventListener('click', (e) => e.target === bg && close());
  document.body.append(bg);
  onMount?.(bg, close);
  return close;
}

export function segButtons(items, active, attr = 'k', extra = '') {
  return `<div class="seg ${extra}">${items.map(([k, l]) => `<button data-${attr}="${k}" class="${k === active ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
