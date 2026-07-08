import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBulkMode } from '../hooks/useBulkMode';
import { useToast } from '../hooks/useToast';
import { usePersistedState } from '../hooks/usePersistedState';
import { useDirectory } from '../hooks/useDirectory';

describe('useBulkMode', () => {
  it('toggles selection on an id', () => {
    const { result } = renderHook(() => useBulkMode());
    expect(result.current.bulkSelected.size).toBe(0);
    act(() => { result.current.toggleBulkSelect(1); });
    expect(result.current.bulkSelected.has(1)).toBe(true);
    act(() => { result.current.toggleBulkSelect(1); });
    expect(result.current.bulkSelected.has(1)).toBe(false);
  });

  it('selects all / deselects all', () => {
    const { result } = renderHook(() => useBulkMode());
    act(() => { result.current.bulkSelectAll([{ id: 1 }, { id: 2 }]); });
    expect(result.current.bulkSelected.size).toBe(2);
    act(() => { result.current.bulkDeselectAll(); });
    expect(result.current.bulkSelected.size).toBe(0);
  });

  it('exitBulkMode resets state', () => {
    const { result } = renderHook(() => useBulkMode());
    act(() => { result.current.enterBulkMode(); result.current.toggleBulkSelect(1); });
    expect(result.current.bulkMode).toBe(true);
    act(() => { result.current.exitBulkMode(); });
    expect(result.current.bulkMode).toBe(false);
    expect(result.current.bulkSelected.size).toBe(0);
  });
});

describe('useToast', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows and auto-dismisses a toast', () => {
    const { result } = renderHook(() => useToast({ ttl: 1000 }));
    act(() => { result.current.showToast('Hi'); });
    expect(result.current.toast.message).toBe('Hi');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.toast).toBeNull();
  });

  it('invokes undoFn when undoToast is called', () => {
    const undoFn = vi.fn();
    const { result } = renderHook(() => useToast({ ttl: 10000 }));
    act(() => { result.current.showToast('done', undoFn); });
    act(() => { result.current.undoToast(); });
    expect(undoFn).toHaveBeenCalledTimes(1);
    expect(result.current.toast).toBeNull();
  });

  it('dismissToast clears the toast without invoking undo', () => {
    const undoFn = vi.fn();
    const { result } = renderHook(() => useToast({ ttl: 10000 }));
    act(() => { result.current.showToast('x', undoFn); });
    act(() => { result.current.dismissToast(); });
    expect(undoFn).not.toHaveBeenCalled();
    expect(result.current.toast).toBeNull();
  });
});

describe('useDirectory', () => {
  const okPage = (media, hasNextPage = false) => ({
    ok: true,
    json: () => Promise.resolve({ data: { Page: { pageInfo: { hasNextPage }, media } } }),
  });
  const media = (id, title) => ({ id, idMal: id, title: { romaji: title }, coverImage: {} });

  beforeEach(() => { localStorage.clear(); vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('loadInitial fetches page 1 once and keeps results on re-entry', async () => {
    globalThis.fetch.mockResolvedValue(okPage([media(1, 'A')], true));
    const { result } = renderHook(() => useDirectory());
    act(() => { result.current.loadInitial(); });
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.hasNextPage).toBe(true);
    act(() => { result.current.loadInitial(); });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('loadMore appends the next page deduplicating by id', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(okPage([media(1, 'A'), media(2, 'B')], true))
      .mockResolvedValueOnce(okPage([media(2, 'B dup'), media(3, 'C')], false));
    const { result } = renderHook(() => useDirectory());
    act(() => { result.current.loadInitial(); });
    await waitFor(() => expect(result.current.results).toHaveLength(2));
    act(() => { result.current.loadMore(); });
    await waitFor(() => expect(result.current.results).toHaveLength(3));
    expect(result.current.results.map((a) => a.id)).toEqual([1, 2, 3]);
    expect(result.current.hasNextPage).toBe(false);
    const page2Vars = JSON.parse(globalThis.fetch.mock.calls[1][1].body).variables;
    expect(page2Vars.page).toBe(2);
  });

  it('updateFilter resets results and refetches with the new filter', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(okPage([media(1, 'A')]))
      .mockResolvedValueOnce(okPage([media(9, 'Filtered')]));
    const { result } = renderHook(() => useDirectory());
    act(() => { result.current.loadInitial(); });
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    act(() => { result.current.updateFilter('genre', 'Action'); });
    await waitFor(() => expect(result.current.results[0]?.id).toBe(9));
    expect(result.current.filters.genre).toBe('Action');
    const vars = JSON.parse(globalThis.fetch.mock.calls[1][1].body).variables;
    expect(vars.genre).toBe('Action');
    expect(vars.page).toBe(1);
  });

  it('persists filter changes (except the search text) and restores them', async () => {
    globalThis.fetch.mockResolvedValue(okPage([media(1, 'A')]));
    const { result, unmount } = renderHook(() => useDirectory());
    act(() => { result.current.updateFilter('genre', 'Action'); });
    await waitFor(() => expect(result.current.filters.genre).toBe('Action'));
    act(() => { result.current.updateFilter('search', 'naruto'); });

    const stored = JSON.parse(localStorage.getItem('anitracker-directory-filters'));
    expect(stored.genre).toBe('Action');
    expect(stored.search).toBeUndefined();
    unmount();

    // Una sesión nueva arranca con los filtros guardados y el buscador vacío.
    const { result: fresh } = renderHook(() => useDirectory());
    expect(fresh.current.filters.genre).toBe('Action');
    expect(fresh.current.filters.search).toBe('');
  });

  it('ignores malformed stored filters', () => {
    localStorage.setItem('anitracker-directory-filters', 'not json');
    const { result } = renderHook(() => useDirectory());
    expect(result.current.filters.sort).toBe('POPULARITY_DESC');
    expect(result.current.filters.genre).toBe('');
  });

  it('debounces text search', async () => {
    vi.useFakeTimers();
    globalThis.fetch.mockResolvedValue(okPage([media(1, 'A')]));
    const { result } = renderHook(() => useDirectory());
    act(() => { result.current.updateFilter('search', 'na'); });
    act(() => { result.current.updateFilter('search', 'naru'); });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(500); });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const vars = JSON.parse(globalThis.fetch.mock.calls[0][1].body).variables;
    expect(vars.search).toBe('naru');
    vi.useRealTimers();
  });
});

describe('usePersistedState', () => {
  beforeEach(() => { localStorage.clear(); });

  it('persists value changes to localStorage', () => {
    const { result } = renderHook(() => usePersistedState('test-key', 'initial'));
    expect(result.current[0]).toBe('initial');
    act(() => { result.current[1]('updated'); });
    expect(localStorage.getItem('test-key')).toBe('"updated"');
  });

  it('reads existing value from localStorage', () => {
    localStorage.setItem('test-key-2', JSON.stringify({ a: 1 }));
    const { result } = renderHook(() => usePersistedState('test-key-2', { a: 0 }));
    expect(result.current[0]).toEqual({ a: 1 });
  });

  it('falls back to initial when JSON parse fails', () => {
    localStorage.setItem('test-key-3', 'not json');
    const { result } = renderHook(() => usePersistedState('test-key-3', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });
});
