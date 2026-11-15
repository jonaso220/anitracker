import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// El client id se lee al importar el módulo: tiene que estar antes que los imports.
vi.hoisted(() => { vi.stubEnv('VITE_ANILIST_CLIENT_ID', '4242'); });

import {
  ANILIST_AUTH_KEY,
  ANILIST_LOGIN_PENDING_KEY,
  ANILIST_PUSHED_KEY,
  ANILIST_PUSHED_OWNER_KEY,
  ANILIST_SYNC_ENABLED,
  anilistLoginUrl,
  captureAnilistToken,
  clearAnilistSession,
  fetchAnilistViewer,
  getAnilistSession,
  readAnilistAuth,
  saveAnilistViewer,
} from '../services/anilistAuth';
import {
  ANILIST_IDS_KEY,
  ANILIST_MIN_INTERVAL_MS,
  AnilistAuthError,
  AnilistRateLimitError,
  AnilistRequestError,
  baselineOf,
  cachedMediaId,
  createRequestQueue,
  desiredEntries,
  entrySignature,
  pendingChanges,
  prunePushed,
  pushChanges,
  readPushed,
  readSent,
  rememberSent,
  resolveMediaId,
  saveMediaListEntry,
  writePushed,
} from '../services/anilistSync';
import { ANILIST_SYNC_DEBOUNCE_MS, ANILIST_SYNC_RETRY_MS, useAnilistSync } from '../hooks/useAnilistSync';

const TOKEN = 'secret-token-abc';
const YEAR_MS = 365 * 24 * 3600 * 1000;

const reply = (body, { status = 200, headers = {} } = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const saved = (mediaId = 1) => reply({ data: { SaveMediaListEntry: { id: 9, mediaId, status: 'CURRENT', progress: 1 } } });
const viewerReply = () => reply({ data: { Viewer: { id: 77, name: 'jona' } } });

// Como el fetch real: no contesta nunca, pero rechaza si se aborta.
const hangUntilAborted = (_url, { signal }) => new Promise((_resolve, reject) => {
  signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
});

/** Cuerpos (ya parseados) de los pedidos hechos a AniList, en orden. */
const requests = (fetchMock) => fetchMock.mock.calls.map(([url, init]) => ({
  url,
  headers: init.headers,
  ...JSON.parse(init.body),
}));
const mutations = (fetchMock) => requests(fetchMock).filter((r) => r.query.includes('SaveMediaListEntry'));

const anilistAnime = (extra = {}) => ({ id: 800150000, sourceKey: 'anilist:150000', malId: null, title: 'Solo AniList', currentEp: 0, userRating: 0, episodes: 12, ...extra });
const malAnime = (extra = {}) => ({ id: 21, sourceKey: 'mal:21', malId: 21, title: 'One Piece', currentEp: 0, userRating: 0, episodes: null, ...extra });

const connect = ({ viewer = { id: 77, name: 'jona' }, expiresAt = Date.now() + YEAR_MS } = {}) => {
  localStorage.setItem(ANILIST_AUTH_KEY, JSON.stringify({ token: TOKEN, expiresAt, ...(viewer ? { viewer } : {}) }));
};

let fetchMock;

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('anilistAuth', () => {
  it('queda habilitado con el client id y arma la URL del implicit grant', () => {
    expect(ANILIST_SYNC_ENABLED).toBe(true);
    expect(anilistLoginUrl()).toBe('https://anilist.co/api/v2/oauth/authorize?client_id=4242&response_type=token');
  });

  it('captura el token del hash, lo guarda y lo saca de la URL', () => {
    localStorage.setItem(ANILIST_LOGIN_PENDING_KEY, String(Date.now()));
    window.history.replaceState(null, '', `/?utm=1#access_token=${TOKEN}&token_type=Bearer&expires_in=31536000`);
    const before = Date.now();

    expect(captureAnilistToken()).toBe(true);

    expect(window.location.hash).toBe('#/semana');
    expect(window.location.href).not.toContain(TOKEN);
    expect(window.location.search).toBe('?utm=1');
    const session = getAnilistSession();
    expect(session.token).toBe(TOKEN);
    expect(session.expiresAt).toBeGreaterThanOrEqual(before + 31536000 * 1000);
    expect(session.viewer).toBeUndefined();
    expect(localStorage.getItem(ANILIST_LOGIN_PENDING_KEY)).toBeNull();
  });

  it('ignora un hash de ruta normal y no toca nada', () => {
    localStorage.setItem(ANILIST_LOGIN_PENDING_KEY, String(Date.now()));
    for (const hash of ['#/vistas', '#/semana', '', '#/vistas?access_token=x']) {
      window.history.replaceState(null, '', `/${hash}`);
      expect(captureAnilistToken()).toBe(false);
      expect(window.location.hash).toBe(hash);
    }
    expect(localStorage.getItem(ANILIST_AUTH_KEY)).toBeNull();
    expect(localStorage.getItem(ANILIST_LOGIN_PENDING_KEY)).not.toBeNull();
  });

  it('no acepta un token que el usuario no pidió, pero igual lo saca de la URL', () => {
    window.history.replaceState(null, '', `/#access_token=${TOKEN}&token_type=Bearer&expires_in=31536000`);
    expect(captureAnilistToken()).toBe(false);
    expect(window.location.href).not.toContain(TOKEN);
    expect(window.location.hash).toBe('#/semana');
    expect(getAnilistSession()).toBeNull();

    // Una marca de "Conectar" vieja tampoco sirve.
    localStorage.setItem(ANILIST_LOGIN_PENDING_KEY, String(Date.now() - 31 * 60 * 1000));
    window.history.replaceState(null, '', `/#access_token=${TOKEN}&token_type=Bearer&expires_in=31536000`);
    expect(captureAnilistToken()).toBe(false);
    expect(getAnilistSession()).toBeNull();
  });

  it('una sesión vencida devuelve null (pero se sabe que existió)', () => {
    connect({ expiresAt: Date.now() - 1000 });
    expect(getAnilistSession()).toBeNull();
    expect(readAnilistAuth()).toMatchObject({ token: TOKEN, viewer: { id: 77, name: 'jona' } });
  });

  it('guarda el viewer y al desconectar borra sesión y huella', () => {
    connect({ viewer: null });
    expect(saveAnilistViewer({ id: 5, name: 'ana', extra: 'x' })).toBe(true);
    expect(getAnilistSession().viewer).toEqual({ id: 5, name: 'ana' });

    writePushed({ 21: 'CURRENT|3|' }, '5|');
    writePushed({ 21: 'CURRENT|3|' }, '5|uid-1');
    rememberSent(5, '21', 'CURRENT|3|');
    clearAnilistSession();
    expect(getAnilistSession()).toBeNull();
    expect(readPushed('5|')).toBeNull();
    expect(readPushed('5|uid-1')).toBeNull();
    expect(readSent(5)).toEqual({});
    expect(localStorage.getItem(ANILIST_PUSHED_KEY)).toBeNull();
    expect(localStorage.getItem(ANILIST_PUSHED_OWNER_KEY)).toBeNull();
  });

  it('pide el viewer con el token en Authorization', async () => {
    fetchMock.mockResolvedValueOnce(viewerReply());
    await expect(fetchAnilistViewer(TOKEN)).resolves.toEqual({ id: 77, name: 'jona' });
    const [request] = requests(fetchMock);
    expect(request.url).toBe('https://graphql.anilist.co');
    expect(request.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(request.query).toContain('Viewer');
  });
});

describe('desiredEntries', () => {
  it('mapea estado, progreso y nota', () => {
    const desired = desiredEntries({
      schedule: {
        Lunes: [malAnime({ currentEp: 5 })],
        Martes: [anilistAnime({ id: 800150001, sourceKey: 'anilist:150001', currentEp: 2, paused: true, userRating: 3 })],
      },
      watchLater: [malAnime({ id: 30, sourceKey: 'mal:30', malId: 30 })],
      watchedList: [
        malAnime({ id: 40, sourceKey: 'mal:40', malId: 40, finished: true, currentEp: 3, episodes: 12, userRating: 4.5 }),
        malAnime({ id: 41, sourceKey: 'mal:41', malId: 41, finished: true, currentEp: 26, episodes: null }),
        malAnime({ id: 50, sourceKey: 'mal:50', malId: 50, finished: false, currentEp: 4, episodes: 24, userRating: 1 }),
      ],
    });

    const view = (key) => {
      const { status, progress, scoreRaw } = desired.get(key);
      return { status, progress, scoreRaw };
    };
    expect(view('21')).toEqual({ status: 'CURRENT', progress: 5, scoreRaw: undefined });
    expect(view('800150001')).toEqual({ status: 'PAUSED', progress: 2, scoreRaw: 60 });
    expect(view('30')).toEqual({ status: 'PLANNING', progress: 0, scoreRaw: undefined });
    expect(view('40')).toEqual({ status: 'COMPLETED', progress: 12, scoreRaw: 90 });
    expect(view('41')).toEqual({ status: 'COMPLETED', progress: 26, scoreRaw: undefined });
    expect(view('50')).toEqual({ status: 'DROPPED', progress: 4, scoreRaw: 20 });
    expect(desired.get('40').signature).toBe('COMPLETED|12|90');
    expect(entrySignature({ status: 'CURRENT', progress: 5 })).toBe('CURRENT|5|');
    expect(desired.size).toBe(6);
  });

  it('saltea las fuentes que no se pueden mapear a AniList', () => {
    const desired = desiredEntries({
      schedule: {
        Lunes: [
          { id: 400123, sourceKey: 'tvmaze:123', malId: null, currentEp: 2 },
          { id: 900000550, sourceKey: 'tmdb:tv:550', malId: null, currentEp: 1 },
          { id: 100045, sourceKey: 'kitsu:45', malId: null, currentEp: 1 },
          { id: 100046, sourceKey: 'kitsu:46', malId: 5114, currentEp: 7 },
        ],
      },
      watchLater: [
        { id: 10000000123, sourceKey: 'itunes:123', malId: null },
        { id: 700041650, sourceKey: 'viki:41650c', malId: null },
      ],
      watchedList: [{ id: 600000010, sourceKey: 'tmdb:movie:10', malId: null, finished: true }],
    });
    expect([...desired.keys()]).toEqual(['100046']);
    expect(desired.get('100046')).toMatchObject({ status: 'CURRENT', progress: 7 });
  });

  it('tolera una biblioteca vacía o mal formada', () => {
    expect(desiredEntries().size).toBe(0);
    expect(desiredEntries({ schedule: { Lunes: null }, watchLater: null, watchedList: undefined }).size).toBe(0);
  });
});

describe('huella de lo enviado', () => {
  it('la línea base no deja nada pendiente y un cambio posterior sí', () => {
    const before = desiredEntries({ schedule: { Lunes: [malAnime({ currentEp: 5 })] }, watchLater: [anilistAnime()] });
    const pushed = baselineOf(before);
    expect(pushed).toEqual({ 21: 'CURRENT|5|', 800150000: 'PLANNING|0|' });
    expect(pendingChanges(before, pushed)).toEqual([]);

    const after = desiredEntries({
      schedule: { Lunes: [malAnime({ currentEp: 6 })] },
      watchLater: [anilistAnime(), malAnime({ id: 30, sourceKey: 'mal:30', malId: 30 })],
    });
    expect(pendingChanges(after, pushed).map((c) => [c.key, c.signature])).toEqual([['21', 'CURRENT|6|'], ['30', 'PLANNING|0|']]);
  });

  it('olvida la huella de lo que se sacó de la biblioteca', () => {
    const desired = desiredEntries({ schedule: { Lunes: [malAnime()] } });
    const pushed = { 21: 'CURRENT|0|', 99: 'PLANNING|0|' };
    expect(prunePushed(pushed, desired)).toEqual({ 21: 'CURRENT|0|' });
    const same = { 21: 'CURRENT|0|' };
    expect(prunePushed(same, desired)).toBe(same);
  });

  it('la huella de otra cuenta o biblioteca no vale', () => {
    expect(readPushed('77|')).toBeNull();
    writePushed({ 21: 'CURRENT|0|' }, '77|');
    expect(readPushed('77|')).toEqual({ 21: 'CURRENT|0|' });
    expect(readPushed('78|')).toBeNull();
    expect(readPushed('77|uid-1')).toBeNull();
  });
});

describe('resolveMediaId', () => {
  it('usa el id de AniList directo, sin red', async () => {
    expect(cachedMediaId(anilistAnime())).toBe(150000);
    await expect(resolveMediaId(anilistAnime())).resolves.toBe(150000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('busca por id de MAL una sola vez y lo cachea', async () => {
    fetchMock.mockResolvedValueOnce(reply({ data: { Media: { id: 21 + 1000 } } }));
    expect(cachedMediaId(malAnime())).toBeUndefined();
    await expect(resolveMediaId(malAnime())).resolves.toBe(1021);
    await expect(resolveMediaId(malAnime())).resolves.toBe(1021);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [request] = requests(fetchMock);
    expect(request.query).toContain('Media(idMal: $id, type: ANIME)');
    expect(request.variables).toEqual({ id: 21 });
    expect(request.headers.Authorization).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(ANILIST_IDS_KEY))).toEqual([[21, 1021]]);
  });

  it('devuelve null si la fuente no se mapea o AniList no tiene la obra', async () => {
    await expect(resolveMediaId({ id: 400123, sourceKey: 'tvmaze:123' })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(reply({ errors: [{ message: 'Not Found.', status: 404 }], data: null }, { status: 404 }));
    await expect(resolveMediaId(malAnime())).resolves.toBeNull();
    expect(localStorage.getItem(ANILIST_IDS_KEY)).toBeNull();
  });

  it('la cache tiene tope', async () => {
    localStorage.setItem(ANILIST_IDS_KEY, JSON.stringify(Array.from({ length: 2000 }, (_, i) => [i + 1000, i + 5000])));
    fetchMock.mockResolvedValueOnce(reply({ data: { Media: { id: 4321 } } }));
    await resolveMediaId(malAnime());
    const cache = JSON.parse(localStorage.getItem(ANILIST_IDS_KEY));
    expect(cache).toHaveLength(2000);
    expect(cache.at(-1)).toEqual([21, 4321]);
    expect(cache[0]).toEqual([1001, 5001]);
  });
});

describe('saveMediaListEntry', () => {
  it('manda la mutación con el token y sin scoreRaw si no hay nota', async () => {
    fetchMock.mockImplementation(async () => saved());
    await saveMediaListEntry(TOKEN, { mediaId: 1021, status: 'CURRENT', progress: 6, scoreRaw: undefined });
    await saveMediaListEntry(TOKEN, { mediaId: 1021, status: 'COMPLETED', progress: 12, scoreRaw: 80 });

    const [first, second] = requests(fetchMock);
    expect(first.query).toContain('SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, scoreRaw: $scoreRaw)');
    expect(first.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(first.variables).toEqual({ mediaId: 1021, status: 'CURRENT', progress: 6 });
    expect(second.variables).toEqual({ mediaId: 1021, status: 'COMPLETED', progress: 12, scoreRaw: 80 });
  });

  it('401 o token inválido → AnilistAuthError, sin el token en el mensaje', async () => {
    fetchMock.mockResolvedValueOnce(reply({ errors: [{ message: 'Unauthorized.', status: 401 }] }, { status: 401 }));
    const err = await saveMediaListEntry(TOKEN, { mediaId: 1, status: 'CURRENT', progress: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(AnilistAuthError);
    expect(err.message).not.toContain(TOKEN);

    fetchMock.mockResolvedValueOnce(reply({ errors: [{ message: 'Invalid token', status: 400 }], data: null }, { status: 400 }));
    await expect(saveMediaListEntry(TOKEN, { mediaId: 1, status: 'CURRENT', progress: 1 })).rejects.toBeInstanceOf(AnilistAuthError);
  });

  it('429 → AnilistRateLimitError con la espera de Retry-After', async () => {
    fetchMock.mockResolvedValueOnce(reply({ errors: [{ message: 'Too Many Requests.', status: 429 }] }, { status: 429, headers: { 'Retry-After': '7' } }));
    const err = await saveMediaListEntry(TOKEN, { mediaId: 1, status: 'CURRENT', progress: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(AnilistRateLimitError);
    expect(err.retryAfterMs).toBe(7000);

    fetchMock.mockResolvedValueOnce(reply({}, { status: 429 }));
    const noHeader = await saveMediaListEntry(TOKEN, { mediaId: 1, status: 'CURRENT', progress: 1 }).catch((e) => e);
    expect(noHeader.retryAfterMs).toBe(60000);
  });

  it('errores de GraphQL → AnilistRequestError definitivo; un 500 no lo es', async () => {
    fetchMock.mockResolvedValueOnce(reply({ errors: [{ message: 'validation', status: 400 }], data: null }));
    const rejected = await saveMediaListEntry(TOKEN, { mediaId: 1, status: 'CURRENT', progress: 1 }).catch((e) => e);
    expect(rejected).toBeInstanceOf(AnilistRequestError);
    expect(rejected.permanent).toBe(true);

    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 500 }));
    const down = await saveMediaListEntry(TOKEN, { mediaId: 1, status: 'CURRENT', progress: 1 }).catch((e) => e);
    expect(down).toBeInstanceOf(AnilistRequestError);
    expect(down.permanent).toBe(false);
  });
});

describe('anilistRequest: pedido colgado', () => {
  it('se corta a los 20 s con un error reintentable', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(hangUntilAborted);
    const result = saveMediaListEntry(TOKEN, { mediaId: 1, status: 'CURRENT', progress: 1 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(20000);
    const err = await result;
    expect(err).toBeInstanceOf(AnilistRequestError);
    expect(err.permanent).toBe(false);
  });

  it('el abort de quien llama sale como AbortError', async () => {
    fetchMock.mockImplementation(hangUntilAborted);
    const controller = new AbortController();
    const result = saveMediaListEntry(TOKEN, { mediaId: 1, status: 'CURRENT', progress: 1 }, { signal: controller.signal }).catch((e) => e);
    controller.abort();
    expect((await result).name).toBe('AbortError');
  });
});

describe('cola y envío', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('deja al menos ~2,1 s entre pedidos y corre en orden', async () => {
    const queue = createRequestQueue();
    const starts = [];
    const task = (name) => () => { starts.push([name, Date.now()]); return Promise.resolve(name); };
    const t0 = Date.now();
    const all = Promise.all([queue.run(task('a')), queue.run(task('b')), queue.run(task('c'))]);
    await vi.advanceTimersByTimeAsync(ANILIST_MIN_INTERVAL_MS * 2);
    await expect(all).resolves.toEqual(['a', 'b', 'c']);
    expect(starts).toEqual([['a', t0], ['b', t0 + ANILIST_MIN_INTERVAL_MS], ['c', t0 + ANILIST_MIN_INTERVAL_MS * 2]]);
  });

  it('reintenta un 429 después de la espera indicada', async () => {
    const queue = createRequestQueue();
    const task = vi.fn()
      .mockRejectedValueOnce(new AnilistRateLimitError(5000))
      .mockResolvedValueOnce('ok');
    const result = queue.run(task);
    await vi.advanceTimersByTimeAsync(4999);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe('ok');
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('se rinde si el 429 no cede y se puede abortar la espera', async () => {
    const queue = createRequestQueue({ maxRetries: 1 });
    const stubborn = queue.run(() => Promise.reject(new AnilistRateLimitError(1000))).catch((e) => e);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await stubborn).toBeInstanceOf(AnilistRateLimitError);

    const controller = new AbortController();
    const task = vi.fn().mockResolvedValue('never');
    const waiting = queue.run(task, { signal: controller.signal }).catch((e) => e);
    controller.abort();
    await vi.advanceTimersByTimeAsync(ANILIST_MIN_INTERVAL_MS);
    expect((await waiting).name).toBe('AbortError');
    expect(task).not.toHaveBeenCalled();
  });

  it('pushChanges corta ante un error de sesión y no manda lo que sigue', async () => {
    const desired = desiredEntries({ schedule: { Lunes: [anilistAnime({ currentEp: 1 }), anilistAnime({ id: 800150001, sourceKey: 'anilist:150001', currentEp: 2 })] } });
    fetchMock.mockResolvedValueOnce(reply({ errors: [{ message: 'Invalid token', status: 400 }] }, { status: 400 }));
    const onPushed = vi.fn();
    const result = pushChanges(TOKEN, pendingChanges(desired, {}), { queue: createRequestQueue(), onPushed }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(ANILIST_MIN_INTERVAL_MS * 3);
    expect(await result).toBeInstanceOf(AnilistAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onPushed).not.toHaveBeenCalled();
  });

  it('pushChanges sigue con los demás si AniList rechaza uno, y resuelve el id de MAL', async () => {
    const desired = desiredEntries({
      schedule: { Lunes: [anilistAnime({ currentEp: 1 }), malAnime({ currentEp: 9, userRating: 5 })] },
    });
    fetchMock
      .mockResolvedValueOnce(reply({ errors: [{ message: 'nope', status: 400 }], data: null }, { status: 400 }))
      .mockResolvedValueOnce(reply({ data: { Media: { id: 1021 } } }))
      .mockResolvedValueOnce(saved(1021));
    const onPushed = vi.fn();
    const onRejected = vi.fn();
    const result = pushChanges(TOKEN, pendingChanges(desired, {}), { queue: createRequestQueue(), onPushed, onRejected });
    await vi.advanceTimersByTimeAsync(ANILIST_MIN_INTERVAL_MS * 3);

    await expect(result).resolves.toEqual({ sent: 1, rejected: 1 });
    expect(onRejected).toHaveBeenCalledTimes(1);
    expect(onRejected.mock.calls[0][0].key).toBe('800150000');
    expect(onPushed).toHaveBeenCalledTimes(1);
    expect(onPushed.mock.calls[0][1]).toBe(1021);
    expect(mutations(fetchMock).at(-1).variables).toEqual({ mediaId: 1021, status: 'CURRENT', progress: 9, scoreRaw: 100 });
  });
});

describe('useAnilistSync', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  const library = (currentEp = 5, extra = {}) => ({
    schedule: { Lunes: [anilistAnime({ currentEp, ...extra })] },
    watchLater: [malAnime({ id: 30, sourceKey: 'mal:30', malId: 30 })],
    watchedList: [],
  });
  const flush = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  // Debounce + lo que tarde la cola en dejar pasar los pedidos.
  const settle = () => flush(ANILIST_SYNC_DEBOUNCE_MS + ANILIST_MIN_INTERVAL_MS * 3);
  const mount = async (initial = library()) => {
    const hook = renderHook((props) => useAnilistSync(props), { initialProps: initial });
    await flush();
    return hook;
  };

  it('sin sesión: disponible pero desconectado, y no pide nada', async () => {
    const { result, rerender } = await mount();
    expect(result.current).toMatchObject({ available: true, connected: false, viewerName: '', status: 'idle', pendingCount: 0, lastSyncedAt: null, lastError: '' });
    rerender(library(6));
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(ANILIST_PUSHED_KEY)).toBeNull();
  });

  it('al conectar toma la línea base y no manda nada', async () => {
    connect({ viewer: null });
    fetchMock.mockResolvedValueOnce(viewerReply());
    const { result } = await mount();
    await settle();

    expect(result.current).toMatchObject({ connected: true, viewerName: 'jona', status: 'idle', pendingCount: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1); // solo el Viewer
    expect(mutations(fetchMock)).toEqual([]);
    expect(readPushed('77|')).toEqual({ 800150000: 'CURRENT|5|', 30: 'PLANNING|0|' });
    expect(getAnilistSession().viewer).toEqual({ id: 77, name: 'jona' });
  });

  it('un +1 posterior manda exactamente una mutación con las variables correctas', async () => {
    connect();
    fetchMock.mockImplementation(async () => saved(150000));
    const { result, rerender } = await mount();
    expect(fetchMock).not.toHaveBeenCalled();

    rerender(library(6));
    await flush(ANILIST_SYNC_DEBOUNCE_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled(); // todavía en el debounce
    await settle();

    expect(mutations(fetchMock)).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [request] = mutations(fetchMock);
    expect(request.variables).toEqual({ mediaId: 150000, status: 'CURRENT', progress: 6 });
    expect(request.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(result.current).toMatchObject({ status: 'idle', pendingCount: 0, lastError: '' });
    expect(result.current.lastSyncedAt).toBeTypeOf('number');
    expect(readPushed('77|')[800150000]).toBe('CURRENT|6|');

    // Sin cambios nuevos no se vuelve a mandar.
    rerender(library(6));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('varios cambios seguidos se juntan en un solo envío', async () => {
    connect();
    fetchMock.mockImplementation(async () => saved(150000));
    const { rerender } = await mount();
    rerender(library(6));
    await flush(1000);
    rerender(library(7));
    await flush(1000);
    rerender(library(8, { userRating: 4 }));
    await settle();

    expect(mutations(fetchMock)).toHaveLength(1);
    expect(mutations(fetchMock)[0].variables).toEqual({ mediaId: 150000, status: 'CURRENT', progress: 8, scoreRaw: 80 });
  });

  it('reintenta un 429 y termina al día', async () => {
    connect();
    fetchMock
      .mockResolvedValueOnce(reply({}, { status: 429, headers: { 'Retry-After': '10' } }))
      .mockResolvedValueOnce(saved(150000));
    const { result, rerender } = await mount();
    rerender(library(6));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ status: 'syncing', pendingCount: 1 });

    await flush(10000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mutations(fetchMock)[1].variables).toEqual({ mediaId: 150000, status: 'CURRENT', progress: 6 });
    expect(result.current).toMatchObject({ status: 'idle', pendingCount: 0 });
  });

  it('401 → expired, corta y no reintenta', async () => {
    connect();
    fetchMock.mockResolvedValue(reply({ errors: [{ message: 'Unauthorized.', status: 401 }] }, { status: 401 }));
    const two = () => ({
      ...library(6),
      watchLater: [anilistAnime({ id: 800150009, sourceKey: 'anilist:150009' })],
    });
    const { result, rerender } = await mount();
    rerender(two());
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1); // el segundo cambio no se intenta
    expect(result.current).toMatchObject({ connected: true, viewerName: 'jona', status: 'expired' });
    expect(result.current.lastError).not.toBe('');
    expect(getAnilistSession()).toBeNull();

    rerender(library(7));
    await flush(ANILIST_SYNC_RETRY_MS * 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('expired');
  });

  it('una sesión ya vencida arranca en expired sin tocar la red', async () => {
    connect({ expiresAt: Date.now() - 1 });
    const { result, rerender } = await mount();
    expect(result.current).toMatchObject({ connected: true, viewerName: 'jona', status: 'expired' });
    rerender(library(6));
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin conexión espera al evento online', async () => {
    connect();
    fetchMock.mockImplementation(async () => saved(150000));
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result, rerender } = await mount();
    rerender(library(6));
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ status: 'idle', pendingCount: 1 });

    onLine.mockReturnValue(true);
    act(() => { window.dispatchEvent(new Event('online')); });
    await settle();
    expect(mutations(fetchMock)).toHaveLength(1);
    expect(result.current).toMatchObject({ status: 'idle', pendingCount: 0 });
  });

  it('un error de red deja status error y se reintenta solo', async () => {
    connect();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(saved(150000));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, rerender } = await mount();
    rerender(library(6));
    await settle();
    expect(result.current).toMatchObject({ status: 'error', pendingCount: 1 });
    expect(result.current.lastError).not.toBe('');

    await flush(ANILIST_SYNC_RETRY_MS + ANILIST_MIN_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ status: 'idle', pendingCount: 0, lastError: '' });
  });

  it('no compara nada hasta que la biblioteca está lista, y otra biblioteca vuelve a la línea base', async () => {
    connect();
    fetchMock.mockImplementation(async () => saved(150000));
    const empty = { schedule: {}, watchLater: [], watchedList: [] };
    const { rerender } = await mount({ ...empty, ready: false, scope: 'uid-1' });
    await settle();
    expect(localStorage.getItem(ANILIST_PUSHED_KEY)).toBeNull();

    // Llega la biblioteca de la nube: es la línea base, no cientos de cambios.
    rerender({ ...library(5), ready: true, scope: 'uid-1' });
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readPushed('77|uid-1')).toEqual({ 800150000: 'CURRENT|5|', 30: 'PLANNING|0|' });

    // Cambia de cuenta: la biblioteca de la otra tampoco se manda.
    rerender({ schedule: { Lunes: [anilistAnime({ currentEp: 11 })] }, watchLater: [], watchedList: [], ready: true, scope: 'uid-2' });
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readPushed('77|uid-2')).toEqual({ 800150000: 'CURRENT|11|' });
  });

  // El caso real: la huella era una sola con una marca de dueño. Otro contexto
  // con otro scope (otra pestaña, o la sesión de Google sin resolver) la pisaba,
  // cada pasada volvía a tomar la línea base y nunca se mandaba nada.
  it('otro scope tomando su línea base no se traga los cambios de este', async () => {
    connect();
    fetchMock.mockImplementation(async () => saved(150000));
    const { rerender } = await mount({ ...library(5), ready: true, scope: 'uid-1' });
    await settle();
    expect(readPushed('77|uid-1')).toEqual({ 800150000: 'CURRENT|5|', 30: 'PLANNING|0|' });

    // Otro contexto, como invitado, ve la biblioteca ya cambiada y toma SU base.
    writePushed({ 800150000: 'CURRENT|6|', 30: 'PLANNING|0|' }, '77|');

    rerender({ ...library(6), ready: true, scope: 'uid-1' });
    await settle();
    expect(mutations(fetchMock)).toHaveLength(1);
    expect(mutations(fetchMock)[0].variables).toMatchObject({ mediaId: 150000, status: 'CURRENT', progress: 6 });
    expect(readPushed('77|uid-1')[800150000]).toBe('CURRENT|6|');
    expect(readPushed('77|')).toEqual({ 800150000: 'CURRENT|6|', 30: 'PLANNING|0|' }); // intacta
  });

  it('volver a un scope ya visto no retoma la línea base', async () => {
    connect();
    fetchMock.mockImplementation(async () => saved(150000));
    const { rerender } = await mount({ ...library(5), ready: true, scope: 'uid-1' });
    await settle();
    rerender({ ...library(5), ready: true, scope: '' }); // p. ej. la sesión de Google tarda en resolverse
    await settle();
    rerender({ ...library(6), ready: true, scope: 'uid-1' });
    await settle();
    expect(mutations(fetchMock)).toHaveLength(1);
    expect(mutations(fetchMock)[0].variables.progress).toBe(6);
  });

  it('no repite un cambio que otro contexto ya mandó tal cual', async () => {
    connect();
    fetchMock.mockImplementation(async () => saved(150000));
    const { rerender } = await mount();
    await settle();
    rememberSent(77, '800150000', 'CURRENT|6|'); // lo mandó otra pestaña
    rerender(library(6));
    await settle();
    expect(mutations(fetchMock)).toEqual([]);
    expect(readPushed('77|')[800150000]).toBe('CURRENT|6|');
  });

  it('anota lo que de verdad llegó a AniList', async () => {
    connect();
    fetchMock.mockImplementation(async () => saved(150000));
    const { rerender } = await mount();
    await settle();
    expect(readSent(77)).toEqual({}); // la línea base no manda nada
    rerender(library(6));
    await settle();
    expect(readSent(77)).toEqual({ 800150000: 'CURRENT|6|' });
  });

  it('adopta la huella del formato viejo si es de este dueño, y descarta la de otro', async () => {
    localStorage.setItem(ANILIST_PUSHED_KEY, JSON.stringify({ 800150000: 'CURRENT|5|' }));
    localStorage.setItem(ANILIST_PUSHED_OWNER_KEY, '77|uid-1');
    expect(readPushed('77|uid-1')).toEqual({ 800150000: 'CURRENT|5|' });
    expect(localStorage.getItem(ANILIST_PUSHED_KEY)).toBeNull();
    expect(localStorage.getItem(ANILIST_PUSHED_OWNER_KEY)).toBeNull();

    localStorage.setItem(ANILIST_PUSHED_KEY, JSON.stringify({ 800150000: 'CURRENT|9|' }));
    localStorage.setItem(ANILIST_PUSHED_OWNER_KEY, '77|');
    expect(readPushed('77|uid-2')).toBeNull();
    expect(localStorage.getItem(ANILIST_PUSHED_KEY)).toBeNull();
  });

  it('recuerda la huella de pocos dueños, sin perder la que se acaba de escribir', () => {
    for (let i = 1; i <= 6; i++) writePushed({ 1: `CURRENT|${i}|` }, `77|uid-${i}`);
    const kept = [1, 2, 3, 4, 5, 6].filter((i) => readPushed(`77|uid-${i}`));
    expect(kept).toHaveLength(4);
    expect(kept).toContain(6);
  });

  it('corre cada pasada dentro del candado compartido entre pestañas', async () => {
    const request = vi.fn((name, options, task) => task());
    vi.stubGlobal('navigator', { ...globalThis.navigator, onLine: true, locks: { request } });
    try {
      connect();
      fetchMock.mockImplementation(async () => saved(150000));
      const { rerender } = await mount();
      await settle();
      rerender(library(6));
      await settle();
      expect(request).toHaveBeenCalled();
      expect(request.mock.calls[0][0]).toBe('anitracker-anilist-sync');
      expect(request.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
      expect(mutations(fetchMock)).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sacar un anime no borra nada en AniList', async () => {
    connect();
    fetchMock.mockImplementation(async () => saved(150000));
    const { rerender } = await mount();
    rerender({ schedule: {}, watchLater: [], watchedList: [] });
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readPushed('77|')).toEqual({});
  });

  it('desconectar aborta lo que está en vuelo y borra sesión y huella', async () => {
    connect();
    fetchMock.mockImplementation(hangUntilAborted);
    const { result, rerender } = await mount();
    rerender(library(6));
    await settle();
    expect(result.current.status).toBe('syncing');
    const { signal } = fetchMock.mock.calls[0][1];

    act(() => { result.current.disconnect(); });
    expect(signal.aborted).toBe(true);
    expect(result.current).toMatchObject({ connected: false, viewerName: '', status: 'idle', pendingCount: 0 });
    expect(getAnilistSession()).toBeNull();
    expect(localStorage.getItem(ANILIST_PUSHED_KEY)).toBeNull();

    rerender(library(7));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('al desmontar aborta el pedido en vuelo', async () => {
    connect();
    fetchMock.mockImplementation(hangUntilAborted);
    const { rerender, unmount } = await mount();
    rerender(library(6));
    await settle();
    const { signal } = fetchMock.mock.calls[0][1];
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('devuelve el mismo objeto mientras no cambie nada que se muestre', async () => {
    connect();
    const { result, rerender } = await mount();
    const first = result.current;
    rerender(library(5));
    rerender(library(5));
    await settle();
    expect(result.current).toBe(first);
    expect(result.current.connect).toBe(first.connect);
    expect(result.current.syncNow).toBe(first.syncNow);
  });

  it('syncNow manda lo pendiente sin esperar el debounce', async () => {
    connect();
    fetchMock.mockImplementation(async () => saved(150000));
    const { result, rerender } = await mount();
    rerender(library(6));
    act(() => { result.current.syncNow(); });
    // Menos que el debounce: solo el margen que pueda pedir la cola.
    await flush(ANILIST_MIN_INTERVAL_MS + 100);
    expect(mutations(fetchMock)).toHaveLength(1);
  });
});

describe('sin VITE_ANILIST_CLIENT_ID', () => {
  afterEach(() => {
    vi.stubEnv('VITE_ANILIST_CLIENT_ID', '4242');
    vi.resetModules();
  });

  it('la función queda apagada', async () => {
    vi.stubEnv('VITE_ANILIST_CLIENT_ID', '');
    vi.resetModules();
    const auth = await import('../services/anilistAuth');
    const { useAnilistSync: useDisabled } = await import('../hooks/useAnilistSync');
    expect(auth.ANILIST_SYNC_ENABLED).toBe(false);
    expect(auth.anilistLoginUrl()).toBe('');

    connect();
    vi.useFakeTimers();
    const { result } = renderHook(() => useDisabled({ schedule: { Lunes: [anilistAnime()] }, watchLater: [], watchedList: [] }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(result.current).toMatchObject({ available: false, connected: false, status: 'idle' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
