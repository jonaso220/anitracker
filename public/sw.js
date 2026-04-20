const CACHE_VERSION = 'v3';
const STATIC_CACHE = `anitracker-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `anitracker-runtime-${CACHE_VERSION}`;
const IMAGE_CACHE = `anitracker-images-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

// External hosts we purposely do NOT cache (always go to network)
const NO_CACHE_HOSTS = [
  'graphql.anilist.co',
  'api.jikan.moe',
  'kitsu.app',
  'api.tvmaze.com',
  'itunes.apple.com',
  'api.mymemory.translated.net',
  'es.wikipedia.org',
  'en.wikipedia.org',
  'firestore.googleapis.com',
  'www.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
];

const IMAGE_HOSTS = [
  'cdn.myanimelist.net',
  'media.kitsu.app',
  's4.anilist.co',
  'static.tvmaze.com',
  'is1-ssl.mzstatic.com',
  'is2-ssl.mzstatic.com',
  'is3-ssl.mzstatic.com',
  'is4-ssl.mzstatic.com',
  'is5-ssl.mzstatic.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(k))
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isNoCache(url) {
  return NO_CACHE_HOSTS.some((h) => url.hostname.endsWith(h));
}

function isImage(request, url) {
  if (request.destination === 'image') return true;
  return IMAGE_HOSTS.some((h) => url.hostname.endsWith(h));
}

// Cache-first with background revalidate (for images)
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response && response.status === 200) cache.put(request, response.clone()).catch(() => {});
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}

// Network-first with cache fallback (for app shell)
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Final fallback for navigations: return cached index.html
    if (request.mode === 'navigate') {
      const index = await cache.match('/index.html') || await cache.match('/');
      if (index) return index;
    }
    throw new Error('Network error and no cache hit');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }
  if (!['http:', 'https:'].includes(url.protocol)) return;
  if (isNoCache(url)) return; // Let it hit network directly

  if (isImage(request, url)) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  // Other same-origin assets: runtime cache
  event.respondWith(networkFirst(request, RUNTIME_CACHE));
});

// --- Push Notifications ---
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, tag, data } = event.data;
    self.registration.showNotification(title, {
      body,
      icon: icon || '/icon-192.png',
      badge: '/icon-192.png',
      tag: tag || 'anitracker-airing',
      data,
      vibrate: [200, 100, 200],
      actions: [{ action: 'open', title: 'Ver detalles' }],
    });
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow('/');
    })
  );
});
