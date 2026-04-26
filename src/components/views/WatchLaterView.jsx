import React, { useMemo, useState } from 'react';
import AnimeCard from '../AnimeCard';
import BulkToolbar from './BulkToolbar';
import RatingFilterBar from '../RatingFilterBar';
import { filterByLocalSearch, applyRatingFilter } from '../../utils';

const PAGE_SIZE = 30;

const WatchLaterView = ({
  watchLater, airingData, localSearch, setLocalSearch,
  bulkMode, bulkSelected, enterBulkMode, exitBulkMode, toggleBulkSelect, bulkSelectAll, bulkDeselectAll,
  onOpenBulkDayPicker, onBulkMarkWatched, onBulkDelete,
  setShowAnimeDetail,
}) => {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [minRating, setMinRating] = useState(0);
  const [sortByRating, setSortByRating] = useState(false);

  const filtered = useMemo(() => {
    const bySearch = filterByLocalSearch(watchLater, localSearch);
    return applyRatingFilter(bySearch, { minRating, sortByRating });
  }, [watchLater, localSearch, minRating, sortByRating]);
  const visibleItems = filtered.slice(0, visible);
  const remaining = filtered.length - visible;

  return (
    <section aria-labelledby="watchlater-heading">
      <div className="section-header">
        <h2 id="watchlater-heading">🕐 Ver más tarde</h2>
        <span className="count">{watchLater.length}</span>
        {watchLater.length > 0 && (
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
          actions={[
            { label: '📅 Mover a semana', variant: 'schedule', onClick: onOpenBulkDayPicker },
            { label: '✓ Marcar vistos', variant: 'watched', onClick: onBulkMarkWatched },
            { label: '🗑 Eliminar', variant: 'delete', onClick: onBulkDelete },
          ]}
        />
      )}
      {watchLater.length > 3 && (
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
      {watchLater.length > 3 && (
        <RatingFilterBar
          minRating={minRating}
          setMinRating={(v) => { setMinRating(v); setVisible(PAGE_SIZE); }}
          sortByRating={sortByRating}
          setSortByRating={setSortByRating}
        />
      )}
      {filtered.length > 0 ? (
        <>
          <div className="anime-grid stagger-in">
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
                  anime={a} isWatchLater airingData={airingData}
                  onClick={bulkMode ? undefined : () => setShowAnimeDetail({ ...a, _isWatchLater: true, _isWatched: false, _isSeason: false })}
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
            <span aria-hidden="true">📺</span>
            <p>{localSearch ? 'Sin resultados' : 'No hay animes guardados'}</p>
          </div>
        </div>
      )}
    </section>
  );
};

export default React.memo(WatchLaterView);
