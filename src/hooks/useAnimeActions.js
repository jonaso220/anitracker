import { useCallback } from 'react';
import { episodePatch, seasonPatch } from '../tracking';
import { captureEntry, restoreEntry, changeEpisode } from '../libraryEdits';
import { daysOfWeek, sanitizeUrl } from '../constants';
import { clean, pickAutoWatchLink } from '../utils';
import { planImport } from '../libraryImport';
import { t } from '../i18n';

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

// Sacan una obra de los demás lugares; devuelven la misma referencia si no
// estaba, así las vistas memoizadas no se re-renderizan de gusto.
const withoutInSchedule = (prev, id, keepDay) => {
  let next = prev;
  for (const d of daysOfWeek) {
    if (d !== keepDay && (prev[d] || []).some((a) => a.id === id)) {
      if (next === prev) next = { ...prev };
      next[d] = prev[d].filter((a) => a.id !== id);
    }
  }
  return next;
};
const withoutIn = (prev, id) => (prev.some((a) => a.id === id) ? prev.filter((a) => a.id !== id) : prev);

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

  // Una obra vive en UN solo lugar de la biblioteca: un día de la semana,
  // Después o Vistas (las listas personalizadas van aparte). Agregar desde la
  // búsqueda, Temporada o Directorio algo que ya está guardado lo mueve, con
  // su progreso, en vez de duplicarlo con el episodio en 0.
  const locate = useCallback((id) => {
    const day = daysOfWeek.find((d) => (scheduleRef.current[d] || []).some((a) => a.id === id));
    if (day) return day;
    if (watchLaterRef.current.some((a) => a.id === id)) return 'watchLater';
    if (watchedListRef.current.some((a) => a.id === id)) return 'watched';
    return null;
  }, [scheduleRef, watchLaterRef, watchedListRef]);

  // Lo que el usuario ya cargó (progreso, nota, temporada, link) gana sobre los
  // datos de la API; un link pegado en la búsqueda sí reemplaza al guardado.
  const resolveIncoming = useCallback((anime) => {
    const fromLibrary = anime._day || anime._isCustomList || anime._isWatched || anime._isWatchLater;
    const stored = latestAnime(anime);
    if (fromLibrary || stored === anime) return stored;
    return { ...anime, ...stored, ...(anime.watchLink ? { watchLink: anime.watchLink } : {}) };
  }, [latestAnime]);

  const captureLocations = useCallback((id) => ({
    days: Object.fromEntries(daysOfWeek.map((d) => [d, captureEntry(scheduleRef.current[d] || [], id)])),
    watchLater: captureEntry(watchLaterRef.current, id),
    watched: captureEntry(watchedListRef.current, id),
  }), [scheduleRef, watchLaterRef, watchedListRef]);

  // Deshacer de un movimiento: saca la obra de donde quedó y la devuelve a
  // donde estaba, sin tocar el resto de la biblioteca.
  const restoreLocations = useCallback((id, snapshot) => {
    setSchedule((prev) => {
      const next = { ...prev };
      for (const d of daysOfWeek) next[d] = restoreEntry((prev[d] || []).filter((a) => a.id !== id), snapshot.days[d]);
      return next;
    });
    setWatchLater((prev) => restoreEntry(prev.filter((a) => a.id !== id), snapshot.watchLater));
    setWatchedList((prev) => restoreEntry(prev.filter((a) => a.id !== id), snapshot.watched));
  }, [setSchedule, setWatchLater, setWatchedList]);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }, [setShowSearch, setSearchQuery, setSearchResults]);

  const addToSchedule = useCallback((anime, day) => {
    if (!daysOfWeek.includes(day)) return;
    const from = locate(anime.id);
    const snapshot = captureLocations(anime.id);
    const a = prepare(resolveIncoming(anime));
    if (from === 'watched' || anime._isWatched) {
      a.paused = false;
      delete a.finished;
      delete a.finishedDate;
      delete a.droppedDate;
    }
    setWatchedList((prev) => withoutIn(prev, a.id));
    setWatchLater((prev) => withoutIn(prev, a.id));
    setSchedule((prev) => {
      const next = withoutInSchedule(prev, a.id, day);
      return { ...next, [day]: [...(next[day] || []).filter((x) => x.id !== a.id), a] };
    });
    setShowDayPicker(null);
    closeSearch();
    // Algo nuevo se agrega desde el selector de día (elección explícita); el
    // aviso es para cuando mueve algo que ya estaba en otro lugar.
    if (from && from !== day) {
      showToast(t('toast.movedToDay', undefined, { title: a.title, day }), () => restoreLocations(a.id, snapshot));
    }
  }, [setSchedule, setWatchedList, setWatchLater, locate, captureLocations, resolveIncoming, restoreLocations, setShowDayPicker, closeSearch, showToast]);

  // El día que trae la acción puede haber quedado viejo (p. ej. el toast
  // "Pasar a Vistas" después de mover la tarjeta): se usa donde está ahora.
  const currentDay = useCallback((id, day) => (
    (scheduleRef.current[day] || []).some((a) => a.id === id)
      ? day
      : daysOfWeek.find((d) => (scheduleRef.current[d] || []).some((a) => a.id === id)) || null
  ), [scheduleRef]);

  const markAsFinished = useCallback((anime, requestedDay) => {
    if (!daysOfWeek.includes(requestedDay)) return;
    const day = currentDay(anime.id, requestedDay);
    if (!day) return;
    const removed = captureEntry(scheduleRef.current[day] || [], anime.id);
    const previousWatched = captureEntry(watchedListRef.current, anime.id);
    setSchedule((prev) => ({ ...prev, [day]: prev[day].filter((a) => a.id !== anime.id) }));
    const current = clean(latestAnime(anime));
    setWatchedList((prev) => [...prev.filter((a) => a.id !== anime.id), { ...current, finished: true, finishedDate: new Date().toISOString() }]);
    showToast(t('toast.markedFinished', undefined, { title: anime.title }), () => {
      setSchedule((prev) => ({ ...prev, [day]: restoreEntry(prev[day] || [], removed) }));
      setWatchedList((prev) => restoreEntry(prev.filter((a) => a.id !== anime.id), previousWatched));
    });
  }, [setSchedule, setWatchedList, scheduleRef, watchedListRef, showToast, latestAnime, currentDay]);

  const dropAnime = useCallback((anime, requestedDay) => {
    if (!daysOfWeek.includes(requestedDay)) return;
    const day = currentDay(anime.id, requestedDay);
    if (!day) return;
    const removed = captureEntry(scheduleRef.current[day] || [], anime.id);
    const previousWatched = captureEntry(watchedListRef.current, anime.id);
    setSchedule((prev) => ({ ...prev, [day]: prev[day].filter((a) => a.id !== anime.id) }));
    const current = clean(latestAnime(anime));
    setWatchedList((prev) => [...prev.filter((a) => a.id !== anime.id), { ...current, finished: false, droppedDate: new Date().toISOString() }]);
    showToast(t('toast.dropped', undefined, { title: anime.title }), () => {
      setSchedule((prev) => ({ ...prev, [day]: restoreEntry(prev[day] || [], removed) }));
      setWatchedList((prev) => restoreEntry(prev.filter((a) => a.id !== anime.id), previousWatched));
    });
  }, [setSchedule, setWatchedList, scheduleRef, watchedListRef, showToast, latestAnime, currentDay]);

  const addToWatchLater = useCallback((anime) => {
    const from = locate(anime.id);
    const snapshot = captureLocations(anime.id);
    const a = prepare(resolveIncoming(anime));
    if (from === 'watched') {
      delete a.finished;
      delete a.finishedDate;
      delete a.droppedDate;
    }
    setSchedule((prev) => withoutInSchedule(prev, a.id, null));
    setWatchedList((prev) => withoutIn(prev, a.id));
    setWatchLater((prev) => [...prev.filter((x) => x.id !== a.id), a]);
    closeSearch();
    if (from !== 'watchLater') {
      showToast(t('toast.addedToWatchLater', undefined, { title: a.title }), () => restoreLocations(a.id, snapshot));
    }
  }, [setSchedule, setWatchedList, setWatchLater, locate, captureLocations, resolveIncoming, restoreLocations, closeSearch, showToast]);

  const markAsWatched = useCallback((anime) => {
    const from = locate(anime.id);
    const snapshot = captureLocations(anime.id);
    const current = resolveIncoming(anime);
    // Volver a marcar algo que ya estaba en Vistas no pisa su fecha ni su nota.
    if (from === 'watched' && current.finished) return;
    const entry = {
      ...clean(current), finished: true, finishedDate: new Date().toISOString(),
      currentEp: current.currentEp || 0, userRating: current.userRating || 0,
    };
    delete entry.droppedDate;
    setSchedule((prev) => withoutInSchedule(prev, entry.id, null));
    setWatchLater((prev) => withoutIn(prev, entry.id));
    setWatchedList((prev) => [...prev.filter((a) => a.id !== entry.id), entry]);
    showToast(t('toast.markedWatched', undefined, { title: entry.title }), () => restoreLocations(entry.id, snapshot));
  }, [setSchedule, setWatchLater, setWatchedList, locate, captureLocations, resolveIncoming, restoreLocations, showToast]);

  const markAsWatchedFromSearch = useCallback((anime) => {
    markAsWatched(anime);
    closeSearch();
  }, [markAsWatched, closeSearch]);

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
    showToast(t('toast.deleted', undefined, { title: anime.title }), () => {
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
      showToast(t('toast.finishedSeries', undefined, { title: current.title }), undo, {
        label: t('toast.moveToWatched'),
        fn: () => markAsFinished({ ...current, _day: day }, day),
      });
    } else {
      showToast(t('toast.episodeWatched', undefined, { episode: after, title: current.title }), undo);
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
    showToast(t('toast.listDeleted'), () => setCustomLists((lists) => restoreEntry(lists, removed)));
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
    showToast(t('toast.removedFromList'), () => setCustomLists((lists) => lists.map((l) => (
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

    const already = plan.skipped ? t('toast.importSkippedSuffix', undefined, { count: plan.skipped }) : '';
    if (!plan.added) {
      showToast(`${t('toast.importNothing')}${already}`);
      return plan;
    }
    // Deshacer saca solo lo que agregó esta importación.
    const addedIds = new Set([...plan.schedule.map(({ anime }) => anime.id), ...plan.watchLater.map((a) => a.id), ...plan.watched.map((a) => a.id)]);
    const scheduleDays = new Set(plan.schedule.map(({ day }) => day));
    showToast(`${t('toast.imported', undefined, { count: plan.added })}${already}`, () => {
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
