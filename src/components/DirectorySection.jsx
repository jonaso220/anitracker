import React, { useMemo } from 'react';
import { daysOfWeek } from '../constants';
import DiscoveryCard from './DiscoveryCard';
import DirectoryListRow from './DirectoryListRow';
import { usePersistedState } from '../hooks/usePersistedState';
import { t } from '../i18n';

// Valores tal como los espera AniList; etiquetas en español para la UI.
const GENRES = [
  ['Action', 'Acción'], ['Adventure', 'Aventura'], ['Comedy', 'Comedia'], ['Drama', 'Drama'],
  ['Ecchi', 'Ecchi'], ['Fantasy', 'Fantasía'], ['Horror', 'Terror'], ['Mahou Shoujo', 'Mahou Shoujo'],
  ['Mecha', 'Mecha'], ['Music', 'Música'], ['Mystery', 'Misterio'], ['Psychological', 'Psicológico'],
  ['Romance', 'Romance'], ['Sci-Fi', 'Ciencia ficción'], ['Slice of Life', 'Recuentos de la vida'],
  ['Sports', 'Deportes'], ['Supernatural', 'Sobrenatural'], ['Thriller', 'Suspenso'],
];
const DEMOGRAPHIES = [
  ['Shounen', 'Shounen'], ['Shoujo', 'Shoujo'], ['Seinen', 'Seinen'], ['Josei', 'Josei'], ['Kids', 'Infantil'],
];
const FORMATS = [
  ['TV', 'TV'], ['MOVIE', 'Película'], ['OVA', 'OVA'], ['ONA', 'ONA'],
  ['SPECIAL', 'Especial'], ['TV_SHORT', 'TV corto'], ['MUSIC', 'Música'],
];
const STATUSES = [
  ['RELEASING', 'En emisión'], ['FINISHED', 'Finalizado'], ['NOT_YET_RELEASED', 'Próximamente'],
  ['HIATUS', 'En pausa'], ['CANCELLED', 'Cancelado'],
];
const SEASONS = [
  ['WINTER', 'Invierno'], ['SPRING', 'Primavera'], ['SUMMER', 'Verano'], ['FALL', 'Otoño'],
];
const SORTS = [
  ['POPULARITY_DESC', 'Popularidad'], ['SCORE_DESC', 'Puntuación'], ['TRENDING_DESC', 'Tendencia'],
  ['START_DATE_DESC', 'Más recientes'], ['TITLE_ROMAJI', 'Título (A-Z)'],
];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR + 2 - 1960 }, (_, i) => String(CURRENT_YEAR + 1 - i));

const FilterSelect = ({ id, label, value, options, allLabel, onChange }) => (
  <label className="directory-field" htmlFor={id}>
    {label}
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allLabel}</option>
      {options.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}
    </select>
  </label>
);

const DirectorySection = ({ directory, schedule, watchedList, watchLater, setShowDayPicker, addToWatchLater, markAsWatched, onDetail }) => {
  const { filters, results, loading, loadingMore, hasNextPage, updateFilter, resetFilters, loadMore } = directory;
  const [viewMode, setViewMode] = usePersistedState('anitracker-directory-view', 'grid');

  const allUserIds = useMemo(() => new Set([
    ...daysOfWeek.flatMap(d => (schedule[d] || []).map(a => a.id)),
    ...watchedList.map(a => a.id),
    ...watchLater.map(a => a.id)
  ]), [schedule, watchedList, watchLater]);

  const hasActiveFilters = filters.search.trim() !== '' || ['genre', 'demography', 'format', 'status', 'year', 'season'].some((k) => filters[k] !== '') || filters.sort !== 'POPULARITY_DESC';

  return (
    <>
      <div className="section-header">
        <h2>📚 {t('nav.directory', 'Directorio')}</h2>
        <span className="count">{results.length}{hasNextPage ? '+' : ''}</span>
      </div>

      <div className="directory-filters">
        <div className="directory-toolbar">
          <input
            type="search"
            className="directory-search"
            placeholder={t('directory.searchPlaceholder', '🔍 Filtrar anime...')}
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            aria-label={t('directory.searchPlaceholder', 'Filtrar anime')}
          />
          <div className="directory-view-toggle" role="group" aria-label="Modo de vista">
            <button
              className={`directory-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              title={t('directory.viewGrid', 'Vista de cuadrícula')}
              aria-label={t('directory.viewGrid', 'Vista de cuadrícula')}
            >⊞</button>
            <button
              className={`directory-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              title={t('directory.viewList', 'Vista de lista')}
              aria-label={t('directory.viewList', 'Vista de lista')}
            >☰</button>
          </div>
        </div>
        <div className="directory-selects">
          <FilterSelect id="dir-genre" label={t('directory.genre', 'Género')} value={filters.genre} options={GENRES} allLabel="Todos" onChange={(v) => updateFilter('genre', v)} />
          <FilterSelect id="dir-demography" label={t('directory.demography', 'Demografía')} value={filters.demography} options={DEMOGRAPHIES} allLabel="Todas" onChange={(v) => updateFilter('demography', v)} />
          <FilterSelect id="dir-format" label={t('directory.format', 'Tipo')} value={filters.format} options={FORMATS} allLabel="Todos" onChange={(v) => updateFilter('format', v)} />
          <FilterSelect id="dir-status" label={t('directory.status', 'Estado')} value={filters.status} options={STATUSES} allLabel="Todos" onChange={(v) => updateFilter('status', v)} />
          <FilterSelect id="dir-year" label={t('directory.year', 'Año')} value={filters.year} options={YEARS.map((y) => [y, y])} allLabel="Todos" onChange={(v) => updateFilter('year', v)} />
          <FilterSelect id="dir-season" label={t('directory.season', 'Temporada')} value={filters.season} options={SEASONS} allLabel="Todas" onChange={(v) => updateFilter('season', v)} />
          <FilterSelect id="dir-sort" label={t('directory.sort', 'Ordenar por')} value={filters.sort} options={SORTS} allLabel="Popularidad" onChange={(v) => updateFilter('sort', v || 'POPULARITY_DESC')} />
        </div>
        {hasActiveFilters && (
          <button className="directory-clear-btn" onClick={resetFilters}>
            ✕ {t('directory.clear', 'Limpiar filtros')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="season-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton skeleton-card-image"></div>
              <div className="skeleton-card-body">
                <div className="skeleton skeleton-line w75"></div>
                <div className="skeleton skeleton-line w50"></div>
                <div className="skeleton skeleton-line w30"></div>
              </div>
            </div>
          ))}
        </div>
      ) : results.length > 0 ? (
        <>
          {viewMode === 'list' ? (
            <div className="directory-list stagger-in">
              {results.map(anime => (
                <DirectoryListRow
                  key={anime.id}
                  anime={anime}
                  alreadyAdded={allUserIds.has(anime.id)}
                  onDetail={onDetail}
                  onAddToSchedule={setShowDayPicker}
                  onAddToWatchLater={addToWatchLater}
                  onMarkWatched={markAsWatched}
                />
              ))}
            </div>
          ) : (
            <div className="season-grid stagger-in">
              {results.map(anime => (
                <DiscoveryCard
                  key={anime.id}
                  anime={anime}
                  alreadyAdded={allUserIds.has(anime.id)}
                  onDetail={onDetail}
                  onAddToSchedule={setShowDayPicker}
                  onAddToWatchLater={addToWatchLater}
                  onMarkWatched={markAsWatched}
                />
              ))}
            </div>
          )}
          {hasNextPage && (
            <button className="directory-load-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? t('directory.loading', 'Cargando…') : t('directory.loadMore', 'Cargar más')}
            </button>
          )}
        </>
      ) : (
        <div className="empty-state"><span>🔍</span><p>{t('directory.empty', 'Sin resultados con esos filtros')}</p></div>
      )}
    </>
  );
};

export default React.memo(DirectorySection);
