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
 *
 * Hay dos clases de pedido: el visible (la temporada que el usuario tiene en
 * pantalla, `loadSeason`) y la precarga (`prefetchCurrentSeason`, que solo
 * calienta la cache). La precarga nunca toca el estado: si el usuario ya eligió
 * otra temporada, no la pisa ni la aborta. Si los dos piden la misma
 * temporada, comparten el fetch en vuelo.
 */
export function useDiscovery() {
  const [selectedSeason, setSelectedSeason] = useState(currentSeason);
  const [seasonAnime, setSeasonAnime] = useState([]);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [seasonError, setSeasonError] = useState(null);

  const seasonCacheRef = useRef({});
  // key → { promise, ctrl, prefetch }: fetches en vuelo, compartidos.
  const inFlightRef = useRef(new Map());
  // La temporada que se muestra (la última que pidió la UI).
  const visibleKeyRef = useRef(null);

  // Cancel any in-flight discovery fetches when the consumer unmounts.
  useEffect(() => {
    const inFlight = inFlightRef.current;
    return () => {
      inFlight.forEach((entry) => entry.ctrl.abort());
      inFlight.clear();
    };
  }, []);

  // Resultados ya bajados (memoria o copia persistente de la vigente), o null.
  const cachedSeason = useCallback((key, isCurrent) => {
    const cached = seasonCacheRef.current[key];
    if (cached && (!isCurrent || Date.now() - cached.at < CURRENT_SEASON_TTL_MS)) return cached.results;
    if (isCurrent) {
      const stored = readCache(SEASON_CACHE_KEY, CURRENT_SEASON_TTL_MS);
      if (stored?.key === key && Array.isArray(stored.results)) {
        seasonCacheRef.current[key] = { results: stored.results, at: Date.now() };
        return stored.results;
      }
    }
    return null;
  }, []);

  // Un solo fetch por temporada aunque lo pidan la precarga y la pestaña.
  const fetchShared = useCallback((s, y, key, isCurrent) => {
    const existing = inFlightRef.current.get(key);
    if (existing && !existing.ctrl.signal.aborted) return existing;
    const ctrl = new AbortController();
    const entry = { ctrl, prefetch: false, promise: null };
    entry.promise = fetchSeason(s, y, { signal: ctrl.signal, current: isCurrent })
      .then((results) => {
        if (ctrl.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        seasonCacheRef.current[key] = { results, at: Date.now() };
        if (isCurrent) writeCache(SEASON_CACHE_KEY, { key, results });
        return results;
      })
      .finally(() => {
        if (inFlightRef.current.get(key) === entry) inFlightRef.current.delete(key);
      });
    inFlightRef.current.set(key, entry);
    return entry;
  }, []);

  const loadSeason = useCallback(async (s, y) => {
    const key = `${s}-${y}`;
    const cur = currentSeason();
    const isCurrent = cur.season === s && cur.year === y;
    const previousKey = visibleKeyRef.current;
    visibleKeyRef.current = key;
    // Cambió la temporada en pantalla: lo que se pedía para la anterior ya no
    // hace falta, salvo que sea la precarga (esa la necesita la pestaña).
    if (previousKey && previousKey !== key) {
      const previous = inFlightRef.current.get(previousKey);
      if (previous && !previous.prefetch) previous.ctrl.abort();
    }
    const cached = cachedSeason(key, isCurrent);
    if (cached) {
      setSeasonAnime(cached);
      setSeasonLoading(false);
      setSeasonError(null);
      return;
    }
    const entry = fetchShared(s, y, key, isCurrent);
    setSeasonLoading(true);
    setSeasonError(null);
    setSeasonAnime([]);
    try {
      const results = await entry.promise;
      if (visibleKeyRef.current !== key) return;
      setSeasonAnime(results);
      setSeasonLoading(false);
    } catch (err) {
      // Otra temporada pasó a primer plano (o se desmontó): no es un error.
      if (visibleKeyRef.current !== key || err?.name === 'AbortError') return;
      console.error('[AniTracker] Season fetch failed:', err);
      setSeasonError({ kind: !navigator.onLine ? 'offline' : String(err?.message).includes('429') ? 'rate-limit' : 'service' });
      setSeasonLoading(false);
    }
  }, [cachedSeason, fetchShared]);

  const changeSeason = useCallback((s, y) => {
    setSelectedSeason({ season: s, year: y });
    loadSeason(s, y);
  }, [loadSeason]);

  // Precarga en segundo plano de la temporada vigente (para que la pestaña
  // abra al toque); idempotente gracias al cache y al dedupe de in-flight.
  // Solo calienta la cache: nunca cambia lo que se muestra ni aborta lo que
  // el usuario pidió (p. ej. si ya eligió otra temporada antes de que corra).
  const prefetchCurrentSeason = useCallback(() => {
    const { season, year } = currentSeason();
    const key = `${season}-${year}`;
    if (cachedSeason(key, true)) return;
    const entry = fetchShared(season, year, key, true);
    entry.prefetch = true;
    entry.promise.catch(() => { /* la pestaña muestra el error si lo pide */ });
  }, [cachedSeason, fetchShared]);

  const loadSelectedSeason = useCallback(
    () => loadSeason(selectedSeason.season, selectedSeason.year),
    [loadSeason, selectedSeason],
  );

  return {
    selectedSeason,
    seasonAnime,
    seasonLoading,
    seasonError,
    changeSeason,
    loadSeasonCurrent: loadSelectedSeason,
    prefetchCurrentSeason,
    retrySeason: loadSelectedSeason,
  };
}
