import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCallback, useRef, useState } from 'react';
import { useAnimeActions } from '../hooks/useAnimeActions';
import { daysOfWeek } from '../constants';

function useStateWithRef(initial) {
  const [state, setState] = useState(initial);
  const ref = useRef(initial);
  const set = useCallback((update) => setState((prev) => {
    const next = typeof update === 'function' ? update(prev) : update;
    ref.current = next;
    return next;
  }), []);
  return [state, set, ref];
}

const week = (days = {}) => Object.fromEntries(daysOfWeek.map((d) => [d, days[d] || []]));

function useHarness({ schedule = week(), watchLater = [], watched = [] } = {}) {
  const [scheduleState, setSchedule, scheduleRef] = useStateWithRef(schedule);
  const [watchedList, setWatchedList, watchedListRef] = useStateWithRef(watched);
  const [watchLaterState, setWatchLater, watchLaterRef] = useStateWithRef(watchLater);
  const [, setCustomLists, customListsRef] = useStateWithRef([]);
  const toast = useRef(null);
  const actions = useAnimeActions({
    setSchedule, scheduleRef, setWatchedList, watchedListRef, setWatchLater, watchLaterRef,
    setCustomLists, customListsRef,
    showToast: (message, undoFn) => { toast.current = { message, undoFn }; },
    setShowDayPicker: () => {}, setShowSearch: () => {}, setSearchQuery: () => {}, setSearchResults: () => {},
  });
  return { schedule: scheduleState, watchedList, watchLater: watchLaterState, setWatchLater, toast, ...actions };
}

const imported = (anilistId, malId, title, extra = {}) => ({
  id: malId, source: 'AniList', sourceKey: `anilist:${anilistId}`, malId, title, year: 2024,
  currentEp: 0, _importStatus: 'CURRENT', _finished: false, _dropped: false, _doneAt: '', ...extra,
});

describe('handleImport', () => {
  it('agrega solo lo nuevo, sin campos temporales, y avisa cuántos ya estaban', () => {
    const { result } = renderHook(() => useHarness({ watchLater: [{ id: 10, title: 'Ya guardado', sourceKey: 'mal:10' }] }));
    act(() => {
      result.current.handleImport({
        schedule: [imported(1, 10, 'Ya guardado'), imported(2, 20, 'Nuevo', { airDay: 'Sábado', currentEp: 4 })],
      });
    });
    expect(result.current.schedule.Sábado).toHaveLength(1);
    const added = result.current.schedule.Sábado[0];
    expect(added).toMatchObject({ id: 20, currentEp: 4 });
    expect(Object.keys(added).filter((k) => k.startsWith('_'))).toEqual([]);
    expect(daysOfWeek.flatMap((d) => result.current.schedule[d]).map((a) => a.id)).toEqual([20]);
    expect(result.current.toast.current.message).toBe('Importado 1 anime desde AniList · 1 ya estaba en tu biblioteca');
  });

  it('completados y dropeados conservan la fecha de AniList', () => {
    const { result } = renderHook(() => useHarness());
    act(() => {
      result.current.handleImport({
        watched: [
          imported(3, 30, 'Terminado', { _finished: true, _doneAt: '2023-05-02T12:00:00.000Z' }),
          imported(4, 40, 'Abandonado', { _dropped: true, _doneAt: '2022-01-10T12:00:00.000Z' }),
        ],
      });
    });
    const [done, dropped] = result.current.watchedList;
    expect(done).toMatchObject({ finished: true, finishedDate: '2023-05-02T12:00:00.000Z' });
    expect(dropped).toMatchObject({ finished: false, droppedDate: '2022-01-10T12:00:00.000Z' });
    expect(dropped.finishedDate).toBeUndefined();
  });

  it('deshacer saca solo lo importado, sin tocar lo agregado después', () => {
    const { result } = renderHook(() => useHarness({ watchLater: [{ id: 1, title: 'Viejo' }] }));
    act(() => { result.current.handleImport({ watchLater: [imported(5, 50, 'Importado')] }); });
    act(() => { result.current.setWatchLater((prev) => [...prev, { id: 99, title: 'Agregado a mano' }]); });
    act(() => { result.current.toast.current.undoFn(); });
    expect(result.current.watchLater.map((a) => a.id)).toEqual([1, 99]);
  });

  it('si no hay nada nuevo lo dice y no ofrece deshacer', () => {
    const { result } = renderHook(() => useHarness({ watched: [{ id: 60, title: 'Visto', sourceKey: 'mal:60' }] }));
    act(() => { result.current.handleImport({ schedule: [imported(6, 60, 'Visto')] }); });
    expect(result.current.toast.current).toEqual({ message: 'No había nada nuevo para importar · 1 ya estaba en tu biblioteca', undoFn: undefined });
  });
});
