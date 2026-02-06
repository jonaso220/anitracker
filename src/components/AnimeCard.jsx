import React from 'react';
import StarRating from './StarRating';

const sanitizeUrl = (url) => {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? url : '';
  } catch { return ''; }
};

const AnimeCard = ({ 
  anime, 
  day, 
  isWatchLater = false, 
  isWatched = false, 
  cardIndex, 
  cardDay,
  airingData = {}, // Nuevo prop para evitar dependencia global
  onClick,
  // Props de drag & drop
  isDraggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onTouchStart,
  onTouchMove,
  onTouchEnd
}) => {
  const airing = airingData[anime.id];
  const airingBadge = airing ? (
    airing.hasAired ? 'airing-new' :
    airing.isToday ? 'airing-today' :
    airing.isTomorrow ? 'airing-tomorrow' : null
  ) : null;
  
  const airingText = airing ? (
    airing.hasAired ? `🆕 Ep. ${airing.episode} disponible` :
    airing.isToday ? `🔴 Ep. ${airing.episode} hoy` :
    airing.isTomorrow ? `📢 Ep. ${airing.episode} mañana` : null
  ) : null;

  return (
    <div
      className={`anime-card fade-in ${airingBadge ? 'has-airing' : ''} ${isDraggable ? 'draggable' : ''}`}
      onClick={(e) => onClick && onClick(e, anime, day, isWatchLater, isWatched)}
      draggable={isDraggable}
      onDragStart={isDraggable && onDragStart ? (e) => onDragStart(e, anime, day) : undefined}
      onDragEnd={isDraggable ? onDragEnd : undefined}
      onDragOver={isDraggable && cardIndex != null && onDragOver ? (e) => onDragOver(e, cardDay, cardIndex) : undefined}
      onTouchStart={isDraggable && onTouchStart ? (e) => onTouchStart(e, anime, day) : undefined}
      onTouchMove={isDraggable && onTouchMove ? (e) => onTouchMove(e, day) : undefined}
      onTouchEnd={isDraggable ? onTouchEnd : undefined}
    >
      <div className="anime-card-image">
        <img src={anime.image} alt={anime.title} loading="lazy" draggable="false" />
        {anime.rating > 0 && (
          <div className="anime-card-score">⭐ {Number(anime.rating).toFixed ? Number(anime.rating).toFixed(1) : anime.rating}</div>
        )}
        {anime.currentEp > 0 && (
          <div className="anime-card-ep">EP {anime.currentEp}</div>
        )}
        {airingBadge && (
          <div className={`anime-card-airing ${airingBadge}`}>{airingText}</div>
        )}
      </div>
      <div className="anime-card-content">
        <h3>{anime.title}</h3>
        <div className="anime-genres">
          {(anime.genres || []).slice(0, 2).map((g, i) => <span key={i} className="genre-tag">{g}</span>)}
        </div>
        {anime.userRating > 0 && <StarRating rating={anime.userRating} size={12} />}
        {anime.watchLink && (
          <a href={sanitizeUrl(anime.watchLink)} target="_blank" rel="noopener noreferrer" className="watch-link-badge" onClick={e => e.stopPropagation()}>▶ Ver</a>
        )}
        {isWatched && (
          <div className={`status-badge ${anime.finished ? 'finished' : 'dropped'}`}>
            {anime.finished ? '✓ Completado' : '⏸ Sin terminar'}
          </div>
        )}
        {(() => {
          const ep = anime.currentEp || 0;
          const total = anime.episodes || 0;
          if (ep <= 0 && total <= 0) return null;
          const pct = total > 0 ? Math.min((ep / total) * 100, 100) : 0;
          const isComplete = total > 0 && ep >= total;
          return (
            <div className="card-progress">
              <div className="card-progress-bar">
                <div className={`card-progress-fill ${isComplete ? 'complete' : ''}`} style={{ width: total > 0 ? `${pct}%` : '0%' }}></div>
              </div>
              <span className="card-progress-text">{ep}{total > 0 ? ` / ${total}` : ''}</span>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default AnimeCard;