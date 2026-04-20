import { normalizeAnime } from '../schemas/anime';
import { hashString } from '../utils';

const ITUNES_BASE = 'https://itunes.apple.com';

export async function searchItunes(query, { signal, limit = 10 } = {}) {
  const url = `${ITUNES_BASE}/search?term=${encodeURIComponent(query)}&media=movie&entity=movie,tvSeason&limit=${limit}&country=US`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`iTunes HTTP ${res.status}`);
  const json = await res.json();
  return (json?.results || []).map(toAnime).filter(Boolean);
}

export function toAnime(item) {
  if (!item) return null;
  const title = item.trackName || item.collectionName || '';
  if (!title) return null;
  const isMovie = item.kind === 'feature-movie';
  const artUrl = (item.artworkUrl100 || '').replace('100x100', '600x600');
  const id = (item.trackId || item.collectionId || hashString(title)) + 500000;
  return normalizeAnime({
    id,
    source: 'iTunes',
    title,
    titleOriginal: title,
    titleJp: '',
    titleEn: title,
    altTitles: [],
    image: artUrl,
    imageSm: item.artworkUrl100 || '',
    genres: item.primaryGenreName ? [item.primaryGenreName] : [],
    synopsis: item.longDescription || item.shortDescription || '',
    rating: 0,
    episodes: null,
    status: '',
    year: item.releaseDate ? item.releaseDate.split('-')[0] : '',
    type: isMovie ? 'Película' : 'Serie',
    malUrl: item.trackViewUrl || item.collectionViewUrl || '',
  });
}
