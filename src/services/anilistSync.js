import { anilistIdsOf } from './anilistService';
import {
  ANILIST_PUSHED_KEY,
  ANILIST_PUSHED_OWNER_KEY,
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
// - Solo se manda lo que tiene id de AniList o de MAL; TVMaze, TMDB, iTunes,
//   Viki y Kitsu sin MAL se saltean en silencio.

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
    if (!anilistId && !malId) return;
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

/**
 * Huella guardada, o null si todavía no hay (hay que tomar la línea base).
 * Con `owner` (`'<viewerId>|<scope>'`) también es null si la huella es de otra
 * cuenta de AniList o de otra biblioteca: sus diferencias no son cambios del
 * usuario y no se deben mandar.
 */
export function readPushed(owner) {
  try {
    if (owner !== undefined && localStorage.getItem(ANILIST_PUSHED_OWNER_KEY) !== String(owner)) return null;
    const parsed = JSON.parse(localStorage.getItem(ANILIST_PUSHED_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const pushed = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') pushed[key] = value;
    }
    return pushed;
  } catch {
    return null;
  }
}

/** Guarda la huella (y de quién es). Devuelve false si no se pudo escribir. */
export function writePushed(pushed, owner) {
  try {
    localStorage.setItem(ANILIST_PUSHED_KEY, JSON.stringify(pushed));
    if (owner !== undefined) localStorage.setItem(ANILIST_PUSHED_OWNER_KEY, String(owner));
    return true;
  } catch {
    return false;
  }
}

// --- Id de AniList de un anime ---------------------------------------------

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
  if (!malId) return null;
  return readIdCache().get(malId);
}

const MEDIA_BY_MAL_QUERY = 'query ($id: Int) { Media(idMal: $id, type: ANIME) { id } }';

/**
 * Id de AniList de un anime: directo si es de AniList, o buscándolo por su id
 * de MAL (con cache en localStorage). `null` si la fuente no se puede mapear o
 * AniList no tiene esa obra.
 */
export async function resolveMediaId(anime, { signal } = {}) {
  const cached = cachedMediaId(anime);
  if (cached !== undefined) return cached;
  const { malId } = anilistIdsOf(anime);
  try {
    const data = await anilistRequest(MEDIA_BY_MAL_QUERY, { id: malId }, { signal });
    const mediaId = Number(data?.Media?.id);
    if (!(mediaId > 0)) return null;
    rememberMediaId(malId, mediaId);
    return mediaId;
  } catch (err) {
    // AniList contesta 404 cuando no tiene la obra: no es un error.
    if (err instanceof AnilistRequestError && err.status === 404) return null;
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
