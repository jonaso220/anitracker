import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { daysOfWeek } from '../constants';
import { searchAnime } from '../services/searchAnime';
import { fetchAiringByIds, anilistIdsOf } from '../services/anilistService';
import { fetchVikiAiringInfo, vikiIdOf } from '../services/vikiService';
import { fetchTvmazeAiringInfo, tvmazeIdOf } from '../services/tvmazeService';
import { fetchTmdbAiringInfo, tmdbTvIdOf, TMDB_ENABLED } from '../services/tmdbService';
import { refreshAiringInfo, isAiringStale } from '../utils';

const AIRING_CACHE_KEY = 'anitracker-airing-cache';
const AIRING_TIME_KEY = 'anitracker-airing-time';
const AIRING_IDS_KEY = 'anitracker-airing-ids';
// Sube cuando cambian los ids internos (el cache guarda la info por id interno).
const AIRING_CACHE_FORMAT = 'v2';
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
  const ids = [
    ...malIds.map((id) => `m${id}`), ...anilistIds.map((id) => `a${id}`), ...vikiIds,
    ...unique(tvmazeRefs).map((id) => `t${id}`), ...unique(tmdbRefs).map((id) => `d${id}`),
  ].sort().join(',');
  const key = ids ? `${AIRING_CACHE_FORMAT}:${ids}` : '';
  return { refs, malIds, anilistIds, vikiIds, tvmazeRefs, tmdbRefs, key };
}

const NO_AIRING = {};

// Cada cuánto se recalcula "En 2h 15m" / "¡Ya disponible!" con la app abierta.
const AIRING_TICK_MS = 60 * 1000;

const hasTimedAiring = (data) => Object.values(data).some((info) => Number.isFinite(info?.airingAt));

// Lo que bajó de la red guarda la foto del momento del fetch: los campos que
// dependen de la hora se recalculan contra `now` (misma forma, mismos ids).
function deriveAiring(data, now) {
  if (data === NO_AIRING || !hasTimedAiring(data)) return data;
  const at = new Date(now);
  const out = {};
  for (const [id, info] of Object.entries(data)) out[id] = refreshAiringInfo(info, at);
  return out;
}

// Un episodio que ya pasó y dejó de contar como "disponible" es info vieja:
// hace falta bajar el siguiente.
const hasStaleAiring = (data) => Object.values(data).some((info) => isAiringStale(info));

export function useAnimeData(schedule) {
  const [searchQuery, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchPartial, setSearchPartial] = useState([]);
  // Solo lo que devuelve la red; el resto (semana vacía, cache fresca) se deriva.
  // `at`: cuándo llegó, para no recalcular contra un reloj más viejo que el dato.
  const [fetchedAiring, setFetchedAiring] = useState({ key: null, data: NO_AIRING, error: null, at: 0 });
  const [airingRetry, setAiringRetry] = useState(0);
  // Pedido de revisar la cache (vuelta a primer plano, episodio vencido): el
  // efecto solo consulta si la cache de esta semana ya no está fresca.
  const [airingRefresh, setAiringRefresh] = useState(0);
  // Reloj de la info de emisión: avanza de a minuto mientras la app se ve.
  const [now, setNow] = useState(() => Date.now());

  const searchDebounceRef = useRef(null);
  const searchIdRef = useRef(0);
  const searchAbortRef = useRef(null);
  const airingDebounceRef = useRef(null);
  // { key, controller } del pedido de emisión en curso (o en el debounce).
  const airingInFlightRef = useRef(null);
  const airingForceRef = useRef(false);
  // Último intento de consulta (ok o no): limita los reintentos automáticos.
  const airingAttemptRef = useRef(0);

  // --- Airing info ---
  const request = useMemo(() => airingRequest(schedule), [schedule]);
  // El efecto depende solo de `request.key`: cada edición de la biblioteca
  // (+1, nota, arrastrar) crea otro `request` con los mismos ids y no debe
  // abortar ni reiniciar las consultas. El pedido vigente se lee por ref.
  const requestRef = useRef(request);
  useEffect(() => { requestRef.current = request; }, [request]);
  const cachedAiring = useMemo(() => (request.key ? readAiringCache() : null), [request.key]);

  // Lo que se muestra: la respuesta de la red para esta semana; si no hay,
  // la cache fresca de esta misma semana; y mientras se consulta, lo último
  // que haya (los datos van por id, así que siguen valiendo para lo que quedó).
  let rawAiring = fetchedAiring.data;
  let airingError = fetchedAiring.error;
  if (!request.key) {
    rawAiring = NO_AIRING;
    airingError = null;
  } else if (fetchedAiring.key !== request.key && cachedAiring) {
    if (cachedAiring.fresh && cachedAiring.ids === request.key) {
      rawAiring = cachedAiring.data;
      airingError = null;
    } else if (fetchedAiring.key === null) {
      rawAiring = cachedAiring.data;
    }
  }
  // Misma identidad mientras no cambien los datos ni pase el minuto: las
  // tarjetas están en React.memo y reciben `airingData` entero.
  // Al minuto, como un reloj de pared: a las 10:01 un estreno de las 12:00 es
  // "En 1h 59m" durante todo ese minuto.
  const latest = Math.max(now, rawAiring === fetchedAiring.data ? fetchedAiring.at : 0);
  const clock = latest - (latest % AIRING_TICK_MS);
  const airingData = useMemo(() => deriveAiring(rawAiring, clock), [rawAiring, clock]);
  const ticking = rawAiring !== NO_AIRING && hasTimedAiring(rawAiring);

  // ¿Conviene volver a consultar? Solo si la cache de esta semana venció y el
  // último intento fue hace más que el TTL (un error no reintenta en bucle).
  const rawAiringRef = useRef(rawAiring);
  useEffect(() => { rawAiringRef.current = rawAiring; }, [rawAiring]);
  const maybeRefreshAiring = useCallback(({ onlyIfStale }) => {
    const { key } = requestRef.current;
    if (!key) return;
    if (onlyIfStale && !hasStaleAiring(rawAiringRef.current)) return;
    const cached = readAiringCache();
    if (cached?.fresh && cached.ids === key) return;
    if (Date.now() - airingAttemptRef.current < AIRING_TTL_MS) return;
    setAiringRefresh((value) => value + 1);
  }, []);

  // Tic de minuto (alineado al cambio de minuto) mientras hay algo con hora y
  // el documento está visible. Al volver a primer plano se actualiza al
  // instante y, si la cache venció, se vuelve a consultar.
  useEffect(() => {
    let timer = null;
    const scheduleTick = () => {
      clearTimeout(timer);
      if (!ticking || document.visibilityState === 'hidden') return;
      timer = setTimeout(() => {
        setNow(Date.now());
        maybeRefreshAiring({ onlyIfStale: true });
        scheduleTick();
      }, AIRING_TICK_MS - (Date.now() % AIRING_TICK_MS) + 50);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (ticking) setNow(Date.now());
        maybeRefreshAiring({ onlyIfStale: false });
      }
      scheduleTick();
    };
    scheduleTick();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ticking, maybeRefreshAiring]);

  useEffect(() => {
    const { key } = requestRef.current;
    const inFlight = airingInFlightRef.current;
    const forced = airingForceRef.current;
    airingForceRef.current = false;
    if (!key) {
      if (airingDebounceRef.current) clearTimeout(airingDebounceRef.current);
      inFlight?.controller.abort();
      airingInFlightRef.current = null;
      return;
    }
    // Ya se está consultando esta misma semana: que termine.
    if (!forced && inFlight?.key === key) return;
    const cached = readAiringCache();
    if (!forced && cached?.fresh && cached.ids === key) return;

    if (airingDebounceRef.current) clearTimeout(airingDebounceRef.current);
    inFlight?.controller.abort();
    const controller = new AbortController();
    const current = { key, controller };
    airingInFlightRef.current = current;
    const done = () => { if (airingInFlightRef.current === current) airingInFlightRef.current = null; };

    airingDebounceRef.current = setTimeout(async () => {
      airingAttemptRef.current = Date.now();
      // Los ids de la semana no cambiaron (misma key): vale el pedido más reciente.
      const { refs, malIds, anilistIds, vikiIds, tvmazeRefs, tmdbRefs } = requestRef.current;
      const toError = (err) => ({ kind: !navigator.onLine ? 'offline' : String(err?.message).includes('429') ? 'rate-limit' : 'service' });
      try {
        // Todas las fuentes en paralelo: si una falla se muestra lo de las
        // otras, con el aviso de reintento y sin cachear. Lo mismo si una
        // fuente respondió solo por algunas series (p. ej. un 429 de TVMaze).
        const signal = controller.signal;
        const partial = [];
        const onPartialFailure = (err) => { partial.push(err); };
        const tvmazeIds = [...new Set(tvmazeRefs.map((r) => r.sourceId))];
        const tmdbIds = [...new Set(tmdbRefs.map((r) => r.sourceId))];
        const settled = await Promise.allSettled([
          ...(refs.length ? [fetchAiringByIds({ malIds, anilistIds, signal }).then((res) => airingByAppId(refs, res))] : []),
          ...(vikiIds.length ? [fetchVikiAiringInfo({ vikiIds, signal, onPartialFailure })] : []),
          ...(tvmazeIds.length ? [fetchTvmazeAiringInfo({ tvmazeIds, signal, onPartialFailure }).then((res) => bySourceId(tvmazeRefs, res))] : []),
          ...(tmdbIds.length ? [fetchTmdbAiringInfo({ tmdbIds, signal, onPartialFailure }).then((res) => bySourceId(tmdbRefs, res))] : []),
        ]);
        const failed = settled.filter((s) => s.status === 'rejected');
        if (failed.length === settled.length) throw failed[0].reason;
        if (!controller.signal.aborted) {
          const data = Object.assign({}, ...settled.map((s) => (s.status === 'fulfilled' ? s.value : {})));
          const problems = [...failed.map((s) => s.reason), ...partial];
          if (problems.length === 0) {
            setFetchedAiring({ key, data, error: null, at: Date.now() });
            writeAiringCache(data, key);
          } else {
            console.error('[AniTracker] Partial airing check failed:', problems[0]);
            setFetchedAiring({ key, data, error: toError(problems[0]), at: Date.now() });
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[AniTracker] Airing check failed:', err);
          // Se conserva lo que ya se mostraba, con el aviso de reintento.
          setFetchedAiring((prev) => ({ key, data: prev.key === null ? (cached?.data || NO_AIRING) : prev.data, error: toError(err), at: Date.now() }));
        }
      } finally {
        done();
      }
    }, 1000);
  }, [request.key, airingRetry, airingRefresh]);

  // Al desmontar se corta lo que esté en curso (y se olvida, así el montaje
  // doble de StrictMode vuelve a pedir en vez de esperar un pedido abortado).
  useEffect(() => () => {
    if (airingDebounceRef.current) clearTimeout(airingDebounceRef.current);
    airingInFlightRef.current?.controller.abort();
    airingInFlightRef.current = null;
  }, []);

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
