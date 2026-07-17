import { searchJikan } from './jikanService';
import { searchKitsu } from './kitsuService';
import { searchAnilist } from './anilistService';
import { searchTvmaze } from './tvmazeService';
import { searchItunes } from './itunesService';
import { searchTmdb, TMDB_ENABLED } from './tmdbService';
import { searchViaSpanishWikipedia, searchViaEnglishWikipedia } from './wikipediaBridge';

const normalize = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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
  const input = parseAnimeSearchInput(query);
  const searchTerm = input.searchTerm;
  if (!searchTerm || searchTerm.length < 2) return { results: [], failedApis: [] };

  const qNorm = normalize(searchTerm);

  const cached = searchCache.get(qNorm);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { results: attachProvidedUrl(cached.results, input), failedApis: [] };
  }

  const settled = await Promise.allSettled(SOURCES.map((s) => s.search(searchTerm, { signal })));

  const failedApis = settled.map((s, i) => (s.status === 'rejected' ? SOURCES[i].name : null)).filter(Boolean);
  const collection = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') dedupeInto(collection, s.value);
  }

  // Round 2: Spanish Wikipedia bridge if no good hit
  if (!hasGoodMatch(collection, qNorm) && searchTerm.length >= 4) {
    try {
      const esHits = await searchViaSpanishWikipedia(searchTerm, { signal });
      dedupeInto(collection, esHits);
    } catch { /* continue */ }
  }

  // Round 3: English Wikipedia bridge fallback
  if (!hasGoodMatch(collection, qNorm) && searchTerm.length >= 4) {
    try {
      const enHits = await searchViaEnglishWikipedia(searchTerm, { signal });
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

  return { results: attachProvidedUrl(results, input), failedApis };
}
