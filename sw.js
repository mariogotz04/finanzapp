const CACHE = 'depot-v3';
const CORE = [
  './',
  './index.html',
  './css/app.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/store.js',
  './js/config.js',
  './js/calc.js',
  './js/charts.js',
  './js/ui.js',
  './js/util.js',
  './js/pdfimport.js',
  './js/scope.js',
  './js/divs.js',
  './js/parqetimport.js',
  './js/views/overview.js',
  './js/views/positions.js',
  './js/views/activities.js',
  './js/views/importview.js',
  './js/views/reports.js',
  './js/views/settings.js',
  './js/views/dividends.js',
  './js/views/analysis.js',
  './js/views/portfolios.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname === 'api.github.com') return;
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
    );
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(
      caches.match(e.request).then(
        (r) =>
          r ||
          fetch(e.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
            return res;
          }),
      ),
    );
  }
});

self.addEventListener('push', (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { title: 'Depot', body: e.data ? e.data.text() : '' };
  }
  const url = data.url || './#/berichte';
  e.waitUntil(
    self.registration.showNotification(data.title || 'Wochenbericht', {
      body: data.body || 'Dein neuer Wochenbericht ist da.',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      data: { url },
      tag: data.tag || 'report',
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || './#/berichte', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope)) {
          c.postMessage({ type: 'open', url: target });
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
