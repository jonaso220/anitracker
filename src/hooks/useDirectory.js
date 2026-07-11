import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDirectory } from '../services/anilistService';
import { readCache, writeCache } from '../utils';

export const DIRECTORY_DEFAULT_FILTERS = {
  search: '',
  genre: '',
  demography: '',
  format: '',
  status: '',
  year: '',
  season: '',
  sort: 'POPULARITY_DESC',
};

const SEARCH_DEBOUNCE_MS = 450;
const FILTERS_STORAGE_KEY = 'anitracker-directory-filters';
// Primera página cacheada (por combinación de filtros) para abrir al instante.
const RESULTS_CACHE_KEY = 'anitracker-directory-cache';
const RESULTS_CACHE_TTL_MS = 30 * 60 * 1000;

// Los filtros elegidos persisten entre sesiones; el texto de búsqueda no
// (una búsqueda vieja al reabrir la app confunde más de lo que ayuda).
function readStoredFilters() {
  const filters = { ...DIRECTORY_DEFAULT_FILTERS };
  try {
    const parsed = JSON.parse(localStorage.getItem(FILTERS_STORAGE_KEY));
    for (const key of Object.keys(filters)) {
      if (key !== 'search' && typeof parsed?.[key] === 'string') filters[key] = parsed[key];
    }
    if (!filters.sort) filters.sort = DIRECTORY_DEFAULT_FILTERS.sort;
  } catch { /* empty */ }
  return filters;
}

function writeStoredFilters(filters) {
  try {
    const rest = { ...filters };
    delete rest.search;
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(rest));
  } catch { /* empty */ }
}

/**
 * Catálogo navegable ("Directorio"): una página de resultados que crece con
 * "cargar más" y se resetea al cambiar cualquier filtro. La búsqueda por texto
 * se debouncea; el resto de los filtros dispara el fetch al instante.
 */
export function useDirectory() {
  const [filters, setFilters] = useState(readStoredFilters);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [error, setError] = useState(null);

  const filtersRef = useRef(filters);
  const pageRef = useRef(1);
  const loadedRef = useRef(false);
  const abortRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const fetchPage = useCallback(async (f, page, append) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    if (append) setLoadingMore(true);
    else { setLoading(true); setResults([]); setError(null); }
    try {
      const { results: fetched, hasNextPage: more } = await fetchDirectory(f, { signal: ctrl.signal, page });
      if (ctrl.signal.aborted) return;
      pageRef.current = page;
      setHasNextPage(more);
      if (page === 1 && !append) {
        writeCache(RESULTS_CACHE_KEY, { filtersKey: JSON.stringify(f), results: fetched, hasNextPage: more });
      }
      setResults((prev) => {
        if (!append) return fetched;
        // AniList puede repetir items entre páginas si el orden cambió entre requests
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...fetched.filter((a) => !seen.has(a.id))];
      });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('[AniTracker] Directory fetch failed:', err);
      setError({ kind: !navigator.onLine ? 'offline' : String(err?.message).includes('429') ? 'rate-limit' : 'service' });
    } finally {
      if (!ctrl.signal.aborted) { setLoading(false); setLoadingMore(false); }
    }
  }, []);

  const applyFilters = useCallback((next, { debounce = false } = {}) => {
    filtersRef.current = next;
    setFilters(next);
    writeStoredFilters(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (debounce) {
      debounceRef.current = setTimeout(() => fetchPage(next, 1, false), SEARCH_DEBOUNCE_MS);
    } else {
      fetchPage(next, 1, false);
    }
  }, [fetchPage]);

  const updateFilter = useCallback((key, value) => {
    applyFilters({ ...filtersRef.current, [key]: value }, { debounce: key === 'search' });
  }, [applyFilters]);

  const resetFilters = useCallback(() => {
    applyFilters({ ...DIRECTORY_DEFAULT_FILTERS });
  }, [applyFilters]);

  // Primera visita a la pestaña; las siguientes reusan lo ya cargado.
  // Si la primera página de estos mismos filtros está cacheada, pinta al
  // instante sin red. También sirve como precarga en segundo plano.
  const loadInitial = useCallback(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const stored = readCache(RESULTS_CACHE_KEY, RESULTS_CACHE_TTL_MS);
    if (stored?.filtersKey === JSON.stringify(filtersRef.current) && Array.isArray(stored.results)) {
      pageRef.current = 1;
      setResults(stored.results);
      setHasNextPage(!!stored.hasNextPage);
      return;
    }
    fetchPage(filtersRef.current, 1, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    fetchPage(filtersRef.current, pageRef.current + 1, true);
  }, [fetchPage]);

  const retry = useCallback(() => fetchPage(filtersRef.current, 1, false), [fetchPage]);
  return { filters, results, loading, loadingMore, hasNextPage, error, retry, updateFilter, resetFilters, loadInitial, loadMore };
}
