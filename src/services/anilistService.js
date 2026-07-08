import { normalizeAnime } from '../schemas/anime';

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

// Airing entry with the shape the whole app understands (cards, detail modal):
// same flags fetchAiringInfo produces for the weekly schedule.
function toAiringEntry(next, totalEpisodes = null, title = '') {
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const airingDate = new Date(next.airingAt * 1000);
  const diffHours = (airingDate - now) / (1000 * 60 * 60);
  return {
    episode: next.episode,
    airingAt: next.airingAt,
    timeUntilAiring: next.timeUntilAiring,
    isToday: airingDate.toDateString() === now.toDateString(),
    isTomorrow: airingDate.toDateString() === tomorrow.toDateString(),
    isThisWeek: diffHours > 0 && diffHours <= 7 * 24,
    hasAired: diffHours <= 0 && diffHours > -24,
    totalEpisodes,
    title,
  };
}

// Latest aired episode for a set of AniList media ids, from the public
// airingSchedules feed. Window-bounded so hiatus shows don't force paging
// through months of history.
const LAST_AIRED_WINDOW_DAYS = 21;
export async function fetchLastAired(mediaIds, { signal } = {}) {
  if (!mediaIds || mediaIds.length === 0) return {};
  const gql = `query ($ids: [Int], $from: Int, $page: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage }
      airingSchedules(mediaId_in: $ids, airingAt_greater: $from, notYetAired: false, sort: TIME_DESC) {
        mediaId episode airingAt
      }
    }
  }`;
  const from = Math.floor(Date.now() / 1000) - LAST_AIRED_WINDOW_DAYS * 86400;
  const result = {};
  for (let page = 1; page <= 4; page++) {
    const data = await anilistFetch(gql, { ids: mediaIds, from, page }, { signal });
    const p = data?.data?.Page;
    for (const s of p?.airingSchedules || []) {
      // TIME_DESC ⇒ the first schedule seen per media is its latest episode.
      if (!result[s.mediaId]) result[s.mediaId] = { episode: s.episode, airingAt: s.airingAt };
    }
    if (!p?.pageInfo?.hasNextPage) break;
  }
  return result;
}

/**
 * Full season catalog plus airing info. Returns `{ list, airing }`:
 * - `list`: every anime of the season (paginated — a single page of 30 was
 *   why titles visible on other sites were missing here).
 * - `airing`: map keyed by app id → next episode (same shape as
 *   fetchAiringInfo) plus `status`, and `lastEpisode`/`lastAiredAt` for
 *   "Último capítulo: N · hace X".
 */
export async function fetchSeason(season, year, { signal } = {}) {
  const gql = `query ($season: MediaSeason, $year: Int, $page: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage }
      media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
        id idMal title { romaji english native } coverImage { extraLarge large medium }
        genres averageScore episodes format status seasonYear
        description(asHtml: false) siteUrl
        externalLinks { url site type language }
        trailer { id site }
        nextAiringEpisode { airingAt episode timeUntilAiring }
      }
    }
  }`;
  const media = [];
  for (let page = 1; page <= 4; page++) {
    const data = await anilistFetch(gql, { season, year, page }, { signal });
    const p = data?.data?.Page;
    media.push(...(p?.media || []));
    if (!p?.pageInfo?.hasNextPage) break;
  }

  const list = [];
  const airing = {};
  const releasing = [];
  for (const m of media) {
    const anime = toAnime(m, { fallbackYear: year });
    if (!anime) continue;
    list.push(anime);
    const entry = { status: m.status || '', totalEpisodes: m.episodes ?? null };
    if (m.nextAiringEpisode) Object.assign(entry, toAiringEntry(m.nextAiringEpisode, m.episodes));
    airing[anime.id] = entry;
    if (m.status === 'RELEASING') releasing.push({ appId: anime.id, mediaId: m.id });
  }

  // "hace cuánto salió el último episodio" — best effort: the season list is
  // useful without it, so a failure here must not blank the whole tab.
  try {
    const lastAired = await fetchLastAired(releasing.map((r) => r.mediaId), { signal });
    for (const { appId, mediaId } of releasing) {
      const last = lastAired[mediaId];
      if (last) {
        airing[appId].lastEpisode = last.episode;
        airing[appId].lastAiredAt = last.airingAt;
      }
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    console.error('[AniTracker] Last aired fetch failed:', err);
  }

  return { list, airing };
}

export async function fetchTopAnime({ signal, perPage = 50 } = {}) {
  const gql = `query ($perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      media(type: ANIME, sort: SCORE_DESC, isAdult: false) {
        id idMal title { romaji english native } coverImage { extraLarge large medium }
        genres averageScore episodes format status seasonYear
        description(asHtml: false) siteUrl
        externalLinks { url site type language }
        trailer { id site }
      }
    }
  }`;
  const data = await anilistFetch(gql, { perPage }, { signal });
  return (data?.data?.Page?.media || []).map((m) => toAnime(m)).filter(Boolean);
}

export async function fetchAnilistUserAnimeLists(username, { signal } = {}) {
  const trimmed = username?.trim();
  if (!trimmed) return { schedule: [], watchLater: [], watched: [] };

  const gql = `query ($username: String) {
    MediaListCollection(userName: $username, type: ANIME) {
      lists {
        name status
        entries {
          status progress score(format: POINT_10)
          media {
            id idMal
            title { romaji english native userPreferred }
            coverImage { extraLarge large medium }
            genres averageScore episodes format status seasonYear
            description(asHtml: false) siteUrl synonyms
            externalLinks { url site type language }
            trailer { id site }
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
  lists.forEach((list) => {
    (list.entries || []).forEach((entry) => {
      const anime = toAnime(entry.media);
      if (!anime) return;
      const dest = LIST_STATUS_DESTINATION[entry.status] || 'watchLater';
      items[dest].push({
        ...anime,
        currentEp: Number(entry.progress) || 0,
        userRating: Number(entry.score) || 0,
        notes: '',
        _importStatus: entry.status,
        _finished: entry.status === 'COMPLETED',
        _dropped: entry.status === 'DROPPED',
      });
    });
  });
  return items;
}

/**
 * Fetch airing info for a set of MAL or AniList IDs. Returns a map keyed by the
 * app-internal ID (MAL id for <100000, AniList id + 300000 otherwise).
 */
export async function fetchAiringInfo({ malIds = [], anilistIds = [], signal } = {}) {
  const parts = [];
  if (malIds.length > 0) {
    parts.push(`malQuery: Page(page: 1, perPage: 50) {
      media(idMal_in: [${malIds.join(',')}], type: ANIME) {
        id idMal status title { romaji english }
        nextAiringEpisode { airingAt episode timeUntilAiring }
        episodes
      }
    }`);
  }
  if (anilistIds.length > 0) {
    parts.push(`alQuery: Page(page: 1, perPage: 50) {
      media(id_in: [${anilistIds.join(',')}], type: ANIME) {
        id idMal status title { romaji english }
        nextAiringEpisode { airingAt episode timeUntilAiring }
        episodes
      }
    }`);
  }
  if (parts.length === 0) return {};

  const query = `query { ${parts.join('\n')} }`;
  const data = await anilistFetch(query, undefined, { signal });

  const result = {};
  const processMedia = (media) => {
    if (!media) return;
    for (const m of media) {
      const appId = m.idMal && m.idMal < 100000 ? m.idMal : (m.id + 300000);
      if (!m.nextAiringEpisode) continue;
      result[appId] = toAiringEntry(m.nextAiringEpisode, m.episodes, m.title?.english || m.title?.romaji || '');
    }
  };
  processMedia(data?.data?.malQuery?.media);
  processMedia(data?.data?.alQuery?.media);
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
