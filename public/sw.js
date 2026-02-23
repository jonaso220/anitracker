const CACHE_NAME = 'anitracker-v2';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/favicon.ico', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || request.url.startsWith('chrome-extension')) return;

  // Let API calls go to network directly
  if (request.url.includes('/api/') || request.url.includes('graphql') || request.url.includes('jikan') || request.url.includes('kitsu') || request.url.includes('tvmaze') || request.url.includes('mymemory') || request.url.includes('wikipedia') || request.url.includes('firestore') || request.url.includes('googleapis') || request.url.includes('itunes.apple.com')) {
    return;
  }

  // Network-first: try network, fall back to cache
  e.respondWith(
    fetch(request).then(response => {
      if (response && response.status === 200 && response.type === 'basic') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
      }
      return response;
    }).catch(() => caches.match(request))
  );
});
