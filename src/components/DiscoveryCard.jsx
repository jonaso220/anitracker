import React from 'react';

/**
 * Card used in Temporada and Top anime grids — image-first overlay style with
 * actions revealed on hover. The "already in your list" state takes precedence
 * over the action buttons.
 */
const DiscoveryCard = ({
  anime,
  rank,
  alreadyAdded,
  onDetail,
  onAddToSchedule,
  onAddToWatchLater,
  onMarkWatched,
}) => {
  const handleImgError = (e) => {
    e.target.style.display = 'none';
    const fb = e.target.nextSibling;
    if (fb) fb.style.display = 'flex';
  };
  const isHighRated = (anime.rating || 0) >= 9;

  return (
    <div
      className={`season-card fade-in ${alreadyAdded ? 'already-added' : ''} ${isHighRated ? 'high-rated' : ''}`}
      onClick={() => onDetail(anime)}
    >
      <div className="season-card-image">
        <img src={anime.image || anime.imageSm} alt={anime.title} loading="lazy" decoding="async" onError={handleImgError} />
        <div className="img-fallback" style={{ display: 'none' }}>{anime.title?.charAt(0) || '?'}</div>

        {rank != null && <div className="rank-badge">#{rank}</div>}
        {anime.rating > 0 && <div className="anime-card-score">⭐ {Number(anime.rating).toFixed(1)}</div>}

        {alreadyAdded && <div className="season-added-pill" title="Ya está en tu lista">✓ En tu lista</div>}

        <div className="season-card-overlay">
          <h3 className="season-card-title">{anime.title}</h3>
          <div className="season-card-overlay-meta">
            <div className="anime-genres">
              {(anime.genres || []).slice(0, 2).map((g) => <span key={g} className="genre-tag">{g}</span>)}
            </div>
            <div className="season-card-tags">
              {anime.type && <span className="meta-tag type">{anime.type}</span>}
              {anime.episodes && <span className="meta-tag eps">{anime.episodes} eps</span>}
            </div>
            {!alreadyAdded && (
              <div className="season-card-actions">
                <button className="add-btn schedule-btn" onClick={(e) => { e.stopPropagation(); onAddToSchedule(anime); }} title="Añadir a semana" aria-label="Añadir a semana">📅</button>
                <button className="add-btn later-btn" onClick={(e) => { e.stopPropagation(); onAddToWatchLater(anime); }} title="Ver después" aria-label="Ver después">🕐</button>
                <button className="add-btn watched-btn" onClick={(e) => { e.stopPropagation(); onMarkWatched(anime); }} title="Marcar como visto" aria-label="Marcar como visto">✓</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(DiscoveryCard);
