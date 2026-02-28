import { describe, it, expect } from 'vitest';
import { sanitizeUrl, daysOfWeek, dayEmojis } from '../constants';

describe('sanitizeUrl', () => {
  it('returns empty string for falsy input', () => {
    expect(sanitizeUrl('')).toBe('');
    expect(sanitizeUrl(null)).toBe('');
    expect(sanitizeUrl(undefined)).toBe('');
  });

  it('allows http URLs', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('allows https URLs', () => {
    expect(sanitizeUrl('https://crunchyroll.com/watch')).toBe('https://crunchyroll.com/watch');
  });

  it('blocks javascript: protocol', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
  });

  it('blocks data: protocol', () => {
    expect(sanitizeUrl('data:text/html,<h1>hi</h1>')).toBe('');
  });

  it('returns empty for invalid URLs', () => {
    expect(sanitizeUrl('not a url')).toBe('');
  });
});

describe('constants', () => {
  it('has 7 days of week', () => {
    expect(daysOfWeek).toHaveLength(7);
    expect(daysOfWeek[0]).toBe('Lunes');
    expect(daysOfWeek[6]).toBe('Domingo');
  });

  it('has 7 day emojis', () => {
    expect(dayEmojis).toHaveLength(7);
  });
});
