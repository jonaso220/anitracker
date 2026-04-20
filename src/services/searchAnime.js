import { searchJikan } from './jikanService';
import { searchKitsu } from './kitsuService';
import { searchAnilist } from './anilistService';
import { searchTvmaze } from './tvmazeService';
import { searchItunes } from './itunesService';
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

function dedupeInto(collection, animes) {
  const added = [];
  for (const a of animes) {
    if (!a) continue;
    if (collection.some((e) => e.id === a.id)) continue;
    if (collection.some((e) => isDuplicate(e, a))) continue;
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

const API_NAMES = ['MAL', 'Kitsu', 'AniList', 'TVMaze', 'iTunes'];

/**
 * Multi-API search with Wikipedia bridge fallback. Returns { results, failedApis }.
 * Accepts an AbortSignal to cancel in-flight requests.
 */
export async function searchAnime(query, { signal } = {}) {
  if (!query || query.length < 2) return { results: [], failedApis: [] };

  const settled = await Promise.allSettled([
    searchJikan(query, { signal }),
    searchKitsu(query, { signal }),
    searchAnilist(query, { signal }),
    searchTvmaze(query, { signal }),
    searchItunes(query, { signal }),
  ]);

  const failedApis = settled.map((s, i) => (s.status === 'rejected' ? API_NAMES[i] : null)).filter(Boolean);
  const collection = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') dedupeInto(collection, s.value);
  }

  const qNorm = normalize(query);

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
  return { results, failedApis };
}
