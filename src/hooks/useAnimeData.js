import { useState, useRef, useEffect, useCallback } from 'react';
import { daysOfWeek } from '../constants';
import { searchAnime } from '../services/searchAnime';
import { fetchAiringInfo } from '../services/anilistService';

const AIRING_CACHE_KEY = 'anitracker-airing-cache';
const AIRING_TIME_KEY = 'anitracker-airing-time';
const AIRING_IDS_KEY = 'anitracker-airing-ids';
const AIRING_TTL_MS = 15 * 60 * 1000;
const SEARCH_DEBOUNCE_MS = 500;

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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchPartial, setSearchPartial] = useState([]);
  const [airingData, setAiringData] = useState({});

  const searchDebounceRef = useRef(null);
  const searchIdRef = useRef(0);
  const searchAbortRef = useRef(null);
  const airingDebounceRef = useRef(null);
  const airingAbortRef = useRef(null);

  // --- Airing info ---
  useEffect(() => {
    const allAnime = daysOfWeek.flatMap((d) => schedule[d] || []);
    const malIds = allAnime.filter((a) => a.id && a.id < 100000).map((a) => a.id);
    const anilistIds = allAnime.filter((a) => a.id >= 300000 && a.id < 400000).map((a) => a.id - 300000);

    if (malIds.length === 0 && anilistIds.length === 0) { setAiringData({}); return; }

    const currentIds = [...malIds, ...anilistIds].sort().join(',');
    const cached = readAiringCache(currentIds);
    if (cached) { setAiringData(cached); return; }

    if (airingDebounceRef.current) clearTimeout(airingDebounceRef.current);
    if (airingAbortRef.current) airingAbortRef.current.abort();
    const controller = new AbortController();
    airingAbortRef.current = controller;

    airingDebounceRef.current = setTimeout(async () => {
      try {
        const data = await fetchAiringInfo({ malIds, anilistIds, signal: controller.signal });
        if (!controller.signal.aborted) {
          setAiringData(data);
          writeAiringCache(data, currentIds);
        }
      } catch (err) {
        if (err.name !== 'AbortError') console.error('[AniTracker] Airing check failed:', err);
      }
    }, 1000);

    return () => {
      if (airingDebounceRef.current) clearTimeout(airingDebounceRef.current);
      controller.abort();
    };
  }, [schedule]);

  // --- Search ---
  const performSearch = useCallback(async (query) => {
    if (!query || query.length < 2) { setSearchResults([]); setSearchPartial([]); return; }
    const id = ++searchIdRef.current;

    // Cancel previous in-flight search
    if (searchAbortRef.current) searchAbortRef.current.abort();
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
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => performSearch(query), SEARCH_DEBOUNCE_MS);
  }, [performSearch]);

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
    handleSearch,
    performSearch,
  };
}
