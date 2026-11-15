import { normalizeAnime } from '../schemas/anime';

const KITSU_BASE = 'https://kitsu.app/api/edge';

// Derive a display name for a streaming URL's platform (Kitsu's streamingLinks
// only carry the URL; the human name lives in a second-level include).
const SITE_NAMES = [
  ['crunchyroll', 'Crunchyroll'],
  ['netflix', 'Netflix'],
  ['hidive', 'HIDIVE'],
  ['funimation', 'Funimation'],
  ['hulu', 'Hulu'],
  ['disneyplus', 'Disney+'],
  ['primevideo', 'Prime Video'],
  ['amazon', 'Prime Video'],
  ['youtube', 'YouTube'],
  ['tubitv', 'Tubi'],
];

export function siteNameFromUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const hit = SITE_NAMES.find(([needle]) => host.includes(needle));
    if (hit) return hit[1];
    const parts = host.replace(/^www\./, '').split('.');
    const base = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Streaming';
  } catch {
    return 'Streaming';
  }
}

// Build a map of streamingLink id -> normalized link from a JSON:API `included` array.
export function mapIncludedStreamingLinks(included) {
  const map = new Map();
  for (const item of Array.isArray(included) ? included : []) {
    const url = item?.attributes?.url;
    if (item?.type === 'streamingLinks' && typeof url === 'string' && url) {
      map.set(String(item.id), { site: siteNameFromUrl(url), url, language: '' });
    }
  }
  return map;
}

export async function searchKitsu(query, { signal, limit = 10 } = {}) {
  const base = `${KITSU_BASE}/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=${limit}`;
  let res = await fetch(`${base}&include=streamingLinks`, { signal });
  if (!res.ok && res.status >= 400 && res.status < 500 && res.status !== 429) {
    // If the API ever rejects the include param, degrade to the plain search.
    res = await fetch(base, { signal });
  }
  if (!res.ok) throw new Error(`Kitsu HTTP ${res.status}`);
  const json = await res.json();
  const linksById = mapIncludedStreamingLinks(json?.included);
  return (json?.data || []).map((a) => toAnime(a, linksById)).filter(Boolean);
}

export function toAnime(a, linksById = new Map()) {
  const at = a.attributes || {};
  const titleEn = at.titles?.en || at.titles?.en_us || at.canonicalTitle || '';
  const titleJp = at.titles?.ja_jp || '';
  const title = titleEn || at.canonicalTitle || '';
  const allTitles = [titleEn, titleJp, at.canonicalTitle, ...(at.abbreviatedTitles || [])].filter(Boolean);
  const streamingLinks = (a.relationships?.streamingLinks?.data || [])
    .map((ref) => linksById.get(String(ref?.id)))
    .filter(Boolean);
  return normalizeAnime({
    id: parseInt(a.id, 10) + 100000,
    source: 'Kitsu',
    sourceId: a.id,
    sourceKey: `kitsu:${a.id}`,
    title,
    titleOriginal: at.canonicalTitle || '',
    titleJp,
    titleEn,
    altTitles: allTitles.filter((t, i, arr) => arr.indexOf(t) === i && t !== title),
    image: at.posterImage?.large || at.posterImage?.medium || '',
    imageSm: at.posterImage?.small || at.posterImage?.medium || '',
    genres: [],
    synopsis: at.synopsis || '',
    rating: at.averageRating ? Number((parseFloat(at.averageRating) / 10).toFixed(1)) : 0,
    episodes: at.episodeCount,
    status: at.status || '',
    year: at.startDate ? at.startDate.split('-')[0] : '',
    type: at.showType || '',
    malUrl: `https://kitsu.app/anime/${a.id}`,
    streamingLinks,
  });
}

/** Kitsu devuelve hasta 20 anime por página. */
const KITSU_MAPPINGS_BATCH = 20;

/**
 * Equivalencias de Kitsu con otras bases, para poder enviar a AniList el
 * progreso de un anime guardado desde Kitsu. Devuelve
 * `Map<kitsuId, { anilistId, malId }>` (null si Kitsu no la tiene); un id que
 * Kitsu no conoce igual vuelve, con las dos en null.
 */
export async function fetchKitsuMappings(kitsuIds, { signal } = {}) {
  const ids = [...new Set((kitsuIds || []).map(Number).filter((id) => id > 0))];
  const mappings = new Map();
  for (let i = 0; i < ids.length; i += KITSU_MAPPINGS_BATCH) {
    const chunk = ids.slice(i, i + KITSU_MAPPINGS_BATCH);
    const url = `${KITSU_BASE}/anime?filter[id]=${chunk.join(',')}&include=mappings`
      + `&fields[anime]=mappings&fields[mappings]=externalSite,externalId&page[limit]=${KITSU_MAPPINGS_BATCH}`;
    const res = await fetch(url, { signal, headers: { Accept: 'application/vnd.api+json' } });
    if (!res.ok) throw new Error(`Kitsu mappings request failed: ${res.status}`);
    const json = await res.json();
    const byId = new Map((json?.included || [])
      .filter((item) => item?.type === 'mappings')
      .map((item) => [item.id, item.attributes || {}]));
    for (const anime of json?.data || []) {
      const found = { anilistId: null, malId: null };
      for (const ref of anime?.relationships?.mappings?.data || []) {
        const mapping = byId.get(ref.id);
        const externalId = Number(mapping?.externalId);
        if (!(externalId > 0)) continue;
        if (mapping.externalSite === 'anilist/anime') found.anilistId = externalId;
        else if (mapping.externalSite === 'myanimelist/anime') found.malId = externalId;
      }
      mappings.set(Number(anime.id), found);
    }
    for (const id of chunk) if (!mappings.has(id)) mappings.set(id, { anilistId: null, malId: null });
  }
  return mappings;
}
