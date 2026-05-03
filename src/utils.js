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
