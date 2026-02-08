const CACHE_NAME = 'anitracker-v1';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/favicon.ico', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  // Skip non-GET and Chrome extension requests
  if (request.method !== 'GET' || request.url.startsWith('chrome-extension')) return;

  // Network-first for API calls, cache-first for static assets
  if (request.url.includes('/api/') || request.url.includes('graphql') || request.url.includes('jikan') || request.url.includes('kitsu') || request.url.includes('tvmaze') || request.url.includes('mymemory') || request.url.includes('wikipedia') || request.url.includes('firestore') || request.url.includes('googleapis')) {
    return; // Let API calls go to network directly
  }

  e.respondWith(
    caches.match(request).then(cached => {
      const fetchPromise = fetch(request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
