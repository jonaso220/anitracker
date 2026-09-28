import { useState, useRef, useEffect, useCallback } from 'react';
import { daysOfWeek } from '../constants';
import { searchAnime } from '../services/searchAnime';
import { fetchAiringByIds, anilistIdsOf } from '../services/anilistService';
import { fetchVikiAiringInfo, vikiIdOf } from '../services/vikiService';

const AIRING_CACHE_KEY = 'anitracker-airing-cache';
const AIRING_TIME_KEY = 'anitracker-airing-time';
const AIRING_IDS_KEY = 'anitracker-airing-ids';
const AIRING_TTL_MS = 15 * 60 * 1000;
const SEARCH_DEBOUNCE_MS = 500;

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

function readAiringCache(currentIds) {
  try {
    const cached = localStorage.getItem(AIRING_CACHE_KEY);
    const cachedTime = localStorage.getItem(AIRING_TIME_KEY);
    const cachedIds = localStorage.getItem(AIRING_IDS_KEY) || '';
    const fresh = cached && cachedTime && Date.now() - parseInt(cachedTime, 10) < AIRING_TTL_MS;
    if (fresh && cachedIds === currentIds) return JSON.parse(cached);
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

export function useAnimeData(schedule) {
  const [searchQuery, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchPartial, setSearchPartial] = useState([]);
  const [airingData, setAiringData] = useState({});
  const [airingError, setAiringError] = useState(null);
  const [airingRetry, setAiringRetry] = useState(0);

  const searchDebounceRef = useRef(null);
  const searchIdRef = useRef(0);
  const searchAbortRef = useRef(null);
  const airingDebounceRef = useRef(null);
  const airingAbortRef = useRef(null);
  const airingForceRef = useRef(false);

  // --- Airing info ---
  useEffect(() => {
    const allAnime = daysOfWeek.flatMap((d) => schedule[d] || []);
    // Por fuente (sourceKey), no por rango de id: AniList sin MAL ya pasa de 400000.
    const refs = allAnime
      .map((a) => ({ appId: a.id, ...anilistIdsOf(a) }))
      .filter((r) => r.anilistId || r.malId);
    const anilistIds = [...new Set(refs.map((r) => r.anilistId).filter(Boolean))];
    const malIds = [...new Set(refs.filter((r) => !r.anilistId).map((r) => r.malId))];
    const vikiIds = [...new Set(allAnime.filter((a) => a.type !== 'Película').map(vikiIdOf).filter(Boolean))];

    if (malIds.length === 0 && anilistIds.length === 0 && vikiIds.length === 0) { setAiringData({}); setAiringError(null); return; }

    const currentIds = [...malIds.map((id) => `m${id}`), ...anilistIds.map((id) => `a${id}`), ...vikiIds].sort().join(',');
    const cached = readAiringCache(currentIds);
    if (cached && !airingForceRef.current) { setAiringData(cached); setAiringError(null); return; }
    airingForceRef.current = false;

    if (airingDebounceRef.current) clearTimeout(airingDebounceRef.current);
    if (airingAbortRef.current) airingAbortRef.current.abort();
    const controller = new AbortController();
    airingAbortRef.current = controller;

    airingDebounceRef.current = setTimeout(async () => {
      const toError = (err) => ({ kind: !navigator.onLine ? 'offline' : String(err?.message).includes('429') ? 'rate-limit' : 'service' });
      try {
        // AniList y Viki en paralelo: si una falla se muestra lo de la otra,
        // con el aviso de reintento y sin cachear.
        const settled = await Promise.allSettled([
          ...(refs.length ? [fetchAiringByIds({ malIds, anilistIds, signal: controller.signal }).then((res) => airingByAppId(refs, res))] : []),
          ...(vikiIds.length ? [fetchVikiAiringInfo({ vikiIds, signal: controller.signal })] : []),
        ]);
        const failed = settled.filter((s) => s.status === 'rejected');
        if (failed.length === settled.length) throw failed[0].reason;
        if (!controller.signal.aborted) {
          const data = Object.assign({}, ...settled.map((s) => (s.status === 'fulfilled' ? s.value : {})));
          setAiringData(data);
          if (failed.length === 0) {
            setAiringError(null);
            writeAiringCache(data, currentIds);
          } else {
            console.error('[AniTracker] Partial airing check failed:', failed[0].reason);
            setAiringError(toError(failed[0].reason));
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[AniTracker] Airing check failed:', err);
          setAiringError(toError(err));
        }
      }
    }, 1000);

    return () => {
      if (airingDebounceRef.current) clearTimeout(airingDebounceRef.current);
      controller.abort();
    };
  }, [schedule, airingRetry]);

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
      const { results, failedApis } = await searchAnime(query, { signal: controller.signal });
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
    retryAiring: () => { airingForceRef.current = true; setAiringRetry((value) => value + 1); },
    handleSearch,
    performSearch,
  };
}
