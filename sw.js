const CACHE_NAME = 'quantum-v5';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=3.1',
  './app.js?v=3.1',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Always fetch live for Google Sheets and Webhooks
  if (e.request.url.includes('google.com') || e.request.url.includes('googleusercontent.com')) {
    return e.respondWith(fetch(e.request));
  }

  // Network First strategy for the app shell to ensure latest version is served
  e.respondWith(
    fetch(e.request).catch(() => {
      return caches.match(e.request);
    })
  );
});
