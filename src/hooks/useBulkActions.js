import { useCallback } from 'react';
import { daysOfWeek } from '../constants';
import { clean } from '../utils';

const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * Bulk action handlers (delete, mark watched, move to schedule) that operate on
 * the current `bulkSelected` set, apply the action, then exit bulk mode and
 * show an undo toast.
 */
export function useBulkActions({
  activeTab,
  schedule, setSchedule,
  watchedList, setWatchedList,
  watchLater, setWatchLater,
  bulkSelected, exitBulkMode,
  showToast,
}) {
  const bulkDelete = useCallback(() => {
    if (bulkSelected.size === 0) return;
    const prevSchedule = clone(schedule);
    const prevWatched = clone(watchedList);
    const prevLater = clone(watchLater);
    const count = bulkSelected.size;

    if (activeTab === 'watched') {
      setWatchedList((prev) => prev.filter((a) => !bulkSelected.has(a.id)));
    } else if (activeTab === 'watchLater') {
      setWatchLater((prev) => prev.filter((a) => !bulkSelected.has(a.id)));
    } else if (activeTab === 'schedule') {
      setSchedule((prev) => {
        const next = { ...prev };
        for (const d of daysOfWeek) next[d] = next[d].filter((a) => !bulkSelected.has(a.id));
        return next;
      });
    }
    exitBulkMode();
    showToast(`${count} anime${count > 1 ? 's' : ''} eliminado${count > 1 ? 's' : ''}`, () => {
      setSchedule(prevSchedule);
      setWatchedList(prevWatched);
      setWatchLater(prevLater);
    });
  }, [activeTab, schedule, watchedList, watchLater, bulkSelected, exitBulkMode, setSchedule, setWatchedList, setWatchLater, showToast]);

  const bulkMarkWatched = useCallback(() => {
    if (bulkSelected.size === 0) return;
    const prevLater = clone(watchLater);
    const prevWatched = clone(watchedList);
    const count = bulkSelected.size;

    const toMove = watchLater.filter((a) => bulkSelected.has(a.id));
    setWatchLater((prev) => prev.filter((a) => !bulkSelected.has(a.id)));
    setWatchedList((prev) => {
      const existing = new Set(prev.map((a) => a.id));
      const newItems = toMove
        .filter((a) => !existing.has(a.id))
        .map((a) => ({
          ...clean(a), finished: true, finishedDate: new Date().toISOString(),
          currentEp: a.currentEp || 0, userRating: a.userRating || 0, notes: a.notes || '',
        }));
      return [...prev, ...newItems];
    });
    exitBulkMode();
    showToast(`${count} anime${count > 1 ? 's' : ''} marcado${count > 1 ? 's' : ''} como visto${count > 1 ? 's' : ''}`, () => {
      setWatchLater(prevLater); setWatchedList(prevWatched);
    });
  }, [watchLater, watchedList, bulkSelected, exitBulkMode, setWatchLater, setWatchedList, showToast]);

  const bulkMoveToSchedule = useCallback((day) => {
    if (bulkSelected.size === 0) return;
    const prevLater = clone(watchLater);
    const prevSchedule = clone(schedule);
    const count = bulkSelected.size;

    const toMove = watchLater.filter((a) => bulkSelected.has(a.id));
    setWatchLater((prev) => prev.filter((a) => !bulkSelected.has(a.id)));
    setSchedule((prev) => {
      const next = { ...prev };
      toMove.forEach((a) => {
        const cleaned = { ...clean(a), currentEp: a.currentEp || 0, userRating: a.userRating || 0, notes: a.notes || '' };
        next[day] = [...next[day].filter((x) => x.id !== cleaned.id), cleaned];
      });
      return next;
    });
    exitBulkMode();
    showToast(`${count} anime${count > 1 ? 's' : ''} movido${count > 1 ? 's' : ''} a ${day}`, () => {
      setWatchLater(prevLater); setSchedule(prevSchedule);
    });
  }, [schedule, watchLater, bulkSelected, exitBulkMode, setWatchLater, setSchedule, showToast]);

  return { bulkDelete, bulkMarkWatched, bulkMoveToSchedule };
}
