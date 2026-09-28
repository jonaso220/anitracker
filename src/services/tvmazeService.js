import { normalizeAnime } from '../schemas/anime';
import { buildAiringInfo } from '../utils';

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
    // TVMaze types ('Scripted', 'Animation'…) don't match the app's type filter
    // vocabulary; everything TVMaze returns is a series.
    type: 'Serie',
    malUrl: s.url || `https://www.tvmaze.com/shows/${s.id}`,
  });
}

/** Id de TVMaze de un anime guardado (por sourceKey), o null. */
export function tvmazeIdOf(anime) {
  const m = /^tvmaze:(\d+)$/.exec(anime?.sourceKey || '');
  return m ? Number(m[1]) : null;
}

// TVMaze permite ~20 pedidos cada 10 s por IP: de a tandas con pausa.
const TVMAZE_BATCH = 18;
const TVMAZE_WINDOW_MS = 10000;

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const id = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
});

// El episodio a mostrar: el que salió en las últimas 24 h (disponible) o, si
// no, el próximo. Los especiales sin número no cuentan.
function pickEpisode({ previousepisode: prev, nextepisode: next } = {}, now) {
  const at = (ep) => (ep?.airstamp ? Date.parse(ep.airstamp) / 1000 : NaN);
  const nowSec = now.getTime() / 1000;
  if (prev?.number && nowSec - at(prev) < 24 * 3600) return prev;
  if (next?.number && Number.isFinite(at(next))) return next;
  return null;
}

/**
 * Próximo episodio (o el que acaba de salir) de series de TVMaze, con fecha y
 * hora exactas y el número dentro de su temporada. Devuelve
 * { [tvmazeId]: airingInfo }; quien llama lo asocia a sus ids internos.
 */
export async function fetchTvmazeAiringInfo({ tvmazeIds = [], signal, now = new Date() } = {}) {
  if (tvmazeIds.length === 0) return {};
  const settled = [];
  for (let i = 0; i < tvmazeIds.length; i += TVMAZE_BATCH) {
    if (i > 0) await sleep(TVMAZE_WINDOW_MS, signal);
    const batch = tvmazeIds.slice(i, i + TVMAZE_BATCH);
    settled.push(...await Promise.allSettled(batch.map(async (id) => {
      const res = await fetch(`${TVMAZE_BASE}/shows/${id}?embed[]=nextepisode&embed[]=previousepisode`, { signal });
      if (!res.ok) throw new Error(`TVMaze HTTP ${res.status}`);
      return [id, await res.json()];
    })));
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const failed = settled.filter((r) => r.status === 'rejected');
  if (failed.length === settled.length) throw failed[0].reason;

  const result = {};
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    const [id, show] = r.value;
    const ep = pickEpisode(show?._embedded, now);
    if (!ep) continue;
    result[id] = buildAiringInfo({
      episode: ep.number,
      season: ep.season || null,
      airingAt: Math.round(Date.parse(ep.airstamp) / 1000),
      title: show.name || '',
    }, now);
  }
  return result;
}
