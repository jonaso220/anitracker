import { pruneLocalCache } from './services/cachePrune';

export const daysOfWeek: string[] = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const dayEmojis: string[] = ['📅', '🎯', '⚡', '🔥', '🎉', '🌟', '💫'];

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
