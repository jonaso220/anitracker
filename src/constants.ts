import { pruneLocalCache } from './services/cachePrune';

// Claves del horario guardado (localStorage, nube, copias): NO se traducen ni
// se cambian. Para mostrar un día, `dayLabel(day)` de i18n.
export const daysOfWeek: string[] = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const dayEmojis: string[] = ['📅', '🎯', '⚡', '🔥', '🎉', '🌟', '💫'];

/**
 * Lo que `normalizeAnime` guarda cuando la fuente no trae sinopsis. Es un dato
 * (queda en la biblioteca y en la nube), así que no cambia con el idioma: al
 * mostrarlo se traduce con `displaySynopsis` (utils.ts).
 */
export const NO_SYNOPSIS = 'Sin sinopsis disponible.';

/** Devuelve la URL si es http(s), '' en cualquier otro caso. */
export const sanitizeUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? url : '';
  } catch { return ''; }
};

const TR_PREFIX = 'anitracker-tr-';
// La vista lista del Directorio traduce ~30 sinopsis por página; con 50 el
// cache se pisaba solo.
const TR_MAX = 200;

// Las traducciones son texto plano (sin fecha): el índice lateral guarda cuándo
// se escribió cada una para borrar primero las más viejas.
export const pruneTranslationCache = (justWritten?: string): void => {
  pruneLocalCache({ prefix: TR_PREFIX, max: TR_MAX, keep: justWritten, indexKey: 'anitracker-trindex' });
};
