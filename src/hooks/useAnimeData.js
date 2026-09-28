import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { daysOfWeek } from '../constants';
import { searchAnime } from '../services/searchAnime';
import { fetchAiringByIds, anilistIdsOf } from '../services/anilistService';
import { fetchVikiAiringInfo, vikiIdOf } from '../services/vikiService';
import { fetchTvmazeAiringInfo, tvmazeIdOf } from '../services/tvmazeService';
import { fetchTmdbAiringInfo, tmdbTvIdOf, TMDB_ENABLED } from '../services/tmdbService';

const AIRING_CACHE_KEY = 'anitracker-airing-cache';
const AIRING_TIME_KEY = 'anitracker-airing-time';
const AIRING_IDS_KEY = 'anitracker-airing-ids';
const AIRING_TTL_MS = 15 * 60 * 1000;
const SEARCH_DEBOUNCE_MS = 500;

// { [idDeFuente]: info } → { [idInterno]: info }.
const bySourceId = (refs, data) => Object.fromEntries(refs.filter((r) => data[r.sourceId]).map((r) => [r.appId, data[r.sourceId]]));

// Asocia la respuesta de AniList (por id de AniList o de MAL) a los ids
// internos de la biblioteca.
function airingByAppId(refs, { byAnilist, byMal }) {
  const out = {};
  for (const { appId, anilistId, malId } of refs) {
    const info = (anilistId && byAnilist[anilistId]) || (malId && byMal[malId]);
    if (info) out[appId] = info;
  }
  return out;
}

// Último resultado guardado, fresco o no: `ids` dice para qué biblioteca era.
function readAiringCache() {
  try {
    const cached = localStorage.getItem(AIRING_CACHE_KEY);
    const cachedTime = localStorage.getItem(AIRING_TIME_KEY);
    if (!cached || !cachedTime) return null;
    return {
      data: JSON.parse(cached),
      ids: localStorage.getItem(AIRING_IDS_KEY) || '',
      fresh: Date.now() - parseInt(cachedTime, 10) < AIRING_TTL_MS,
    };
  } catch { /* empty */ }
  return null;
}

function writeAiringCache(data, currentIds) {
  try {
    localStorage.setItem(AIRING_CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(AIRING_TIME_KEY, Date.now().toString());
    localStorage.setItem(AIRING_IDS_KEY, currentIds);
  } catch { /* empty */ }
}

// Qué hay que consultar para la semana actual. `key` identifica el conjunto de
// ids (vacío = nada que consultar).
function airingRequest(schedule) {
  const allAnime = daysOfWeek.flatMap((d) => schedule[d] || []);
  // Por fuente (sourceKey), no por rango de id: AniList sin MAL ya pasa de 400000.
  const refs = allAnime
    .map((a) => ({ appId: a.id, ...anilistIdsOf(a) }))
    .filter((r) => r.anilistId || r.malId);
  const anilistIds = [...new Set(refs.map((r) => r.anilistId).filter(Boolean))];
  const malIds = [...new Set(refs.filter((r) => !r.anilistId).map((r) => r.malId))];
  const series = allAnime.filter((a) => a.type !== 'Película');
  const vikiIds = [...new Set(series.map(vikiIdOf).filter(Boolean))];
  // TVMaze y TMDB responden por su propio id: se guarda a qué id interno va.
  const sourceRefs = (idOf) => series.map((a) => ({ appId: a.id, sourceId: idOf(a) })).filter((r) => r.sourceId);
  const tvmazeRefs = sourceRefs(tvmazeIdOf);
  const tmdbRefs = TMDB_ENABLED ? sourceRefs(tmdbTvIdOf) : [];
  const unique = (list) => [...new Set(list.map((r) => r.sourceId))];
  const key = [
    ...malIds.map((id) => `m${id}`), ...anilistIds.map((id) => `a${id}`), ...vikiIds,
    ...unique(tvmazeRefs).map((id) => `t${id}`), ...unique(tmdbRefs).map((id) => `d${id}`),
  ].sort().join(',');
  return { refs, malIds, anilistIds, vikiIds, tvmazeRefs, tmdbRefs, key };
}

const NO_AIRING = {};

export function useAnimeData(schedule) {
  const [searchQuery, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchPartial, setSearchPartial] = useState([]);
  // Solo lo que devuelve la red; el resto (semana vacía, cache fresca) se deriva.
  const [fetchedAiring, setFetchedAiring] = useState({ key: null, data: NO_AIRING, error: null });
  const [airingRetry, setAiringRetry] = useState(0);

  const searchDebounceRef = useRef(null);
  const searchIdRef = useRef(0);
  const searchAbortRef = useRef(null);
  const airingDebounceRef = useRef(null);
  const airingAbortRef = useRef(null);
  const airingForceRef = useRef(false);

  // --- Airing info ---
  const request = useMemo(() => airingRequest(schedule), [schedule]);
  const cachedAiring = useMemo(() => (request.key ? readAiringCache() : null), [request.key]);

  // Lo que se muestra: la respuesta de la red para esta semana; si no hay,
  // la cache fresca de esta misma semana; y mientras se consulta, lo último
  // que haya (los datos van por id, así que siguen valiendo para lo que quedó).
  let airingData = fetchedAiring.data;
  let airingError = fetchedAiring.error;
  if (!request.key) {
    airingData = NO_AIRING;
    airingError = null;
  } else if (fetchedAiring.key !== request.key && cachedAiring) {
    if (cachedAiring.fresh && cachedAiring.ids === request.key) {
      airingData = cachedAiring.data;
      airingError = null;
    } else if (fetchedAiring.key === null) {
      airingData = cachedAiring.data;
    }
  }

  useEffect(() => {
    const { refs, malIds, anilistIds, vikiIds, tvmazeRefs, tmdbRefs, key } = request;
    if (!key) return;
    const cached = readAiringCache();
    if (cached?.fresh && cached.ids === key && !airingForceRef.current) return;
    airingForceRef.current = false;

    if (airingDebounceRef.current) clearTimeout(airingDebounceRef.current);
    if (airingAbortRef.current) airingAbortRef.current.abort();
    const controller = new AbortController();
    airingAbortRef.current = controller;

    airingDebounceRef.current = setTimeout(async () => {
      const toError = (err) => ({ kind: !navigator.onLine ? 'offline' : String(err?.message).includes('429') ? 'rate-limit' : 'service' });
      try {
        // Todas las fuentes en paralelo: si una falla se muestra lo de las
        // otras, con el aviso de reintento y sin cachear.
        const signal = controller.signal;
        const tvmazeIds = [...new Set(tvmazeRefs.map((r) => r.sourceId))];
        const tmdbIds = [...new Set(tmdbRefs.map((r) => r.sourceId))];
        const settled = await Promise.allSettled([
          ...(refs.length ? [fetchAiringByIds({ malIds, anilistIds, signal }).then((res) => airingByAppId(refs, res))] : []),
          ...(vikiIds.length ? [fetchVikiAiringInfo({ vikiIds, signal })] : []),
          ...(tvmazeIds.length ? [fetchTvmazeAiringInfo({ tvmazeIds, signal }).then((res) => bySourceId(tvmazeRefs, res))] : []),
          ...(tmdbIds.length ? [fetchTmdbAiringInfo({ tmdbIds, signal }).then((res) => bySourceId(tmdbRefs, res))] : []),
        ]);
        const failed = settled.filter((s) => s.status === 'rejected');
        if (failed.length === settled.length) throw failed[0].reason;
        if (!controller.signal.aborted) {
          const data = Object.assign({}, ...settled.map((s) => (s.status === 'fulfilled' ? s.value : {})));
          if (failed.length === 0) {
            setFetchedAiring({ key, data, error: null });
            writeAiringCache(data, key);
          } else {
            console.error('[AniTracker] Partial airing check failed:', failed[0].reason);
            setFetchedAiring({ key, data, error: toError(failed[0].reason) });
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[AniTracker] Airing check failed:', err);
          // Se conserva lo que ya se mostraba, con el aviso de reintento.
          setFetchedAiring((prev) => ({ key, data: prev.key === null ? (cached?.data || NO_AIRING) : prev.data, error: toError(err) }));
        }
      }
    }, 1000);

    return () => {
      if (airingDebounceRef.current) clearTimeout(airingDebounceRef.current);
      controller.abort();
    };
  }, [request, airingRetry]);

  // --- Search ---
  const setSearchQuery = useCallback((query) => {
    // Invalidate immediately, including during the debounce and on modal close.
    searchIdRef.current += 1;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchAbortRef.current?.abort();
    setQuery(query);
    setSearchResults([]);
    setSearchPartial([]);
    setIsSearching(false);
  }, []);

  const performSearch = useCallback(async (query) => {
    const id = ++searchIdRef.current;

    // Cancel previous in-flight search
    if (searchAbortRef.current) searchAbortRef.current.abort();
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      setSearchPartial([]);
      setIsSearching(false);
      return;
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);
    try {
      const { results, failedApis } = await searchAnime(query, {
        signal: controller.signal,
        // Mostrar lo que ya llegó sin esperar a la API más lenta.
        onProgress: (partial) => {
          if (id === searchIdRef.current && !controller.signal.aborted) setSearchResults(partial);
        },
      });
      if (id === searchIdRef.current && !controller.signal.aborted) {
        setSearchResults(results);
        setSearchPartial(failedApis);
      }
    } catch (err) {
      if (err.name !== 'AbortError' && id === searchIdRef.current) {
        console.error('[AniTracker] Search error:', err);
        setSearchResults([]);
        setSearchPartial([]);
      }
    } finally {
      if (id === searchIdRef.current) setIsSearching(false);
    }
  }, []);

  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    if (query.trim().length >= 2) {
      searchDebounceRef.current = setTimeout(() => performSearch(query), SEARCH_DEBOUNCE_MS);
    }
  }, [performSearch, setSearchQuery]);

  const retryAiring = useCallback(() => {
    airingForceRef.current = true;
    setAiringRetry((value) => value + 1);
  }, []);

  // Clean up any pending work on unmount
  useEffect(() => () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (searchAbortRef.current) searchAbortRef.current.abort();
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    isSearching,
    searchPartial,
    airingData,
    airingError,
    retryAiring,
    handleSearch,
    performSearch,
  };
}
