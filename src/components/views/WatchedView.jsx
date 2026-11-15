import React, { useCallback, useMemo, useState } from 'react';
import AnimeCard from '../AnimeCard';
import BulkToolbar from './BulkToolbar';
import { getFilteredWatched } from '../../utils';
import { usePruneBulkSelection } from '../../hooks/useBulkMode';
import { t } from '../../i18n';

const PAGE_SIZE = 30;

const FILTERS = [
  { key: 'all',      label: () => t('watched.filterAll', 'Todas') },
  { key: 'finished', label: () => t('watched.filterFinished', '✓ Completadas') },
  { key: 'dropped',  label: () => t('watched.filterDropped', '✗ Dropeadas') },
];
const SORTS = [
  { key: 'date',   label: () => t('watched.sortDate', 'Fecha') },
  { key: 'rating', label: () => t('watched.sortRating', 'Valoración') },
  { key: 'title',  label: () => t('watched.sortTitle', 'A-Z') },
];

const WatchedView = ({
  watchedList, airingData, localSearch, setLocalSearch,
  watchedFilter, setWatchedFilter, watchedSort, setWatchedSort,
  bulkMode, bulkSelected, enterBulkMode, exitBulkMode, toggleBulkSelect, bulkSelectAll, bulkDeselectAll,
  onBulkDelete,
  setShowAnimeDetail,
}) => {
  const [visible, setVisible] = useState(PAGE_SIZE);
  // Estable: al filtrar o seleccionar, las tarjetas que no cambian no se re-renderizan.
  const openCard = useCallback((_e, anime) => setShowAnimeDetail({ ...anime, _isWatched: true, _isWatchLater: false, _isSeason: false }), [setShowAnimeDetail]);

  const filtered = useMemo(
    () => getFilteredWatched(watchedList, watchedFilter, watchedSort, localSearch),
    [watchedList, watchedFilter, watchedSort, localSearch]
  );
  // Lo seleccionado que un filtro oculta sale de la selección: las acciones en
  // lote solo tocan lo que se ve.
  usePruneBulkSelection({ bulkMode, bulkSelected, items: filtered, bulkSelectAll });
  const bulkActions = useMemo(
    () => [{ label: t('bulk.delete', '🗑 Eliminar'), variant: 'delete', onClick: onBulkDelete }],
    [onBulkDelete],
  );
  const visibleItems = filtered.slice(0, visible);
  const remaining = filtered.length - visible;

  return (
    <section aria-labelledby="watched-heading">
      <div className="section-header">
        <h2 id="watched-heading">{t('watched.title', '✓ Series vistas')}</h2>
        <span className="count">{watchedList.length}</span>
        {watchedList.length > 0 && (
          <button
            className={`bulk-mode-btn ${bulkMode ? 'active' : ''}`}
            onClick={() => (bulkMode ? exitBulkMode() : enterBulkMode())}
            aria-pressed={bulkMode}
          >
            {bulkMode ? t('bulk.cancel', '✕ Cancelar') : t('bulk.start', '☑ Seleccionar')}
          </button>
        )}
      </div>
      {bulkMode && (
        <BulkToolbar
          bulkSelected={bulkSelected}
          filteredList={filtered}
          bulkSelectAll={bulkSelectAll}
          bulkDeselectAll={bulkDeselectAll}
          actions={bulkActions}
        />
      )}
      <div className="filter-bar" role="group" aria-label={t('watched.filtersLabel', 'Filtros de series vistas')}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`filter-btn ${watchedFilter === f.key ? 'active' : ''}`}
            onClick={() => { setWatchedFilter(f.key); setVisible(PAGE_SIZE); }}
            aria-pressed={watchedFilter === f.key}
          >
            {f.label()}
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
            {s.label()}
          </button>
        ))}
      </div>
      {watchedList.length > 3 && (
        <div className="local-search">
          <input
            type="text"
            placeholder={t('search.filterByName', '🔍 Filtrar por nombre...')}
            value={localSearch}
            onChange={(e) => { setLocalSearch(e.target.value); setVisible(PAGE_SIZE); }}
            aria-label={t('list.filterByNameLabel', 'Filtrar lista por nombre')}
          />
        </div>
      )}
      {filtered.length > 0 ? (
        <>
          <div className="anime-grid stagger-in">
            {visibleItems.map((a) => (
              <div
                key={a.id}
                className={`bulk-card-wrapper ${bulkMode ? 'selectable' : ''} ${bulkSelected.has(a.id) ? 'selected' : ''}`}
                onClick={bulkMode ? (e) => { e.stopPropagation(); toggleBulkSelect(a.id); } : undefined}
                role={bulkMode ? 'checkbox' : undefined}
                tabIndex={bulkMode ? 0 : undefined}
                aria-checked={bulkMode ? bulkSelected.has(a.id) : undefined}
                aria-label={bulkMode ? t('bulk.selectItem', 'Seleccionar {title}', { title: a.title }) : undefined}
                onKeyDown={bulkMode ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBulkSelect(a.id); } } : undefined}
              >
                {bulkMode && (
                  <div className={`bulk-checkbox ${bulkSelected.has(a.id) ? 'checked' : ''}`} aria-hidden="true">
                    {bulkSelected.has(a.id) ? '✓' : ''}
                  </div>
                )}
                <AnimeCard
                  anime={a} isWatched airingData={airingData}
                  onClick={bulkMode ? undefined : openCard}
                />
              </div>
            ))}
          </div>
          {remaining > 0 && (
            <button className="load-more-btn" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
              {t('list.showMore', 'Mostrar más ({count} restantes)', { count: remaining })}
            </button>
          )}
        </>
      ) : (
        <div className="anime-grid">
          <div className="empty-state">
            <span aria-hidden="true">🎬</span>
            <p>{watchedList.length === 0 ? t('watched.empty', 'Todavía no marcaste ninguna serie como vista') : t('empty.noWatched', 'No hay resultados')}</p>
          </div>
        </div>
      )}
    </section>
  );
};

export default React.memo(WatchedView);
