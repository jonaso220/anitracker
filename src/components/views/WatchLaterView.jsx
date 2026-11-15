import React, { useCallback, useMemo, useState } from 'react';
import AnimeCard from '../AnimeCard';
import BulkToolbar from './BulkToolbar';
import RatingFilterBar from '../RatingFilterBar';
import { filterByLocalSearch, applyRatingFilter } from '../../utils';
import { usePruneBulkSelection } from '../../hooks/useBulkMode';
import { t } from '../../i18n';

const PAGE_SIZE = 30;
// La barra de valoración y el buscador local solo aparecen con más de 3.
const FILTERS_FROM = 4;

const WatchLaterView = ({
  watchLater, airingData, localSearch, setLocalSearch,
  bulkMode, bulkSelected, enterBulkMode, exitBulkMode, toggleBulkSelect, bulkSelectAll, bulkDeselectAll,
  onOpenBulkDayPicker, onBulkMarkWatched, onBulkDelete,
  setShowAnimeDetail,
}) => {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [minRating, setMinRating] = useState(0);
  const [sortByRating, setSortByRating] = useState(false);
  // Estable: al filtrar o seleccionar, las tarjetas que no cambian no se re-renderizan.
  const openCard = useCallback((_e, anime) => setShowAnimeDetail({ ...anime, _isWatchLater: true, _isWatched: false, _isSeason: false }), [setShowAnimeDetail]);
  // Estable para el RatingFilterBar memoizado.
  const changeMinRating = useCallback((value) => { setMinRating(value); setVisible(PAGE_SIZE); }, []);

  // Si la lista bajó a 3 o menos la barra se oculta: un filtro que no se ve no
  // puede seguir escondiendo animes.
  const showFilters = watchLater.length >= FILTERS_FROM;
  const activeMinRating = showFilters ? minRating : 0;

  const filtered = useMemo(() => {
    const bySearch = filterByLocalSearch(watchLater, localSearch);
    return applyRatingFilter(bySearch, { minRating: activeMinRating, sortByRating });
  }, [watchLater, localSearch, activeMinRating, sortByRating]);
  // Lo seleccionado que un filtro oculta sale de la selección: las acciones en
  // lote solo tocan lo que se ve.
  usePruneBulkSelection({ bulkMode, bulkSelected, items: filtered, bulkSelectAll });
  const bulkActions = useMemo(() => [
    { label: t('bulk.moveToWeek', '📅 Mover a semana'), variant: 'schedule', onClick: onOpenBulkDayPicker },
    { label: t('bulk.markWatched', '✓ Marcar vistos'), variant: 'watched', onClick: onBulkMarkWatched },
    { label: t('bulk.delete', '🗑 Eliminar'), variant: 'delete', onClick: onBulkDelete },
  ], [onOpenBulkDayPicker, onBulkMarkWatched, onBulkDelete]);
  const visibleItems = filtered.slice(0, visible);
  const remaining = filtered.length - visible;

  let emptyMessage = t('empty.noResults', 'Sin resultados');
  if (watchLater.length === 0) emptyMessage = t('empty.noAnime', 'No hay animes guardados');
  else if (!localSearch && activeMinRating > 0) emptyMessage = t('watchLater.noRatingMatch', 'Ningún anime guardado tiene {rating} o más de valoración', { rating: activeMinRating });

  return (
    <section aria-labelledby="watchlater-heading">
      <div className="section-header">
        <h2 id="watchlater-heading">{t('watchLater.title', '🕐 Ver más tarde')}</h2>
        <span className="count">{watchLater.length}</span>
        {watchLater.length > 0 && (
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
      {showFilters && (
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
      {showFilters && (
        <RatingFilterBar
          minRating={minRating}
          setMinRating={changeMinRating}
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
                  anime={a} isWatchLater airingData={airingData}
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
            <span aria-hidden="true">📺</span>
            <p>{emptyMessage}</p>
          </div>
        </div>
      )}
    </section>
  );
};

export default React.memo(WatchLaterView);
