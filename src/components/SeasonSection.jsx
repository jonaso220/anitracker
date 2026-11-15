import React, { useCallback, useMemo, useState } from 'react';
import { daysOfWeek } from '../constants';
import DiscoveryCard from './DiscoveryCard';
import RatingFilterBar from './RatingFilterBar';
import DiscoveryControls from './DiscoveryControls';
import ApiErrorState from './ApiErrorState';
import { applyRatingFilter, filterDiscovery, groupSeasonByDay, personalizeDiscovery } from '../utils';
import { dayLabel, t } from '../i18n';

const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
const SEASON_FALLBACK = { WINTER: 'Invierno', SPRING: 'Primavera', SUMMER: 'Verano', FALL: 'Otoño' };
const SEASON_ICONS = { WINTER: '❄️', SPRING: '🌸', SUMMER: '☀️', FALL: '🍂' };
const DEFAULT_PREFERENCES = { personalized: false, hideAdded: false, genre: 'all', platform: 'all' };
const NOOP = () => {};
const NO_IDS = [];

// Lo que se ve en un día (o en "Todos", sin las que continúan de temporadas anteriores).
const pickDay = (list, grouped, day) => (day === 'all' ? list.filter((a) => !a._continuing) : grouped.days[day] || []);

const SeasonSection = ({ seasonAnime, seasonLoading, error, onRetry, schedule, watchedList, watchLater, preferences = DEFAULT_PREFERENCES, setPreferences = NOOP, ignoredIds = NO_IDS, setIgnoredIds = NOOP, selectedSeason, onChangeSeason, setShowDayPicker, addToWatchLater, markAsWatched, onDetail }) => {
    const [minRating, setMinRating] = useState(0);
    const [sortByRating, setSortByRating] = useState(false);

    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curSeason = curMonth <= 3 ? 'WINTER' : curMonth <= 6 ? 'SPRING' : curMonth <= 9 ? 'SUMMER' : 'FALL';
    const curYear = now.getFullYear();
    const isCurrent = selectedSeason.season === curSeason && selectedSeason.year === curYear;
    const todayIdx = (now.getDay() + 6) % 7;

    // Día seleccionado (0–6, lunes primero) o 'all' para la grilla completa.
    // Solo la temporada en curso tiene horario, así que fuera de ella rige 'all'.
    const [selectedDay, setSelectedDay] = useState(() => (isCurrent ? todayIdx : 'all'));
    const activeDay = isCurrent ? selectedDay : 'all';

    const library = useMemo(() => [...daysOfWeek.flatMap((day) => schedule[day] || []), ...watchedList, ...watchLater], [schedule, watchedList, watchLater]);
    const allUserIds = useMemo(() => new Set(library.map((anime) => anime.id)), [library]);
    const discoverySource = useMemo(() => {
        const ordered = preferences.personalized ? personalizeDiscovery(seasonAnime, library) : seasonAnime;
        return filterDiscovery(ordered, { ...preferences, ignoredIds }, allUserIds);
    }, [seasonAnime, library, preferences, ignoredIds, allUserIds]);
    const grouped = useMemo(() => groupSeasonByDay(discoverySource), [discoverySource]);
    // Lo mismo sin filtros de descubrimiento: distingue "no se emite nada" de
    // "tus filtros (u Ocultar añadidos) lo esconden todo".
    const rawGrouped = useMemo(() => groupSeasonByDay(seasonAnime), [seasonAnime]);

    const dayItems = useMemo(() => pickDay(discoverySource, grouped, activeDay), [discoverySource, grouped, activeDay]);
    const visible = useMemo(
        () => applyRatingFilter(dayItems, { minRating, sortByRating }),
        [dayItems, minRating, sortByRating],
    );
    const rawDayItems = useMemo(() => pickDay(seasonAnime, rawGrouped, activeDay), [seasonAnime, rawGrouped, activeDay]);

    // Estables: DiscoveryCard y DiscoveryControls no se re-renderizan por esto.
    const ignore = useCallback((item) => setIgnoredIds((prev) => [...new Set([...prev, item.id])]), [setIgnoredIds]);
    const restoreIgnored = useCallback(() => setIgnoredIds([]), [setIgnoredIds]);
    const showAdded = useCallback(() => setPreferences((prev) => ({ ...prev, hideAdded: false })), [setPreferences]);
    // Los "ocultos" (No me interesa) no se tocan: se restauran a propósito.
    const clearDiscoveryFilters = useCallback(
        () => setPreferences((prev) => ({ ...prev, hideAdded: false, genre: 'all', platform: 'all' })),
        [setPreferences],
    );

    const seasonLabel = (season) => t(`season.name.${season}`, SEASON_FALLBACK[season]);

    const goPrev = () => {
        const idx = SEASONS.indexOf(selectedSeason.season);
        if (idx === 0) onChangeSeason(SEASONS[3], selectedSeason.year - 1);
        else onChangeSeason(SEASONS[idx - 1], selectedSeason.year);
    };
    const goNext = () => {
        const idx = SEASONS.indexOf(selectedSeason.season);
        if (idx === 3) onChangeSeason(SEASONS[0], selectedSeason.year + 1);
        else onChangeSeason(SEASONS[idx + 1], selectedSeason.year);
    };
    const goCurrentSeason = () => onChangeSeason(curSeason, curYear);

    const renderEmpty = () => {
        if (seasonAnime.length === 0) {
            return <div className="empty-state"><span aria-hidden="true">🌸</span><p>{t('season.emptySeason', 'No se encontraron animes para esta temporada')}</p></div>;
        }
        if (rawDayItems.length === 0) {
            return (
                <div className="empty-state"><span aria-hidden="true">📭</span><p>{activeDay === 'all'
                    ? t('season.emptyAll', 'No hay estrenos nuevos esta temporada')
                    : t('season.emptyDay', 'Ningún anime se emite este día')}</p></div>
            );
        }
        if (dayItems.length > 0 && minRating > 0) {
            return <div className="empty-state"><span aria-hidden="true">⭐</span><p>{t('season.noRatingMatch', 'Sin animes con esa valoración')}</p></div>;
        }
        // Se emite algo, pero los filtros de descubrimiento lo esconden todo.
        const addedHidden = preferences.hideAdded ? rawDayItems.filter((a) => allUserIds.has(a.id)).length : 0;
        const allAdded = addedHidden === rawDayItems.length;
        const hasPreferenceFilters = preferences.hideAdded || preferences.genre !== 'all' || preferences.platform !== 'all';
        return (
            <div className="empty-state" role="status">
                <span aria-hidden="true">{allAdded ? '✓' : '🙈'}</span>
                <p>{allAdded
                    ? t('season.allAdded', 'Ya tenés en tu biblioteca todo lo que hay acá.')
                    : t('season.filteredOut', 'Hay {count} animes acá, pero tus filtros los ocultan.', { count: rawDayItems.length })}</p>
                <p className="empty-state-hint">{allAdded
                    ? t('season.allAddedHint', 'Desactivá «Ocultar añadidos» para verlos.')
                    : t('season.filteredOutHint', 'Revisá «Ocultar añadidos», el género, la plataforma o los ocultos.')}</p>
                {(allAdded || hasPreferenceFilters) && (
                    <button type="button" className="filter-btn" onClick={allAdded ? showAdded : clearDiscoveryFilters}>
                        {allAdded ? t('discovery.showAdded', 'Mostrar añadidos') : t('discovery.clearFilters', 'Quitar filtros')}
                    </button>
                )}
            </div>
        );
    };

    return (
        <>
            <div className="section-header">
                <h2>{SEASON_ICONS[selectedSeason.season]} {t('nav.season', 'Temporada')}</h2>
                <span className="count">{visible.length}{minRating > 0 && ` / ${seasonAnime.length}`}</span>
            </div>
            <div className="season-selector">
                <button className="season-nav-btn" onClick={goPrev} title={t('season.prev', 'Temporada anterior')} aria-label={t('season.prev', 'Temporada anterior')}>◀</button>
                <div className="season-current-label">
                    <span className="season-name">{seasonLabel(selectedSeason.season)} {selectedSeason.year}</span>
                </div>
                <button className="season-nav-btn" onClick={goNext} title={t('season.next', 'Temporada siguiente')} aria-label={t('season.next', 'Temporada siguiente')}>▶</button>
                {!isCurrent && (
                    <button className="season-today-btn" onClick={goCurrentSeason} title={t('season.goCurrent', 'Ir a temporada actual')}>{t('season.current', 'Actual')}</button>
                )}
            </div>
            {isCurrent && !seasonLoading && seasonAnime.length > 0 && (
                <div className="season-day-tabs" role="tablist" aria-label={t('season.dayTabs', 'Día de emisión')}>
                    {daysOfWeek.map((day, i) => (
                        <button
                            key={day}
                            role="tab"
                            aria-selected={activeDay === i}
                            className={`season-day-tab ${activeDay === i ? 'active' : ''}`}
                            onClick={() => setSelectedDay(i)}
                        >
                            {dayLabel(day)}
                            {i === todayIdx && <span className="day-tab-today">{t('season.today', 'HOY')}</span>}
                        </button>
                    ))}
                    <button
                        role="tab"
                        aria-selected={activeDay === 'all'}
                        className={`season-day-tab all ${activeDay === 'all' ? 'active' : ''}`}
                        onClick={() => setSelectedDay('all')}
                    >
                        {t('season.all', 'Todos')}
                    </button>
                </div>
            )}
            {!seasonLoading && seasonAnime.length > 0 && (
                <><DiscoveryControls items={seasonAnime} preferences={preferences} setPreferences={setPreferences} ignoredCount={ignoredIds.length} onRestoreIgnored={restoreIgnored} /><RatingFilterBar
                    minRating={minRating}
                    setMinRating={setMinRating}
                    sortByRating={sortByRating}
                    setSortByRating={setSortByRating}
                /></>
            )}
            {!seasonLoading && error && <ApiErrorState error={error} onRetry={onRetry} />}
            {seasonLoading ? (
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
            ) : error ? null : visible.length > 0 ? (
                <>
                    {activeDay !== 'all' && (
                        <h3 className="season-day-heading">📆 {dayLabel(daysOfWeek[activeDay])}</h3>
                    )}
                    <div className="season-grid stagger-in">
                        {visible.map(anime => (
                            <DiscoveryCard
                                key={anime.id}
                                anime={anime}
                                airing={anime._airing}
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
                </>
            ) : renderEmpty()}
        </>
    );
};

export default React.memo(SeasonSection);
