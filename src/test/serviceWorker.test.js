import { describe, it, expect, vi, beforeEach } from 'vitest';
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
        match: async (key) => entries.get(typeof key === 'string' ? key : key.url),
        put: async (key, res) => { entries.set(typeof key === 'string' ? key : key.url, res); },
        keys: async () => [...entries.keys()].map((url) => ({ url })),
        delete: async (key) => entries.delete(typeof key === 'string' ? key : key.url),
        addAll: async () => {},
      });
    }
    return stores.get(name);
  };
  return { stores, open, keys: async () => [...stores.keys()], delete: async (n) => stores.delete(n) };
}

const ok = (body = 'img') => ({ ok: true, status: 200, type: 'cors', body, headers: new Headers(), clone() { return this; } });

function loadSw(fetchImpl) {
  const handlers = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    clients: { claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(),
  };
  const caches = fakeCaches();
  const fetch = vi.fn(fetchImpl);
  new Function('self', 'caches', 'fetch', SW_SOURCE)(self, caches, fetch);

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
