import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toAnime as jikanToAnime } from '../services/jikanService';
import { toAnime as kitsuToAnime } from '../services/kitsuService';
import { toAnime as anilistToAnime, fetchAiringInfo, fetchAnilistUserAnimeLists } from '../services/anilistService';
import { toAnime as tvmazeToAnime } from '../services/tvmazeService';
import { toAnime as itunesToAnime } from '../services/itunesService';
import { searchAnime } from '../services/searchAnime';

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
  beforeEach(() => { vi.spyOn(globalThis, 'fetch'); });
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
});
