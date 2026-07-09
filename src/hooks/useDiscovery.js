import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSeason } from '../services/anilistService';
import { readCache, writeCache } from '../utils';

function currentSeason() {
  const m = new Date().getMonth() + 1;
  const season = m <= 3 ? 'WINTER' : m <= 6 ? 'SPRING' : m <= 9 ? 'SUMMER' : 'FALL';
  return { season, year: new Date().getFullYear() };
}

// La temporada en curso trae info de emisión ("último capítulo hace X"), que
// caduca rápido; las demás temporadas son estáticas y se cachean para siempre.
const CURRENT_SEASON_TTL_MS = 15 * 60 * 1000;
// Copia persistente de la temporada actual: pinta al instante entre sesiones
// en vez de esperar los fetches (solo se guarda una temporada, la vigente).
const SEASON_CACHE_KEY = 'anitracker-season-cache';

/**
 * Lazy-loaded "season" data with in-memory caching.
 */
export function useDiscovery() {
  const [selectedSeason, setSelectedSeason] = useState(currentSeason);
  const [seasonAnime, setSeasonAnime] = useState([]);
  const [seasonLoading, setSeasonLoading] = useState(false);

  const seasonCacheRef = useRef({});
  const seasonAbortRef = useRef(null);
  const seasonLoadingKeyRef = useRef(null);

  // Cancel any in-flight discovery fetches when the consumer unmounts.
  useEffect(() => () => {
    seasonAbortRef.current?.abort();
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
    if (isCurrent) {
      const stored = readCache(SEASON_CACHE_KEY, CURRENT_SEASON_TTL_MS);
      if (stored?.key === key && Array.isArray(stored.results)) {
        seasonCacheRef.current[key] = { results: stored.results, at: Date.now() };
        setSeasonAnime(stored.results);
        return;
      }
    }
    // Ya hay un fetch en vuelo para esta misma clave (p. ej. la precarga):
    // dejarlo terminar en vez de abortarlo y empezar de cero.
    if (seasonLoadingKeyRef.current === key) return;
    seasonLoadingKeyRef.current = key;
    seasonAbortRef.current?.abort();
    const ctrl = new AbortController();
    seasonAbortRef.current = ctrl;
    setSeasonLoading(true);
    setSeasonAnime([]);
    try {
      const results = await fetchSeason(s, y, { signal: ctrl.signal, current: isCurrent });
      if (ctrl.signal.aborted) return;
      seasonCacheRef.current[key] = { results, at: Date.now() };
      if (isCurrent) writeCache(SEASON_CACHE_KEY, { key, results });
      setSeasonAnime(results);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('[AniTracker] Season fetch failed:', err);
    } finally {
      if (!ctrl.signal.aborted) setSeasonLoading(false);
      if (seasonLoadingKeyRef.current === key) seasonLoadingKeyRef.current = null;
    }
  }, []);

  const changeSeason = useCallback((s, y) => {
    setSelectedSeason({ season: s, year: y });
    loadSeason(s, y);
  }, [loadSeason]);

  // Precarga en segundo plano de la temporada vigente (para que la pestaña
  // abra al toque); idempotente gracias al cache y al dedupe de in-flight.
  const prefetchCurrentSeason = useCallback(() => {
    const cur = currentSeason();
    loadSeason(cur.season, cur.year);
  }, [loadSeason]);

  return {
    selectedSeason,
    seasonAnime,
    seasonLoading,
    changeSeason,
    loadSeasonCurrent: () => loadSeason(selectedSeason.season, selectedSeason.year),
    prefetchCurrentSeason,
  };
}
