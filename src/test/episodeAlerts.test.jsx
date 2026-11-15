import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  ALERTS_CACHE,
  ALERTS_URL,
  alertsPermission,
  alertsSupported,
  alertTimeMs,
  buildEpisodeAlerts,
  clearAlerts,
  nextAlertAt,
  publishAlerts,
  registerPeriodicAlerts,
  requestAlertsCheck,
  requestAlertsPermission,
  unregisterPeriodicAlerts,
} from '../episodeAlerts';
import { useEpisodeAlerts } from '../hooks/useEpisodeAlerts';
import { buildAiringInfo } from '../utils';
import { initLocale, localeReady, setLocale } from '../i18n';

// jsdom dice `en-US` y el idioma se detecta al cargar el módulo: los textos se
// prueban en español, y un cambio de idioma a mitad de un test cambiaría la
// lista publicada.
beforeAll(async () => { await localeReady; });
beforeEach(() => { setLocale('es'); });

const NOW = new Date(2026, 10, 15, 12, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const secs = (ms) => Math.round(ms / 1000);

const anime = (id, extra = {}) => ({
  id, title: `Anime ${id}`, image: `https://img.example/${id}-big.jpg`, imageSm: `https://img.example/${id}.jpg`, currentEp: 0, ...extra,
});
const airing = (atMs, extra = {}) => buildAiringInfo({ episode: 5, airingAt: secs(atMs), ...extra }, new Date(NOW));

describe('buildEpisodeAlerts', () => {
  it('arma un aviso por episodio pendiente, con clave id:temporada:episodio', () => {
    const schedule = { Lunes: [anime(1, { currentEp: 4 })], Martes: [] };
    const alerts = buildEpisodeAlerts(schedule, { 1: airing(NOW + 2 * HOUR) }, NOW);
    expect(alerts).toEqual([{
      key: '1:0:5',
      animeId: 1,
      airingAt: secs(NOW + 2 * HOUR),
      title: 'Anime 1',
      body: 'Salió el episodio 5',
      image: 'https://img.example/1.jpg',
    }]);
  });

  it('con temporada (TVMaze/TMDB) la clave y el texto la incluyen', () => {
    const schedule = { Lunes: [anime(400123, { currentSeason: 38, currentEp: 1, imageSm: '' })] };
    const [alert] = buildEpisodeAlerts(schedule, { 400123: airing(NOW + HOUR, { episode: 2, season: 38 }) }, NOW);
    expect(alert.key).toBe('400123:38:2');
    expect(alert.body).toBe('Salió el T38 · Ep. 2');
    expect(alert.image).toBe('https://img.example/400123-big.jpg'); // sin miniatura: la portada grande
  });

  it('el texto sale en el idioma activo', async () => {
    await initLocale('en');
    const schedule = { Lunes: [anime(1), anime(2, { currentSeason: 3 })] };
    const alerts = buildEpisodeAlerts(schedule, { 1: airing(NOW + HOUR), 2: airing(NOW + 2 * HOUR, { season: 3 }) }, NOW);
    expect(alerts.map((a) => a.body)).toEqual(['Episode 5 is out', 'S3 · Ep. 5 is out']);
  });

  it('si el anime no tiene título usa el de la emisión', () => {
    const [alert] = buildEpisodeAlerts({ Lunes: [anime(1, { title: '' })] }, { 1: airing(NOW + HOUR, { title: 'Frieren' }) }, NOW);
    expect(alert.title).toBe('Frieren');
  });

  it('saltea los que están en pausa', () => {
    const schedule = { Lunes: [anime(1, { paused: true }), anime(2)] };
    const alerts = buildEpisodeAlerts(schedule, { 1: airing(NOW + HOUR), 2: airing(NOW + HOUR) }, NOW);
    expect(alerts.map((a) => a.animeId)).toEqual([2]);
  });

  it('saltea los episodios que ya se vieron', () => {
    const schedule = { Lunes: [anime(1, { currentEp: 5 }), anime(2, { currentEp: 7 }), anime(3, { currentEp: 4 })] };
    const data = { 1: airing(NOW + HOUR), 2: airing(NOW + HOUR), 3: airing(NOW + HOUR) };
    expect(buildEpisodeAlerts(schedule, data, NOW).map((a) => a.animeId)).toEqual([3]);
  });

  it('saltea la emisión de una temporada que no es la que se sigue', () => {
    const schedule = {
      Lunes: [
        anime(1, { currentSeason: 3 }), // la emisión es de la T2
        anime(2, { currentSeason: 2 }), // AniList no dice temporada: es la de la T1
        anime(3, { currentSeason: 2 }), // coincide
        anime(4), // no eligió temporada: vale cualquiera
      ],
    };
    const data = {
      1: airing(NOW + HOUR, { season: 2 }),
      2: airing(NOW + HOUR),
      3: airing(NOW + HOUR, { season: 2 }),
      4: airing(NOW + HOUR, { season: 6 }),
    };
    expect(buildEpisodeAlerts(schedule, data, NOW).map((a) => a.key)).toEqual(['3:2:5', '4:6:5']);
  });

  it('saltea lo que no tiene emisión o tiene una fecha inválida', () => {
    const schedule = { Lunes: [anime(1), anime(2), anime(3), anime(4)], Roto: null };
    const data = {
      2: { ...airing(NOW + HOUR), airingAt: undefined },
      3: { ...airing(NOW + HOUR), airingAt: NaN },
      4: { ...airing(NOW + HOUR), episode: undefined },
    };
    expect(buildEpisodeAlerts(schedule, data, NOW)).toEqual([]);
    expect(buildEpisodeAlerts(null, data, NOW)).toEqual([]);
    expect(buildEpisodeAlerts(schedule, undefined, NOW)).toEqual([]);
  });

  it('con solo fecha (TMDB) avisa a las 10:00 locales de ese día', () => {
    // tmdbService arma la fecha al mediodía local.
    const noon = new Date(2026, 10, 18, 12, 0, 0).getTime();
    const info = airing(noon, { season: 1, dateOnly: true });
    expect(alertTimeMs(info)).toBe(new Date(2026, 10, 18, 10, 0, 0).getTime());
    const [alert] = buildEpisodeAlerts({ Lunes: [anime(900000001)] }, { 900000001: info }, NOW);
    expect(alert.airingAt).toBe(secs(new Date(2026, 10, 18, 10, 0, 0).getTime()));
  });

  it('entran los futuros y los que salieron hace menos de 24 h', () => {
    const schedule = { Lunes: [anime(1), anime(2), anime(3), anime(4)] };
    const data = {
      1: airing(NOW - 23 * HOUR),
      2: airing(NOW - 25 * HOUR),
      3: airing(NOW - DAY), // justo 24 h: ya no
      4: airing(NOW + 6 * DAY),
    };
    expect(buildEpisodeAlerts(schedule, data, NOW).map((a) => a.animeId)).toEqual([1, 4]);
  });

  it('la ventana de 24 h de un estreno con solo fecha cuenta desde las 10:00', () => {
    const yesterdayNoon = new Date(2026, 10, 14, 12, 0, 0).getTime();
    const schedule = { Lunes: [anime(1)] };
    const data = { 1: airing(yesterdayNoon, { dateOnly: true }) };
    // Ayer 10:00 → a las 9:59 de hoy todavía entra; a las 10:00 ya no.
    expect(buildEpisodeAlerts(schedule, data, new Date(2026, 10, 15, 9, 59).getTime())).toHaveLength(1);
    expect(buildEpisodeAlerts(schedule, data, new Date(2026, 10, 15, 10, 0).getTime())).toHaveLength(0);
  });

  it('ordena por hora, no repite un anime que está en dos días y corta en 100', () => {
    const twice = anime(1);
    const schedule = { Lunes: [twice, anime(2)], Martes: [twice, anime(3)] };
    const data = { 1: airing(NOW + 3 * HOUR), 2: airing(NOW + HOUR), 3: airing(NOW - HOUR) };
    expect(buildEpisodeAlerts(schedule, data, NOW).map((a) => a.animeId)).toEqual([3, 2, 1]);

    const many = Array.from({ length: 130 }, (_, i) => anime(i + 1));
    const manyData = Object.fromEntries(many.map((a) => [a.id, airing(NOW + (200 - a.id) * 60 * 1000)]));
    const capped = buildEpisodeAlerts({ Lunes: many }, manyData, NOW);
    expect(capped).toHaveLength(100);
    expect(capped[0].animeId).toBe(130); // los más próximos primero
    expect(capped.at(-1).animeId).toBe(31);
  });

  it('es estable: la misma entrada da la misma lista aunque pase el tiempo', () => {
    const schedule = { Lunes: [anime(1), anime(2)] };
    const data = { 1: airing(NOW + HOUR), 2: airing(NOW - HOUR) };
    const later = Object.fromEntries(Object.entries(data).map(([id, info]) => [id, buildAiringInfo(info, new Date(NOW + 5 * 60 * 1000))]));
    expect(JSON.stringify(buildEpisodeAlerts(schedule, later, NOW + 5 * 60 * 1000)))
      .toBe(JSON.stringify(buildEpisodeAlerts(schedule, data, NOW)));
  });
});

describe('nextAlertAt', () => {
  it('da el próximo aviso todavía futuro, o null', () => {
    const alerts = [{ airingAt: secs(NOW - HOUR) }, { airingAt: secs(NOW + 2 * HOUR) }, { airingAt: secs(NOW + HOUR) }];
    expect(nextAlertAt(alerts, NOW)).toBe(NOW + HOUR);
    expect(nextAlertAt(alerts, NOW + HOUR)).toBe(NOW + 2 * HOUR);
    expect(nextAlertAt(alerts, NOW + 3 * HOUR)).toBeNull();
    expect(nextAlertAt([], NOW)).toBeNull();
  });
});

// --- Navegador de mentira: Notification, service worker y Cache Storage ---

function fakeCacheStorage() {
  const stores = new Map();
  return {
    stores,
    open: vi.fn(async (name) => {
      if (!stores.has(name)) {
        const entries = new Map();
        stores.set(name, {
          entries,
          put: async (url, response) => { entries.set(url, response); },
          match: async (url) => entries.get(url)?.clone(),
        });
      }
      return stores.get(name);
    }),
    delete: vi.fn(async (name) => stores.delete(name)),
  };
}

function installBrowser({ permission = 'granted', periodicSync = true } = {}) {
  const listeners = new Map();
  const registration = {
    active: { postMessage: vi.fn() },
    ...(periodicSync ? { periodicSync: { register: vi.fn(async () => {}), unregister: vi.fn(async () => {}) } } : {}),
  };
  const container = {
    ready: Promise.resolve(registration),
    addEventListener: (type, fn) => { listeners.set(type, fn); },
    removeEventListener: (type) => { listeners.delete(type); },
  };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container });
  const notification = { permission, requestPermission: vi.fn(async () => notification.permission) };
  vi.stubGlobal('Notification', notification);
  const cacheStorage = fakeCacheStorage();
  vi.stubGlobal('caches', cacheStorage);
  const storedAlerts = async () => (await cacheStorage.stores.get(ALERTS_CACHE)?.match(ALERTS_URL))?.json();
  return { registration, listeners, notification, cacheStorage, storedAlerts, posted: registration.active.postMessage };
}

function uninstallBrowser() {
  delete navigator.serviceWorker;
  delete navigator.permissions;
  vi.unstubAllGlobals();
}

describe('permiso y soporte', () => {
  afterEach(uninstallBrowser);

  it('sin Notification o sin service worker no hay soporte ni se rompe nada', async () => {
    expect(alertsSupported()).toBe(false);
    expect(alertsPermission()).toBe('unsupported');
    expect(await requestAlertsPermission()).toBe('unsupported');
    expect(await publishAlerts([])).toBe(false);
    expect(await requestAlertsCheck()).toBe(false);
    expect(await clearAlerts()).toBe(false);
    expect(await registerPeriodicAlerts()).toBe(false);
    expect(await unregisterPeriodicAlerts()).toBe(false);
  });

  it('informa el permiso del navegador', () => {
    const { notification } = installBrowser({ permission: 'default' });
    expect(alertsSupported()).toBe(true);
    expect(alertsPermission()).toBe('default');
    notification.permission = 'denied';
    expect(alertsPermission()).toBe('denied');
    notification.permission = 'granted';
    expect(alertsPermission()).toBe('granted');
  });

  it('requestAlertsPermission devuelve cómo quedó el permiso', async () => {
    const { notification } = installBrowser({ permission: 'default' });
    notification.requestPermission.mockImplementation(async () => { notification.permission = 'granted'; return 'granted'; });
    expect(await requestAlertsPermission()).toBe('granted');
  });

  it('requestAlertsPermission sirve con la API vieja de callback y nunca tira', async () => {
    const { notification } = installBrowser({ permission: 'default' });
    notification.requestPermission.mockImplementation((done) => { notification.permission = 'denied'; done('denied'); });
    expect(await requestAlertsPermission()).toBe('denied');

    notification.permission = 'default';
    notification.requestPermission.mockImplementation(() => { throw new TypeError('boom'); });
    expect(await requestAlertsPermission()).toBe('default');
    notification.requestPermission.mockImplementation(async () => { throw new TypeError('boom'); });
    expect(await requestAlertsPermission()).toBe('default');
  });
});

describe('publishAlerts / clearAlerts / revisión periódica', () => {
  afterEach(uninstallBrowser);
  const sample = [{ key: '1:0:5', animeId: 1, airingAt: secs(NOW), title: 'Anime 1', body: 'Salió el episodio 5', image: '' }];

  it('guarda la lista en Cache Storage y le pide la revisión al service worker', async () => {
    const browser = installBrowser();
    expect(await publishAlerts(sample)).toBe(true);
    expect(await browser.storedAlerts()).toEqual(sample);
    expect(browser.posted).toHaveBeenCalledWith({ type: 'CHECK_ALERTS', baseline: false });

    await publishAlerts(sample, { baseline: true });
    expect(browser.posted).toHaveBeenLastCalledWith({ type: 'CHECK_ALERTS', baseline: true });
  });

  it('si Cache Storage falla no tira ni le avisa al service worker', async () => {
    const browser = installBrowser();
    browser.cacheStorage.open.mockRejectedValue(new Error('quota'));
    expect(await publishAlerts(sample)).toBe(false);
    expect(browser.posted).not.toHaveBeenCalled();
  });

  it('clearAlerts borra lo guardado', async () => {
    const browser = installBrowser();
    await publishAlerts(sample);
    expect(await clearAlerts()).toBe(true);
    expect(browser.cacheStorage.stores.has(ALERTS_CACHE)).toBe(false);
  });

  it('registra y borra la revisión periódica donde existe', async () => {
    const browser = installBrowser();
    expect(await registerPeriodicAlerts()).toBe(true);
    expect(browser.registration.periodicSync.register).toHaveBeenCalledWith('anitracker-alerts', { minInterval: 60 * 60 * 1000 });
    expect(await unregisterPeriodicAlerts()).toBe(true);
    expect(browser.registration.periodicSync.unregister).toHaveBeenCalledWith('anitracker-alerts');
  });

  it('sin Periodic Background Sync, sin permiso o si el registro falla es un no-op', async () => {
    installBrowser({ periodicSync: false });
    expect(await registerPeriodicAlerts()).toBe(false);
    expect(await unregisterPeriodicAlerts()).toBe(false);

    const noPermission = installBrowser({ permission: 'default' });
    expect(await registerPeriodicAlerts()).toBe(false);
    expect(noPermission.registration.periodicSync.register).not.toHaveBeenCalled();

    const denied = installBrowser();
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: vi.fn(async () => ({ state: 'denied' })) } });
    expect(await registerPeriodicAlerts()).toBe(false);
    expect(denied.registration.periodicSync.register).not.toHaveBeenCalled();
    delete navigator.permissions;

    const failing = installBrowser();
    failing.registration.periodicSync.register.mockRejectedValue(new DOMException('NotAllowedError'));
    expect(await registerPeriodicAlerts()).toBe(false);
  });
});

describe('useEpisodeAlerts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => {
    vi.useRealTimers();
    uninstallBrowser();
    window.history.replaceState(null, '', '/');
  });

  const flush = () => vi.advanceTimersByTimeAsync(0);
  const schedule = { Lunes: [anime(1), anime(2)] };
  const data = () => ({ 1: airing(NOW + 10 * 60 * 1000), 2: airing(NOW - HOUR) });
  const mount = (props) => renderHook((p) => useEpisodeAlerts(p), { initialProps: { schedule, airingData: data(), enabled: true, ...props } });
  const checks = (browser) => browser.posted.mock.calls.map(([message]) => message);

  it('prendido y con permiso: publica la lista y registra la revisión periódica una sola vez', async () => {
    const browser = installBrowser();
    const { rerender } = mount();
    await flush();
    expect((await browser.storedAlerts()).map((a) => a.key)).toEqual(['2:0:5', '1:0:5']);
    // Arrancar ya prendido no es "activar": lo que salió con la app cerrada se muestra.
    expect(checks(browser)).toEqual([{ type: 'CHECK_ALERTS', baseline: false }]);
    expect(browser.registration.periodicSync.register).toHaveBeenCalledTimes(1);

    // El tick de cada minuto trae otro objeto con el mismo contenido: no se vuelve a publicar.
    rerender({ schedule, airingData: data(), enabled: true });
    rerender({ schedule: { ...schedule }, airingData: data(), enabled: true });
    await flush();
    expect(checks(browser)).toHaveLength(1);
    expect(browser.registration.periodicSync.register).toHaveBeenCalledTimes(1);

    // Cambió la lista (se vio el episodio): se publica de nuevo.
    rerender({ schedule: { Lunes: [anime(1, { currentEp: 5 }), anime(2)] }, airingData: data(), enabled: true });
    await flush();
    expect((await browser.storedAlerts()).map((a) => a.key)).toEqual(['2:0:5']);
    expect(checks(browser)).toHaveLength(2);
  });

  it('al activarlos publica con baseline, y solo esa vez', async () => {
    const browser = installBrowser();
    const { rerender } = mount({ enabled: false });
    await flush();
    expect(browser.posted).not.toHaveBeenCalled();
    expect(browser.cacheStorage.stores.has(ALERTS_CACHE)).toBe(false);

    rerender({ schedule, airingData: data(), enabled: true });
    await flush();
    expect(checks(browser)).toEqual([{ type: 'CHECK_ALERTS', baseline: true }]);
    expect(await browser.storedAlerts()).toHaveLength(2);

    rerender({ schedule: { Lunes: [anime(1)] }, airingData: data(), enabled: true });
    await flush();
    expect(checks(browser).at(-1)).toEqual({ type: 'CHECK_ALERTS', baseline: false });
  });

  it('prendido pero sin permiso no publica; cuando llega el permiso arranca con baseline', async () => {
    const browser = installBrowser({ permission: 'default' });
    const { rerender } = mount();
    await flush();
    expect(browser.posted).not.toHaveBeenCalled();
    expect(browser.cacheStorage.open).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    browser.notification.permission = 'granted';
    rerender({ schedule, airingData: data(), enabled: true });
    await flush();
    expect(checks(browser)).toEqual([{ type: 'CHECK_ALERTS', baseline: true }]);
  });

  it('al apagarlos borra la lista, la revisión periódica y el timer', async () => {
    const browser = installBrowser();
    const { rerender } = mount();
    await flush();
    expect(vi.getTimerCount()).toBe(1);

    rerender({ schedule, airingData: data(), enabled: false });
    await flush();
    expect(browser.cacheStorage.stores.has(ALERTS_CACHE)).toBe(false);
    expect(browser.registration.periodicSync.unregister).toHaveBeenCalledWith('anitracker-alerts');
    expect(vi.getTimerCount()).toBe(0);

    // Y al volver a prender se registra todo de nuevo.
    rerender({ schedule, airingData: data(), enabled: true });
    await flush();
    expect(browser.registration.periodicSync.register).toHaveBeenCalledTimes(2);
    expect(await browser.storedAlerts()).toHaveLength(2);
  });

  it('a la hora del episodio le pide la revisión al service worker aunque nada cambie', async () => {
    const browser = installBrowser();
    mount({ airingData: { 1: airing(NOW + 10 * 60 * 1000), 2: airing(NOW + 30 * 60 * 1000) } });
    await flush();
    expect(checks(browser)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(9 * 60 * 1000);
    expect(checks(browser)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(61 * 1000);
    expect(checks(browser)).toHaveLength(2);
    // Se rearma para el siguiente.
    await vi.advanceTimersByTimeAsync(20 * 60 * 1000);
    expect(checks(browser)).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('un episodio a más de 24 días no desborda el setTimeout: se rearma hasta la hora', async () => {
    const browser = installBrowser();
    const spy = vi.spyOn(globalThis, 'setTimeout');
    mount({ airingData: { 1: airing(NOW + 30 * DAY) } });
    await flush();
    expect(Math.max(...spy.mock.calls.map(([, delay]) => delay))).toBe(2 ** 31 - 1);

    await vi.advanceTimersByTimeAsync(25 * DAY);
    expect(checks(browser)).toHaveLength(1); // solo la publicación inicial
    await vi.advanceTimersByTimeAsync(5 * DAY + 2000);
    expect(checks(browser)).toHaveLength(2);
    spy.mockRestore();
  });

  it('al volver a primer plano revisa en el momento', async () => {
    const browser = installBrowser();
    mount();
    await flush();
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(checks(browser)).toHaveLength(2);
  });

  it('al desmontarse no deja timers ni listeners', async () => {
    const browser = installBrowser();
    const { unmount } = mount();
    await flush();
    expect(browser.listeners.has('message')).toBe(true);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(browser.listeners.has('message')).toBe(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(checks(browser)).toHaveLength(1);
  });

  it('si no se pudo guardar, lo reintenta en el próximo cambio', async () => {
    const browser = installBrowser();
    browser.cacheStorage.open.mockRejectedValueOnce(new Error('quota'));
    const { rerender } = mount();
    await flush();
    expect(browser.posted).not.toHaveBeenCalled();

    rerender({ schedule, airingData: data(), enabled: true });
    await flush();
    expect(checks(browser)).toHaveLength(1);
  });

  it('sin soporte (sin service worker) no hace nada ni tira', async () => {
    const { rerender, unmount } = mount();
    rerender({ schedule, airingData: data(), enabled: false });
    await flush();
    expect(vi.getTimerCount()).toBe(0);
    unmount();
  });

  it('tocar una notificación con la app abierta lleva a la semana', async () => {
    const browser = installBrowser();
    window.history.replaceState(null, '', '/#/vistas');
    mount({ enabled: false });
    const onMessage = browser.listeners.get('message');

    onMessage({ data: { type: 'OPEN_URL', url: 'https://otro.example/#/semana' } });
    onMessage({ data: { type: 'OTRA_COSA', url: '/#/semana' } });
    expect(window.location.hash).toBe('#/vistas');

    onMessage({ data: { type: 'OPEN_URL', url: '/#/semana' } });
    expect(window.location.hash).toBe('#/semana');
  });
});
