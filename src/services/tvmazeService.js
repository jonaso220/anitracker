import { normalizeAnime } from '../schemas/anime';

const TVMAZE_BASE = 'https://api.tvmaze.com';

const STATUS_MAP = {
  Running: 'En emisión',
  Ended: 'Finalizado',
  'To Be Determined': 'Por determinar',
  'In Development': 'En desarrollo',
};

export async function searchTvmaze(query, { signal, limit = 10 } = {}) {
  const res = await fetch(`${TVMAZE_BASE}/search/shows?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) throw new Error(`TVMaze HTTP ${res.status}`);
  const json = await res.json();
  return (Array.isArray(json) ? json : []).slice(0, limit).map((r) => toAnime(r.show)).filter(Boolean);
}

export function toAnime(s) {
  if (!s) return null;
  const title = s.name || '';
  return normalizeAnime({
    id: s.id + 400000,
    source: 'TVMaze',
    sourceId: s.id,
    sourceKey: `tvmaze:${s.id}`,
    title,
    titleOriginal: title,
    titleJp: '',
    titleEn: title,
    altTitles: [],
    image: s.image?.original || s.image?.medium || '',
    imageSm: s.image?.medium || '',
    genres: s.genres || [],
    synopsis: (s.summary || '').replace(/<[^>]*>/g, '').trim(),
    rating: s.rating?.average || 0,
    episodes: null,
    status: STATUS_MAP[s.status] || s.status || '',
    year: s.premiered ? s.premiered.split('-')[0] : '',
    type: s.type || 'Serie',
    malUrl: s.url || `https://www.tvmaze.com/shows/${s.id}`,
  });
}
