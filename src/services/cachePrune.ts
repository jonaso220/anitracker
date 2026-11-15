/**
 * Tope de entradas para caches en localStorage con prefijo (traducciones,
 * extras de TMDB…). Borra primero las más viejas por momento de escritura, y
 * nunca la que se acaba de escribir: antes se borraba en el orden de
 * `localStorage.key()`, que no está garantizado y podía llevarse justo esa.
 */

export interface PruneLocalCacheOptions {
  /** Prefijo de las claves de esta cache. */
  prefix: string;
  /** Cuántas entradas conservar como máximo. */
  max: number;
  /** Clave recién escrita: nunca se borra. */
  keep?: string;
  /**
   * Momento de escritura (ms) de una entrada a partir de su valor guardado, o
   * null si no se sabe (cuenta como la más vieja). Por defecto lee `ts` o `at`
   * de un JSON.
   */
  stampOf?: (raw: string | null, key: string) => number | null;
  /**
   * Para caches de texto plano (sin fecha en el valor): clave de un índice
   * `{ clave: ms }` que este helper mantiene. Registra `keep` con la hora
   * actual y lo usa en vez de `stampOf`.
   */
  indexKey?: string;
  /** Inyectable para tests. */
  now?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `ts` (o `at`) de un valor JSON, o null. */
export const jsonStamp = (raw: string | null): number | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const stamp = parsed.ts ?? parsed.at;
    return typeof stamp === 'number' && Number.isFinite(stamp) ? stamp : null;
  } catch {
    return null;
  }
};

function readIndex(indexKey: string): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(indexKey) || '{}');
    if (!isRecord(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Borra las entradas más viejas que sobran. Devuelve cuántas borró. */
export function pruneLocalCache({
  prefix, max, keep, stampOf = jsonStamp, indexKey, now = Date.now(),
}: PruneLocalCacheOptions): number {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix) && key !== indexKey) keys.push(key);
    }

    const index = indexKey ? readIndex(indexKey) : null;
    if (index && keep) index[keep] = now;

    let removed = 0;
    if (keys.length > max) {
      const stamp = (key: string): number => {
        const value = index ? index[key] : stampOf(localStorage.getItem(key), key);
        return typeof value === 'number' ? value : Number.NEGATIVE_INFINITY;
      };
      // Más viejas primero; a igual fecha, por clave (determinista).
      const candidates = keys
        .filter((key) => key !== keep)
        .map((key) => ({ key, at: stamp(key) }))
        .sort((a, b) => a.at - b.at || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      for (const { key } of candidates.slice(0, keys.length - max)) {
        localStorage.removeItem(key);
        if (index) delete index[key];
        removed += 1;
      }
    }

    if (index && indexKey) {
      // Solo lo que sigue existiendo: el índice no crece solo.
      const alive = new Set(keys);
      for (const key of Object.keys(index)) if (!alive.has(key) && key !== keep) delete index[key];
      localStorage.setItem(indexKey, JSON.stringify(index));
    }
    return removed;
  } catch {
    return 0;
  }
}
