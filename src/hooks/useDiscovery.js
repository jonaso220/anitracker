import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSeason, fetchTopAnime } from '../services/anilistService';

function currentSeason() {
  const m = new Date().getMonth() + 1;
  const season = m <= 3 ? 'WINTER' : m <= 6 ? 'SPRING' : m <= 9 ? 'SUMMER' : 'FALL';
  return { season, year: new Date().getFullYear() };
}

// La temporada en curso trae info de emisión ("último capítulo hace X"), que
// caduca rápido; las demás temporadas son estáticas y se cachean para siempre.
const CURRENT_SEASON_TTL_MS = 15 * 60 * 1000;

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
    const cur = currentSeason();
    const isCurrent = cur.season === s && cur.year === y;
    const cached = seasonCacheRef.current[key];
    if (cached && (!isCurrent || Date.now() - cached.at < CURRENT_SEASON_TTL_MS)) {
      setSeasonAnime(cached.results);
      return;
    }
    seasonAbortRef.current?.abort();
    const ctrl = new AbortController();
    seasonAbortRef.current = ctrl;
    setSeasonLoading(true);
    setSeasonAnime([]);
    try {
      const results = await fetchSeason(s, y, { signal: ctrl.signal, current: isCurrent });
      if (ctrl.signal.aborted) return;
      seasonCacheRef.current[key] = { results, at: Date.now() };
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
