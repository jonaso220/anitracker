import { describe, it, expect } from 'vitest';
import { clean, filterByLocalSearch, getFilteredWatched, parseEpisodes, hashString, buildBackup, parseBackup, getPlatformInfo, pickAutoWatchLink, formatAiringWhen, formatAiringDate, formatTimeAgo, formatTimeUntil, getAiringDayIndex, groupSeasonByDay, looksSpanish } from '../utils';

describe('clean', () => {
  it('removes internal flags from anime object', () => {
    const anime = { id: 1, title: 'Test', _day: 'Lunes', _isWatchLater: true, _isWatched: false, _isSeason: true, _isTop: true, _isCustomList: true, _customListId: 'abc', _airing: { lastEpisode: 3 }, _continuing: true };
    const result = clean(anime);
    expect(result).toEqual({ id: 1, title: 'Test' });
    expect(result._day).toBeUndefined();
    expect(result._isWatchLater).toBeUndefined();
    expect(result._isWatched).toBeUndefined();
    expect(result._isSeason).toBeUndefined();
    expect(result._isTop).toBeUndefined();
    expect(result._isCustomList).toBeUndefined();
    expect(result._customListId).toBeUndefined();
    expect(result._airing).toBeUndefined();
    expect(result._continuing).toBeUndefined();
  });

  it('preserves all non-flag properties', () => {
    const anime = { id: 1, title: 'Naruto', genres: ['Action'], rating: 8.5, currentEp: 5 };
    expect(clean(anime)).toEqual(anime);
  });
});

describe('formatTimeAgo', () => {
  const nowMs = new Date(2026, 6, 8, 12, 0, 0).getTime();
  const secondsAgo = (s) => Math.floor(nowMs / 1000) - s;

  it('formats recent moments', () => {
    expect(formatTimeAgo(secondsAgo(30), nowMs)).toBe('hace un momento');
  });
  it('formats minutes with singular/plural', () => {
    expect(formatTimeAgo(secondsAgo(60), nowMs)).toBe('hace 1 minuto');
    expect(formatTimeAgo(secondsAgo(45 * 60), nowMs)).toBe('hace 45 minutos');
  });
  it('formats hours', () => {
    expect(formatTimeAgo(secondsAgo(3 * 3600), nowMs)).toBe('hace 3 horas');
  });
  it('formats days and weeks', () => {
    expect(formatTimeAgo(secondsAgo(2 * 86400), nowMs)).toBe('hace 2 días');
    expect(formatTimeAgo(secondsAgo(21 * 86400), nowMs)).toBe('hace 3 semanas');
  });
  it('formats months', () => {
    expect(formatTimeAgo(secondsAgo(70 * 86400), nowMs)).toBe('hace 2 meses');
  });
  it('clamps future timestamps to "hace un momento"', () => {
    expect(formatTimeAgo(secondsAgo(-500), nowMs)).toBe('hace un momento');
  });
});

describe('formatTimeUntil', () => {
  const nowMs = new Date(2026, 6, 8, 12, 0, 0).getTime();
  const secondsAhead = (s) => Math.floor(nowMs / 1000) + s;

  it('formats minutes, hours, days and weeks', () => {
    expect(formatTimeUntil(secondsAhead(40 * 60), nowMs)).toBe('en 40 minutos');
    expect(formatTimeUntil(secondsAhead(5 * 3600), nowMs)).toBe('en 5 horas');
    expect(formatTimeUntil(secondsAhead(3 * 86400), nowMs)).toBe('en 3 días');
    expect(formatTimeUntil(secondsAhead(15 * 86400), nowMs)).toBe('en 2 semanas');
  });
  it('returns "ya disponible" for past timestamps', () => {
    expect(formatTimeUntil(secondsAhead(-10), nowMs)).toBe('¡ya disponible!');
  });
});

describe('groupSeasonByDay', () => {
  // Timestamps locales: 2026-07-06 es lunes, 2026-07-12 es domingo.
  const ts = (day, hour) => Math.floor(new Date(2026, 6, day, hour, 0, 0).getTime() / 1000);

  it('computes Monday-first day index from airing info', () => {
    expect(getAiringDayIndex({ nextAiringAt: ts(6, 20) })).toBe(0);   // lunes
    expect(getAiringDayIndex({ lastAiredAt: ts(12, 10) })).toBe(6);   // domingo
    expect(getAiringDayIndex(null)).toBeNull();
    expect(getAiringDayIndex({})).toBeNull();
  });

  it('groups by local weekday, sorts by broadcast hour, and collects undated', () => {
    const list = [
      { id: 1, _airing: { nextAiringAt: ts(6, 22) } },                 // lunes 22:00
      { id: 2, _airing: { lastAiredAt: ts(12, 10) } },                 // domingo (sin próximo ep)
      { id: 3 },                                                       // sin info de emisión
      { id: 4, _airing: { nextAiringAt: ts(6, 9) } },                  // lunes 09:00
    ];
    const { days, undated } = groupSeasonByDay(list);
    expect(days[0].map((a) => a.id)).toEqual([4, 1]);
    expect(days[6].map((a) => a.id)).toEqual([2]);
    expect(days[1]).toEqual([]);
    expect(undated.map((a) => a.id)).toEqual([3]);
  });

  it('prefers the next episode day over the last aired one', () => {
    const anime = { id: 1, _airing: { lastAiredAt: ts(6, 20), nextAiringAt: ts(8, 20) } }; // último lunes, próximo miércoles
    const { days } = groupSeasonByDay([anime]);
    expect(days[2].map((a) => a.id)).toEqual([1]);
    expect(days[0]).toEqual([]);
  });
});

describe('looksSpanish', () => {
  it('detects Spanish text', () => {
    expect(looksSpanish('Una historia sobre un chico que quiere ser el héroe más grande de todos, pero no tiene poderes.')).toBe(true);
  });
  it('rejects English text', () => {
    expect(looksSpanish('A story about a boy who wants to become the greatest hero of them all, but he has no powers.')).toBe(false);
  });
  it('handles empty input', () => {
    expect(looksSpanish('')).toBe(false);
    expect(looksSpanish(null)).toBe(false);
  });
});

describe('filterByLocalSearch', () => {
  const list = [
    { id: 1, title: 'Naruto' },
    { id: 2, title: 'One Piece' },
    { id: 3, title: 'Attack on Titan', titleJp: '進撃の巨人' },
    { id: 4, title: 'Demon Slayer', titleEn: 'Kimetsu no Yaiba' },
  ];

  it('returns full list when search is empty', () => {
    expect(filterByLocalSearch(list, '')).toEqual(list);
    expect(filterByLocalSearch(list, '  ')).toEqual(list);
  });

  it('filters by title (case insensitive)', () => {
    const result = filterByLocalSearch(list, 'naruto');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('filters by partial match', () => {
    const result = filterByLocalSearch(list, 'piece');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('filters across titleJp', () => {
    const result = filterByLocalSearch(list, '巨人');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });

  it('handles accent-insensitive search', () => {
    const accentList = [{ id: 1, title: 'Película especial' }];
    const result = filterByLocalSearch(accentList, 'pelicula');
    expect(result).toHaveLength(1);
  });

  it('returns empty for no match', () => {
    expect(filterByLocalSearch(list, 'zzzzz')).toHaveLength(0);
  });
});

describe('getFilteredWatched', () => {
  const watchedList = [
    { id: 1, title: 'Anime A', finished: true, finishedDate: '2024-01-15', userRating: 8 },
    { id: 2, title: 'Anime B', finished: false, droppedDate: '2024-02-10', userRating: 5 },
    { id: 3, title: 'Anime C', finished: true, finishedDate: '2024-03-01', userRating: 9 },
  ];

  it('returns all when filter is "all"', () => {
    const result = getFilteredWatched(watchedList, 'all', 'date', '');
    expect(result).toHaveLength(3);
  });

  it('filters finished only', () => {
    const result = getFilteredWatched(watchedList, 'finished', 'date', '');
    expect(result).toHaveLength(2);
    expect(result.every(a => a.finished)).toBe(true);
  });

  it('filters dropped only', () => {
    const result = getFilteredWatched(watchedList, 'dropped', 'date', '');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('sorts by date (newest first)', () => {
    const result = getFilteredWatched(watchedList, 'all', 'date', '');
    expect(result[0].id).toBe(3);
    expect(result[2].id).toBe(1);
  });

  it('sorts by rating (highest first)', () => {
    const result = getFilteredWatched(watchedList, 'all', 'rating', '');
    expect(result[0].id).toBe(3);
    expect(result[1].id).toBe(1);
    expect(result[2].id).toBe(2);
  });

  it('sorts by title (alphabetical)', () => {
    const result = getFilteredWatched(watchedList, 'all', 'title', '');
    expect(result[0].title).toBe('Anime A');
    expect(result[1].title).toBe('Anime B');
    expect(result[2].title).toBe('Anime C');
  });

  it('applies local search filter', () => {
    const result = getFilteredWatched(watchedList, 'all', 'date', 'Anime B');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });
});

describe('getPlatformInfo', () => {
  it('returns null without a URL', () => {
    expect(getPlatformInfo('')).toBeNull();
    expect(getPlatformInfo(null)).toBeNull();
  });

  it('recognizes known platforms', () => {
    expect(getPlatformInfo('https://www.netflix.com/title/1').name).toBe('Netflix');
    expect(getPlatformInfo('https://www.crunchyroll.com/x').name).toBe('Crunchyroll');
    expect(getPlatformInfo('https://www.primevideo.com/x').name).toBe('Prime Video');
    expect(getPlatformInfo('https://play.max.com/x').name).toBe('Max');
  });

  it('falls back to a generic badge for unknown URLs', () => {
    expect(getPlatformInfo('https://example.com/x')).toMatchObject({ label: '▶', name: 'Ver' });
  });
});

describe('pickAutoWatchLink', () => {
  it('keeps an existing manual link', () => {
    expect(pickAutoWatchLink({ watchLink: 'https://manual.com', streamingLinks: [{ url: 'https://auto.com' }] })).toBe('https://manual.com');
  });

  it('prefers Spanish-language streaming links', () => {
    const anime = { streamingLinks: [
      { site: 'Crunchyroll', url: 'https://cr.com/en', language: 'English' },
      { site: 'Crunchyroll', url: 'https://cr.com/es', language: 'Spanish' },
    ] };
    expect(pickAutoWatchLink(anime)).toBe('https://cr.com/es');
  });

  it('falls back to the first link and to empty string', () => {
    expect(pickAutoWatchLink({ streamingLinks: [{ url: 'https://first.com' }, { url: 'https://second.com' }] })).toBe('https://first.com');
    expect(pickAutoWatchLink({ streamingLinks: [] })).toBe('');
    expect(pickAutoWatchLink({})).toBe('');
    expect(pickAutoWatchLink(null)).toBe('');
  });
});

describe('parseEpisodes', () => {
  it('returns null for null/undefined/empty', () => {
    expect(parseEpisodes(null)).toBeNull();
    expect(parseEpisodes(undefined)).toBeNull();
    expect(parseEpisodes('')).toBeNull();
    expect(parseEpisodes('?')).toBeNull();
  });

  it('parses valid numbers', () => {
    expect(parseEpisodes(12)).toBe(12);
    expect(parseEpisodes('24')).toBe(24);
    expect(parseEpisodes('1')).toBe(1);
  });

  it('returns null for invalid/zero/negative', () => {
    expect(parseEpisodes(0)).toBeNull();
    expect(parseEpisodes(-5)).toBeNull();
    expect(parseEpisodes('abc')).toBeNull();
  });
});

describe('hashString', () => {
  it('returns a number', () => {
    expect(typeof hashString('test')).toBe('number');
  });

  it('returns same hash for same input', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
  });

  it('returns different hashes for different inputs', () => {
    expect(hashString('abc')).not.toBe(hashString('xyz'));
  });

  it('returns value in range 0-99999', () => {
    const hash = hashString('some random string');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThan(100000);
  });
});

describe('buildBackup', () => {
  it('wraps data with metadata and a deterministic timestamp', () => {
    const data = { schedule: { Lunes: [{ id: 1 }] }, watchedList: [{ id: 2 }], watchLater: [], customLists: [] };
    const backup = buildBackup(data, '2026-01-01T00:00:00.000Z');
    expect(backup.app).toBe('anitracker');
    expect(backup.schemaVersion).toBe(2);
    expect(backup.exportedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(backup.data).toEqual(data);
  });

  it('fills missing slices with empty defaults', () => {
    const backup = buildBackup({}, '2026-01-01T00:00:00.000Z');
    expect(backup.data).toEqual({ schedule: {}, watchedList: [], watchLater: [], customLists: [] });
  });
});

describe('parseBackup', () => {
  it('round-trips a backup produced by buildBackup', () => {
    const data = { schedule: { Lunes: [{ id: 1 }] }, watchedList: [{ id: 2 }], watchLater: [{ id: 3 }], customLists: [{ id: 4, name: 'Fav', items: [] }] };
    const json = JSON.stringify(buildBackup(data, '2026-01-01T00:00:00.000Z'));
    expect(parseBackup(json)).toEqual(data);
  });

  it('accepts a raw data object (no wrapper)', () => {
    const json = JSON.stringify({ watchLater: [{ id: 9 }] });
    expect(parseBackup(json)).toEqual({ schedule: {}, watchedList: [], watchLater: [{ id: 9 }], customLists: [] });
  });

  it('coerces invalid slice types to safe defaults', () => {
    const json = JSON.stringify({ schedule: ['nope'], watchedList: 'nope', watchLater: null });
    expect(parseBackup(json)).toEqual({ schedule: {}, watchedList: [], watchLater: [], customLists: [] });
  });

  it('throws on malformed JSON', () => {
    expect(() => parseBackup('{not json')).toThrow(/JSON/);
  });

  it('throws when no AniTracker keys are present', () => {
    expect(() => parseBackup(JSON.stringify({ foo: 'bar' }))).toThrow(/AniTracker/);
  });

  it('throws on a non-object payload', () => {
    expect(() => parseBackup(JSON.stringify([1, 2, 3]))).toThrow();
  });
});

describe('formatAiringWhen', () => {
  const base = { episode: 9, airingAt: 1783771200, timeUntilAiring: 0, isToday: false, isTomorrow: false, hasAired: false };

  it('returns empty string without airing info', () => {
    expect(formatAiringWhen(null)).toBe('');
  });

  it('prioritizes "ya disponible" for aired episodes', () => {
    expect(formatAiringWhen({ ...base, hasAired: true, isToday: true })).toBe('¡Ya disponible!');
  });

  it('shows countdown for today', () => {
    expect(formatAiringWhen({ ...base, isToday: true, timeUntilAiring: 2 * 3600 + 15 * 60 })).toBe('En 2h 15m');
    expect(formatAiringWhen({ ...base, isToday: true, timeUntilAiring: 40 * 60 })).toBe('En 40m');
  });

  it('shows "Mañana" for tomorrow', () => {
    expect(formatAiringWhen({ ...base, isTomorrow: true })).toBe('Mañana');
  });

  it('shows the weekday name for later episodes', () => {
    // 1783771200 = sábado 11 de julio de 2026, 12:00 UTC
    expect(formatAiringWhen(base)).toBe('Sábado');
  });
});

describe('formatAiringDate', () => {
  it('formats the full air date in Spanish with capitalized weekday', () => {
    const text = formatAiringDate(1783771200);
    expect(text).toMatch(/^Sábado, 11 de julio/);
    expect(text).toMatch(/\d{1,2}:\d{2}$/);
  });
});
