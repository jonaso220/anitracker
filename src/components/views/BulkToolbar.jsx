import React from 'react';

/**
 * Shared bulk-selection toolbar. The `actions` prop lets each caller (watchLater,
 * watched) decide which bulk operations to expose.
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
    <div className="bulk-toolbar fade-in" role="toolbar" aria-label="Acciones en lote">
      <div className="bulk-toolbar-left">
        <button
          className="bulk-select-all"
          onClick={() => (allSelected ? bulkDeselectAll() : bulkSelectAll(filteredList))}
        >
          {allSelected ? '☐ Deseleccionar' : '☑ Seleccionar todo'}
        </button>
        <span className="bulk-count" aria-live="polite">
          {bulkSelected.size} seleccionado{bulkSelected.size !== 1 ? 's' : ''}
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
