const CACHE_VERSION = 'v35';
const STATIC_CACHE = `anitracker-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `anitracker-runtime-${CACHE_VERSION}`;
// Sin versión: las portadas no cambian entre deploys, no hay por qué volver
// a bajarlas cada vez que se publica la app.
const IMAGE_CACHE = 'anitracker-images';
const MAX_IMAGES = 500;
// Sin versión: la lista de avisos de episodio nuevo que publica la página y el
// registro de lo ya avisado (ver src/episodeAlerts.ts). Si se borrara en cada
// deploy, se repetirían notificaciones.
const ALERTS_CACHE = 'anitracker-alerts';
const ALERTS_URL = '/__alerts.json';
const ALERTS_NOTIFIED_URL = '/__alerts-notified.json';
const ALERTS_SYNC_TAG = 'anitracker-alerts';
const ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;
const ALERT_NOTIFIED_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

// JS/CSS del build (con hash). El plugin `swPrecache` de vite.config.js
// reemplaza esta línea en dist/sw.js por la lista real; en dev queda vacía.
// Sin esto, sin conexión fallaba abrir una pestaña o un modal lazy que nunca
// se había abierto (su chunk no estaba en la cache).
self.__PRECACHE_ASSETS = [];
const PRECACHE_ASSETS = Array.isArray(self.__PRECACHE_ASSETS) ? self.__PRECACHE_ASSETS : [];

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
// addAll es todo o nada y solo acepta respuestas ok del mismo origen (nunca
// opacas): si falta un chunk, la instalación falla y queda el SW anterior.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([...PRECACHE_URLS, ...PRECACHE_ASSETS]))
  );
});

// Los chunks de deploys anteriores (hash viejo) que quedaron en la cache
// estática: sin esto crecía con cada deploy.
async function pruneStaleAssets() {
  if (PRECACHE_ASSETS.length === 0) return; // dev: no hay lista contra qué comparar
  const current = new Set(PRECACHE_ASSETS);
  const cache = await caches.open(STATIC_CACHE);
  const keys = await cache.keys();
  await Promise.all(keys
    .filter((req) => {
      const { pathname } = new URL(req.url, self.location.origin);
      return pathname.startsWith('/assets/') && !current.has(pathname);
    })
    .map((req) => cache.delete(req)));
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE, IMAGE_CACHE, ALERTS_CACHE].includes(k))
          .map((k) => caches.delete(k))
      ))
      .then(() => pruneStaleAssets().catch(() => {}))
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

// --- Avisos de episodio nuevo ---
// No hay servidor de push: la página deja en ALERTS_CACHE la lista de avisos
// pendientes ({ key, airingAt (unix, segundos), title, body, image }) y acá se
// muestran los que ya vencieron. Se revisa cuando la página lo pide
// (CHECK_ALERTS) y, con la app cerrada, desde Periodic Background Sync (solo
// PWA instalada en Chrome/Android).
async function readCachedJson(cache, url, fallback) {
  try {
    const response = await cache.match(url);
    return response ? await response.json() : fallback;
  } catch {
    return fallback;
  }
}

// En un service worker no se puede pedir permiso: si no está dado, no se
// muestra nada (showNotification además rechazaría).
const canNotify = () => !!self.Notification && self.Notification.permission === 'granted';

// `baseline`: da por avisado lo que ya venció SIN mostrarlo (al activar los
// avisos, para que no salga una tanda de notificaciones viejas).
async function runAlertsCheck({ baseline = false } = {}) {
  const cache = await caches.open(ALERTS_CACHE);
  const stored = await readCachedJson(cache, ALERTS_URL, []);
  const alerts = Array.isArray(stored) ? stored : [];
  const saved = await readCachedJson(cache, ALERTS_NOTIFIED_URL, {});
  // { key: airingAt (segundos) } de lo ya avisado.
  const notified = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  const now = Date.now();
  const allowed = canNotify();
  let changed = false;

  for (const alert of alerts) {
    if (!alert || typeof alert.key !== 'string' || !Number.isFinite(alert.airingAt)) continue;
    const at = alert.airingAt * 1000;
    if (at > now || at <= now - ALERT_WINDOW_MS) continue;
    if (Object.prototype.hasOwnProperty.call(notified, alert.key)) continue;
    if (!baseline) {
      // Sin permiso no se da por avisado: si después lo dan, todavía sale.
      if (!allowed) continue;
      try {
        await self.registration.showNotification(String(alert.title || 'AniTracker'), {
          body: String(alert.body || ''),
          icon: alert.image || '/icon-192.png',
          badge: '/icon-192.png',
          tag: alert.key,
          data: { url: '/#/semana' },
        });
      } catch {
        continue; // se reintenta en la próxima revisión
      }
    }
    notified[alert.key] = alert.airingAt;
    changed = true;
  }

  for (const [key, airingAt] of Object.entries(notified)) {
    if (!(airingAt * 1000 > now - ALERT_NOTIFIED_TTL_MS)) {
      delete notified[key];
      changed = true;
    }
  }

  if (changed) {
    await cache.put(ALERTS_NOTIFIED_URL, new Response(JSON.stringify(notified), {
      headers: { 'content-type': 'application/json' },
    }));
  }
}

// De a una: dos revisiones a la vez leerían el mismo registro y mostrarían el
// mismo aviso dos veces.
let alertsQueue = Promise.resolve();
function checkAlerts(options) {
  alertsQueue = alertsQueue.then(() => runAlertsCheck(options)).catch(() => {});
  return alertsQueue;
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CHECK_ALERTS') {
    event.waitUntil(checkAlerts({ baseline: event.data.baseline === true }));
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === ALERTS_SYNC_TAG) event.waitUntil(checkAlerts());
});

// Con la app abierta se enfoca esa ventana y se le avisa a dónde ir (la página
// cambia el hash: no hace falta recargar); si no, se abre una nueva.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((c) => c.url.startsWith(self.location.origin) && 'focus' in c);
    if (!client) return self.clients.openWindow(url);
    try { client.postMessage({ type: 'OPEN_URL', url }); } catch { /* best-effort */ }
    return client.focus();
  })());
});
