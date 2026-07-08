import { normalizeAnime } from '../schemas/anime';

const JIKAN_BASE = 'https://api.jikan.moe/v4';

// Jikan is rate-limited (~3 req/s); a 429 mid-typing is common. One short,
// abort-aware retry recovers most of those instead of dropping MAL results.
const RETRY_DELAY_MS = 1100;

const abortableDelay = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
  const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
  signal?.addEventListener('abort', onAbort, { once: true });
});

export async function searchJikan(query, { signal, limit = 10, retries = 1, retryDelayMs = RETRY_DELAY_MS } = {}) {
  const url = `${JIKAN_BASE}/anime?q=${encodeURIComponent(query)}&limit=${limit}&sfw=true`;
  let res = await fetch(url, { signal });
  while (!res.ok && retries > 0 && (res.status === 429 || res.status >= 500)) {
    retries -= 1;
    await abortableDelay(retryDelayMs, signal);
    res = await fetch(url, { signal });
  }
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
    sourceId: a.mal_id,
    sourceKey: `mal:${a.mal_id}`,
    malId: a.mal_id,
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
