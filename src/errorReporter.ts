// Reporte de errores opt-in, sin dependencias.
//
// Se activa solo si existe `VITE_ERROR_REPORT_URL` (ver `.env.example`). Sin esa
// variable no se manda nada y el costo en el bundle es el de este archivo.
//
// Está pensado para apuntarlo a un endpoint propio (una función serverless, un
// webhook) que reciba un POST JSON. Si preferís Sentry u otro servicio, el
// camino es cargar su SDK de forma diferida cuando haya DSN; no se hace acá
// para no sumar ~40 kB gzip al presupuesto por una función que puede estar
// apagada, ni forzar un chunk que se emite siempre.

export type ErrorKind = 'error' | 'unhandledrejection' | 'boundary';

export interface ErrorReport {
  app: 'anitracker';
  kind: ErrorKind;
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  at: string;
}

/** Tope de reportes por sesión: un error en un render se repite sin parar. */
export const MAX_PER_SESSION = 10;

const endpointOf = (): string => {
  try { return String(import.meta.env?.VITE_ERROR_REPORT_URL ?? '').trim(); } catch { return ''; }
};

/** ¿Hay un endpoint configurado? Si no, todo lo demás es un no-op. */
export const errorReportingEnabled = (): boolean => endpointOf() !== '';

let sent = 0;
const seen = new Set<string>();

/** Solo para tests: limpia el contador y el deduplicado de la sesión. */
export function resetErrorReporter(): void {
  sent = 0;
  seen.clear();
}

const messageOf = (error: unknown): string => {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error) ?? String(error); } catch { return String(error); }
};

const stackOf = (error: unknown): string | undefined =>
  error instanceof Error && typeof error.stack === 'string' ? error.stack : undefined;

function send(url: string, report: ErrorReport): void {
  const body = JSON.stringify(report);
  try {
    const beacon = globalThis.navigator?.sendBeacon;
    // `sendBeacon` es lo mejor cuando la página se está cerrando (unhandledrejection
    // durante un unload); si no está o falla, sigue el fetch con keepalive.
    if (typeof beacon === 'function' && beacon.call(globalThis.navigator, url, body)) return;
  } catch { /* cae al fetch */ }
  try {
    const request = globalThis.fetch?.(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
    void request?.catch(() => { /* best-effort */ });
  } catch { /* best-effort */ }
}

/**
 * Manda un reporte si hay endpoint configurado. Nunca lanza, tiene tope por
 * sesión y deduplica por mensaje+stack.
 */
export function reportError(kind: ErrorKind, error: unknown, extra: { componentStack?: string } = {}): void {
  const url = endpointOf();
  if (!url || sent >= MAX_PER_SESSION) return;
  const message = messageOf(error);
  const stack = stackOf(error);
  const key = `${kind}:${message}:${(stack ?? extra.componentStack ?? '').slice(0, 200)}`;
  if (seen.has(key)) return;
  seen.add(key);
  sent += 1;
  send(url, {
    app: 'anitracker',
    kind,
    message,
    ...(stack ? { stack } : {}),
    ...(extra.componentStack ? { componentStack: extra.componentStack } : {}),
    url: globalThis.location?.href ?? '',
    at: new Date().toISOString(),
  });
}

/**
 * Engancha los errores globales que React no ve (promesas rechazadas y errores
 * fuera del árbol). Devuelve la función para desenganchar.
 */
export function installGlobalErrorHandlers(): () => void {
  if (!errorReportingEnabled()) return () => {};
  const onError = (event: ErrorEvent) => reportError('error', event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => reportError('unhandledrejection', event.reason);
  globalThis.addEventListener('error', onError as EventListener);
  globalThis.addEventListener('unhandledrejection', onRejection as EventListener);
  return () => {
    globalThis.removeEventListener('error', onError as EventListener);
    globalThis.removeEventListener('unhandledrejection', onRejection as EventListener);
  };
}
