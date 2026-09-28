import { useCallback } from 'react';
import { episodePatch, seasonPatch } from '../tracking';
import { captureEntry, restoreEntry, changeEpisode } from '../libraryEdits';
import { daysOfWeek, sanitizeUrl } from '../constants';
import { clean, pickAutoWatchLink } from '../utils';
import { planImport } from '../libraryImport';

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
      a.paused = false;
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
    updateAnimeField(animeId, (a) => episodePatch(a, (a.currentEp || 0) + delta));
  }, [updateAnimeField]);

  // +1 rápido desde la tarjeta o "Para hoy": se puede deshacer (un toque al
  // hacer scroll sumaba un episodio sin aviso) y, si era el último, ofrece
  // pasar el anime a Vistas en vez de dejarlo "Al día" en la semana.
  const quickEpisode = useCallback((animeId) => {
    const day = daysOfWeek.find((d) => (scheduleRef.current[d] || []).some((a) => a.id === animeId));
    const current = day
      ? scheduleRef.current[day].find((a) => a.id === animeId)
      : latestAnime({ id: animeId });
    if (!current) return;
    const before = current.currentEp || 0;
    const after = changeEpisode(before, 1, current.episodes);
    if (after === before) return;
    // Solo si nadie lo cambió en el medio (otro toque, sync de otro dispositivo).
    const stepTo = (from, to) => updateAnimeField(animeId, (a) => ((a.currentEp || 0) === from ? episodePatch(a, to) : {}));
    stepTo(before, after);
    const undo = () => stepTo(after, before);
    if (day && current.episodes > 0 && after >= current.episodes) {
      showToast(`¡Terminaste "${current.title}"!`, undo, {
        label: 'Pasar a Vistas',
        fn: () => markAsFinished({ ...current, _day: day }, day),
      });
    } else {
      showToast(`Ep. ${after} de "${current.title}" visto`, undo);
    }
  }, [scheduleRef, latestAnime, updateAnimeField, showToast, markAsFinished]);

  const setEpisodeNumber = useCallback((animeId, value) => {
    if (!Number.isSafeInteger(value) || value < 0) return;
    updateAnimeField(animeId, (a) => episodePatch(a, value));
  }, [updateAnimeField]);

  const setAnimeSeason = useCallback((animeId, season, total) => {
    if (!Number.isSafeInteger(season) || season < 1 || season > 999) return;
    if (total !== undefined && (!Number.isSafeInteger(total) || total < 0)) return;
    updateAnimeField(animeId, (a) => {
      const patch = seasonPatch(a, season, total);
      return total > 0 && total < patch.currentEp ? {} : patch;
    });
  }, [updateAnimeField]);

  const setAnimePaused = useCallback((animeId, paused) => {
    updateAnimeField(animeId, () => ({ paused }));
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
    const removed = captureEntry(customListsRef.current, listId);
    setCustomLists((lists) => lists.filter((l) => l.id !== listId));
    showToast('Lista eliminada', () => setCustomLists((lists) => restoreEntry(lists, removed)));
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

  const currentLibrary = useCallback(() => ({
    schedule: scheduleRef.current || {},
    watchLater: watchLaterRef.current || [],
    watchedList: watchedListRef.current || [],
  }), [scheduleRef, watchLaterRef, watchedListRef]);

  // Vista previa para el modal: cuántos son nuevos y cuántos ya están.
  const previewImport = useCallback((data) => planImport(data, currentLibrary()), [currentLibrary]);

  const handleImport = useCallback((data) => {
    // El plan se calcula con lo último (refs), no con lo que vio la vista previa.
    const plan = planImport(data, currentLibrary());
    const now = new Date().toISOString();
    const stripImport = (anime) => {
      const rest = { ...anime };
      delete rest._importStatus; delete rest._finished; delete rest._dropped; delete rest._doneAt;
      return rest;
    };

    if (plan.schedule.length) {
      setSchedule((prev) => {
        const next = { ...prev };
        plan.schedule.forEach(({ anime, day }) => {
          next[day] = [...(next[day] || []).filter((x) => x.id !== anime.id), prepare(stripImport(anime))];
        });
        return next;
      });
    }
    if (plan.watchLater.length) {
      setWatchLater((prev) => [...prev, ...plan.watchLater.map((a) => prepare(stripImport(a)))]);
    }
    if (plan.watched.length) {
      setWatchedList((prev) => [...prev, ...plan.watched.map((a) => {
        const doneAt = a._doneAt || now;
        return {
          ...prepare(stripImport(a)),
          finished: !a._dropped,
          ...(a._dropped ? { droppedDate: doneAt } : { finishedDate: doneAt }),
        };
      })]);
    }

    const already = plan.skipped ? ` · ${plan.skipped} ya ${plan.skipped === 1 ? 'estaba' : 'estaban'} en tu biblioteca` : '';
    if (!plan.added) {
      showToast(`No había nada nuevo para importar${already}`);
      return plan;
    }
    // Deshacer saca solo lo que agregó esta importación.
    const addedIds = new Set([...plan.schedule.map(({ anime }) => anime.id), ...plan.watchLater.map((a) => a.id), ...plan.watched.map((a) => a.id)]);
    const scheduleDays = new Set(plan.schedule.map(({ day }) => day));
    showToast(`${plan.added === 1 ? 'Importado 1 anime' : `Importados ${plan.added} animes`} desde AniList${already}`, () => {
      if (scheduleDays.size) {
        setSchedule((prev) => {
          const next = { ...prev };
          daysOfWeek.forEach((d) => { next[d] = (next[d] || []).filter((x) => !addedIds.has(x.id)); });
          return next;
        });
      }
      if (plan.watchLater.length) setWatchLater((prev) => prev.filter((x) => !addedIds.has(x.id)));
      if (plan.watched.length) setWatchedList((prev) => prev.filter((x) => !addedIds.has(x.id)));
    });
    return plan;
  }, [currentLibrary, setSchedule, setWatchLater, setWatchedList, showToast]);

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
    quickEpisode,
    setEpisodeNumber,
    setAnimeSeason,
    setAnimePaused,
    updateAnimeLink,
    updateUserRating,
    mergeAnimeExtras,
    createCustomList,
    deleteCustomList,
    renameCustomList,
    addToCustomList,
    removeFromCustomList,
    handleImport,
    previewImport,
  };
}
