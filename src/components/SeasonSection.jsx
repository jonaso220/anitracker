import React, { useMemo, useState } from 'react';
import { daysOfWeek } from '../constants';
import DiscoveryCard from './DiscoveryCard';
import RatingFilterBar from './RatingFilterBar';
import { applyRatingFilter } from '../utils';

const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
const SEASON_LABELS = { WINTER: 'Invierno', SPRING: 'Primavera', SUMMER: 'Verano', FALL: 'Otoño' };
const SEASON_ICONS = { WINTER: '❄️', SPRING: '🌸', SUMMER: '☀️', FALL: '🍂' };

// Extra groups after Lunes..Domingo for shows without a weekly airing day.
const GROUP_UPCOMING = 'Próximamente';
const GROUP_FINISHED = 'Finalizados';

// Maps JS Date.getDay() (0=Sun…6=Sat) to our daysOfWeek name (0=Mon…6=Sun)
const dayNameOf = (unixSec) => daysOfWeek[(new Date(unixSec * 1000).getDay() + 6) % 7];

// jkanime-style grouping: shows land on the weekday their episodes air.
// A show on hiatus keeps the day of its last aired episode; the rest fall
// into "Próximamente" (not yet premiered) or "Finalizados".
const groupOf = (airing) => {
    if (airing?.airingAt) return dayNameOf(airing.airingAt);
    if (airing?.lastAiredAt) return dayNameOf(airing.lastAiredAt);
    if (airing?.status === 'FINISHED') return GROUP_FINISHED;
    return GROUP_UPCOMING;
};

const SeasonSection = ({ seasonAnime, seasonAiring = {}, seasonLoading, schedule, watchedList, watchLater, selectedSeason, onChangeSeason, setShowDayPicker, addToWatchLater, markAsWatched, onDetail }) => {
    const [minRating, setMinRating] = useState(0);
    const [sortByRating, setSortByRating] = useState(false);

    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curSeason = curMonth <= 3 ? 'WINTER' : curMonth <= 6 ? 'SPRING' : curMonth <= 9 ? 'SUMMER' : 'FALL';
    const curYear = now.getFullYear();
    const isCurrent = selectedSeason.season === curSeason && selectedSeason.year === curYear;

    const today = daysOfWeek[(now.getDay() + 6) % 7];
    const [selectedDay, setSelectedDay] = useState(today);

    // Group by emission day — only meaningful for the current season (past
    // seasons have no airing schedule, so they keep the classic full grid).
    const groups = useMemo(() => {
        if (!isCurrent) return null;
        const g = {};
        for (const key of [...daysOfWeek, GROUP_UPCOMING, GROUP_FINISHED]) g[key] = [];
        for (const anime of seasonAnime) g[groupOf(seasonAiring[anime.id])].push(anime);
        return g;
    }, [isCurrent, seasonAnime, seasonAiring]);

    const visible = useMemo(() => {
        const base = groups ? (groups[selectedDay] || []) : seasonAnime;
        return applyRatingFilter(base, { minRating, sortByRating });
    }, [groups, selectedDay, seasonAnime, minRating, sortByRating]);

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

    const allUserIds = new Set([
        ...daysOfWeek.flatMap(d => (schedule[d] || []).map(a => a.id)),
        ...watchedList.map(a => a.id),
        ...watchLater.map(a => a.id)
    ]);

    return (
        <>
            <div className="section-header">
                <h2>{SEASON_ICONS[selectedSeason.season]} Temporada</h2>
                <span className="count">{visible.length}{(minRating > 0 || groups) && ` / ${seasonAnime.length}`}</span>
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
            {groups && !seasonLoading && seasonAnime.length > 0 && (
                <div className="season-days" role="tablist" aria-label="Día de emisión">
                    {[...daysOfWeek, GROUP_UPCOMING, GROUP_FINISHED].map((day) => (
                        <button
                            key={day}
                            role="tab"
                            aria-selected={selectedDay === day}
                            className={`season-day-pill ${selectedDay === day ? 'active' : ''}`}
                            onClick={() => setSelectedDay(day)}
                        >
                            {day === GROUP_UPCOMING ? '🔜 ' : day === GROUP_FINISHED ? '🏁 ' : ''}{day}
                            {day === today && <span className="season-day-hoy">HOY</span>}
                            <span className="season-day-count">{groups[day].length}</span>
                        </button>
                    ))}
                </div>
            )}
            {!seasonLoading && seasonAnime.length > 0 && (
                <RatingFilterBar
                    minRating={minRating}
                    setMinRating={setMinRating}
                    sortByRating={sortByRating}
                    setSortByRating={setSortByRating}
                />
            )}
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
            ) : visible.length > 0 ? (
                <div className="season-grid stagger-in">
                    {visible.map(anime => (
                        <DiscoveryCard
                            key={anime.id}
                            anime={anime}
                            airing={groups ? seasonAiring[anime.id] : undefined}
                            alreadyAdded={allUserIds.has(anime.id)}
                            onDetail={onDetail}
                            onAddToSchedule={setShowDayPicker}
                            onAddToWatchLater={addToWatchLater}
                            onMarkWatched={markAsWatched}
                        />
                    ))}
                </div>
            ) : seasonAnime.length > 0 ? (
                <div className="empty-state"><span>{minRating > 0 ? '⭐' : '📅'}</span><p>{minRating > 0 ? 'Sin animes con esa valoración' : 'Sin animes este día'}</p></div>
            ) : <div className="empty-state"><span>🌸</span><p>No se encontraron animes para esta temporada</p></div>}
        </>
    );
};

export default React.memo(SeasonSection);
