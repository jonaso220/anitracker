import { searchJikan } from './jikanService';
import { searchKitsu } from './kitsuService';
import { searchAnilist } from './anilistService';
import { searchTvmaze } from './tvmazeService';
import { searchItunes } from './itunesService';
import { searchTmdb, TMDB_ENABLED } from './tmdbService';
import { searchViki } from './vikiService';
import { searchViaSpanishWikipedia, searchViaEnglishWikipedia } from './wikipediaBridge';
import { normalize, wordMatchRatio } from './searchText';


const URL_SITE_NAMES = [
  ['crunchyroll.com', 'Crunchyroll'],
  ['netflix.com', 'Netflix'],
  ['hidive.com', 'HIDIVE'],
  ['disneyplus.com', 'Disney+'],
  ['primevideo.com', 'Prime Video'],
  ['amazon.', 'Prime Video'],
  ['max.com', 'Max'],
  ['hbomax.com', 'Max'],
  ['hulu.com', 'Hulu'],
  ['tv.apple.com', 'Apple TV+'],
  ['jkanime.net', 'JKAnime'],
  ['animeflv', 'AnimeFLV'],
  ['viki.com', 'Viki'],
];

const URL_PATH_WORDS = new Set([
  'anime', 'browse', 'detail', 'es', 'es-es', 'home', 'series', 'show', 'shows',
  'title', 'ver', 'video', 'watch', 'www',
]);

const safeDecode = (value) => {
  try { return decodeURIComponent(value); } catch { return value; }
};

const titleFromSlug = (slug) => safeDecode(slug || '')
  .replace(/\.[a-z0-9]{2,5}$/i, '')
  .replace(/[-_+]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const isOpaquePathPart = (part) => (
  URL_PATH_WORDS.has(part.toLowerCase())
  || /^\d+$/.test(part)
  || /^(?=.*\d)[a-z0-9]{8,}$/i.test(part)
);

/**
 * Turn a pasted streaming URL into a title that the catalogue APIs can search.
 * The original URL is returned untouched so it can become the anime's watchLink.
 */
export function parseAnimeSearchInput(rawInput) {
  const raw = (rawInput || '').trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { isUrl: false, searchTerm: raw, url: '', site: '' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { isUrl: false, searchTerm: raw, url: '', site: '' };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const site = URL_SITE_NAMES.find(([domain]) => host.includes(domain))?.[1] || host;
  const parts = parsed.pathname.split('/').filter(Boolean).map(safeDecode);
  const lowerParts = parts.map((part) => part.toLowerCase());
  let slug = '';

  if (host.includes('crunchyroll.com')) {
    const seriesIndex = lowerParts.indexOf('series');
    // Crunchyroll series URLs expose the catalogue title after the opaque id.
    // Episode URLs (/watch/...) only expose an episode title, so avoid matching
    // the wrong anime and ask for the series page instead.
    if (seriesIndex >= 0) {
      slug = [...parts.slice(seriesIndex + 1)].reverse().find((part) => !isOpaquePathPart(part)) || '';
    }
  } else if (host.includes('viki.com')) {
    // Viki: /tv/41650c-the-ordinary-jackpot o /movies/38609c-… — el slug lleva
    // delante el id del contenido.
    const idx = lowerParts.findIndex((part) => part === 'tv' || part === 'movies');
    slug = idx >= 0 ? (parts[idx + 1] || '').replace(/^\d+[a-z]{1,2}-/i, '') : '';
  } else {
    slug = [...parts].reverse().find((part) => !isOpaquePathPart(part)) || '';
  }

  const titleParam = parsed.searchParams.get('title') || parsed.searchParams.get('q') || '';
  const searchTerm = titleFromSlug(titleParam || slug);
  return { isUrl: true, searchTerm, url: raw, site };
}

function attachProvidedUrl(results, input) {
  if (!input.isUrl || !input.url) return results;
  return results.map((anime) => ({
    ...anime,
    watchLink: input.url,
    streamingLinks: [
      { site: input.site, url: input.url, language: 'enlace proporcionado' },
      ...(anime.streamingLinks || []).filter((link) => link?.url !== input.url),
    ],
  }));
}

function titlesOf(a) {
  return [a.title, a.titleOriginal, a.titleEn, a.titleJp, ...(a.altTitles || [])].filter(Boolean);
}

// Solo los títulos principales: los sinónimos ("Furuba") los comparten
// temporadas y remakes distintos, y fusionaban Fruits Basket 2019 con la de 2001.
// Un año final entre paréntesis ("Fruits Basket (2019)") es desambiguación de
// la fuente: el año ya se compara aparte. La puntuación no cuenta (’ vs ').
const primaryTitles = (a) => [a.title, a.titleOriginal, a.titleEn, a.titleJp]
  .filter(Boolean)
  .map((t) => normalize(t).replace(/\s*\(\d{4}\)$/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim());

const isMovie = (a) => /^(película|movie)$/i.test(a.type || '');

/**
 * ¿Dos resultados de fuentes distintas son la misma obra? Por malId si ambos
 * lo tienen; si no, por título principal con año (±1) y formato compatibles
 * (Dororo 1969 y 2019 comparten título en inglés). Nunca dentro de una misma
 * fuente: ahí cada resultado ya es una obra distinta.
 */
function isSameWork(existing, candidate) {
  if (existing.source === candidate.source) return false;
  if (existing.malId && candidate.malId) return existing.malId === candidate.malId;
  const ya = Number(existing.year);
  const yb = Number(candidate.year);
  if (ya && yb && Math.abs(ya - yb) > 1) return false;
  if (existing.type && candidate.type && isMovie(existing) !== isMovie(candidate)) return false;
  const exTitles = primaryTitles(existing);
  return primaryTitles(candidate).some((t) => t && exTitles.includes(t));
}

// When a candidate duplicates an existing entry, steal the data-rich fields the
// existing entry is missing (e.g. Jikan wins the dedupe but AniList brought the
// streaming links and trailer).
function mergeMissingFields(existing, candidate) {
  if (!existing.streamingLinks?.length && candidate.streamingLinks?.length) {
    existing.streamingLinks = candidate.streamingLinks;
  }
  if (!existing.trailerUrl && candidate.trailerUrl) existing.trailerUrl = candidate.trailerUrl;
  if (existing.episodes == null && candidate.episodes != null) existing.episodes = candidate.episodes;
}

// Mismo id interno = misma obra solo dentro de una fuente o en el rango de MAL
// (AniList con idMal usa el id de MAL); entre otras fuentes los rangos se pisan.
const sameId = (a, b) => a.id === b.id && (a.source === b.source || a.id < 100000);

// Devuelve la entrada de la colección que representa a cada anime (la nueva
// o la existente con la que se fusionó).
function dedupeInto(collection, animes) {
  const entries = [];
  for (const a of animes) {
    if (!a) continue;
    const dup = collection.find((e) => sameId(e, a)) || collection.find((e) => isSameWork(e, a));
    if (dup) { mergeMissingFields(dup, a); entries.push(dup); continue; }
    // Copia: las fusiones mutan la entrada y los resultados parciales ya
    // entregados no deben cambiar por debajo.
    const copy = { ...a };
    collection.push(copy);
    entries.push(copy);
  }
  return entries;
}

function scoreAgainst(item, qNorm, query) {
  const titles = titlesOf(item).map(normalize);
  if (titles.some((t) => t === qNorm)) return 100;
  if (titles.some((t) => t.startsWith(qNorm))) return 80;
  if (titles.some((t) => qNorm.startsWith(t) && t.length >= 4)) return 70;
  if (titles.some((t) => t.includes(qNorm))) return 60;
  if (titles.some((t) => qNorm.includes(t) && t.length >= 4)) return 40;
  return wordMatchRatio(titles, query) * 30;
}

/**
 * Relevancia 0–100. Lo que llegó por el puente de Wikipedia se compara también
 * contra el título del artículo ("los simpson" → "The Simpsons"), un poco por
 * debajo de un match directo. Los videos musicales solo cuentan si el título
 * es exacto: Kitsu los devuelve para casi cualquier búsqueda.
 */
function scoreRelevance(item, query, bridgeTitles) {
  const qNorm = normalize(query);
  let score = scoreAgainst(item, qNorm, query);
  for (const title of bridgeTitles.get(item) || []) {
    score = Math.max(score, scoreAgainst(item, normalize(title), title) * 0.95);
  }
  if (/^music$/i.test(item.type || '') && score < 100) return 0;
  return score;
}

function hasGoodMatch(collection, qNorm) {
  return collection.some((v) => {
    const titles = titlesOf(v).map(normalize);
    return titles.some((t) => t.includes(qNorm) || (qNorm.includes(t) && t.length >= 4));
  });
}

// Ordena por relevancia y descarta lo que no comparte ninguna palabra con la
// búsqueda (si todo quedara afuera, se devuelve igual lo que hay).
function rank(collection, query, bridgeTitles) {
  const scored = collection
    .map((item, i) => ({ item, i, score: scoreRelevance(item, query, bridgeTitles) }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const relevant = scored.filter((s) => s.score > 0);
  return (relevant.length ? relevant : scored).map((s) => s.item);
}

const SOURCES = [
  { name: 'MAL', search: searchJikan },
  { name: 'Kitsu', search: searchKitsu },
  { name: 'AniList', search: searchAnilist },
  // Antes que TVMaze/iTunes/TMDB: para dramas asiáticos gana la dedupe con
  // título y sinopsis en español y el link de Viki.
  { name: 'Viki', search: searchViki },
  { name: 'TVMaze', search: searchTvmaze },
  { name: 'iTunes', search: searchItunes },
  ...(TMDB_ENABLED ? [{ name: 'TMDB', search: searchTmdb }] : []),
];

/** Names of the active search sources, for UI hints. */
export const SEARCH_SOURCE_NAMES = SOURCES.map((s) => s.name);

// Una fuente que no responde en este tiempo se da por caída: la búsqueda no
// espera a la API más lenta.
export const SOURCE_TIMEOUT_MS = 6000;

// Señal que se cancela con la búsqueda o al vencer el tiempo.
function timedSignal(signal, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), ms);
  const onAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) controller.abort(signal.reason);
  else signal?.addEventListener('abort', onAbort, { once: true });
  return {
    signal: controller.signal,
    done: () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); },
  };
}

async function withTimeout(fn, signal, ms = SOURCE_TIMEOUT_MS) {
  const timed = timedSignal(signal, ms);
  try {
    return await fn(timed.signal);
  } finally {
    timed.done();
  }
}

const throwIfAborted = (signal) => {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
};

// Short-lived cache so retyping a recent query (or reopening the modal) doesn't
// hammer 5-6 APIs again. Only fully-successful searches are cached, so a flaky
// API gets retried on the next attempt.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 30;
const searchCache = new Map();

export function clearSearchCache() {
  searchCache.clear();
}

/**
 * Multi-API search with Wikipedia bridge fallback. Returns { results, failedApis }.
 * Accepts an AbortSignal to cancel in-flight requests, and `onProgress(results)`,
 * called with the ranked partial results each time a source answers so the UI
 * doesn't wait for the slowest API. Each source has SOURCE_TIMEOUT_MS.
 */
export async function searchAnime(query, { signal, onProgress } = {}) {
  const input = parseAnimeSearchInput(query);
  const searchTerm = input.searchTerm;
  if (!searchTerm || searchTerm.length < 2) return { results: [], failedApis: [] };

  const qNorm = normalize(searchTerm);

  const cached = searchCache.get(qNorm);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { results: attachProvidedUrl(cached.results, input), failedApis: [] };
  }

  const bridgeTitles = new Map();
  // Resultados por fuente, en el orden de SOURCES: la fusión siempre se arma
  // en ese orden, así el resultado final no depende de quién respondió antes.
  const bySource = new Array(SOURCES.length).fill(null);
  const build = () => {
    const collection = [];
    for (const list of bySource) if (list) dedupeInto(collection, list);
    return collection;
  };
  const report = () => {
    if (!onProgress || signal?.aborted) return;
    onProgress(attachProvidedUrl(rank(build(), searchTerm, bridgeTitles), input));
  };

  const settled = await Promise.allSettled(SOURCES.map((s, i) => withTimeout((sig) => s.search(searchTerm, { signal: sig }), signal)
    .then((list) => { bySource[i] = list; report(); return list; })));
  throwIfAborted(signal);

  const failedApis = settled.map((s, i) => (s.status === 'rejected' ? SOURCES[i].name : null)).filter(Boolean);
  let complete = failedApis.length === 0;
  const collection = build();

  // Rounds 2 and 3: Wikipedia bridges (Spanish, then English) if no good hit.
  for (const bridge of [searchViaSpanishWikipedia, searchViaEnglishWikipedia]) {
    if (hasGoodMatch(collection, qNorm) || searchTerm.length < 4) break;
    try {
      const { hits, titles } = await withTimeout((sig) => bridge(searchTerm, { signal: sig }), signal);
      // También las entradas que ya estaban: "The Simpsons" pudo llegar antes
      // por TVMaze y es justo lo que el puente confirma.
      for (const item of dedupeInto(collection, hits)) {
        bridgeTitles.set(item, [...new Set([...(bridgeTitles.get(item) || []), ...titles])]);
      }
      if (hits.length && onProgress) onProgress(attachProvidedUrl(rank(collection, searchTerm, bridgeTitles), input));
    } catch (err) {
      throwIfAborted(signal);
      if (err?.name !== 'AbortError') console.warn('[AniTracker] Wikipedia bridge failed:', err);
      complete = false;
    }
  }
  throwIfAborted(signal);

  const results = rank(collection, searchTerm, bridgeTitles);

  if (complete) {
    if (searchCache.size >= CACHE_MAX) {
      searchCache.delete(searchCache.keys().next().value);
    }
    searchCache.set(qNorm, { ts: Date.now(), results });
  }

  return { results: attachProvidedUrl(results, input), failedApis };
}
