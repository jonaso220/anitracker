import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState, useRef, useEffect } from 'react';
import { useAnimeActions } from '../hooks/useAnimeActions';
import { daysOfWeek } from '../constants';

// Una obra vive en un solo lugar (un día, Después o Vistas). Agregarla otra vez
// desde la búsqueda, Temporada o Directorio la mueve con su progreso.

const saved = { id: 1, title: 'Frieren', currentEp: 7, userRating: 9, currentSeason: 1, watchLink: 'https://example.com/mine' };
// Un resultado de búsqueda trae solo datos de la API.
const fromSearch = { id: 1, title: 'Frieren', episodes: 28, genres: ['Aventura'] };

const emptySchedule = () => Object.fromEntries(daysOfWeek.map((d) => [d, []]));

function useHarness({ schedule: initialSchedule = emptySchedule(), watchLater: initialLater = [], watched: initialWatched = [] } = {}) {
  const [schedule, setScheduleState] = useState(initialSchedule);
  const [watchedList, setWatchedState] = useState(initialWatched);
  const [watchLater, setWatchLaterState] = useState(initialLater);
  const [customLists, setCustomListsState] = useState([]);
  const [toast, setToast] = useState(null);
  const scheduleRef = useRef(schedule);
  const watchedListRef = useRef(watchedList);
  const watchLaterRef = useRef(watchLater);
  const customListsRef = useRef(customLists);
  useEffect(() => { scheduleRef.current = schedule; }, [schedule]);
  useEffect(() => { watchedListRef.current = watchedList; }, [watchedList]);
  useEffect(() => { watchLaterRef.current = watchLater; }, [watchLater]);
  useEffect(() => { customListsRef.current = customLists; }, [customLists]);
  const actions = useAnimeActions({
    setSchedule: setScheduleState, scheduleRef,
    setWatchedList: setWatchedState, watchedListRef,
    setWatchLater: setWatchLaterState, watchLaterRef,
    setCustomLists: setCustomListsState, customListsRef,
    setShowDayPicker: () => {},
    showToast: (message, undo) => setToast({ message, undo }),
    setShowSearch: () => {}, setSearchQuery: () => {}, setSearchResults: () => {},
  });
  return { schedule, watchedList, watchLater, toast, ...actions };
}

const countEverywhere = (r, id) => daysOfWeek.reduce((n, d) => n + r.schedule[d].filter((a) => a.id === id).length, 0)
  + r.watchLater.filter((a) => a.id === id).length
  + r.watchedList.filter((a) => a.id === id).length;

describe('adding something already in the library', () => {
  it('re-adding to the same day from search keeps progress, rating and link', () => {
    const schedule = { ...emptySchedule(), Lunes: [saved] };
    const { result } = renderHook(() => useHarness({ schedule }));
    act(() => result.current.addToSchedule(fromSearch, 'Lunes'));
    expect(result.current.schedule.Lunes).toHaveLength(1);
    expect(result.current.schedule.Lunes[0]).toMatchObject({ currentEp: 7, userRating: 9, currentSeason: 1, watchLink: 'https://example.com/mine', episodes: 28 });
    expect(result.current.toast).toBeNull();
  });

  it('adding to another day moves it instead of duplicating, and undo puts it back', () => {
    const schedule = { ...emptySchedule(), Lunes: [saved] };
    const { result } = renderHook(() => useHarness({ schedule }));
    act(() => result.current.addToSchedule(fromSearch, 'Jueves'));
    expect(countEverywhere(result.current, 1)).toBe(1);
    expect(result.current.schedule.Jueves[0].currentEp).toBe(7);
    act(() => result.current.toast.undo());
    expect(result.current.schedule.Lunes.map((a) => a.id)).toEqual([1]);
    expect(result.current.schedule.Jueves).toHaveLength(0);
  });

  it('"Ya la vi" moves a scheduled anime to Vistas with its progress', () => {
    const schedule = { ...emptySchedule(), Lunes: [saved] };
    const { result } = renderHook(() => useHarness({ schedule }));
    act(() => result.current.markAsWatched(fromSearch));
    expect(result.current.schedule.Lunes).toHaveLength(0);
    expect(result.current.watchedList[0]).toMatchObject({ id: 1, finished: true, currentEp: 7, userRating: 9 });
    expect(result.current.toast.message).toMatch(/visto/i);
    act(() => result.current.toast.undo());
    expect(result.current.schedule.Lunes[0]).toMatchObject({ id: 1, currentEp: 7 });
    expect(result.current.watchedList).toHaveLength(0);
  });

  it('marking as watched again keeps the original finish date and rating', () => {
    const watched = [{ ...saved, finished: true, finishedDate: '2026-01-01T00:00:00.000Z' }];
    const { result } = renderHook(() => useHarness({ watched }));
    act(() => result.current.markAsWatched(fromSearch));
    expect(result.current.watchedList).toEqual(watched);
  });

  it('adding to Después from search moves it out of the week', () => {
    const schedule = { ...emptySchedule(), Martes: [saved] };
    const { result } = renderHook(() => useHarness({ schedule }));
    act(() => result.current.addToWatchLater(fromSearch));
    expect(countEverywhere(result.current, 1)).toBe(1);
    expect(result.current.watchLater[0]).toMatchObject({ currentEp: 7, userRating: 9 });
  });

  it('scheduling a dropped anime from search clears the dropped state', () => {
    const watched = [{ ...saved, finished: false, droppedDate: '2026-01-01T00:00:00.000Z', paused: true }];
    const { result } = renderHook(() => useHarness({ watched }));
    act(() => result.current.addToSchedule(fromSearch, 'Viernes'));
    expect(result.current.watchedList).toHaveLength(0);
    const entry = result.current.schedule.Viernes[0];
    expect(entry).toMatchObject({ currentEp: 7, paused: false });
    expect(entry).not.toHaveProperty('droppedDate');
    expect(entry).not.toHaveProperty('finished');
  });

  it('new anime are added with a toast that can be undone', () => {
    const { result } = renderHook(() => useHarness());
    act(() => result.current.addToWatchLater({ id: 2, title: 'Dandadan' }));
    expect(result.current.watchLater).toHaveLength(1);
    act(() => result.current.toast.undo());
    expect(result.current.watchLater).toHaveLength(0);
  });
});

describe('finishing with a stale day', () => {
  it('"Pasar a Vistas" after moving the card finishes it from its current day', () => {
    const schedule = { ...emptySchedule(), Lunes: [saved] };
    const { result } = renderHook(() => useHarness({ schedule }));
    act(() => result.current.moveAnimeToDay({ ...saved, _day: 'Lunes' }, 'Lunes', 'Martes'));
    act(() => result.current.markAsFinished({ ...saved, _day: 'Lunes' }, 'Lunes'));
    expect(countEverywhere(result.current, 1)).toBe(1);
    expect(result.current.watchedList[0]).toMatchObject({ id: 1, finished: true });
  });

  it('does nothing if the anime is no longer in the week', () => {
    const { result } = renderHook(() => useHarness());
    act(() => result.current.dropAnime(saved, 'Lunes'));
    expect(result.current.watchedList).toHaveLength(0);
  });
});
