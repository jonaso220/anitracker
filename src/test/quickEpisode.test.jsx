import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCallback, useRef, useState } from 'react';
import { useAnimeActions } from '../hooks/useAnimeActions';
import { useDragDrop } from '../hooks/useDragDrop';
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

const week = (days) => Object.fromEntries(daysOfWeek.map((d) => [d, days[d] || []]));

function useHarness(initialSchedule) {
  const [schedule, setSchedule, scheduleRef] = useStateWithRef(initialSchedule);
  const [watchedList, setWatchedList, watchedListRef] = useStateWithRef([]);
  const [, setWatchLater, watchLaterRef] = useStateWithRef([]);
  const [, setCustomLists, customListsRef] = useStateWithRef([]);
  const toast = useRef(null);
  const actions = useAnimeActions({
    setSchedule, scheduleRef, setWatchedList, watchedListRef, setWatchLater, watchLaterRef,
    setCustomLists, customListsRef,
    showToast: (message, undoFn, action) => { toast.current = { message, undoFn, action }; },
    setShowDayPicker: () => {}, setShowSearch: () => {}, setSearchQuery: () => {}, setSearchResults: () => {},
  });
  return { schedule, watchedList, setSchedule, toast, ...actions };
}

describe('quickEpisode (+1 de la tarjeta)', () => {
  it('suma un episodio y se puede deshacer', () => {
    const { result } = renderHook(() => useHarness(week({ Lunes: [{ id: 1, title: 'Frieren', currentEp: 3, episodes: 28 }] })));
    act(() => result.current.quickEpisode(1));
    expect(result.current.schedule.Lunes[0].currentEp).toBe(4);
    expect(result.current.toast.current.message).toBe('Ep. 4 de "Frieren" visto');
    act(() => result.current.toast.current.undoFn());
    expect(result.current.schedule.Lunes[0].currentEp).toBe(3);
  });

  it('deshacer no pisa un cambio posterior (otro toque o sync)', () => {
    const { result } = renderHook(() => useHarness(week({ Lunes: [{ id: 1, title: 'Frieren', currentEp: 3, episodes: 28 }] })));
    act(() => result.current.quickEpisode(1));
    const undo = result.current.toast.current.undoFn;
    act(() => result.current.quickEpisode(1));
    act(() => undo());
    expect(result.current.schedule.Lunes[0].currentEp).toBe(5);
  });

  it('en el último episodio ofrece pasar a Vistas', () => {
    const { result } = renderHook(() => useHarness(week({ Jueves: [{ id: 2, title: 'Dandadan', currentEp: 11, episodes: 12 }] })));
    act(() => result.current.quickEpisode(2));
    const { message, action } = result.current.toast.current;
    expect(message).toBe('¡Terminaste "Dandadan"!');
    expect(action.label).toBe('Pasar a Vistas');
    act(() => action.fn());
    expect(result.current.schedule.Jueves).toEqual([]);
    expect(result.current.watchedList[0]).toMatchObject({ id: 2, currentEp: 12, finished: true });
  });

  it('no hace nada si ya está completo', () => {
    const { result } = renderHook(() => useHarness(week({ Lunes: [{ id: 3, title: 'X', currentEp: 12, episodes: 12 }] })));
    act(() => result.current.quickEpisode(3));
    expect(result.current.toast.current).toBeNull();
  });
});

describe('useDragDrop en táctil', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); delete document.elementFromPoint; });

  const touchEvent = (x, y) => ({ touches: [{ clientX: x, clientY: y }], target: document.body });

  it('mientras se arrastra, la página no se desplaza con el dedo; al soltar vuelve a hacerlo', () => {
    vi.useFakeTimers();
    document.elementFromPoint = () => null;
    const { result } = renderHook(() => useDragDrop(week({}), vi.fn(), daysOfWeek));
    const move = () => {
      const event = new Event('touchmove', { cancelable: true });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    };

    act(() => result.current.handleTouchStart(touchEvent(100, 300), { id: 1, title: 'A' }, 'Lunes'));
    expect(move()).toBe(false); // antes de la pulsación larga, scroll normal
    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current.isDragging).toBe(true);
    expect(move()).toBe(true);

    act(() => result.current.handleTouchEnd());
    expect(move()).toBe(false);
  });

  it('cerca del borde inferior la página se desplaza sola', () => {
    vi.useFakeTimers();
    document.elementFromPoint = () => null;
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    const { result } = renderHook(() => useDragDrop(week({}), vi.fn(), daysOfWeek));
    act(() => result.current.handleTouchStart(touchEvent(100, 300), { id: 1, title: 'A' }, 'Lunes'));
    act(() => { vi.advanceTimersByTime(400); });
    act(() => result.current.handleTouchMove(touchEvent(100, window.innerHeight - 10)));
    act(() => { vi.advanceTimersByTime(100); });
    expect(scrollBy).toHaveBeenCalled();
    expect(scrollBy.mock.calls.at(-1)[1]).toBeGreaterThan(0);

    act(() => result.current.handleTouchEnd());
    scrollBy.mockClear();
    act(() => { vi.advanceTimersByTime(100); });
    expect(scrollBy).not.toHaveBeenCalled();
  });
});
