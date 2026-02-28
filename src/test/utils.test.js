import { describe, it, expect } from 'vitest';
import { clean, filterByLocalSearch, getFilteredWatched, parseEpisodes, hashString } from '../utils';

describe('clean', () => {
  it('removes internal flags from anime object', () => {
    const anime = { id: 1, title: 'Test', _day: 'Lunes', _isWatchLater: true, _isWatched: false, _isSeason: true, _isCustomList: true, _customListId: 'abc' };
    const result = clean(anime);
    expect(result).toEqual({ id: 1, title: 'Test' });
    expect(result._day).toBeUndefined();
    expect(result._isWatchLater).toBeUndefined();
    expect(result._isWatched).toBeUndefined();
    expect(result._isSeason).toBeUndefined();
    expect(result._isCustomList).toBeUndefined();
    expect(result._customListId).toBeUndefined();
  });

  it('preserves all non-flag properties', () => {
    const anime = { id: 1, title: 'Naruto', genres: ['Action'], rating: 8.5, currentEp: 5 };
    expect(clean(anime)).toEqual(anime);
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
