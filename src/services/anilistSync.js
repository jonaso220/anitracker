import { anilistIdsOf } from './anilistService';
import { fetchKitsuMappings } from './kitsuService';
import {
  ANILIST_PUSHED_KEY,
  ANILIST_PUSHED_OWNER_KEY,
  ANILIST_SENT_KEY,
  ANILIST_SOURCES_KEY,
  AnilistAuthError,
  AnilistRateLimitError,
  AnilistRequestError,
  anilistRequest,
} from './anilistAuth';

// Núcleo de "mandar mi progreso a AniList": qué debería decir AniList de cada
// anime de la biblioteca, qué cambió desde lo último que se mandó, y el envío
// de a uno respetando el límite de la API.
//
// Reglas que no son obvias:
// - **Línea base**: al conectar no se manda nada. Se anota el estado actual
//   como "ya enviado" y solo viaja lo que cambie después (mandar la biblioteca
//   entera pisaría la lista de AniList y chocaría con el límite de pedidos).
// - **Nunca se borra en AniList**: sacar un anime de la app solo olvida su
//   huella.
// - Solo se manda lo que se puede ubicar en AniList: lo que tiene id de AniList
//   o de MAL, y lo de Kitsu a través de sus equivalencias (`fetchKitsuMappings`).
//   TVMaze, TMDB, iTunes y Viki se saltean en silencio.

export { AnilistAuthError, AnilistRateLimitError, AnilistRequestError };

/** Cache `[[malId, anilistId], …]` (lo más nuevo al final) de ids ya resueltos. */
export const ANILIST_IDS_KEY = 'anitracker-anilist-ids';
const ANILIST_IDS_MAX = 2000;

/** AniList permite 30 pedidos por minuto: uno cada 2,1 s deja margen. */
export const ANILIST_MIN_INTERVAL_MS = 2100;

// --- Estado deseado ---------------------------------------------------------

const toProgress = (value) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Estrellas (0–5, 0 = sin nota) → puntaje crudo de AniList (0–100).
const toScoreRaw = (userRating) => {
  const stars = Number(userRating);
  if (!(stars > 0)) return undefined;
  return Math.min(100, Math.max(1, Math.round(stars * 20)));
};

/** Huella `'STATUS|progreso|scoreRaw'` de una entrada (scoreRaw vacío si no hay nota). */
export const entrySignature = ({ status, progress, scoreRaw }) => `${status}|${progress}|${scoreRaw ?? ''}`;

/**
 * Lo que AniList debería tener de cada anime de la biblioteca.
 *
 * Devuelve un `Map` con clave `String(anime.id)` → `{ key, anime, status,
 * progress, scoreRaw, signature }`. Semana → `CURRENT` (`PAUSED` si está en
 * pausa), Después → `PLANNING`, Vistas → `COMPLETED` si `finished`, si no
 * `DROPPED`. Si un anime aparece más de una vez gana la primera (semana, vistas,
 * después). Los que no se pueden mapear a AniList no entran.
 */
export function desiredEntries({ schedule, watchLater, watchedList } = {}) {
  const desired = new Map();
  const add = (anime, statusOf) => {
    if (!anime || anime.id == null) return;
    const key = String(anime.id);
    if (desired.has(key)) return;
    const { anilistId, malId } = anilistIdsOf(anime);
    if (!anilistId && !malId && !kitsuIdOf(anime)) return;
    const status = statusOf(anime);
    let progress = toProgress(anime.currentEp);
    // Un anime terminado tiene todos sus episodios vistos, aunque el contador
    // haya quedado atrás (p. ej. se marcó "terminado" directamente).
    if (status === 'COMPLETED') progress = Math.max(progress, toProgress(anime.episodes));
    const entry = { key, anime, status, progress, scoreRaw: toScoreRaw(anime.userRating) };
    entry.signature = entrySignature(entry);
    desired.set(key, entry);
  };

  if (schedule && typeof schedule === 'object') {
    for (const list of Object.values(schedule)) {
      if (Array.isArray(list)) for (const anime of list) add(anime, (a) => (a.paused ? 'PAUSED' : 'CURRENT'));
    }
  }
  if (Array.isArray(watchedList)) for (const anime of watchedList) add(anime, (a) => (a.finished ? 'COMPLETED' : 'DROPPED'));
  if (Array.isArray(watchLater)) for (const anime of watchLater) add(anime, () => 'PLANNING');
  return desired;
}

// --- Huella de lo enviado ---------------------------------------------------

/**
 * Huella para "enviar toda mi biblioteca": se queda solo con lo que AniList ya
 * confirmó tal cual (`sent`), así todo lo demás vuelve a contar como pendiente.
 * Al quedar guardada, un envío a medias se retoma al volver a abrir la app.
 */
export function fullSyncPushed(pushed, sent) {
  const next = {};
  for (const [key, signature] of Object.entries(pushed || {})) {
    if (sent?.[key] === signature) next[key] = signature;
  }
  return next;
}

// --- Fuentes que cubre la huella --------------------------------------------
// Cuando una fuente pasa a poder enviarse (Kitsu), lo que ya estaba en la
// biblioteca aparece de golpe como "nunca enviado". Eso no son cambios del
// usuario: se suma a la línea base una sola vez por dueño.

const PUSHED_SOURCES = 'anilist,mal,kitsu';
const sourcesKeyFor = (owner) => `${ANILIST_SOURCES_KEY}:${owner}`;

/** ¿La huella de este dueño ya contempla todas las fuentes que hoy se envían? */
export function sourcesUpToDate(owner = '') {
  try {
    return localStorage.getItem(sourcesKeyFor(owner)) === PUSHED_SOURCES;
  } catch {
    return true; // sin localStorage no hay huella que extender
  }
}

export function markSources(owner = '') {
  try {
    localStorage.setItem(sourcesKeyFor(owner), PUSHED_SOURCES);
  } catch { /* best-effort */ }
}

/**
 * Suma a la huella, como ya enviados, los anime de Kitsu que estaban en la
 * biblioteca antes de que Kitsu se pudiera enviar. Devuelve el mismo objeto si
 * no había ninguno.
 */
export function extendBaseline(pushed, desired) {
  let next = pushed;
  for (const [key, entry] of desired) {
    if (key in pushed || !isKitsuOnly(entry.anime)) continue;
    if (next === pushed) next = { ...pushed };
    next[key] = entry.signature;
  }
  return next;
}

/** Línea base: la huella actual de todo, como si ya se hubiera enviado. */
export function baselineOf(desired) {
  const pushed = {};
  for (const [key, entry] of desired) pushed[key] = entry.signature;
  return pushed;
}

/** Entradas cuya huella no coincide con lo último enviado (o que nunca se enviaron). */
export function pendingChanges(desired, pushed) {
  const pending = [];
  for (const [key, entry] of desired) {
    if (pushed?.[key] !== entry.signature) pending.push(entry);
  }
  return pending;
}

/**
 * Olvida la huella de los anime que ya no están en la biblioteca (en AniList
 * no se borra nada). Devuelve el mismo objeto si no había nada que sacar.
 */
export function prunePushed(pushed, desired) {
  const gone = Object.keys(pushed).filter((key) => !desired.has(key));
  if (gone.length === 0) return pushed;
  const next = { ...pushed };
  for (const key of gone) delete next[key];
  return next;
}

// La huella se guarda **una por dueño** (`viewerId|scope`). Antes era una sola
// con una marca de a quién pertenecía: si dos contextos con distinto scope se
// alternaban (otra pestaña, o la sesión de Google todavía sin resolver), cada
// uno veía la del otro, volvía a tomar la línea base y daba todo por enviado
// sin mandar nada. Con una por dueño nadie le pisa la huella a nadie.
const pushedKeyFor = (owner) => `${ANILIST_PUSHED_KEY}:${owner}`;
/** Cuántos dueños se recuerdan (cuentas de Google usadas en este dispositivo). */
const PUSHED_OWNERS_MAX = 4;

const parseSignatures = (raw) => {
  const parsed = JSON.parse(raw || 'null');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const signatures = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string') signatures[key] = value;
  }
  return signatures;
};

// Huella del formato viejo (una sola clave + marca de dueño): si es de este
// dueño se adopta; en cualquier caso las claves viejas se van.
function adoptLegacyPushed(owner) {
  const legacy = localStorage.getItem(ANILIST_PUSHED_KEY);
  if (legacy === null) return null;
  const mine = localStorage.getItem(ANILIST_PUSHED_OWNER_KEY) === String(owner);
  localStorage.removeItem(ANILIST_PUSHED_KEY);
  localStorage.removeItem(ANILIST_PUSHED_OWNER_KEY);
  if (!mine) return null;
  localStorage.setItem(pushedKeyFor(owner), legacy);
  return legacy;
}

/**
 * Huella guardada de un dueño (`'<viewerId>|<scope>'`), o null si todavía no
 * tiene (hay que tomar la línea base): otra cuenta de AniList u otra biblioteca
 * tienen la suya, y sus diferencias no son cambios del usuario.
 */
export function readPushed(owner = '') {
  try {
    let raw = localStorage.getItem(pushedKeyFor(owner));
    if (raw === null) raw = adoptLegacyPushed(owner);
    return parseSignatures(raw);
  } catch {
    return null;
  }
}

/** Guarda la huella de un dueño. Devuelve false si no se pudo escribir. */
export function writePushed(pushed, owner = '') {
  try {
    const key = pushedKeyFor(owner);
    localStorage.setItem(key, JSON.stringify(pushed));
    // Tope de dueños recordados: se van los demás, nunca el que se acaba de escribir.
    const others = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${ANILIST_PUSHED_KEY}:`) && k !== key) others.push(k);
    }
    for (const k of others.slice(0, Math.max(0, others.length - (PUSHED_OWNERS_MAX - 1)))) localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

// --- Lo que de verdad llegó a AniList --------------------------------------
// Va por cuenta de AniList, no por dueño: si otro contexto (otra pestaña, otro
// scope) ya mandó exactamente este cambio, no hace falta repetir el pedido.

const sentKeyFor = (viewerId) => `${ANILIST_SENT_KEY}:${viewerId}`;

/** `{ [animeId]: firma }` de lo último confirmado por AniList para esa cuenta. */
export function readSent(viewerId) {
  try {
    return parseSignatures(localStorage.getItem(sentKeyFor(viewerId))) || {};
  } catch {
    return {};
  }
}

/** Anota un envío confirmado. `keep` (opcional): claves que siguen en la biblioteca. */
export function rememberSent(viewerId, key, signature, keep) {
  try {
    const sent = readSent(viewerId);
    sent[key] = signature;
    if (keep) {
      for (const k of Object.keys(sent)) if (!keep.has(k)) delete sent[k];
    }
    localStorage.setItem(sentKeyFor(viewerId), JSON.stringify(sent));
    return true;
  } catch {
    return false;
  }
}

// --- Id de AniList de un anime ---------------------------------------------

/** Cache `[[kitsuId, anilistId], …]`; 0 = Kitsu no tiene equivalencia para ese anime. */
export const ANILIST_KITSU_IDS_KEY = 'anitracker-anilist-kitsu-ids';
/** Los ids internos de Kitsu van de 100000 a 299999 (ver «Datos persistidos»). */
const KITSU_ID_BASE = 100000;
const KITSU_ID_LIMIT = 300000;

/** Id de Kitsu de un anime guardado desde Kitsu, o null. */
export function kitsuIdOf(anime) {
  const m = /^kitsu:(\d+)$/.exec(anime?.sourceKey || '');
  if (m) return Number(m[1]);
  const id = Number(anime?.id);
  // Items viejos guardados antes de que existiera sourceKey.
  return !anime?.sourceKey && id >= KITSU_ID_BASE && id < KITSU_ID_LIMIT ? id - KITSU_ID_BASE : null;
}

const isKitsuOnly = (anime) => {
  const { anilistId, malId } = anilistIdsOf(anime);
  return !anilistId && !malId && !!kitsuIdOf(anime);
};

function readKitsuCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ANILIST_KITSU_IDS_KEY) || '[]');
    if (!Array.isArray(parsed)) return new Map();
    return new Map(parsed.filter((pair) => Array.isArray(pair) && Number(pair[0]) > 0 && Number(pair[1]) >= 0)
      .map(([kitsuId, mediaId]) => [Number(kitsuId), Number(mediaId)]));
  } catch {
    return new Map();
  }
}

function rememberKitsuId(kitsuId, mediaId) {
  try {
    const cache = readKitsuCache();
    cache.delete(kitsuId);
    cache.set(kitsuId, mediaId > 0 ? mediaId : 0);
    localStorage.setItem(ANILIST_KITSU_IDS_KEY, JSON.stringify([...cache].slice(-ANILIST_IDS_MAX)));
  } catch { /* la cache es opcional */ }
}

function readIdCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ANILIST_IDS_KEY) || '[]');
    if (!Array.isArray(parsed)) return new Map();
    return new Map(parsed.filter((pair) => Array.isArray(pair) && Number(pair[0]) > 0 && Number(pair[1]) > 0)
      .map(([malId, mediaId]) => [Number(malId), Number(mediaId)]));
  } catch {
    return new Map();
  }
}

function rememberMediaId(malId, mediaId) {
  try {
    const cache = readIdCache();
    cache.delete(malId); // lo recién usado va al final: se recorta por el principio
    cache.set(malId, mediaId);
    localStorage.setItem(ANILIST_IDS_KEY, JSON.stringify([...cache].slice(-ANILIST_IDS_MAX)));
  } catch { /* la cache es opcional */ }
}

/**
 * Id de AniList de un anime sin tocar la red: el número si se sabe (directo o
 * en cache), `null` si la fuente no se puede mapear y `undefined` si hay que
 * consultarlo (`resolveMediaId`).
 */
export function cachedMediaId(anime) {
  const { anilistId, malId } = anilistIdsOf(anime);
  if (anilistId) return anilistId;
  if (malId) return readIdCache().get(malId);
  const kitsuId = kitsuIdOf(anime);
  if (!kitsuId) return null;
  const cached = readKitsuCache().get(kitsuId);
  return cached === undefined ? undefined : (cached || null);
}

const MEDIA_BY_MAL_QUERY = 'query ($id: Int) { Media(idMal: $id, type: ANIME) { id } }';
const MEDIA_BY_MAL_BATCH_QUERY = 'query ($ids: [Int]) { Page(perPage: 50) { media(idMal_in: $ids, type: ANIME) { id idMal } } }';
const MEDIA_BATCH_SIZE = 50;

/**
 * Resuelve de a tandas los ids de AniList de los anime que solo tienen id de
 * MAL (uno por uno sería un pedido extra por anime, y el envío de la biblioteca
 * entera tardaría el doble). Lo que AniList no devuelve queda sin cachear y
 * `resolveMediaId` lo consulta después por separado.
 */
export async function prefetchMediaIds(animes, { signal, queue = anilistQueue } = {}) {
  const pending = (animes || []).filter((anime) => cachedMediaId(anime) === undefined);
  let resolved = 0;

  // Kitsu: su API da la equivalencia directa con AniList, o al menos con MAL.
  const kitsuIds = [...new Set(pending.map(kitsuIdOf).filter(Boolean))];
  const kitsuByMal = new Map(); // malId → [kitsuId, …] para los que solo tienen MAL
  if (kitsuIds.length > 0) {
    try {
      for (const [kitsuId, found] of await fetchKitsuMappings(kitsuIds, { signal })) {
        if (found.anilistId) { rememberKitsuId(kitsuId, found.anilistId); resolved += 1; }
        else if (found.malId) kitsuByMal.set(found.malId, [...(kitsuByMal.get(found.malId) || []), kitsuId]);
        else rememberKitsuId(kitsuId, 0);
      }
    } catch (err) {
      if (signal?.aborted || err?.name === 'AbortError') throw err;
      // Kitsu caído: se resuelve después, de a uno (`resolveMediaId`).
      console.error('[AniTracker] Kitsu mappings lookup failed:', err?.message || err?.name);
    }
  }

  const missing = [...new Set([
    ...pending.map((anime) => anilistIdsOf(anime).malId).filter(Boolean),
    ...kitsuByMal.keys(),
  ])];
  for (let i = 0; i < missing.length; i += MEDIA_BATCH_SIZE) {
    const ids = missing.slice(i, i + MEDIA_BATCH_SIZE);
    const data = await queue.run(() => anilistRequest(MEDIA_BY_MAL_BATCH_QUERY, { ids }, { signal }), { signal });
    for (const media of data?.Page?.media || []) {
      const malId = Number(media?.idMal);
      const mediaId = Number(media?.id);
      if (malId > 0 && mediaId > 0) { rememberMediaId(malId, mediaId); resolved += 1; }
    }
  }
  // Los de Kitsu que llegaron por MAL: su id de AniList, o 0 si AniList no la tiene.
  const byMal = readIdCache();
  for (const [malId, ids] of kitsuByMal) {
    for (const kitsuId of ids) rememberKitsuId(kitsuId, byMal.get(malId) || 0);
  }
  return resolved;
}

/**
 * Id de AniList de un anime: directo si es de AniList, o buscándolo por su id
 * de MAL (con cache en localStorage). `null` si la fuente no se puede mapear o
 * AniList no tiene esa obra.
 */
export async function resolveMediaId(anime, { signal } = {}) {
  const cached = cachedMediaId(anime);
  if (cached !== undefined) return cached;
  let { malId } = anilistIdsOf(anime);
  const kitsuId = malId ? null : kitsuIdOf(anime);
  if (kitsuId) {
    const found = (await fetchKitsuMappings([kitsuId], { signal })).get(kitsuId);
    if (found?.anilistId) { rememberKitsuId(kitsuId, found.anilistId); return found.anilistId; }
    if (!found?.malId) { rememberKitsuId(kitsuId, 0); return null; }
    ({ malId } = found);
  }
  const settle = (mediaId) => {
    if (kitsuId) rememberKitsuId(kitsuId, mediaId || 0);
    return mediaId;
  };
  try {
    const data = await anilistRequest(MEDIA_BY_MAL_QUERY, { id: malId }, { signal });
    const mediaId = Number(data?.Media?.id);
    if (!(mediaId > 0)) return settle(null);
    rememberMediaId(malId, mediaId);
    return settle(mediaId);
  } catch (err) {
    // AniList contesta 404 cuando no tiene la obra: no es un error.
    if (err instanceof AnilistRequestError && err.status === 404) return settle(null);
    throw err;
  }
}

// --- Escritura --------------------------------------------------------------

const SAVE_ENTRY_MUTATION = `mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $scoreRaw: Int) {
  SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, scoreRaw: $scoreRaw) { id mediaId status progress }
}`;

/**
 * Crea o actualiza la entrada de un anime en la lista del usuario. Sin
 * `scoreRaw` la nota de AniList no se toca. Tira `AnilistAuthError` (token
 * vencido o inválido), `AnilistRateLimitError` (429, con `retryAfterMs`) o
 * `AnilistRequestError` (cualquier otro rechazo).
 */
export async function saveMediaListEntry(token, { mediaId, status, progress, scoreRaw }, { signal } = {}) {
  if (!token) throw new AnilistAuthError();
  const variables = { mediaId, status, progress };
  if (scoreRaw != null) variables.scoreRaw = scoreRaw;
  const data = await anilistRequest(SAVE_ENTRY_MUTATION, variables, { token, signal });
  return data?.SaveMediaListEntry ?? null;
}

// --- Cola -------------------------------------------------------------------

const abortError = () => new DOMException('Aborted', 'AbortError');

/** `setTimeout` como promesa, cancelable con un `AbortSignal`. */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, Math.max(0, ms));
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Cola secuencial: una tarea por vez y como mucho un pedido cada `intervalMs`.
 * Si la tarea tira `AnilistRateLimitError` se espera lo que pidió AniList y se
 * reintenta (hasta `maxRetries`); cualquier otro error sale tal cual, así
 * quien llama corta ante un `AnilistAuthError`.
 */
export function createRequestQueue({ intervalMs = ANILIST_MIN_INTERVAL_MS, maxRetries = 3 } = {}) {
  let tail = Promise.resolve();
  let lastStart = Number.NEGATIVE_INFINITY;

  const execute = async (task, signal) => {
    for (let attempt = 0; ; attempt += 1) {
      // Acotado al intervalo: si el reloj saltó hacia atrás no se espera de más.
      const wait = Math.min(intervalMs, lastStart + intervalMs - Date.now());
      if (wait > 0) await sleep(wait, signal);
      if (signal?.aborted) throw abortError();
      lastStart = Date.now();
      try {
        return await task();
      } catch (err) {
        if (!(err instanceof AnilistRateLimitError) || attempt >= maxRetries) throw err;
        await sleep(err.retryAfterMs, signal);
      }
    }
  };

  return {
    run(task, { signal } = {}) {
      const result = tail.then(() => execute(task, signal));
      tail = result.catch(() => {});
      return result;
    },
  };
}

/** Cola compartida: las búsquedas de id y las escrituras cuentan para el mismo límite. */
export const anilistQueue = createRequestQueue();

/**
 * Manda una lista de cambios (de `pendingChanges`) de a uno por la cola.
 *
 * - `onPushed(change, mediaId)` por cada cambio resuelto: enviado, o `mediaId`
 *   null si AniList no tiene esa obra (no hay nada que mandar).
 * - `onRejected(change, error)` si AniList rechazó ese cambio de forma
 *   definitiva: se sigue con los demás en vez de trabar la cola.
 * - `isCurrent(change)` (opcional): si devuelve false el cambio quedó viejo
 *   mientras esperaba y se saltea.
 *
 * Un `AnilistAuthError`, un 429 que no cede o un error de red cortan el envío
 * y salen como excepción; lo ya confirmado por `onPushed` queda hecho.
 * Devuelve `{ sent, rejected }`.
 */
export async function pushChanges(token, changes, { signal, queue = anilistQueue, isCurrent, onPushed, onRejected } = {}) {
  let sent = 0;
  let rejected = 0;
  for (const change of changes) {
    if (signal?.aborted) throw abortError();
    if (isCurrent && !isCurrent(change)) continue;
    try {
      let mediaId = cachedMediaId(change.anime);
      if (mediaId === undefined) mediaId = await queue.run(() => resolveMediaId(change.anime, { signal }), { signal });
      if (mediaId) {
        const { status, progress, scoreRaw } = change;
        await queue.run(() => saveMediaListEntry(token, { mediaId, status, progress, scoreRaw }, { signal }), { signal });
        sent += 1;
      }
      onPushed?.(change, mediaId ?? null);
    } catch (err) {
      if (!(err instanceof AnilistRequestError) || !err.permanent) throw err;
      rejected += 1;
      onRejected?.(change, err);
    }
  }
  return { sent, rejected };
}
