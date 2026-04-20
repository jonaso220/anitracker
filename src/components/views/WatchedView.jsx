import React, { useMemo, useState } from 'react';
import AnimeCard from '../AnimeCard';
import BulkToolbar from './BulkToolbar';
import { getFilteredWatched } from '../../utils';

const PAGE_SIZE = 30;

const FILTERS = [
  { key: 'all',      label: 'Todas' },
  { key: 'finished', label: '✓ Completadas' },
  { key: 'dropped',  label: '⏸ Dropeadas' },
];
const SORTS = [
  { key: 'date',   label: 'Fecha' },
  { key: 'rating', label: 'Valoración' },
  { key: 'title',  label: 'A-Z' },
];

const WatchedView = ({
  watchedList, airingData, localSearch, setLocalSearch,
  watchedFilter, setWatchedFilter, watchedSort, setWatchedSort,
  bulkMode, bulkSelected, enterBulkMode, exitBulkMode, toggleBulkSelect, bulkSelectAll, bulkDeselectAll,
  onBulkDelete,
  setShowAnimeDetail,
}) => {
  const [visible, setVisible] = useState(PAGE_SIZE);

  const filtered = useMemo(
    () => getFilteredWatched(watchedList, watchedFilter, watchedSort, localSearch),
    [watchedList, watchedFilter, watchedSort, localSearch]
  );
  const visibleItems = filtered.slice(0, visible);
  const remaining = filtered.length - visible;

  return (
    <section aria-labelledby="watched-heading">
      <div className="section-header">
        <h2 id="watched-heading">✓ Series vistas</h2>
        <span className="count">{watchedList.length}</span>
        {watchedList.length > 0 && (
          <button
            className={`bulk-mode-btn ${bulkMode ? 'active' : ''}`}
            onClick={() => (bulkMode ? exitBulkMode() : enterBulkMode())}
            aria-pressed={bulkMode}
          >
            {bulkMode ? '✕ Cancelar' : '☑ Seleccionar'}
          </button>
        )}
      </div>
      {bulkMode && (
        <BulkToolbar
          bulkSelected={bulkSelected}
          filteredList={filtered}
          bulkSelectAll={bulkSelectAll}
          bulkDeselectAll={bulkDeselectAll}
          actions={[{ label: '🗑 Eliminar', variant: 'delete', onClick: onBulkDelete }]}
        />
      )}
      <div className="filter-bar" role="group" aria-label="Filtros de series vistas">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`filter-btn ${watchedFilter === f.key ? 'active' : ''}`}
            onClick={() => { setWatchedFilter(f.key); setVisible(PAGE_SIZE); }}
            aria-pressed={watchedFilter === f.key}
          >
            {f.label}
          </button>
        ))}
        <span style={{ opacity: 0.3 }} aria-hidden="true">|</span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            className={`sort-btn ${watchedSort === s.key ? 'active' : ''}`}
            onClick={() => { setWatchedSort(s.key); setVisible(PAGE_SIZE); }}
            aria-pressed={watchedSort === s.key}
          >
            {s.label}
          </button>
        ))}
      </div>
      {watchedList.length > 3 && (
        <div className="local-search">
          <input
            type="text"
            placeholder="🔍 Filtrar por nombre..."
            value={localSearch}
            onChange={(e) => { setLocalSearch(e.target.value); setVisible(PAGE_SIZE); }}
            aria-label="Filtrar lista por nombre"
          />
        </div>
      )}
      {filtered.length > 0 ? (
        <>
          <div className="anime-grid">
            {visibleItems.map((a) => (
              <div
                key={a.id}
                className={`bulk-card-wrapper ${bulkMode ? 'selectable' : ''} ${bulkSelected.has(a.id) ? 'selected' : ''}`}
                onClick={bulkMode ? (e) => { e.stopPropagation(); toggleBulkSelect(a.id); } : undefined}
              >
                {bulkMode && (
                  <div className={`bulk-checkbox ${bulkSelected.has(a.id) ? 'checked' : ''}`} aria-hidden="true">
                    {bulkSelected.has(a.id) ? '✓' : ''}
                  </div>
                )}
                <AnimeCard
                  anime={a} isWatched airingData={airingData}
                  onClick={bulkMode ? undefined : () => setShowAnimeDetail({ ...a, _isWatched: true, _isWatchLater: false, _isSeason: false })}
                />
              </div>
            ))}
          </div>
          {remaining > 0 && (
            <button className="load-more-btn" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
              Mostrar más ({remaining} restantes)
            </button>
          )}
        </>
      ) : (
        <div className="anime-grid">
          <div className="empty-state">
            <span aria-hidden="true">🎬</span>
            <p>No hay resultados</p>
          </div>
        </div>
      )}
    </section>
  );
};

export default React.memo(WatchedView);
