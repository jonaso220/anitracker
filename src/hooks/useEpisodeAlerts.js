// Avisos de episodio nuevo: mantiene al día la lista que lee el service worker
// (ver `episodeAlerts.ts`). No devuelve nada ni guarda estado de React, así que
// no re-renderiza a nadie.
import { useEffect, useRef } from 'react';
import {
  alertsPermission,
  buildEpisodeAlerts,
  clearAlerts,
  nextAlertAt,
  publishAlerts,
  registerPeriodicAlerts,
  requestAlertsCheck,
  unregisterPeriodicAlerts,
} from '../episodeAlerts';

// setTimeout guarda el retraso en 32 bits con signo: más que esto dispara ya.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
// Margen para que, cuando el service worker compare contra su reloj, el
// episodio ya figure como emitido.
const TIMER_SLACK_MS = 1000;

/**
 * `enabled`: la preferencia del usuario. Solo se avisa si además el navegador
 * dio permiso de notificaciones.
 *
 * - Publica la lista cuando cambia (no en cada tick de `airingData`).
 * - Al pasar de apagado a prendido publica con `baseline`: lo que ya salió se
 *   da por avisado, sin una tanda de notificaciones viejas.
 * - Un timer hasta el próximo episodio le pide la revisión al service worker,
 *   para que el aviso salga a horario aunque `airingData` no cambie.
 * - Al apagarse borra la lista y la revisión periódica.
 * - `activated`: el hook se montó porque el usuario acaba de prender los avisos
 *   (se carga en un chunk aparte): cuenta como "pasar de apagado a prendido".
 */
export function useEpisodeAlerts({ schedule, airingData, enabled, activated = false }) {
  // mode: 'init' (todavía no corrió) | 'on' | 'off' | 'waiting' (prendido pero
  // sin permiso). `published` es la última lista publicada, serializada.
  const stateRef = useRef({ mode: 'init', published: null, periodic: false, queue: Promise.resolve() });

  useEffect(() => {
    const state = stateRef.current;
    // En orden: un "apagar" seguido de un "prender" no puede cruzarse.
    const enqueue = (task) => {
      state.queue = state.queue.then(task).catch(() => {});
      return state.queue;
    };

    if (!enabled) {
      if (state.mode !== 'off') {
        state.mode = 'off';
        state.published = null;
        state.periodic = false;
        enqueue(clearAlerts);
        enqueue(unregisterPeriodicAlerts);
      }
      return undefined;
    }
    if (alertsPermission() !== 'granted') {
      state.mode = 'waiting';
      return undefined;
    }

    // Arrancar con los avisos ya prendidos no es "activarlos": ahí sí se
    // muestra lo que salió con la app cerrada.
    const baseline = state.mode === 'off' || state.mode === 'waiting' || (state.mode === 'init' && activated);
    state.mode = 'on';

    const alerts = buildEpisodeAlerts(schedule, airingData, Date.now());
    const serialized = JSON.stringify(alerts);
    if (baseline || serialized !== state.published) {
      state.published = serialized;
      enqueue(() => publishAlerts(alerts, { baseline })).then((ok) => {
        // No se pudo guardar: que el próximo cambio lo reintente.
        if (ok === false && state.published === serialized) state.published = null;
      });
    }
    if (!state.periodic) {
      state.periodic = true;
      enqueue(registerPeriodicAlerts);
    }

    let timer = null;
    const arm = () => {
      const next = nextAlertAt(alerts, Date.now());
      if (next === null) return;
      const delay = Math.min(next - Date.now() + TIMER_SLACK_MS, MAX_TIMEOUT_MS);
      timer = setTimeout(() => {
        // Si el retraso se recortó todavía no es la hora: solo se rearma.
        if (Date.now() >= next) requestAlertsCheck();
        arm();
      }, delay);
    };
    arm();

    // Al volver de segundo plano o de una suspensión el timer puede haberse
    // atrasado: se revisa en el momento.
    const onVisible = () => {
      if (document.visibilityState === 'visible') requestAlertsCheck();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [schedule, airingData, enabled, activated]);

  // Tocar una notificación con la app ya abierta: el service worker enfoca la
  // ventana y manda a dónde ir (un hash de la propia app, p. ej. `#/semana`).
  useEffect(() => {
    const container = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!container?.addEventListener) return undefined;
    const onMessage = (event) => {
      if (event.data?.type !== 'OPEN_URL' || typeof event.data.url !== 'string') return;
      try {
        const target = new URL(event.data.url, window.location.origin);
        if (target.origin !== window.location.origin || !target.hash) return;
        if (window.location.hash !== target.hash) window.location.hash = target.hash;
      } catch { /* url inválida: se ignora */ }
    };
    container.addEventListener('message', onMessage);
    return () => container.removeEventListener('message', onMessage);
  }, []);
}
