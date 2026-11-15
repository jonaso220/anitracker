import { useCallback, useEffect, useState } from 'react';

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

/**
 * Keeps the bulk selection inside the items the view currently shows. The bulk
 * actions act on the whole `bulkSelected` set, so without this a filter or a
 * search would hide selected items and "Eliminar" would still delete them.
 * Narrowing the selection when the filtered list changes also keeps the
 * "N seleccionados" counter honest.
 *
 * `bulkSelectAll(list)` replaces the selection with exactly `list`, which is
 * what pruning needs, so this works with the props the views already get.
 */
export function usePruneBulkSelection({ bulkMode, bulkSelected, items, bulkSelectAll }) {
  useEffect(() => {
    if (!bulkMode || !bulkSelected || bulkSelected.size === 0) return;
    const shown = new Set(items.map((a) => a.id));
    for (const id of bulkSelected) {
      if (!shown.has(id)) {
        bulkSelectAll(items.filter((a) => bulkSelected.has(a.id)));
        return;
      }
    }
  }, [bulkMode, bulkSelected, items, bulkSelectAll]);
}
