import { describe, it, expect } from 'vitest';
import { normalizeAnime, isValidAnime } from '../schemas/anime';

describe('normalizeAnime', () => {
  it('returns null for invalid input', () => {
    expect(normalizeAnime(null)).toBeNull();
    expect(normalizeAnime(undefined)).toBeNull();
    expect(normalizeAnime({})).toBeNull();
    expect(normalizeAnime({ id: 0, title: 'x' })).toBeNull();
    expect(normalizeAnime({ id: 'not-a-number', title: 'x' })).toBeNull();
  });

  it('fills defaults for missing fields', () => {
    const a = normalizeAnime({ id: 1, title: 'Test' });
    expect(a.id).toBe(1);
    expect(a.title).toBe('Test');
    expect(a.synopsis).toBe('Sin sinopsis disponible.');
    expect(a.genres).toEqual([]);
    expect(a.altTitles).toEqual([]);
    expect(a.rating).toBe(0);
    expect(a.episodes).toBeNull();
    expect(a.currentEp).toBe(0);
    expect(a.userRating).toBe(0);
    expect(a.notes).toBe('');
    expect(a.watchLink).toBe('');
    expect(a.sourceId).toBe('1');
    expect(a.sourceKey).toBe('');
    expect(a.malId).toBeNull();
  });

  it('preserves stable source metadata', () => {
    const a = normalizeAnime({ id: 300005, source: 'AniList', sourceId: 5, sourceKey: 'anilist:5', malId: 200, title: 'Test' });
    expect(a.sourceId).toBe('5');
    expect(a.sourceKey).toBe('anilist:5');
    expect(a.malId).toBe(200);
  });

  it('coerces episode count', () => {
    expect(normalizeAnime({ id: 1, title: 'x', episodes: '12' }).episodes).toBe(12);
    expect(normalizeAnime({ id: 1, title: 'x', episodes: '?' }).episodes).toBeNull();
    expect(normalizeAnime({ id: 1, title: 'x', episodes: 0 }).episodes).toBeNull();
  });

  it('filters non-string entries from altTitles and genres', () => {
    const a = normalizeAnime({ id: 1, title: 'x', altTitles: ['a', null, 3, 'b', ''], genres: ['Action', null] });
    expect(a.altTitles).toEqual(['a', 'b']);
    expect(a.genres).toEqual(['Action']);
  });

  it('preserves finished/finishedDate when provided', () => {
    const a = normalizeAnime({ id: 1, title: 'x', finished: true, finishedDate: '2024-01-01' });
    expect(a.finished).toBe(true);
    expect(a.finishedDate).toBe('2024-01-01');
  });
});

describe('isValidAnime', () => {
  it('requires id and title', () => {
    expect(isValidAnime({ id: 1, title: 'ok' })).toBe(true);
    expect(isValidAnime({ id: 0, title: 'no' })).toBe(false);
    expect(isValidAnime({ id: 1, title: '' })).toBe(false);
    expect(isValidAnime(null)).toBe(false);
    expect(isValidAnime(undefined)).toBe(false);
  });
});
