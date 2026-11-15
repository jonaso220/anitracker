import React, { useCallback, useMemo } from 'react';
import { daysOfWeek } from '../constants';
import DiscoveryCard from './DiscoveryCard';
import DirectoryListRow from './DirectoryListRow';
import { usePersistedState } from '../hooks/usePersistedState';
import { t } from '../i18n';
import DiscoveryControls from './DiscoveryControls';
import ApiErrorState from './ApiErrorState';
import { filterDiscovery, personalizeDiscovery } from '../utils';

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
const YEAR_OPTIONS = YEARS.map((y) => [y, y]);
const DEFAULT_PREFERENCES = { personalized: false, hideAdded: false, genre: 'all', platform: 'all' };
const NOOP = () => {};
const NO_IDS = [];

// Etiqueta traducible de cada opción: `directory.opt.<grupo>.<valor>`.
const optionLabel = (group) => ([val, lab]) => [val, t(`directory.opt.${group}.${val}`, lab)];

const FilterSelect = ({ id, label, value, options, allLabel, onChange }) => (
  <label className="directory-field" htmlFor={id}>
    {label}
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allLabel}</option>
      {options.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}
    </select>
  </label>
);

const DirectorySection = ({ directory, schedule, watchedList, watchLater, preferences = DEFAULT_PREFERENCES, setPreferences = NOOP, ignoredIds = NO_IDS, setIgnoredIds = NOOP, setShowDayPicker, addToWatchLater, markAsWatched, onDetail }) => {
  const { filters, results, loading, loadingMore, hasNextPage, error, retry, updateFilter, resetFilters, loadMore } = directory;
  const [viewMode, setViewMode] = usePersistedState('anitracker-directory-view', 'grid');

  const allUserIds = useMemo(() => new Set([
    ...daysOfWeek.flatMap(d => (schedule[d] || []).map(a => a.id)),
    ...watchedList.map(a => a.id),
    ...watchLater.map(a => a.id)
  ]), [schedule, watchedList, watchLater]);
  const library = useMemo(() => [...daysOfWeek.flatMap((day) => schedule[day] || []), ...watchedList, ...watchLater], [schedule, watchedList, watchLater]);
  const visibleResults = useMemo(() => {
    const ordered = preferences.personalized ? personalizeDiscovery(results, library) : results;
    return filterDiscovery(ordered, { ...preferences, genre: 'all', ignoredIds }, allUserIds);
  }, [results, library, preferences, ignoredIds, allUserIds]);
  // Lo que "Ocultar añadidos" está escondiendo de lo ya cargado.
  const hiddenAdded = useMemo(
    () => (preferences.hideAdded ? results.filter((a) => allUserIds.has(a.id)).length : 0),
    [preferences.hideAdded, results, allUserIds],
  );

  // Estables: DiscoveryCard y DiscoveryControls no se re-renderizan por esto.
  const ignore = useCallback((item) => setIgnoredIds((prev) => [...new Set([...prev, item.id])]), [setIgnoredIds]);
  const restoreIgnored = useCallback(() => setIgnoredIds([]), [setIgnoredIds]);
  const showAdded = useCallback(() => setPreferences((prev) => ({ ...prev, hideAdded: false })), [setPreferences]);

  const genres = useMemo(() => GENRES.map(optionLabel('genre')), []);
  const demographies = useMemo(() => DEMOGRAPHIES.map(optionLabel('demography')), []);
  const formats = useMemo(() => FORMATS.map(optionLabel('format')), []);
  const statuses = useMemo(() => STATUSES.map(optionLabel('status')), []);
  const seasons = useMemo(() => SEASONS.map(optionLabel('season')), []);
  const sorts = useMemo(() => SORTS.map(optionLabel('sort')), []);

  const hasActiveFilters = filters.search.trim() !== '' || ['genre', 'demography', 'format', 'status', 'year', 'season'].some((k) => filters[k] !== '') || filters.sort !== 'POPULARITY_DESC';

  const canLoadMore = hasNextPage && !loading && !error && results.length > 0;
  const loadMoreButton = canLoadMore && (
    <button className="directory-load-more" onClick={loadMore} disabled={loadingMore}>
      {loadingMore ? t('directory.loading', 'Cargando…') : t('directory.loadMore', 'Cargar más')}
    </button>
  );

  let body;
  if (loading) {
    body = (
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
    );
  } else if (visibleResults.length > 0) {
    body = viewMode === 'list' ? (
      <div className="directory-list stagger-in">
        {visibleResults.map(anime => (
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
        {visibleResults.map(anime => (
          <DiscoveryCard
            key={anime.id}
            anime={anime}
            alreadyAdded={allUserIds.has(anime.id)}
            recommendationReason={preferences.personalized ? anime._recommendationReason : null}
            onIgnore={ignore}
            onDetail={onDetail}
            onAddToSchedule={setShowDayPicker}
            onAddToWatchLater={addToWatchLater}
            onMarkWatched={markAsWatched}
          />
        ))}
      </div>
    );
  } else if (error) {
    body = null;
  } else if (results.length > 0) {
    // Hay resultados, pero los filtros de descubrimiento los esconden todos:
    // no es "sin resultados", y "Cargar más" tiene que seguir a mano.
    const allAdded = hiddenAdded === results.length;
    body = (
      <div className="empty-state" role="status">
        <span aria-hidden="true">{allAdded ? '✓' : '🙈'}</span>
        <p>{allAdded
          ? t('directory.allAdded', 'Todo lo de esta página ya está en tu biblioteca.')
          : t('directory.allHidden', 'Tus filtros de descubrimiento ocultan todo lo de esta página.')}</p>
        <p className="empty-state-hint">{allAdded
          ? (hasNextPage
            ? t('directory.allAddedHintMore', 'Desactivá «Ocultar añadidos» para verlos, o cargá más resultados.')
            : t('directory.allAddedHint', 'Desactivá «Ocultar añadidos» para verlos.'))
          : (hasNextPage ? t('directory.allHiddenHintMore', 'Cambiá la plataforma o restaurá los ocultos, o cargá más resultados.') : t('directory.allHiddenHint', 'Cambiá la plataforma o restaurá los ocultos.'))}</p>
        {hiddenAdded > 0 && (
          <button type="button" className="filter-btn" onClick={showAdded}>{t('discovery.showAdded', 'Mostrar añadidos')}</button>
        )}
      </div>
    );
  } else {
    body = <div className="empty-state"><span aria-hidden="true">🔍</span><p>{t('directory.empty', 'Sin resultados con esos filtros')}</p></div>;
  }

  return (
    <>
      <div className="section-header">
        <h2>📚 {t('nav.directory', 'Directorio')}</h2>
        <span className="count">{visibleResults.length}{hasNextPage ? '+' : ''}</span>
      </div>

      <div className="directory-filters">
        <div className="directory-toolbar">
          <input
            type="search"
            className="directory-search"
            placeholder={t('directory.searchPlaceholder', '🔍 Filtrar anime...')}
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            aria-label={t('directory.searchLabel', 'Filtrar anime')}
          />
          <div className="directory-view-toggle" role="group" aria-label={t('directory.viewMode', 'Modo de vista')}>
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
          <FilterSelect id="dir-genre" label={t('directory.genre', 'Género')} value={filters.genre} options={genres} allLabel={t('directory.allMasc', 'Todos')} onChange={(v) => updateFilter('genre', v)} />
          <FilterSelect id="dir-demography" label={t('directory.demography', 'Demografía')} value={filters.demography} options={demographies} allLabel={t('directory.allFem', 'Todas')} onChange={(v) => updateFilter('demography', v)} />
          <FilterSelect id="dir-format" label={t('directory.format', 'Tipo')} value={filters.format} options={formats} allLabel={t('directory.allMasc', 'Todos')} onChange={(v) => updateFilter('format', v)} />
          <FilterSelect id="dir-status" label={t('directory.status', 'Estado')} value={filters.status} options={statuses} allLabel={t('directory.allMasc', 'Todos')} onChange={(v) => updateFilter('status', v)} />
          <FilterSelect id="dir-year" label={t('directory.year', 'Año')} value={filters.year} options={YEAR_OPTIONS} allLabel={t('directory.allMasc', 'Todos')} onChange={(v) => updateFilter('year', v)} />
          <FilterSelect id="dir-season" label={t('directory.season', 'Temporada')} value={filters.season} options={seasons} allLabel={t('directory.allFem', 'Todas')} onChange={(v) => updateFilter('season', v)} />
          <FilterSelect id="dir-sort" label={t('directory.sort', 'Ordenar por')} value={filters.sort} options={sorts} allLabel={t('directory.opt.sort.POPULARITY_DESC', 'Popularidad')} onChange={(v) => updateFilter('sort', v || 'POPULARITY_DESC')} />
        </div>
        {hasActiveFilters && (
          <button className="directory-clear-btn" onClick={resetFilters}>
            ✕ {t('directory.clear', 'Limpiar filtros')}
          </button>
        )}
      </div>
      {!loading && results.length > 0 && <DiscoveryControls items={results} preferences={preferences} setPreferences={setPreferences} ignoredCount={ignoredIds.length} onRestoreIgnored={restoreIgnored} showGenre={false} />}
      {!loading && error && <ApiErrorState error={error} onRetry={retry} />}

      {body}
      {loadMoreButton}
    </>
  );
};

export default React.memo(DirectorySection);
