/**
 * Remove internal flags from anime objects before persisting.
 */
export const clean = (anime) => {
  const rest = { ...anime };
  delete rest._day;
  delete rest._isWatchLater;
  delete rest._isWatched;
  delete rest._isSeason;
  delete rest._isTop;
  delete rest._isCustomList;
  delete rest._customListId;
  return rest;
};

/**
 * Map a watch/streaming URL to a brand badge (label + tint) for the UI.
 */
export const getPlatformInfo = (url) => {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes('crunchyroll.com')) return { label: 'CR', name: 'Crunchyroll', color: '#f47521' };
  if (u.includes('netflix.com'))      return { label: 'N',  name: 'Netflix',     color: '#e50914' };
  if (u.includes('hidive.com'))       return { label: 'HD', name: 'HIDIVE',      color: '#00aeef' };
  if (u.includes('funimation.com'))   return { label: 'FN', name: 'Funimation',  color: '#5828c2' };
  if (u.includes('hulu.com'))         return { label: 'H',  name: 'Hulu',        color: '#1ce783' };
  if (u.includes('disneyplus.com'))   return { label: 'D+', name: 'Disney+',     color: '#0063e5' };
  if (u.includes('primevideo.com') || u.includes('amazon.')) return { label: 'PV', name: 'Prime Video', color: '#00a8e1' };
  if (u.includes('hbomax.com') || u.includes('max.com'))     return { label: 'MAX', name: 'Max',        color: '#8b5cf6' };
  if (u.includes('tv.apple.com'))     return { label: 'TV+', name: 'Apple TV+',   color: '#a6a6a6' };
  if (u.includes('jkanime.net'))      return { label: 'JK', name: 'JKAnime',     color: '#a855f7' };
  if (u.includes('animeflv'))         return { label: 'FLV',name: 'AnimeFLV',    color: '#4ecdc4' };
  if (u.includes('youtube.com') || u.includes('youtu.be')) return { label: 'YT', name: 'YouTube', color: '#ff0000' };
  return { label: '▶', name: 'Ver', color: '#22c55e' };
};

/**
 * Pick a default watch link for an anime from its known streaming links,
 * preferring Spanish-language ones. Returns '' when there's nothing to pick.
 */
export const pickAutoWatchLink = (anime) => {
  if (anime?.watchLink) return anime.watchLink;
  const links = (anime?.streamingLinks || []).filter((l) => l && l.url);
  if (links.length === 0) return '';
  const spanish = links.find((l) => /spanish|español/i.test(l.language || ''));
  return (spanish || links[0]).url;
};

/**
 * Human-friendly "when does the next episode air" label, in Spanish:
 * '¡Ya disponible!', 'En 2h 15m', 'Mañana', or the weekday name ('Sábado').
 */
export const formatAiringWhen = (airing) => {
  if (!airing) return '';
  if (airing.hasAired) return '¡Ya disponible!';
  if (airing.isToday) {
    const hours = Math.floor(airing.timeUntilAiring / 3600);
    const mins = Math.floor((airing.timeUntilAiring % 3600) / 60);
    return hours > 0 ? `En ${hours}h ${mins}m` : `En ${mins}m`;
  }
  if (airing.isTomorrow) return 'Mañana';
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return dayNames[new Date(airing.airingAt * 1000).getDay()];
};

/**
 * Full air date of the next episode ('Sábado, 12 de julio, 14:30').
 * `airingAt` is a unix timestamp in seconds (AniList format).
 */
export const formatAiringDate = (airingAt) => {
  const d = new Date(airingAt * 1000);
  const date = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `${date.charAt(0).toUpperCase()}${date.slice(1)}, ${time}`;
};

/**
 * Relative "time since" label in Spanish: 'hace 3 min', 'hace 2 horas',
 * 'hace 5 días', 'hace 3 semanas', 'hace 2 meses'.
 * `unixSec` is a unix timestamp in seconds (AniList format).
 */
export const formatTimeAgo = (unixSec) => {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - unixSec));
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `hace ${Math.max(1, mins)} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} día${days > 1 ? 's' : ''}`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return `hace ${weeks} semana${weeks > 1 ? 's' : ''}`;
  const months = Math.floor(days / 30);
  return `hace ${months} mes${months > 1 ? 'es' : ''}`;
};

/**
 * Filter a list of anime by local search query (accent-insensitive, case-insensitive).
 */
export const filterByLocalSearch = (list, localSearch) => {
  if (!localSearch.trim()) return list;
  const q = localSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return list.filter(a => {
    const titles = [a.title, a.titleJp, a.titleEn, a.titleOriginal].filter(Boolean);
    return titles.some(t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q));
  });
};

/**
 * Apply a minimum-rating filter and an optional rating-desc sort to a list.
 * Items without a rating count as 0 and are kept only when minRating is 0.
 */
export const applyRatingFilter = (list, { minRating = 0, sortByRating = false } = {}) => {
  let out = list;
  if (minRating > 0) out = out.filter((a) => (a.rating || 0) >= minRating);
  if (sortByRating) out = [...out].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  return out;
};

/**
 * Filter and sort the watched list based on filter, sort, and search criteria.
 */
export const getFilteredWatched = (watchedList, watchedFilter, watchedSort, localSearch) => {
  let list = [...watchedList];
  if (watchedFilter === 'finished') list = list.filter(a => a.finished);
  else if (watchedFilter === 'dropped') list = list.filter(a => !a.finished);
  list = filterByLocalSearch(list, localSearch);
  if (watchedSort === 'date') list.sort((a, b) => new Date(b.finishedDate || b.droppedDate || 0) - new Date(a.finishedDate || a.droppedDate || 0));
  else if (watchedSort === 'rating') list.sort((a, b) => (b.userRating || 0) - (a.userRating || 0));
  else if (watchedSort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
  return list;
};

/**
 * Parse episode count from various input types.
 */
export const parseEpisodes = (val) => {
  if (val === null || val === undefined || val === '?' || val === '') return null;
  const n = parseInt(val);
  return isNaN(n) || n <= 0 ? null : n;
};

/**
 * Simple string hash (for generating stable IDs from strings).
 */
export const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
  return Math.abs(hash) % 100000;
};

const BACKUP_APP_ID = 'anitracker';
const BACKUP_SCHEMA_VERSION = 2;

/**
 * Build a portable, serializable backup object from the user's data.
 * `now` is injectable so the result can be made deterministic in tests.
 */
export const buildBackup = (
  { schedule = {}, watchedList = [], watchLater = [], customLists = [] } = {},
  now = new Date().toISOString(),
) => ({
  app: BACKUP_APP_ID,
  schemaVersion: BACKUP_SCHEMA_VERSION,
  exportedAt: now,
  data: { schedule, watchedList, watchLater, customLists },
});

/**
 * Parse and validate a backup JSON string. Accepts both the wrapped shape
 * ({ app, data: {...} }) and a raw data object ({ schedule, ... }).
 * Returns normalized { schedule, watchedList, watchLater, customLists }.
 * Throws an Error with a user-facing (Spanish) message on invalid input.
 */
export const parseBackup = (jsonString) => {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('El archivo no tiene un formato reconocible.');
  }
  const container = (parsed.data && typeof parsed.data === 'object') ? parsed.data : parsed;
  const keys = ['schedule', 'watchedList', 'watchLater', 'customLists'];
  if (!keys.some((k) => k in container)) {
    throw new Error('El archivo no contiene datos de AniTracker.');
  }
  const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const asArray = (v) => (Array.isArray(v) ? v : []);
  return {
    schedule: isPlainObject(container.schedule) ? container.schedule : {},
    watchedList: asArray(container.watchedList),
    watchLater: asArray(container.watchLater),
    customLists: asArray(container.customLists),
  };
};
