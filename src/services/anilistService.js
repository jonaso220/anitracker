import { normalizeAnime } from '../schemas/anime';
import { buildAiringInfo } from '../utils';
import { daysOfWeek } from '../constants';

const ANILIST_URL = 'https://graphql.anilist.co';

const FORMAT_MAP = { TV: 'TV', TV_SHORT: 'TV Short', MOVIE: 'Película', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };
const STATUS_MAP = { FINISHED: 'Finished', RELEASING: 'En emisión', NOT_YET_RELEASED: 'No estrenado', CANCELLED: 'Cancelado', HIATUS: 'En pausa' };
const LIST_STATUS_DESTINATION = {
  CURRENT: 'schedule',
  PLANNING: 'watchLater',
  COMPLETED: 'watched',
  DROPPED: 'watched',
  PAUSED: 'watchLater',
  REPEATING: 'schedule',
};

async function anilistFetch(query, variables, { signal } = {}) {
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
  return res.json();
}

export async function searchAnilist(query, { signal, limit = 12 } = {}) {
  const gql = `query ($search: String, $perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
        id idMal title { romaji english native userPreferred }
        coverImage { extraLarge large medium } bannerImage
        genres averageScore episodes status seasonYear format
        description(asHtml: false) siteUrl synonyms
        externalLinks { url site type language }
        trailer { id site }
      }
    }
  }`;
  const data = await anilistFetch(gql, { search: query, perPage: limit }, { signal });
  return (data?.data?.Page?.media || []).map(toAnime).filter(Boolean);
}

const DISCOVERY_MEDIA_FIELDS = `id idMal title { romaji english native } coverImage { extraLarge large medium }
        genres averageScore episodes format status seasonYear
        description(asHtml: false) siteUrl
        externalLinks { url site type language }
        trailer { id site }
        nextAiringEpisode { airingAt episode }`;

const SEASON_PAGE_QUERY = `query ($season: MediaSeason, $year: Int, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
        ${DISCOVERY_MEDIA_FIELDS}
      }
    }
  }`;

const RELEASING_PAGE_QUERY = `query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(status: RELEASING, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
        ${DISCOVERY_MEDIA_FIELDS}
      }
    }
  }`;

// Página 1 primero (para saber si hay más) y el resto en paralelo: en serie,
// una temporada de 4 páginas costaba 4 round-trips encadenados.
async function fetchAllMediaPages(gql, variables, { signal, maxPages = 4, perPage = 50 } = {}) {
  const first = await anilistFetch(gql, { ...variables, page: 1, perPage }, { signal });
  const firstPage = first?.data?.Page;
  const media = [...(firstPage?.media || [])];
  if (!firstPage?.pageInfo?.hasNextPage || maxPages < 2) return media;

  const rest = await Promise.all(
    Array.from({ length: maxPages - 1 }, (_, i) =>
      anilistFetch(gql, { ...variables, page: i + 2, perPage }, { signal }).catch((err) => {
        if (err?.name === 'AbortError') throw err;
        return null; // una página caída no tira todo el resultado
      })
    )
  );
  for (const data of rest) {
    if (!data) continue; // página caída: seguir con las siguientes
    const pageData = data.data?.Page;
    media.push(...(pageData?.media || []));
    if (!pageData?.pageInfo?.hasNextPage) break;
  }
  return media;
}

const DIRECTORY_QUERY = `query ($page: Int, $perPage: Int, $search: String, $genre: String, $tag: String, $format: MediaFormat, $status: MediaStatus, $season: MediaSeason, $seasonYear: Int, $sort: [MediaSort]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(type: ANIME, isAdult: false, search: $search, genre: $genre, tag: $tag, format: $format, status: $status, season: $season, seasonYear: $seasonYear, sort: $sort) {
        ${DISCOVERY_MEDIA_FIELDS}
      }
    }
  }`;

/**
 * Browse the full AniList catalog with optional filters. Unset filters are
 * omitted from the variables object, which GraphQL treats as "argument not
 * provided" (no filtering). Returns one page plus a has-more flag.
 */
export async function fetchDirectory(filters = {}, { signal, page = 1, perPage = 30 } = {}) {
  const variables = { page, perPage, sort: [filters.sort || 'POPULARITY_DESC'] };
  if (filters.search?.trim()) variables.search = filters.search.trim();
  if (filters.genre) variables.genre = filters.genre;
  if (filters.demography) variables.tag = filters.demography;
  if (filters.format) variables.format = filters.format;
  if (filters.status) variables.status = filters.status;
  if (filters.season) variables.season = filters.season;
  if (filters.year) variables.seasonYear = Number(filters.year);

  const data = await anilistFetch(DIRECTORY_QUERY, variables, { signal });
  const pageData = data?.data?.Page;
  return {
    results: (pageData?.media || []).map((m) => toAnime(m)).filter(Boolean),
    hasNextPage: !!pageData?.pageInfo?.hasNextPage,
  };
}

/**
 * Latest aired episode per media within a recent window, keyed by AniList id.
 * Uses the airingSchedules feed sorted by time desc, so the first hit per
 * media is its most recent episode with the exact air timestamp.
 */
export async function fetchLatestAired(mediaIds, { signal, nowSec = Math.floor(Date.now() / 1000), windowDays = 8, maxPages = 4 } = {}) {
  if (!mediaIds || mediaIds.length === 0) return {};
  const gql = `query ($ids: [Int], $from: Int, $to: Int, $page: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage }
      airingSchedules(mediaId_in: $ids, airingAt_greater: $from, airingAt_lesser: $to, sort: TIME_DESC) {
        mediaId episode airingAt
      }
    }
  }`;
  const from = nowSec - windowDays * 24 * 3600;
  const latest = {};
  for (let page = 1; page <= maxPages; page++) {
    const data = await anilistFetch(gql, { ids: mediaIds, from, to: nowSec, page }, { signal });
    const pageData = data?.data?.Page;
    for (const s of pageData?.airingSchedules || []) {
      if (latest[s.mediaId] == null) latest[s.mediaId] = { episode: s.episode, airingAt: s.airingAt };
    }
    if (!pageData?.pageInfo?.hasNextPage) break;
  }
  return latest;
}

/**
 * Full season list, paginated (the old single page of 30 left out the less
 * popular half of every season). With `current: true` (the on-air season) it
 * additionally merges shows still airing from previous seasons (marked with
 * `_continuing`) and attaches `_airing` — last aired episode + next episode —
 * so the UI can group by broadcast day and show "hace X horas".
 */
export async function fetchSeason(season, year, { signal, current = false } = {}) {
  // La temporada y los "en emisión" no dependen entre sí: en paralelo.
  const [media, releasing] = await Promise.all([
    fetchAllMediaPages(SEASON_PAGE_QUERY, { season, year }, { signal, maxPages: 4 }),
    current
      ? fetchAllMediaPages(RELEASING_PAGE_QUERY, {}, { signal, maxPages: 3 }).catch((err) => {
          if (err?.name === 'AbortError') throw err;
          console.error('[AniTracker] Continuing anime fetch failed:', err);
          return [];
        })
      : Promise.resolve([]),
  ]);

  const continuingIds = new Set();
  const seen = new Set(media.map((m) => m.id));
  for (const m of releasing) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    continuingIds.add(m.id);
    media.push(m);
  }

  let latestAired = {};
  if (current && media.length > 0) {
    try {
      latestAired = await fetchLatestAired(media.map((m) => m.id), { signal });
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      console.error('[AniTracker] Latest aired fetch failed:', err);
    }
  }

  return media
    .map((m) => {
      const anime = toAnime(m, { fallbackYear: year });
      if (!anime) return null;
      const last = latestAired[m.id];
      const next = m.nextAiringEpisode;
      if (last || next) {
        anime._airing = {
          lastEpisode: last?.episode ?? null,
          lastAiredAt: last?.airingAt ?? null,
          nextEpisode: next?.episode ?? null,
          nextAiringAt: next?.airingAt ?? null,
        };
      }
      if (continuingIds.has(m.id)) anime._continuing = true;
      return anime;
    })
    .filter(Boolean);
}

// --- Relaciones (temporadas, películas, OVAs, spin-offs...) ---

const RELATION_LABELS = {
  PREQUEL: 'Precuela',
  SEQUEL: 'Secuela',
  PARENT: 'Historia principal',
  SIDE_STORY: 'Historia paralela',
  SPIN_OFF: 'Spin-off',
  ALTERNATIVE: 'Versión alternativa',
  FULL_STORY: 'Historia completa',
  SUMMARY: 'Resumen',
  OTHER: 'Relacionado',
};
const RELATION_ORDER = Object.keys(RELATION_LABELS);

const RELATIONS_QUERY = `query ($id: Int, $idMal: Int) {
    Media(id: $id, idMal: $idMal, type: ANIME) {
      relations {
        edges {
          relationType
          node {
            id idMal type format title { romaji english native } coverImage { extraLarge large medium }
            genres averageScore episodes status seasonYear
            description(asHtml: false) siteUrl
            externalLinks { url site type language }
            trailer { id site }
          }
        }
      }
    }
  }`;

/**
 * Ids con los que consultar AniList por un anime guardado. Sale de `sourceKey`
 * ('anilist:123') y no del rango del id interno: los anime de AniList sin MAL
 * ya superan el id 100000 (id interno ≥ 400000) y quedaban afuera de la
 * cuenta regresiva. `malId` para items de MAL (id < 100000). Otras fuentes: nada.
 */
export function anilistIdsOf(anime) {
  const id = Number(anime?.id);
  const m = /^anilist:(\d+)$/.exec(anime?.sourceKey || '');
  let anilistId = m ? Number(m[1]) : null;
  // Items viejos guardados antes de que existiera sourceKey.
  if (!anilistId && !anime?.sourceKey && id >= 300000 && id < 400000) anilistId = id - 300000;
  const malId = Number(anime?.malId) > 0 ? Number(anime.malId) : (id > 0 && id < 100000 ? id : null);
  return { anilistId, malId };
}

// Referencia AniList de un anime guardado, para relaciones.
function anilistRef(anime) {
  const { anilistId, malId } = anilistIdsOf(anime);
  if (anilistId) return { id: anilistId };
  return malId ? { idMal: malId } : null;
}

const relationsCache = new Map();
export const clearRelationsCache = () => relationsCache.clear();

/**
 * Obras relacionadas de un anime (temporadas, películas, OVAs...) vía las
 * relations de AniList. Cada resultado es un anime normalizado con `_relation`
 * (etiqueta en español: "Secuela", "Precuela"...). Devuelve [] para fuentes
 * sin mapeo a AniList/MAL. Cache en memoria por sesión.
 */
export async function fetchAnilistRelations(anime, { signal } = {}) {
  const ref = anilistRef(anime);
  if (!ref) return [];
  const cacheKey = ref.id ? `id:${ref.id}` : `mal:${ref.idMal}`;
  if (relationsCache.has(cacheKey)) return relationsCache.get(cacheKey);

  const data = await anilistFetch(RELATIONS_QUERY, ref, { signal });
  const edges = data?.data?.Media?.relations?.edges || [];
  const seen = new Set([Number(anime?.id) || 0]);
  const results = edges
    .filter((e) => e?.node && e.node.type === 'ANIME' && e.node.format !== 'MUSIC' && RELATION_LABELS[e.relationType])
    .sort((x, y) =>
      RELATION_ORDER.indexOf(x.relationType) - RELATION_ORDER.indexOf(y.relationType)
      || (Number(x.node.seasonYear) || 9999) - (Number(y.node.seasonYear) || 9999))
    .map((e) => {
      const rel = toAnime(e.node);
      if (!rel || seen.has(rel.id)) return null;
      seen.add(rel.id);
      return { ...rel, _relation: RELATION_LABELS[e.relationType] };
    })
    .filter(Boolean);
  relationsCache.set(cacheKey, results);
  return results;
}

// Día de la semana (hora local) en que sale el próximo episodio.
function airDayOf(airingAt) {
  if (!airingAt) return '';
  const jsDay = new Date(airingAt * 1000).getDay();
  return daysOfWeek[(jsDay + 6) % 7];
}

// FuzzyDate de AniList ({ year, month, day }, cualquiera puede faltar).
function fuzzyDateIso(date) {
  if (!date?.year) return '';
  return new Date(date.year, (date.month || 1) - 1, date.day || 1, 12).toISOString();
}

export async function fetchAnilistUserAnimeLists(username, { signal } = {}) {
  const trimmed = username?.trim();
  if (!trimmed) return { schedule: [], watchLater: [], watched: [] };

  const gql = `query ($username: String) {
    MediaListCollection(userName: $username, type: ANIME) {
      lists {
        name status isCustomList
        entries {
          status progress score(format: POINT_10) updatedAt
          completedAt { year month day }
          media {
            id idMal
            title { romaji english native userPreferred }
            coverImage { extraLarge large medium }
            genres averageScore episodes format status seasonYear
            description(asHtml: false) siteUrl synonyms
            externalLinks { url site type language }
            trailer { id site }
            nextAiringEpisode { airingAt }
          }
        }
      }
    }
  }`;

  const data = await anilistFetch(gql, { username: trimmed }, { signal });
  if (data?.errors?.length) {
    const err = new Error(data.errors[0]?.message || 'Error al buscar');
    err.code = data.errors[0]?.message === 'User not found' ? 'ANILIST_USER_NOT_FOUND' : 'ANILIST_IMPORT_ERROR';
    throw err;
  }

  const items = { schedule: [], watchLater: [], watched: [] };
  const lists = data?.data?.MediaListCollection?.lists || [];
  // Una entrada de una lista personalizada de AniList también está en su
  // lista de estado: se toma una sola vez, primero las de estado.
  const ordered = [...lists].sort((a, b) => Number(!!a.isCustomList) - Number(!!b.isCustomList));
  const seen = new Set();
  ordered.forEach((list) => {
    (list.entries || []).forEach((entry) => {
      if (!entry?.media?.id || seen.has(entry.media.id)) return;
      seen.add(entry.media.id);
      const anime = toAnime(entry.media);
      if (!anime) return;
      const dest = LIST_STATUS_DESTINATION[entry.status] || 'watchLater';
      items[dest].push({
        ...anime,
        airDay: airDayOf(entry.media.nextAiringEpisode?.airingAt),
        currentEp: Number(entry.progress) || 0,
        userRating: Number(entry.score) || 0,
        _importStatus: entry.status,
        _finished: entry.status === 'COMPLETED',
        _dropped: entry.status === 'DROPPED',
        _doneAt: fuzzyDateIso(entry.completedAt) || (entry.updatedAt ? new Date(entry.updatedAt * 1000).toISOString() : ''),
      });
    });
  });
  return items;
}

const AIRING_PAGE_SIZE = 50;
const AIRING_FIELDS = 'id idMal status title { romaji english } nextAiringEpisode { airingAt episode timeUntilAiring } episodes';

/**
 * Próximo episodio de una lista de anime, en un solo request aunque sean más
 * de 50 (una página con alias por cada bloque de 50 ids). Devuelve
 * { byAnilist: { [id]: info }, byMal: { [idMal]: info } }: quien llama lo
 * asocia a sus ids internos, que no siempre coinciden con los de AniList
 * (un anime guardado sin MAL puede tener idMal después).
 */
export async function fetchAiringByIds({ malIds = [], anilistIds = [], signal } = {}) {
  const decls = [];
  const parts = [];
  const variables = {};
  const addPages = (prefix, filter, ids) => {
    const unique = [...new Set(ids.map(Number).filter((n) => n > 0))];
    for (let i = 0; i * AIRING_PAGE_SIZE < unique.length; i++) {
      const name = `${prefix}${i}`;
      decls.push(`$${name}: [Int]`);
      variables[name] = unique.slice(i * AIRING_PAGE_SIZE, (i + 1) * AIRING_PAGE_SIZE);
      parts.push(`${name}: Page(page: 1, perPage: ${AIRING_PAGE_SIZE}) { media(${filter}: $${name}, type: ANIME) { ${AIRING_FIELDS} } }`);
    }
  };
  addPages('mal', 'idMal_in', malIds);
  addPages('al', 'id_in', anilistIds);
  const result = { byAnilist: {}, byMal: {} };
  if (parts.length === 0) return result;

  const data = await anilistFetch(`query (${decls.join(', ')}) { ${parts.join('\n')} }`, variables, { signal });
  if (data?.errors?.length && !data?.data) throw new Error(`AniList: ${data.errors[0]?.message || 'error'}`);

  const now = new Date();
  for (const page of Object.values(data?.data || {})) {
    for (const m of page?.media || []) {
      const airing = m.nextAiringEpisode;
      if (!airing) continue;
      const info = {
        ...buildAiringInfo({
          episode: airing.episode,
          airingAt: airing.airingAt,
          totalEpisodes: m.episodes,
          title: m.title?.english || m.title?.romaji || '',
        }, now),
        // AniList ya lo calcula en el servidor; se respeta su valor.
        timeUntilAiring: airing.timeUntilAiring,
      };
      result.byAnilist[m.id] = info;
      if (m.idMal) result.byMal[m.idMal] = info;
    }
  }
  return result;
}

export function toAnime(a, { fallbackYear } = {}) {
  const titleEn = a.title?.english || a.title?.userPreferred || '';
  const titleRomaji = a.title?.romaji || '';
  const titleNative = a.title?.native || '';
  const title = titleEn || titleRomaji || '';
  const allTitles = [titleEn, titleRomaji, titleNative, ...(a.synonyms || [])].filter(Boolean);
  const cleanSynopsis = (a.description || '').replace(/<[^>]*>/g, '').replace(/\n/g, ' ').trim();
  const streamingLinks = (a.externalLinks || [])
    .filter((l) => l && l.type === 'STREAMING' && l.url && l.site)
    .map((l) => ({ site: l.site, url: l.url, language: l.language || '' }));
  const trailerUrl = a.trailer?.id
    ? (a.trailer.site === 'youtube' ? `https://www.youtube.com/watch?v=${a.trailer.id}`
      : a.trailer.site === 'dailymotion' ? `https://www.dailymotion.com/video/${a.trailer.id}` : '')
    : '';
  return normalizeAnime({
    id: a.idMal || (a.id + 300000),
    source: 'AniList',
    sourceId: a.id,
    sourceKey: `anilist:${a.id}`,
    malId: a.idMal || null,
    title,
    titleOriginal: titleRomaji,
    titleJp: titleNative,
    titleEn,
    altTitles: allTitles.filter((t, i, arr) => arr.indexOf(t) === i && t !== title),
    image: a.coverImage?.extraLarge || a.coverImage?.large || '',
    imageSm: a.coverImage?.medium || a.coverImage?.large || '',
    genres: a.genres || [],
    synopsis: cleanSynopsis,
    rating: a.averageScore ? Number((a.averageScore / 10).toFixed(1)) : 0,
    episodes: a.episodes,
    status: STATUS_MAP[a.status] || a.status || '',
    year: a.seasonYear || fallbackYear || '',
    type: FORMAT_MAP[a.format] || a.format || '',
    malUrl: a.siteUrl || `https://anilist.co/anime/${a.id}`,
    streamingLinks,
    trailerUrl,
  });
}
