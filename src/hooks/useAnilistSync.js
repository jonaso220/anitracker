// Manda el progreso de la biblioteca a AniList (ver services/anilistSync.js).
//
// El hook es solo el borde con React: guarda la biblioteca más reciente en un
// ref y deja que un "motor" (un cierre sin React) haga el trabajo fuera del
// render. Así un cambio en la biblioteca no dispara nada hasta que pasa el
// debounce, y el estado que ve la app solo cambia cuando cambia algo que se
// muestra (conectado, pendientes, error).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ANILIST_AUTH_KEY,
  ANILIST_SYNC_ENABLED,
  beginAnilistLogin,
  clearAnilistSession,
  expireAnilistSession,
  fetchAnilistViewer,
  readAnilistAuth,
  saveAnilistViewer,
} from '../services/anilistAuth';
import {
  AnilistAuthError,
  AnilistRateLimitError,
  baselineOf,
  desiredEntries,
  pendingChanges,
  prunePushed,
  pushChanges,
  readPushed,
  writePushed,
} from '../services/anilistSync';
import { t } from '../i18n';

/** Espera después del último cambio en la biblioteca antes de mandar. */
export const ANILIST_SYNC_DEBOUNCE_MS = 3000;
/** Espera antes de reintentar solo después de un error de red o de AniList. */
export const ANILIST_SYNC_RETRY_MS = 60 * 1000;

const noop = () => {};

const DISABLED = Object.freeze({
  available: false,
  connected: false,
  viewerName: '',
  status: 'idle',
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: '',
  connect: noop,
  disconnect: noop,
  syncNow: noop,
});

const DISCONNECTED = Object.freeze({
  connected: false,
  viewerName: '',
  status: 'idle',
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: '',
});

const expiredMessage = () => t('anilistSync.error.expired', 'Tu sesión de AniList venció. Volvé a conectarla.');

function initialState() {
  const auth = ANILIST_SYNC_ENABLED ? readAnilistAuth() : null;
  if (!auth) return DISCONNECTED;
  const expired = auth.expiresAt <= Date.now();
  return {
    ...DISCONNECTED,
    connected: true,
    viewerName: auth.viewer?.name || '',
    status: expired ? 'expired' : 'idle',
    lastError: expired ? expiredMessage() : '',
  };
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * Motor de la sincronización. `getLibrary()` y `getOptions()` leen siempre lo
 * último (refs del hook) y `patch(cambios)` publica estado hacia React.
 */
function createEngine({ getLibrary, getOptions, patch }) {
  let stopped = false;
  let timer = null;
  let controller = null;
  let running = false;
  let rerun = false;
  // Lo deseado según la última biblioteca vista: sirve para saltear, a mitad de
  // un envío, un cambio que ya quedó viejo.
  let desired = new Map();

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const schedule = (delay) => {
    if (stopped) return;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void pass();
    }, delay);
  };

  async function pass() {
    if (stopped) return;
    if (running) {
      rerun = true;
      desired = desiredEntries(getLibrary());
      return;
    }

    const auth = readAnilistAuth();
    if (!auth) {
      patch(DISCONNECTED);
      return;
    }
    if (auth.expiresAt <= Date.now()) {
      patch({ connected: true, viewerName: auth.viewer?.name || '', status: 'expired', lastError: expiredMessage() });
      return;
    }

    running = true;
    controller = new AbortController();
    const { signal } = controller;
    try {
      let { viewer } = auth;
      if (!viewer) {
        if (isOffline()) return; // el evento `online` relanza
        viewer = await fetchAnilistViewer(auth.token, { signal });
        saveAnilistViewer(viewer);
      }
      patch({ connected: true, viewerName: viewer.name });

      const { ready, scope } = getOptions();
      // Sin la biblioteca definitiva (p. ej. la nube todavía no bajó) no se
      // compara nada: una lista a medio cargar parecería cientos de cambios.
      if (!ready) return;

      const owner = `${viewer.id}|${scope ?? ''}`;
      desired = desiredEntries(getLibrary());
      let pushed = readPushed(owner);
      if (!pushed) {
        // Línea base: recién conectado (u otra cuenta, u otra biblioteca).
        // Lo que hay ahora se da por enviado; solo viaja lo que cambie después.
        writePushed(baselineOf(desired), owner);
        patch({ status: 'idle', pendingCount: 0, lastError: '' });
        return;
      }
      const pruned = prunePushed(pushed, desired);
      if (pruned !== pushed) {
        writePushed(pruned, owner);
        pushed = pruned;
      }

      const pending = pendingChanges(desired, pushed);
      if (pending.length === 0) {
        patch({ status: 'idle', pendingCount: 0, lastError: '' });
        return;
      }
      if (isOffline()) {
        patch({ status: 'idle', pendingCount: pending.length });
        return; // el evento `online` relanza
      }

      let remaining = pending.length;
      patch({ status: 'syncing', pendingCount: remaining, lastError: '' });
      const settle = (change) => {
        // Se relee: otra pestaña pudo haber anotado lo suyo mientras tanto.
        const current = readPushed(owner);
        if (!current) return;
        current[change.key] = change.signature;
        writePushed(current, owner);
        remaining -= 1;
        patch({ pendingCount: remaining });
      };
      const { sent, rejected } = await pushChanges(auth.token, pending, {
        signal,
        isCurrent: (change) => desired.get(change.key)?.signature === change.signature,
        onPushed: settle,
        onRejected: (change, err) => {
          console.error(`[AniTracker] AniList rejected an update for "${change.anime?.title || change.key}":`, err?.message);
          // Se da por resuelto: reintentar lo mismo no lo va a arreglar, y
          // trabaría todo lo que viene atrás. Vuelve a salir si cambia.
          settle(change);
        },
      });
      patch({
        status: rejected > 0 ? 'error' : 'idle',
        pendingCount: remaining,
        lastError: rejected > 0 ? t('anilistSync.error.rejected', 'Cambios que AniList no aceptó: {count}', { count: rejected }) : '',
        ...(sent > 0 ? { lastSyncedAt: Date.now() } : {}),
      });
    } catch (err) {
      if (stopped || signal.aborted || err?.name === 'AbortError') return;
      if (err instanceof AnilistAuthError) {
        expireAnilistSession();
        patch({ status: 'expired', lastError: expiredMessage() });
        return;
      }
      console.error('[AniTracker] AniList sync failed:', err?.message || err?.name);
      if (isOffline()) {
        patch({ status: 'idle' }); // se cortó la red: se retoma con `online`
        return;
      }
      const rateLimited = err instanceof AnilistRateLimitError;
      patch({
        status: 'error',
        lastError: rateLimited
          ? t('anilistSync.error.rateLimit', 'AniList pidió esperar un momento. Se reintenta solo.')
          : t('anilistSync.error.network', 'No se pudo enviar tu progreso a AniList. Se reintenta solo en un rato.'),
      });
      rerun = false;
      schedule(rateLimited ? Math.max(ANILIST_SYNC_RETRY_MS, err.retryAfterMs || 0) : ANILIST_SYNC_RETRY_MS);
    } finally {
      running = false;
      controller = null;
      if (rerun && !stopped) {
        rerun = false;
        schedule(0);
      }
    }
  }

  const abortInFlight = () => {
    rerun = false;
    controller?.abort();
  };

  const onOnline = () => schedule(0);
  // Otra pestaña conectó o desconectó la cuenta: lo que estuviera en vuelo usa
  // un token que quizá ya no vale.
  const onStorage = (event) => {
    if (event.key !== ANILIST_AUTH_KEY && event.key !== null) return;
    abortInFlight();
    schedule(0);
  };

  return {
    start() {
      window.addEventListener('online', onOnline);
      window.addEventListener('storage', onStorage);
      schedule(0);
    },
    stop() {
      stopped = true;
      clearTimer();
      abortInFlight();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('storage', onStorage);
    },
    schedule,
    disconnect() {
      clearTimer();
      abortInFlight();
      clearAnilistSession();
      patch(DISCONNECTED);
    },
  };
}

/**
 * Sincroniza el progreso de la biblioteca hacia AniList.
 *
 * - `schedule`, `watchLater`, `watchedList`: la biblioteca (misma forma que en
 *   `App.jsx`).
 * - `ready` (opcional, por defecto true): pasá false mientras la biblioteca no
 *   sea la definitiva (sesión de Google sin resolver, nube sin bajar). Mientras
 *   sea false no se compara ni se manda nada.
 * - `scope` (opcional): identifica de quién es la biblioteca (p. ej. el uid de
 *   Firebase, `''` para invitado). Si cambia se vuelve a tomar la línea base en
 *   vez de mandar la biblioteca de la otra cuenta como si fueran cambios.
 *
 * Devuelve un objeto memoizado: `{ available, connected, viewerName, status,
 * pendingCount, lastSyncedAt, lastError, connect, disconnect, syncNow }`.
 * `status` es `'idle' | 'syncing' | 'error' | 'expired'`; con `'expired'`
 * `connected` sigue en true (se sabe de quién era la sesión) y hay que volver
 * a conectar. Sin `VITE_ANILIST_CLIENT_ID`, `available` es false y no hace nada.
 */
export function useAnilistSync({ schedule, watchLater, watchedList, ready = true, scope = '' } = {}) {
  const [state, setState] = useState(initialState);
  const libraryRef = useRef(null);
  const optionsRef = useRef({ ready: false, scope: '' });
  const engineRef = useRef(null);

  // Solo se re-renderiza si cambió algo de verdad.
  const patch = useCallback((changes) => {
    setState((prev) => {
      for (const key of Object.keys(changes)) {
        if (prev[key] !== changes[key]) return { ...prev, ...changes };
      }
      return prev;
    });
  }, []);

  // Va antes que el efecto del motor: en el montaje deja la biblioteca en el
  // ref para la primera pasada.
  useEffect(() => {
    libraryRef.current = { schedule, watchLater, watchedList };
    optionsRef.current = { ready, scope };
    engineRef.current?.schedule(ANILIST_SYNC_DEBOUNCE_MS);
  }, [schedule, watchLater, watchedList, ready, scope]);

  useEffect(() => {
    if (!ANILIST_SYNC_ENABLED) return undefined;
    const engine = createEngine({
      getLibrary: () => libraryRef.current || {},
      getOptions: () => optionsRef.current,
      patch,
    });
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, [patch]);

  const connect = useCallback(() => { beginAnilistLogin(); }, []);
  const disconnect = useCallback(() => { engineRef.current?.disconnect(); }, []);
  const syncNow = useCallback(() => { engineRef.current?.schedule(0); }, []);

  return useMemo(
    () => (ANILIST_SYNC_ENABLED ? { available: true, ...state, connect, disconnect, syncNow } : DISABLED),
    [state, connect, disconnect, syncNow],
  );
}
