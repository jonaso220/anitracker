import { normalizeAnime } from '../schemas/anime';

const KITSU_BASE = 'https://kitsu.app/api/edge';

export async function searchKitsu(query, { signal, limit = 10 } = {}) {
  const url = `${KITSU_BASE}/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=${limit}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Kitsu HTTP ${res.status}`);
  const json = await res.json();
  return (json?.data || []).map(toAnime).filter(Boolean);
}

export function toAnime(a) {
  const at = a.attributes || {};
  const titleEn = at.titles?.en || at.titles?.en_us || at.canonicalTitle || '';
  const titleJp = at.titles?.ja_jp || '';
  const title = titleEn || at.canonicalTitle || '';
  const allTitles = [titleEn, titleJp, at.canonicalTitle, ...(at.abbreviatedTitles || [])].filter(Boolean);
  return normalizeAnime({
    id: parseInt(a.id, 10) + 100000,
    source: 'Kitsu',
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
  });
}
