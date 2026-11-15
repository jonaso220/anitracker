import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePersistedState } from '../hooks/usePersistedState';

// Simula lo que hace el navegador cuando OTRA pestaña escribe la clave: el
// valor ya está en localStorage y a esta pestaña le llega un `storage`.
function writeFromAnotherTab(key, value) {
  const newValue = JSON.stringify(value);
  const oldValue = localStorage.getItem(key);
  localStorage.setItem(key, newValue);
  window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue, storageArea: localStorage }));
}

describe('usePersistedState across tabs', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('takes the value another tab wrote, keeps the ref in sync and does not write it back', async () => {
    const { result } = renderHook(() => usePersistedState('watchedAnimes', []));
    await act(async () => result.current[1]([{ id: 1 }]));
    expect(JSON.parse(localStorage.getItem('watchedAnimes'))).toEqual([{ id: 1 }]);

    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await act(async () => writeFromAnotherTab('watchedAnimes', [{ id: 1 }, { id: 2 }]));
    setItem.mockClear();
    await act(async () => {});

    expect(result.current[0]).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.current[2].current).toEqual([{ id: 1 }, { id: 2 }]);
    // No ping-pong: the received value is already stored.
    expect(setItem).not.toHaveBeenCalled();

    // The next local edit builds on the other tab's data instead of erasing it.
    await act(async () => result.current[1]((list) => [...list, { id: 3 }]));
    expect(JSON.parse(localStorage.getItem('watchedAnimes')).map((a) => a.id)).toEqual([1, 2, 3]);
  });

  it('runs the same migration as the initial read', async () => {
    const migrate = vi.fn((list) => list.filter((a) => a && a.id != null));
    const { result } = renderHook(() => usePersistedState('watchLater', [], undefined, migrate));
    await act(async () => writeFromAnotherTab('watchLater', [{ id: 4 }, null]));
    expect(result.current[0]).toEqual([{ id: 4 }]);
    expect(migrate).toHaveBeenLastCalledWith([{ id: 4 }, null]);
  });

  it('ignores other keys, removals, clears and unreadable values', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => usePersistedState('k', [1]));
    await act(async () => writeFromAnotherTab('other', [9]));
    await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: 'k', newValue: null, storageArea: localStorage })));
    await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null, storageArea: localStorage })));
    await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: 'k', newValue: '{broken', storageArea: localStorage })));
    expect(result.current[0]).toEqual([1]);
    expect(result.current[2].current).toEqual([1]);
  });

  it('does not rewrite localStorage when the value is unchanged', async () => {
    localStorage.setItem('k', JSON.stringify({ a: 1 }));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    renderHook(() => usePersistedState('k', {}));
    await act(async () => {});
    expect(setItem).not.toHaveBeenCalled();
  });
});
