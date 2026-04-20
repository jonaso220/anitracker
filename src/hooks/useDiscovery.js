import { useCallback, useRef, useState } from 'react';
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

  const loadSeason = useCallback(async (s, y) => {
    const key = `${s}-${y}`;
    if (seasonCacheRef.current[key]) { setSeasonAnime(seasonCacheRef.current[key]); return; }
    setSeasonLoading(true);
    setSeasonAnime([]);
    try {
      const results = await fetchSeason(s, y);
      seasonCacheRef.current[key] = results;
      setSeasonAnime(results);
    } catch (err) {
      console.error('[AniTracker] Season fetch failed:', err);
    } finally {
      setSeasonLoading(false);
    }
  }, []);

  const changeSeason = useCallback((s, y) => {
    setSelectedSeason({ season: s, year: y });
    loadSeason(s, y);
  }, [loadSeason]);

  const loadTop = useCallback(async () => {
    if (topCacheRef.current) { setTopAnime(topCacheRef.current); return; }
    setTopLoading(true);
    setTopAnime([]);
    try {
      const results = await fetchTopAnime();
      topCacheRef.current = results;
      setTopAnime(results);
    } catch (err) {
      console.error('[AniTracker] Top anime fetch failed:', err);
    } finally {
      setTopLoading(false);
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
