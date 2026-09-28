import { useCallback } from 'react';
import { daysOfWeek } from '../constants';
import { clean } from '../utils';
import { captureEntry, restoreEntry } from '../libraryEdits';

// Capture every selected entry of a list (with its neighbours) for undo.
const captureAll = (list, ids) => (list || [])
  .filter((a) => ids.has(a.id))
  .map((a) => captureEntry(list, a.id));

// Put captured entries back where they were, touching nothing else: edits made
// (or synced from another device) while the undo toast was up survive.
const restoreAll = (list, captured) => captured.reduce(restoreEntry, list || []);

const plural = (count, singular, pluralForm) => (count > 1 ? pluralForm : singular);

/**
 * Bulk action handlers (delete, mark watched, move to schedule) that operate on
 * the current `bulkSelected` set, apply the action, then exit bulk mode and
 * show an undo toast. Snapshots are read from refs and cover only the affected
 * entries, like the single-anime actions in useAnimeActions.
 */
export function useBulkActions({
  activeTab,
  setSchedule, scheduleRef,
  setWatchedList, watchedListRef,
  setWatchLater, watchLaterRef,
  bulkSelected, exitBulkMode,
  showToast,
}) {
  const bulkDelete = useCallback(() => {
    if (bulkSelected.size === 0) return;
    const ids = new Set(bulkSelected);
    const count = ids.size;
    let undo = null;

    if (activeTab === 'watched') {
      const captured = captureAll(watchedListRef.current, ids);
      setWatchedList((prev) => prev.filter((a) => !ids.has(a.id)));
      undo = () => setWatchedList((prev) => restoreAll(prev, captured));
    } else if (activeTab === 'watchLater') {
      const captured = captureAll(watchLaterRef.current, ids);
      setWatchLater((prev) => prev.filter((a) => !ids.has(a.id)));
      undo = () => setWatchLater((prev) => restoreAll(prev, captured));
    } else if (activeTab === 'schedule') {
      const captured = Object.fromEntries(daysOfWeek.map((d) => [d, captureAll(scheduleRef.current[d], ids)]));
      setSchedule((prev) => {
        const next = { ...prev };
        for (const d of daysOfWeek) next[d] = (next[d] || []).filter((a) => !ids.has(a.id));
        return next;
      });
      undo = () => setSchedule((prev) => {
        const next = { ...prev };
        for (const d of daysOfWeek) if (captured[d].length) next[d] = restoreAll(next[d], captured[d]);
        return next;
      });
    }
    exitBulkMode();
    showToast(`${count} ${plural(count, 'anime eliminado', 'animes eliminados')}`, undo);
  }, [activeTab, bulkSelected, exitBulkMode, scheduleRef, watchedListRef, watchLaterRef, setSchedule, setWatchedList, setWatchLater, showToast]);

  const bulkMarkWatched = useCallback(() => {
    if (bulkSelected.size === 0) return;
    const ids = new Set(bulkSelected);
    const count = ids.size;
    const captured = captureAll(watchLaterRef.current, ids);
    const alreadyWatched = new Set(watchedListRef.current.map((a) => a.id));
    const finishedDate = new Date().toISOString();
    const added = captured
      .map(({ item }) => item)
      .filter((a) => !alreadyWatched.has(a.id))
      .map((a) => ({
        ...clean(a), finished: true, finishedDate,
        currentEp: a.currentEp || 0, userRating: a.userRating || 0,
      }));
    const addedIds = new Set(added.map((a) => a.id));

    setWatchLater((prev) => prev.filter((a) => !ids.has(a.id)));
    setWatchedList((prev) => {
      const existing = new Set(prev.map((a) => a.id));
      return [...prev, ...added.filter((a) => !existing.has(a.id))];
    });
    exitBulkMode();
    showToast(`${count} ${plural(count, 'anime marcado como visto', 'animes marcados como vistos')}`, () => {
      setWatchedList((prev) => prev.filter((a) => !addedIds.has(a.id)));
      setWatchLater((prev) => restoreAll(prev, captured));
    });
  }, [bulkSelected, exitBulkMode, watchLaterRef, watchedListRef, setWatchLater, setWatchedList, showToast]);

  const bulkMoveToSchedule = useCallback((day) => {
    if (bulkSelected.size === 0) return;
    const ids = new Set(bulkSelected);
    const count = ids.size;
    const captured = captureAll(watchLaterRef.current, ids);
    const moved = captured.map(({ item }) => ({ ...clean(item), currentEp: item.currentEp || 0, userRating: item.userRating || 0 }));
    const movedIds = new Set(moved.map((a) => a.id));
    // Same-id entries already in that day get replaced; keep them for undo.
    const replaced = captureAll(scheduleRef.current[day], movedIds);

    setWatchLater((prev) => prev.filter((a) => !ids.has(a.id)));
    setSchedule((prev) => ({ ...prev, [day]: [...(prev[day] || []).filter((x) => !movedIds.has(x.id)), ...moved] }));
    exitBulkMode();
    showToast(`${count} ${plural(count, 'anime movido', 'animes movidos')} a ${day}`, () => {
      setSchedule((prev) => ({ ...prev, [day]: restoreAll((prev[day] || []).filter((x) => !movedIds.has(x.id)), replaced) }));
      setWatchLater((prev) => restoreAll(prev, captured));
    });
  }, [bulkSelected, exitBulkMode, watchLaterRef, scheduleRef, setWatchLater, setSchedule, showToast]);

  return { bulkDelete, bulkMarkWatched, bulkMoveToSchedule };
}
