import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const SW_SOURCE = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
const ORIGIN = 'https://anitracker-jona.netlify.app';

function fakeCaches() {
  const stores = new Map();
  const open = async (name) => {
    if (!stores.has(name)) {
      const entries = new Map();
      stores.set(name, {
        entries,
        // Como el real: cada match entrega una respuesta nueva (el cuerpo de
        // una Response se lee una sola vez).
        match: async (key) => entries.get(typeof key === 'string' ? key : key.url)?.clone(),
        put: async (key, res) => { entries.set(typeof key === 'string' ? key : key.url, res); },
        keys: async () => [...entries.keys()].map((url) => ({ url })),
        delete: async (key) => entries.delete(typeof key === 'string' ? key : key.url),
        // Como el real: la clave es la URL absoluta del request.
        addAll: async (urls) => { for (const url of urls) entries.set(new URL(url, ORIGIN).href, ok(url)); },
      });
    }
    return stores.get(name);
  };
  return { stores, open, keys: async () => [...stores.keys()], delete: async (n) => stores.delete(n) };
}

const ok = (body = 'img') => ({ ok: true, status: 200, type: 'cors', body, headers: new Headers(), clone() { return this; } });

function loadSw(fetchImpl, source = SW_SOURCE) {
  const handlers = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    clients: {
      claim: vi.fn(async () => {}),
      matchAll: vi.fn(async () => []),
      openWindow: vi.fn(async () => null),
    },
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn(async () => {}) },
    Notification: { permission: 'granted' },
  };
  const caches = fakeCaches();
  const fetch = vi.fn(fetchImpl);
  new Function('self', 'caches', 'fetch', source)(self, caches, fetch);

  const request = async (url, init = {}) => {
    let responded;
    const waits = [];
    handlers.fetch({
      request: { url, method: 'GET', destination: 'image', mode: 'no-cors', headers: new Headers(), ...init },
      respondWith: (p) => { responded = p; },
      waitUntil: (p) => { waits.push(p); },
    });
    if (!responded) return { handled: false };
    const response = await responded;
    await Promise.all(waits);
    return { handled: true, response };
  };
  return { handlers, caches, fetch, request, self };
}

const imageStore = (sw) => sw.caches.stores.get('anitracker-images');

describe('service worker: portadas', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('la primera vez la pide con CORS y la guarda; la segunda sale de la cache sin red', async () => {
    const sw = loadSw(async () => ok());
    const url = 'https://s4.anilist.co/file/cover.jpg';
    const first = await sw.request(url);
    expect(first.response.ok).toBe(true);
    expect(sw.fetch).toHaveBeenCalledWith(url, { mode: 'cors', credentials: 'omit' });
    expect(imageStore(sw).entries.has(url)).toBe(true);

    await sw.request(url);
    expect(sw.fetch).toHaveBeenCalledTimes(1);
  });

  it('un host sin CORS se pide normal, no se guarda y no se reintenta con CORS', async () => {
    const sw = loadSw(async (req, init) => {
      if (init?.mode === 'cors') throw new TypeError('CORS');
      return { ok: false, status: 0, type: 'opaque', clone() { return this; } };
    });
    await sw.request('https://images.sin-cors.example/a.jpg');
    expect(imageStore(sw).entries.size).toBe(0);
    sw.fetch.mockClear();
    await sw.request('https://images.sin-cors.example/b.jpg');
    expect(sw.fetch).toHaveBeenCalledTimes(1);
    expect(sw.fetch.mock.calls[0][1]).toBeUndefined();
  });

  it('sin conexión no marca el host como "sin CORS"', async () => {
    let online = false;
    const sw = loadSw(async () => { if (!online) throw new TypeError('offline'); return ok(); });
    await expect(sw.request('https://cdn.myanimelist.net/a.jpg')).rejects.toThrow('offline');
    online = true;
    await sw.request('https://cdn.myanimelist.net/b.jpg');
    expect(sw.fetch).toHaveBeenLastCalledWith('https://cdn.myanimelist.net/b.jpg', { mode: 'cors', credentials: 'omit' });
  });

  it('guarda como máximo 500 portadas: se van las más viejas', async () => {
    const sw = loadSw(async () => ok());
    const store = await sw.caches.open('anitracker-images');
    for (let i = 0; i < 500; i++) await store.put(`https://static.tvmaze.com/${i}.jpg`, ok());
    await sw.request('https://static.tvmaze.com/new.jpg');
    expect(store.entries.size).toBe(500);
    expect(store.entries.has('https://static.tvmaze.com/0.jpg')).toBe(false);
    expect(store.entries.has('https://static.tvmaze.com/new.jpg')).toBe(true);
  });

  it('los íconos propios no van a la cache de portadas (pueden cambiar)', async () => {
    const sw = loadSw(async () => ({ ...ok(), type: 'basic', headers: new Headers({ 'content-type': 'image/png' }) }));
    await sw.request(`${ORIGIN}/icon-192.png`);
    expect(sw.caches.stores.has('anitracker-images')).toBe(false);
  });

  it('al activar una versión nueva se conserva la cache de portadas', async () => {
    const sw = loadSw(async () => ok());
    await sw.caches.open('anitracker-images');
    await sw.caches.open('anitracker-images-v20');
    await sw.caches.open('anitracker-static-v1');
    let done;
    sw.handlers.activate({ waitUntil: (p) => { done = p; } });
    await done;
    const names = await sw.caches.keys();
    expect(names).toContain('anitracker-images');
    expect(names).not.toContain('anitracker-images-v20');
    expect(names).not.toContain('anitracker-static-v1');
  });
});

describe('service worker: precache del build', () => {
  const PLACEHOLDER = 'self.__PRECACHE_ASSETS = [];';
  const ASSETS = ['/assets/index-abc.js', '/assets/BackupModal-def.js', '/assets/index-ghi.css'];
  // Lo mismo que hace el plugin `swPrecache` de vite.config.js en dist/sw.js.
  const builtSw = SW_SOURCE.replace(PLACEHOLDER, `self.__PRECACHE_ASSETS = ${JSON.stringify(ASSETS)};`);
  const run = async (sw, type) => {
    let done;
    sw.handlers[type]({ waitUntil: (p) => { done = p; } });
    await done;
  };
  const abs = (path) => `${ORIGIN}${path}`;
  const staticStore = (sw) => [...sw.caches.stores.entries()].find(([name]) => name.startsWith('anitracker-static-'))[1];

  it('public/sw.js trae el placeholder que reemplaza el build', () => {
    expect(SW_SOURCE).toContain(PLACEHOLDER);
  });

  it('al instalarse guarda los chunks lazy además del shell', async () => {
    const sw = loadSw(async () => ok(), builtSw);
    await run(sw, 'install');
    const cached = [...staticStore(sw).entries.keys()];
    expect(cached).toEqual(expect.arrayContaining(['/', '/index.html', ...ASSETS].map(abs)));
  });

  it('en dev (sin lista) instala solo el shell', async () => {
    const sw = loadSw(async () => ok());
    await run(sw, 'install');
    expect([...staticStore(sw).entries.keys()].some((k) => k.startsWith(abs('/assets/')))).toBe(false);
  });

  it('al activar borra los chunks de deploys anteriores y conserva los actuales y el shell', async () => {
    const sw = loadSw(async () => ok(), builtSw);
    await run(sw, 'install');
    const store = staticStore(sw);
    await store.put(`${ORIGIN}/assets/index-viejo.js`, ok());
    await store.put(`${ORIGIN}/assets/BackupModal-viejo.js`, ok());
    await store.put(`${ORIGIN}/manifest.json`, ok());
    await run(sw, 'activate');
    const keys = [...store.entries.keys()];
    expect(keys).not.toContain(`${ORIGIN}/assets/index-viejo.js`);
    expect(keys).not.toContain(`${ORIGIN}/assets/BackupModal-viejo.js`);
    expect(keys).toEqual(expect.arrayContaining([...ASSETS, '/index.html', '/manifest.json'].map(abs)));
  });

  it('sin conexión, un chunk precacheado sale de la cache', async () => {
    let online = true;
    const sw = loadSw(async () => { if (!online) throw new TypeError('offline'); return ok(); }, builtSw);
    await run(sw, 'install');
    online = false;
    const res = await sw.request(abs('/assets/BackupModal-def.js'), { destination: 'script', mode: 'cors' });
    expect(res.handled).toBe(true);
    expect(res.response.ok).toBe(true);
  });
});

describe('service worker: avisos de episodio nuevo', () => {
  const NOW = new Date(2026, 10, 15, 12, 0, 0).getTime();
  const secs = (ms) => Math.round(ms / 1000);
  const HOUR = 60 * 60 * 1000;
  const alert = (key, atMs, extra = {}) => ({
    key, animeId: Number(key.split(':')[0]), airingAt: secs(atMs), title: `Anime ${key}`, body: 'Salió el episodio 5', image: '', ...extra,
  });
  const json = (value) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => { vi.useRealTimers(); });

  const setup = async (alerts) => {
    const sw = loadSw(async () => ok());
    const cache = await sw.caches.open('anitracker-alerts');
    if (alerts) await cache.put('/__alerts.json', json(alerts));
    return { sw, cache };
  };
  // Lo mismo que hace la página con `registration.active.postMessage`.
  const dispatch = async (sw, type, event) => {
    const waits = [];
    sw.handlers[type]({ ...event, waitUntil: (p) => { waits.push(p); } });
    await Promise.all(waits);
    return waits.length;
  };
  const check = (sw, baseline = false) => dispatch(sw, 'message', { data: { type: 'CHECK_ALERTS', baseline } });
  const notifiedMap = async (cache) => (await cache.match('/__alerts-notified.json'))?.json();
  const shown = (sw) => sw.self.registration.showNotification;

  it('CHECK_ALERTS muestra los avisos vencidos una sola vez', async () => {
    const { sw, cache } = await setup([
      alert('1:0:5', NOW - HOUR, { image: 'https://s4.anilist.co/cover.jpg' }),
      alert('2:3:1', NOW - 60 * 1000, { title: 'Otra serie', body: 'Salió el T3 · Ep. 1' }),
    ]);
    expect(await check(sw)).toBe(1); // el trabajo queda dentro de waitUntil

    expect(shown(sw)).toHaveBeenCalledTimes(2);
    expect(shown(sw)).toHaveBeenCalledWith('Anime 1:0:5', {
      body: 'Salió el episodio 5',
      icon: 'https://s4.anilist.co/cover.jpg',
      badge: '/icon-192.png',
      tag: '1:0:5',
      data: { url: '/#/semana' },
    });
    expect(shown(sw)).toHaveBeenCalledWith('Otra serie', expect.objectContaining({ icon: '/icon-192.png', tag: '2:3:1' }));
    expect(await notifiedMap(cache)).toEqual({ '1:0:5': secs(NOW - HOUR), '2:3:1': secs(NOW - 60 * 1000) });

    await check(sw);
    expect(shown(sw)).toHaveBeenCalledTimes(2);
  });

  it('dos revisiones a la vez no repiten el aviso', async () => {
    const { sw } = await setup([alert('1:0:5', NOW - HOUR)]);
    await Promise.all([check(sw), check(sw)]);
    expect(shown(sw)).toHaveBeenCalledTimes(1);
  });

  it('con baseline da por avisado lo vencido sin mostrarlo', async () => {
    const { sw, cache } = await setup([alert('1:0:5', NOW - HOUR), alert('2:0:9', NOW + HOUR)]);
    await check(sw, true);
    expect(shown(sw)).not.toHaveBeenCalled();
    expect(await notifiedMap(cache)).toEqual({ '1:0:5': secs(NOW - HOUR) });

    await check(sw);
    expect(shown(sw)).not.toHaveBeenCalled();

    // El que todavía no había salido sí se avisa cuando le llega la hora.
    vi.setSystemTime(NOW + HOUR + 1000);
    await check(sw);
    expect(shown(sw)).toHaveBeenCalledTimes(1);
    expect(shown(sw).mock.calls[0][1].tag).toBe('2:0:9');
  });

  it('no muestra los avisos futuros ni los de hace más de 24 h', async () => {
    const { sw, cache } = await setup([alert('1:0:5', NOW + 60 * 1000), alert('2:0:9', NOW - 25 * HOUR)]);
    await check(sw);
    expect(shown(sw)).not.toHaveBeenCalled();
    expect(await notifiedMap(cache)).toBeUndefined();
  });

  it('periodicsync revisa lo mismo; otro tag no hace nada', async () => {
    const { sw } = await setup([alert('1:0:5', NOW - HOUR)]);
    expect(await dispatch(sw, 'periodicsync', { tag: 'otra-cosa' })).toBe(0);
    expect(shown(sw)).not.toHaveBeenCalled();

    expect(await dispatch(sw, 'periodicsync', { tag: 'anitracker-alerts' })).toBe(1);
    expect(shown(sw)).toHaveBeenCalledTimes(1);

    await check(sw);
    expect(shown(sw)).toHaveBeenCalledTimes(1);
  });

  it('sin permiso de notificaciones no muestra nada ni lo da por avisado', async () => {
    const { sw, cache } = await setup([alert('1:0:5', NOW - HOUR)]);
    sw.self.Notification.permission = 'default';
    await check(sw);
    expect(shown(sw)).not.toHaveBeenCalled();
    expect(await notifiedMap(cache)).toBeUndefined();

    sw.self.Notification.permission = 'granted';
    await check(sw);
    expect(shown(sw)).toHaveBeenCalledTimes(1);
  });

  it('si showNotification falla, lo reintenta en la próxima revisión', async () => {
    const { sw } = await setup([alert('1:0:5', NOW - HOUR)]);
    shown(sw).mockRejectedValueOnce(new TypeError('no permission'));
    await check(sw);
    await check(sw);
    expect(shown(sw)).toHaveBeenCalledTimes(2);
    await check(sw);
    expect(shown(sw)).toHaveBeenCalledTimes(2);
  });

  it('olvida lo avisado hace más de 14 días', async () => {
    const { sw, cache } = await setup([]);
    const old = secs(NOW - 15 * 24 * HOUR);
    const recent = secs(NOW - 2 * 24 * HOUR);
    await cache.put('/__alerts-notified.json', json({ '1:0:1': old, '1:0:3': recent }));
    await check(sw);
    expect(await notifiedMap(cache)).toEqual({ '1:0:3': recent });
  });

  it('sin lista guardada o con una lista rota no hace nada', async () => {
    const empty = await setup(null);
    await check(empty.sw);
    expect(shown(empty.sw)).not.toHaveBeenCalled();

    const broken = await setup({ nope: true });
    await broken.cache.put('/__alerts-notified.json', new Response('{roto'));
    await check(broken.sw);
    expect(shown(broken.sw)).not.toHaveBeenCalled();
  });

  it('SKIP_WAITING sigue funcionando', async () => {
    const { sw } = await setup(null);
    await dispatch(sw, 'message', { data: { type: 'SKIP_WAITING' } });
    expect(sw.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  const click = async (sw, data) => {
    const notification = { close: vi.fn(), data };
    await dispatch(sw, 'notificationclick', { notification });
    return notification;
  };

  it('tocar el aviso sin la app abierta la abre en la semana', async () => {
    const { sw } = await setup(null);
    const notification = await click(sw, { url: '/#/semana' });
    expect(notification.close).toHaveBeenCalled();
    expect(sw.self.clients.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true });
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith('/#/semana');
  });

  it('tocar el aviso con la app abierta enfoca esa ventana y le dice a dónde ir', async () => {
    const { sw } = await setup(null);
    const client = { url: `${ORIGIN}/#/vistas`, focus: vi.fn(async () => client), postMessage: vi.fn() };
    sw.self.clients.matchAll.mockResolvedValue([client]);
    await click(sw, { url: '/#/semana' });
    expect(client.focus).toHaveBeenCalledTimes(1);
    expect(client.postMessage).toHaveBeenCalledWith({ type: 'OPEN_URL', url: '/#/semana' });
    expect(sw.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it('un aviso sin datos abre la raíz', async () => {
    const { sw } = await setup(null);
    await click(sw, undefined);
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith('/');
  });

  it('al activar una versión nueva se conservan los avisos y lo ya avisado', async () => {
    const { sw, cache } = await setup([alert('1:0:5', NOW - HOUR)]);
    await check(sw);
    await sw.caches.open('anitracker-static-v1');
    await dispatch(sw, 'activate', {});
    const names = await sw.caches.keys();
    expect(names).toContain('anitracker-alerts');
    expect(names).not.toContain('anitracker-static-v1');
    expect(await notifiedMap(cache)).toEqual({ '1:0:5': secs(NOW - HOUR) });

    await check(sw);
    expect(shown(sw)).toHaveBeenCalledTimes(1);
  });
});
