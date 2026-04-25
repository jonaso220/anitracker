/**
 * Anime object schema and normalizer.
 *
 * Provides a single source of truth for the shape of an "anime" object across
 * the app. All API adapters should return data that passes through `normalizeAnime`
 * to guarantee consistent fields downstream.
 */

const toStr = (v) => (v == null ? '' : String(v));
const toNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const toArrayOfStrings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.length > 0) : []);
const parseEpisodesNullable = (v) => {
  if (v == null || v === '?' || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) || n <= 0 ? null : n;
};

export const ANIME_SOURCES = ['MAL', 'Kitsu', 'AniList', 'TVMaze', 'iTunes'];

/**
 * Normalize a raw anime-like object to the canonical shape used in the app.
 * Guarantees types on every field so downstream code can trust them.
 */
export function normalizeAnime(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = toNumber(raw.id, 0);
  if (id <= 0) return null;

  return {
    id,
    source: toStr(raw.source),
    title: toStr(raw.title),
    titleOriginal: toStr(raw.titleOriginal),
    titleJp: toStr(raw.titleJp),
    titleEn: toStr(raw.titleEn),
    altTitles: toArrayOfStrings(raw.altTitles),
    image: toStr(raw.image),
    imageSm: toStr(raw.imageSm),
    genres: toArrayOfStrings(raw.genres),
    synopsis: toStr(raw.synopsis) || 'Sin sinopsis disponible.',
    rating: toNumber(raw.rating, 0),
    episodes: parseEpisodesNullable(raw.episodes),
    status: toStr(raw.status),
    year: raw.year == null ? '' : toStr(raw.year),
    type: toStr(raw.type),
    malUrl: toStr(raw.malUrl),
    watchLink: toStr(raw.watchLink),
    streamingLinks: Array.isArray(raw.streamingLinks)
      ? raw.streamingLinks
          .filter((l) => l && typeof l.url === 'string' && typeof l.site === 'string')
          .map((l) => ({ site: l.site, url: l.url, language: toStr(l.language) }))
      : [],
    currentEp: toNumber(raw.currentEp, 0),
    userRating: toNumber(raw.userRating, 0),
    notes: toStr(raw.notes),
    // Optional user-list flags
    finished: raw.finished === true,
    finishedDate: raw.finishedDate || undefined,
    droppedDate: raw.droppedDate || undefined,
  };
}

/**
 * Strict validation — returns true if the object has the minimum fields to be
 * considered a valid anime card (id, title, image). Used at persistence boundaries.
 */
export function isValidAnime(a) {
  return !!(
    a &&
    typeof a === 'object' &&
    Number.isFinite(a.id) &&
    a.id > 0 &&
    typeof a.title === 'string' &&
    a.title.length > 0
  );
}
