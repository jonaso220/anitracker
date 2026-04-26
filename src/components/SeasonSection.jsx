import React, { useMemo, useState } from 'react';
import { daysOfWeek } from '../constants';
import DiscoveryCard from './DiscoveryCard';
import RatingFilterBar from './RatingFilterBar';
import { applyRatingFilter } from '../utils';

const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
const SEASON_LABELS = { WINTER: 'Invierno', SPRING: 'Primavera', SUMMER: 'Verano', FALL: 'Otoño' };
const SEASON_ICONS = { WINTER: '❄️', SPRING: '🌸', SUMMER: '☀️', FALL: '🍂' };

const SeasonSection = ({ seasonAnime, seasonLoading, schedule, watchedList, watchLater, selectedSeason, onChangeSeason, setShowDayPicker, addToWatchLater, markAsWatched, onDetail }) => {
    const [minRating, setMinRating] = useState(0);
    const [sortByRating, setSortByRating] = useState(false);

    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curSeason = curMonth <= 3 ? 'WINTER' : curMonth <= 6 ? 'SPRING' : curMonth <= 9 ? 'SUMMER' : 'FALL';
    const curYear = now.getFullYear();
    const isCurrent = selectedSeason.season === curSeason && selectedSeason.year === curYear;

    const filteredSeason = useMemo(
        () => applyRatingFilter(seasonAnime, { minRating, sortByRating }),
        [seasonAnime, minRating, sortByRating]
    );

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
                <span className="count">{filteredSeason.length}{minRating > 0 && ` / ${seasonAnime.length}`}</span>
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
            ) : filteredSeason.length > 0 ? (
                <div className="season-grid stagger-in">
                    {filteredSeason.map(anime => (
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
            ) : seasonAnime.length > 0 ? (
                <div className="empty-state"><span>⭐</span><p>Sin animes con esa valoración</p></div>
            ) : <div className="empty-state"><span>🌸</span><p>No se encontraron animes para esta temporada</p></div>}
        </>
    );
};

export default React.memo(SeasonSection);
