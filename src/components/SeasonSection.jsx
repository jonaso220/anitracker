import React from 'react';
import { daysOfWeek } from '../constants';

const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
const SEASON_LABELS = { WINTER: 'Invierno', SPRING: 'Primavera', SUMMER: 'Verano', FALL: 'Otoño' };
const SEASON_ICONS = { WINTER: '❄️', SPRING: '🌸', SUMMER: '☀️', FALL: '🍂' };

const SeasonSection = ({ seasonAnime, seasonLoading, schedule, watchedList, watchLater, selectedSeason, onChangeSeason, setShowDayPicker, addToWatchLater, markAsWatched, onDetail }) => {
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curSeason = curMonth <= 3 ? 'WINTER' : curMonth <= 6 ? 'SPRING' : curMonth <= 9 ? 'SUMMER' : 'FALL';
    const curYear = now.getFullYear();
    const isCurrent = selectedSeason.season === curSeason && selectedSeason.year === curYear;

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
                <span className="count">{seasonAnime.length}</span>
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
            {seasonLoading ? (
                <div className="search-placeholder"><div className="spinner"></div><p>Cargando temporada...</p></div>
            ) : seasonAnime.length > 0 ? (
                <div className="season-grid">
                    {seasonAnime.map(anime => (
                        <div key={anime.id} className={`season-card fade-in ${allUserIds.has(anime.id) ? 'already-added' : ''}`}>
                            <div className="season-card-image" onClick={() => onDetail(anime)}>
                                <img src={anime.image} alt={anime.title} loading="lazy" onError={e => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex'; }} />
                                <div className="img-fallback" style={{ display: 'none' }}>{anime.title?.charAt(0) || '?'}</div>
                                {anime.rating > 0 && <div className="anime-card-score">⭐ {Number(anime.rating).toFixed(1)}</div>}
                            </div>
                            <div className="season-card-content">
                                <h3 onClick={() => onDetail(anime)}>{anime.title}</h3>
                                <div className="anime-genres">
                                    {(anime.genres || []).slice(0, 2).map((g, i) => <span key={i} className="genre-tag">{g}</span>)}
                                </div>
                                <div className="season-card-meta">
                                    {anime.type && <span className="meta-tag type">{anime.type}</span>}
                                    {anime.episodes && <span className="meta-tag eps">{anime.episodes} eps</span>}
                                </div>
                                {allUserIds.has(anime.id) ? (
                                    <div className="season-added-badge">✓ En tu lista</div>
                                ) : (
                                    <div className="season-card-actions">
                                        <button className="add-btn schedule-btn" onClick={() => setShowDayPicker(anime)} title="Añadir a semana">📅</button>
                                        <button className="add-btn later-btn" onClick={() => addToWatchLater(anime)} title="Ver después">🕐</button>
                                        <button className="add-btn watched-btn" onClick={() => markAsWatched(anime)} title="Marcar como visto">✓</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : <div className="empty-state"><span>🌸</span><p>No se encontraron animes para esta temporada</p></div>}
        </>
    );
};

export default SeasonSection;
