import { normalizeAnime } from '../schemas/anime';

const ANILIST_URL = 'https://graphql.anilist.co';

const FORMAT_MAP = { TV: 'TV', TV_SHORT: 'TV Short', MOVIE: 'Película', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };
const STATUS_MAP = { FINISHED: 'Finished', RELEASING: 'En emisión', NOT_YET_RELEASED: 'No estrenado', CANCELLED: 'Cancelado', HIATUS: 'En pausa' };

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
        coverImage { large medium } bannerImage
        genres averageScore episodes status seasonYear format
        description(asHtml: false) siteUrl synonyms
      }
    }
  }`;
  const data = await anilistFetch(gql, { search: query, perPage: limit }, { signal });
  return (data?.data?.Page?.media || []).map(toAnime).filter(Boolean);
}

export async function fetchSeason(season, year, { signal, perPage = 30 } = {}) {
  const gql = `query ($season: MediaSeason, $year: Int, $perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
        id idMal title { romaji english native } coverImage { large medium }
        genres averageScore episodes format status seasonYear
        description(asHtml: false) siteUrl
      }
    }
  }`;
  const data = await anilistFetch(gql, { season, year, perPage }, { signal });
  return (data?.data?.Page?.media || []).map((m) => toAnime(m, { fallbackYear: year })).filter(Boolean);
}

export async function fetchTopAnime({ signal, perPage = 50 } = {}) {
  const gql = `query ($perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      media(type: ANIME, sort: SCORE_DESC, isAdult: false) {
        id idMal title { romaji english native } coverImage { large medium }
        genres averageScore episodes format status seasonYear
        description(asHtml: false) siteUrl
      }
    }
  }`;
  const data = await anilistFetch(gql, { perPage }, { signal });
  return (data?.data?.Page?.media || []).map((m) => toAnime(m)).filter(Boolean);
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
  return normalizeAnime({
    id: a.idMal || (a.id + 300000),
    source: 'AniList',
    title,
    titleOriginal: titleRomaji,
    titleJp: titleNative,
    titleEn,
    altTitles: allTitles.filter((t, i, arr) => arr.indexOf(t) === i && t !== title),
    image: a.coverImage?.large || '',
    imageSm: a.coverImage?.medium || a.coverImage?.large || '',
    genres: a.genres || [],
    synopsis: cleanSynopsis,
    rating: a.averageScore ? Number((a.averageScore / 10).toFixed(1)) : 0,
    episodes: a.episodes,
    status: STATUS_MAP[a.status] || a.status || '',
    year: a.seasonYear || fallbackYear || '',
    type: FORMAT_MAP[a.format] || a.format || '',
    malUrl: a.siteUrl || `https://anilist.co/anime/${a.id}`,
  });
}
