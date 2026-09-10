const CACHE_NAME = 'v1_app_cache';
const ASSETS = [
  './',
  './index.html',
  './manifest.json'
  // Add paths to your CSS, JS, or images here (e.g., './style.css')
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
