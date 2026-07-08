import { normalizeAnime } from '../schemas/anime';

// TMDB (The Movie Database) — free API for movies & TV series with Spanish
// metadata and per-country streaming availability (data provided by JustWatch,
// which TMDB requires attributing in the UI).
//
// The integration is optional: it only activates when VITE_TMDB_API_KEY is set
// (see .env.example). Both v3 API keys and v4 read access tokens are accepted.
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

const API_KEY = import.meta.env?.VITE_TMDB_API_KEY || '';
export const TMDB_ENABLED = API_KEY !== '';

// v4 read access tokens are JWTs sent as a Bearer header; v3 keys go in the query.
const IS_BEARER_TOKEN = API_KEY.startsWith('eyJ');

// App-internal ID ranges (must not collide with MAL <100000, Kitsu +100000,
// AniList +300000, TVMaze +400000, iTunes +500000).
export const TMDB_MOVIE_ID_BASE = 600000000;
export const TMDB_TV_ID_BASE = 900000000;

// TMDB genre ids are stable and documented; a static map avoids an extra
// request per search.
const MOVIE_GENRES = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia', 80: 'Crimen',
  99: 'Documental', 18: 'Drama', 10751: 'Familia', 14: 'Fantasía', 36: 'Historia',
  27: 'Terror', 10402: 'Música', 9648: 'Misterio', 10749: 'Romance',
  878: 'Ciencia ficción', 10770: 'Película de TV', 53: 'Suspenso', 10752: 'Bélica', 37: 'Western',
};
const TV_GENRES = {
  10759: 'Acción y aventura', 16: 'Animación', 35: 'Comedia', 80: 'Crimen',
  99: 'Documental', 18: 'Drama', 10751: 'Familia', 10762: 'Infantil', 9648: 'Misterio',
  10763: 'Noticias', 10764: 'Reality', 10765: 'Ciencia ficción y fantasía',
  10766: 'Telenovela', 10767: 'Talk show', 10768: 'Guerra y política', 37: 'Western',
};

export const TMDB_REGIONS = [
  { code: 'AR', label: 'Argentina' },
  { code: 'MX', label: 'México' },
  { code: 'ES', label: 'España' },
  { code: 'CL', label: 'Chile' },
  { code: 'CO', label: 'Colombia' },
  { code: 'PE', label: 'Perú' },
  { code: 'UY', label: 'Uruguay' },
  { code: 'US', label: 'Estados Unidos' },
];

const REGION_KEY = 'anitracker-tmdb-region';

export function getPreferredRegion() {
  try {
    const stored = localStorage.getItem(REGION_KEY);
    if (stored) return stored;
  } catch { /* empty */ }
  const nav = (typeof navigator !== 'undefined' && navigator.language) || '';
  const m = nav.match(/-([A-Z]{2})$/i);
  return m ? m[1].toUpperCase() : 'AR';
}

export function setPreferredRegion(code) {
  try { localStorage.setItem(REGION_KEY, code); } catch { /* empty */ }
}

async function tmdbFetch(path, params = {}, { signal } = {}) {
  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const init = { signal };
  if (IS_BEARER_TOKEN) init.headers = { Authorization: `Bearer ${API_KEY}` };
  else url.searchParams.set('api_key', API_KEY);
  const res = await fetch(url.toString(), init);
  if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
  return res.json();
}

export async function searchTmdb(query, { signal, limit = 10 } = {}) {
  if (!TMDB_ENABLED) return [];
  const json = await tmdbFetch('/search/multi', {
    query,
    language: 'es-ES',
    include_adult: 'false',
    page: '1',
  }, { signal });
  return (json?.results || [])
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .slice(0, limit)
    .map(toAnime)
    .filter(Boolean);
}

export function toAnime(item) {
  if (!item) return null;
  const isMovie = item.media_type === 'movie';
  const title = (isMovie ? item.title : item.name) || '';
  if (!title) return null;
  const original = (isMovie ? item.original_title : item.original_name) || '';
  const date = (isMovie ? item.release_date : item.first_air_date) || '';
  const genreMap = isMovie ? MOVIE_GENRES : TV_GENRES;
  const type = isMovie ? 'movie' : 'tv';
  return normalizeAnime({
    id: item.id + (isMovie ? TMDB_MOVIE_ID_BASE : TMDB_TV_ID_BASE),
    source: 'TMDB',
    sourceId: item.id,
    sourceKey: `tmdb:${type}:${item.id}`,
    title,
    titleOriginal: original,
    titleJp: '',
    titleEn: original !== title ? original : '',
    altTitles: original && original !== title ? [original] : [],
    image: item.poster_path ? `${TMDB_IMG}/w500${item.poster_path}` : '',
    imageSm: item.poster_path ? `${TMDB_IMG}/w185${item.poster_path}` : '',
    genres: (item.genre_ids || []).map((g) => genreMap[g]).filter(Boolean),
    synopsis: item.overview || '',
    rating: item.vote_average ? Number(Number(item.vote_average).toFixed(1)) : 0,
    episodes: null,
    status: '',
    year: date ? date.split('-')[0] : '',
    type: isMovie ? 'Película' : 'Serie',
    malUrl: `https://www.themoviedb.org/${type}/${item.id}`,
  });
}

/** Parse an app sourceKey ('tmdb:movie:603') into { type, id }, or null. */
export function parseTmdbKey(sourceKey) {
  const m = /^tmdb:(movie|tv):(\d+)$/.exec(sourceKey || '');
  return m ? { type: m[1], id: Number(m[2]) } : null;
}

/**
 * Extract streaming providers (for one region) and a YouTube trailer from a
 * TMDB detail response with append_to_response=videos,watch/providers.
 * Pure and exported for tests.
 */
export function extractExtras(json, region) {
  const byRegion = json?.['watch/providers']?.results?.[region] || {};
  const mapProviders = (list) => (Array.isArray(list) ? list : []).map((p) => ({
    name: p.provider_name || '',
    logo: p.logo_path ? `${TMDB_IMG}/w45${p.logo_path}` : '',
  })).filter((p) => p.name);

  const videos = json?.videos?.results || [];
  const pick = videos.find((v) => v.site === 'YouTube' && v.type === 'Trailer')
    || videos.find((v) => v.site === 'YouTube');
  const trailerUrl = pick?.key ? `https://www.youtube.com/watch?v=${pick.key}` : '';

  return {
    providers: {
      link: byRegion.link || '',
      flatrate: mapProviders(byRegion.flatrate),
      rent: mapProviders(byRegion.rent),
      buy: mapProviders(byRegion.buy),
    },
    trailerUrl,
  };
}

const EXTRAS_CACHE_PREFIX = 'anitracker-tmdb:';
const EXTRAS_TTL_MS = 24 * 60 * 60 * 1000;
const EXTRAS_CACHE_MAX = 80;

function pruneExtrasCache() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(EXTRAS_CACHE_PREFIX)) keys.push(k);
    }
    if (keys.length > EXTRAS_CACHE_MAX) {
      keys.slice(0, keys.length - EXTRAS_CACHE_MAX).forEach((k) => localStorage.removeItem(k));
    }
  } catch { /* empty */ }
}

/**
 * Fetch "where to watch" providers + trailer for a TMDB item, cached in
 * localStorage for a day (availability changes over time).
 */
export async function fetchTmdbExtras(sourceKey, { region = getPreferredRegion(), signal } = {}) {
  const parsed = parseTmdbKey(sourceKey);
  if (!TMDB_ENABLED || !parsed) return null;

  const cacheKey = `${EXTRAS_CACHE_PREFIX}${parsed.type}:${parsed.id}:${region}`;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && Date.now() - cached.ts < EXTRAS_TTL_MS) return cached.data;
    }
  } catch { /* empty */ }

  const json = await tmdbFetch(`/${parsed.type}/${parsed.id}`, {
    language: 'es-ES',
    append_to_response: 'videos,watch/providers',
    include_video_language: 'es,en,null',
  }, { signal });
  const data = extractExtras(json, region);

  try {
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
    pruneExtrasCache();
  } catch { /* empty */ }
  return data;
}
