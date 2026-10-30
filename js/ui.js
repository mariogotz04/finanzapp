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
