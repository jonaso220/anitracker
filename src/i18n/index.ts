import { es } from './es';

/**
 * Helper de i18n. Idiomas: `es` (por defecto, siempre cargado) y `en`
 * (diccionario aparte, se baja solo si hace falta).
 *
 * - **Interpolación**: `t('x', undefined, { count: 3 })` reemplaza `{count}`.
 * - **Plurales**: un valor `{ one, other }` se elige por `count` (1 → `one`).
 * - **Registro**: `registerLocale(id, dict)` suma un idioma y `setLocale` lo activa.
 * - **Orden de búsqueda**: idioma activo → español → `fallback` → la propia
 *   clave. Una clave que todavía no se tradujo sale en español, nunca cruda.
 * - **Arranque**: `initLocale()` elige el idioma (preferencia guardada o el del
 *   navegador), baja su diccionario y lo activa. Se llama sola al cargar el
 *   módulo; `localeReady` es esa promesa, para esperarla antes del primer
 *   render. `t()` no es reactivo: cambiar de idioma en caliente es guardar la
 *   preferencia (`setLocalePreference`) y recargar la página.
 */

/** Valor plural: `count === 1` usa `one`, cualquier otro usa `other`. */
export interface Plural {
  one: string;
  other: string;
}

export type TranslationValue = string | Plural;
export type Dictionary = Record<string, TranslationValue>;
export type TranslateParams = Record<string, string | number | undefined>;

export const DEFAULT_LOCALE = 'es';
/** Clave de localStorage con el idioma elegido a mano (ausente = automático). */
export const LOCALE_KEY = 'anitracker-locale';

const locales: Record<string, Dictionary> = { [DEFAULT_LOCALE]: es };
// Diccionarios que se bajan a demanda: quien usa la app en español no paga
// por el inglés en el chunk de entrada.
const loaders: Record<string, () => Promise<Dictionary>> = {
  en: () => import('./en').then((m) => m.en),
};
const LABELS: Record<string, string> = { es: 'Español', en: 'English' };
// Etiqueta BCP 47 para fechas y horas (`toLocaleDateString`).
const DATE_TAGS: Record<string, string> = { es: 'es-ES', en: 'en-US' };

let current = DEFAULT_LOCALE;
// Cada cambio de idioma invalida una carga en vuelo: gana el último pedido.
let generation = 0;

const isKnown = (id: unknown): id is string =>
  typeof id === 'string' && (Object.hasOwn(locales, id) || Object.hasOwn(loaders, id));

/** Idiomas que se pueden elegir (cargados o no). */
export const availableLocales = (): string[] => [...new Set([...Object.keys(locales), ...Object.keys(loaders)])];

/** Idioma activo. */
export const getLocale = (): string => current;

/** Nombre de un idioma en ese mismo idioma ('Español', 'English'). */
export const localeLabel = (id: string): string => LABELS[id] ?? id;

/** Registra (o reemplaza) un idioma. */
export function registerLocale(id: string, dictionary: Dictionary): void {
  locales[id] = dictionary;
}

const apply = (id: string): void => {
  current = id;
  if (typeof document !== 'undefined') document.documentElement.lang = id;
};

/**
 * Cambia el idioma activo (y el `lang` del documento). Devuelve `false` si su
 * diccionario no está cargado: para uno que se baja a demanda, `initLocale(id)`.
 */
export function setLocale(id: string): boolean {
  if (!Object.hasOwn(locales, id)) return false;
  generation += 1;
  apply(id);
  return true;
}

// `window.localStorage` y no el global: fuera del navegador (tests en entorno
// node, scripts) Node avisa con solo nombrar su `localStorage` experimental.
// Puede tirar si el navegador bloquea el almacenamiento: se llama dentro de try.
const storage = (): Storage | null => (typeof window === 'undefined' ? null : window.localStorage);

const readStored = (): string | null => {
  try {
    const stored = storage()?.getItem(LOCALE_KEY);
    return isKnown(stored) ? stored : null;
  } catch {
    return null; // almacenamiento bloqueado: se sigue con el del navegador
  }
};

/** Idioma elegido a mano, o `'auto'` si se sigue al navegador. */
export const getLocalePreference = (): string => readStored() ?? 'auto';

/**
 * Guarda el idioma elegido; `'auto'` borra la elección y vuelve al del
 * navegador. No cambia el idioma activo: recargá la página para aplicarlo.
 * Devuelve `false` si el idioma no existe o no se pudo guardar.
 */
export function setLocalePreference(id: string): boolean {
  if (id !== 'auto' && !isKnown(id)) return false;
  try {
    const store = storage();
    if (!store) return false;
    if (id === 'auto') store.removeItem(LOCALE_KEY);
    else store.setItem(LOCALE_KEY, id);
    return true;
  } catch {
    return false;
  }
}

const browserLanguages = (): string[] => {
  if (typeof navigator === 'undefined') return [];
  const list = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language];
  return list.filter((tag): tag is string => typeof tag === 'string' && tag !== '');
};

/**
 * Idioma que corresponde: la preferencia guardada si es válida; si no, el
 * primer idioma del navegador que la app tenga (`en-US` → `en`, `es-AR` →
 * `es`), y español si no tiene ninguno.
 */
export function detectLocale(): string {
  const stored = readStored();
  if (stored) return stored;
  for (const tag of browserLanguages()) {
    const base = tag.toLowerCase().split('-')[0];
    if (isKnown(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/**
 * Activa `id` (o el idioma detectado) bajando antes su diccionario si hace
 * falta. Resuelve con el idioma que quedó activo; si el diccionario no se
 * pudo bajar (sin conexión, deploy viejo) la app sigue en español.
 */
export async function initLocale(id?: string): Promise<string> {
  const target = isKnown(id) ? id : detectLocale();
  const token = ++generation;
  if (!Object.hasOwn(locales, target)) {
    try {
      const dictionary = await loaders[target]();
      if (!Object.hasOwn(locales, target)) locales[target] = dictionary;
    } catch (err) {
      console.warn('[i18n] Could not load locale', target, err);
      if (token === generation) apply(current);
      return current;
    }
    // Alguien eligió otro idioma mientras bajaba: su elección manda.
    if (token !== generation) return current;
  }
  apply(target);
  return current;
}

/** Etiqueta BCP 47 del idioma activo para formatear fechas y horas. */
export function localeTag(): string {
  // En inglés se respeta la variante del navegador (en-GB escribe 12 July).
  if (current === 'en') {
    const own = browserLanguages().find((tag) => /^en\b/i.test(tag));
    if (own) return own;
  }
  return DATE_TAGS[current] ?? DATE_TAGS[DEFAULT_LOCALE];
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

const lookup = (id: string, key: string): TranslationValue | undefined => {
  const dictionary = locales[id];
  return dictionary && Object.hasOwn(dictionary, key) ? dictionary[key] : undefined;
};

export function t(key: string, fallback?: string, params?: TranslateParams): string {
  const value = lookup(current, key) ?? (current === DEFAULT_LOCALE ? undefined : lookup(DEFAULT_LOCALE, key));
  return interpolate(pick(value, params) ?? fallback ?? key, params);
}

// --- Etiquetas de valores que son datos -----------------------------------
// Los días de la semana, el tipo ('Película'), los géneros de TMDB/Viki y
// otros textos se guardan en español porque son claves o datos de la
// biblioteca. Nunca se cambia lo guardado: se traduce al mostrarlo, con claves
// `<grupo>.<valor>`. Un valor sin clave se muestra tal cual.
const dataLabel = (group: string, value: string | null | undefined): string =>
  (value ? t(`${group}.${value}`, value) : '');

/** Día de la semana a mostrar ('Lunes' → 'Monday'). El valor guardado no cambia. */
export const dayLabel = (day: string | null | undefined): string => dataLabel('day', day);
/** Día en medio de una frase ('Lunes' → 'lunes' / 'Monday'). */
export const dayLabelInline = (day: string | null | undefined): string => dataLabel('day.inline', day);
/** Tipo de obra ('Película' → 'Movie'). */
export const typeLabel = (type: string | null | undefined): string => dataLabel('type', type);
/** Género ('Ciencia ficción' → 'Sci-Fi'); los que ya llegan en inglés quedan igual. */
export const genreLabel = (genre: string | null | undefined): string => dataLabel('genre', genre);
/** Relación entre obras ('Secuela' → 'Sequel'). */
export const relationLabel = (relation: string | null | undefined): string => dataLabel('relation', relation);
/** Nota de un enlace de streaming ('subtítulos en español' → 'Spanish subtitles'). */
export const linkLanguageLabel = (language: string | null | undefined): string => dataLabel('linkLanguage', language);

/**
 * La sinopsis llega en inglés de casi todas las fuentes y se traduce sola al
 * español; en cualquier otro idioma se muestra el original.
 */
export const autoTranslatesSynopsis = (): boolean => current === DEFAULT_LOCALE;

/**
 * Promesa del arranque: resuelve con el idioma activo cuando su diccionario ya
 * está cargado. `main.jsx` la espera antes de renderizar.
 */
export const localeReady: Promise<string> = initLocale();

export { es };
