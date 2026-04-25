import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSeason, fetchTopAnime } from '../services/anilistService';

function currentSeason() {
  const m = new Date().getMonth() + 1;
  const season = m <= 3 ? 'WINTER' : m <= 6 ? 'SPRING' : m <= 9 ? 'SUMMER' : 'FALL';
  return { season, year: new Date().getFullYear() };
}

/**
 * Lazy-loaded "season" and "top anime" data with in-memory caching.
 */
export function useDiscovery() {
  const [selectedSeason, setSelectedSeason] = useState(currentSeason);
  const [seasonAnime, setSeasonAnime] = useState([]);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [topAnime, setTopAnime] = useState([]);
  const [topLoading, setTopLoading] = useState(false);

  const seasonCacheRef = useRef({});
  const topCacheRef = useRef(null);
  const seasonAbortRef = useRef(null);
  const topAbortRef = useRef(null);

  // Cancel any in-flight discovery fetches when the consumer unmounts.
  useEffect(() => () => {
    seasonAbortRef.current?.abort();
    topAbortRef.current?.abort();
  }, []);

  const loadSeason = useCallback(async (s, y) => {
    const key = `${s}-${y}`;
    if (seasonCacheRef.current[key]) { setSeasonAnime(seasonCacheRef.current[key]); return; }
    seasonAbortRef.current?.abort();
    const ctrl = new AbortController();
    seasonAbortRef.current = ctrl;
    setSeasonLoading(true);
    setSeasonAnime([]);
    try {
      const results = await fetchSeason(s, y, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      seasonCacheRef.current[key] = results;
      setSeasonAnime(results);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('[AniTracker] Season fetch failed:', err);
    } finally {
      if (!ctrl.signal.aborted) setSeasonLoading(false);
    }
  }, []);

  const changeSeason = useCallback((s, y) => {
    setSelectedSeason({ season: s, year: y });
    loadSeason(s, y);
  }, [loadSeason]);

  const loadTop = useCallback(async () => {
    if (topCacheRef.current) { setTopAnime(topCacheRef.current); return; }
    topAbortRef.current?.abort();
    const ctrl = new AbortController();
    topAbortRef.current = ctrl;
    setTopLoading(true);
    setTopAnime([]);
    try {
      const results = await fetchTopAnime({ signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      topCacheRef.current = results;
      setTopAnime(results);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('[AniTracker] Top anime fetch failed:', err);
    } finally {
      if (!ctrl.signal.aborted) setTopLoading(false);
    }
  }, []);

  return {
    selectedSeason,
    seasonAnime,
    seasonLoading,
    topAnime,
    topLoading,
    changeSeason,
    loadSeasonCurrent: () => loadSeason(selectedSeason.season, selectedSeason.year),
    loadTop,
  };
}
