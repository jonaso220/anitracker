import { normalizeAnime } from '../schemas/anime';
import { daysOfWeek } from '../constants';
import { buildAiringInfo } from '../utils';

// Rakuten Viki — K-dramas, C-dramas y películas asiáticas. La API pública v4
// responde con CORS abierto y solo pide el `app` id del cliente web. La
// búsqueda trae poco (títulos, póster, episodios), así que se completa cada
// resultado con su ficha: sinopsis en español, géneros, rating, día de emisión.
const VIKI_API = 'https://api.viki.io/v4';
const VIKI_APP_ID = '100000a';
const VIKI_WEB = 'https://www.viki.com';

// Rango interno de IDs (no choca con MAL <100000, Kitsu +100000, AniList
// +300000, TVMaze +400000, iTunes +500000, TMDB +600000000 / +900000000).
// Series y películas comparten el espacio de ids de Viki ("41650c").
export const VIKI_ID_BASE = 700000000;

const DETAIL_LIMIT = 8;

// Ids de género estables de /v4/genres.json; el mapa estático evita un request
// extra por búsqueda.
const GENRES = {
  '1g': 'Acción', '2g': 'Animación', '6g': 'Comedia', '7g': 'Crimen y misterio',
  '8g': 'Documental', '9g': 'Drama', '10g': 'Entretenimiento', '12g': 'Sobrenatural',
  '17g': 'Música', '18g': 'Comedia romántica', '19g': 'Fantasía', '20g': 'Deportes',
  '24g': 'Familia', '25g': 'Época', '26g': 'Suspenso', '1037g': 'Histórico',
  '1038g': 'Idols', '1040g': 'Médico', '1041g': 'Melodrama', '1044g': 'Variedades',
  '1045g': 'Web drama', '1047g': 'Cortometraje', '1050g': 'Bélica', '1055g': 'Viajes',
  '1063g': 'Terror', '1064g': 'Ciencia ficción', '1067g': 'BL', '1068g': 'Romance',
  '1071g': 'GL', '1072g': 'Aventura', '1073g': 'LGBTQ+',
};

const DAY_MAP = {
  mon: daysOfWeek[0], tue: daysOfWeek[1], wed: daysOfWeek[2], thu: daysOfWeek[3],
  fri: daysOfWeek[4], sat: daysOfWeek[5], sun: daysOfWeek[6],
};

function vikiUrl(path, params = {}) {
  const url = new URL(`${VIKI_API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('app', VIKI_APP_ID);
  return url.toString();
}

async function vikiFetch(path, params, { signal } = {}) {
  const res = await fetch(vikiUrl(path, params), { signal });
  if (!res.ok) throw new Error(`Viki HTTP ${res.status}`);
  return res.json();
}

/** "41650c" → 41650 */
export function parseVikiId(id) {
  const n = parseInt(String(id || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function searchViki(query, { signal, limit = 10 } = {}) {
  const json = await vikiFetch('/search.json', { c: query, per_page: limit, with_people: 'false' }, { signal });
  const hits = (Array.isArray(json) ? json : [])
    .filter((h) => h && (h.t === 'series' || h.t === 'film') && parseVikiId(h.id));

  // La ficha es opcional: si falla, el resultado se arma con lo de la búsqueda.
  const details = await Promise.allSettled(hits.map((h, i) => (
    i < DETAIL_LIMIT
      ? vikiFetch(`/${h.t === 'film' ? 'films' : 'series'}/${h.id}.json`, {}, { signal })
      : Promise.resolve(null)
  )));
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  return hits
    .map((h, i) => toAnime(h, details[i].status === 'fulfilled' ? details[i].value : null))
    .filter(Boolean);
}

/** Viki id ("41650c") de un anime guardado de Viki, o null. */
export function vikiIdOf(anime) {
  const num = Number(anime?.id) - VIKI_ID_BASE;
  if (!(num > 0 && num < 100000000)) return null;
  const m = /^viki:(\w+)$/.exec(anime?.sourceKey || '');
  return m ? m[1] : `${num}c`;
}

/**
 * Próximo episodio de series de Viki en emisión, con la misma forma que
 * `fetchAiringInfo` de AniList, indexado por id interno. Usa `watch_next` de
 * la ficha. Una ficha que falla solo omite esa serie; si fallan todas, lanza.
 */
export async function fetchVikiAiringInfo({ vikiIds = [], signal } = {}) {
  if (vikiIds.length === 0) return {};
  const settled = await Promise.allSettled(
    vikiIds.map((id) => vikiFetch(`/series/${id}.json`, {}, { signal })),
  );
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const failed = settled.filter((s) => s.status === 'rejected');
  if (failed.length === settled.length) throw failed[0].reason;

  const now = new Date();
  const result = {};
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    const detail = s.value;
    const next = detail?.watch_next;
    const num = parseVikiId(detail?.id);
    if (!num || !detail.flags?.on_air || !next?.episode || !next.viki_air_time) continue;
    const info = buildAiringInfo({
      episode: next.episode,
      airingAt: next.viki_air_time,
      totalEpisodes: detail.planned_episodes || detail.episodes?.count || null,
      title: detail.titles?.es || detail.titles?.en || '',
    }, now);
    // Como AniList: solo lo que viene o salió en las últimas 24 h.
    if (info.timeUntilAiring > -24 * 3600) result[VIKI_ID_BASE + num] = info;
  }
  return result;
}

/**
 * Maps a Viki search hit (short keys: tt/te/ko/i/e/u…) plus its optional
 * detail payload (/v4/series|films/{id}.json) into a normalized anime.
 */
export function toAnime(hit, detail = null) {
  const src = hit || detail;
  if (!src) return null;
  const vikiId = src.id;
  const num = parseVikiId(vikiId);
  if (!num) return null;

  const titles = detail?.titles || {};
  const originLang = detail?.origin?.language;
  const titleEn = titles.en || hit?.tt || '';
  const titleOriginal = (originLang && titles[originLang]) || hit?.ko || hit?.tzh || hit?.tj || '';
  const title = titles.es || hit?.te || titleEn || titleOriginal;
  if (!title) return null;

  const isFilm = (detail?.type || hit?.t) === 'film';
  const webUrl = detail?.url?.web || (hit?.u?.w ? `${VIKI_WEB}${hit.u.w}` : `${VIKI_WEB}/${isFilm ? 'movies' : 'tv'}/${vikiId}`);
  const image = detail?.images?.poster?.url || hit?.i || '';
  const flags = detail?.flags;
  const firstAired = (detail?.distributors || []).map((d) => d?.from).filter(Boolean).sort()[0] || '';
  // `day_of_week` viene en hora de Corea: si hay próximo episodio con hora,
  // el día sale de ahí en la hora local (un miércoles KST puede ser martes acá).
  const nextAirTime = detail?.watch_next?.viki_air_time;
  const airDay = isFilm || !flags?.on_air ? ''
    : nextAirTime ? daysOfWeek[(new Date(nextAirTime * 1000).getDay() + 6) % 7]
      : DAY_MAP[(detail?.day_of_week || [])[0]] || '';
  const aka = Object.values(detail?.titles_aka || {}).flat();
  const hasSpanishSubs = (detail?.subtitle_completions?.es || 0) >= 90;

  return normalizeAnime({
    id: VIKI_ID_BASE + num,
    source: 'Viki',
    sourceId: vikiId,
    sourceKey: `viki:${vikiId}`,
    title,
    titleOriginal: titleOriginal || title,
    // La ficha muestra titleJp como título nativo: para dramas coreanos o
    // chinos es el del idioma de origen, no la traducción japonesa.
    titleJp: titleOriginal,
    titleEn,
    altTitles: [...new Set([titleEn, titleOriginal, ...aka].filter((t) => t && t !== title))],
    image,
    imageSm: image,
    genres: (detail?.genres || []).map((g) => GENRES[g]).filter(Boolean),
    synopsis: detail?.descriptions?.es || detail?.descriptions?.en || '',
    rating: detail?.review_stats?.average_rating ? Math.round(detail.review_stats.average_rating * 10) / 10 : 0,
    episodes: isFilm ? null : (detail?.planned_episodes || detail?.episodes?.count || hit?.e || null),
    status: flags ? (flags.on_air ? 'En emisión' : 'Finalizado') : '',
    year: firstAired ? firstAired.slice(0, 4) : '',
    type: isFilm ? 'Película' : 'Serie',
    malUrl: webUrl,
    streamingLinks: [{ site: 'Viki', url: webUrl, language: hasSpanishSubs ? 'subtítulos en español' : 'subtítulos' }],
    airDay,
  });
}
