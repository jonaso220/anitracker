import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toAnime as jikanToAnime, searchJikan } from '../services/jikanService';
import { toAnime as kitsuToAnime, searchKitsu, mapIncludedStreamingLinks, siteNameFromUrl } from '../services/kitsuService';
import { toAnime as anilistToAnime, fetchAiringInfo, fetchAnilistUserAnimeLists, fetchSeason, fetchLatestAired, fetchDirectory } from '../services/anilistService';
import { toAnime as tvmazeToAnime } from '../services/tvmazeService';
import { toAnime as itunesToAnime } from '../services/itunesService';
import { toAnime as tmdbToAnime, parseTmdbKey, extractExtras, TMDB_MOVIE_ID_BASE, TMDB_TV_ID_BASE } from '../services/tmdbService';
import { searchAnime, clearSearchCache } from '../services/searchAnime';

describe('adapter: jikanService.toAnime', () => {
  it('maps Jikan fields into normalized anime', () => {
    const a = jikanToAnime({
      mal_id: 20,
      title: 'Naruto',
      title_english: 'Naruto',
      title_japanese: 'ナルト',
      title_synonyms: ['NRT'],
      images: { jpg: { large_image_url: 'big.jpg', image_url: 'sm.jpg' } },
      genres: [{ name: 'Action' }],
      synopsis: 'Ninja boy.',
      score: 8.2,
      episodes: 220,
      status: 'Finished Airing',
      year: 2002,
      type: 'TV',
    });
    expect(a).toMatchObject({
      id: 20, source: 'MAL', title: 'Naruto', titleJp: 'ナルト',
      sourceId: '20', sourceKey: 'mal:20', malId: 20,
      image: 'big.jpg', imageSm: 'sm.jpg', rating: 8.2, episodes: 220,
    });
    expect(a.malUrl).toBe('https://myanimelist.net/anime/20');
  });
});

describe('adapter: kitsuService.toAnime', () => {
  it('offsets Kitsu ids by 100000', () => {
    const a = kitsuToAnime({
      id: '42',
      attributes: { titles: { en: 'Show', ja_jp: 'ショー' }, canonicalTitle: 'Show', synopsis: 's', posterImage: {}, episodeCount: 12, showType: 'TV', startDate: '2020-01-01' },
    });
    expect(a.id).toBe(100042);
    expect(a.source).toBe('Kitsu');
    expect(a.year).toBe('2020');
  });
});

describe('adapter: anilistService.toAnime', () => {
  it('prefers idMal when available', () => {
    const a = anilistToAnime({ id: 5, idMal: 200, title: { english: 'A' }, coverImage: { large: 'l' }, synonyms: [] });
    expect(a.id).toBe(200);
    expect(a.sourceKey).toBe('anilist:5');
    expect(a.malId).toBe(200);
  });
  it('offsets AniList id by 300000 when no MAL id', () => {
    const a = anilistToAnime({ id: 5, idMal: null, title: { english: 'A' }, coverImage: { large: 'l' } });
    expect(a.id).toBe(300005);
  });
  it('maps AniList format enums to Spanish labels', () => {
    const a = anilistToAnime({ id: 1, title: { english: 'A' }, format: 'MOVIE' });
    expect(a.type).toBe('Película');
  });
});

describe('anilistService.fetchAnilistUserAnimeLists', () => {
  beforeEach(() => { vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('imports AniList entries into app destinations', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: {
          MediaListCollection: {
            lists: [{
              entries: [
                {
                  status: 'CURRENT',
                  progress: 4,
                  score: 8,
                  media: {
                    id: 5,
                    idMal: 200,
                    title: { english: 'A', romaji: 'A Romaji', native: 'A JP' },
                    coverImage: { large: 'cover.jpg' },
                    genres: ['Action'],
                    averageScore: 80,
                    episodes: 12,
                    format: 'TV',
                    status: 'RELEASING',
                    seasonYear: 2025,
                    description: 'Story',
                    siteUrl: 'https://anilist.co/anime/5',
                    synonyms: [],
                    externalLinks: [],
                  },
                },
                {
                  status: 'DROPPED',
                  progress: 2,
                  score: 0,
                  media: {
                    id: 6,
                    idMal: null,
                    title: { romaji: 'B' },
                    coverImage: {},
                    synonyms: [],
                  },
                },
              ],
            }],
          },
        },
      }),
    });

    const lists = await fetchAnilistUserAnimeLists('user');
    expect(lists.schedule[0]).toMatchObject({
      id: 200,
      sourceKey: 'anilist:5',
      currentEp: 4,
      userRating: 8,
      _importStatus: 'CURRENT',
    });
    expect(lists.watched[0]).toMatchObject({
      id: 300006,
      sourceKey: 'anilist:6',
      _dropped: true,
    });
  });

  it('throws a friendly code for unknown AniList users', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ errors: [{ message: 'User not found' }] }),
    });

    await expect(fetchAnilistUserAnimeLists('missing')).rejects.toMatchObject({ code: 'ANILIST_USER_NOT_FOUND' });
  });
});

describe('adapter: tvmazeService.toAnime', () => {
  it('offsets TVMaze ids by 400000', () => {
    const a = tvmazeToAnime({ id: 1, name: 'Show', image: { medium: 'm' } });
    expect(a.id).toBe(400001);
    expect(a.source).toBe('TVMaze');
  });

  it('normalizes the type to Serie so the type filter works', () => {
    const a = tvmazeToAnime({ id: 1, name: 'Show', type: 'Scripted' });
    expect(a.type).toBe('Serie');
  });
});

describe('adapter: tmdbService.toAnime', () => {
  it('maps a movie into the movie id range with Spanish genre names', () => {
    const a = tmdbToAnime({
      media_type: 'movie', id: 603, title: 'Matrix', original_title: 'The Matrix',
      poster_path: '/p.jpg', overview: 'Neo.', vote_average: 8.216,
      release_date: '1999-03-30', genre_ids: [28, 878],
    });
    expect(a.id).toBe(TMDB_MOVIE_ID_BASE + 603);
    expect(a.source).toBe('TMDB');
    expect(a.sourceKey).toBe('tmdb:movie:603');
    expect(a.type).toBe('Película');
    expect(a.year).toBe('1999');
    expect(a.rating).toBe(8.2);
    expect(a.genres).toEqual(['Acción', 'Ciencia ficción']);
    expect(a.image).toBe('https://image.tmdb.org/t/p/w500/p.jpg');
    expect(a.malUrl).toBe('https://www.themoviedb.org/movie/603');
  });

  it('maps a TV show into the tv id range', () => {
    const a = tmdbToAnime({ media_type: 'tv', id: 66732, name: 'Stranger Things', first_air_date: '2016-07-15', genre_ids: [10765] });
    expect(a.id).toBe(TMDB_TV_ID_BASE + 66732);
    expect(a.sourceKey).toBe('tmdb:tv:66732');
    expect(a.type).toBe('Serie');
    expect(a.genres).toEqual(['Ciencia ficción y fantasía']);
  });

  it('returns null for items with no title', () => {
    expect(tmdbToAnime({ media_type: 'movie', id: 1 })).toBeNull();
  });
});

describe('tmdbService.parseTmdbKey', () => {
  it('parses valid keys and rejects everything else', () => {
    expect(parseTmdbKey('tmdb:movie:603')).toEqual({ type: 'movie', id: 603 });
    expect(parseTmdbKey('tmdb:tv:42')).toEqual({ type: 'tv', id: 42 });
    expect(parseTmdbKey('anilist:5')).toBeNull();
    expect(parseTmdbKey('')).toBeNull();
    expect(parseTmdbKey(undefined)).toBeNull();
  });
});

describe('tmdbService.extractExtras', () => {
  const detail = {
    'watch/providers': {
      results: {
        AR: {
          link: 'https://www.themoviedb.org/movie/603/watch?locale=AR',
          flatrate: [{ provider_name: 'Netflix', logo_path: '/n.jpg' }],
          rent: [{ provider_name: 'Apple TV' }],
        },
      },
    },
    videos: {
      results: [
        { site: 'YouTube', type: 'Teaser', key: 'teaser1' },
        { site: 'YouTube', type: 'Trailer', key: 'trailer1' },
      ],
    },
  };

  it('extracts providers for the requested region and prefers real trailers', () => {
    const { providers, trailerUrl } = extractExtras(detail, 'AR');
    expect(providers.flatrate).toEqual([{ name: 'Netflix', logo: 'https://image.tmdb.org/t/p/w45/n.jpg' }]);
    expect(providers.rent).toEqual([{ name: 'Apple TV', logo: '' }]);
    expect(providers.buy).toEqual([]);
    expect(providers.link).toContain('/watch?locale=AR');
    expect(trailerUrl).toBe('https://www.youtube.com/watch?v=trailer1');
  });

  it('returns empty providers for regions without data', () => {
    const { providers } = extractExtras(detail, 'ES');
    expect(providers.flatrate).toEqual([]);
    expect(providers.link).toBe('');
  });

  it('falls back to any YouTube video when there is no Trailer', () => {
    const { trailerUrl } = extractExtras({ videos: { results: [{ site: 'YouTube', type: 'Teaser', key: 'k1' }] } }, 'AR');
    expect(trailerUrl).toBe('https://www.youtube.com/watch?v=k1');
  });
});

describe('kitsuService streaming links', () => {
  it('derives platform names from URLs', () => {
    expect(siteNameFromUrl('https://www.crunchyroll.com/frieren')).toBe('Crunchyroll');
    expect(siteNameFromUrl('https://www.netflix.com/title/1')).toBe('Netflix');
    expect(siteNameFromUrl('https://something.example.com/x')).toBe('Example');
    expect(siteNameFromUrl('not-a-url')).toBe('Streaming');
  });

  it('joins included streamingLinks onto the anime via relationships', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: [{
          id: '42',
          attributes: { canonicalTitle: 'Show', titles: {} },
          relationships: { streamingLinks: { data: [{ type: 'streamingLinks', id: '7' }] } },
        }],
        included: [{ id: '7', type: 'streamingLinks', attributes: { url: 'https://www.crunchyroll.com/show' } }],
      }),
    });
    const [a] = await searchKitsu('show');
    expect(a.streamingLinks).toEqual([{ site: 'Crunchyroll', url: 'https://www.crunchyroll.com/show', language: '' }]);
    expect(globalThis.fetch.mock.calls[0][0]).toContain('include=streamingLinks');
    vi.restoreAllMocks();
  });

  it('ignores malformed included entries', () => {
    const map = mapIncludedStreamingLinks([
      { id: '1', type: 'streamingLinks', attributes: {} },
      { id: '2', type: 'other', attributes: { url: 'https://x.com' } },
      null,
    ]);
    expect(map.size).toBe(0);
  });
});

describe('jikanService retry', () => {
  beforeEach(() => { vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('retries once after a 429 and returns the second response', async () => {
    globalThis.fetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [{ mal_id: 1, title: 'Naruto', images: {} }] }) });
    const results = await searchJikan('naruto', { retryDelayMs: 0 });
    expect(results).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry client errors', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 400 });
    await expect(searchJikan('naruto', { retryDelayMs: 0 })).rejects.toThrow('Jikan HTTP 400');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('adapter: itunesService.toAnime', () => {
  it('offsets iTunes ids by 500000 and expands artwork', () => {
    const a = itunesToAnime({ trackId: 1, trackName: 'Film', kind: 'feature-movie', artworkUrl100: 'https://x/100x100.jpg', releaseDate: '2020-01-01T00:00:00Z' });
    expect(a.id).toBe(500001);
    expect(a.source).toBe('iTunes');
    expect(a.type).toBe('Película');
    expect(a.image).toBe('https://x/600x600.jpg');
  });
  it('returns null for items with no title', () => {
    expect(itunesToAnime({ trackId: 1 })).toBeNull();
  });
});

describe('anilistService.fetchSeason', () => {
  beforeEach(() => { vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => { vi.restoreAllMocks(); });

  const mediaPage = (media, hasNextPage = false) => ({
    ok: true,
    json: () => Promise.resolve({ data: { Page: { pageInfo: { hasNextPage }, media } } }),
  });
  const media = (id, title, extra = {}) => ({ id, idMal: id, title: { romaji: title }, coverImage: {}, ...extra });

  it('paginates until hasNextPage is false', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(mediaPage([media(1, 'A')], true))
      .mockResolvedValueOnce(mediaPage([media(2, 'B')], false));
    const res = await fetchSeason('WINTER', 2020);
    expect(res.map((a) => a.title)).toEqual(['A', 'B']);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('with current: true merges continuing shows and attaches _airing', async () => {
    globalThis.fetch.mockImplementation((url, opts) => {
      const { query } = JSON.parse(opts.body);
      if (query.includes('airingSchedules')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            data: { Page: { pageInfo: { hasNextPage: false }, airingSchedules: [{ mediaId: 111, episode: 5, airingAt: 1000 }] } },
          }),
        });
      }
      if (query.includes('$season')) {
        return Promise.resolve(mediaPage([media(111, 'Seasonal', { nextAiringEpisode: { airingAt: 2000, episode: 6 } })]));
      }
      // Query de RELEASING: incluye un duplicado de la temporada y una continuación.
      return Promise.resolve(mediaPage([media(111, 'Seasonal dup'), media(222, 'Continuing')]));
    });

    const res = await fetchSeason('SUMMER', 2026, { current: true });
    expect(res).toHaveLength(2);

    const seasonal = res.find((a) => a.id === 111);
    expect(seasonal._continuing).toBeUndefined();
    expect(seasonal._airing).toEqual({ lastEpisode: 5, lastAiredAt: 1000, nextEpisode: 6, nextAiringAt: 2000 });

    const continuing = res.find((a) => a.id === 222);
    expect(continuing._continuing).toBe(true);
    expect(continuing.title).toBe('Continuing');
  });

  it('without current does not fetch continuing shows nor airing schedules', async () => {
    globalThis.fetch.mockResolvedValueOnce(mediaPage([media(1, 'A')]));
    await fetchSeason('WINTER', 2020);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const { query } = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(query).toContain('$season');
  });
});

describe('anilistService.fetchDirectory', () => {
  beforeEach(() => { vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => { vi.restoreAllMocks(); });

  const okPage = (media, hasNextPage = false) => ({
    ok: true,
    json: () => Promise.resolve({ data: { Page: { pageInfo: { hasNextPage }, media } } }),
  });

  it('omits unset filters from variables and applies the set ones', async () => {
    globalThis.fetch.mockResolvedValueOnce(okPage([]));
    await fetchDirectory({ genre: 'Action', year: '2020', demography: 'Shounen', search: '  ', format: '', status: '', season: '' });
    const { variables } = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(variables).toEqual({ page: 1, perPage: 30, sort: ['POPULARITY_DESC'], genre: 'Action', seasonYear: 2020, tag: 'Shounen' });
  });

  it('passes search, custom sort and page, and maps results', async () => {
    globalThis.fetch.mockResolvedValueOnce(okPage([{ id: 5, idMal: 5, title: { romaji: 'Naruto' }, coverImage: {} }], true));
    const res = await fetchDirectory({ search: 'naru', sort: 'SCORE_DESC' }, { page: 3 });
    const { variables } = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(variables.search).toBe('naru');
    expect(variables.sort).toEqual(['SCORE_DESC']);
    expect(variables.page).toBe(3);
    expect(res.hasNextPage).toBe(true);
    expect(res.results).toHaveLength(1);
    expect(res.results[0].title).toBe('Naruto');
  });
});

describe('anilistService.fetchLatestAired', () => {
  beforeEach(() => { vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns empty map without ids and keeps the first (latest) entry per media', async () => {
    expect(await fetchLatestAired([])).toEqual({});
    expect(globalThis.fetch).not.toHaveBeenCalled();

    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: {
          Page: {
            pageInfo: { hasNextPage: false },
            airingSchedules: [
              { mediaId: 1, episode: 8, airingAt: 5000 },
              { mediaId: 1, episode: 7, airingAt: 4000 },
              { mediaId: 2, episode: 3, airingAt: 4500 },
            ],
          },
        },
      }),
    });
    const res = await fetchLatestAired([1, 2]);
    expect(res).toEqual({ 1: { episode: 8, airingAt: 5000 }, 2: { episode: 3, airingAt: 4500 } });
  });
});

describe('anilistService.fetchAiringInfo', () => {
  beforeEach(() => { vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns empty object when no ids provided', async () => {
    const res = await fetchAiringInfo({});
    expect(res).toEqual({});
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('maps airing results keyed by app id', async () => {
    const airingAt = Math.floor(Date.now() / 1000) - 60; // aired 1 minute ago
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: { malQuery: { media: [{ idMal: 10, id: 111, episodes: 24, title: { english: 'Test' }, nextAiringEpisode: { airingAt, episode: 5, timeUntilAiring: -60 } }] } },
      }),
    });
    const res = await fetchAiringInfo({ malIds: [10] });
    expect(res[10]).toBeDefined();
    expect(res[10].episode).toBe(5);
    expect(res[10].hasAired).toBe(true);
  });
});

describe('searchAnime integration (mocked)', () => {
  beforeEach(() => { clearSearchCache(); vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns empty when query is too short', async () => {
    const { results, failedApis } = await searchAnime('a');
    expect(results).toEqual([]);
    expect(failedApis).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('aggregates results from multiple APIs and deduplicates', async () => {
    // Jikan
    globalThis.fetch.mockImplementation((url) => {
      if (url.includes('jikan')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ mal_id: 1, title: 'Naruto', images: {} }] }) });
      if (url.includes('kitsu')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
      if (url.includes('anilist')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { Page: { media: [] } } }) });
      if (url.includes('tvmaze')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      if (url.includes('itunes')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const { results, failedApis } = await searchAnime('Naruto');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe('Naruto');
    expect(failedApis).toEqual([]);
  });

  it('reports failed APIs but still returns partial results', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (url.includes('jikan')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ mal_id: 1, title: 'Naruto', images: {} }] }) });
      if (url.includes('kitsu')) return Promise.reject(new Error('kitsu down'));
      if (url.includes('anilist')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { Page: { media: [] } } }) });
      if (url.includes('tvmaze')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      if (url.includes('itunes')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const { results, failedApis } = await searchAnime('Naruto');
    expect(results.length).toBe(1);
    expect(failedApis).toContain('Kitsu');
  });

  it('serves repeated queries from cache without refetching', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (url.includes('jikan')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ mal_id: 1, title: 'Naruto', images: {} }] }) });
      if (url.includes('kitsu')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
      if (url.includes('anilist')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { Page: { media: [] } } }) });
      if (url.includes('tvmaze')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      if (url.includes('itunes')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    await searchAnime('Naruto');
    const callsAfterFirst = globalThis.fetch.mock.calls.length;
    const { results } = await searchAnime('naruto');
    expect(globalThis.fetch.mock.calls.length).toBe(callsAfterFirst);
    expect(results[0].title).toBe('Naruto');
  });

  it('does not cache searches where an API failed', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (url.includes('jikan')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ mal_id: 1, title: 'Naruto', images: {} }] }) });
      if (url.includes('kitsu')) return Promise.reject(new Error('kitsu down'));
      if (url.includes('anilist')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { Page: { media: [] } } }) });
      if (url.includes('tvmaze')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      if (url.includes('itunes')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    await searchAnime('Naruto');
    const callsAfterFirst = globalThis.fetch.mock.calls.length;
    await searchAnime('Naruto');
    expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('merges streaming links and trailer into the deduped winner', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (url.includes('jikan')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ mal_id: 1, title: 'Naruto', images: {} }] }) });
      if (url.includes('kitsu')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
      if (url.includes('anilist')) return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { Page: { media: [{
          id: 20, idMal: 1, title: { english: 'Naruto' }, coverImage: {},
          externalLinks: [{ url: 'https://www.crunchyroll.com/naruto', site: 'Crunchyroll', type: 'STREAMING', language: '' }],
          trailer: { id: 'abc123', site: 'youtube' },
        }] } } }),
      });
      if (url.includes('tvmaze')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      if (url.includes('itunes')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const { results } = await searchAnime('Naruto');
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('MAL');
    expect(results[0].streamingLinks).toEqual([{ site: 'Crunchyroll', url: 'https://www.crunchyroll.com/naruto', language: '' }]);
    expect(results[0].trailerUrl).toBe('https://www.youtube.com/watch?v=abc123');
  });
});
