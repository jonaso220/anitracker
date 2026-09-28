import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCallback, useRef, useState } from 'react';
import { useBulkActions } from '../hooks/useBulkActions';
import { daysOfWeek } from '../constants';

const a = (id, extra = {}) => ({ id, title: `Anime ${id}`, currentEp: 0, ...extra });
const week = (days) => Object.fromEntries(daysOfWeek.map((d) => [d, days[d] || []]));

// State + a ref that always holds the latest value, like usePersistedState.
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

// Mirrors App.jsx wiring.
function useHarness({ activeTab, initial, selected }) {
  const [schedule, setSchedule, scheduleRef] = useStateWithRef(initial.schedule || week({}));
  const [watchedList, setWatchedList, watchedListRef] = useStateWithRef(initial.watchedList || []);
  const [watchLater, setWatchLater, watchLaterRef] = useStateWithRef(initial.watchLater || []);
  const toast = useRef(null);
  const actions = useBulkActions({
    activeTab,
    setSchedule, scheduleRef,
    setWatchedList, watchedListRef,
    setWatchLater, watchLaterRef,
    bulkSelected: selected,
    exitBulkMode: vi.fn(),
    showToast: (msg, undo) => { toast.current = { msg, undo }; },
  });
  return { schedule, watchedList, watchLater, setSchedule, setWatchedList, toast, ...actions };
}

describe('useBulkActions: deshacer solo lo afectado', () => {
  it('borrar en la semana y deshacer respeta ediciones hechas mientras tanto', () => {
    const { result } = renderHook(() => useHarness({
      activeTab: 'schedule',
      initial: { schedule: week({ Lunes: [a(1), a(2), a(3)], Martes: [a(4)] }) },
      selected: new Set([2, 4]),
    }));
    act(() => result.current.bulkDelete());
    expect(result.current.schedule.Lunes.map((x) => x.id)).toEqual([1, 3]);
    expect(result.current.toast.current.msg).toBe('2 animes eliminados');

    // Mientras el toast está visible se marca un episodio de otro anime.
    act(() => result.current.setSchedule((prev) => ({ ...prev, Lunes: prev.Lunes.map((x) => (x.id === 3 ? { ...x, currentEp: 9 } : x)) })));
    act(() => result.current.toast.current.undo());

    expect(result.current.schedule.Lunes.map((x) => [x.id, x.currentEp])).toEqual([[1, 0], [2, 0], [3, 9]]);
    expect(result.current.schedule.Martes.map((x) => x.id)).toEqual([4]);
  });

  it('marcar como vistos y deshacer no toca otros vistos', () => {
    const { result } = renderHook(() => useHarness({
      activeTab: 'watchLater',
      initial: { watchLater: [a(1), a(2)], watchedList: [a(10)] },
      selected: new Set([1]),
    }));
    act(() => result.current.bulkMarkWatched());
    expect(result.current.watchedList.map((x) => x.id)).toEqual([10, 1]);

    act(() => result.current.setWatchedList((prev) => prev.map((x) => (x.id === 10 ? { ...x, userRating: 8 } : x))));
    act(() => result.current.toast.current.undo());

    expect(result.current.watchLater.map((x) => x.id)).toEqual([1, 2]);
    expect(result.current.watchedList).toEqual([{ ...a(10), userRating: 8 }]);
  });

  it('mover a un día y deshacer devuelve el anime que había sido reemplazado', () => {
    const { result } = renderHook(() => useHarness({
      activeTab: 'watchLater',
      initial: { watchLater: [a(1)], schedule: week({ Viernes: [a(1, { currentEp: 4 }), a(5)] }) },
      selected: new Set([1]),
    }));
    act(() => result.current.bulkMoveToSchedule('Viernes'));
    expect(result.current.schedule.Viernes.map((x) => [x.id, x.currentEp])).toEqual([[5, 0], [1, 0]]);

    act(() => result.current.toast.current.undo());
    expect(result.current.schedule.Viernes.map((x) => [x.id, x.currentEp])).toEqual([[1, 4], [5, 0]]);
    expect(result.current.watchLater.map((x) => x.id)).toEqual([1]);
  });
});
