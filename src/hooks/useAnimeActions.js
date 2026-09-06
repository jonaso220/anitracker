import { useCallback } from 'react';
import { captureEntry, restoreEntry, changeEpisode } from '../libraryEdits';
import { daysOfWeek, sanitizeUrl } from '../constants';
import { clean, pickAutoWatchLink } from '../utils';

const clone = (v) => JSON.parse(JSON.stringify(v));

const updateInList = (list, animeId, updater) =>
  list.map((a) => (a.id === animeId ? { ...a, ...updater(a) } : a));

// Normalize an anime for persistence: strip view flags, default the user
// fields, and auto-fill the watch link from known streaming links.
const prepare = (anime) => ({
  ...clean(anime),
  currentEp: anime.currentEp || 0,
  userRating: anime.userRating || 0,
  watchLink: pickAutoWatchLink(anime),
});

/**
 * All mutation handlers for schedule / watched / watchLater / customLists.
 * Extracted from App.jsx to keep the root component focused on composition.
 *
 * Refs are passed in so that undo snapshots always capture the latest state.
 */
export function useAnimeActions({
  setSchedule, scheduleRef,
  setWatchedList, watchedListRef,
  setWatchLater, watchLaterRef,
  setCustomLists, customListsRef,
  showToast,
  setShowDayPicker, setShowSearch, setSearchQuery, setSearchResults,
}) {
  // --- Schedule / watched / watchLater ---

  const latestAnime = useCallback((anime) => {
    const inDay = scheduleRef.current[anime._day]?.find((a) => a.id === anime.id);
    if (inDay) return inDay;
    const scheduled = daysOfWeek.flatMap((day) => scheduleRef.current[day] || []);
    return scheduled.find((a) => a.id === anime.id)
      || watchLaterRef.current.find((a) => a.id === anime.id)
      || watchedListRef.current.find((a) => a.id === anime.id)
      || customListsRef.current.flatMap((list) => list.items).find((a) => a.id === anime.id)
      || anime;
  }, [scheduleRef, watchLaterRef, watchedListRef, customListsRef]);

  const addToSchedule = useCallback((anime, day) => {
    if (!daysOfWeek.includes(day)) return;
    const fromLibrary = anime._day || anime._isCustomList || anime._isWatched || anime._isWatchLater;
    const a = prepare(fromLibrary ? latestAnime(anime) : anime);
    if (anime._isWatched) {
      delete a.finished;
      delete a.finishedDate;
      delete a.droppedDate;
      setWatchedList((prev) => prev.filter((x) => x.id !== a.id));
    }
    setSchedule((prev) => ({ ...prev, [day]: [...(prev[day] || []).filter((x) => x.id !== a.id), a] }));
    setShowDayPicker(null);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }, [setSchedule, setWatchedList, latestAnime, setShowDayPicker, setShowSearch, setSearchQuery, setSearchResults]);

  const markAsFinished = useCallback((anime, day) => {
    if (!daysOfWeek.includes(day)) return;
    const removed = captureEntry(scheduleRef.current[day] || [], anime.id);
    const previousWatched = captureEntry(watchedListRef.current, anime.id);
    setSchedule((prev) => ({ ...prev, [day]: prev[day].filter((a) => a.id !== anime.id) }));
    const current = clean(latestAnime(anime));
    setWatchedList((prev) => [...prev.filter((a) => a.id !== anime.id), { ...current, finished: true, finishedDate: new Date().toISOString() }]);
    showToast(`"${anime.title}" marcado como finalizado`, () => {
      setSchedule((prev) => ({ ...prev, [day]: restoreEntry(prev[day] || [], removed) }));
      setWatchedList((prev) => restoreEntry(prev.filter((a) => a.id !== anime.id), previousWatched));
    });
  }, [setSchedule, setWatchedList, scheduleRef, watchedListRef, showToast, latestAnime]);

  const dropAnime = useCallback((anime, day) => {
    if (!daysOfWeek.includes(day)) return;
    const removed = captureEntry(scheduleRef.current[day] || [], anime.id);
    const previousWatched = captureEntry(watchedListRef.current, anime.id);
    setSchedule((prev) => ({ ...prev, [day]: prev[day].filter((a) => a.id !== anime.id) }));
    const current = clean(latestAnime(anime));
    setWatchedList((prev) => [...prev.filter((a) => a.id !== anime.id), { ...current, finished: false, droppedDate: new Date().toISOString() }]);
    showToast(`"${anime.title}" dropeado`, () => {
      setSchedule((prev) => ({ ...prev, [day]: restoreEntry(prev[day] || [], removed) }));
      setWatchedList((prev) => restoreEntry(prev.filter((a) => a.id !== anime.id), previousWatched));
    });
  }, [setSchedule, setWatchedList, scheduleRef, watchedListRef, showToast, latestAnime]);

  const addToWatchLater = useCallback((anime) => {
    const a = prepare(anime);
    setWatchLater((prev) => [...prev.filter((x) => x.id !== a.id), a]);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }, [setWatchLater, setShowSearch, setSearchQuery, setSearchResults]);

  const markAsWatched = useCallback((anime) => {
    setWatchedList((prev) => [...prev.filter((a) => a.id !== anime.id), {
      ...clean(anime), finished: true, finishedDate: new Date().toISOString(),
      currentEp: anime.currentEp || 0, userRating: anime.userRating || 0,
    }]);
  }, [setWatchedList]);

  const markAsWatchedFromSearch = useCallback((anime) => {
    markAsWatched(anime);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }, [markAsWatched, setShowSearch, setSearchQuery, setSearchResults]);

  const moveFromWatchLaterToSchedule = useCallback((anime, day) => {
    if (!daysOfWeek.includes(day)) return;
    const a = prepare(latestAnime(anime));
    setWatchLater((prev) => prev.filter((x) => x.id !== anime.id));
    setSchedule((prev) => ({ ...prev, [day]: [...prev[day].filter((x) => x.id !== a.id), a] }));
    setShowDayPicker(null);
  }, [setSchedule, setWatchLater, setShowDayPicker, latestAnime]);

  const resumeAnime = useCallback((anime) => {
    // Keep history intact until the user actually chooses a day.
    setShowDayPicker({ ...latestAnime(anime), _isWatched: true });
  }, [setShowDayPicker, latestAnime]);

  const deleteAnime = useCallback((anime) => {
    const day = daysOfWeek.includes(anime._day) ? anime._day : null;
    const removed = day ? captureEntry(scheduleRef.current[day] || [], anime.id) : null;
    const previousWatched = anime._isWatched ? captureEntry(watchedListRef.current, anime.id) : null;
    const previousLater = anime._isWatchLater ? captureEntry(watchLaterRef.current, anime.id) : null;
    if (day) setSchedule((prev) => ({ ...prev, [day]: prev[day].filter((a) => a.id !== anime.id) }));
    if (anime._isWatchLater) setWatchLater((prev) => prev.filter((a) => a.id !== anime.id));
    if (anime._isWatched) setWatchedList((prev) => prev.filter((a) => a.id !== anime.id));
    showToast(`"${anime.title}" eliminado`, () => {
      if (day) setSchedule((prev) => ({ ...prev, [day]: restoreEntry(prev[day] || [], removed) }));
      if (previousWatched) setWatchedList((prev) => restoreEntry(prev, previousWatched));
      if (previousLater) setWatchLater((prev) => restoreEntry(prev, previousLater));
    });
  }, [setSchedule, setWatchedList, setWatchLater, scheduleRef, watchedListRef, watchLaterRef, showToast]);

  const moveAnimeToDay = useCallback((anime, fromDay, toDay) => {
    if (!daysOfWeek.includes(fromDay) || !daysOfWeek.includes(toDay)) return;
    setSchedule((prev) => {
      const next = { ...prev };
      next[fromDay] = next[fromDay].filter((a) => a.id !== anime.id);
      const current = prev[fromDay].find((a) => a.id === anime.id) || latestAnime(anime);
      next[toDay] = [...next[toDay].filter((a) => a.id !== anime.id), clean(current)];
      return next;
    });
  }, [setSchedule, latestAnime]);

  // --- Generic per-anime updates ---

  const updateAnimeField = useCallback((animeId, getPatch) => {
    const patch = (list) => updateInList(list, animeId, getPatch);
    setSchedule((prev) => {
      const next = { ...prev };
      for (const d of daysOfWeek) next[d] = patch(next[d] || []);
      return next;
    });
    setWatchLater((prev) => patch(prev));
    setWatchedList((prev) => patch(prev));
    setCustomLists((prev) => prev.map((list) => ({ ...list, items: patch(list.items) })));
  }, [setSchedule, setWatchLater, setWatchedList, setCustomLists]);

  const updateEpisode = useCallback((animeId, delta) => {
    updateAnimeField(animeId, (a) => ({ currentEp: changeEpisode(a.currentEp, delta, a.episodes) }));
  }, [updateAnimeField]);

  const updateAnimeLink = useCallback((animeId, link) => {
    const value = link.trim();
    if (value && !sanitizeUrl(value)) return false;
    updateAnimeField(animeId, () => ({ watchLink: value }));
    return true;
  }, [updateAnimeField]);

  const updateUserRating = useCallback((animeId, rating) => {
    updateAnimeField(animeId, () => ({ userRating: rating }));
  }, [updateAnimeField]);

  // Persist lazily-fetched extras (trailer, streaming links) without ever
  // overwriting data the anime already has.
  const mergeAnimeExtras = useCallback((animeId, extras) => {
    updateAnimeField(animeId, (a) => ({
      trailerUrl: a.trailerUrl || extras.trailerUrl || '',
      streamingLinks: a.streamingLinks?.length ? a.streamingLinks : (extras.streamingLinks || []),
      watchLink: a.watchLink || extras.watchLink || '',
    }));
  }, [updateAnimeField]);

  // --- Custom lists ---

  const createCustomList = useCallback((name, emoji) => {
    setCustomLists((prev) => [...prev, { id: `list-${Date.now()}`, name, emoji, items: [] }]);
  }, [setCustomLists]);

  const deleteCustomList = useCallback((listId) => {
    const prev = clone(customListsRef.current);
    setCustomLists((lists) => lists.filter((l) => l.id !== listId));
    showToast('Lista eliminada', () => setCustomLists(prev));
  }, [setCustomLists, customListsRef, showToast]);

  const renameCustomList = useCallback((listId, newName) => {
    setCustomLists((lists) => lists.map((l) => (l.id === listId ? { ...l, name: newName } : l)));
  }, [setCustomLists]);

  const addToCustomList = useCallback((listId, anime) => {
    const a = prepare(latestAnime(anime));
    setCustomLists((lists) => lists.map((l) => (l.id === listId ? { ...l, items: [...l.items.filter((x) => x.id !== a.id), a] } : l)));
  }, [setCustomLists, latestAnime]);

  const removeFromCustomList = useCallback((listId, animeId) => {
    const removed = captureEntry(customListsRef.current.find((l) => l.id === listId)?.items || [], animeId);
    setCustomLists((lists) => lists.map((l) => (l.id === listId ? { ...l, items: l.items.filter((x) => x.id !== animeId) } : l)));
    showToast('Anime removido de la lista', () => setCustomLists((lists) => lists.map((l) => (
      l.id === listId ? { ...l, items: restoreEntry(l.items, removed) } : l
    ))));
  }, [setCustomLists, customListsRef, showToast]);

  // --- Import ---

  const handleImport = useCallback((data) => {
    let count = 0;
    // Read fresh from refs to avoid races when the user imports while
    // schedule/watchLater/watchedList are mid-update.
    const currentSchedule = scheduleRef.current || {};
    const currentWatchLater = watchLaterRef.current || [];
    const currentWatched = watchedListRef.current || [];
    const allScheduleIds = new Set(daysOfWeek.flatMap((d) => (currentSchedule[d] || []).map((a) => a.id)));
    const watchLaterIds = new Set(currentWatchLater.map((a) => a.id));
    const watchedIds = new Set(currentWatched.map((a) => a.id));

    if (data.schedule?.length) {
      data.schedule.forEach((a) => { if (!allScheduleIds.has(a.id)) count++; });
      setSchedule((prev) => {
        const next = { ...prev };
        data.schedule.forEach((a, i) => {
          const day = daysOfWeek[i % 7];
          if (!next[day].some((x) => x.id === a.id)) {
            next[day] = [...next[day], { ...a, _importStatus: undefined, _finished: undefined, _dropped: undefined }];
          }
        });
        return next;
      });
    }
    if (data.watchLater?.length) {
      count += data.watchLater.filter((a) => !watchLaterIds.has(a.id)).length;
      setWatchLater((prev) => {
        const existing = new Set(prev.map((a) => a.id));
        return [...prev, ...data.watchLater
          .filter((a) => !existing.has(a.id))
          .map((a) => ({ ...a, _importStatus: undefined, _finished: undefined, _dropped: undefined }))];
      });
    }
    if (data.watched?.length) {
      count += data.watched.filter((a) => !watchedIds.has(a.id)).length;
      setWatchedList((prev) => {
        const existing = new Set(prev.map((a) => a.id));
        return [...prev, ...data.watched
          .filter((a) => !existing.has(a.id))
          .map((a) => ({
            ...a,
            finished: a._finished ?? true,
            finishedDate: new Date().toISOString(),
            droppedDate: a._dropped ? new Date().toISOString() : undefined,
            _importStatus: undefined, _finished: undefined, _dropped: undefined,
          }))];
      });
    }
    showToast(`Importados ${count} animes desde AniList`);
  }, [scheduleRef, watchLaterRef, watchedListRef, setSchedule, setWatchLater, setWatchedList, showToast]);

  return {
    addToSchedule,
    markAsFinished,
    dropAnime,
    addToWatchLater,
    markAsWatched,
    markAsWatchedFromSearch,
    moveFromWatchLaterToSchedule,
    resumeAnime,
    deleteAnime,
    moveAnimeToDay,
    updateEpisode,
    updateAnimeLink,
    updateUserRating,
    mergeAnimeExtras,
    createCustomList,
    deleteCustomList,
    renameCustomList,
    addToCustomList,
    removeFromCustomList,
    handleImport,
  };
}
