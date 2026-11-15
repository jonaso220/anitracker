import { DEFAULT_TAB, hashForTab } from '../router';
import { ANILIST_URL } from './anilistService';

// Sesión de AniList para "mandar mi progreso a AniList".
//
// La app es estática (sin backend), así que se usa el *implicit grant* de
// AniList: el usuario autoriza en anilist.co y vuelve a la app con el token en
// el hash (`#access_token=…`). No hay client secret ni refresh token: el token
// dura un año y, cuando vence, el usuario vuelve a conectar.
//
// La función es opcional: solo existe si está VITE_ANILIST_CLIENT_ID (ver
// .env.example), igual que TMDB con su API key. El client id no es secreto.
//
// El token nunca se escribe en logs ni en mensajes de error.

const CLIENT_ID = String(import.meta.env?.VITE_ANILIST_CLIENT_ID || '').trim();
export const ANILIST_SYNC_ENABLED = Boolean(CLIENT_ID);

const AUTHORIZE_URL = 'https://anilist.co/api/v2/oauth/authorize';

/** `{ token, expiresAt, viewer? }` de la cuenta conectada. */
export const ANILIST_AUTH_KEY = 'anitracker-anilist-auth';
/**
 * Prefijo de la huella de lo ya enviado: una clave por dueño,
 * `anitracker-anilist-pushed:<viewerId>|<scope>` → `{ [animeId]: 'STATUS|progreso|scoreRaw' }`
 * (ver anilistSync.js). Sola, sin sufijo, es la clave vieja de una única huella.
 */
export const ANILIST_PUSHED_KEY = 'anitracker-anilist-pushed';
/** Clave vieja: de quién era la única huella. Solo se lee para migrarla. */
export const ANILIST_PUSHED_OWNER_KEY = 'anitracker-anilist-pushed-owner';
/** Prefijo de lo que de verdad llegó a AniList, por cuenta: `anitracker-anilist-sent:<viewerId>`. */
export const ANILIST_SENT_KEY = 'anitracker-anilist-sent';
/** Prefijo de "qué fuentes cubría la huella" por dueño: `anitracker-anilist-sources:<owner>`. */
export const ANILIST_SOURCES_KEY = 'anitracker-anilist-sources';
/** Marca de "el usuario tocó Conectar": sin ella no se acepta un token del hash. */
export const ANILIST_LOGIN_PENDING_KEY = 'anitracker-anilist-login-pending';

// Cuánto vale la marca de "Conectar": alcanza para iniciar sesión en AniList y
// aprobar, y no deja la puerta abierta indefinidamente.
const LOGIN_PENDING_TTL_MS = 30 * 60 * 1000;
// AniList emite tokens de un año; se usa si `expires_in` no viene o es inválido.
const DEFAULT_EXPIRES_IN_SEC = 365 * 24 * 3600;

const readJson = (key) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // sin cuota o sin localStorage: la sesión no se guarda
  }
};

const removeKeys = (...keys) => {
  try {
    for (const key of keys) localStorage.removeItem(key);
  } catch { /* best-effort */ }
};

/** URL de autorización de AniList (implicit grant). `''` si la función está apagada. */
export function anilistLoginUrl() {
  if (!ANILIST_SYNC_ENABLED) return '';
  return `${AUTHORIZE_URL}?client_id=${encodeURIComponent(CLIENT_ID)}&response_type=token`;
}

/**
 * Deja la marca de "el usuario pidió conectar" y navega a AniList. La marca es
 * lo que después habilita a `captureAnilistToken`: el implicit grant de AniList
 * no tiene `state`, y sin esto un enlace armado por otra persona
 * (`…/#access_token=<su token>`) conectaría la app a la cuenta de ella.
 */
export function beginAnilistLogin() {
  const url = anilistLoginUrl();
  if (!url) return false;
  try {
    localStorage.setItem(ANILIST_LOGIN_PENDING_KEY, String(Date.now()));
  } catch {
    return false; // sin localStorage tampoco se podría guardar el token
  }
  window.location.assign(url);
  return true;
}

function consumeLoginPending() {
  try {
    const at = Number(localStorage.getItem(ANILIST_LOGIN_PENDING_KEY));
    localStorage.removeItem(ANILIST_LOGIN_PENDING_KEY);
    const age = Date.now() - at;
    return at > 0 && age >= 0 && age <= LOGIN_PENDING_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Si el hash es la vuelta de AniList (`#access_token=…&token_type=Bearer&expires_in=…`),
 * guarda `{ token, expiresAt }`, saca el token de la URL (queda `#/semana`) y
 * devuelve true. Con cualquier otro hash (las rutas de la app, `#/vistas`)
 * devuelve false y no toca nada.
 *
 * Hay que llamarla antes de renderizar React (y antes de cualquier reporte de
 * errores): el router canonicaliza hashes desconocidos y el token se perdería.
 *
 * El token se saca de la URL siempre que aparezca, pero solo se guarda si el
 * usuario había tocado "Conectar" en este navegador (ver `beginAnilistLogin`).
 */
export function captureAnilistToken(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#/, '');
  // Las rutas de la app empiezan con `/` (`#/vistas`): esas no se miran nunca.
  if (!raw || raw.startsWith('/') || !raw.includes('access_token=')) return false;
  const params = new URLSearchParams(raw);
  const token = (params.get('access_token') || '').trim();
  if (!token) return false;

  // Antes que nada: que el token no quede en la barra de direcciones ni en el
  // historial, pase lo que pase después.
  try {
    const { pathname, search } = window.location;
    window.history.replaceState(null, '', `${pathname}${search}${hashForTab(DEFAULT_TAB)}`);
  } catch { /* best-effort */ }

  const requested = consumeLoginPending();
  const tokenType = (params.get('token_type') || 'Bearer').toLowerCase();
  if (!ANILIST_SYNC_ENABLED || !requested || tokenType !== 'bearer') return false;

  const expiresIn = Number(params.get('expires_in'));
  const seconds = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : DEFAULT_EXPIRES_IN_SEC;
  // Sin `viewer`: puede ser otra cuenta que la anterior. El hook lo vuelve a
  // pedir y, si cambió, la huella de lo enviado se descarta (ver anilistSync.js).
  return writeJson(ANILIST_AUTH_KEY, { token, expiresAt: Date.now() + seconds * 1000 });
}

const viewerOf = (value) => {
  const id = Number(value?.id);
  if (!(id > 0)) return null;
  return { id, name: typeof value.name === 'string' ? value.name : '' };
};

/**
 * Lo guardado tal cual, aunque el token ya haya vencido (sirve para distinguir
 * "nunca conectó" de "se le venció la sesión"). Para usar el token, ver
 * `getAnilistSession`.
 */
export function readAnilistAuth() {
  const stored = readJson(ANILIST_AUTH_KEY);
  if (!stored || typeof stored.token !== 'string' || !stored.token) return null;
  const auth = { token: stored.token, expiresAt: Number(stored.expiresAt) || 0 };
  const viewer = viewerOf(stored.viewer);
  if (viewer) auth.viewer = viewer;
  return auth;
}

/** Sesión vigente `{ token, expiresAt, viewer? }`, o null si no hay o venció. */
export function getAnilistSession() {
  const auth = readAnilistAuth();
  return auth && auth.expiresAt > Date.now() ? auth : null;
}

/** Guarda `{ id, name }` de la cuenta conectada junto a la sesión. */
export function saveAnilistViewer(viewer) {
  const auth = readAnilistAuth();
  const clean = viewerOf(viewer);
  if (!auth || !clean) return false;
  return writeJson(ANILIST_AUTH_KEY, { ...auth, viewer: clean });
}

/**
 * Marca la sesión como vencida (AniList rechazó el token) sin olvidar de quién
 * era: la UI puede seguir mostrando el nombre y pedir que vuelva a conectar.
 */
export function expireAnilistSession() {
  const auth = readAnilistAuth();
  if (!auth) return;
  writeJson(ANILIST_AUTH_KEY, { ...auth, expiresAt: 0 });
}

/** Desconecta: borra la sesión y la huella de lo ya enviado. */
export function clearAnilistSession() {
  removeKeys(ANILIST_AUTH_KEY, ANILIST_PUSHED_KEY, ANILIST_PUSHED_OWNER_KEY, ANILIST_LOGIN_PENDING_KEY);
  // Las huellas van una por dueño y lo enviado una por cuenta: todas afuera.
  try {
    const stale = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && [ANILIST_PUSHED_KEY, ANILIST_SENT_KEY, ANILIST_SOURCES_KEY].some((prefix) => key.startsWith(`${prefix}:`))) stale.push(key);
    }
    removeKeys(...stale);
  } catch { /* best-effort */ }
}

// --- Errores tipados (los comparten el viewer y las mutaciones) ---

/** Token vencido, revocado o inválido: hay que volver a conectar. */
export class AnilistAuthError extends Error {
  constructor(message = 'AniList: invalid or expired token') {
    super(message);
    this.name = 'AnilistAuthError';
  }
}

/** HTTP 429. `retryAfterMs` es cuánto pidió esperar AniList. */
export class AnilistRateLimitError extends Error {
  constructor(retryAfterMs) {
    super('AniList: rate limited');
    this.name = 'AnilistRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Cualquier otro rechazo. `permanent` = reintentar no lo va a arreglar (AniList
 * entendió el pedido y lo rechazó: 400/404 o `errors` de GraphQL); un 5xx o un
 * cuerpo ilegible no lo es.
 */
export class AnilistRequestError extends Error {
  constructor(message, { status = 0, permanent = false } = {}) {
    super(message);
    this.name = 'AnilistRequestError';
    this.status = status;
    this.permanent = permanent;
  }
}

// Si AniList no dice cuánto esperar (o el navegador no deja leer el header),
// un minuto: es la ventana de su límite.
const DEFAULT_RETRY_AFTER_MS = 60 * 1000;
const MAX_RETRY_AFTER_MS = 10 * 60 * 1000;

function retryAfterMs(res) {
  const header = res.headers?.get?.('Retry-After');
  const seconds = Number(header);
  if (header != null && header !== '' && Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_AFTER_MS, Math.max(1000, seconds * 1000));
  }
  return DEFAULT_RETRY_AFTER_MS;
}

const REQUEST_TIMEOUT_MS = 20 * 1000;

const AUTH_MESSAGE = /invalid token|unauthori[sz]ed|unauthenticated|token (has )?expired/i;

/**
 * POST a la API GraphQL de AniList, con token opcional. Devuelve `data`.
 * Tira `AnilistAuthError` (401 o token inválido), `AnilistRateLimitError`
 * (429) o `AnilistRequestError` (HTTP de error o `errors` de GraphQL). Un
 * error de red sale tal cual (`TypeError`) y un abort como `AbortError`.
 */
export async function anilistRequest(query, variables, { token, signal } = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  // Un pedido colgado trabaría la cola para siempre: se corta a los 20 s. El
  // abort de quien llama se encadena al mismo controller.
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  let res;
  let body = null;
  try {
    res = await fetch(ANILIST_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (res.status !== 429) {
      try {
        body = await res.json();
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
      }
    }
  } catch (err) {
    if (timedOut) throw new AnilistRequestError('AniList: request timed out');
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  if (res.status === 429) throw new AnilistRateLimitError(retryAfterMs(res));
  const errors = Array.isArray(body?.errors) ? body.errors : [];
  const first = errors[0];
  const message = typeof first?.message === 'string' ? first.message : '';

  // AniList contesta un token inválido con 400 + "Invalid token", no siempre con 401.
  if (res.status === 401 || errors.some((e) => Number(e?.status) === 401 || AUTH_MESSAGE.test(e?.message || ''))) {
    throw new AnilistAuthError();
  }
  if (errors.some((e) => Number(e?.status) === 429)) throw new AnilistRateLimitError(DEFAULT_RETRY_AFTER_MS);
  if (!res.ok) {
    throw new AnilistRequestError(message || `AniList HTTP ${res.status}`, {
      status: res.status,
      permanent: res.status >= 400 && res.status < 500 && res.status !== 408,
    });
  }
  if (errors.length) throw new AnilistRequestError(message || 'AniList GraphQL error', { status: res.status, permanent: true });
  if (!body || typeof body !== 'object') throw new AnilistRequestError('AniList: unreadable response', { status: res.status });
  return body.data ?? null;
}

/** `{ id, name }` de la cuenta dueña del token. */
export async function fetchAnilistViewer(token, { signal } = {}) {
  const data = await anilistRequest('query { Viewer { id name } }', undefined, { token, signal });
  const viewer = viewerOf(data?.Viewer);
  if (!viewer) throw new AnilistRequestError('AniList: viewer missing in response');
  return viewer;
}
