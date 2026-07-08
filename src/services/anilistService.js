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

async function fetchAllMediaPages(gql, variables, { signal, maxPages = 4, perPage = 50 } = {}) {
  const media = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await anilistFetch(gql, { ...variables, page, perPage }, { signal });
    const pageData = data?.data?.Page;
    media.push(...(pageData?.media || []));
    if (!pageData?.pageInfo?.hasNextPage) break;
  }
  return media;
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
  const media = await fetchAllMediaPages(SEASON_PAGE_QUERY, { season, year }, { signal, maxPages: 4 });

  const continuingIds = new Set();
  if (current) {
    try {
      const releasing = await fetchAllMediaPages(RELEASING_PAGE_QUERY, {}, { signal, maxPages: 3 });
      const seen = new Set(media.map((m) => m.id));
      for (const m of releasing) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        continuingIds.add(m.id);
        media.push(m);
      }
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      console.error('[AniTracker] Continuing anime fetch failed:', err);
    }
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

  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const result = {};
  const processMedia = (media) => {
    if (!media) return;
    for (const m of media) {
      const appId = m.idMal && m.idMal < 100000 ? m.idMal : (m.id + 300000);
      const airing = m.nextAiringEpisode;
      if (!airing) continue;
      const airingDate = new Date(airing.airingAt * 1000);
      const diffHours = (airingDate - now) / (1000 * 60 * 60);
      result[appId] = {
        episode: airing.episode,
        airingAt: airing.airingAt,
        timeUntilAiring: airing.timeUntilAiring,
        isToday: airingDate.toDateString() === now.toDateString(),
        isTomorrow: airingDate.toDateString() === tomorrow.toDateString(),
        isThisWeek: diffHours > 0 && diffHours <= 7 * 24,
        hasAired: diffHours <= 0 && diffHours > -24,
        totalEpisodes: m.episodes,
        title: m.title?.english || m.title?.romaji || '',
      };
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
