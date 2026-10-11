/**
 * Anime object schema and normalizer.
 *
 * Provides a single source of truth for the shape of an "anime" object across
 * the app. All API adapters should return data that passes through `normalizeAnime`
 * to guarantee consistent fields downstream.
 */
import type { Anime, StreamingLink } from '../types/anime';

/** Entrada cruda: solo se aceptan claves del dominio, con valores sin tipar. */
export type RawAnimeInput = Partial<Record<keyof Anime, unknown>>;

const toStr = (v: unknown): string => (v == null ? '' : String(v));
const toNumber = <F extends number | null>(v: unknown, fallback: F): number | F => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const toArrayOfStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];

const toStreamingLinks = (v: unknown): StreamingLink[] => {
  if (!Array.isArray(v)) return [];
  const out: StreamingLink[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const link = raw as Partial<Record<keyof StreamingLink, unknown>>;
    if (typeof link.url !== 'string' || typeof link.site !== 'string') continue;
    out.push({ site: link.site, url: link.url, language: toStr(link.language) });
  }
  return out;
};

const parseEpisodesNullable = (v: unknown): number | null => {
  if (v == null || v === '?' || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) || n <= 0 ? null : n;
};

/**
 * Normalize a raw anime-like object to the canonical shape used in the app.
 * Guarantees types on every field so downstream code can trust them.
 */
export function normalizeAnime(raw: RawAnimeInput | null | undefined): Anime | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = toNumber(raw.id, 0);
  if (id <= 0) return null;

  return {
    id,
    source: toStr(raw.source),
    sourceId: toStr(raw.sourceId || raw.id),
    sourceKey: toStr(raw.sourceKey || (raw.source ? `${toStr(raw.source).toLowerCase()}:${raw.sourceId || raw.id}` : '')),
    malId: raw.malId == null ? null : toNumber(raw.malId, null),
    title: toStr(raw.title),
    titleOriginal: toStr(raw.titleOriginal),
    titleJp: toStr(raw.titleJp),
    titleEn: toStr(raw.titleEn),
    altTitles: toArrayOfStrings(raw.altTitles),
    image: toStr(raw.image),
    imageSm: toStr(raw.imageSm),
    genres: toArrayOfStrings(raw.genres),
    synopsis: toStr(raw.synopsis) || 'Sin sinopsis disponible.',
    rating: toNumber(raw.rating, 0),
    episodes: parseEpisodesNullable(raw.episodes),
    status: toStr(raw.status),
    year: raw.year == null ? '' : toStr(raw.year),
    type: toStr(raw.type),
    malUrl: toStr(raw.malUrl),
    watchLink: toStr(raw.watchLink),
    trailerUrl: toStr(raw.trailerUrl),
    streamingLinks: toStreamingLinks(raw.streamingLinks),
    // Día de emisión sugerido (p. ej. 'Jueves'), cuando la fuente lo informa.
    airDay: toStr(raw.airDay),
    currentEp: toNumber(raw.currentEp, 0),
    userRating: toNumber(raw.userRating, 0),
    // Optional user-list flags
    finished: raw.finished === true,
    // Las fechas se conservan tal cual llegan (ISO strings en la práctica).
    finishedDate: (raw.finishedDate as string | undefined) || undefined,
    droppedDate: (raw.droppedDate as string | undefined) || undefined,
  };
}
