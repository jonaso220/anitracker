import React from 'react';
import { daysOfWeek } from '../constants';

const SeasonSection = ({ seasonAnime, seasonLoading, schedule, watchedList, watchLater, setShowDayPicker, addToWatchLater, onDetail }) => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const seasonNames = { 1: 'Invierno', 2: 'Invierno', 3: 'Invierno', 4: 'Primavera', 5: 'Primavera', 6: 'Primavera', 7: 'Verano', 8: 'Verano', 9: 'Verano', 10: 'Otoño', 11: 'Otoño', 12: 'Otoño' };

    const allUserIds = new Set([
        ...daysOfWeek.flatMap(d => (schedule[d] || []).map(a => a.id)),
        ...watchedList.map(a => a.id),
        ...watchLater.map(a => a.id)
    ]);

    return (
        <>
            <div className="section-header">
                <h2>🌸 Temporada {seasonNames[month]} {year}</h2>
                <span className="count">{seasonAnime.length}</span>
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
                                        <button className="add-btn schedule-btn" onClick={() => setShowDayPicker(anime)}>📅</button>
                                        <button className="add-btn later-btn" onClick={() => addToWatchLater(anime)}>🕐</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : <div className="empty-state"><span>🌸</span><p>No se pudo cargar la temporada</p></div>}
        </>
    );
};

export default SeasonSection;
