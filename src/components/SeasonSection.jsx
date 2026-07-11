import React, { useMemo, useState } from 'react';
import { daysOfWeek } from '../constants';
import DiscoveryCard from './DiscoveryCard';
import RatingFilterBar from './RatingFilterBar';
import DiscoveryControls from './DiscoveryControls';
import ApiErrorState from './ApiErrorState';
import { applyRatingFilter, filterDiscovery, groupSeasonByDay, personalizeDiscovery } from '../utils';
import { t } from '../i18n';

const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
const SEASON_LABELS = { WINTER: 'Invierno', SPRING: 'Primavera', SUMMER: 'Verano', FALL: 'Otoño' };
const SEASON_ICONS = { WINTER: '❄️', SPRING: '🌸', SUMMER: '☀️', FALL: '🍂' };
const DEFAULT_PREFERENCES = { personalized: false, hideAdded: false, genre: 'all', platform: 'all' };

const SeasonSection = ({ seasonAnime, seasonLoading, error, onRetry, schedule, watchedList, watchLater, preferences = DEFAULT_PREFERENCES, setPreferences = () => {}, ignoredIds = [], setIgnoredIds = () => {}, selectedSeason, onChangeSeason, setShowDayPicker, addToWatchLater, markAsWatched, onDetail }) => {
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

    const visible = useMemo(() => {
        const base = activeDay === 'all'
            ? discoverySource.filter((a) => !a._continuing)
            : grouped.days[activeDay] || [];
        return applyRatingFilter(base, { minRating, sortByRating });
    }, [discoverySource, grouped, activeDay, minRating, sortByRating]);

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

    return (
        <>
            <div className="section-header">
                <h2>{SEASON_ICONS[selectedSeason.season]} Temporada</h2>
                <span className="count">{visible.length}{minRating > 0 && ` / ${seasonAnime.length}`}</span>
            </div>
            <div className="season-selector">
                <button className="season-nav-btn" onClick={goPrev} title="Temporada anterior">◀</button>
                <div className="season-current-label">
                    <span className="season-name">{SEASON_LABELS[selectedSeason.season]} {selectedSeason.year}</span>
                </div>
                <button className="season-nav-btn" onClick={goNext} title="Temporada siguiente">▶</button>
                {!isCurrent && (
                    <button className="season-today-btn" onClick={goCurrentSeason} title="Ir a temporada actual">Actual</button>
                )}
            </div>
            {isCurrent && !seasonLoading && seasonAnime.length > 0 && (
                <div className="season-day-tabs" role="tablist" aria-label="Día de emisión">
                    {daysOfWeek.map((day, i) => (
                        <button
                            key={day}
                            role="tab"
                            aria-selected={activeDay === i}
                            className={`season-day-tab ${activeDay === i ? 'active' : ''}`}
                            onClick={() => setSelectedDay(i)}
                        >
                            {day}
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
                <><DiscoveryControls items={seasonAnime} preferences={preferences} setPreferences={setPreferences} ignoredCount={ignoredIds.length} onRestoreIgnored={() => setIgnoredIds([])} /><RatingFilterBar
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
                        <h3 className="season-day-heading">📆 {daysOfWeek[activeDay]}</h3>
                    )}
                    <div className="season-grid stagger-in">
                        {visible.map(anime => (
                            <DiscoveryCard
                                key={anime.id}
                                anime={anime}
                                airing={anime._airing}
                                alreadyAdded={allUserIds.has(anime.id)}
                                recommendationReason={preferences.personalized ? anime._recommendationReason : null}
                                onIgnore={(item) => setIgnoredIds((prev) => [...new Set([...prev, item.id])])}
                                onDetail={onDetail}
                                onAddToSchedule={setShowDayPicker}
                                onAddToWatchLater={addToWatchLater}
                                onMarkWatched={markAsWatched}
                            />
                        ))}
                    </div>
                </>
            ) : seasonAnime.length === 0 ? (
                <div className="empty-state"><span>🌸</span><p>No se encontraron animes para esta temporada</p></div>
            ) : minRating > 0 ? (
                <div className="empty-state"><span>⭐</span><p>Sin animes con esa valoración</p></div>
            ) : (
                <div className="empty-state"><span>📭</span><p>{t('season.emptyDay', 'Ningún anime se emite este día')}</p></div>
            )}
        </>
    );
};

export default React.memo(SeasonSection);
