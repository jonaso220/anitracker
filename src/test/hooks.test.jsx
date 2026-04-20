import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBulkMode } from '../hooks/useBulkMode';
import { useToast } from '../hooks/useToast';
import { usePersistedState } from '../hooks/usePersistedState';

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
