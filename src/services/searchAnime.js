import { searchJikan } from './jikanService';
import { searchKitsu } from './kitsuService';
import { searchAnilist } from './anilistService';
import { searchTvmaze } from './tvmazeService';
import { searchItunes } from './itunesService';
import { searchTmdb, TMDB_ENABLED } from './tmdbService';
import { searchViaSpanishWikipedia, searchViaEnglishWikipedia } from './wikipediaBridge';

const normalize = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function titlesOf(a) {
  return [a.title, a.titleOriginal, a.titleEn, a.titleJp, ...(a.altTitles || [])].filter(Boolean);
}

function isDuplicate(existing, candidate) {
  const exTitles = titlesOf(existing).map(normalize);
  const candTitles = titlesOf(candidate).map(normalize);
  return candTitles.some((c) => c && exTitles.includes(c));
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

function dedupeInto(collection, animes) {
  const added = [];
  for (const a of animes) {
    if (!a) continue;
    const dup = collection.find((e) => e.id === a.id) || collection.find((e) => isDuplicate(e, a));
    if (dup) { mergeMissingFields(dup, a); continue; }
    collection.push(a);
    added.push(a);
  }
  return added;
}

function scoreRelevance(item, qNorm) {
  const titles = titlesOf(item).map(normalize);
  if (titles.some((t) => t === qNorm)) return 100;
  if (titles.some((t) => t.startsWith(qNorm))) return 80;
  if (titles.some((t) => qNorm.startsWith(t))) return 70;
  if (titles.some((t) => t.includes(qNorm))) return 60;
  if (titles.some((t) => qNorm.includes(t))) return 40;
  const qWords = qNorm.split(/\s+/);
  const matchCount = qWords.filter((w) => titles.some((t) => t.includes(w))).length;
  return (matchCount / Math.max(qWords.length, 1)) * 30;
}

function hasGoodMatch(collection, qNorm) {
  return collection.some((v) => {
    const titles = titlesOf(v).map(normalize);
    return titles.some((t) => t.includes(qNorm) || qNorm.includes(t));
  });
}

const SOURCES = [
  { name: 'MAL', search: searchJikan },
  { name: 'Kitsu', search: searchKitsu },
  { name: 'AniList', search: searchAnilist },
  { name: 'TVMaze', search: searchTvmaze },
  { name: 'iTunes', search: searchItunes },
  ...(TMDB_ENABLED ? [{ name: 'TMDB', search: searchTmdb }] : []),
];

/** Names of the active search sources, for UI hints. */
export const SEARCH_SOURCE_NAMES = SOURCES.map((s) => s.name);

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
 * Accepts an AbortSignal to cancel in-flight requests.
 */
export async function searchAnime(query, { signal } = {}) {
  if (!query || query.length < 2) return { results: [], failedApis: [] };

  const qNorm = normalize(query);

  const cached = searchCache.get(qNorm);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { results: [...cached.results], failedApis: [] };
  }

  const settled = await Promise.allSettled(SOURCES.map((s) => s.search(query, { signal })));

  const failedApis = settled.map((s, i) => (s.status === 'rejected' ? SOURCES[i].name : null)).filter(Boolean);
  const collection = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') dedupeInto(collection, s.value);
  }

  // Round 2: Spanish Wikipedia bridge if no good hit
  if (!hasGoodMatch(collection, qNorm) && query.length >= 4) {
    try {
      const esHits = await searchViaSpanishWikipedia(query, { signal });
      dedupeInto(collection, esHits);
    } catch { /* continue */ }
  }

  // Round 3: English Wikipedia bridge fallback
  if (!hasGoodMatch(collection, qNorm) && query.length >= 4) {
    try {
      const enHits = await searchViaEnglishWikipedia(query, { signal });
      dedupeInto(collection, enHits);
    } catch { /* continue */ }
  }

  const results = collection.sort((a, b) => scoreRelevance(b, qNorm) - scoreRelevance(a, qNorm));

  if (failedApis.length === 0) {
    if (searchCache.size >= CACHE_MAX) {
      searchCache.delete(searchCache.keys().next().value);
    }
    searchCache.set(qNorm, { ts: Date.now(), results });
  }

  return { results, failedApis };
}
