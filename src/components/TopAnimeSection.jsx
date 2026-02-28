import React, { useState, useMemo } from 'react';
import { daysOfWeek } from '../constants';

const FORMAT_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'TV', label: 'TV' },
  { key: 'MOVIE', label: 'Película' },
  { key: 'OVA_ONA', label: 'OVA/ONA' },
];

const TopAnimeSection = ({ topAnime, topLoading, schedule, watchedList, watchLater, setShowDayPicker, addToWatchLater, markAsWatched, onDetail }) => {
  const [formatFilter, setFormatFilter] = useState('all');

  const allUserIds = useMemo(() => new Set([
    ...daysOfWeek.flatMap(d => (schedule[d] || []).map(a => a.id)),
    ...watchedList.map(a => a.id),
    ...watchLater.map(a => a.id)
  ]), [schedule, watchedList, watchLater]);

  const filtered = useMemo(() => {
    if (formatFilter === 'all') return topAnime;
    if (formatFilter === 'OVA_ONA') return topAnime.filter(a => ['OVA', 'ONA', 'Special'].includes(a.type));
    if (formatFilter === 'MOVIE') return topAnime.filter(a => a.type === 'Película');
    return topAnime.filter(a => a.type === 'TV' || a.type === 'TV Short');
  }, [topAnime, formatFilter]);

  return (
    <>
      <div className="section-header">
        <h2>🏆 Top Anime</h2>
        <span className="count">{filtered.length}</span>
      </div>

      <div className="filter-bar">
        {FORMAT_FILTERS.map(f => (
          <button key={f.key} className={`filter-btn ${formatFilter === f.key ? 'active' : ''}`} onClick={() => setFormatFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {topLoading ? (
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
      ) : filtered.length > 0 ? (
        <div className="season-grid">
          {filtered.map((anime, idx) => (
            <div key={anime.id} className={`season-card fade-in ${allUserIds.has(anime.id) ? 'already-added' : ''}`}>
              <div className="season-card-image" onClick={() => onDetail(anime)}>
                <img src={anime.image || anime.imageSm} alt={anime.title} loading="lazy" onError={e => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex'; }} />
                <div className="img-fallback" style={{ display: 'none' }}>{anime.title?.charAt(0) || '?'}</div>
                <div className="rank-badge">#{idx + 1}</div>
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
      ) : <div className="empty-state"><span>🏆</span><p>No se encontraron animes</p></div>}
    </>
  );
};

export default React.memo(TopAnimeSection);
