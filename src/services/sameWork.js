import { normalize } from './searchText';

// Solo los títulos principales: los sinónimos ("Furuba") los comparten
// temporadas y remakes distintos, y fusionaban Fruits Basket 2019 con la de 2001.
// Un año final entre paréntesis ("Fruits Basket (2019)") es desambiguación de
// la fuente: el año ya se compara aparte. La puntuación no cuenta (’ vs ').
const primaryTitles = (a) => [a.title, a.titleOriginal, a.titleEn, a.titleJp]
  .filter(Boolean)
  .map((t) => normalize(t).replace(/\s*\(\d{4}\)$/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim());

const isMovie = (a) => /^(película|movie)$/i.test(a.type || '');

/**
 * ¿Dos resultados de fuentes distintas son la misma obra? Por malId si ambos
 * lo tienen; si no, por título principal con año (±1) y formato compatibles
 * (Dororo 1969 y 2019 comparten título en inglés). Nunca dentro de una misma
 * fuente: ahí cada resultado ya es una obra distinta.
 */
export function isSameWork(existing, candidate) {
  if (existing.source === candidate.source) return false;
  if (existing.malId && candidate.malId) return existing.malId === candidate.malId;
  const ya = Number(existing.year);
  const yb = Number(candidate.year);
  if (ya && yb && Math.abs(ya - yb) > 1) return false;
  if (existing.type && candidate.type && isMovie(existing) !== isMovie(candidate)) return false;
  const exTitles = primaryTitles(existing);
  return primaryTitles(candidate).some((t) => t && exTitles.includes(t));
}
