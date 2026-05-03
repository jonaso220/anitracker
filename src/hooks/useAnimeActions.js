import { useCallback } from 'react';
import { daysOfWeek } from '../constants';
import { clean } from '../utils';

const clone = (v) => JSON.parse(JSON.stringify(v));

const updateInList = (list, animeId, updater) =>
  list.map((a) => (a.id === animeId ? { ...a, ...updater(a) } : a));

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

  const addToSchedule = useCallback((anime, day) => {
    const a = { ...clean(anime), currentEp: anime.currentEp || 0, userRating: anime.userRating || 0, notes: anime.notes || '' };
    setSchedule((prev) => ({ ...prev, [day]: [...prev[day].filter((x) => x.id !== a.id), a] }));
    setShowDayPicker(null);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }, [setSchedule, setShowDayPicker, setShowSearch, setSearchQuery, setSearchResults]);

  const markAsFinished = useCallback((anime, day) => {
    const prevSchedule = clone(scheduleRef.current);
    const prevWatched = clone(watchedListRef.current);
    setSchedule((prev) => ({ ...prev, [day]: prev[day].filter((a) => a.id !== anime.id) }));
    setWatchedList((prev) => [...prev.filter((a) => a.id !== anime.id), { ...clean(anime), finished: true, finishedDate: new Date().toISOString() }]);
    showToast(`"${anime.title}" marcado como finalizado`, () => {
      setSchedule(prevSchedule);
      setWatchedList(prevWatched);
    });
  }, [setSchedule, setWatchedList, scheduleRef, watchedListRef, showToast]);

  const dropAnime = useCallback((anime, day) => {
    const prevSchedule = clone(scheduleRef.current);
    const prevWatched = clone(watchedListRef.current);
    setSchedule((prev) => ({ ...prev, [day]: prev[day].filter((a) => a.id !== anime.id) }));
    setWatchedList((prev) => [...prev.filter((a) => a.id !== anime.id), { ...clean(anime), finished: false, droppedDate: new Date().toISOString() }]);
    showToast(`"${anime.title}" dropeado`, () => {
      setSchedule(prevSchedule);
      setWatchedList(prevWatched);
    });
  }, [setSchedule, setWatchedList, scheduleRef, watchedListRef, showToast]);

  const addToWatchLater = useCallback((anime) => {
    const a = { ...clean(anime), currentEp: anime.currentEp || 0, userRating: anime.userRating || 0, notes: anime.notes || '' };
    setWatchLater((prev) => [...prev.filter((x) => x.id !== a.id), a]);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }, [setWatchLater, setShowSearch, setSearchQuery, setSearchResults]);

  const markAsWatched = useCallback((anime) => {
    setWatchedList((prev) => [...prev.filter((a) => a.id !== anime.id), {
      ...clean(anime), finished: true, finishedDate: new Date().toISOString(),
      currentEp: anime.currentEp || 0, userRating: anime.userRating || 0, notes: anime.notes || '',
    }]);
  }, [setWatchedList]);

  const markAsWatchedFromSearch = useCallback((anime) => {
    markAsWatched(anime);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }, [markAsWatched, setShowSearch, setSearchQuery, setSearchResults]);

  const moveFromWatchLaterToSchedule = useCallback((anime, day) => {
    const a = { ...clean(anime), currentEp: anime.currentEp || 0, userRating: anime.userRating || 0, notes: anime.notes || '' };
    setWatchLater((prev) => prev.filter((x) => x.id !== anime.id));
    setSchedule((prev) => ({ ...prev, [day]: [...prev[day].filter((x) => x.id !== a.id), a] }));
  }, [setSchedule, setWatchLater]);

  const resumeAnime = useCallback((anime) => {
    const prevWatched = clone(watchedListRef.current);
    setWatchedList((prev) => prev.filter((a) => a.id !== anime.id));
    setShowDayPicker(anime);
    showToast(`"${anime.title}" retomado`, () => setWatchedList(prevWatched));
  }, [setWatchedList, watchedListRef, setShowDayPicker, showToast]);

  const deleteAnime = useCallback((anime) => {
    const prevSchedule = clone(scheduleRef.current);
    const prevWatched = clone(watchedListRef.current);
    const prevLater = clone(watchLaterRef.current);
    if (anime._day) setSchedule((prev) => ({ ...prev, [anime._day]: prev[anime._day].filter((a) => a.id !== anime.id) }));
    if (anime._isWatchLater) setWatchLater((prev) => prev.filter((a) => a.id !== anime.id));
    if (anime._isWatched) setWatchedList((prev) => prev.filter((a) => a.id !== anime.id));
    showToast(`"${anime.title}" eliminado`, () => {
      setSchedule(prevSchedule);
      setWatchedList(prevWatched);
      setWatchLater(prevLater);
    });
  }, [setSchedule, setWatchedList, setWatchLater, scheduleRef, watchedListRef, watchLaterRef, showToast]);

  const moveAnimeToDay = useCallback((anime, fromDay, toDay) => {
    setSchedule((prev) => {
      const next = { ...prev };
      next[fromDay] = next[fromDay].filter((a) => a.id !== anime.id);
      next[toDay] = [...next[toDay].filter((a) => a.id !== anime.id), anime];
      return next;
    });
  }, [setSchedule]);

  // --- Generic per-anime updates ---

  const updateAnimeField = useCallback((animeId, getPatch) => {
    const patch = (list) => updateInList(list, animeId, getPatch);
    setSchedule((prev) => {
      const next = { ...prev };
      for (const d of daysOfWeek) next[d] = patch(next[d]);
      return next;
    });
    setWatchLater((prev) => patch(prev));
    setWatchedList((prev) => patch(prev));
  }, [setSchedule, setWatchLater, setWatchedList]);

  const updateEpisode = useCallback((animeId, delta) => {
    updateAnimeField(animeId, (a) => ({ currentEp: Math.max(0, (a.currentEp || 0) + delta) }));
  }, [updateAnimeField]);

  const updateAnimeLink = useCallback((animeId, link) => {
    updateAnimeField(animeId, () => ({ watchLink: link }));
  }, [updateAnimeField]);

  const updateUserRating = useCallback((animeId, rating) => {
    updateAnimeField(animeId, () => ({ userRating: rating }));
  }, [updateAnimeField]);

  const updateAnimeNotes = useCallback((animeId, notes) => {
    updateAnimeField(animeId, () => ({ notes }));
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
    const a = { ...clean(anime), currentEp: anime.currentEp || 0, userRating: anime.userRating || 0, notes: anime.notes || '' };
    setCustomLists((lists) => lists.map((l) => (l.id === listId ? { ...l, items: [...l.items.filter((x) => x.id !== a.id), a] } : l)));
  }, [setCustomLists]);

  const removeFromCustomList = useCallback((listId, animeId) => {
    const prev = clone(customListsRef.current);
    setCustomLists((lists) => lists.map((l) => (l.id === listId ? { ...l, items: l.items.filter((x) => x.id !== animeId) } : l)));
    showToast('Anime removido de la lista', () => setCustomLists(prev));
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
    updateAnimeNotes,
    createCustomList,
    deleteCustomList,
    renameCustomList,
    addToCustomList,
    removeFromCustomList,
    handleImport,
  };
}
