import { es } from './es';

/**
 * Helper de i18n. Hoy solo hay `es`, pero la indirección `t(key)` permite sumar
 * idiomas sin tocar los componentes.
 *
 * - **Interpolación**: `t('x', undefined, { count: 3 })` reemplaza `{count}`.
 * - **Plurales**: un valor `{ one, other }` se elige por `count` (1 → `one`).
 * - **Registro**: `registerLocale(id, dict)` suma un idioma y `setLocale` lo activa.
 * - Si la clave no está, se usa el `fallback` y después la propia clave: un
 *   string nuevo nunca desaparece de la UI.
 */

/** Valor plural: `count === 1` usa `one`, cualquier otro usa `other`. */
export interface Plural {
  one: string;
  other: string;
}

export type TranslationValue = string | Plural;
export type Dictionary = Record<string, TranslationValue>;
export type TranslateParams = Record<string, string | number | undefined>;

const DEFAULT_LOCALE = 'es';
const locales: Record<string, Dictionary> = { [DEFAULT_LOCALE]: es };
let current = DEFAULT_LOCALE;

/** Idiomas registrados. */
export const availableLocales = (): string[] => Object.keys(locales);

/** Idioma activo. */
export const getLocale = (): string => current;

/** Registra (o reemplaza) un idioma. */
export function registerLocale(id: string, dictionary: Dictionary): void {
  locales[id] = dictionary;
}

/** Cambia el idioma activo. Devuelve `false` si no está registrado. */
export function setLocale(id: string): boolean {
  if (!(id in locales)) return false;
  current = id;
  return true;
}

const interpolate = (text: string, params?: TranslateParams): string => {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
};

const pick = (value: TranslationValue | undefined, params?: TranslateParams): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  return params?.count === 1 ? value.one : value.other;
};

export function t(key: string, fallback?: string, params?: TranslateParams): string {
  const active = locales[current] ?? locales[DEFAULT_LOCALE];
  const text = pick(active?.[key], params) ?? fallback ?? key;
  return interpolate(text, params);
}

export { es };
