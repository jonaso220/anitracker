import { normalizeAnime } from '../schemas/anime';

const JIKAN_BASE = 'https://api.jikan.moe/v4';

export async function searchJikan(query, { signal, limit = 10 } = {}) {
  const url = `${JIKAN_BASE}/anime?q=${encodeURIComponent(query)}&limit=${limit}&sfw=true`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Jikan HTTP ${res.status}`);
  const json = await res.json();
  return (json?.data || []).map(toAnime).filter(Boolean);
}

export function toAnime(a) {
  const titleEn = a.title_english || '';
  const title = titleEn || a.title || '';
  const allTitles = [a.title, titleEn, a.title_japanese, ...(a.title_synonyms || [])].filter(Boolean);
  return normalizeAnime({
    id: a.mal_id,
    source: 'MAL',
    title,
    titleOriginal: a.title,
    titleJp: a.title_japanese || '',
    titleEn,
    altTitles: allTitles.filter((t, i, arr) => arr.indexOf(t) === i && t !== title),
    image: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || '',
    imageSm: a.images?.jpg?.image_url || a.images?.jpg?.small_image_url || '',
    genres: a.genres?.map((g) => g.name) || [],
    synopsis: a.synopsis || '',
    rating: a.score || 0,
    episodes: a.episodes,
    status: a.status || '',
    year: a.year || a.aired?.prop?.from?.year || '',
    type: a.type || '',
    malUrl: `https://myanimelist.net/anime/${a.mal_id}`,
  });
}
