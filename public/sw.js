const CACHE_VERSION = 'v27';
const STATIC_CACHE = `anitracker-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `anitracker-runtime-${CACHE_VERSION}`;
// Sin versión: las portadas no cambian entre deploys, no hay por qué volver
// a bajarlas cada vez que se publica la app.
const IMAGE_CACHE = 'anitracker-images';
const MAX_IMAGES = 500;

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
  'translate.googleapis.com',
  'api.themoviedb.org',
  'api.viki.io',
  'es.wikipedia.org',
  'en.wikipedia.org',
  'firestore.googleapis.com',
  'www.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
];

// Image hosts for optimized caching
const IMAGE_HOSTS = [
  'cdn.myanimelist.net',
  'image.tmdb.org',
  'media.kitsu.app',
  's4.anilist.co',
  'static.tvmaze.com',
  'vikiplatform.com',
  'is1-ssl.mzstatic.com',
  'is2-ssl.mzstatic.com',
  'is3-ssl.mzstatic.com',
  'is4-ssl.mzstatic.com',
  'is5-ssl.mzstatic.com',
];

// Don't skipWaiting() automatically — let the page surface a banner so the
// user controls when to swap. The page will postMessage SKIP_WAITING below.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
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
  // Las propias (íconos) van con el resto de la app: pueden cambiar.
  if (url.origin === self.location.origin) return false;
  if (request.destination === 'image') return true;
  return IMAGE_HOSTS.some((h) => url.hostname.endsWith(h));
}

// Hosts de imágenes que no aceptan CORS (p. ej. Kitsu): se piden como el
// <img> (respuesta opaca) y no se guardan. Una respuesta opaca ocupa ~7 MB de
// cuota en Chrome; con cientos de portadas el navegador podría borrar todos
// los datos del sitio, biblioteca incluida.
const noCorsHosts = new Set();

let trimming = false;
async function trimImages(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    // keys() viene en orden de inserción: se van las más viejas.
    await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_IMAGES)).map((k) => cache.delete(k)));
  } finally {
    trimming = false;
  }
}

// Portadas: primero la cache (no cambian); si no está, se pide con CORS para
// poder guardarla y verla sin conexión.
async function cacheFirstImage(event) {
  const { request } = event;
  const url = new URL(request.url);
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request.url);
  if (cached) return cached;
  if (!noCorsHosts.has(url.host)) {
    try {
      const response = await fetch(request.url, { mode: 'cors', credentials: 'omit' });
      if (response.ok) {
        event.waitUntil(cache.put(request.url, response.clone()).then(() => trimImages(cache)).catch(() => {}));
      }
      return response;
    } catch {
      // Falló con CORS: si como <img> anda, el host no acepta CORS; si
      // tampoco anda, es que no hay conexión (y no hay nada que recordar).
      const plain = await fetch(request);
      noCorsHosts.add(url.host);
      return plain;
    }
  }
  return fetch(request);
}

// Network-first with cache fallback (for app shell)
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    // Nunca cachear HTML para algo que no es una navegación: es el fallback
    // del SPA respondiendo por un chunk que ya no existe.
    const isHtml = (response.headers.get('content-type') || '').includes('text/html');
    if (response && response.status === 200 && response.type === 'basic' && (request.mode === 'navigate' || !isHtml)) {
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
  // OAuth helpers and callbacks must always reach Firebase. Never cache a
  // one-time callback or replace it with the offline app shell.
  if (url.origin === self.location.origin && url.pathname.startsWith('/__/auth/')) return;
  if (isNoCache(url)) return; // Let it hit network directly

  if (isImage(request, url)) {
    event.respondWith(cacheFirstImage(event));
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
