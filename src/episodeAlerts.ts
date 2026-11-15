// Avisos de "salió un episodio nuevo", sin servidor.
//
// Los horarios de emisión se conocen con días de anticipación, así que la
// página arma la lista de avisos pendientes, la deja en Cache Storage (lo único
// que comparten la página y el service worker sin abrir IndexedDB) y el service
// worker muestra las notificaciones. El mismo camino sirve con la pestaña en
// segundo plano y, donde existe Periodic Background Sync (PWA instalada en
// Chrome/Android), con la app cerrada. En el resto de los navegadores los
// avisos solo salen mientras la app está abierta.
import { t } from './i18n';
import { trackingAiring } from './tracking';
import type { AiringInfo, Schedule } from './types/anime';

/** Un aviso pendiente, con la forma que lee `public/sw.js`. */
export interface EpisodeAlert {
  /** `${id}:${temporada || 0}:${episodio}`: un aviso por episodio. */
  key: string;
  animeId: number;
  /** Momento del aviso, unix en segundos (10:00 local si solo hay fecha). */
  airingAt: number;
  title: string;
  body: string;
  image: string;
}

export type AlertsPermission = 'granted' | 'denied' | 'default' | 'unsupported';

/** Emisión por id de anime, como la entrega `useAnimeData`. */
export type AiringMap = Record<string, AiringInfo | undefined>;

// Compartidos con public/sw.js: si cambian acá, cambian allá.
export const ALERTS_CACHE = 'anitracker-alerts';
export const ALERTS_URL = '/__alerts.json';
export const ALERTS_SYNC_TAG = 'anitracker-alerts';

export const ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_ALERTS = 100;
/** Con solo fecha (TMDB) no se sabe la hora: se avisa a media mañana. */
export const DATE_ONLY_HOUR = 10;
const PERIODIC_MIN_INTERVAL_MS = 60 * 60 * 1000;

/** Momento del aviso en ms: la hora de emisión, o las 10:00 locales si solo hay fecha. */
export function alertTimeMs(airing: Pick<AiringInfo, 'airingAt' | 'dateOnly'>): number {
  const at = airing.airingAt * 1000;
  if (!airing.dateOnly) return at;
  const day = new Date(at);
  day.setHours(DATE_ONLY_HOUR, 0, 0, 0);
  return day.getTime();
}

/**
 * Avisos pendientes de la semana: un episodio por anime que no esté en pausa,
 * cuya emisión sea de la temporada que se sigue y que todavía no se haya visto.
 * Entran los que faltan y los que salieron hace menos de 24 h. Pura.
 */
export function buildEpisodeAlerts(
  schedule: Schedule | null | undefined,
  airingData: AiringMap | null | undefined,
  nowMs: number,
): EpisodeAlert[] {
  if (!schedule || !airingData) return [];
  const byKey = new Map<string, EpisodeAlert>();
  for (const list of Object.values(schedule)) {
    if (!Array.isArray(list)) continue;
    for (const anime of list) {
      if (!anime || anime.paused) continue;
      const airing = trackingAiring(anime, airingData[anime.id]);
      if (!airing) continue;
      const { episode, season } = airing;
      if (typeof airing.airingAt !== 'number' || !Number.isFinite(airing.airingAt)) continue;
      if (typeof episode !== 'number' || !Number.isFinite(episode)) continue;
      if ((anime.currentEp || 0) >= episode) continue;
      const atMs = alertTimeMs(airing);
      if (atMs <= nowMs - ALERT_WINDOW_MS) continue;
      const key = `${anime.id}:${season || 0}:${episode}`;
      if (byKey.has(key)) continue; // el mismo anime en dos días de la semana
      byKey.set(key, {
        key,
        animeId: anime.id,
        airingAt: Math.round(atMs / 1000),
        title: anime.title || airing.title || t('alerts.title', 'Episodio nuevo'),
        body: season
          ? t('alerts.bodySeason', 'Salió el T{season} · Ep. {episode}', { season, episode })
          : t('alerts.body', 'Salió el episodio {episode}', { episode }),
        image: anime.imageSm || anime.image || '',
      });
    }
  }
  return [...byKey.values()]
    .sort((a, b) => a.airingAt - b.airingAt || a.key.localeCompare(b.key))
    .slice(0, MAX_ALERTS);
}

/** Momento (ms) del próximo aviso todavía futuro, o `null` si no queda ninguno. */
export function nextAlertAt(alerts: readonly EpisodeAlert[], nowMs: number): number | null {
  let next: number | null = null;
  for (const alert of alerts) {
    const at = alert.airingAt * 1000;
    if (at > nowMs && (next === null || at < next)) next = at;
  }
  return next;
}

// --- Pegamento con el navegador (todo best-effort: nunca tira) ---

/** ¿Hay con qué avisar? Hace falta `Notification` y un service worker. */
export function alertsSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof Notification !== 'undefined'
    && typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator;
}

export function alertsPermission(): AlertsPermission {
  if (!alertsSupported()) return 'unsupported';
  try {
    const { permission } = Notification;
    return permission === 'granted' || permission === 'denied' ? permission : 'default';
  } catch {
    return 'unsupported';
  }
}

/** Pide permiso (tiene que venir de un gesto del usuario). Devuelve cómo quedó. */
export async function requestAlertsPermission(): Promise<AlertsPermission> {
  if (!alertsSupported()) return 'unsupported';
  try {
    await new Promise<void>((resolve, reject) => {
      // Safari viejo solo acepta el callback y no devuelve una promesa.
      const pending: Promise<unknown> | undefined = Notification.requestPermission(() => resolve());
      if (pending && typeof pending.then === 'function') pending.then(() => resolve(), reject);
    });
  } catch { /* se informa el permiso que haya quedado */ }
  return alertsPermission();
}

const canPublish = (): boolean =>
  typeof caches !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

/**
 * Le pide al service worker que revise los avisos guardados. Con `baseline`
 * marca los que ya vencieron como avisados **sin** mostrarlos.
 */
export async function requestAlertsCheck({ baseline = false }: { baseline?: boolean } = {}): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) return false;
    registration.active.postMessage({ type: 'CHECK_ALERTS', baseline });
    return true;
  } catch {
    return false;
  }
}

/**
 * Guarda la lista donde la lee el service worker y le pide que la revise.
 * `baseline: true` se usa al activar los avisos, para que no salga una tanda
 * de notificaciones viejas. Sin Cache Storage o sin service worker no hace nada.
 */
export async function publishAlerts(
  alerts: readonly EpisodeAlert[],
  { baseline = false }: { baseline?: boolean } = {},
): Promise<boolean> {
  if (!canPublish()) return false;
  try {
    const cache = await caches.open(ALERTS_CACHE);
    await cache.put(ALERTS_URL, new Response(JSON.stringify(alerts), {
      headers: { 'content-type': 'application/json' },
    }));
    return await requestAlertsCheck({ baseline });
  } catch {
    return false;
  }
}

/**
 * Borra la lista guardada (avisos apagados). Se va la cache entera, con el
 * registro de lo ya avisado: al reactivar, `baseline` lo vuelve a armar.
 */
export async function clearAlerts(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    return await caches.delete(ALERTS_CACHE);
  } catch {
    return false;
  }
}

/** Periodic Background Sync: no está en los tipos del DOM de TypeScript. */
interface PeriodicSyncManager {
  register(tag: string, options?: { minInterval: number }): Promise<void>;
  unregister(tag: string): Promise<void>;
}

const periodicSyncOf = (registration: ServiceWorkerRegistration): PeriodicSyncManager | undefined =>
  // Cast seguro: solo se lee una propiedad opcional que Chrome agrega al
  // registro; si no existe queda `undefined` y no se usa.
  (registration as ServiceWorkerRegistration & { periodicSync?: PeriodicSyncManager }).periodicSync;

async function periodicSyncDenied(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({
      // Cast: el nombre existe en Chrome pero no en `PermissionName` del DOM;
      // donde no existe `query` rechaza y se intenta registrar igual.
      name: 'periodic-background-sync' as PermissionName,
    });
    return status.state === 'denied';
  } catch {
    return false;
  }
}

/**
 * Revisión periódica con la app cerrada (PWA instalada en Chrome/Android).
 * Devuelve si quedó registrada; en el resto de los navegadores es un no-op.
 */
export async function registerPeriodicAlerts(): Promise<boolean> {
  if (alertsPermission() !== 'granted') return false;
  try {
    const periodicSync = periodicSyncOf(await navigator.serviceWorker.ready);
    if (!periodicSync || await periodicSyncDenied()) return false;
    await periodicSync.register(ALERTS_SYNC_TAG, { minInterval: PERIODIC_MIN_INTERVAL_MS });
    return true;
  } catch {
    return false;
  }
}

export async function unregisterPeriodicAlerts(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const periodicSync = periodicSyncOf(await navigator.serviceWorker.ready);
    if (!periodicSync) return false;
    await periodicSync.unregister(ALERTS_SYNC_TAG);
    return true;
  } catch {
    return false;
  }
}
