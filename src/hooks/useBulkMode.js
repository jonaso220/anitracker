import { useCallback, useState } from 'react';

/**
 * Selection/bulk-mode state for list views. Callers pass in the active list when
 * toggling "select all".
 */
export function useBulkMode() {
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(() => new Set());

  const toggleBulkSelect = useCallback((id) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const bulkSelectAll = useCallback((list) => {
    setBulkSelected(new Set(list.map((a) => a.id)));
  }, []);

  const bulkDeselectAll = useCallback(() => {
    setBulkSelected(new Set());
  }, []);

  const exitBulkMode = useCallback(() => {
    setBulkMode(false);
    setBulkSelected(new Set());
  }, []);

  const enterBulkMode = useCallback(() => setBulkMode(true), []);

  return {
    bulkMode,
    bulkSelected,
    toggleBulkSelect,
    bulkSelectAll,
    bulkDeselectAll,
    enterBulkMode,
    exitBulkMode,
  };
}
