import React from 'react';
import { t } from '../../i18n';

/**
 * Shared bulk-selection toolbar. The `actions` prop lets each caller (watchLater,
 * watched) decide which bulk operations to expose. `filteredList` is what the
 * view shows right now: "select all" covers only that, and the views prune the
 * selection to it when a filter changes.
 */
const BulkToolbar = ({
  bulkSelected,
  filteredList,
  bulkSelectAll,
  bulkDeselectAll,
  actions,
}) => {
  const allSelected = bulkSelected.size === filteredList.length && filteredList.length > 0;
  return (
    <div className="bulk-toolbar fade-in" role="toolbar" aria-label={t('bulk.toolbar', 'Acciones en lote')}>
      <div className="bulk-toolbar-left">
        <button
          className="bulk-select-all"
          onClick={() => (allSelected ? bulkDeselectAll() : bulkSelectAll(filteredList))}
        >
          {allSelected ? t('bulk.deselectAll', '☐ Deseleccionar') : t('bulk.selectAll', '☑ Seleccionar todo')}
        </button>
        <span className="bulk-count" aria-live="polite">
          {t('bulk.selectedCount', '{count} seleccionados', { count: bulkSelected.size })}
        </span>
      </div>
      <div className="bulk-toolbar-actions">
        {actions.map((a) => (
          <button
            key={a.label}
            className={`bulk-action-btn ${a.variant}`}
            onClick={a.onClick}
            disabled={bulkSelected.size === 0}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default BulkToolbar;
